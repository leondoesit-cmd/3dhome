# Exercise 1.9 spatial correspondence preflight

Read-only source PDF85/1-57 supplied third-angle views. Use observed app TopZdown/RightZleft and coordinates in **grid units**, Xwidth/Yup/Zdepth. BoundsX0..5/Y0..4/Z0..4. Source central Top junction maps P=(2,4,2). Other paired visible vertices are A=(1,4,4), B=(5,4,1), C=(5,1,4). These coordinates simultaneously explain all supplied lines:

| Spatial edge | Top (X,Z) | Front (X,Y) | Right (4−Z,Y) |
|---|---|---|---|
| A–P | (1,4)–(2,2) | (1,4)–(2,4), overlaps top silhouette | (0,4)–(2,4), overlaps top silhouette |
| P–B | (2,2)–(5,1) | (2,4)–(5,4), overlaps top silhouette | (2,4)–(3,4), overlaps top silhouette |
| P–C | (2,2)–(5,4) | (2,4)–(5,1) | (2,4)–(0,1) |
| A–C | (1,4)–(5,4), overlaps front Top perimeter | (1,4)–(5,1) | (0,4)–(0,1), overlaps Right perimeter |
| B–C | (5,1)–(5,4), overlaps right Top perimeter | (5,4)–(5,1), overlaps Front perimeter | (3,4)–(0,1) |

Defensible solid is the5×4×4 cuboid with front/right top corner removed as a pyramid: top removed quadrilateral A,E=(5,4,4),B,P, converging to apexC. Remaining two exposed triangular facets are A–P–C and P–B–C. This construction is a source-correspondence inference, not imported publisher geometry. A–P–C plane6X+8Y+3Z=50; P–B–C planeX+3Y+3Z=20. **Do not sequentially cut both entire plane halfspaces:** that removes their union and destroys A/B. Removed pyramid occupies their intersecting high side within the corner, or may be represented by a supported quadrilateral-to-point loft cut. App support for that exact loft/end-point workflow must be checked before a browser recipe is frozen. A paper isometric of these bound vertices/facets can proceed without a native solid.

Optional illustrative10mm/grid gives bounds50×40×40 and A(10,40,40),B(50,40,10),P(20,40,20),C(50,10,40). Native validation should compare every supplied projection, not fit volume. No physical unit/material/Front reinterpretation/source mass is supplied. No authored model is generated here.
