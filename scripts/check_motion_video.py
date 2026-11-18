import json
import sys
from pathlib import Path

import av
import numpy as np
from PIL import Image

work = Path(sys.argv[1])
video = next((work / "media").rglob("export.mp4"))
checks = []
with av.open(str(video)) as container:
    frames = list(container.decode(video=0))
    checks.append({"name": "frame-count", "passed": len(frames) == 18, "actual": len(frames), "expected": 18})
    for index, frame in enumerate(frames):
        actual = frame.to_ndarray(format="rgb24")
        reference = np.array(Image.open(work / f"browser-{index}.png").convert("RGB"))

        def bounds(image):
            y, x = np.where((image[:, :, 0] > 180) & (image[:, :, 1] < 80) & (image[:, :, 2] > 180))
            return [int(x.min()), int(y.min()), int(x.max()), int(y.max())] if len(x) else None

        a, b = bounds(actual), bounds(reference)
        checks.append(
            {
                "name": f"frame-{index}-bounds",
                "passed": a is not None and b is not None and all(abs(x - y) <= 1 for x, y in zip(a, b)),
                "actual": a,
                "expected": b,
            }
        )
result = {"passed": all(c["passed"] for c in checks), "checks": checks}
(work / "report.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
print(json.dumps(result, indent=2))
raise SystemExit(0 if result["passed"] else 1)
