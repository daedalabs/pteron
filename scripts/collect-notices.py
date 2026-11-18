"""Retain installed Python distribution license files and exact inventory for local candidate review."""

import json
import shutil
import sys
from importlib import metadata
from pathlib import Path

root = Path("artifacts/standalone-notices/python")
root.mkdir(parents=True, exist_ok=True)
inventory = []
for dist in metadata.distributions():
    name = dist.metadata["Name"]
    version = dist.version
    files = []
    for file in dist.files or []:
        if any(term in file.name.lower() for term in ("license", "copying", "copyright", "notice")):
            source = Path(dist.locate_file(file))
            if source.is_file():
                target = root / name / str(file).replace("..", "_")
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(source, target)
                files.append(str(target))
    inventory.append(
        {
            "name": name,
            "version": version,
            "license": dist.metadata.get("License-Expression")
            or dist.metadata.get("License")
            or [s for s in dist.metadata.get_all("Classifier", []) if s.startswith("License")],
            "retainedFiles": files,
        }
    )
(root / "inventory.json").write_text(json.dumps(inventory, indent=2), encoding="utf-8")
# PyInstaller embeds CPython itself in addition to installed distributions.
runtime = root / "cpython-runtime"
runtime.mkdir(parents=True, exist_ok=True)
license_path = Path(sys.base_prefix) / "LICENSE.txt"
if not license_path.is_file():
    raise RuntimeError("Cannot package CPython without its runtime license")
shutil.copy2(license_path, runtime / "LICENSE.txt")
(runtime / "version.json").write_text(
    json.dumps({"version": sys.version, "implementation": sys.implementation.name}, indent=2), encoding="utf-8"
)
