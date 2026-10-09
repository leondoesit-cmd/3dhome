# Chain source-aligned19mates — native geometry and solver pass

The corrected actual Chrome export passes all12 reference/source/solver checks. All19 native mates are active:8Concentric,8Coincident,3Angles25/125/130; no legacy mates. All38 references bind without issues or rebindings. Five pin seats are Aligned, while the three link seats remain opposed. All accepted source definitions, material and properties remain unchanged; quantities are4links/2long pins/3short pins and only Link1 is grounded.

All four link poses match the source. All five pin cap origins and axial **directions** match the source; their free axial spins need not reproduce arbitrary source Euler matrices. A disposable cold solve settles with no unsatisfied constraints and exactly **five degrees of freedom, one per plain pin**, while each moving link is fully constrained. Thus the previously observed backwards-pin branch is corrected rather than hidden by a mass comparison.

Independent world COM is **(348.65934955048886,-88.47654471566996,-91.40372906781101) mm**, source mass **33821.70254279185 g**, and volume **7352544.031041706 mm³**. Native exact home interference has no positive-volume hits. Rebuilt nine-occurrence compound and actual STEP have zero bidirectional Boolean difference.

Evidence: `CHAIN-assembly-source-aligned-19mates-reference-audit-2026-10-09.json`, `...-native-home-audit-...json`, `...-step-equivalence-...json` in artifacts/planchard. The earlier wrong-branch bundle and failed report are preserved and superseded. Parent bonus-angle browser edits/cold durability remain pending separately; no authored model, browser, app source or ADVANCE file was changed by this read-only audit.
