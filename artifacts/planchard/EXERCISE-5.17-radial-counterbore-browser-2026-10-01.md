# Exercise 5.17 — fresh radial counterbore example

Source: PDF pages 266–267, printed pages 5-48–5-49. The companion HoleWizard5.17 part is absent. This clearly labeled example was built from a blank document through Chrome's visible ModelForge UI on 2026-10-01; no old model was used.

## Preserved result

- Assumed base cylinder: diameter 1.000 in, length 1.500 in. Top-plane circle has a fixed center and driving diameter; fully defined.
- Selected actual native cylindrical side face, then Hole Wizard: Counterbore, ANSI Inch, Socket Head Cap Screw, 1/4-20, Normal, Through all.
- Bore diameter 0.714375 cm; recess diameter 1.11125 cm; recess depth 0.889 cm (0.250 in nominal head plus the requested 0.100 in clearance).
- Hole center constrained 0.635 cm / 0.250 in below the physical upper cylinder end, angle 0 degrees from +Z. Actual source circle identity and native face reference retained.
- Native rebuild and save succeeded, one solid, three history steps, zero feature diagnostics. Saved clean, exported project bundle, and cold reopened from the Library with the same three steps and one solid.
- Browser feature editing changed angle to 90 and back to 0. Upstream height edit to 4.445 cm rebuilt the cylinder and moved the hole upward while retaining its top distance; screenshot preserved separately. Cancel restored the saved 3.81 cm height.

## Implemented gap and limits

Added associative radial Hole Wizard placement for an undrafted straight Top-plane circular extrusion, with numeric top-distance and angular controls. Native compilation and compatibility cutters derive the position from current source dimensions. Five focused tests cover actual topology ownership, source edits, reverse/mid-plane extents, invalid positions, and compatibility re-anchoring; module/link/assertion gates passed.

This is a native constrained radial equivalent, not the full book workflow: general 3D Sketch OnSurface plus AlongY/AlongZ construction relations remain unfinished. Only the base sketch is a fully defined sketch; the example does not claim the book's two fully defined sketches or exact missing companion geometry. The size menu's generic quarter-inch label mentions a tap drill, although selected Counterbore/Normal resolves clearance dimensions correctly. Material remains the example default; the source illustration's Aluminum 1060 assignment is not claimed.

Bundle: `EXERCISE-5.17-radial-counterbore-browser-2026-10-01.mforge`.
Proof: matching PNG and `EXERCISE-5.17-upstream-height-QA-2026-10-01.png`.

Tabs can be closed after this saved state: the library model and portable bundle preserve the work. Resume the outstanding full 3D sketch relations on printed page 5-49.
