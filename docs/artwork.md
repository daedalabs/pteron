# Artwork and SVG support

The renderer now supports nested isolated group opacity and overlapping fill/stroke opacity through disjoint vector-face compositing. Authored SVG sources, editable identities and viewport clipping are retained. No bitmap flattening is used. Unsupported filters, gradients and arbitrary masks/clips remain explicit errors; extremely complex opacity arrangements report the vector-region limit. Later references to group-opacity limitations describe older implementation states.

The desktop now embeds one active SVG-Edit canvas with drawing tools, nested imports, selection, property editing and layers connected to shared commands. See implementation-status.md for limitations. Probes demonstrate selecting a nested child, editing its fill and reopening. Raw engine IDs change, but the project identity adapter restores stable UUID-based IDs and references. Four reopen cycles and fresh-import namespace separation are tested.

Planned v1 editing: shapes, Bézier paths, text, transforms, solid fills/strokes, groups, alignment/snapping, layers, visibility/locking and undo/redo. Nested SVG remains vector content whose children are editable.

Screen size defaults to 1080 x 1920 and can change in Project settings for every screen together; object placement is free. Screen duplication preserves continuity; independent artwork needs explicit linking. Ordinary copies are independent, with an explicit Make independent operation for linked artwork.

The vector normalizer currently supports basic shapes and paths, solid fills/strokes, transforms, nested rectangular viewports, visible overflow and simple opacity. It expands stroke outlines before clipping, avoiding invented strokes along viewport boundaries. It handles rotated viewport rectangles and nonuniform transformations. The original clipping fixture now matches browser pixel bounds exactly.

When PathOps rejects a conic from a round stroke cap during viewport clipping, the normalizer converts the outline's conics to quadratic curves and retries the intersection.

It explicitly rejects text, style sheets, referenced paints, images/foreign content, arbitrary clip paths, gradients, patterns, masks, filters, use/symbol instances, non-scaling strokes, while isolated solid-color opacity composition is supported. ID/reference preservation may support constructs that rendering does not yet support; the identity regression fixture deliberately tests gradient/use references separately from renderer acceptance. Preserve source when rejecting export. This limited normalizer is not arbitrary SVG fidelity or full text support.

Sources: https://github.com/SVG-Edit/svgedit and https://docs.manim.community/en/stable/_modules/manim/mobject/svg/svg_mobject.html

## Compact shape properties

Fill and stroke share one compact row with square color swatches. Fill alpha is inside the anchored Fill color picker, alongside RGB/hex editing; there is no separate opacity field. Stroke width sits beside Stroke and retains its up/down steppers. Both paint popovers expose independent alpha: fill-opacity and stroke-opacity leave existing object opacity unchanged. Right-click a color swatch for remove/inherit actions. Stroke settings open a small nonmodal popup anchored to its settings button, with visual solid/dashed/dotted style buttons, numeric dash sizes, cap/join previews and remove/inherit icons. Stroke settings have no separate paint-opacity control. Popups dismiss with Escape or an outside click. Numeric dash patterns are normalized to vector outlines for export.

Rectangles have one radius input and an anchored 2-by-2 icon/input popup for top-left, top-right, bottom-right and bottom-left radii. Individual radii use an editable SVG arc path with retained rectangle dimensions and `data-corners`, preserving the object identity, command history and package source. Entering a shared radius applies it to all four corners. Radii clamp to half the rectangle's smaller dimension. Independent stroke widths per edge and inside/outside stroke alignment are not implemented.


## Multiple layers and shape operations

Selecting several layers opens Selection properties with a count, shared appearance values, Mixed placeholders, and combined bounds. Fill, stroke, alpha, stroke width and opacity edits affect the selected roots atomically. Selecting an ancestor and its descendant never applies the same transform twice. Any locked layer, ancestor or descendant rejects the complete edit. Inline styles that override a requested shared property are reported rather than pretending the edit changed its appearance. Single-object source, name and equation editors stay hidden during multiselection. Motion insertion is disabled until one layer or group is selected.

Changing combined X/Y translates the selection; changing Width/Height scales it around its top-left corner and preserves relative placement. Dimensions are geometric bounds (excluding stroke expansion). Alignment uses the selection bounds; distribution requires three layers and creates equal gaps while retaining the outer endpoints. Nested SVG coordinate systems and transforms are included. Text bounds use Chromium font metrics in the Electron main process, matching the canvas without requiring the render toolchain.

Group keeps children and their animation targets. Ungroup preserves child identities, transforms, inherited presentation and stacking. It rejects animated/equation groups, group opacity requiring compositing, referenced group IDs and unsupported group attributes instead of losing their meaning.

Combine paths, Union, Subtract, Intersect and Exclude are available from the layer context menu and Selection properties → Shape operations. Operands must be sibling vector shapes. The backmost shape retains its ID, name and appearance; Subtract removes front shapes from it. Combine paths retains subpaths and requires matching opaque, non-referenced paints. Boolean operations require filled geometry. Text, ordinary groups, directional-stroke rectangles, transformed strokes that would change width and unsupported attributes must stay separate or be grouped. Animated operands, external references to removed IDs and empty results reject atomically. Undo restores the exact original shapes and IDs. Geometry uses bundled PathKit/Skia WASM; Python, provider accounts and network access are not required for editing.

## Rectangle stroke edges

Stroke settings has four icon toggles: Top, Right, Bottom and Left. Any subset can be enabled, including only Top or no edges. Rounded corners split at their diagonal midpoints; adjacent enabled edges join into a continuous path. All edges restore a closed perimeter. Fill is independent of enabled edges. Width, alpha, dash/cap/join and corner settings stay editable.

A directional rectangle retains its authored identity, transform, name and animation target as one layer. `data-stroke-edges` and rectangle metadata regenerate a fill path and editable vector edge paths. Internal generated paths do not appear as separate layers or become Ctrl-click targets. Source metadata, copy/paste, save/reopen and undo preserve the edge selection. The existing renderer limitation on multi-object group opacity still applies to fading this generated group; unsupported exports remain explicit.


## Border sides, alignment and resizing

Stroke settings name each rectangle side and include All/None shortcuts. Sides can be combined independently. Inside/Center/Outside alignment is available for rectangles, circles, ellipses, polygons and closed paths; open paths and lines retain centered alignment. The stroke style, line ends and corners remain separate settings. Use parent is a labeled action that restores inherited stroke paint.

Setting a border through Properties keeps its width in project pixels when the shape is manually resized, including nonuniform scales. Canvas resize commits preserve the original editable geometry and rebuild the border after the editor finishes its gesture. The original object ID and animation target stay intact. Imported native stroked vectors also retain their previous width when their geometry is resized through the canvas. Text outlines are not converted by this feature.

Generated `data-stroke-shape` wrappers retain the original shape type, geometry and presentation; rectangle sides additionally use `data-stroke-edges` and `data-rect-*`. Internal fill/border paths stay out of Layers and selection targeting. Fixed-width borders are expanded in project coordinates using the existing PathKit geometry engine, clipped to the inside/outside contour when requested, then stored as ordinary editable vectors. No raster images, masks or unsupported SVG stroke-alignment attributes are required. Changes to parent transforms or inherited paint regenerate the border. Referenced stroke paints and unsupported units fail explicitly. The existing overlapping group-opacity export limitation still applies.

Fill and Stroke color popovers each provide an enabled switch beside the 3px alpha track. Disabling paint sets it to `none` and remembers its previous value in project-owned metadata. Enabling restores that value without changing alpha; mixed selections remember each layer's own paint. Stroke enable also restores a visible width if it had been zero.

Verification: `npm run test:stroke-settings` exercises side/alignment controls, both paint toggles, a real canvas resize, undo and reload. It writes browser reference frames and `artifacts/stroke-settings/request.json`; run `uv run python renderer/worker.py artifacts/stroke-settings/request.json` and `uv run python scripts/check_stroke_settings.py` to compare the exported border silhouettes within one project pixel and the requested frame clock. Fixtures include transparent fill, individual sides, nonuniform resize, rounded corners, ellipses and a dashed compound path with a hole. `tests/stroke-alignment.test.ts` covers geometry, inherited paint, identity, persistence and rejected inputs.

The renderer expands multi-control quadratic pen segments into explicit SVG control/end pairs before passing vectors to Manim; this preserves curved borders and compound contours. Export silhouette checks exclude mixed antialias/compression fringe while retaining the one-pixel geometry and exact sampled-frame thresholds.
