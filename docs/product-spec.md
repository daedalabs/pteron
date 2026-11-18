# Product specification

This is the consolidated product specification for Pteron, outlining its core design requirements, architecture constraints, and roadmap capabilities.

## Identity and constraints

- A custom, approachable visual editor with polished, easily configurable motion. Manim is internal; users do not need Python or engine terminology.
- GitHub repository names follow lower-kebab-case. This is not a product-brand capitalization rule.
- Windows desktop, local rendering, Electron/React/TypeScript, SVG-Edit engine adapter, local Python/Manim worker. No Penpot fork.
- Tailwind CSS and shadcn/ui with Radix-based primitives provide the custom interface. Use shared theme tokens and accessible reusable controls; keep canvas/timeline interactions purpose-built and artwork independent of UI styling.
- Repository development instructions and specialist workflows are provider-neutral Markdown. No particular AI model, agent platform, or provider SDK is required to contribute or operate the manual application.
- Strict SVG artwork workspace with editable nested SVG imports, groups, paths, text, transforms, colors, solid fills/strokes, and layers. Unsupported features must be reported without silent flattening or loss.
- Mathematical/technical explanation, including editable LaTeX equations. Function plots and parameter-driven geometry are later roadmap items.
- Default resolution 1080 x 1920; choose width/height at project creation and use the same dimensions across every screen. Project settings can resize the canvas without scaling artwork and change the integer frame rate from 1 to 120 fps (default 30). Frame-rate changes preserve timing in seconds to the nearest output frame through one validated, undoable command.
- Sequential scenes with Add, duplicate/delete and reorder controls. Objects remain editable. Scene length follows authored timing endpoints. Main shows the full video with collapsible scene sections and continuous audio/caption lanes. Selecting a scene opens its local timeline with its start and current position on the project clock visible.
- Complete manual workflow with optional external MCP access to every stage. Built-in animation-AI chat is deferred. AI clients bring their own model access.
- Uploaded audio and SRT can use the overall project clock, with clipped views per screen. Audio and captions have dedicated timeline lanes. Speech connections remain user-configurable; uploaded media requires no provider account.
- Motion references serve as animation and timing benchmarks, not reusable generic artwork or a dependency environment. Color styling and caption formatting are fully user-configurable.

## Application menus

Provide themed File, Edit, Scene, View, Playback and Help menus with native window controls, a searchable command palette, local recent projects, Save As, accurate save status, keyboard-shortcut documentation and visible export progress. Menus reflect selection/history availability; text editing retains normal keyboard behavior. Menu actions and MCP use the same validated project commands. See workspace.md for implemented controls.

## Editor and timing

Markers are one-click timing points with optional names. Compact actions use icons with hover titles and accessible names; timing values, authored names and categorical menu labels retain text.

Drawing includes shapes, Bézier editing, text, transforms, groups, fills/strokes, alignment, snapping, layer ordering, visibility/locking, and undo/redo. Adding a scene carries surviving objects from the previous final pose with live continuity links. Inherited properties follow upstream edits; destination overrides and local motion remain local. Objects can continue into an existing next scene, become independent, and follow the previous scene again through shared commands. Use one active editor with SVG previews of inactive artboards. Reusable nested compositions/precomps remain outside this scope.

Ship the 30 presets listed in motion.md, with visual previews and designed defaults. Every component has draggable/resizable animation clips and exact numeric timing. Components may be individual objects, groups, or equations. Same-property conflicts are rejected; intentional relative emphasis plus movement is supported. Preset motion also supports explicit start/end offsets, a quadratic path control and a visual rotation pivot. Full property-keyframe editing is deferred.

## Project, preview, and recovery

Versioned project types cover screens, artwork/instances, equations/terms, clips, narration/captions/cues, revisions, and render jobs. Separate artwork from motion metadata. Local .pteron packages include sources/media, exclude credentials/caches, and use atomic saves, autosave and recovery.

One motion compiler supplies interactive SVG preview and sampled local Manim export. Editing pauses playback and restores authored state. Draft previews are cached by revision and identified when stale. Render/export jobs provide progress, cancellation, and actionable diagnostics. Editor use does not depend on the render toolchain being available.

## Acceptance and milestones

1. Establish SVG editability, stable IDs, save/reopen, LaTeX compilation, preview/render fidelity, and manual/MCP interoperability. Comprehensive regression suites enforce identity, clipping, TeX, timing, and project-package guarantees. Stop and report new required fidelity failures.
2. Build artwork/screens/layers, continuity, timeline and shared operations.
3. Build 30 presets, previews, timing validation, equations and deliberate motion polish.
4. Build speech/audio/captions, export jobs, autosave/recovery and Windows packaging.
5. Reproduce the payment explanation with user-created artwork and an equation example; test replacing an illustration, changing one press into two, and revising narration.

Acceptance requires independent component timing, custom dimensions throughout, nested SVG save/import/render fidelity, manual/MCP handoff and undo, retained group-level motion after artwork replacement, and usable failure/cancellation recovery. Supported preview/export placement must agree within one project pixel and timing within one output frame, excluding raster antialiasing differences.

Unit tests cover commands, timing, presets, identity and history; UI tests cover editing/timeline workflows; integration tests cover SVG/equations and rendering. The current probes are a gate, not a complete acceptance suite.

Defer hosted collaboration, physics, unrestricted morphing, 3D, Figma parity, and built-in animation chat. Audit exact dependency/font/TeX/encoder licenses before distributing installers. Include third-party notices.

## Simplified shape-animation scope

The primary loop is draw, animate, adjust and export. Extend the existing workspace rather than adding permanent panels or unrelated editing systems. Compact actions use the existing icon vocabulary, hover titles, accessible names, visible focus and native keyboard behavior. Names, numeric values, category labels and menu entries remain readable text. Explanations belong in tooltips, offline help and actionable diagnostics rather than paragraphs in the working canvas or inspector.

Project-owned saved shapes retain editable sources and captured timing. Saved motion settings retain their source FPS and apply at the current frame, preserving seconds when used at another FPS. Multi-shape applications commit once or reject entirely. Object-specific replacement targets, paths, pivots and equation-term mappings are not silently reused as generic presets.

Retain the implemented drawing, grouping, alignment, distribution, layer ordering, locking, visual motion paths, pivots, continuity, waveform display and marker workflows. Additions remain contextual or collapsed. Narration supports the animation workflow through import, volume/mute and source trimming; a full mixer, hosted AI chat, compositing system, graph editor and unrestricted nested compositions remain outside this scope.

See [simple authoring](simple-authoring.md) for implemented controls, verification and explicit limits.

Shape authoring uses temporary edge/center/equal-gap snap guides with Alt bypass and remembered drawing paint. Selected clip ranges can loop during playback. Relinking continuity offers a read-only preview before applying. Explicit text-to-path conversion preserves identity and undo; unsupported font/layout features are reported. Export diagnostics can navigate to the affected authored shape. Export is a square icon control with accessible status and progress.
