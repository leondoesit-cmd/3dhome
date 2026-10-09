# Advanced Q4 actual final geometry audit — 2026-10-09

`ADVANCED-Q4-source-finalgeometry-browser-2026-10-09.mforge` passes independent read-only native regeneration: one valid solid, no rebuild issues, twelve solid features,23 history steps and eleven fully defined sketches. All six sketches/seven features from the accepted13-step ears checkpoint remain bit-identical. The actual input remained unchanged. Evidence: `artifacts/planchard/ADVANCED-Q4-finalgeometry-native-source-step-audit-2026-10-09.json`.

The audited solid has volume352.3044952202896cm³ and raw physical COM `(0,34.974264290784407,−46.6733920223276)`mm. At the separately documented source/printed Gray Cast Iron density7.2g/cm³ this geometry gives2536.592365586085g. Its mass and COM round exactly to the publisher companion's cached2536.592g and `(0,34.974,−46.673)`mm. The printed page10-28 specifies material/density and asks for COM; it does not print a numerical COM answer. This comparison checks independently authored source dimensions; no parameter was chosen by fitting mass or COM. The present bundle precedes final material assignment, so geometry-derived mass is not material acceptance.

Verified native scopes:

- Stock and plate frames retain the source dimensions; R32 plate spans n72..90. Block/notch datums and the two R19/R9.5 ear pairs retain their exact mirroredZ stations.
- Dovetail profile narrows42→35.0717967697244mm over v0→6, with reverse Through All along−N. Native floor is v6. Its actual bounded base-floor edge is Y0/Z−6.928203230275507mm, ending at X±17.5358983848622mm; this matches the previously decoded source analytic support and establishes the bend cut extends below n0.
- Plate groove is22mm wide, floor n84; the rectangular cutter extends above the original circular stock as the disclosed equivalent contour. CounterboreØ32 runs n90→81; remainder boreØ19 runs n81→72.
- BothØ13 wall cylinders are parallelV, centered n27/n56 and physically bounded v6..19. The actual helper frame is Top−60° aroundX, then offset19 alongV; local sketchY is−N. Thus local circle coordinates0/−27 and0/−56 are correct. Reverse Blind19 reaches v0 as a tool, while the existing channel limits actual cylindrical material to v6.

Actual Chrome STEP `ADVANCED-Q4-source-finalgeometry-browser-2026-10-09.step` reimports as one valid native solid. Native-minus-STEP and STEP-minus-native both have zero solid volume. STEP volume352.304495220297cm³ differs only by serialization tolerance; all final cylindrical stations are in the audit JSON.

Retained qualifications: the full-circle merged ear cap replaces an incompletely decoded converted source contour; confined Blind19 ear bore and the remainder bore are explicit source-envelope workflows. The original Cut4 EndSpec enum and complete source FACE/BODY ownership remain opaque, although typed source direction−N and native floor/base support match the authored result. No claim of formal opaque selector decoding is made.

Reproduce with `scratch/planchard/advanced4-final-native-source-step-audit-readonly.mjs`, then `scratch/planchard/advanced4-final-source-comparison-readonly.py`. These scripts regenerate disposable clones and write audit evidence only. Final browser driving/Undo/Redo/cold durability and material/property persistence are parent-owned acceptance checks and remain pending at this checkpoint.

## Actual material export

`ADVANCED-Q4-source-material-browser-2026-10-09.mforge` preserves final features, sketches, history and reference planes exactly. `mainModel.engineeringMaterials` stores density7.2 with explicit printed/source provenance and zero strength/rating values; generic Gray Cast Iron remains unrated. `mainModel.customProperties.Description` is ASCII and discloses equivalent contours/scopes and opaque original selectors. Context and bundle metadata both specify mm. Material-field audit passes; cold durability/driving still pending. Evidence: `ADVANCED-Q4-source-material-audit-2026-10-09.json`, reproduced with `advanced4-material-durability-audit-readonly.py`.

## Final scoped browser acceptance

Parent reports actual Chrome wall-hole driving13→13.1mm settled at V352277.8mm³/mass2536.400g/COM `(0,34.97467,−46.67713)`mm. Undo13, Redo13.1, Undo13 restored V352304.5mm³/mass2536.592g/COM `(0,34.97426,−46.67339)`mm, with observed input values. Following full reload, dismissal of the old planner backup, blank Model and exact Saved Models entry selection, Q4 reopened with23 steps, eleven fully defined sketches, one native solid and clean Save. Parent independently read the restored properties and ASCII source Description in the actual UI. Screenshots `ADVANCED-Q4-driving-restored-browser-2026-10-09.jpg` and `ADVANCED-Q4-cold-properties-browser-2026-10-09.jpg` are protected.

Independent present-field comparison of material, driving-restored and cold-accepted exports passes: all features, sketches, history, parameters, referenceGeometry, units/context, engineeringMaterials and customProperties remain exact. The restored and cold exactTopologyCache also remains exact; part properties differ only in display meshData. Other cold differences are lastRebuild and bundle createdAt. Evidence: `ADVANCED-Q4-cold-durability-audit-2026-10-09.json`, reproduced with `advanced4-cold-durability-audit-readonly.py`.

Q4 is accepted within its documented source-envelope workflow scope: final native geometry/source stations/STEP equivalence, printed/source material, actual driving Undo/Redo/restore and cold persistence pass. Earlier pending remarks above describe the historical checkpoints and are superseded here. Original opaque converted contour/end-selector qualifications remain; this is not a claim of exact original selector/history recovery or completion of the whole ebook.
