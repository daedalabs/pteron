import json
import sys
from pathlib import Path

import av
import numpy as np
from PIL import Image

path = Path(sys.argv[1])
frames = []
audio = []
stills = []
manifest = json.loads((Path(__file__).resolve().parents[1] / "examples/small-idea.json").read_text())
starts = []
total = 0
for scene in manifest["screens"]:
    starts.append(total)
    total += scene["frames"]
samples = []
for start, scene in zip(starts, manifest["screens"]):
    cue = max(scene["captionCues"], key=lambda c: c["end"] - c["start"])
    samples.append(start + (cue["start"] + cue["end"]) // 2)
with av.open(str(path)) as video:
    stream = video.streams.video[0]
    assert (stream.width, stream.height) == (1080, 1920)
    assert stream.average_rate == 30
    for i, frame in enumerate(video.decode(video=0)):
        assert abs(float(frame.pts * frame.time_base) - i / 30) < 1e-6, f"Incorrect frame timestamp {i}"
        frames.append(i)
        if i in samples:
            image = frame.to_image()
            array = np.array(image)
            assert array.max() - array.min() > 150, "Blank example image"
            caption = array[1450:1700, :, :3]
            ys, xs = np.where(caption.min(axis=2) > 200)
            assert len(xs) > 100 and xs.max() - xs.min() > 100 and ys.max() - ys.min() >= 40, (
                "Missing or unreadable caption vectors"
            )
            stills.append(image.resize((270, 480)))
with av.open(str(path)) as video:
    assert video.streams.audio, "Missing narration"
    for frame in video.decode(audio=0):
        audio.append(frame.to_ndarray().astype(float))
assert len(frames) == total, f"Expected {total} frames, got {len(frames)}"
assert any(np.max(np.abs(a)) > 0.01 for a in audio), "Silent narration"
signal = np.concatenate(audio, axis=1)
for start, end in zip([n / 30 for n in starts], [n / 30 for n in starts[1:]] + [total / 30]):
    assert np.max(np.abs(signal[:, int(start * 48000) : int(end * 48000)])) > 0.01, f"Silent scene at {start}s"
similarities = []
speech_bounds = []
for i in range(6):
    pieces = []
    with av.open(str(Path(__file__).resolve().parents[1] / f"examples/media/scene-{i + 1}.wav")) as source:
        resampler = av.AudioResampler(format="fltp", layout="mono", rate=48000)
        for frame in source.decode(audio=0):
            pieces.extend(part.to_ndarray() for part in resampler.resample(frame))
        pieces.extend(part.to_ndarray() for part in resampler.resample(None))
    original = np.concatenate(pieces, axis=1)[0]
    rms = np.array([np.sqrt(np.mean(original[n : n + 480] ** 2)) for n in range(0, len(original), 480)])
    active = np.flatnonzero(rms > 0.003)
    speech_bounds.append((starts[i] / 30 + active[0] * 0.01, starts[i] / 30 + (active[-1] + 1) * 0.01))
    decoded = signal[0, starts[i] * 1600 : starts[i] * 1600 + len(original)]
    correlation = float(np.corrcoef(original, decoded)[0, 1])
    snr = float(10 * np.log10(np.mean(original**2) / np.mean((decoded - original) ** 2)))
    assert correlation > 0.995 and snr > 20, f"Audio corruption in scene {i + 1}: correlation {correlation}, SNR {snr}"
    similarities.append({"scene": i + 1, "correlation": correlation, "snrDb": snr})
gaps = [speech_bounds[i + 1][0] - speech_bounds[i][1] for i in range(5)]
assert max(gaps) < 0.45, f"Unnatural narration gap: {gaps}"
storyboard = Image.new("RGB", (270 * 3, 480 * 2), "#151515")
for i, image in enumerate(stills):
    storyboard.paste(image, ((i % 3) * 270, (i // 3) * 480))
storyboard.save(path.with_suffix(".storyboard.jpg"))
report = {
    "passed": True,
    "frames": len(frames),
    "fps": 30,
    "width": 1080,
    "height": 1920,
    "duration": total / 30,
    "audibleNarration": True,
    "sampledScenes": len(stills),
    "audioSimilarity": similarities,
    "betweenLineSilenceSeconds": gaps,
}
path.with_suffix(".verification.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
print(json.dumps(report))
