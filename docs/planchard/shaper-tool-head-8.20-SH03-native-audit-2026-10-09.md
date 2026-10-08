# 8.20 SH03 Vertical Slide — actual browser native audit

**Initial frozen-design acceptance FAIL: guide-groove start offset.** Actual initial Chrome `artifacts/planchard/SH03-nominal-browser-2026-10-09.mforge` (518,375 bytes) and STEP (75,413 bytes) are preserved as diagnostic evidence. This report does not accept the initial geometry merely because STEP matches it.

All six sketches are fully defined, with correct ordinary rectangle/circle profiles, fixed center anchors and driving dimensions. The model has six authored features and twelve rebuilt, unsuppressed history steps. Native regeneration validates one solid and bidirectional STEP subtraction gives zero residuals, but the second feature violates the frozen seating geometry.

|Feature|Frozen extent, mm|Actual initial extent, mm|Result|
|---|---|---|---|
|Body40×60 at(0,10)|Z12..34.2|Z12..34.2|PASS|
|Guide groove20.4×60 at(0,10)|Z12..18.2|**Z24..30.2**|FAIL|
|Ear16×12 at(−26,−10)|Z18.2..34.2|Z18.2..34.2|PASS|
|Feed nut boreTopD8.2 at(U0,V26.2)|Y−20 ThroughAll+Y|Y−20..40.01 stored through extent|PASS|
|Apron pivot socketFrontD8.2 at(0,−10)|Z32.2..34.2|Z32.2..34.2|PASS|
|Clamp socketFrontD6.2 at(−26,−10)|Z28.2..34.2|Z28.2..34.2|PASS|

The groove sketch has plane offsetZ12 and its feature also has Start offset12, adding to **Z24**. This leaves the back seating face Z12 uncut, preventing the frozen SH01 rail at Z12..18 from fitting. Its internal groove also overlaps the feed bore differently from the frozen design. Parent was notified immediately: retain the groove sketch offset12 and change its feature Start offset to0 through Chrome, yielding the intended Z12..18.2 Blind6.2 cut. No authoring correction was performed by this audit.

Initial native volume is **47.528858259338406 cm³**, density7.9 mass **0.3754779802487734 kg**. The analytic frozen corrected recipe volume is **44.923825072169656 cm³**, mass **0.3548982180701403 kg**. This distinguishes a real design discrepancy from STEP/native numerical integration. The final corrected export must be audited before accepting the slide or any assembly clearance.

AISI1020 SOLIDWORKS reference7.9, PartNoSH03, BookItemNo3 and source Description are present. Parent initial width40→42/Undo/Redo/Undo checks changed volume47.52886→50.00086cm³, but those checks cover the initially misplaced groove model; corrected cold verification remains pending.

Evidence: `SH03-native-bundle-audit-2026-10-09.json`, `SH03-native-step-audit-2026-10-09.json`, `SH03-step-equivalence-audit-2026-10-09.json`, and `SH03-initial-design-consistency-audit-2026-10-09.json`. All authored inputs and ADVANCE remain untouched. Compiled helper featureCount17 refers to kernel operations, not authored feature count.

## Corrected actual Chrome recipe

**Corrected geometry PASS:** `SH03-corrected-nominal-browser-2026-10-09.mforge` (498,270 bytes) and matching STEP (59,799 bytes). Parent repaired the groove through Chrome by changing only its feature Start offset12→0, retaining sketch plane offset12. Its actual cut now starts at **Z12** and ends at **Z18.2**, exactly matching the frozen rail seating geometry. All six fixed/driving profiles, construction exclusions and feature extents pass; twelve history steps remain rebuilt and unsuppressed. Parent also copied the initial export under the explicit doubled-groove-offset diagnostic name; the historical failure remains above.

Fresh corrected native regeneration validates one solid, **44.92382507216966 cm³**, matching analytic frozen volume44.923825072169656 within floating roundoff. Density7.9 gives **0.35489821807014033 kg**. Corrected STEP also validates one solid; exact native-minus-STEP and STEP-minus-native each leave zero solids and zero volume. Material and source properties remain unchanged.

Parent repeated corrected driving width40→42, now changing native **44.92383→47.39583 cm³ /0.3548982→0.3744270 kg**, then Undo40→Redo42→Undo40 and clean Save. Corrected cold saved-library proof is pending parent observation. Evidence is the four `SH03-corrected-...-audit-2026-10-09.json` files; no diagnostic was overwritten or authored geometry modified by the auditor.

## Final corrected cold acceptance

**Final acceptance PASS:** actual Chrome `SH03-final-browser-2026-10-09.mforge` (498,195 bytes), SHA-256 `263c7b5d32680de38b9352db64d6825106d4bcf6ebd739351d89d02d820211cd`. Its features, sketches, history, custom properties and appearances exactly match corrected nominal; authored material/part data remain equivalent. Groove remains sketchZ12 plus featureoffset0, giving native Z12..18.2. Fresh final independent regeneration again yields one valid solid at **44.92382507216966 cm³**, with unchanged bounds/COM. Corrected STEP exact equivalence applies to the unchanged recipe.

Parent cold library `cm_mv019d3u` proof PASS: one native solid,54×60×22.2mm, twelve editable steps,44.92383cm³/0.3548982kg and retained SH03/BookItem3/Description. Final cold image is protected. `SH03-final-native-bundle-audit-2026-10-09.json`, `SH03-final-cold-consistency-audit-2026-10-09.json` and the corrected design audit record acceptance PASS. The initial wrong-offset diagnostic, its audit failure and repair history remain preserved above.
