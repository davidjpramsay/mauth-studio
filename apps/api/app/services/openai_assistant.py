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
from PIL import Image, ImageChops, ImageOps, UnidentifiedImageError

from app.bootstrap import CONFIG_ROOT
from app.models.schemas import AssistantAttachment, AssistantChatMessage, AssistantChatRequest, AssistantToolOutput

OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses"
DEFAULT_ASSISTANT_MODEL = "gpt-5.4-mini"
DEFAULT_BRAIN_PLANNER_MODEL = "gpt-5.4-mini"
DEFAULT_BRAIN_CONTEXT_CHARS = 12000
SOURCE_CONVERSION_BRAIN_CONTEXT_CHARS = 18000
DEFAULT_DOCUMENT_CONTEXT_CHARS = 8000
MAX_ASSISTANT_ATTACHMENTS = 6
MAX_ASSISTANT_ATTACHMENT_DATA_CHARS = 18_000_000
MAX_ASSISTANT_EXTRACTED_TEXT_CHARS = 80_000
DEFAULT_ASSISTANT_IMAGE_DETAIL = "high"
DEFAULT_ASSISTANT_IMAGE_MAX_LONG_EDGE = 1000
DEFAULT_ASSISTANT_IMAGE_WEBP_QUALITY = 82
DEFAULT_ASSISTANT_IMAGE_OPTIMIZE_MIN_BYTES = 20_000
DEFAULT_ASSISTANT_IMAGE_TRIM_BACKGROUND_THRESHOLD = 18
DEFAULT_ASSISTANT_IMAGE_TRIM_PADDING_PX = 24
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
SOLUTION_FOR_QUESTION_PATTERN = re.compile(
    r"\b(?:write|add|create|make|generate|replace|update)\b[\s\S]{0,80}\b(?:worked\s+)?solutions?\b"
    r"[\s\S]{0,80}\b(?:for|to|of|in)\s+(?:q|question)\b",
    re.IGNORECASE,
)
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
ASSISTANT_HELP_REQUEST_TERMS = (
    "what can this assistant do",
    "what can you do",
    "how do i use the assistant",
    "how do i use this assistant",
    "assistant help",
    "help using the assistant",
    "what are your tools",
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
QUESTION_PAYLOAD_REPAIR_TERMS = (
    "actions[0].question",
    ".question.contentblocks",
    "arguments.question.contentblocks",
    "graphconfig.metadata.vector2d",
    "metadata.vector2d.vectors",
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
QUESTION_AUTHORING_TOOL_NAMES = {"mauth.question.upsert", "mauth.author.replaceQuestion"}
GRAPH3D_VIEW_KEYS = ("az", "el", "bank")

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


def ordered_supported_diagram_types(values: list[str] | None = None) -> list[str]:
    allowed = set(values or SUPPORTED_DIAGRAM_TYPES)
    return [diagram_type for diagram_type in SUPPORTED_DIAGRAM_TYPES if diagram_type in allowed]


def source_conversion_diagram_types_for_text(text: str) -> list[str] | None:
    text = text.lower()
    diagram_types: list[str] = []

    def include(diagram_type: str) -> None:
        if diagram_type in SUPPORTED_DIAGRAM_TYPES and diagram_type not in diagram_types:
            diagram_types.append(diagram_type)

    if any(
        term in text
        for term in (
            "histogram",
            "frequency chart",
            "column graph",
            "statistics graph",
            "statistical graph",
            "probability density",
            "density curve",
            "normal distribution",
            "sample mean distribution",
            "blank axes",
        )
    ):
        include("statsChart")
    if any(
        term in text for term in ("argand", "locus", "slope field", "slope-field", "direction field", "implicit curve")
    ) or any(term in text for term in ("coordinate graph", "function graph", "cartesian graph")):
        include("graph2d")
    if any(
        term in text
        for term in ("scalar product", "scalar-product", "vector ray", "coordinate vector", "component vector")
    ):
        include("vector2d")
    graph3d_requested = any(
        term in text
        for term in (
            "3d",
            "3-d",
            "three-dimensional",
            "prism",
            "pyramid",
            "cone",
            "cylinder",
            "sphere",
            "spherical",
            "solid",
        )
    )
    if graph3d_requested:
        if any(term in text for term in ("cross-section", "cross section", "top-view", "top view")):
            include("graph2d")
        include("graph3d")
    if any(term in text for term in ("venn", "set diagram")):
        include("setDiagram")
    if any(
        term in text
        for term in (
            "circle theorem",
            "tangent",
            "chord",
            "schematic geometry",
            "geometry diagram",
            "schematic diagram",
            "related rates",
            "related-rates",
            "lighthouse",
        )
    ):
        include("geometricConstruction")
    if "network" in text:
        include("network")

    return ordered_supported_diagram_types(diagram_types) if diagram_types else None


def source_conversion_table_only_for_text(text: str) -> bool:
    text = text.lower()
    table_terms = (
        "table",
        "confidence interval",
        "confidence-interval",
        "confidence intervals",
        "confidence-intervals",
    )
    if not any(term in text for term in table_terms):
        return False
    diagram_like_terms = (
        "diagram",
        "graph",
        "chart",
        "histogram",
        "curve",
        "axis",
        "axes",
        "plot",
        "sketch",
        "draw",
        "shade",
        "locus",
        "argand",
        "slope field",
        "direction field",
        "implicit curve",
        "vector",
        "3d",
        "3-d",
        "three-dimensional",
        "prism",
        "pyramid",
        "cone",
        "cylinder",
        "sphere",
        "solid",
        "venn",
        "set diagram",
        "network",
        "geometry",
        "tangent",
        "chord",
    )
    return not any(term in text for term in diagram_like_terms)


def source_conversion_diagram_fields_enabled(text: str) -> bool:
    return not source_conversion_table_only_for_text(text)


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


def env_flag_enabled(name: str, *, default: bool = True) -> bool:
    value = os.environ.get(name)
    if value is None:
        return default
    return value.strip().lower() not in {"0", "false", "off", "no"}


def env_int(name: str, default: int, *, minimum: int = 0, maximum: int | None = None) -> int:
    value = os.environ.get(name)
    if value is None:
        return default
    try:
        parsed = int(value)
    except ValueError:
        return default
    parsed = max(minimum, parsed)
    if maximum is not None:
        parsed = min(maximum, parsed)
    return parsed


def assistant_image_detail() -> str:
    value = os.environ.get("ASSISTANT_IMAGE_DETAIL", DEFAULT_ASSISTANT_IMAGE_DETAIL).strip().lower()
    if value in {"low", "high", "auto"}:
        return value
    return DEFAULT_ASSISTANT_IMAGE_DETAIL


def assistant_image_max_long_edge() -> int:
    return env_int("ASSISTANT_IMAGE_MAX_LONG_EDGE", DEFAULT_ASSISTANT_IMAGE_MAX_LONG_EDGE, minimum=0)


def assistant_image_webp_quality() -> int:
    return env_int("ASSISTANT_IMAGE_WEBP_QUALITY", DEFAULT_ASSISTANT_IMAGE_WEBP_QUALITY, minimum=1, maximum=100)


def assistant_image_optimize_min_bytes() -> int:
    return env_int("ASSISTANT_IMAGE_OPTIMIZE_MIN_BYTES", DEFAULT_ASSISTANT_IMAGE_OPTIMIZE_MIN_BYTES, minimum=0)


def assistant_image_trim_borders_enabled() -> bool:
    return env_flag_enabled("ASSISTANT_IMAGE_TRIM_BORDERS", default=True)


def assistant_image_trim_background_threshold() -> int:
    return env_int(
        "ASSISTANT_IMAGE_TRIM_BACKGROUND_THRESHOLD",
        DEFAULT_ASSISTANT_IMAGE_TRIM_BACKGROUND_THRESHOLD,
        minimum=1,
        maximum=255,
    )


def assistant_image_trim_padding_px() -> int:
    return env_int("ASSISTANT_IMAGE_TRIM_PADDING_PX", DEFAULT_ASSISTANT_IMAGE_TRIM_PADDING_PX, minimum=0, maximum=512)


def compact_string_items(
    values: Any,
    text: str,
    keywords: tuple[str, ...],
    *,
    max_items: int,
    keep_first: int = 2,
    request_term_blocklist: tuple[str, ...] = (),
    include_request_terms: bool = True,
    other_keywords: tuple[str, ...] = (),
    require_focus_dominance: bool = False,
) -> list[str]:
    if not isinstance(values, list):
        return []

    selected: list[str] = []
    for value in values[:keep_first]:
        if isinstance(value, str):
            selected.append(value)

    request_terms = (
        tuple(
            term
            for term in re.findall(r"[a-zA-Z]{4,}", text)
            if term not in {"please", "would", "could", "current"} and term not in request_term_blocklist
        )
        if include_request_terms
        else ()
    )
    all_keywords = (*keywords, *request_terms)

    def matches(keyword: str, lower: str) -> bool:
        if not keyword:
            return False
        if re.fullmatch(r"[a-z0-9]+", keyword):
            return re.search(rf"\b{re.escape(keyword)}\b", lower) is not None
        return keyword in lower

    for value in values[keep_first:]:
        if not isinstance(value, str) or value in selected:
            continue
        lower = value.lower()
        if require_focus_dominance:
            focus_hits = sum(1 for keyword in all_keywords if matches(keyword, lower))
            if focus_hits <= 0:
                continue
            other_hits = sum(1 for keyword in other_keywords if matches(keyword, lower))
            if other_hits and focus_hits < 3:
                continue
        if any(matches(keyword, lower) for keyword in all_keywords):
            selected.append(value)
        if len(selected) >= max_items:
            break

    if not require_focus_dominance:
        for value in values[keep_first:]:
            if len(selected) >= max_items:
                break
            if isinstance(value, str) and value not in selected:
                selected.append(value)

    return selected


SOURCE_CONVERSION_REQUEST_TERM_BLOCKLIST = (
    "attached",
    "attachment",
    "convert",
    "create",
    "diagram",
    "exam",
    "excerpt",
    "include",
    "marking",
    "marks",
    "paper",
    "preserve",
    "question",
    "screenshot",
    "source",
    "structured",
    "worked",
)


def source_conversion_diagram_brain_keywords(diagram_types: list[str] | None) -> tuple[str, ...]:
    allowed = set(ordered_supported_diagram_types(diagram_types))
    if not allowed:
        return ()

    terms: list[str] = []

    def include(*values: str) -> None:
        for value in values:
            if value not in terms:
                terms.append(value)

    if "vector2d" in allowed:
        include(
            "vector2d",
            "vectorraydiagram",
            "scalar-product",
            "scalar product",
            "angle-marker",
            "angle marker",
            "anglemarkers",
            "components",
        )
    if "graph2d" in allowed:
        include(
            "graph2d",
            "argand",
            "locus",
            "slope-field",
            "slope field",
            "direction-field",
            "implicit",
            "region",
            "regions",
            "line_segment",
        )
    if "graph3d" in allowed:
        include(
            "graph3d",
            "3d",
            "3-d",
            "three-dimensional",
            "prism",
            "pyramid",
            "cone",
            "cylinder",
            "sphere",
            "spherical",
            "solid",
            "solids",
            "face",
            "faces",
            "dimension",
            "dimensions",
            "surface",
            "wireframe",
            "outline",
        )
    if "statsChart" in allowed:
        include(
            "statschart",
            "statistical",
            "statistics",
            "histogram",
            "frequency",
            "relative-frequency",
            "relative frequency",
            "probability",
            "density",
            "normal",
            "column",
            "blank axes",
        )
    if "geometricConstruction" in allowed:
        include(
            "geometricconstruction",
            "penrose",
            "circle",
            "tangent",
            "chord",
            "theorem",
            "geometry",
            "construction",
            "substance",
            "rightangle",
            "labelsangle",
        )
    if "setDiagram" in allowed:
        include("setdiagram", "venn", "set", "sets", "region", "regions", "shade", "shading", "count", "counts")
    if "network" in allowed:
        include("network", "node", "nodes", "link", "links")
    if "image" in allowed:
        include("image", "bitmap", "photo", "uploaded", "upload")

    return tuple(terms)


def compact_brain_config(
    data: dict[str, Any],
    file_name: str = "",
    text: str = "",
    *,
    keyword_override: tuple[str, ...] | None = None,
    other_keyword_override: tuple[str, ...] = (),
    rule_max_items: int | None = None,
    rule_keep_first: int | None = None,
    check_max_items: int | None = None,
) -> dict[str, Any]:
    compact = {key: data[key] for key in ("id", "name", "purpose", "owns", "mustNotOwn") if key in data}
    generic_keywords = keyword_override or (
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
    request_term_blocklist = SOURCE_CONVERSION_REQUEST_TERM_BLOCKLIST if keyword_override is not None else ()
    include_request_terms = keyword_override is None

    if "compositionRules" in data:
        compact["compositionRules"] = compact_string_items(
            data["compositionRules"],
            text,
            generic_keywords,
            max_items=12 if file_name == "index.json" else 8,
            keep_first=3 if file_name == "index.json" else 1,
            request_term_blocklist=request_term_blocklist,
            include_request_terms=include_request_terms,
            other_keywords=other_keyword_override,
            require_focus_dominance=keyword_override is not None,
        )
    if "rules" in data:
        compact["rules"] = compact_string_items(
            data["rules"],
            text,
            generic_keywords,
            max_items=rule_max_items if rule_max_items is not None else 18,
            keep_first=rule_keep_first if rule_keep_first is not None else 4,
            request_term_blocklist=request_term_blocklist,
            include_request_terms=include_request_terms,
            other_keywords=other_keyword_override,
            require_focus_dominance=keyword_override is not None,
        )
    if "checks" in data:
        compact["checks"] = compact_string_items(
            data["checks"],
            text,
            generic_keywords,
            max_items=check_max_items if check_max_items is not None else 8,
            keep_first=2,
            request_term_blocklist=request_term_blocklist,
            include_request_terms=include_request_terms,
            other_keywords=other_keyword_override,
            require_focus_dominance=keyword_override is not None,
        )
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
    source_conversion_diagram_types: list[str] | None = None,
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
            data = json.loads(path.read_text(encoding="utf-8"))
            if file_name == "diagram.json" and source_conversion_diagram_types:
                renderer_keywords = source_conversion_diagram_brain_keywords(source_conversion_diagram_types)
                other_renderer_keywords = tuple(
                    keyword
                    for keyword in source_conversion_diagram_brain_keywords(SUPPORTED_DIAGRAM_TYPES)
                    if keyword not in renderer_keywords
                )
                renderer_count = len(ordered_supported_diagram_types(source_conversion_diagram_types))
                brains.append(
                    compact_brain_config(
                        data,
                        file_name,
                        text,
                        keyword_override=renderer_keywords,
                        other_keyword_override=other_renderer_keywords,
                        rule_max_items=14 if renderer_count > 1 else 10,
                        rule_keep_first=0,
                        check_max_items=5,
                    )
                )
            else:
                brains.append(compact_brain_config(data, file_name, text))
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


def deterministic_brain_ids_for_request(
    messages: list[AssistantChatMessage] | None,
    tool_outputs: list[AssistantToolOutput] | None,
    document_summary: dict[str, Any] | None,
    attachments: list[AssistantAttachment] | None = None,
) -> list[str] | None:
    if tool_outputs:
        return None

    current_messages = latest_user_messages(messages)
    compact_summary = compact_document_summary(document_summary, current_messages)
    intent = classify_request_intent(compact_summary, current_messages, attachments)
    text = request_text(current_messages, attachments=attachments)
    attached_source_question_request = bool(attachments) and any(
        term in text for term in ("question", "convert", "reproduce", "exam", "paper")
    )
    if intent.kind == "clarify" or (intent.kind == "general" and not attached_source_question_request):
        return None

    ids: list[str] = []

    def include(brain_id: str) -> None:
        if brain_id not in ids:
            ids.append(brain_id)

    if intent.kind in {"write_question", "append_source_question"} or attached_source_question_request:
        include("question")
        source_diagram_fields = source_conversion_diagram_fields_enabled(text)
        if (intent.has_source_attachment and source_diagram_fields) or (
            source_diagram_fields and (intent.asks_for_diagram or intent.source_prompt_mentions_diagram)
        ):
            include("diagram")
        if intent.asks_for_solution or any(
            term in (attachment.name or "").lower() for attachment in attachments or [] for term in ("key", "solution")
        ):
            include("solutions")
        if intent.asks_for_formatting or any(
            attachment_is_pdf(attachment)
            or attachment_is_docx(attachment)
            or (
                attachment_is_text_like(attachment)
                and not any(term in (attachment.name or "").lower() for term in ("key", "solution", "answer"))
            )
            for attachment in attachments or []
        ):
            include("formatting")
        return ids

    if intent.kind == "add_diagram":
        return ["question", "diagram"]
    if intent.kind == "solution_or_marking":
        return ["question", "solutions"]
    if intent.kind == "write_all_solutions":
        return ["question", "solutions", "formatting"]
    if intent.kind == "response_space":
        return ["question", "formatting"]
    if intent.kind in {"formatting", "layout_check"}:
        return ["question", "formatting"]

    if any(term in text for term in ("diagram", "graph", "chart", "axis", "axes", "vector", "locus")):
        include("diagram")
    if any(term in text for term in ("solution", "marking key", "answer key", "worked")):
        include("solutions")
    if any(term in text for term in ("format", "layout", "print", "page", "pdf")):
        include("formatting")
    return ids or None


async def select_brain_files_for_request(
    client: httpx.AsyncClient,
    *,
    messages: list[AssistantChatMessage] | None,
    tool_outputs: list[AssistantToolOutput] | None,
    document_summary: dict[str, Any] | None,
    attachments: list[AssistantAttachment] | None = None,
) -> tuple[list[str], dict[str, Any] | None]:
    fallback_files = brain_files_for_request(messages, tool_outputs, attachments)
    deterministic_ids = deterministic_brain_ids_for_request(messages, tool_outputs, document_summary, attachments)
    if deterministic_ids:
        return brain_files_from_ids(deterministic_ids), None
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
    if asks_for_solution and SOLUTION_FOR_QUESTION_PATTERN.search(text):
        asks_to_write_question = False
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
            "Use exactly one of diagram or diagrams; for multiple source diagrams, use diagrams and omit diagram. "
            "For this request the direct tool schema may require diagram, so do not submit a text-only replacement."
            if has_source_attachment and source_prompt_mentions_diagram
            else "Omit diagram fields to preserve existing diagrams; use diagrams: [] only when explicitly removing diagrams."
        )
        if has_source_attachment and any(
            term in text
            for term in (
                "statistic",
                "stats",
                "distribution",
                "probability density",
                "sample mean",
                "histogram",
                "column graph",
            )
        ):
            diagram_guidance += (
                " For source statistical graphs, use graphConfig.type statsChart for histograms, column graphs, "
                "probability density functions, normal curves, and sample-mean distribution sketches wherever the "
                "native stats chart DSL can represent the display. Use chartType density for arbitrary density curves, "
                "normal for parameterised normal curves, and blankAxes for student sketch axes. Do not default to graph2d "
                "just because the source statistical chart has x-y axes. For histograms or column graphs with visible "
                "bin centres/categories and counts, use dataMode manualFrequencies with matching xValues and frequencies "
                "rather than overloading values with counts. Preserve source x/y labels, range/yRange, binSize, "
                "barType, yAxisMode, dataMode, density points, and bar heights when they are visible in the source."
            )
        if has_source_attachment and any(term in text for term in ("slope field", "direction field", "dy/dx")):
            diagram_guidance += (
                " For source slope-field/direction-field graphs, use graphConfig.type graph2d with "
                "graphConfig.data.slopeField containing expression, xValues/yValues or xRange/yRange plus steps, "
                "and highlightedPoints for any requested point slope. Put graph bounds, display flags, functions, "
                "and features directly on graphConfig; put solution curves in graphConfig.functions. For an implicit "
                "solution curve, prefer a relation function such as {kind:'relation', expression:'y^2 = x^2/2 - x + 1/4'} "
                "over separate sqrt branches. Do not use graphConfig.data.functions, graphConfig.data.xRange/yRange, "
                "graphConfig.options.showGrid/width, function style wrappers, or feature type/style wrappers."
            )
        if has_source_attachment and any(term in text for term in ("argand", "locus", "complex")):
            diagram_guidance += (
                " For source Argand/locus diagrams, use graphConfig.type graph2d with Re/Im labels, point features "
                "for complex numbers, relation/expression functions for circle/ray boundaries, and supported indexed "
                "region features for shading. Do not invent graph2d feature kinds such as polygon/free_label or "
                "feature fields such as points, coords, functionIndex1/functionIndex2, domainMin/domainMax, "
                "expressionTop, expressionBottom, opacity, fillColor, or "
                "strokeColor; use functions plus functionAIndex/functionBIndex or "
                "baseFeatureIndex/clipFunctionIndex/clipSide, xMin/xMax bounds, label features with x/y, "
                "line_segment with x1/y1/x2/y2, and fillOpacity for shading. Use region_between_curves, not "
                "region_between. Preserve the source "
                "or marking-key reference for argument bounds: a locus may combine |z-i| with Arg(z), so do not "
                "change Arg(z) to Arg(z-i) unless the source actually uses the shifted argument. Draw stated "
                "argument-boundary rays from the origin with line_segment features or equivalent boundary functions, "
                "and keep the shifted-circle centre/radius separate from those rays."
            )
        if has_source_attachment and any(
            term in text
            for term in (
                "3d",
                "three-dimensional",
                "prism",
                "pyramid",
                "vertices",
                "cone",
                "cylinder",
                "sphere",
            )
        ):
            diagram_guidance += (
                " For source 3D diagrams, use graphConfig.type graph3d with explicit renderer data: "
                "data.points entries for every named vertex/point; data.segments entries for visible edges, "
                "diagonals, and named lines such as BT or AM; data.faces entries with points:[...] "
                "for shaded polygon faces on prisms/pyramids, not vertices:[...]; "
                "and data.solids for true curved solids such as cones, cylinders, spheres, and circles. "
                "For curved solids, set renderStyle:'surface', 'wireframe', or 'outline' to match the source, "
                "and put labelled height/radius guide lines such as h and r in data.dimensions. "
                "Preserve source line/ray/vector notation; do not rewrite a source line or main diagonal BT/\\overleftrightarrow{BT} "
                "as \\overrightarrow{BT}. "
                "For hidden/dashed 3D edges, use segment strokeStyle:'dashed' or dashed:true, not style:'dashed'. "
                "Store the camera as metadata.view3d:{az,el,bank} "
                "using renderer/radian-style values such as az:1.1, el:0.35, bank:0, not degrees; "
                "do not use Plotly-style metadata.view3d.camera.eye, metadata.axisLabels, metadata.showAxes, "
                "or metadata.showGrid. Do not add xAxis/yAxis/zAxis points or axis-label segments; the graph3d "
                "renderer owns coordinate axes and labels."
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
            "when changing solution ticks or worked solution text. Use hidden [[marks:n]] annotations only; make the "
            "hidden mark total match the scope marks; do not show visible "
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
    vector2d_description = (
        "For graphConfig.type vector2d, provide a valid native vector2d config. Every "
        "metadata.vector2d.vectors[] entry must include id, name, start:[x,y], and components:[dx,dy]. "
        "Use labelStyle:'custom' with labels such as '\\\\mathbf{a}' for source scalar-product ray diagrams. "
        "Use metadata.vector2d.segmentLabels[] with vectorId matching a vector id for magnitude labels, and "
        "metadata.vector2d.angleMarkers[] with from/to matching vector ids for angle or right-angle markers. "
        "Use spaced TeX labels such as 2\\\\ \\\\text{units} and 45^\\\\circ, not 2\\\\text{units} or 45°."
    )
    vector_ray_diagram_schema = {
        "type": "object",
        "description": (
            "Compact builder for source-faithful scalar-product ray/vector diagrams with no axes. Use this instead "
            "of hand-building vector2d graphConfig when converting screenshots with common-origin rays, magnitude "
            "labels, right-angle markers, and angle labels. Use lengthLabel values such as 2\\\\ \\\\text{units} "
            "and angle marker labels such as 45^\\\\circ. Angle markers may span non-adjacent source rays when "
            "another labelled ray lies inside the marked sector. Angles are standard degrees: 0 is right, 90 is up."
        ),
        "properties": {
            "widthPx": {"type": "number", "minimum": 120, "maximum": 900},
            "heightPx": {"type": "number", "minimum": 120, "maximum": 700},
            "vectors": {
                "type": "array",
                "description": (
                    "Rays/vectors. Provide id/name such as a,b,c,d. Prefer length+angleDeg for source ray diagrams; "
                    "use components when exact components are the task. start defaults to [0,0]."
                ),
                "items": {
                    "type": "object",
                    "properties": {
                        "id": {"type": "string"},
                        "name": {"type": "string"},
                        "label": {"type": "string", "description": "Optional LaTeX label, e.g. \\\\mathbf{a}."},
                        "start": {
                            "type": "array",
                            "items": {"type": "number"},
                            "minItems": 2,
                            "maxItems": 2,
                        },
                        "components": {
                            "type": "array",
                            "items": {"type": "number"},
                            "minItems": 2,
                            "maxItems": 2,
                        },
                        "end": {
                            "type": "array",
                            "items": {"type": "number"},
                            "minItems": 2,
                            "maxItems": 2,
                        },
                        "length": {"type": "number"},
                        "angleDeg": {"type": "number"},
                        "lengthLabel": {
                            "anyOf": [{"type": "string"}, {"type": "boolean"}],
                            "description": "Magnitude label such as 2\\\\ \\\\text{units}; false hides the length label.",
                        },
                    },
                    "required": ["id"],
                    "additionalProperties": False,
                },
            },
            "segmentLabels": {
                "type": "array",
                "description": "Optional additional draggable magnitude labels attached to a vector id.",
                "items": {
                    "type": "object",
                    "properties": {
                        "vectorId": {"type": "string"},
                        "label": {"type": "string"},
                        "position": {"type": "number"},
                        "offsetPx": {"type": "number"},
                    },
                    "required": ["vectorId", "label"],
                    "additionalProperties": False,
                },
            },
            "angleMarkers": {
                "type": "array",
                "description": (
                    "Angle or right-angle markers between vector ids. Use the actual source sector endpoints, "
                    "not merely adjacent rays; nested source angle markings are allowed."
                ),
                "items": {
                    "type": "object",
                    "properties": {
                        "from": {"type": "string"},
                        "to": {"type": "string"},
                        "label": {"type": "string", "description": "Angle label such as 45^\\\\circ."},
                        "rightAngle": {"type": "boolean"},
                        "radius": {"type": "number"},
                    },
                    "required": ["from", "to"],
                    "additionalProperties": False,
                },
            },
        },
        "required": ["vectors"],
        "additionalProperties": False,
    }
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
                    "on the diagram block. For statsChart normal/density displays, use fields like "
                    "{type:'statsChart', data:{chartType:'normal', mean:3, stdDev:0.3, range:[1.5,4.5], "
                    "xLabel:'$\\\\overline{T}$', yLabel:'Density'}, options:{showGrid:true, showFill:false}}; "
                    "for arbitrary source density curves use data.chartType:'density' with points:[{x,y},...] or "
                    "paired xValues/yValues; for blank student sketch axes use data.chartType:'blankAxes' with range/yRange; "
                    "for histograms/columns use data.chartType:'histogram' with raw values, manualFrequencies "
                    "xValues/frequencies for visible counts, or manualProbabilities xValues/probabilities for exact probabilities. "
                    "For source charts, preserve labels, range/yRange, binSize, barType, yAxisMode, dataMode, density points, "
                    "and visible bar heights from the source. "
                    "For graph2d, put xMin/xMax/yMin/yMax, widthPx/heightPx, showGrid/showAxes, functions, and features "
                    "directly on graphConfig. Do not nest those fields under data or options. For graph2d slope fields, "
                    "use data.slopeField:{expression,xValues?,yValues?,xRange?,yRange?,xStep?,yStep?,highlightedPoints?}. "
                    "For graph2d function domains, use domainMin/domainMax and style with color/strokeWidth/strokeStyle "
                    "directly on the function. Graph2d features use kind, not type, and style with direct color/size/strokeWidth fields; "
                    "use label with x/y for free labels and line_segment with x1/y1/x2/y2 for segments. "
                    "For source top-view or line-work diagrams, preserve labelled vertices, diagonals, midpoint points, "
                    "and named vector rays at their source-relative incidence; use labelX/labelY to separate coincident "
                    "or projected labels such as E and O. "
                    "For shaded graph2d locus/region diagrams, define boundary functions first, then use exact supported "
                    "region_between_curves, region_curve_axis, or region_clipped_by_curve features with "
                    "functionAIndex/functionBIndex or baseFeatureIndex/clipFunctionIndex/clipSide plus xMin/xMax; use fillOpacity, "
                    "not region_between, polygon/free_label, functionIndex1/functionIndex2, domainMin/domainMax, "
                    "points/coords, expressionTop/expressionBottom/opacity/fillColor/strokeColor fields. "
                    "For Argand loci with argument bounds, preserve the Arg(z) reference and draw the boundary rays from the origin; "
                    "do not fold those rays into a shifted circle such as |z-i|. "
                    "For graph3d source solids, use data.points:[{id,label,coords:[x,y,z]}], "
                    "data.segments:[{from,to,label?,strokeStyle?}] with strokeStyle:'dashed' or dashed:true "
                    "for hidden edges, data.faces:[{points:[...]}] for polygon faces on prisms/pyramids "
                    "(not vertices:[...]), "
                    "and data.solids:[{kind:'cone'|'cylinder'|'sphere'|'circle'|'sphereCap',...}] for curved solids. "
                    "For curved solids, include renderStyle:'surface'|'wireframe'|'outline' and use "
                    "data.dimensions:[{from,to,label,...}] for labelled height/radius guide lines such as h and r. "
                    "Preserve source line/ray/vector notation in text and segment labels; do not rewrite a source line "
                    "BT/\\overleftrightarrow{BT} as \\overrightarrow{BT}. "
                    "When part text names an angle, the middle letter is the vertex and graph3d must include both "
                    "explicit bounding rays as segments. For \\angle DMF, include D-M and M-F as data.segments; "
                    "if M is a midpoint on EF, the whole E-F edge does not replace the M-F ray. "
                    "Use sphereCap with center, radius, height/depth, and axis/normal for spherical caps rather "
                    "than drawing a full sphere; include a segment or dimension label '$h$' when the source labels cap depth h. "
                    "Use show:false to hide graph3d helper points/segments/solids; do not use visible:false. "
                    "Use metadata.view3d:{az,el,bank} with radian-style "
                    "renderer values such as {az:1.1,el:0.35,bank:0}; do not use "
                    "segment style:'dashed', Plotly-style camera.eye, metadata axisLabels/showAxes/showGrid, or xAxis/yAxis/zAxis "
                    "helper points/segments. " + vector2d_description
                ),
                "properties": {
                    "type": {
                        "type": "string",
                        "enum": SUPPORTED_DIAGRAM_TYPES,
                    },
                    "xMin": {"type": "number"},
                    "xMax": {"type": "number"},
                    "yMin": {"type": "number"},
                    "yMax": {"type": "number"},
                    "widthPx": {"type": "number"},
                    "heightPx": {"type": "number"},
                    "showGrid": {"type": "boolean"},
                    "showAxes": {"type": "boolean"},
                    "showAxisLabels": {"type": "boolean"},
                    "showAxisNumbers": {"type": "boolean"},
                    "data": {
                        "type": "object",
                        "description": (
                            "Renderer data. For graph2d, only use this for data.slopeField; do not put graph2d "
                            "functions, features, bounds, size, or axes fields here. For graph3d, use "
                            "points:[{id,label,coords:[x,y,z]}], segments:[{from,to,label?,strokeStyle?,dashed?}], "
                            "faces:[{points:[...]}] not vertices, and "
                            "solids:[{kind:'cone'|'cylinder'|'sphere'|'circle'|'sphereCap',...}]; "
                            "do not use segment style."
                        ),
                    },
                    "options": {
                        "type": "object",
                        "description": (
                            "Renderer options, especially Penrose Substance. For graph2d, do not put axes, size, "
                            "bounds, functions, or features here; those are top-level graphConfig fields."
                        ),
                    },
                    "metadata": {
                        "type": "object",
                        "description": (
                            "Renderer metadata. For graph3d, use metadata.view3d with numeric az, el, and bank "
                            "in renderer/radian-style units, not degrees. "
                            "Do not use nested camera.eye or put axisLabels/showAxes/showGrid in metadata."
                        ),
                        "properties": {
                            "view3d": {
                                "type": "object",
                                "properties": {
                                    "az": {"type": "number"},
                                    "el": {"type": "number"},
                                    "bank": {"type": "number"},
                                },
                                "required": ["az", "el", "bank"],
                                "additionalProperties": False,
                            },
                            "vector2d": {
                                "type": "object",
                                "description": "Vector2d renderer metadata. Use only when graphConfig.type is vector2d.",
                                "additionalProperties": True,
                            },
                            "assistantDiagramRole": {"type": "string"},
                            "renderer": {"type": "string"},
                        },
                        "additionalProperties": False,
                    },
                    "functions": {
                        "type": "array",
                        "description": (
                            "Top-level graph2d functions. Use kind:'relation' for implicit equations such as "
                            "y^2 = x^2/2 - x + 1/4. Use domainMin/domainMax for domains and direct "
                            "color/strokeWidth/strokeStyle fields for style; do not use domain or style wrappers."
                        ),
                        "items": {
                            "type": "object",
                            "properties": {
                                "kind": {"type": "string", "enum": ["expression", "piecewise", "relation"]},
                                "expression": {"type": "string"},
                                "latex": {"type": "string"},
                                "label": {"type": "string"},
                                "color": {"type": "string"},
                                "strokeWidth": {"type": "number"},
                                "strokeStyle": {"type": "string", "enum": ["solid", "dashed"]},
                                "show": {"type": "boolean"},
                                "showLabel": {"type": "boolean"},
                                "domainMin": {"type": "number"},
                                "domainMax": {"type": "number"},
                            },
                            "required": ["expression"],
                            "additionalProperties": True,
                        },
                    },
                    "features": {
                        "type": "array",
                        "description": (
                            "Top-level graph2d features. Use kind, not type. Put color, size, strokeWidth, and "
                            "strokeStyle directly on the feature; do not use a style wrapper. Use label with x/y for "
                            "free text labels and line_segment with x1/y1/x2/y2 for segments; for shaded regions use "
                            "region_between_curves or region_curve_axis with xMin/xMax and fillOpacity. Do not use polygon, "
                            "region_between, free_label, points, coords, from/to, functionIndex1/functionIndex2, "
                            "domainMin/domainMax, fillColor, opacity, or strokeColor."
                        ),
                        "items": {
                            "type": "object",
                            "properties": {
                                "kind": {
                                    "type": "string",
                                    "enum": [
                                        "point",
                                        "point_between_points",
                                        "region_between_curves",
                                        "region_curve_axis",
                                        "turning_point",
                                        "intersection",
                                        "tangent",
                                        "line_segment",
                                        "label",
                                        "region_clipped_by_curve",
                                    ],
                                },
                                "x": {"type": "number"},
                                "y": {"type": "number"},
                                "x1": {"type": "number"},
                                "y1": {"type": "number"},
                                "x2": {"type": "number"},
                                "y2": {"type": "number"},
                                "label": {"type": "string"},
                                "color": {"type": "string"},
                                "size": {"type": "number"},
                                "strokeWidth": {"type": "number"},
                                "strokeStyle": {"type": "string", "enum": ["none", "solid", "dashed"]},
                                "fillOpacity": {"type": "number"},
                                "functionIndex": {"type": "integer"},
                                "functionAIndex": {"type": "integer"},
                                "functionBIndex": {"type": "integer"},
                                "baseFeatureIndex": {"type": "integer"},
                                "clipFunctionIndex": {"type": "integer"},
                                "clipSide": {
                                    "type": "string",
                                    "enum": ["above", "below", "left", "right", "inside", "outside"],
                                },
                                "axis": {"type": "string", "enum": ["x", "y"]},
                                "xMin": {"type": "number"},
                                "xMax": {"type": "number"},
                                "show": {"type": "boolean"},
                            },
                            "required": ["kind"],
                            "additionalProperties": True,
                        },
                    },
                },
                "required": ["type"],
                "additionalProperties": True,
            },
            "vectorRayDiagram": vector_ray_diagram_schema,
        },
        "required": [],
        "additionalProperties": False,
    }


def compact_assistant_diagram_block_schema(description: str) -> dict[str, Any]:
    return {
        "type": "object",
        "description": (
            f"{description} Same shape as the top-level diagram field: use "
            "{ graphConfig: { type: ... }, diagramAlign? } or vectorRayDiagram. Keep renderer fields inside "
            "graphConfig, not on the diagram block. The Mauth tool boundary validates the full renderer-specific "
            "payload before applying it."
        ),
        "properties": {
            "id": {"type": "string", "description": "Optional stable block id. Usually omit."},
            "diagramAlign": {"type": "string", "enum": ["left", "center", "right"]},
            "diagramTextSide": {"type": "string", "enum": ["none", "left", "right"]},
            "graphConfig": {
                "type": "object",
                "description": (
                    "Native Mauth renderer payload. Include graphConfig.type and follow the top-level diagram "
                    "schema/instructions for renderer-specific graph2d, vector2d, graph3d, statsChart, "
                    "setDiagram, network, image, or geometricConstruction fields."
                ),
                "properties": {"type": {"type": "string", "enum": SUPPORTED_DIAGRAM_TYPES}},
                "required": ["type"],
                "additionalProperties": True,
            },
            "vectorRayDiagram": {
                "type": "object",
                "description": (
                    "Same compact vectorRayDiagram builder as the top-level diagram field. Use for source "
                    "scalar-product/common-origin ray diagrams."
                ),
                "additionalProperties": True,
            },
        },
        "required": [],
        "additionalProperties": False,
    }


def source_conversion_renderer_guide(diagram_types: list[str] | None) -> str:
    allowed = ordered_supported_diagram_types(diagram_types)
    if set(allowed) == set(SUPPORTED_DIAGRAM_TYPES):
        return (
            "Use graph2d for coordinate/function, slope-field, Argand/locus, and implicit-curve diagrams; "
            "statsChart for histograms, probability/frequency charts, density curves, normal curves, and blank sketch axes; "
            "graph3d for 3D points/segments/faces/solids including sphereCap; vector2d/vectorRayDiagram for vector sources; "
            "geometricConstruction for theorem geometry; setDiagram for Venn/set diagrams. "
            "For vector2d, metadata.vector2d.vectors[] entries need id, name, start:[x,y], and components:[dx,dy]; "
            "use metadata.vector2d.segmentLabels[] and metadata.vector2d.angleMarkers[] for source labels."
        )

    guides = {
        "graph2d": (
            "Use graph2d. Keep bounds, display flags, functions, and features top-level; only slopeField belongs under data. "
            "For locus/region shading, define boundary functions first and use supported indexed region features; "
            "use region_between_curves or region_curve_axis, xMin/xMax, and fillOpacity, not region_between, "
            "functionIndex1/functionIndex2, domainMin/domainMax, polygon/free_label, points/coords, fillColor, opacity, or strokeColor. "
            "For Argand loci, keep Arg(z) boundary rays from the origin separate from shifted circle boundaries."
        ),
        "statsChart": (
            "Use statsChart. Use density/normal/blankAxes for statistical curves and sketch axes; for histograms or "
            "columns with visible counts, use manualFrequencies with xValues and frequencies. Preserve source labels, "
            "ranges, bin sizes, modes, density points, and visible bar heights."
        ),
        "graph3d": (
            "Use graph3d. Put named vertices in data.points, edges/diagonals in data.segments, polygon faces in "
            "data.faces with points arrays (not vertices arrays), curved solids in data.solids, "
            "and camera as metadata.view3d:{az,el,bank}; "
            "for curved solids include renderStyle surface/wireframe/outline and data.dimensions for labelled h/r guide lines; "
            "preserve source line/ray/vector notation in text and segment labels; "
            "metadata must not include axes, labels, bounds, or pointLabels."
        ),
        "vector2d": (
            "Use vector2d for coordinate/component vectors, or vectorRayDiagram for no-axis scalar-product ray screenshots. "
            "Vector metadata needs ids, starts, components, labels, and angle/segment marker references."
        ),
        "geometricConstruction": "Use geometricConstruction/Penrose for schematic theorem geometry.",
        "setDiagram": "Use setDiagram for Venn/set diagrams.",
        "network": "Use network only for schematic node-link diagrams.",
        "image": "Use image only when a bitmap is intentionally preserved instead of native editable maths.",
    }
    return " ".join(guides[diagram_type] for diagram_type in allowed if diagram_type in guides)


def source_conversion_diagram_block_schema(description: str, diagram_types: list[str] | None = None) -> dict[str, Any]:
    allowed_diagram_types = ordered_supported_diagram_types(diagram_types)
    include_vector_ray = "vector2d" in allowed_diagram_types
    properties: dict[str, Any] = {
        "id": {"type": "string", "description": "Optional stable block id. Usually omit."},
        "diagramAlign": {"type": "string", "enum": ["left", "center", "right"]},
        "diagramTextSide": {"type": "string", "enum": ["none", "left", "right"]},
        "graphConfig": {
            "type": "object",
            "description": (
                "Native Mauth renderer payload. Required field: type. "
                f"{source_conversion_renderer_guide(allowed_diagram_types)} "
                "Keep renderer fields inside graphConfig. The app validates full renderer-specific payloads."
            ),
            "properties": {"type": {"type": "string", "enum": allowed_diagram_types}},
            "required": ["type"],
            "additionalProperties": True,
        },
    }
    if include_vector_ray:
        properties["vectorRayDiagram"] = {
            "type": "object",
            "description": (
                "Compact no-axis scalar-product ray/vector diagram. Include vectors with id/name, length or "
                "components, angleDeg, lengthLabel such as 2\\\\ \\\\text{units}, and optional angleMarkers "
                "with labels such as 45^\\\\circ. Angle markers may be nested; use the source sector endpoints "
                "rather than simply adjacent rays."
            ),
            "properties": {
                "widthPx": {"type": "number"},
                "heightPx": {"type": "number"},
                "vectors": {"type": "array", "items": {"type": "object", "additionalProperties": True}},
                "segmentLabels": {"type": "array", "items": {"type": "object", "additionalProperties": True}},
                "angleMarkers": {"type": "array", "items": {"type": "object", "additionalProperties": True}},
            },
            "required": ["vectors"],
            "additionalProperties": False,
        }
    return {
        "type": "object",
        "description": (
            f"{description} "
            + ("Use exactly one of graphConfig or vectorRayDiagram. " if include_vector_ray else "Use graphConfig. ")
            + "Keep renderer fields inside graphConfig, not on the diagram block. "
            "The app validates full renderer-specific payloads before applying."
        ),
        "properties": properties,
        "required": [],
        "additionalProperties": False,
    }


def source_conversion_compact_diagram_block_schema(
    description: str, diagram_types: list[str] | None = None
) -> dict[str, Any]:
    allowed_diagram_types = ordered_supported_diagram_types(diagram_types)
    properties: dict[str, Any] = {
        "id": {"type": "string", "description": "Optional stable block id. Usually omit."},
        "diagramAlign": {"type": "string", "enum": ["left", "center", "right"]},
        "diagramTextSide": {"type": "string", "enum": ["none", "left", "right"]},
        "graphConfig": {
            "type": "object",
            "description": "Native renderer payload. Include type plus renderer-specific fields.",
            "properties": {"type": {"type": "string", "enum": allowed_diagram_types}},
            "required": ["type"],
            "additionalProperties": True,
        },
    }
    if "vector2d" in allowed_diagram_types:
        properties["vectorRayDiagram"] = {
            "type": "object",
            "description": "Compact no-axis scalar-product ray diagram payload.",
            "additionalProperties": True,
        }
    return {
        "type": "object",
        "description": (
            f"{description} "
            + (
                "Use exactly one of graphConfig or vectorRayDiagram. "
                if "vector2d" in allowed_diagram_types
                else "Use graphConfig. "
            )
            + "Keep renderer fields inside graphConfig."
        ),
        "properties": properties,
        "required": [],
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


def assistant_author_subpart_schema() -> dict[str, Any]:
    return {
        "type": "object",
        "properties": {
            "label": {
                "type": "string",
                "description": "Subpart label such as i or ii. Omit to auto-label.",
            },
            "text": {
                "type": "string",
                "description": (
                    "Subpart prompt text without a typed '(i)' label. Must contain the visible subpart task "
                    "from the source; never leave this blank for a marked subpart."
                ),
            },
            "marks": {"type": "integer", "minimum": 0, "maximum": 100},
            "studentSpaceLines": {
                "type": "integer",
                "minimum": 1,
                "maximum": 40,
                "description": "Generous subpart answer/work space for free-response subparts.",
            },
            "answerSurface": {
                "type": "string",
                "enum": ["space", "diagram", "table", "none"],
                "description": "Use diagram/table when the subpart answer is drawn/completed directly on that surface.",
            },
            "solutionText": {
                "type": "string",
                "description": (
                    "Only include when the teacher requested solutions or the source visibly contains one. "
                    "Worked solution for this subpart using hidden [[marks:n]] tick annotations."
                ),
            },
            "includeSolution": {"type": "boolean"},
            "diagram": compact_assistant_diagram_block_schema(
                "Optional native Mauth diagram block for this subpart, shaped as { graphConfig, diagramAlign? }."
            ),
            "diagrams": {
                "type": "array",
                "description": "Optional replacement diagrams for this subpart.",
                "items": compact_assistant_diagram_block_schema(
                    "One native Mauth diagram block for this subpart, shaped as { graphConfig, diagramAlign? }."
                ),
            },
            "diagramLayout": {
                "type": "string",
                "enum": ["stacked", "columns"],
                "description": "Use columns when multiple source diagrams for this subpart are intentionally side by side.",
            },
            "diagramColumns": {
                "type": "integer",
                "minimum": 2,
                "maximum": 4,
                "description": "Number of side-by-side diagram columns when diagramLayout is columns.",
            },
            "solutionDiagram": compact_assistant_diagram_block_schema(
                "Optional completed solution-copy diagram for this subpart when answerSurface is diagram."
            ),
            "solutionDiagrams": {
                "type": "array",
                "items": compact_assistant_diagram_block_schema(
                    "One completed solution-copy diagram for this subpart."
                ),
            },
            "table": assistant_table_block_schema(
                "Optional student completion table for this subpart. Use blank strings for empty answer cells."
            ),
            "tables": {
                "type": "array",
                "items": assistant_table_block_schema("One student completion table for this subpart."),
            },
            "solutionTable": assistant_table_block_schema("Optional completed solution-copy table for this subpart."),
            "solutionTables": {
                "type": "array",
                "items": assistant_table_block_schema("One completed solution-copy table for this subpart."),
            },
            "pageBreakBefore": {"type": "boolean"},
        },
        "required": ["text", "marks"],
        "additionalProperties": False,
    }


def mauth_author_replace_question_tool_definition(*, require_diagram: bool = False) -> dict[str, Any]:
    required_fields = ["questionNumber", "marks", "questionText"]
    if require_diagram:
        required_fields.append("diagram")

    diagram_description = (
        "Required for this request because the source attachment/request asks for a visible mathematical diagram. "
        "Supply a native editable Mauth diagram block shaped as { graphConfig, diagramAlign? }, or use "
        "vectorRayDiagram for source scalar-product ray diagrams. Do not place renderer type/data at the top "
        "level. Do not replace the diagram with prose, and do not omit this field."
        if require_diagram
        else (
            "Optional existing Mauth diagram block shaped as { graphConfig, diagramAlign? }, or use "
            "vectorRayDiagram for source scalar-product ray diagrams. Do not place renderer type/data at the top level. "
            "Omit to preserve existing diagrams. Supply a valid supported graphConfig only when adding or "
            "replacing the question's diagrams. When converting a screenshot/source question whose visible "
            "diagram belongs under the stem and before the parts, supply it here or in diagrams. Use exactly one "
            "of diagram or diagrams; for multiple source diagrams, use diagrams and omit diagram."
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
                    "description": (
                        "Question-level direct marks when parts are not carrying the marks. For multipart source "
                        "questions with marked parts, use 0; do not copy the printed total because the part marks "
                        "already preserve it."
                    ),
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
                        "use solutionText only for a short unmarked note if needed. Never include [[marks:n]] in "
                        "solutionText when a solutionDiagram or solutionTable is present for the same item. "
                        "Do not write visible [1 mark], (1 mark), or "
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
                        "native diagram here instead of replacing it with prose. Use diagrams instead of diagram when "
                        "there are multiple source diagrams; do not send both diagram and diagrams. Each item should be shaped as "
                        "{ graphConfig: { type: ... }, diagramAlign?: ... }; do not put type/data directly on the item."
                    ),
                    "items": compact_assistant_diagram_block_schema(
                        "One native Mauth diagram block shaped as { graphConfig, diagramAlign? }."
                    ),
                },
                "diagramLayout": {
                    "type": "string",
                    "enum": ["stacked", "columns"],
                    "description": (
                        "Use columns when the source places multiple top-level diagrams side by side. "
                        "Use stacked when the source diagrams are one above another."
                    ),
                },
                "diagramColumns": {
                    "type": "integer",
                    "minimum": 2,
                    "maximum": 4,
                    "description": "Number of side-by-side diagram columns when diagramLayout is columns.",
                },
                "solutionDiagram": compact_assistant_diagram_block_schema(
                    "Optional completed solution-copy diagram for answerSurface: diagram. Pair it with the student blank/partial "
                    "diagram so the solution copy shows the completed graph/labelled diagram in the same position and size."
                ),
                "solutionDiagrams": {
                    "type": "array",
                    "description": (
                        "Optional completed solution-copy diagrams for answerSurface: diagram. Usually supply one solution diagram "
                        "matching the one student diagram."
                    ),
                    "items": compact_assistant_diagram_block_schema("One completed solution-copy Mauth diagram block."),
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
                        "optional table/solutionTable answer surfaces, and optional subparts for nested (i)/(ii) items. "
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
                                    "so use this only for a short unmarked note if needed. Never include [[marks:n]] here "
                                    "when solutionDiagram or solutionTable is present for the same part."
                                ),
                            },
                            "includeSolution": {"type": "boolean"},
                            "diagram": compact_assistant_diagram_block_schema(
                                "Optional native Mauth diagram block for this part, shaped as { graphConfig, diagramAlign? }."
                            ),
                            "diagrams": {
                                "type": "array",
                                "description": "Optional replacement diagrams for this part. Omit to leave existing diagram decisions alone.",
                                "items": compact_assistant_diagram_block_schema(
                                    "One native Mauth diagram block for this part, shaped as { graphConfig, diagramAlign? }."
                                ),
                            },
                            "diagramLayout": {
                                "type": "string",
                                "enum": ["stacked", "columns"],
                                "description": "Use columns when multiple source diagrams for this part are intentionally side by side.",
                            },
                            "diagramColumns": {
                                "type": "integer",
                                "minimum": 2,
                                "maximum": 4,
                                "description": "Number of side-by-side diagram columns when diagramLayout is columns.",
                            },
                            "solutionDiagram": compact_assistant_diagram_block_schema(
                                "Optional completed solution-copy diagram for this part when answerSurface is diagram."
                            ),
                            "solutionDiagrams": {
                                "type": "array",
                                "items": compact_assistant_diagram_block_schema(
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
                            "subparts": {
                                "type": "array",
                                "description": (
                                    "Optional structured subparts for nested source items such as (f)(i) and (f)(ii). "
                                    "Use these instead of flattening '(i)'/'(ii)' into part text."
                                ),
                                "items": assistant_author_subpart_schema(),
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


def source_conversion_table_schema(description: str) -> dict[str, Any]:
    return {
        "type": "object",
        "description": description,
        "properties": {
            "id": {"type": "string"},
            "headers": {"type": "array", "items": {"type": "string"}},
            "rows": {"type": "array", "items": {"type": "array", "items": {"type": "string"}}},
            "showHeader": {"type": "boolean"},
            "tableAlign": {"type": "string", "enum": ["left", "center", "right"]},
            "cellAlignment": {"type": "string", "enum": ["left", "center", "right"]},
        },
        "required": ["rows"],
        "additionalProperties": False,
    }


def source_conversion_diagram_collection_only(diagram_types: list[str] | None) -> bool:
    return diagram_types is not None and len(ordered_supported_diagram_types(diagram_types)) > 1


def source_conversion_part_schema(
    diagram_types: list[str] | None = None,
    *,
    include_diagram_fields: bool = True,
    diagram_collection_only: bool = False,
) -> dict[str, Any]:
    table = source_conversion_table_schema("Optional table for this part. Use blank strings for student cells.")
    subpart_table = source_conversion_table_schema(
        "Optional table for this subpart. Use blank strings for student cells."
    )
    subpart_properties: dict[str, Any] = {
        "label": {"type": "string"},
        "text": {
            "type": "string",
            "description": "Visible subpart prompt without a typed '(i)' label. Do not leave marked subparts blank.",
        },
        "marks": {"type": "integer", "minimum": 0, "maximum": 100},
        "studentSpaceLines": {"type": "integer", "minimum": 1, "maximum": 40},
        "answerSurface": {"type": "string", "enum": ["space", "diagram", "table", "none"]},
        "solutionText": {
            "type": "string",
            "description": "Only when requested or visible in source. Use hidden [[marks:n]] ticks, not visible mark notes.",
        },
        "includeSolution": {"type": "boolean"},
        "table": subpart_table,
        "tables": {"type": "array", "items": subpart_table},
        "solutionTable": source_conversion_table_schema("Completed solution-copy table."),
        "solutionTables": {
            "type": "array",
            "items": source_conversion_table_schema("One completed solution-copy table."),
        },
        "pageBreakBefore": {"type": "boolean"},
    }
    if include_diagram_fields:
        subpart_diagram = source_conversion_compact_diagram_block_schema(
            "Optional native diagram for this subpart.", diagram_types
        )
        subpart_properties["diagrams"] = {"type": "array", "items": subpart_diagram}
        subpart_properties["diagramLayout"] = {
            "type": "string",
            "enum": ["stacked", "columns"],
            "description": "Use columns for side-by-side source diagrams.",
        }
        subpart_properties["diagramColumns"] = {"type": "integer", "minimum": 2, "maximum": 4}
        subpart_properties["solutionDiagrams"] = {
            "type": "array",
            "items": source_conversion_compact_diagram_block_schema(
                "One completed solution-copy diagram.", diagram_types
            ),
        }
        if not diagram_collection_only:
            subpart_properties["diagram"] = subpart_diagram
            subpart_properties["solutionDiagram"] = source_conversion_compact_diagram_block_schema(
                "Completed solution-copy diagram for answerSurface diagram.", diagram_types
            )
    subpart_schema = {
        "type": "object",
        "properties": subpart_properties,
        "required": ["text", "marks"],
        "additionalProperties": False,
    }
    part_properties: dict[str, Any] = {
        "label": {"type": "string"},
        "text": {
            "type": "string",
            "description": "Visible part prompt without a typed '(a)' label. Do not leave marked parts blank.",
        },
        "marks": {"type": "integer", "minimum": 0, "maximum": 100},
        "studentSpaceLines": {"type": "integer", "minimum": 1, "maximum": 40},
        "answerSurface": {"type": "string", "enum": ["space", "diagram", "table", "none"]},
        "solutionText": {
            "type": "string",
            "description": "Only when requested or visible in source. Use hidden [[marks:n]] ticks, not visible mark notes.",
        },
        "includeSolution": {"type": "boolean"},
        "table": table,
        "tables": {"type": "array", "items": table},
        "solutionTable": source_conversion_table_schema("Completed solution-copy table."),
        "solutionTables": {
            "type": "array",
            "items": source_conversion_table_schema("One completed solution-copy table."),
        },
        "subparts": {
            "type": "array",
            "description": (
                "Nested source subparts such as (i) and (ii). Use this instead of flattening subparts into text."
            ),
            "items": subpart_schema,
        },
        "pageBreakBefore": {"type": "boolean"},
    }
    if include_diagram_fields:
        diagram = source_conversion_compact_diagram_block_schema(
            "Optional native diagram for this part.", diagram_types
        )
        part_properties["diagrams"] = {"type": "array", "items": diagram}
        part_properties["diagramLayout"] = {
            "type": "string",
            "enum": ["stacked", "columns"],
            "description": "Use columns for side-by-side source diagrams.",
        }
        part_properties["diagramColumns"] = {"type": "integer", "minimum": 2, "maximum": 4}
        part_properties["solutionDiagrams"] = {
            "type": "array",
            "items": source_conversion_compact_diagram_block_schema(
                "One completed solution-copy diagram.", diagram_types
            ),
        }
        if not diagram_collection_only:
            part_properties["diagram"] = diagram
            part_properties["solutionDiagram"] = source_conversion_compact_diagram_block_schema(
                "Completed solution-copy diagram for answerSurface diagram.", diagram_types
            )
    return {
        "type": "object",
        "properties": part_properties,
        "required": ["text", "marks"],
        "additionalProperties": False,
    }


def mauth_convert_source_question_tool_definition(
    *,
    require_diagram: bool = False,
    diagram_types: list[str] | None = None,
    include_diagram_fields: bool = True,
) -> dict[str, Any]:
    include_diagram_fields = include_diagram_fields or require_diagram
    required_fields = ["questionNumber", "marks", "questionText"]
    diagram_collection_only = source_conversion_diagram_collection_only(diagram_types)
    if require_diagram:
        required_fields.append("diagrams" if diagram_collection_only else "diagram")
    diagram_description = (
        "Required for this request because the source/request asks for a visible mathematical diagram. Recreate it as "
        "native Mauth data; do not replace it with prose."
        if require_diagram
        else "Optional native source diagram. Use when the source has a visible mathematical diagram."
    )
    table = source_conversion_table_schema(
        "Optional source table. Use blank strings only for student-completion cells."
    )
    properties: dict[str, Any] = {
        "questionNumber": {
            "type": "integer",
            "minimum": 1,
            "description": "1-based target. If exactly one past current count, Mauth appends it.",
        },
        "questionId": {"type": "string"},
        "marks": {
            "type": "integer",
            "minimum": 0,
            "maximum": 100,
            "description": "Use 0 when parts/subparts carry marks.",
        },
        "questionText": {
            "type": "string",
            "description": "Stem text only. Do not type 'Question 1'. Use structured parts for (a), (b), ...",
        },
        "studentSpaceLines": {"type": "integer", "minimum": 1, "maximum": 40},
        "answerSurface": {"type": "string", "enum": ["space", "diagram", "table", "none"]},
        "solutionText": {
            "type": "string",
            "description": "Only when requested or visible in source. Use hidden [[marks:n]] ticks.",
        },
        "includeSolution": {"type": "boolean"},
        "table": table,
        "tables": {"type": "array", "items": table},
        "solutionTable": source_conversion_table_schema("Completed solution-copy table."),
        "solutionTables": {
            "type": "array",
            "items": source_conversion_table_schema("One completed solution-copy table."),
        },
        "preserveExistingDiagrams": {"type": "boolean"},
        "parts": {
            "type": "array",
            "description": (
                "Structured source parts. Put visible part tasks here; use subparts for nested (i)/(ii) items; "
                "do not create blank marked parts. If parts carry marks, top-level marks must be 0."
            ),
            "items": source_conversion_part_schema(
                diagram_types,
                include_diagram_fields=include_diagram_fields,
                diagram_collection_only=diagram_collection_only,
            ),
        },
    }
    if include_diagram_fields:
        diagram = source_conversion_diagram_block_schema(diagram_description, diagram_types)
        properties["diagrams"] = {
            "type": "array",
            "description": (
                "Native source diagrams. Use this field for multiple source diagrams; do not also send diagram."
            ),
            "items": source_conversion_compact_diagram_block_schema("One native source diagram.", diagram_types),
        }
        properties["diagramLayout"] = {
            "type": "string",
            "enum": ["stacked", "columns"],
            "description": "Use columns for side-by-side top-level source diagrams.",
        }
        properties["diagramColumns"] = {"type": "integer", "minimum": 2, "maximum": 4}
        properties["solutionDiagrams"] = {
            "type": "array",
            "items": source_conversion_compact_diagram_block_schema(
                "One completed solution-copy diagram.", diagram_types
            ),
        }
        if not diagram_collection_only:
            properties["diagram"] = diagram
            properties["solutionDiagram"] = source_conversion_compact_diagram_block_schema(
                "Completed solution-copy diagram.", diagram_types
            )
    return {
        "type": "function",
        "name": "mauth_convert_source_question",
        "description": (
            "Convert one attached/pasted source question into native editable Mauth content. Preserve visible wording, "
            "maths, marks, parts, source diagram/table placement, and official solutions only when requested or supplied. "
            "Write inline maths as $\\overrightarrow{BT}$, not $\\$\\overrightarrow{BT}$ or other escaped-dollar artifacts. "
            "For currency values, write \\$400 as text or $400$ as a numeric value; never write $\\$400$ inside maths. "
            "Use native diagrams/tables, not prose fallbacks. Renderer guide: statsChart for statistical charts/density/"
            "normal/sketch axes; graph2d for coordinate, slope-field, Argand/locus, and implicit curves; graph3d for "
            "3D solids including sphereCap; vectorRayDiagram for no-axis scalar-product ray screenshots."
        ),
        "parameters": {
            "type": "object",
            "properties": properties,
            "required": required_fields,
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
            "graphs; vector2d for coordinate vectors and source-faithful no-axis vector/ray diagrams; statsChart for statistical charts, density curves, normal/sample-mean distributions, and histograms; setDiagram for Venn/set diagrams; "
            "graph3d for 3D diagrams with explicit points, segments, polygon faces, curved solids including sphereCap, and metadata.view3d az/el/bank in radians; image for uploaded images. "
            "For slope fields, use graph2d.data.slopeField rather than prose or loose line segments, and keep graph2d "
            "functions/features/ranges/display fields directly on graphConfig. Use relation functions for implicit "
            "solution curves when the source gives an implicit equation."
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
                    "Mauth diagram block. Provide { graphConfig, diagramAlign? }, or vectorRayDiagram for source "
                    "scalar-product ray diagrams. For Penrose geometry, use "
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
        "coordinate/function graphs, vector2d for coordinate vectors and source-faithful no-axis vector/ray diagrams, statsChart for statistics charts, density curves, normal/sample-mean distributions, and histograms, setDiagram for Venn/set "
        "diagrams, graph3d for 3D diagrams with explicit points, segments, faces, curved solids, and metadata.view3d az/el/bank in radians, and image only when an uploaded bitmap is explicitly required."
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
    source_request_text = request_text(current_messages, tool_outputs, attachments)
    source_diagram_types = source_conversion_diagram_types_for_text(source_request_text)
    source_diagram_fields = source_conversion_diagram_fields_enabled(source_request_text)
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
        return [mauth_convert_source_question_tool_definition(require_diagram=True, diagram_types=source_diagram_types)]
    if tool_outputs_mention(tool_outputs, QUESTION_PAYLOAD_REPAIR_TERMS) and repair_targets & {
        "mauth_tool",
        "mauth.actions.apply",
        "mauth.actions.preview",
    }:
        return [mauth_convert_source_question_tool_definition(require_diagram=True, diagram_types=source_diagram_types)]

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
                "posteditinspection",
                "diagramid",
                "targetid",
            ),
        ):
            return [mauth_make_diagram_for_question_tool_definition()]
        require_repaired_diagram = require_source_diagram or tool_outputs_mention(
            tool_outputs, ("diagram", "graphconfig", "graph config")
        )
        if repair_targets & {"mauth_convert_source_question"}:
            return [
                mauth_convert_source_question_tool_definition(
                    require_diagram=require_repaired_diagram,
                    diagram_types=source_diagram_types,
                    include_diagram_fields=source_diagram_fields,
                )
            ]
        return [mauth_question_upsert_tool_definition(require_diagram=require_repaired_diagram)]
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
        return [
            mauth_convert_source_question_tool_definition(
                require_diagram=require_source_diagram,
                diagram_types=source_diagram_types,
                include_diagram_fields=source_diagram_fields,
            )
        ]
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
        mauth_convert_source_question_tool_definition(
            require_diagram=require_source_diagram,
            diagram_types=source_diagram_types,
            include_diagram_fields=source_diagram_fields,
        )
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


def assistant_instruction_profile(
    intent: AssistantRequestIntent,
    *,
    attachments: list[AssistantAttachment] | None = None,
    tool_outputs: list[AssistantToolOutput] | None = None,
) -> str:
    if tool_outputs:
        return "repair"
    if intent.kind == "append_source_question" or (attachments and intent.asks_to_write_question):
        return "sourceConversion"
    if intent.kind == "add_diagram":
        return "diagramFollowup"
    if intent.kind in {"solution_or_marking", "write_all_solutions"}:
        return "solutionEdit"
    if intent.kind in {"layout_check", "response_space", "formatting"}:
        return "layout"
    return "general"


def instruction_profile_brain_text(profile: str, brain_text: str) -> str:
    if profile != "sourceConversion" or len(brain_text) <= SOURCE_CONVERSION_BRAIN_CONTEXT_CHARS:
        return brain_text
    suffix = "\n...[source-conversion brain context truncated]"
    limit = max(0, SOURCE_CONVERSION_BRAIN_CONTEXT_CHARS - len(suffix))
    return f"{brain_text[:limit]}{suffix}"


def source_conversion_diagram_contract(diagram_fields_enabled: bool, diagram_types: list[str] | None = None) -> str:
    if diagram_fields_enabled:
        if source_conversion_diagram_collection_only(diagram_types):
            return (
                "- If the source attachment includes visible mathematical diagrams, include them in diagrams in "
                "the same replacement payload, before structured parts when the teacher asks for parts under the diagrams. "
                "The schema for this request exposes diagrams, not diagram, because multiple native diagrams are expected. "
                "Do not submit a text-only replacement. Do not replace a visible mathematical diagram with prose such as "
                '"The diagram shows...".'
            )
        return (
            "- If the source attachment includes a visible mathematical diagram, include it in diagram or diagrams in "
            "the same replacement payload, before structured parts when the teacher asks for parts under the diagram. "
            "Use exactly one of diagram or diagrams; for multiple source diagrams, use diagrams and omit diagram. "
            "Do not submit a text-only replacement. Do not replace a visible mathematical diagram with prose such as "
            '"The diagram shows...".'
        )
    return (
        "- This request is routed as table/text-only source conversion. Use table/tables and "
        "solutionTable/solutionTables for source tables; do not invent a diagram payload."
    )


def source_conversion_native_diagram_rules(diagram_fields_enabled: bool, diagram_types: list[str] | None) -> str:
    if not diagram_fields_enabled:
        return ""
    allowed = ordered_supported_diagram_types(diagram_types)
    if set(allowed) == set(SUPPORTED_DIAGRAM_TYPES):
        chooser = (
            "graph2d for coordinate/function/slope-field/Argand/locus/implicit graphs; statsChart for histograms, "
            "columns, probability tables/charts, density/normal curves, and blank sketch axes; graph3d for 3D points, "
            "edges, faces, prisms, pyramids, cones, cylinders, spheres, and spherical caps; vector2d or "
            "vectorRayDiagram for coordinate vectors and scalar-product ray diagrams; geometricConstruction/Penrose "
            "for schematic theorem geometry; setDiagram for Venn/set diagrams."
        )
    else:
        chooser = source_conversion_renderer_guide(allowed)
    lines = [
        "Native diagram rules:",
        f"- Choose renderer by source intent: {chooser}",
        "- Keep renderer fields inside diagram.graphConfig. Do not put type/data/options directly on diagram, and do not use config as a shortcut.",
        "- If the source intentionally places multiple diagrams side by side, put them in diagrams and set diagramLayout:'columns' with diagramColumns 2, 3, or 4. Do not fake columns with blank spaces, prose, or manually aligned text.",
        "- If rendered feedback reports label collisions or 3D label quality warnings, repair label placement or camera/dimension helpers while preserving the source geometry.",
    ]
    if source_conversion_diagram_collection_only(diagram_types):
        lines.append(
            "- This source needs multiple native diagrams. Put every diagram in the top-level diagrams array; do not send a separate top-level diagram field."
        )
    if "vector2d" in allowed:
        lines.append(
            "- For source scalar-product/vector-ray diagrams, prefer vectorRayDiagram. Use spaced TeX magnitude labels such as 2\\ \\text{units} and angle labels such as 45^\\circ. Angle markers must reference the actual two rays bounding the source angle, not merely adjacent rays; a nested marker can span outer rays even when another labelled ray lies inside that sector. For the common four-ray exam source with a right-angle square over b,d and a nested 45^\\circ arc over c,d, keep b perpendicular to d and use markers b-to-d and c-to-d. If writing raw vector2d, hide axes/grid and use metadata.vector2d.vectors, segmentLabels, and angleMarkers."
        )
    if "graph2d" in allowed:
        lines.append(
            "- For graph2d source diagrams, keep bounds, size, display flags, functions, and features at top-level graphConfig. Put only renderer data such as data.slopeField under data. For source line work and top views, use feature kind line_segment with x1/y1/x2/y2, not segment/vector or from/to aliases. Preserve labelled vertices, diagonals, midpoint points, and named vector rays at their source-relative incidence; use labelX/labelY to separate coincident or projected labels such as E and O. Use label with x/y for free labels, not free_label/coords/text, and preserve source vector labels exactly, such as \\vec a or \\underset{\\sim}{a}. For regions/loci, define boundary functions first and reference them by supported indexed region features such as region_curve_axis or region_between_curves with xMin/xMax and fillOpacity; do not use region_between, functionIndex1/functionIndex2, domainMin/domainMax, polygon point lists, opacity, or fillColor/strokeColor aliases. For Argand loci, preserve Arg(z) argument references and draw boundary rays from the origin separately from shifted circle boundaries."
        )
    if "graph3d" in allowed:
        lines.append(
            "- For graph3d source solids, use data.points for named vertices, data.segments for edges/diagonals/named angle rays, data.faces with points arrays for all visible polygon faces on prisms/pyramids, and data.solids with kind cone/cylinder/sphere/circle/sphereCap for curved solids. Do not use vertices arrays for faces. For curved solids, set renderStyle:'surface', 'wireframe', or 'outline' to match the source, and use data.dimensions entries for labelled height/radius guide lines such as h and r. Preserve source line/ray/vector notation in part text and segment labels; do not rewrite a source line or main diagonal BT/\\overleftrightarrow{BT} as \\overrightarrow{BT}. For a pyramid, include the base face and each triangular side face. For any named angle, the middle letter is the vertex and both bounding rays must be explicit segments: \\angle DMF needs D-M and M-F. If M is a midpoint on EF, the full E-F edge does not replace the needed M-F segment. For spherical caps whose source labels depth h, include a segment or data.dimensions entry labelled $h$. Use show:false to hide helper points/segments/solids; do not use visible:false. Use segment strokeStyle:'dashed' or dashed:true for hidden edges, and metadata.view3d az/el/bank in radians. Do not use camera.eye, metadata axis labels/show flags, degree camera values, fake axis helper points, or segment style."
        )
    if "statsChart" in allowed:
        lines.append(
            "- For statsChart source diagrams, use manualFrequencies/manualProbabilities when the source gives exact bar heights, density/normal for distribution curves, and blankAxes for student sketch axes. Preserve source x/y labels, range/yRange, binSize, barType, yAxisMode, dataMode, density points, and visible bar heights."
        )
    if "geometricConstruction" in allowed:
        lines.append(
            "- For geometricConstruction/Penrose source diagrams, preserve named points, lengths, angles, tangents, chords, and relationships with supported Substance instead of a prose diagram description."
        )
    if "setDiagram" in allowed:
        lines.append(
            "- For setDiagram sources, preserve shaded regions, labels, and counts as structured set-region data."
        )
    return "\n".join(lines)


def source_conversion_assistant_instructions(
    *,
    tool_hint: str,
    attachment_text: str,
    summary_text: str,
    brain_text: str,
    diagram_fields_enabled: bool = True,
    diagram_types: list[str] | None = None,
) -> str:
    diagram_contract = source_conversion_diagram_contract(diagram_fields_enabled, diagram_types)
    native_diagram_rules = source_conversion_native_diagram_rules(diagram_fields_enabled, diagram_types)
    return f"""You are the in-app Mauth Studio assistant for a high-school mathematics test editor.

Instruction profile: sourceConversion. Convert exactly the current attached/pasted source question into native editable Mauth content through the provided direct Mauth function.

{tool_hint}

Source-conversion tool contract:
- Use the focused direct tool named in the routing hint, normally mauth_convert_source_question. Do not inspect first when the compact summary already gives the target question or next append position.
{diagram_contract}
- Preserve source wording, marks, mathematical notation, line breaks that carry meaning, diagram/table placement, and official worked solutions when requested or supplied.
- If the source places multiple diagrams side by side, put them in diagrams and set diagramLayout:"columns" with diagramColumns matching the source. Do not stack them vertically or fake columns with blank spaces.
- For source prompts with visible part lines, preserve each part's actual mathematical task inside parts[i].text. Do not leave marked part text blank, type only labels, or move part expressions into the stem or diagram prose. Preserve nested items such as (f)(i) and (f)(ii) with parts[].subparts, not flattened top-level labels.
- For marked written-response parts/subparts, use at least 3 studentSpaceLines unless the answer surface is a table/diagram/graph. For multipart sources with part marks, set top-level marks/questionMarks to 0 and put marks on parts/subparts.
- For artifact-answer tasks such as complete a table, sketch/label a graph, draw a function, or shade a region, set answerSurface to table or diagram and provide the matching blank/partial student surface plus completed solutionTable/solutionDiagram when solutions are requested. Do not duplicate those same ticks in solutionText.
- Only include worked solutions when requested or present in the source. In solutionText, use hidden [[marks:n]] ticks whose total matches marks. Do not show visible [1 mark], (1 mark), "Solution (5 marks)", or "1 mark for..." notes.

{native_diagram_rules}

Attachment contract:
- Current request attachments:
{attachment_text}
- Inspect attachments directly and use them as source material. Screenshots/images may contain question text, diagrams, or formatting cues; key/text attachments may contain official solutions.
- Do not claim you cannot see an attachment when one is present. If content is unreadable, say exactly what was unclear and ask for a higher-resolution file only after attempting the relevant Mauth tool path.

Mauth conventions:
- Write complete teacher-ready mathematics, not placeholders or planning notes.
- Use $...$ for inline maths and $$...$$ for display maths. Preserve LaTeX backslashes exactly in JSON strings. Do not use \\[...\\], \\(...\\), escaped-dollar artifacts such as $\\$\\overrightarrow{{BT}}$, or $\\$400$.
- Do not show raw tool JSON, internal ids, provider payloads, or validation plumbing to the teacher unless explicitly asked.

Current compact document summary:
{summary_text}

Mauth rule-brain context:
{brain_text}
"""


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
    intent = classify_request_intent(compact_summary, current_messages, attachments)
    profile = assistant_instruction_profile(intent, attachments=attachments, tool_outputs=tool_outputs)
    source_request_text = (
        request_text(current_messages, attachments=attachments) if profile == "sourceConversion" else ""
    )
    source_diagram_types = (
        source_conversion_diagram_types_for_text(source_request_text) if profile == "sourceConversion" else None
    )
    source_diagram_fields = (
        source_conversion_diagram_fields_enabled(source_request_text) if profile == "sourceConversion" else True
    )
    brain_text = assistant_brain_context(
        current_messages,
        tool_outputs,
        selected_brain_files,
        attachments,
        source_conversion_diagram_types=source_diagram_types if source_diagram_fields else None,
    )
    tool_hint = focused_tool_hint(compact_summary, current_messages, attachments)
    brain_text = instruction_profile_brain_text(profile, brain_text)
    attachment_lines = [
        f"- {attachment.name} ({attachment.mimeType or 'unknown type'}, {attachment.sizeBytes or 0} bytes)"
        for attachment in attachments or []
    ]
    attachment_text = "\n".join(attachment_lines) if attachment_lines else "No attachments."
    if profile == "sourceConversion":
        return source_conversion_assistant_instructions(
            tool_hint=tool_hint,
            attachment_text=attachment_text,
            summary_text=summary_text,
            brain_text=brain_text,
            diagram_fields_enabled=source_diagram_fields,
            diagram_types=source_diagram_types,
        )
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
- Use the focused direct tool named in the routing hint. Do not inspect first when the compact summary already gives the target question or next append position.
- For one-question writes/replacements, use mauth_question_upsert/mauth_convert_source_question. Omitted diagram fields preserve diagrams; use diagrams: [] or preserveExistingDiagrams:false only when the teacher asks to remove diagrams.
- Use mauth.preview.inspect for focused question, diagram, solution, answer-space, and rendered-layout checks. Repair question.diagrams[].warnings, semanticWarnings, solution-slot fit, page occupancy, and layout warnings before saying work is correct.
- If semanticReview.required=true, compare the teacher request, question text, and diagram summary. Every named mathematical object, equation, label, and relationship used by the solution should appear in the artifact; repair mismatches with the focused tool.
- If a tool output has ok=false but committedDocument=true or repairTarget, repair that exact inserted target once using repairTarget.questionNumber/questionId and repairTarget.diagramId/targetId. Do not append a duplicate.
- For attachment-derived one-question conversions where the teacher asks for the diagram to be entered, included, placed under the prompt, or kept from the source, use mauth_convert_source_question and include it in diagram or diagrams in the same replacement payload; use exactly one of diagram or diagrams, never both. For multiple source diagrams, use diagrams and omit diagram. Do not submit a text-only replacement. Do not replace a visible mathematical diagram with prose such as "The diagram shows...".
- For source prompts with visible part lines, preserve each part's actual mathematical task inside parts[i].text. Do not leave marked part text blank, type only labels, or move part expressions into the stem or diagram prose. Preserve nested items such as (f)(i) and (f)(ii) with parts[].subparts, not flattened top-level labels. For marked written-response parts/subparts, use at least 3 studentSpaceLines unless the answer surface is a table/diagram/graph. For multipart sources with part marks, set top-level marks/questionMarks to 0 and put marks on parts/subparts.
- For artifact-answer tasks such as complete a table, sketch/label a graph, draw a function, or shade a region, set answerSurface to table or diagram and provide the matching blank/partial student surface plus completed solutionTable/solutionDiagram when solutions are requested.
- For artifact-answer tasks with solutionTable/solutionDiagram, do not put [[marks:n]] ticks in solutionText for the same item. The completed surface receives the item's red ticks automatically; use solutionText only for an unmarked note.
- Only include worked solutions when requested or present in the source. In solutionText, use hidden [[marks:n]] ticks whose total matches marks. Do not show visible [1 mark], (1 mark), "Solution (5 marks)", or "1 mark for..." notes.
- For focused mark-allocation, tick, QED-mark, or solution-only edits: Do not use mauth_question_upsert. Use mauth_write_solutions_for_questions, preserve wording and diagrams, and Preserve existing diagrams unless removal is explicit.
- For answer-space edits, use mauth_author_adjust_response_spaces. For formatting/layout edits, use mauth_fix_question_formatting. For broad print checks, use mauth_check_document_layout and repair page overflow, missing answer surfaces, solution-space mismatch, oversized diagrams, blank-page risks, and print-risk items with the narrow owning tool.
- For focused diagram follow-ups, use mauth_make_diagram_for_question with {{graphConfig:{{type:...}}}}. Choose graph2d for coordinate/function/slope-field graphs, vector2d for coordinate vectors and source ray diagrams, statsChart for statistics charts/density/normal/sketch axes, setDiagram for Venn diagrams, graph3d for 3D solids, geometricConstruction for schematic theorem geometry, and image only for intended bitmaps. Do not use standardDiagram recipe names.
- For statsChart source diagrams, preserve labels, range/yRange, binSize, barType, yAxisMode, dataMode, density points, and visible bar heights instead of only matching the rough chart shape.
- For Penrose geometry, supported Substance is the normal AI geometry path in graphConfig.options.substanceSource. Use predicates such as CircleThrough, OnCircle, Tangent, Segment, ParallelToSegment, PerpendicularToSegment, LabelsSegment, LabelsAngle, and RightAngle. Hide auxiliary centres with Label centre $\,$ and HidePoint(centre). Keep visible labels matched to the question.
- For source scalar-product/vector-ray diagrams, prefer vectorRayDiagram. Angle markers must reference the actual two rays bounding the source angle, not merely adjacent rays; nested source markings may span outer rays with another labelled ray inside. If writing raw vector2d, hide axes/grid and use metadata.vector2d.vectors, segmentLabels, and angleMarkers.
- For graph2d source diagrams, keep bounds, size, display flags, functions, and features at top-level graphConfig. Put only renderer data such as data.slopeField under data. Use label with x/y for free labels and line_segment with x1/y1/x2/y2 for segments; do not use free_label, polygon, coords, point-list polygons, fillColor, or strokeColor. For source top-view or line-work diagrams, preserve labelled vertices, diagonals, midpoint points, and named vector rays at their source-relative incidence; use labelX/labelY to separate coincident or projected labels such as E and O. For regions/loci, define boundary functions first and reference them by supported region feature indices; use region_curve_axis or region_between_curves with xMin/xMax and fillOpacity, not region_between, functionIndex1/functionIndex2, domainMin/domainMax, or opacity. For Argand loci, preserve Arg(z) argument references and draw boundary rays from the origin separately from shifted circle boundaries.
- For graph3d source solids, use data.points for named vertices, data.segments for edges/diagonals, data.faces with points arrays for polygon faces on prisms/pyramids, and data.solids with kind cone/cylinder/sphere/circle/sphereCap for curved solids. Do not use vertices arrays for faces. Preserve source line/ray/vector notation in part text and segment labels; do not rewrite a source line or main diagonal BT/\overleftrightarrow{{BT}} as \overrightarrow{{BT}}. For spherical caps, use kind:'sphereCap' with center, radius, height/depth, and axis/normal rather than a full sphere placeholder; include a segment or data.dimensions label '$h$' when the source labels cap depth h. Use show:false to hide helper points/segments/solids; do not use visible:false. Use segment strokeStyle:'dashed' or dashed:true for hidden edges, and metadata.view3d az/el/bank in radians. Do not use camera.eye, metadata axis labels/show flags, degree camera values, fake axis helper points, or segment style.
- Always call mauth_tool with {{"name":"<mauth tool name>","arguments":{{...}}}}. Put actions/file paths/options inside arguments. Preview low-level action batches before apply. If validationIssues are returned, repair those exact paths once.
- Preserve LaTeX backslashes exactly in JSON strings and use $...$ / $$...$$, not \[...\] or \(...\). For currency, write \\$400 as text or $400$ as a numeric value; never write $\\$400$.
- Do not show raw tool JSON, internal ids, provider payloads, or validation plumbing to the teacher unless they explicitly ask for implementation details.

Attachment contract:
- Current request attachments:
{attachment_text}
- If an attachment is present, inspect it directly and use it as source material for the teacher request. Screenshots/images may contain question text, diagrams, or formatting cues. PDFs may contain source exams or assessment pages. Word and text-like files are extracted to readable text before the provider call.
- For conversion from attached PDFs/screenshots/Word/text files, preserve original line breaks, inline-vs-display maths intent, diagrams, marks, and pagination when the teacher asks for fidelity. Keep the first pass focused if the teacher asks for only one question or one visible page.
- When the source shows "a)", "b)", "c)" or similar, convert them to structured parts whose text contains the visible part expression or instruction. If the source diagram belongs between the stem and the parts, put it in question-level diagram/diagrams and then emit parts underneath it; do not make empty parts.
- For source vector diagrams with only magnitudes, angles, and labelled rays from a common point, recreate the diagram as an editable native vector2d diagram with axes/grid hidden. Use vector components as source-faithful ray directions, metadata.vector2d.segmentLabels for magnitudes, and metadata.vector2d.angleMarkers for right-angle/angle labels. Angle-marker endpoints must be the actual two rays bounding the marked angle in the source, not just adjacent rays; nested markings may span outer rays with another labelled ray inside. Use geometricConstruction/Penrose for theorem geometry, not for source ray diagrams where relative ray placement must match the screenshot.
- Do not claim you cannot see an attachment when the request includes one. If the content is unreadable, say exactly what was unclear and ask for a higher-resolution file only after attempting the relevant Mauth tool path.

Authoring quality bar:
- Write complete teacher-ready mathematics, not placeholders or planning notes.
- Include enough information for students to solve the problem. Include a concise worked solution only when requested or present in the source material.
- Mathematical validity is mandatory. Before calling a write/edit tool, internally check that every conclusion follows from the stated givens and that the solution does not assume information visible only in an imagined diagram.
- Never emit a proof question whose worked solution says the requested conclusion does not follow, cannot be proven, or proves a different conclusion. If your first draft is invalid, change the question statement before calling the tool.
- Preserve Mauth conventions: no typed automatic question labels, inline maths with $...$, display maths with $$...$$ only for standalone working, generous student space, and solution-only solution content. The app may raise studentSpaceLines to preserve solution fit. Do not use \\[...\\], \\(...\\), or escaped-dollar artifacts such as $\\$\\overrightarrow{{BT}}$ or $\\$400$.
- A student answer surface must keep the same layout in both copies. For sketch/label/table tasks, the solution copy should replace the blank student diagram/table with a completed solution diagram/table in the same document position, not add a separate solution below it.
- For multipart questions, use the structured parts array on mauth_question_upsert or mauth.question.upsert, and use parts[].subparts for nested "(i)", "(ii)" items. Do not type visible "(a)", "(b)", or "(i)" labels into question text.
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


def attachment_data_url(mime_type: str, data: bytes) -> str:
    payload = base64.b64encode(data).decode("ascii")
    return f"data:{mime_type};base64,{payload}"


def attachment_data_size(attachment: AssistantAttachment) -> int:
    data = attachment_data_bytes(attachment.dataUrl)
    if data:
        return len(data)
    if isinstance(attachment.sizeBytes, int):
        return max(0, attachment.sizeBytes)
    return 0


def attachment_is_optimizable_image(attachment: AssistantAttachment) -> bool:
    mime_type = (attachment.mimeType or "").lower()
    return mime_type in {"image/png", "image/jpeg", "image/jpg", "image/webp"}


def image_name_with_extension(name: str, extension: str) -> str:
    base = name.rsplit(".", 1)[0] if "." in name else name
    return f"{base}{extension}"


def rgb_image_for_provider(image: Image.Image) -> Image.Image:
    image = ImageOps.exif_transpose(image)
    if image.mode in {"RGBA", "LA"} or "transparency" in image.info:
        transparent = image.convert("RGBA")
        background = Image.new("RGBA", transparent.size, (255, 255, 255, 255))
        background.alpha_composite(transparent)
        return background.convert("RGB")
    return image.convert("RGB")


def resize_image_for_provider(image: Image.Image, max_long_edge: int) -> tuple[Image.Image, bool]:
    if max_long_edge <= 0:
        return image, False
    long_edge = max(image.size)
    if long_edge <= max_long_edge:
        return image, False
    scale = max_long_edge / long_edge
    size = (max(1, round(image.width * scale)), max(1, round(image.height * scale)))
    return image.resize(size, Image.Resampling.LANCZOS), True


def sampled_corner_background(image: Image.Image) -> tuple[int, int, int]:
    width, height = image.size
    if width <= 0 or height <= 0:
        return (255, 255, 255)
    corners = [
        image.getpixel((0, 0)),
        image.getpixel((width - 1, 0)),
        image.getpixel((0, height - 1)),
        image.getpixel((width - 1, height - 1)),
    ]
    return tuple(round(sum(int(pixel[channel]) for pixel in corners) / len(corners)) for channel in range(3))


def trim_image_border_for_provider(image: Image.Image) -> tuple[Image.Image, bool]:
    if not assistant_image_trim_borders_enabled():
        return image, False
    if image.width < 32 or image.height < 32:
        return image, False

    background = Image.new("RGB", image.size, sampled_corner_background(image))
    diff = ImageChops.difference(image, background).convert("L")
    mask = diff.point(lambda value: 255 if value >= assistant_image_trim_background_threshold() else 0)
    bbox = mask.getbbox()
    if not bbox:
        return image, False

    left, top, right, bottom = bbox
    padding = assistant_image_trim_padding_px()
    left = max(0, left - padding)
    top = max(0, top - padding)
    right = min(image.width, right + padding)
    bottom = min(image.height, bottom + padding)
    if left <= 0 and top <= 0 and right >= image.width and bottom >= image.height:
        return image, False
    if right - left < 32 or bottom - top < 32:
        return image, False
    return image.crop((left, top, right, bottom)), True


def encoded_provider_image_candidates(image: Image.Image) -> list[tuple[str, str, bytes]]:
    candidates: list[tuple[str, str, bytes]] = []
    with suppress(OSError, ValueError):
        buffer = io.BytesIO()
        image.save(
            buffer,
            format="WEBP",
            quality=assistant_image_webp_quality(),
            method=6,
        )
        candidates.append(("image/webp", ".webp", buffer.getvalue()))
    with suppress(OSError, ValueError):
        buffer = io.BytesIO()
        image.save(buffer, format="JPEG", quality=88, optimize=True)
        candidates.append(("image/jpeg", ".jpg", buffer.getvalue()))
    return candidates


def provider_optimized_attachment(attachment: AssistantAttachment) -> AssistantAttachment:
    if not env_flag_enabled("ASSISTANT_OPTIMIZE_IMAGE_ATTACHMENTS", default=True):
        return attachment
    if not attachment_is_optimizable_image(attachment):
        return attachment

    original_bytes = attachment_data_bytes(attachment.dataUrl)
    if not original_bytes:
        return attachment

    try:
        with Image.open(io.BytesIO(original_bytes)) as image:
            provider_image = rgb_image_for_provider(image)
            provider_image, trimmed = trim_image_border_for_provider(provider_image)
            provider_image, resized = resize_image_for_provider(provider_image, assistant_image_max_long_edge())
    except (OSError, UnidentifiedImageError, ValueError):
        return attachment

    if not trimmed and not resized and len(original_bytes) < assistant_image_optimize_min_bytes():
        return attachment

    candidates = encoded_provider_image_candidates(provider_image)
    if not candidates:
        return attachment
    mime_type, extension, optimized_bytes = min(candidates, key=lambda candidate: len(candidate[2]))
    if not trimmed and not resized and len(optimized_bytes) >= len(original_bytes):
        return attachment

    return AssistantAttachment(
        id=attachment.id,
        name=image_name_with_extension(attachment.name or "attachment", extension),
        mimeType=mime_type,
        dataUrl=attachment_data_url(mime_type, optimized_bytes),
        sizeBytes=len(optimized_bytes),
    )


def provider_optimized_attachments(attachments: list[AssistantAttachment] | None) -> list[AssistantAttachment]:
    return [provider_optimized_attachment(attachment) for attachment in attachments or []]


def attachment_image_dimensions(attachment: AssistantAttachment) -> tuple[int, int] | None:
    if not attachment_is_optimizable_image(attachment):
        return None
    data = attachment_data_bytes(attachment.dataUrl)
    if not data:
        return None
    with suppress(OSError, UnidentifiedImageError, ValueError), Image.open(io.BytesIO(data)) as image:
        return image.size
    return None


def assistant_attachment_payload_stats(attachments: list[AssistantAttachment] | None) -> dict[str, Any]:
    original = list(attachments or [])[:MAX_ASSISTANT_ATTACHMENTS]
    optimized = provider_optimized_attachments(original)
    raw_bytes = sum(attachment_data_size(attachment) for attachment in original)
    provider_bytes = sum(attachment_data_size(attachment) for attachment in optimized)
    raw_data_chars = sum(len(attachment.dataUrl or "") for attachment in original)
    provider_data_chars = sum(len(attachment.dataUrl or "") for attachment in optimized)
    raw_image_dimensions = [
        dimensions for attachment in original if (dimensions := attachment_image_dimensions(attachment))
    ]
    provider_image_dimensions = [
        dimensions for attachment in optimized if (dimensions := attachment_image_dimensions(attachment))
    ]
    raw_image_pixels = sum(width * height for width, height in raw_image_dimensions)
    provider_image_pixels = sum(width * height for width, height in provider_image_dimensions)
    optimized_count = sum(
        1
        for raw, provider in zip(original, optimized, strict=False)
        if raw.dataUrl != provider.dataUrl or raw.mimeType != provider.mimeType or raw.name != provider.name
    )
    return {
        "attachmentLimit": MAX_ASSISTANT_ATTACHMENTS,
        "rawAttachmentCount": len(attachments or []),
        "providerAttachmentCount": len(optimized),
        "omittedAttachmentCount": max(0, len(attachments or []) - MAX_ASSISTANT_ATTACHMENTS),
        "rawAttachmentBytes": raw_bytes,
        "providerAttachmentBytes": provider_bytes,
        "rawAttachmentDataChars": raw_data_chars,
        "providerAttachmentDataChars": provider_data_chars,
        "rawImagePixels": raw_image_pixels,
        "providerImagePixels": provider_image_pixels,
        "rawImageMaxLongEdge": max((max(dimensions) for dimensions in raw_image_dimensions), default=0),
        "providerImageMaxLongEdge": max((max(dimensions) for dimensions in provider_image_dimensions), default=0),
        "optimizedAttachmentCount": optimized_count,
        "imageDetail": assistant_image_detail(),
        "imageMaxLongEdge": assistant_image_max_long_edge(),
        "imageTrimBorders": assistant_image_trim_borders_enabled(),
    }


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
    for attachment in provider_optimized_attachments(attachments[:MAX_ASSISTANT_ATTACHMENTS]):
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
            items.append({"type": "input_image", "image_url": data_url, "detail": assistant_image_detail()})
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


def _has_positive_mark(value: Any) -> bool:
    if isinstance(value, bool):
        return False
    if isinstance(value, int | float):
        return value > 0
    if isinstance(value, str):
        with suppress(ValueError):
            return float(value) > 0
    return False


def _parts_carry_marks(parts: Any) -> bool:
    if not isinstance(parts, list):
        return False
    for part in parts:
        if not isinstance(part, dict):
            continue
        if _has_positive_mark(part.get("marks")):
            return True
        if _parts_carry_marks(part.get("subparts")):
            return True
    return False


def _normalized_graph3d_payload(value: Any) -> Any:
    if isinstance(value, list):
        return [_normalized_graph3d_payload(item) for item in value]
    if not isinstance(value, dict):
        return value

    normalized = {key: _normalized_graph3d_payload(item) for key, item in value.items()}
    if normalized.get("type") != "graph3d":
        return normalized

    data = normalized.get("data")
    if isinstance(data, dict):
        graph3d_data = dict(data)
        if not isinstance(graph3d_data.get("points"), list) and isinstance(data.get("vertices"), list):
            graph3d_data["points"] = data["vertices"]
        graph3d_data.pop("vertices", None)
        if not isinstance(graph3d_data.get("segments"), list) and isinstance(data.get("edges"), list):
            graph3d_data["segments"] = data["edges"]
        graph3d_data.pop("edges", None)
        if not isinstance(graph3d_data.get("dimensions"), list) and isinstance(data.get("dimensionLines"), list):
            graph3d_data["dimensions"] = data["dimensionLines"]
        graph3d_data.pop("dimensionLines", None)
        if not isinstance(graph3d_data.get("solids"), list) and isinstance(data.get("surfaces"), list):
            graph3d_data["solids"] = data["surfaces"]
        graph3d_data.pop("surfaces", None)
        faces = data.get("faces")
        if isinstance(faces, list):
            graph3d_data["faces"] = [
                _normalized_graph3d_face(face) if isinstance(face, dict) else face for face in faces
            ]
        normalized["data"] = graph3d_data

    metadata = normalized.get("metadata")
    if not isinstance(metadata, dict):
        return normalized

    view3d = metadata.get("view3d")
    if isinstance(view3d, dict):
        normalized["metadata"] = {"view3d": {key: view3d[key] for key in GRAPH3D_VIEW_KEYS if key in view3d}}
    else:
        normalized.pop("metadata", None)
    return normalized


def _normalized_graph3d_face(face: dict[str, Any]) -> dict[str, Any]:
    normalized = dict(face)
    if not isinstance(normalized.get("points"), list) and isinstance(face.get("vertices"), list):
        normalized["points"] = face["vertices"]
    normalized.pop("vertices", None)
    return normalized


def normalized_mauth_arguments(arguments: dict[str, Any], mauth_tool_name: str | None) -> dict[str, Any]:
    if mauth_tool_name not in QUESTION_AUTHORING_TOOL_NAMES:
        return arguments
    normalized = _normalized_graph3d_payload(arguments)
    if not isinstance(normalized, dict):
        return arguments
    if not _parts_carry_marks(normalized.get("parts")):
        return normalized
    if "marks" in normalized:
        normalized["marks"] = 0
    if "questionMarks" in normalized:
        normalized["questionMarks"] = 0
    return normalized


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
        mauth_arguments = (
            arguments if direct_mauth_tool_name else mauth_arguments_from_tool_arguments(arguments, mauth_tool_name)
        )
        mauth_arguments = normalized_mauth_arguments(mauth_arguments, mauth_tool_name)
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
                "mauthArguments": mauth_arguments,
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


def direct_assistant_help_response(model: str) -> dict[str, Any]:
    return {
        "configured": True,
        "model": model,
        "message": (
            "I can help edit the current Mauth document: create or convert questions, build native diagrams, "
            "write worked solutions, adjust answer space and formatting, check layout, and work with project files. "
            "For the best result, name the question number and attach or paste the source when converting an exam item."
        ),
        "responseId": None,
        "toolCalls": [],
        "usage": zero_token_usage_summary(model, source="native Mauth assistant help; no OpenAI tokens used"),
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


def should_use_direct_assistant_help(request: AssistantChatRequest) -> bool:
    if request.previousResponseId or request.toolOutputs or request.attachments:
        return False
    text = current_request_text(request.messages)
    return any(term in text for term in ASSISTANT_HELP_REQUEST_TERMS)


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

    if should_use_direct_assistant_help(request):
        return direct_assistant_help_response(model)

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
