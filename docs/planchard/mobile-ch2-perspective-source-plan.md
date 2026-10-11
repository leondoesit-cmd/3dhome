# Chapter2 perspective illustrations — source-only mobile plans

Original source renders: `scratch/planchard/mobile-source-098.png` (printed2-12/PDF98) and `mobile-source-099.png` (2-13/PDF99). Independently inspected original photographic railway, drawn shed, rendered structural frame, and separate arrangement-of-views block. All following paper-mm dimensions are illustrative; neither source page gives authoritative dimensions. These plans do not count as authored/mobile accepted artifacts.

## A. One-point railway,2-12/PDF98

Source is a railway photograph. Native paper reconstruction should retain rails, shrinking sleepers and one shared vanishing point; scenery/photo replication is outside this schematic scope.

- Vanishing point V=(150,90); optional centerline horizon(80,90)..(220,90).
- Left rail(110,180)→V; right rail(190,180)→V. Second outer rail edges can use(108,180)→V and(192,180)→V.
- Horizontal sleepers with decreasing spacing: Y175 endpointsX107.5,192.5;Y160 X115,185;Y145 X122.5,177.5;Y132 X129,171;Y121 X134.5,165.5;Y112 X139,161;Y105 X142.5,157.5;Y100 X145,155;Y96 X147,153.
- The sleeper endpoints lie on rays from near sleeper corners(105,180),(195,180) toV. Rails and sleeper-length envelope thus converge exactly to the same point. Sleepers cross bothrails and project perpendicular to the viewing direction.
- Label ONE POINT / RAILWAY and source/schematic qualification. No arbitrary photograph dimensions or CAD rail profile claim.

## B. Two-point shed with slats/opening,2-12/PDF98

Keep the source's upright corner, two slatted walls and rectangular opening on the right wall. Vertical edges remain vertical; left-wall horizontal edges converge to L=(40,100), right-wall horizontal edges to R=(270,100). These are construction VPs; they can be indicated by short centerlines/light guides and labels outside the visible shed.

Main front corner top C=(150,115),bottom D=(150,185). Outer left wall edge top A=(85,106.136364),bottom B=(85,134.772727). Outer right wall edge top E=(210,107.5),bottom F=(210,142.5).

Draw C–A,A–B,B–D,D–C,C–E,E–F,F–D. C–A andD–B meetL when extended; C–E andD–F meetR. No generic cube substituted for the shed.

Left slats: chooseX=95,105,115,125,135,145. For each X draw from
`topY=100+15*(X-40)/110` to `bottomY=100+85*(X-40)/110`.
Right slats: chooseX=160,170,175,185,195,205. For each X draw from
`topY=100+15*(270-X)/120` to `bottomY=100+85*(270-X)/120`.

Right-wall opening corners:

- upper-left(175,122.166667),upper-right(195,117.5)
- lower-left(175,147.5),lower-right(195,137.5)

Draw fouredges. Header andsill convergeR, jambs vertical. For right slats insideX175..195 omit the opening portion: draw upper slat only to openingtopY=`100+28*(270-X)/120`, and lower portion from openingbottomY=`100+60*(270-X)/120` to wallbottom. At jambX175/195 don't duplicate collinear opening outlines. A thin offset roof band is optional; all band horizontal edges must use the same respective VP. Source slat count/roof trim dimensions are illustrative; no opaque siding or photorealism claim.

## C. Three-point building structural frame,2-13/PDF99

Source is a rendered open multi-bay frame seen from above, with intermediate floor surfaces. Recreate a structural schematic with roof grid, two floor levels, and columns; a generic cube does not reproduce that illustration. Downward columns converge toward thirdVP H=(150,300), consistent with looking downward. Horizontal beam families convergeL=(30,65),R=(280,65).

Grid indices: X=0,1,2;Z=0,1,2,3;Hlevel=0(roof),1(intermediatefloor),2(lowerfloor). Coordinates below derive from one projective map, so all beam/column families have their correct VP. Paper coordinates are rounded to.001mm for native input; source units/measurements not claimed.

| Level | Z | X0 | X1 | X2 |
|---|---|---|---|---|
| roof0 |0|(150,120)|(122.308,107.308)|(105,99.375)|
| roof0 |1|(173.443,110.082)|(145.132,101.184)|(126.154,95.220)|
| roof0 |2|(189.722,103.194)|(162.184,96.609)|(142.745,91.961)|
| roof0 |3|(201.687,98.133)|(175.408,93.061)|(156.106,89.336)|
| floor1 |0|(150,156)|(126.774,138.387)|(111.081,126.486)|
| floor1 |1|(169.456,142.381)|(145.819,129.266)|(129.034,119.952)|
| floor1 |2|(183.846,132.308)|(160.653,122.161)|(143.537,114.672)|
| floor1 |3|(194.921,124.555)|(172.534,116.471)|(155.498,110.319)|
| floor2 |0|(150,180)|(130,160.833)|(115.714,147.143)|
| floor2 |1|(166.628,165.291)|(146.337,150.396)|(131.293,139.353)|
| floor2 |2|(179.485,153.918)|(159.464,142.009)|(144.173,132.913)|
| floor2 |3|(189.722,144.861)|(170.244,135.122)|(155,127.5)|

At each of the3levels, draw3longitudinalbeams X0/X1/X2 joiningZ0→Z3, and4transversebeams atZ0/Z1/Z2/Z3 joiningX0→X2:7linesperlevel. Then12columns join correspondingroof0→floor2 positions:33center-edge schematiclines total. Intermediatefloor intersections lie on those samecolumns. Crossings are intentional for open wireframe schematic, not a hidden-line solid projection. To convey solid floor patches without claiming exact rendering, add a closed boundary around selectedfloor1bay X0..1/Z0..1 and label FLOOR; hatch/pale fill only if supported natively. Labels FRAME / THREEPOINT and source qualification suffice if fill omitted.

Projection map used only for read-only source-plan arithmetic:
`den=1+.30*X+.22*Z+.25*Hlevel`
`paperX=(150+.30*X*30+.22*Z*280+.25*Hlevel*150)/den`
`paperY=(120+.30*X*65+.22*Z*65+.25*Hlevel*300)/den`.
Do not run this map to inject CAD geometry; all actual lines must be touch authored through native forms.

## Distinct next task: arrangement-of-views block,2-13/PDF99

The lower illustration onPDF99 is a separate stepped/block model with a base, tall rear block, raised side strip, viewing arrows and ±30°isometric axes. It is **not** part of the three-point frame. Queue a separate native mobile artifact and source audit after the frame. It has no source dimensions; do not merge it with genericcube or previouslyauthoredExercise1.8. Followed by third-angle/two-view discussion2-14/PDF100 and worked stepped-shaft two-view illustrations2-15/PDF101.
