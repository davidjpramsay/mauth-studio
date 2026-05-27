import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
CONFIG_ROOT = ROOT / "configs"


def load_env_file(path: Path) -> None:
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        if not key or key in os.environ:
            continue
        os.environ[key] = value.strip().strip('"').strip("'")


load_env_file(ROOT / ".env")
load_env_file(ROOT / "apps" / "api" / ".env")

for package_dir in (
    ROOT / "packages" / "question-engine",
    ROOT / "packages" / "formatting-engine",
    ROOT / "packages" / "marking-engine",
):
    package_path = str(package_dir)
    if package_dir.exists() and package_path not in sys.path:
        sys.path.insert(0, package_path)
