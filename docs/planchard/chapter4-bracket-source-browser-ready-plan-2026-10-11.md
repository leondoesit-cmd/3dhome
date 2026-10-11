# Chapter4 BRACKET source-led browser plan

No CAD authored or imported by this plan. Source activity is book PDF192–194 /4-12–14. Original official archive member `Bracket/Bracket.SLDPRT` has SHA256 `0abaabccf798eb4f428f7029c0cce07638f42adaf61e1a0ada7edfde669499ce`,151292bytes. Actual original preview: `C:/Users/liron/Desktop/3dhome/scratch/planchard/bracket-companion-inspection/PreviewPNG.png`. XML source names/dimensions and validated analytic native-source observations are independently preserved; the latter are unbound records, not an imported BRep or recovered original feature ownership.

## Source coordinate observations

All values below are millimetres in the original coordinate frame. App internal centimetres divide by10; retain document mm so ordinary numeric forms accept the source values. Two nested native-source sections produce137 analytic candidates, with exact repeated circle/cylinder families matching XML and preview. Full raw observations: `scratch/planchard/bracket-source-records/record-observations.json`; validated original container manifest: `scratch/planchard/bracket-full-container/manifest.json`.

|Geometry|Observed source coordinates|
|---|---|
|Overall stock|X0..20,Y0..90,Z−22.5..22.5. Upright thicknessX0..5, base thicknessY0..5.|
|Bend|Coaxial cylinders axisZ at(X7,Y7), outerR7 and innerR2. Arc tangency at outer(7,0)/(0,7), inner(7,5)/(5,7).|
|Base holes|Diameter5, axesY, centres(X15,Z−7.5) and(X15,Z12.5), throughY0..5.|
|Upright large holes|Diameter10, axesX, Y20/40/60/80 crossed with Z−7.5/12.5, throughX0..5.|
|Upright small holes|Diameter5, axesX, Y31/51/71,Z−2.5.|
|Slots|AxesX; R2.5 semicircle end centres(Y27,35),(47,55),(67,75), allZ−17.5. Two parallel straight boundariesZ−20/−15,8mm centre length; overall length13mm/width5mm.|
|Base terminal corner rounds|R2, axesY, centresX18/Z−20.5 andX18/Z20.5.|
|Upright terminal corner rounds|R2, axesX, centresY88/Z−20.5 andY88/Z20.5.|

The source hole/slot placement no longer needs arbitrary invented locations. Exact original entity IDs, original sketch-constraint associations and which feature owns the bend are still not decoded.

## Ordinary browser route and source feature names

1. New independent Part, mm, descriptive source-reconstruction name; original accepted Saved parts untouched. Use Front sketch plane for an XY stock section, extrusion axisZ. Source dimensions Sketch1 are20 and90; Extrude-Thin1 is5mm thick/45mm deep. A centred45mm extrusion should land Z−22.5..22.5. Verify actual native bounds before drilling.
2. **Bend qualification:** source metadata Fillet1 publishesR2 but source analytic geometry also has a concentric outerR7/innerR2 bend. A sharp open L with onlyR2 applied everywhere does not reproduce that geometry. A bounded source-equivalent Thin extrusion can use the open chain(20,0)→(7,0), quarter-circle centred(7,7) from(7,0) to(0,7), then(0,90); the three-point arc midpoint is(2.0502525317,2.0502525317). Inward5mm thickness gives innerR2 while outerR7 remains. For this chain order app Reverse thin side supplies the inward/right offset; verify actual preview/native bounds and radius before acceptance. This reconstructs recovered geometry, **not proof that original Sketch1 contained that arc**. If original automatic-thin corner filleting can be recovered, prefer its source ownership instead.
3. Actual Fillet1 R2 on the four terminal thickness edges: base edges atX20,Z±22.5,Y0..5; upright top edges atY90,Z±22.5,X0..5. Select actual native edges by endpoint/location after stock creation; no persistent IDs can be supplied before the browser model exists. Confirm four R2 cylinder/arc corners. Do not include long bend edges or all12 stock edges indiscriminately.
4. Actual5mm Hole Wizard seed through the base atX15,Z−7.5. Source name `Ø5.0 (5) Diameter Hole1`; pattern `LPattern1`, two instances along+Z,20mm. Source placement dimensions5/10 are consistent with datum-to-edge distances, but source witness world coordinates above are the authoritative recovered placement. HoleWizard definition/profile references must remain functional.
5. Actual10mm Hole Wizard seed through upright atY20,Z−7.5. Source name `Ø10.0 (10) Diameter Hole1`; `LPattern2` feature-scoped rectangular array,2 along+Z at20mm and4 along+Y at20mm. Verify eight true native bores; use the Wizard feature as seed rather than patterning the whole stock body.
6. Source `Sketch6` contains a circleØ5 atY31,Z−2.5 and a capsule slot atY27..35/Z−17.5. Actual `Cut-Extrude1` cuts both disjoint profiles through5mm upright. Source `LPattern3` repeats that cut three instances along+Y at20mm. A normal two-line/two-arc closed capsule preserves analytic R2.5; an unrelated rectangle plus holes would not reproduce the source slot walls. Preserve actual profile constraints/history; no fake feature labels substitute for operations.
7. Right sketch plane corresponds to the YZ upright, Top to the XZ base. UI local-frame signs must be read from the actual new sketch/frame before entering coordinates: legacy principal mapping is Right(U=Z,V=Y) and Top(U=X,V=Z), but local frame records can reverse a basis. If an actual face-supported frame differs, transform the known world centres into that real basis rather than silently mirroring source holes.

## Exact book activity acceptance

Save/open the independently reconstructed BRACKET. Inspect all source feature/profile references and hole/pattern counts. Roll back **above the10mm Hole Wizard**: source base/Fillet1/two base holes remain; large upright bores and final cut pattern disappear. Then roll back **above Fillet1**: first thin extrusion remains and all subsequent operations disappear. Preserve native validity/one connected body/current mesh/bounds and the complete authored graph at each station. Roll to End, verify complete native restoration, Save/reload/open and compare canonical source geometry/history/native STEP. If Saved rollback persistence is additionally exercised, keep it as an independent copy.

Suggested single source driver is LPattern3 count3→2→Undo, or20→21mm spacing→Undo, preserving original metadata; no need to invent publisher parameters. Final Drawing may be a clearly qualified source-reconstruction sheet with principal/iso views and key recovered dimensions, not a claim of an original source drawing that the Chapter4 activity never requests.

Required qualifications: exact original binary import/tree IDs and original bend-feature ownership are unproved. Source material is unspecified; do not substitute a density to fit a guessed mass. The recovered source dimensions/counts/positions and analytic bend/slot shapes are now concrete enough for bounded browser recreation and the exact named rollback stations; generic gear-disk rollback alone does not close this model gap.

## Independent volume and plane-map oracle

The quarter-annulus bend occupiesR2..7 at centre(7,7). The straight base fromX7..20 contributes13×5=65mm²; upright fromY7..90 contributes83×5=415mm². Total section is480+11.25πmm². Source cut locations lie outside the bend and terminal rounds; all hole/slot regions are mutually disjoint, so ordinary analytic subtraction is valid.

|Stage|Exact volume mm³|Numerical value mm³|
|---|---|---:|
|First curved thin extrusion|(480+11.25π)×45|23190.4312808798|
|After Fillet1 four terminal corners|Previous−4×5×(4−π)|23173.2631339516|
|Above10mm Hole Wizard, with two baseØ5 holes|Previous−2×π×2.5²×5|22976.9135931023|
|Final|Filleted−5×π×2.5²×5−8×π×5²×5−3×(8×5+π×2.5²)×5 =20920−723.75π|18646.2723169644|

Final source-equivalent volume is18.6462723169644cm³; mass cannot be asserted because material is unspecified. Count3→2 in LPattern3 should add one small-hole-plus-slot cut volume200+62.5π=396.349540849362mm³; original dimensions/count restored by actual Undo.

Actual production `standardPlaneFrame` maps principal Front(U,V,W)→(X,Y,Z), Top→(X,Y,Z)=(U,W,V), Right (stored `side`)→(W,V,U). Standard datum selection deletes local frame overrides. Thus source seeds can use TopoffsetY5 at(U15,V−7.5), RightoffsetX5 at(U−7.5,V20), and RightoffsetX5 Sketch6 circle(U−2.5,V31)/slot endpoints(U−17.5,V27)/(U−17.5,V35), with reverse5mm cuts through the stock. The Wizard UI may use actual selected support faces instead; that branch requires reading its real local-frame origin/axes before translating these world positions. The plan does not fabricate browser-created native edge/face IDs.
