# WEIGHT-LINK — Exercise 8.2 browser acceptance

Source: user-supplied Planchard PDF page 414, visually inspected. Built a new assembly through desktop Chrome dark theme using only AXLE, FLAT BAR - 9 HOLE, and WEIGHT-HOOK authored from blank documents during this run.

## Assembly and motion

- AXLE grounded at the origin.
- AXLE to bar: concentric top bore/shaft, aligned Front planes, aligned AXLE Right/bar Top planes. Bar fully constrained.
- Bar to rigid WEIGHT-HOOK: aligned Front planes and bottom-bore/upper-hook-loop Tangent mate. Five resolved topology mates, **two physical degrees of freedom**.
- The circular Sweep exposes the loop as exact toroidal geometry. The contact uses the explicit **Finite bore / rim** mode, which seats the passing wire section within the actual .060 in sheet thickness. Infinite cylindrical-surface contact alone had left measurable overlap.
- Native RZ input changed the solved child pose from −2.071078° to −.953490°, with X moving from −.113512926 to −.080987643 cm and Y from −13.375368616 to −13.369036422 cm; all five mates remained resolved with two DOF. `WEIGHT-LINK8.2-motion-browser-2026-09-28.mforge` and `WEIGHT-LINK8.2-motion-browser.png` preserve this UI motion checkpoint. The solver adjusts the requested parameter with the coupled translation; the entered 5° is not claimed as the final angle.
- Undo restored the final baseline pose, then Update from library refreshed the final threaded HOOK child while preserving top-level IDs and mates. Saved as **WEIGHT-LINK8.2 - rebuilt 2026-09-28**.

Final child placement: X **−.113512926 cm**, Y **−13.375368616 cm**, Z 0, RX/RY 0, RZ **−2.071078024°**. Three top-level components, four leaf solids, five top-level mates.

## Fit evidence

Read-only full replay of the actual final browser bundle rebuilt all four exact solids, including the modeled thread and repaired Dome. All six material-intersection pairs returned **no intersection, volume 0**. The independent Sweep-only check also confirms the loop clears the finite bore. The original estimate had .00462165 cm³ bar/hook overlap and was changed only where the print supplies no dimension.

The final Chrome exact interference report is still pending; do not treat the Node replay as completed browser acceptance. The saved assembly reopened in fresh Chrome with all five mates resolved and two DOF. A persistent evaluation card now displays the worker stage, provides Cancel, and prevents duplicate jobs. In Chrome, Cancel visibly produced “Interference check cancelled” and a repeat Check retained the same active job. The final check is currently waiting at “Preparing exact check”, before the worker acknowledges admission; other agents are investigating worker startup. A swept motion envelope, drawing and exploded-view outputs remain unperformed.

Final bundle: `WEIGHT-LINK8.2-final-browser-2026-09-28.mforge`. Latest acceptance Chrome tab: **710849190**. Model mutations and motion used the real browser UI; artifact inspection/replay was read-only. The new worker-native exact pipeline also completed the actual compact authoring bundle with no intersections; the request contained only 60,327 bytes and returned plain pair reports without restoring any native solids on the UI thread.

## Worker startup repair

The real worker entry now registers its message handler without importing the heavy exact runtime first. It acknowledges admission immediately, reports `loading-runtime`, then imports and caches the exact executor. Failed imports produce an explicit request error and allow a later retry; a failed feature request does not strand the next queued request. Four bootstrap protocol tests and 24 focused worker/interference tests pass. These source checks do not complete the pending Chrome no-interference acceptance.
