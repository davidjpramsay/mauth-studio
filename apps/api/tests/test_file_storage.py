import io
import json
import zipfile
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.api import storage as storage_api
from app.main import app
from app.services import storage as storage_service
from app.services.storage import (
    MACOS_DATALESS_FILE_FLAG,
    FileLogoStorage,
    FileProjectStorage,
    FileTestStorage,
    StorageValidationError,
    require_materialized_file,
)

client = TestClient(app)


def test_require_materialized_file_rejects_cloud_placeholder() -> None:
    path = SimpleNamespace(stat=lambda: SimpleNamespace(st_flags=MACOS_DATALESS_FILE_FLAG))

    with pytest.raises(OSError, match="Cloud-backed file is not downloaded"):
        require_materialized_file(path)


def test_copy_tree_if_missing_is_atomic_under_concurrent_migration(tmp_path, monkeypatch):
    source = tmp_path / "legacy"
    source.mkdir()
    for index in range(20):
        (source / f"document-{index}.json").write_text(json.dumps({"index": index}), encoding="utf-8")
    target = tmp_path / "current"
    copy_barrier = Barrier(2)
    original_copytree = storage_service.shutil.copytree

    def synchronized_copytree(*args, **kwargs):
        copy_barrier.wait(timeout=2)
        return original_copytree(*args, **kwargs)

    monkeypatch.setattr(storage_service.shutil, "copytree", synchronized_copytree)
    with ThreadPoolExecutor(max_workers=2) as executor:
        futures = [executor.submit(storage_service.copy_tree_if_missing, source, target) for _ in range(2)]
        for future in futures:
            future.result(timeout=5)

    assert sorted(path.name for path in target.iterdir()) == sorted(f"document-{index}.json" for index in range(20))
    assert list(tmp_path.glob(".current.*.tmp")) == []


def test_default_project_reports_external_folder_timeout_as_temporarily_unavailable(monkeypatch):
    def unavailable_project():
        raise TimeoutError("cloud-backed project metadata timed out")

    monkeypatch.setattr(storage_api.project_storage_service, "get_or_create_default_project", unavailable_project)

    response = client.get("/api/storage/projects/default")

    assert response.status_code == 503
    assert response.json()["detail"] == {
        "code": "STORAGE_UNAVAILABLE",
        "message": "The active documents folder is temporarily unavailable. Check that the drive is connected and the folder has finished downloading, then try again.",
    }


def test_default_project_uses_visible_documents_workspace(tmp_path, monkeypatch):
    monkeypatch.delenv("MATH_APP_STORAGE_ROOT", raising=False)
    monkeypatch.setenv("MAUTH_DOCUMENTS_ROOT", str(tmp_path))
    metadata_dir = tmp_path / ".mauth"
    metadata_dir.mkdir()
    (metadata_dir / "project.json").write_text(
        json.dumps(
            {
                "id": "local-project",
                "name": "Local Project",
                "description": None,
                "metadata": {},
                "files": {},
                "createdAt": "2026-01-01T00:00:00Z",
                "updatedAt": "2026-01-01T00:00:00Z",
            }
        ),
        encoding="utf-8",
    )

    service = FileProjectStorage()
    project = service.get_or_create_default_project()
    saved = service.save_file(
        project["id"],
        "tests/Visible worksheet.test.json",
        {"content": '{"title":"Visible"}\n', "kind": "file", "fileType": "test", "baseRevision": None},
    )

    assert project["workspacePath"] == str(tmp_path)
    assert project["documentsPath"] == str(tmp_path / "Documents")
    assert saved["path"] == "tests/Visible worksheet.test.json"
    assert (tmp_path / "Documents" / "Visible worksheet.test.json").read_text(
        encoding="utf-8"
    ) == '{"title":"Visible"}\n'
    assert (tmp_path / ".mauth" / "project.json").exists()


def test_relocated_workspace_state_keeps_visible_documents_folder(tmp_path, monkeypatch):
    workspace_root = tmp_path / "visible-workspace"
    state_root = tmp_path / "application-support" / "storage"
    monkeypatch.delenv("MATH_APP_STORAGE_ROOT", raising=False)
    monkeypatch.setenv("MAUTH_DOCUMENTS_ROOT", str(workspace_root))
    monkeypatch.setenv("MAUTH_WORKSPACE_STATE_ROOT", str(state_root))

    service = FileProjectStorage()
    project = service.get_or_create_default_project()

    assert service.uses_visible_workspace is True
    assert project["documentsPath"] == str(workspace_root / "Documents")
    assert service.workspace_status()["metadataPath"] == str(state_root)
    assert (state_root / "project.json").exists()
    assert not (workspace_root / ".mauth").exists()


def test_project_file_list_reconciles_files_deleted_from_visible_workspace(tmp_path, monkeypatch):
    monkeypatch.delenv("MATH_APP_STORAGE_ROOT", raising=False)
    monkeypatch.setenv("MAUTH_DOCUMENTS_ROOT", str(tmp_path))
    metadata_dir = tmp_path / ".mauth"
    metadata_dir.mkdir()
    (metadata_dir / "project.json").write_text(
        json.dumps(
            {
                "id": "local-project",
                "name": "Local Project",
                "description": None,
                "metadata": {},
                "files": {},
                "createdAt": "2026-01-01T00:00:00Z",
                "updatedAt": "2026-01-01T00:00:00Z",
            }
        ),
        encoding="utf-8",
    )

    service = FileProjectStorage()
    project = service.get_or_create_default_project()
    service.save_file(
        project["id"],
        "tests/Deleted externally.test.json",
        {"content": '{"title":"Gone"}\n', "kind": "file", "fileType": "test", "baseRevision": None},
    )
    visible_file = tmp_path / "Documents" / "Deleted externally.test.json"
    assert visible_file.exists()

    visible_file.unlink()

    assert [file["path"] for file in service.list_files(project["id"])] == ["tests"]
    repaired_project = json.loads((tmp_path / ".mauth" / "project.json").read_text(encoding="utf-8"))
    repaired_record = repaired_project["files"]["tests/Deleted externally.test.json"]
    assert isinstance(repaired_record["deletedAt"], str)
    assert repaired_record["revision"] == 2


def test_project_storage_can_open_external_documents_folder(tmp_path, monkeypatch):
    workspace_root = tmp_path / "workspace"
    external_documents = tmp_path / "Past Tests"
    nested_folder = external_documents / "Year 10"
    nested_folder.mkdir(parents=True)
    (nested_folder / "Term 1.test.json").write_text('{"name":"Term 1"}\n', encoding="utf-8")
    (external_documents / "Term 2.mauth").write_text(
        '{"format":"mauth-studio-document","schemaVersion":1,"name":"Term 2"}\n',
        encoding="utf-8",
    )
    (external_documents / "Ignore.pdf").write_text("not a mauth file", encoding="utf-8")
    monkeypatch.delenv("MATH_APP_STORAGE_ROOT", raising=False)
    monkeypatch.setenv("MAUTH_DOCUMENTS_ROOT", str(workspace_root))

    service = FileProjectStorage()
    project = service.open_documents_folder(str(external_documents))
    files = service.list_files(project["id"])

    assert project["workspacePath"] == str(external_documents.resolve())
    assert project["documentsPath"] == str(external_documents.resolve())
    assert [file["path"] for file in files] == [
        "tests",
        "tests/Year 10",
        "tests/Term 2.mauth",
        "tests/Year 10/Term 1.test.json",
    ]
    assert next(file for file in files if file["path"] == "tests/Term 2.mauth")["fileType"] == "test"
    assert (external_documents / ".mauth" / "project.json").exists()
    assert not any(file["path"].endswith("Ignore.pdf") for file in files)

    reloaded_service = FileProjectStorage()
    reloaded_project = reloaded_service.get_or_create_default_project()

    assert reloaded_project["documentsPath"] == str(external_documents.resolve())
    assert [file["path"] for file in reloaded_service.list_files(reloaded_project["id"])] == [
        "tests",
        "tests/Year 10",
        "tests/Term 2.mauth",
        "tests/Year 10/Term 1.test.json",
    ]


def test_project_storage_preserves_mauth_extension_when_import_names_conflict():
    assert FileProjectStorage._import_name_parts("Exam.mauth", "file") == ("Exam", ".mauth")


def test_project_storage_restores_external_folder_without_validating_cloud_path(tmp_path, monkeypatch):
    workspace_root = tmp_path / "workspace"
    external_documents = tmp_path / "Cloud Drive" / "Past Tests"
    metadata_dir = workspace_root / ".mauth"
    metadata_dir.mkdir(parents=True)
    (metadata_dir / "workspace.json").write_text(
        json.dumps({"documentsPath": str(external_documents)}),
        encoding="utf-8",
    )
    monkeypatch.delenv("MATH_APP_STORAGE_ROOT", raising=False)
    monkeypatch.setenv("MAUTH_DOCUMENTS_ROOT", str(workspace_root))

    def fail_if_validated(_self, _folder_path):
        raise AssertionError("startup must not contact the remembered documents folder")

    monkeypatch.setattr(FileProjectStorage, "_validated_documents_folder", fail_if_validated)

    service = FileProjectStorage()

    assert service.workspace_status()["documentsPath"] == str(external_documents)
    assert service.workspace_status()["isExternalDocumentsFolder"] is True


def test_project_storage_still_validates_explicit_folder_selection(tmp_path, monkeypatch):
    workspace_root = tmp_path / "workspace"
    monkeypatch.delenv("MATH_APP_STORAGE_ROOT", raising=False)
    monkeypatch.setenv("MAUTH_DOCUMENTS_ROOT", str(workspace_root))
    service = FileProjectStorage()

    with pytest.raises(StorageValidationError, match="Folder does not exist"):
        service.open_documents_folder(str(tmp_path / "Missing"))


def test_external_documents_folder_never_imports_legacy_project_files(tmp_path, monkeypatch):
    legacy_root = tmp_path / "legacy-root"
    workspace_root = tmp_path / "workspace"
    external_documents = tmp_path / "Test 4 - Exam"
    external_documents.mkdir()
    (external_documents / "Y10 Units 1-4 Exam S1 Calculator-Free.test.json").write_text(
        '{"name":"Year 10 exam"}\n',
        encoding="utf-8",
    )
    legacy_project_dir = legacy_root / "storage" / "projects" / "local-project"
    legacy_tests_dir = legacy_project_dir / "files" / "tests"
    legacy_tests_dir.mkdir(parents=True)
    (legacy_tests_dir / "Old Year 12 Test.test.json").write_text('{"name":"Old"}\n', encoding="utf-8")
    (legacy_project_dir / "project.json").write_text(
        json.dumps(
            {
                "id": "local-project",
                "name": "Local Project",
                "description": None,
                "metadata": {},
                "files": {
                    "tests/Old Year 12 Test.test.json": {"kind": "file", "revision": 1},
                },
                "createdAt": "2026-01-01T00:00:00Z",
                "updatedAt": "2026-01-01T00:00:00Z",
            }
        ),
        encoding="utf-8",
    )
    monkeypatch.delenv("MATH_APP_STORAGE_ROOT", raising=False)
    monkeypatch.setenv("MAUTH_DOCUMENTS_ROOT", str(workspace_root))
    monkeypatch.setattr(storage_service, "ROOT", legacy_root)

    service = FileProjectStorage()
    project = service.open_documents_folder(str(external_documents))
    assert [file["path"] for file in service.list_files(project["id"])] == [
        "tests",
        "tests/Y10 Units 1-4 Exam S1 Calculator-Free.test.json",
    ]
    assert not (external_documents / "Old Year 12 Test.test.json").exists()
    with pytest.raises(StorageValidationError):
        service.save_file(
            project["id"],
            "tests/Old Year 12 Test.test.json",
            {
                "content": '{"name":"Old"}\n',
                "kind": "file",
                "fileType": "test",
                "metadata": {
                    "source": "legacy-saved-tests-migration",
                    "legacySavedTestId": "old",
                },
            },
        )
    assert not (external_documents / "Old Year 12 Test.test.json").exists()

    reloaded_service = FileProjectStorage()
    reloaded_project = reloaded_service.get_or_create_default_project()
    assert [file["path"] for file in reloaded_service.list_files(reloaded_project["id"])] == [
        "tests",
        "tests/Y10 Units 1-4 Exam S1 Calculator-Free.test.json",
    ]
    assert not (external_documents / "Old Year 12 Test.test.json").exists()


def test_project_storage_can_reset_external_documents_folder(tmp_path, monkeypatch):
    workspace_root = tmp_path / "workspace"
    external_documents = tmp_path / "Past Tests"
    external_documents.mkdir()
    monkeypatch.delenv("MATH_APP_STORAGE_ROOT", raising=False)
    monkeypatch.setenv("MAUTH_DOCUMENTS_ROOT", str(workspace_root))

    service = FileProjectStorage()
    service.open_documents_folder(str(external_documents))
    reset_project = service.reset_documents_folder()

    assert reset_project["documentsPath"] == str(workspace_root / "Documents")
    assert not (workspace_root / ".mauth" / "workspace.json").exists()


def test_visible_workspace_migration_skips_generated_smoke_folders(tmp_path, monkeypatch):
    legacy_root = tmp_path / "legacy-root"
    workspace_root = tmp_path / "workspace"
    legacy_project_dir = legacy_root / "storage" / "projects" / "local-project"
    legacy_tests_dir = legacy_project_dir / "files" / "tests"
    smoke_dir = legacy_tests_dir / "__file_manager_smoke_123"
    smoke_dir.mkdir(parents=True)
    (smoke_dir / "Alpha.test.json").write_text('{"title":"Generated"}\n', encoding="utf-8")
    (legacy_tests_dir / "Real worksheet.test.json").write_text('{"title":"Real"}\n', encoding="utf-8")
    (legacy_project_dir / "project.json").write_text(
        json.dumps(
            {
                "id": "local-project",
                "name": "Local Project",
                "description": None,
                "metadata": {},
                "files": {
                    "tests/Real worksheet.test.json": {"kind": "file", "revision": 1},
                    "tests/__file_manager_smoke_123": {"kind": "folder", "revision": 1},
                    "tests/__file_manager_smoke_123/Alpha.test.json": {"kind": "file", "revision": 1},
                },
                "createdAt": "2026-01-01T00:00:00Z",
                "updatedAt": "2026-01-01T00:00:00Z",
            }
        ),
        encoding="utf-8",
    )
    monkeypatch.delenv("MATH_APP_STORAGE_ROOT", raising=False)
    monkeypatch.setenv("MAUTH_DOCUMENTS_ROOT", str(workspace_root))
    monkeypatch.setattr(storage_service, "ROOT", legacy_root)

    service = FileProjectStorage()
    project = service.get_or_create_default_project()

    assert project["documentsPath"] == str(workspace_root / "Documents")
    assert (workspace_root / "Documents" / "Real worksheet.test.json").exists()
    assert not (workspace_root / "Documents" / "__file_manager_smoke_123").exists()
    assert [file["path"] for file in service.list_files(project["id"])] == ["tests", "tests/Real worksheet.test.json"]


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
            "sectionHeadings": [{"id": "section-1", "title": "Multiple choice"}],
            "documentFlow": [
                {"kind": "sectionHeading", "id": "section-1"},
                {"kind": "question", "id": "question-1"},
            ],
            "formattingConfig": {"id": "exam-booklet", "page": {"size": "A4"}},
            "activeProjectFilePath": "tests/demo.test.json",
            "activeProjectFileRevision": 7,
            "documentOpen": False,
        },
    )

    assert response.status_code == 200
    autosave = response.json()["autosave"]
    assert autosave["activeProjectFilePath"] == "tests/demo.test.json"
    assert autosave["activeProjectFileRevision"] == 7
    assert autosave["documentOpen"] is False

    load_response = client.get("/api/storage/tests/autosave")
    assert load_response.status_code == 200
    assert load_response.json()["autosave"]["questions"][0]["id"] == "question-1"
    assert load_response.json()["autosave"]["sectionHeadings"][0]["title"] == "Multiple choice"
    assert load_response.json()["autosave"]["documentFlow"][0]["kind"] == "sectionHeading"
    assert load_response.json()["autosave"]["formattingConfig"]["id"] == "exam-booklet"
    assert load_response.json()["autosave"]["activeProjectFileRevision"] == 7
    assert load_response.json()["autosave"]["documentOpen"] is False


def test_logo_file_storage_round_trip(tmp_path, monkeypatch):
    monkeypatch.setattr(storage_api, "logo_storage_service", FileLogoStorage(tmp_path))

    payload = {
        "id": "cornerstone-logo",
        "name": "Cornerstone",
        "schoolName": "CORNERSTONE\nCHRISTIAN COLLEGE",
        "src": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4=",
    }

    save_response = client.post("/api/storage/logos", json=payload)
    assert save_response.status_code == 200
    saved = save_response.json()
    assert saved["id"] == "cornerstone-logo"
    assert saved["name"] == "Cornerstone"
    assert saved["src"].startswith("data:image/svg+xml;base64,")
    assert (tmp_path / "assets" / "logos" / "files" / "cornerstone-logo.svg").exists()

    list_response = client.get("/api/storage/logos")
    assert list_response.status_code == 200
    assert [logo["id"] for logo in list_response.json()["logos"]] == ["cornerstone-logo"]

    updated = {**saved, "name": "Cornerstone Christian College"}
    update_response = client.put("/api/storage/logos/cornerstone-logo", json=updated)
    assert update_response.status_code == 200
    assert update_response.json()["name"] == "Cornerstone Christian College"
    assert list((tmp_path / "backups" / "logos").glob("cornerstone-logo-*-backup.json"))
    assert (tmp_path / "assets" / "logos" / "files" / "cornerstone-logo.svg").exists()

    metadata_update_response = client.put(
        "/api/storage/logos/cornerstone-logo",
        json={"name": "CCC", "schoolName": "CORNERSTONE CHRISTIAN COLLEGE"},
    )
    assert metadata_update_response.status_code == 200
    metadata_updated = metadata_update_response.json()
    assert metadata_updated["name"] == "CCC"
    assert metadata_updated["schoolName"] == "CORNERSTONE CHRISTIAN COLLEGE"
    assert metadata_updated["src"].startswith("data:image/svg+xml;base64,")
    assert (tmp_path / "assets" / "logos" / "files" / "cornerstone-logo.svg").exists()

    delete_response = client.delete("/api/storage/logos/cornerstone-logo")
    assert delete_response.status_code == 204
    assert list((tmp_path / "backups" / "logos").glob("cornerstone-logo-*-deleted.json"))
    assert client.get("/api/storage/logos").json()["logos"] == []


def test_project_file_storage_revision_and_versions(tmp_path, monkeypatch):
    monkeypatch.setattr(storage_api, "project_storage_service", FileProjectStorage(tmp_path))

    default_response = client.get("/api/storage/projects/default")
    assert default_response.status_code == 200
    project_id = default_response.json()["id"]
    assert project_id == "local-project"

    save_response = client.put(
        f"/api/storage/projects/{project_id}/files/tests/demo.mauth.md",
        json={
            "content": "# Demo\n\nOriginal content\n",
            "fileType": "mauthdown",
            "metadata": {"source": "test"},
        },
    )
    assert save_response.status_code == 200
    saved = save_response.json()
    assert saved["path"] == "tests/demo.mauth.md"
    assert saved["content"] == "# Demo\n\nOriginal content\n"
    assert saved["revision"] == 1
    assert saved["versionCount"] == 0

    files_response = client.get(f"/api/storage/projects/{project_id}/files")
    assert files_response.status_code == 200
    files = files_response.json()["files"]
    assert [item["path"] for item in files] == ["tests", "tests/demo.mauth.md"]
    assert files[0]["kind"] == "folder"
    assert files[1]["fileType"] == "mauthdown"

    update_response = client.put(
        f"/api/storage/projects/{project_id}/files/tests/demo.mauth.md",
        json={
            "content": "# Demo\n\nUpdated content\n",
            "fileType": "mauthdown",
            "baseRevision": 1,
        },
    )
    assert update_response.status_code == 200
    updated = update_response.json()
    assert updated["revision"] == 2
    assert updated["content"] == "# Demo\n\nUpdated content\n"
    assert updated["versionCount"] == 1

    stale_response = client.put(
        f"/api/storage/projects/{project_id}/files/tests/demo.mauth.md",
        json={"content": "Stale update", "baseRevision": 1},
    )
    assert stale_response.status_code == 409
    assert stale_response.json()["detail"]["current"]["revision"] == 2

    create_only_conflict_response = client.put(
        f"/api/storage/projects/{project_id}/files/tests/demo.mauth.md",
        json={"content": "Unexpected overwrite", "baseRevision": None},
    )
    assert create_only_conflict_response.status_code == 409
    assert create_only_conflict_response.json()["detail"]["current"]["revision"] == 2

    versions_response = client.get(
        f"/api/storage/projects/{project_id}/versions",
        params={"path": "tests/demo.mauth.md"},
    )
    assert versions_response.status_code == 200
    versions = versions_response.json()["versions"]
    assert len(versions) == 1
    assert versions[0]["revision"] == 1
    assert versions[0]["content"] == "# Demo\n\nOriginal content\n"

    restore_response = client.post(
        f"/api/storage/projects/{project_id}/versions/{versions[0]['id']}/restore",
        params={"path": "tests/demo.mauth.md"},
        json={},
    )
    assert restore_response.status_code == 200
    restored = restore_response.json()
    assert restored["revision"] == 3
    assert restored["content"] == "# Demo\n\nOriginal content\n"

    delete_response = client.delete(
        f"/api/storage/projects/{project_id}/files/tests/demo.mauth.md",
        params={"baseRevision": 3},
    )
    assert delete_response.status_code == 204

    list_after_delete = client.get(f"/api/storage/projects/{project_id}/files")
    assert list_after_delete.status_code == 200
    assert [item["path"] for item in list_after_delete.json()["files"]] == ["tests"]
    assert client.get(f"/api/storage/projects/{project_id}/files/tests/demo.mauth.md").status_code == 404


def test_project_file_storage_rejects_path_traversal(tmp_path, monkeypatch):
    monkeypatch.setattr(storage_api, "project_storage_service", FileProjectStorage(tmp_path))
    project_id = client.get("/api/storage/projects/default").json()["id"]

    response = client.put(
        f"/api/storage/projects/{project_id}/files/%2E%2E/outside.mauth.md",
        json={"content": "bad"},
    )

    assert response.status_code == 400
    assert not (tmp_path / "outside.mauth.md").exists()


def test_project_backup_exports_and_imports_files_versions_and_logos(tmp_path, monkeypatch):
    monkeypatch.setattr(storage_api, "project_storage_service", FileProjectStorage(tmp_path))
    monkeypatch.setattr(storage_api, "logo_storage_service", FileLogoStorage(tmp_path))
    project_id = client.get("/api/storage/projects/default").json()["id"]

    logo_response = client.post(
        "/api/storage/logos",
        json={
            "id": "backup-logo",
            "name": "Backup Logo",
            "schoolName": "BACKUP SCHOOL",
            "src": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4=",
        },
    )
    assert logo_response.status_code == 200

    save_response = client.put(
        f"/api/storage/projects/{project_id}/files/tests/folder/demo.test.json",
        json={"content": '{"name":"Demo"}', "fileType": "test"},
    )
    assert save_response.status_code == 200
    update_response = client.put(
        f"/api/storage/projects/{project_id}/files/tests/folder/demo.test.json",
        json={"content": '{"name":"Demo updated"}', "fileType": "test", "baseRevision": 1},
    )
    assert update_response.status_code == 200

    export_response = client.get(f"/api/storage/projects/{project_id}/backup")
    assert export_response.status_code == 200
    assert export_response.headers["content-type"] == "application/zip"
    with zipfile.ZipFile(io.BytesIO(export_response.content)) as archive:
        assert "mauth-project-backup.json" in archive.namelist()
        assert "project/files/tests/folder/demo.test.json" in archive.namelist()
        assert "logos/backup-logo.json" in archive.namelist()
        assert "logos/files/backup-logo.svg" in archive.namelist()

    imported_root = tmp_path / "imported"
    monkeypatch.setattr(storage_api, "project_storage_service", FileProjectStorage(imported_root))
    monkeypatch.setattr(storage_api, "logo_storage_service", FileLogoStorage(imported_root))
    imported_project_id = client.get("/api/storage/projects/default").json()["id"]

    import_response = client.post(
        f"/api/storage/projects/{imported_project_id}/backup/import",
        content=export_response.content,
        headers={"content-type": "application/zip"},
    )
    assert import_response.status_code == 200
    imported = import_response.json()
    assert imported["importedFiles"] == 1
    assert imported["importedLogos"] == 1
    assert imported["importedVersions"] == 1

    files_response = client.get(f"/api/storage/projects/{imported_project_id}/files")
    assert files_response.status_code == 200
    paths = [item["path"] for item in files_response.json()["files"]]
    assert paths == ["tests", "tests/folder", "tests/folder/demo.test.json"]

    versions_response = client.get(
        f"/api/storage/projects/{imported_project_id}/versions",
        params={"path": "tests/folder/demo.test.json"},
    )
    assert versions_response.status_code == 200
    assert len(versions_response.json()["versions"]) == 1

    logos_response = client.get("/api/storage/logos")
    assert logos_response.status_code == 200
    assert logos_response.json()["logos"][0]["schoolName"] == "BACKUP SCHOOL"

    import_again_response = client.post(
        f"/api/storage/projects/{imported_project_id}/backup/import",
        content=export_response.content,
        headers={"content-type": "application/zip"},
    )
    assert import_again_response.status_code == 200
    files_after_second_import = client.get(f"/api/storage/projects/{imported_project_id}/files").json()["files"]
    assert "tests/folder/demo imported.test.json" in [item["path"] for item in files_after_second_import]


def test_project_backup_import_rejects_unsafe_zip_paths(tmp_path, monkeypatch):
    monkeypatch.setattr(storage_api, "project_storage_service", FileProjectStorage(tmp_path))
    project_id = client.get("/api/storage/projects/default").json()["id"]
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("mauth-project-backup.json", '{"format":"mauth-project-backup","version":1}')
        archive.writestr("../bad.txt", "bad")

    response = client.post(
        f"/api/storage/projects/{project_id}/backup/import",
        content=buffer.getvalue(),
        headers={"content-type": "application/zip"},
    )

    assert response.status_code == 400
