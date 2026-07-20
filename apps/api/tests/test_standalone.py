from pathlib import Path

import pytest
from fastapi import FastAPI

from app import standalone


def test_standalone_web_dist_prefers_explicit_path(tmp_path, monkeypatch):
    monkeypatch.setenv("MAUTH_WEB_DIST", str(tmp_path / "environment"))

    assert standalone._web_dist_path(str(tmp_path / "argument")) == (tmp_path / "argument").resolve()
    assert standalone._web_dist_path(None) == (tmp_path / "environment").resolve()


def test_standalone_static_editor_requires_index(tmp_path):
    with pytest.raises(RuntimeError, match="Mauth web build is missing"):
        standalone.configure_static_editor(FastAPI(), Path(tmp_path))
