# Exercise 8.18 Kant Twist — native closed-loop audit

Current guided source is actual Chrome export `KT-assembly-parallel-free-home-browser-2026-10-08.mforge`,5556054 bytes; actual measured Chrome quarter-turn export is `KT-assembly-drive-negative-quarter-browser-2026-10-08.mforge`,5557235 bytes. Earlier `KT-assembly-36-mates-free-home-browser-2026-10-08.mforge` remains historical evidence. The current source replaces Grip A's orientation guide through the explicit Parallel command (stored ordinary Angle0 with referencesJawA→Base). All simulation uses disposable clones and native verification solids. Authored files remain unchanged.

**Guided mechanism matches the frozen analytic one-DOF path and passes all sampled native clearance checks.** Current home has36 active mates,25 visible occurrences/16 valid single-solid definitions. Every non-body reference resolves to its exact native axis or named datum without issue/rebinding. All embedded feature/sketch recipes and material/properties match the accepted final source bundles. Home native exact interference is clear; volume180.1617864487095cm³,mass1367.4709127324477g.

Home clone solve: settled/converged true, zero residual issues, rank143 of144 pose variables, **1DOF**. Two separated P/Q concentric connections plus Front distance support Brace A grounding physically; it is not artificially Locked to world. Rear trunnions and Shaft use exact cylindrical axes; Shaft remains axially captured atRA=(−25,105,0)mm. Signed aligned HingeA→HingeB Top-plane Limit is69.570108523704..90mm. Coupled RH Screw pitch2mm/revolution, axial zero90mm/phase0, component-origin basis; current selected Hinge B crossbore axis points−Y, giving negative Drive turns for closing.

Disposable signed trials on the actual earlier mate source established Drive−0.25 closes span90→89.5mm; Drive−1 closes to88mm. Positive0.25/+1 requests opening beyond90mm and fails residual acceptance. These disposable rejected solves do not test browser transaction rollback.

Actual Chrome Drive−0.25 export independently verifies:

- θ=1.135802266718496°, trunnion yaw0.567901133371°.
- RB=(−25.88708662,194.49560368,0)mm; span89.50000000401684mm.
- JB=(65.68100555,116.29531917,0)mm, jaw orientation0°, opening54.70468083mm.
- Shaft origin remainsRA; quaternion represents trunnion yaw combined with90° spindle roll.
- All25 native placed solids have no positive-volume interference; references/provenance pass; driven rank144/144, **0DOF**.

Important numerical limit: a cold disposable re-solve of the actual saved quarter pose reports `ok=true`, zero issues/rebindings/unsatisfied mates and unchanged transforms, but `settled=false/converged=false` after34 iterations. This flag is preserved in the definition audit. It does not claim every cold Newton solve converged; parent browser acceptance/reload observations remain separate evidence.

Full guided sweep uses the current home export:41 samples at Drive0..−10 in quarter-turn increments, plus exact endpointDrive−10.214945738147826, **42 sampled poses**. Native exact intersection checks cover all25 solids at every pose. All42 solves are ok/settled/converged with0DOF and no issues; all42 have **hits=[]** and agree with the analytic path. Endpointθ36.869897645735°,span69.57010852370436mm,opening10mm. Maximum span error4.90×10⁻⁹mm, angular error3.01×10⁻¹⁰°,opening error4.93×10⁻⁹mm.

These are discrete0.5mm span increments/quarter-roll phases plus endpoint, **not a continuous swept-volume proof** of every intermediate handle phase. Frozen analytic stand/brace roll-envelope bounds remain a separate design argument; source/browser full travel and transaction/animation checks remain parent-owned.

After the solver convergence repair, the full42-pose native audit was independently rerun from the same unchanged current home export. All42 poses again have no exact positive-volume interference, ok/settled/converged solves and0DOF; the unrestricted home clone remains3DOF. The post-fix sweep is preserved separately from the earlier passing sweep.

Unrestricted jaws were audited on another disposable saved-home clone by suppressing both orientation guides4456/4458. Native solve is settled/converged, no issues, **3DOF**: linkage/spindle1DOF plus each physical jaw swivel1DOF. Thus guided flat-workpiece configuration1DOF and unrestricted free-floating configuration3DOF are distinct and both native mobility counts agree with the plan. No unrestricted jaw motion sweep is certified here.

Actual Chrome end-stop exports also pass geometric and transaction checks. At Drive−10.214945738148, RB=(−47,171,0)mm, JB=(73,161,0)mm and the jaw opening is10mm. Drive0 restores the56mm opening. Both saved poses retain bound references, accepted source recipes/provenance and25 valid native solids with **hits=[]**. Parent's beyond-closed−10.5 and beyond-open+0.25 requests were rejected. Comparing the protected accepted/rejected exports confirms exact preservation of all25 transform objects, every mate object, every embedded definition and assembly custom properties, including the accepted Drive value.

The original cold endpoint solve reported `ok=false`, with mate4432 `non-convergent` despite reported linear/angular residuals both0: rank142/144,2DOF and unchanged transforms. Its report remains preserved. The source solver agent repaired convergence checking to apply the existing1×10⁻¹¹ threshold per residual row rather than requiring the combined norm of317 already-tolerated roundoff rows to fall below the same threshold. An independent post-fix cold audit of the **unchanged actual closed export now accepts all36 mates**, with no issues/rebindings/unsatisfied constraints, settled/converged true, rank144/144 and0DOF after47 iterations. Translation delta is0 and rotation-matrix delta3.33×10⁻¹⁶. The actual open export also cold-solves successfully with rank144/144,0DOF and unchanged transforms. Original failure and post-fix success are separate artifacts; browser durability remains parent-owned.

Parent subsequently observed actual Chrome Motion Study Play reaching10/10seconds at−61.289674428888RPM and Cancel restoring home36mates/free1DOF. Final exported study preserves all25 exact home baseline poses, duration10 and time0. This is parent-observed browser execution plus independent saved-data verification; see final deliverables report.

Evidence in `artifacts/planchard`:

- `KT-assembly-parallel-home-reference-audit-2026-10-08.json`
- `KT-assembly-drive-negative-quarter-reference-audit-2026-10-08.json`
- `KT-assembly-drive-negative-quarter-definition-audit-2026-10-08.json`
- `KT-assembly-drive-negative-quarter-native-audit-2026-10-08.json`
- `KT-assembly-parallel-quarter-turn-native-audit-2026-10-08.json`
- `KT-assembly-parallel-postfix-quarter-turn-native-audit-2026-10-08.json`
- `KT-assembly-parallel-unrestricted-jaw-mobility-audit-2026-10-08.json`
- `KT-assembly-closed-endpoint-reference-audit-2026-10-08.json`
- `KT-assembly-closed-endpoint-definition-audit-2026-10-08.json` (original cold failure retained)
- `KT-assembly-closed-endpoint-postfix-definition-audit-2026-10-08.json` (independent post-fix success)
- `KT-assembly-closed-endpoint-native-audit-2026-10-08.json`
- `KT-assembly-drive-zero-open-reference-audit-2026-10-08.json`
- `KT-assembly-drive-zero-open-definition-audit-2026-10-08.json`
- `KT-assembly-drive-zero-open-native-audit-2026-10-08.json`
- `KT-assembly-actual-endstop-transactions-audit-2026-10-08.json`
- Historical home definition/native/sign-trial audits retain the earlier36-mate source.

Repeatable read-only scripts: `audit-kt-mated-references-readonly.mjs`, `audit-kt-screw-trials-readonly.mjs`, `audit-kt-screw-cycle-readonly.mjs`, `audit-kt-drive-transactions-readonly.mjs`, `audit-bv-assembly-readonly.mjs`, `verify-dp-assembly-all-native.mjs`. Actual final editable bundle,25-solid STEP equivalence and drawing acceptance evidence are audited in `kant-twist-8.18-final-deliverables-audit-2026-10-08.md`. Final browser cold reopen and ADVANCE acceptance remain parent-owned.
