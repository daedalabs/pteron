"""Shared exact-clock checks; algorithm-specific visual acceptance stays in each example."""

from fractions import Fraction

import av
import numpy as np
from numpy.typing import NDArray


def verify_stream(stream: av.video.stream.VideoStream, width: int, height: int, fps: int) -> None:
    if (stream.width, stream.height, stream.average_rate) != (width, height, fps):
        raise AssertionError(f"Unexpected video format: {stream.width}x{stream.height} at {stream.average_rate} fps")


def verify_timestamp(frame: av.VideoFrame, index: int, fps: int) -> None:
    if frame.pts is None or frame.time_base is None or frame.pts * frame.time_base != Fraction(index, fps):
        raise AssertionError(f"Frame {index} is not on the exact {fps} fps clock")


def nearby(mask: NDArray[np.bool_]) -> NDArray[np.bool_]:
    padded = np.pad(mask, 1)
    result = np.zeros_like(mask)
    for y in range(3):
        for x in range(3):
            result |= padded[y : y + mask.shape[0], x : x + mask.shape[1]]
    return result
