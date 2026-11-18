import contextlib
import io
import json
import tempfile
import unittest
import wave
import xml.etree.ElementTree as ET
from functools import lru_cache
from pathlib import Path
from unittest.mock import patch

import av
import numpy as np
from manim import SVGMobject

from renderer.svg_normalize import normalize_svg
from renderer.worker import ExportSVGMobject, caption_vectors, export_path_points, mux_audio, render


class WorkerTests(unittest.TestCase):
    def test_silent_export_normalizes_segment_clock_without_adding_audio(self):
        with tempfile.TemporaryDirectory() as work:
            original = Path(work) / "original.mp4"
            with av.open(str(original), "w") as output:
                stream = output.add_stream("libx264", rate=30)
                stream.width = 64
                stream.height = 64
                stream.pix_fmt = "yuv420p"
                for i in range(180):
                    frame = av.VideoFrame.from_ndarray(np.zeros((64, 64, 3), dtype=np.uint8), format="rgb24")
                    frame.pts = i
                    for packet in stream.encode(frame):
                        output.mux(packet)
                for packet in stream.encode():
                    output.mux(packet)
            drifted = Path(work) / "drifted.mp4"
            with av.open(str(original)) as source, av.open(str(drifted), "w") as target:
                stream = target.add_stream_from_template(source.streams.video[0])
                for packet in source.demux(video=0):
                    if packet.dts is None:
                        continue
                    if float(packet.pts * packet.time_base) >= 3:
                        packet.pts -= 1
                    if float(packet.dts * packet.time_base) >= 3:
                        packet.dts -= 1
                    packet.stream = stream
                    target.mux(packet)
            with av.open(str(drifted)) as source:
                self.assertNotEqual(source.streams.video[0].average_rate, 30)
            result = mux_audio(drifted, {"work": work, "fps": 30, "frames": list(range(180))})
            with av.open(str(result)) as source:
                self.assertEqual(len(source.streams.audio), 0)
                self.assertEqual(source.streams.video[0].average_rate, 30)
                frames = list(source.decode(video=0))
                self.assertEqual(len(frames), 180)
                for index, frame in enumerate(frames):
                    self.assertAlmostEqual(float(frame.pts * frame.time_base), index / 30, places=6)

    def test_overall_audio_source_offset_uses_the_correct_part_of_the_file(self):
        with tempfile.TemporaryDirectory() as work:
            video = Path(work) / "silent.mp4"
            with av.open(str(video), "w") as output:
                stream = output.add_stream("libx264", rate=30)
                stream.width = 64
                stream.height = 64
                stream.pix_fmt = "yuv420p"
                for i in range(15):
                    frame = av.VideoFrame.from_ndarray(np.zeros((64, 64, 3), dtype=np.uint8), format="rgb24")
                    frame.pts = i
                    for packet in stream.encode(frame):
                        output.mux(packet)
                for packet in stream.encode():
                    output.mux(packet)
            samples = np.concatenate(
                [np.zeros(24000), np.sin(np.arange(24000) * 2 * np.pi * 440 / 48000) * 10000]
            ).astype("<i2")
            audio = Path(work) / "two-parts.wav"
            with wave.open(str(audio), "wb") as output:
                output.setnchannels(1)
                output.setsampwidth(2)
                output.setframerate(48000)
                output.writeframes(samples.tobytes())
            result = mux_audio(
                video,
                {
                    "work": work,
                    "fps": 30,
                    "frames": list(range(15)),
                    "audio": [{"path": str(audio), "start": 0, "sourceStart": 15, "duration": 15}],
                },
            )
            with av.open(str(result)) as source:
                data = np.concatenate([frame.to_ndarray() for frame in source.decode(audio=0)], axis=1)
                self.assertGreater(float(np.mean(np.abs(data[:, :12000]))), 0.1)

    def test_mux_retains_exact_frame_clock_and_audible_audio(self):
        with tempfile.TemporaryDirectory() as work:
            video = Path(work) / "silent.mp4"
            with av.open(str(video), "w") as output:
                stream = output.add_stream("libx264", rate=30)
                stream.width = 64
                stream.height = 64
                stream.pix_fmt = "yuv420p"
                for i in range(30):
                    frame = av.VideoFrame.from_ndarray(np.full((64, 64, 3), i * 8, dtype=np.uint8), format="rgb24")
                    frame.pts = i
                    for packet in stream.encode(frame):
                        output.mux(packet)
                for packet in stream.encode():
                    output.mux(packet)
            audio = Path(work) / "audio.wav"
            with wave.open(str(audio), "wb") as output:
                output.setnchannels(1)
                output.setsampwidth(2)
                output.setframerate(48000)
                output.writeframes((np.sin(np.arange(48000) * 2 * np.pi * 440 / 48000) * 10000).astype("<i2").tobytes())
            result = mux_audio(
                video,
                {"work": work, "frames": list(range(30)), "audio": [{"path": str(audio), "start": 0, "duration": 30}]},
            )
            with av.open(str(result)) as source:
                self.assertEqual(source.streams.video[0].average_rate, 30)
                frames = list(source.decode(video=0))
                self.assertEqual(len(frames), 30)
                for index, frame in enumerate(frames):
                    self.assertAlmostEqual(float(frame.pts * frame.time_base), index / 30, places=6)
            with av.open(str(result)) as source:
                self.assertTrue(any(np.max(np.abs(f.to_ndarray())) > 0.1 for f in source.decode(audio=0)))

    def test_export_svg_import_preserves_path_order_geometry_and_style(self) -> None:
        source = (
            '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">'
            '<g id="layer"><path fill="#ff0000" fill-opacity=".5" d="M4 4C8 1 20 3 22 7L19 28Z"/>'
            '<g id="nested"><path fill="#0000ff" fill-rule="evenodd" d="M8 8Q16 2 24 8V24H8Z M12 12H20V20H12Z"/>'
            '</g></g><rect x="1" y="1" width="8" height="8" fill="#00ff00"/>'
            '<path fill="#ffff00" d="M4 4C8 1 20 3 22 7L19 28Z"/></svg>'
        )
        with tempfile.TemporaryDirectory() as work:
            path = Path(work, "frame.svg")
            path.write_text(normalize_svg(source), encoding="utf-8")
            options = {"should_center": False, "height": None, "width": None, "use_svg_cache": False}
            expected = SVGMobject(path, **options)
            path_points = lru_cache(maxsize=4)(export_path_points)
            with patch(
                "svgelements.SVG.parse", side_effect=AssertionError("Export should use normalized paths directly")
            ):
                actual = ExportSVGMobject(path, path_points)
                shifted = ExportSVGMobject(path, path_points).shift([5, 6, 0])
                self.assertFalse(np.array_equal(actual.submobjects[0].points, shifted.submobjects[0].points))

        self.assertEqual(len(actual.submobjects), 4)
        self.assertEqual(path_points.cache_info().misses, 3)
        self.assertEqual(path_points.cache_info().hits, 5)
        self.assertEqual(actual.id_to_vgroup_dict, {})
        for imported, original in zip(actual.submobjects, expected.submobjects, strict=True):
            np.testing.assert_array_equal(imported.points, original.points)
            np.testing.assert_array_equal(imported.get_fill_rgbas(), original.get_fill_rgbas())
            np.testing.assert_array_equal(imported.get_stroke_rgbas(), original.get_stroke_rgbas())

    def test_sampled_render_reuses_identical_frames_without_changing_frame_order(self) -> None:
        colors = (("#ff0000", 0), ("#0000ff", 2), ("#00ff00", 1), ("#ff0000", 0), ("#0000ff", 2))
        for fps, quality in ((24, "final"), (60, "draft")):
            with self.subTest(fps=fps, quality=quality), tempfile.TemporaryDirectory() as work:
                for index, (color, _) in enumerate(colors):
                    Path(work, f"frame-{index}.svg").write_text(
                        '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">'
                        f'<rect x="10" y="10" width="20" height="20" fill="{color}"/></svg>',
                        encoding="utf-8",
                    )
                output = io.StringIO()
                with (
                    contextlib.redirect_stdout(output),
                    patch("renderer.worker.normalize_svg", wraps=normalize_svg) as normalize,
                ):
                    render(
                        {
                            "work": work,
                            "frames": [f"frame-{index}.svg" for index in range(len(colors))],
                            "width": 64,
                            "height": 64,
                            "fps": fps,
                            "quality": quality,
                        }
                    )
                self.assertEqual(normalize.call_count, 3)
                result = json.loads(output.getvalue().split("PTERON:")[-1])["result"]["path"]
                self.assertEqual(len(list(Path(work, "media").rglob("uncached_*.mp4"))), 3)
                with av.open(result) as source:
                    self.assertEqual(source.streams.video[0].average_rate, fps)
                    frames = list(source.decode(video=0))
                    for index, (frame, (_, channel)) in enumerate(zip(frames, colors, strict=True)):
                        self.assertAlmostEqual(float(frame.pts * frame.time_base), index / fps, places=6)
                        pixel = frame.to_ndarray(format="rgb24")[20, 20]
                        self.assertEqual(int(pixel.argmax()), channel)

    def test_invalid_export_quality_is_rejected_before_opening_output(self) -> None:
        with self.assertRaisesRegex(ValueError, "quality"):
            render({"work": "unused", "frames": [], "width": 64, "height": 64, "quality": "unknown"})

    def test_caption_paths_have_readable_dimensions(self):
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            caption_vectors({"texts": ["Two orders?"], "width": 1080, "height": 1920})
        result = json.loads(output.getvalue().split("PTERON:")[1])["result"]["vectors"][0]
        root = ET.fromstring(result)
        self.assertAlmostEqual(float(root.get("height")), 52)
        self.assertGreater(float(root.get("width")), 100)
        self.assertLessEqual(float(root.get("width")), 900)
        self.assertTrue(any(e.tag.endswith("path") for e in root.iter()))

    def test_caption_font_and_size_change_vector_geometry(self) -> None:
        def vector(font: str, size: int) -> ET.Element:
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                caption_vectors({"texts": ["Two orders?"], "font": font, "glyphHeight": size})
            payload = json.loads(output.getvalue().split("PTERON:")[1])
            return ET.fromstring(payload["result"]["vectors"][0])

        arial, georgia = vector("Arial", 52), vector("Georgia", 65)
        self.assertAlmostEqual(float(georgia.attrib["height"]), 65)
        self.assertNotEqual(arial.attrib["viewBox"], georgia.attrib["viewBox"])
        self.assertAlmostEqual(float(georgia.attrib["x"]) + float(georgia.attrib["width"]) / 2, 540)

    def test_caption_variants_produce_distinct_paths(self) -> None:
        paths = {}
        for variant in ("Regular", "Bold", "Italic"):
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                caption_vectors({"texts": ["Caption style"], "font": "Georgia", "variant": variant})
            payload = json.loads(output.getvalue().split("PTERON:")[1])
            root = ET.fromstring(payload["result"]["vectors"][0])
            paths[variant] = tuple(element.attrib["d"] for element in root.iter() if element.tag.endswith("path"))
        self.assertTrue(all(paths.values()))
        self.assertEqual(len(set(paths.values())), 3)


if __name__ == "__main__":
    unittest.main()
