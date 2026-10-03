# Exercise 8.16: RE11 and RE12 browser acceptance

Both parts were authored from blank in desktop Chrome dark theme through ModelForge's visible sketch, feature, pattern, material, property, save, and export controls on 2026-10-03. Dimensions are original designer choices because the book's exercise illustration and BOM do not supply part dimensions. The complete radial engine assembly, kinematic loop, clearance cycle, and drawing remain pending.

| Part | Browser-authored geometry | Browser and independent native result |
|---|---|---|
| RE11 counterweight, provisional book item 11, qty 2 | Fully defined Front sketch: Ø72 outer, Ø12.2 central journal bore, Ø12.2 eccentric bore at local (0, 18) mm. Extrude 10 mm. | Cold library reopen: 2 history steps, 1 solid. Native valid 1 solid; volume 38.37706753772218 cm³, mass 0.1036180824 kg at selected Aluminum 6061 density 2.70 g/cm³. Native and STEP bounds are X/Y ±36, Z 0..10 mm. STEP imported volume 38.377067537723356 cm³. |
| RE12 additional five-cylinder guide carrier, qty 1 | Fully defined Front annulus Ø320/Ø12.2, extruded Z −25..−18 mm. Fully defined Top X·Z annulus Ø50/Ø46, centre (X0, Z6) mm on plane Y60 mm, extruded along +Y to Y140. Circular feature pattern, 5 total at 72° about Z, fused with 1 mm plate overlap. | Cold library reopen: 5 history steps, 2 fully defined sketches, 1 solid, 320×320×56 mm bounds. Native valid 1 solid; volume 679.0437434805763 cm³, mass 1.8334181074 kg at selected Aluminum 6061 density 2.70 g/cm³; COM approximately (0, 0, −16.63153013) mm. STEP imported volume 679.0437434805783 cm³ with matching bounds. |

The RE12 seed was corrected in the browser from the Side plane to Top X·Z so the alpha-zero guide points along +Y as specified in the [design plan](radial-engine-8.16-design.md). Native replay and STEP import both validate one connected solid. The two saved models carry `PartNo` RE11/RE12, `BookItemNo`, the book's C355.0-T61 cast label, and a separate Aluminum 6061 proxy declaration. RE12 is explicitly an additional fixture outside the printed book BOM; neither part claims certified casting properties or a balanced crank.

Protected browser exports:

- [RE11 editable bundle](../../artifacts/planchard/RE11-counterweight-browser-2026-10-03.mforge) and [STEP](../../artifacts/planchard/RE11-counterweight-browser-2026-10-03.step)
- [RE12 editable bundle](../../artifacts/planchard/RE12-guide-carrier-browser-2026-10-03.mforge) and [STEP](../../artifacts/planchard/RE12-guide-carrier-browser-2026-10-03.step)
- [Read-only native and STEP audit output](../../scratch/planchard/RE11-RE12-native-step-audit-2026-10-03.jsonl)

The protected RE12 export predates the projection-field repair and still serializes the seed boss's former `axis: x`, although its Top sketch, browser display, native body, and STEP correctly use +Y. The current app synchronizes feature and display-projection axis, extent, and sketch loops when a sketch plane or offset changes, or when that feature is edited. In a clean Chrome library reopen, a temporary guide-depth change from 80 to 79 mm kept five correctly oriented guides and a valid single body; Cancel restored the accepted 80 mm model and a clean Save state. Focused frame/feature tests passed 8/8, and `npm run check` passed; the full radial assembly motion remains unverified.
