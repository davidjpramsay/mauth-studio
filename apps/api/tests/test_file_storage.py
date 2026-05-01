from fastapi.testclient import TestClient

from app.api import storage as storage_api
from app.main import app
from app.services.storage import FileTestStorage

client = TestClient(app)


def test_saved_test_file_storage_round_trip(tmp_path, monkeypatch):
    monkeypatch.setattr(storage_api, "storage_service", FileTestStorage(tmp_path))

    payload = {
        "id": "saved-test-demo",
        "name": "Demo Test",
        "frontMatter": {"subjectTitle": "YEAR 12 MATHEMATICS", "assessmentTitle": "TEST 2"},
        "questions": [{"id": "question-1", "marks": 2, "contentBlocks": [], "parts": []}],
        "logo": {"id": "acc-logo", "name": "ACC", "src": "/logos/acc_logo.svg", "builtIn": True},
    }

    save_response = client.post("/api/storage/tests", json=payload)
    assert save_response.status_code == 200
    saved = save_response.json()
    assert saved["id"] == "saved-test-demo"
    assert saved["name"] == "Demo Test"
    assert saved["questions"][0]["id"] == "question-1"

    list_response = client.get("/api/storage/tests")
    assert list_response.status_code == 200
    assert [test["id"] for test in list_response.json()["tests"]] == ["saved-test-demo"]

    load_response = client.get("/api/storage/tests/saved-test-demo")
    assert load_response.status_code == 200
    assert load_response.json()["frontMatter"]["assessmentTitle"] == "TEST 2"

    updated = {**saved, "name": "Demo Test Renamed"}
    update_response = client.put("/api/storage/tests/saved-test-demo", json=updated)
    assert update_response.status_code == 200
    assert update_response.json()["name"] == "Demo Test Renamed"
    assert list((tmp_path / "backups" / "tests").glob("saved-test-demo-*-backup.json"))

    delete_response = client.delete("/api/storage/tests/saved-test-demo")
    assert delete_response.status_code == 204
    assert list((tmp_path / "backups" / "tests").glob("saved-test-demo-*-deleted.json"))
    assert client.get("/api/storage/tests/saved-test-demo").status_code == 404


def test_autosave_file_storage_round_trip(tmp_path, monkeypatch):
    monkeypatch.setattr(storage_api, "storage_service", FileTestStorage(tmp_path))

    response = client.post(
        "/api/storage/tests/autosave",
        json={
            "frontMatter": {"subjectTitle": "YEAR 10 MATHEMATICS"},
            "questions": [{"id": "question-1"}],
            "selectedSavedTestId": "saved-test-demo",
        },
    )

    assert response.status_code == 200
    autosave = response.json()["autosave"]
    assert autosave["selectedSavedTestId"] == "saved-test-demo"

    load_response = client.get("/api/storage/tests/autosave")
    assert load_response.status_code == 200
    assert load_response.json()["autosave"]["questions"][0]["id"] == "question-1"
