# Genuine drawing Break workflow — finite implementation design

2026-10-10. Design only; no CAD authored, source exports changed, application code edited, browser proof claimed, or journal/commit performed for this task.

## Source contract

Source PDF111 / printed2-25, **Break or Broken View**, explicitly describes a modification of an existing drawing view, not a separate view. A shortened view permits a larger drawing scale on a smaller sheet. Reference and model dimensions associated with the broken region retain actual model values. Its long capsule example has five holes before the break and two retained end holes after shortening. The two vertical boundaries are wavy. PDF494 / printed10-14 Q4 identifies **B, Break View**; its corresponding picture uses paired vertical zigzag boundaries. Both pages were rendered and visually inspected at2×; evidence: `scratch/planchard/break-source-111.png`, `break-source-494.png`, and extracted `break-source-text.txt`.

Neither inspected source page states an orthographic-only restriction, mandatory propagation to aligned views, precise numerical gap, or a particular zigzag amplitude. These must be marked as app choices. PDF111's preceding hatched, spline-bounded image is **Broken-out Section**, not Break. PDF494 Q6's closed-profile spline also concerns Broken-out Section. Break must not cut native solids, change mass/volume, produce hatching, create another view, or use the broken-out depth control.

## Existing architecture and gaps

- `js/cad_sheet.js:createView` stores cropSketch and brokenOut, but no Break modifier. `createProjector` has cache keys for those modifiers and produces shared projections for both browser and export.
- `buildSheetScene` currently computes affine `toSheet`/`toModel` mappings around the projected bounds centre. All visible/hidden strokes, rounds, centre marks, annotations and interaction rely on these mappings. The compressed mapping will be piecewise, with a deliberately unpickable gap.
- `measureDim` already measures uncompressed model-coordinate refs. Preserve it. **Critical:** `resolveDim`'s `auto:'extent'` currently reads projectionBounds; replacing those with shortened bounds would make automatic dimensions lie.
- `layoutViews` fits/alines principal views through shared primary x/y centres. Independently shortened asymmetric Front/Top views can share centres yet misalign corresponding physical features. Merely retaining the existing axis lock does not solve this.
- `modeler_drawing.js` stores refs in original model coordinates, generates snaps from projections and named topology, hashes modifiers for scene invalidation, and previews dimensions via `toSheet`. Its snap and picking paths need filtering and null-safe gap handling.
- `exactArcStroke` reconstructs analytic arcs from topology. Passing shortened coordinates to this routine can reintroduce eliminated geometry or use the wrong centre. Preserve original coordinates and clip before rendering.
- `js/modeler.js` supplies drawing toolbar buttons and help strings. `cad_drawings.js` already exports the same `buildSheetScene` → `sceneToSvg` pipeline; no independent export-only approximation should be introduced.

## Proposed bounded first version

Support one pair of parallel break boundaries in an existing **principal orthographic, edge-display, unsectioned view**, with neither Crop, Broken-out, Detail nor exploded presentation. Reject combinations explicitly, before undo/mutation. This is a declared initial app scope, not a source restriction. Provide both horizontal shortening (vertical break lines, u axis) and vertical shortening (horizontal break lines, v axis), plus selectable zigzag/wavy boundary style. Default printable gap 6mm is an illustrative app default, adjustable; the book supplies no nominal gap.

Persist one optional view modifier, for example:

```json
{"breakView":{"version":1,"axis":"u","from":4,"to":16,"gapMm":6,"style":"zigzag"}}
```

`from`/`to` are original projected model coordinates in **cm**, matching current projection coordinates; gap and boundary amplitude/period are paper mm. No new view ID, native feature, geometry proxy or mesh. Unknown versions/styles, nonfinite values, reversed/equal limits, negative/zero gap, wholly external or end-removing ranges, and a gap greater than/equal to the selected removed span at current scale are invalid. Return a diagnostic rather than silently displaying the complete unbroken view. Require retained material on both sides; enforce a small numerical margin from model extremes. A model/scale rebuild that invalidates a once-valid span must show the modifier's issue and offer editing/removal.

Suggested pure helper `js/core/drawing_break.js` owns validation, mapping/inverse mapping, source-space clipping and boundary generation. Keep schema inclusion, cache/hash and projection/layout orchestration in existing modules. Migration preserves the optional modifier; duplicate view copies it intentionally; removal/undo keeps the same original view and its annotations.

## Coordinate mapping and geometry

At resolved scale `k = 10 * scaleValue(scale)` paper mm/cm, let `a=from`, `b=to`, `g=gapMm/k`, removed reduction `r=b-a-g`. For source scalar `s` on the chosen axis:

```
F(s) = s           when s <= a
       unavailable when a < s < b
       s-r         when s >= b
```

The paper gap corresponds to display interval `(a,a+g)`. Inverse mapping returns source `s=t` for `t<=a`, source `s=t+r` for `t>=a+g`, and **null within the gap**. Preserve the other coordinate. Apply the current paper y inversion after mapping. Store original model refs only. For sample source u0=0/u1=20cm, break4..16cm, gap6mm, scale1:1: display ends0..8.6cm, width86mm; an overall dimension still reads200mm, not86mm. At1:2 width46mm, gapstill6mm, value200mm.

Keep the raw HLR/topology projection as `sourceProjection`; create a separate retained source-coordinate geometry collection and compressed `displayBounds` for fitting. `toSheet(sourcePoint)` maps retained points; `toModel(paperPoint)` performs the inverse. Do not overwrite raw bounds or basis with display values. Auto-extent dimensions must consume original bounds explicitly. Do not measure the compressed geometry.

Clip each visible, hidden and cut line into the two retained half-planes in source coordinates. Preserve endpoint lineage when clipping, but synthetic seam endpoints must not masquerade as a named model vertex. Circle/arc handling: retain exact analytic circle only when wholly on one retained side; omit circles wholly in the removed band; split intersecting curves into retained arc intervals or well-bounded tessellated segments and forbid topology reconstruction from bridging removed intervals. An analytic arc's centre may lie inside the removed band even though an arc fragment remains: rendering therefore needs the retained fragment's affine branch, not a null centre mapping. Centre marks/centrelines must themselves be clipped: a long connecting centreline must not run across the gap. If shaded support is later enabled, clip triangles before translation; do not simply map their vertices.

Generate two boundary strokes at source seam positions and translate each with its retained branch. Make wave/zigzag amplitude and wavelength deterministic paper lengths independent of zoom/scale. Extend slightly beyond the material outline, as a graphic convention. Validate `2*amplitude < gapMm` so the strokes cannot cross. Keep boundary strokes out of topology and dimension snap sets. SVG and canvas consume these same scene items. Paper-only primitives and freestanding notes stay in paper coordinates.

## Dimensions, leaders and picking

Dimension resolve/measure uses source topology, refs and source bounds; only extension/leader attachment coordinates pass through the display mapping. This applies to automatic/model-item dimensions, reference dimensions, baseline/chain dimensions and hole-callout leaders. A cross-break horizontal/vertical dimension spans the shortened endpoints graphically but carries the full physical value. Preserve text/tolerance/reference formatting. An aligned distance is also measured in original coordinates; rendering its shifted extension geometry must not accidentally replace its value with the new displayed distance.

An existing dimension or leader anchored strictly within the eliminated band cannot be drawn onto another retained feature. Preserve its authored record and true measurement, report **anchor hidden by Break**, and omit its attachment/ink (or offer an explicit relocation to another unbroken view). This is a presentation-hidden condition, separate from lost topology/dangling. Do not clamp hidden anchors to seam positions or silently bind neighbouring IDs. A retained arc-centre-based diameter/radius leader requires special treatment above; if it cannot be represented safely in version1, reject that intersection or show a diagnostic rather than drawing to a false centre.

Filter topology crossings, line endpoints/midpoints, circle quadrants and centres by retention before `snapAt`. `drawingSnapSegments` must use retained source geometry. Clipped seam intersection endpoints can be picked only as explicitly unbound presentation points, never inferred topology vertices. `toModel` null must be handled in view selection, dimensions, section/detail/crop draft paths, note placement, dragging and previews. Clicking the blank gap creates no pick or undo entry. Endpoint rounding must use a tolerance expressed in source units; ambiguous seam-edge picks are resolved consistently to their respective branch.

## Orthographic alignment

Source pages do not mandate propagation; nevertheless the app's aligned views must remain trustworthy. Choose one of these explicit policies before implementation:

1. **Recommended finite implementation:** apply the Break to the selected view and offer **Align matching orthographic views**. This stores a shared original-space world-axis interval/group reference, maps it through each view basis (including reversed axes), and applies matching shortening/gap to aligned views showing that world axis. End-on views do not inherit shortening. For Front-u and Top-u with the same world right axis, source interval and compressed alignment datum must match. Retained feature locations must align, not merely bounding-box centres. Unequal per-view scales cannot maintain direct projected feature alignment; require equal scales for the linked group or explicitly unlink it.
2. If propagation is deferred, version1 must reject shortening an automatically aligned cluster member until the view is explicitly detached/floating; otherwise advertise it as **independent Break view** with an explicit visual alignment issue. Do not claim the source multi-view workflow complete from this reduced mode.

For either policy, compute origin placement from a consistent source datum after mapping. First/third angle changes only placement side, not physical interval meaning. Reversed basis requires swapping bounds and reflecting the map; never copy numerical u/v unchanged between differing views. Breaking Front's horizontal dimension should affect matching Top/Bottom or Back axes, not the end-on Right/Left dimension. Vertical shortening follows the analogous world-axis match.

## Actual browser workflow to prove

1. Open a genuine long native part's existing orthographic view. Add overall/model/reference length and an end-hole callout before shortening. Record native and STEP geometry independently.
2. Choose **Break view**, selected view, direction, click the two source boundaries, preview, set paper gap/style, and Finish. One undo transaction modifies the same view. Escape cancels without a document change. Include Edit Break and Remove Break; labels distinguish Break from Broken-out Section.
3. Confirm the long outline is interrupted, internal omitted holes disappear, end holes remain, and every pre-existing physical length stays true. Increase drawing scale and confirm constant printable gap. Test linked matching views when enabled.
4. Browser-save/export `.mforge` and SVG/PNG; hard reload, open the exact saved Library record, re-export and compare the entire drawing modifier/ref records and SVG deterministically. Prove native volume/geometry and STEP unchanged. Browser screenshots must show both seams, gap, retained holes, dimension value and readable toolbar state.

## Meaningful regression cases

| Case | Required outcome |
|---|---|
| Capsule with five holes, central three in removed band | Only two end holes remain; both visible/hidden outline fragments end at seams; no native change |
| 20cm length, break4..16cm, 6mm gap, 1:1 and1:2 | Display widths86/46mm; 6mm gap both; measured/exported text200mm both |
| Horizontal and vertical, opposite/reversed view basis | Proper paired perpendicular seam strokes and inverse mapping; correct side translation |
| Line crossing both seams, circle crossing one seam, arc centre in omitted band | No continuous omitted ink or reconstructed full arc; bounded retained pieces render safely |
| Hidden lines, axis centrelines and centre marks | Same clipping as outline; no gap-spanning centreline or removed-hole snapping |
| Auto extent and reference/model-item/chain dimensions | Full source values and identities survive, including rebuild and dual units |
| Topology rebuild changes overall size | True dimension updates; break stays source-grounded or diagnoses invalid interval |
| Removed anchor vs genuinely missing named topology | Separate presentation-hidden and dangling diagnostics; neither rebinds to a neighbour |
| Gap click / invalid form / Escape | No dimension/point/undo mutation; clear reason for invalid modifier |
| Remove, Undo, Redo, JSON cold save, copied view | Same view ID; original geometry/annotations restored; optional modifier persists exactly |
| Aligned Front/Top, asymmetric offsets, first/third angle | Retained physical landmarks align; end-on view unaffected; unequal linked scales rejected |
| SVG parity | Identical scene seams/clips/dimension text on canvas and export; deterministic cold SVG |
| Malformed saved modifier, unknown version, incompatible derived view | Diagnostic and safe failure; never silently shows plausible unbroken geometry |

Run focused helper/scene/controller tests plus `npm run check` and relevant existing sheet/crop/broken-out/linear-placement/model-item tests. Full actual Chrome proof is required separately; scripted unit coverage alone does not complete the user's book workflow. Implementation remains awaiting parent authorization and coordination with the UI agent.
