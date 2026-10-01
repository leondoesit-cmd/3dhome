# Exercises 8.6 and 8.6A — browser-authored valve example

Source: PDF page 418, printed page 8-40. The companion Angle Mate assembly is absent and the printed illustration supplies no manufacturing dimensions. This is a labeled designer example demonstrating the printed workflows, not a dimensional reproduction of the companion ball valve.

## Authored from blank through Chrome

Chrome tab 710858447, dark theme, normal sketch tools, driving dimensions, Fix, Extrude, Cut, component insertion, datum-plane selection, and mate dialogs. No model geometry was generated through scripts or imported from an old seed.

Assembly: `Planchard 8.6 - angle valve assembly - fresh designer example 2026-09-30`, key `asm_munfr07d`.

| Component | Editable construction | Final placement |
| --- | --- | --- |
| Body | Right annulus Ø20/12 mm, midplane extrusion 40 mm; Top guide Ø8/4 mm, 18 mm extrusion; Top Ø4 mm stem clearance through cut. Three fully defined sketches, three features, one native solid. | Grounded at origin |
| Handle | Top Ø3.5 mm spindle, 20 mm extrusion; fully defined 30 × 6 mm handle sketch offset 20 mm, 5 mm extrusion. Two sketches, two features, one native solid. | Y rotation −165° |
| Right endcap | Independently blank Top-down part, Right annulus Ø20/12 mm, 3 mm extrusion. One fully defined sketch, one feature, one native solid. | X +20 mm, attached to body end face |
| Left endcap | Independently blank Top-down part, same typed designer dimensions. One fully defined sketch, one feature, one native solid. | X −20 mm, Z rotation 180°, attached to body start face |

The example endcaps are annular flange parts and the body is a simplified tube/guide. It does not reproduce the companion's ball internals or closed service lids.

## Actual workflow verification

- Handle constrained by actual native cylindrical faces, aligned Top datum coincidence, and 165° datum angle. Cold reopened tree reports fully constrained.
- Both new parts authored inside the assembly with transparent context geometry. Tree displays `→ In context`; parent occurrence 1565 and persistent native end-face references survive the stem-cut topology change, Save, project export and reopen.
- Body transparency was set through the Component inspector. Right-click Select other exposed persistent faces and edges behind the transparent body. The spindle's native `side:1541` face was selected through that list.
- Initial exact interference check found 0.039 cm³ between spindle and upper tube wall. A real UI-authored Ø4 mm through cut corrected the omitted clearance. Final native check: **No interference detected**.
- Ordinary component editing entered the handle's local coordinate system with the other components ghosted. Cancel restored the unchanged occurrence. Corrected body Finish created one whole `Edit component` Undo step; actual UI Undo/Redo retained the solved assembly.
- Final editable project saved and reopened in Chrome. Exact STEP export contains **four MANIFOLD_SOLID_BREP entities**, one per occurrence.

## App gaps fixed

- New part in context: blank virtual component anchored to an actual selected parent planar face, editable local part authoring, Finish, contextual ghosts, parent/reference issue reporting, and persisted assembly draft recovery.
- Parent face placement follows changed source face/parent rotation; missing/cyclic parents are reported. Regression verifies geometry history is preserved. This is **associative placement**, not cross-part driving of the typed Ø20/12 dimensions; those remain ordinary editable sketch dimensions.
- Edit component for any saved part occurrence, including material/custom properties. Working definition is deep copied; source is untouched until Finish; Cancel discards it. Finished edit gives a copy-safe atomic Undo baseline and preserves ordinary placement/modelKey without inventing a parent. Switching document editor resets its local history; previous assembly Undo branches are not retained across this workflow.
- Per-component transparency and persistent Select-other face/edge selection in assemblies.
- Zoom to fit includes assembly context ghosts during local component authoring.

Focused tests: 13/13 passed (`assembly_context`, `component_edit`, Chapter 8 mechanical mates). Gates passed: no free identifiers, no link errors, and 1490 source assertions. Existing unrelated agents' files were preserved.

## Protected proof

- `artifacts/planchard/ANGLE-valve-final-browser-2026-09-30.mforge` — final corrected assembly, 1,652,362 bytes.
- `artifacts/planchard/ANGLE-valve-final-browser-2026-09-30.step` — exact four-solid assembly, 132,001 bytes.
- `artifacts/planchard/ANGLE-valve-no-interference-browser-2026-09-30.png` — native collision result.
- `artifacts/planchard/ANGLE-valve-select-other-browser-2026-09-30.png` — persistent face/edge choice list.
- `artifacts/planchard/ANGLE-valve-component-edit-browser-2026-09-30.png` — local handle editing with correctly positioned assembly ghosts.
- Original two-component and pre-clearance four-component checkpoints remain separately protected.
