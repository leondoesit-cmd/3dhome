# FLAT-PLATE, Exercise 9.6 (PDF p.479, printed 9-45)

Fresh blank document in desktop Chrome, inches (Part units set to in), Front plane sketches.

## Part
- Reading of the printed sheet: 4.00 x 2.00 deep base, .50 thick; upright 1.20 wide rounded by an R.60 arc whose centre is 1.00 above the base bottom (1.60 overall, the printed (1.00) reference and 1.60 dimensions); Ø.40 through hole with Ø.77 x 82° countersink 2.40 from the left edge, centred across the 2.00 (Top view). Material 1060 Alloy.
- Sketch 1 (Front plane): 4 x 0.5 in rectangle, bottom-left corner placed at the sketch origin and fixed; fully defined. BasePlate blind boss 2 in.
- Sketch 2 (Front plane): fully defined upright profile, two verticals, closing line, 1.2 in width, 0.5 in height, arc R.6 (centre forced level with the arc ends, so the arc is an exact semicircle; a driving R.6 dimension was tried first and left a 9e-6 in centre error, so it was removed). Upright blind boss 2 in, merged.
- Sketch 3: face sketch on the plate top, one point at X -0.2 in from the face centre (2.40 in from the left edge), fully defined. Hole Wizard: Countersink, custom Ø0.4 through all, C'sink Ø0.77, 82°.
- Aluminum 1060 (0.0975 lb/in³). Six history steps (BasePlate, Upright, CSK Hole and their three sketches), three sketches fully defined, one exact solid.
- Exact Mass props: volume 102.1861 cm³ = 6.235776 in³, mass 0.6079882 lb (0.2757788 kg), bounding box 4 x 1.6 x 2 in, COM (1.470564, 0.5274794, 1.0) in. Hand check: profile area 1.2*1.0 + pi*0.6²/2 + 2.8*0.5 = 3.165487 in² times 2 = 6.330973 in³; hole = pi*0.2²*0.5 + (frustum - cylinder over the 0.212818 in countersink depth) = 0.095197 in³; result 6.235776 in³ = 102.18606 cm³, 0.27578 kg. Agrees to all displayed digits.
- Native STEP 36,021 bytes (one MANIFOLD_SOLID_BREP, conical countersink surface present).

## Drawing
- ANSI A (Letter 279 x 216 mm) landscape, third angle, inches, two decimals, sheet scale 1:2 (all four views set to 1:2), Hidden lines on, no tangent edges shown, Centre marks on.
- Views as printed: Top (upper left), Isometric (upper right), Front (lower left), Right (to the right of Front).
- Associative dimensions placed with the drawing Dimension tools: 2.00 (Top depth), 2.40 (Top left edge to hole centre), 4.00 (Front), 0.50 (Front thickness), 1.60 (Right height), R0.60 (Front arc, leader radius) and (1.00) as a reference dimension (parentheses toggle in the dimension text panel). Live Hole callout "Ø0.4 in THRU ⌴ Ø0.77 in 82°" from Hole callouts from the feature tree.
- Auto-inserted extra dimensions (duplicate Top 4.00, Right 2.00, two Isometric dimensions) were deleted; R0.60 and callout labels dragged clear of the view captions.
- Title block: FLAT-PLATE, 2445-990, REV A, DCP, D&M ENGINEERING, 9-1-2021, 1060 Alloy, general tolerance line. Custom properties: Description PLATE, Revision A, DrawnBy DCP, DrawnDate 9-1-2021, CompanyName D&M ENGINEERING, PartNo 2445-990, SWFormatSize 8.5in*11in, Material 1060 Alloy.

## Acceptance (Chrome)
- Save to library, full page reload, reopen from library (the saved entry, not "Save copy and open"): six steps, renamed features, Aluminum 1060, exact volume 102.1861 cm³ and the whole sheet (dimensions, callout, title block) persisted.
- Driving edit: BasePlate boss depth 2 to 2.5 in changed the Top depth dimension 2.00 to 2.50 (the sheet re-laid out and stayed associative); Undo restored 2.00 and the original sheet, and the volume read 102.1861 cm³ again with a clean saved state.
- Exports: project bundle (1,182,300 bytes), STEP (36,021 bytes), SVG (38,535 bytes; contains 2.40, 2.00, 1.60, 0.50, 4.00, R0.60, (1.00), Ø0.4 in THRU, Ø0.77 in 82°, 2445-990, 1060 Alloy, D&M ENGINEERING), PNG (screenshot of the finished sheet).

## Deviations and gaps
- No company logo or D&M icon graphics (the app's own third-angle symbol is used); no title-block mass (blank, as the printed sheet leaves WEIGHT blank); leading zeros and font differ from the book (0.50 not .50).
- The book shows drawn centrelines through the holes; the app shows centre marks (crosshair on the Top hole) but no separate centreline through the Front and Right hidden countersink, and the callout reads THRU, not THRU ALL.
- The hole's face sketch is positioned from the face centre. In the depth-edit test the face was re-centred, so the 2.40 dimension read 1.80 while the boss was 2.5 in deep, and returned to 2.40 after Undo. The hole is not anchored to the left edge as a model reference.
- After the first library save the drawing re-inserted four model-item dimensions that had been deleted; they were deleted again and did not return after a second save and a reload.
- The Isometric view initially labelled itself 1:2.5 until its view scale was set to 1:2.
- Material custom property is literal text "1060 Alloy", not a SW-Material expression.
