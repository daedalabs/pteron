"""Non-destructive renderer gate: report geometry, IDs, and TeX availability."""

import json
import shutil
import sys
from pathlib import Path

import numpy as np
from manim import MathTex, Scene, SVGMobject, tempconfig
from PIL import Image

root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(root))
from renderer.runtime import configure_tools
from renderer.svg_normalize import normalize_svg

configure_tools()
result = {"checks": [], "dependencies": {name: shutil.which(name) for name in ["latex", "dvisvgm", "ffmpeg"]}}


def check(name, passed, **details):
    result["checks"].append({"name": name, "passed": bool(passed), **details})


with tempconfig({"media_dir": str(root / "artifacts" / "manim")}):
    try:
        svg = SVGMobject(
            str(root / "tests/fixtures/nested.svg"), should_center=False, height=None, width=None, use_svg_cache=False
        )
        # Manim reflects around the artwork centre, not SVG's origin. Translate
        # once to express the result in screen coordinates (x, -y).
        svg.shift([0, -2 * svg.get_center()[1], 0])
        groups = svg.id_to_vgroup_dict
        check("stable-group-ids", all(key in groups for key in ["artwork", "rectangle", "circle"]), ids=list(groups))
        rectangle = groups["rectangle"]
        check(
            "nested-viewbox-placement",
            np.allclose(rectangle.get_center()[:2], [80, -110], atol=1),
            actual=rectangle.get_center()[:2].tolist(),
            expected=[80, -110],
        )
        check(
            "nested-viewbox-size",
            abs(rectangle.width - 40) <= 1 and abs(rectangle.height - 20) <= 1,
            actual=[rectangle.width, rectangle.height],
            expected=[40, 20],
        )
    except Exception as exc:  # noqa: BLE001 - Report third-party import failures in the JSON gate.
        check("svg-import", False, error=str(exc))
    try:
        with tempconfig({"pixel_width": 320, "pixel_height": 480, "frame_width": 320, "frame_height": 480}):
            normalized = root / "artifacts/normalized-clipped.svg"
            normalized.parent.mkdir(exist_ok=True)
            original = (root / "tests/fixtures/nested-clipped.svg").read_text(encoding="utf-8")
            normalized.write_text(normalize_svg(original), encoding="utf-8")
            clipped = SVGMobject(str(normalized), should_center=False, height=None, width=None, use_svg_cache=False)
            clipped.shift([0, -2 * clipped.get_center()[1], 0])
            scene = Scene()
            scene.camera.frame_center = np.array([160.0, -240.0, 0.0])
            scene.add(clipped)
            scene.camera.capture_mobjects(scene.mobjects)
            image = scene.camera.get_image()
            (root / "artifacts").mkdir(exist_ok=True)
            image.save(root / "artifacts/manim-clipping.png")
            pixels = np.asarray(image)
            mask = (pixels[:, :, 0] > 200) & (pixels[:, :, 1] < 80) & (pixels[:, :, 2] > 200)
            ys, xs = np.where(mask)
            bounds = [int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())]
            expected = [220, 160, 239, 179]
            reference_path = root / "artifacts/browser-clipping.png"
            if reference_path.exists():
                reference = np.asarray(Image.open(reference_path))
                ry, rx = np.where((reference[:, :, 0] > 200) & (reference[:, :, 1] < 80) & (reference[:, :, 2] > 200))
                reference_bounds = [int(rx.min()), int(ry.min()), int(rx.max()), int(ry.max())]
                check(
                    "browser-pixel-reference", reference_bounds == expected, actual=reference_bounds, expected=expected
                )
            check(
                "nested-viewport-clipping",
                all(abs(a - b) <= 1 for a, b in zip(bounds, expected)),
                actual=bounds,
                expected=expected,
            )
    except Exception as exc:  # noqa: BLE001 - Report render failures while continuing the independent TeX check.
        check("nested-viewport-clipping", False, error=str(exc))
    if result["dependencies"]["latex"] and result["dependencies"]["dvisvgm"]:
        try:
            formula = MathTex(r"{{ x }} + 2 = 5")
            check("latex-compilation", formula.width > 0)
        except Exception as exc:  # noqa: BLE001 - Report compiler and renderer failures in the JSON gate.
            check("latex-compilation", False, error=str(exc))
    else:
        check(
            "latex-compilation",
            False,
            category="missing-dependency",
            error="latex and dvisvgm must be installed for this check",
        )

output = root / "artifacts" / "renderer-gate.json"
output.parent.mkdir(exist_ok=True)
output.write_text(json.dumps(result, indent=2), encoding="utf-8")
print(json.dumps(result, indent=2))
raise SystemExit(0 if all(c["passed"] for c in result["checks"]) else 1)
