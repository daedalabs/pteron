"""Compile after relocating TeX, checking every recorded input stays in the bundle."""

import json
import os
import shutil
import subprocess
import tempfile
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory(prefix="pteron-relocated-tex-") as directory:
    work = Path(directory)
    tex = work / "tex"
    shutil.copytree(ROOT / "artifacts/standalone-tex", tex)
    bin = tex / "texmfs/install/miktex/bin/x64"
    source = r"""\documentclass[preview]{standalone}
\usepackage{amsmath,amssymb}
\begin{document}
$\begin{aligned}\frac{\alpha^2+7}{\sqrt{y+3}}&=\sum_{i=1}^7i\\ \mathbf{A}&=\begin{pmatrix}1&2\\3&4\end{pmatrix}\end{aligned}$
\end{document}
"""
    (work / "fresh.tex").write_text(source, encoding="utf-8")
    env = {**os.environ, "PATH": str(bin) + os.pathsep + str(Path(os.environ["SystemRoot"]) / "System32")}
    for key in (
        "PTERON_TEX_ROOT",
        "TEXINPUTS",
        "TEXMF",
        "TEXMFCNF",
        "MIKTEX_USERCONFIG",
        "MIKTEX_USERDATA",
        "MIKTEX_USERINSTALL",
    ):
        env.pop(key, None)
    result = subprocess.run(
        [
            str(bin / "latex.exe"),
            "--disable-installer",
            "-interaction=nonstopmode",
            "-halt-on-error",
            "-recorder",
            "fresh.tex",
        ],
        cwd=work,
        env=env,
        capture_output=True,
        check=False,
        text=True,
        timeout=90,
    )
    if result.returncode:
        raise RuntimeError(result.stdout[-3000:] + result.stderr[-1000:])
    inputs = set()
    for line in (work / "fresh.fls").read_text(encoding="utf-8", errors="replace").splitlines():
        if not line.startswith("INPUT "):
            continue
        name = line[6:].strip('"')
        path = Path(name)
        if not path.is_absolute():
            path = work / path
        path = path.resolve()
        if not path.is_relative_to(tex.resolve()) and not (path.parent == work and path.stem == "fresh"):
            raise RuntimeError("TeX escaped its relocated runtime: " + str(path))
        inputs.add(str(path.relative_to(work)))
    subprocess.run(
        [str(bin / "dvisvgm.exe"), "--no-fonts", "--output=fresh.svg", "fresh.dvi"],
        cwd=work,
        env=env,
        check=True,
        capture_output=True,
        timeout=60,
    )
    svg = ET.parse(work / "fresh.svg").getroot()
    assert any(element.tag.rsplit("}", 1)[-1] == "path" for element in svg.iter()), "Equation must contain vectors"
    assert not any(element.tag.rsplit("}", 1)[-1] == "image" for element in svg.iter()), (
        "Equation must not contain raster images"
    )
    # Moving the runtime must not alter glyph outlines, positions or the viewBox.
    baseline = work / "baseline"
    baseline.mkdir()
    (baseline / "fresh.tex").write_text(source, encoding="utf-8")
    original_bin = ROOT / ".tools/miktex/texmfs/install/miktex/bin/x64"
    original_env = {**env, "PATH": str(original_bin) + os.pathsep + str(Path(os.environ["SystemRoot"]) / "System32")}
    subprocess.run(
        [
            str(original_bin / "latex.exe"),
            "--disable-installer",
            "-interaction=nonstopmode",
            "-halt-on-error",
            "fresh.tex",
        ],
        cwd=baseline,
        env=original_env,
        check=True,
        capture_output=True,
        timeout=90,
    )
    subprocess.run(
        [str(original_bin / "dvisvgm.exe"), "--no-fonts", "--output=fresh.svg", "fresh.dvi"],
        cwd=baseline,
        env=original_env,
        check=True,
        capture_output=True,
        timeout=60,
    )
    original = ET.parse(baseline / "fresh.svg").getroot()
    geometry = lambda root: [(element.tag, sorted(element.attrib.items())) for element in root.iter()]
    assert geometry(svg) == geometry(original), "Required equation geometry changed after runtime relocation"
    report = {
        "passed": True,
        "relocatedOutsideCheckout": True,
        "externalTexInputs": False,
        "automaticInstallerDisabled": True,
        "recordedInputs": sorted(inputs),
        "vectorSvg": True,
        "exactOriginalGeometry": True,
    }
    (ROOT / "artifacts/tex-relocation-verification.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(
        "Relocated offline TeX passed: fresh Greek/fraction/root/sum/matrix equation, all inputs inside runtime, vector SVG"
    )
