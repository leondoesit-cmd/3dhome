# SCREW — exercise 6.4

Browser-authored from the user's *Engineering Graphics with SOLIDWORKS 2021* PDF, physical page 304 (printed page 6-36), on 2026-09-24. Saved as **SCREW - exercise 6.4 - simplified 10-24 x 3/8** in the ModelForge library; the local disk backup is `.model-backups/cm_mues0gx9/latest.json`.

The exercise specifies a simplified 10-24 × 3/8 screw. The saved model is explicitly unthreaded reference geometry, not a manufacturing fastener or a claim of standard thread compliance. The unspecified top-cut rectangle was chosen to illustrate the requested operation; the 0.030 note in the book's figure was not treated as a fully specified cut profile.

- Fully constrained Front-plane half-profile revolved 360° about its vertical axis: shank Ø.190 in, shank length .375 in, head Ø.373 in, pre-cut height .500 in, crown radius .304 in.
- One fully constrained Front-plane rectangular profile makes a radial Extrude Cut with Mid-plane end condition and .050 in depth. The cut starts .430 in above the shank base and extends .180 in radially; these two bounds are reference assumptions.
- Circular feature pattern repeats the cut four times about the screw's vertical axis. A .010 in fillet rounds the intact outer head-rim circle. Plain Carbon Steel (grade unspecified) is a reference material at 7.85 g/cm³.
- The saved part has one exact body and six editable history steps: sketch, revolve, sketch, cut, pattern, fillet. Exact regeneration and export validation pass. Kernel volume after cuts and fillet is 0.315874 cm³; at the reference density, calculated mass is about 2.480 g. The remaining physical crown peaks at roughly .498 in because the four cuts remove its .500 in center apex.
- Saved an A3, ANSI inch, third-angle drawing with front, top, right, and isometric views. Associative dimensions show .373 in head diameter by projection width, .190 in shank width, .375 in shank length, and .498 in remaining overall height. The title and sheet note identify it as an unthreaded reference model and record the pre-cut .500 in / R.304 in design intent.

Workflow gaps closed: overlapping circular feature-cut instances now run as individual exact Boolean cuts, so every radial cut removes material and the rebuild cannot silently return the mostly uncut body; the analytic rebuild accepts those transformed intermediate features; the drawing Note button remains on the drawing sheet and displays sheet guidance instead of opening 3D annotation controls.
