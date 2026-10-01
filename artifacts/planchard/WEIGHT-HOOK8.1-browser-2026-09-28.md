# WEIGHT-HOOK — Exercise 8.1 browser acceptance

Source: user-supplied Planchard PDF page 413; visually inspected before mating. Uses only the WEIGHT and HOOK rebuilt from blank documents during this run.

## Browser workflow

1. Insert WEIGHT and ground it at the origin.
2. Insert HOOK. Concentric mate: WEIGHT bore cylinder ↔ HOOK thread cylinder.
3. Coincident mate: WEIGHT top bore circular rim ↔ HOOK stem-top circular rim at local Y .250 in; aligned.
4. Verify one remaining rotational DOF. Native RY input advanced to **45°**, preserving X/Z zero and Y **.635 cm**. The exported motion checkpoint stores the corresponding quaternion.
5. Refresh HOOK from its final four-step library record. Re-select the actual modeled Thread cylinder, since the original Sweep cylinder was removed by the thread operation. The stem-top rim reattaches to equivalent geometry.
6. Coincident mate: both Right planes, aligned. Three resolved mates, HOOK fully constrained.
7. Save, reload Chrome, reopen from the library and run exact interference: **No interference detected**. After the final undimensioned loop estimate and free-tip Dome repair, refresh HOOK again through Update from library, save the existing assembly identity and rerun exact interference: **No interference detected**, with the final mesh visible.

Final HOOK placement: X/Z zero, Y **.635 cm**, rotations zero. Two components, three topology mates; no unresolved mate or residual DOF.

## Evidence

- Final bundle: `WEIGHT-HOOK8.1-final-browser-2026-09-28.mforge`.
- Screenshots: `WEIGHT-HOOK8.1-final-model-browser.png`, `WEIGHT-HOOK8.1-final-fit-browser.png`.
- Motion evidence: `WEIGHT-HOOK8.1-motion-browser-2026-09-28.mforge`, `WEIGHT-HOOK8.1-free-rotation-browser.png`. This two-mate checkpoint predates the final Thread library refresh; the final bundle contains the four-step threaded hook.
- Chrome deliverable tab: **710847572**.

Assembly construction and all model mutations used the real browser UI. Exported bundles were inspected read-only. Drawing/exploded-view outputs remain unperformed. Time/click counts were not measured.
