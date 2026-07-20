import html
import json
import re
from pathlib import Path

DISPLAY_MATH = re.compile(r"(?<!\\)\$\$(.+?)(?<!\\)\$\$", re.DOTALL)
INLINE_MATH = re.compile(r"(?<!\\)\$((?:\\\$|[^$\n])+?)(?<!\\)\$")
INLINE_FORMATTING = re.compile(r"(\*\*\*[^*\n]+?\*\*\*|\*\*[^*\n]+?\*\*|\*[^*\n]+?\*)")
ESCAPED_TEXT_DOLLAR = re.compile(r"\\\$")
LEADING_STYLE_COMMAND = re.compile(r"^\\(?:display|text|script|scriptscript)style\b")
SIMPLE_INLINE_NUMBER = re.compile(r"^[+-]?(?:(?:\d+(?:[ ,]\d{3})+|\d+)(?:\.\d+)?|\.\d+)(?:\s*%)?$")


class FormattingEngine:
    def __init__(self, config_dir: Path):
        self.config_dir = config_dir
        self.configs = self._load_configs()

    def render_test(self, test: dict, config_id: str = "default") -> dict:
        config = self.configs[config_id]
        blocks = []
        sections = []
        question_number = 1

        for section in test.get("sections", [{"title": "Questions", "questions": test.get("questions", [])}]):
            section_blocks = []
            for question in section["questions"]:
                rendered = self.render_question(question, question_number, config)
                blocks.append(rendered["block"])
                section_blocks.append(rendered["block"])
                question_number += 1
            sections.append(
                {
                    "title": section["title"],
                    "instructions": section.get("instructions", ""),
                    "blocks": section_blocks,
                }
            )

        html_output = self._test_html(test, sections, config)
        return {"html": html_output, "blocks": blocks, "sections": sections, "formatting": config}

    def render_question(self, question: dict, number: int, config: dict) -> dict:
        marks = question.get("totalMarks", 0)
        marks_label = f'<span class="marks">({self._mark_label(marks)})</span>' if config.get("showMarks", True) else ""
        latex = question.get("questionLatex") or ""
        content = self._content_blocks_html(question.get("contentBlocks") or self._legacy_content_blocks(question))
        table = self._table_html(question.get("tableConfig"))
        parts = self._parts_html(question.get("parts") or [])
        block = {
            "type": "question",
            "number": number,
            "questionText": question.get("questionText", ""),
            "questionLatex": latex,
            "contentBlocks": question.get("contentBlocks") or [],
            "parts": question.get("parts") or [],
            "marks": marks,
            "marksBreakdown": question.get("marksBreakdown", {}),
            "graphConfig": question.get("graphConfig"),
            "tableConfig": question.get("tableConfig"),
            "diagramPosition": config.get("diagramPosition", "below"),
            "spacing": config.get("questionSpacing", "large"),
        }
        latex_html = f'<div class="question-latex">{html.escape(latex)}</div>' if latex else ""
        block["html"] = (
            f'<article class="question question-spacing-{block["spacing"]}">'
            f'<div class="question-row"><span class="question-number">{number}.</span>'
            f'<div class="question-text">{content}</div>{marks_label}</div>'
            f"{latex_html}{parts}{table}"
            f"</article>"
        )
        return {"block": block}

    def _legacy_content_blocks(self, question: dict) -> list:
        blocks = [{"kind": "text", "text": question.get("questionText", "")}]
        if question.get("graphConfig"):
            blocks.append({"kind": "diagram", "diagramAlign": "center", "graphConfig": question["graphConfig"]})
        return blocks

    def _content_blocks_html(self, blocks: list) -> str:
        return "".join(self._content_block_html(block) for block in blocks)

    @classmethod
    def _content_block_html(cls, block: dict) -> str:
        if block.get("kind") == "diagram":
            return cls._diagram_html(block.get("graphConfig"), block.get("diagramAlign"))
        if block.get("kind") == "choices":
            return cls._choices_html(block)
        if block.get("kind") == "table":
            return cls._table_block_html(block)
        if block.get("kind") == "columns":
            return cls._columns_html(block)
        return f'<div class="text-block">{cls._mixed_math_html(block.get("text", ""))}</div>'

    @classmethod
    def _columns_html(cls, block: dict) -> str:
        columns = block.get("columns") if isinstance(block.get("columns"), list) else []
        column_count = (
            block.get("columnCount") if block.get("columnCount") in {2, 3, 4} else max(2, min(4, len(columns) or 2))
        )
        rendered_columns = []
        for index in range(column_count):
            column_blocks = columns[index] if index < len(columns) and isinstance(columns[index], list) else []
            rendered_columns.append(f'<div class="content-column">{cls._content_blocks_html(column_blocks)}</div>')
        return f'<div class="content-columns content-columns-{column_count}">{"".join(rendered_columns)}</div>'

    @classmethod
    def _choices_html(cls, block: dict) -> str:
        choices = block.get("choices") if isinstance(block.get("choices"), list) else []
        choices = [str(choice) for choice in choices] or [""]
        style = block.get("numberingStyle") or "roman"
        css_class = f"choice-list choice-list-{html.escape(str(block.get('layout') or 'vertical'))}"
        solution_answer_index = block.get("solutionAnswerIndex")
        valid_solution_answer = (
            isinstance(solution_answer_index, int)
            and not isinstance(solution_answer_index, bool)
            and 0 <= solution_answer_index < len(choices)
        )
        items = []
        for index, choice in enumerate(choices):
            label = cls._choice_label(style, index)
            selected = valid_solution_answer and solution_answer_index == index
            item_class = "choice-item choice-item-solution-answer" if selected else "choice-item"
            label_class = "choice-label choice-label-answer-ring" if selected else "choice-label"
            items.append(
                f'<div class="{item_class}"><span class="{label_class}">{html.escape(label)}</span>'
                f'<div class="choice-content">{cls._mixed_math_html(choice)}</div></div>'
            )
        return f'<div class="{css_class}">{"".join(items)}</div>'

    @classmethod
    def _table_block_html(cls, block: dict) -> str:
        headers = block.get("headers") if isinstance(block.get("headers"), list) else []
        rows = block.get("rows") if isinstance(block.get("rows"), list) else []
        headers = [str(header) for header in headers]
        rows = [[str(cell) for cell in row] for row in rows if isinstance(row, list)]
        column_count = max([len(headers), *(len(row) for row in rows), 1])
        align = block.get("tableAlign") if block.get("tableAlign") in {"left", "center", "right"} else "center"
        cell_alignment = (
            block.get("cellAlignment") if block.get("cellAlignment") in {"left", "center", "right"} else "center"
        )
        css_class = f"math-table-wrap math-table-{align}"
        cell_class = f"math-table-cell math-table-cell-{cell_alignment}"

        def padded(values: list[str]) -> list[str]:
            return values + [""] * max(0, column_count - len(values))

        header_html = ""
        if block.get("showHeader", True):
            cells = "".join(f'<th class="{cell_class}">{cls._mixed_math_html(cell)}</th>' for cell in padded(headers))
            header_html = f"<thead><tr>{cells}</tr></thead>"

        row_html = []
        for row in rows:
            cells = "".join(f'<td class="{cell_class}">{cls._mixed_math_html(cell)}</td>' for cell in padded(row))
            row_html.append(f"<tr>{cells}</tr>")

        return f'<div class="{css_class}"><table class="math-table">{header_html}<tbody>{"".join(row_html)}</tbody></table></div>'

    @classmethod
    def _choice_label(cls, style: str, index: int) -> str:
        if style == "bullet":
            return "•"
        if style == "decimal":
            return f"{index + 1}."
        if style == "upper-alpha":
            return f"{chr(65 + index)}."
        if style == "lower-alpha":
            return f"{chr(97 + index)}."
        return f"{cls._roman_label(index)}."

    @classmethod
    def _mixed_math_html(cls, source: str) -> str:
        placeholders = []

        def display_replacer(match):
            placeholders.append(f'<div class="display-latex">{html.escape(match.group(1).strip())}</div>')
            return f"@@MATH{len(placeholders) - 1}@@"

        def inline_replacer(match):
            latex = match.group(1).strip()
            plain_text = cls._plain_text_for_simple_inline_latex(latex)
            if plain_text is not None:
                placeholders.append(html.escape(plain_text))
                return f"@@MATH{len(placeholders) - 1}@@"
            if latex and not re.match(r"^\\(?:display|text|script|scriptscript)style\b", latex):
                latex = f"\\displaystyle {latex}"
            placeholders.append(f'<span class="inline-latex">{html.escape(latex)}</span>')
            return f"@@MATH{len(placeholders) - 1}@@"

        text = DISPLAY_MATH.sub(display_replacer, source or "")
        text = INLINE_MATH.sub(inline_replacer, text)
        text = html.escape(ESCAPED_TEXT_DOLLAR.sub("$", text)).replace("\n", "<br>")
        text = INLINE_FORMATTING.sub(cls._inline_formatting_html, text)
        for index, replacement in enumerate(placeholders):
            text = text.replace(f"@@MATH{index}@@", replacement)
        return text

    @staticmethod
    def _plain_text_for_simple_inline_latex(latex: str) -> str | None:
        candidate = LEADING_STYLE_COMMAND.sub("", latex.strip()).strip()
        candidate = re.sub(r"\\,", " ", candidate)
        candidate = candidate.replace(r"\%", "%")
        candidate = re.sub(r"\s+", " ", candidate)
        candidate = re.sub(r"\s+(?=%$)", "", candidate).strip()
        return candidate if SIMPLE_INLINE_NUMBER.match(candidate) else None

    @staticmethod
    def _inline_formatting_html(match: re.Match) -> str:
        token = match.group(0)
        if token.startswith("***") and token.endswith("***"):
            return f"<strong><em>{token[3:-3]}</em></strong>"
        if token.startswith("**") and token.endswith("**"):
            return f"<strong>{token[2:-2]}</strong>"
        return f"<em>{token[1:-1]}</em>"

    @classmethod
    def _parts_html(cls, parts: list) -> str:
        if not parts:
            return ""
        part_html = []
        for index, part in enumerate(parts):
            label = html.escape(part.get("label") or chr(97 + index))
            content_blocks = part.get("contentBlocks") or [{"kind": "text", "text": part.get("text", "")}]
            subparts = part.get("subparts") or []
            text = "".join(cls._content_block_html(block) for block in content_blocks)
            marks = int(part.get("marks", 0))
            marks_html = "" if subparts else f'<span class="part-marks">({cls._mark_label(marks)})</span>'
            part_html.append(
                f'<li><span class="part-label">({label})</span>'
                f'<div class="part-text">{text}</div>'
                f"{marks_html}{cls._subparts_html(subparts)}</li>"
            )
        return f'<ol class="question-parts">{"".join(part_html)}</ol>'

    @classmethod
    def _subparts_html(cls, subparts: list) -> str:
        if not subparts:
            return ""
        subpart_html = []
        for index, subpart in enumerate(subparts):
            label = html.escape(subpart.get("label") or cls._roman_label(index))
            content_blocks = subpart.get("contentBlocks") or [{"kind": "text", "text": subpart.get("text", "")}]
            text = "".join(cls._content_block_html(block) for block in content_blocks)
            marks = int(subpart.get("marks", 0))
            subpart_html.append(
                f'<li><span class="subpart-label">({label})</span>'
                f'<div class="subpart-text">{text}</div>'
                f'<span class="part-marks">({cls._mark_label(marks)})</span></li>'
            )
        return f'<ol class="question-subparts">{"".join(subpart_html)}</ol>'

    @staticmethod
    def _roman_label(index: int) -> str:
        values = [
            (1000, "m"),
            (900, "cm"),
            (500, "d"),
            (400, "cd"),
            (100, "c"),
            (90, "xc"),
            (50, "l"),
            (40, "xl"),
            (10, "x"),
            (9, "ix"),
            (5, "v"),
            (4, "iv"),
            (1, "i"),
        ]
        remaining = index + 1
        result = ""
        for value, numeral in values:
            while remaining >= value:
                result += numeral
                remaining -= value
        return result

    @staticmethod
    def _mark_label(marks: int) -> str:
        return f"{marks} mark" if marks == 1 else f"{marks} marks"

    @staticmethod
    def _diagram_html(graph_config: dict | None, align: str | None = None) -> str:
        if not graph_config:
            return ""
        safe_align = align if align in {"left", "center", "right"} else "center"
        graph_type = graph_config.get("type", "diagram")
        if graph_type == "geometricConstruction":
            return FormattingEngine._geometric_diagram_html(graph_config, safe_align)
        if graph_type == "image":
            return FormattingEngine._image_diagram_html(graph_config, safe_align)
        graph_type_label = "2D graph" if graph_type in {"2d_graph", "function", "graph2d"} else str(graph_type)
        functions = graph_config.get("functions") if isinstance(graph_config.get("functions"), list) else []
        if "functions" not in graph_config and graph_config.get("expression"):
            functions = [
                {
                    "label": "f",
                    "expression": graph_config.get("expression"),
                    "latex": graph_config.get("latex"),
                    "color": "#0f766e",
                }
            ]
        function_items = "".join(
            "<li>"
            f"<span>{html.escape(str(function.get('label') or f'f{index + 1}'))}</span>: "
            f"{html.escape(str(function.get('latex') or function.get('expression') or ''))}"
            f"{FormattingEngine._piecewise_summary(function)}"
            f"{' (' + html.escape(str(function.get('color'))) + ')' if function.get('color') else ''}"
            "</li>"
            for index, function in enumerate(functions)
        )
        functions_html = f'<ol class="diagram-functions">{function_items}</ol>' if function_items else ""
        x_min = graph_config.get("xMin")
        x_max = graph_config.get("xMax")
        y_min = graph_config.get("yMin")
        y_max = graph_config.get("yMax")
        domain = (
            f"<span>Domain:</span> {html.escape(str(x_min))} to {html.escape(str(x_max))}"
            if x_min is not None and x_max is not None
            else ""
        )
        range_ = (
            f"<span>Range:</span> {html.escape(str(y_min))} to {html.escape(str(y_max))}"
            if y_min is not None and y_max is not None
            else ""
        )
        width = graph_config.get("widthPx")
        height = graph_config.get("heightPx")
        size = (
            f"<span>Size:</span> {html.escape(str(width))} by {html.escape(str(height))} px"
            if width is not None and height is not None
            else ""
        )
        x_major_step = graph_config.get("gridMajorStepX", graph_config.get("gridMajorStep"))
        y_major_step = graph_config.get("gridMajorStepY", graph_config.get("gridMajorStep"))
        x_minor_step = graph_config.get("gridMinorStepX", graph_config.get("gridMinorStep"))
        y_minor_step = graph_config.get("gridMinorStepY", graph_config.get("gridMinorStep"))
        grid_intervals = (
            "<span>Grid:</span> "
            f"x major {html.escape(str(x_major_step))}, y major {html.escape(str(y_major_step))}, "
            f"x minor {html.escape(str(x_minor_step))}, y minor {html.escape(str(y_minor_step))}"
            if all(step is not None for step in [x_major_step, y_major_step, x_minor_step, y_minor_step])
            else ""
        )
        options = [
            "grid on" if graph_config.get("showGrid", True) else "grid off",
            "major grid on" if graph_config.get("showMajorGrid", True) else "major grid off",
            "minor grid on" if graph_config.get("showMinorGrid", False) else "minor grid off",
            "axes on" if graph_config.get("showAxes", True) else "axes off",
            "arrows on" if graph_config.get("showArrows", True) else "arrows off",
            "function arrows on" if graph_config.get("showFunctionArrows", True) else "function arrows off",
            "equal scale on" if graph_config.get("equalScale", False) else "equal scale off",
        ]
        option_html = html.escape(", ".join(options))
        details = "".join(f"<div>{item}</div>" for item in [domain, range_, size, grid_intervals] if item)
        style = f' style="max-width:{html.escape(str(width))}px"' if width is not None else ""
        return (
            f'<div class="question-diagram question-diagram-{safe_align}"{style}>'
            f"<div><span>Diagram:</span> {html.escape(graph_type_label)}</div>"
            f'{functions_html}{details}<div class="diagram-options">{option_html}</div>'
            f"</div>"
        )

    @staticmethod
    def _image_diagram_html(graph_config: dict, safe_align: str) -> str:
        data = graph_config.get("data") if isinstance(graph_config.get("data"), dict) else {}
        src = str(data.get("src") or "")
        alt = html.escape(str(data.get("alt") or data.get("name") or "Uploaded diagram"), quote=True)
        width = graph_config.get("widthPx")
        height = graph_config.get("heightPx")
        style_parts = ["max-width:100%", "object-fit:contain"]
        if width is not None:
            style_parts.append(f"width:{html.escape(str(width), quote=True)}px")
        if height is not None:
            style_parts.append(f"max-height:{html.escape(str(height), quote=True)}px")
        style = f' style="{";".join(style_parts)}"'
        if not src:
            return f'<div class="question-diagram question-diagram-{safe_align}"><span>No image selected</span></div>'
        return (
            f'<div class="question-diagram question-diagram-{safe_align}">'
            f'<img src="{html.escape(src, quote=True)}" alt="{alt}"{style}>'
            f"</div>"
        )

    @staticmethod
    def _geometric_diagram_html(graph_config: dict, safe_align: str) -> str:
        data = graph_config.get("data") or {}
        objects = data.get("objects") or []
        relationships = data.get("relationships") or []
        object_names = ", ".join(str(item.get("name", "")) for item in objects if item.get("name"))
        relationship_names = ", ".join(str(item.get("type", "")) for item in relationships if item.get("type"))
        scale = graph_config.get("scalePercent") or (graph_config.get("options") or {}).get("scalePercent") or 100
        try:
            width = 420 * float(scale) / 100
        except (TypeError, ValueError):
            width = 420
        style = f' style="max-width:{html.escape(str(width))}px"' if width is not None else ""
        details = [
            f"<div><span>Objects:</span> {html.escape(object_names)}</div>" if object_names else "",
            f"<div><span>Relationships:</span> {html.escape(relationship_names)}</div>" if relationship_names else "",
        ]
        return (
            f'<div class="question-diagram question-diagram-{safe_align}"{style}>'
            "<div><span>Diagram:</span> Geometric construction</div>"
            f"{''.join(details)}"
            "</div>"
        )

    @staticmethod
    def _piecewise_summary(function: dict) -> str:
        if function.get("kind") != "piecewise":
            return ""
        pieces = function.get("pieces") or []
        if not pieces:
            return " piecewise"
        piece_html = "".join(
            "<li>"
            f"{html.escape(str(piece.get('expression', '')))}"
            f" for {html.escape(str(piece.get('xMin', '-inf')))}"
            f" {'&le;' if piece.get('includeStart', True) else '&lt;'} x"
            f" {'&le;' if piece.get('includeEnd', True) else '&lt;'}"
            f" {html.escape(str(piece.get('xMax', 'inf')))}"
            "</li>"
            for piece in pieces
        )
        return f'<ol class="diagram-piecewise">{piece_html}</ol>'

    @staticmethod
    def _table_html(table_config: dict | None) -> str:
        if not table_config:
            return ""
        headers = table_config.get("headers", [])
        rows = table_config.get("rows", [])
        header_html = "".join(f"<th>{html.escape(str(header))}</th>" for header in headers)
        row_html = "".join(
            "<tr>" + "".join(f"<td>{html.escape(str(cell))}</td>" for cell in row) + "</tr>" for row in rows
        )
        return f'<table class="question-table"><thead><tr>{header_html}</tr></thead><tbody>{row_html}</tbody></table>'

    def _test_html(self, test: dict, sections: list, config: dict) -> str:
        font_size = html.escape(config.get("fontSize", "12pt"))
        total = int(test.get("totalMarks", 0))
        section_html = []
        for section in sections:
            title = html.escape(section["title"])
            header = f"<h2>{title}</h2>" if config.get("sectionHeaders", True) else ""
            instructions = html.escape(section.get("instructions", ""))
            instruction_html = f'<p class="section-instructions">{instructions}</p>' if instructions else ""
            questions = "".join(block["html"] for block in section["blocks"])
            section_html.append(f"<section>{header}{instruction_html}{questions}</section>")

        return (
            f'<div class="formatted-test" style="font-size:{font_size}">'
            f"<header><h1>{html.escape(test.get('title', 'Worksheet'))}</h1>"
            f"<p>Total marks: {total}</p></header>"
            f"{''.join(section_html)}</div>"
        )

    def _load_configs(self) -> dict:
        configs = {}
        for path in sorted(self.config_dir.glob("*.json")):
            with path.open("r", encoding="utf-8") as handle:
                config = json.load(handle)
            configs[config["id"]] = config
        return configs
