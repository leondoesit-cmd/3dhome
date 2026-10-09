# Chain CH01 — official-source native geometry pass

Closed-checkpoint follow-up: `CHAIN-CH01-official-source-closed-browser-2026-10-09.mforge` passes exact comparison of features, sketches, history, material, parameters, local frame/canonical references and authored part data. Its previously empty referenceGeometry collection now contains only the six standard planes/axes, with coordinates exactly matching existing canonical references. Preview caches and accepted Description also differ; heavy native verification is safely reused. Parent observed upper diameter100→100.2 regeneration, Undo restoring nominal, cold saved-library14step/material/property persistence and body-chooser Cancel without edits. Compact evidence: `CHAIN-CH01-official-source-closed-consistency-2026-10-09.json`.

The actual Chrome export passes all23 source/profile/history/material checks. It contains seven active features, seven stored fully-defined sketches and14history steps in a linear body chain. Source geometry is reconstructed with the100×100 upper bar and Ø100 end,40×100 lower tongue and perpendicular Ø100 end, centred40mm fork gap, and two perpendicular Ø50 bores separated by200mm. Construction diagonals are excluded from solid profiles; ordinary width/height/diameter driving constraints and fixed centres are retained.

Independent regeneration gives **one valid native solid**, **1396349.540849362 mm³**, bounds **100×300×100 mm**, and COM **(0,14.74821087499863,0) mm** to numerical precision. At explicitly sourced Titanium density **4.6 g/cm³**, mass is **6423.207887907065 g**. These agree with the independently integrated measured source recipe; no answer fitting occurred. The density citation identifies the official LWDATA float64 field; grade remains unspecified, strength fields remain zero and no qualified rating is claimed.

Both exact native-minus-STEP and STEP-minus-native volumes are **zero**. This certifies actual browser geometry/STEP equivalence, while original source B-rep face ownership remains partially decoded as documented in the read-only measurement report.

Evidence: `artifacts/planchard/CHAIN-CH01-official-source-native-audit-2026-10-09.json`, `...-step-equivalence-...json`, `...-design-audit-...json`. Authored inputs remain unchanged. Parent browser parameter driving/Undo/cold checks are pending separately; no source, browser, authored model or ADVANCE mutation occurred.

## Parent browser acceptance

Visible desktop Chrome diameter100→100.2 regenerated all downstream features: one native solid100.2×300.1×100mm, volume1397369mm³, mass6427.897g, COM0,14.8325,0mm. Undo restored source100×300×100mm,1396350mm³/6423.208g/COM0,14.74821,0. Cold app reload and exact saved-library reopen restored14steps/seven fullydefined sketches/one native solid and source4.6density/mass/COM. Actual edit/Undo/cold screenshots retained. ACCEPTED source-equivalent parametric reconstruction; source Imported1 original history is not claimed recovered.
