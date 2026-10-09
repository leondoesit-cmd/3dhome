# Exercise 1.4 estimated third-angle worksheet plan

Read-only visual source: `scratch/planchard/drafting-exercise-081.png`, PDF81 / printed1-53, Exercise1.4. The exercise explicitly asks the reader to estimate with graph paper. These are paper drawing coordinates, not source-certified physical model dimensions. No CAD model is authored by this plan.

The Front view has a T outline and a circular opening in the upper bar. The isometric illustration also shows that opening on the front vertical flange face. A straight through-depth bore is the defensible instructional interpretation: its axis is normal to Front and parallel to depth. Top therefore shows the bore as two hidden lines, not a circle. Front conveys the most information because it shows both the characteristic T outline and the bore's circular shape.

The primary dotted grid spacing is approximately18 image pixels. Front is approximately7.5 intervals wide and4.5 high; flange thickness1.5; centered stem width2.5 and stem height3. Circle diameter is approximately1 interval, centered horizontally and halfway through flange height. Right has the same height and visible shoulder level; its depth is approximately4.8 intervals. Adopt nominal5 intervals for a clean illustrative worksheet, explicitly marked estimated. One chosen primary grid interval equals5 **paper mm**. This gives width37.5, height22.5, flange7.5, stem12.5, and illustrative depth25 paper mm. The drawing should retain an estimate note rather than present these as dimensioned manufacturing geometry.

Use local horizontal/vertical coordinates increasing right/up. Front outline, in order:

| Point | X | Y |
|---|---:|---:|
| A | 0 | 22.5 |
| B | 37.5 | 22.5 |
| C | 37.5 | 15 |
| D | 25 | 15 |
| E | 25 | 0 |
| F | 12.5 | 0 |
| G | 12.5 | 15 |
| H | 0 | 15 |

Close H→A. Bore circle center(18.75,18.75), radius2.5; visible outline. Short crossed centerlines at that center extend beyond the circle, using centerline styling.

Missing Top outline is the visible rectangle(0,0)→(37.5,0)→(37.5,25)→(0,25). Add hidden stem edges X12.5 and X25, each over depth0..25. Add hidden bore boundaries X16.25 and X21.25, each over depth0..25, and a depth-directed centerline X18.75 extending slightly beyond both ends. There is no visible shoulder across Top because the flange covers the narrower stem. The four hidden lines remain distinct; do not replace the bore pair with a circle or horizontal transverse pair.

Right is the visible rectangle(0,0)→(25,0)→(25,22.5)→(0,22.5) with visible shoulder Y15 across its width. For a fully annotated solution, add hidden bore boundaries Y16.25 and Y21.25 across depth0..25 and a centerline Y18.75. The printed supplied Right view omits these hidden annotations; adding them is an instructional completion, not a claim that they were already printed. Centered stem side edges project onto this view's outer depth edges and require no extra internal vertical pair.

For the actual browser blank sheet, paper coordinates start at the top-left and Y increases downward. Use **Top(30,35), Front(30,80), Right(90,80)** as paper bounding-box origins, all in mm. Map the upward local Front coordinates above by `paperX = 30 + X`, `paperY = 80 + (22.5 - Y)`; map Right by `paperX = 90 + depth`, `paperY = 80 + (22.5 - Y)`. For Top, let its depth coordinate increase downward from its paper origin: `paperX = 30 + X`, `paperY = 35 + depth`. Top occupies paper Y35..60, while Front/Right occupy Y80..102.5. This places Top above Front and Right to its right with aligned widths/heights, preserving third-angle projection.

Finite browser QA should check: Front closed eight-segment T silhouette with circular bore; Top closed37.5×25 rectangle above Front; all four Top hidden lines remain distinct and parallel to depth; Top centerline lies halfway between bore boundaries; Front and Top share X30..67.5; Front and Right share Y80..102.5; Right shoulder lies at paperY87.5. Circle center maps to Front paper(48.75,83.75). Top hidden lines map to paperX42.5/55 (stem),46.25/51.25 (bore), and center48.75 over Y35..60. Hidden/center styling and an estimate note should survive save/cold reopen; the worksheet need not create a physical solid.

Use a small annotation: `Estimated graph-paper reconstruction; 1 grid interval = 5 paper mm; depth rounded to 5 intervals. Front is most informative. Bore interpreted through depth.` No physical fit, bore-depth dimension, material, or manufacturing accuracy follows from this exercise.
