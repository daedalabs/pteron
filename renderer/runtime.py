"""Locate optional project-local tools without modifying the system PATH."""

import os
import shutil
from pathlib import Path


def configure_tools():
    root = Path(__file__).resolve().parents[1]
    bundled = Path(os.environ.get("PTERON_TEX_ROOT", ""))
    tex_bin = (
        bundled / "texmfs/install/miktex/bin/x64"
        if (bundled / "texmfs").is_dir()
        else root / ".tools/miktex/texmfs/install/miktex/bin/x64"
    )
    if tex_bin.is_dir():
        os.environ["PATH"] = str(tex_bin) + os.pathsep + os.environ.get("PATH", "")


def require_tex_tools():
    missing = [name for name in ("latex", "dvisvgm") if shutil.which(name) is None]
    if missing:
        raise RuntimeError(
            "LaTeX tools not found: "
            + ", ".join(missing)
            + ". Install MiKTeX or TeX Live, or place the portable MiKTeX folder named tex beside pteron. Your previous equation is preserved."
        )
