import io
import zipfile

from fastapi.testclient import TestClient

from app.api import storage as storage_api
from app.main import app
from app.services.storage import FileLogoStorage, FileProjectStorage, FileTestStorage

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
            "formattingConfig": {"id": "exam-booklet", "page": {"size": "A4"}},
            "activeProjectFilePath": "tests/demo.test.json",
            "activeProjectFileRevision": 7,
        },
    )

    assert response.status_code == 200
    autosave = response.json()["autosave"]
    assert autosave["activeProjectFilePath"] == "tests/demo.test.json"
    assert autosave["activeProjectFileRevision"] == 7

    load_response = client.get("/api/storage/tests/autosave")
    assert load_response.status_code == 200
    assert load_response.json()["autosave"]["questions"][0]["id"] == "question-1"
    assert load_response.json()["autosave"]["formattingConfig"]["id"] == "exam-booklet"
    assert load_response.json()["autosave"]["activeProjectFileRevision"] == 7


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
