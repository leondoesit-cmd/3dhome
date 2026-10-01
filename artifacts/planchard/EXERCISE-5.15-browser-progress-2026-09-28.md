# Exercise 5.15 — browser reconstruction in progress

Source: supplied Planchard 2021 PDF page 264, printed page 5-46. The book illustration was rendered and inspected before browser authoring. New geometry was authored from blank in desktop Chrome, dark ModelForge UI, tab 710849178; no prior model geometry was reused.

## Interpretation

- MMGS, Cast Alloy Steel; symmetric about Front Plane.
- Stock 160 × 60 × 50 mm, Boss Extrude 1 Mid-plane, 60 mm.
- Origin at the left trough's inclined-wall/floor intersection, on the symmetry plane. Stock bounds relative to it: X −32…128 mm, Y −14…36 mm, Z −30…30 mm.
- First trough: floor 23 mm, floor height 14 mm, inclination 20° from vertical. Derived top X is −13.1029284336 mm. Its directed line-to-line angular dimension is −160°, equivalent to the printed 20° inclination.
- Second trough: X 39…116 mm, floor Y 0 mm, top Y 36 mm; 77 mm span and 12 mm end wall.
- Final rib: 21 mm wide, centered over the 60 mm depth (19.50 mm each side); top 30 mm above stock bottom (16 mm above floor). Extrude from central wall to end wall, Up To Surface.

## Preserved browser checkpoint

`EXERCISE-5.15-first-cut-browser-checkpoint-2026-09-28.mforge` is an actual Project bundle export from the UI. It preserves two sketches and two features (four history steps): the 60 mm Mid-plane stock and first Through All cut. The exported sketches include the fully defined stock and the signed −160° angular constraint on the first trough. A helper construction line locates the stock corner relative to the requested origin.

The base exact rebuild remained queued for over 400 seconds. After a clean reload and Restore draft, the model recovered with four steps and the first trough fully defined. A new blank Front sketch was added for the second cut. Chrome then timed out during actual typed Line input and its following AX observation. The tab has been preserved; do not assume the partial second sketch is complete.

## App repair

The dimension editor rejected its own signed angle because it applied the positive-length validation rule to angles. `applyDimensionEditor` now permits finite signed and zero angles, retaining positive-only lengths. Two focused behavioral tests exercise the real function; both pass. `npm run check` passes (582 linked modules, 1498 source assertions). Browser acceptance of Apply awaits recovery.

## Remaining acceptance

### Continuation at 11:42

The fresh authoring was recovered through the app's Saved drafts UI in Chrome tab 710849234. Both Through All cuts are present in six history steps, with all three sketches fully defined. Exact browser volume is 249.8488 cm³, matching independent rebuild of the protected UI export `EXERCISE-5.15-two-cut-browser-checkpoint-2026-09-28.mforge`: 249.84883729173 cm³, no rebuild issues. Bounds are X −32…128, Y −14…36, Z −30…30 mm. Save completed cleanly.

A fourth blank Right-plane sketch was authored in the browser: 21 × 16 mm rectangle, corners Z ±10.5 mm and Y 0…16 mm, two driving dimensions and one fixed corner, fully defined. Cast Alloy Steel density 7.30 g/cm³ was assigned to the body. These authoring inputs are protected in the actual UI export `EXERCISE-5.15-rib-sketch-browser-checkpoint-2026-09-28.mforge` (seven steps). The final boss is not committed.

Applying the second cut exposed a whole-editor inert lock while its exact preflight waited indefinitely. The new implementation keeps Cancel accessible, aborts pending cut verification, and prevents partial results from publishing. Worker startup now acknowledges requests before loading the runtime; cut intersection runs in the worker and returns a compact report. Focused behavioral tests and module/import/source checks pass. Browser cancellation of a newly pending cut still needs explicit acceptance.

The sketch Offset field reverts to zero during canonical rebuilding; a separate repair is underway. The equivalent boss start offset of 39 mm was entered in the browser. A stable terminating-face picker is being added so the final Up To Surface boss can explicitly reference the inner end wall at X 116 mm.

Finish the final Up To Surface rib, evaluate final exact volume/center of mass, export STEP, save/reopen clean, and capture browser proof. Final-part acceptance is not yet claimed.

Analytical target for the interpreted final geometry: 275.7208372917 cm³; at density 7.30 g/cm³, mass 2.0127621122 kg. Center of mass relative to the proposed origin: X 42.2375303168 mm, Y 4.5674752310 mm, Z 0 mm. These are calculated targets, not measured browser results.

### Final browser acceptance at 11:58

The final rib was committed through Chrome using the actual pocket start face at X39 mm and the new exact Terminating face selector at X116 mm. The face-local sketch origin is at Y18 mm; an actual UI translation of −18 mm places the 21×16 mm profile against the floor. Eight history steps, four fully defined sketches and one merged solid are saved.

Browser exact volume275.7208cm³, mass2.012762kg, density7.30g/cm³ and COM(4.223753,.4567475,0)cm agree with independent rebuilding of the actual UI bundle:275.72083729173005cm³, COM(4.223753031676329,.4567475231003513,0)cm,11 compiled features and no issues. The earlier target is now measured and accepted. Library reopen retains all eight steps and four fully defined sketches. STEP export is58,713bytes.

Changing the rib driving height16→17mm through the real sketch dimension field propagated to277.3378cm³ and2.024566kg. Undo restored16mm and275.7208cm³; the restored model was saved and exported. Final files are `EXERCISE-5.15-browser-2026-09-28.mforge`, `.step` and `.png`.

This run exposed two additional UI defects: Offset value edits could bypass the change listener, and an open Mass properties card retained old COM after a sketch translation. Reload/reopen and reopening Mass props showed the correct current geometry. Separate event/refresh repairs are in progress; neither stale display is counted as the final measurement.
# Attached-face offset repair acceptance

Latest source loaded by actual Chrome reload and canonical saved-library reopening. Attached rib sketch offset0→1mm through numeric input and Apply sketch offset now propagates to exact native solid:275.3848cm³,2.010309kg, COM(4.224087,.4563287,0)cm. Exact reduction.336cm³ matches21×16×1mm removed rib length. Actual screenshot EXERCISE-5.15-attached-offset-repaired-browser-2026-09-28.png protected. Undo restores clean canonical offset0 and exact275.7208cm³/2.012762kg/COM(4.223753,.4567475,0)cm, verified in the live mass card. Authoritative book model/export remains unchanged.
