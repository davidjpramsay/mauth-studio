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
