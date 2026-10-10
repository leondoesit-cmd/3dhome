# Exercise 1.10 source-grid browser plan

Read-only visual source: `scratch/planchard/drafting-exercise-086.png`, PDF86 / printed1-58. Source provides third-angle Front/Top/Right and asks for the missing isometric; their correspondence is fixed. Grid coordinates below use X across Front, Y upward and Z downward in Top. Actual app Top projects+Z downward and Right projects+Z leftward, as established by accepted prior native drawings. Choose10mm per source grid interval for illustration only. Source supplies no physical unit, material or mass. No authored model/import/script-generated geometry is supplied by this plan.

The three views bind coherently to **one rounded L-shaped base, one rear stepped upright, and one straight triangular rib**. Two quarter-rounds are base plan corners; the third is the upper outer corner of the tall upright. None is a bore. Rib is the one-grid-wide stripX0..1; it rises from baseY1 atZ5 to uprightY3 atZ1.

## Exact source-grid contours

Base Top perimeter, in order: (X,Z)=(0,0)→(6,0)→(6,1), quarter arc to(5,2) about center(5,1), then→(3,2)→(3,4), quarter arc to(2,5) about center(2,4), then→(0,5)→(0,0). Both arcsR1; both use the outer convex quarter. Base spansY0..1. Thus the unrounded stock corner at(6,2) and at(3,5) is removed by rounding; do not add full disks or substitute holes.

Upright Front perimeter above base: (X,Y)=(0,1)→(6,1)→(6,4), quarter arc to(5,5) about center(5,4), then→(5,2)→(2,2)→(2,3)→(0,3)→(0,1). ArcR1; upper convex quarter. Extrude this profile alongZ0..1, merging with base. Left topY3 overX0..2; middle topY2 overX2..5; right tall portionX5..6 reachesY5 atX5. The upper arc has a sharp junction to the inner vertical edgeX5 atY5; it must not be replaced with a tangent fillet of an unrelated corner.

Rib Side triangle in (Z,Y): (1,1)→(5,1)→(1,3)→(1,1), extrudedX0..1. It touches upright atZ1 and base atY1, forming a connected joined solid. This explicit triangular Boss is an equivalent simple workflow; no opaque original Rib feature/history is claimed.

## Actual browser feature recipe at chosen10mm/grid

1. Top base sketch atY0: six lines/two three-point quarter arcs. Boss+Y10.
2. Front upright sketch atZ0: seven lines/one three-point quarter arc. Boss+Z10, merged. Use actual Front axis sign so native range isZ0..10; inspect numeric preview bounds before committing.
3. Side sketch atX0: triangle (localU=Z,localV=Y)=(10,10),(50,10),(10,30). Boss+X10, merged. Verify app Side localU maps+Z and choose actual direction to produceX0..10. A three-dimensional Rib command is optional; the bounded triangular Boss suffices.

Native rectangles/lines/arcs must retain driving dimensions and exact endpoint coincidence. Front/Top profile closedness and all three sketches fully defined are acceptance gates, not conclusions already tested here. Arc authoring coordinates:

| Sketch | Start | Through | End | Center / radius |
|---|---|---|---|---|
| Top outer right | (60,10) | (57.0710678118655,17.0710678118655) | (50,20) | (50,10),R10 |
| Top outer lower | (30,40) | (27.0710678118655,47.0710678118655) | (20,50) | (20,40),R10 |
| Front upright upper | (60,40) | (57.0710678118655,47.0710678118655) | (50,50) | (50,40),R10 |

All table coordinates are actual sketch-local mm, not paper coordinates. The sample through-points force the intended short90° outer branch.

## Face ownership and projection gates

| Source line/arc | Native owner / expected projection |
|---|---|
| Top horizontalZ1 acrossX0..6 | Upright front face meets lower exposed base; full rear footprint boundary |
| Top verticalX2/X5 overZ0..1 | Upright height discontinuitiesY3→2 andY2→tall |
| Top verticalX1 overZ1..5 | Right side of triangular rib; separates sloped rib top from exposed base |
| Top twoR1 arcs | Base vertical outer quarter-cylinder faces; preserve exact L footprint |
| Front internal verticalX1 overY1..3 | Rib side boundary projected in Front |
| Front base verticalX3 overY0..1 | Reentrant base corner atX3/Z2..4 |
| Front stepped crown andR1 upper arc | Upright profile; visible heights3/2/5 exactly as supplied |
| Right sloped lineZ5/Y1→Z1/Y3 | Rib's top straight edge |
| Right tall rear stripZ0..1 | Upright side face, overallY5; appears at right of supplied Right view |
| Right hidden horizontalY2/Y3 overZ0..1 | Lower upright height steps occluded by tallX5..6 region when viewed from+X |
| Right base divisionZ2 overY0..1 | Plan footprint corner projected onto base side |

Front bounds6×5, Top6×5, Right5×5 grid intervals. Preserve supplied Right hidden short pair; do not globally turn hidden off to mask incorrect geometry. No hole centerline is needed. Native isometric must show both rounded base extremities, tall right upright and rib, then actual generated Front/Top/Right must match the supplied contours and internal lines before acceptance.

Independent analytic validation of the **declared inferred solid**: base area19+π/2, timesheight1; upright area10+π/4, timesdepth1; rib trianglearea4, timeswidth1. Total33+3π/4=35.3561944901923 grid³, or35356.1944901923mm³ at10mm/grid. Bounds60×50×50mm, one connected solid. This is a consistency check, not a publisher mass target or dimension fitting. Actual native/STEP, upstream edit Undo/Redo/Undo, qualified drawing and cold acceptance remain pending parent's Chrome authoring.
