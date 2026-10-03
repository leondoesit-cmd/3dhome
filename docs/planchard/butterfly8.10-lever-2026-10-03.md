# Exercise 8.10 continuation - 3 October 2026

Source: printed page 8-45 / PDF page 423. The exercise leaves valve dimensions to the reader. This is a declared designer example continuing the task-created fresh body, seat, disc and stem from 1 October.

## Fresh actuator lever completed

Built from a blank part through visible desktop Chrome controls, circle/rectangle pointer drawing, point positioning, Smart Dimensions, extrusion forms and material controls. No script authored geometry.

- Top-plane origin circle: diameter 26 mm; symmetric 8 mm boss along Y.
- Separate Top-plane arm: X -100 to -8 mm, Z -8 to +8 mm. Fixed inner corner and driving 92 mm length / 16 mm width; symmetric 8 mm merged boss.
- Top-plane origin shaft bore: diameter 12 mm, symmetric 20 mm cut along Y.
- Front-plane origin cross-pin passage: diameter 3 mm, symmetric 30 mm cut along Z.
- Four fully defined sketches, eight history entries, one exact native body; rebuild succeeded with no saved issues.
- Body material: Aluminum 6061, displayed density 2.70 g/cm3. This is a designer choice, not production qualification.

Saved library name: `Planchard 8.10 - Butterfly lever - fresh design example 2026-10-03`; key `cm_murodqbk`.

Protected actual browser exports:

- `artifacts/planchard/BUTTERFLY-lever-shaft-bore-browser-2026-10-03.mforge`: earlier checkpoint before cross-pin passage/material.
- `artifacts/planchard/BUTTERFLY-lever-cross-pin-al6061-browser-2026-10-03.mforge`: accepted completed lever checkpoint.
- `artifacts/planchard/BUTTERFLY-lever-cold-reopen-browser-2026-10-03.jpg`: browser reload and saved-library reopen, eight valid history entries, one native part, visible shaft and transverse pin passages.

Read-only export inspection independently confirms exact dimensions, principal planes, symmetric extents, material and clean rebuild status. After loading the new sketch-display code, the cold-reopened lever has no stray consumed sketch profiles in its 3D view. Curved surface display fixes have targeted test coverage; curved browser visual acceptance is still pending.

## Matching passages, pins and materials completed

All changes below were made with visible Chrome controls and pointer sketching, then saved and exported through Project bundle.

- Stem: two fully defined Front-plane circles, diameter 3 mm, centers (0,0) and (0,70 mm). One symmetric 30 mm Z cut; four history entries, one native body. Existing Steel 304 retained.
- Disc: fully defined Front-plane origin circle, diameter 3 mm, symmetric 30 mm Z cut. Eight history entries, one native body. Steel 304 assigned to the body (8.00 g/cm3).
- Fresh disc pin: blank part, Front-plane origin circle diameter 2.9 mm, symmetric 20 mm Z boss. Key `cm_murp3bqy`.
- Fresh lever pin: separate blank part, Front-plane origin circle diameter 2.9 mm, symmetric 26 mm Z boss. Key `cm_murp5dri`. Cold reload/library reopen confirmed two valid history entries and one native body.
- Both pins have one fully defined sketch and Steel 304 body material. Their nominal 0.1 mm diametral clearance is a declared designer choice; axial retention and manufacturing tolerances are not production-qualified.
- Body: Steel 304 assigned to the body; seat: Nitrile rubber assigned to the body, density 1.30 g/cm3. An initial face-only body appearance action was undone before assigning the body material.

Protected accepted exports are `BUTTERFLY-stem-cross-pins-browser-2026-10-03.mforge`, `BUTTERFLY-disc-cross-pin-steel304-browser-2026-10-03.mforge`, `BUTTERFLY-disc-pin-browser-2026-10-03.mforge`, `BUTTERFLY-lever-pin-browser-2026-10-03.mforge`, `BUTTERFLY-body-steel304-browser-2026-10-03.mforge`, and `BUTTERFLY-seat-nitrile-browser-2026-10-03.mforge` in `artifacts/planchard/`. Read-only inspection confirms native clean rebuilds, exact circle centers/radii, symmetric depths and materials.

After reloading the performance change, a cold-opened seat's first Save reported `data-exact-save-validation=rebuilt`; repeated Save reported `reused`. Both saves finished clean. Browser timing was inconclusive, so no speedup percentage is claimed.

The completed parts are durable in the library and protected bundles; tabs can close safely after Save. Remaining work is assembly mates/motion/interference and the required ANSI A landscape third-angle exploded drawing with explode lines, BOM, balloons, notes and properties. Full Exercise 8.10 remains incomplete, at printed page 8-45 / PDF page 423.

## Disc rotation clearance and assembled mechanism

Through Chrome rollback controls, inserted a 6 mm equal-distance chamfer on both outer disc rims after the hub boss and before the stem bore. Released the rollback bar, rebuilt both bore cuts, saved, and exported `BUTTERFLY-disc-swept-clearance-chamfer-browser-2026-10-03.mforge`. Nine history entries, one native body, no rebuild issues. The disc is diameter 59.8 mm, symmetric **14 mm** plate thickness, with a symmetric 20 mm hub; an older saved description incorrectly stated 8 mm.

The beveled rim has a maximum swept radius about 29.917 mm, within the seat's 30 mm bore radius. This is geometric clearance for the declared example, not sealing or production qualification. The original large bevel failed after the transverse stem bore; its valid feature order was established by native-kernel diagnosis and then authored through the browser.

Created the seven-component assembly `asm_murpeeoj`, with grounded body, fixed seat, concentric stem, axial alignment, four rotating rigid attachments, and a 0–90 degree plane-angle range. Eight mates, **one rotational degree of freedom**. A saved 15 RPM Y-axis motor drives the stem and attached disc, lever and two pins. Chrome's exact interference checker reported **All visible components / No two components overlap** at 45 and 90 degrees. Returned the motor to time zero and saved.

Seven explode steps separate seat Z+8 cm, disc Z+16 cm, stem Y+18 cm, lever Y+32 cm, disc pin Z+26 cm, and lever pin Y+32 cm then Z+12 cm. Chrome animation reached `Complete · 7 steps`. The protected browser bundle `BUTTERFLY-assembly-motion-explode-browser-2026-10-03.mforge` independently retains all seven steps, the time-zero motor and the committed 0/90 angle limits. Cold library reopening preserves eight mates and one DOF.

Browser acceptance also confirmed the revised motor-only form and centered exploded Fit view, including the previously clipped lever.

## Exercise 8.10 accepted checkpoint

The final native SVG is ANSI A landscape, 279.4 × 215.9 mm, third angle, with an automatically fitted 1:4 isometric exploded view, seven BOM rows, seven balloons, dashed explode leaders, four general notes and the PL-8.10 revision A title block. Chrome visual inspection confirmed that parts, balloons, notes, BOM and title block remain inside the sheet. Component descriptions explicitly retain the corrected 14 mm disc thickness and individual material choices.

Accepted files: `artifacts/planchard/BUTTERFLY-ANSI-A-exploded-browser-2026-10-03.svg`, its `.jpg` browser proof, and `BUTTERFLY-assembly-accepted-browser-2026-10-03.mforge`. After fixing property-dialog/header synchronization, root reloaded Chrome, changed Description through Custom properties, saved the assembly and exported again. Read-only inspection confirms Description `BUTTERFLY VALVE - DESIGNER EXAMPLE`, seven components, one legacy mate plus seven topology mates, seven explode steps, the time-zero motor and 0–90 degree limits. All geometry was authored through browser controls.

Exercise 8.10 is complete as a labeled designer example, at **printed page 8-45 / PDF page 423**. The next exercise is 8.11 Shock on printed 8-46 / PDF 424. The library save and protected bundle make this checkpoint independent of open tabs; closing tabs is safe. Preserve browser storage or recover from the committed native bundle.

Validation: module/link/source checks passed; focused motion, drawing, persistence and browser harness tests passed. The full test run exposed additional pre-existing/native-kernel and stale-harness failures, so full CI is not claimed green. Repairs and follow-up verification are tracked separately.
