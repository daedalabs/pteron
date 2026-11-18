# Development workflows and skill plan

Portable builds use the project's uv environment by default. Set `PTERON_BUILD_PYTHON` to the path of a working Python 3.12 executable to use it for packaging and the host-side `test:portable` verifier. The executable must be able to import the project's pinned dependencies, including PyInstaller for packaging. The portable smoke test launches the app with only Windows system tools on PATH and decodes separate MP4s for Regular, Bold and Italic captions.

Source launches, unit tests, feasibility and authoring tools share the Python runtime selection documented below.

If Windows allows MiKTeX's `pdflatex.exe` but blocks `dvisvgm.exe`, the source app supports a local PDF-to-SVG backend. Install the optional PyMuPDF 1.26.7 dependency into the ignored `.tools/pteron-pdf-vector` directory and restart Pteron. The source app then runs pdfLaTeX with shell escape and automatic package installation disabled. It converts glyphs and rules into editable SVG paths. PyMuPDF is a local development dependency under AGPL or commercial terms and is excluded from the portable dependency set.

```powershell
uv pip install --python .tools/python/cpython-3.12-windows-x86_64-none/python.exe --target .tools/pteron-pdf-vector --only-binary ':all:' --no-deps PyMuPDF==1.26.7
npm start
```

After building, `npm run test:project-settings -- --latex` compiles an equation through the desktop, verifies that a failed recompile preserves its paths, and exports and decodes the same project with styled captions and narration.

`npm run test:application-menu` (after `npm run build`) exercises the themed/native menus, palette and keyboard navigation, Save As/cancellation/failure, saved-content undo/redo, text-input history, artwork commands, panel/zoom/fullscreen view state, scene navigation, missing recent files, offline help and real MP4 export progress/staleness. It verifies every output timestamp, frame count/FPS/dimensions and desktop/exact-800×560 content layout. Native window resizing is also exercised; explicit viewport sizing avoids treating Windows fractional-DPI rounding as artwork geometry error. Artifacts are under `artifacts/application-menu`. Unit coverage for saved-content status, recent persistence/recovery and action availability is in `tests/application-menu.test.ts`.

`npm run test:animation-authoring-ui` exercises the single contextual add/edit marker button, optional naming/clearing without duplicates, keyboard activation, Main frame projection and snapping, multi-clip gestures and commands, visual path/pivot controls, replacement picking, continuity badges/overrides/source navigation, stdio MCP batching across scenes, shared undo and compact layout. Its asynchronous assertions explicitly await state predicates instead of treating unresolved promises as success.

`npm run test:animation-authoring-render` compares sampled Write on/Erase, child Stagger, Smooth match, crossfade, explicit movement/pivot, named equation matching/highlighting and nested group/fill/stroke opacity with Chromium. It compares original color interiors separately from an opaque vector matte of the renderer's derived geometry, preserving the one-project-pixel contour and exact-frame-clock requirements while excluding antialias/compression fringes. Artifacts are under `artifacts/animation-authoring-render`. Run `npm run build` first. Baseline unit/feasibility and existing scene/media/workspace regressions remain required.

`npm run test:scenes` (after `npm run build`) covers Scenes/Main scope, local/project clocks, exact cross-scene seek and clip selection, collapse without mutations, real stdio MCP propagation with manual undo/redo, independence/relinking, canvas gestures and carrying artwork into an existing scene. Add `-- --render` to compare a 180-frame MP4 with Chromium at the source final frame and destination first frame, within one project pixel and on the exact integer-frame clock. The silent export also verifies that segment timestamp rounding is normalized without adding an audio stream. Unit coverage is in `tests/scene-continuity.test.ts` and `tests/test_worker.py`.

`npm run test:editor-workflow` verifies the first canvas draw, no-selection canvas properties, background undo/redo and stdio MCP edits, tool shortcuts, motion field spacing, and clip selection retention. Add `-- --render` to verify canvas background/rectangle export color, placement within one project pixel, and the exact output frame clock. Use `-- --packaged --render` against a freshly rebuilt standalone candidate.

The specialist-workflow and implementation-order sections below define the development and verification workflows for Pteron. These workflows are provider-neutral instructions: AGENTS.md supplies repository-wide rules, while this document defines the specialist work needed to maintain and extend the product. Any coding assistant or human developer can follow the same inputs, steps, and acceptance criteria without requiring a particular skill format or runtime.

## UI stack decision

Use React and TypeScript with Tailwind CSS through its Vite integration, plus shadcn/ui using Radix-based primitives. Pin exact compatible versions when scaffolding the desktop application. The desktop uses the pinned dependencies in package.json and local primitives in src/components/ui.

Use local shadcn component source for buttons, inputs, menus, dialogs, tooltips, tabs, sliders, collapsibles, scroll areas, and resizable panels. Build canvas handles, the layer tree, preset previews, and timeline clips as product components. Keep primitive components in src/components/ui, product components in their feature folders, and theme tokens in a shared stylesheet. Support readable contrast, keyboard navigation, visible focus, compact controls, and adjustable panels. Avoid conveying state through color alone.

Isolate the authored SVG surface from Tailwind Preflight and inherited UI typography/color rules. Verify that theme changes cannot alter artwork or exported geometry. Reduced-motion preferences govern interface decoration, while explicit project playback remains user controlled.

References: [Tailwind with Vite](https://tailwindcss.com/docs/installation/using-vite), [shadcn/ui](https://ui.shadcn.com/docs), [Radix primitives](https://www.radix-ui.com/primitives/docs/overview/introduction).

## Specialist workflows to prepare

Each row is a candidate reusable skill. Keep its canonical instructions in ordinary Markdown in this repository. An assistant-specific SKILL.md or other integration may reference those instructions, but is optional. Do not require a provider-specific CLI or subscription. Create detailed workflows as each subsystem starts, using verified repository commands rather than invented commands.

| Workflow | Responsibilities | Required evidence |
| --- | --- | --- |
| Desktop foundation | Electron main/preload/renderer boundaries, typed IPC, process lifecycle, dependency discovery | App launches on Windows; renderer cannot invoke arbitrary processes; editor works with rendering tools absent |
| UI and design system | Tailwind setup, shadcn components, theme tokens, keyboard/focus behavior, panel layouts | Usable workspace at common desktop sizes; SVG isolated from UI styles; accessible dialogs and controls |
| Project commands and persistence | Versioned types, validated commands, stale-revision rejection, history, atomic package save, recovery | Manual and external commands share state; save/reopen retains identities; interrupted saves preserve recovery; recovery browsing rotates snapshots with bounds |
| SVG editor integration | One active editing surface, tools/layers, nested imports, transforms, continuity, unsupported-feature diagnostics | Repeated imports and save/reopen retain supported geometry and references; replacement retains group motion |
| Motion and timeline | Preset definitions, easing, repetition, per-object clips, snapping, conflict validation, sampled plans | Independent timings; integer-frame behavior; preview/export agreement within specified tolerance |
| Equations | Fixed LaTeX template, vector geometry, diagnostics, term identity and correspondence | Valid equations share preview/export geometry; invalid source retains the last valid result |
| Rendering and media | Python worker protocol, Manim plans, FFmpeg, jobs, cancellation, cache revisions | Render progress/cancellation; stale drafts identified; MP4 dimensions/timing correct; failures preserve work |
| Narration and captions | Configurable speech endpoint, audio upload, credential protection, script captions, SRT | Workflow succeeds without speech credentials; no assumed word timestamps; audio replacement flags cue conflicts |
| MCP integration | Local stdio tools, shared command access, schema validation, artifact/job references, activity visibility | External edits appear in UI and undo history; stale edits rejected; secrets excluded; full manual fallback |
| Acceptance and distribution | Playwright workflows, geometry/timing fixtures, examples, Windows packaging, license inventory | Payment/equation examples completed; recovery tested; installer and notices reviewed |

## Original implementation order

1. Finish remaining feasibility checks: saved project continuity, equation term correspondence, preview/export timing, and a small MCP round trip. A minimal shared command/persistence slice is necessary for these checks.
2. Scaffold Electron/React/TypeScript, Tailwind, and shadcn/ui. Establish theme tokens, the workspace layout, and the typed process boundary. Preserve the existing probe harness.
3. Implement project commands/history and a usable screens/artwork/layers slice, with persistence and equivalent MCP operations. Start recovery here and expand it as media is added.
4. Implement the shared motion evaluator, all presets, timeline editing, and equations. Verify varied sizes, groups, durations, and frame alignment.
5. Complete audio, speech, captions, rendering/export, recovery, and connection/activity controls.
6. Complete acceptance examples, toolchain setup UX, dependency/license audit, and Windows packaging.

For each slice, read the corresponding product documentation, identify invariants, implement the smallest complete user workflow, exercise its command interface, run relevant checks, and document the actual result and remaining limitations. Existing probes are regression evidence, not substitutes for desktop acceptance.

## Provider portability

Application users bring their own external AI client through MCP; the editor does not depend on which model runs that client. Development agents use this repository's Markdown instructions and normal shell/test commands. These are separate concerns. Neither requires an OpenAI SDK, a specific AI model, or a proprietary agent framework.

## Development mode

Run `npm run dev` for the live Electron development app at `http://127.0.0.1:5173`. It builds worker/MCP assets once, then serves the interface through Vite. React Fast Refresh updates components while normally preserving UI state; CSS updates immediately. Editor iframe reloads restore authoritative artwork. Changes to the Electron main process, shared command code or preload rebuild those bundles and restart Electron; the latest saved recovery project is restored, while temporary UI selection/playback resets. Build errors remain visible in the terminal and do not trigger a restart.

Development uses a separate `pteron-dev` user-data directory. Help provides Developer tools (Ctrl+Shift+I), Reload and Force Reload; Electron development bundles include source maps. Close the app or press Ctrl+C in the terminal to stop the app, watchers and Vite. Port 5173 must be free. Python worker changes require running the relevant worker again; the development launcher watches the TypeScript Electron bundles.

`npm start` remains the built, file-based application. Packaged applications ignore the development-server environment setting. The inline-script and WebSocket CSP allowances needed for React Refresh/Vite apply only when serving through Vite; production HTML keeps its existing policy. Privileged operations still use the isolated Electron preload and validated IPC.

Run `npm run test:dev` to exercise real React/CSS refresh, canvas reload and main/preload restart recovery. This test briefly edits and restores source files; run it without another development session or concurrent source edits.

Development navigation permits same-origin entry-page reloads required by Vite dependency updates and full-refresh fallback. Other origins and non-entry paths remain blocked. With `npm run dev` running, `node scripts/dev-reload-test.mjs` verifies reload, project retention and navigation restrictions in a separate test profile.

Blank development windows: the desktop now displays a loading message while renderer modules initialize, a browser-only message when the Electron bridge is missing, and an actionable error/reload screen when workspace loading fails. The interface error boundary also catches React render failures. A browser visit to the Vite URL is not a standalone editor; use the Electron window launched by `npm run dev`.

If the optional fullscreen state lookup fails, the editor keeps its last known fullscreen state. A connection failure during startup appears on the workspace error screen.

The launcher warms the interface and canvas modules before opening Electron. Set `PTERON_DEV_PORT` to use a separate loopback port (default 5173). `npm run dev:status` queries the running default development profile for renderer readiness, desktop-bridge presence, workspace/tool presence and development errors without editing the project. With a development server running, `npm run test:startup` verifies both working desktop startup and visible browser/IPC failure screens in a separate test profile.

The development launcher starts Electron as a visible GUI process and explicitly shows/focuses its window when ready. `dev:status` includes native window visibility, minimized/focused state, and bridge/workspace readiness so the running desktop can be distinguished from a browser-only Vite page.

## Source Python and authoring tools

After `uv sync --python 3.12`, runtime discovery does not invoke uv or depend on a system Python. `electron/python-runtime.mjs` is shared by the desktop worker and `node scripts/python.mjs`. Selection is:

1. `PTERON_PYTHON`, when explicitly configured. A missing configured executable fails clearly rather than silently selecting another runtime.
2. The newest local `.tools/python/cpython-3.12[.patch]-windows-x86_64-none/python.exe`, when project `.venv/Lib/site-packages` dependencies exist.
3. `.venv/Scripts/python.exe`.

The project root and available project site-packages are added to the child process PYTHONPATH. Optional `.tools/pteron-pdf-vector` remains a source-only backend. The environment change is child-local. Packaged apps require their bundled worker and never fall back to source Python. Windows Application Control may block an interpreter; select an allowed Python 3.12 with `PTERON_PYTHON` rather than weakening machine policy.

Run Python tools with `npm run python -- scripts/<name>.py` or `npm run python -- -m <module>`. The three voice generators share `scripts/video_narration.py`; Edge speech is imported only when generation is explicitly requested. Existing uploaded/generated audio can be prepared offline. Preparation validates all word boundaries, retains the connected audio clock and rejects durations that would cut audible speech. Binary search keeps its explicit 720-frame duration; other examples round up to the next frame.

The example creators share `scripts/video-lettering.ts` and the app's worker runtime. Their render entry points share `scripts/render-video.ts`: isolated Electron profile, frame-total check, real export, scene screenshots, job failure/timeout handling and guaranteed app cleanup. `scripts/video_verification.py` supplies exact timestamp/format checks and the one-pixel geometry neighborhood. Algorithm-specific reveal, result, narration and browser/export checks remain in each example's verifier.

After `npm run build`, run `npm run test:video-authoring` for actual lettering, editable-package roundtrip, Electron export and decoded frame-clock acceptance in a separate artifact/profile directory. This does not overwrite delivered example projects.

## Export benchmarks

```powershell
npm run benchmark:export
npm run benchmark:export -- --frames 1440 --width 720 --height 1280 --output artifacts/export-benchmark-long
npm run benchmark:export -- --baseline artifacts/export-benchmark/report.json --output artifacts/export-benchmark-comparison
```

The default workload is 360 frames at 320×180 and 24 fps for each of three cases: one held frame, alternating positions, and moving geometry. Each case runs in a fresh Python process. `seconds` measures normalization/rendering/muxing; `processSeconds` also includes interpreter imports, fixture preparation and decoding. `peakWorkingSetBytes` includes imports and rendering in the worker process, and excludes Electron and encoder subprocesses. It is sampled before verification and represents the OS process peak, not a summed application-memory figure.

Every output frame is decoded and checked for exact timestamps, dimensions, frame rate, count and geometry within one project pixel. Failed runs exit nonzero and do not produce a success report. Reports/videos stay under ignored artifacts. Comparison requires identical workload settings and reports measured time/memory ratios; it does not infer an improvement without a baseline. For meaningful comparisons, use the same machine, dependencies and background workload. Synthetic holds are useful for cache regressions but do not replace full-project export acceptance.

## Simple authoring acceptance

After `npm run build`, run `npm run test:simple-authoring` for saved shapes/motion, aspect locking, native canvas key nudges, timing fit/boundaries, narration trim and undo, recent colors, multi-version recovery browser preview/restore, draft export, real stdio MCP edits and manual undo. Its asynchronous predicates are evaluated and awaited explicitly rather than treating an unresolved promise as a successful condition. It captures desktop, 800×560 and recovery screenshots under `artifacts/simple-authoring-ui`.

Use `npm run test:application-menu`, `npm run test:animation-authoring-ui`, `npm run test:scenes`, `npm run test:sequence-timeline`, `npm run test:narration-playback`, `npm run test:shapes`, `npm run test:panels`, `npm run test:multi-selection` and `npm run test:workspace` for the surrounding workflows. `npm run test:animation-authoring-render` retains its one-project-pixel geometry and exact-frame-clock gate. Source changes do not automatically update old portable executables.

`npm run test:shape-usability` verifies snapping and Alt bypass, constrained drawing and paint memory, exact export issue navigation, native text conversion and real MP4 output, selected-range looping, continuity preview/apply, and desktop/800×560 layouts. Five browser text-outline comparisons enforce the existing one-project-pixel contour tolerance. `test:portable -- --self-contained` also converts text in the packaged app using the shared command while network access and development runtime paths are unavailable.
