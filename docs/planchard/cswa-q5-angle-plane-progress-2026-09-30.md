# CSWA Question 5: fresh browser progress and angle plane repair

Built from a blank model in desktop Chrome tab 710858411, through visible controls. No prior model seed or script geometry was used. Library name: `CSWA Q5 - fresh interpretation 2026-09-30`.

## Capability repair

- Reference Plane now supports a driving rotation around a principal axis with a typed pivot, or a selected straight edge. The axis must lie in the parent plane.
- Angle definitions survive serialization and follow rebuilt selected edges.
- Dependent sketch frame axes rotate along with the normal. Previously, merely replacing the normal could leave retained sketch axes outside the plane after an angle edit.
- Source: `js/core/offset_planes.js`, narrow `openOffsetPlaneForm` in `js/modeler.js`.
- Tests: `node --test tests/reference_plane_angle.test.mjs tests/offset_planes.test.mjs`: 12 passed. `npm run check`: 593 modules linked, no free identifiers, 1489 source assertions checked.

## Browser-authored geometry

1. Top Plane rectangle 3 × 4 in, centered, fully defined; reverse 1 in base extrusion.
2. Top-parent reference plane, X axis, pivot (0, 0, 2 in), rotation 48°.
3. Circle diameter 3 in, plane coordinates U=0, V=3 in, fully defined; reverse 3 in boss.
4. Bore diameter 2.25 in, same center, fully defined; reverse through-all cut.
5. Human rollback UI inserted the side support before the cut. Side profile (Z,Y) in inches: (0,0), (-2,0), (-2.23682629551,0.222042657356), (-1.11192028234,1.23491258106). These upper points are derived intersections of the printed 48° support sides with the cylinder axis. Centered 3 in boss.
6. Center rib guide from (Z=2,Y=0) to the front circle center (Z=-0.007391819076,Y=2.22943447643). Fully defined, thickness 1 in, both sides, up to body. Released rollback to include the final bore.

The initial reading of dimension B as a step above the base was corrected: B measures the base thickness. At the projected rear corner, the base bottom overlaps the projected mid-depth top edge, which made the line misleading in the small image.

## Acceptance status

**Not accepted yet.** The five solid features exist; exact final rebuild and comparison remain required. Before support/rib, the exact checkpoint volume was 19.45979 in³ and center of mass (0, 0.3048423, -0.4056003) in. No material was assigned at that checkpoint (mass panel used its stated steel fallback).

Book target: volume 30.65 in³; 6061 density 0.097 lb/in³; mass 2.99 lb; center of mass (0, 0.73, -0.86) in. These values are acceptance checks, never fitting inputs.

## Protected artifacts

- `artifacts/planchard/CSWA-Q5-fresh-partial-browser-2026-09-30.mforge`: browser Project Bundle export before support/rib, 175182250 bytes. Export includes the current library; only its main model belongs to this Q5 authoring session.
- `artifacts/planchard/CSWA-Q5-angle-plane-browser-2026-09-30.png`: actual Chrome edit dialog showing saved 48° angle, X axis, pivot Z=2 in.

Browser download events timed out in the automation wrapper, but the two native Chrome downloads completed in Downloads. The first was copied unchanged into the protected artifact directory. No import/restore was used for this Q5 build.

## Rib and source-dimension audit

Full initial five-feature checkpoint is protected as `artifacts/planchard/CSWA-Q5-five-feature-browser-2026-09-30.mforge` (175617829 bytes). With the mistaken Perpendicular rib orientation, exact volume was 23.27492 in³ and COM X=0.1086878 in. Editing Rib through Chrome to Parallel to sketch / Both sides / Down (-V) restored X=0 exactly; volume 21.29777 in³ and COM (0,0.3076447,-0.3337062). Both-sides symmetry is working for the intended in-plane rib; no kernel symmetry defect was found.

A further visual source audit corrected the major dimension interpretation: the 4.50-inch extension reaches the cylinder centre, and 3.00 reaches the lower tangent. The prior V=3 centre was incorrect. Cylinder and bore centres were changed through their sketch point-coordinate forms to U=0,V=4.5. The support upper points were changed through the same UI to (-3.240522205047,1.336759895572) and (-2.115616191883,2.349629819280), derived from the existing printed 48-degree support lines and updated tube axis. Rib tip was changed to (-1.011087728615,3.344151714648). Final exact comparison is pending; this model remains partial until it agrees with the source.

Final corrected checkpoint: **one merged solid body**, five solid-producing features, five fully defined sketches. Chrome exact mass panel shows volume **30.64231 in³**, COM **(0,0.7229636,-0.8672443) in**, 6061 density **0.0975437 lb/in³** (2.70 g/cm³), mass **2.988964 lb**, which rounds to the book's 2.99 lb. Volume differs by 0.00769 in³; Y and Z are within 0.01 in of the printed values but round to 0.72 and -0.87, so this is **not an exact printed COM match**. Keep that mismatch visible in acceptance status. No dimensions were changed to fit mass/COM targets.

Protected corrected export: `artifacts/planchard/CSWA-Q5-corrected-centre-6061-browser-2026-09-30.mforge`, 175558941 bytes, native Chrome export copied unchanged. Proof screenshot: `artifacts/planchard/CSWA-Q5-corrected-centre-6061-browser-2026-09-30.png`. Model saved in current-run library.

Display faceting alone is not evidence of polygon mass properties: source `sketchProfileSegments` returns analytic circles and extrusion/cut pass those segments to the kernel. Remaining precision difference needs source/geometry audit before claiming exact acceptance.
