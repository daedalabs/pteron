import json
import sys
from pathlib import Path

import av
import numpy as np
from PIL import Image

work = Path(sys.argv[1])
samples = json.loads((work / "samples.json").read_text())
with av.open(sys.argv[2]) as source:
    assert (source.streams.video[0].width, source.streams.video[0].height, source.streams.video[0].average_rate) == (
        320,
        240,
        30,
    )
    frames = list(source.decode(video=0))
assert len(frames) == len(samples)
with av.open(sys.argv[3]) as source:
    matte_frames = list(source.decode(video=0))
assert len(matte_frames) == len(samples)


def dilate(mask):
    padded = np.pad(mask, 1)
    return np.logical_or.reduce(
        [padded[y : y + mask.shape[0], x : x + mask.shape[1]] for y in range(3) for x in range(3)]
    )


checks = []
for index, (frame, sample) in enumerate(zip(frames, samples)):
    actual = frame.to_ndarray(format="rgb24").astype(np.int16)
    expected = np.array(Image.open(work / f"reference-{index}.png").convert("RGB")).astype(np.int16)
    geometry_actual = matte_frames[index].to_ndarray(format="rgb24")
    geometry_expected = np.array(Image.open(work / f"geometry-reference-{index}.png").convert("RGB"))
    ink_a = np.min(geometry_actual, axis=2) < 128
    ink_b = np.min(geometry_expected, axis=2) < 128
    # A supported silhouette may differ only in its one-pixel antialias fringe.
    geometry = not np.any(ink_a & ~dilate(ink_b)) and not np.any(ink_b & ~dilate(ink_a))
    padded = np.pad(expected, ((2, 2), (2, 2), (0, 0)), mode="edge")
    interior = np.logical_and.reduce(
        [np.max(np.abs(padded[y : y + 240, x : x + 320] - expected), axis=2) <= 1 for y in range(5) for x in range(5)]
    )
    error = np.abs(actual - expected)[interior]
    mean = float(error.mean()) if error.size else 0
    color = mean <= 2 and (not error.size or float(np.quantile(error, 0.999)) <= 6)
    clock = abs(float(frame.pts * frame.time_base) - index / 30) < 1e-6
    checks.append(
        {
            **sample,
            "passed": bool(geometry and color and clock),
            "geometryWithinOnePixel": bool(geometry),
            "interiorMeanColorError": round(mean, 4),
            "exactFrameClock": clock,
        }
    )
report = {"passed": all(check["passed"] for check in checks), "samples": len(checks), "checks": checks}
(work / "report.json").write_text(json.dumps(report, indent=2))
print(json.dumps(report, indent=2))
raise SystemExit(0 if report["passed"] else 1)
