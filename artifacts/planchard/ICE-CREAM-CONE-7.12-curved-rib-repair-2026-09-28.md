# Exercise 7.12 curved Rib repair

The protected browser bundle has four authored steps and an exterior Front sketch line from (0.62, 0.12) to (1.06, 2.76) inches. Parallel-to-sketch Rib grows Left (negative U), thickness 0.06 inches on both sides, Up to the body. Its first contact is the native conical outer face.

The prior kernel rejected every curved first contact. The repaired path builds an oversize web, splits it with that exact native surface, keeps the single solid connected to the outside profile, and fuses it to the cone. It rejects different stopping surfaces, ambiguous pieces, and growth that misses the body.

The native regression measures added material against integration of the cone's circular cross sections through the full rib thickness, within 0.000001 cm³. It checks one valid fused solid, the open hollow cup, the finite 0.06 inch thickness, and rejected outward growth. The existing seven parallel Rib tests still pass.

Read-only exact replay of `ICE-CREAM-CONE-7.12-rib-gap-browser-checkpoint-2026-09-28.mforge` now succeeds: no compile or regeneration issues, one valid solid, volume 14.215816313955022 cm³, maximum native tolerance approximately 0.0000001 cm. The report is `ICE-CREAM-CONE-7.12-curved-rib-replay.json`.

Chrome exited before the parent could reload this patch, so this report does not claim browser Rib acceptance. The browser bundle remains the authored source, and no model geometry was changed by scripts.

A separate status defect was confirmed in source: ordinary refresh rebuilt only the lightweight core status and discarded a previous exact-kernel failure. Exact failure diagnostics now remain attached to the same document, history node, and edit revision through ordinary refresh/export. Background body failures retain their diagnostics before releasing native handles. A new edit or document cannot inherit them, and successful exact rebuild or Save clears them. Five focused persistence regressions pass, including the production background body path and stale-result rejection. Actual Chrome validation of this status repair remains pending reconnection.
