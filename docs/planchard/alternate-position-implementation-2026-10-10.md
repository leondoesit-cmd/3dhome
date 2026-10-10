# Alternate Position — bounded genuine implementation, 2026-10-10

Source: supplied PDF203 /printed4-23 identifies Alternate Position in the drawing tool inventory; PDF494 /10-14 draftingQ3 identifies its illustrated superimposed alternate view. Neither supplies dimensions or a complete original assembly pose. The new pose is explicitly an illustrative rigid study, not publisher geometry or a solved alternate mate configuration. No actual browser acceptance is claimed here.

## Implemented contract and controls

Drawing toolbar → **Alternate Position / edit** → click an ordinary principal/isometric edge view. The real parameter form chooses all current bodies or one persistent source body, an alternate-pose label, translationXYZ inmm, world rotationXYZ indegrees and world pivotXYZ inmm. Rotation acts about that pivot in worldX→Y→Z order. The form rejects missing/duplicate bodies, configuration mismatch, malformed/nonfinite data, unchanged poses, incompatible derived/modified/shaded/exploded views, cancellation and stale source/drawing changes.

A saved view modifier contains source body IDs, source configuration identity and rigid pose parameters. On every projection rebuild the current source triangles are transformed into a second pose and genuinely projected through the same view basis; source solids/sketches/features/mates/assembly poses remain unchanged. Native rebuilds therefore change both base and alternate geometry. Missing references/configuration changes produce a visible diagnostic; there is no unrelated geometry fallback. All-body mode pins its exact body set and diagnoses additions/removals until reapplied.

The alternate visible outlines/round rims use a distinct **phantom long-short-short** pattern10/2/2/2/2/2mm at0.25mm line weight. The same item list drives Canvas and SVG. Source/base projection alone supplies dimension anchors, measurements and snaps. Union geometry bounds plus a conservative symmetric layout envelope retain the original base datum while fitting the overlay. The alternate label is escaped by shared SVG text handling.

Apply/edit and Remove Alternate Position each make one Undo step and reacquire live normalized views after history capture. Nested Detail projects the base geometry rather than inheriting uncropped alternate strokes; Crop/Broken-out/Break/Auxiliary authoring on an overlaid view is explicitly excluded.

## Assembly persistence repair required for this workflow

Interactive Drawing previously read E.def even while displaying an assembly, and assembly SVG regenerated a separate default sheet. A small drawingDocument helper now owns the interactive sheet on E.assembly in assembly mode (defaultFront/Top/Right/iso), on E.def in part mode. Sheet/title/hidden controls, host model/meta and initial drawing setup use that owner. Assembly SVG exports the same stored interactive sheet when present; existing drawing-settings/default assembly export remains in place when no authored sheet exists. Library serialization already preserves the owning assembly's drawing metadata.

Placed assembly drawing-body IDs now combine the stable cadComponent/cadSubComponent ancestor path with cadPart identity, distinguishing repeated/nested occurrences. Standalone assemblyDrawingDocument uses the same occurrence.path +partID scheme. This changes drawing identity metadata, not component geometry or placement. Sources without unique persistent mesh/body IDs are rejected by overlay authoring rather than approximated as a new solid.

## Explicit finite limitations

One overlay per unmodified principal/isometric view; one selected body or all current bodies as one rigid study. The overlay uses its own native-mesh hidden-line projection and does not model opaque occlusion against stationary base-state bodies, which are intentionally displayed as the base state. Current selected configuration is shared/pinned; this release does not independently activate a second solved assembly configuration, motion-study time or mate solution. Body/reference changes require reapplication where diagnosed. Alternate dimensions are not separately pickable. No Section/Crop/Break/Auxiliary/shaded composition, automatic pose inference, physical motion/contact claim, source printer or publisher-native fidelity claim.

## Verification

Focused **7/7 PASS**, tests/drawing_alternate_position.test.mjs:

1. Genuine world-pivot rigid transform and original mesh/ID immutability; supported/rejected parent types.
2. Phantom shared SVG, escaped labels, base-source30mm dimension, conservative union layout and deterministic cold equality/removal.
3. Missing/duplicate IDs, configuration/pose/data/composition rejection with explicit base-preserving diagnostics; Detail does not inherit unbounded overlay.
4. Actual OpenCascade native extrusion rebuild: source30→40mm width drives alternate rotated height30→40mm, source mesh unchanged, selected configuration supplied to projection and mismatch diagnosed.
5. Actual controller host with ensureSheetDoc record recreation/Undo normalization: Apply/edit/remove/history restore, stale and cancelled dialog guards, source unchanged.
6. Actual modeler drawingBodies executed in VM: repeated/nested paths10/20:arm and11:arm distinguish real source occurrences and match standalone exporter; visible controls present.
7. Actual drawingDocument/drawingSvgContent helpers executed in VM: assembly ownership/full cold overlay metadata, same stored SVG path, unrelated part untouched, legacy default export preserved.

Related drawing run **105/105 PASS** across Alternate Position (first6), Break, cad_sheet, assembly drawing notes, Auxiliary, Crop, Broken-out and mode transition. The final owner regression independently passed afterward, so all seven focused tests are final.

**npm run check PASS:** no free identifiers,673 linked modules,1487 source assertions. Scoped/global diff check clean at handoff. No full CI or actual browser result asserted.

## Actual browser acceptance next

Use an existing accepted native part/assembly in a protected saved copy. Enter Drawing; select a clear principal or isometric view; choose one real native body and a small explicit alternate translation/rotation/pivot. Verify phantom overlay plus unchanged base dimension, actual source identities/geometry/mates/poses. Save/exportmforge/SVG/PNG, edit a genuine upstream part dimension and confirm both poses rebuild, Undo/Redo/restore. Hardreload/exact Saved-name reopen; compare wholeDrawing/pose references/source authoring and regenerated shared SVG. Assembly repeat occurrences must retain distinct IDs. Do not accept only a manually drawn phantom outline or static saved image as the workflow.

Owned changes: new core drawing_alternate_position.js and test file; cad_sheet/shared controller; minimal parent compatibility guards; modeler drawing toolbar/hints/body IDs/owner/export integration. No browser/CAD authoring, ADVANCE edit or commit by this agent. Parent owns actual acceptance and GitHub push.
