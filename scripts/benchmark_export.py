"""Measure isolated export wall time and peak process memory; verify every output frame."""

import argparse
import contextlib
import ctypes
import io
import json
import os
import platform
import subprocess
import sys
import time
from pathlib import Path

from scripts.video_verification import verify_stream, verify_timestamp

CASES = ("hold", "alternating", "distinct")


def peak_memory_bytes() -> int:
    if sys.platform == "win32":
        from ctypes import wintypes

        class MemoryCounters(ctypes.Structure):
            _fields_ = [("cb", wintypes.DWORD), ("PageFaultCount", wintypes.DWORD)] + [
                (name, ctypes.c_size_t)
                for name in (
                    "PeakWorkingSetSize",
                    "WorkingSetSize",
                    "QuotaPeakPagedPoolUsage",
                    "QuotaPagedPoolUsage",
                    "QuotaPeakNonPagedPoolUsage",
                    "QuotaNonPagedPoolUsage",
                    "PagefileUsage",
                    "PeakPagefileUsage",
                )
            ]

        kernel = ctypes.WinDLL("kernel32", use_last_error=True)
        kernel.GetCurrentProcess.restype = wintypes.HANDLE
        psapi = ctypes.WinDLL("psapi", use_last_error=True)
        psapi.GetProcessMemoryInfo.argtypes = [wintypes.HANDLE, ctypes.POINTER(MemoryCounters), wintypes.DWORD]
        counters = MemoryCounters()
        counters.cb = ctypes.sizeof(counters)
        if not psapi.GetProcessMemoryInfo(kernel.GetCurrentProcess(), ctypes.byref(counters), counters.cb):
            raise ctypes.WinError(ctypes.get_last_error())
        return counters.PeakWorkingSetSize
    import resource

    peak = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    return peak if sys.platform == "darwin" else peak * 1024


def frame_x(case: str, index: int, width: int) -> int:
    step = 0 if case == "hold" else index % 2 if case == "alternating" else index
    return 8 + step % (width - 32)


def frame_y(case: str, index: int, width: int, height: int) -> int:
    return 8 + (index // (width - 32)) % (height - 32) if case == "distinct" else 8


def run_case(args: argparse.Namespace) -> dict:
    import av
    import numpy as np

    from renderer.worker import render

    work = args.output.resolve() / args.case
    work.mkdir(parents=True, exist_ok=True)
    frames = []
    for index in range(args.frames):
        name = f"frame-{index}.svg"
        x = frame_x(args.case, index, args.width)
        y = frame_y(args.case, index, args.width, args.height)
        (work / name).write_text(
            f'<svg xmlns="http://www.w3.org/2000/svg" width="{args.width}" height="{args.height}">'
            f'<rect width="{args.width}" height="{args.height}" fill="#000000"/>'
            f'<rect x="{x}" y="{y}" width="16" height="16" fill="#ffffff"/></svg>',
            encoding="utf-8",
        )
        frames.append(name)
    request = {"work": str(work), "frames": frames, "width": args.width, "height": args.height, "fps": args.fps}
    output = io.StringIO()
    start = time.perf_counter()
    with contextlib.redirect_stdout(output):
        render(request)
    seconds = time.perf_counter() - start
    peak = peak_memory_bytes()
    result = json.loads(output.getvalue().split("PTERON:")[-1])["result"]
    count = 0
    with av.open(result["path"]) as movie:
        stream = movie.streams.video[0]
        verify_stream(stream, args.width, args.height, args.fps)
        for index, frame in enumerate(movie.decode(video=0)):
            verify_timestamp(frame, index, args.fps)
            mask = frame.to_ndarray(format="rgb24").min(axis=2) > 128
            ys, xs = np.where(mask)
            assert len(xs), f"Missing artwork at frame {index}"
            expected = frame_x(args.case, index, args.width)
            assert abs(int(xs.min()) - expected) <= 1 and abs(int(xs.max()) - expected - 15) <= 1
            expected_y = frame_y(args.case, index, args.width, args.height)
            assert abs(int(ys.min()) - expected_y) <= 1 and abs(int(ys.max()) - expected_y - 15) <= 1
            count += 1
    assert count == args.frames, (count, args.frames)
    return {
        "case": args.case,
        "seconds": seconds,
        "framesPerSecond": count / seconds,
        "peakWorkingSetBytes": peak,
        "verifiedFrames": count,
        "video": result["path"],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=Path("artifacts/export-benchmark"))
    parser.add_argument("--baseline", type=Path, help="Compare against a prior report with the same settings")
    parser.add_argument("--frames", type=int, default=360)
    parser.add_argument("--width", type=int, default=320)
    parser.add_argument("--height", type=int, default=180)
    parser.add_argument("--fps", type=int, default=24)
    parser.add_argument("--case", choices=CASES, help=argparse.SUPPRESS)
    args = parser.parse_args()
    if args.frames < 1 or args.width < 64 or args.height < 32 or not 1 <= args.fps <= 120:
        parser.error("Use positive frames, width >= 64, height >= 32, and FPS from 1 to 120")
    if args.case:
        print(json.dumps(run_case(args)))
        return
    settings = {name: vars(args)[name] for name in ("frames", "width", "height", "fps")}
    report = {
        "status": "running",
        "settings": settings,
        "python": platform.python_version(),
        "platform": platform.platform(),
        "memoryScope": "Peak worker working set including imports; excludes Electron and encoder subprocesses",
        "cases": [],
    }
    baseline = json.loads(args.baseline.read_text(encoding="utf-8")) if args.baseline else None
    if baseline and baseline["settings"] != settings:
        parser.error("Baseline settings must match the current workload")
    args.output.mkdir(parents=True, exist_ok=True)
    report_path = args.output / "report.json"
    report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    for case in CASES:
        command = [sys.executable, "-m", "scripts.benchmark_export", "--case", case, "--output", str(args.output)]
        for name, value in settings.items():
            command.extend([f"--{name}", str(value)])
        start = time.perf_counter()
        child = subprocess.run(command, capture_output=True, text=True, env=os.environ, check=False)
        if child.returncode:
            report["status"] = "failed"
            report["error"] = f"Benchmark {case} failed:\n{child.stdout}\n{child.stderr}"
            report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
            raise RuntimeError(f"Benchmark {case} failed:\n{child.stdout}\n{child.stderr}")
        result = json.loads(child.stdout)
        result["processSeconds"] = time.perf_counter() - start
        if baseline:
            previous = next(item for item in baseline["cases"] if item["case"] == case)
            result["speedup"] = previous["seconds"] / result["seconds"]
            result["peakMemoryRatio"] = result["peakWorkingSetBytes"] / previous["peakWorkingSetBytes"]
        report["cases"].append(result)
        print(json.dumps(result), flush=True)
    report["status"] = "passed"
    report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
