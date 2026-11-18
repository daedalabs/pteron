# Implementation status and roadmap

Current architecture status for Pteron v0.1.0. The core desktop editor, SVG artwork engine, motion timeline, and video export pipeline are fully functional.

## Simplified authoring follow-up

The source workspace adds collapsed project-owned saved-shape and motion libraries, atomic multi-shape preset application, rectangle/ellipse and selection proportion locks, one/ten-project-pixel canvas nudges, eight recent colors, timing-boundary/fit/selection-zoom icons, source-preserving narration trims, read-only recovery preview and draft/final export quality. Export tooltips include elapsed/estimated remaining time; final output replacement is atomic and package encoding enforces the same size bounds as reopening. Manual and MCP edits continue through the same validated command/history path.

The interface remains icon-first, with accessible names, hover titles and existing shared tokens. No new permanent panel, built-in chat, mixer or graph editor was added. Current authored SVG styles, object identities and TypeScript motion sampling remain separate from UI styling. See [simple authoring](simple-authoring.md) for controls, command fields, acceptance evidence and explicit limitations.

Verification: 110 TypeScript tests, 34 Python tests, build/typecheck, full SVG feasibility, real simple-authoring UI/MCP/draft-export acceptance, surrounding menu/scene/media/shape/panel/workspace suites and the renderer fidelity gate pass. Screenshots at desktop and 800×560 plus recovery preview were inspected.

This is a source-development update. A multi-version recovery browser is implemented (rotation of autosaves and before-replace snapshots under userData/recoveries, read-only preview and inline confirmation for restore/delete). The bundled editable sample/help remain the primary learning path.

## Working application paths

- Electron/React desktop with an isolated SVG-Edit canvas, editable nested vector artwork, layers, shape controls, alignment and Boolean operations. Interface styles do not restyle authored artwork.
- Multi-version recovery browser with bounded rotation (up to 20 versions, 7 days, 512 MiB ceiling) under userData/recoveries, content-hash deduplication, autosave throttling, before-replace safety snapshots for open/recover/create, read-only metadata listing and preview, inline double-confirmation for restore and delete, and full undo/redo support.
- Scenes and Main timeline, integer-frame clips, timeline snapping, optional marker names, batch clip edits, visual motion paths and pivots. The contextual marker button adds at an empty frame and edits an existing marker without duplicating it.
- Scene continuity follows the previous final pose, preserves destination overrides, and supports independence, relinking and continuation through shared commands.
- All catalog presets have shared preview/export semantics, including vector Write on/Erase, child Stagger, affine Smooth match, complementary Crossfade replacement and named equation-term correspondence/highlighting. Matching is not unrestricted path morphing or symbolic algebra.
- Source-linked equations compile to editable vectors. Failed recompilation retains the last valid artwork. The optional local PDF-to-SVG development backend is excluded from portable dependencies.
- Uploaded audio, overall-clock audio/caption lanes, SRT import/export, synchronized playback and narrated MP4 export. Overall audio remains continuous across scene boundaries. Speech generation is external development tooling; editing and rendering uploaded audio require no provider account.
- One validated command layer for manual editing and stdio MCP, shared revisions and undo/redo, atomic project packages, autosave/recovery and saved-content status. Credentials and local connection capabilities stay outside project files.
- File/Edit/Scene/View/Playback/Help menus, command palette, Save As, recent files, offline help, native window controls and export progress/cancellation. Running exports use their captured project revision and report stale results after edits.

## Export behavior and limits

Export samples each scene with the shared TypeScript motion evaluator. Python normalizes geometry and encodes the sampled frames; it does not reimplement easing. Nested isolated group opacity and fill/stroke overlap use vector composition. The former overlapping-group Fade failure is resolved.

Repeated SVGs, normalized frames, local shapes and converted Cairo paths share bounded or export-local caches. Repeated holds reuse encoded segments while retaining every output frame in its original order. H.264 uses CRF 12. Encoder overlap is limited by pixel area. See [narration and export](narration-export.md).

Editable SVG text still requires vector conversion for export/tracing. Unsupported SVG features and excessive composition complexity fail explicitly while preserving sources. Full property-keyframe editing, reusable precompositions, arbitrary path morphing and symbolic algebra are outside the implemented scope.

## Verification

`npm run test:unit` runs TypeScript and Python tests. `npm run test:feasibility` checks browser identity/geometry and actual SVG/TeX compilation. Both use shared local Python discovery rather than requiring uv on PATH after setup. See [development workflows](development-workflows.md) for runtime selection and focused acceptance commands.

The 2026-11-09 pre-change review passed 86 TypeScript tests, 28 Python tests, build/typecheck, application-menu acceptance and 59 browser/renderer samples within one project pixel and on the exact frame clock. The runtime/authoring follow-up passes 87 TypeScript tests, 33 Python tests, full SVG/TeX feasibility, build/typecheck and actual shared-authoring-tool acceptance (lettering, package roundtrip, Electron export, decoded exact frame clock).

`npm run benchmark:export` measures renderer time and peak worker working set in separate processes for repeated holds, alternating frames and distinct frames. It decodes every frame to check dimensions, FPS, timestamps, count and one-pixel placement. This is a synthetic renderer benchmark, not a full desktop export or a release-performance guarantee.

The 1,440-frame, 720×1280, 24 fps workload passed all three cases on 2026-11-09. Held/alternating frames took approximately 6.4/6.0 seconds of renderer time; moving geometry took 46.2 seconds with a 159 MiB peak worker working set. Imports, fixture generation and full decoding add process time, and concurrent checks affect measurements. Reports are under `artifacts/export-benchmark-long`; these measurements establish a local baseline rather than a speedup claim.

## Future Roadmap

- In-app user-configurable speech connections (direct API integrations for cloud TTS providers).
- Continuous property-keyframe value/speed graph editor.
- Dynamic mathematical function plotting ($f(x)$, coordinate grids).
- Reusable pre-compositions (nested scene timelines).
- Commercial code signing certificate for Windows SmartScreen distribution.

Portable and unpacked development builds bundle the renderer, sample media and built-in vector math compiler.

## Shape usability follow-up

Implemented: edge/center/equal-gap canvas snapping with Alt bypass; remembered drawing paint and Shift constraints; size-aware new motion defaults; selected timing range loops and visible playback playhead; read-only continuity preview/apply; supported Windows text-to-path conversion with retained IDs/history; export issue navigation; square icon-only Export. Shared command/MCP access and explicit unsupported font/layout errors are documented in `simple-authoring.md` and `mcp.md`. Source acceptance, browser text fidelity and existing application menu/export checks pass; see `simple-authoring.md` for details.
