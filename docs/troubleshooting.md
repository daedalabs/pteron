# Troubleshooting

- **LaTeX / Math Rendering**: Pteron compiles equations in-process via MathJax without needing an external TeX toolchain. For legacy MiKTeX development fallback, run `npm run setup:tex` if you explicitly require system LaTeX.
- **Python / Renderer issues**: Run `uv sync --python 3.12` to ensure the renderer virtual environment matches the pinned Python 3.12 and Manim dependencies.
- **Browser executable missing**: Install Microsoft Edge or Google Chrome, set `PTERON_BROWSER` to your browser executable, or run `npx playwright install chromium`.
- **Feasibility probe failures**: Inspect `artifacts/feasibility-report.json`.
- **SVG ID preservation**: Use `loadProjectSvg` and `saveProjectSvg` from the identity adapter (`src/editor/svg-adapter.js`) rather than calling raw svgcanvas load/save directly.
- **Nested clipping or vector rendering differences**: Compare `artifacts/browser-clipping.png` and `artifacts/manim-clipping.png`. Pteron normalizes nested viewports and isolated group opacity to derived vector paths without mutating authored SVG sources.
- **Desktop launch in development**: Run `npm run dev` for live UI hot-reloading with Fast Refresh and auto-restart recovery, or `npm start` for a standard production build and launch.
