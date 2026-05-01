from __future__ import annotations

import json
import os
import re
import shutil
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.bootstrap import ROOT


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def storage_root() -> Path:
    configured = os.environ.get("MATH_APP_STORAGE_ROOT")
    return Path(configured).expanduser() if configured else ROOT / "storage"


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


def read_json_file(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        data = json.load(handle)
    return data if isinstance(data, dict) else {}


class FileTestStorage:
    def __init__(self, root: Path | None = None) -> None:
        self.root = root or storage_root()
        self.tests_dir = self.root / "tests"
        self.autosave_dir = self.root / "autosave"
        self.backups_dir = self.root / "backups" / "tests"

    def list_tests(self) -> list[dict[str, Any]]:
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
        path = self._test_path(test_id)
        if not path.exists():
            return None
        return read_json_file(path)

    def save_test(self, payload: dict[str, Any]) -> dict[str, Any]:
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
        path = self._test_path(test_id)
        if not path.exists():
            return False
        self._backup(path, deleted=True)
        path.unlink()
        return True

    def save_autosave(self, payload: dict[str, Any]) -> dict[str, Any]:
        now = utc_now_iso()
        record = {
            "frontMatter": self._dict(payload.get("frontMatter")),
            "questions": self._list(payload.get("questions")),
            "selectedSavedTestId": payload.get("selectedSavedTestId")
            if isinstance(payload.get("selectedSavedTestId"), str)
            else "",
            "updatedAt": now,
        }
        atomic_write_json(self.autosave_dir / "current-test.json", record)
        return record

    def get_autosave(self) -> dict[str, Any] | None:
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
