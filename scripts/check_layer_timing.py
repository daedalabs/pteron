import json
from pathlib import Path

import av
import numpy as np
from PIL import Image

work = Path("artifacts/layer-timing")
request = json.loads((work / "request.json").read_text())
video = next((work / "media").rglob("export.mp4"))


def bounds(pixels):
    p = pixels.astype(np.int16)
    y, x = np.where((p[:, :, 0] > p[:, :, 1] + 20) & (p[:, :, 2] > p[:, :, 1] + 20))
    return [int(x.min()), int(y.min()), int(x.max()), int(y.max())] if len(x) else None


with av.open(str(video)) as source:
    frames = list(source.decode(video=0))
assert len(frames) == len(request["frames"]), "Output frame count differs from sampled plan"
checks = []
for index, frame in enumerate(frames):
    actual = bounds(frame.to_ndarray(format="rgb24"))
    expected = bounds(np.array(Image.open(work / f"browser-{index}.png").convert("RGB")))
    passed = (
        actual == expected
        if actual is None or expected is None
        else all(abs(a - b) <= 1 for a, b in zip(actual, expected))
    )
    passed = passed and abs(float(frame.pts * frame.time_base) - index / request["fps"]) < 1e-6
    checks.append({"sample": index, "passed": passed, "actual": actual, "expected": expected})
report = {"passed": all(check["passed"] for check in checks), "checks": checks}
(work / "fidelity-report.json").write_text(json.dumps(report, indent=2))
print(json.dumps(report, indent=2))
raise SystemExit(0 if report["passed"] else 1)
