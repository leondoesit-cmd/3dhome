# Publisher erratum and Chapter2 illustrative projections

Read-only supplied PDF161/3-33, actual protected3.10–3.16 cold worksheet, CH3 review worksheet and fresh supplied-PDF93–98 renders inspected. Parent reports actual Chrome inspection of the [2021 official errata](https://www.sdcpublications.com/Textbooks/Engineering-Graphics-SOLIDWORKS-2021/ISBN/978-1-63057-407-9/Errata/): only correction is Chapter3 page33 final bottom-right interference calculation. Independent web fetch of that page was unavailable; this report attributes the publisher observation to parent's actual browser inspection and independently verifies the supplied page/arithmetic. It does **not** recover3.9 glyphs.

## Exact erratum and existing answers

Supplied PDF161 visibly prints transition-fit hole limits1.2500..1.2506 and shaft1.2503..1.2509, but final result incorrectly says.0003. The largest-shaft minus smallest-hole calculation is **1.2509−1.2500=.0009in interference magnitude**. Signed MMC allowance(hole−shaft) is **−.0009in**. Maximum clearance remains1.2506−1.2503=+.0003in. Thus this is a transition fit, permitting either sign. Publisher correction does not change the valid positive-clearance line or interference-example values above it.

Actual cold `EXERCISES-3.10-3.16-cold-browser-2026-10-10.mforge` contains correct, **different** source3.15/3.16 calculations: hole1.124..1.126, shaft1.121..1.124; MMC allowance.000, maximum clearance.005in. No1.250x or wrong.0003 interference line was found in those Notes or CH3 review Notes. **Do not edit3.15 to.0009**: the erratum is a worked example on3-33, not homework3-52.

No dedicated browser worksheet for the corrected3-33 worked example was located. Minimal genuine closure: independent annotation-only native Drawing with these **nine source-grounded LF rows**, Save/SVG/readable PNG/exact Saved cold. A new solid is unnecessary; the source's hole/shaft schematic is illustrative context for arithmetic, not a dimensioned model assignment.

```text
CH3 WORKED TRANSITION FIT — CORRECTED ERRATUM
Source supplied PDF161 / printed3-33; units inches.
Hole limits:1.2500 to1.2506.
Shaft limits:1.2503 to1.2509.
Maximum clearance=1.2506−1.2503=+.0003.
MMC allowance=1.2500−1.2509=−.0009.
Interference magnitude=1.2509−1.2500=.0009.
Printed final.0003 is corrected by official2021 errata.
Separate3.15/3.16 remain.000/.005;3.9 not resolved.
```

Place text origin35/60 on A3; chosen presentation, no exact publisher typography claim. If depicting two range bars, use explicitly symbolic paper geometry, not mm-length representations of inch tolerances.

## Source projection examples still unlocated

Fresh supplied page renders confirm three distinct illustrations absent from earlier example coverage inventory. They are explanatory/step examples, **not new numbered exercises**. Existing isometric-hole models prove real ellipse projection, but do not by themselves perform all the following construction stages. Official Chapter2 sample may corroborate them; no separately fetched public sample was available to this reviewer, so source identification here uses the supplied full PDF and does not assert a sample-only requirement.

|Source|Actual content / remaining example witness|Bounded next action|
|---|---|---|
|PDF93–94/2-7–8|Circle rotates into ellipse/edge/circle; major/minor axes; angled cylinder built with two ellipses and parallel generators.|Native paper currently has no ellipse primitive. A source-faithful geometric ellipse worksheet needs a bounded genuine paper ellipse tool, or actual circle projection from a native cylinder with correctly documented plane/view plus construction-axis explanation. **Circular-arc approximation is not a true ellipse**; B4's expressly approximate Isometric cannot close this exact curve example. No new mandatory manufacturing dimensions are supplied.|
|PDF96–97/2-10–11|Five-step Cabinet oblique cylinder: true front circle,45° recession, half-depth example100→50mm, rear circle, two tangent generators; shading optional.|Ordinary native PaperCircle/Arc/Line construction can close this without uploads/CAD or new code; suggested exact illustrative geometry below. One finished figure plus retained Centreline construction axes and procedure note is sufficient to explain all finite stages; a pixel-identical staged page is not claimed.|
|PDF97–98/2-11–12|Road photo explains parallel sides converging to one vanishing point; one/two-point discussion and house illustration.|One native paper road-convergence diagram with source explanatory Note is a bounded illustrative witness. Do not fabricate/re-upload source photo or claim rendering a real road. Two-point explanatory house can be included if claiming that separate illustrated example; no source-directed dimensioned building assignment exists.|

### Upload-free Cabinet cylinder recipe

Choose front radius20mm (illustrative; source does not size diameter). Front centreF(80,150), back centreB(115.355339,114.644661), recession at45° with **paper length50mm**, representing the source's hypothetical physical100mm under Cabinet half-scale.

- Visible front Circle F/r20; full rear construction Circle B/r20, **Centerline** style.
- Visible rear half Arc start(129.497475,128.786797), through(129.497475,100.502525), end(101.213203,100.502525).
- Visible tangent generators:(94.142136,164.142136)→(129.497475,128.786797) and(65.857864,135.857864)→(101.213203,100.502525).
- Centerline cylinder axisF→B; four centre crosses: F horizontal(55,150)→(105,150), vertical(80,125)→(80,175); B horizontal(90.355339,114.644661)→(140.355339,114.644661), vertical(115.355339,89.644661)→(115.355339,139.644661).

Expected10 native primitives:front circle/rear guide circle/rear visible arc/2generators/axis/4crosses. Front remains truly circular, not an ellipse. Rear hidden half remains a disclosed construction guide; final source optional shading is omitted. Native note: sourcePDF96–97/2-10–11, chosen radius,100→50 Cabinet recession,45°; applyprocedure five stages; no 3D manufacturing claim. Save/cold geometry/styles/readability required.

### Upload-free perspective road recipe

Choose VP(185,60). Native Visible lines(100,240)→VP and(270,240)→VP; Centerline horizon(110,60)→(280,60), optional Centerline centre ray(185,60)→(185,240). Four Visible centre dashes atX185: Y215→235,175→190,147→157,128→134. Eight native primitives total; decreasing dash lengths/spacing are chosen illustrative depth cues, not source measurements. Explain that the physical road edges are parallel while the projected image edges converge atVP; farther spans appear smaller. Source97 uses a photo, so this is a geometric explanatory equivalent, not photo recreation or proof of the app's3D Perspective toggle.

These precise newly identified worked examples supersede my previous statement that no further actionable examples were located. They leave source3.9/Plane7H and physical/proprietary qualifications unchanged. No browser/CAD/code/ADVANCE/Git mutation in this source audit; only read-only renders and this report were created.
