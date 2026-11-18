import json
import re
import shutil
import wave
from pathlib import Path

import av
import numpy as np

with Path("artifacts/example/connected-words.json").open() as metadata:
    m = json.load(metadata)
words = m["words"]
parts = m["parts"]
idx = 0
groups = []
for part in parts:
    tokens = part.split()
    w = words[idx : idx + len(tokens)]
    assert [re.sub(r"\W", "", t).lower() for t in tokens] == [re.sub(r"\W", "", t["text"]).lower() for t in w]
    groups.append((tokens, w))
    idx += len(tokens)
pieces = []
with av.open("artifacts/example/connected-voice.mp3") as source:
    r = av.AudioResampler(format="fltp", layout="mono", rate=48000)
    for f in source.decode(audio=0):
        pieces.extend(x.to_ndarray() for x in r.resample(f))
    pieces.extend(x.to_ndarray() for x in r.resample(None))
a = np.concatenate(pieces, axis=1)[0]
# Keep the one connected performance intact, including its natural comma pauses.
cuts = (
    [0]
    + [
        round(
            (
                (groups[i - 1][1][-1]["offset"] + groups[i - 1][1][-1]["duration"]) / 1e7
                + groups[i][1][0]["offset"] / 1e7
            )
            / 2
            * 30
        )
        for i in range(1, 6)
    ]
    + [int(np.ceil(len(a) / 1600))]
)
with wave.open("examples/media/narration.wav", "wb") as f:
    f.setnchannels(1)
    f.setsampwidth(2)
    f.setframerate(48000)
    f.writeframes((np.clip(np.pad(a, (0, cuts[-1] * 1600 - len(a))), -1, 1) * 32767).astype("<i2").tobytes())
backup = Path("artifacts/example/pre-connected-voice")
backup.mkdir(exist_ok=True)
result = []
for i, ((tokens, w), start, end) in enumerate(zip(groups, cuts, cuts[1:]), 1):
    path = Path(f"examples/media/scene-{i}.wav")
    shutil.copyfile(path, backup / path.name)
    signal = a[start * 1600 : end * 1600]
    signal = np.pad(signal, (0, (end - start) * 1600 - len(signal)))
    with wave.open(str(path), "wb") as f:
        f.setnchannels(1)
        f.setsampwidth(2)
        f.setframerate(48000)
        f.writeframes((np.clip(signal, -1, 1) * 32767).astype("<i2").tobytes())
    phrases = [
        ["Start with a simple shape,"],
        ["then add a stem", "and a couple of leaves."],
        ["Give each piece", "its own timing."],
        ["You can move the whole group", "while the details keep moving", "on their own."],
        ["Bring the scenes together,"],
        ["add a little sound,", "and it's ready to share."],
    ][i - 1]
    assert " ".join(phrases) == parts[i - 1]
    ranges = []
    p = 0
    for phrase in phrases:
        q = p + len(phrase.split())
        ranges.append((p, q))
        p = q
    caption = []
    for p, q in ranges:
        left = max(0, round(w[p]["offset"] / 1e7 * 30) - start)
        right = min(end - start, round((w[q - 1]["offset"] + w[q - 1]["duration"]) / 1e7 * 30) - start + 1)
        caption.append({"text": " ".join(tokens[p:q]), "start": left, "end": max(left + 1, right)})
    for j in range(len(caption) - 1):
        caption[j]["end"] = min(caption[j]["end"], caption[j + 1]["start"])
    result.append(
        {
            "script": parts[i - 1],
            "frames": end - start,
            "captions": caption,
            "words": [
                {
                    "text": t,
                    "start": max(0, round(x["offset"] / 1e7 * 30) - start),
                    "end": min(end - start, round((x["offset"] + x["duration"]) / 1e7 * 30) - start),
                }
                for t, x in zip(tokens, w)
            ],
        }
    )
Path("examples/media/narration.json").write_text(
    json.dumps(
        {"voice": "en-US-AvaMultilingualNeural", "rate": "+0%", "connectedTake": True, "scenes": result}, indent=2
    )
)
print(json.dumps({"frames": cuts[-1], "cuts": cuts, "captions": sum(len(s["captions"]) for s in result)}))
