# Q4 orientation and support study: read-only source preflight

Actual Chrome setup exports for Top, Front, and Right retain every source sketch, feature, native mesh position and material from `ADVANCED-Q4-source-cold-accepted-browser-2026-10-09.mforge`; each retains 23 history entries. This is a separate Saved copy for a digital print study. No CAD was authored by this audit.

| Bed orientation | Width / depth / height (mm) | Predicted .4 mm layers | Approximate grid layer-cells |
|---|---:|---:|---:|
| Top | 64 / 185 / 118.4673 | 297 | 22,746,636 |
| Front | 64 / 118.4673 / 185 | 463 | 22,855,532 |
| Right | 118.4673 / 185 / 64 | 160 | 22,490,720 |

All fit the actual 250 mm cubic bed. The .2 mm default would require 925 Front layers and exceed the 500-layer bound. Grid .4 mm with line width .4 mm is invalid: the engine requires grid no larger than half line width. The bounded comparable study uses layer .4 mm, grid .4 mm, line width .8 mm, keeping all settings identical while comparing support Off, Buildplate and Everywhere. These are illustrative coarse digital settings, not a physical print recommendation. Exact grid padding may change the approximate cell counts.

The source counterbore is diameter32, axial depth9 mm, along normal `(0,.8660254037844386,.5)`; the smaller diameter19 cut spans18 mm from the same n90 terminal plane. The actual source cuts are `feature_mv0ee4oh_a` and `feature_mv0efjzu_b`, referencing fully defined circle sketches `sk_9ed8g` and `sk_ayswk`. In source millimeters define n=.8660254037844386Y+.5Z and v=.5Y-.8660254037844386Z. The counterbore void is n81..90, X²+(v−51)²<16². The inner bore section is n72..81, X²+(v−51)²<9.5². The annular shoulder is n81 with radius9.5..16.

For actual Front preparation, print coordinates map back to source by X=printX, Y=59.23363277095791−printY, Z=45−printZ (all mm). The annular shoulder spans print height34.8109..62.5237 mm, approximately layers88..156 at .4 mm. Its normal points partly down in this placement. This identifies an internal region to inspect, not a claim that the 45-degree raster algorithm must emit supports there. Classify support segment samples inside the source counterbore void separately from samples elsewhere; check all support beads remain outside material. Buildplate paths must belong to uninterrupted raster columns reaching the first layer; Everywhere may terminate above existing model. None of these checks certify accessibility, removability or physical manufacture.

Acceptance checks pending actual paths: exact settings and source geometry across all three support modes; identical463 layer planes/fingerprint/bounds; zero support paths Off; nonnegative independently recomputed support volume; material/support clearance; internal-void and external support counts; Buildplate connectivity; Everywhere reachability; G-code and SVG regeneration; saved/cold determinism. A zero internal-support count is an honest result and must not be relabeled as successful shoulder support.

Machine evidence: `artifacts/planchard/CH11-Q4-orientation-source-preflight-audit-2026-10-10.json`. This report is preflight only; it does not accept a support workflow before actual exports and cold replay.

## Resolution outcome on the actual serialized native mesh

The actual .4/.4/.8 browser slice correctly failed its existing sub-grid deposition guard. Read-only replay located a wall failure at layer151. A .35 mm grid also failed at layer149. Keeping layer .4 mm and line width .8 mm, grid .32 mm passed the unmodified engine with463 layers, zero support Off, and estimated filament47865.006250405604 mm. This finer-grid profile remains within the40-million layer-cell bound. The successful replay is an oracle trial, not actual Chrome authorship; the parent must apply and export it through the app. Exact failure geometry is preserved in `CH11-Q4-support-resolution-failure-location-2026-10-10.json`; successful settings in `CH11-Q4-support-resolution-readonly-preflight-2026-10-10.json`. No rejection was relaxed or hidden.

## Actual Front Off export

The parent applied .4 mm layers, .32 mm grid and .8 mm line width in actual Chrome. Protected `CH11-Q4-support-off-browser-2026-10-10` passes20/20 audit guards: source authoring remains exact;23 history entries; independently regenerated valid single connected native solid with volume352.3044952202896 cm³;463 layer planes;122,467 actual deposition segments clear independently reconstructed native mid-slab contours; zero support. Actual G-code and layer125 SVG regenerate byte-exact. Filament estimate47867.04975310214 mm, with a small difference from the independently reconstructed oracle trial. The triangulations have different fingerprints; no exact cause of the estimate difference is asserted. No exact triangulation identity is asserted. Layer125 is Z50 mm with19 paths. First layer contains no paths: the conservative raster omits the narrow initial footprint. This is explicitly a digital omission, not a certified printable first layer.

Support-mode comparison and cold acceptance remain pending. Evidence: `CH11-Q4-support-off-browser-2026-10-10-audit.json`.

Current status: the historical pending preflight above is superseded by accepted final actual Chrome/cold evidence in `ch11-q4-support-actual-browser-audit-2026-10-10.md`. All original failed/intermediate exports remain diagnostics. Final digital acceptance uses strict native guards plus explicit .01 mm native tessellation allowance; it does not certify physical printing.
