# Source objective recheck after9475385

Read-only audit of the book, current acceptance reports and official companion. No browser/CAD authoring, production edits or accepted-model changes. This audit finds one concrete source-part gap: the Chapter4 BRACKET activity has functional rollback substitutes but no actual source-led BRACKET reconstruction. Its available metadata makes it more actionable than the previous blanket proprietary-file qualification implied.

## Confirmed remaining browser-recreatable work

Book PDF192–194 /4-12–14 explicitly asks to open the supplied Bracket, inspect its features/sketches, roll back above the10mm hole and then above Fillet1, and Roll to End. The accepted32-tooth disk demonstrates genuine rollback, saved rollback and restoration, but has different geometry and features. It does not recreate this named part. The book's wider model-recreation objective should therefore retain BRACKET as incomplete rather than equate the disk witness with exact source activity.

Official source is `C:/Users/liron/Downloads/Eng_Graphics_SW_2021_Exercise_Files_V3.zip`, member `Bracket/Bracket.SLDPRT`,151292bytes, SHA256 `0abaabccf798eb4f428f7029c0cce07638f42adaf61e1a0ada7edfde669499ce`. Read-only extraction validates decompressed block lengths/CRCs. Extracted evidence is in `scratch/planchard/bracket-companion-inspection/`; the inspection script writes source metadata only, not CAD. The actual embedded PreviewPNG was inspected and shows a thin L-bracket, two small base holes, two columns of four large upright holes, three central small upright holes and three upright slots.

| Official metadata | Source-defined values | Remaining interpretation |
|---|---|---|
|Sketch1|D1=20,D2=90|Open-L leg dimensions; exact datum/thickness direction still needs verification.|
|Extrude-Thin1|D5=5,D1=45|5mm thickness/45mm extrusion are consistent with the preview; original parameter-role coding is not separately decoded.|
|Fillet1|D1=R2|Source radius2; exact original edge set is not exposed by keyword XML.|
|Ø5.0 (5) Diameter Hole1 / Sketch2,Sketch3|Diameter5,through-depth5; placement dimensions10 and5|Preview confirms base seed/pattern; exact reference axes/signs remain to verify.|
|LPattern1|Count2,spacing20|Base two-hole pattern consistent with preview.|
|Ø10.0 (10) Diameter Hole1 / Sketch4,Sketch5|Diameter10,through-depth5; placement dimensions10 and10|Upright seed; exact datum mapping still to verify.|
|LPattern2|Counts2×4,spacings20/20|Upright eight-hole array.|
|Cut-Extrude1 / Sketch6|D1=8,D4=5,D3=15,D5=Ø5,D2=R2.5,D6=20|Contains slot/small-hole geometry; association of each named dimension to entities is not recovered.|
|LPattern3|Count3,spacing20|Repeated slot/small-hole seed is consistent with preview.|
|Configuration|Default;material unspecified|Do not invent publisher material/mass or source configurations.|

Shortest concrete next action: inspect the original preview and these recovered source dimensions in ordinary Chrome, then create an independent source-led BRACKET with actual thin extrusion, fillet, two Hole Wizard seeds and native feature patterns, and an actual cut-profile pattern. Preserve qualified datums/profile associations wherever metadata is incomplete. Audit topology/counts/source dimensions against the original preview and metadata; then perform the exact two source rollback stations, Roll to End, Save/reload and full native restoration. Native STEP and a source-dimension driver provide stronger geometry evidence. This can close bounded browser recreation while continuing to disclose unproved original binary feature IDs/edge selection. No script-authored substitute or imported tessellation alone satisfies editable source history.

Follow-up source inspection recovered137 unbound analytic native records, with original hole/slot centres, stock planes, concentricR7/R2 bend and four terminalR2 corner rounds agreeing with XML/preview. Therefore most initial coordinate ambiguities above are now resolved as source observations. The precise world-coordinate table and ordinary-browser recipe are in `chapter4-bracket-source-browser-ready-plan-2026-10-11.md`. Original sketch-constraint mapping and bend-feature ownership remain qualified; decompressed analytic observations are not an imported BRep or proof of original feature topology.

## Chapter11 and source drawings rechecked

|Source outcome|Current authoritative evidence|Result of this recheck|
|---|---|---|
|11-18–20 resolution/mesh exchange|`ch11-print-resolution-browser-2026-09-30.md`, orientation/tray export validation|Already accepted native .01mm/5°,STL/AMF/3MF and placed objects; no repeat required.|
|11-21–23 layers/perimeters/infill/support|`ch11-fff-actual-browser-audit-2026-10-10.md`, `ch11-q4-support-actual-browser-audit-2026-10-10.md`|Actual15→20% paths and three support modes, final strict native guards and byte-exact cold outputs. Finite raster/mid-slab scope is explicit, not a claim of physical printing.|
|11-24 Skirt/Brim/Raft|`ch11-flat-adhesion-actual-browser-audit-2026-10-10.md`, `ch11-flat-skirt-final-cold-browser-audit-2026-10-10.md`|Actual detached Skirt,18 attached exterior Brim loops, two raft planes/raised first model, each cold. Earlier diagnostic Brim gap is explicitly superseded.|
|11-25–27 orientation/internal counterbore support|Q4support report and FLATorientation report|Real source counterbore/bores preserved; actual orientation setup and support comparison. Global orientation optimizer is descriptive vendor capability, not a separately prescribed algorithm.|
|11-28–35 fit/process guidelines|`ch11-fit-process-guideline-sheet-browser-audit-2026-10-10.md`|Actual15-row native worksheet/cold and independently checked radial/diametral values. Optional pads are described as optional; no source-prescribed pad locations require invented geometry. Device execution/cleaning/calibration and external certification remain external.|
|Chapter9BATTERY/FLASHLIGHT/O-RING final sheets|Current original-logo/live-title/native-configured/native-eight-leaf final reports supersede earlier tutorial plans|Source-defined dimensions/configurations/BOM/images/balloons are evidenced with disclosed layout/native-contact qualifiers. No new unperformed mandatory sheet activity located in this focused recheck; this is not a fresh audit of every numbered drawing.|

## Durable CI diagnostic verification

`full-objective-browser-failures-2026-10-11.json` contains35 records. The source path/line/column field is **`location`**, not `file`; every record also stores a short `reason` and complete `details` stack. A projection selecting `file` prints null because that property does not exist, not because the source path was lost. Unit4680/4680 and browser400pass/35fail/210existing-disabled-customize skips remain separate from focused fixes. No diagnostic-field correction is needed.

This gap recheck does not certify all pages complete, invent a whole-book percentage, or reopen accepted Chapter11 studies. BRACKET now has a specific actionable source-model queue item; damaged3.9rows1/4, ambiguous source labels, original binary identity and physical-device outcomes retain their existing qualifications.
