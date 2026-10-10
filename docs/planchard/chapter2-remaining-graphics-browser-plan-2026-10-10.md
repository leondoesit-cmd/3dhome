# Chapter2 remaining graphics: finite actual-browser plan

Source visually reviewed: PDF92/105/124/125/126, printed2-6/2-19/2-38/2-39/2-40. Read-only renders `scratch/planchard/chapter2-graphics-source-NNN.png`, plus close crops `chapter2-2.2A-crop.png` and `chapter2-2.3B-crop.png`. No browser/model authoring, imported geometry, code change, ADVANCE edit or commit occurred in this planning task.

## Exact figure inventory

| Prompt | Source | Number | Required visible subjects |
|---|---|---:|---|
| In-chapter Example1 cube exercise | PDF92 /2-6 |1|Cube with equal isometric axes; construction progression|
| In-chapter Exercise1 | PDF105 /2-19 |1|Thick bridge block, rectangular bottom/front opening, round top hole|
| Exercise2.2 | PDF124 /2-38 |2|A: stepped base/tall block with upper front-left rectangular notch. B: stepped base/tall block with large circular Front hole|
| Exercise2.2 answer space | PDF125 /2-39 |0|Two blank answer grids; no additional source models|
| Exercise2.3 | PDF126 /2-40 |2|A: raised left upright on fork-notched base. B: tall block on front-projecting plinth with a triangular beveled facet|

**Six outputs total.** Exercise2.1/PDF124 is separately completed and must not be recreated.2.4/PDF127 is the separate3/2/1 vanishing-point answer. These figures have **no source physical dimensions**. All sizes below are disclosed illustrative design choices maintaining visible topology/proportions; do not certify publisher dimensions, material, mass, exact source native history or unseen geometry. The source requests hand/freehand isometric graphics. Native browser solids used to generate the curved isometric views are valid supporting construction, but paper evidence is the requested output.

## Shared coordinate and UI convention

For native models use X=width, Z=depth (front0, rearpositive), Y=height. All quoted native sizes below are chosen mm, with no material requirement. Browser principal planes: Top=X/Z at fixedY; Front=X/Y at fixedZ; Right=Z/Y at fixedX. Author closed profiles and Boss/Cut via ordinary controls, then actual Drawing isometric view, source/disclaimer notes and title. Save exact name/key, export contemporaneous bundle/SVG/PNG, cold reopen and compare Drawing/definitions. If rebuilding native geometry, verify actual valid connected solid and native/STEP agreement; a paper-only drawing needs no fake CAD body or native mass claim.

For straight-edged paper-only work a consistent isometric mapping is:

`paperX=OX+S*sqrt(3)/2*(X+Z)`

`paperY=OY+S/2*(X-Z)-S*Y`

X/Z/Y here are **illustrative grid units**, paperS=5mm per grid interval; origin chosen to fit the sheet. Numeric values can be typed through the actual primitive point editor, as2.1 demonstrated. This formula is a coordinate plan, not permission to inject/import an authored drawing. Lines parallelX/Z are30degrees to horizontal and verticals stay vertical. Do not draw an isometric circle as an ordinary paper circle: it must project to an ellipse. Use a native circular-hole model/actual isometric view for the two hole figures unless a genuine ellipse paper tool is available.

## Output1: cube / PDF92 /2-6

Minimal paper recipe with gridcube6×6×6, paperS5mm, OX120/OY180:

| Vertex | X,Z,Y | PaperX,PaperY mm |
|---|---|---|
|A|0,0,0|120,180|
|B|6,0,0|145.980762,195|
|C|6,6,0|171.961524,180|
|D|6,6,6|171.961524,150|
|E|0,6,6|145.980762,135|
|F|0,0,6|120,150|
|J|6,0,6|145.980762,165|

Draw one closed outline polyline **A→B→C→D→E→F→A** and three lines **F→J, D→J, B→J** (four native paper primitives, nine visible edges). Optional construction axes fromJ: vertical up,30°left up,30°right up; use center/construction style and identify them as guides. The source isometric drawing convention uses equal measured axes; do not substitute perspective. The final cube itself has no hidden dashed edges requested.

```text
IN-CHAPTER CUBE EXERCISE
Source: printed2-6 / PDF92.
Equal axis lengths; width/depth axes30degrees to horizontal.
Vertical edges stay vertical.
Illustrative6-grid cube at5mm per interval.
Source specifies no physical cube size or material.
```

## Output2: bridge with top hole / PDF105 /2-19

The source shows a thick top slab supported by two front legs; the lower opening is a rectangular notch open at the bottom. Top has one round hole. The image does not certify unseen bottom/back shape. Choose the simplest constant-depth interpretation, explicit in the note: rectangular lower opening through the depth, top hole through the remaining roof.

Illustrative native recipe:

1. New part. Top rectangle **X0..60, Z0..40**, Boss+Y**30**.
2. Front rectangle **X20..40, Y0..15**, Cut+Z through depth**40**. Opening starts at bottom, leaving20mm legs and15mm roof.
3. Top circular sketch at **Y30**, center **X30/Z20**, radius**6**. Cut−Y**15** to the underside roof/opening. A through-all cut may also cut imaginary empty space, but must not remove leg material. Capture actual top hole ellipse in isometric Drawing.

Expected visual landmarks: uninterrupted rectangular top face with ellipse at center; two front legs; visible inner left/right opening jamb/roof edges; right side outside face. No falsely dimensioned source drawing or physical print claim.

```text
IN-CHAPTER EXERCISE1 - BRIDGE BLOCK
Source: printed2-19 / PDF105.
Isometric answer with lower rectangular opening and top circular hole.
Illustrative envelope60x40x30mm; no publisher physical sizes.
Opening is interpreted through the depth; top hole passes through the roof.
These unseen-depth choices are disclosed assumptions.
```

## Output3: Exercise2.2A upper notched stepped block / PDF124 /2-38

The source upper figure has a main tall block, a low right foot extending alongX and a notch at the **upper front-left** corner. The notch is open to front and left; do not turn it into a central enclosed pocket or delete the low right foot.

Illustrative native recipe:

1. Top base rectangle **X0..65, Z0..40**, Boss+Y**10**.
2. Top sketch atY10 rectangle **X0..50,Z0..40**, Boss+Y**50** (totalheight60).
3. Top sketch atY60 rectangle **X0..15,Z0..15**, Cut−Y**15**. This gives upper notch floorY45, open front/left, while rear/right main block remains fullheight60.

A minimal paper interpretation may use projected polygon/edges of that same chosen block; native construction is three solid features and makes source topology easy to verify. Do not assign material.

```text
EXERCISE2.2A - UPPER NOTCHED BLOCK
Source: printed2-38 / PDF124, first pictured model.
Tall block, low right foot, upper front-left corner notch.
Illustrative base65x40x10mm, totalheight60mm.
Upper notch15x15x15mm; all sizes are chosen estimates.
Source asks approximate size and gives no physical dimensions.
```

## Output4: Exercise2.2B stepped block with Front hole / PDF124 /2-38

Use the same base/main envelope as2.2A, **omit the upper notch**, add a large round hole through the main **Front face**. The hole axis isZ, notY: top face has no circular opening in this source figure.

1. Top baseX0..65/Z0..40 Boss+Y10.
2. TopY10 mainX0..50/Z0..40 Boss+Y50.
3. FrontZ0 circle center **X25/Y35**, radius**15**, Cut+Z**40**.
4. Drawing isometric with actual projected ellipse/hole wall. Main Front hole stays entirely above baseY10, with lowestholeY20 and highestY50, so10mm ligaments remain top/bottom.

```text
EXERCISE2.2B - FRONT THROUGH-HOLE BLOCK
Source: printed2-38 / PDF124, second pictured model.
Tall block on a low right-extending foot.
Large round hole is on Front, with depth-axis bore.
Illustrative envelope65x40x60mm and hole diameter30mm.
All dimensions are chosen estimates; no publisher units or material.
```

## Output5: Exercise2.3A fork base and left upright / PDF126 /2-40

The upper source figure has a tall left wall (spansdepth) on the low base and a rectangular fork gap open at the **front base edge**, leaving two arms. Do not create a top-only blind pocket. Choose:

1. Top base **X0..80,Z0..40**, Boss+Y**15**.
2. TopY15 leftupright **X0..20,Z0..40**, Boss+Y**35** (totalheight50).
3. TopY15 rectangle **X30..45,Z0..20**, Cut−Y**15** through base. Gap is open front; rear bridgeZ20..40 remains. It must not enter the left uprightX0..20.

Source only supplies a pictured shape; size is explicitly approximate. The chosen upright/base/notch proportions may be tuned visually before source acceptance, but don't infer exact missing dimensions.

```text
EXERCISE2.3A - UPRIGHT AND FORK BASE
Source: printed2-40 / PDF126, first pictured model.
Left upright spans the depth; base fork gap opens at the front.
Illustrative base80x40x15mm, upright20mm wide and50mm totalheight.
Illustrative fork gap15x20mm through the base.
Source sizes are approximate; no physical dimensions or material given.
```

## Output6: Exercise2.3B triangular facet block on plinth / PDF126 /2-40

The lower source figure is **not a simple two-dimensional roof ramp**. Its light triangular face has three distinct vertices: one on the Front top edge, the top rear-right corner, and a low Front-right corner. Preserve the triangular face and its two oblique edges. A rectangular ramp would lose the source topology.

Paper-only isometric is the shortest faithful workflow. Use illustrative grid envelope mainwidth6/depth4/mainheight5, front-projecting plinthdepth1/baseheight.5. Coordinates below use Zfront-main=1, Zrear=5; plinthZ0..5; baseY0..0.5; mainY0.5..5.5. Choose bevel vertexA atX2/frontZ1/Y5.5, B atX6/rearZ5/Y5.5, C atX6/frontZ1/Y1.0. The unseen topology is the simplest planar corner trim matching the pictured facet.

**Native alternative, four solid operations:** Top plinthX0..60/Z0..50 BossY5; TopY5 mainX0..60/Z10..50 BossY50; upper Front-right corner trim with native Loft Cut from TopY55 triangle(X20,Z10),(X60,Z10),(X60,Z50) to terminal point(X60,Y10,Z10). The vertex point is a genuine browser-authored terminal section, not an imported mesh. This removes one tetrahedral corner, producing a planar triangular bevel. Validate oneconnectednativebody; source gives no numeric bevel values.

For paper construction define these3D vertices and project with the shared equation, S5/OX100/OY210:

|Name|X,Z,Y|Meaning|
|P|0,0,0|plinth front-left bottom|
|Q|6,0,0|plinth front-right bottom|
|R|6,5,0|plinth rear-right bottom|
|S|6,5,.5|plinth rear-right top/main rear-right bottom|
|T|6,5,5.5|main rear-right top / triangleB|
|U|0,5,5.5|main rear-left top|
|V|0,1,5.5|main front-left top|
|W|0,1,.5|main front-left bottom|
|L|0,0,.5|plinth front-left top|
|M|6,0,.5|plinth front-right top|
|N|6,1,.5|main front-right bottom|
|A|2,1,5.5|triangle Front-top vertex|
|C|6,1,1|triangle Front-right low vertex|

Exact ready-to-type paper point coordinates (mm), matching the above chosen grid:

|Name|PaperX|PaperY|
|---|---:|---:|
|P|100|210|
|Q|125.980762|225|
|R|147.631397|212.5|
|S|147.631397|210|
|T|147.631397|185|
|U|121.650635|170|
|V|104.330127|180|
|W|104.330127|205|
|L|100|207.5|
|M|125.980762|222.5|
|N|130.310889|220|
|A|112.990381|185|
|C|130.310889|217.5|

Outline **P→Q→R→S→T→U→V→W→L→P**. Interior visible lines **L→M→N→W** (front-projecting plinth top), **M→Q**, **N→C**, **V→A→T**, **A→C**, **C→T**. These paths retain the triangularfacetA/C/T, adjacent truncated Front/Top/Right faces and the thin projecting plinth. SegmentS→R is the plinthside vertical; source mainrightface bottom meetsplinthtopS. All coincident endpoints should be entered numerically and checked after save; no canvas near-snap assumptions.

```text
EXERCISE2.3B - TRIANGULAR FACET BLOCK
Source: printed2-40 / PDF126, second pictured model.
Three-vertex planar corner facet, not a rectangular roof ramp.
Front-projecting thin plinth retained.
Illustrative proportions and bevel stations chosen from the picture.
Source gives approximate size, no physical dimensions or material.
```

## Actual acceptance / queue handling

Each of the six outputs needs its own source-labelled evidence or a clearly partitioned multi-figure sheet with individual labels. Confirm displayed hole curves are ellipses, open slots/notches are open on correct sides, and2.3B has a triangular face. Save/nativebundle/SVG/actualChromePNG and fullcoldreopen are finite evidence gates. Parent sourcevisualreview precedes final acceptance of undimensioned proportions. Do not mark the figures complete from this plan or the existing2.1 audit. Keep fullbook/physicalprint/externalcertification status separate.
