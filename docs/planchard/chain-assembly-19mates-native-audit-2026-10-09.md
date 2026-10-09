# Chain19mate checkpoint — pin seating branch failure

**Not accepted.** The actual browser checkpoint contains19 active native mates:8Concentric,8Coincident and3Angle25/125/130. There are no legacy mates. All38 references bind without resolver issues or rebindings; accepted source definitions remain unchanged. A disposable cold solve settles immediately with five degrees of freedom, one spin per plain pin, and no unsatisfied constraints.

However all **five pins reverse their local+Y axis** relative to the source placement, dot product−1. This changes which side of each coincident Y0 cap the finite cylinder occupies; it is not an equivalent free axial spin. All four link poses remain source-consistent. Pin seating Coincident mates5592/5594/5596/5598/5600 have `aligned:false`; the source cap/side-face normals require aligned seating. Three link seating planes correctly remain opposed.

The resulting world COM **(348.72863138803746,-44.48164128636574,-72.11969377550409) mm** independently matches the parent's observed wrong-branch UI result. Total volume7352544.031041706mm³ and mass33821.70254279185g remain unchanged. Exact native home interference has no positive-volume hits, so absence of clashes alone does not certify source placement.

Native compound and exported STEP have zero bidirectional Boolean difference. This proves STEP matches the actual wrong branch, not the source assembly. Parent is explicitly changing the five pin seats to Aligned through Chrome; a fresh corrected export is required before acceptance. No engine defect is claimed: the visible alignment control supports the needed direction.

Evidence in artifacts/planchard: `CHAIN-assembly-19mates-reference-audit-2026-10-09.json`, `...-native-home-audit-...json`, `...-step-equivalence-...json`, and `...-pin-branch-diagnostic-...json`. The audit preserves failed pose evidence and authored input unchanged. No browser, app, geometry or ADVANCE mutation occurred.
