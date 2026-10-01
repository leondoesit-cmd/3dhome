# Exercise 6.6 — fresh Chrome construction

Source: supplied Planchard 2021 PDF page 305, printed page 6-37. Started a blank document in desktop Chrome on 2026-09-28. No earlier model geometry was reused.

Front-plane profile: overall 32 mm, head Ø28 × 12 mm, shaft Ø12 × 20 mm. Six connected lines with horizontal/vertical relations and driving lengths; redundant closure dimensions were made reference dimensions. Added an explicit construction centreline. Both the revolve profile and the subsequent 12 × 4 mm cut rectangle are fully defined.

360° revolve around X (coincident with the construction centreline), then a 4 mm Mid-plane cut normal to Front. Rectangle starts 12 mm above the axis, producing the 2 mm crown slot across the 12 mm head. Four authored history steps, one exact solid. Assigned Cast Alloy Steel reference material, density 7.30 g/cm³.

Save accepted in Chrome. Reopened with four steps, two fully defined sketches and a successful rebuild. Set ANSI third-angle drafting with millimeter dimensions, then saved again. Changed the upstream overall length from 32 to 34 mm: exact mass increased to 71.41926 g with the crown slot intact; Undo restored 32 mm and a successful rebuild. Downloaded the actual final project bundle and STEP using Output controls. Exact replay of the geometry compiles five kernel steps and validates the BREP with no issues:

- Volume: 9.557265394709173 cm³.
- Mass: 69.768037381377 g, matching Chrome's 69.76804 g.
- Bounds: 32 × 27.856406461 × 28 mm.
- Centre of mass: (9.786768063, −0.127233047, 0) mm.

Files: `EXERCISE-6.6-browser-2026-09-28.mforge`, `.step`, and `.png`.

The revolve selector uses a world axis rather than directly referencing the construction centreline, so that interaction differs from SOLIDWORKS. A finished drawing sheet was not required by this homework and is not claimed.
