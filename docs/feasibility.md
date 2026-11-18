# Feasibility gate

Checked 2026-10-23 on Windows with SVG-Edit svgcanvas 7.4.2, Manim Community 0.22.0, and Python 3.12.12. Run `npm run test:unit` and `npm run test:feasibility` from the project root to reproduce.

## Verified results

All 11 vector-normalization unit tests and all 14 browser/renderer checks pass.

| Check | Result |
| --- | --- |
| Edit children inside nested SVG artwork | Passed |
| Preserve object identities over repeated save/reopen cycles | Passed through the identity adapter |
| Remap internal references and isolate repeated imports | Passed |
| Preserve explicit nested viewport overflow | Passed |
| Reject malformed SVG | Passed |
| Retain named group lookup in Manim | Passed |
| Match nested viewBox placement and scale | Passed |
| Match browser nested viewport clipping | Passed through vector normalization |
| Compile a LaTeX equation through Manim | Passed using project-local MiKTeX / MathJax |

## Implemented architecture

`src/editor/svg-adapter.js` assigns permanent project identities, carries them through SVG-Edit normalization, restores canonical IDs, and rewrites internal references. Save/reopen cycles preserve identities and references. A fresh import gets a separate identity namespace.

`renderer/svg_normalize.py` derives vector paths for rendering while preserving the editable source. It resolves nested viewport placement, expands strokes, and intersects geometry with viewport boundaries. The clipping fixture matches the browser's visible 20 x 20 region exactly: pixel bounds `[220,160,239,179]`. Transforms, deeper viewports, explicit visible overflow, stroke boundaries, isolated group opacity composition, and custom dimensions have unit coverage.

Manim's SVG coordinate reflection is normalized to the intended `(x,-y)` screen convention before comparison.

## Verification evidence

`artifacts/feasibility-report.json` combines the 14 baseline checks. `editor-roundtrip.svg`, `normalized-clipped.svg`, `browser-clipping.png`, and `manim-clipping.png` provide geometric comparison evidence.

Subsequent verification gates (motion fidelity, vector layer compositing for overlapping group opacity, package roundtrip, and MCP shared commands) are implemented in the full regression test suite (`npm run test:unit`, `npm run test:feasibility`, and `npm run test:desktop`). Run `npm run test:motion-fidelity` to verify exact 1-pixel frame placement and timing across animation presets.
