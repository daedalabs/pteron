# Narration, captions and export

Pteron supports uploaded audio, subtitle editing, cumulative SRT import/export, synchronized playback, and narrated MP4 video export. Standalone releases bundle the necessary codecs and rendering tools with zero external runtime dependencies. Nested solid-color group and fill/stroke opacity use vector compositing to guarantee fidelity without rasterization. See implementation-status.md and examples/README.md for architectural details and verification.

Uploaded WAV/MP3 can be placed on the overall timeline. Its source stays in the project once; screen views use source offsets and clipped durations. Existing per-screen narration remains supported. User-configured compatible speech remains a separate planned connection; it is not required for uploaded audio.

Open **Narration → Narration settings** to set the volume or mute narration for the whole project. The setting applies to playback and MP4 export, including legacy scene-local audio. It is saved in the project and supports undo and redo. Existing projects start at 100% and unmuted. Muted and zero-volume exports contain video only. Audio sources, timing and captions are preserved.

The same dialog sets one caption style for the project. Choose Arial, Georgia or Consolas, then Regular, Bold or Italic. Set the size from 60% to 160% and choose None, Fade, Rise or Pop for the entrance. Entrances last about 180 ms and shorten for brief cues. A caption that crosses a scene boundary keeps its original entrance timing. Projects without caption settings use Arial Bold at 100% with no entrance. Existing caption settings without a font style keep Bold. The app uses Windows fonts and the same vector layout and frame sampling for styled preview and MP4. If the local renderer is unavailable, the editor can still show editable captions using browser text. SRT carries cue text and timing.

Store keys using Windows-backed encryption outside project packages; do not expose them through MCP. Replacing audio preserves artwork/motion and flags cues requiring review. Speech output does not imply word timestamps.

Create editable caption blocks from scripts with clearly marked draft timing. Include manual correction and SRT import. Export local MP4, optional burned-in captions and a combined SRT using cumulative scene offsets. Jobs expose status/progress/cancellation. Render-tool absence must not prevent editing.

Provider terms remain applicable even with user-provided credentials. No particular paid voice provider is selected. The reference experiment's edge-tts is not a confirmed commercial integration.

Sources: https://developers.openai.com/api/reference/resources/audio/subresources/speech/methods/create and https://www.electronjs.org/docs/latest/api/safe-storage

Narration edits the selected caption only. Caption blocks live in the timeline, with a single compact In/Out row for exact editing. Add caption uses the playhead, moving past a cue occupying that frame, and creates an editable draft on the overall clock. Import SRT replaces the caption track atomically; malformed files preserve the prior track. Cross-screen cues appear as clipped fragments in screen views and export once at their original overall time. The legacy narration-script command stores text only and does not generate speech.

The desktop calls the overall timeline **Main** and individual sections **Scenes**. Main retains continuous audio/caption lanes; local scene views show their exact clipped slices. Both silent and narrated exports normalize encoded packet timestamps and durations to the authoritative integer-frame clock after Manim concatenation. Silent exports retain video only. `npm run test:scenes -- --render` checks 180 frames at exactly 30 fps, matching source-final/destination-first geometry within one project pixel. Existing narration and overall-media acceptance remains applicable.

Video encoding uses H.264 CRF 12 to retain sampled SVG color fidelity. This increases file size relative to the former encoder default. Both silent and narrated output retain the shared frame-clock normalization. Unsupported SVG features still fail explicitly while preserving the project.

Within each export, identical sampled SVGs are normalized once. Frames with identical normalized SVG share one Manim render and one encoded segment. The output still contains every frame at its original position on the project clock, including repeated holds.

Distinct frames can also share local shape conversion through a bounded normalization cache. Each frame applies its own transforms, clipping, stroke expansion, and opacity composition to the cached geometry.

Export reads normalized paths directly in document order and uses Manim's path and paint conversion. The normalizer has already resolved viewports, transforms, and inherited paint, so the importer can skip general SVG document parsing and per-ID lookup groups.

The Cairo importer keeps a bounded cache of converted path points for the current export. Each frame receives its own copy of the points and applies its own paint.

For frames up to 1920 × 1080 pixels in area, Manim can encode one segment while preparing the next. Larger frames use a single encoder to limit memory use. Segment assembly follows the project frame order.

## Basic source trimming and draft export

Overall narration retains its original embedded audio. `timeline.audio.trim` sets source-in and duration in integer frames, checks the original source bounds and recompiles scene slices. The Narration inspector exposes these as seconds; volume/mute remain in narration settings. Trimming flags local cues for review rather than silently retiming their meaning. Undo restores the original timing. This remains basic animation support, without an audio mixer.

Normal Export keeps final CRF 12. File also offers draft MP4 at CRF 23, with the same dimensions, sampled motion and exact frame clock. MCP render accepts optional `quality`, defaulting to `final`. Export completion copies into a temporary sibling, syncs it and renames it over the destination only after success; an interrupted or failed copy preserves an existing destination. Elapsed/estimated remaining time appears in the progress tooltip.
