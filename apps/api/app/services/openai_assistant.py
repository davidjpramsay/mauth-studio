import base64
import binascii
import io
import json
import os
import re
import urllib.parse
import zipfile
from contextlib import suppress
from dataclasses import dataclass
from typing import Any
from xml.etree import ElementTree

import httpx

from app.bootstrap import CONFIG_ROOT
from app.models.schemas import AssistantAttachment, AssistantChatMessage, AssistantChatRequest, AssistantToolOutput

OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses"
DEFAULT_ASSISTANT_MODEL = "gpt-5.4-mini"
DEFAULT_BRAIN_PLANNER_MODEL = "gpt-5.4-mini"
DEFAULT_BRAIN_CONTEXT_CHARS = 12000
DEFAULT_DOCUMENT_CONTEXT_CHARS = 8000
MAX_ASSISTANT_ATTACHMENTS = 6
MAX_ASSISTANT_ATTACHMENT_DATA_CHARS = 18_000_000
MAX_ASSISTANT_EXTRACTED_TEXT_CHARS = 80_000
TOKENS_PER_MILLION = 1_000_000
QUESTION_REFERENCE_PATTERN = re.compile(r"\b(?:q|question)\s*(\d{1,3})\b", re.IGNORECASE)
QUESTION_AUTHORING_PATTERN = re.compile(
    r"\b(?:write|replace|make|create|generate|build)\b[\s\S]{0,180}\bquestion\b",
    re.IGNORECASE,
)
QUESTION_APPEND_PATTERN = re.compile(
    r"\b(?:add|append|insert)\s+(?:(?:a|an)\s+new|this|a|an|new)?\s*question\b|\b(?:add|append|insert)\s+(?:this|the)?\s*(?:attached\s+)?(?:image|screenshot|pdf|file|source)?\s*(?:as\s+)?(?:the\s+)?next\s+question\b|\b(?:add|append|insert)\s+(?:this|the)?\s*(?:attached\s+)?(?:image|screenshot|pdf|file|source)?\s*(?:as\s+)?(?:a\s+)?question\b|\b(?:add|append|insert)\s+(?:this|the)?\s*(?:attached\s+)?(?:image|screenshot|pdf|file|source)?\s*(?:to|into)\s+(?:the\s+)?(?:test|document|assessment)\b",
    re.IGNORECASE,
)
LAYOUT_CHECK_TERMS = (
    "layout check",
    "check layout",
    "document layout",
    "document-wide layout",
    "whole document layout",
    "print risk",
    "page overflow",
    "blank page",
    "weird blank",
    "missing answer space",
    "solution-space mismatch",
    "ready to print",
    "print-ready",
)
DIAGRAM_REQUEST_TERMS = ("diagram", "graph", "draw", "sketch")
ADD_REQUEST_TERMS = ("add", "include", "insert", "put", "place", "draw", "sketch")
SOLUTION_REQUEST_TERMS = ("solution", "worked", "answer key", "marking key")
WHOLE_SOLUTION_REQUEST_TERMS = (
    "all questions",
    "every question",
    "whole test",
    "whole document",
    "entire test",
    "all solutions",
    "full solution",
    "solution key",
    "marking key",
)
RESPONSE_SPACE_REQUEST_TERMS = (
    "answer space",
    "response space",
    "working space",
    "student space",
    "more space",
    "less space",
    "space lines",
    "extra lines",
    "line count",
    "layout space",
)
FORMATTING_REQUEST_TERMS = (
    "format",
    "formatting",
    "spacing",
    "layout",
    "new page",
    "page break",
    "start on new page",
    "move diagram",
    "diagram right",
    "diagram left",
    "align diagram",
    "make the solution fit",
    "tidy",
    "blank space",
)
MARKING_EDIT_REQUEST_TERMS = (
    "mark",
    "marks",
    "mark allocation",
    "allocation",
    "tick",
    "ticks",
    "qed",
    "deserve a mark",
    "reduce to",
    "increase to",
)
SOURCE_DIAGRAM_REQUEST_TERMS = (
    "diagram",
    "graph",
    "chart",
    "screenshot",
    "attached image",
    "attached screenshot",
)
ATTACHED_SOURCE_TERMS = ("this", "attached", "image", "screenshot", "pdf", "file", "source")
SOURCE_QUESTION_REPAIR_TERMS = (
    "switch to mauth.question.upsert",
    "switch to mauth_question_upsert",
    "switch to mauth_convert_source_question",
    "mauth.question.upsert or mauth_convert_source_question",
    "mauth_question_upsert or mauth_convert_source_question",
    "use mauth.question.upsert instead of mauth.author.adddiagram",
    "use mauth_question_upsert instead of mauth_author_add_diagram",
    "teacher is adding a new/source question",
    "adding a new/source question",
)
DOCX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
TEXT_ATTACHMENT_EXTENSIONS = (".txt", ".md", ".markdown", ".csv", ".tsv", ".json", ".tex", ".yaml", ".yml")
DIRECT_MAUTH_TOOL_NAME_MAP = {
    "mauth_question_upsert": "mauth.question.upsert",
    "mauth_convert_source_question": "mauth.question.upsert",
    "mauth_author_replace_question": "mauth.author.replaceQuestion",
    "mauth_author_add_diagram": "mauth.author.addDiagram",
    "mauth_make_diagram_for_question": "mauth.author.addDiagram",
    "mauth_author_ensure_solutions": "mauth.author.ensureSolutions",
    "mauth_write_solutions_for_questions": "mauth.author.ensureSolutions",
    "mauth_write_all_solutions": "mauth.solutions.writeAll",
    "mauth_author_adjust_response_spaces": "mauth.author.adjustResponseSpaces",
    "mauth_format_apply": "mauth.format.apply",
    "mauth_fix_question_formatting": "mauth.format.apply",
    "mauth_check_document_layout": "mauth.layout.check",
}

MODEL_PRICING_USD_PER_1M = {
    "gpt-5.5": {
        "input": 5.00,
        "cached_input": 0.50,
        "output": 30.00,
        "source": "OpenAI API pricing, standard processing, under 270K context",
    },
    "gpt-5.4": {
        "input": 2.50,
        "cached_input": 0.25,
        "output": 15.00,
        "source": "OpenAI API pricing, standard processing, under 270K context",
    },
    "gpt-5.4-mini": {
        "input": 0.75,
        "cached_input": 0.075,
        "output": 4.50,
        "source": "OpenAI API pricing, standard processing, under 270K context",
    },
}

MAUTH_TOOL_NAMES = [
    "mauth.tools.describe",
    "mauth.document.inspect",
    "mauth.preview.inspect",
    "mauth.validation.run",
    "mauth.actions.preview",
    "mauth.actions.apply",
    "mauth.question.upsert",
    "mauth.author.replaceQuestion",
    "mauth.author.addDiagram",
    "mauth.author.ensureSolutions",
    "mauth.solutions.writeAll",
    "mauth.author.adjustResponseSpaces",
    "mauth.format.apply",
    "mauth.layout.check",
    "mauth.files.describe",
    "mauth.files.list",
    "mauth.files.open",
    "mauth.files.save",
    "mauth.files.saveAs",
    "mauth.files.createFolder",
    "mauth.files.duplicate",
    "mauth.files.rename",
    "mauth.files.move",
    "mauth.files.delete",
    "mauth.files.versions.list",
    "mauth.files.versions.restore",
]

SUPPORTED_DIAGRAM_TYPES = [
    "graph2d",
    "vector2d",
    "graph3d",
    "image",
    "geometricConstruction",
    "network",
    "setDiagram",
    "statsChart",
]


def assistant_model() -> str:
    return os.environ.get("OPENAI_MODEL", DEFAULT_ASSISTANT_MODEL)


def assistant_brain_planner_model() -> str:
    return os.environ.get(
        "OPENAI_BRAIN_PLANNER_MODEL", os.environ.get("OPENAI_PLANNER_MODEL", DEFAULT_BRAIN_PLANNER_MODEL)
    )


def assistant_brain_planner_enabled() -> bool:
    value = os.environ.get("ASSISTANT_BRAIN_PLANNER")
    return value is None or value.strip().lower() not in {"0", "false", "off", "no"}


def assistant_configured() -> bool:
    return bool(os.environ.get("OPENAI_API_KEY"))


def assistant_brain_context_limit() -> int:
    value = os.environ.get("ASSISTANT_BRAIN_CONTEXT_CHARS")
    if not value:
        return DEFAULT_BRAIN_CONTEXT_CHARS
    try:
        return max(0, int(value))
    except ValueError:
        return DEFAULT_BRAIN_CONTEXT_CHARS


def assistant_document_context_limit() -> int:
    value = os.environ.get("ASSISTANT_DOCUMENT_CONTEXT_CHARS")
    if not value:
        return DEFAULT_DOCUMENT_CONTEXT_CHARS
    try:
        return max(0, int(value))
    except ValueError:
        return DEFAULT_DOCUMENT_CONTEXT_CHARS


def compact_string_items(
    values: Any,
    text: str,
    keywords: tuple[str, ...],
    *,
    max_items: int,
    keep_first: int = 2,
) -> list[str]:
    if not isinstance(values, list):
        return []

    selected: list[str] = []
    for value in values[:keep_first]:
        if isinstance(value, str):
            selected.append(value)

    request_terms = tuple(
        term for term in re.findall(r"[a-zA-Z]{4,}", text) if term not in {"please", "would", "could", "current"}
    )
    all_keywords = (*keywords, *request_terms)
    for value in values[keep_first:]:
        if not isinstance(value, str) or value in selected:
            continue
        lower = value.lower()
        if any(keyword in lower for keyword in all_keywords):
            selected.append(value)
        if len(selected) >= max_items:
            break

    for value in values[keep_first:]:
        if len(selected) >= max_items:
            break
        if isinstance(value, str) and value not in selected:
            selected.append(value)

    return selected


def compact_brain_config(data: dict[str, Any], file_name: str = "", text: str = "") -> dict[str, Any]:
    compact = {key: data[key] for key in ("id", "name", "purpose", "owns", "mustNotOwn") if key in data}
    generic_keywords = (
        "assistant",
        "author",
        "mauth",
        "question",
        "solution",
        "student",
        "space",
        "marks",
        "latex",
        "diagram",
        "validation",
        "tool",
    )

    if "compositionRules" in data:
        compact["compositionRules"] = compact_string_items(
            data["compositionRules"],
            text,
            generic_keywords,
            max_items=12 if file_name == "index.json" else 8,
            keep_first=3 if file_name == "index.json" else 1,
        )
    if "rules" in data:
        compact["rules"] = compact_string_items(data["rules"], text, generic_keywords, max_items=18, keep_first=4)
    if "checks" in data:
        compact["checks"] = compact_string_items(data["checks"], text, generic_keywords, max_items=8, keep_first=2)
    return compact


def request_text(
    messages: list[AssistantChatMessage] | None = None,
    tool_outputs: list[AssistantToolOutput] | None = None,
    attachments: list[AssistantAttachment] | None = None,
) -> str:
    parts = [message.content for message in messages or []]
    parts.extend(str(tool_output.name or "") for tool_output in tool_outputs or [])
    for attachment in attachments or []:
        parts.append(f"attached file {attachment.name} {attachment.mimeType}")
    return "\n".join(parts).lower()


def latest_user_messages(messages: list[AssistantChatMessage] | None = None) -> list[AssistantChatMessage]:
    """Return only the current teacher request for intent/tool routing.

    The provider can still see conversational history when needed, but
    deterministic routing should not let stale prompts from earlier turns
    override the newest teacher instruction.
    """

    for message in reversed(messages or []):
        if message.role == "user" and message.content.strip():
            return [message]
    return []


def current_request_text(
    messages: list[AssistantChatMessage] | None = None,
    tool_outputs: list[AssistantToolOutput] | None = None,
    attachments: list[AssistantAttachment] | None = None,
) -> str:
    return request_text(latest_user_messages(messages), tool_outputs, attachments)


def tool_output_target_names(tool_outputs: list[AssistantToolOutput] | None = None) -> set[str]:
    names: set[str] = set()
    for tool_output in tool_outputs or []:
        if isinstance(tool_output.name, str) and tool_output.name.strip():
            names.add(tool_output.name.strip())
        output = tool_output.output
        if isinstance(output, dict):
            for key in ("toolName", "name"):
                value = output.get(key)
                if isinstance(value, str) and value.strip():
                    names.add(value.strip())
    return names


def tool_outputs_mention(tool_outputs: list[AssistantToolOutput] | None, terms: tuple[str, ...]) -> bool:
    for tool_output in tool_outputs or []:
        output = tool_output.output
        text = json.dumps(output, ensure_ascii=False).lower() if isinstance(output, dict) else str(output).lower()
        if any(term in text for term in terms):
            return True
    return False


def assistant_brain_menu() -> list[dict[str, Any]]:
    brain_dir = CONFIG_ROOT / "ai-brains"
    index_path = brain_dir / "index.json"
    try:
        index_data = json.loads(index_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []

    menu: list[dict[str, Any]] = []
    for entry in index_data.get("brains", []):
        if not isinstance(entry, dict):
            continue
        brain_id = entry.get("id")
        path_value = entry.get("path")
        if not isinstance(brain_id, str) or not isinstance(path_value, str):
            continue
        file_name = path_value.rsplit("/", 1)[-1]
        brain_data: dict[str, Any] = {}
        with suppress(OSError, json.JSONDecodeError):
            brain_data = json.loads((brain_dir / file_name).read_text(encoding="utf-8"))
        menu.append(
            {
                "id": brain_id,
                "name": brain_data.get("name")
                if isinstance(brain_data.get("name"), str)
                else entry.get("name", brain_id),
                "purpose": brain_data.get("purpose") if isinstance(brain_data.get("purpose"), str) else "",
                "owns": brain_data.get("owns") if isinstance(brain_data.get("owns"), list) else [],
            }
        )
    return menu


def brain_file_name_by_id() -> dict[str, str]:
    brain_dir = CONFIG_ROOT / "ai-brains"
    index_path = brain_dir / "index.json"
    try:
        index_data = json.loads(index_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}

    mapping: dict[str, str] = {}
    for entry in index_data.get("brains", []):
        if not isinstance(entry, dict):
            continue
        brain_id = entry.get("id")
        path_value = entry.get("path")
        if isinstance(brain_id, str) and isinstance(path_value, str):
            mapping[brain_id] = path_value.rsplit("/", 1)[-1]
    return mapping


def brain_files_from_ids(brain_ids: list[str] | None) -> list[str]:
    mapping = brain_file_name_by_id()
    files = ["index.json"]
    for brain_id in brain_ids or []:
        file_name = mapping.get(brain_id)
        if file_name and file_name not in files:
            files.append(file_name)
    return files


def brain_files_for_request(
    messages: list[AssistantChatMessage] | None = None,
    tool_outputs: list[AssistantToolOutput] | None = None,
    attachments: list[AssistantAttachment] | None = None,
) -> list[str]:
    text = current_request_text(messages, tool_outputs, attachments)
    files = ["index.json"]

    def include(file_name: str) -> None:
        if file_name not in files:
            files.append(file_name)

    file_only_terms = ("open file", "save file", "rename file", "delete file", "move file", "folder", "files")
    if not text or not any(term in text for term in file_only_terms):
        include("question.json")

    if any(term in text for term in ("solution", "solutions", "marking key", "answer key", "worked")):
        include("solutions.json")
    if any(
        term in text
        for term in (
            "diagram",
            "graph",
            "chart",
            "circle",
            "tangent",
            "venn",
            "vector",
            "axis",
            "axes",
            "plot",
            "image",
            "screenshot",
            "photo",
        )
    ):
        include("diagram.json")
    if any(
        term in text
        for term in ("format", "formatting", "spacing", "layout", "page", "print", "pdf", "template", "exam")
    ):
        include("formatting.json")
    if any(term in text for term in ("whole test", "full test", "convert", "exam paper", "past exam", "all questions")):
        for file_name in ("formatting.json", "diagram.json", "solutions.json"):
            include(file_name)
    if any(
        attachment_is_pdf(attachment) or attachment_is_docx(attachment) or attachment_is_text_like(attachment)
        for attachment in attachments or []
    ):
        for file_name in ("formatting.json", "diagram.json", "solutions.json"):
            include(file_name)

    return files


def assistant_brain_context(
    messages: list[AssistantChatMessage] | None = None,
    tool_outputs: list[AssistantToolOutput] | None = None,
    brain_files: list[str] | None = None,
    attachments: list[AssistantAttachment] | None = None,
) -> str:
    limit = assistant_brain_context_limit()
    if limit <= 0:
        return "Brain context disabled."

    brain_dir = CONFIG_ROOT / "ai-brains"
    brain_files = brain_files or brain_files_for_request(messages, tool_outputs, attachments)
    text = request_text(messages, tool_outputs, attachments)
    brains: list[dict[str, Any]] = []
    for file_name in brain_files:
        path = brain_dir / file_name
        try:
            brains.append(compact_brain_config(json.loads(path.read_text(encoding="utf-8")), file_name, text))
        except (OSError, json.JSONDecodeError):
            continue

    context = json.dumps(brains, ensure_ascii=False)
    if len(context) <= limit:
        return context
    return f"{context[:limit]}\n...[brain context truncated]"


def brain_selection_tool_definition() -> dict[str, Any]:
    menu_ids = [entry["id"] for entry in assistant_brain_menu() if isinstance(entry.get("id"), str)]
    return {
        "type": "function",
        "name": "mauth_select_brains",
        "description": (
            "Select the small Mauth instruction packs needed for the teacher request. "
            "This is only a menu-ordering step; do not write document content here."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "brainIds": {
                    "type": "array",
                    "items": {"type": "string", "enum": menu_ids},
                    "minItems": 1,
                    "uniqueItems": True,
                    "description": "Brain ids needed for the next authoring call.",
                },
                "reason": {
                    "type": "string",
                    "description": "Brief internal reason for the selection.",
                },
            },
            "required": ["brainIds"],
            "additionalProperties": False,
        },
    }


def brain_selection_instructions() -> str:
    return """You are the Mauth brain-menu planner.

Choose only the instruction packs needed for the next assistant call. Do not answer the teacher and do not edit the document.

Selection rules:
- Always include question when the request writes, rewrites, edits, converts, or inspects question wording.
- Include solutions only when the request asks for worked solutions, marking keys, answer keys, solution-space repair, or when a source file visibly contains solutions to convert.
- Include diagram when the request asks for diagrams, graphs, charts, axes, Venn diagrams, vectors, Penrose geometry, uploaded images, source-file diagrams, or renderer repair.
- Include formatting when the request converts or adapts attached PDFs, Word documents, or text-like source files.
- Include formatting when the request asks for title pages, spacing, layout, print/PDF, pagination, exam templates, page breaks, or visual polish.
- Select the fewest packs that can do the job correctly.

Call mauth_select_brains exactly once."""


def brain_selection_input(
    messages: list[AssistantChatMessage] | None,
    document_summary: dict[str, Any] | None,
    attachments: list[AssistantAttachment] | None = None,
) -> list[dict[str, Any]]:
    current_messages = latest_user_messages(messages)
    compact_summary = compact_document_summary(document_summary, current_messages)
    summary_limit = min(assistant_document_context_limit(), 2500)
    summary_text = (
        json.dumps(compact_summary, ensure_ascii=False)[:summary_limit]
        if compact_summary and summary_limit > 0
        else "No document summary supplied."
    )
    prompt_text = "\n".join(f"{message.role}: {message.content}" for message in current_messages)
    return [
        {
            "role": "user",
            "content": json.dumps(
                {
                    "teacherPromptAndRecentChat": prompt_text[-3000:],
                    "attachments": [
                        {
                            "name": attachment.name,
                            "mimeType": attachment.mimeType,
                            "sizeBytes": attachment.sizeBytes,
                        }
                        for attachment in attachments or []
                    ],
                    "brainMenu": assistant_brain_menu(),
                    "compactDocumentSummary": summary_text,
                },
                ensure_ascii=False,
            ),
        }
    ]


def selected_brain_ids_from_response(response: dict[str, Any]) -> list[str]:
    allowed_ids = list(brain_file_name_by_id())
    allowed = set(allowed_ids)
    for item in response.get("output", []):
        if not isinstance(item, dict) or item.get("type") != "function_call":
            continue
        if item.get("name") != "mauth_select_brains":
            continue
        arguments = parse_tool_arguments(item.get("arguments"))
        brain_ids = arguments.get("brainIds")
        if not isinstance(brain_ids, list):
            continue
        selected: list[str] = []
        for brain_id in brain_ids:
            if isinstance(brain_id, str) and brain_id in allowed and brain_id not in selected:
                selected.append(brain_id)
        if selected:
            return selected
    text = response_text(response).lower()
    if text:
        selected = [brain_id for brain_id in allowed_ids if re.search(rf"\b{re.escape(brain_id)}\b", text)]
        if selected:
            return selected
    return []


async def select_brain_files_for_request(
    client: httpx.AsyncClient,
    *,
    messages: list[AssistantChatMessage] | None,
    tool_outputs: list[AssistantToolOutput] | None,
    document_summary: dict[str, Any] | None,
    attachments: list[AssistantAttachment] | None = None,
) -> tuple[list[str], dict[str, Any] | None]:
    fallback_files = brain_files_for_request(messages, tool_outputs, attachments)
    if tool_outputs or not assistant_brain_planner_enabled():
        return fallback_files, None

    try:
        response = await client.post(
            OPENAI_RESPONSES_URL,
            headers={
                "Authorization": f"Bearer {os.environ['OPENAI_API_KEY']}",
                "Content-Type": "application/json",
            },
            json={
                "model": assistant_brain_planner_model(),
                "instructions": brain_selection_instructions(),
                "input": brain_selection_input(messages, document_summary, attachments),
                "tools": [brain_selection_tool_definition()],
                "parallel_tool_calls": False,
            },
        )
        response.raise_for_status()
        data = response.json()
    except httpx.HTTPError:
        return fallback_files, None

    selected_ids = selected_brain_ids_from_response(data)
    if not selected_ids:
        return fallback_files, assistant_usage_summary(data, assistant_brain_planner_model())

    return brain_files_from_ids(selected_ids), assistant_usage_summary(data, assistant_brain_planner_model())


def question_numbers_from_request(messages: list[AssistantChatMessage] | None = None) -> set[int]:
    numbers: set[int] = set()
    for message in messages or []:
        for match in QUESTION_REFERENCE_PATTERN.finditer(message.content):
            try:
                numbers.add(int(match.group(1)))
            except ValueError:
                continue
    return numbers


def asks_to_author_question(text: str) -> bool:
    return (
        any(
            term in text
            for term in (
                "write question",
                "write a question",
                "write me a question",
                "replace question",
                "make question",
                "make a question",
                "make me a question",
                "create question",
                "create a question",
                "generate question",
                "generate a question",
                "build question",
                "build a question",
                "add question",
                "add a question",
                "add this question",
                "append question",
                "append a question",
                "append this question",
                "insert question",
                "insert a question",
                "insert this question",
            )
        )
        or bool(QUESTION_AUTHORING_PATTERN.search(text))
        or asks_to_append_question(text)
    )


def asks_to_append_question(text: str) -> bool:
    return bool(QUESTION_APPEND_PATTERN.search(text))


def next_question_number_from_summary(summary: dict[str, Any] | None) -> int:
    questions = summary.get("questions") if isinstance(summary, dict) else None
    if not isinstance(questions, list):
        return 1
    max_number = 0
    for question in questions:
        if not isinstance(question, dict):
            continue
        index = question.get("index")
        if isinstance(index, int) and index >= 0:
            max_number = max(max_number, index + 1)
    return max_number + 1


def asks_for_layout_check_text(text: str) -> bool:
    return any(term in text for term in LAYOUT_CHECK_TERMS)


@dataclass(frozen=True)
class AssistantRequestIntent:
    kind: str
    question_numbers: frozenset[int]
    target_question_number: int
    has_specific_question: bool
    has_source_attachment: bool
    source_prompt_mentions_diagram: bool
    require_source_diagram: bool
    asks_to_write_question: bool
    asks_to_append_question: bool
    asks_for_diagram: bool
    asks_to_add: bool
    asks_for_solution: bool
    asks_for_whole_solution_key: bool
    asks_for_marking_edit: bool
    asks_for_response_space: bool
    asks_for_formatting: bool
    asks_for_layout_check: bool
    clarification_question: str | None = None


def classify_request_intent(
    compact_summary: dict[str, Any] | None,
    messages: list[AssistantChatMessage] | None = None,
    attachments: list[AssistantAttachment] | None = None,
) -> AssistantRequestIntent:
    current_messages = latest_user_messages(messages)
    text = request_text(current_messages)
    question_numbers = frozenset(question_numbers_from_request(current_messages))
    append_question = asks_to_append_question(text)
    has_source_attachment = bool(attachments)
    source_prompt_mentions_diagram = any(term in text for term in SOURCE_DIAGRAM_REQUEST_TERMS)
    asks_to_write_question = asks_to_author_question(text)
    asks_for_diagram = any(term in text for term in DIAGRAM_REQUEST_TERMS)
    asks_to_add = any(term in text for term in ADD_REQUEST_TERMS)
    asks_for_solution = any(term in text for term in SOLUTION_REQUEST_TERMS)
    asks_for_whole_solution_key = asks_for_solution and any(term in text for term in WHOLE_SOLUTION_REQUEST_TERMS)
    asks_for_layout_check = asks_for_layout_check_text(text)
    asks_for_response_space = any(term in text for term in RESPONSE_SPACE_REQUEST_TERMS)
    asks_for_formatting = any(term in text for term in FORMATTING_REQUEST_TERMS)
    asks_for_marking_edit = any(term in text for term in MARKING_EDIT_REQUEST_TERMS)
    has_specific_question = bool(question_numbers) or "current question" in text or "selected question" in text
    target_question_number = (
        sorted(question_numbers)[0]
        if question_numbers
        else next_question_number_from_summary(compact_summary)
        if append_question
        else 1
    )
    require_source_diagram = source_diagram_required_for_replace(current_messages, attachments)

    kind = "general"
    clarification_question: str | None = None

    if asks_for_layout_check:
        kind = "layout_check"
    elif asks_for_whole_solution_key:
        kind = "write_all_solutions"
    elif append_question and has_source_attachment:
        kind = "append_source_question"
    elif (
        append_question
        and not has_source_attachment
        and any(term in text for term in ("this question", "attached", "image", "screenshot", "pdf", "file", "source"))
        and all(term not in text for term in (":", "\n"))
    ):
        kind = "clarify"
        clarification_question = "What should the new question be based on?"
    elif asks_to_write_question:
        kind = "write_question"
    elif asks_for_diagram and asks_to_add and not has_specific_question:
        kind = "clarify"
        clarification_question = "Which question should I add the diagram to?"
    elif asks_for_diagram and asks_to_add:
        kind = "add_diagram"
    elif has_source_attachment and not any(term in text for term in ATTACHED_SOURCE_TERMS):
        kind = "clarify"
        clarification_question = "What would you like me to do with the attached file?"
    elif asks_for_response_space and not (asks_for_solution or asks_for_marking_edit):
        kind = "response_space"
    elif asks_for_formatting:
        kind = "formatting"
    elif asks_for_solution or asks_for_marking_edit:
        kind = "solution_or_marking"

    return AssistantRequestIntent(
        kind=kind,
        question_numbers=question_numbers,
        target_question_number=target_question_number,
        has_specific_question=has_specific_question or append_question,
        has_source_attachment=has_source_attachment,
        source_prompt_mentions_diagram=source_prompt_mentions_diagram,
        require_source_diagram=require_source_diagram,
        asks_to_write_question=asks_to_write_question,
        asks_to_append_question=append_question,
        asks_for_diagram=asks_for_diagram,
        asks_to_add=asks_to_add,
        asks_for_solution=asks_for_solution,
        asks_for_whole_solution_key=asks_for_whole_solution_key,
        asks_for_marking_edit=asks_for_marking_edit,
        asks_for_response_space=asks_for_response_space,
        asks_for_formatting=asks_for_formatting,
        asks_for_layout_check=asks_for_layout_check,
        clarification_question=clarification_question,
    )


def compact_document_summary(
    document_summary: dict[str, Any] | None,
    messages: list[AssistantChatMessage] | None = None,
) -> dict[str, Any] | None:
    if not isinstance(document_summary, dict):
        return None

    question_numbers = question_numbers_from_request(messages)
    questions = document_summary.get("questions")
    if not question_numbers or not isinstance(questions, list):
        return document_summary

    compact = {key: value for key, value in document_summary.items() if key != "questions"}
    selected_questions: list[Any] = []
    for question in questions:
        if not isinstance(question, dict):
            continue
        index = question.get("index")
        one_based_index = index + 1 if isinstance(index, int) else None
        if one_based_index in question_numbers:
            selected_questions.append(question)

    compact["questions"] = selected_questions or questions[: min(3, len(questions))]
    compact["questionContextFilteredTo"] = sorted(question_numbers)
    compact["questionContextOmittedCount"] = max(0, len(questions) - len(compact["questions"]))
    return compact


def question_summary_has_text(question: dict[str, Any]) -> bool:
    preview = question.get("textPreview")
    if isinstance(preview, str) and preview.strip():
        return True
    modules = question.get("modules")
    if isinstance(modules, list):
        for module in modules:
            if not isinstance(module, dict):
                continue
            for key in ("textPreview", "text"):
                value = module.get(key)
                if isinstance(value, str) and value.strip():
                    return True
    return False


def summary_item_has_text(item: dict[str, Any]) -> bool:
    for key in ("textPreview", "text", "questionText"):
        value = item.get(key)
        if isinstance(value, str) and value.strip():
            return True
    modules = item.get("modules")
    if isinstance(modules, list):
        for module in modules:
            if not isinstance(module, dict):
                continue
            for key in ("textPreview", "text"):
                value = module.get(key)
                if isinstance(value, str) and value.strip():
                    return True
    return False


def marked_summary_has_solution_context(summary: dict[str, Any] | None) -> bool:
    questions = summary.get("questions") if isinstance(summary, dict) else None
    if not isinstance(questions, list):
        return False

    found_marked_scope = False

    def mark_value(item: dict[str, Any]) -> int:
        value = item.get("marks")
        if isinstance(value, int):
            return value
        if isinstance(value, str) and value.isdigit():
            return int(value)
        return 0

    def has_marked_children(item: dict[str, Any]) -> bool:
        children = item.get("parts")
        if not isinstance(children, list):
            children = item.get("subparts")
        if not isinstance(children, list):
            return False
        return any(
            isinstance(child, dict) and (mark_value(child) > 0 or has_marked_children(child)) for child in children
        )

    def check_marked_item(item: dict[str, Any], *, inherit_context: bool = False) -> bool:
        nonlocal found_marked_scope
        marks = mark_value(item)
        has_text = summary_item_has_text(item) or inherit_context
        if marks > 0:
            found_marked_scope = True
            if not has_text:
                return False

        for key in ("parts", "subparts"):
            children = item.get(key)
            if not isinstance(children, list):
                continue
            for child in children:
                if not isinstance(child, dict):
                    continue
                if not check_marked_item(child, inherit_context=has_text):
                    return False
        return True

    for question in questions:
        if not isinstance(question, dict):
            continue
        if (mark_value(question) > 0 or has_marked_children(question)) and not check_marked_item(question):
            return False
    return found_marked_scope


def question_summary_text(question: dict[str, Any] | None) -> str:
    if not isinstance(question, dict):
        return ""

    parts: list[str] = []
    for key in ("textPreview", "text"):
        value = question.get(key)
        if isinstance(value, str) and value.strip():
            parts.append(value)

    modules = question.get("modules")
    if isinstance(modules, list):
        for module in modules:
            if not isinstance(module, dict):
                continue
            for key in ("textPreview", "text"):
                value = module.get(key)
                if isinstance(value, str) and value.strip():
                    parts.append(value)

    parts_data = question.get("parts")
    if isinstance(parts_data, list):
        for part in parts_data:
            if not isinstance(part, dict):
                continue
            for key in ("textPreview", "text"):
                value = part.get(key)
                if isinstance(value, str) and value.strip():
                    parts.append(value)

    return "\n".join(parts).lower()


def focused_tool_hint(
    compact_summary: dict[str, Any] | None,
    messages: list[AssistantChatMessage] | None = None,
    attachments: list[AssistantAttachment] | None = None,
) -> str:
    current_messages = latest_user_messages(messages)
    text = request_text(current_messages)
    intent = classify_request_intent(compact_summary, current_messages, attachments)
    if intent.kind == "clarify" and intent.clarification_question:
        return (
            "Focused tool routing hint: this request is ambiguous. Do not call a Mauth editing tool yet. "
            f"Ask exactly this clarifying question: {intent.clarification_question}"
        )
    has_source_attachment = intent.has_source_attachment
    source_prompt_mentions_diagram = intent.source_prompt_mentions_diagram
    asks_for_marking_edit = intent.asks_for_marking_edit
    asks_to_write_question = intent.asks_to_write_question
    asks_for_response_space = intent.asks_for_response_space
    asks_for_formatting = intent.asks_for_formatting
    asks_for_solution = intent.asks_for_solution
    asks_for_whole_solution_key = intent.asks_for_whole_solution_key
    asks_for_layout_check = intent.asks_for_layout_check
    question_numbers = question_numbers_from_request(current_messages)
    questions = compact_summary.get("questions") if isinstance(compact_summary, dict) else None
    selected_question: dict[str, Any] | None = None
    if isinstance(questions, list):
        for question in questions:
            if not isinstance(question, dict):
                continue
            index = question.get("index")
            one_based_index = index + 1 if isinstance(index, int) else None
            if not question_numbers or one_based_index in question_numbers:
                selected_question = question
                break

    append_question = intent.asks_to_append_question
    question_number = intent.target_question_number
    has_question_text = bool(selected_question and question_summary_has_text(selected_question))
    combined_text = f"{text}\n{question_summary_text(selected_question)}"

    if asks_for_layout_check:
        return (
            "Focused tool routing hint: this is a document-wide layout/print check. Your first tool call should be "
            'mauth_check_document_layout with {"mode":"both"}. Repair warnings with mauth_fix_question_formatting, '
            "mauth_author_adjust_response_spaces, or mauth_write_solutions_for_questions as appropriate."
        )
    if asks_for_whole_solution_key:
        if marked_summary_has_solution_context(compact_summary):
            return (
                "Focused tool routing hint: this is a whole-test solution-key request and the compact summary already "
                "contains enough text for the marked questions, parts, and subparts. Your first tool call should be "
                "mauth_write_all_solutions with one payload covering every marked scope. Do not call "
                "mauth.document.inspect first. Preserve diagrams, use hidden [[marks:n]] ticks only, make tick totals "
                "match marks, then use mauth_check_document_layout in solutions mode after the solution tool succeeds."
            )
        return (
            "Focused tool routing hint: this is a whole-test solution-key request. Inspect the document first with "
            "mauth.document.inspect if the compact summary does not contain enough question text for every marked "
            "scope. Then call mauth_write_all_solutions with one payload covering every marked question, part, and "
            "subpart. Preserve diagrams, use hidden [[marks:n]] ticks only, make tick totals match marks, and finish "
            "with mauth_check_document_layout in solutions mode before reporting success."
        )

    if asks_to_write_question:
        circle_proof_guidance = ""
        if all(term in text for term in ("circle", "tangent")) and any(
            term in text for term in ("proof", "prove", "show", "subtended", "circumference")
        ):
            circle_proof_guidance = (
                " For a generic tangent/circle proof request, use a robust tangent-radius/central-angle theorem path: "
                "for example define the centre, use radius perpendicular tangent, equal radii, and the central-angle/"
                "angle-at-circumference relationship to prove the tangent-chord angle result. Do not add extra "
                "parallel chords or parallel-line scaffolding unless the teacher explicitly requested parallel lines."
            )
        diagram_guidance = (
            "If the source attachment includes a visible mathematical diagram, include it in diagram or diagrams in "
            "the same replacement payload, before structured parts when the teacher asks for parts under the diagram. "
            "For this request the direct tool schema may require diagram, so do not submit a text-only replacement."
            if has_source_attachment and source_prompt_mentions_diagram
            else "Omit diagram fields to preserve existing diagrams; use diagrams: [] only when explicitly removing diagrams."
        )
        focused_tool_name = "mauth_convert_source_question" if has_source_attachment else "mauth_question_upsert"
        target_description = (
            f"the next missing question, Question {question_number}"
            if append_question and not question_numbers
            else f"Question {question_number}"
        )
        return (
            "Focused tool routing hint: this is a one-question authoring request. Your first tool call should be "
            f"{focused_tool_name} for {target_description}, with marks, questionText, studentSpaceLines, "
            f"and solutionText when a solution is requested. If Question {question_number} is exactly the next missing "
            "question, this tool can append it; do not refuse just because it does not exist yet."
            f"{circle_proof_guidance} {diagram_guidance}"
        )
    if asks_for_response_space and not (asks_for_solution or asks_for_marking_edit):
        return (
            "Focused tool routing hint: this is a response-space/layout request. Your first tool call should be "
            f'mauth_author_adjust_response_spaces with {{"targets":[{{"questionNumber":{question_number},"lines":10,"mode":"set"}}]}}. '
            "Use this for answer-space changes that should preserve existing question text, solutions, and diagrams."
        )
    if asks_for_formatting:
        return (
            "Focused tool routing hint: this is a formatting/layout request. Your first tool call should be "
            f'mauth_fix_question_formatting with {{"operations":[{{"type":"tidyQuestionSpacing","target":{{"questionNumber":{question_number}}}}}]}} '
            "adapted to the teacher's request. Use setPageBreakBefore/removePageBreakBefore for page breaks before "
            "parts/subparts, setDiagramAlignment for diagram left/center/right, adjustAnswerSpace for answer-space "
            "line counts, fitSolutionToSpace when solutions need to fit, and moveModule only when moving one known module."
        )
    if (asks_for_solution or asks_for_marking_edit) and has_question_text:
        return (
            "Focused tool routing hint: this is a solution/mark-allocation request and the compact summary already includes enough "
            f"Question {question_number} text. Your first tool call should be mauth_write_solutions_for_questions with "
            f'{{"questions":[{{"questionNumber":{question_number},"marks":4,"studentSpaceLines":8,"solutionText":"... [[marks:1]]"}}]}} '
            "when changing solution ticks or worked solution text. Use hidden [[marks:n]] annotations only; do not show visible "
            "[1 mark] notes. Do not use mauth_question_upsert for a mark allocation tweak, because it replaces the "
            "whole question. Do not call mauth.document.inspect first."
        )
    if any(term in text for term in ("diagram", "graph")) and any(
        term in combined_text for term in ("circle", "tangent")
    ):
        penrose_predicates = "CircleThrough, OnCircle, Tangent, Segment"
        if "parallel" in combined_text and "chord" in combined_text:
            penrose_predicates = "CircleThrough, OnCircle, Tangent, ParallelToSegment, Segment"
        return (
            "Focused tool routing hint: this is a static circle-geometry diagram follow-up. Your first tool call "
            f"should be mauth_make_diagram_for_question for Question {question_number} with placement beforeStudentSpace "
            'and diagram.graphConfig.type="geometricConstruction". For Penrose geometry, write supported Penrose '
            f"Substance in graphConfig.options.substanceSource using predicates such as {penrose_predicates}. "
            "For a line parallel to chord BC, use ParallelToSegment(lineName, B, C). Match visible labels to the "
            "question statement; any auxiliary centre point should be hidden with Label centre $\\,$ and HidePoint(centre). "
            "The tangent line must be constrained with Tangent(lineName, circleName, A), so it touches the circle only at A. "
            "Do not use standardDiagram recipe names; choose the renderer and emit a real graphConfig."
        )
    return "No focused high-level tool hint."


def source_diagram_required_for_replace(
    messages: list[AssistantChatMessage] | None = None,
    attachments: list[AssistantAttachment] | None = None,
) -> bool:
    if not attachments:
        return False
    text = request_text(latest_user_messages(messages))
    asks_to_write_question = asks_to_author_question(text)
    if not asks_to_write_question:
        return False
    return any(
        term in text
        for term in (
            "diagram",
            "graph",
            "chart",
            "axes",
            "axis",
            "venn",
            "vector diagram",
            "underneath",
            "under the diagram",
            "entered underneath",
        )
    )


def model_pricing(model: str) -> dict[str, float | str] | None:
    normalized = model.lower()
    for model_prefix in sorted(MODEL_PRICING_USD_PER_1M, key=len, reverse=True):
        if normalized == model_prefix or normalized.startswith(f"{model_prefix}-"):
            return MODEL_PRICING_USD_PER_1M[model_prefix]
    return None


def int_from_usage(value: Any) -> int:
    return value if isinstance(value, int) and value >= 0 else 0


def assistant_usage_summary(response: dict[str, Any], model: str) -> dict[str, Any] | None:
    usage = response.get("usage")
    if not isinstance(usage, dict):
        return None

    input_tokens = int_from_usage(usage.get("input_tokens"))
    output_tokens = int_from_usage(usage.get("output_tokens"))
    total_tokens = int_from_usage(usage.get("total_tokens")) or input_tokens + output_tokens
    input_details = usage.get("input_tokens_details")
    cached_input_tokens = int_from_usage(input_details.get("cached_tokens")) if isinstance(input_details, dict) else 0
    billable_input_tokens = max(0, input_tokens - cached_input_tokens)

    pricing = model_pricing(model)
    estimated_cost_usd: float | None = None
    pricing_source: str | None = None
    if pricing:
        estimated_cost_usd = (
            (billable_input_tokens * float(pricing["input"]))
            + (cached_input_tokens * float(pricing["cached_input"]))
            + (output_tokens * float(pricing["output"]))
        ) / TOKENS_PER_MILLION
        pricing_source = str(pricing["source"])

    return {
        "model": model,
        "inputTokens": input_tokens,
        "cachedInputTokens": cached_input_tokens,
        "billableInputTokens": billable_input_tokens,
        "outputTokens": output_tokens,
        "totalTokens": total_tokens,
        "estimatedCostUsd": estimated_cost_usd,
        "pricingSource": pricing_source,
    }


def merge_usage_summaries(first: dict[str, Any] | None, second: dict[str, Any] | None) -> dict[str, Any] | None:
    if not first:
        return second
    if not second:
        return first

    first_model = first.get("model") if isinstance(first.get("model"), str) else ""
    second_model = second.get("model") if isinstance(second.get("model"), str) else ""
    model = (
        first_model
        if first_model == second_model
        else " + ".join(value for value in (first_model, second_model) if value)
    )
    first_cost = first.get("estimatedCostUsd")
    second_cost = second.get("estimatedCostUsd")
    estimated_cost: float | None = None
    if isinstance(first_cost, (int, float)) and isinstance(second_cost, (int, float)):
        estimated_cost = float(first_cost) + float(second_cost)

    return {
        "model": model or second_model or first_model,
        "inputTokens": int_from_usage(first.get("inputTokens")) + int_from_usage(second.get("inputTokens")),
        "cachedInputTokens": int_from_usage(first.get("cachedInputTokens"))
        + int_from_usage(second.get("cachedInputTokens")),
        "billableInputTokens": int_from_usage(first.get("billableInputTokens"))
        + int_from_usage(second.get("billableInputTokens")),
        "outputTokens": int_from_usage(first.get("outputTokens")) + int_from_usage(second.get("outputTokens")),
        "totalTokens": int_from_usage(first.get("totalTokens")) + int_from_usage(second.get("totalTokens")),
        "estimatedCostUsd": estimated_cost,
        "pricingSource": "Includes brain-planner and authoring calls when both are present.",
    }


def mauth_tool_definition() -> dict[str, Any]:
    return {
        "type": "function",
        "name": "mauth_tool",
        "description": (
            "Call one Mauth Studio document or file tool. Use this for inspecting the open test, previewing/applying "
            "structured Mauth document actions, validating solutions, and managing project files. Prefer inspect, then "
            "preview, then validation, then apply for document edits."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "name": {
                    "type": "string",
                    "enum": MAUTH_TOOL_NAMES,
                    "description": "The exact Mauth tool name to run.",
                },
                "arguments": {
                    "type": "object",
                    "description": "Arguments for the selected Mauth tool.",
                    "additionalProperties": True,
                },
            },
            "required": ["name", "arguments"],
            "additionalProperties": False,
        },
    }


def assistant_diagram_block_schema(description: str) -> dict[str, Any]:
    return {
        "type": "object",
        "description": description,
        "properties": {
            "id": {
                "type": "string",
                "description": "Optional stable block id. Usually omit and let Mauth generate it.",
            },
            "diagramAlign": {"type": "string", "enum": ["left", "center", "right"]},
            "diagramTextSide": {
                "type": "string",
                "enum": ["none", "left", "right"],
                "description": "Usually omit. Use only when a diagram intentionally shares horizontal space with text/solutions.",
            },
            "graphConfig": {
                "type": "object",
                "description": (
                    "Native Mauth renderer payload. Put renderer type/data/options here; never put type/data directly "
                    "on the diagram block."
                ),
                "properties": {
                    "type": {
                        "type": "string",
                        "enum": SUPPORTED_DIAGRAM_TYPES,
                    }
                },
                "required": ["type"],
                "additionalProperties": True,
            },
        },
        "required": ["graphConfig"],
        "additionalProperties": False,
    }


def assistant_table_block_schema(description: str) -> dict[str, Any]:
    return {
        "type": "object",
        "description": description,
        "properties": {
            "id": {"type": "string", "description": "Optional stable Mauth module id. Usually omit."},
            "headers": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Optional header row labels. Use [] for no header row.",
            },
            "rows": {
                "type": "array",
                "items": {"type": "array", "items": {"type": "string"}},
                "description": "Table body cells as strings. Use blank strings for student-completion cells.",
            },
            "showHeader": {"type": "boolean"},
            "tableAlign": {"type": "string", "enum": ["left", "center", "right"]},
            "cellAlignment": {"type": "string", "enum": ["left", "center", "right"]},
        },
        "required": ["rows"],
        "additionalProperties": False,
    }


def mauth_author_replace_question_tool_definition(*, require_diagram: bool = False) -> dict[str, Any]:
    required_fields = ["questionNumber", "marks", "questionText"]
    if require_diagram:
        required_fields.append("diagram")

    diagram_description = (
        "Required for this request because the source attachment/request asks for a visible mathematical diagram. "
        "Supply a native editable Mauth diagram block shaped as { graphConfig, diagramAlign? }. Do not place "
        "renderer type/data at the top level. Do not replace the "
        "diagram with prose, and do not omit this field."
        if require_diagram
        else (
            "Optional existing Mauth diagram block shaped as { graphConfig, diagramAlign? }. "
            "Do not place renderer type/data at the top level. "
            "Omit to preserve existing diagrams. Supply a valid supported graphConfig only when adding or "
            "replacing the question's diagrams. When converting a screenshot/source question whose visible "
            "diagram belongs under the stem and before the parts, supply it here or in diagrams."
        )
    )

    return {
        "type": "function",
        "name": "mauth_author_replace_question",
        "description": (
            "Replace one existing Mauth question, or append exactly the next missing question, with high-quality teacher-ready question content. "
            "Use for focused requests like writing or replacing one question. Do not use this for mark-allocation "
            "or solution-only tweaks. This is cheaper and more reliable than low-level module action batches."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "questionNumber": {
                    "type": "integer",
                    "minimum": 1,
                    "description": (
                        "1-based question number to replace. If this is exactly one past the current question count, "
                        "the Mauth tool appends it as a new question."
                    ),
                },
                "questionId": {
                    "type": "string",
                    "description": "Existing question id to replace. Use only when known.",
                },
                "marks": {
                    "type": "integer",
                    "minimum": 0,
                    "maximum": 100,
                    "description": "Marks for the question if it has no separate parts. Use 0 when separate parts carry the marks.",
                },
                "questionMarks": {
                    "type": "integer",
                    "minimum": 0,
                    "maximum": 100,
                    "description": "Optional question-level marks when parts are present. Usually 0.",
                },
                "questionText": {
                    "type": "string",
                    "description": (
                        "Assessment-ready prompt in Mauthdown/MathJax. Do not type 'Question 1'. "
                        "Keep source-style line breaks where useful. Preserve LaTeX backslashes exactly; in JSON "
                        "strings this means commands such as \\ell and \\frac must be emitted with escaped "
                        "backslashes, not as control characters."
                    ),
                },
                "studentSpaceLines": {
                    "type": "integer",
                    "minimum": 1,
                    "maximum": 40,
                    "description": (
                        "Generous student answer/work space lines for free-response questions. The app may raise this to "
                        "the mark-based or solution-fit minimum, so do not use small values to force compact layout. "
                        "For answerSurface diagram/table tasks, this is ignored unless extra working space is later added."
                    ),
                },
                "answerSurface": {
                    "type": "string",
                    "enum": ["space", "diagram", "table", "none"],
                    "description": (
                        "Use space for normal free-response working. Use diagram when the answer is a sketch/label/shade/draw-on-graph "
                        "surface, and table when the answer is a completed table. In diagram/table modes, do not add a separate "
                        "studentSpaceLines answer block; provide the student surface and, for solutions, the matching solutionDiagram "
                        "or solutionTable."
                    ),
                },
                "solutionText": {
                    "type": "string",
                    "description": (
                        "Only include when the teacher requested a solution/answer key or the source visibly contains one. "
                        "Concise worked solution in Mauthdown/MathJax. Start with a real solution, not placeholders; "
                        "the app will add the Solution heading if omitted. Put hidden [[marks:n]] annotations at the "
                        "end of mark-worthy lines so the solution copy renders red check marks; the total hidden "
                        "marks should match the item marks. For answerSurface diagram/table tasks, the completed "
                        "solutionDiagram/solutionTable receives the red ticks from the item marks automatically, so "
                        "use solutionText only for a short unmarked note if needed. Do not write visible [1 mark], (1 mark), or "
                        "'1 mark for ...' notes. Preserve LaTeX backslashes exactly; in JSON strings this means "
                        "commands such as \\ell and \\frac must be emitted with escaped backslashes, not as control "
                        "characters."
                    ),
                },
                "includeSolution": {
                    "type": "boolean",
                    "description": "Set true only when the teacher requested a solution/answer key or the source visibly contains one.",
                },
                "diagram": assistant_diagram_block_schema(diagram_description),
                "diagrams": {
                    "type": "array",
                    "description": (
                        "Optional list of replacement Mauth diagram blocks. Use [] only when intentionally removing all "
                        "existing diagrams. For source conversions with a visible mathematical diagram, include the "
                        "native diagram here instead of replacing it with prose. Each item should be shaped as "
                        "{ graphConfig: { type: ... }, diagramAlign?: ... }; do not put type/data directly on the item."
                    ),
                    "items": assistant_diagram_block_schema(
                        "One native Mauth diagram block shaped as { graphConfig, diagramAlign? }."
                    ),
                },
                "solutionDiagram": assistant_diagram_block_schema(
                    "Optional completed solution-copy diagram for answerSurface: diagram. Pair it with the student blank/partial "
                    "diagram so the solution copy shows the completed graph/labelled diagram in the same position and size."
                ),
                "solutionDiagrams": {
                    "type": "array",
                    "description": (
                        "Optional completed solution-copy diagrams for answerSurface: diagram. Usually supply one solution diagram "
                        "matching the one student diagram."
                    ),
                    "items": assistant_diagram_block_schema("One completed solution-copy Mauth diagram block."),
                },
                "table": assistant_table_block_schema(
                    "Optional student table. Use blank strings for cells the student should complete."
                ),
                "tables": {
                    "type": "array",
                    "description": "Optional student tables. Use blank strings for cells the student should complete.",
                    "items": assistant_table_block_schema("One student table."),
                },
                "solutionTable": assistant_table_block_schema(
                    "Optional completed solution-copy table for answerSurface: table. It replaces the student completion table."
                ),
                "solutionTables": {
                    "type": "array",
                    "description": "Optional completed solution-copy tables for answerSurface: table.",
                    "items": assistant_table_block_schema("One completed solution-copy table."),
                },
                "preserveExistingDiagrams": {
                    "type": "boolean",
                    "description": (
                        "Default true when diagram/diagrams is omitted. Set false only when the teacher explicitly asks "
                        "to remove existing diagrams."
                    ),
                },
                "parts": {
                    "type": "array",
                    "description": (
                        "Optional structured parts. Use this instead of typing '(a)', '(b)', '(c)' into questionText. "
                        "Each part can have text, marks, answerSurface, studentSpaceLines, solutionText, optional diagram/diagrams, "
                        "and optional table/solutionTable answer surfaces. "
                        "If the source says the diagram goes under the stem and the parts go under the diagram, put the "
                        "diagram at question level and keep the actual visible part tasks in this parts array."
                    ),
                    "items": {
                        "type": "object",
                        "properties": {
                            "label": {
                                "type": "string",
                                "description": "Part label such as a, b, or c. Omit to auto-label.",
                            },
                            "text": {
                                "type": "string",
                                "description": (
                                    "Part prompt text without a typed '(a)' label. Must contain the visible part task "
                                    "from the source, for example `$\\mathbf{a}\\cdot\\mathbf{b}$`; never leave this "
                                    "blank for a marked part."
                                ),
                            },
                            "marks": {"type": "integer", "minimum": 0, "maximum": 100},
                            "studentSpaceLines": {
                                "type": "integer",
                                "minimum": 1,
                                "maximum": 40,
                                "description": (
                                    "Generous part answer/work space for free-response parts; ignored for answerSurface diagram/table."
                                ),
                            },
                            "answerSurface": {
                                "type": "string",
                                "enum": ["space", "diagram", "table", "none"],
                                "description": "Use diagram/table when the part answer is drawn/completed directly on that surface.",
                            },
                            "solutionText": {
                                "type": "string",
                                "description": (
                                    "Only include when the teacher requested solutions or the source visibly contains one. "
                                    "Worked solution for this part. End mark-worthy lines with hidden [[marks:n]] tick "
                                    "annotations and make the hidden mark total match this part's marks. For answerSurface "
                                    "diagram/table parts, the completed solution surface receives the ticks automatically, "
                                    "so use this only for a short unmarked note if needed."
                                ),
                            },
                            "includeSolution": {"type": "boolean"},
                            "diagram": assistant_diagram_block_schema(
                                "Optional native Mauth diagram block for this part, shaped as { graphConfig, diagramAlign? }."
                            ),
                            "diagrams": {
                                "type": "array",
                                "description": "Optional replacement diagrams for this part. Omit to leave existing diagram decisions alone.",
                                "items": assistant_diagram_block_schema(
                                    "One native Mauth diagram block for this part, shaped as { graphConfig, diagramAlign? }."
                                ),
                            },
                            "solutionDiagram": assistant_diagram_block_schema(
                                "Optional completed solution-copy diagram for this part when answerSurface is diagram."
                            ),
                            "solutionDiagrams": {
                                "type": "array",
                                "items": assistant_diagram_block_schema(
                                    "One completed solution-copy diagram for this part."
                                ),
                            },
                            "table": assistant_table_block_schema(
                                "Optional student completion table for this part. Use blank strings for empty answer cells."
                            ),
                            "tables": {
                                "type": "array",
                                "items": assistant_table_block_schema("One student completion table for this part."),
                            },
                            "solutionTable": assistant_table_block_schema(
                                "Optional completed solution-copy table for this part."
                            ),
                            "solutionTables": {
                                "type": "array",
                                "items": assistant_table_block_schema(
                                    "One completed solution-copy table for this part."
                                ),
                            },
                            "pageBreakBefore": {"type": "boolean"},
                        },
                        "required": ["text", "marks"],
                        "additionalProperties": False,
                    },
                },
            },
            "required": required_fields,
            "additionalProperties": False,
        },
    }


def mauth_question_upsert_tool_definition(*, require_diagram: bool = False) -> dict[str, Any]:
    definition = mauth_author_replace_question_tool_definition(require_diagram=require_diagram)
    definition["name"] = "mauth_question_upsert"
    definition["description"] = (
        "Create the requested Mauth question when it is exactly the next missing question, or replace it when it already "
        "exists. This is the preferred focused question-authoring tool. It preserves existing diagrams when diagram fields "
        "are omitted, supports native editable diagrams/tables, and supports answerSurface diagram/table for sketch, "
        "label, shade, and completion-table answer surfaces."
    )
    return definition


def mauth_convert_source_question_tool_definition(*, require_diagram: bool = False) -> dict[str, Any]:
    definition = mauth_question_upsert_tool_definition(require_diagram=require_diagram)
    definition["name"] = "mauth_convert_source_question"
    definition["description"] = (
        "Convert one question from an attached screenshot, PDF page, Word/text source, or pasted source into native "
        "editable Mauth content. Use this for source-fidelity requests. Preserve the visible stem, marks, line breaks, "
        "inline-vs-display maths intent, source diagram placement, and structured parts. If the source includes a visible "
        "mathematical diagram and the teacher asks to include/enter it, provide a native diagram/diagrams payload in this "
        "same call rather than replacing the diagram with prose."
    )
    return definition


def mauth_author_add_diagram_tool_definition() -> dict[str, Any]:
    return {
        "type": "function",
        "name": "mauth_author_add_diagram",
        "description": (
            "Add a teacher-ready diagram to one existing question. Use for focused follow-ups like "
            "'include/add the diagram in question 1'. Choose the correct Mauth renderer and provide a real graphConfig. "
            "Use geometricConstruction/Penrose for schematic geometry and theorem diagrams; graph2d for coordinate/function "
            "graphs; vector2d for coordinate vectors and source-faithful no-axis vector/ray diagrams; statsChart for statistical charts; setDiagram for Venn/set diagrams; "
            "graph3d for 3D diagrams; image for uploaded images."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "questionNumber": {
                    "type": "integer",
                    "minimum": 1,
                    "description": "1-based question number to receive the diagram.",
                },
                "questionId": {
                    "type": "string",
                    "description": "Existing question id to receive the diagram. Use only when known.",
                },
                "diagramId": {
                    "type": "string",
                    "description": (
                        "Existing diagram block id to replace. Use this when a previous diagram edit returned "
                        "post-edit inspection warnings with a targetId/diagramId. Omit for a new diagram."
                    ),
                },
                "diagram": assistant_diagram_block_schema(
                    "Mauth diagram block. Provide { graphConfig, diagramAlign? }. For Penrose geometry, use "
                    '{ "graphConfig": { "type":"geometricConstruction", "options": { "substanceSource": '
                    '"Point A, B\\nCircle omega\\n..." } } }. Write supported Mauth Penrose Substance directly. '
                    "For tangent-parallel-chord diagrams, use predicates such as CircleThrough, OnCircle, "
                    "Tangent, Segment, and ParallelToSegment. Do not visibly label auxiliary centre points "
                    "unless the question names them."
                ),
                "diagramAlign": {
                    "type": "string",
                    "enum": ["left", "center", "right"],
                    "description": "Diagram alignment in the question. Default center. May also be set inside diagram.",
                },
                "placement": {
                    "type": "string",
                    "enum": ["afterQuestionText", "beforeStudentSpace", "end"],
                    "description": "Where to place the diagram. Default beforeStudentSpace.",
                },
            },
            "required": ["questionNumber", "diagram"],
            "additionalProperties": False,
        },
    }


def mauth_make_diagram_for_question_tool_definition() -> dict[str, Any]:
    definition = mauth_author_add_diagram_tool_definition()
    definition["name"] = "mauth_make_diagram_for_question"
    definition["description"] = (
        "Create or repair a native editable diagram for one existing question. Use for focused diagram follow-ups and "
        "post-edit semantic repairs. Read the question text, choose the correct renderer, and make the graphConfig match "
        "the stated mathematical relationships. Prefer geometricConstruction/Penrose for schematic geometry, graph2d for "
        "coordinate/function graphs, vector2d for coordinate vectors and source-faithful no-axis vector/ray diagrams, statsChart for statistics, setDiagram for Venn/set "
        "diagrams, graph3d for 3D diagrams, and image only when an uploaded bitmap is explicitly required."
    )
    return definition


def mauth_author_ensure_solutions_tool_definition() -> dict[str, Any]:
    return {
        "type": "function",
        "name": "mauth_author_ensure_solutions",
        "description": (
            "Add or replace solution blocks and student answer spaces for one or more existing questions. "
            "Use for focused solution-key and mark-allocation requests when the model has enough question context to "
            "write or repair the solutions. This preserves existing non-solution question content and diagrams."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "questions": {
                    "type": "array",
                    "description": "Solution payloads keyed by question number or id.",
                    "items": {
                        "type": "object",
                        "properties": {
                            "questionNumber": {"type": "integer", "minimum": 1},
                            "questionId": {"type": "string"},
                            "marks": {
                                "type": "integer",
                                "minimum": 0,
                                "maximum": 100,
                                "description": "Optional updated question marks for non-part questions.",
                            },
                            "questionMarks": {
                                "type": "integer",
                                "minimum": 0,
                                "maximum": 100,
                                "description": "Optional updated question-level marks when parts carry separate marks. Usually omit.",
                            },
                            "studentSpaceLines": {
                                "type": "integer",
                                "minimum": 1,
                                "maximum": 60,
                                "description": "Generous answer/work space; the app may raise this to fit the solution.",
                            },
                            "solutionText": {
                                "type": "string",
                                "description": (
                                    "Concise worked solution in Mauthdown/MathJax. Put hidden [[marks:n]] annotations at "
                                    "the end of mark-worthy lines so Mauth renders red check marks. The hidden mark total "
                                    "should match the question/part marks. Do not write visible [1 mark], (1 mark), or "
                                    "'1 mark for ...' notes."
                                ),
                            },
                            "parts": {
                                "type": "array",
                                "description": "Optional per-part solutions. Use when the question already has structured parts.",
                                "items": {
                                    "type": "object",
                                    "properties": {
                                        "label": {"type": "string"},
                                        "partId": {"type": "string"},
                                        "marks": {
                                            "type": "integer",
                                            "minimum": 0,
                                            "maximum": 100,
                                            "description": "Optional updated marks for this part.",
                                        },
                                        "studentSpaceLines": {
                                            "type": "integer",
                                            "minimum": 1,
                                            "maximum": 60,
                                            "description": "Generous part answer/work space; the app may raise this to fit the solution.",
                                        },
                                        "solutionText": {
                                            "type": "string",
                                            "description": (
                                                "Part solution with hidden [[marks:n]] annotations on mark-worthy lines. "
                                                "Make the hidden mark total match the part marks."
                                            ),
                                        },
                                        "subparts": {
                                            "type": "array",
                                            "description": "Optional per-subpart solutions when the existing part has structured subparts.",
                                            "items": {
                                                "type": "object",
                                                "properties": {
                                                    "label": {"type": "string"},
                                                    "subpartId": {"type": "string"},
                                                    "marks": {
                                                        "type": "integer",
                                                        "minimum": 0,
                                                        "maximum": 100,
                                                        "description": "Optional updated marks for this subpart.",
                                                    },
                                                    "studentSpaceLines": {
                                                        "type": "integer",
                                                        "minimum": 1,
                                                        "maximum": 60,
                                                        "description": (
                                                            "Generous subpart answer/work space; the app may raise this to fit the solution."
                                                        ),
                                                    },
                                                    "solutionText": {
                                                        "type": "string",
                                                        "description": (
                                                            "Subpart solution with hidden [[marks:n]] annotations on mark-worthy lines. "
                                                            "Make the hidden mark total match the subpart marks."
                                                        ),
                                                    },
                                                },
                                                "required": ["solutionText"],
                                                "additionalProperties": False,
                                            },
                                        },
                                    },
                                    "required": [],
                                    "additionalProperties": False,
                                },
                            },
                        },
                        "required": [],
                        "additionalProperties": False,
                    },
                }
            },
            "required": ["questions"],
            "additionalProperties": False,
        },
    }


def mauth_write_solutions_for_questions_tool_definition() -> dict[str, Any]:
    definition = mauth_author_ensure_solutions_tool_definition()
    definition["name"] = "mauth_write_solutions_for_questions"
    definition["description"] = (
        "Write or repair concise marking-key solutions for existing questions while preserving the original student "
        "question content and diagrams. Use hidden [[marks:n]] annotations for red check marks, match the hidden mark "
        "total to each question/part, keep solutions concise, and adjust student space only as needed to fit the solution."
    )
    return definition


def mauth_write_all_solutions_tool_definition() -> dict[str, Any]:
    definition = mauth_author_ensure_solutions_tool_definition()
    definition["name"] = "mauth_write_all_solutions"
    definition["description"] = (
        "Write or replace the full marking-key solutions for the whole current test. Use only when covering every "
        "marked question, part, and subpart. Preserve existing diagrams and student question content, use hidden "
        "[[marks:n]] annotations only, match every hidden tick total to the corresponding marks, and choose generous "
        "studentSpaceLines so the solution copy fits without layout movement."
    )
    return definition


def mauth_check_document_layout_tool_definition() -> dict[str, Any]:
    return {
        "type": "function",
        "name": "mauth_check_document_layout",
        "description": (
            "Run a document-wide Mauth layout/print check without changing the document. Use for broad checks of page "
            "overflow, missing answer spaces, solution-space mismatch, blank-page risks, oversized diagrams, diagram "
            "render/semantic warnings, and print-risk items before reporting that a document is ready."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "mode": {
                    "type": "string",
                    "enum": ["student", "solutions", "both"],
                    "description": "student checks student copy surfaces, solutions checks solution-key fit/ticks, both checks both.",
                }
            },
            "additionalProperties": False,
        },
    }


def mauth_author_adjust_response_spaces_tool_definition() -> dict[str, Any]:
    return {
        "type": "function",
        "name": "mauth_author_adjust_response_spaces",
        "description": (
            "Resize or add student-only answer/working spaces for existing questions, parts, or subparts. "
            "Use for focused layout/space requests such as 'give Question 1 more working space' when the "
            "teacher is not asking for a rewritten worked solution. This preserves existing question text, "
            "solutions, and diagrams."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "targets": {
                    "type": "array",
                    "description": "Response-space targets keyed by question number/id and optional part/subpart.",
                    "items": {
                        "type": "object",
                        "properties": {
                            "questionNumber": {"type": "integer", "minimum": 1},
                            "questionId": {"type": "string"},
                            "partId": {"type": "string"},
                            "partLabel": {
                                "type": "string",
                                "description": "Existing part label such as a or b. Use only when targeting a part.",
                            },
                            "partNumber": {
                                "type": "integer",
                                "minimum": 1,
                                "description": "1-based part number. Use only when targeting a part.",
                            },
                            "subpartId": {"type": "string"},
                            "subpartLabel": {
                                "type": "string",
                                "description": "Existing subpart label such as i or ii. Use only when targeting a subpart.",
                            },
                            "subpartNumber": {
                                "type": "integer",
                                "minimum": 1,
                                "description": "1-based subpart number. Use only when targeting a subpart.",
                            },
                            "lines": {
                                "type": "integer",
                                "minimum": 1,
                                "maximum": 60,
                                "description": "Target number of student response-space lines.",
                            },
                            "mode": {
                                "type": "string",
                                "enum": ["set", "atLeast"],
                                "description": "Use set to make the space exactly this size; use atLeast to only grow it.",
                            },
                        },
                        "required": ["questionNumber", "lines"],
                        "additionalProperties": False,
                    },
                }
            },
            "required": ["targets"],
            "additionalProperties": False,
        },
    }


def assistant_format_target_schema() -> dict[str, Any]:
    return {
        "type": "object",
        "description": "Existing document location. Use questionNumber plus optional part/subpart labels or ids.",
        "properties": {
            "questionNumber": {"type": "integer", "minimum": 1},
            "questionId": {"type": "string"},
            "partId": {"type": "string"},
            "partLabel": {"type": "string", "description": "Existing part label such as a, b, c."},
            "partNumber": {"type": "integer", "minimum": 1},
            "subpartId": {"type": "string"},
            "subpartLabel": {"type": "string", "description": "Existing subpart label such as i, ii, iii."},
            "subpartNumber": {"type": "integer", "minimum": 1},
            "blockId": {"type": "string", "description": "Existing module id, when known."},
            "moduleId": {"type": "string", "description": "Alias for blockId."},
            "diagramId": {"type": "string", "description": "Existing diagram module id, when known."},
        },
        "required": ["questionNumber"],
        "additionalProperties": False,
    }


def mauth_format_apply_tool_definition() -> dict[str, Any]:
    return {
        "type": "function",
        "name": "mauth_format_apply",
        "description": (
            "Apply safe high-level formatting changes without rewriting question content. Use for requests like "
            "'put part (c) on a new page', 'move the diagram right', 'add more answer space', "
            "'make the solution fit', 'move this module', or 'tidy spacing'. Prefer this over low-level "
            "Mauth action JSON for formatting/layout edits."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "operations": {
                    "type": "array",
                    "description": "Formatting operations to apply atomically.",
                    "items": {
                        "type": "object",
                        "properties": {
                            "type": {
                                "type": "string",
                                "enum": [
                                    "setPageBreakBefore",
                                    "removePageBreakBefore",
                                    "setDiagramAlignment",
                                    "adjustAnswerSpace",
                                    "moveModule",
                                    "fitSolutionToSpace",
                                    "tidyQuestionSpacing",
                                ],
                            },
                            "target": assistant_format_target_schema(),
                            "to": assistant_format_target_schema(),
                            "diagramAlign": {"type": "string", "enum": ["left", "center", "right"]},
                            "align": {"type": "string", "enum": ["left", "center", "right"]},
                            "diagramTextSide": {"type": "string", "enum": ["none", "left", "right"]},
                            "diagramIndex": {"type": "integer", "minimum": 1},
                            "blockId": {"type": "string"},
                            "moduleId": {"type": "string"},
                            "diagramId": {"type": "string"},
                            "lines": {"type": "integer", "minimum": 1, "maximum": 60},
                            "studentSpaceLines": {"type": "integer", "minimum": 1, "maximum": 60},
                            "deltaLines": {"type": "integer", "minimum": 1, "maximum": 60},
                            "mode": {"type": "string", "enum": ["set", "atLeast", "add"]},
                            "beforeBlockId": {"type": "string"},
                            "afterBlockId": {"type": "string"},
                            "extraLines": {"type": "integer", "minimum": 0, "maximum": 10},
                        },
                        "required": ["type"],
                        "additionalProperties": False,
                    },
                }
            },
            "required": ["operations"],
            "additionalProperties": False,
        },
    }


def mauth_fix_question_formatting_tool_definition() -> dict[str, Any]:
    definition = mauth_format_apply_tool_definition()
    definition["name"] = "mauth_fix_question_formatting"
    definition["description"] = (
        "Apply safe high-level formatting/layout fixes to one or more existing question locations without rewriting "
        "question content. Use for page breaks, diagram alignment, answer-space sizing, solution-fit adjustments, module "
        "moves, and conservative spacing tidy requests. Prefer this task-specific tool over low-level action JSON."
    )
    return definition


def assistant_tool_definitions(
    messages: list[AssistantChatMessage] | None = None,
    tool_outputs: list[AssistantToolOutput] | None = None,
    attachments: list[AssistantAttachment] | None = None,
    document_summary: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    current_messages = latest_user_messages(messages)
    text = request_text(current_messages, tool_outputs)
    compact_summary = compact_document_summary(document_summary, current_messages)
    intent = classify_request_intent(compact_summary, current_messages, attachments)
    repair_targets = tool_output_target_names(tool_outputs)
    has_specific_question = intent.has_specific_question
    asks_for_diagram = intent.asks_for_diagram
    asks_to_add = intent.asks_to_add
    asks_for_solution = intent.asks_for_solution
    asks_for_whole_solution_key = intent.asks_for_whole_solution_key
    asks_for_layout_check = intent.asks_for_layout_check
    asks_for_response_space = intent.asks_for_response_space
    asks_for_formatting = intent.asks_for_formatting
    asks_for_marking_edit = intent.asks_for_marking_edit
    asks_to_write_question = intent.asks_to_write_question
    require_source_diagram = intent.require_source_diagram
    asks_to_convert_source_question = intent.kind == "append_source_question" or (
        bool(attachments) and asks_to_write_question
    )
    file_only_terms = ("open file", "save file", "rename file", "delete file", "move file", "folder", "files")

    # Repair continuations should stay on the same narrow authoring surface
    # that produced the failed tool output. This avoids reopening the broad
    # wrapper tool just to fix a precise validationIssue path.
    if tool_outputs_mention(tool_outputs, SOURCE_QUESTION_REPAIR_TERMS):
        return [mauth_convert_source_question_tool_definition(require_diagram=True)]

    if tool_outputs_mention(tool_outputs, ("semanticreview", "semantic review")):
        return [
            mauth_make_diagram_for_question_tool_definition(),
            mauth_question_upsert_tool_definition(require_diagram=False),
        ]

    solution_layout_repair_terms = (
        "rendered-solution-space-overflow",
        "rendered-response-space-outline-missing",
        "rendered-page-overflow",
        "student-space-missing",
        "solution-hidden-mark-total-mismatch",
        "solution-visible-mark-note",
    )
    if repair_targets & {
        "mauth_question_upsert",
        "mauth_convert_source_question",
        "mauth.question.upsert",
        "mauth_author_replace_question",
        "mauth.author.replaceQuestion",
    }:
        if tool_outputs_mention(tool_outputs, solution_layout_repair_terms):
            return [
                mauth_write_solutions_for_questions_tool_definition(),
                mauth_author_adjust_response_spaces_tool_definition(),
            ]
        if tool_outputs_mention(
            tool_outputs,
            (
                "diagramid",
                "targetid",
                "diagram-renderer",
                "renderer-mismatch",
                "missing tangent",
                "paralleltosegment",
                "chord segment",
                "vector labels",
                "rendered-diagram",
                "graph2d",
                "set-diagram",
                "stats-chart",
                "vector2d",
                "penrose-",
            ),
        ):
            return [mauth_make_diagram_for_question_tool_definition()]
        return [
            mauth_question_upsert_tool_definition(
                require_diagram=require_source_diagram
                or tool_outputs_mention(tool_outputs, ("diagram", "graphconfig", "graph config"))
            )
        ]
    if repair_targets & {"mauth_author_add_diagram", "mauth_make_diagram_for_question", "mauth.author.addDiagram"}:
        return [mauth_make_diagram_for_question_tool_definition()]
    if repair_targets & {
        "mauth_author_ensure_solutions",
        "mauth_write_solutions_for_questions",
        "mauth_write_all_solutions",
        "mauth.solutions.writeAll",
        "mauth.author.ensureSolutions",
    }:
        if tool_outputs_mention(tool_outputs, solution_layout_repair_terms):
            solution_repair_tool = (
                mauth_write_all_solutions_tool_definition()
                if repair_targets & {"mauth_write_all_solutions", "mauth.solutions.writeAll"}
                else mauth_write_solutions_for_questions_tool_definition()
            )
            return [
                solution_repair_tool,
                mauth_check_document_layout_tool_definition(),
                mauth_author_adjust_response_spaces_tool_definition(),
            ]
        return [
            mauth_write_all_solutions_tool_definition()
            if repair_targets & {"mauth_write_all_solutions", "mauth.solutions.writeAll"}
            else mauth_write_solutions_for_questions_tool_definition()
        ]
    if repair_targets & {"mauth_check_document_layout", "mauth.layout.check"}:
        return [
            mauth_check_document_layout_tool_definition(),
            mauth_fix_question_formatting_tool_definition(),
            mauth_author_adjust_response_spaces_tool_definition(),
            mauth_write_solutions_for_questions_tool_definition(),
        ]
    if repair_targets & {"mauth_author_adjust_response_spaces", "mauth.author.adjustResponseSpaces"}:
        return [mauth_author_adjust_response_spaces_tool_definition()]
    if repair_targets & {"mauth_format_apply", "mauth_fix_question_formatting", "mauth.format.apply"}:
        return [mauth_fix_question_formatting_tool_definition()]

    if intent.kind == "clarify":
        return []

    # Focused single-question requests should expose the narrow direct tool only.
    # This materially reduces provider input tokens and discourages tool-loop drift.
    if has_specific_question and asks_to_convert_source_question:
        return [mauth_convert_source_question_tool_definition(require_diagram=require_source_diagram)]
    if has_specific_question and asks_to_write_question:
        return [mauth_question_upsert_tool_definition(require_diagram=require_source_diagram)]
    if has_specific_question and asks_for_diagram and asks_to_add:
        return [mauth_make_diagram_for_question_tool_definition()]
    if has_specific_question and asks_for_response_space and not (asks_for_solution or asks_for_marking_edit):
        return [mauth_author_adjust_response_spaces_tool_definition()]
    if has_specific_question and asks_for_formatting and not asks_to_write_question:
        return [mauth_fix_question_formatting_tool_definition()]
    if has_specific_question and (asks_for_solution or asks_for_marking_edit):
        return [mauth_write_solutions_for_questions_tool_definition(), mauth_tool_definition()]
    if asks_for_layout_check:
        return [mauth_check_document_layout_tool_definition()]
    if asks_for_whole_solution_key:
        tools = [mauth_write_all_solutions_tool_definition(), mauth_check_document_layout_tool_definition()]
        if not marked_summary_has_solution_context(compact_summary):
            tools.append(mauth_tool_definition())
        return tools
    if any(term in text for term in file_only_terms) and not any(
        term in text for term in ("question", "solution", "diagram", "format", "layout", "exam")
    ):
        return [mauth_tool_definition()]

    return [
        mauth_convert_source_question_tool_definition(require_diagram=require_source_diagram)
        if asks_to_convert_source_question
        else mauth_question_upsert_tool_definition(require_diagram=require_source_diagram),
        mauth_make_diagram_for_question_tool_definition(),
        mauth_write_solutions_for_questions_tool_definition(),
        mauth_write_all_solutions_tool_definition(),
        mauth_author_adjust_response_spaces_tool_definition(),
        mauth_fix_question_formatting_tool_definition(),
        mauth_check_document_layout_tool_definition(),
        mauth_tool_definition(),
    ]


def assistant_instructions(
    document_summary: dict[str, Any] | None = None,
    messages: list[AssistantChatMessage] | None = None,
    tool_outputs: list[AssistantToolOutput] | None = None,
    selected_brain_files: list[str] | None = None,
    attachments: list[AssistantAttachment] | None = None,
) -> str:
    current_messages = latest_user_messages(messages)
    compact_summary = compact_document_summary(document_summary, current_messages)
    summary_limit = assistant_document_context_limit()
    summary_text = (
        json.dumps(compact_summary, ensure_ascii=False)[:summary_limit]
        if compact_summary and summary_limit > 0
        else "No document summary supplied."
    )
    brain_text = assistant_brain_context(current_messages, tool_outputs, selected_brain_files, attachments)
    tool_hint = focused_tool_hint(compact_summary, current_messages, attachments)
    attachment_lines = [
        f"- {attachment.name} ({attachment.mimeType or 'unknown type'}, {attachment.sizeBytes or 0} bytes)"
        for attachment in attachments or []
    ]
    attachment_text = "\n".join(attachment_lines) if attachment_lines else "No attachments."
    return f"""You are the in-app Mauth Studio assistant for a high-school mathematics test editor.

Operate through the provided Mauth functions only. Never describe raw React state, DOM edits, or browser-cache edits as an implementation path.

Document-edit workflow:
1. Use a focused high-level direct authoring tool first when the tool-routing hint says one applies.
2. Inspect the document only when you need ids, structure, or missing question text that is not already supplied in the compact summary.
3. Preview generated low-level Mauth actions before applying them.
4. Run solution or document validation when creating/editing solutions or larger document structure.
5. Apply only structured Mauth actions after the preview is coherent.
6. Keep edits concise and explain what changed after tool outputs are returned.

{tool_hint}

Tool-call contract:
- For focused requests to write, create, replace, or upsert one question, use the direct mauth_question_upsert tool. If the requested question number is exactly the next missing question, the frontend tool appends it; do not refuse because it does not exist yet. Do not call mauth.document.inspect first if the supplied document summary already tells you the question number exists or is the next append position.
- Use mauth.preview.inspect when you need focused context for the current/selected question, its diagrams, answer-space layout, solution modules, hidden tick totals, or warnings. Prefer it over mauth.document.inspect for one-question editing checks and after edits that affect diagrams/solutions/layout. For diagrams, inspect question.diagrams[].warnings and repair renderer mismatches, missing image sources, missing scalar-product vector labels/angle markers/hidden-axis settings, rendered diagram failures, and Penrose semantic warnings before saying the diagram is correct. For Penrose circle-theorem diagrams, inspect semanticWarnings and repair missing Tangent, missing ParallelToSegment to the named chord, missing chord Segment, visible auxiliary labels, or points not on the intended circle before saying the diagram is correct. When rendered metrics are available, use them to check page occupancy, selected-anchor boxes, diagram render failure, solution-slot fit, and L-shaped diagram/answer-space layout before saying the layout is fixed.
- If a successful authoring tool output includes semanticReview.required=true, do not simply say the edit is done. Use the compact postEditInspection question text/module previews plus question.diagrams[].summary to semantically compare the teacher's request, the written question, and the actual diagram payload. Check that every mathematical object named in the question appears in the diagram summary, that graph functions/equations match exactly, that the diagram renderer fits the task, and that labels/relationships used by the solution are present. If the question says straight lines but the diagram summary shows a quadratic curve, or if any other diagram/question mismatch is visible, repair with the focused high-level tool available in that round. Only report success once the artifact is semantically coherent.
- If an authoring tool output has ok=false but committedDocument=true or includes repairTarget, the edit was already inserted into the document and now needs an in-place repair. Use repairTarget.questionNumber/questionId and repairTarget.diagramId/targetId exactly. Do not interpret the original request as a fresh append, do not create the next missing question, and do not duplicate the question. Repair the committed target once with the focused high-level tool available in that round.
- For attachment-derived one-question conversions where the teacher asks for the diagram to be entered, included, placed under the prompt, or kept from the source, use mauth_convert_source_question and include the native diagram in the same payload using diagram or diagrams. Do not submit a text-only replacement for these requests; the direct tool schema may require diagram. Do not replace a visible mathematical diagram with prose such as "The diagram shows...". Keep diagram prose only when it is part of the original written prompt.
- For source prompts with visible part lines, preserve each part's actual mathematical task inside parts[i].text. Do not leave marked part text blank, do not type only labels, and do not move expressions such as $\\mathbf{{a}}\\cdot\\mathbf{{b}}$ into the stem or a prose diagram description.
- For source conversions with marked written-response parts, set each parts[i].studentSpaceLines to at least 3 unless the answer surface is a table, diagram, graph, or other completed artifact surface. Preserve larger source answer space when it is visible.
- For tasks where the answer is the surface itself, such as complete the table, sketch the graph, draw the function, shade the region, or label the diagram, set answerSurface to table or diagram. Provide the blank/partial student table or diagram plus a completed solutionTable or solutionDiagram when solutions are requested. Do not create a separate large student working-space block for these artifact-answer tasks unless the teacher also asks for written working. The authoring layer places red ticks beside completed solution tables/diagrams automatically from the item marks, so do not duplicate those marks in solutionText.
- Do not add worked solutions merely because a question has marks. Only include solutionText, parts[i].solutionText, or includeSolution: true when the teacher asks for solutions/answers/marking key, the source visibly includes solutions, or the request is explicitly a solution repair.
- For focused mark-allocation, tick, QED-mark, or solution-only edits, do not use mauth_question_upsert. Use mauth_write_solutions_for_questions with updated marks and revised solutionText when changing the worked solution, or mauth_tool with low-level question.update/module.update actions for marks-only edits. Preserve existing diagrams unless the teacher explicitly asks to remove or replace them.
- For focused answer-space or working-space changes where the teacher is not asking for a solution rewrite, use mauth_author_adjust_response_spaces. It resizes or adds student-only response spaces for questions, parts, or subparts while preserving the existing question text, solutions, and diagrams.
- For focused formatting/layout requests, use mauth_fix_question_formatting rather than low-level action JSON. Supported operations are setPageBreakBefore, removePageBreakBefore, setDiagramAlignment, adjustAnswerSpace, moveModule, fitSolutionToSpace, and tidyQuestionSpacing. This is the safe path for requests like "put part (c) on a new page", "move the diagram right", "make the solution fit", or "remove unnecessary blank space".
- In mauth_question_upsert, omitted diagram and diagrams fields preserve existing diagrams. Use diagrams: [] or preserveExistingDiagrams: false only when the teacher explicitly asks to remove diagrams.
- For focused follow-ups that only ask to add/include a diagram in one existing question, use mauth_make_diagram_for_question with a real diagram.graphConfig. Choose the renderer first: geometricConstruction/Penrose for schematic geometry, circle theorem, tangent, parallel, perpendicular, construction, and relationship diagrams; graph2d for coordinate/function graphs; vector2d for coordinate vectors and source-faithful no-axis vector/ray diagrams; statsChart for histograms/columns/distributions; setDiagram for Venn/set diagrams; graph3d for 3D diagrams; image for uploaded images. If a previous diagram edit returned post-edit inspection validationIssues with a targetId/diagramId, call mauth_make_diagram_for_question again with that diagramId so the existing diagram is replaced rather than appending another diagram.
- Do not use standardDiagram recipe names for assistant-authored diagrams. For Penrose geometry, native means supported Penrose Substance in graphConfig.options.substanceSource. Use the compact Penrose guidance from the selected Diagram Brain: declare objects such as Point, Line, Ray, Circle, and NamedSegment, then use predicates such as CircleThrough, OnCircle, Tangent, Segment, VectorSegment, RayFrom, ParallelToSegment, PerpendicularToSegment, EqualLength, LabelsSegment, LabelsAngle, and RightAngle. Structured graphConfig.data geometry is only for simple UI-driven controls; supported Substance is the normal AI geometry path. Visible diagram labels should match the question statement. Hide auxiliary construction points, such as a circle centre not named in the question, with Label centre $\\,$ and HidePoint(centre). Every predicate call must use parentheses and commas, for example `VectorSegment(OA, O, A)`; never write declaration-like predicate syntax such as `VectorSegment OA O A`. To label a point, write `Label A $A$` or `Label A $\\mathbf{{a}}$` directly on the existing point name; do not invent LabelsPoint. To label a segment, write `Label lenA $2\\ \\text{{units}}$` then `LabelsSegment(lenA, O, A)`; do not write `LabelSegment`. To draw a segment or vector, use `Segment(name, A, B)` or `VectorSegment(name, A, B)`, not `Connect(...)`. To draw a ray, use `RayFrom(rayA, O, A)`, not `Ray(rayA, O, A)`. To show collinearity, first declare the line with `Line lineName`, then use `LineThrough(lineName, A, B)` plus `On(P, lineName)` only when incidence is essential; do not invent `Collinear(...)`. To label an angle, always declare a label such as `Label angleCD $45^\\circ$`, then call `LabelsAngle(angleCD, C, O, D)`; never put raw TeX inside `LabelsAngle(...)` and never use a four-argument raw-label form. To draw a visible right-angle marker, use `RightAngle(B, O, C)`, not `PerpendicularToSegment`.
- Source scalar-product/vector-ray diagrams with magnitudes, angle markers, labelled rays, and no coordinate axes should use diagram.graphConfig.type = "vector2d" with showAxes:false, showGrid:false, showAxisLabels:false, and showAxisNumbers:false. This preserves source ray directions and avoids Penrose auto-layout moving the geometry. Use metadata.vector2d.vectors for each labelled ray with common start [0,0], source-faithful numeric components/directions, labelStyle:"custom", and labels such as "\\mathbf{{a}}". Use metadata.vector2d.segmentLabels for magnitudes such as "2\\ \\text{{units}}" and metadata.vector2d.angleMarkers for right-angle markers and labels such as "45^\\circ". Do not use network for these; network is for conceptual network/link diagrams only. Use geometricConstruction/Penrose only when the task is actually ruler-style theorem geometry, not a source ray/vector magnitude diagram. For a circle through named points, use a hidden centre plus `CircleThrough(omega, centre, A)` and `OnCircle(B, omega)`, `OnCircle(C, omega)`; do not call `CircleThrough(omega, A, B, C)`. In replaceQuestion/addDiagram diagrams, always wrap renderer payloads inside graphConfig; never put type/data/options directly on diagram and never use config as an alias.
- Preserve LaTeX backslashes exactly in all tool-call JSON strings. Write commands such as `\\ell`, `\\frac`, `\\angle`, and `\\sum` as escaped backslashes in JSON so the parsed document text contains real LaTeX commands, not control characters.
- For focused requests to add or write a worked solution for a named question, use mauth_write_solutions_for_questions when the supplied compact document summary includes that question's textPreview or enough module text to solve it. Do not inspect first merely to confirm ids, marks, or module counts already present in the summary. Inspect first only when the requested question text is missing or too truncated to solve correctly.
- For whole-test solution-key requests, use mauth_write_all_solutions after you have enough question text for every marked question, part, and subpart. It must include payload coverage for every marked scope, preserve diagrams, size studentSpaceLines generously, and use hidden [[marks:n]] annotations whose totals match each scope. After it succeeds, call mauth_check_document_layout with mode "solutions" and repair any returned solution-space or hidden-mark warnings before saying the solution key is complete.
- For broad layout or print-readiness checks, call mauth_check_document_layout with mode "both" or the requested mode. Do not treat returned warnings as done; repair page overflow, missing answer surfaces, solution-space mismatch, oversized diagrams, blank-page risks, and print-risk items with the narrow formatting/space/solution tool that owns the issue.
- In solutionText, put hidden mark ticks at the end of mark-worthy lines using [[marks:n]]. Mauth hides this annotation and renders n red check marks. Make the hidden mark total match the question/part marks. Do not write visible bracket notes such as [1 mark], (1 mark), "Solution (5 marks)", or "1 mark for..." in the displayed solution prose.
- Always call mauth_tool with this wrapper shape: {{"name":"<mauth tool name>","arguments":{{...}}}}. For low-level document action batches, use {{"name":"mauth.actions.preview","arguments":{{"actions":[...]}}}}.
- Put action batches, file paths, and tool-specific options inside the nested arguments object, not beside name.
- For focused requests to write, create, replace, or upsert one question through the wrapper, prefer mauth.question.upsert over low-level action batches. It can replace an existing question or append the next missing question. Supply questionNumber or questionId, marks, questionText, studentSpaceLines, and solutionText only when a solution is wanted.
- If a tool output reports malformed arguments or malformed actions, repair the same structured call once before explaining the failure.
- If a tool output includes validationIssues paths such as actions[0].blocks[0].lines or actions[0].patch, fix those exact action payload fields and retry once.
- Diagram action validation is renderer-specific. Prefer explicit structured graphConfig fields over invented renderer JSON, and repair the exact validationIssue paths if the tool rejects a diagram.
- Assistant commit preflight can also reject diagrams when inspection finds a wrong renderer, missing image source, missing scalar-product vector labels/angle markers, visible axes on no-axis scalar-product vector diagrams, or renderable Penrose circle geometry whose declared geometry does not match the question prompt. After a diagram tool commits, the frontend may also run mauth.preview.inspect and return post-edit inspection validationIssues before reporting success. If validationIssues mention a diagram targetId/diagramId, missing Tangent, ParallelToSegment, chord Segment, visible auxiliary labels, points not on the intended circle, missing vector labels, missing angle markers, or scalar-product vector2d axes, repair graphConfig.options.substanceSource, graphConfig.metadata.vector2d, graphConfig.showAxes/showGrid, or graphConfig.type and retry once on the same high-level diagram tool, preserving diagramId when supplied.
- If a file tool output includes validationIssues paths such as arguments.path, arguments.paths[0], arguments.content, or arguments.versionId, fix those exact file-tool fields and retry once.
- Do not show raw tool JSON, internal ids, provider payloads, or validation plumbing to the teacher unless they explicitly ask for implementation details.

Attachment contract:
- Current request attachments:
{attachment_text}
- If an attachment is present, inspect it directly and use it as source material for the teacher request. Screenshots/images may contain question text, diagrams, or formatting cues. PDFs may contain source exams or assessment pages. Word and text-like files are extracted to readable text before the provider call.
- For conversion from attached PDFs/screenshots/Word/text files, preserve original line breaks, inline-vs-display maths intent, diagrams, marks, and pagination when the teacher asks for fidelity. Keep the first pass focused if the teacher asks for only one question or one visible page.
- When the source shows "a)", "b)", "c)" or similar, convert them to structured parts whose text contains the visible part expression or instruction. If the source diagram belongs between the stem and the parts, put it in question-level diagram/diagrams and then emit parts underneath it; do not make empty parts.
- For source vector diagrams with only magnitudes, angles, and labelled rays from a common point, recreate the diagram as an editable native vector2d diagram with axes/grid hidden. Use vector components as source-faithful ray directions, metadata.vector2d.segmentLabels for magnitudes, and metadata.vector2d.angleMarkers for right-angle/angle labels. Use geometricConstruction/Penrose for theorem geometry, not for source ray diagrams where relative ray placement must match the screenshot.
- Do not claim you cannot see an attachment when the request includes one. If the content is unreadable, say exactly what was unclear and ask for a higher-resolution file only after attempting the relevant Mauth tool path.

Authoring quality bar:
- Write complete teacher-ready mathematics, not placeholders or planning notes.
- Include enough information for students to solve the problem. Include a concise worked solution only when requested or present in the source material.
- Mathematical validity is mandatory. Before calling a write/edit tool, internally check that every conclusion follows from the stated givens and that the solution does not assume information visible only in an imagined diagram.
- Never emit a proof question whose worked solution says the requested conclusion does not follow, cannot be proven, or proves a different conclusion. If your first draft is invalid, change the question statement before calling the tool.
- Preserve Mauth conventions: no typed automatic question labels, inline maths with $...$, display maths with $$...$$ only for standalone working, generous student space, and solution-only solution content. The app may raise studentSpaceLines to preserve solution fit. Do not use \\[...\\] or \\(...\\) delimiters.
- A student answer surface must keep the same layout in both copies. For sketch/label/table tasks, the solution copy should replace the blank student diagram/table with a completed solution diagram/table in the same document position, not add a separate solution below it.
- For multipart questions, use the structured parts array on mauth_question_upsert or mauth.question.upsert. Do not type visible "(a)", "(b)", or "(i)" labels into question text.
- For proof questions, make the given facts and required proof explicit. Do not state the desired result as a given. For geometry proofs, avoid proving lines parallel unless the equal/corresponding/alternate angle pair clearly uses the same transversal. Prefer robust theorem paths over clever but fragile constructions.
- For circle-geometry proof prompts involving tangents and angles subtended at the circumference, prefer a symbolic theorem/proof relationship. A robust default is to use the centre, radius perpendicular to tangent, equal radii, and the central-angle/angle-at-circumference relationship to prove the tangent-chord angle result. Do not add unnecessary numerical angle givens, and do not add parallel chords or parallel-line scaffolding unless the teacher explicitly asks for parallel lines.

Current compact document summary:
{summary_text}

Mauth rule-brain context:
{brain_text}
"""


def attachment_extension(name: str) -> str:
    lowered = name.lower()
    if "." not in lowered:
        return ""
    return f".{lowered.rsplit('.', 1)[-1]}"


def attachment_is_pdf(attachment: AssistantAttachment) -> bool:
    return (attachment.mimeType or "").lower() == "application/pdf" or attachment.name.lower().endswith(".pdf")


def attachment_is_docx(attachment: AssistantAttachment) -> bool:
    return (attachment.mimeType or "").lower() == DOCX_MIME_TYPE or attachment.name.lower().endswith(".docx")


def attachment_is_text_like(attachment: AssistantAttachment) -> bool:
    mime_type = (attachment.mimeType or "").lower()
    return (
        mime_type.startswith("text/")
        or mime_type in {"application/json", "application/xml", "text/csv"}
        or attachment_extension(attachment.name) in TEXT_ATTACHMENT_EXTENSIONS
    )


def attachment_data_bytes(data_url: str) -> bytes:
    text = data_url.strip()
    if not text:
        return b""
    if not text.lower().startswith("data:"):
        with suppress(binascii.Error, ValueError):
            return base64.b64decode(text, validate=False)
        return text.encode("utf-8", errors="replace")
    metadata, _, payload = text.partition(",")
    if not payload:
        return b""
    if ";base64" in metadata.lower():
        with suppress(binascii.Error, ValueError):
            return base64.b64decode(payload, validate=False)
        return b""
    return urllib.parse.unquote_to_bytes(payload)


def xml_local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1] if "}" in tag else tag


def docx_node_text(node: ElementTree.Element) -> str:
    parts: list[str] = []
    for descendant in node.iter():
        local = xml_local_name(descendant.tag)
        if local == "t" and descendant.text:
            parts.append(descendant.text)
        elif local in {"tab"}:
            parts.append("\t")
        elif local in {"br", "cr"}:
            parts.append("\n")
    return "".join(parts)


def extract_docx_text(data: bytes) -> str:
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            xml_bytes = archive.read("word/document.xml")
    except (KeyError, OSError, zipfile.BadZipFile):
        return ""

    with suppress(ElementTree.ParseError):
        root = ElementTree.fromstring(xml_bytes)
        lines: list[str] = []
        for child in root.iter():
            if xml_local_name(child.tag) == "body":
                for block in list(child):
                    local = xml_local_name(block.tag)
                    if local == "p":
                        text = docx_node_text(block).strip()
                        if text:
                            lines.append(text)
                    elif local == "tbl":
                        for row in [item for item in block.iter() if xml_local_name(item.tag) == "tr"]:
                            cells = [
                                docx_node_text(cell).strip()
                                for cell in row
                                if xml_local_name(cell.tag) == "tc" and docx_node_text(cell).strip()
                            ]
                            if cells:
                                lines.append("\t".join(cells))
                break
        return "\n".join(lines)
    return ""


def extract_attachment_text(attachment: AssistantAttachment) -> str:
    data = attachment_data_bytes(attachment.dataUrl)
    if not data:
        return ""
    if attachment_is_docx(attachment):
        return extract_docx_text(data)
    if attachment_is_text_like(attachment):
        return data.decode("utf-8", errors="replace")
    return ""


def attachment_content_items(attachments: list[AssistantAttachment]) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    for attachment in attachments[:MAX_ASSISTANT_ATTACHMENTS]:
        name = attachment.name or "attachment"
        mime_type = attachment.mimeType or ""
        data_url = attachment.dataUrl.strip()
        if not data_url:
            continue
        if len(data_url) > MAX_ASSISTANT_ATTACHMENT_DATA_CHARS:
            items.append(
                {
                    "type": "input_text",
                    "text": f"Attachment omitted because it is too large for this assistant request: {name}.",
                }
            )
            continue
        items.append({"type": "input_text", "text": f"Attached file: {name} ({mime_type or 'unknown type'})."})
        if mime_type.startswith("image/"):
            items.append({"type": "input_image", "image_url": data_url, "detail": "auto"})
        elif attachment_is_pdf(attachment):
            items.append({"type": "input_file", "filename": name, "file_data": data_url})
        elif attachment_is_docx(attachment) or attachment_is_text_like(attachment):
            extracted_text = extract_attachment_text(attachment).strip()
            if extracted_text:
                clipped_text = extracted_text[:MAX_ASSISTANT_EXTRACTED_TEXT_CHARS]
                omitted = len(extracted_text) - len(clipped_text)
                suffix = f"\n\n[Omitted {omitted:,} characters from {name}.]" if omitted > 0 else ""
                items.append(
                    {
                        "type": "input_text",
                        "text": f"Extracted text from {name}:\n\n{clipped_text}{suffix}",
                    }
                )
            else:
                items.append(
                    {"type": "input_text", "text": f"Could not extract readable text from attachment: {name}."}
                )
        else:
            items.append({"type": "input_text", "text": f"Unsupported attachment type omitted: {name}."})
    if len(attachments) > MAX_ASSISTANT_ATTACHMENTS:
        items.append(
            {
                "type": "input_text",
                "text": f"{len(attachments) - MAX_ASSISTANT_ATTACHMENTS} additional attachment(s) omitted by the assistant request limit.",
            }
        )
    return items


def input_items(request: AssistantChatRequest) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    attachments = request.attachments or []
    request_messages = (
        request.messages
        if request.previousResponseId or request.toolOutputs
        else latest_user_messages(request.messages) or request.messages
    )
    user_message_indexes = [index for index, message in enumerate(request_messages) if message.role == "user"]
    attachment_message_index = user_message_indexes[-1] if user_message_indexes else None
    for index, message in enumerate(request_messages):
        if attachments and index == attachment_message_index:
            content = [
                {"type": "input_text", "text": message.content or "Use the attached file(s)."},
                *attachment_content_items(attachments),
            ]
            items.append({"role": message.role, "content": content})
        else:
            items.append({"role": message.role, "content": message.content})
    if attachments and attachment_message_index is None:
        items.append(
            {
                "role": "user",
                "content": [
                    {"type": "input_text", "text": "Use the attached file(s)."},
                    *attachment_content_items(attachments),
                ],
            }
        )
    for tool_output in request.toolOutputs:
        output = (
            tool_output.output
            if isinstance(tool_output.output, str)
            else json.dumps(tool_output.output, ensure_ascii=False)
        )
        if request.previousResponseId:
            items.append(
                {
                    "type": "function_call_output",
                    "call_id": tool_output.callId,
                    "output": output,
                }
            )
        else:
            tool_name = tool_output.name or "Mauth tool"
            items.append(
                {
                    "role": "user",
                    "content": (
                        f"{tool_name} completed outside the provider response chain. "
                        "Use this tool output to decide the next Mauth action or final reply:\n"
                        f"{output}"
                    ),
                }
            )
    return items


def response_text(response: dict[str, Any]) -> str:
    output_text = response.get("output_text")
    if isinstance(output_text, str):
        return output_text

    chunks: list[str] = []
    for item in response.get("output", []):
        if not isinstance(item, dict) or item.get("type") != "message":
            continue
        for content in item.get("content", []):
            if not isinstance(content, dict):
                continue
            text = content.get("text")
            if isinstance(text, str):
                chunks.append(text)
    return "\n".join(chunks).strip()


LATEX_CONTROL_CHARACTER_REPAIRS = {
    "\x07": "\\a",
    "\x08": "\\b",
    "\x09": "\\t",
    "\x0b": "\\v",
    "\x0c": "\\f",
    "\x0d": "\\r",
    "\x13": "\\",
    "\x1b": "\\",
}


def repair_latex_control_characters(value: Any) -> Any:
    if isinstance(value, str):
        repaired = value
        for control_character, replacement in LATEX_CONTROL_CHARACTER_REPAIRS.items():
            repaired = repaired.replace(control_character, replacement)
        return repaired
    if isinstance(value, list):
        return [repair_latex_control_characters(item) for item in value]
    if isinstance(value, dict):
        return {key: repair_latex_control_characters(item) for key, item in value.items()}
    return value


def parse_tool_arguments(raw_arguments: Any) -> dict[str, Any]:
    if isinstance(raw_arguments, dict):
        return repair_latex_control_characters(raw_arguments)
    if isinstance(raw_arguments, str) and raw_arguments.strip():
        try:
            parsed = json.loads(raw_arguments)
        except json.JSONDecodeError as error:
            return {
                "_parseError": "Tool arguments were not valid JSON.",
                "_parseErrorDetail": str(error),
                "_raw": raw_arguments[:1000],
            }
        if isinstance(parsed, dict):
            return repair_latex_control_characters(parsed)
        return {
            "_parseError": "Tool arguments JSON must be an object.",
            "_raw": raw_arguments[:1000],
        }
    return {}


def parse_nested_tool_arguments(raw_arguments: Any, mauth_tool_name: str | None = None) -> dict[str, Any]:
    if isinstance(raw_arguments, dict):
        return repair_latex_control_characters(raw_arguments)
    if isinstance(raw_arguments, list) and mauth_tool_name and mauth_tool_name.startswith("mauth.actions."):
        return repair_latex_control_characters({"actions": raw_arguments})
    if isinstance(raw_arguments, str) and raw_arguments.strip():
        parsed = parse_tool_arguments(raw_arguments)
        if "_parseError" in parsed:
            return parsed
        if parsed:
            return parsed
    return {}


def mauth_arguments_from_tool_arguments(arguments: dict[str, Any], mauth_tool_name: str | None) -> dict[str, Any]:
    explicit_arguments = arguments.get("arguments")
    if explicit_arguments is not None:
        return parse_nested_tool_arguments(explicit_arguments, mauth_tool_name)

    # Provider output occasionally omits the nested `arguments` wrapper and places
    # action/file arguments beside the tool name. Preserve those keys instead of
    # turning the call into an empty tool invocation.
    fallback_arguments = {key: value for key, value in arguments.items() if key not in {"name", "tool"}}
    return repair_latex_control_characters(fallback_arguments) if fallback_arguments else {}


def tool_calls(response: dict[str, Any]) -> list[dict[str, Any]]:
    calls: list[dict[str, Any]] = []
    for item in response.get("output", []):
        if not isinstance(item, dict) or item.get("type") != "function_call":
            continue
        provider_tool_name = item.get("name") if isinstance(item.get("name"), str) else ""
        arguments = parse_tool_arguments(item.get("arguments"))
        direct_mauth_tool_name = DIRECT_MAUTH_TOOL_NAME_MAP.get(provider_tool_name)
        mauth_tool_name = direct_mauth_tool_name or (
            arguments.get("name") if isinstance(arguments.get("name"), str) else None
        )
        call_id = item.get("call_id") if isinstance(item.get("call_id"), str) else None
        if call_id is None:
            call_id = item.get("id") if isinstance(item.get("id"), str) else ""
        calls.append(
            {
                "id": item.get("id") if isinstance(item.get("id"), str) else None,
                "callId": call_id,
                "name": provider_tool_name,
                "arguments": arguments,
                "mauthToolName": mauth_tool_name,
                "mauthArguments": arguments
                if direct_mauth_tool_name
                else mauth_arguments_from_tool_arguments(arguments, mauth_tool_name),
            }
        )
    return calls


def zero_token_usage_summary(model: str, *, source: str) -> dict[str, Any]:
    return {
        "model": model,
        "inputTokens": 0,
        "cachedInputTokens": 0,
        "billableInputTokens": 0,
        "outputTokens": 0,
        "totalTokens": 0,
        "estimatedCostUsd": 0.0,
        "pricingSource": source,
    }


def direct_layout_check_response(model: str) -> dict[str, Any]:
    arguments = {"mode": "both"}
    return {
        "configured": True,
        "model": model,
        "message": "Checking the document layout.",
        "responseId": None,
        "toolCalls": [
            {
                "id": "local-layout-check",
                "callId": "local-layout-check",
                "name": "mauth_check_document_layout",
                "arguments": arguments,
                "mauthToolName": "mauth.layout.check",
                "mauthArguments": arguments,
            }
        ],
        "usage": zero_token_usage_summary(model, source="native Mauth routing; no OpenAI tokens used"),
        "error": None,
    }


def direct_clarification_response(model: str, question: str) -> dict[str, Any]:
    return {
        "configured": True,
        "model": model,
        "message": question,
        "responseId": None,
        "toolCalls": [],
        "usage": zero_token_usage_summary(model, source="native Mauth intent clarification; no OpenAI tokens used"),
        "error": None,
    }


def should_use_direct_layout_check(request: AssistantChatRequest) -> bool:
    if request.previousResponseId or request.toolOutputs or request.attachments:
        return False
    return asks_for_layout_check_text(current_request_text(request.messages))


def direct_clarification_question(request: AssistantChatRequest) -> str | None:
    if request.previousResponseId or request.toolOutputs:
        return None
    current_messages = latest_user_messages(request.messages)
    compact_summary = compact_document_summary(request.documentSummary, current_messages)
    intent = classify_request_intent(compact_summary, current_messages, request.attachments)
    if intent.kind == "clarify" and intent.clarification_question:
        return intent.clarification_question
    return None


async def create_assistant_response(request: AssistantChatRequest) -> dict[str, Any]:
    model = request.model or assistant_model()
    if not assistant_configured():
        return {
            "configured": False,
            "model": model,
            "message": "Assistant provider is not configured. Add OPENAI_API_KEY to .env or your API environment, then restart the API.",
            "responseId": None,
            "toolCalls": [],
            "usage": None,
            "error": "OPENAI_API_KEY is missing.",
        }

    if should_use_direct_layout_check(request):
        return direct_layout_check_response(model)

    clarification_question = direct_clarification_question(request)
    if clarification_question:
        return direct_clarification_response(model, clarification_question)

    async with httpx.AsyncClient(timeout=httpx.Timeout(180.0, connect=20.0)) as client:
        selected_brain_files, planner_usage = await select_brain_files_for_request(
            client,
            messages=request.messages,
            tool_outputs=request.toolOutputs,
            document_summary=request.documentSummary,
            attachments=request.attachments,
        )
        payload: dict[str, Any] = {
            "model": model,
            "instructions": assistant_instructions(
                request.documentSummary,
                request.messages,
                request.toolOutputs,
                selected_brain_files,
                request.attachments,
            ),
            "input": input_items(request),
            "tools": assistant_tool_definitions(
                request.messages,
                request.toolOutputs,
                request.attachments,
                request.documentSummary,
            ),
            "parallel_tool_calls": False,
        }
        if request.previousResponseId:
            payload["previous_response_id"] = request.previousResponseId

        response = await client.post(
            OPENAI_RESPONSES_URL,
            headers={
                "Authorization": f"Bearer {os.environ['OPENAI_API_KEY']}",
                "Content-Type": "application/json",
            },
            json=payload,
        )
        response.raise_for_status()
        data = response.json()
    usage = merge_usage_summaries(planner_usage, assistant_usage_summary(data, model))

    return {
        "configured": True,
        "model": model,
        "message": response_text(data),
        "responseId": data.get("id") if isinstance(data.get("id"), str) else None,
        "toolCalls": tool_calls(data),
        "usage": usage,
        "error": None,
    }
