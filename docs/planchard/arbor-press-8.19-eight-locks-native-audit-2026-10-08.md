# 8.19 Arbor press — actual eight-lock checkpoint audit

PASS for the Chrome-authored `artifacts/planchard/AP-assembly-eight-locks-browser-2026-10-08.mforge` (3,377,776 bytes). This is an intermediate mating checkpoint, not the completed rack/pinion assembly.

All eight ordinary Lock mates are active, unique, and captured at the saved home position: occurrence pairs **1–2, 1–3, 1–4, 1–5, 1–6, 1–7, 8–10, 9–11**. There are no suppressed mates or duplicate pairs. IDs are 4807–4814. The stored relative positions and identity rotations agree with the saved occurrence poses to 1e-12 cm.

The disposable native solve is settled and converged, with no issues, rebindings or unsatisfied constraints. It reports **12 DOF**: six rigid-body freedoms for the shaft/handle group and six for the ram/head group. The six components locked directly to the grounded column have zero DOF. Native solve moves no saved occurrence (zero translation and rotation-matrix deltas).

All eleven occurrence definitions, occurrence properties and grounding states exactly match the accepted raw placement bundle; only AP01 is grounded. Three serialized translations differ from placement by at most 4.44e-16 cm, with unchanged identity rotations. This is recorded explicitly rather than claimed as byte-identical pose equality. All eight native definitions remain valid single solids with accepted source recipes and provenance.

A fresh native all-pairs intersection audit of the actual eight-lock checkpoint finds **no positive-volume clashes**. Its eleven placed solids total **600.1580396978882 cm³**, with the mixed reference-material mass **4.719336856673411 kg**. The known nominal home head/table gap remains 62 mm and ram/guide side clearance remains 0.2 mm. These home checks do not certify the subsequently authored movement path.

Evidence:

- `artifacts/planchard/AP-assembly-eight-locks-definition-audit-2026-10-08.json`: native regeneration, source comparison, solve and zero solve movement.
- `artifacts/planchard/AP-assembly-eight-locks-native-home-audit-2026-10-08.json`: freshly compiled native home solids and exact intersections.
- `artifacts/planchard/AP-assembly-eight-locks-consistency-audit-2026-10-08.json`: pairs, capture checks, exact definition comparison and recorded serialization roundoff.

Authored models were read only. Parent continues the remaining guides, limit and rack coupling through Chrome. The parent-observed collector closure and duplicate Lock rejection are browser UI evidence, separate from this saved-model audit.
