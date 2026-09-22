# Exercise 5.15 — in progress

Source: PDF page 264, printed page 5-46, visually reviewed.
Saved library record: RIBBED BLOCK - exercise 5.15.

Completed in browser:
- Front-plane 160 × 50 mm rectangle, 60 mm mid-plane extrusion.
- First through cut: profile (32,14), (55,14), (55,50), (18.89707157,50) mm. Slope is 20 degrees from vertical, numerically derived from top width. Both directions enabled.
- Second through cut: X71..148 mm, Y14..50 mm, both directions enabled.
- Three fully defined sketches, six history entries, one solid.
- Exact volume after first cut: 416.1688 cm³, COM Z0; after second cut: 249.8488 cm³, COM (7.058608,1.821204,0) cm.
- Second-cut state saved successfully. First cut save/reopen verified in fresh tab.

Fix: symmetric Through All previously ignored the opposite extent and left half the cut behind (448.0844 cm³ versus expected 416.1688 cm³). Updated core/extrude_extent.js to span both host bounds independently of stored depth. Browser saved-model rebuild confirmed the correct volume and symmetry. 14 extent tests pass, including forward/reverse directions and changing host width; module/link and 1,452 source assertions pass. No full suite run.

Remaining:
- Create centered 21 mm wide rib from X71 to X148, Y14..30 mm, with Up to Surface termination (do not replace it with a blind extrusion).
- Assign Cast Alloy steel with an identified density source; book does not specify a grade.
- Check final volume: 249.848837... + 77×21×16/1000 = 275.720837... cm³.
- Review book origin marker (current origin is rear bottom at X0,Y0,Z0; exact alignment with illustrated marker remains unconfirmed).
- Replace numerically derived slope width with a driving angle if supported, dimension drawing, save/reopen.

Browser work continues in tab 4 (retestTab), 1280×720. Tab 3 repeatedly timed out; saved data was recovered in tab 4. Current UI has mass properties open after second cut, close button mdEvalClose. Tab 4 marked for handoff.

## Continuation: rib and material completed

Browser tab 4: created a fully defined Right Plane rectangle, Z=-10.5..10.5 mm, Y=14..30 mm, plane offset X=71 mm. Extrude/Boss 2 uses Up to Surface, selecting the inner end wall at X=148 mm (`feature_mubxno05_1:face:generated:plane:2`). Eight history steps, four fully defined sketches, one solid. Saved and reopened the geometry successfully.

Exact browser evaluation: volume 275.7208 cm³; centre of mass (7.423753, 1.856748, 0) cm. Matches the independent 275.7208373 cm³ calculation.

Fixed `setView` changing the active sketch during a feature command. Front/Top/Right now use the camera-only path while the feature owns its profile. Reproduced the failure by turning Front before selecting the terminating wall; the preview changed its axis. Browser retest after fix retained the right-plane profile and committed the correct solid. Added regression in modeler_browser_qa_regressions.test.mjs.

Added stock Cast Alloy Steel (SOLIDWORKS reference), density 7.30 g/cm³, with SDC source attribution: https://static.sdcpublications.com/pdfsample/978-1-58503-626-4-2.pdf page 66. This is a reference library material, not a specified manufacturing grade. Assigned through the body material UI; exact mass 2.012762 kg; saved.

Drawing checkpoint: four views, A3 landscape, ANSI style with mm and third angle, two decimal places. Drawing number 5.15, material reference and mass 2012.76 g. Added principal and detail linear dimensions in browser: 160, 50, 60, 77, 12, 16 upright, 55, 23, 21 rib width, 16 rib height, 14 floor, 30 rib top height. Rib-height 16 is redundant with 14/30 and should be removed or made reference. No general tolerance supplied.

Still required: drawing Angle currently takes three snapped points (arm/corner/arm), not two edges. The book's 20° between non-intersecting slope and vertical needs a proper associative two-edge angular dimension; attempted clicks were cancelled without committing an angle. Implement and verify that workflow. Verify exact book origin and slope driving angle; saved sketch still uses the derived horizontal dimension. Finish drawing cleanup and save/reopen verification. Camera view highlight remains tied to sketch plane while feature camera turns; clarify that UI. Broader ebook remains incomplete.

## Drawing angle and cleanup verified

Implemented associative two-straight-edge angular dimensions in the existing Angle tool. Endpoint picks retain the previous three-point mode; interior edge picks select two exact straight topology edges. The saved dimension stores all four endpoint references and resolves their projected line intersection on rebuild. Missing or parallel references flag the dimension as dangling rather than showing a fresh false value. Angular dimensions now have arrowheads. The tool hint describes both workflows.

Browser: selected the slope and upright in Front, created 20°, dragged it into the notch opening, removed the redundant 16 mm rib height, saved, reloaded the app, reopened the library record, and visually confirmed 20° with arrowheads and the cleaned dimensions. Saved drawing has 12 dimensions (11 linear plus the angle). Current tab 4 retained for continuation.

Validation: 58/58 focused tests (sheet and new drawing_edge_angle suite); code checks passed (508 linked modules, 1452 source assertions); git diff --check clean. Test changes the referenced slope from 20° to 35° and checks automatic measurement update; missing/parallel/degenerate references covered. Full suite not run.

Remaining broader checks: exact source origin, replacing derived top-notch width with a driving slope angle in the sketch, reference treatment for the 16 mm upright dimension (dimension chain is redundant with 160/55/77/12), and camera selected-view highlight during feature commands. Continue subsequent ebook exercises after resolving these. Do not describe the entire ebook as complete.

## Reference dimension and source chain corrected

Added an actual Reference checkbox to drawing dimension editing. Reference dimensions format the live computed value in parentheses, including tolerances and secondary units, without freezing a text override. Browser drawing cleanup removed the redundant upright 16 and end-wall 12 dimensions, added source datum 148 and reference (19.50). Saved/reopened and visually verified the reference dimension. The drawing still has 12 dimensions. Unit coverage changes source geometry and verifies the parenthesized value updates after serialization.

Remaining: source origin, driving sketch slope angle, source A-ANSI sheet format (current drawing is A3), camera view highlight. These fidelity refinements remain open; not a complete ebook certification.
