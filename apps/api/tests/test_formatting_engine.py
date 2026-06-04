from formatting_engine.engine import FormattingEngine


def test_mixed_math_ignores_escaped_currency_dollars():
    rendered = FormattingEngine._mixed_math_html(r"Amy borrows \$8500 at a rate of $5.7\%$ p.a., compounding annually.")

    assert "Amy borrows $8500 at a rate of " in rendered
    assert '<span class="inline-latex">\\displaystyle 5.7\\%</span>' in rendered
    assert "\\$8500" not in rendered
    assert "\\displaystyle \\$8500" not in rendered
