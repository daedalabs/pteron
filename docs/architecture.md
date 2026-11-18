# Architecture and project format

## Application chrome and machine-local preferences

A shared action catalog generates the Radix menubar, searchable palette, shortcut reference and native Electron menu/accelerators. Enabled and checked state follows validated renderer context; this is view metadata, not project state. Edit/Scene actions invoke the existing shared command layer. Text edit commands use an allowlisted native Electron edit bridge for the focused text editor, including clipboard paste; focused canvas/timeline zoom, Space and Delete remain with their pane handlers. Keyboard fallback also covers the isolated artwork frame.

Electron owns Save As dialogs, recent-file access, native window controls, diagnostics and fullscreen/developer actions through allowlisted IPC. Recent-project metadata is validated, bounded and atomically stored in user data, outside project packages and stdio MCP. Opening is restricted to a remembered entry or a native file picker. Failed opens/saves preserve the current project and save destination.

ProjectService tracks saved content with a revision-independent hash, so undo to the saved contents clears the dirty indicator. Save captures an immutable project before writing and marks that content as saved only after success; later edits remain dirty. Save As uses this same service operation with a different destination. Export jobs retain their captured revision, report preparation/render/save progress and remain marked stale after subsequent edits. Header/panel preferences never modify authored SVG or render appearance.

## Animation authoring additions

Schema v1 has optional project-clock `timelineMarkers` (ID, integer frame and label, defaulting to an empty string for unnamed markers), optional labels on legacy local cues, and optional clip fields for parent-space path offsets (`from`, `to`, quadratic `control`), absolute parent-space `pivot`, `stagger` frame spacing, a `targetObjectId`, selected semantic `terms`, and derived affine `match`/term `matches`. Old packages continue to load; older strict-schema app builds may reject newly saved packages containing these fields.

Target transforms are compiled in the authoritative command path using the same geometry and Chromium text metrics as selection. The TypeScript evaluator supplies per-object drawing progress, child reveal poses, replacement alpha and term correspondence to the shared browser sampler. Python handles only vector geometry and encoding. Both UI and MCP use `clips.batch`, marker and term commands, including validation, revision checks, recovery and undo.

The normalizer resolves isolated group/shape opacity by partitioning source-over coverage into disjoint vector faces, blending their colors and applying the layer alpha once. It supports nested opacity, overlapping fill/stroke and viewport clipping without rasterizing or modifying authored sources. Derived output retains source identities. A 10000-region bound reports unsupported composition complexity explicitly.

Read-only `motion.geometry` supplies bounds, parent matrix and the natural parent-space pivot. `continuity.info` supplies source identity and local override names. The canvas overlay, snapping preferences and multi-clip selection are view state; gestures publish only through validated application commands.

This document describes the implemented command, state, and rendering boundaries of Pteron. Extended roadmap goals and requirements are outlined in product-spec.md.

The desktop UI uses React/TypeScript, Tailwind CSS through Vite, and locally owned shadcn/ui components with Radix-based primitives. Shared theme tokens style the app shell; artwork is isolated from CSS resets and inherited UI styles. See development-workflows.md for implementation order and provider-neutral specialist workflows. These dependencies are installed and pinned in package.json.

Electron main owns authoritative state, local file access, protected provider credentials and worker processes. React uses validated commands for editing. MCP calls those same commands, revisions and history. Renderer UI must not execute arbitrary Python.

The implemented `src/editor/svg-adapter.js` carries permanent UUID identities in SVG class markers which svgcanvas preserves. It restores canonical DOM IDs after load, remaps href/url references, and preserves explicit viewport overflow through editor sanitization. Fresh imports get disjoint identity namespaces; reopening retains identities. The adapter supplies artwork identity; ProjectService and ProjectStore own validation, revisions and history.

The implemented `renderer/svg_normalize.py` walks the source SVG without modifying it, composes nested viewBox/group transforms, expands strokes locally, and intersects vectors against transformed viewport rectangles using skia-pathops. Its derived paths preserve group/element IDs. These paths are renderer inputs, not replacements for authored source. Unsupported features fail explicitly. No rasterization is used.

Project schema v1 represents project settings, ordered screens, artwork definitions and instances, source equations/terms, motion clips, audio/captions/cues, and revision metadata. Store frame-based times and explicit object references. The .pteron package includes JSON manifest, SVG sources and media. Secrets/cache belong outside the package. The package serializer saves and reopens editable sources/media atomically; recovery uses recovery.pteron plus a bounded, machine-local version rotation (userData/recoveries/) outside the package.

One TypeScript motion definition/evaluator drives SVG playback and produces frame samples for the Python worker. The worker normalizes sampled SVGs into ordered vector paths and renders them with Manim, retaining export-local geometry and repeated-frame caches. Do not independently approximate easing in Python. Job identity includes project revision/settings; stale results cannot replace current previews silently.

Source: https://www.electronjs.org/docs/latest/tutorial/process-model


Project format settings are mutable through `project.settings` (width, height, fps), shared by UI and MCP. Dimensions remain common to all screens; resize changes the outer canvas only and preserves object coordinates, IDs, and nested viewports. Nonstandard root viewBoxes are rejected explicitly rather than silently rescaling artwork. Integer FPS ranges from 1 to 120. Clips, captions, cues and narration durations are retimed in frames while preserving seconds to the nearest frame; invalid rounded overlaps reject the whole command. Preview clocks, preset defaults, SRT, audio probing, render sampling and audio muxing all use the project FPS. The evaluator itself still consumes integer frames and Python does not implement easing.

Optional `timelineCaptions` and `timelineAudio` are overall media sources. Shared commands compile their clipped views into screen captions/narration, with `sourceCaptionId`, `sourceStart`, `offset` and a timeline marker. Validation checks references and exact frame slices. Playback/rendering consume source offsets; files are not physically split. SRT emits each overall cue once. All is a view projection with screen/object maps, not another project store.

Screen `duration` is derived after timing edits. Optional `durationBase` preserves the natural hold of untimed artwork and is retimed with FPS; old packages initialize it from their authored duration when edited. Layer/media endpoints can grow and shrink screen length. Overall media can extend the final screen. These schema-v1 extensions are optional when reading existing files; older strict-schema builds may reject newly saved packages containing the new fields.

## Scenes, Main and continuity

The desktop calls screens **Scenes** and the overall projection **Main**. Schema-v1 `screens`, `screen.*` commands and existing object IDs remain compatible. Main has no separate project state: it maps cumulative integer frames, scene/object/clip IDs and media sources onto the same command layer. Explicit navigation preserves the requested scene-local frame and selected clip rather than resetting them on a scene change.

`Screen.links` maps inherited object IDs to earlier source-scene IDs. After a command derives duration and media slices, `syncContinuity` compares the old and new source final samples from the shared TypeScript evaluator. A three-way SVG merge updates inherited attributes, preserves destination overrides, and cascades in scene order within that command's single revision/undo entry. Canonically equivalent transform matrices remain inherited. Nested viewport coordinates and internal references remain vector data; generated borders are rebuilt, and equation internals can be replaced beneath their stable group.

`object.unlink` detaches a top-level object/group including its children. `object.continue` carries selected object roots to the next scene. `object.link` resets selected artwork to an earlier scene's final pose while keeping compatible local animation clips. Additional local children, incompatible hierarchy/viewport edits and timed equation terms reject changes rather than discard work. Source deletion or a reorder that would create a forward link detaches affected artwork and retains its editable pose. Linked/independent objects sharing a changed viewport or definition must all be made independent first.

Animated text uses main-process Chromium measurements. The command service can request missing measurements and retry an uncommitted transaction; measurements are keyed by text geometry and inherited font attributes, so source/destination text and old/new text sizes cannot accidentally share a stale box. Only a fully validated result is published and persisted.

Marker names are optional in manual editing and the MCP command schema. The MCP adapter generates its JSON schema from command input types so defaulted fields can be omitted. Creating, naming, clearing a name, retiming and deleting markers still use the same revision/history commands. Toolbar icon changes are interface-only and do not restyle authored SVG.

Text-to-path preparation runs in Electron main using fontkit and an allowlist of installed Windows fonts. The shared `object.outline` command receives only derived path data from that trusted callback, retains authored IDs and uses normal validation/history. Callers cannot supply font filesystem paths. `command.preview` dispatches into an isolated ProjectStore, returning a project and base revision without persistence.

The local artwork app disables Chromium HTTP and GPU shader disk caching before ready. Session storage, local preferences and project/recovery paths remain persistent. This avoids startup failures when stale cache files are locked or unwritable; GPU rendering remains enabled. `test:cache-startup` holds exclusive locks on cache fixtures and checks startup logs plus the Export button at desktop and compact sizes. Electron switch reference: https://www.electronjs.org/docs/latest/api/command-line-switches.
