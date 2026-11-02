from formatting_engine.engine import FormattingEngine

from app.models.schemas import ContentBlock


def test_attached_diagram_text_round_trips_and_formats_math_safely():
    block = ContentBlock.model_validate(
        {
            "kind": "diagram",
            "graphConfig": {"type": "graph2d", "title": "A < B", "caption": r"Figure $\frac{1}{2}$"},
        }
    ).model_dump()
    assert block["graphConfig"]["title"] == "A < B"
    assert block["graphConfig"]["caption"] == r"Figure $\frac{1}{2}$"
    rendered = FormattingEngine._content_block_html(block)
    assert "A &lt; B" in rendered
    assert r"\displaystyle \frac{1}{2}" in rendered
    assert rendered.index("diagram-title") < rendered.index("question-diagram") < rendered.index("<figcaption>")


def test_mixed_math_ignores_escaped_currency_dollars():
    rendered = FormattingEngine._mixed_math_html(r"Amy borrows \$8500 at a rate of $5.7\%$ p.a., compounding annually.")

    assert "Amy borrows $8500 at a rate of 5.7% p.a." in rendered
    assert "\\displaystyle 5.7\\%" not in rendered
    assert "\\$8500" not in rendered
    assert "\\displaystyle \\$8500" not in rendered


def test_mixed_math_renders_simple_numbers_as_prose_text():
    rendered = FormattingEngine._mixed_math_html(r"If side OX is $15$, then the rate is $\textstyle 7\%$ p.a.")

    assert "If side OX is 15, then the rate is 7% p.a." in rendered
    assert "inline-latex" not in rendered


def test_mixed_math_keeps_real_inline_math_as_latex():
    rendered = FormattingEngine._mixed_math_html(r"Solve $x=1$ and simplify $\frac{1}{2}$.")

    assert '<span class="inline-latex">\\displaystyle x=1</span>' in rendered
    assert '<span class="inline-latex">\\displaystyle \\frac{1}{2}</span>' in rendered


def test_choices_html_marks_only_the_selected_solution_answer():
    rendered = FormattingEngine._choices_html(
        {
            "choices": ["2", "4", "6"],
            "numberingStyle": "upper-alpha",
            "solutionAnswerIndex": 1,
        }
    )

    assert rendered.count("choice-item-solution-answer") == 1
    assert rendered.count("choice-label-answer-ring") == 1
    assert '<span class="choice-label choice-label-answer-ring">B.</span>' in rendered
