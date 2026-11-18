# Simple authoring

Pteron remains a shape-animation workbench. These controls extend the existing editor and shared command layer; they do not introduce a separate asset editor, mixer or keyframe system.

## Working controls

| Task | Controls |
| --- | --- |
| Draw and edit | Existing rectangle, ellipse, line/path, text and equation tools; property geometry, transforms, stroke/corner controls and undo |
| Precision | Geometry proportion lock for rectangles/ellipses; selection proportion lock; arrow-key nudge in the canvas, one project pixel or ten with Shift |
| Arrange | Existing grouping, ungrouping, duplication, alignment, distribution, Boolean paths, ordering, visibility and locking |
| Appearance | Existing fill/stroke/alpha controls; eight recent colors retained as machine-local preferences |
| Motion | Existing catalog previews, easing, directions, repetitions, visual endpoints/curve/pivot and per-shape timing |
| Multiple shapes | Apply independent common presets to a selection in one transaction; target-dependent and group/term presets remain contextual |
| Reuse artwork | Saved shapes disclosure in Properties; name and capture a selection, insert independent editable copies, delete a saved entry |
| Reuse motion | Saved motion disclosure in Motion; capture a scalar preset configuration and apply it at the playhead to one or more shapes |
| Navigate timing | Previous/next timing boundary, fit timeline and zoom to selected clips beside the existing snap/marker/batch controls |
| Scenes | Existing add/duplicate/reorder/delete, Scenes/Main clocks, continuity links, independence and overrides |
| Preview | Existing frame scrubbing, scene looping, replay, cached per-scene evaluator and authored-state restoration |
| Narration | Existing waveform, overall-clock imports, volume/mute and captions; source-in and duration trim fields in Narration |
| Recovery | Activity's recovery icon opens the multi-version recovery browser (rotation of autosave and before-replace snapshots, relative/absolute timestamps, reason badges, artwork preview, inline confirmation for restore/delete) |
| Export | Normal Export retains final H.264 CRF 12; File includes draft CRF 23. Dimensions, motion sampling and exact frame clock are unchanged |
| Export safety | Elapsed/estimated remaining time appears in the running export tooltip; successful output replaces the destination atomically |
| Learning | Existing editable sample, searchable offline help, command palette, shortcut hints and compact tooltips |

Icon actions retain accessible names. No extra explanatory paragraphs are placed in the workspace. Names and timing values remain text. Saved libraries default collapsed and have bounded scrolling.

## Shared commands and persistence

- `asset.capture`: screenId, objectIds, assetId, name. Retains source SVG, captured clips/lifetimes, equations and source FPS. Both replacement objects must be included when a clip references another object.
- `asset.insert`: screenId, assetId. Assigns fresh object/clip/span/equation identities through the existing paste path. Existing saved sources remain unchanged. Clips/lifetimes are retimed to the receiving project FPS.
- `asset.delete`: assetId. Removes only the library entry; already inserted artwork remains editable.
- `motionPreset.capture`: screenId, clipId, presetId, name. Captures duration, preset, intensity, direction, repetitions, easing and optional stagger spacing. Clips with paths, pivots, replacement targets or equation-term selections reject explicitly.
- `motionPreset.apply`: screenId, objectIds, presetId, start. Preserves seconds across FPS changes, creates fresh clip identities and validates the entire selection atomically.
- `motion.apply`: screenId, objectIds, start, settings. Applies common independent preset settings in one command. Existing conflict, visibility and lock rules still apply.
- `motionPreset.delete`: presetId. Removes the saved setting without deleting authored clips.
- `object.nudge`: screenId, objectIds, x, y. Deltas are project pixels and are converted through each selected root's parent transform.
- `timeline.audio.trim`: sourceStart, duration. Both are integer frames. The original embedded media is retained; source duration bounds prevent overrun. Slices, waveform positions and export source offsets use the same trim. Local cues are flagged for review. Existing packages acquire source bounds on their first trim.
- `recovery.info`: read-only operation returning availability and preview metadata. Restoration uses `recover` and the current revision (optionally specifying an `id` for versioned restore). Recovery browsing is a local desktop feature outside MCP; rotation maintains up to 20 snapshots and 7 days under a 512 MiB ceiling.
- `render`: optional quality `draft` or `final`; final is the default for existing manual/MCP callers.

All mutations use shared revisions, undo/redo and autosave. Optional project `assets` and `motionPresets` collections are capped at 100 entries each. Existing packages without these fields still load; older strict-schema builds may reject newly saved packages containing them. Libraries travel with the project, not in an external service account. Recent colors remain outside project packages.

## Verification

`npm run test:simple-authoring` runs actual Electron and stdio MCP acceptance at desktop and 800×560 sizes. It exercises aspect lock, keyboard nudge, saved shapes/motion, timeline navigation/zoom without revisions, MCP deletion followed by manual undo, recent colors, source trimming/undo and multi-version recovery browser preview/restore. Screenshots/report are under `artifacts/simple-authoring-ui`.

`tests/simple-authoring.test.ts` covers package roundtrips, fresh identities, FPS-preserving reuse, atomic conflict/lock rejection, trim bounds, exact timing boundaries, failed-copy destination preservation, read-only recovery metadata and versioned recovery restoration with undo. Existing unit, scene, narration, menu and browser/export fidelity suites remain applicable. Final and draft encoding both retain integer-frame order and rate.

## Limits

Native SVG text still requires vector conversion before export; a general native-text outline command is not implemented in this pass. Existing equation/lettering workers produce editable vectors, and unsupported artwork still fails explicitly. Saved shapes are project-owned copies rather than live linked symbols; custom motion settings deliberately exclude object-specific mappings. Basic narration trimming does not add fades, effects or an audio mixer.

Draft export changes compression quality, not project geometry or timing. Remaining-time estimates use current progress and may vary by render stage. Recovery browsing is a local desktop feature (maintaining a 20-snapshot, 7-day, 512 MiB rotation of autosaves and pre-replace states outside the project package); MCP retains latest-recovery inspection. No installer, clean-machine release certification or completed license audit is implied. Existing unsigned candidates must be rebuilt and audited before public distribution.

## Shape authoring refinements

- Hold Shift while drawing to constrain rectangles and ellipses; new shapes reuse the last selected supported fill and stroke.
- Canvas snapping aligns edges and centers to other artwork and the artboard, and offers equal gaps. The magnet toggles it; Alt bypasses it for a drag. Guides disappear on release. Snapped gestures use the same command history and undo as other edits.
- New motion clips request size-aware duration and intensity defaults, capped by scene length. Existing clips and the shared evaluator remain unchanged. `motion.defaults` exposes these recommendations to MCP.
- Playback keeps the playhead visible. Select clips and use the loop icon to repeat their timing range. Playback and looping do not edit the project.
- Follow previous scene first shows current and proposed artwork. Apply uses the preview revision; stale previews cannot overwrite subsequent edits. `command.preview` validates edits without writing history, recovery or the current project.
- The text inspector converts simple labels to editable paths, keeping object identity, styling, placement and motion targets. Arial, Georgia, Consolas and Segoe UI regular/bold/italic variants use installed Windows font files. Spans, missing glyphs, unsupported fonts and layout features produce explicit errors; conversion is undoable.
- Failed exports expose a navigation action when a scene or shape can be identified. It selects the affected authored object at the failing frame. Unsupported artwork remains editable.
- Export uses a square icon button with a tooltip and accessible label; progress retains the same footprint.

Run `npm run test:shape-usability` after building for the real Electron workflow and browser text-outline fidelity comparisons. Evidence is written under `artifacts/shape-usability`.
