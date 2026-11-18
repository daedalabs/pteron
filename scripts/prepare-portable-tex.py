"""Stage an offline, relocatable MiKTeX subset and retain its exact notices/sources.

Never copy the developer's writable MiKTeX config (which can contain credentials).
The source installation is read-only; only our generated artifacts are replaced.
"""

import hashlib
import json
import os
import re
import shutil
import stat
import subprocess
import tarfile
import time
import urllib.request
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

import pefile

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / ".tools/miktex"
TARGET = ROOT / "artifacts/standalone-tex"
NOTICES = ROOT / "artifacts/standalone-notices/tex"
CACHE = ROOT / ".tools/tex-license-sources"
INSTALL = SOURCE / "texmfs/install"
BIN = INSTALL / "miktex/bin/x64"


def digest(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def fetch(name, url):
    CACHE.mkdir(parents=True, exist_ok=True)
    path = CACHE / name
    if not path.is_file():
        temporary = path.with_suffix(path.suffix + ".download")
        with urllib.request.urlopen(url, timeout=90) as response, temporary.open("wb") as output:
            shutil.copyfileobj(response, output)
        temporary.replace(path)
    return path


def packages():
    catalogue = {}
    current = None
    for line in (INSTALL / "miktex/config/package-manifests.ini").read_text(encoding="utf-8-sig").splitlines():
        if line.startswith("[") and line.endswith("]"):
            current = catalogue.setdefault(line[1:-1], {"files": []})
        elif current is not None and "=" in line:
            key, value = line.split("=", 1)
            if key in ("run[]", "doc[]", "source[]"):
                current["files"].append(value.replace("\\", "/").lower())
            elif key in (
                "version",
                "licenseType",
                "copyrightOwner",
                "copyrightYear",
                "ctanPath",
                "timePackaged",
                "digest",
            ):
                current[key] = value
    return catalogue


def main():
    if not (BIN / "latex.exe").is_file():
        raise RuntimeError("Run npm run setup:tex before staging TeX")
    # Verify the exact generated target before any recursive removal.
    if TARGET.resolve() != ROOT.resolve() / "artifacts/standalone-tex":
        raise RuntimeError("Unexpected staging directory")
    if TARGET.exists():

        def remove_readonly(function, path, error):
            if not Path(path).resolve().is_relative_to(TARGET.resolve()):
                raise RuntimeError("Unexpected generated path")
            if not isinstance(error, PermissionError):
                raise error
            os.chmod(path, stat.S_IREAD | stat.S_IWRITE)
            function(path)

        shutil.rmtree(TARGET, onexc=remove_readonly)
    destination = TARGET / "texmfs/install"
    destination.mkdir(parents=True)
    NOTICES.mkdir(parents=True, exist_ok=True)
    # Keep the installed TeX/font packages intact; omit unrelated application binaries.
    for name in ("tex", "fonts", "dvips", "pdftex", "metafont", "doc", "source"):
        if (INSTALL / name).is_dir():
            shutil.copytree(INSTALL / name, destination / name)
    config = destination / "miktex/config"
    config.mkdir(parents=True)
    for path in (INSTALL / "miktex/config").iterdir():
        if path.suffix in (".ini", ".tcx") and path.name not in ("mpm.ini", "miktexstartup.ini"):
            shutil.copy2(path, config / path.name)
    (config / "miktexstartup.ini").write_text("[Auto]\nConfig=Portable\n[Setup]\nVersion=26.5\n", encoding="utf-8")
    (config / "mpm.ini").write_text("[MPM]\nAutoInstall=0\n", encoding="utf-8")
    user_config = TARGET / "texmfs/config/miktex/config"
    user_config.mkdir(parents=True)
    (user_config / "miktex.ini").write_text("[MPM]\nAutoInstall=0\n", encoding="utf-8")
    data = TARGET / "texmfs/data"
    for name in ("fonts", "miktex/data/le/pdftex"):
        if (SOURCE / "texmfs/data" / name).is_dir():
            shutil.copytree(SOURCE / "texmfs/data" / name, data / name)
    available = {path.name.lower(): path for path in BIN.iterdir() if path.is_file()}
    pending = [
        "latex.exe",
        "dvisvgm.exe",
        "initexmf.exe",
        "miktex.exe",
        "miktex-pdftex.exe",
        "pdftex.exe",
        "miktex-makefmt.exe",
        "miktex-maketfm.exe",
        "miktex-makemf.exe",
        "miktex-makepk.exe",
        "kpsewhich.exe",
    ]
    # Qt loads its Windows platform plugin dynamically, outside the PE import table.
    plugins = BIN / "platforms"
    target_plugins = destination / "miktex/bin/x64/platforms"
    target_plugins.mkdir(parents=True)
    plugin = plugins / "qwindows.dll"
    shutil.copy2(plugin, target_plugins / plugin.name)
    plugin_pe = pefile.PE(str(plugin))
    pending.extend(entry.dll.decode() for entry in plugin_pe.DIRECTORY_ENTRY_IMPORT)
    plugin_pe.close()
    copied = set()
    system = set()
    target_bin = destination / "miktex/bin/x64"
    target_bin.mkdir(parents=True, exist_ok=True)
    while pending:
        name = pending.pop().lower()
        if name in copied:
            continue
        if name not in available:
            system.add(name)
            continue
        path = available[name]
        shutil.copy2(path, target_bin / path.name)
        copied.add(name)
        pe = pefile.PE(str(path), fast_load=True)
        pe.parse_data_directories(directories=[1, 13])
        pending.extend(
            entry.dll.decode()
            for entry in getattr(pe, "DIRECTORY_ENTRY_IMPORT", []) + getattr(pe, "DIRECTORY_ENTRY_DELAY_IMPORT", [])
        )
        pe.close()
    env = {**os.environ, "PATH": str(target_bin) + os.pathsep + str(Path(os.environ["SystemRoot"]) / "System32")}
    for attempt in range(3):
        res = subprocess.run([str(target_bin / "initexmf.exe"), "--update-fndb"], env=env, capture_output=True, text=True)
        if res.returncode == 0:
            break
        if attempt == 2:
            raise RuntimeError(f"initexmf --update-fndb failed (code {res.returncode}):\n{res.stdout}\n{res.stderr}")
        time.sleep(1)
    # Inventory only packages with files that are actually distributed.
    staged = {
        ("texmf/" + path.relative_to(destination).as_posix()).lower()
        for path in destination.rglob("*")
        if path.is_file()
    }
    catalogue = packages()
    inventory = []
    for name, metadata in catalogue.items():
        included = sorted(staged.intersection(metadata["files"]))
        if included:
            manifest = INSTALL / "tpm/packages" / f"{name}.tpm"
            if manifest.is_file():
                target = destination / "tpm/packages" / manifest.name
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(manifest, target)
                included.append("texmf/tpm/packages/" + manifest.name.lower())
            inventory.append(
                {
                    "id": name,
                    **{key: value for key, value in metadata.items() if key != "files"},
                    "includedFiles": included,
                }
            )
    # Keep exact upstream source archives, which include binary/library notices.
    sources = [
        ("miktex-26.5.tar.gz", "https://codeload.github.com/MiKTeX/miktex/tar.gz/refs/tags/26.5"),
        (
            "qtbase-everywhere-src-6.10.3.tar.xz",
            "https://download.qt.io/archive/qt/6.10/6.10.3/submodules/qtbase-everywhere-src-6.10.3.tar.xz",
        ),
    ]
    source_records = []
    for name, url in sources:
        archive_path = fetch(name, url)
        out = NOTICES / "sources" / name
        out.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(archive_path, out)
        source_records.append({"file": "sources/" + name, "url": url, "sha256": digest(out)})
        with tarfile.open(archive_path) as archive:
            for member in archive:
                leaf = Path(member.name).name.lower()
                if not member.isfile() or not any(
                    word in leaf for word in ("copying", "license", "copyright", "notice")
                ):
                    continue
                relative = Path(member.name)
                if relative.is_absolute() or ".." in relative.parts:
                    raise RuntimeError("Unsafe source archive path")
                target = NOTICES / "upstream" / relative
                target.parent.mkdir(parents=True, exist_ok=True)
                with archive.extractfile(member) as stream, target.open("wb") as output:
                    shutil.copyfileobj(stream, output)
    # Preserve original package sources and font notices, not just catalogue labels.
    ctan = {
        "amsfonts": "/fonts/amsfonts",
        "latex-fonts": "/fonts/latex",
        "preview": "/macros/latex/contrib/preview",
        "latex-base": "/macros/latex/base",
        "amsmath": "/macros/latex/required/amsmath",
        "standalone": "/macros/latex/contrib/standalone",
        "xkeyval": "/macros/latex/contrib/xkeyval",
    }
    for name, ctan_path in ctan.items():
        url = "https://mirrors.mit.edu/CTAN" + ctan_path + ".zip"
        archive_path = fetch(name + ".zip", url)
        out = NOTICES / "sources" / archive_path.name
        shutil.copy2(archive_path, out)
        source_records.append({"file": "sources/" + out.name, "url": url, "sha256": digest(out)})
        with zipfile.ZipFile(archive_path) as archive:
            for entry in archive.infolist():
                relative = Path(entry.filename)
                leaf = relative.name.lower()
                if entry.is_dir() or not any(
                    word in leaf for word in ("readme", "copying", "license", "copyright", "notice", "ofl", "lppl")
                ):
                    continue
                if relative.is_absolute() or ".." in relative.parts:
                    raise RuntimeError("Unsafe package archive path")
                target = NOTICES / "upstream" / name / relative
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(archive.read(entry))
    microsoft_url = (
        "https://visualstudio.microsoft.com/wp-content/uploads/2021/09/Visual-C-Runtime-2015-2022-License-1.docx"
    )
    microsoft = fetch("Microsoft-Visual-C-Runtime-License.docx", microsoft_url)
    shutil.copy2(microsoft, NOTICES / microsoft.name)
    with zipfile.ZipFile(microsoft) as archive:
        document = ET.fromstring(archive.read("word/document.xml"))
        namespace = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
        paragraphs = ["".join(p.itertext()) for p in document.findall(".//w:p", namespace)]
    (NOTICES / "Microsoft-Visual-C-Runtime-License.txt").write_text("\n".join(paragraphs), encoding="utf-8")
    source_records.append({"file": microsoft.name, "url": microsoft_url, "sha256": digest(microsoft)})
    review = {
        "latex-fonts": "Original MetaFont/TFM sources retained; see original latex-fonts and AMS font archives/notices. Catalogue license field is unspecified, not an assertion that these files are unlicensed.",
        "miktex-misc": "MiKTeX configuration/translation tables retain their per-file notices; several tables explicitly state Public domain.",
        "miktex-ucrt-bin-x64": "Microsoft runtime terms retained in Microsoft-Visual-C-Runtime-License.docx/.txt. Windows-only distribution.",
        "miktex-vc140-bin-x64": "Microsoft runtime terms retained in Microsoft-Visual-C-Runtime-License.docx/.txt. Windows-only distribution.",
    }
    for package in inventory:
        if package["id"] in review:
            package["licenseReview"] = review[package["id"]]
    files = [
        {"path": path.relative_to(TARGET).as_posix(), "bytes": path.stat().st_size, "sha256": digest(path)}
        for path in sorted(TARGET.rglob("*"))
        if path.is_file()
    ]
    # Fail closed if a developer credential somehow entered the generated config.
    for path in TARGET.rglob("*.ini"):
        if re.search(
            r"^\s*(AuthToken|Password|Secret|ApiKey)\s*=",
            path.read_text(encoding="utf-8", errors="replace"),
            re.MULTILINE | re.IGNORECASE,
        ):
            raise RuntimeError("Private MiKTeX settings cannot be packaged")
    report = {
        "basedOn": "MiKTeX 26.5",
        "changes": [
            "Compiler/helper/DLL subset; unrelated engines and applications omitted",
            "Fresh portable configuration; developer settings and credentials excluded",
            "Automatic package installation disabled; installed math/font packages retained",
        ],
        "packages": inventory,
        "files": files,
        "systemImports": sorted(system),
        "sources": source_records,
    }
    (NOTICES / "inventory.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    (NOTICES / "README.txt").write_text(
        "pteron equation runtime, based on MiKTeX 26.5\n\nThis is a reduced, offline runtime assembled by pteron; it is not the complete upstream MiKTeX distribution. Unrelated engines/applications and developer settings are omitted. Contact pteron for integration issues. Upstream files are unmodified. Packages/fonts retain their individual licenses; this is not a claim of ownership over MiKTeX.\n\nExact files, hashes, package versions and license identifiers: inventory.json. Original notices: upstream/. Exact MiKTeX and Qt base source archives: sources/. Dynamic libraries remain replaceable inside the extracted runtime.\n\nRedistribution reference: https://miktex.org/kb/copying\nPackage catalogue: https://miktex.org/packages/\n\nThis local development candidate does not complete the app-wide public-release license audit.\n",
        encoding="utf-8",
    )
    print(
        json.dumps(
            {
                "stagedBytes": sum(item["bytes"] for item in files),
                "files": len(files),
                "packages": len(inventory),
                "binaries": len(copied),
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
