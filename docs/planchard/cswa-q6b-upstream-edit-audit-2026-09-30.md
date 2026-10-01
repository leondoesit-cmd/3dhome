# CSWA Q6B source-led upstream edits — 2026-09-30

## Source and authored variant

PDF pages 501–503 were read visually. Original Question 6 says “All Rounds 5mm” while separately specifying R10 and R30 profile arcs. Question 6B changes the general rounds to 7mm, overall length to 140mm, and material to 1060 alloy. The variant therefore preserves the explicit R10/R30 profile arcs and changes Fillet1's five rounds to R7. A separate R7 profile trial was exported and rejected as the less supported interpretation, not used to tune the answer.

All model changes were made through ordinary Chrome sketch/feature controls. The variant is an independent Save-copy of the freshly authored Q6 base. The original model and Q6A coordinate-system copy remain protected. The original left anchor stays X−65mm, so extending length to 140mm moves the right end to X75mm. The slot was translated +10mm to retain its printed 50mm distance from the right end. No geometry was adjusted to fit the book's mass.

## Real app defects and repairs

1. Trimming a converted face boundary caused its associative rebuild path to stop following the source, despite the inspector still describing it as linked. The new guarded line/arc follower updates surviving source curves and their intersections with manual closing lines while preserving sketch/entity IDs and the authored frame. Missing and ambiguous intersections fail explicitly.
2. Mixed line/arc extrusion topology incorrectly indexed sketch entity IDs by tessellated sample index. Altering arc spans changed the identity of unrelated physical edges. Analytic segments now carry their real source entity ID through sampling, so source walls and corner edges have stable entity semantics.
3. Persisted legacy sample aliases could override an accurate stored reference descriptor. A saved `depth:20` hint named X−65,Y30 while its consumer's descriptor correctly requested X−50,Y30. Only aliases absent from the current mixed profile's actual source entity IDs are rejected; existing geometric descriptor migration then resolves the intended edge. Native generated names and valid entity aliases remain supported. Tolerances were not loosened.

Clean native reconstruction and reconstruction with saved topology hints now produce identical volume 115724.84917772454mm³ before later browser publishing. Six focused pure/native tests pass, including a deliberately contaminated legacy hint and preservation of exact offset arcs/manual trim wall. `npm run check` passes module free-identifier, link, and source assertion gates.

## Measurement limits

The source lists 114721.22mm³ and 309.75g. A native result of 115724.849mm³ differs by +0.875%. The book's scoring note permits an answer within 1%, but this is not an exact mass/COM match. The app's Aluminum1060 preset density is 2.69879g/cm³; the source rounded nominal density is about2.7g/cm³. The unchanged authoring origin is also not the source's centered default origin after the length edit. Do not present the raw world COM as matching the source report.

## Actual Chrome acceptance

Chrome733 loaded the final migration implementation, rebuilt native geometry, saved the model, exported a project bundle and STEP, then fully reloaded and reopened the saved library record. Both browser native reports show:

- One solid body, nine history steps; overall140×45×40mm.
- Volume115724.8mm³, mass312.3171g at2.69879g/cm³.
- Raw world COM−11.61864,+15.49497,−2.514857mm.
- Reopened status `Rebuild succeeded`; no retained broken-reference diagnostics.

Volume differs+0.875% and mass+0.829% from the printed answer, within the book's1% scoring note. These are declared residuals, not exact-answer claims. With the140mm length's center at worldX5mm, an explicitly centered frame would subtract5mm from rawX, producing−16.61864 rather than the book's−16.25. We have left the original source-driven anchor/origin intact and do not claim COM agreement.

Protected artifacts:

- `artifacts/planchard/CSWA-Q6B-source-led-repaired-browser-2026-09-30.mforge`793323bytes.
- `artifacts/planchard/CSWA-Q6B-source-led-native-browser-2026-09-30.step`131280bytes; exported through the normal browser command with the native tolerance gate intact.
- `artifacts/planchard/CSWA-Q6B-native-repaired-browser-2026-09-30.png`.
- `artifacts/planchard/CSWA-Q6B-cold-reopened-browser-2026-09-30.png`.
- Alternative interpretation trial: `artifacts/planchard/CSWA-Q6B-profile-R7-trial-browser-2026-09-30.mforge`,803376bytes.

A read-only clean native regeneration of the protected final bundle (all topology hints removed) independently succeeds at115724.84917772404mm³. Its COM differs from the warm browser report by less than0.003mm, below the book's0.01mm reporting precision. The mixed profile compile tag is now `analyticProfileTopologyRevision:'3'`, and legacy aliases are retained only when the saved signature contains the current analytic revision; pre-repair source/sample aliases cannot be mistaken for verified entity identities.

## Original Q6 tangent compatibility

Clean native replay of the original130mm/R5 browser-authored model revealed a floating-point tangent issue: two quadratic roots separated by only3×10^-8cm were treated as distinct ambiguous intersections. The follower now preserves an already shared native endpoint within10^-9cm and clamps only a16ULP discriminant roundoff bound. It does not relax geometric reference tolerance. A compact25KB fixture verifies the exact original shared tangent point, valid one-body native replay, volume111060.4494mm³, and source COM within0.01mm printed precision. Original mass888.4836g still rounds to888.48g. Seven focused tests pass including this regression.
