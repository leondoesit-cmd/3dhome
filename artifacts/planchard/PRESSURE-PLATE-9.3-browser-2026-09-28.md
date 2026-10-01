# PRESSURE PLATE, Exercise 9.3 (PDF p.476, printed 9-42)

Fresh blank document in desktop Chrome (dark theme). Nothing reused from earlier library entries.

## Part
- Inches. Front-plane sketches with the centre fixed at the origin (both fully defined, 0 DOF): Ø5.00 disc boss 0.20 in, Ø1.13 hub boss 0.90 in from the Front plane (0.70 in proud of the disc, on the +Z side, which shows on the left in the Right view like the book).
- Hole Wizard, custom Ø0.50 through-all, Circular layout: count 6, bolt-circle radius 1.96 in, first-hole angle 90 deg (one hole on top, as printed). Five history steps, one exact solid.
- Aluminum 1060 (library material, 2.69879 g/cm3).
- Exact Mass props: 71.99466 cm3, 0.1942985 kg, bounding box 12.7 x 12.7 x 2.286 cm. Hand check: pi*2.5^2*0.2 + pi*0.565^2*0.7 (hub beyond the disc) - 6*pi*0.25^2*0.2 = 4.39338 in3 = 71.9947 cm3.
- Native STEP export 34,347 bytes.

## Drawing
- ANSI Letter (A) landscape, third angle, inches, 2 decimals, scale 1:2. Front and Right views only (auto Top and Isometric deleted).
- Model-linked: Ø5.00, Ø1.13, 0.20 thickness (Insert Model Items), plus hand-placed associative 0.90 (hub end to plate back), 1.96 (top-hole centre to disc centre) and 3.92 (opposite hole centres, displayed text overridden to Ø3.92).
- Live Hole Wizard callout: Ø0.5 in THRU x6 EQ SP.
- Centre marks and centrelines from the sheet's Centre marks option. Third-angle symbol from the sheet.
- Title block: PRESSURE PLATE, 55-568, REV A, DCP, D&M ENGINEERING, 9-1-2021.
- Custom properties (dialog): Description, Number 55-34, Revision A, DrawnBy DCP, DrawnDate 9-1-2021, CompanyName D&M ENGINEERING, PartNo 55-568, SWFormatSize 8.5in*11in, Material 1060 Alloy.
- Redundant Front 5.00 and Right 5.00 dimensions removed.

## Acceptance (all in Chrome)
- Save to library reported success; full page reload; reopened the library entry: drawing, dimensions, callout, title block and custom properties all persisted (`PRESSURE-PLATE-9.3-browser-2026-09-28.png` is the pre-reload sheet).
- Driving edit: hub Extrude depth 0.90 to 1.00 in updated the drawing dimension to 1.00 associatively; Undo restored 0.90 in the model and the drawing.
- Exports: project bundle (957,846 bytes), STEP, sheet SVG (16,352 bytes; contains 0.90, 1.96, 3.92, 55-568, 1060, the x6 EQ SP. callout).

## Deviations and gaps
- The app has no D&M company logo / third-angle icon files (homework-folder icons); its own third-angle symbol is used.
- Leading-zero and unit-suffix format (0.90, Ø0.5 in) differs from the book's .90, .50.
- Ø3.92 is a two-hole-centre dimension with overridden text, not a bolt-circle leader; the text does not follow a radius edit.
- Ø1.13 and Ø5.00 are leaders on the Front view; the book puts the Ø5.00 and Ø1.13 in the Right view.
- Title-block mass field left blank.
- Source gaps fixed for this exercise: Hole Wizard circular layout gained a first-hole angle field, and its callout now reads EQ SP. (`tests/hole_circular_layout_callout.test.mjs`, npm run check green).
- An earlier 7-step model (Extrude cut plus Pattern, saved as "PRESSURE PLATE 9.3 - fresh") stays in the library and is not the accepted model.
