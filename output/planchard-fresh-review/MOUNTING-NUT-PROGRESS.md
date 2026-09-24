# MOUNTING NUT — exercise 6.3

Browser-authored from the user's *Engineering Graphics with SOLIDWORKS 2021* PDF, physical page 303 (printed page 6-35), on 2026-09-24.

The exercise asks the reader to obtain and measure a metric nut, but supplies no specimen or dimensions. The saved **MOUNTING NUT - exercise 6.3 - reference M10** is therefore labeled reference geometry, not a dimensionally faithful reproduction of an unknown physical nut. Its chosen nominal measurements are a 10 mm bore, 17 mm across flats, and 8 mm height; these are design assumptions, not values asserted by the ebook.

- On the Front plane, drew a regular hexagon centered at the origin and a concentric 5 mm radius circle. The hexagon side is 9.814954576 mm, giving 17 mm across flats. The sketch is fully constrained.
- Extruded the enclosed annular hexagon 8 mm as one exact body with a through-hole. Applied Plain Carbon Steel (grade unspecified) at a representative 7.85 g/cm³ density. The material is explicitly a reference assumption, not a certified alloy grade.
- Chamfered six perimeter edges on each end by 1 mm in separate history features, then both bore-rim circles by 0.5 mm in a third chamfer feature. The saved model rebuilds with one solid and five editable history steps.
- Browser Mass Properties reports **1,309.236 mm³** and **10.27750 g**, with centre of mass at (0, 0, 4) mm. The envelope is 19.6299 × 17 × 8 mm: 19.6299 mm is across the hexagon's opposite points, while 17 mm is across flats.
- Saved, hard-reloaded, reopened, and checked the exact solid and four-view A3 drawing with millimeter units and third-angle projection. The drawing has overall 19.6 mm across-points and 17 mm across-flats dimensions, an 8 mm thickness dimension, and one associative Ø10 bore callout. A stray Ø11 callout from the chamfer entrance was removed before the final save and reopen.

Workflow gaps closed during this exercise: the Shape & size inspector now presents sketch and part lengths in the document's length unit; the derived body row remains selectable after finish features; Plain Carbon Steel is available with a sourced reference density; the drawing title wraps long descriptions and fits field values inside the title block; a single-body drawing inherits the part's material unless the title block has an explicit override.
