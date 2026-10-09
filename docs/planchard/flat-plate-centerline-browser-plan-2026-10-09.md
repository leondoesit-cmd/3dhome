# FLAT-PLATE9.6 continuation — source and UI validation

Read-only source/fixture inspection; no browser or geometry authoring. Source PDF479 / printed9-45. Canonical saved Part **FLAT-PLATE 9.6 - fresh browser**, key `cm_mulxft3g`; protected accepted checkpoint `artifacts/planchard/FLAT-PLATE-9.6-browser-2026-09-28.mforge`. Existing six editable history steps/three sketches, material and associative dimensions/title should be preserved.

## Centerline repair and actual browser continuation

Persisted native drawing is `mainModel.drawing`: Letter landscape, ANSI/third angle, inches/two decimals/trailing zeros, scale1:2, hidden linesON/centre marksON. Views: Front `v5urcy92` (primary), Top `vkdjooex`, Right `v1i82fs2`, Isometric `vdbr87fu`. Title FLAT-PLATE/2445-990/A/DCP/D&M ENGINEERING/9-1-2021/1060 Alloy. Existing source dimensions2.40/2.00/4.00/.50/1.60/R.60/(1.00) and countersink callout must persist.

The actual fixture projects three exact hidden countersink/bore rims in each Front/Right view. `axisCentrelines` previously ignored hidden rims altogether, despite Hidden linesON. The narrow source repair admits those rims only when that view shows hidden lines, using existing coaxial grouping; it yields exactly one chain axis extending beyond both ends in each Front/Right view. Top visible centre marks remain; no isometric axis is invented. This closes the demonstrated drawing gap without a new manually positioned annotation tool.

Parent browser: reopen the exact saved Part, switch Drawing, open sheet setup. Existing checkbox **Hidden lines** (`#mdSheetHiddenBox`) and **Centre marks** (`#mdSheetCentersBox`) control the repair (`js/modeler.js:12077–12078` nearby). Toggle Centre marksOFF→ON to visibly author/verify presentation. View-level hidden/centre overrides can supersede sheet settings; verify Front/Right inheritON. Inspect both hole axes, existing dimensions/callout/title, Save, cold reopen and export SVG/PNG. No new browser completion is claimed here.

Focused validation: `node --test tests/flat_plate_hidden_centrelines.test.mjs tests/cad_sheet.test.mjs` —58/58PASS. New actual-export checks verify exact projected axis centers/overshoot and separate sheet/per-view Hidden lines/Centre marksOFF behavior, Top marks and geometry/reference/material preservation. Drawing normalization can initialize missing derived sheet fields; tests protect authored feature/sketch/history/part data rather than confuse normalized drawing defaults with model edits.

`npm run check` —PASS: no free identifiers,653 module links,1489 source assertions. Scoped diff check clean. Actual cold Chrome remains parent-owned.

## Hole attachment: diagnosis before any repair

Existing Hole feature `feature_mulxu7df_5` uses sketch `sk_6kuv3`, point1304. Point fixed localU−.508cm (−.20in),V0 on a face frame whose origin is(6.604,1.27,2.54)cm, U+X/V−Z/normal+Y. World center is(6.096,1.27,2.54)cm: X2.40in from sourceleftedge and Z1in acrossdepth. Diameter.40in/countersink.77in/82°/ThroughAll already source-correct.

The saved sketch already has `frameSpace:'local'` and `frameAnchor:'bounds-center'`. Its support persistentId is `feature_mulxmsdx_3:face:side:1277` (BasePlate), while ownerFeatureId is `feature_mulxs4ua_4` (Upright history stage). Consequently “Anchor sketch origin to face bounds” is not a new available cure; its conditional button is already inapplicable (`js/modeler.js:20889`). The older depth2→2.5in test's X2.40→1.80 drift cannot be confidently attributed to absence of that anchor from these data alone. Reproduce on current cold native source first, checking support resolution and exact world center, then Undo. Z midpoint should become1.25in while source X2.40 remains fixed.

Existing explicit planar support selection/reattachment is available in Hole feature edit (`js/modeler.js:17888`) and sketch inspector **Sketch support face / Attach chosen face** (`:20943` nearby). These preserve browser history and must reference a face before the consuming Hole. Do not select another face merely to silence a warning: check pose/direction/dimensions after any actual reattachment. Detach-to-principal-plane is also available but changes support semantics and is not a demonstrated necessary fix. Direct reference-to-left-edge dimensioning would be a stronger design intent if needed, but no new edge-anchor control or proven core repair is claimed by this inspection.
