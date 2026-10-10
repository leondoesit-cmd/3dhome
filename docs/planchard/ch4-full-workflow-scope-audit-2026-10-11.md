# Chapter4 full workflow scope — source and current implementation

Read-only audit,2026-10-11. Actual supplied source text inspected; PDF214–215 freshly rendered and visually viewed (`scratch/planchard/ch4-scope-source-214.png`,215). No browser or CAD authored, no production code/ADVANCE/Git changes. No whole-book percentage asserted.

## Dynamic Reference Visualization is a concrete workflow

**PDF214/printed4-34** explicitly describes hovering a referenced feature to show parent/child arrows. When the referenced item is collapsed, the arrow points to its containing visible feature and a text box identifies the actual reference. **PDF215/4-35** says to use it for a part, assembly and mates and provides View→User Interface→Dynamic Reference Visualization Parent/Child. The actual menu figure contains separate Parent and Child entries. Lack of a numeric homework assignment does not waive this functional demonstration under the user's all-workflows request.

Current source has useful but incomplete behavior: `modeler_tree.js` binds mouseenter/leave and focusin/out to `onHover(node.targetId)`; `modeler.js::setDependencyHighlight/dependencySets/applyDependencyTreeClasses` computes feature upstream/downstream sets, colours related history rows and dims unrelated rows. `dependencySets` reads `E.def.features` and feature dependencies; ordinary tree parent navigation represents containment, not the required reference relationships. No reference arrow overlay, visible ancestor fallback/reference text callout, independent Parent/Child visibility controls or assembly/mate reference graph was found in these paths.

**Concrete bounded repair:** expose Parent/Child visualization toggles in the ordinary tree/view controls; read current canonical dependencies by persistent IDs. Render arrows between hovered/focused rows and direct source-reference rows. Include sketches/reference planes where supported by actual canonical references; do not fabricate Origin dependencies merely because the source example shows them. For collapsed/off-screen references, anchor at nearest visible containing ancestor and label the actual referenced item, or provide an explicitly labelled off-screen reference endpoint. Recompute after tree collapse/scroll/reorder and model changes; leaving hover/focus removes transient arrows. For assemblies, use actual component occurrence paths and mate component/topology references, not part-feature ID guesses. A feature-only first implementation must leave assembly/mates as an explicit remaining gap until genuinely supported.

**Shortest browser proof once implemented:** open existing source FLATBAR or another accepted multi-feature source part; enable Parent, hover its cut or pattern and inspect actual upstream arrows; enable Child and hover its Boss; collapse its sketch/reference grouping and verify a visible ancestor endpoint plus actual-reference label. Open an accepted assembly with genuine mates, hover a mate and verify referenced occurrence arrows, then hover an occurrence and verify related mate links. Toggle each direction independently, scroll/collapse, ensure no authored geometry/history changes, Save/reopen if visibility preference is persisted. Parent solely performs these UI steps; this audit claims none completed.

## Perspective has rendering support but no equivalent ordinary toggle

**PDF201/4-21** lists Perspective among View Settings. **PDF97/2-11** gives View→Display→Perspective for a3Dmodel. These are real source UI actions, distinct from the separately reconstructed vanishing-point paper road.

Current `editor_view.js` creates a PerspectiveCamera for orbit and an OrthographicCamera only for `normalToOrthographic` fixed planar frame; `clearFixedFrame` restores the perspective camera. `modeler.js` enables that option. Thus the existing orbit view genuinely is perspective; it is incorrect to report that perspective rendering itself is absent. No ordinary standalone Perspective on/off control was found in modeler command/catalog/view paths. Switching to Normal To is a sketch-oriented fixed-frame action, not a general orthographic orbit display toggle.

**Concrete bounded repair:** add discoverable **Perspective** toggle for part/assembly3D viewport, with user-facing checked state. Switch projection while preserving orbit target/orientation and apparent target-plane framing; resizing, orbiting, fit and Normal To must remain coherent. Normal To can temporarily enforce orthographic sketch accuracy, then return to chosen orbit projection. Do not change Drawing paper projection or source solids. Camera mode is a view preference; do not represent it as authored CAD topology.

**Shortest browser proof:** open an accepted source part or assembly; choose isometric/orbit, toggle Perspective off/on and show preserved target/framing plus actual depth foreshortening difference; rotate/zoom in both states, Normal To and return, verify chosen state and source geometry unchanged. Capture both actual views and cold reopen if persistence is part of the implemented control.

## Exercise3.9 — only new leads checked

Existing actual source audit identifies PDF178/3-50 row1 missing and row4 damaged beyond a reliable Depth/Countersink distinction; rows2Counterbore and3Diameter are answered in the preserved qualified worksheet. No repeat render/search loop was performed here. Newly inspected official2021 errata supplies only printed3-33 interference correction, not3.9 symbols. Official public sample is Chapter2, not a replacement Chapter3 source page. Newly recovered CosmeticThread companion addresses5.16 geometry only and supplies no3.9 symbol/key. Existing exercise archive inventory supplies no identified3.9 answer key. Therefore there is no clean new lead to upgrade missing rows; retain source-blocked status until a clearer lawful page/key is available. Do not infer the order from adjacent glossary symbols.

## Finite next actions

1. Implement genuine current-reference hover arrows, collapsed-reference labels and independent direction controls, including actual assembly/mate references; then ordinary browser proof.
2. Expose existing perspective rendering as a real on/off orbit control; then ordinary browser proof.
3. Preserve3.9 unknown rows honestly; no new source recovery claim.

These are source-backed digital actions. ProprietaryMBD/CAM licensing or physical printing remain external qualifications; neither is a reason to omit the two feasible app workflows above.
