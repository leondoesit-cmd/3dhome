# CSWA Question 4: fresh Chrome build

In progress, not accepted against the book yet. Owned Chrome tab 710858429.

## Print-derived dimensions

- Body transverse width A = 76 mm; ramp footprint B = 127 mm.
- Rear plateau 38 mm, front height 50 mm, slope 45 degrees; rear height is therefore 139 mm.
- Front base profile: (0,0), (127,0), (127,50), (38,139), (0,139). Extruded 76 mm mid-plane.
- Central groove width 26 mm, vertical cut depth 26 mm below the ramp; lower line runs from (12,139) to (127,24). Cut sketch closes above the body at Y150. Symmetric 26 mm cut.
- Mounting pad outline: Top-plane vertical slot with centre endpoints (38,+89), (38,-89) mm, radius 38 mm; pad thickness 26 mm. The 178 mm dimension measures the mounting centres; total pad span is 254 mm.
- Two diameter 38 mm through holes; two diameter 57 mm spotfaces, depth 1 mm from Y26.
- Printed rounds are 6 mm, at the pad rims and concave body junctions.

All geometry was authored through visible Chrome drawing tools and forms from a blank model. No imported geometry or prior model seed was used.

## Intermediate exact properties

After body, groove and pad: 1 solid, volume 1,291,178 mm3, COM (48.65009,45.26006,0) mm.

After holes and spotfaces, before rounds: 1 solid, volume 1,229,369 mm3, COM (49.18555,46.85318,0) mm. Printed final targets: volume 1,227,602.22 mm3 and COM (49.21,46.88,0) mm.

The first fillet sequence was undone: four concave junction rounds followed by rim rounds allowed the rim tangent chain to climb the tall rear body edges. These edges are square in the print. Rim-first was refused, as was vertical-junction-only followed by rims. Selecting all six original rim/junction edges together appeared correct and passed the former save check, but the mass card excluded the body. Reopening reproduced the failure.

The native bundle `artifacts/planchard/CSWA-Q4-fresh-unaccepted-2026-09-30.mforge` preserves that browser-authored invalid case for regression. Kernel inspection found `IsDone=true`, `IsValid=false`, unrestricted volume 1,222,625.868 mm3, and closed-solid volume zero. It is explicitly **not an accepted book model**.

`filletBrep` now rejects a result unless it is a valid solid with positive closed-solid volume. The mass card now shows each excluded body's actual error. Twelve exact regressions pass, including valid constant/variable/full-round fillets and this invalid browser case. `npm run check` passes (593 linked modules; 1490 source assertions).

The invalid fillet was deleted through visible history controls. Both through-hole circles now have driving diameter 38 mm dimensions; all five sketches are fully defined. Native Aluminum 2014 was assigned with density 2.80 g/cm3. The sharp ten-step body was saved to the library as `Planchard CSWA Q4 - fresh 2026-09-30`. The earlier eleven-step save was successfully reloaded/reopened before correction.

## Separate-pad workflow and actual fixes

Editing Boss2's Merge result off exposed a display-projection defect: its exact feature became independent but no second editable body projection existed. `transitionExtrudeProjection` now materializes the pad, moves the two dependent cuts with it, and can re-merge it. The compatibility rollback endpoint follows the changed body count. The core body registry now treats an independent boss's support dependency as leaving its support body standing. A browser reopen shows two solid bodies, and an exact regression verifies both body heads plus restoration of the original merged volume.

The standalone pad's two outer top semicircular edges accepted a native R6 fillet. The rounded pad was then combined with the ramp using selected history heads Cut1 and Fillet1. This exposed two further workflow defects: the selection helper appended the selected body's original boss as a third operand, and the display/mass projection did not follow the Boolean result. Explicit history selections now remain authoritative, a canvas fallback uses the current head, and Boolean projections display/weigh the common result once while retaining source records for rollback/failure. Native Combine now visibly shows exactly two operands and rebuilds one solid.

Current healthy stage: **12 editable steps, one exact solid, five fully defined sketches, Aluminum 2014 at 2.80 g/cm3**. Rim-rounded union properties: **volume 1,226,013 mm3; mass 3432.837 g; COM (49.21616,46.91395,0) mm**. The remaining printed R6 junctions should add material; this is still not the final book answer. The two horizontal junction edges, two front vertical junction edges, and all four together were tested through visible native selectors; each produced an invalid shell and was refused. No invalid junction feature was committed.

Protected files:

- `artifacts/planchard/CSWA-Q4-fresh-sharp-2026-09-30.mforge`: ten-step closed sharp fallback.
- `artifacts/planchard/CSWA-Q4-fresh-rim-union-2026-09-30.mforge`: healthy twelve-step current stage.
- `artifacts/planchard/CSWA-Q4-sharp-exact-browser-2026-09-30.png`: sharp mass proof.
- `artifacts/planchard/CSWA-Q4-rim-union-exact-browser-2026-09-30.png`: one-body union mass proof.

Standard ShapeFix repair and tighter fillet construction tolerances did not close the original six-edge invalid shell. This developer investigation used only the already browser-authored native case; it did not author or replace a deliverable model.

Tests: 55 projection/body-head/rollback/failure/tree tests and 24 selection/Boolean projection/body-head/failure tests pass. Module gates pass with 597 linked modules and 1490 source assertions.

Pending: a valid R6 junction sequence that preserves the square tall body edges and matches printed final properties, then final Save/reload/reopen and STEP/native exports. Do not claim the printed mass or final junction fillets are accepted.

## Kernel boundary normalization investigation

The healthy twelve-step union was reloaded and reopened through Chrome. Its native history still shows one solid, twelve editable steps and five fully defined sketches; the exact mass card reproduces the properties above.

The original six-edge native failure becomes a valid closed solid after `ShapeUpgrade_UnifySameDomain` removes redundant Boolean face boundaries from its input. Every chosen edge retains its original kernel identity. Quasi-angular and polynomial sections alone remain invalid. The normalized rational result measures 1,227,609.35 mm3; this is promising but still requires visual browser acceptance and is not yet the delivered final model.

`filletBrep` now retries a rejected invalid result after normalization only if every selected edge survives unchanged, the input stays valid, and its volume is unchanged within numerical tolerance. The retry is restricted to those same selected edges. An impossible R100mm regression still fails and preserves the prior measurable sharp body. Thirteen focused fillet regressions pass; module gates pass with 598 linked modules and 1490 assertions.

Browser final acceptance was interrupted while opening the protected sharp bundle: file selection requires an extension permission that was not changed; the supported JSON-paste form was then opened, but Chrome control disconnected before filling it. Existing tab 710858429 is saved, with the import dialog pending. Continue normal UI import of the protected sharp ten-step file, then select the six original R6 edges and verify visual shape, exact properties, Save/reopen and exports.

## Final nominal-R6 browser stage

Chrome access recovered in a fresh tab, 710858500. The protected sharp native bundle was opened through the visible Open bundle → Project link on this server form, without changing extension permissions or injecting model data. Its same six original rim and junction edges were selected through the native edge browser and R6 was committed successfully. The rendered tall rear edges remain square.

Saved as `Planchard CSWA Q4 - final R6 fresh 2026-09-30` using the offered Save as new copy conflict recovery. Reload and library reopen preserve eleven editable features, one solid and all five fully defined sketches. Browser exact properties before reload: volume 1,227,574 mm3, mass 3437.208 g, COM (49.21465,46.88423,-0.001171089) mm. COM rounds to the printed values; mass differs by 0.082 g (0.0024%), so do not claim an exact match at the book's hundredth-gram precision. Node regeneration of this same native file produces volume 1,227,609.35 mm3 and adaptive integration 1,227,609.24 mm3. No geometry dimensions were adjusted to fit the target.

Protected output: `artifacts/planchard/CSWA-Q4-final-R6-fresh-browser-2026-09-30.mforge` and `CSWA-Q4-final-R6-exact-browser-2026-09-30.png`. STEP export currently returns silently after exact regeneration without downloading; the export owner has been notified. The reported X bounding extent is 130.0003 mm despite the driving B127 body dimension; this requires investigation of curved fillet bounds before claiming an overall-dimension match.

Reopened final exact properties reproduce the same browser mass and COM. A read-only mesh inspection of this saved native body finds X from approximately 0 to 127 mm; the erroneous larger bound comes from `BRepBndLib.AddOptimal` on the spline fillet faces (Node minX -3.203 mm), rather than actual tessellated geometry extending beyond the specified body. This reporting defect remains separate from the valid nominal-R6 solid. No fit-to-target adjustment was made.

## Trimmed native bounds correction

The report now measures six actual trimmed-solid support positions using native distance queries against external planes, with finite-coordinate, original-box and distance-consistency guards. It retains the original bound if any axis query cannot be verified. It never rounds or substitutes the drawing dimension. The reopened final Q4 browser reports X127.012 × Y139 × Z254 mm; the 0.012 mm X residual remains native-kernel tolerance. Proof: `artifacts/planchard/CSWA-Q4-corrected-bounds-browser-2026-09-30.png`. The five Q4/shell bounds tests and module/link/assertion gates pass.
