# Workspace controls

## Application menus and project files

The application header contains File, Edit, Scene, View, Playback and Help menus, the project name with the save status beneath it, command search and Export. Double-click the project name or focus it and press Enter to rename. The field starts at the title’s width and grows from the center as needed. Enter or clicking away applies the edit. Escape cancels it. The window is frameless: the header is the drag region, double-clicking its empty area toggles maximize, and the right edge carries application-styled Minimize, Maximize/Restore and Close controls. F10 focuses the first menu. Use arrow keys to navigate or Escape to close it. Alt+F/E/S/V/P/H opens the corresponding menu.

File provides New, Open, Recent projects, Save, Save As, imports for SVG/WAV/MP3/SRT, Export MP4, Project settings and Activity and MCP. Ctrl+Shift+S writes a separate package and makes it the current save destination. The header displays Not saved until a package has a destination, Unsaved changes after content edits, and Saved when content matches the saved version, including after undo. Cancelled/failed saves keep the current destination and editable work. Recent paths are computer-local preferences, outside packages and MCP; moved or missing entries report an actionable error without replacing the project. Manage recent projects can remove entries or open a relocated file.

Edit routes artwork operations through project commands and shared undo, including MCP edits. Text inputs retain their own undo/redo, clipboard and selection behavior. Delete/Backspace in a focused timeline continues to delete selected clips; artwork and text retain their focused deletion behavior. Alignment requires multiple unlocked layers. Scene provides add/duplicate/delete/rename/reorder and continuing artwork into the next scene; unavailable actions are disabled.

View switches Main/Scene timeline, zooms/fits artwork, shows artwork at actual size, toggles Scenes/Layers/Inspector/Timeline panels, resets layout and toggles full screen. These are view operations and do not change project history. Playback provides play/pause, restart in the current timeline scope, frame and marker navigation, and Loop scene. Loop scene holds playback within the scene active when playback starts.

Ctrl+Shift+P opens the searchable command palette. Arrow keys choose enabled results, Enter runs and Escape closes; unavailable results are shown but cannot run. Help contains searchable keyboard shortcuts and offline documentation, the sample project, version information and copyable diagnostics without credentials or MCP capability tokens.

Export opens a Windows Save dialog with an MP4 filename. The initial location is the saved project's folder or Videos for an unsaved project. During export, the button outline fills clockwise from the top center around a centered percentage. Click it for job details or to cancel before the final file write. When Export returns, its icon shows the result. Activity in the File menu keeps the job history. Editing during an export marks its output as an earlier edit because the worker keeps its captured project revision.

## Animation authoring controls

Compact timeline, motion, continuity, narration and export actions use icons with hover titles and accessible names. Timing values, authored names and menu labels remain readable. The timeline no longer keeps a marker-name field or marker-list row open during normal editing.

The timeline toolbar always shows Snap and marker controls. Selecting a clip reveals the selection count and timing actions. The contextual Shift, Trim, Stagger, Duplicate, Delete and Loop actions show short text labels when the window is wide and fall back to their icons and tooltips at the compact width. Ctrl/Cmd/Shift-click clips to select several, then drag a selected clip to move them together or its end to trim all selected durations. Batch frames supplies the signed frame delta for Shift/Trim and nonnegative spacing for Stagger. Duplicate clips places the selected sequence after its own time span with fresh clip IDs. Delete clips and undo/redo use the shared history. Main supports selections across scenes, and clips retain their scene ownership.

The empty Layers panel shows No layers with a short action hint. Motion prompts you to select a layer or group multiple layers before adding a preset. The Narration panel exposes Import audio, Import SRT, Add caption, Copy SRT and Settings as text buttons; Settings opens the project-wide caption font, size and entrance controls alongside narration volume and mute. Press Escape while editing the scene name to discard the rename, or Enter to save it.

At the default compact layout, Layers reserves space for short object names alongside their visibility and lock controls. Motion keeps the basic timing fields and path actions together, with independent scrolling for presets and extended clip settings. Clip Start and Duration stack into one column before six-decimal seconds values can clip; the s/f switch keeps the same edits available as integer frames.

With the playhead focused, Left or Down moves back one frame and Right or Up moves forward one frame. Enter or Space on a focused clip selects it and seeks to its start. Layer selection is announced on the layer button itself.

Snap aligns to the playhead, clip edges, captions, markers and scene boundaries within eight screen pixels. Hold Alt during a drag to bypass it. A single contextual bookmark button adds an unnamed marker when the current frame is empty. At a frame that already has a marker, it changes to Edit marker and opens that marker directly for optional naming, frame changes, saving or deletion. Opening it does not add a duplicate. Click a ruler marker or use Playback → Previous/Next marker to move to another point. Adding and saving keep the playhead at the marker; moving a marker in its editor seeks to its new frame. Existing coincident markers can be selected within the popover. Names can be cleared without deleting the marker. Unnamed markers are identified by frame position in hover text and the list. Project markers retain their overall narration time when scene lengths change; legacy local cues remain scene-relative.

Motion → Edit motion on canvas shows start/end, quadratic curve and rotation-pivot handles outside the authored artwork. Add move path enables endpoint movement on a preset. Drag handles or focus one and use arrow keys; one release/nudge is one undo step. Numeric Start/End X/Y fields use parent-space offsets. Reset pivot restores the object's natural center. Replacement presets expose their receiving object; Smooth match also supports Custom move. Stagger exposes reveal spacing in frames.

Equation Properties → Named terms maps semantic names to editable glyphs or groups. Selecting a glyph preselects it in that editor. Give corresponding terms the same name in both equations, then choose Match terms and a replacement equation. Highlight terms exposes checkboxes for the named terms. Recompilation that would invalidate an active mapping reports a conflict and retains the last valid work; remove the referencing animation before rebuilding and remapping that equation.

Linked Layers have a visible chain badge. Properties shows the source scene, Jump to source scene, independent/follow controls and the names of locally overridden properties. Source navigation changes only the editing view and playhead.

## Scenes and Main

The sidebar now reads **Scenes**, with **Main** above the scene list. Add scene starts from the current scene's final visible artwork and selects the new local timeline. Names are editable as Scene name; duplicate/delete/reorder retain their existing commands and undo behavior. Existing project scene names are preserved.

Main shows the complete video with collapsible scene sections, independently expandable object groups, and continuous audio/caption lanes. Each scene section has an Open scene timeline button. The timeline breadcrumb switches between Main and the active scene. It shows the scene's starting frame and current video frame/seconds while the local ruler remains relative to that scene. Seeking into another scene retains the exact requested frame; selecting a clip retains its inspector selection across that change. Navigation and collapse are view operations and create no project revisions.

Inherited objects show **Follows [scene]** in Properties. Changes upstream update inherited appearance, geometry and final pose through later scenes; properties edited in a destination remain local, as do its animation clips and visibility ranges. Use **Make independent** to stop following. Selecting a nested child offers **Make group independent**, covering its containing top-level group. **Follow previous scene** reconnects matching artwork and resets it to the previous final pose while retaining compatible local animations. Right-click a source layer/group for **Continue into next scene** when a next scene exists. These are each one shared, undoable command, also available through MCP.

Deleting source objects/scenes and reordering a source after its destination retain the destination artwork and detach affected links. Restructuring source artwork across different parents, changing a viewport/definition shared with independent artwork, replacing an equation with locally timed terms, or reconnecting a group with extra local children reports a conflict and preserves the project. Make the affected objects independent before those changes. Continuity does not add reusable compositions or nested timelines.

Run `npm run test:scenes` after `npm run build` for real desktop navigation, stdio MCP continuity, shared undo/redo and compact-layout acceptance. `-- --render` additionally verifies a full MP4 across a scene boundary against Chromium geometry within one project pixel and the exact frame clock. Reports and screenshots are under `artifacts/scenes/`. The following historical notes use the earlier Screens/All vocabulary.

Files in the native window menu contains New project, Open project, Open sample project, Save project and Export MP4. Their shortcuts are Ctrl+N, Ctrl+O, Ctrl+S and Ctrl+Shift+E. Project name, dimensions and frame rate appear in the window title. Rename the project under Files → Project settings. Files → Activity and MCP opens a flat activity view: background jobs, MCP server status and revision with the copy action, command history and a Recovery link into the versioned recovery browser. The native Edit/Undo menu is removed: project Undo/Redo live in the floating canvas toolbar, with Ctrl+Z and Ctrl+Shift+Z/Ctrl+Y also working inside the embedded canvas. Text inputs retain normal text-editing shortcuts.

Choose Text, click the artboard and type. Enter or Escape finishes the edit; clicking another tool also commits it. Text stays an editable SVG object with its own layer, properties and timing. A new project clears the prior package save path so its first Save asks where to write the new package.

The right-edge canvas tool rail uses focusable icon buttons with hover titles for Select, Rectangle, Ellipse, Path, Text, Equation, Snap, Import SVG, Undo and Redo. The rail has no panel fill or border; active and hovered tools carry the only surface. Shape tools use a crosshair cursor with the relevant tool symbol; selecting the pointer restores SVG-Edit's selection cursors. Cursor CSS stays outside authored SVG source and cannot change exported artwork.

Each active screen has its own layer list and timeline tracks. The Layers header appears once; changing screens clears the prior object/clip selection and ignores outstanding layer requests for the old screen. Screens and layers scroll independently. Visibility uses eye/eye-off buttons with explicit Hide/Show labels.

The layout is **Scenes | Layers | Canvas | Inspector**. The right inspector switches between Properties, Motion and Narration. Its header edits the current screen name. Scenes lists names and rounded durations, with Main above them for the overall timeline and a scene-count badge. Selecting artwork or a layer opens Properties; selecting a motion clip opens Motion. Switching inspector views preserves the canvas position and scale.

Layers has a fixed heading; only group rows inside its tree can collapse. Inspector tabs supply the view headings. Selected motion settings sit beneath the preset browser with icon actions for Delete and Close. All editing stays in the main workspace.

Right-click any screen for Duplicate screen, Delete screen, Move earlier and Move later. Keyboard users can invoke the context menu with Shift+F10. The old row of action buttons is removed. Drag a screen above or below another card to reorder it; the insertion marker shows the drop location. One drop is one `screen.reorder` command and one undo entry, available through MCP as well. The active screen and its artwork, audio and clips keep their identities.

Drag the dividers to resize Screens, Layers, the inspector and the timeline height. Divider handles also accept arrow keys. The OS window can resize down to 800 × 560, while panel widths adapt to keep the canvas usable. The tool rail keeps its icons and scrolls internally when its height is constrained; the workspace avoids horizontal page overflow.

The timeline ruler stays pinned during vertical track scrolling; component labels stay pinned during horizontal scrolling. Time ticks continue to line up with clips. Right-sidebar tabs remain outside the scrolling content. The old separate seek slider is removed: click or drag the ruler or empty track space to preview that integer frame. Clicking a clip previews the point clicked while selecting its settings; dragging a clip still moves/resizes it. The ruler supports Arrow keys (one frame), Page Up/Down (one second), Home and End. Scrubbing preserves the component selection. Adding a preset selects its clip, previews its start, and scrolls its component track into view without hiding it under the pinned ruler.

Selecting a clip opens its compact settings below the Motion browser. There is no separate Transition pane or horizontal splitter. The preset list can scroll without moving the settings or tabs. Selecting a clip without dragging it does not create an undo entry. Invalid clip drags restore the original visible position as well as preserving validated project state.

The former canvas heading (screen name, zoom percentage and “editable vector artwork”) is removed. Screen identity stays in the screen list and layer heading. The zoom still fits the available canvas but no longer takes up a heading row.

`npm run test:workspace` exercises the actual Electron menu, cursor, drawing/undo, screen isolation, scroll pinning, collapse/split layout, pane resizing and compact window size. `npm run test:workspace:standalone` performs the same checks on the local standalone executable. Reports/screenshots are written under artifacts/workspace/. Existing command, geometry and desktop/MCP tests remain applicable.

The standalone is checked at desktop size and 800 × 560, along with desktop/MCP handoff and the complete narrated 445-frame sample export. See implementation-status.md for the current test totals and candidate results. The SVG/TeX feasibility gate also passes; its browser fixture is now bundled into a local file, avoiding a dev-server navigation stall without changing any identity or pixel-geometry assertions.

`npm run test:panels` exercises the docked single-window layout, shared selection and settings, right-click operations, actual HTML drag/drop ordering and undo, ruler/track scrubbing, auto-reveal on a component track below the viewport, and eye visibility controls. `npm run test:panels:standalone` checks the packaged executable. Reports and screenshots are in artifacts/panels/. The reorder command adds a meaningful history/identity unit case, bringing the unit total to 25.

Shape geometry, fill, stroke, opacity, transform and applicable text/path controls are in Properties. The Σ canvas tool inserts a source-linked LaTeX shape. Its source editor appears with its shape controls. Recompilation preserves the equation group identity, position, styling and animation references. The cached initial equation needs no TeX; custom source compilation requires local TeX tools.


Verification for this update: typecheck, 26 unit cases, desktop/MCP handoff, workspace and panel acceptance, and SVG/TeX feasibility pass. The new test:shapes workflow verifies real worker recompilation, stable equation identity/clip references, source errors preserving artwork, and stacked shape/transition settings. test:shapes:standalone verifies cached equation insertion and controls in the packaged app.


## Compact editing update

Fill and stroke use native color popups with remove/inherit actions; referenced paints remain preserved until explicitly replaced. Numeric controls expose steppers and geometry uses paired fields. Rectangle corner radius is directly editable. Transform fields and raw SVG path data use disclosures. Transforms start collapsed for shapes with direct geometry fields and expanded for groups/paths. Six icon controls align the selected object to the artboard through SVG-Edit and shared artwork history. Multiselection alignment is described below.

Layers show SVG thumbnails and parent-first group indentation. Layer and canvas selection stay synchronized across canvas reloads; Ctrl/Cmd-click targets nested children. Selection scrolls into view in the docked list. Timeline clip selection also selects its artwork without clearing its transition settings. Undo and redo are at the right end of the drawing toolbar. Screen settings occupy the Screen tab; project settings and the audit/connection controls are Files dialogs. Narration uses a 32px audio player and a smaller script field.

`npm run test:editor-ux` exercises nested parent/child selection on the actual canvas, thumbnails, colors, corners, alignment, undo and the 800×560 viewport, with screenshots in artifacts/editor-ux. The local broken Python 3.12 installation was repaired; equation compilation and the SVG/TeX fidelity gate passed afterward. A relocated/broken development interpreter can be repaired with `uv python install 3.12.12 --reinstall` followed by `uv sync --python 3.12.12`.

## Selection and drag corrections

The properties column now keeps its layout space when empty or closed. Selection therefore does not recenter or rescale the artwork. Viewport sizing updates SVG-Edit without reloading its document. Imported viewport/editor wrappers are excluded from hit testing; normal clicks select authored objects/groups, Ctrl/Cmd-click selects a nested object, and dragging a child selected in Layers preserves that child target.

Selection moves/resizes are committed once on mouse release (SVG-Edit does not emit its normal changed event for a selection move). Click/hover does not move artwork or create history. UI commands are serialized so Undo waits for the preceding canvas commit and reverses that gesture. This uses the same artwork.commit command and undo history as MCP.

Group rows have expand/collapse arrows. Thumbnails are 18px, transparent, cropped to their artwork, and retain their appearance when their own layer or an ancestor is hidden. Thumbnail sizing CSS only targets the outer preview SVG, preserving nested viewport geometry.

`npm run test:selection` covers nested imported artwork, child-only held dragging, click/hover without mutation, release, exact undo, stable artboard bounds, collapsed groups, and hidden/transparent isolated thumbnails. Add `--packaged` to the underlying tsx script for the standalone candidate. The workspace test now checks stable canvas width when properties close instead of expecting it to grow.
The selection overlay also includes nested viewport transforms, and drag deltas use the selected object's parent coordinate system. The regression checks pointer-following at a non-unit viewBox scale, selection-overlay centers within one screen pixel, and mouse release outside the embedded artboard followed by exact undo.

## Workspace chrome and selection update

The right tabs are Properties, Motion and Narration. The screen name is editable above them; there is no Screen tab or manual screen-duration field. Timeline labels show frames and seconds. Project format lives in Files → Project settings. Files → Activity and MCP contains jobs, MCP connection details, command history and the recovery entry point. Errors remain dismissible; routine status is announced to assistive technology.

Playback time, play/pause and restart occupy the pinned component-column header, without a redundant Timeline label. The separate timeline heading, frame count and preview instruction are removed. Layers has a single heading; Motion has no repeated heading or ADD ANIMATION row. Native panel pop-outs are removed and window opening is denied in Electron.

Double-click a layer name to rename it inline. Enter or blur commits through object.edit and shared undo; Escape cancels. Properties has paired numeric transform inputs for translation, rotation, skew and scale in its Transform disclosure. Existing affine transforms (including reflections) are decomposed without changing artwork until an input is edited; singular matrices retain six editable matrix fields. Alignment, tools and actions use lucide-react 1.61.0 (ISC); its license is collected with the standalone notices.

Text and equation groups use bounding-box hit areas, while shapes use painted fill/stroke areas. This is editor-only CSS outside the authored SVG; it does not alter project/export styles. Selector overlays are refreshed after viewport resizing.

`npm run test:workspace-chrome` verifies Files dialogs, tab order, absence of duplicate chrome/footer/pop-outs, inline rename/cancel, numeric transforms, text/equation bounding-box selection versus hollow shape hit-testing, and compact-window selector alignment. The existing panel workflow now tests the single-window layout, preserving its reorder, scrubbing, clip reveal, visibility and rejected-drag checks. Transform unit coverage verifies affine preservation and singular fallback.

## Layer context menu

Right-click a layer for Copy, Cut, Paste, Duplicate and Group. Ctrl/Cmd-click layer labels to select several layers; right-clicking a selected row retains the selection. Right-clicking an unselected row targets that row. Paste is also available by right-clicking the empty layer list, including after cutting its last object. Group accepts one or more sibling layers and preserves their identities and existing motion. Layers with different parents report an error without changing the artwork. Locked layers, ancestors and descendants cannot be cut or regrouped; copying remains available.

The internal artwork clipboard supports repeated paste and crossing screens. Copy leaves project revision/history unchanged. Cut, paste, duplicate and group are each atomic undo steps. Copies retain nested placement, inherited attributes, definitions, equation sources and component clips, with fresh object/equation/clip IDs. Copied layers paste at their original position; duplicate uses the same position. Unsupported references to artwork outside the copied subtree/definitions are reported; copy the containing group in that case. The clipboard is kept in memory and is separate from the OS text/image clipboard.

`npm run test:layers` exercises the actual layer menu, multiselection/grouping, copy/paste, duplicate, cut, empty-list paste and undo.


## Interface refinement

Motion presets are grouped by Entrance, Exit, Emphasis, Object transition and Equation. Search matches preset names and categories without changing selection or project history. Choose a layer to enable presets; adding one still uses the shared `clip.put` command and selects its timeline clip. Preset names stay visible because an icon alone cannot distinguish their behavior.

Panel headings, separators, screen cards and the floating toolbar use quieter shared surfaces. Layer visibility and lock controls appear on hover, keyboard focus or selection; hidden/locked states stay visible, and compact/touch layouts always show the controls. The inspector keeps its reserved space so selection does not shift artwork. Caption deletion, clip deletion and combined SRT copying use named icon buttons with hover titles. Narration has one import action and captions show Draft only while their actual draft flag is set. Equation source has a compact Compile action; failures retain actionable diagnostics. Errors appear once in the dismissible workspace message.

Space always toggles playback, including when a button, clip or timeline control has focus; editable text fields keep normal space typing. Workspace-panel buttons expose their selected state to assistive technology. Layer timing is a compact frame-based row inside Properties → Timing, with icon actions and a collapsible section. Timeline readouts show frames and seconds on two lines. Styles remain outside the artwork iframe, and project commands, identities, timing and export appearance are unchanged by interface styling.

Run `npm run test:ui-refinement` after `npm run build` for motion filtering, keyboard preset insertion and caption deletion, clip deletion/undo, draft state and compact layout checks. Screenshots are written under `artifacts/ui-refinement/`.

The design detector flags the 2px timeline playhead and the existing Arial caption overlay. These are intentional: the first marks time rather than decorating a card, and the second preserves authored caption appearance. Neither is changed by interface styling.


## Compact interface motion

The compact dark workspace retains its shared purple accent and panel layout. Workspace-panel buttons have a sliding selection indicator and support Left/Right arrows, Home and End while focused. The indicator realigns immediately when the sidebar is resized. Motion search includes a named clear button, Escape to clear while retaining search focus, and a Clear search action for empty results.

Buttons share hover/press feedback, with a static option for controls that should not scale. Dialogs, context menus and settings popovers use short enter/exit transitions; Radix retains focus management and removes closing overlays. OS reduced-motion preferences disable interface transitions and press scaling. The interface stylesheet is loaded only by the workspace entry point, outside the artwork iframe; timeline scrubbing, clip dragging and authored playback retain immediate, frame-based behavior.

This pass follows Impeccable's existing-interface polish guidance, Transitions.dev's modal/dropdown timing, GSAP Skills' transform/performance and cleanup principles, and Make Interfaces Feel Better's typography/surface/interaction guidance. It adds no animation runtime dependency. GSAP's standard license restricts some visual animation builders, so pteron's UI uses native CSS transitions instead.

Run `npm run test:interface-polish` after `npm run build` to verify keyboard switching, search recovery, resize alignment, reduced motion, dialog lifecycle and unchanged project data. Screenshots are written to `artifacts/interface-polish/`. The existing `test:ui-refinement` workflow remains applicable.

## Properties and editable project format

Properties groups geometry, appearance and transforms with paired numeric inputs and readable field labels. Fill and Stroke share a color/hex/alpha popover; alpha has a slider and percentage field. Changes edit `fill-opacity` or `stroke-opacity` through shared commands and undo. Right-click swatches to remove a paint or restore inheritance. Stroke dash/cap/join controls stay in their separate compact settings popover.

Files → Project settings contains editable Width, Height and Frame rate with Apply. Dimensions range from 16 to 8192 pixels; FPS is an integer from 1 to 120 (default 30). Applying the format is one undo step. Canvas resizing retains artwork size, position, nested viewports and IDs; artwork outside a smaller canvas remains editable in the source. A nonstandard outer viewBox reports an unsupported resize rather than changing placement. MP4 still requires even dimensions.

Changing FPS preserves timing in seconds to the nearest new frame. Clips, caption endpoints, screen lengths, cues and narration durations are retimed; cues are marked for review. Rounding that creates invalid motion overlap rejects the update. Playback, timeline seconds/ticks, audio seeking/import, preset defaults, SRT and MP4 all follow the chosen FPS. Clipboard motion also retains its source timing when pasted after an FPS change. Resolution changes invalidate derived caption vectors so previews cannot use glyph placement for the old canvas. Existing 30 fps packages remain compatible; older app builds only support 30 fps packages.

`npm run test:project-settings` checks stroke alpha, undo/redo, the real Files dialog, FPS-aware seeking, audio import and a narrated 128×96 MP4 at 24 fps, including exact frame timestamps. Unit coverage checks retiming, identities, packages, clipboard timing, and atomic rejection. Python tests also render sampled videos at 24 and 60 fps. Screenshots are in `artifacts/project-settings/`.


## Selection, directional strokes and artboard backing

Ctrl/Cmd-select several layers to edit their shared Properties. Mixed values remain unchanged until explicitly edited. Bounds, alignment, distribution, grouping and path operations are described in artwork.md. Right-click a group for Ungroup. Rectangle Stroke settings includes per-edge toggles, including top-only strokes.

The editor-only backing and iframe match a visible opaque rectangle that covers the artboard. This removes white seams at fractional fitted zoom on dark artwork. Transparent artboards keep their existing white editor backing. Authored SVG, fills/strokes and exported pixels are not modified by this display adjustment.

`npm run test:multi-selection` exercises mixed appearance edits, selection bounds, distribution, Group/Ungroup, Union/undo and directional stroke/corner edits across an actual editor reload and compact viewport. Unit cases cover the other Boolean operations, atomic failures, inherited presentation, nested viewport transforms, history and project roundtrips. Screenshots and a generated vector sample are under `artifacts/multi-selection/`. Existing selection, properties, unit and SVG/TeX feasibility checks remain applicable.


## Grouped timeline and automatic timing

Selecting a single layer or group exposes its visibility ranges only in Properties → Timing. Selecting a motion clip opens Motion; its owning layer's Timing remains available by switching to Properties. Timing stays content-sized and can collapse. Selecting several independent layers shows shared Properties without assigning timing to an arbitrary member.

The timeline follows the same parent-first tree and stacking order as Layers, with its own independent expanded/collapsed groups. Collapsing a group in one panel leaves the other panel unchanged. Disclosure arrows and 16px indentation per level show the hierarchy; root layers stay flush with root groups, and timeline rows have no group icons. Selecting a timeline row selects that exact group or child on the canvas and targets new motion presets to it. Each row shows only its own visibility ranges and clips. Collapsing rows changes the view without changing the project or undo history; selecting a nested layer reveals its ancestors.

Group position, scale, rotation and opacity motion compose around child motion through the authored SVG hierarchy. Children keep their own clips and timing. A child is visible only while it and every enclosing group are visible. Group timing does not rewrite or shift child clips: child clips keep absolute screen frames. Move or trim a child's row to edit its timing. Ungrouping a group with its own animations or explicit visibility ranges remains rejected until those group settings are removed/reset, because redistributing them could change the motion.

The single-layer name field shares a row with named icon actions for Delete and, for ordinary groups, Ungroup. Multiple-selection shape operations use dedicated Combine/Union/Subtract/Intersect/Exclude icons with accessible names and hover titles.

Timeline rows use a compact 32px height and 10px labels, with reduced clip padding and full-width trim hit areas.

Motion categories use plain headings and horizontal separators, matching the caption list. Caption actions sit 12px below the final entry divider. Disabled presets explain the required layer selection in a hover tooltip rather than an inline instruction; multiple-selection presets explain that layers must first be grouped.


Stroke settings exposes labeled rectangle side toggles with All/None shortcuts, Inside/Center/Outside alignment for closed shapes, and a labeled Use parent action. Fill/Stroke color popovers have an enabled switch beside a thin alpha slider. Disabling either paint preserves its previous value and alpha for re-enabling. Manually resizing vector shapes retains the chosen border thickness. See artwork.md for geometry and export scope.

## Compact contextual inspector

Motion has category filtering and geometric preset previews. Hover or keyboard focus animates only that preview using the shared frame evaluator; hidden views and reduced-motion preferences stop it. The selected preset is highlighted. Settings show exact Start/Duration frame values and a duration slider that commits one undo step per pointer drag. Direction uses arrow buttons. Strength, Repeat and Curve appear only for presets whose evaluator uses them; hidden stored values remain intact. Commands, validation and undo are shared with MCP.

Properties uses short paired numeric rows, an inline name field and icon actions. Timing is part of this view, never a separate panel. Advanced transforms and raw path data use disclosures; caption timing uses compact inline fields. Normal controls carry short labels or accessible names/tooltips, without instructional paragraphs. Artwork and explicit playback stay independent of decorative interface motion.

Design references: [CapCut animation controls](https://www.capcut.com/resource/how-to-use-capcut), [Premiere contextual Properties](https://helpx.adobe.com/premiere/desktop/add-text-images/stylize-text/about-properties-panel.html), and [Resolve inspector](https://www.blackmagicdesign.com/products/davinciresolve/edit/). This pass applies Impeccable, Transitions.dev, GSAP Skills and Make Interfaces Feel Better guidance without adding an animation dependency.

Run `npm run test:compact-inspector` after building for inspector switching, timing containment, preset filtering/previews, reduced motion, duration dragging/keyboard/undo, validation and compact-window checks. Screenshots are in `artifacts/compact-inspector/`. Existing workspace, hierarchy, panel, equation and stroke tests follow the new inspector views.

## Overall timeline and media lanes

Groups start collapsed in screen and All timeline views. Chevrons expand them without changing project history. Selecting a child explicitly from Layers reveals its ancestors in the timeline; the two trees keep independent disclosure state.

All shows ordered screens and their component timing on one cumulative frame ruler. Each screen row can expand into its layers. Layer and motion edits still target their owning screen through shared commands. Individual screen views use local frames. Screen cards contain the name and rounded duration; the selected screen name is editable in the inspector header.

Screen length follows layer ranges, motion endpoints, local captions/audio and cues, and can shrink when the longest endpoint is shortened or deleted. Untimed artwork retains its original hold (three seconds for new artwork); extending another layer does not permanently inflate that hold. Existing packages keep their original hold as the baseline. Overall media extending past the sequence extends the last screen. Exact layer timing remains in Properties; there is no screen-duration field.

Audio and Captions have pinned lanes beneath the layer tracks. Imported audio has a decoded waveform. Overall audio can move on its lane; caption blocks can move or trim at either edge. Each gesture commits one command/undo step, and rejected edits restore the prior position. Selecting a caption opens one text editor with a single In/Out row.

SRT import uses the overall project clock in every view and replaces the caption track in one undoable operation. A crossing cue is a single source with clipped screen views; edits update the source and SRT export emits it once. Overall audio likewise retains one source file and uses frame offsets for each screen's playback and render slice. Caption text and audio are preserved when boundaries move. Old per-screen media remains readable.

`npm run test:sequence-timeline` checks collapse/expand, names and automatic length, real SRT/audio import, crossing-cue edits/export, caption/audio dragging and undo, waveform decoding, compact layout and a two-screen MP4. Different tones in each audio half verify source offsets. Unit tests also cover malformed import recovery, package roundtrip, boundary changes and FPS retiming.

## Workspace navigation

Canvas tools occupy a compact vertical strip at the canvas's right edge, with reserved space beside the artboard. The former bottom toolbar padding is reclaimed.

Hover or focus the artwork workspace or either timeline to target navigation. Ctrl+wheel zooms at the pointer; Ctrl+plus (including Ctrl+=) and Ctrl+minus zoom around the view center. Ctrl+0 restores the centered fitted canvas or the timeline's initial scale and scroll position. The normal mouse wheel scrolls the canvas vertically over both artwork and workspace backing. Middle-button drag pans the canvas without selecting or drawing. Shift+wheel scrolls horizontally in the canvas and timelines; horizontal trackpad gestures remain available. Timeline vertical scrolling is unchanged. Text inputs retain their editing keys.

Canvas zoom is bounded from one quarter to sixteen times its fitted view. Panning and viewport resizing retain a visible portion of the artboard. Navigation is local view state: it never changes authored SVG geometry/styles, project revisions, undo history, integer-frame timing or exports. Screen and All timelines share the same navigation implementation. Their ruler, component tracks, media lanes and playheads use one horizontal scroll surface, with pinned labels and media lanes.

Run `npm run test:navigation` after building. It exercises actual Electron input at desktop and 800x560 window sizes: cursor anchoring, keyboard routing, bounded middle-button panning, resize recovery, reset, horizontal scrolling and caption/ruler alignment in both timelines. `npx tsx scripts/navigation-test.ts --packaged` runs the same checks against the rebuilt unpacked candidate. Screenshots and verification logs are under `artifacts/navigation/`.


## Timeline density and UI review

Audio and Captions follow the last layer row directly. Spare panel height stays below the media lanes instead of separating them from artwork timing. Long track lists retain the pinned ruler, pinned media lanes, horizontal label alignment and native vertical scrolling. `npm run test:timeline-layout` checks the sample at desktop and 800x560 sizes plus a 20-layer overflow case; screenshots are under `artifacts/ui-audit/`.

The timeline divider stops shrinking while there is still room for a complete track row between the pinned ruler and media lanes. Use **Timeline focus mode** at the right edge of the timeline header or in the View menu to give tracks the available workspace height. Toggle it off to restore the previous dock layout. Main and Scene switching, playback, markers, and direct timing edits remain available in focus mode.

Ruler ticks use a frame-aligned step chosen from the visible lane width, so short scenes show sub-second marks instead of only the start and end. The final duration label drops a neighboring mark when they would overlap. Main scene sections carry a scene glyph to distinguish them from same-named artwork groups. The timeline reserves horizontal scrolling for a zoomed timeline and keeps the media lanes lifted above the scrolling tracks. A blank scene shows a short Draw artwork to add a track hint without reserving row height.

The initial timeline height grows with the window between the 220 px compact floor and a 320 px ceiling; dragging the divider still overrides it for the session. Scene cards retain their complete names at compact widths and show the project scene count beside Main. The header title is the primary identity, with a state dot beside Saved, Unsaved changes and Not saved.

The window is frameless and its chrome is application-drawn: Minimize, Maximize/Restore and Close sit at the trailing edge of the header, the header is the drag strip, and double-clicking its empty area toggles maximize. The canvas tool rail has no card or panel fill; only the active tool and hovered buttons carry a surface. Activity and MCP uses one flat panel: Jobs, MCP server status/revision with the copy action, and text command history with a Recovery link. It has no nested status cards, dashed empty panels or badges; the jobs area keeps a stable height while a running job is cancelled, and the default empty state does not scroll. Narration imports, caption actions and settings use short text labels instead of unexplained icons. Recovery collapses to a text line when a snapshot has no artwork preview.

The timeline header shows the selected clip or caption, its layer or lane, and its in, out, and duration in frames on the current timeline clock. Multiple clips show their selection count. Double-click a clip or caption, or press Enter on it, to open its editor and focus the Start field or caption text. In timeline focus mode, **Edit selected** restores the workspace and opens the same editor while keeping the playhead in place.

**Filter layers** matches names without regard to case and highlights the matching text. Results include each matching layer and its ancestor groups, with groups shown only for context in muted text. Press Escape or use the clear button to return to the regular tree. Filtering leaves timeline tracks, group disclosure preferences, and project history alone.

The artboard remains clean and ready for direct authoring. Toolbar tooltips describe what each action does, include shortcuts where available, and show the state of snapping, range looping, and motion handles. Active tools and toggles retain an outline while hovered.

When a clip is selected, **Motion** offers separate **Presets** and **Clip** views. Selecting or adding a clip opens its settings. Switch to Presets to browse, filter, or open Saved motion, which can also capture the selected clip. The preset search and category stay in place while editing the clip.

`npm run test:timeline-layout` includes the selection and editing workflow at 800 × 560. Set `PTERON_PORTABLE_EXE` to a built executable and run `npm run test:portable -- --timeline-selection` to exercise the same workflow in the single-file build.

`npm run test:interface-polish` checks blank-scene actions, Layers highlights, and tool states at 800 × 560. Use `npm run test:portable -- --workspace-polish` with the same executable override for the packaged UI checks.

The vertical toolbox supports Up/Down, Home and End to move keyboard focus without switching tools. Corner popovers commit only edited values: tabbing through an unchanged corner cannot reset another corner or add an undo step. Development startup defers Node-only geometry imports until the main-process service initializes, keeping shared geometry predicates usable in the renderer.


All is a compact, centered text-only sequence selector, visually separate from screen-name rows. At the final frame of the last screen, Play or Space restarts the sequence at its first screen in both timeline views. Pausing and resuming elsewhere retains the current position. `npm run test:replay` verifies natural completion and repeated click/Space replay, compact layout and unchanged project/history; pass `--packaged` to its script for the unpacked candidate.


Motion Start and Duration now use seconds, with a small `s` unit. A compact s/f switch changes both fields to integer frames and back; the last choice is remembered for the local profile. The duplicate duration slider is removed. Entries snap to the nearest output frame using the project frame rate; the displayed value reflects that snapped time. Keyboard number steps advance one frame. Invalid or rejected edits restore the saved value, and each committed edit remains one shared undo step. Project files, commands and MCP continue to use integer frames. Layer timing and timeline frame/second readouts retain their existing controls. Compact-inspector coverage checks seconds entry, undo, keyboard stepping and 24/60/120 fps rounding; the interface-polish workspace check covers the frame view and compact stacking.


## Original sample project

Files → Open sample project opens **Small idea, big motion** as an unsaved copy; Save asks for your own package location. Its six scenes demonstrate supported editable geometry, independent clips, parent/child motion, narration and captions. Titles use editable vector lettering; artwork text export remains unsupported. The sample generator uses committed original media rather than a sibling reference project. See [sample details](../examples/README.md).


Narration playback lets the browser decoder run continuously through normal UI scheduling jitter. Starting, pausing, scrubbing and changing sources synchronize the audio position; uninterrupted playback corrects only substantial drift with a cooldown, avoiding repeated decoder seeks. `npm run test:narration-playback` checks real playback through scheduler stalls and precise pause/scrub/resume; unit coverage checks jitter and drift recovery. The bundled sample uses the Ava conversational neural voice. Generation is a development-only step; the WAVs play offline.


Sample pacing follows the trimmed narration with six frames of tail per scene (twelve on the last), instead of fixed five-second holds. Its six scenes total 536 frames / 17.867 seconds at 30 fps. Artwork reloads reset the native selection-overlay cache before restoring project IDs, so drawing/undo, scene changes and preview cannot retain detached blue selection boxes. Normal selection handles remain available when editing.


The latest showcase uses one connected conversational take across all six scenes (445 frames / 14.833 seconds), with no added scene silence. Eleven phrase captions transcribe the narration exactly; their integer-frame timing is derived from generated word boundaries stored in `examples/media/narration.json`. The pteron wordmark has been removed from the artwork.

The connected sample uses one overall narration source. Playback keeps the same decoder clock across its screen boundaries; choosing another screen while paused still seeks precisely. Caption metadata retains every spoken word and natural phrase boundary, rounded once to integer frames.
# Canvas properties and tool shortcuts

Canvas controls use concise labels without explanatory paragraphs. Background color appears as an unboxed swatch and hex field.

With no artwork selected, Properties shows Canvas settings: screen background color plus project width, height and frame rate. Background changes use the shared `canvas.background` command and undo history. The background is saved as a vector rectangle, included in preview/export, and excluded from layer/timeline lists. Resizing the project resizes the background without scaling artwork. Existing drawn rectangles remain ordinary layers; they are never automatically converted into a canvas background.

Tool keys follow Illustrator conventions: **V** Select, **M** Rectangle, **L** Ellipse, **P** Path and **T** Text. Tooltips show these shortcuts. They work in the workspace and embedded canvas, and leave text fields, text editing, dialogs and modified shortcuts alone. Middle-button dragging remains available for canvas panning.

Clicking an artwork layer changes its Properties selection while retaining the selected timeline clip/range and playhead. Clicking another clip/range changes timeline selection explicitly. Motion timing and options use aligned input columns with spacing between rows.

## Simple authoring additions

See [simple authoring](simple-authoring.md) for project-owned saved shapes/motion, multi-shape preset application, aspect locks, canvas keyboard nudges, recent colors, timing-boundary/fit controls, basic narration trimming, multi-version recovery browser and draft/final export. Actions use compact icons with hover titles and accessible names; saved libraries are collapsed by default.
