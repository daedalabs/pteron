import unittest
from unittest.mock import patch

from renderer.runtime import require_tex_tools


class TexRuntimeTests(unittest.TestCase):
    def test_missing_tools_produce_actionable_error_before_spawning(self) -> None:
        with (
            patch("renderer.runtime.shutil.which", return_value=None),
            self.assertRaisesRegex(RuntimeError, "LaTeX tools not found: latex, dvisvgm"),
        ):
            require_tex_tools()

    def test_both_executables_are_required(self) -> None:
        with (
            patch("renderer.runtime.shutil.which", side_effect=lambda name: "latex.exe" if name == "latex" else None),
            self.assertRaisesRegex(RuntimeError, "LaTeX tools not found: dvisvgm"),
        ):
            require_tex_tools()
        with patch("renderer.runtime.shutil.which", return_value="tool.exe"):
            require_tex_tools()
