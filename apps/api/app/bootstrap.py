import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
CONFIG_ROOT = ROOT / "configs"

for package_dir in (
    ROOT / "packages" / "question-engine",
    ROOT / "packages" / "formatting-engine",
    ROOT / "packages" / "marking-engine",
):
    package_path = str(package_dir)
    if package_dir.exists() and package_path not in sys.path:
        sys.path.insert(0, package_path)
