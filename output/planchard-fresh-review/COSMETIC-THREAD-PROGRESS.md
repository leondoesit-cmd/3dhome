# Exercise 5.16 cosmetic-thread workflow

Source: PDF page 265 / printed 5-47, visually reviewed. Publisher exercise files downloaded from https://www.sdcpublications.com/downloads/978-1-63057-407-9 . The supplied Cosmetic Thread.SLDPRT is a native binary model unsupported by the current app; exact head/shaft dimensions are not printed. No claim of exact native-part reconstruction.

Saved browser record: UNC 1-4-20 - workflow verification blank. A deliberately labelled substitute shaft, diameter 6.35 mm, length 50.8 mm, fully defined Top-plane circular sketch and extrusion. Material not assigned. Applied external right-handed 1/4-20 UNC 2A cosmetic thread, 25.4 mm long.

Implemented:
- Explicit 1/4-20 UNC cosmetic preset (6.35 mm major diameter, 1.27 mm pitch), default classes 2A/2B and inch callout. Unsupported modeled Unified threads and fit limits are rejected rather than borrowing ISO metric geometry.
- Preset controls fix diameter/pitch and disable incompatible modes. Neutral tolerance-class label with appropriate placeholder.
- Thread length normalization now honours the editable document length rather than an obsolete derived millimetre copy.
- History-to-preview synchronization resamples the cosmetic overlay from the current thread feature; suppression/rollback removes the old overlay. Legacy part-only annotations remain supported. Existing single-annotation-per-part representation remains a limitation for multiple thread features on one body.

Browser verification:
- Created through sketch/extrude/thread UI; callout 1/4-20 UNC 2A ↓1 in.
- Saved, reloaded app, reopened record and inspected preset, 2A, diameter, pitch, length and visible overlay.
- Reproduced length edit changing the field to 12.7 mm while the overlay remained 25.4 mm. Fixed both stale unit alias and stale preview annotation. Reloaded and visually confirmed overlay occupies one quarter of the 50.8 mm shaft (12.7 mm).
- Restored 25.4 mm, committed and saved. Suppressed thread in UI: shaft became smooth; unsuppressed and saved again.
- Solid bounds remained 6.35 x 6.35 x 50.8 mm, one body, three history entries. Did not claim a browser mass measurement.

Validation: 75 focused tests passed across thread, manufacturing, mechanical, parametric history and drawing regressions. Includes changed overlay extent, inch callout, serialization, suppression and rollback. Module/link checks passed with 516 modules; all 1,452 source assertions and git diff --check passed. Full suite not run.

Next: exercise 5.17 uses another native supplied model and requires an ANSI inch quarter-inch socket-head counterbore on a cylindrical face, 3D sketch positioning, 0.25 in below top, 0.100 in head clearance, Through All, and Along Y/Z constraints. Exact supplied part remains unreadable. Chapter 6 LENS geometry is fully dimensioned: Right-plane three-line/arc profile, equal left height/width 50.8 mm, right height 10.16 mm, arc R101.6 mm, revolve around horizontal centreline, then 6.35 mm shell. Continue browser modelling after the remaining thread/history checks.
