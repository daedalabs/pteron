"""Derive Manim-ready vectors, including nested SVG viewport intersections.

The source document is never modified. Curves remain curves; stroked outlines
are expanded before clipping, so a viewport boundary cannot acquire a fake
stroke. Arbitrary clip paths, masks, filters and non-vector content are rejected.
"""

from __future__ import annotations

import math
import xml.etree.ElementTree as ET
from collections.abc import Callable
from functools import lru_cache

import pathops
import svgelements as se

NS = "http://www.w3.org/2000/svg"
ET.register_namespace("", NS)
MAX_CACHED_SHAPES = 256
MAX_CACHED_SHAPE_CHARS = 8192
SHAPE_CONSTRUCTORS = {
    "rect": se.Rect,
    "circle": se.Circle,
    "ellipse": se.Ellipse,
    "line": se.Line,
    "polygon": se.Polygon,
    "polyline": se.Polyline,
    "path": se.Path,
}

type ShapeProperties = tuple[tuple[str, str | float], ...]
type ShapeCache = Callable[[str, ShapeProperties], tuple[se.Shape, pathops.Path]]


class UnsupportedSvg(ValueError):
    def __init__(self, message: str, object_id: str | None = None) -> None:
        super().__init__(message)
        self.object_id = object_id
        self.frame_index: int | None = None


def vector_path(shape):
    svg_path = se.Path(shape)
    svg_path.reify()
    svg_path.approximate_arcs_with_cubics()
    path = pathops.Path()
    for segment in svg_path:
        if isinstance(segment, se.Move):
            path.moveTo(segment.end.x, segment.end.y)
        elif isinstance(segment, se.Line):
            path.lineTo(segment.end.x, segment.end.y)
        elif isinstance(segment, se.CubicBezier):
            path.cubicTo(
                segment.control1.x,
                segment.control1.y,
                segment.control2.x,
                segment.control2.y,
                segment.end.x,
                segment.end.y,
            )
        elif isinstance(segment, se.QuadraticBezier):
            path.quadTo(segment.control.x, segment.control.y, segment.end.x, segment.end.y)
        elif isinstance(segment, se.Close):
            path.close()
        else:
            raise UnsupportedSvg(f"Unsupported path segment: {type(segment).__name__}")
    if shape.values.get("fill-rule") == "evenodd":
        path.fillType = pathops.FillType.EVEN_ODD
    return path


def viewport_path(x, y, w, h, matrix):
    if not all(math.isfinite(v) for v in (x, y, w, h)) or w < 0 or h < 0:
        raise UnsupportedSvg("Invalid viewport dimensions")
    points = [se.Point(px, py) * matrix for px, py in ((x, y), (x + w, y), (x + w, y + h), (x, y + h))]
    path = pathops.Path()
    path.moveTo(points[0].x, points[0].y)
    for point in points[1:]:
        path.lineTo(point.x, point.y)
    path.close()
    return path


def svg_data(path):
    path.convertConicsToQuads()
    names = {"moveTo": "M", "lineTo": "L", "curveTo": "C", "qCurveTo": "Q", "closePath": "Z"}
    commands = []
    for verb, points in path.segments:
        if verb == "qCurveTo":
            # The pen protocol allows several off-curve controls with implied
            # midpoint endpoints. SVG Q requires an explicit control/end pair.
            points = list(points)
            if points[-1] is None:
                start = tuple((a + b) / 2 for a, b in zip(points[-2], points[0]))
                commands.append("M" + " ".join(f"{v:.9g}" for v in start))
                points[-1] = start
            for index, control in enumerate(points[:-1]):
                following = points[index + 1]
                end = following if index == len(points) - 2 else tuple((a + b) / 2 for a, b in zip(control, following))
                commands.append("Q" + " ".join(f"{v:.9g}" for point in (control, end) for v in point))
        else:
            commands.append(names[verb] + " ".join(f"{v:.9g}" for point in points for v in point))
    return " ".join(commands)


def composite_layer(group, opacity):
    """Resolve source-over coverage into disjoint vector faces, then fade once.

    Authored sources remain untouched. This is the vector equivalent of an SVG
    isolated opacity layer; multiplying each child's alpha would darken overlaps.
    """
    if opacity == 1:
        return
    regions = []
    for element in list(group.iter()):
        if element.tag.rsplit("}", 1)[-1] != "path":
            continue
        path = vector_path(se.Path(element.attrib))
        color = se.Color(element.get("fill", "#000000"))
        alpha = float(element.get("fill-opacity", 1))
        if alpha <= 0 or not path.verbs:
            continue
        rgb = (color.red / 255, color.green / 255, color.blue / 255)
        updated = []
        remaining = path
        for under, under_rgb, under_alpha in regions:
            outside = pathops.op(under, path, pathops.PathOp.DIFFERENCE)
            if outside.verbs:
                updated.append((outside, under_rgb, under_alpha))
            if alpha < 1:
                overlap = pathops.op(under, path, pathops.PathOp.INTERSECTION)
                if overlap.verbs:
                    combined = alpha + under_alpha * (1 - alpha)
                    mixed = tuple(
                        (rgb[i] * alpha + under_rgb[i] * under_alpha * (1 - alpha)) / combined for i in range(3)
                    )
                    updated.append((overlap, mixed, combined))
            remaining = pathops.op(remaining, under, pathops.PathOp.DIFFERENCE)
        if alpha == 1:
            updated.append((path, rgb, alpha))
        elif remaining.verbs:
            updated.append((remaining, rgb, alpha))
        regions = updated
        if len(regions) > 10000:
            raise UnsupportedSvg("Opacity composition exceeds 10000 vector regions")
    identities = [element.get("id") for element in group.iter() if element is not group and element.get("id")]
    for child in list(group):
        group.remove(child)
    for identity in identities:
        ET.SubElement(group, f"{{{NS}}}g", {"id": identity})
    for path, rgb, alpha in regions:
        ET.SubElement(
            group,
            f"{{{NS}}}path",
            {
                "d": svg_data(path),
                "fill": "#" + "".join(f"{round(value * 255):02x}" for value in rgb),
                "fill-opacity": str(alpha * opacity),
                "stroke": "none",
                "fill-rule": "evenodd" if path.fillType == pathops.FillType.EVEN_ODD else "nonzero",
            },
        )


def shape_geometry(tag: str, properties: ShapeProperties) -> tuple[se.Shape, pathops.Path]:
    shape = SHAPE_CONSTRUCTORS[tag](dict(properties))
    return shape, vector_path(shape)


def create_shape_cache() -> ShapeCache:
    return lru_cache(maxsize=MAX_CACHED_SHAPES)(shape_geometry)


def normalize_svg(source: str, *, shape_cache: ShapeCache | None = None) -> str:
    tree = ET.fromstring(source)
    for element in tree.iter():
        tag = element.tag.rsplit("}", 1)[-1]
        if tag in {
            "script",
            "foreignObject",
            "image",
            "text",
            "style",
            "linearGradient",
            "radialGradient",
            "pattern",
            "mask",
            "clipPath",
            "filter",
        }:
            raise UnsupportedSvg(f"Unsupported render feature: {tag}", element.get("id"))
        if any(name in element.attrib for name in ("clip-path", "mask", "filter")):
            raise UnsupportedSvg("Arbitrary clipping, masks and filters are not supported", element.get("id"))
        styles = element.get("style", "")
        if any(name + ":" in styles.replace(" ", "") for name in ("clip-path", "mask", "filter", "vector-effect")):
            raise UnsupportedSvg("Unsupported styled clipping/filter/vector effect", element.get("id"))
        if element.get("vector-effect"):
            raise UnsupportedSvg("Non-scaling strokes are not supported", element.get("id"))

    def length(value, relative):
        resolved = float(se.Length(str(value)).value(ppi=96, relative_length=relative))
        if not math.isfinite(resolved):
            raise UnsupportedSvg("Non-finite SVG length")
        return resolved

    width, height = length(tree.get("width", 300), 300), length(tree.get("height", 150), 150)
    if width <= 0 or height <= 0:
        raise UnsupportedSvg("Root viewport must have positive dimensions")
    output = ET.Element(
        f"{{{NS}}}svg", {"width": str(width), "height": str(height), "viewBox": f"0 0 {width} {height}"}
    )
    inherited_names = {
        "fill",
        "fill-opacity",
        "fill-rule",
        "stroke",
        "stroke-opacity",
        "stroke-width",
        "stroke-linecap",
        "stroke-linejoin",
        "stroke-miterlimit",
        "stroke-dasharray",
        "color",
        "visibility",
    }

    def visit(element, parent, clips, matrix, viewport, inherited, inherited_opacity=1.0):
        tag = element.tag.rsplit("}", 1)[-1]
        if tag in {"defs", "title", "desc", "metadata"}:
            return
        attributes = dict(element.attrib)
        style = {
            k.strip(): v.strip()
            for part in attributes.get("style", "").split(";")
            if ":" in part
            for k, v in [part.split(":", 1)]
        }
        attributes.update(style)
        opacity = float(attributes.get("opacity", 1))
        if not math.isfinite(opacity) or not 0 <= opacity <= 1:
            raise UnsupportedSvg("Opacity must be between zero and one")
        presentation = {**inherited, **{k: v for k, v in attributes.items() if k in inherited_names}}
        if attributes.get("display") == "none":
            return
        matrix = se.Matrix(attributes.get("transform", "")) * matrix
        if tag in {"svg", "g"}:
            group = ET.SubElement(parent, f"{{{NS}}}g")
            if element.get("id"):
                group.set("id", element.get("id"))
            if tag == "svg":
                x, y = length(attributes.get("x", 0), viewport[0]), length(attributes.get("y", 0), viewport[1])
                w, h = (
                    length(attributes.get("width", viewport[0]), viewport[0]),
                    length(attributes.get("height", viewport[1]), viewport[1]),
                )
                if w < 0 or h < 0:
                    raise UnsupportedSvg("Negative viewport dimensions")
                if w == 0 or h == 0:
                    return
                overflow = attributes.get("overflow", "hidden")
                if overflow not in {"hidden", "visible", "scroll", "auto"}:
                    raise UnsupportedSvg(f"Unsupported overflow: {overflow}")
                if overflow != "visible":
                    clips = clips + [viewport_path(x, y, w, h, matrix)]
                if "viewBox" in attributes:
                    box = [float(v) for v in attributes["viewBox"].replace(",", " ").split()]
                    if len(box) != 4 or not all(math.isfinite(v) for v in box) or box[2] <= 0 or box[3] <= 0:
                        raise UnsupportedSvg("Invalid viewBox")
                    mapping = se.Viewbox.viewbox_transform(
                        x, y, w, h, *box, attributes.get("preserveAspectRatio", "xMidYMid meet")
                    )
                    matrix = se.Matrix(mapping) * matrix
                    viewport = (box[2], box[3])
                else:
                    matrix = se.Matrix(f"translate({x},{y})") * matrix
                    viewport = (w, h)
            for child in element:
                visit(child, group, clips, matrix, viewport, presentation)
            composite_layer(group, opacity)
            return
        if tag not in SHAPE_CONSTRUCTORS:
            raise UnsupportedSvg(f"Unsupported render element: {tag}")
        if presentation.get("visibility") in {"hidden", "collapse"}:
            return
        properties = {**attributes, **presentation}
        properties.pop("transform", None)
        properties.pop("style", None)
        properties.pop("opacity", None)
        if any(str(properties.get(name, "")).startswith("url(") for name in ("fill", "stroke")):
            raise UnsupportedSvg("Referenced paints require separate normalization")
        for key in ("x", "x1", "x2", "cx", "width", "rx", "y", "y1", "y2", "cy", "height", "ry", "r", "stroke-width"):
            if key in properties:
                relative = viewport[1] if key in {"y", "y1", "y2", "cy", "height", "ry"} else viewport[0]
                if key in {"r", "stroke-width"}:
                    relative = math.hypot(*viewport) / math.sqrt(2)
                properties[key] = length(properties[key], relative)
        if (
            shape_cache is not None
            and sum(len(key) + (len(value) if isinstance(value, str) else 0) for key, value in properties.items())
            <= MAX_CACHED_SHAPE_CHARS
        ):
            element_shape, cached_base = shape_cache(tag, tuple(properties.items()))
            # Clipping and stroke expansion operate on a frame-local path.
            base = pathops.Path(cached_base)
        else:
            element_shape = SHAPE_CONSTRUCTORS[tag](properties)
            base = vector_path(element_shape)
        group = ET.SubElement(parent, f"{{{NS}}}g")
        if element.get("id"):
            group.set("id", element.get("id"))

        def paint(path, color, alpha):
            if color is None or color.value is None or alpha <= 0:
                return
            path = path.transform(matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f)
            for boundary in clips:
                try:
                    path = pathops.op(path, boundary, pathops.PathOp.INTERSECTION)
                except pathops.UnsupportedVerbError:
                    if pathops.PathVerb.CONIC not in path.verbs:
                        raise
                    # Round stroke caps can contain conics that PathOps cannot reorient.
                    path.convertConicsToQuads()
                    path = pathops.op(path, boundary, pathops.PathOp.INTERSECTION)
            if not path.verbs:
                return
            ET.SubElement(
                group,
                f"{{{NS}}}path",
                {
                    "d": svg_data(path),
                    "fill": f"#{color.red:02x}{color.green:02x}{color.blue:02x}",
                    "fill-opacity": str(alpha * color.opacity),
                    "stroke": "none",
                    "fill-rule": "evenodd" if path.fillType == pathops.FillType.EVEN_ODD else "nonzero",
                },
            )

        # svgelements already folds fill/stroke-opacity into each Color alpha.
        paint(base, element_shape.fill, 1)
        if element_shape.stroke.value is not None and element_shape.stroke_width > 0:
            stroke = pathops.Path(base)
            caps = {
                "butt": pathops.LineCap.BUTT_CAP,
                "round": pathops.LineCap.ROUND_CAP,
                "square": pathops.LineCap.SQUARE_CAP,
            }
            joins = {
                "miter": pathops.LineJoin.MITER_JOIN,
                "round": pathops.LineJoin.ROUND_JOIN,
                "bevel": pathops.LineJoin.BEVEL_JOIN,
            }
            dash = properties.get("stroke-dasharray", "none")
            dash_array = None
            if dash != "none":
                import re

                try:
                    dash_array = [float(v) for v in re.split(r"[\s,]+", dash.strip())]
                except ValueError:
                    raise UnsupportedSvg("Dash sizes must be numeric project units")
                if not dash_array or any(not math.isfinite(v) or v < 0 for v in dash_array):
                    raise UnsupportedSvg("Dash sizes must be finite and nonnegative")
                if not any(dash_array):
                    dash_array = None
                elif len(dash_array) % 2:
                    dash_array *= 2
            stroke.stroke(
                float(element_shape.stroke_width),
                caps[properties.get("stroke-linecap", "butt")],
                joins[properties.get("stroke-linejoin", "miter")],
                float(properties.get("stroke-miterlimit", 4)),
                dash_array=dash_array,
            )
            paint(stroke, element_shape.stroke, 1)
        composite_layer(group, opacity)

    visit(tree, output, [], se.Matrix(), (width, height), {"fill": "black", "stroke": "none"})
    return ET.tostring(output, encoding="unicode")
