import json
from pathlib import Path

import av
import numpy as np
from PIL import Image

work = Path("artifacts/stroke-settings")
request = json.loads((work / "request.json").read_text())
video = next((work / "media").rglob("export.mp4"))


def border_mask(pixels):
    p = pixels.astype(np.int16)
    # Classify solid red paint; mixed antialias/chroma fringe is not geometry.
    # For example H.264 can turn a pale green fill pixel into (236,195,177)
    # beside a red corner even though the vector contour is unchanged.
    return (
        (p[:, :, 0] > p[:, :, 1] + 40) & (p[:, :, 0] > p[:, :, 2] + 40) & (p[:, :, 0] - p[:, :, 1:].min(axis=2) >= 128)
    )


def border_bounds(mask):
    y, x = np.where(mask)
    return [int(x.min()), int(y.min()), int(x.max()), int(y.max())] if len(x) else None


def within_one_pixel(mask, reference):
    padded = np.pad(reference, 1)
    nearby = np.zeros_like(reference)
    for y in range(3):
        for x in range(3):
            nearby |= padded[y : y + reference.shape[0], x : x + reference.shape[1]]
    return not np.any(mask & ~nearby)


with av.open(str(video)) as source:
    frames = list(source.decode(video=0))
assert len(frames) == len(request["frames"]), "Output frame count differs from sampled plan"
checks = []
for index, frame in enumerate(frames):
    expected_mask = border_mask(np.array(Image.open(work / f"browser-{index}.png").convert("RGB")))
    actual_mask = border_mask(frame.to_ndarray(format="rgb24"))
    expected = border_bounds(expected_mask)
    actual = border_bounds(actual_mask)
    passed = (
        actual == expected
        if actual is None or expected is None
        else all(abs(a - b) <= 1 for a, b in zip(actual, expected))
    )
    passed = passed and within_one_pixel(actual_mask, expected_mask) and within_one_pixel(expected_mask, actual_mask)
    passed = passed and abs(float(frame.pts * frame.time_base) - index / request["fps"]) < 1e-6
    checks.append({"sample": index, "passed": passed, "actual": actual, "expected": expected})
report = {"passed": all(check["passed"] for check in checks), "checks": checks}
(work / "fidelity-report.json").write_text(json.dumps(report, indent=2))
print(json.dumps(report, indent=2))
raise SystemExit(0 if report["passed"] else 1)
