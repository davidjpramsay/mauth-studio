from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_factor_endpoint_returns_factored_latex():
    response = client.post(
        "/api/math/factor",
        json={
            "expression": "x^2 + 2*x + 1",
            "inputFormat": "plain",
            "includeSteps": True,
            "includeGraph": True,
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert data["result"] == "(x + 1)**2"
    assert "x + 1" in data["latex"]
    assert data["graphConfig"]["type"] == "graph2d"
    assert data["graphConfig"]["showGrid"] is True
    assert data["graphConfig"]["functions"][0]["expression"] == "x**2 + 2*x + 1"
    assert data["steps"]


def test_math_operation_endpoints():
    cases = [
        ("/api/math/simplify", "2*x + x", "3*x"),
        ("/api/math/expand", "(x + 1)^2", "x**2 + 2*x + 1"),
        ("/api/math/differentiate", "x^3", "3*x**2"),
        ("/api/math/integrate", "2*x", "x**2"),
    ]

    for path, expression, expected in cases:
        response = client.post(path, json={"expression": expression, "inputFormat": "plain"})
        assert response.status_code == 200
        assert response.json()["result"] == expected


def test_solve_endpoint():
    response = client.post("/api/math/solve", json={"expression": "x^2 - 1", "inputFormat": "plain"})

    assert response.status_code == 200
    assert response.json()["result"] == "[-1, 1]"


def test_latex_input_fallback_parses_expression():
    response = client.post(
        "/api/math/factor",
        json={"expression": "x^{2}+2x+1", "inputFormat": "latex"},
    )

    assert response.status_code == 200
    assert response.json()["result"] == "(x + 1)**2"


def test_math_endpoints_reject_python_execution(tmp_path):
    marker = tmp_path / "executed"
    payload = f'__import__("pathlib").Path("{marker}").write_text("unexpected")'
    for operation in ("simplify", "expand", "factor", "solve", "differentiate", "integrate"):
        response = client.post(f"/api/math/{operation}", json={"expression": payload, "inputFormat": "plain"})
        assert response.status_code == 400
        assert not marker.exists()


def test_math_parser_preserves_implicit_multiplication_and_hyperbolic_functions():
    response = client.post("/api/math/simplify", json={"expression": "2x+sinh(x)", "inputFormat": "plain"})
    assert response.status_code == 200
    assert response.json()["result"] == "2*x + sinh(x)"


def test_math_parser_rejects_invalid_and_excessive_expressions():
    for expression, input_format in [
        ("(", "plain"),
        ("2^1001", "plain"),
        ("2^{1001}", "latex"),
        ("(9^999)^999", "plain"),
        ("((2/3)^1000)^1000", "plain"),
        ("(2^1000)^(-1000)", "plain"),
        ("(1/(2^1000))^1000", "plain"),
        (r"(\frac{2}{3})^{1000\cdot 1000}", "latex"),
        (r"((\frac{2}{3})^{1000})^{1000}", "latex"),
    ]:
        response = client.post("/api/math/simplify", json={"expression": expression, "inputFormat": input_format})
        assert response.status_code == 400


def test_rational_limits_preserve_normal_fractions_and_reciprocal_powers():
    import sympy as sp

    from app.services.parser import parse_expression

    for expression in ("(2/3)^1000", "(2/3)^(-1000)", "(2^1000)^(-2)", "(2/3)+(1/3)"):
        result = parse_expression(expression)
        assert result == sp.sympify(expression.replace("^", "**"))
    assert sp.simplify(parse_expression(r"\frac{2}{3}", "latex") - sp.Rational(2, 3)) == 0
    assert sp.simplify(parse_expression(r"((\frac{1}{2})^{1000})^{16}", "latex")) == sp.Rational(1, 2**16000)


def test_rational_power_is_rejected_before_expansion(monkeypatch):
    import ast

    import mauth_math
    import pytest
    import sympy as sp

    original = mauth_math._BINARY[ast.Pow]
    calls = []

    def power(left, right):
        calls.append((left, right))
        return original(left, right)

    monkeypatch.setitem(mauth_math._BINARY, ast.Pow, power)
    for expression in ("((2/3)^1000)^1000", "((2*x/3)^1000)^1000"):
        calls.clear()
        with pytest.raises(mauth_math.InvalidMathExpression):
            mauth_math.parse_math_expression(expression)
        assert len(calls) == 1
    with pytest.raises(mauth_math.InvalidMathExpression):
        mauth_math.validate_symbolic_expression(sp.Rational(1, 2**17000))


def test_math_parser_rejects_python_syntax_on_both_equation_sides():
    for expression in ("x.__class__", "(1).__class__", "x[0]", "x; 1", "x=__import__(1)", "__import__(1)=x"):
        response = client.post("/api/math/solve", json={"expression": expression, "inputFormat": "plain"})
        assert response.status_code == 400
