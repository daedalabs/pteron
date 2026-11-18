import json
import sys
from pathlib import Path

import av
import numpy as np
from PIL import Image

work = Path(sys.argv[1])


def bounds(pixels):
    p = pixels.astype(np.int16)
    y, x = np.where((p[:, :, 1] > p[:, :, 0] + 40) & (p[:, :, 1] > p[:, :, 2] + 20))
    return [int(x.min()), int(y.min()), int(x.max()), int(y.max())] if len(x) else None


with av.open(str(work / "continuity.mp4")) as source:
    stream = source.streams.video[0]
    assert (stream.width, stream.height, stream.average_rate) == (320, 240, 30)
    frames = list(source.decode(video=0))
assert len(frames) == 180, f"Expected 180 frames, received {len(frames)}"
assert all(abs(float(frame.pts * frame.time_base) - index / 30) < 1e-6 for index, frame in enumerate(frames))
checks = []
for index in [0, 6, 11, 89, 90, 100, 179]:
    actual = bounds(frames[index].to_ndarray(format="rgb24"))
    expected = bounds(np.array(Image.open(work / f"reference-{index}.png").convert("RGB")))
    passed = actual is not None and expected is not None and all(abs(a - b) <= 1 for a, b in zip(actual, expected))
    checks.append({"frame": index, "passed": passed, "actual": actual, "expected": expected})
boundary_matches = bounds(frames[89].to_ndarray(format="rgb24")) == bounds(frames[90].to_ndarray(format="rgb24"))
report = {
    "passed": all(check["passed"] for check in checks) and boundary_matches,
    "frames": 180,
    "fps": 30,
    "continuousBoundary": boundary_matches,
    "checks": checks,
}
(work / "fidelity-report.json").write_text(json.dumps(report, indent=2))
print(json.dumps(report, indent=2))
raise SystemExit(0 if report["passed"] else 1)
