import json
import tempfile
import unittest
import wave
from fractions import Fraction
from pathlib import Path

import av
import numpy as np

from scripts.video_narration import align_parts, prepare_voice
from scripts.video_verification import nearby, verify_timestamp


class VideoAuthoringTests(unittest.TestCase):
    def test_preparation_preserves_audio_and_rejects_audible_truncation_before_writing(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            audio = np.full(48000, 1200, dtype="<i2")
            # AV probes the content; a WAV fixture avoids a lossy test encoder.
            with wave.open(str(root / "voice.mp3"), "wb") as source:
                source.setnchannels(1)
                source.setsampwidth(2)
                source.setframerate(48000)
                source.writeframes(audio.tobytes())
            (root / "voice.json").write_text(
                json.dumps(
                    {
                        "parts": ["Two"],
                        "words": [
                            {"text": "Two", "offset": 0, "duration": 1000000},
                        ],
                    }
                ),
                encoding="utf-8",
            )
            report = prepare_voice(root, fps=30)
            self.assertEqual(report["totalFrames"], 30)
            with wave.open(str(root / "narration.wav"), "rb") as prepared:
                self.assertEqual(prepared.getnframes(), 48000)
                self.assertEqual(prepared.getframerate(), 48000)
                actual = np.frombuffer(prepared.readframes(48000), dtype="<i2")
                self.assertLessEqual(int(np.max(np.abs(actual.astype(int) - audio))), 1)
            before = (root / "narration.wav").read_bytes()
            with self.assertRaisesRegex(ValueError, "audible"):
                prepare_voice(root, fps=30, total_frames=15)
            self.assertEqual((root / "narration.wav").read_bytes(), before)

    def test_connected_word_clock_is_retained_across_parts(self) -> None:
        result = align_parts(
            {
                "parts": ["Store two.", "Return!"],
                "words": [
                    {"text": "Store", "offset": 1000000, "duration": 2000000},
                    {"text": "two", "offset": 4000000, "duration": 1000000},
                    {"text": "Return", "offset": 20000000, "duration": 3000000},
                ],
            },
            24,
        )
        self.assertEqual((result[0]["start"], result[0]["end"]), (2, 12))
        self.assertEqual((result[1]["start"], result[1]["end"]), (48, 55))
        self.assertEqual(result[0]["words"][1]["start"], 10)

    def test_mismatched_leftover_and_overlapping_words_are_rejected(self) -> None:
        word = {"text": "two", "offset": 1000000, "duration": 2000000}
        for metadata in [
            {"parts": ["three"], "words": [word]},
            {"parts": ["two"], "words": [word, word]},
            {"parts": ["two two"], "words": [word, word]},
            {"parts": [], "words": []},
        ]:
            with self.subTest(metadata=metadata), self.assertRaises(ValueError):
                align_parts(metadata, 24)

    def test_frame_clock_rejects_one_frame_drift(self) -> None:
        frame = av.VideoFrame(16, 16, "rgb24")
        frame.time_base = Fraction(1, 24000)
        frame.pts = 7000
        verify_timestamp(frame, 7, 24)
        with self.assertRaises(AssertionError):
            verify_timestamp(frame, 8, 24)

    def test_geometry_neighborhood_is_exactly_one_pixel(self) -> None:
        mask = np.zeros((5, 5), dtype=bool)
        mask[2, 2] = True
        expected = np.zeros_like(mask)
        expected[1:4, 1:4] = True
        np.testing.assert_array_equal(nearby(mask), expected)
