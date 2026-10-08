# Shaper Tool Head 8.20 — final preservation check

Read-only comparison passed for the actual final Chrome download `artifacts/planchard/SH-assembly-final-browser-2026-10-09.mforge`, 3,799,023 bytes, SHA256 `17c1661ca6526edd8a90224cfd6170ed6670d24c61da06cd560683bd5fc8907c`. Baseline: `SH-assembly-recaptured-studies-browser-2026-10-09.mforge`, verified against the accepted recaptured-studies native audit hash.

All sixteen embedded definitions/occurrences, twenty-three native mates, zero legacy mates, physical home transforms, both complete saved studies and their two captured actuator Drive settings each, occurrence descriptions/BOM properties, drawing settings and active fifteen-step exploded-view definitions are exactly preserved. SH03 remains at assembly origin; SH15 remains at(0,−10,42.2)mm with RX0. Global feed and clapper Drives are free. Presentation offsets exactly equal the sum of the authored explosion steps.

The only differences are export timestamp, restored active exploded presentation and recreated empty `New model` placeholder IDs/empty-sketch ID/rebuild metadata. Both placeholder parts have zero bodies, features, history and sketch geometry; the active document is the SH assembly. There are no unexplained changes to authored geometry or settings.

`SH-drawing-final-browser-2026-10-09.svg` is byte-identical to the previously audited drawing:423,538 bytes, SHA256 `f2c7f465ca7cfa89f9b288af274b98b7941e81e24951a202cc91dc5219ba38a1`. Previous native motion/clearance/STEP evidence can therefore be retained for the unchanged physical assembly and studies. This comparison performs no new native regeneration and makes no independent browser Play claim; parent records the actual cold Play/Cancel/Save evidence.

Machine-readable audit: `artifacts/planchard/SH-assembly-final-preservation-audit-2026-10-09.json`. Reproducer: `scratch/planchard/sh-final-preservation-audit-2026-10-09.mjs`. Both input bundles remain unmodified. This preservation pass is not a clean full-CI or whole-book completion claim; the separate long HOUSING shell/full-CI run remains pending.
