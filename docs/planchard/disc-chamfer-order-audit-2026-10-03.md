# Butterfly disc chamfer order audit — 2026-10-03

The main agent's Chrome preview could build a 0.1 cm chamfer on the disc's outer rims, while 0.5 and 0.6 cm failed with a misleading radius warning.

A read-only native-kernel replay used the protected `BUTTERFLY-disc-cross-pin-steel304-browser-2026-10-03.mforge` bundle. The rebuilt outer rims are two full circles, radius 2.99 cm, centered at Z ±0.7 cm. Actual native chamfer calls reproduced the UI: 0.1 cm succeeded on one or both rims; 0.5 and 0.6 cm failed even on one rim. This bypasses the UI and worker body cache.

The transverse stem bore has radius 0.6 cm and leaves a 0.1 cm rim web before beveling. A larger bevel intersects the bore near its outer rim exits. Applying the 0.6 cm chamfer after the hub union and **before** the two bore cuts succeeded. Subtracting the original stem and cross-pin cutters afterward produced a native solid with volume **29.31314530099 cm³**, bounds X ±2.9900001, Y ±2.93088734, Z ±1.0000001 cm, and no approximate/invalid flags.

Existing finish-at-rollback functionality inserts the finish at the rollback bar and rewires the next consuming feature. Its two tests passed. The main agent can perform this sequence through visible UI; the diagnostic did not modify the protected bundle or author a saved model.

The native failure caption now states **Chamfer could not be built on these edges · check distances and feature order**. It no longer guesses that a radius is too large. Native chamfer construction and model geometry were not changed.
