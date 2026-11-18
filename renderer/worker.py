"""Fixed JSON worker operations; sampled geometry is supplied by TypeScript/browser."""

import copy
import importlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import xml.etree.ElementTree as ET
from collections.abc import Callable
from functools import lru_cache
from hashlib import sha256
from io import StringIO
from pathlib import Path
from typing import Literal, NotRequired, Self, TypedDict

import numpy as np
import svgelements as se
from manim import (
    BOLD,
    ITALIC,
    NORMAL,
    RIGHT,
    WHITE,
    MathTex,
    RendererType,
    Scene,
    SVGMobject,
    Text,
    VMobject,
    VMobjectFromSVGPath,
    config,
    tempconfig,
)
from numpy.typing import NDArray

root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(root))
from renderer.runtime import configure_tools, require_tex_tools
from renderer.svg_normalize import UnsupportedSvg, create_shape_cache, normalize_svg

configure_tools()
NS = "http://www.w3.org/2000/svg"
CAPTION_VARIANTS = {"Regular": (NORMAL, NORMAL), "Bold": (BOLD, NORMAL), "Italic": (NORMAL, ITALIC)}
MAX_ENCODER_OVERLAP_PIXELS = 1920 * 1080
MAX_CACHED_EXPORT_PATHS = 256
MAX_CACHED_PATH_DATA_LENGTH = 8192


def emit(**value):
    print("PTERON:" + json.dumps(value), flush=True)


def expand_svg(svg: ET.Element) -> ET.Element:
    definitions = {e.get("id"): e for e in svg.iter() if e.get("id")}

    def expand(parent):
        for child in list(parent):
            if child.tag.rsplit("}", 1)[-1] == "use":
                href = child.get("href") or child.get("{http://www.w3.org/1999/xlink}href")
                if not href or not href.startswith("#") or href[1:] not in definitions:
                    raise ValueError("Unresolved vector glyph")
                group = ET.Element(
                    f"{{{NS}}}g",
                    {
                        "transform": f"translate({child.get('x', '0')} {child.get('y', '0')}) {child.get('transform', '')}"
                    },
                )
                glyph = copy.deepcopy(definitions[href[1:]])
                glyph.attrib.pop("id", None)
                group.append(glyph)
                parent.insert(list(parent).index(child), group)
                parent.remove(child)
            else:
                expand(child)

    expand(svg)
    for child in list(svg):
        if child.tag.rsplit("}", 1)[-1] == "defs":
            svg.remove(child)
    return svg


def caption_vectors(request):
    result = []
    width = request.get("width", 1080)
    height = request.get("height", 1920)
    font = request.get("font", "Arial")
    weight, slant = CAPTION_VARIANTS[request.get("variant", "Bold")]
    glyph_height = request.get("glyphHeight", 52 * width / 1080)
    with (
        tempfile.TemporaryDirectory(prefix="pteron-captions-") as work,
        tempconfig({"media_dir": work, "text_dir": str(Path(work) / "texts")}),
    ):
        for text in request["texts"]:
            label = Text(text, font=font, weight=weight, slant=slant, font_size=glyph_height, color=WHITE)
            svg = expand_svg(ET.parse(label.file_name).getroot())
            # Pango's SVG includes a full-screen viewport around small glyphs.
            # Crop to vector bounds before sizing the caption, preserving paths.
            bounds = se.SVG.parse(StringIO(ET.tostring(svg, encoding="unicode"))).bbox()
            if not bounds:
                raise ValueError("Caption has no visible glyphs")
            x, y, x2, y2 = map(float, bounds)
            w = x2 - x
            h = y2 - y
            svg.set("viewBox", f"{x} {y} {w} {h}")
            scale = min(glyph_height / h, width * 0.833333 / w)
            svg.set("x", str((width - w * scale) / 2))
            svg.set("y", str(height * 0.7890625))
            svg.set("width", str(w * scale))
            svg.set("height", str(h * scale))
            result.append(ET.tostring(svg, encoding="unicode"))
    emit(result={"vectors": result})


def mux_audio(video, request):
    from fractions import Fraction

    import av

    fps = request.get("fps", 30)
    if not isinstance(fps, int) or not 1 <= fps <= 120:
        raise ValueError("Frame rate must be an integer from 1 to 120")
    samples = round(len(request["frames"]) / fps * 48000)
    has_audio = bool(request.get("audio"))
    signal = np.zeros((1, samples), dtype=np.float32) if has_audio else None
    for item in request.get("audio", []):
        pieces = []
        with av.open(item["path"]) as source:
            resampler = av.AudioResampler(format="fltp", layout="mono", rate=48000)
            for frame in source.decode(audio=0):
                for converted in resampler.resample(frame):
                    pieces.append(converted.to_ndarray())
            for converted in resampler.resample(None):
                pieces.append(converted.to_ndarray())
        if not pieces:
            continue
        data = np.concatenate(pieces, axis=1)
        source_start = round(item.get("sourceStart", 0) / fps * 48000)
        data = data[:, source_start:]
        start = round(item["start"] / fps * 48000)
        count = min(data.shape[1], samples - start, round(item["duration"] / fps * 48000))
        if count > 0:
            signal[:, start : start + count] += data[:, :count]
    audio_gain = request.get("audioGain", 1.0)
    if signal is not None:
        signal *= audio_gain
    output = Path(request["work"]) / ("narrated.mp4" if has_audio else "timed.mp4")
    with av.open(str(video)) as source, av.open(str(output), "w", options={"movflags": "+faststart"}) as target:
        video_stream = target.add_stream_from_template(source.streams.video[0])
        audio_stream = target.add_stream("aac", rate=48000) if has_audio else None
        if audio_stream:
            audio_stream.layout = "mono"
        packets = []
        for packet in source.demux(video=0):
            if packet.dts is not None:
                # Manim segment concatenation can round cumulative timestamps.
                # Restore the authoritative integer-frame clock before remuxing.
                time_base = packet.time_base
                packet.pts = round(float(packet.pts * time_base) * fps) if packet.pts is not None else None
                packet.dts = round(float(packet.dts * time_base) * fps)
                packet.duration = 1
                packet.time_base = Fraction(1, fps)
                packet.stream = video_stream
                packets.append(packet)
        for start in range(0, samples, 1024) if audio_stream else []:
            frame = av.AudioFrame.from_ndarray(
                np.clip(signal[:, start : start + 1024], -1, 1), format="fltp", layout="mono"
            )
            frame.sample_rate = 48000
            frame.pts = start
            frame.time_base = Fraction(1, 48000)
            packets.extend(audio_stream.encode(frame))
        if audio_stream:
            packets.extend(audio_stream.encode(None))
        for packet in sorted(packets, key=lambda p: float(p.dts * p.time_base) if p.dts is not None else 0):
            target.mux(packet)
    return output


def pdf_equation_svg(source: str, work: Path) -> str:
    compiler = shutil.which("pdflatex")
    if compiler is None:
        raise RuntimeError("LaTeX tools not found: pdflatex. Set up the local MiKTeX compiler.")
    pdf = importlib.import_module("pymupdf")
    template = config["tex_template"].get_texcode_for_expression_in_env(source, "align*")
    (work / "formula.tex").write_text(template, encoding="utf-8")
    result = subprocess.run(
        [
            compiler,
            "--disable-installer",
            "-no-shell-escape",
            "-interaction=nonstopmode",
            "-halt-on-error",
            "formula.tex",
        ],
        cwd=work,
        capture_output=True,
        check=False,
        text=True,
        errors="replace",
        timeout=60,
    )
    if result.returncode:
        lines = [line for line in result.stdout.splitlines() if line.startswith("!")]
        raise ValueError(lines[0][1:].strip() if lines else result.stderr.strip() or "LaTeX compilation failed")
    with pdf.open(work / "formula.pdf") as document:
        if len(document) != 1:
            raise ValueError("An equation must produce one page")
        svg = expand_svg(ET.fromstring(document[0].get_svg_image(text_as_path=True)))
    bounds = se.SVG.parse(StringIO(ET.tostring(svg, encoding="unicode"))).bbox(with_stroke=True)
    if not bounds:
        raise ValueError("Equation has no visible glyphs")
    x, y, right, bottom = bounds
    width, height = right - x, bottom - y
    svg.set("width", str(width))
    svg.set("height", str(height))
    svg.set("viewBox", f"{x} {y} {width} {height}")
    return normalize_svg(ET.tostring(svg, encoding="unicode"))


def equation(request):
    source = request["source"]
    if "^^" in source or any(ord(c) < 32 and c not in "\n\r\t" for c in source):
        raise ValueError("TeX character escapes are unsupported")
    for environment in re.findall(r"\\(?:begin|end)\s*\{([^}]+)\}", source):
        if environment not in {"matrix", "pmatrix", "bmatrix", "aligned", "cases"}:
            raise ValueError(f"Unsupported mathematical environment: {environment}")
    allowed = {
        "frac",
        "sqrt",
        "sum",
        "prod",
        "int",
        "iint",
        "lim",
        "sin",
        "cos",
        "tan",
        "log",
        "ln",
        "exp",
        "left",
        "right",
        "begin",
        "end",
        "matrix",
        "pmatrix",
        "bmatrix",
        "aligned",
        "cases",
        "text",
        "mathrm",
        "mathbf",
        "mathit",
        "mathcal",
        "operatorname",
        "overline",
        "underline",
        "vec",
        "hat",
        "bar",
        "dot",
        "ddot",
        "alpha",
        "beta",
        "gamma",
        "delta",
        "epsilon",
        "theta",
        "lambda",
        "mu",
        "pi",
        "rho",
        "sigma",
        "tau",
        "phi",
        "omega",
        "Gamma",
        "Delta",
        "Theta",
        "Lambda",
        "Pi",
        "Sigma",
        "Phi",
        "Omega",
        "infty",
        "times",
        "cdot",
        "div",
        "pm",
        "mp",
        "le",
        "leq",
        "ge",
        "geq",
        "ne",
        "neq",
        "approx",
        "equiv",
        "to",
        "rightarrow",
        "leftarrow",
        "mapsto",
        "in",
        "notin",
        "subset",
        "subseteq",
        "cup",
        "cap",
        "emptyset",
        "forall",
        "exists",
        "partial",
        "nabla",
        "quad",
        "qquad,;!{}",
        "%",
    }
    for macro in re.findall(r"\\([A-Za-z]+|.)", source):
        if macro not in allowed and macro != "\\":
            raise ValueError(f"Unsupported mathematical command: \\{macro}")
    with tempfile.TemporaryDirectory(prefix="pteron-equation-") as work:
        if os.environ.get("PTERON_SOURCE_PDF_TEX") == "1" and not getattr(sys, "frozen", False):
            emit(result={"svg": pdf_equation_svg(source, Path(work))})
            return
        require_tex_tools()
        with tempconfig({"media_dir": work, "tex_dir": str(Path(work) / "Tex")}):
            formula = MathTex(source)
            svg = expand_svg(ET.parse(formula.file_name).getroot())
            emit(result={"svg": ET.tostring(svg, encoding="unicode")})


def export_path_points(path_data: str) -> NDArray[np.float64] | None:
    path = se.Path(path_data)
    path.reify()
    if path.is_degenerate():
        return None
    mobject = VMobjectFromSVGPath(path)
    return mobject.points if mobject.has_points() else None


class ExportSVGMobject(SVGMobject):
    def __init__(self, file_name: Path, path_points: Callable[[str], NDArray[np.float64] | None]) -> None:
        self.path_points = path_points
        super().__init__(file_name, should_center=False, height=None, width=None, use_svg_cache=False)

    def generate_mobject(self) -> Self:
        # Normalization has already resolved viewports, transforms and inherited paint.
        root = ET.parse(self.get_file_path()).getroot()
        mobjects: list[VMobject] = []
        for element in root.iter():
            if element.tag in (f"{{{NS}}}svg", f"{{{NS}}}g"):
                continue
            if element.tag != f"{{{NS}}}path":
                raise ValueError(f"Unexpected element in normalized SVG: {element.tag}")
            path_data = element.attrib["d"]
            if config.renderer == RendererType.CAIRO and len(path_data) <= MAX_CACHED_PATH_DATA_LENGTH:
                points = self.path_points(path_data)
                if points is not None:
                    # set_points copies the cached geometry before the frame is flipped and shifted.
                    mobject = VMobject().set_points(points)
                    self.apply_style_to_mobject(mobject, se.Path(element.attrib, pathd_loaded=True))
                    mobjects.append(mobject)
                continue
            path = se.Path(element.attrib)
            path.reify()
            if path.is_degenerate():
                continue
            mobject = self.get_mob_from_shape_element(path)
            if mobject is not None:
                mobjects.append(mobject)
        self.add(*mobjects)
        self.flip(RIGHT)
        return self


class RenderRequest(TypedDict):
    work: str
    frames: list[str]
    width: int
    height: int
    fps: NotRequired[int]
    quality: NotRequired[Literal["draft", "final"]]


def render(request: RenderRequest) -> None:
    quality = request.get("quality", "final")
    if quality not in {"draft", "final"}:
        raise ValueError("Export quality must be draft or final")
    work = Path(request["work"])
    frames = request["frames"]
    fps = request.get("fps", 30)
    if not isinstance(fps, int) or not 1 <= fps <= 120:
        raise ValueError("Frame rate must be an integer from 1 to 120")
    width, height = request["width"], request["height"]
    # Validate each distinct source before opening the output movie.
    normalized: list[Path] = []
    normalized_by_source: dict[bytes, Path] = {}
    first_frame_by_digest: dict[bytes, Path] = {}
    shape_cache = create_shape_cache()
    for index, name in enumerate(frames):
        source = (work / name).read_text(encoding="utf-8")
        path = work / f"vector-{index}.svg"
        source_digest = sha256(source.encode("utf-8")).digest()
        normalized_path = normalized_by_source.get(source_digest)
        if normalized_path is None:
            try:
                derived = normalize_svg(source, shape_cache=shape_cache)
            except UnsupportedSvg as error:
                error.frame_index = index
                raise
            path.write_text(derived, encoding="utf-8")
            digest = sha256(derived.encode("utf-8")).digest()
            normalized_path = first_frame_by_digest.setdefault(digest, path)
            normalized_by_source[source_digest] = normalized_path
        else:
            shutil.copyfile(normalized_path, path)
        normalized.append(normalized_path)

    class SampledScene(Scene):
        def construct(self) -> None:
            self.camera.frame_center = np.array([width / 2, -height / 2, 0.0])
            path_points = lru_cache(maxsize=MAX_CACHED_EXPORT_PATHS)(export_path_points)
            writer = self.renderer.file_writer
            encoded: dict[Path, str] = {}
            segments: list[str] = []
            for index, path in enumerate(normalized):
                if path not in encoded:
                    self.clear()
                    art = ExportSVGMobject(path, path_points)
                    art.shift([0, -2 * art.get_center()[1], 0])
                    self.add(art)
                    self.wait(1 / fps, frozen_frame=False)
                    encoded[path] = writer.partial_movie_files[-1]
                segments.append(encoded[path])
                emit(progress=(index + 1) / len(normalized))
            # Each segment encodes one independent frame, so repeats can reference the same file.
            writer.partial_movie_files[:] = segments
            writer.sections[-1].partial_movie_files[:] = segments

    video_codec = "auto"
    video_options = {"crf": "23" if quality == "draft" else "12"}
    try:
        import av

        if av.Codec("h264_mf", "w").type == "video":
            video_codec = "h264_mf"
            video_options = {"b": "3000k" if quality == "draft" else "8000k"}
    except Exception:
        pass

    with tempconfig(
        {
            "pixel_width": width,
            "pixel_height": height,
            "frame_width": width,
            "frame_height": height,
            "frame_rate": fps,
            "background_color": "#ffffff",
            "media_dir": str(work / "media"),
            "output_file": "export",
            "write_to_movie": True,
            "save_last_frame": False,
            "disable_caching": True,
            "video_codec": video_codec,
            "video_encoder_options": video_options,
            "max_inflight_encoders": 2 if width * height <= MAX_ENCODER_OVERLAP_PIXELS else 1,
            "verbosity": "ERROR",
        }
    ):
        scene = SampledScene()
        scene.render()
        path = scene.renderer.file_writer.movie_file_path
        # Silent exports need the same authoritative frame clock as narrated
        # exports: concatenated Manim segments can round cumulative timestamps.
        path = mux_audio(path, request)
        emit(result={"path": str(path)})


def main() -> None:
    try:
        request = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
        if request["operation"] == "equation":
            equation(request)
        elif request["operation"] == "render":
            render(request)
        elif request["operation"] == "captions":
            caption_vectors(request)
        elif request["operation"] == "mux":
            emit(result={"path": str(mux_audio(request["video"], request))})
        elif request["operation"] == "audio":
            import av

            with av.open(request["path"]) as media:
                duration = media.duration / av.time_base if media.duration else None
                if not duration:
                    raise ValueError("Audio duration is unavailable")
                emit(result={"duration": int(np.ceil(duration * request.get("fps", 30)))})
        else:
            raise ValueError("Unknown worker operation")
    except Exception as error:  # noqa: BLE001 - Return every request failure through the worker protocol.
        if isinstance(error, UnsupportedSvg):
            emit(error=str(error), errorObjectId=error.object_id, errorFrame=error.frame_index)
        else:
            emit(error=str(error))
        raise SystemExit(1)


if __name__ == "__main__":
    main()
