import json
import os
import re
from contextlib import suppress
from typing import Any

import httpx

from app.bootstrap import CONFIG_ROOT
from app.models.schemas import AssistantChatMessage, AssistantChatRequest, AssistantToolOutput

OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses"
DEFAULT_ASSISTANT_MODEL = "gpt-5.4-mini"
DEFAULT_BRAIN_PLANNER_MODEL = "gpt-5.4-mini"
DEFAULT_BRAIN_CONTEXT_CHARS = 12000
DEFAULT_DOCUMENT_CONTEXT_CHARS = 8000
TOKENS_PER_MILLION = 1_000_000
QUESTION_REFERENCE_PATTERN = re.compile(r"\b(?:q|question)\s*(\d{1,3})\b", re.IGNORECASE)
DIRECT_MAUTH_TOOL_NAME_MAP = {
    "mauth_author_replace_question": "mauth.author.replaceQuestion",
    "mauth_author_add_diagram": "mauth.author.addDiagram",
    "mauth_author_ensure_solutions": "mauth.author.ensureSolutions",
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
    "mauth.validation.run",
    "mauth.actions.preview",
    "mauth.actions.apply",
    "mauth.author.replaceQuestion",
    "mauth.author.addDiagram",
    "mauth.author.ensureSolutions",
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
    messages: list[AssistantChatMessage] | None = None, tool_outputs: list[AssistantToolOutput] | None = None
) -> str:
    parts = [message.content for message in messages or []]
    parts.extend(str(tool_output.name or "") for tool_output in tool_outputs or [])
    return "\n".join(parts).lower()


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
    messages: list[AssistantChatMessage] | None = None, tool_outputs: list[AssistantToolOutput] | None = None
) -> list[str]:
    text = request_text(messages, tool_outputs)
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
        for term in ("diagram", "graph", "chart", "circle", "tangent", "venn", "vector", "axis", "axes", "plot")
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

    return files


def assistant_brain_context(
    messages: list[AssistantChatMessage] | None = None,
    tool_outputs: list[AssistantToolOutput] | None = None,
    brain_files: list[str] | None = None,
) -> str:
    limit = assistant_brain_context_limit()
    if limit <= 0:
        return "Brain context disabled."

    brain_dir = CONFIG_ROOT / "ai-brains"
    brain_files = brain_files or brain_files_for_request(messages, tool_outputs)
    text = request_text(messages, tool_outputs)
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
- Include solutions when the request asks for worked solutions, marking keys, answer keys, or solution-space repair.
- Include diagram when the request asks for diagrams, graphs, charts, axes, Venn diagrams, vectors, Penrose geometry, uploaded images, or renderer repair.
- Include formatting when the request asks for title pages, spacing, layout, print/PDF, pagination, exam templates, page breaks, or visual polish.
- Select the fewest packs that can do the job correctly.

Call mauth_select_brains exactly once."""


def brain_selection_input(
    messages: list[AssistantChatMessage] | None,
    document_summary: dict[str, Any] | None,
) -> list[dict[str, Any]]:
    compact_summary = compact_document_summary(document_summary, messages)
    summary_limit = min(assistant_document_context_limit(), 2500)
    summary_text = (
        json.dumps(compact_summary, ensure_ascii=False)[:summary_limit]
        if compact_summary and summary_limit > 0
        else "No document summary supplied."
    )
    prompt_text = "\n".join(f"{message.role}: {message.content}" for message in messages or [])
    return [
        {
            "role": "user",
            "content": json.dumps(
                {
                    "teacherPromptAndRecentChat": prompt_text[-3000:],
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
) -> tuple[list[str], dict[str, Any] | None]:
    fallback_files = brain_files_for_request(messages, tool_outputs)
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
                "input": brain_selection_input(messages, document_summary),
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
) -> str:
    text = request_text(messages)
    asks_for_marking_edit = any(
        term in text
        for term in (
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
    )
    asks_to_write_question = any(
        term in text for term in ("write question", "replace question", "make question", "create question")
    )
    question_numbers = question_numbers_from_request(messages)
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

    question_number = sorted(question_numbers)[0] if question_numbers else 1
    has_question_text = bool(selected_question and question_summary_has_text(selected_question))
    combined_text = f"{text}\n{question_summary_text(selected_question)}"

    if asks_to_write_question:
        return (
            "Focused tool routing hint: this is a one-question authoring request. Your first tool call should be "
            f"mauth_author_replace_question for Question {question_number}, with marks, questionText, studentSpaceLines, "
            "and solutionText when a solution is requested. Omit diagram fields to preserve existing diagrams; use "
            "diagrams: [] only when explicitly removing diagrams."
        )
    if (
        any(term in text for term in ("solution", "worked", "answer key", "marking key")) or asks_for_marking_edit
    ) and has_question_text:
        return (
            "Focused tool routing hint: this is a solution/mark-allocation request and the compact summary already includes enough "
            f"Question {question_number} text. Your first tool call should be mauth_author_ensure_solutions with "
            f'{{"questions":[{{"questionNumber":{question_number},"marks":4,"studentSpaceLines":8,"solutionText":"... [[marks:1]]"}}]}} '
            "when changing solution ticks or worked solution text. Use hidden [[marks:n]] annotations only; do not show visible "
            "[1 mark] notes. Do not use mauth_author_replace_question for a mark allocation tweak, because it replaces the "
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
            f"should be mauth_author_add_diagram for Question {question_number} with placement beforeStudentSpace "
            'and diagram.graphConfig.type="geometricConstruction". For Penrose geometry, write supported Penrose '
            f"Substance in graphConfig.options.substanceSource using predicates such as {penrose_predicates}. "
            "For a line parallel to chord BC, use ParallelToSegment(lineName, B, C). Match visible labels to the "
            "question statement; any auxiliary centre point should be hidden with Label centre $\\,$ and HidePoint(centre). "
            "The tangent line must be constrained with Tangent(lineName, circleName, A), so it touches the circle only at A. "
            "Do not use standardDiagram recipe names; choose the renderer and emit a real graphConfig."
        )
    return "No focused high-level tool hint."


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


def mauth_author_replace_question_tool_definition() -> dict[str, Any]:
    return {
        "type": "function",
        "name": "mauth_author_replace_question",
        "description": (
            "Replace one existing Mauth question with high-quality teacher-ready question content. "
            "Use for focused requests like writing or replacing one question. Do not use this for mark-allocation "
            "or solution-only tweaks. This is cheaper and more reliable than low-level module action batches."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "questionNumber": {
                    "type": "integer",
                    "minimum": 1,
                    "description": "1-based question number to replace.",
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
                        "Keep source-style line breaks where useful."
                    ),
                },
                "studentSpaceLines": {
                    "type": "integer",
                    "minimum": 1,
                    "maximum": 40,
                    "description": (
                        "Generous student answer/work space lines. The app may raise this to the mark-based or "
                        "solution-fit minimum, so do not use small values to force compact layout."
                    ),
                },
                "solutionText": {
                    "type": "string",
                    "description": (
                        "Concise worked solution in Mauthdown/MathJax. Start with a real solution, not placeholders; "
                        "the app will add the Solution heading if omitted. Put hidden [[marks:n]] annotations at the "
                        "end of mark-worthy lines so the solution copy renders red check marks; the total hidden "
                        "marks should match the item marks. Do not write visible [1 mark], (1 mark), or "
                        "'1 mark for ...' notes."
                    ),
                },
                "includeSolution": {
                    "type": "boolean",
                    "description": "Set false only when the teacher explicitly asks for no solution.",
                },
                "diagram": {
                    "type": "object",
                    "description": (
                        "Optional existing Mauth diagram block: { graphConfig, diagramAlign }. "
                        "Omit to preserve existing diagrams. Supply a valid supported graphConfig only when adding or "
                        "replacing the question's diagrams."
                    ),
                    "additionalProperties": True,
                },
                "diagrams": {
                    "type": "array",
                    "description": "Optional list of replacement Mauth diagram blocks. Use [] only when intentionally removing all existing diagrams.",
                    "items": {"type": "object", "additionalProperties": True},
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
                        "Each part can have text, marks, studentSpaceLines, solutionText, and optional diagram/diagrams."
                    ),
                    "items": {
                        "type": "object",
                        "properties": {
                            "label": {
                                "type": "string",
                                "description": "Part label such as a, b, or c. Omit to auto-label.",
                            },
                            "text": {"type": "string", "description": "Part prompt text without a typed '(a)' label."},
                            "marks": {"type": "integer", "minimum": 0, "maximum": 100},
                            "studentSpaceLines": {
                                "type": "integer",
                                "minimum": 1,
                                "maximum": 40,
                                "description": "Generous part answer/work space; the app may raise this to fit the solution.",
                            },
                            "solutionText": {
                                "type": "string",
                                "description": (
                                    "Worked solution for this part. End mark-worthy lines with hidden [[marks:n]] tick "
                                    "annotations and make the hidden mark total match this part's marks."
                                ),
                            },
                            "includeSolution": {"type": "boolean"},
                            "diagram": {"type": "object", "additionalProperties": True},
                            "diagrams": {
                                "type": "array",
                                "description": "Optional replacement diagrams for this part. Omit to leave existing diagram decisions alone.",
                                "items": {"type": "object", "additionalProperties": True},
                            },
                            "pageBreakBefore": {"type": "boolean"},
                        },
                        "required": ["text", "marks", "studentSpaceLines"],
                        "additionalProperties": False,
                    },
                },
            },
            "required": ["questionNumber", "marks", "questionText", "studentSpaceLines"],
            "additionalProperties": False,
        },
    }


def mauth_author_add_diagram_tool_definition() -> dict[str, Any]:
    return {
        "type": "function",
        "name": "mauth_author_add_diagram",
        "description": (
            "Add a teacher-ready diagram to one existing question. Use for focused follow-ups like "
            "'include/add the diagram in question 1'. Choose the correct Mauth renderer and provide a real graphConfig. "
            "Use geometricConstruction/Penrose for schematic geometry and theorem diagrams; graph2d for coordinate/function "
            "graphs; vector2d for coordinate vectors; statsChart for statistical charts; setDiagram for Venn/set diagrams; "
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
                "diagram": {
                    "type": "object",
                    "description": (
                        "Mauth diagram block. Provide { graphConfig, diagramAlign? }. For Penrose geometry, use "
                        '{ "graphConfig": { "type":"geometricConstruction", "options": { "substanceSource": '
                        '"Point A, B\\nCircle omega\\n..." } } }. Write supported Mauth Penrose Substance directly. '
                        "For tangent-parallel-chord diagrams, use predicates such as CircleThrough, OnCircle, "
                        "Tangent, Segment, and ParallelToSegment. Do not visibly label auxiliary centre points "
                        "unless the question names them."
                    ),
                    "properties": {
                        "diagramAlign": {"type": "string", "enum": ["left", "center", "right"]},
                        "graphConfig": {
                            "type": "object",
                            "properties": {
                                "type": {
                                    "type": "string",
                                    "enum": [
                                        "graph2d",
                                        "vector2d",
                                        "graph3d",
                                        "image",
                                        "geometricConstruction",
                                        "vectorRelationship",
                                        "setDiagram",
                                        "statsChart",
                                    ],
                                }
                            },
                            "required": ["type"],
                            "additionalProperties": True,
                        },
                    },
                    "required": ["graphConfig"],
                    "additionalProperties": True,
                },
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
                                    },
                                    "required": ["solutionText"],
                                    "additionalProperties": False,
                                },
                            },
                        },
                        "required": ["solutionText"],
                        "additionalProperties": False,
                    },
                }
            },
            "required": ["questions"],
            "additionalProperties": False,
        },
    }


def assistant_tool_definitions(
    messages: list[AssistantChatMessage] | None = None,
    tool_outputs: list[AssistantToolOutput] | None = None,
) -> list[dict[str, Any]]:
    text = request_text(messages, tool_outputs)
    question_numbers = question_numbers_from_request(messages)
    has_specific_question = bool(question_numbers) or "current question" in text or "selected question" in text
    asks_for_diagram = any(term in text for term in ("diagram", "graph", "draw", "sketch"))
    asks_to_add = any(term in text for term in ("add", "include", "insert", "put", "place", "draw", "sketch"))
    asks_for_solution = any(term in text for term in ("solution", "worked", "answer key", "marking key"))
    asks_for_marking_edit = any(
        term in text
        for term in (
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
    )
    asks_to_write_question = any(
        term in text for term in ("write question", "replace question", "make question", "create question")
    )
    file_only_terms = ("open file", "save file", "rename file", "delete file", "move file", "folder", "files")

    # Focused single-question requests should expose the narrow direct tool only.
    # This materially reduces provider input tokens and discourages tool-loop drift.
    if has_specific_question and asks_to_write_question:
        return [mauth_author_replace_question_tool_definition()]
    if has_specific_question and asks_for_diagram and asks_to_add:
        return [mauth_author_add_diagram_tool_definition()]
    if has_specific_question and (asks_for_solution or asks_for_marking_edit):
        return [mauth_author_ensure_solutions_tool_definition(), mauth_tool_definition()]
    if any(term in text for term in file_only_terms) and not any(
        term in text for term in ("question", "solution", "diagram", "format", "layout", "exam")
    ):
        return [mauth_tool_definition()]

    return [
        mauth_author_replace_question_tool_definition(),
        mauth_author_add_diagram_tool_definition(),
        mauth_author_ensure_solutions_tool_definition(),
        mauth_tool_definition(),
    ]


def assistant_instructions(
    document_summary: dict[str, Any] | None = None,
    messages: list[AssistantChatMessage] | None = None,
    tool_outputs: list[AssistantToolOutput] | None = None,
    selected_brain_files: list[str] | None = None,
) -> str:
    compact_summary = compact_document_summary(document_summary, messages)
    summary_limit = assistant_document_context_limit()
    summary_text = (
        json.dumps(compact_summary, ensure_ascii=False)[:summary_limit]
        if compact_summary and summary_limit > 0
        else "No document summary supplied."
    )
    brain_text = assistant_brain_context(messages, tool_outputs, selected_brain_files)
    tool_hint = focused_tool_hint(compact_summary, messages)
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
- For focused requests to write or replace one existing question, use the direct mauth_author_replace_question tool. Do not call mauth.document.inspect first if the supplied document summary already tells you the question number exists.
- For focused mark-allocation, tick, QED-mark, or solution-only edits, do not use mauth_author_replace_question. Use mauth_author_ensure_solutions with updated marks and revised solutionText when changing the worked solution, or mauth_tool with low-level question.update/module.update actions for marks-only edits. Preserve existing diagrams unless the teacher explicitly asks to remove or replace them.
- In mauth_author_replace_question, omitted diagram and diagrams fields preserve existing diagrams. Use diagrams: [] or preserveExistingDiagrams: false only when the teacher explicitly asks to remove diagrams.
- For focused follow-ups that only ask to add/include a diagram in one existing question, use mauth_author_add_diagram with a real diagram.graphConfig. Choose the renderer first: geometricConstruction/Penrose for schematic geometry, circle theorem, tangent, parallel, perpendicular, construction, and relationship diagrams; graph2d for coordinate/function graphs; vector2d for coordinate vectors; statsChart for histograms/columns/distributions; setDiagram for Venn/set diagrams; graph3d for 3D diagrams; image for uploaded images.
- Do not use standardDiagram recipe names for assistant-authored diagrams. For Penrose geometry, native means supported Penrose Substance in graphConfig.options.substanceSource. Use the compact Penrose guidance from the selected Diagram Brain: declare objects such as Point, Line, Ray, Circle, and NamedSegment, then use predicates such as CircleThrough, OnCircle, Tangent, Segment, ParallelToSegment, PerpendicularToSegment, EqualLength, and LabelsAngle. Structured graphConfig.data geometry is only for simple UI-driven controls; supported Substance is the normal AI geometry path. Visible diagram labels should match the question statement. Hide auxiliary construction points, such as a circle centre not named in the question, with Label centre $\\,$ and HidePoint(centre).
- For focused requests to add or write a worked solution for a named question, use mauth_author_ensure_solutions when the supplied compact document summary includes that question's textPreview or enough module text to solve it. Do not inspect first merely to confirm ids, marks, or module counts already present in the summary. Inspect first only when the requested question text is missing or too truncated to solve correctly.
- In solutionText, put hidden mark ticks at the end of mark-worthy lines using [[marks:n]]. Mauth hides this annotation and renders n red check marks. Make the hidden mark total match the question/part marks. Do not write visible bracket notes such as [1 mark], (1 mark), "Solution (5 marks)", or "1 mark for..." in the displayed solution prose.
- Always call mauth_tool with this wrapper shape: {{"name":"<mauth tool name>","arguments":{{...}}}}. For low-level document action batches, use {{"name":"mauth.actions.preview","arguments":{{"actions":[...]}}}}.
- Put action batches, file paths, and tool-specific options inside the nested arguments object, not beside name.
- For focused requests to write or replace one existing question through the wrapper, prefer mauth.author.replaceQuestion over low-level action batches. Supply questionNumber or questionId, marks, questionText, studentSpaceLines, and solutionText when a solution is wanted.
- If a tool output reports malformed arguments or malformed actions, repair the same structured call once before explaining the failure.
- If a tool output includes validationIssues paths such as actions[0].blocks[0].lines or actions[0].patch, fix those exact action payload fields and retry once.
- Diagram action validation is renderer-specific. Prefer explicit structured graphConfig fields over invented renderer JSON, and repair the exact validationIssue paths if the tool rejects a diagram.
- If a file tool output includes validationIssues paths such as arguments.path, arguments.paths[0], arguments.content, or arguments.versionId, fix those exact file-tool fields and retry once.
- Do not show raw tool JSON, internal ids, provider payloads, or validation plumbing to the teacher unless they explicitly ask for implementation details.

Authoring quality bar:
- Write complete teacher-ready mathematics, not placeholders or planning notes.
- Include enough information for students to solve the problem and a concise worked solution when requested.
- Mathematical validity is mandatory. Before calling a write/edit tool, internally check that every conclusion follows from the stated givens and that the solution does not assume information visible only in an imagined diagram.
- Never emit a proof question whose worked solution says the requested conclusion does not follow, cannot be proven, or proves a different conclusion. If your first draft is invalid, change the question statement before calling the tool.
- Preserve Mauth conventions: no typed automatic question labels, inline maths with $...$, display maths with $$...$$ only for standalone working, generous student space, and solution-only solution content. The app may raise studentSpaceLines to preserve solution fit. Do not use \[...\] or \(...\) delimiters.
- For multipart questions, use the structured parts array on mauth_author_replace_question or mauth.author.replaceQuestion. Do not type visible "(a)", "(b)", or "(i)" labels into question text.
- For proof questions, make the given facts and required proof explicit. Do not state the desired result as a given. For geometry proofs, avoid proving lines parallel unless the equal/corresponding/alternate angle pair clearly uses the same transversal. Prefer robust theorem paths over clever but fragile constructions.
- For circle-geometry proof prompts involving tangents and angles subtended at the circumference, prefer a symbolic theorem/proof relationship. Do not add unnecessary numerical angle givens or make the task only a one-step substitution into the tangent-chord theorem unless the teacher explicitly asks for a numerical angle question.

Current compact document summary:
{summary_text}

Mauth rule-brain context:
{brain_text}
"""


def input_items(request: AssistantChatRequest) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    for message in request.messages:
        items.append({"role": message.role, "content": message.content})
    for tool_output in request.toolOutputs:
        output = (
            tool_output.output
            if isinstance(tool_output.output, str)
            else json.dumps(tool_output.output, ensure_ascii=False)
        )
        items.append(
            {
                "type": "function_call_output",
                "call_id": tool_output.callId,
                "output": output,
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

    async with httpx.AsyncClient(timeout=60) as client:
        selected_brain_files, planner_usage = await select_brain_files_for_request(
            client,
            messages=request.messages,
            tool_outputs=request.toolOutputs,
            document_summary=request.documentSummary,
        )
        payload: dict[str, Any] = {
            "model": model,
            "instructions": assistant_instructions(
                request.documentSummary,
                request.messages,
                request.toolOutputs,
                selected_brain_files,
            ),
            "input": input_items(request),
            "tools": assistant_tool_definitions(request.messages, request.toolOutputs),
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
