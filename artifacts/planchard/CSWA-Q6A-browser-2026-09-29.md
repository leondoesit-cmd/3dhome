# CSWA practice Question 6A (PDF p.503) - coordinate system and centre of mass, 2026-09-29/30

Built on the Q6 model (see CSWA-Q6-browser-2026-09-29.md; that model is PARTIAL: 113547 mm3 vs 111059.43 printed).

Two app gaps fixed:
1. Reference > Coordinate sys was an unconfigurable stub (fixed at the origin, no axes options). It is now a form: name, origin X/Y/Z (seeded from a selected model vertex), and Reverse X / Y / Z axis switches (js/modeler.js openCoordinateSystemForm).
2. Mass properties could not report relative to a coordinate system. The card now has "Report coordinate values relative to" with every coordinate system in the part; the centre of mass is projected on its (possibly reversed) axes (centerOfMassInSystem in js/cad_mass_properties.js, tests/mass_coordinate_system.test.mjs; the test reproduces the book's -80.39 / -15.93 / -22.65 from the book's own base COM).

UI steps: Reference > Coordinate sys, origin (65, 0, 20) mm = front-right-bottom vertex (typed; a selected vertex is used automatically), Reverse Y axis (the printed Y is negative for a point above the bottom), Apply; Evaluate > Mass props > mm/g, select the system.

Result (mm): app COM (-80.63822, -15.17053, -22.40994) vs book (-80.39, -15.93, -22.65). Deviation (-0.25, +0.76, +0.24) is exactly the Q6 model's own deviation (missing holes/fillets), so the coordinate-system reporting is verified but the printed numbers are not reproduced to the 0.01 the exam needs.
Saved to the library (coordinate system persists, reference geometry 8), STEP and bundle exported.
Files: CSWA-Q6A-browser-2026-09-29.{mforge,step,png,md}.
