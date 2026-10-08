# Exercise 8.18 — KT01 bench fixture acceptance

Accepted2026-10-08 as the first fresh part of the original Kant-Twist designer example. Book printed8-53/PDF431. Remaining15 definitions,25-occurrence assembly, motion and C-ANSI exploded drawing are unfinished. Companion CAD/AVI unavailable; all dimensions are original and educational.

Parent authored every sketch and feature through visible desktop Chrome, dark theme, from a blank mm Part document. Saved library `cm_muzrb8n4`, name `Planchard 8.18 - KT01 Bench Base - fresh designer example 2026-10-08`. Six features/twelve history steps, all six sketches fully defined, one native solid. Custom properties: PartNo=KT01, BookItemNo=1 and source Description. Alloy Steel SOLIDWORKS educational reference density7.70g/cm³, grade unspecified and not load-certified.

The100×60×8mm Top base is centered atorigin. AØ16 post atX40 risesY8→144. The Front head is60×24mm centeredX18/Y150, extrudedZ−9→9; the four-vertex angled rail follows the exact proposal coordinates on the sameZ interval. TwoØ8.2 pivot holes are atP=(0,150) andQ=(45,174.230769230769) throughZ. FourØ6 mounting holes are atX±35/Z±20 throughY. Base/head have editable edge dimensions and a fixed anchor; circles have driving diameter and fixed center; the rail has four editable fixed point anchors. The revisions postX40 and handle setback22 preceded all geometry authoring; eventual assembly full-motion clearance remains a separate pending acceptance.

Driving-width browser test passed100→110mm, native totalX span103.1274→113.1274mm. Undo restored103.1274, Redo restored113.1274, finalUndo restored103.1274. Saving then reloading Chrome and opening the actual library entry produced one native solid, same bounds, twelve editable steps and stored Description. Start fresh and keep draft was used to separate library reopen from draft recovery.

Actual browser downloads:

- `artifacts/planchard/KT01-final-browser-2026-10-08.mforge`, download3,718639bytes, final custom properties and restored100mm geometry.
- `artifacts/planchard/KT01-six-features-browser-2026-10-08.step`,89312bytes, one valid native solid at tolerance1e−7cm.
- Native STEP audit:104.12044755679652cm³, boundsX−50..53.12742553774/Y0..182.35819476851/Z±30mm. Native recipe verification gives104.12044755680049cm³, difference3.97e−12cm³. Mass0.801727446187364kg at7.70g/cm³.
- Screenshots: `KT01-six-features-native-mass-browser-2026-10-08.jpg`, `KT01-width110-edit-browser-2026-10-08.jpg`, `KT01-cold-library-final-browser-2026-10-08.jpg`.
- Read-only independent audit: `kant-twist-8.18-KT01-native-audit-2026-10-08.md` and `KT01-six-features-design-consistency-audit-2026-10-08.json`.

A real metadata gap was repaired during this workflow: fill-only Description could be lost when another Settings control refreshed the header. Description now commits on input with one undo step per field visit. Fourteen focused tests and all source gates pass; Chrome verification filled a revised Description then changed unitscm→mm without a blur commit, and the text persisted in the final actual bundle. No scripted geometry was authored.

Next: KT02 HingeA from a new blank mm document according to `kant-twist-8.18-design.md`; preserve this accepted library definition and exports. Do not treat KT01 acceptance as assembly or entire-exercise acceptance.