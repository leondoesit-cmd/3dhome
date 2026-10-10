# Exercise8.2 updated-source browser diagnostic — 2026-10-10

The actual main assembly updated rigid WEIGHT-HOOK from the cold-accepted Saved child, retained3top occurrences/4leaf parts/5mates, and reported2DOF. It is not accepted: parent actual all-visible interference reports Flatbar versus Hook positive material overlap. Independent four-leaf exact native reconstruction reproduces V.0260524535093922cm³, boundsX−.11177664..+.27061926,Y−10.78857754..−10.37515669,Z0..+.2286cm. All4 definitions reconstruct as valid one-solid bodies: AXLE.625474239757177, Flatbar2.862912356038455, PureLead WEIGHT3.781275754514555 and corrected Hook.486348311006539cm³.

The cause is persistent-ID semantic drift, not a need to change source dimensions. Current Flatbar original nominal bore identifiers `feature_mukhpbcy_2:tool:face:generated:cylinder:1` (left) and `feature_mukhptgp_3:copy:8:face:generated:cylinder:1` (right) now describe OUTER rounded-end cylindersR.635cm. Stored mate descriptors still describeR.2413cm bores. Actual resolved tangent567 therefore computes contact against outerR.635cm and can settle with2DOF while producing positive material overlap. Mere identity existence or same primitive cylinder type is insufficient acceptance evidence. The earlier Flatbar-only check that these identifiers exist does not certify they retain bore semantics.

Current actual true bores are original base side faces: left `feature_mukhjc84_1:face:side:425`, right `feature_mukhjc84_1:face:side:423`, bothR.2413cm atX−/+5.08,Y0,Z.1143. Parent repair is ordinary UI rebind of concentric453 to left side425 and finite-bore tangent567 to right side423, retaining all source dimensions/materials and other constraints. HOOK old suppressed Threadtorus4 is automatically rebound to original Sweep torus4; that source circle remains valid but parent may explicitly update its reference. No overlap may be qualified away as intended contact.

Read-only in-memory candidate rebind replay solves without issues/2DOF and predicts child transformX−.111148326,Y−13.349091278,Z0,Rz−2.016170838deg. This predicts a finite bounded UI correction; it is not authored CAD, actual browser acceptance or native zero-clearance proof. Parent must perform real rebind, recheck all-visible native intersection, Save and final cold.

Source qualifications: Flatbar.09in/Aluminum2014density2.8 and nineR.2413bores retained; legacy companion HookH.2/P.05in/4turn/circularD.03Pierce is separate from Chapter7#8-36tutorial; upper-loop/datums remain qualified reconstruction. PureLead11.342density externalNIH, original companion scalar unrecovered.

Evidence: `EXERCISE-8.2-final-source-qualified-browser-2026-10-10-native-four-leaf-audit.json` and `...-bore-reference-drift-diagnostic.json` in artifacts/planchard.


## Product guard and actual repair

Optional `rejectGeneratedIdentityCollision` guard in core topology resolution is enabled only by the assembly mate frame resolver. An exact generated-cylinder ordinal is rejected as missing when its radius no longer matches the captured cylinder and another current coaxial cylinder retains that captured radius. This narrowly addresses demonstrated ordinal reuse; genuine semantic IDs, explicit UI replacement and ordinary radius edits without competing old-radius geometry continue to resolve. Four meaningful regressions cover the actual protected false-resolution fixture, explicit repair with original AXLE reference preserved, ordinary dimension edits, and genuine entity IDs. All28 scoped mate/topology tests and final npm run check pass (674modules/1487source assertions). No authoring or protected model mutation occurs.

Actual Chrome parent repaired tangent567 to original Sweep torus4 and Flatbar right side423, then concentric453 to original AXLE side295 and Flatbar left side425 using Replace refs. Protected `EXERCISE-8.2-true-bore-repaired-browser-2026-10-10.mforge` passes13reference/source guards. Original AXLE reference and other3mates are exact; source definitions and materials unchanged; finite-bore mode retained; read-only solver succeeds2DOF/no issues. The child source definitions/mates/poses exactly match the accepted cold child, but nested library copy omits only assembly-level customProperties.Description; embedded component source descriptions remain intact. Actual all-visible native clearance and final cold are still parent-owned pending evidence.


## Final actual browser/cold acceptance

Parent actual all-visible native interference completed with “No two components overlap”, protected `EXERCISE-8.2-true-bore-clearance-browser-2026-10-10.png`. Independent exact reconstruction of protected repaired browser authoring likewise finds zero hits across4valid one-solid definitions. Parent then hard-reloaded, reopened the exact Saved card, confirmed clean Save/2DOF and exported `EXERCISE-8.2-true-bore-cold-browser-2026-10-10.mforge` (3656202bytes) with cold screenshot.

All10 final acceptance guards pass. Whole actual cold assembly, including source definitions,5mates, genuine bore references, materials, meshes/bounds and metadata, is exactly equal to the repaired warm assembly except child transform quaternion q.z normalization by4.000001718740265e−12. This sole numerical difference is explicitly preserved in JSON and lies below1e−10; no authoring or meaningful placement changes. Read-only solver succeeds with2DOF, no issues and no rebindings under the collision safety guard. Actual all-visible native zero and independent zero material intersections certify physical clearance in the saved source-qualified pose.

Exercise8.2 is accepted within the disclosed companion reconstruction scope. It does not certify recovered-original-CAD identity or originally omitted upper-loop/datums. Chapter7#8-36tutorial remains separate; PureLead density is the externalNIH value and original companion scalar unrecovered. Product guard has28scoped tests passing and final gates green. Parent owns ledger/ADVANCE/commit/push; this audit changes reports/JSON only.

Final machine-readable evidence: `artifacts/planchard/EXERCISE-8.2-true-bore-cold-browser-2026-10-10-audit.json`.
