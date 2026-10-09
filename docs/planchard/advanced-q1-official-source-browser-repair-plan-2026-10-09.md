# Advanced1 official-source browser repair plan — 2026-10-09

Read-only source interpretation, not repaired-model acceptance. Source is the publisher's `Advanced Part Modeling-Question1.SLDPRT`, extracted to `scratch/planchard/official-advanced-q1-container`; all 45 modern container blocks passed inflated-length and CRC verification. Named producer/dimension evidence comes from Keywords and ResolvedFeatures; analytic boundaries come from `official-advanced-q1-partition-inspection/record-observations.json`. No source geometry was imported and no answer mass was used to choose dimensions.

## Coordinate convention and source feature bindings

All following authoring coordinates are inches. Source X/Y map directly to app Front sketch X/Y; source Z maps directly to app axial Z. Rear flange occupies Z0..0.4; shaft Z0.4..2.1; front flange Z2.1..2.6. The historical app has these end roles reversed and shaft length2.2 rather than source1.7.

Keywords binds Boss1/Sketch1 (IDs27/15), Boss2/Sketch2 (33/28), Boss3/Sketch3 (49/34), Cut1/Sketch4 (57/50), Cut2/Sketch5 (76/71), Chamfer1 (81), Fillet1 (114). ResolvedFeatures serializes Cut2 at75770, Chamfer1 at78517, Fillet1 at83072: **chamfer precedes fillet**. Sketch4 is Ø0.75; Sketch5 is Ø1.5. Cut2 is a0.1 blind recess; Chamfer1 is0.1/45°; Fillet1 isR0.1.

Cut2's D1 at byte77361 is0.00254metres. Its dimension endpoints at77392/77408 and77416/77432 are (X0.01905,Z0.06604) and (X0.01905,Z0.0635): radius0.75, front Z2.6 to floor Z2.5. Chamfer1's D1 at80080 is the same0.00254; its displayed wall-distance endpoints at80111/80127 and80135/80151 lie at X−0.01905 and the same two Z stations. Its selected-surface wrappers carry producer76, the named Cut2 producer. The complete proprietary edge-selector schema remains undecoded: these are producer and dimension bindings, not an exact live edge ID export.

Final native candidate circles corroborate front recess radius0.75 at Z2.6 (attr343), radius0.65 at Z2.5 (attr276), and straight bore radius0.375 at Z2.5 (attr273) and Z0 (attr346). Final axial face candidates include the recessed floor Z2.5 (attr456), front exterior Z2.6 (472), and front rear face Z2.1 (476). The source preview independently shows a recessed tapered central opening, not an additive reverse collar.

The follow-up compact **cone** record at section0 byte26369, attr541, directly supplies origin(0,0,63.5)mm, axis+Z, radius16.51mm and slope sin/cos45°. Thus the decoded source has a true conical surface R0.65 at Z2.5, reaching R0.75 at Z2.6, independently of the circle-only inference. This is not a rounded pocket fillet. Evidence is preserved in `artifacts/planchard/ADVANCED-Q1-cone-torus-source-evidence-2026-10-09.json` and its read-only parser.

**Supported operation/order:** Sketch5 Ø1.5 → Cut2 blind0.1 → Chamfer1 0.1/45° with Cut2-derived selection references → Fillet1. **Not yet formally resolved:** the exact original input edge(s), selected side, or face-chamfer mode inside the opaque Chamfer payload. The earlier bottom-ring assertion is downgraded to a browser-selection hypothesis. It would replace/fill the counterbore corner; ordinary removal-only entrance chamfer intuition does not establish that operation. Do not claim the source selector was decoded from its dimension display endpoints.

For browser trials, use front Z2.6 toward−Z, blind0.1 Ø1.5 and inspect the available Cut2-derived chamfer selections. Accept a selection only when its native preview produces the source cone R0.65/Z2.5 → R0.75/Z2.6 while preserving the outer flange Z2.6 and boreR0.375. An entrance chamfer producing R0.85 fails this source geometry. If no supported selection produces it, retain the failed transaction and explicitly disclose a source-equivalent tapered cut as an alternate workflow; exact original chamfer selection remains unresolved. Do not silently retain the historical additive collar.

## Flange contours and holes

Rear Sketch1 has four convexR0.5 arcs centered at (0,±1),(±1,0), connected by four diagonal common tangents. For example the top-right tangent runs from (0.353553390593,1.353553390593) to (1.353553390593,0.353553390593). Repeat by quarter-turn symmetry. Arc sweep around the top lobe passes through (0,1.5), around the right lobe through (1.5,0). This is a rounded diamond, not a rounded square with centers(±1,±1). Its fourØ0.35 holes are centered at (0,±1),(±1,0), and terminate through only the rear flange.

Front Sketch3 has four convexR0.5 arcs centered at (±1,±1) and four concaveR1.5 arcs centered at (0,±(1+sqrt(3))),(±(1+sqrt(3)),0). Adjacent convex/concave arcs meet tangentially; top-right lobe endpoints are (0.75,1.433012701892) and (1.433012701892,0.75). The convex lobe passes through its outer diagonal point (1.353553390593,1.353553390593); top concave arc passes through (0,1.232050807569). Repeat by symmetry: **eight arcs, no straight joins**. FourØ0.35 holes at(±1,±1), through only front0.5 thickness. Source native circle stations confirm these corner holes at Z2.1 and2.6, while rear cardinal holes are at Z0 and0.4.

Source rear fillet boundaries include outerR0.5 at Z0.3 andR0.4 at Z0.4 (lobe centers at cardinals), smallR0.1 transition arcs at Z0.3, and shaft-root radius0.65 at rear Z0.4 blending to shaft radius0.55 at Z0.5. Follow-up kind54 torus records independently confirm four rear perimeter surfaces centered at cardinal X/Y±1,Z0.3 with majorR0.4/minorR0.1, and the rear shaft-root torus centered atZ0.5 with majorR0.65/minorR0.1. These corroborate filleting the rear flange's upper perimeter and shaft-root edges, rather than assuming only two shaft junctions. Native selected-edge ownership for every Fillet1 edge remains undecoded. Front shaft join remains sharp at Z2.1 in the decoded candidates; verify against the preview/source boundaries before adding an unproven front-root fillet.

## Historical browser model and finite repair order

Saved library name: `Planchard Advanced Q1 - fresh print reconstruction 2026-09-30`. Protected input: `artifacts/planchard/ADVANCED-Q1-fillets-mass-audit-browser-2026-09-30.mforge`.

|Existing role|Feature / sketch|Repair|
|---|---|---|
|Boss1 rear|feature_munl98y9_1 / sk_09bz2|Source rear rounded diamond; offset2.2→0, depth0.4 unchanged. Rebuild the four lines/four arcs with explicit dimensions/tangencies; cardinal rear holes.|
|Boss2 shaft|feature_munlcs9l_2 / sk_1rs1o|Ø1.1, startZ0.4, depth1.7; replace current start0/depth2.2.|
|Boss3 front|feature_munlzqcv_3 / sk_28g6a|StartZ2.1/depth0.5, exact tangent eight-arc front outline; corner holes.|
|Cut1 scallops|feature_munm4h5z_4 / sk_3u6z6|Historical rounded-square plus circular-cut decomposition can leave straight joins. Exact front outline replaces this role; do not suppress cascading history without inspecting downstream dependencies.|
|Boss4 wrong collar|feature_munmlzq5_5 / sk_4nbgn|Reuse Ø1.5 circle1808/center1809 as front recess if operation conversion supports the geometry: offsetZ2.6, cut toward−Z, depth0.1, no draft initially. Preserve original diagnostic.|
|Central bore|feature_munmujhm_6 / sk_5yyqj|Ø0.75 circle1829/center1830, axial through-all bore. Source this operation precedes recess/chamfer.|
|Four corner through-both holes|feature_munnc8zg_1 / sk_11f75|Replace scope with separate rear cardinal and front corner sets confined to their flange thickness; through-both corner pattern is wrong at rear.|
|Fillet1|feature_munnksco_2|After upstream repair, explicitly refresh/select valid current rear perimeter and shaft-root edges; sourceR0.1. Do not silently auto-rebind lost edge IDs.|

App editability is not certified by this read-only plan. Boss contour replacement must persist its new entity IDs and remain fully defined; inspect available refresh/rebind controls before deleting old entities. If a history-preserving repair is unsafe, a fresh browser reconstruction with the source feature sequence is preferable to an untracked dependency substitution. Parent owns all actual authoring.

Keep printed density0.097lb/in³ distinct from companion nominal1060 Alloy2700kg/m³. Historical model intentionally used the printed convention; neither density is a geometry correction. After repair, verify native one solid, exact source datums, fully defined sketches, edit/Undo/Redo/restore, clean Save/cold reopen, STEP equivalence, then report volume/COM/material conventions independently. Printed answers are validation outputs, not parameter inputs.
