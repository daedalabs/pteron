# Motion and component timing

The shared evaluator implements the preset catalog, including vector tracing for Write on/Erase, staggered child reveals, explicit object replacements and named equation-term correspondence. Preview, continuity and export consume the same integer-frame poses. Full property-keyframe editing remains deferred.

Write on traces strokes progressively; filled artwork traces its outline and fills during the final fifth of the reveal. Erase reverses that treatment. Sources stay editable. Tracing requires vector shapes or compiled equation glyphs; editable text must be converted before tracing/export. Stagger requires a group, reveals its direct children in SVG order, and exposes frame spacing; its overall duration must leave at least one frame per reveal.

Smooth match accepts either a replacement target or an explicit move path. Targets are matched to authored bounding geometry through a compiled affine transform; the source transfers to the receiving object at the end with a short crossfade. Crossfade replacement uses complementary source/receiver opacity. Match terms requires two equation groups with corresponding named terms; matched source terms move to their targets while the equation replacement crossfades. Highlight terms affects only the selected named terms and restores their authored paints at the endpoint. These are object/term correspondence operations, not unrestricted path morphing or symbolic algebra.

Position clips can store `from`, `to` and optional quadratic `control` points as offsets in the selected object's parent coordinate system. `pivot` is an absolute point in that same parent system. The canvas overlay displays these in project coordinates, accounts for nested viewports, and commits one command on release or keyboard nudge. Cancelled gestures retain the prior project. Numeric endpoint controls and Reset pivot are available in Motion.

Timeline Snap uses an eight-screen-pixel magnet radius for the playhead, clip edges, captions, markers with optional names and scene boundaries. Alt bypasses snapping. Ctrl/Cmd/Shift-click selects several clips. Shift, Trim, Duplicate clips, Stagger and Delete clips operate on the selection in one validated transaction; dragging a selected clip moves the selection, and dragging its end trims all selected clips by the same frame delta. Main maps these edits to their original scene/object identities. Invalid overlaps, ranges or negative starts reject the entire edit.

| Category | Presets |
| --- | --- |
| Entrance | Fade, Rise, Slide, Pop, Zoom, Drift, Spin, Write on, Stagger |
| Exit | Fade out, Sink, Slide out, Shrink, Zoom out, Drift out, Spin out, Erase |
| Emphasis | Pulse, Press, Bounce, Wiggle, Shake, Rock, Rotate, Color highlight, Outline highlight |
| Object transition | Smooth match, Crossfade replacement |
| Equation | Match terms, Highlight terms |

Each preset needs deliberate easing, overshoot/settling where appropriate, and concise relevant controls: direction, intensity, easing, repetitions and stagger. Direction variants are settings, not additional presets. Press is visual compression/release, not application logic.

Each component has a track with independently draggable/resizable clips and exact start/duration/end fields. Sequence effects, overlap across components, and snap to frames/playhead/boundaries/cues. Store integer frames, display seconds. Repeat count splits total clip duration into cycles.

Playback and MP4 export reuse the compiled motion evaluator across frames in each scene. Export builds it from the job's captured project revision and discards it after sampling that scene. Playback samples only when the integer project frame changes, even when the display refreshes more often than the project FPS.

Reject incompatible same-property overlaps. Support defined combinations such as movement plus relative pulse and normal parent/child transforms. Automatic continuity creates explicit editable clips at the beginning of the destination screen, without narration overlap.

Defaults: entrance/exit 0.4s, emphasis 0.6s, object transition 0.5s, stagger spacing 0.1s. Screens begin at 3s and extend to contain narration plus a short tail or the latest clip. Explicit shorter durations report conflicts instead of truncating content.

Validate all presets across object/group sizes and durations. Test preview/export agreement within one output frame and one project pixel for supported geometry. A full keyframe editor is deferred.

The single bookmark toolbar button adds a marker at an empty playhead frame and changes to Edit marker when that frame already contains one. The editor opens that marker directly for optional naming, frame changes or deletion, without adding duplicates. Adding and saving retain the marker position on the playhead. Batch move, trim, stagger, copy and delete use icon buttons with hover titles and accessible names.
