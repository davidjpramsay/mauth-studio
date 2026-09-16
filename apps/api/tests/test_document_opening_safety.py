import json
import multiprocessing
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from threading import Barrier

import pytest
from fastapi.testclient import TestClient

from app.api import storage as storage_api
from app.main import app
from app.services import storage


@pytest.fixture
def workspace(tmp_path, monkeypatch):
    monkeypatch.delenv("MATH_APP_STORAGE_ROOT", raising=False)
    monkeypatch.setenv("MAUTH_DOCUMENTS_ROOT", str(tmp_path / "Home"))
    monkeypatch.setenv("MAUTH_WORKSPACE_STATE_ROOT", str(tmp_path / "State"))
    service = storage.FileProjectStorage()
    service.get_or_create_default_project()
    monkeypatch.setattr(storage_api, "project_storage_service", service)
    return service


def cloud_document(workspace, tmp_path, title="Year 11 Test 3"):
    folder = tmp_path / title
    folder.mkdir()
    path = folder / f"{title}.mauth"
    path.write_text(
        json.dumps({"id": title, "name": title, "frontMatter": {"assessmentTitle": title}, "questions": []})
    )
    scoped = workspace.for_documents_folder(str(folder))
    scoped.get_or_create_default_project()
    scoped.list_files(scoped.DEFAULT_PROJECT_ID)
    return path


def test_native_save_target_preserves_folder_and_revision_history(workspace, tmp_path):
    source = cloud_document(workspace, tmp_path, "Source")
    destination = cloud_document(workspace, tmp_path, "Destination")
    original_folder = workspace.documents_dir
    original_source = source.read_bytes()
    target = workspace.document_save_target(str(destination))
    assert workspace.documents_dir == original_folder
    scoped = workspace.for_documents_folder(target["project"]["documentsPath"])
    payload = {"content": source.read_text(), "baseRevision": target["revision"]}
    saved = scoped.save_file(target["project"]["id"], target["path"], payload)
    assert saved["revision"] == target["revision"] + 1
    assert scoped.list_versions(target["project"]["id"], target["path"])
    assert source.read_bytes() == original_source
    with pytest.raises(storage.StorageConflictError):
        scoped.save_file(target["project"]["id"], target["path"], payload)
    assert workspace.documents_dir == original_folder


def test_native_save_new_target_refuses_a_file_created_after_selection(workspace, tmp_path):
    folder = tmp_path / "New folder"
    folder.mkdir()
    target = workspace.document_save_target(str(folder / "New.mauth"))
    assert target["revision"] is None
    scoped = workspace.for_documents_folder(target["project"]["documentsPath"])
    payload = {"content": "first writer", "baseRevision": None}
    scoped.save_file(target["project"]["id"], target["path"], payload)
    with pytest.raises(storage.StorageConflictError):
        scoped.save_file(target["project"]["id"], target["path"], {**payload, "content": "second writer"})
    assert (folder / "New.mauth").read_text() == "first writer"


@pytest.mark.parametrize("existing", [False, True])
def test_native_save_detects_external_changes_after_picker(workspace, tmp_path, existing):
    folder = tmp_path / "External editor"
    folder.mkdir()
    path = folder / "Test.mauth"
    if existing:
        path.write_text("old content")
    target = workspace.document_save_target(str(path))
    path.write_text("changed outside Mauth")
    scoped = workspace.for_documents_folder(target["project"]["documentsPath"])
    with pytest.raises(storage.StorageConflictError):
        scoped.save_file(
            target["project"]["id"],
            target["path"],
            {
                "content": "must not overwrite",
                "baseRevision": target["revision"],
                "expectedContentHash": target["contentHash"],
            },
        )
    assert path.read_text() == "changed outside Mauth"


def test_native_save_target_unavailable_index_preserves_selected_folder(workspace, tmp_path, monkeypatch):
    destination = cloud_document(workspace, tmp_path)
    original_folder = workspace.documents_dir
    original_read = storage.require_materialized_file

    def materialized(path):
        if path == destination.parent / ".mauth/project.json":
            raise storage.CloudPlaceholderError(path)
        return original_read(path)

    monkeypatch.setattr(storage, "require_materialized_file", materialized)
    response = TestClient(app).post(
        "/api/storage/projects/default/document-save-target", json={"path": str(destination)}
    )
    assert response.status_code == 503
    assert workspace.documents_dir == original_folder


@pytest.mark.parametrize("path", ["relative.mauth", "/tmp/wrong.pdf", "/tmp/.mauth/hidden.mauth"])
def test_native_save_target_rejects_invalid_destinations(workspace, path):
    response = TestClient(app).post("/api/storage/projects/default/document-save-target", json={"path": path})
    assert response.status_code == 400


@pytest.mark.parametrize("cold_start", [False, True])
@pytest.mark.parametrize("title", ["Year 11 Test 3", "Year 12 Test 4"])
def test_finder_open_online_only_index_preserves_recovery_and_retries(
    workspace, tmp_path, monkeypatch, cold_start, title
):
    path = cloud_document(workspace, tmp_path, title)
    recovery = storage.FileTestStorage(workspace.base_root)
    recovery.save_autosave({"frontMatter": {"assessmentTitle": "Unsaved recovered assessment"}, "questions": []})
    recovery.save_editor_session(
        {"activeTabId": "dirty", "tabs": [{"id": "dirty", "dirty": True, "document": {"text": "Keep this"}}]}
    )
    before = {
        name: (recovery.autosave_dir / name).read_bytes() for name in ["current-test.json", "open-documents.json"]
    }
    original_folder = workspace.documents_dir
    original_read = storage.require_materialized_file
    blocked = True

    def materialized(target):
        if blocked and target == path.parent / ".mauth/project.json":
            raise storage.CloudPlaceholderError(target)
        return original_read(target)

    monkeypatch.setattr(storage, "require_materialized_file", materialized)
    if cold_start:
        workspace = storage.FileProjectStorage()
        monkeypatch.setattr(storage_api, "project_storage_service", workspace)
    client = TestClient(app)
    response = client.post("/api/storage/projects/default/open-document", json={"path": str(path)})
    assert response.status_code == 503
    detail = response.json()["detail"]
    assert detail["reason"] == "PROJECT_INDEX_ONLINE_ONLY"
    assert detail["retryable"] is True
    assert detail["action"] == "MAKE_FOLDER_AVAILABLE_OFFLINE"
    assert detail["path"].endswith(".mauth/project.json")
    assert workspace.documents_dir == original_folder
    assert not workspace._workspace_config_path().exists()
    assert client.get("/api/health").status_code == 200
    blocked = False
    response = client.post("/api/storage/projects/default/open-document", json={"path": str(path)})
    assert response.status_code == 200
    opened = response.json()
    assert json.loads(opened["document"]["content"])["frontMatter"]["assessmentTitle"] == title
    assert workspace.documents_dir == path.parent
    assert {name: (recovery.autosave_dir / name).read_bytes() for name in before} == before


def test_failed_folder_selection_does_not_change_remembered_folder(workspace, tmp_path, monkeypatch):
    path = cloud_document(workspace, tmp_path)
    original = workspace.documents_dir
    read = storage.require_materialized_file

    def unavailable(target):
        if target == path.parent / ".mauth/project.json":
            raise storage.CloudPlaceholderError(target)
        return read(target)

    monkeypatch.setattr(storage, "require_materialized_file", unavailable)
    with pytest.raises(storage.CloudPlaceholderError):
        workspace.open_documents_folder(str(path.parent))
    assert workspace.documents_dir == original
    assert not workspace._workspace_config_path().exists()


def test_unavailable_selected_folder_is_not_recreated(workspace, tmp_path):
    missing = tmp_path / "Disconnected Drive"
    scoped = workspace.for_documents_folder(str(missing))
    with pytest.raises(OSError):
        scoped.get_or_create_default_project()
    with pytest.raises(OSError):
        scoped.list_files(scoped.DEFAULT_PROJECT_ID)
    assert not missing.exists()


def test_requests_keep_their_original_folder_after_another_file_is_opened(workspace, tmp_path):
    first = cloud_document(workspace, tmp_path, "First")
    second = cloud_document(workspace, tmp_path, "Second")
    original_project = workspace.open_document(str(first))["project"]
    workspace.open_document(str(second))
    response = TestClient(app).get(
        "/api/storage/projects/local-project/files/tests/First.mauth",
        params={"documentsPath": original_project["documentsPath"]},
    )
    assert response.status_code == 200
    assert json.loads(response.json()["content"])["frontMatter"]["assessmentTitle"] == "First"
    assert workspace.documents_dir == second.parent


def test_concurrent_revision_saves_accept_only_one_writer(tmp_path):
    service = storage.FileProjectStorage(tmp_path)
    project = service.get_or_create_default_project()
    service.save_file(project["id"], "tests/A.mauth", {"content": "original", "baseRevision": None})
    barrier = Barrier(2)

    def save(value):
        barrier.wait(timeout=2)
        try:
            return service.save_file(project["id"], "tests/A.mauth", {"content": value, "baseRevision": 1})
        except storage.StorageConflictError:
            return "conflict"

    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(save, ["one", "two"]))
    assert results.count("conflict") == 1
    assert service.get_file(project["id"], "tests/A.mauth")["revision"] == 2
    assert len(service.list_versions(project["id"], "tests/A.mauth")) == 1


def _save_from_separate_process(root, ready, results, value):
    service = storage.FileProjectStorage(Path(root))
    ready.wait(timeout=10)
    try:
        service.save_file("local-project", "tests/A.mauth", {"content": value, "baseRevision": 1})
        results.put("saved")
    except storage.StorageConflictError:
        results.put("conflict")


def test_separate_app_processes_share_the_revision_lock(tmp_path):
    service = storage.FileProjectStorage(tmp_path)
    project = service.get_or_create_default_project()
    service.save_file(project["id"], "tests/A.mauth", {"content": "original", "baseRevision": None})
    context = multiprocessing.get_context("spawn")
    ready = context.Barrier(2)
    results = context.Queue()
    processes = [
        context.Process(target=_save_from_separate_process, args=(str(tmp_path), ready, results, value))
        for value in ["one", "two"]
    ]
    try:
        for process in processes:
            process.start()
        assert sorted(results.get(timeout=15) for _ in processes) == ["conflict", "saved"]
        for process in processes:
            process.join(timeout=5)
            assert process.exitcode == 0
        assert service.get_file(project["id"], "tests/A.mauth")["revision"] == 2
    finally:
        for process in processes:
            if process.is_alive():
                process.terminate()
                process.join(timeout=5)
        results.close()


@pytest.mark.parametrize("folder_available", [False, True])
def test_finder_open_distinguishes_missing_document_from_unavailable_folder(workspace, tmp_path, folder_available):
    folder = tmp_path / "Requested folder"
    if folder_available:
        folder.mkdir()
    original = workspace.documents_dir
    response = TestClient(app).post(
        "/api/storage/projects/default/open-document", json={"path": str(folder / "Missing.mauth")}
    )
    assert response.status_code == (404 if folder_available else 503)
    assert workspace.documents_dir == original
    assert folder.exists() is folder_available


def test_invalid_document_does_not_change_selected_folder(workspace, tmp_path):
    path = cloud_document(workspace, tmp_path)
    path.write_text(json.dumps({"frontMatter": {}}))
    original = workspace.documents_dir
    response = TestClient(app).post("/api/storage/projects/default/open-document", json={"path": str(path)})
    assert response.status_code == 400
    assert workspace.documents_dir == original


def test_targeted_summary_does_not_scan_folder(workspace, monkeypatch):
    saved = workspace.save_file("local-project", "tests/A.mauth", {"content": "{}", "baseRevision": None})

    def scan_forbidden(*args):
        pytest.fail("Targeted file check scanned the entire documents folder")

    monkeypatch.setattr(Path, "rglob", scan_forbidden)
    monkeypatch.setattr(storage.os, "walk", scan_forbidden)
    assert workspace.get_file_summary("local-project", "tests/A.mauth")["revision"] == saved["revision"]


def test_move_preserves_versions_and_rejects_stale_source_saves(workspace):
    service = workspace
    service.save_file("local-project", "tests/A.mauth", {"content": "first", "baseRevision": None})
    saved = service.save_file("local-project", "tests/A.mauth", {"content": "second", "baseRevision": 1})
    moved = service.move_file("local-project", "tests/A.mauth", "tests/Renamed.mauth", saved["revision"])
    assert moved[0]["id"] == saved["id"]
    assert moved[0]["revision"] == 3
    assert service.get_file("local-project", "tests/Renamed.mauth")["content"] == "second"
    assert service.list_versions("local-project", "tests/Renamed.mauth")[0]["content"] == "first"
    assert not (service.documents_dir / "A.mauth").exists()
    with pytest.raises(storage.StorageConflictError):
        service.save_file("local-project", "tests/A.mauth", {"content": "late save", "baseRevision": 2})


def test_move_rolls_back_visible_file_if_index_write_fails(workspace, monkeypatch):
    workspace.save_file("local-project", "tests/A.mauth", {"content": "keep", "baseRevision": None})
    write = storage.atomic_write_json

    def failed_index(path, data):
        if path == workspace._project_path("local-project"):
            raise OSError("index unavailable")
        write(path, data)

    monkeypatch.setattr(storage, "atomic_write_json", failed_index)
    with pytest.raises(OSError):
        workspace.move_file("local-project", "tests/A.mauth", "tests/B.mauth", 1)
    assert (workspace.documents_dir / "A.mauth").read_text() == "keep"
    assert not (workspace.documents_dir / "B.mauth").exists()
