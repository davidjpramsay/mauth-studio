from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def api_preflight(origin: str):
    return client.options(
        "/api/storage/tests",
        headers={
            "Origin": origin,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )


def test_local_dev_cors_allows_vite_fallback_ports():
    response = api_preflight("http://localhost:5174")

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:5174"


def test_local_dev_cors_allows_loopback_fallback_ports():
    response = api_preflight("http://127.0.0.1:5174")

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://127.0.0.1:5174"


def test_cors_still_rejects_non_local_origins():
    response = api_preflight("https://example.com")

    assert response.status_code == 400
    assert response.headers.get("access-control-allow-origin") is None
