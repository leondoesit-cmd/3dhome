# Exercise 5.7: SHAFT COLLAR

Rebuilt from a blank model in desktop Chrome tab 710847502, dark theme. Source: supplied Engineering Graphics with SOLIDWORKS 2021 PDF, page 260 (printed page 5-42). No previous geometry was loaded for creation.

- Front X/Y sketch, shared fixed center at origin, two driving diameter constraints: .438 in and .188 in.
- One blind extrusion along Z, .250 in; one solid body with one through bore.
- Aluminum 2014, density 2.80 g/cm³.
- ANSI, third-angle Letter drawing with Front, Top, Right and Isometric views; inch primary and millimeter secondary units.
- Three associative model items: outside diameter, inside diameter and extrusion depth. Duplicate overall bounds dimensions removed through the UI.
- Saved to library as `Planchard SHAFT COLLAR - rebuilt 2026-09-28`; saved model reopened after reload for browser proof.

Exports generated through the browser: `SHAFT-COLLAR-browser-2026-09-28.mforge`, `.step`, `.svg`, and screenshot `.png` in this directory.

## Gap fixed

Insert Model Items omitted the inner diameter because the final kernel named the annular inner rim as a generated circle, rather than a sketch-profile circle. `js/core/model_items.js` now accepts a unique circular edge on the owning extrusion matching its radius and start-plane center. It refuses ambiguous matches and binds the drawing to the persistent edge ID. Browser proof shows Ø0.438 [11.13], Ø0.188 [4.78] and 0.250 [6.35].

Checks: `node --test tests/model_items.test.mjs` 4/4 passing; `npm run check` passing (575 linked modules, 1500 source assertions). Bundle inspection confirms 1 sketch, 1 feature, 1 part, 1 bore, depth .635 cm, Aluminum 2014, three drawing dimensions. SVG includes all three values with no selected orange dimension.

## Difference from the book

The book pairs rounded Ø.438 inches with [11.11] mm. Exact conversion of .438 inches is 11.1252 mm, so the associative drawing reports [11.13] mm. The primary inch dimension was followed. No geometry deviation otherwise.
