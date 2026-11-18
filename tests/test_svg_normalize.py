import sys
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path
from unittest.mock import patch

import pathops
import svgelements as se

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from renderer.svg_normalize import UnsupportedSvg, create_shape_cache, normalize_svg, svg_data, vector_path


def source(body):
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">{body}</svg>'


def bounds(xml):
    svg = se.SVG.parse(__import__("io").StringIO(xml))
    shapes = [shape for shape in svg.elements() if isinstance(shape, se.Shape)]
    if not shapes:
        return None
    boxes = [shape.bbox() for shape in shapes]
    return (min(b[0] for b in boxes), min(b[1] for b in boxes), max(b[2] for b in boxes), max(b[3] for b in boxes))


class NormalizeTests(unittest.TestCase):
    def test_distinct_frames_reuse_local_shape_before_transform_and_clipping(self) -> None:
        shape = '<path d="M5 5Q25 0 35 20H5Z" fill-rule="evenodd" stroke="red" stroke-width="3"/>'
        frames = [
            source(f'<svg x="{x}" width="30" height="40"><g transform="translate({shift})">{shape}</g></svg>')
            for x, shift in ((10, 0), (45, 8), (80, -3))
        ]
        expected = [normalize_svg(frame) for frame in frames]
        self.assertEqual(len(set(expected)), len(frames))
        shape_cache = create_shape_cache()
        with patch("renderer.svg_normalize.vector_path", wraps=vector_path) as convert:
            actual = [normalize_svg(frame, shape_cache=shape_cache) for frame in frames]
            self.assertEqual(convert.call_count, 1)
        self.assertEqual(actual, expected)

    def test_quadratic_control_runs_serialize_as_explicit_svg_segments(self):
        path = pathops.Path()
        pen = path.getPen()
        pen.moveTo((0, 0))
        pen.qCurveTo((10, 20), (20, 20), (30, 0))
        pen.closePath()
        data = svg_data(path)
        parsed = se.Path(data)
        self.assertEqual(sum(isinstance(segment, se.QuadraticBezier) for segment in parsed), 2)
        rebuilt = vector_path(parsed)
        self.assertAlmostEqual(path.area, rebuilt.area, places=5)
        self.assertEqual(path.bounds, rebuilt.bounds)

    def test_curved_stroke_normalizes_to_complete_parseable_svg(self):
        result = normalize_svg(
            source('<ellipse cx="100" cy="80" rx="60" ry="30" fill="none" stroke="red" stroke-width="10"/>')
        )
        box = bounds(result)
        for actual, expected in zip(box, (35, 45, 165, 115)):
            self.assertAlmostEqual(actual, expected, places=2)

    def test_dashed_stroke_has_vector_gaps(self):
        xml = source('<path d="M 10 20 H 110" fill="none" stroke="red" stroke-width="4" stroke-dasharray="10 10"/>')
        result = normalize_svg(xml)
        self.assertEqual(bounds(result), (10, 18, 100, 22))
        self.assertNotIn("stroke-dasharray", result)

    def test_round_dashed_curve_clips_as_vector_geometry(self) -> None:
        xml = source(
            '<svg x="20" y="30" width="90" height="100"><path id="dashed" '
            'd="M8 86C21 15 47 8 58 46S79 104 105 19" fill="none" stroke="#7561a0" '
            'stroke-width="7" stroke-linecap="round" stroke-dasharray="10 5"/></svg>'
        )
        result = normalize_svg(xml)
        self.assertIn('id="dashed"', result)
        self.assertNotIn("stroke-dasharray", result)
        self.assertAlmostEqual(bounds(result)[2], 110, places=4)
        self.assertEqual(normalize_svg(xml, shape_cache=create_shape_cache()), result)

    def test_nested_intersection_and_no_source_mutation(self):
        xml = source(
            '<svg x="20" y="30" width="40" height="40" viewBox="0 0 20 20"><g id="target"><rect x="15" y="15" width="20" height="20" fill="red"/></g></svg>'
        )
        before = xml
        normalized = normalize_svg(xml)
        self.assertEqual(bounds(normalized), (50, 60, 60, 70))
        self.assertIn('id="target"', normalized)
        self.assertEqual(xml, before)
        self.assertNotIn("<image", normalized)

    def test_visible_overflow_is_preserved(self):
        xml = source(
            '<svg width="40" height="40" overflow="visible"><rect x="30" y="30" width="40" height="40"/></svg>'
        )
        self.assertEqual(bounds(normalize_svg(xml)), (30, 30, 70, 70))

    def test_root_viewbox_and_custom_dimensions(self):
        xml = '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400" viewBox="0 0 200 100"><rect x="10" y="20" width="30" height="40"/></svg>'
        result = normalize_svg(xml)
        self.assertEqual(bounds(result), (40, 80, 160, 240))
        self.assertEqual(float(ET.fromstring(result).get("width")), 800)

    def test_rotated_viewport(self):
        xml = source(
            '<g transform="translate(100,0) rotate(90)"><svg width="40" height="40"><rect x="30" y="30" width="40" height="40"/></svg></g>'
        )
        result = bounds(normalize_svg(xml))
        for actual, expected in zip(result, (60, 30, 70, 40)):
            self.assertAlmostEqual(actual, expected, places=4)

    def test_nonuniform_transformed_stroke(self):
        xml = source(
            '<g transform="scale(2,3)"><svg width="40" height="40"><path d="M 10 20 L 60 20" fill="none" stroke="red" stroke-width="10"/></svg></g>'
        )
        self.assertEqual(bounds(normalize_svg(xml)), (20, 45, 80, 75))

    def test_group_transform(self):
        xml = source(
            '<g transform="translate(10,20)"><svg x="20" y="30" width="40" height="40" viewBox="0 0 20 20"><rect x="15" y="15" width="20" height="20"/></svg></g>'
        )
        self.assertEqual(bounds(normalize_svg(xml)), (60, 80, 70, 90))

    def test_nested_viewports_intersect(self):
        xml = source(
            '<svg x="10" y="10" width="40" height="40"><svg x="20" y="20" width="40" height="40"><rect width="80" height="80"/></svg></svg>'
        )
        self.assertEqual(bounds(normalize_svg(xml)), (30, 30, 50, 50))

    def test_stroke_expanded_before_clipping(self):
        xml = source(
            '<svg width="40" height="40"><path d="M 10 20 L 60 20" fill="none" stroke="red" stroke-width="10"/></svg>'
        )
        self.assertEqual(bounds(normalize_svg(xml)), (10, 15, 40, 25))
        self.assertTrue(
            all(
                element.get("stroke") == "none"
                for element in ET.fromstring(normalize_svg(xml)).iter()
                if element.tag.endswith("path")
            )
        )

    def test_outside_and_zero_viewports_are_empty(self):
        for width in (0, 40):
            xml = source(f'<svg width="{width}" height="40"><rect x="90" y="90" width="10" height="10"/></svg>')
            self.assertIsNone(bounds(normalize_svg(xml)))

    def test_opacity_composition(self):
        xml = source('<g opacity="0.5"><rect width="20" height="20" fill="red" fill-opacity="0.5"/></g>')
        paths = [e for e in ET.fromstring(normalize_svg(xml)).iter() if e.tag.endswith("path")]
        self.assertAlmostEqual(float(paths[0].get("fill-opacity")), 0.25, delta=1 / 255)

    def test_unsupported_features_are_explicit(self):
        for body in (
            "<mask/>",
            '<rect width="5" height="5" clip-path="url(#clip)"/>',
            '<image href="thing.png"/>',
            '<rect width="5" height="5" fill="url(#missing)"/>',
        ):
            with self.assertRaises(UnsupportedSvg):
                normalize_svg(source(body))

    def test_overlapping_group_opacity_is_an_isolated_vector_layer(self):
        xml = source(
            '<g id="layer" opacity="0.5"><rect id="a" width="40" height="40" fill="red"/><rect id="b" x="20" width="40" height="40" fill="blue"/></g>'
        )
        result = normalize_svg(xml)
        paths = [node for node in ET.fromstring(result).iter() if node.tag.endswith("path")]
        self.assertEqual(len(paths), 2)
        self.assertTrue(all(float(node.get("fill-opacity")) == 0.5 for node in paths))
        self.assertAlmostEqual(sum(abs(vector_path(se.Path(node.attrib)).area) for node in paths), 2400)
        self.assertIn('id="a"', result)
        self.assertIn('id="b"', result)
        self.assertNotIn("<image", result)

    def test_shape_fill_and_stroke_opacity_is_applied_once(self):
        result = normalize_svg(
            source(
                '<rect x="20" y="20" width="40" height="40" fill="red" stroke="blue" stroke-width="10" opacity="0.4"/>'
            )
        )
        paths = [node for node in ET.fromstring(result).iter() if node.tag.endswith("path")]
        self.assertTrue(all(abs(float(node.get("fill-opacity")) - 0.4) < 1e-6 for node in paths))
        self.assertAlmostEqual(sum(abs(vector_path(se.Path(node.attrib)).area) for node in paths), 2500, places=3)


if __name__ == "__main__":
    unittest.main()
