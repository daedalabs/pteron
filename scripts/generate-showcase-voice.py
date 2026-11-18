import asyncio
import json
from pathlib import Path
from typing import BinaryIO

import edge_tts

parts = [
    "Start with a simple shape,",
    "then add a stem and a couple of leaves.",
    "Give each piece its own timing.",
    "You can move the whole group while the details keep moving on their own.",
    "Bring the scenes together,",
    "add a little sound, and it's ready to share.",
]


async def generate(out: BinaryIO) -> list[dict[str, object]]:
    words = []
    async for chunk in edge_tts.Communicate(
        " ".join(parts), "en-US-AvaMultilingualNeural", rate="+0%", boundary="WordBoundary"
    ).stream():
        if chunk["type"] == "audio":
            await asyncio.to_thread(out.write, chunk["data"])
        elif chunk["type"] == "WordBoundary":
            words.append(chunk)
    return words


def main() -> None:
    output = Path("artifacts/example")
    output.mkdir(parents=True, exist_ok=True)
    with (output / "connected-voice.mp3").open("wb") as audio:
        words = asyncio.run(generate(audio))
    (output / "connected-words.json").write_text(json.dumps({"parts": parts, "words": words}, indent=2))
    print(json.dumps({"words": len(words), "first": words[:3], "last": words[-3:]}))


main()
