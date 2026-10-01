# Chapter 8.4 travel-limit repair

Book reference: PDF page 416, Exercise 8.4, Limit Mate. The companion assembly and its measured travel limits are not supplied by the printed page; no replacement assembly is claimed here.

## Gap and change

`cad_mate_model.js` formerly clamped the stored `value` between `min` and `max` and always pulled the moving plane to that fixed distance. An interior slider therefore lost its translation freedom, preventing the exercise's limited motion workflow.

Limit mates now clamp the **current signed plane separation**. Interior placement is retained, while overshoot is corrected to the nearest end stop. Plane orientation remains constrained. Equal bounds remain a fixed distance. Distance and Coincident behavior is unchanged. The one-argument `mateOffset` fallback preserves existing callers that read the stored value outside geometry evaluation.

## Verification

- Six focused suites: 76 tests pass, including the three new behavioral travel tests, existing screw/angle/face/chain mates, opposite cylinder axes, exact hook/bore contact and mate selection.
- New tests verify multiple interior positions with one sliding DOF, both end-stop overshoots, return from each stop to the interior and equal-limit fully constrained behavior.
- The older mechanical fixture now expects correction from signed separation -5 to the lower stop +1, rather than its stored fixed-distance target +3.
- `npm run check` passes: 587 modules, 1,489 source assertions.
- Log: `scratch/planchard/limit-mate-regressions-2026-09-28.log`.

## Actual desktop Chrome acceptance

Built a blank assembly entirely through the dark desktop Chrome UI, inserting this run's freshly authored AXLE and SHAFT COLLAR. Its name explicitly labels it as an axle/collar example rather than the unavailable companion slide. Two aligned Coincident planes retain axial movement; a Front-plane Limit supplies the stops.

- Added unit-aware Minimum travel and Maximum travel inspector fields, with finite/ordered validation and Undo support. A reversed minimum was rejected and the prior bound restored in actual Chrome.
- Chosen example bounds: 0.2 to 1.1 cm. Interior poses 0.75 and 0.9 cm remain in place with one sliding DOF.
- Placement overshoot 2 cm corrected to 1.1 cm; -1 cm corrected to 0.2 cm. Moving back to 0.9 cm restores interior freedom.
- Saved, reloaded and explicitly reopened the named assembly from Library at two different interior poses. The protected exported bundle independently records three topology mates, bounds 0.2/1.1 and moving component Z=0.9.
- Bundle: `artifacts/planchard/LIMIT-MATE-8.4-browser-2026-09-28.mforge`; screenshot: `artifacts/planchard/LIMIT-MATE-8.4-browser-2026-09-28.png`. Dedicated Chrome tab 710851398 remains open.

At an end stop the current DOF diagnostic reports fully constrained; returning inside reports one DOF. This reflects the active inequality in the local numerical diagnostic, not a fixed interior position. Interference was not checked, and the companion slide geometry is not claimed recreated.

The inspector's existing stored value is no longer an interior-position constraint for Limit mates. Component movement sets the position; minimum and maximum set the permitted interval.

## Unrelated-sketch worker cache repair

Actual HOUSING authoring exposed an upstream Shell replay when only the active editor sketch changed. `cad_worker_runtime.js` now includes the legacy active sketch in a prefix key only when that feature actually resolves its profile through the legacy fallback. Named canonical sketch dependencies stay in the key; missing named profiles using the first canonical sketch remain tracked. Three focused key tests cover unrelated sketch stability, actual profile invalidation and legacy/first-sketch fallback invalidation. Actual HOUSING acceptance is owned by the parent agent alongside its separate exact-topology stamp repair.

Follow-up read-only comparison of the protected HOUSING bundle demonstrated a worker Shell key mismatch when only Boss-Battery's saved attached frame was replaced by its newly compiled frame (origin roundoff x≈1.31e-14, y difference≈4.8e-15). Worker keys now normalize numeric values within frame/localFrame to twelve decimal places, consistent with the topology stamp. A fourth focused test verifies these actual values retain the key, while a 1e-8 frame shift, 5e-13 nonzero driving-depth edit and 5e-13 nonzero profile-point edit invalidate it. All four worker key tests and current588-module/1489-assertion gates pass. Actual warm worker timing is not claimed here.
