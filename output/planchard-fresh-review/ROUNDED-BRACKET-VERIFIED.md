# Exercise 5.13 — rounded bracket

Built through the real browser from the supplied ebook, page 5-44. Saved as `ROUNDED BRACKET - exercise 5.13`.

## Geometry and independent verification

Front sketch: five straight edges and a true R15 mm semicircle. Origin at the semicircle center. Extents X = -15 to 75 mm, Y = -30 to 15 mm. Symmetric extrusion Z = -25 to 25 mm. One solid, two history steps, fully defined sketch (12 constraints, five driving dimensions).

- Exact overall size: 90 × 45 × 50 mm.
- Volume: 92,671.458676 mm³.
- Centroid: X 14.567592, Y -14.162937, Z 0 mm.
- Independent area: 1,500 + π × 15² / 2 mm²; multiply by 50 mm for volume. Area-weighted centroid agrees with the browser.
- Aluminum 1060: catalog nominal density 2.69879 g/cm³ (converted from 0.0975 lb/in³), mass 250.1009 g.

Drawing: ANSI preset with millimeters, third-angle projection, zero decimal places, four views. Five associative dimensions: 90, 45, 50, 10, R15. The book's redundant parenthesized (30) reference dimension is not included. Material and 250.101 g title block set; general tolerance blank.

Saved and reopened the library record. Exact rebuild succeeded. Smooth semicircular outline and R15 callout persisted with all other dimensions.

## Fixes found during browser work

1. Center-point arc's projected final endpoint dropped the snapped point ID. Preserve that ID when the vertex is on the radius; an off-circle vertex remains a direction pick. Browser closure now shares both existing endpoints without endpoint healing. Explicitly placing the arc center at the origin completes the constraint system.
2. Smooth-topology merging combined an exact trimmed arc with mesh aliases, losing endpoints/midpoint and doubling its length. Preserve trimmed exact arcs as separate named edges. Browser radius tool now recognizes R15.
3. Drawing outline used straight tessellation facets for partial arcs. Convert matching short chords to exact circular strokes using the named arc geometry, retaining visibility classification. Canvas and SVG use the same arc items. Browser now shows a smooth semicircle.
4. New drawing documents no longer assume ISO 2768-m general tolerance. Verified the fresh bracket drawing has a blank tolerance field.

Validation: 82 topology/drawing tests passed, four arc construction tests passed; module/link checks passed (507 modules), 1,452 source assertions passed. Full suite not run.
