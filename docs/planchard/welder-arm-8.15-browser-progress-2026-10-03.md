# Welder arm 8.15 — browser progress

## WA01 pedestal accepted

Authored from a blank document through visible Chrome UI on 3 October 2026, own tab 710860247. Saved library key `cm_musdksnb`, name `Planchard 8.15 - WA01 pedestal - fresh designer example 2026-10-03`.

Eight history steps: four fully defined origin-centred Top circles; native flange Extrude8 mm; native solid Loft between Ø72 at Y8 and Ø36 at Y63; merged journal Extrude40 mm from Y63 using Ø24; Hole Wizard four Ø6.6 holes on PCD80. The hole feature shares the journal source sketch and uses circular layout centred at the origin, reverse through-all; at radius40 only the flange is intersected. Native solid-body count is one.

Selected material: Ferritic stainless steel, grade unspecified, density7.70 g/cm³. Saved custom properties preserve printed `BookMaterial=Cast Stainless Steel`, original designer dimensions and the explicit proxy distinction. No cast grade or load rating is inferred.

Hard reload → Model → Saved models → exact newly saved WA01 record cold-open passed. All eight steps remain editable, all four circles fully defined, dimensions100×103×100 mm. Cold-open UI Mass Properties reports exact solid geometry, one body, volume210.4601 cm³, mass1.620543 kg, centre(0,26.68623,0) mm.

Independent read-only native replay: no issues, one export-valid solid, volume210.46006708481343 cm³, centreY26.686229540694097 mm; tolerance1.0000000444×10⁻⁷ cm. Browser STEP import: one export-valid solid, volume210.4600670848491 cm³, centreY26.686229540695505 mm; tolerance10⁻⁷ cm. The native and STEP results agree without changing geometry.

Protected evidence:

- `artifacts/planchard/WA01-pedestal-browser-2026-10-03.mforge` — 605145 bytes, editable native history and properties.
- `artifacts/planchard/WA01-pedestal-browser-2026-10-03.step` — 33434 bytes, exact geometry.
- `artifacts/planchard/WA01-pedestal-cold-reopen-browser-2026-10-03.jpg` — visible cold-open native mass proof.
- `docs/planchard/welder-arm-8.15-design.md` — explicit original geometry/interfaces and source distinctions.

## WA04 wrist rotor accepted geometry

Fresh blank human Chrome authoring on tab710860247, library key `cm_musejv53`, exact saved role name `Planchard 8.15 - WA04 wrist rotor - fresh designer example 2026-10-03`. Two fully defined origin-centred Top circles: Ø24 at Y20 extruded40 mm; Ø50 at Y60 extruded6 mm merged. Four editable history steps, one body, bounds50×46×50 mm, position extentY20–66 mm. Assembly placement is (85,83,0), not embedded into the part frame.

Custom PartNo4, Description, BookMaterialCast Stainless Steel and explicit ferritic density7.70 proxy saved through UI. Native read-only replay has no issues and one export-valid solid, volume29.876546135638925 cm³, centreY49.06940063091482 mm. STEP import agrees at29.876546135638627 cm³, one export-valid solid. Material mass230.0494052444197 g. Both maximum tolerances are10⁻⁷ cm.

Protected `WA04-wrist-rotor-browser-2026-10-03.mforge`116156 bytes and matching `.step`9676 bytes. Browser hard reload and actual saved-record cold-open retain4history steps, two fully defined circles, one solid and50×46×50 mm bounds. Cold native Mass Properties passed: volume29.87655 cm³, mass0.2300494 kg, density7.7 g/cm³, centreY49.0694 mm. Proof: `WA04-wrist-rotor-cold-reopen-browser-2026-10-03.jpg`.

## WA05 midpiece accepted

Fresh blank human Chrome authoring, library key `cm_musewjyg`, saved name `Planchard 8.15 - WA05 midpiece - fresh designer example 2026-10-03`. Fixed-centre Top rectangle24×24 mm atY66, Extrude20 mm. Two editable history steps, one fully defined sketch and one native body; bounds24×20×24 mm, Y66–86 mm. Saved PartNo5, Description, BookMaterial and explicit ferritic7.70 density proxy.

Independent read-only native replay and STEP import both pass with one export-valid solid, volume11.52 cm³, centre(0,76,0) mm and tolerance10⁻⁷ cm. Actual hard reload and saved-record cold-open passed; visible exact mass88.704 g, density7.7. Protected editable `WA05-midpiece-browser-2026-10-03.mforge`, exact matching `.step`, and `WA05-midpiece-cold-reopen-browser-2026-10-03.jpg`.

## WA08 holder accepted

Fresh blank human Chrome authoring, library key `cm_musf56xr`, saved name `Planchard 8.15 - WA08 holder - fresh designer example 2026-10-03`. Fixed-centre Top rectangle36×60 mm atY94, Extrude8 mm, native Hole Wizard two Ø5.5 through holes with circular layout radius15 mm, angle0°, centred atX±15,Z0. The rectangle sketch remains fully defined and is shared by the extrusion and hole feature. Three editable history steps, one native body, bounds36×8×60 mm, Y94–102 mm. PartNo8 and the explicit material proxy are saved.

Independent read-only native replay: no issues, one export-valid solid, volume16.899867288915647 cm³, centre(0,98,0) mm. STEP import agrees at16.8998672889156 cm³, one valid solid. Both tolerances10⁻⁷ cm. Actual hard reload and saved-record cold-open passed; native mass130.1289781246505 g at7.70 g/cm³. Protected `WA08-holder-browser-2026-10-03.mforge`150350 bytes, matching `.step`25061 bytes, and `WA08-holder-cold-reopen-browser-2026-10-03.jpg`.

## Remaining

WA02/03 and WA06 are assigned to other agents. WA07 and WA09–12, assembly18 occurrences, native mates and motion, clearance/contact report, exploded ANSI C landscape third-angle drawing and exports remain pending. Acceptance of these parts does not complete Exercise8.15 or the book.
