# Fresh FLAT BAR–9 HOLE, Exercise 5.9

Source figure visually inspected: PDF page 260, printed 5-42, in the supplied Planchard 2021 ebook. New blank desktop Chrome document, dark app theme; no previously built geometry reused. Live tab 710847569.

## Exact model

Front datum plane, centerpoint straight slot centered at origin. Arc centers ±2.000 in, span 4.000 in; width .500 in, end radii .250 in, overall length 4.500 in. Blind positive-normal extrusion .060 in (1.524 mm). Fully constrained seed circle at (−2.000, 0) in, diameter .190 in. Simple ANSI Inch Custom Hole Wizard, through all. Linear feature pattern, seed Hole Wizard, X enabled, nine instances at .500 in pitch; Y/Z disabled. Hole centers −2.000 through +2.000 in in .500 increments. Two fully defined sketches, three features, five history steps, one exact body. Aluminum 1060 selected through Material & finish; stored density 2.698790709244804 g/cm³.

Saved to library, reloaded browser, reopened its own library entry. Model bounds displayed 4.500 × .500 × .060 in. Bundle validation confirms the dimensions, material, pattern seed/count/spacing, fully defined sketches and non-suppressed rebuilt feature history.

## Drawing

Letter landscape, ANSI third angle, inches plus millimeters, three primary decimal places, two secondary decimal places and trailing zeros. Front and Top plus shaded-with-edges Isometric. Model Items binds 4.000 center-span, 2X R.250 cap radius and Top .060 thickness. Adjacent .500 center spacing was placed manually through the Dimension tool, associatively bound to the seed and first pattern-copy circular edges. Live Hole Wizard callout reads Ø.190 in THRU ×9 EQ SP. Linked MATERIAL THICKNESS note re-reads extrusion depth. Overall 4.500 and width .500 dimensions retained as supplementary measurements. Title FLAT BAR - 9 HOLE; drawing number PLANCHARD-5.9.

The homework figure shows a single dimensioned front view. Supplementary views, overall length and material note add context. App font, leading-zero/unit suffix formatting and title-block template differ from SOLIDWORKS. The book's approximate metric thickness is 1.5 mm; the model uses exact .060 in = 1.524 mm and drawing rounds to [1.52].

## Artifacts and verification

- `FLAT-BAR-9-HOLE-5.9-browser-2026-09-28.mforge`: visible Output > Project bundle export.
- `.step`: visible Output > Export STEP, exact solid.
- `.svg`: visible sheet Export SVG, real filled vector shaded surfaces.
- `.png`: actual Chrome screenshot from CUA getScreenshot Uint8Array, saved with Node fs.writeFile.

SVG checked for 4.000, .500, 2X R.250, .060, ×9 EQ SP., Aluminum 1060 and drawing number. Bundle confirms topology-bound spacing and model-linked thickness. 84 focused drawing/model-item/topology tests pass; npm run check green (577 module graph, 1500 source assertions).

The fresh workflow reproduced a partial Drawing transition after assigning material. An earlier hidden preview render occurred in viewport relocation before the host-layout guard. Both paths now suppress hidden preview rendering when entering Drawing. Reloaded browser correctly selected Drawing and displayed the sheet. Selected-row Delete was verified on Pattern: it actually removed the feature (five steps to four), and Undo restored five steps and saved state. Original export/library record preserved. These results do not complete the ebook.
