# CSWA basic Question 4 — native corner quality repair

The model was originally constructed from a blank document through Chrome controls. The protected original R6 record remains intact. A named copy was used for this repair and its save/reopen/export checks.

## Geometry repair

The native fillet produced a closed solid, but two freeform corner surfaces did not accurately meet their boundaries. Maximum native tolerance was 0.020843673 cm, above the existing 0.001 cm STEP limit. That export limit remains unchanged.

`fillet_corner_repair.js` rebuilds only small, loose BSpline corner faces with three or four boundary edges supported by two cylindrical rounds and one or two planar boundaries. Every original edge is retained as a filling constraint; cylindrical boundaries impose G1 tangency. Filling error, sewing closure, native validity, recomputed edge/vertex tolerance, positive volume, and volume preservation all gate acceptance. Rejected repair leaves its source unchanged.

A restored Boolean prefix can make OCCT produce a four-sided corner where a fresh Boolean produces a three-sided corner. Both paths are covered. Operation revision stamps expire old fillet results in worker storage and saved exact topology, while unchanged Shell prefixes remain valid.

## Verification

- Three native tests pass: accurate fresh corner repair with source preservation; accurate fillet after restoring the Boolean prefix, including STEP export; and unsupported R5 geometry still rejected by the existing STEP accuracy gate.
- Module, link, and source assertion gates pass.
- Actual Chrome reopened the R6 copy and rebuilt one body with five fully defined sketches, eleven history entries, and bounds **127 × 139 × 254 mm**.
- Save validation completed. Native STEP export succeeded through the Output button; the saved project bundle contains the unchanged printed 6 mm radius.
- Actual browser Mass properties displays **1,227,579 mm³, 3437.220 g**, centre **49.21455, 46.88418, -0.001330297 mm**, and exact bounds **127 × 139 × 254 mm** after the restored native prefix.
- Cold reload and library reopen of the saved record retained the same accurate bounds, one body, eleven entries, and five fully defined sketches. No unsaved-change marker remains.

## Numerical limits

The fresh native build gives volume 1,227,619.542 mm³. Restoring the upstream Boolean and rebuilding gives 1,227,578.594 mm³, a 0.0033% difference between native construction paths. Both are closed and meet the accuracy limit; both centres of mass round to the printed 49.21, 46.88, 0 mm.

At the printed density 0.0028 g/mm³ these volumes give 3437.3347 g and 3437.2201 g. The book states 3437.29 g and 1,227,602.22 mm³. The small residual is recorded rather than adjusted through driving dimensions. This is an accepted geometry quality repair, **not a claim that the book's mass matches to its last printed decimal**.

## Protected outputs

- `artifacts/planchard/CSWA-Q4-native-corner-repair-browser-2026-09-30.mforge`
- `artifacts/planchard/CSWA-Q4-native-corner-repair-browser-2026-09-30.png` — actual Chrome measurement and model proof.
- `artifacts/planchard/CSWA-Q4-native-corner-repair-cold-reopen-browser-2026-09-30.png` — saved record after reload.
- `artifacts/planchard/CSWA-Q4-native-corner-repair-browser-2026-09-30.step` — restored-prefix browser output, 741,912 bytes.
- `artifacts/planchard/CSWA-Q4-cold-native-corner-audit-browser-2026-09-30.step` — fresh native browser output, 743,350 bytes.

Earlier pad-first rounding was retained separately as an incomplete diagnostic construction; it is not the final book model.
