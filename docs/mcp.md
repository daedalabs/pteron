# MCP interface

## Connect and inspect

Open Pteron and copy the client configuration from **File → Activity and MCP**. The configuration includes the connection descriptor path for that desktop profile, including development or custom profiles. It contains no connection token. If a client cannot connect, open the intended Pteron instance and copy its configuration again.

Start with `project.summary` (no arguments) to get the current revision, dimensions, FPS, dirty state, undo/redo counts, total frames, and ordered scenes with their IDs and project-clock frame ranges. Scene end frames are exclusive. The summary includes clip and caption counts and omits SVG and embedded media. Use `objects` with a scene ID to find editable object IDs, or `state` when you need the complete project.

`tools/list` advertises the arguments for each tool. The adapter rejects invalid or unknown arguments before sending a request to the desktop. Use the revision from `project.summary` or `state` for edits that require it. After a stale-revision error, read the current state before deciding whether to retry.

## Smaller responses

Use `project.summary` for the revision and scene IDs, then call `objects` with `{screenId, response:"compact"}` to get a layer tree with names, IDs, types, and applicable state flags. When you need full properties for one object, call `objects` with `{screenId, objectId}`.

MCP `command`, `open`, `recover`, and `srt.import` default to returning `{revision}`, ready to use on the next edit. Pass `response:"full"` when you need the resulting project.

`command.preview` and `objects` default to full results. Compact `command.preview` returns `{baseRevision, proposedRevision}` after validation. Use the base revision to commit the edit. Compact responses use the same validation and history as full responses.

## Timing, paths and equation correspondence

- `{type:"clips.batch",items:[{screenId,clipId},...],action,frames}` accepts `move`, `trim`, `duplicate`, `stagger` or `delete`. `frames` is a signed delta for move/trim/duplicate, nonnegative spacing for stagger, and unused for delete. Selection order is sorted by project start time for stagger. Duplicates receive fresh clip IDs. Every edit validates and commits all affected scenes in one revision/history entry, or leaves the project unchanged.
- `{type:"timeline.marker.put",marker:{id,frame,label?}}` and `{type:"timeline.marker.delete",markerId}` edit the overall narration clock. Omit `label` or pass an empty string for an unnamed marker. Names are optional and may be cleared without changing identity. Markers retime with project FPS and persist in packages/recovery. Legacy `cue.put` accepts an optional label; `cue.delete` removes a scene-local cue.
- `{type:"equation.terms",screenId,equationId,terms:{name:objectId,...}}` names editable descendant glyphs/groups for Match terms and Highlight terms.
- `clip.put` accepts optional `from`, `to`, `control` and `pivot` points, `stagger` spacing, `targetObjectId` and selected `terms`. Path points are parent-space offsets; the pivot is an absolute parent-space point. Target matrices are compiled by the command layer, not trusted from the caller. Crossfade/term replacements require a target; Smooth match requires a target or endpoints. Invalid term correspondence, hierarchy, timing and same-property conflicts reject atomically.
- Read-only `motion.geometry` accepts screenId/objectId and returns geometric bounds, parent matrix and natural pivot. `continuity.info` accepts the same IDs and returns the source scene/root and names of local property overrides. These methods are available through the desktop bridge and stdio tools.

## Scene continuity

The interface calls screens **Scenes** and the combined timeline **Main**. Existing schema-v1 `screens`, `screen.*`, `screenId` and object identities remain compatible; Main is a projection of that same state.

- `{type:"object.unlink",screenId,objectIds:[...]}` makes the selected top-level object/group and its descendants independent, retaining artwork and motion.
- `{type:"object.continue",screenId,objectIds:[...]}` carries selected source roots into the existing next scene at the source's final visible pose, with the same object IDs and live links.
- `{type:"object.link",screenId,sourceScreenId,objectIds:[...]}` resets the selected artwork from an earlier scene's final pose and reconnects its links. Compatible destination clips remain attached; extra local children or incompatible shared viewports reject the command.

All require the current revision and commit atomically through `command`. Upstream artwork/motion/timing edits propagate linked inherited properties in the same undo entry. Destination overrides stay local. Delete/reorder operations detach invalid links and retain destination artwork. Source reparenting, shared independent definitions/viewports, and equation replacements that would remove locally timed terms reject without changing project/history. New scene creation continues to use `screen.add`.

Canvas background uses `command` with `{type:"canvas.background",screenId,color:"#112233"}` and the expected revision. Color must be a six-digit hex value. It is one undoable edit and saves a vector background in the screen SVG; `objects` excludes it from editable layer lists. Project resizing also resizes this background. Old packages without an explicit background continue to show the default white canvas backing.

## Overall timeline operations

`srt.import` accepts an absolute UTF-8 SRT path (or source text), plus the expected revision. It parses the overall project clock and atomically replaces captions; invalid files leave state/history unchanged. `srt` exports each overall cue once, while retaining cumulative offsets for legacy screen-local cues.

`render` uses the supplied output path. Only one export can run at a time across the desktop and MCP, including while the desktop Save dialog is open.

`{type:"narration.mix",mix:{volume:40,muted:false}}` sets the project-wide narration mix for playback and MP4 export. Volume is an integer percentage from 0 to 100. Older project files without a mix play at 100% and unmuted.

`{type:"narration.settings",style:{font:"Georgia",variant:"Italic",size:125,entrance:"Pop"}}` changes the project-wide caption style in one undoable edit. Fonts are Arial, Georgia and Consolas. Variants are Regular, Bold and Italic. Omit `variant` to use Bold. Size is an integer percentage from 60 to 160. Entrances are None, Fade, Rise and Pop. An optional `mix` updates narration audio in the same edit.

Shared commands include `timeline.caption.put`, `timeline.caption.delete`, `timeline.captions.import`, and `timeline.caption.promote` (move an existing local cue onto the overall clock). `timeline.audio.attach` stores a source media ID, start and duration in frames; `timeline.audio.move` moves that source. Desktop `audio.import` accepts `timeline:true` and an overall start frame. These operations project exact local caption/audio slices when screen boundaries change. Screen-local edits to a projected caption update its overall source.

Timing edits derive screen lengths from authored layer/media endpoints. `screen.update` can still set an explicit baseline hold for older clients; the desktop instead exposes layer timing. `durationBase`, overall media and slice offsets retime with project FPS. Undo/recovery retain source IDs and slicing metadata.

A stdio adapter connects to the running desktop command service through a local capability-protected pipe. See implementation-status.md for setup, tools, and acceptance evidence. Supported tools and protocols are detailed below.

Ship stdio transport with copyable client configuration and visible connection/activity controls. Using MCP is optional. UI and MCP operate on the same editable state, validations, revisions and undo/redo history.

Screen drag/drop uses `command` with `{type:"screen.reorder", screenId, index}` plus the expected revision. `index` is the final zero-based position. The operation validates bounds, retains screen/content identity and is one undo step; context-menu earlier/later operations retain `screen.move`.

Required coverage: project/open/save, ordered screens, SVG objects/layers, LaTeX source/terms, preset discovery, clips/timing, narration/audio/captions/cues, previews, jobs/render/export/cancel, and recovery. Return structured state, stable IDs, revision numbers, diagnostics and artifact references. Reject stale mutations; never expose provider secrets. Long operations return job IDs.

`npm run test:desktop` launches the real stdio adapter with the copied client configuration in a custom profile, reads the project summary, edits artwork through MCP, and reverses the edit with desktop Undo.

For the single-file build, set `PTERON_PORTABLE_EXE` to the executable and run `npm run test:portable -- --mcp`. This exercises the Copy MCP client config button and launches the packaged adapter with the resulting configuration.

Sources: https://modelcontextprotocol.io/specification/2025-11-25/server/tools and https://modelcontextprotocol.io/specification/2025-11-25/basic/transports

equation.compile accepts optional equationId to recompile an existing source-linked shape, preserving its object identity and animation references. Failed compilation keeps its last valid vectors and reports diagnostics.


Layer operations use the same `command` entry point: `{type:"object.copy"|"object.cut"|"object.duplicate"|"object.group",screenId,objectIds:[...]}` and `{type:"object.paste",screenId}` with the expected revision. Copy updates the shared in-memory artwork clipboard without a project revision or undo entry. Other operations validate and commit atomically. `state.clipboardAvailable` indicates whether paste is available. Clipboard contents are not saved in project packages.


Project format changes use `command` with `{type:"project.settings",width,height,fps}` and the expected revision. Width/height are integers from 16 to 8192, FPS is an integer from 1 to 120. All three fields are required. The update is atomic and undoable, retains object identities and coordinates, and retimes frame data to preserve seconds. Rounding conflicts and unsupported root viewBoxes reject the update without modifying work. `presets` returns durations at the current project FPS. Stroke alpha uses `object.edit` with `attributes:{"stroke-opacity":"0.4"}`; fill/stroke/object alpha edits require a numeric value from 0 to 1, or null to inherit.


Multi-layer commands share the same revision/history path:

- `object.editMany`: screenId, objectIds, attributes (shared appearance only).
- `object.transformSelection`: screenId, objectIds and optional x, y, width, height in project coordinates.
- `object.alignSelection`: screenId, objectIds, action (`left`, `center`, `right`, `top`, `middle`, `bottom`, `distribute-x`, `distribute-y`).
- `object.ungroup` / `object.deleteMany`: screenId and objectIds.
- `object.boolean`: screenId, objectIds, operation (`combine`, `union`, `subtract`, `intersect`, `exclude`).

`selection.info` is read-only and accepts screenId/objectIds. It returns shared effective appearance (null means Mixed), geometric bounds, lock state and a geometry diagnostic when measurement is unsupported. Shape operations reject unsupported semantics and animation/reference loss atomically. Rectangle stroke sides use `object.edit` with `attributes:{"data-stroke-edges":"top"}`; use a comma-separated subset of top/right/bottom/left, an empty string for none, or null for all four.

## Simple authoring

Saved artwork, reusable motion, bulk presets, nudging and narration trims use the `command` tool with the current revision. `recovery.info` inspects recovery metadata without mutating the project; `recover` restores the latest recovery snapshot or a chosen revision; multi-version recovery browsing is a local desktop feature and not exposed over MCP. `render` accepts optional `quality: "draft" | "final"`. See [command fields and package limits](simple-authoring.md#shared-commands-and-persistence).

`command.preview` accepts the same `{revision, command}` payload as `command` and returns `{project, baseRevision}` without changing the live document, history or recovery. Apply the same command with that revision to commit it. `motion.defaults` accepts `{screenId, objectIds, preset}` and returns size-aware `{duration, intensity}` recommendations. `object.outline` is a shared command for supported native text labels; unsupported fonts/layouts reject the entire edit.
