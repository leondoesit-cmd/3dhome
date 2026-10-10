# BATTERY Detail A source dimensions and native picks

Read-only actual supplied PDF453 / printed9-19 high-resolution inspection and protected `BATTERY-front-detail-layout-postfix-browser-2026-10-10.mforge` native projection/anchor inspection. No CAD/drawing authorship. Source crop `scratch/planchard/battery-detail-453-source-crop.png`; actual readonly scene evidence `scratch/planchard/battery-detail-native-anchor-plan-2026-10-10.json`.

## Source meaning — both bosses are correct

Both saved Boss2 `feature_muk70mow_7`/entity64 and Boss3 `feature_muk70mqo_8`/entity61 have depth1.524cm, inward draft5°. Both native top faces areY11.43cm, base/floorY9.906cm. The source picture likewise has the two terminal tops level. **.450 is not a shorter terminal height.** It measures top→lower outer wall/fillet tangent ledgeY10.287cm:1.143cm/11.43mm/.450in. .600 measures top→recess floor:1.524cm/15.24mm. .200 measures upper casing rimY10.414cm→floorY9.906cm:.508cm/5.08mm. The lower tangent ledge is.127cm below the upper rim due the existing small fillet. No source model geometry repair is justified.

## Ordinary Dimension picks in actual Detail A

Detail `v1eocwbj` has Front basis(rightX/upY), custom1:1, paper scale10mm percm. Parent observed screen centre(1237,438), radius119px; the approximate coordinates below follow that observed transform, not authored state. If the viewport moves, use the actual visible corners. Every suggested point matches a real projected endpoint/midpoint and a named native anchor within.002cm; no frozen coordinate injection is required.

|Dimension|First native anchor / model(u,v)cm|Second native anchor / model(u,v)cm|Approximate actual screen picks|Placement|
|---|---|---|---|---|
|.600|`feature_muk70mqo_8:tool:edge:profile:61:end`,qu+:(.501667,11.43)|`feature_muk70mqo_8:tool:edge:profile:61:start`,qu+:(.635,9.906)|(1298,384)→(1304,449)|Drop to right to select vertical|
|.450|`feature_muk70mow_7:tool:edge:profile:64:end`,qu−:(−2.297719,11.43)|`feature_muk6fhqp_3:edge:generated:line:3`,b:(−3.429,10.287)|(1177,384)→(1128,433)|Drop to left to select vertical|
|.200|Upper rim native anchor at(−3.302,10.414),e.g.`feature_muk6nevy_6:edge:generated:circle:10`,qu−|Floor native anchor at(−3.048,9.906),e.g.`feature_muk6ipxb_4:tool:edge:generated:circle:3`,qu−|(1134,427)→(1145,449)|Drop well left/below, choose vertical|

Coincident named topology can cause the UI to bind an equivalent current edge rather than the specific example PID; independently inspect saved refs and actual vertical remeasurement. Do not demand a predetermined PID if a different real coincident native reference measures the same source datum. The line around screenY427 is the **upper rim**, not the floor. Floor is around449; lower outer wall/tangent datum around433.

## Genuine5° angle limit

Native cone descriptors store angle.08726646259971647rad=5° and correct radius reduction.635→.501667cm over1.524cm. The cone's named seam `feature_muk70mqo_8:tool:edge:generated:line:1` changesZ whileX stays0; it is vertical in Front,5° in Right. Current two-edge Angle tool `straightEdgeAt` accepts named native straight edges only. The Front visible cone silhouette is generated from projection, so choosing its apparent wall cannot honestly bind it to that native seam as5°. A native Right-view seam versus a native vertical casing edge can demonstrate genuine5°, but does not reproduce the source Front Detail callout placement. Do not freeze5° text or pretend the Front seam is inclined.

Finite generic improvement, if required: source-owned draft-angle Model Item can follow the selected actual conical native face's descriptor angle plus consuming feature ID, render its angle callout in the chosen Detail, and remeasure after native draft edits. It must fail closed if the source cone disappears and preserve explicit drawing override semantics. That would be a source-angle annotation rather than an invented pair of straight edges. No implementation is authored in this read-only task.

## Insert Model Items audit

Readonly full planning of the actual postfix bundle returns no additional candidates, despite native boss start/end **rim** edges existing. The current depth planner looks only for `featureID:face:start/end`; both bosses' surviving top planes are `featureID:tool:face:end`, and boolean merge removes separate start faces. ExtrudeCut .508 and extrusion draft angles are outside current planner scope. This is a confirmed planner capability boundary, independent of previously corrected shared-sketch circle ownership. A bounded automatic height extension could pair actual consuming-feature start/end profile rims or genuine start/end planes, preserving native persistent IDs and nominal feature depth rather than guessing equal radii. It would not create the derived .450 datum automatically: that needs the fillet tangent datum/native manual dimension above. Ordinary three native linear dimensions already cover the source values without any model mutation.
