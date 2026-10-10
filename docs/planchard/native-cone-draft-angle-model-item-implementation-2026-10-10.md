# Native cone draft-angle Model Item

Provided source PDF453 / printed9-19 displays a5° Draft angular callout on BATTERY Detail A. The two native round bosses both have actual5° inward draft. Their named native cone seams project vertically in Front, so a seam-based Front angle would falsely measure0°. This implementation uses the actual native conical face rather than a seam or literal text.

`js/core/drawing_cone_angle.js` derives a side-on silhouette generator and a parallel axial reference from the cone's current `referenceOrigin`, unit `axis`, `axisRange`, `radius` and semiangle. It constructs three angle arms in view coordinates; ordinary `measureDim` computes their actual angular separation. Both inward/outward cones and in-plane rotations retain the true angle. Nonconical/malformed faces, collapsed ranges/negative radii, zero/degenerate semiangles and non-side-on views are refused.

**Insert Model Items** creates ordinary `type:angle` records with a persistent `coneAngle:{faceId,featureId,side}` binding and `modelItem:feature:<featureID>:draftAngle`. It chooses an existing containing Detail first, otherwise a side-on ordinary view. Section/Auxiliary/Broken-out/Crop/unfolded views are excluded from planning; native semiangle must agree with the current unsuppressed extrusion's draft parameter. Separate bosses retain separate source items even when both equal5°; duplicate insertion is suppressed by source item/face identity.

The shared drawing resolver rederives the arms from current native geometry on every scene build. With a model provider, deleted/suppressed/wrong source features or draft parameter/native-angle disagreement flag a dangling last-known value; no stale angle is silently certified. No native topology source also flags this specialized binding. Source draft metadata participates in the drawing cache key. Existing angular Canvas/SVG output adds generator/reference extension guides and the true angular arc; formatting and dimension editing stay shared. Ordinary source edits, missing-source diagnosis, text override policy and JSON persistence do not require frozen angle injection.

## Actual protected BATTERY planning, not new browser acceptance

Readonly planning on `BATTERY-front-detail-layout-postfix-browser-2026-10-10.mforge` returns two candidates, both on actual Detail `v1eocwbj`:

- Feature7: `feature_muk70mow_7:tool:face:generated:cone:1`; source key `feature:feature_muk70mow_7:draftAngle`.
- Feature8: `feature_muk70mqo_8:tool:face:generated:cone:1`; source key `feature:feature_muk70mqo_8:draftAngle`.

Feature8's native arms are top(.5016672767864887,11.43), floor vertex(.635,9.906), parallel-axis top(.635,11.43), in cm. They compute5° and match source right-terminal callout intent without reinterpreting the arbitrary seam. Repeated Insert will not duplicate either source key. The source figure uses one representative5° callout; parent can remove the redundant left item through ordinary UI if desired, retaining right feature8 provenance.

## Verification and next actual browser proof

Five focused regressions cover actual BATTERY-sized native cone descriptors,5→8° native updates, outward/in-plane rotated cones, source disappearance/ownership/suppression/native-intent disagreement/nonlinear rejection, Detail selection/two-owner deduplication, ordinary normalized-host Insert, shared SVG and exact cold JSON/SVG. Final related suite **36/36 PASS**; all module/link/source-assertion gates **680 modules /1487 assertions PASS**; scoped diff check clean. Parent owns actual Chrome Saved reopen→Insert→inspect true5° source binding→position→Save/cold proof; no CAD/drawing was authored by these tests or readonly protected-file plans.

Finite scope: true side-on conical draft angles of native drafted extrusions. This does not implement arbitrary oblique apparent-angle annotation, tapered noncircular faces, draft standalone feature types, GD&T or nonexistent silhouette edge identities. Source geometry and native mesh remain untouched. Owned integration regions: cone helper/tests; `model_items.js` cone planner/dedup; `cad_sheet.js` cone resolver/shared angular guides; `modeler_drawing.js` source/binding cache fold. No ADVANCE, browser CAD authorship, protected artifact mutation or Git action.
