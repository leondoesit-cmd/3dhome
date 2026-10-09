# Chain assembly source placements — intermediate audit

The actual Chrome placement checkpoint passes: nine occurrences, three accepted definitions, zero mates, only Link1 grounded, quantities four links/two long pins/three short pins. Feature/sketch/history/material/properties match all three accepted closed part bundles exactly. The nine world poses match direct Assem2 source transforms within4e-10mm translation and9.3e-12 rotation-matrix entries. The first long pin intentionally has zero own-axis spin; its plain cylindrical geometry is unchanged.

Regenerated exact solids give volume **7352544.031041706 mm³**, source Titanium mass **33821.70254279185 g**, world COM **(348.65934955223577,-88.47654471973165,-91.40372906779572) mm**. Exact native home interference reports **no positive-volume hits**. The world origin remains the first long pin's Y0 cap centre. This is a placement-only checkpoint, not assembly mate/mobility acceptance.

Actual rebuilt CH01 topology provides stable mate candidates:

| Reference | Persistent ID suffix / native ordinal | Local direction |
|---|---|---|
| Upper bore | `feature_mv08jbg0_6:face:generated:cylinder:1` /24; cylinder:2 /26 | axis−Z, centre Y100 |
| Lower bore | `feature_mv08jrci_7:tool:face:side:5557` /5 | axis−X, centre Y−100 |
| Fork inner Z+20 | `feature_mv08iy1f_5:face:generated:plane:3` /19 | normal−Z |
| Tongue X−20 | `feature_mv08ie3q_4:face:generated:plane:1` /1 | normal−X |
| Shoulder Y0, X20..50 | `feature_mv08hsqq_3:face:generated:plane:2` /12 | normal−Y |
| Shoulder Y0, X−50..−20 | `feature_mv08hsqq_3:face:generated:plane:1` /16 | normal−Y |
| Outer upper ear Z−50 cap patch | `feature_mv08h8ur_2:face:generated:plane:1` /23 | normal−Z |
| Outer upper ear Z+50 cap patch | `feature_mv08h8ur_2:face:generated:plane:2` /25 | normal+Z |
| Tongue X+20 rounded cap patch | `feature_mv08ie3q_4:face:generated:plane:3` /3 | normal+X |

Multiple coplanar patches exist after rect/circle unions. Their complete bounds/origins/normals and owners are retained in `CHAIN-CH01-native-topology-mate-reference-audit-2026-10-09.json`; choose the actual native selector by those descriptors and component world transform, not by assuming transport ordinal stability across future edits. Upper bore has two coaxial ear patches; either represents the same hinge line.

Evidence: `CHAIN-assembly-source-poses-design-audit-2026-10-09.json`, `...-native-home-audit-...json` and topology JSON in artifacts/planchard. No authored models, browser, source or ADVANCE edits occurred; inputs remain unchanged. Native19mate browser authoring and final mobility checks remain pending.
