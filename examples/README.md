# Small idea, big motion

Choose **Files → Open sample project**, or open `small-idea.pteron`. Play follows six scenes from a seed to a garden, with original narration and captions. The 1080 × 1920 project runs for 445 frames at 30 fps (14.833 seconds).

Spark introduces a seed with entrance, emphasis and exit clips. Build assembles independently timed parts. Rhythm staggers three separate beats. Together combines a moving parent flower with rotating petals and an independently pulsing center. Story connects three scene tiles. Bloom brings the parts into a garden.

All artwork is editable SVG geometry, including the vector lettering. Expand Flower in Layers or the timeline to select its children. Choose a clip to edit Start and Duration in seconds; commands and storage use integer frames. Captions remain text-editable in Narration. WAV files are included in the project; no speech service or account is required.

`npm run example:create` rebuilds the package through the shared command layer using original geometry, script and committed WAV files in `media/`. Caption/title paths are generated with the existing local renderer. Narration uses Microsoft Ava Multilingual Neural, generated through Microsoft Edge speech with edge-tts (a development-only tool, not an app dependency). Playback and project regeneration use the committed WAVs offline and have no sibling-project dependency. Provider output terms remain part of the unfinished release audit. The artwork and script are original project assets. Lettering uses Arial glyph outlines through the existing Pango pipeline; the font itself is not bundled.

`npm run test:example` checks actual drawing/undo, playback, desktop and 800×560 layouts, save/open identity and media preservation, and full export. `npm run test:standalone` repeats this against the bundled executable and adds stdio MCP checks with only Windows tools on PATH. Video checks require 445 frames, exact 30 fps, full dimensions, audible narration and captions in all six sampled scenes. Reports and UI captures are under `artifacts/example/`.

The portable candidate is `artifacts/standalone/pteron-0.1.0-full-portable.exe`. It remains unsigned; the offline TeX equation runtime is included and the public-release license audit is unfinished. The existing overlapping-group Fade compositing limitation remains unresolved. This showcase uses supported scale/position/rotation animation on groups.

Narration is one connected performance on a single overall audio track, without inserted silence or decoder-source reloads between scenes. Lossless scene WAV slices are retained for verification. Its conversational script continues across scene boundaries. Captions transcribe every spoken word verbatim in natural phrases; start/end frames come from speech word-boundary metadata in `media/narration.json`. The pteron wordmark is absent from the artwork. Component clips scale to the scene length on integer frames.

Optional voice regeneration uses `scripts/generate-showcase-voice.py` with edge-tts 7.3.1 in an isolated development environment, then the project Python runs `scripts/prepare-showcase-narration.py` to write WAVs and timed transcript metadata. Normal `example:create` uses committed offline assets.
