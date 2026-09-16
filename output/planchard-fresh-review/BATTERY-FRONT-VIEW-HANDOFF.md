# BATTERY continuation: pocket passes; Front view blocks final measurement

## Status

The latest saved-model pocket correction passed visual browser retest: after reload and opening a copy of `BATTERY - ebook browser review`, the top view showed all four rounded inside corners. This supersedes the visual failure in POCKET-RETEST.md. The supplied kernel/test measurements were not independently rerun.

Continued through the top-rim fillet and both tapered terminals using the real browser UI. Saved as **BATTERY - rim and terminals**. Nine history steps, one solid, fully parametric, successful rebuild; Save to library no longer shows unsaved changes. The browser tab is retained. No app code changed.

## New functional blocker: Front view displays the top of the battery

Source: Planchard chapter 5, printed page 5-26 / PDF page 244, steps 172–177. The activity selects Front and measures terminal top versus body bottom, expecting overall Delta Y = 114.3 mm.

### Reproduce from the continuation workflow

1. Load the corrected saved BATTERY pocket.
2. Apply a 1.27 mm constant-radius fillet to the thin top rim: in Fillet, select Face filter, then click the top rim. UI selects 16 boundary edges (outer and inner loops); commit. `Fillet 2` appears and the rim visibly rounds.
3. Select the recessed pocket floor and Create sketch on reference. The selected support is `feature_mu495t59_4:face:generated:plane:4`.
4. Create two equal circles, diameter 12.7 mm. First center at sketch origin, second in upper-left quadrant. Add a 25.4 mm center-distance dimension. Connect centers with a construction line; use a vertical construction reference and a 45-degree angle dimension. Sketch reports fully defined.
5. Finish sketch, Extrude: Blind, Along normal, Depth `15.24mm`, Draft angle `5`, Draft outward unchecked, Add material, Merge result checked. Commit. Two tapered terminals appear in isometric view; the app creates Extrude / Boss 2 and Extrude / Boss 3 sharing the sketch.
6. Open Evaluate > Measure, then click **Front · X·Y**.
7. Observe: Front is highlighted, but the canvas displays the rounded-square pocket and both circular terminal tops from above, rather than the tall front silhouette.
8. Observe again after the view has settled: unchanged. Close Measure and click Front · X·Y again: same top-looking result.

The recessed face remains selected throughout this reproduction, and the Create sketch on reference button remains visible. The right inspector changes to `The sketch is empty` after the view change even though the terminal sketch had been fully defined. This is additional observed context, not a separate established root cause.

### Expected

Front · X·Y should show the world X/Y projection: the tall battery body and terminals above it. Its label, highlighted state, camera orientation and pick/measurement coordinates should agree. It should work with Measure open and closed and regardless of a prior face-attached sketch or face selection.

### Actual and limits

Front is selected but the canvas visually looks down onto the pocket. This prevents the requested front-view measurement workflow from being validated. The intended 114.3 mm total height follows from 104.14 - 5.08 + 15.24; it was **not measured** in this session. Do not treat the BATTERY as fully validated yet.

No root cause was diagnosed and no functional fix was attempted, per the user's instruction. Suggested investigation: interaction between standard camera views, active face/sketch frames, retained selection, and Measure. Check the current-session reproduction before relying solely on a freshly opened model. Add a browser regression that finishes a face-attached feature, selects Front, and verifies the actual camera projection, not only the button state.

## Modeling details and deliberate equivalents

- The first circle was drawn at (0,0); its center was explicitly constrained using Place at sketch origin. Its diameter was typed as 1.27 cm.
- The second circle was drawn independently and linked using Equal rather than copied with Ctrl-drag. Its center converged to approximately (-1.796051, 1.796051) cm after setting the 2.54 cm spacing.
- A vertical construction line substitutes for the textbook's displayed Right Plane reference. Its arbitrary 2.7 cm length is constrained only to remove its free endpoint; it contributes no solid geometry. The terminal angle is 45 degrees between this reference and the center-to-center construction line.
- Both circles and construction geometry are in one fully defined sketch with two closed loops/two regions. The app splits the single extrusion action into two boss history entries; downstream independent editing has not been tested.
- The radius and height inputs were entered with explicit mm suffixes; the app displayed their cm equivalents.

## Resume

Retest Front and measure the overall 114.3 mm height. Then verify save/reopen retains the rim, terminal taper and dimensions before continuing to BATTERYPLATE. Subsequent ebook models remain untested in this review.
