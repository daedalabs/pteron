"""Connected narration and frame-aligned audio preparation for authoring examples."""

import json
import math
import re
import wave
from pathlib import Path
from typing import TypedDict

import av
import numpy as np


class WordBoundary(TypedDict):
    text: str
    offset: int
    duration: int


class VoiceMetadata(TypedDict):
    parts: list[str]
    words: list[WordBoundary]


class TimedWord(TypedDict):
    text: str
    start: int
    end: int


class TimedPart(TypedDict):
    text: str
    start: int
    end: int
    words: list[TimedWord]


def align_parts(metadata: VoiceMetadata, fps: int) -> list[TimedPart]:
    if not 1 <= fps <= 120:
        raise ValueError("Frame rate must be from 1 to 120")
    cursor = 0
    previous_end = 0
    parts: list[TimedPart] = []
    for text in metadata["parts"]:
        tokens = text.split()
        group = metadata["words"][cursor : cursor + len(tokens)]
        if not tokens or [re.sub(r"\W", "", token).lower() for token in tokens] != [
            re.sub(r"\W", "", word["text"]).lower() for word in group
        ]:
            raise ValueError(f"Word boundaries do not match narration: {text}")
        timed: list[TimedWord] = []
        for word in group:
            if word["offset"] < previous_end or word["duration"] <= 0:
                raise ValueError(f"Invalid or overlapping word boundary: {word['text']}")
            previous_end = word["offset"] + word["duration"]
            timed.append(
                {
                    "text": word["text"],
                    "start": round(word["offset"] / 1e7 * fps),
                    "end": round(previous_end / 1e7 * fps),
                }
            )
        parts.append({"text": text, "start": timed[0]["start"], "end": timed[-1]["end"], "words": timed})
        cursor += len(tokens)
    if cursor != len(metadata["words"]) or not parts:
        raise ValueError("Every narration word must belong to exactly one nonempty part")
    return parts


async def generate_voice(
    root: Path, parts: list[str], *, rate: str = "+8%", voice: str = "en-US-AndrewMultilingualNeural"
) -> None:
    # Speech generation is optional tooling; offline preparation does not import its provider.
    import edge_tts

    root.mkdir(parents=True, exist_ok=True)
    words: list[WordBoundary] = []
    temporary = root / "voice.mp3.tmp"
    try:
        with temporary.open("wb") as output:
            async for chunk in edge_tts.Communicate(
                " ".join(parts), voice, rate=rate, boundary="WordBoundary"
            ).stream():
                if chunk["type"] == "audio":
                    output.write(chunk["data"])
                elif chunk["type"] == "WordBoundary":
                    words.append({"text": chunk["text"], "offset": chunk["offset"], "duration": chunk["duration"]})
        metadata: VoiceMetadata = {"parts": parts, "words": words}
        align_parts(metadata, 24)
        temporary.replace(root / "voice.mp3")
        (root / "voice.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    finally:
        temporary.unlink(missing_ok=True)
    print(json.dumps({"words": len(words), "duration": (words[-1]["offset"] + words[-1]["duration"]) / 1e7}))


def prepare_voice(root: Path, *, fps: int = 24, total_frames: int | None = None) -> dict:
    metadata = json.loads((root / "voice.json").read_text(encoding="utf-8"))
    parts = align_parts(metadata, fps)
    pieces = []
    with av.open(str(root / "voice.mp3")) as source:
        resampler = av.AudioResampler(format="fltp", layout="mono", rate=48000)
        for frame in source.decode(audio=0):
            pieces.extend(value.to_ndarray() for value in resampler.resample(frame))
        pieces.extend(value.to_ndarray() for value in resampler.resample(None))
    if not pieces:
        raise ValueError("Narration contains no decoded audio")
    audio = np.concatenate(pieces, axis=1)[0]
    frames = total_frames if total_frames is not None else math.ceil(len(audio) * fps / 48000)
    if frames < 1 or parts[-1]["end"] > frames:
        raise ValueError("The requested duration would truncate spoken words")
    target_samples = round(frames * 48000 / fps)
    if len(audio) > target_samples and np.max(np.abs(audio[target_samples:])) > 0.001:
        raise ValueError("The requested duration would truncate audible narration")
    audio = np.pad(audio[:target_samples], (0, max(0, target_samples - len(audio))))
    with wave.open(str(root / "narration.wav"), "wb") as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(48000)
        output.writeframes((np.clip(audio, -1, 1) * 32767).astype("<i2").tobytes())
    report = {"fps": fps, "totalFrames": frames, "parts": parts}
    (root / "narration.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps({"frames": frames, "seconds": frames / fps, "parts_count": len(parts)}))
    return report
