from formatting_engine.engine import FormattingEngine


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
