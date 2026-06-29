from __future__ import annotations

import json
import os
import re
import shutil
import uuid
import zipfile
from base64 import b64decode, b64encode, urlsafe_b64encode
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path, PurePosixPath
from typing import Any

from app.bootstrap import ROOT


def documents_workspace_root() -> Path:
    configured = os.environ.get("MAUTH_DOCUMENTS_ROOT")
    if configured:
        return Path(configured).expanduser()
    return Path.home() / "Documents" / "Mauth"


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def storage_root() -> Path:
    configured = os.environ.get("MATH_APP_STORAGE_ROOT")
    return Path(configured).expanduser() if configured else documents_workspace_root() / ".mauth"


def using_default_visible_workspace() -> bool:
    return "MATH_APP_STORAGE_ROOT" not in os.environ


def copy_tree_if_missing(source: Path, target: Path) -> None:
    if not source.exists() or target.exists():
        return
    shutil.copytree(source, target)


def copy_user_project_tree(source: Path, target: Path) -> None:
    if not source.exists() or target.exists():
        return

    def ignore_generated(directory: str, names: list[str]) -> set[str]:
        return {
            name
            for name in names
            if (Path(directory) / name).is_dir() and name.startswith(GENERATED_PROJECT_FOLDER_PREFIXES)
        }

    shutil.copytree(source, target, ignore=ignore_generated)


def safe_file_stem(value: str) -> str:
    stem = re.sub(r"[^A-Za-z0-9_.-]+", "-", value.strip())
    stem = stem.strip(".-")
    return stem[:120] or f"test-{uuid.uuid4().hex}"


def atomic_write_json(path: Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = path.with_name(f".{path.name}.{uuid.uuid4().hex}.tmp")
    with temp_path.open("w", encoding="utf-8") as handle:
        json.dump(data, handle, indent=2, ensure_ascii=False)
        handle.write("\n")
    os.replace(temp_path, path)


def atomic_write_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = path.with_name(f".{path.name}.{uuid.uuid4().hex}.tmp")
    temp_path.write_text(content, encoding="utf-8")
    os.replace(temp_path, path)


def read_json_file(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        data = json.load(handle)
    return data if isinstance(data, dict) else {}


def zip_safe_path(value: str) -> str:
    if not isinstance(value, str):
        raise StorageValidationError("Backup entry path must be a string")
    if "\x00" in value or "\\" in value:
        raise StorageValidationError("Backup entry path is invalid")
    cleaned = value.strip().strip("/")
    if not cleaned:
        raise StorageValidationError("Backup entry path is required")
    path = PurePosixPath(cleaned)
    if path.is_absolute() or any(part in {"", ".", ".."} for part in path.parts):
        raise StorageValidationError("Backup entry path is invalid")
    return str(path)


def zip_read_bytes(archive: zipfile.ZipFile, name: str) -> bytes:
    safe_name = zip_safe_path(name)
    info = archive.getinfo(safe_name)
    if info.file_size > PROJECT_BACKUP_MAX_ENTRY_BYTES:
        raise StorageValidationError(f"Backup entry is too large: {safe_name}")
    return archive.read(info)


def zip_read_json(archive: zipfile.ZipFile, name: str) -> dict[str, Any]:
    try:
        raw = zip_read_bytes(archive, name)
        data = json.loads(raw.decode("utf-8"))
    except KeyError as error:
        raise StorageValidationError(f"Backup is missing {name}") from error
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise StorageValidationError(f"Backup has invalid JSON in {name}") from error
    return data if isinstance(data, dict) else {}


DATA_URL_PATTERN = re.compile(r"^data:(?P<media_type>[^;,]+)(?P<encoding>;base64)?,(?P<data>.*)$", re.DOTALL)
MEDIA_TYPE_EXTENSIONS = {
    "image/svg+xml": ".svg",
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/gif": ".gif",
    "image/webp": ".webp",
}
PROJECT_BACKUP_FORMAT = "mauth-project-backup"
PROJECT_BACKUP_VERSION = 1
PROJECT_BACKUP_MAX_BYTES = 150 * 1024 * 1024
PROJECT_BACKUP_MAX_ENTRY_BYTES = 25 * 1024 * 1024
PROJECT_BACKUP_MAX_ENTRIES = 5000
GENERATED_PROJECT_FOLDER_PREFIXES = ("__file_manager_smoke_",)


def data_url_parts(value: str) -> tuple[str, bytes] | None:
    match = DATA_URL_PATTERN.match(value)
    if not match:
        return None

    media_type = match.group("media_type")
    data = match.group("data")
    if match.group("encoding"):
        return media_type, b64decode(data)
    return media_type, data.encode("utf-8")


def data_url(media_type: str, content: bytes) -> str:
    return f"data:{media_type};base64,{b64encode(content).decode('ascii')}"


def is_generated_project_folder(path: Path) -> bool:
    return path.is_dir() and path.name.startswith(GENERATED_PROJECT_FOLDER_PREFIXES)


class StorageConflictError(Exception):
    def __init__(self, message: str, current: dict[str, Any] | None = None) -> None:
        super().__init__(message)
        self.current = current


class StorageNotFoundError(Exception):
    pass


class StorageValidationError(Exception):
    pass


class FileTestStorage:
    def __init__(self, root: Path | None = None) -> None:
        self.root = root or storage_root()
        self.should_migrate_legacy_storage = root is None and using_default_visible_workspace()
        self.legacy_storage_migrated = False
        self.tests_dir = self.root / "tests"
        self.autosave_dir = self.root / "autosave"
        self.backups_dir = self.root / "backups" / "tests"

    def list_tests(self) -> list[dict[str, Any]]:
        self._migrate_legacy_storage_if_needed()
        self.tests_dir.mkdir(parents=True, exist_ok=True)
        records = []
        for path in sorted(self.tests_dir.glob("*.json")):
            try:
                record = read_json_file(path)
            except (OSError, json.JSONDecodeError):
                continue
            if isinstance(record.get("id"), str):
                records.append(record)
        return sorted(records, key=lambda record: str(record.get("updatedAt", "")), reverse=True)

    def get_test(self, test_id: str) -> dict[str, Any] | None:
        self._migrate_legacy_storage_if_needed()
        path = self._test_path(test_id)
        if not path.exists():
            return None
        return read_json_file(path)

    def save_test(self, payload: dict[str, Any]) -> dict[str, Any]:
        self._migrate_legacy_storage_if_needed()
        requested_id = payload.get("id")
        test_id = (
            safe_file_stem(requested_id)
            if isinstance(requested_id, str) and requested_id.strip()
            else f"saved-test-{uuid.uuid4().hex}"
        )
        path = self._test_path(test_id)
        existing = read_json_file(path) if path.exists() else {}
        now = utc_now_iso()
        record = {
            **payload,
            "id": test_id,
            "name": self._name(payload),
            "frontMatter": self._dict(payload.get("frontMatter")),
            "questions": self._list(payload.get("questions")),
            "logo": self._optional_dict(payload.get("logo")),
            "createdAt": payload.get("createdAt")
            if isinstance(payload.get("createdAt"), str)
            else existing.get("createdAt", now),
            "updatedAt": now,
        }

        if path.exists():
            self._backup(path, deleted=False)
        atomic_write_json(path, record)
        return record

    def delete_test(self, test_id: str) -> bool:
        self._migrate_legacy_storage_if_needed()
        path = self._test_path(test_id)
        if not path.exists():
            return False
        self._backup(path, deleted=True)
        path.unlink()
        return True

    def save_autosave(self, payload: dict[str, Any]) -> dict[str, Any]:
        self._migrate_legacy_storage_if_needed()
        now = utc_now_iso()
        record = {
            "frontMatter": self._dict(payload.get("frontMatter")),
            "questions": self._list(payload.get("questions")),
            "sectionHeadings": self._list(payload.get("sectionHeadings")),
            "documentFlow": self._list(payload.get("documentFlow")),
            "formattingConfig": self._dict(payload.get("formattingConfig")),
            "logo": self._optional_dict(payload.get("logo")),
            "activeProjectFilePath": payload.get("activeProjectFilePath")
            if isinstance(payload.get("activeProjectFilePath"), str)
            else None,
            "activeProjectFileRevision": payload.get("activeProjectFileRevision")
            if isinstance(payload.get("activeProjectFileRevision"), int)
            else None,
            "documentOpen": payload.get("documentOpen") if isinstance(payload.get("documentOpen"), bool) else True,
            "updatedAt": now,
        }
        atomic_write_json(self.autosave_dir / "current-test.json", record)
        return record

    def get_autosave(self) -> dict[str, Any] | None:
        self._migrate_legacy_storage_if_needed()
        path = self.autosave_dir / "current-test.json"
        if not path.exists():
            return None
        return read_json_file(path)

    def _test_path(self, test_id: str) -> Path:
        return self.tests_dir / f"{safe_file_stem(test_id)}.json"

    def _backup(self, path: Path, deleted: bool) -> None:
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        suffix = "deleted" if deleted else "backup"
        backup_path = self.backups_dir / f"{path.stem}-{timestamp}-{suffix}.json"
        backup_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(path, backup_path)

    def _migrate_legacy_storage_if_needed(self) -> None:
        if not self.should_migrate_legacy_storage or self.legacy_storage_migrated:
            return
        copy_tree_if_missing(ROOT / "storage" / "tests", self.root / "tests")
        copy_tree_if_missing(ROOT / "storage" / "autosave", self.root / "autosave")
        self.legacy_storage_migrated = True

    @staticmethod
    def _name(payload: dict[str, Any]) -> str:
        name = payload.get("name")
        return name.strip() if isinstance(name, str) and name.strip() else "Untitled test"

    @staticmethod
    def _dict(value: Any) -> dict[str, Any]:
        return value if isinstance(value, dict) else {}

    @staticmethod
    def _optional_dict(value: Any) -> dict[str, Any] | None:
        return value if isinstance(value, dict) else None

    @staticmethod
    def _list(value: Any) -> list[Any]:
        return value if isinstance(value, list) else []


class FileLogoStorage:
    def __init__(self, root: Path | None = None) -> None:
        self.root = root or storage_root()
        self.should_migrate_legacy_storage = root is None and using_default_visible_workspace()
        self.legacy_storage_migrated = False
        self.logos_dir = self.root / "assets" / "logos"
        self.files_dir = self.logos_dir / "files"
        self.backups_dir = self.root / "backups" / "logos"

    def list_logos(self) -> list[dict[str, Any]]:
        self._migrate_legacy_storage_if_needed()
        self.logos_dir.mkdir(parents=True, exist_ok=True)
        records = []
        for path in sorted(self.logos_dir.glob("*.json")):
            try:
                record = read_json_file(path)
            except (OSError, json.JSONDecodeError):
                continue
            if isinstance(record.get("id"), str):
                records.append(self._public_record(record))
        return sorted(records, key=lambda record: str(record.get("createdAt", "")))

    def get_logo(self, logo_id: str) -> dict[str, Any] | None:
        self._migrate_legacy_storage_if_needed()
        path = self._logo_path(logo_id)
        if not path.exists():
            return None
        return self._public_record(read_json_file(path))

    def save_logo(self, payload: dict[str, Any]) -> dict[str, Any]:
        self._migrate_legacy_storage_if_needed()
        requested_id = payload.get("id")
        logo_id = (
            safe_file_stem(requested_id)
            if isinstance(requested_id, str) and requested_id.strip()
            else f"logo-{uuid.uuid4().hex}"
        )
        path = self._logo_path(logo_id)
        existing = read_json_file(path) if path.exists() else {}
        now = utc_now_iso()
        name = self._name(payload)
        school_name = payload.get("schoolName") if isinstance(payload.get("schoolName"), str) else None
        src = payload.get("src") if isinstance(payload.get("src"), str) else ""
        record = {
            "id": logo_id,
            "name": name,
            "schoolName": school_name,
            "createdAt": payload.get("createdAt")
            if isinstance(payload.get("createdAt"), str)
            else existing.get("createdAt", now),
            "updatedAt": now,
        }

        data_parts = data_url_parts(src)
        if data_parts:
            media_type, content = data_parts
            extension = MEDIA_TYPE_EXTENSIONS.get(media_type, ".bin")
            file_path = self.files_dir / f"{logo_id}{extension}"
            file_path.parent.mkdir(parents=True, exist_ok=True)
            file_path.write_bytes(content)
            self._remove_old_file(existing, keep=file_path.name)
            record["fileName"] = file_path.name
            record["mediaType"] = media_type
        elif src:
            self._remove_old_file(existing)
            record["src"] = src
        else:
            record["src"] = existing.get("src", "")
            if isinstance(existing.get("fileName"), str):
                record["fileName"] = existing["fileName"]
                record["mediaType"] = existing.get("mediaType", "application/octet-stream")

        if path.exists():
            self._backup(path, deleted=False)
        atomic_write_json(path, record)
        return self._public_record(record)

    def delete_logo(self, logo_id: str) -> bool:
        self._migrate_legacy_storage_if_needed()
        path = self._logo_path(logo_id)
        if not path.exists():
            return False
        record = read_json_file(path)
        self._backup(path, deleted=True)
        self._remove_old_file(record)
        path.unlink()
        return True

    def _logo_path(self, logo_id: str) -> Path:
        return self.logos_dir / f"{safe_file_stem(logo_id)}.json"

    def _public_record(self, record: dict[str, Any]) -> dict[str, Any]:
        public = {
            "id": record.get("id"),
            "name": record.get("name") if isinstance(record.get("name"), str) else "Custom logo",
            "src": self._public_src(record),
            "createdAt": record.get("createdAt"),
            "updatedAt": record.get("updatedAt"),
        }
        if isinstance(record.get("schoolName"), str):
            public["schoolName"] = record["schoolName"]
        return public

    def _public_src(self, record: dict[str, Any]) -> str:
        self._migrate_legacy_storage_if_needed()
        file_name = record.get("fileName")
        if isinstance(file_name, str):
            file_path = self.files_dir / file_name
            if file_path.exists():
                media_type = (
                    record.get("mediaType") if isinstance(record.get("mediaType"), str) else "application/octet-stream"
                )
                return data_url(media_type, file_path.read_bytes())
        src = record.get("src")
        return src if isinstance(src, str) else ""

    def _remove_old_file(self, record: dict[str, Any], keep: str | None = None) -> None:
        file_name = record.get("fileName")
        if not isinstance(file_name, str) or file_name == keep:
            return
        file_path = self.files_dir / file_name
        if file_path.exists():
            file_path.unlink()

    def _backup(self, path: Path, deleted: bool) -> None:
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        suffix = "deleted" if deleted else "backup"
        backup_path = self.backups_dir / f"{path.stem}-{timestamp}-{suffix}.json"
        backup_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(path, backup_path)

    def _migrate_legacy_storage_if_needed(self) -> None:
        if not self.should_migrate_legacy_storage or self.legacy_storage_migrated:
            return
        copy_tree_if_missing(ROOT / "storage" / "assets" / "logos", self.root / "assets" / "logos")
        self.legacy_storage_migrated = True

    @staticmethod
    def _name(payload: dict[str, Any]) -> str:
        name = payload.get("name")
        return name.strip() if isinstance(name, str) and name.strip() else "Custom logo"


class FileProjectStorage:
    DEFAULT_PROJECT_ID = "local-project"
    WORKSPACE_CONFIG_NAME = "workspace.json"
    VISIBLE_PROJECT_FILE_SUFFIXES = (".test.json", ".mauth.md")

    def __init__(self, root: Path | None = None) -> None:
        self.base_workspace_root = documents_workspace_root()
        self.base_root = root or storage_root()
        self.root_override = root
        self.default_documents_dir = self.base_workspace_root / "Documents"
        self.workspace_root = self.base_workspace_root
        self.root = self.base_root
        self.uses_visible_workspace = root is None and using_default_visible_workspace()
        self.allow_legacy_visible_workspace_migration = self.uses_visible_workspace
        self.visible_workspace_migrated = False
        self.projects_dir = self.root / "projects"
        self.documents_dir = self.default_documents_dir
        if self.uses_visible_workspace:
            self._load_active_documents_folder()

    def list_projects(self) -> list[dict[str, Any]]:
        self._migrate_default_project_to_visible_workspace()
        self.projects_dir.mkdir(parents=True, exist_ok=True)
        projects: list[dict[str, Any]] = []
        default_path = self._project_path(self.DEFAULT_PROJECT_ID)
        if default_path.exists():
            try:
                record = read_json_file(default_path)
            except (OSError, json.JSONDecodeError):
                record = {}
            if isinstance(record.get("id"), str) and not isinstance(record.get("deletedAt"), str):
                projects.append(self._project_summary(record))
        for path in sorted(self.projects_dir.glob("*/project.json")):
            if path == default_path:
                continue
            try:
                record = read_json_file(path)
            except (OSError, json.JSONDecodeError):
                continue
            if isinstance(record.get("id"), str) and not isinstance(record.get("deletedAt"), str):
                projects.append(self._project_summary(record))
        return sorted(projects, key=lambda record: str(record.get("updatedAt", "")), reverse=True)

    def get_or_create_default_project(self) -> dict[str, Any]:
        self._migrate_default_project_to_visible_workspace()
        existing = self.get_project(self.DEFAULT_PROJECT_ID)
        if existing is not None:
            return existing
        return self.create_project({"id": self.DEFAULT_PROJECT_ID, "name": "Local Project"})

    def get_project(self, project_id: str) -> dict[str, Any] | None:
        self._migrate_default_project_to_visible_workspace()
        path = self._project_path(project_id)
        if not path.exists():
            return None
        record = self._load_project(project_id)
        if isinstance(record.get("deletedAt"), str):
            return None
        return self._project_summary(record)

    def create_project(self, payload: dict[str, Any]) -> dict[str, Any]:
        self._migrate_default_project_to_visible_workspace()
        requested_id = payload.get("id")
        project_id = (
            safe_file_stem(requested_id)
            if isinstance(requested_id, str) and requested_id.strip()
            else f"project-{uuid.uuid4().hex}"
        )
        path = self._project_path(project_id)
        if path.exists():
            record = self._load_project(project_id)
            raise StorageConflictError("Project already exists", current=self._project_summary(record))

        now = utc_now_iso()
        record = {
            "id": project_id,
            "name": self._project_name(payload),
            "description": payload.get("description") if isinstance(payload.get("description"), str) else None,
            "metadata": payload.get("metadata") if isinstance(payload.get("metadata"), dict) else {},
            "files": {},
            "createdAt": now,
            "updatedAt": now,
        }
        atomic_write_json(path, record)
        return self._project_summary(record)

    def open_documents_folder(self, folder_path: str) -> dict[str, Any]:
        if not self.uses_visible_workspace:
            raise StorageValidationError(
                "Opening another documents folder is only available for local visible workspaces"
            )
        resolved = self._validated_documents_folder(folder_path)
        self._configure_documents_folder(resolved, persist=True)
        return self.get_or_create_default_project()

    def reset_documents_folder(self) -> dict[str, Any]:
        if not self.uses_visible_workspace:
            raise StorageValidationError(
                "Resetting the documents folder is only available for local visible workspaces"
            )
        self._configure_documents_folder(self.default_documents_dir, persist=True)
        return self.get_or_create_default_project()

    def update_project(self, project_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        record = self._require_project(project_id)
        if isinstance(payload.get("name"), str) and payload["name"].strip():
            record["name"] = payload["name"].strip()
        if "description" in payload:
            record["description"] = payload.get("description") if isinstance(payload.get("description"), str) else None
        if isinstance(payload.get("metadata"), dict):
            record["metadata"] = payload["metadata"]
        record["updatedAt"] = utc_now_iso()
        atomic_write_json(self._project_path(project_id), record)
        return self._project_summary(record)

    def delete_project(self, project_id: str) -> bool:
        record = self.get_project(project_id)
        if record is None:
            return False
        full_record = self._require_project(project_id)
        full_record["deletedAt"] = utc_now_iso()
        full_record["updatedAt"] = full_record["deletedAt"]
        atomic_write_json(self._project_path(project_id), full_record)
        return True

    def list_files(self, project_id: str) -> list[dict[str, Any]]:
        project = self._require_project(project_id)
        self._index_visible_workspace_files(project_id, project)
        self._reconcile_missing_content(project_id, project)
        files = project.get("files") if isinstance(project.get("files"), dict) else {}
        items = [
            self._public_file(project_id, path, record, project)
            for path, record in files.items()
            if isinstance(path, str) and isinstance(record, dict) and not isinstance(record.get("deletedAt"), str)
        ]
        return sorted(items, key=lambda item: (0 if item["kind"] == "folder" else 1, str(item["path"])))

    def get_file(self, project_id: str, file_path: str) -> dict[str, Any]:
        normalized_path = safe_project_path(file_path)
        project = self._require_project(project_id)
        record = self._require_file(project_id, project, normalized_path)
        public = self._public_file(project_id, normalized_path, record, project)
        public["content"] = (
            None
            if public["kind"] == "folder"
            else self._content_path(project_id, normalized_path).read_text(encoding="utf-8")
        )
        public["versionCount"] = len(self.list_versions(project_id, normalized_path))
        return public

    def save_file(self, project_id: str, file_path: str, payload: dict[str, Any]) -> dict[str, Any]:
        normalized_path = safe_project_path(file_path)
        project = self._require_project(project_id)
        files = project.setdefault("files", {})
        if not isinstance(files, dict):
            files = {}
            project["files"] = files

        now = utc_now_iso()
        base_revision = payload.get("baseRevision")
        base_revision_present = "baseRevision" in payload
        stored = files.get(normalized_path) if isinstance(files.get(normalized_path), dict) else None
        if stored is not None and isinstance(stored.get("deletedAt"), str):
            if isinstance(base_revision, int) and base_revision != self._revision(stored):
                raise StorageConflictError(
                    "File has changed since it was loaded",
                    current=self._public_file(project_id, normalized_path, stored, project),
                )
            existing = None
        else:
            existing = stored

        if existing is not None and base_revision_present and base_revision is None:
            raise StorageConflictError(
                "File already exists",
                current=self._public_file(project_id, normalized_path, existing, project),
            )

        if existing is not None and isinstance(base_revision, int) and base_revision != self._revision(existing):
            raise StorageConflictError(
                "File has changed since it was loaded",
                current=self._public_file(project_id, normalized_path, existing, project),
            )

        kind = payload.get("kind") if payload.get("kind") in {"file", "folder"} else "file"
        file_type = self._file_type(normalized_path, payload.get("fileType"), kind)
        metadata = payload.get("metadata") if isinstance(payload.get("metadata"), dict) else {}
        if metadata.get("source") == "legacy-saved-tests-migration" and self._is_external_visible_documents_folder(
            project_id
        ):
            raise StorageValidationError("Legacy saved tests can only be imported into the default documents folder")
        revision = self._revision(existing) + 1 if existing is not None else 1
        created_at = (
            existing.get("createdAt") if existing is not None and isinstance(existing.get("createdAt"), str) else now
        )

        self._ensure_parent_folders(project_id, project, normalized_path, now)
        if existing is not None and existing.get("kind") == "file":
            self._snapshot_file(project_id, normalized_path, existing, reason="overwrite")

        size_bytes = 0
        if kind == "file":
            content = payload.get("content") if isinstance(payload.get("content"), str) else ""
            atomic_write_text(self._content_path(project_id, normalized_path), content)
            size_bytes = len(content.encode("utf-8"))
        else:
            self._content_path(project_id, normalized_path).mkdir(parents=True, exist_ok=True)

        files[normalized_path] = {
            "id": existing.get("id")
            if existing is not None and isinstance(existing.get("id"), str)
            else f"file-{uuid.uuid4().hex}",
            "name": PurePosixPath(normalized_path).name,
            "path": normalized_path,
            "kind": kind,
            "fileType": file_type,
            "metadata": metadata,
            "sortOrder": payload.get("sortOrder") if isinstance(payload.get("sortOrder"), int) else 0,
            "revision": revision,
            "sizeBytes": size_bytes,
            "createdAt": created_at,
            "updatedAt": now,
        }
        project["updatedAt"] = now
        atomic_write_json(self._project_path(project_id), project)
        return self.get_file(project_id, normalized_path)

    def delete_file(self, project_id: str, file_path: str, base_revision: int | None = None) -> bool:
        normalized_path = safe_project_path(file_path)
        project = self._require_project(project_id)
        files = project.get("files") if isinstance(project.get("files"), dict) else {}
        record = files.get(normalized_path) if isinstance(files.get(normalized_path), dict) else None
        if record is None or isinstance(record.get("deletedAt"), str):
            return False
        if isinstance(base_revision, int) and base_revision != self._revision(record):
            raise StorageConflictError(
                "File has changed since it was loaded",
                current=self._public_file(project_id, normalized_path, record, project),
            )
        records_to_delete = [(normalized_path, record)]
        if record.get("kind") == "folder":
            records_to_delete.extend(
                (path, child_record)
                for path, child_record in files.items()
                if isinstance(path, str)
                and path.startswith(f"{normalized_path}/")
                and isinstance(child_record, dict)
                and not isinstance(child_record.get("deletedAt"), str)
            )
        now = utc_now_iso()
        for path, record_to_delete in records_to_delete:
            if record_to_delete.get("kind") == "file":
                self._snapshot_file(project_id, path, record_to_delete, reason="delete")
            record_to_delete["deletedAt"] = now
            record_to_delete["updatedAt"] = now
            record_to_delete["revision"] = self._revision(record_to_delete) + 1
        project["updatedAt"] = now
        atomic_write_json(self._project_path(project_id), project)
        return True

    def list_versions(self, project_id: str, file_path: str) -> list[dict[str, Any]]:
        normalized_path = safe_project_path(file_path)
        versions_dir = self._versions_path(project_id, normalized_path)
        if not versions_dir.exists():
            return []
        versions: list[dict[str, Any]] = []
        for path in sorted(versions_dir.glob("*.json")):
            try:
                record = read_json_file(path)
            except (OSError, json.JSONDecodeError):
                continue
            if isinstance(record.get("id"), str):
                versions.append(record)
        return sorted(versions, key=lambda record: str(record.get("createdAt", "")), reverse=True)

    def restore_version(self, project_id: str, file_path: str, version_id: str) -> dict[str, Any]:
        normalized_path = safe_project_path(file_path)
        version = next(
            (item for item in self.list_versions(project_id, normalized_path) if item.get("id") == version_id), None
        )
        if version is None:
            raise StorageNotFoundError("Version not found")
        current = self.get_file(project_id, normalized_path)
        return self.save_file(
            project_id,
            normalized_path,
            {
                "content": version.get("content") if isinstance(version.get("content"), str) else "",
                "fileType": version.get("fileType"),
                "metadata": version.get("metadata") if isinstance(version.get("metadata"), dict) else {},
                "baseRevision": current["revision"],
            },
        )

    def export_backup(self, project_id: str) -> tuple[str, bytes]:
        project = self._require_project(project_id)
        public_project = self._project_summary(project)
        active_files = self.list_files(project_id)
        now = utc_now_iso()
        manifest = {
            "format": PROJECT_BACKUP_FORMAT,
            "version": PROJECT_BACKUP_VERSION,
            "exportedAt": now,
            "project": public_project,
            "files": active_files,
            "logos": self._logo_backup_summaries(),
        }

        buffer = BytesIO()
        with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            archive.writestr("mauth-project-backup.json", json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
            archive.writestr("project/project.json", json.dumps(project, indent=2, ensure_ascii=False) + "\n")

            for file in active_files:
                file_path = file.get("path")
                if not isinstance(file_path, str) or file.get("kind") != "file":
                    continue
                content_path = self._content_path(project_id, file_path)
                if content_path.exists():
                    archive.write(content_path, f"project/files/{file_path}")

            for file in active_files:
                file_path = file.get("path")
                if not isinstance(file_path, str) or file.get("kind") != "file":
                    continue
                versions_dir = self._versions_path(project_id, file_path)
                if not versions_dir.exists():
                    continue
                for version_path in sorted(versions_dir.glob("*.json")):
                    archive.write(version_path, f"project/versions/{versions_dir.name}/{version_path.name}")

            logos_dir = self.root / "assets" / "logos"
            logo_files_dir = logos_dir / "files"
            for logo_path in sorted(logos_dir.glob("*.json")):
                archive.write(logo_path, f"logos/{logo_path.name}")
                try:
                    record = read_json_file(logo_path)
                except (OSError, json.JSONDecodeError):
                    continue
                file_name = record.get("fileName")
                if isinstance(file_name, str):
                    logo_file_path = logo_files_dir / Path(file_name).name
                    if logo_file_path.exists():
                        archive.write(logo_file_path, f"logos/files/{logo_file_path.name}")

        filename = f"{safe_file_stem(str(public_project.get('name') or project_id))}-{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')}.zip"
        return filename, buffer.getvalue()

    def import_backup(self, project_id: str, content: bytes) -> dict[str, Any]:
        if not content:
            raise StorageValidationError("Backup file is empty")
        if len(content) > PROJECT_BACKUP_MAX_BYTES:
            raise StorageValidationError("Backup file is too large")
        self._require_project(project_id)

        try:
            archive = zipfile.ZipFile(BytesIO(content), "r")
        except zipfile.BadZipFile as error:
            raise StorageValidationError("Backup file is not a valid ZIP archive") from error

        with archive:
            members = archive.infolist()
            if len(members) > PROJECT_BACKUP_MAX_ENTRIES:
                raise StorageValidationError("Backup contains too many entries")
            for member in members:
                safe_name = zip_safe_path(member.filename)
                if member.is_dir():
                    continue
                if safe_name != member.filename:
                    raise StorageValidationError("Backup entry path is invalid")
                if member.file_size > PROJECT_BACKUP_MAX_ENTRY_BYTES:
                    raise StorageValidationError(f"Backup entry is too large: {member.filename}")

            manifest = zip_read_json(archive, "mauth-project-backup.json")
            if manifest.get("format") != PROJECT_BACKUP_FORMAT:
                raise StorageValidationError("Backup format is not supported")
            if manifest.get("version") != PROJECT_BACKUP_VERSION:
                raise StorageValidationError("Backup version is not supported")

            source_project = zip_read_json(archive, "project/project.json")
            source_files = source_project.get("files") if isinstance(source_project.get("files"), dict) else {}
            imported_at = utc_now_iso()
            current_files = self.list_files(project_id)
            existing_paths = {file["path"].lower(): file for file in current_files if isinstance(file.get("path"), str)}
            planned_paths: set[str] = set()
            path_mapping: dict[str, str] = {}
            imported_files = 0
            imported_folders = 0
            imported_versions = 0

            active_source_records = [
                (safe_project_path(path), record)
                for path, record in source_files.items()
                if isinstance(path, str) and isinstance(record, dict) and not isinstance(record.get("deletedAt"), str)
            ]
            active_source_records.sort(
                key=lambda item: (
                    len(PurePosixPath(item[0]).parts),
                    0 if item[1].get("kind") == "folder" else 1,
                    item[0],
                )
            )

            for source_path, record in active_source_records:
                kind = record.get("kind") if record.get("kind") in {"file", "folder"} else "file"
                target_path = self._backup_import_target_path(
                    source_path, kind, existing_paths, planned_paths, path_mapping
                )
                path_mapping[source_path] = target_path
                planned_paths.add(target_path.lower())
                metadata = record.get("metadata") if isinstance(record.get("metadata"), dict) else {}
                metadata = {**metadata, "importedFromBackupAt": imported_at}

                if kind == "folder":
                    if target_path.lower() not in existing_paths:
                        self.save_file(
                            project_id, target_path, {"kind": "folder", "fileType": "folder", "metadata": metadata}
                        )
                        imported_folders += 1
                    continue

                archive_path = f"project/files/{source_path}"
                try:
                    raw_content = zip_read_bytes(archive, archive_path)
                except KeyError as error:
                    raise StorageValidationError(f"Backup is missing content for {source_path}") from error
                try:
                    text_content = raw_content.decode("utf-8")
                except UnicodeDecodeError as error:
                    raise StorageValidationError(f"Backup file is not UTF-8 text: {source_path}") from error

                self.save_file(
                    project_id,
                    target_path,
                    {
                        "content": text_content,
                        "kind": "file",
                        "fileType": record.get("fileType") if isinstance(record.get("fileType"), str) else None,
                        "metadata": metadata,
                    },
                )
                imported_files += 1

            target_project = self._require_project(project_id)
            target_files = target_project.get("files") if isinstance(target_project.get("files"), dict) else {}
            for source_path, target_path in path_mapping.items():
                target_record = (
                    target_files.get(target_path) if isinstance(target_files.get(target_path), dict) else None
                )
                if not isinstance(target_record, dict) or target_record.get("kind") != "file":
                    continue
                source_versions_prefix = f"project/versions/{self._encoded_version_path(source_path)}/"
                version_members = [
                    member
                    for member in members
                    if not member.is_dir()
                    and member.filename.startswith(source_versions_prefix)
                    and member.filename.endswith(".json")
                ]
                for member in version_members:
                    version = zip_read_json(archive, member.filename)
                    version["id"] = f"version-{uuid.uuid4().hex}"
                    version["projectId"] = safe_file_stem(project_id)
                    version["filePath"] = target_path
                    version["fileId"] = target_record.get("id")
                    if not isinstance(version.get("metadata"), dict):
                        version["metadata"] = {}
                    version["metadata"] = {**version["metadata"], "importedFromBackupAt": imported_at}
                    if not isinstance(version.get("createdAt"), str):
                        version["createdAt"] = imported_at
                    target_versions_dir = self._versions_path(project_id, target_path)
                    target_versions_dir.mkdir(parents=True, exist_ok=True)
                    version_name = (
                        f"{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}-imported-{uuid.uuid4().hex[:8]}.json"
                    )
                    atomic_write_json(target_versions_dir / version_name, version)
                    imported_versions += 1

            imported_logos = self._import_backup_logos(archive, imported_at)

        return {
            "importedFiles": imported_files,
            "importedFolders": imported_folders,
            "importedVersions": imported_versions,
            "importedLogos": imported_logos,
            "skippedFiles": 0,
        }

    def _project_path(self, project_id: str) -> Path:
        if self.uses_visible_workspace and safe_file_stem(project_id) == self.DEFAULT_PROJECT_ID:
            return self.root / "project.json"
        return self.projects_dir / safe_file_stem(project_id) / "project.json"

    def _workspace_config_path(self) -> Path:
        return self.base_root / self.WORKSPACE_CONFIG_NAME

    def _load_active_documents_folder(self) -> None:
        path = self._workspace_config_path()
        if not path.exists():
            return
        try:
            config = read_json_file(path)
        except (OSError, json.JSONDecodeError):
            return
        documents_path = config.get("documentsPath")
        if not isinstance(documents_path, str) or not documents_path.strip():
            return
        try:
            resolved = self._validated_documents_folder(documents_path)
        except StorageValidationError:
            return
        self._configure_documents_folder(resolved, persist=False)

    def _configure_documents_folder(self, documents_dir: Path, persist: bool) -> None:
        resolved = documents_dir.expanduser().resolve()
        default_documents_dir = self.default_documents_dir.expanduser().resolve()
        if resolved == default_documents_dir:
            self.workspace_root = self.base_workspace_root
            self.root = self.base_root
            self.documents_dir = self.default_documents_dir
            self.allow_legacy_visible_workspace_migration = True
        else:
            self.workspace_root = resolved
            self.root = resolved / ".mauth"
            self.documents_dir = resolved
            self.allow_legacy_visible_workspace_migration = False
        self.projects_dir = self.root / "projects"
        self.visible_workspace_migrated = False
        if persist:
            self.base_root.mkdir(parents=True, exist_ok=True)
            if resolved == default_documents_dir:
                config_path = self._workspace_config_path()
                if config_path.exists():
                    config_path.unlink()
            else:
                atomic_write_json(
                    self._workspace_config_path(),
                    {
                        "documentsPath": str(resolved),
                        "updatedAt": utc_now_iso(),
                    },
                )

    def _validated_documents_folder(self, folder_path: str) -> Path:
        if not isinstance(folder_path, str) or not folder_path.strip():
            raise StorageValidationError("Folder path is required")
        try:
            resolved = Path(folder_path).expanduser().resolve()
        except (OSError, RuntimeError) as error:
            raise StorageValidationError("Folder path is invalid") from error
        if resolved.name == ".mauth" or ".mauth" in resolved.parts:
            raise StorageValidationError(
                "Choose the folder that contains your documents, not the .mauth metadata folder"
            )
        if not resolved.exists():
            raise StorageValidationError("Folder does not exist")
        if not resolved.is_dir():
            raise StorageValidationError("Path is not a folder")
        return resolved

    def _migrate_default_project_to_visible_workspace(self) -> None:
        if self._is_external_visible_documents_folder(self.DEFAULT_PROJECT_ID):
            return
        if (
            not self.uses_visible_workspace
            or not self.allow_legacy_visible_workspace_migration
            or self.visible_workspace_migrated
        ):
            return
        self.visible_workspace_migrated = True
        target_project = self.root / "project.json"
        if target_project.exists():
            return
        source_project_dir = ROOT / "storage" / "projects" / self.DEFAULT_PROJECT_ID
        source_project = source_project_dir / "project.json"
        if not source_project.exists():
            return

        self.root.mkdir(parents=True, exist_ok=True)
        atomic_write_json(target_project, self._project_without_generated_entries(read_json_file(source_project)))

        source_files = source_project_dir / "files"
        source_tests = source_files / "tests"
        if source_tests.exists() and not self.documents_dir.exists():
            copy_user_project_tree(source_tests, self.documents_dir)
        elif source_tests.exists():
            for child in source_tests.iterdir():
                if is_generated_project_folder(child):
                    continue
                target = self.documents_dir / child.name
                if target.exists():
                    continue
                if child.is_dir():
                    copy_user_project_tree(child, target)
                else:
                    target.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(child, target)

        for child in source_files.iterdir() if source_files.exists() else []:
            if child.name == "tests":
                continue
            if is_generated_project_folder(child):
                continue
            target = self.workspace_root / child.name
            if target.exists():
                continue
            if child.is_dir():
                copy_user_project_tree(child, target)
            else:
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(child, target)

        copy_tree_if_missing(source_project_dir / "versions", self.root / "versions")

    @staticmethod
    def _project_without_generated_entries(project: dict[str, Any]) -> dict[str, Any]:
        files = project.get("files") if isinstance(project.get("files"), dict) else {}
        project["files"] = {
            path: record
            for path, record in files.items()
            if isinstance(path, str)
            and not any(part.startswith(GENERATED_PROJECT_FOLDER_PREFIXES) for part in PurePosixPath(path).parts)
        }
        return project

    def _is_external_visible_documents_folder(self, project_id: str) -> bool:
        if not self.uses_visible_workspace or safe_file_stem(project_id) != self.DEFAULT_PROJECT_ID:
            return False
        default_documents_dir = self.default_documents_dir.expanduser().resolve()
        active_documents_dir = self.documents_dir.expanduser().resolve()
        return active_documents_dir != default_documents_dir or self.root != self.base_root

    def _project_dir(self, project_id: str) -> Path:
        return self._project_path(project_id).parent

    def _content_path(self, project_id: str, file_path: str) -> Path:
        if self.uses_visible_workspace and safe_file_stem(project_id) == self.DEFAULT_PROJECT_ID:
            return self.documents_dir / self._visible_document_path(file_path)
        return self._project_dir(project_id) / "files" / Path(*file_path.split("/"))

    def _versions_path(self, project_id: str, file_path: str) -> Path:
        return self._project_dir(project_id) / "versions" / self._encoded_version_path(file_path)

    @staticmethod
    def _visible_document_path(file_path: str) -> Path:
        parts = file_path.split("/")
        if parts and parts[0] == "tests":
            parts = parts[1:]
        if not parts:
            return Path(".")
        return Path(*parts)

    def _load_project(self, project_id: str) -> dict[str, Any]:
        path = self._project_path(project_id)
        record = read_json_file(path)
        if not isinstance(record.get("files"), dict):
            record["files"] = {}
        return record

    def _require_project(self, project_id: str) -> dict[str, Any]:
        path = self._project_path(project_id)
        if not path.exists():
            raise StorageNotFoundError("Project not found")
        record = self._load_project(project_id)
        if isinstance(record.get("deletedAt"), str):
            raise StorageNotFoundError("Project not found")
        return record

    def _require_file(self, project_id: str, project: dict[str, Any], file_path: str) -> dict[str, Any]:
        files = project.get("files") if isinstance(project.get("files"), dict) else {}
        record = files.get(file_path) if isinstance(files.get(file_path), dict) else None
        if record is None or isinstance(record.get("deletedAt"), str):
            raise StorageNotFoundError("Project file not found")
        content_path = self._content_path(project_id, file_path)
        if record.get("kind") == "file" and not content_path.exists():
            raise StorageNotFoundError("Project file content not found")
        return record

    def _index_visible_workspace_files(self, project_id: str, project: dict[str, Any]) -> None:
        if not self.uses_visible_workspace or safe_file_stem(project_id) != self.DEFAULT_PROJECT_ID:
            return
        if not self.documents_dir.exists():
            return
        files = project.setdefault("files", {})
        if not isinstance(files, dict):
            project["files"] = {}
            files = project["files"]
        now = utc_now_iso()
        changed = False

        for content_path in sorted(self.documents_dir.rglob("*")):
            if self._skip_visible_workspace_path(content_path):
                continue
            if not content_path.is_file() or not self._is_visible_project_file(content_path):
                continue
            relative_path = content_path.relative_to(self.documents_dir)
            visible_project_path = safe_project_path(f"tests/{relative_path.as_posix()}")
            parent = PurePosixPath(visible_project_path).parent
            accumulated: list[str] = []
            for part in parent.parts:
                accumulated.append(part)
                folder_path = "/".join(accumulated)
                existing_folder = files.get(folder_path) if isinstance(files.get(folder_path), dict) else None
                if existing_folder is not None:
                    continue
                files[folder_path] = self._visible_file_record(folder_path, "folder", 0, now, content_path.parent)
                changed = True

            existing = files.get(visible_project_path) if isinstance(files.get(visible_project_path), dict) else None
            if existing is not None:
                continue
            files[visible_project_path] = self._visible_file_record(
                visible_project_path,
                self._file_type(visible_project_path, None, "file"),
                content_path.stat().st_size,
                now,
                content_path,
            )
            changed = True

        if changed:
            project["updatedAt"] = now
            atomic_write_json(self._project_path(project_id), project)

    def _skip_visible_workspace_path(self, path: Path) -> bool:
        try:
            relative_parts = path.relative_to(self.documents_dir).parts
        except ValueError:
            return True
        return any(
            part == ".mauth" or part.startswith(".") or part.startswith(GENERATED_PROJECT_FOLDER_PREFIXES)
            for part in relative_parts
        )

    def _is_visible_project_file(self, path: Path) -> bool:
        name = path.name.lower()
        return any(name.endswith(suffix) for suffix in self.VISIBLE_PROJECT_FILE_SUFFIXES)

    def _visible_file_record(
        self, project_path: str, file_type: str, size_bytes: int, now: str, content_path: Path
    ) -> dict[str, Any]:
        try:
            mtime = (
                datetime.fromtimestamp(content_path.stat().st_mtime, timezone.utc).isoformat().replace("+00:00", "Z")
            )
        except OSError:
            mtime = now
        kind = "folder" if file_type == "folder" else "file"
        return {
            "id": f"file-{uuid.uuid4().hex}" if kind == "file" else f"folder-{uuid.uuid4().hex}",
            "name": PurePosixPath(project_path).name,
            "path": project_path,
            "kind": kind,
            "fileType": file_type,
            "metadata": {"source": "visible-workspace-scan"},
            "sortOrder": 0,
            "revision": 1,
            "sizeBytes": size_bytes,
            "createdAt": mtime,
            "updatedAt": mtime,
        }

    def _reconcile_missing_content(self, project_id: str, project: dict[str, Any]) -> None:
        files = project.get("files") if isinstance(project.get("files"), dict) else {}
        now: str | None = None
        changed = False

        for path, record in files.items():
            if not isinstance(path, str) or not isinstance(record, dict) or isinstance(record.get("deletedAt"), str):
                continue
            content_path = self._content_path(project_id, path)
            kind = record.get("kind") if record.get("kind") in {"file", "folder"} else "file"
            missing = kind == "file" and not content_path.exists()
            missing = missing or (kind == "folder" and not content_path.is_dir())
            if not missing:
                continue
            now = now or utc_now_iso()
            record["deletedAt"] = now
            record["updatedAt"] = now
            record["revision"] = self._revision(record) + 1
            changed = True

        if changed:
            project["updatedAt"] = now
            atomic_write_json(self._project_path(project_id), project)

    def _ensure_parent_folders(self, project_id: str, project: dict[str, Any], file_path: str, now: str) -> None:
        files = project.setdefault("files", {})
        if not isinstance(files, dict):
            return
        parent = PurePosixPath(file_path).parent
        if str(parent) == ".":
            return
        accumulated: list[str] = []
        for part in parent.parts:
            accumulated.append(part)
            folder_path = "/".join(accumulated)
            existing = files.get(folder_path) if isinstance(files.get(folder_path), dict) else None
            if existing is not None and not isinstance(existing.get("deletedAt"), str):
                continue
            files[folder_path] = {
                "id": f"folder-{uuid.uuid4().hex}",
                "name": part,
                "path": folder_path,
                "kind": "folder",
                "fileType": "folder",
                "metadata": {},
                "sortOrder": 0,
                "revision": 1,
                "sizeBytes": 0,
                "createdAt": now,
                "updatedAt": now,
            }
            self._content_path(project_id, folder_path).mkdir(parents=True, exist_ok=True)

    def _snapshot_file(self, project_id: str, file_path: str, record: dict[str, Any], reason: str) -> None:
        content_path = self._content_path(project_id, file_path)
        if not content_path.exists():
            return
        now = utc_now_iso()
        version = {
            "id": f"version-{uuid.uuid4().hex}",
            "projectId": safe_file_stem(project_id),
            "filePath": file_path,
            "fileId": record.get("id"),
            "fileType": record.get("fileType"),
            "metadata": record.get("metadata") if isinstance(record.get("metadata"), dict) else {},
            "revision": self._revision(record),
            "reason": reason,
            "content": content_path.read_text(encoding="utf-8"),
            "createdAt": now,
        }
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        version_path = self._versions_path(project_id, file_path) / (
            f"{timestamp}-r{version['revision']}-{safe_file_stem(reason)}-{uuid.uuid4().hex[:8]}.json"
        )
        atomic_write_json(version_path, version)

    def _public_file(
        self, project_id: str, file_path: str, record: dict[str, Any], project: dict[str, Any]
    ) -> dict[str, Any]:
        parent_path = str(PurePosixPath(file_path).parent)
        parent_path = None if parent_path == "." else parent_path
        files = project.get("files") if isinstance(project.get("files"), dict) else {}
        parent_record = (
            files.get(parent_path)
            if isinstance(parent_path, str) and isinstance(files.get(parent_path), dict)
            else None
        )
        return {
            "id": record.get("id") if isinstance(record.get("id"), str) else f"file-{uuid.uuid4().hex}",
            "projectId": safe_file_stem(project_id),
            "parentId": parent_record.get("id") if isinstance(parent_record, dict) else None,
            "parentPath": parent_path,
            "path": file_path,
            "name": record.get("name") if isinstance(record.get("name"), str) else PurePosixPath(file_path).name,
            "kind": record.get("kind") if record.get("kind") in {"file", "folder"} else "file",
            "fileType": record.get("fileType") if isinstance(record.get("fileType"), str) else None,
            "metadata": record.get("metadata") if isinstance(record.get("metadata"), dict) else {},
            "sortOrder": record.get("sortOrder") if isinstance(record.get("sortOrder"), int) else 0,
            "revision": self._revision(record),
            "sizeBytes": record.get("sizeBytes") if isinstance(record.get("sizeBytes"), int) else 0,
            "createdAt": record.get("createdAt"),
            "updatedAt": record.get("updatedAt"),
        }

    def _project_summary(self, record: dict[str, Any]) -> dict[str, Any]:
        files = record.get("files") if isinstance(record.get("files"), dict) else {}
        file_count = sum(
            1
            for file_record in files.values()
            if isinstance(file_record, dict)
            and file_record.get("kind") == "file"
            and not isinstance(file_record.get("deletedAt"), str)
        )
        return {
            "id": record.get("id"),
            "name": record.get("name") if isinstance(record.get("name"), str) else "Untitled project",
            "description": record.get("description") if isinstance(record.get("description"), str) else None,
            "metadata": record.get("metadata") if isinstance(record.get("metadata"), dict) else {},
            "workspacePath": str(self._workspace_path_for_project(str(record.get("id") or ""))),
            "documentsPath": str(self._documents_path_for_project(str(record.get("id") or ""))),
            "fileCount": file_count,
            "createdAt": record.get("createdAt"),
            "updatedAt": record.get("updatedAt"),
        }

    def _workspace_path_for_project(self, project_id: str) -> Path:
        if self.uses_visible_workspace and safe_file_stem(project_id) == self.DEFAULT_PROJECT_ID:
            return self.workspace_root
        return self._project_dir(project_id)

    def _documents_path_for_project(self, project_id: str) -> Path:
        if self.uses_visible_workspace and safe_file_stem(project_id) == self.DEFAULT_PROJECT_ID:
            return self.documents_dir
        return self._project_dir(project_id) / "files"

    def _backup_import_target_path(
        self,
        source_path: str,
        kind: str,
        existing_paths: dict[str, dict[str, Any]],
        planned_paths: set[str],
        path_mapping: dict[str, str],
    ) -> str:
        source = PurePosixPath(source_path)
        parent = source.parent
        mapped_parent = ""
        if str(parent) != ".":
            parent_source = str(parent)
            mapped_parent = path_mapping.get(parent_source, parent_source)
        candidate = str(PurePosixPath(mapped_parent) / source.name) if mapped_parent else source.name
        candidate = safe_project_path(candidate)
        existing = existing_paths.get(candidate.lower())
        if kind == "folder" and existing is not None and existing.get("kind") == "folder":
            return candidate
        if existing is None and candidate.lower() not in planned_paths:
            return candidate
        return self._unique_import_path(candidate, kind, existing_paths, planned_paths)

    def _unique_import_path(
        self,
        file_path: str,
        kind: str,
        existing_paths: dict[str, dict[str, Any]],
        planned_paths: set[str],
    ) -> str:
        path = PurePosixPath(file_path)
        parent = "" if str(path.parent) == "." else str(path.parent)
        stem, suffix = self._import_name_parts(path.name, kind)
        for index in range(1, 1000):
            label = " imported" if index == 1 else f" imported {index}"
            name = f"{stem}{label}{suffix}" if kind == "file" else f"{stem}{label}"
            candidate = str(PurePosixPath(parent) / name) if parent else name
            key = candidate.lower()
            if key not in existing_paths and key not in planned_paths:
                return safe_project_path(candidate)
        raise StorageConflictError("Could not find a unique imported file name")

    @staticmethod
    def _import_name_parts(name: str, kind: str) -> tuple[str, str]:
        if kind != "file":
            return name, ""
        for suffix in (".test.json", ".mauth.md", ".diagram.json", ".config.json"):
            if name.lower().endswith(suffix):
                return name[: -len(suffix)], name[-len(suffix) :]
        suffix = PurePosixPath(name).suffix
        return (name[: -len(suffix)], suffix) if suffix else (name, "")

    @staticmethod
    def _encoded_version_path(file_path: str) -> str:
        return urlsafe_b64encode(file_path.encode("utf-8")).decode("ascii").rstrip("=")

    def _logo_backup_summaries(self) -> list[dict[str, Any]]:
        logos_dir = self.root / "assets" / "logos"
        records: list[dict[str, Any]] = []
        for logo_path in sorted(logos_dir.glob("*.json")):
            try:
                record = read_json_file(logo_path)
            except (OSError, json.JSONDecodeError):
                continue
            if isinstance(record.get("id"), str):
                records.append(
                    {
                        "id": record["id"],
                        "name": record.get("name"),
                        "schoolName": record.get("schoolName"),
                        "fileName": record.get("fileName"),
                        "updatedAt": record.get("updatedAt"),
                    }
                )
        return records

    def _import_backup_logos(self, archive: zipfile.ZipFile, imported_at: str) -> int:
        logos_dir = self.root / "assets" / "logos"
        logo_files_dir = logos_dir / "files"
        logo_members = [
            member
            for member in archive.infolist()
            if not member.is_dir()
            and member.filename.startswith("logos/")
            and not member.filename.startswith("logos/files/")
            and member.filename.endswith(".json")
        ]
        imported = 0
        for member in logo_members:
            record = zip_read_json(archive, member.filename)
            logo_id_source = record.get("id")
            logo_id = (
                safe_file_stem(logo_id_source)
                if isinstance(logo_id_source, str) and logo_id_source.strip()
                else f"logo-{uuid.uuid4().hex}"
            )
            target_logo_path = logos_dir / f"{logo_id}.json"
            if target_logo_path.exists():
                continue

            record["id"] = logo_id
            if not isinstance(record.get("name"), str) or not record["name"].strip():
                record["name"] = "Imported logo"
            if not isinstance(record.get("createdAt"), str):
                record["createdAt"] = imported_at
            record["updatedAt"] = imported_at

            file_name = record.get("fileName")
            if isinstance(file_name, str) and file_name.strip():
                source_file_name = Path(file_name).name
                source_member_name = f"logos/files/{source_file_name}"
                try:
                    logo_bytes = zip_read_bytes(archive, source_member_name)
                except KeyError:
                    record.pop("fileName", None)
                    record.pop("mediaType", None)
                else:
                    suffix = Path(source_file_name).suffix or ".bin"
                    target_file_name = self._unique_logo_file_name(logo_id, suffix)
                    logo_files_dir.mkdir(parents=True, exist_ok=True)
                    (logo_files_dir / target_file_name).write_bytes(logo_bytes)
                    record["fileName"] = target_file_name
            atomic_write_json(target_logo_path, record)
            imported += 1
        return imported

    def _unique_logo_file_name(self, logo_id: str, suffix: str) -> str:
        logo_files_dir = self.root / "assets" / "logos" / "files"
        safe_suffix = suffix if suffix.startswith(".") and "/" not in suffix and "\\" not in suffix else ".bin"
        for index in range(1000):
            name = f"{logo_id}{safe_suffix}" if index == 0 else f"{logo_id}-{index}{safe_suffix}"
            if not (logo_files_dir / name).exists():
                return name
        raise StorageConflictError("Could not find a unique logo asset name")

    @staticmethod
    def _file_type(file_path: str, requested_type: Any, kind: str) -> str:
        if kind == "folder":
            return "folder"
        if isinstance(requested_type, str) and requested_type.strip():
            return requested_type.strip()
        suffix = PurePosixPath(file_path).suffix.lower()
        if file_path.endswith(".mauth.md"):
            return "mauthdown"
        if file_path.endswith(".diagram.json"):
            return "diagram"
        if file_path.endswith(".config.json"):
            return "config"
        if file_path.startswith("generated/"):
            return "generated"
        if file_path.startswith("tests/"):
            return "test"
        if suffix == ".md":
            return "markdown"
        if suffix == ".json":
            return "json"
        return "text"

    @staticmethod
    def _project_name(payload: dict[str, Any]) -> str:
        name = payload.get("name")
        return name.strip() if isinstance(name, str) and name.strip() else "Untitled project"

    @staticmethod
    def _revision(record: dict[str, Any] | None) -> int:
        if record is None:
            return 0
        revision = record.get("revision")
        return revision if isinstance(revision, int) and revision >= 0 else 0


def safe_project_path(value: str) -> str:
    if not isinstance(value, str):
        raise StorageValidationError("Project file path must be a string")
    if "\x00" in value:
        raise StorageValidationError("Project file path contains a null byte")
    cleaned = value.replace("\\", "/").strip().strip("/")
    if not cleaned:
        raise StorageValidationError("Project file path is required")
    path = PurePosixPath(cleaned)
    if path.is_absolute() or any(part in {"", ".", ".."} for part in path.parts):
        raise StorageValidationError("Project file path is invalid")
    return str(path)
