# 8.19 — actual Chrome grouped home native audit

**Geometry, references and native home PASS; saved study structural baseline needs refresh.** Actual source: `artifacts/planchard/AP-assembly-grouped-home-browser-2026-10-08.mforge` (3,387,891 bytes), compared with `AP-assembly-flat-title-browser-2026-10-08.mforge`.

Chrome-authored group 4821 is **“AP fixed frame - column cover and four screws”**, with PartNo **AP-FRAME** and Description **“Fixed frame: column, front cover and four hex screws”**. It is grounded at the identity pose and contains original occurrences 4796–4801. The assembly has six top-level occurrences and eleven leaf occurrences. All eleven leaf world placements, definitions and occurrence custom properties exactly match the titled flat export. Eight source definitions match accepted final part features, sketches, custom properties and appearances; source geometry and mixed material provenance are preserved.

The group retains five internal Lock mates and the parent has nine external mates. Native internal solve reports **0 DOF**; native parent solve is settled and reports **1 DOF**, with no unsatisfied constraints. All twelve non-body parent references resolve without issues or rebindings, including namespaced references through AP01 inside the group. The original Rack motor still targets mate 4819 with unchanged −5.72957795130823 RPM, baseTurns 0 and 10-second duration.

Fresh native regeneration validates eight single-solid definitions and places all eleven leaves. Exact all-pairs intersections find **no positive-volume clashes**. Volume remains **600.1580396978882 cm³** and mixed-density mass **4.719336856673411 kg**.

The exported study's `baseRotations.__assemblyPoses` still contains the original eleven flat occurrence IDs and omits new group 4821. Thus its baseline structure does not match the six current top-level components. This does not invalidate the unchanged actual home geometry or motor mate, but it fails this audit's structural-baseline requirement. Parent and core owner were notified; the current core operation already migrates matching baselines, so this export appears to precede that browser-loaded repair. Refreshing or recreating the study through visible Chrome and exporting a new bundle can resolve the finding without geometry changes. This initial report preserves the actual finding rather than silently editing the bundle.

Evidence: `artifacts/planchard/AP-assembly-grouped-home-native-audit-2026-10-08.json`. Verification used `scratch/planchard/audit-ap-grouped-home-readonly.mjs` and disposable native clones. Authored models and ADVANCE were untouched. Parent separately observed browser Undo/Redo preserving flat eleven/14 mates ↔ grouped six/9 mates with 1 DOF.

## Corrected actual Chrome export

**Corrected bundle PASS:** `artifacts/planchard/AP-assembly-grouped-corrected-home-browser-2026-10-08.mforge` (2,121,005 bytes), independently audited into `AP-assembly-grouped-corrected-home-native-audit-2026-10-08.json`. The earlier failure above remains historical evidence.

The study baseline now contains exactly six top-level IDs: 4802, 4803, 4804, 4805, 4806 and 4821. Group 4821 has an identity baseline. Rack motor ID, mate 4819, RPM, baseTurns and duration remain unchanged. The baseline structure finding is resolved.

All eleven leaf world placements and occurrence properties remain bit-identical to the titled flat source. All eight authored definitions remain equivalent, including features, sketches, part data, material provenance, properties and appearances. The only differing definition field is `exactTopologyCache`, removed by draft restoration; this verification distinguishes transient cache equality from authored-data equality. No source geometry difference is hidden by that distinction: every recipe is rebuilt natively.

Fresh native validation and placement again yield eight valid single-solid definitions, eleven placed solids, **600.1580396978882 cm³** and **4.719336856673411 kg**, with no positive-volume clashes. Five internal mates solve at 0 DOF; nine external mates solve settled at 1 DOF; all twelve non-body references resolve without issues or rebindings. Parent is separately handling browser save/library durability and full playback; neither is inferred from this read-only corrected bundle audit.

## Cleanly saved actual grouped export

**Saved bundle PASS:** `artifacts/planchard/AP-assembly-grouped-saved-home-browser-2026-10-08.mforge` (3,387,492 bytes), independently regenerated into `AP-assembly-grouped-saved-home-native-audit-2026-10-08.json`. This supersedes the previous corrected draft candidate after the parent resolved a Save baseline conflict through Chrome.

The newly saved rigid group is **4822**, retaining AP-FRAME and its description. All eleven leaf world poses and occurrence properties match the titled flat accepted home exactly. The eight authored source definitions and material provenance remain equivalent. Fresh native regeneration again confirms eight valid single-solid definitions, eleven placed solids, unchanged volume/mass and zero native home clashes. Internal five mates remain 0 DOF, external nine mates remain settled 1 DOF; twelve non-body references bind cleanly.

Study baselines now contain exactly 4802–4806 and **4822**, and every baseline translation and rotation matrix exactly matches its current top-level home pose. Rack mate 4819 has **no prescribed driveTurns**, pinionRoll0 0 and captured rackTravel0 −6 cm; motor baseTurns remains 0 and nominal home ram Y is exactly 90 mm. Motor parameters and ID are preserved. Saved study time remains 10 seconds, independently of its restored open assembly and zero motor baseline; this audit does not equate timeline time with current assembly pose. Parent observed a clean Save header before cold reload. Cold reopen and drawing/playback verification remain separate parent browser checks.
