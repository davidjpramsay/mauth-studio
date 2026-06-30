import json

from fastapi.testclient import TestClient

from app.api import system as system_api
from app.api.agent import _reset_agent_bridge_for_tests
from app.main import app
from app.services.storage import FileProjectStorage

client = TestClient(app)


def setup_function() -> None:
    _reset_agent_bridge_for_tests()


def test_system_status_reports_api_workspace_and_bridge(tmp_path, monkeypatch):
    monkeypatch.delenv("MATH_APP_STORAGE_ROOT", raising=False)
    monkeypatch.setenv("MAUTH_DOCUMENTS_ROOT", str(tmp_path))
    monkeypatch.setattr(system_api, "project_storage_service", FileProjectStorage())

    response = client.get("/api/system/status")

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert payload["apiVersion"] == "0.1.0"
    assert payload["routes"]["systemStatus"] == "/api/system/status"
    assert payload["workspace"]["documentsPath"] == str(tmp_path / "Documents")
    assert payload["workspace"]["metadataPath"] == str(tmp_path / ".mauth")
    assert payload["workspace"]["usesVisibleWorkspace"] is True
    assert payload["workspace"]["isExternalDocumentsFolder"] is False
    assert payload["bridge"]["available"] is True
    assert payload["bridge"]["activeSessionCount"] == 0
    assert payload["bridge"]["routes"]["browserRegister"] == "/api/agent/current/browser/register"


def test_system_status_reports_external_documents_folder(tmp_path, monkeypatch):
    workspace_root = tmp_path / "workspace"
    external_documents = tmp_path / "Test 4 - Exam"
    external_documents.mkdir()
    (external_documents / "Y10 Exam.test.json").write_text(json.dumps({"name": "Y10 Exam"}), encoding="utf-8")
    monkeypatch.delenv("MATH_APP_STORAGE_ROOT", raising=False)
    monkeypatch.setenv("MAUTH_DOCUMENTS_ROOT", str(workspace_root))
    service = FileProjectStorage()
    service.open_documents_folder(str(external_documents))
    monkeypatch.setattr(system_api, "project_storage_service", service)

    payload = client.get("/api/system/status").json()

    assert payload["workspace"]["isExternalDocumentsFolder"] is True
    assert payload["workspace"]["workspacePath"] == str(external_documents.resolve())
    assert payload["workspace"]["documentsPath"] == str(external_documents.resolve())
    assert payload["workspace"]["metadataPath"] == str(external_documents.resolve() / ".mauth")
    assert payload["workspace"]["defaultProject"]["id"] == "local-project"


def test_system_status_reports_active_browser_bridge_session(tmp_path, monkeypatch):
    monkeypatch.delenv("MATH_APP_STORAGE_ROOT", raising=False)
    monkeypatch.setenv("MAUTH_DOCUMENTS_ROOT", str(tmp_path))
    monkeypatch.setattr(system_api, "project_storage_service", FileProjectStorage())
    client.post("/api/agent/current/browser/register", json={"sessionId": "test-editor", "label": "Test editor"})

    payload = client.get("/api/system/status").json()

    assert payload["bridge"]["activeSessionCount"] == 1
    assert payload["bridge"]["sessions"][0]["sessionId"] == "test-editor"
    assert payload["bridge"]["sessions"][0]["label"] == "Test editor"
