# Two-leg unfolded Aligned cut-face section

## Supplied source and finite scope

The supplied ebook PDF page 494, printed page 10-14, review question 5 shows two radial cutting legs meeting at the centre of a circular parent view and an unfolded longitudinal cut section. The correct recognition answer is Aligned Section. This source supplies neither a dimensioned authoring model nor a complete click procedure, so this implementation demonstrates the mechanism with an explicitly illustrative cutting path on an existing real model. Previously accepted recognition answers do not establish browser workflow completion.

This release implements a genuine **two-leg unfolded cut-face section**. It intersects the actual current triangle mesh with two depth-parallel planes through a shared hinge, clips each plane's real material rings to its positive radial half, and rotates the first half onto the negative side of the second. Source depth and radial distances remain actual model distances. It draws true cut material and its voids; it does not rename a straight section or manufacture hatch-filled background polygons.

It deliberately excludes the solid geometry behind the cutting planes, arbitrary multi-bend offset paths, overlapping-body unions, nonlinear native anchor remapping, and modified/exploded/shaded parents. Closed manifold source sections are required; ambiguous/open boundaries fail with an explicit diagnostic. These limits remain qualifications on general SOLIDWORKS section parity.

## Ordinary UI

The drawing toolbar has **Aligned cut-face section**. Select it, click endpoint A in an ordinary principal parent, click the shared hinge, click endpoint B, and press Enter. Escape cancels. The path preview and hint identify the three picks. The tool validates both material intersections before making one Undo entry and creates a dependent view captioned `ALIGNED CUT-FACE A-A (UNFOLDED)`, with the actual two-leg cutting path, sight arrows and tags on the parent.

Drawing and geometry changes during the gesture reject stale picks. The controller uses persistent IDs and reacquires normalized live document/view records after Undo capture. It inherits the parent's saved configuration and rejects a subsequent configuration mismatch. Deleting the parent cascades to its section and annotations. The modifier persists in the ordinary sheet document; there is no CAD shape mutation or injected/imported model.

## Geometry, rendering and dimensions

- The shared sheet projector derives both native mesh intersections afresh; upstream geometry rebuilds therefore drive the section without changing its saved cutting path.
- Cut faces retain separate even-odd material regions, including genuine hole/island boundaries. Canvas and SVG share the same hatch and cut-boundary primitives. Artificial closures at the unfolding hinge delimit hatch regions and do not draw an invented material seam.
- Real cut depth is horizontal; unfolded signed radial distance is vertical. Reversing an ordinary principal parent uses that parent's real basis. Non-right-angle radial cuts preserve their actual lengths.
- Unfolded coordinate dimensions are frozen references and measure actual unfolded distances. Automatic extents can reread the derived geometry. Native persistent-ID dimensions/notes on this nonlinear projection are explicitly diagnosed and omitted; topology snaps, imported Model Items, and hole-callout leader selection exclude this view. Parent native dimensions and geometry remain unchanged.
- Failed source projection emits `invalid-aligned-section` and a visible unavailable caption instead of displaying an unrelated ordinary view. The projector cache includes the cutting path and persistent parent's state.

## Verification

`tests/drawing_aligned_section.test.mjs`: **6/6 PASS**. Covers real plane intersections; source mesh immutability; omitted artificial seam; all six principal directions; 45-degree non-right-angle cutting legs with true radial length/area; actual OpenCascade extrusion with two distinct through-voids, preserved unhatched voids and native depth rebuild; true coordinate dimensions; shared SVG/cold equality; parent marker/deletion; invalid source, path, missing parent/configuration/composition; actual normalized controller three-pick authoring, single Undo, cancellation and stale-source rejection.

Related drawing regression batch: **100/100 PASS**, including Alternate Position, straight Section/Detail, Auxiliary, Crop, Broken-out and aligned Break. Module/import/source assertion gates: **674 modules and 1487 source assertions PASS**. Independent read-only review by `ui_finish_audit` also reran the focused suite and confirmed genuine cut-face-only geometry with no confirmed defect within that finite scope.

These are automated code/native tests, not an actual Chrome acceptance claim. Parent owns actual browser authoring, artifact protection, journal updates and commits.

## Required actual Chrome witness

1. Reopen a saved real native cylindrical/drilled part with a circular principal end view, e.g. an accepted source-qualified Chapter 5 model. Record the chosen principal parent and illustrative paper picks; do not claim unspecified review-figure dimensions.
2. Use the ordinary toolbar and click a radial endpoint, centre hinge and second noncollinear radial endpoint; press Enter. Inspect the new cut faces, hatching/voids, parent cutting path and explicit unfolded caption. Protect the actual bundle, SVG and screenshot.
3. Change a real upstream depth or intersected hole driver through the native feature UI. Rebuild and inspect the corresponding genuine cut-face change; source geometry must match the ordinary native/STEP witness and all parent native dimensions must retain their meaning.
4. Undo/redo authoring or the upstream driver; restore the intended source values. Check that a degenerate path or nonintersecting leg rejects before adding a view.
5. Save through the app; hard reload; reopen the exact saved record. Export bundle/SVG/screenshot and compare the entire saved sheet, cutting metadata, source configuration and SVG. Keep native geometry/STEP agreement separate from the paper projection audit.

Full physical-print or general all-background/multi-bend Aligned Section completion is not established by this release.
