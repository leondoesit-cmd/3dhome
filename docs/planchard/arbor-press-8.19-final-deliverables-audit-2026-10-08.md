# 8.19 Arbor press — actual final STEP and indented drawing audit

**PASS** for actual Chrome exports:

- `artifacts/planchard/AP-assembly-indented-drawing-browser-2026-10-08.mforge` — 3,390,000 bytes, cleanly saved.
- `artifacts/planchard/AP-assembly-grouped-assembled-browser-2026-10-08.step` — 487,111 bytes.
- `artifacts/planchard/AP-drawing-first-indented-browser-2026-10-08.svg` — 290,709 bytes.

All eleven physical leaf world poses, source definitions and occurrence properties exactly match the accepted cleanly saved grouped home. All nine parent mates, five internal mates, group properties and the complete motion-study object are byte-identical. Drawing settings and a ten-step exploded presentation were added without changing native home geometry or its accepted 1 DOF. Ten leaf occurrences are moved in the active exploded view, leaving the column home; hierarchy paths retain the five nested cover/screw targets.

Independent STEP import validates **eleven solids**, with volume **600.1580394263552 cm³**. Recompiling the eight exact authored definitions and placing all eleven leaves at their physical home poses gives **zero solids and zero volume in both native-minus-STEP and STEP-minus-native**. Symmetric difference is zero. Native reference volume remains **600.1580396978882 cm³** and mixed-material mass **4.719336856673411 kg**. The tiny curved-volume integration difference is quantified in the earlier flat STEP report and does not represent a geometric residual. Exploded offsets are presentation data and do not enter this assembled STEP comparison.

The SVG is **ANSI Letter landscape, 279.4 × 215.9 mm, third angle**, with the book's indented nine-row hierarchy: 1 AP-FRAME quantity 1; 1.1 AP01 quantity 1; 1.2 AP02 quantity 1; 1.3 AP03 quantity 4; and items 2–6 AP04–AP08 quantity 1 each. Leaf quantities total eleven, excluding the group row. All **eleven balloons** match the leaf quantities, including four `1.3` balloons; no duplicate group balloon counts the frame again.

All balloon circles lie inside the border and their minimum edge-to-edge gap is **2.218 mm**. The SVG contains **ten explode lines** and eleven balloon leader lines. A separate third-angle projection-symbol centerline makes eleven center-style dashed lines in total; it is explicitly excluded from the explode-line count. No explode line intrudes into a balloon circle and no explode or balloon leader crosses the BOM or title block. BOM and title regions are respectively X22–142/Y14–124.4 mm and X151.4–271.4/Y165.9–207.9 mm.

The actual whole-sheet Chrome image `AP-drawing-first-indented-sheet-browser-2026-10-08.jpg` was visually reviewed: the BOM, dotted balloon labels, notes, exploded isometric and title are readable with no evident clipping or overlap. The note block discloses original designer dimensions, unavailable companion CAD/AVI, omitted rack teeth/threads, interpreted peg roles and material substitutions; it claims no rated capacity.

Parent browser evidence separately confirms cold grouped reopening at six top-level occurrences/nine parent mates/1 DOF/ram Y90 mm, followed by a complete 10/10-second Play in 30.11 seconds and Cancel restoring Y90 mm. The core agent's full native movement sweep is separate evidence; this read-only audit does not substitute static drawing/STEP checks for playback.

Parent additionally confirmed cold drawing retention of indented scope, ANSI Letter/mm/third angle, title, number, revision, date, mass and notes. Both metadata QA Undo operations restored nominal AP04 Description/PartNo and placement X45 mm.

## Final cold export verification

**Final cold PASS:** `artifacts/planchard/AP-assembly-final-browser-2026-10-08.mforge` (3,390,000 bytes) contains a canonical assembly object exactly equal to the independently audited indented drawing export. Definitions, all eleven home poses and properties, nine parent/five internal mates, study, six corrected baselines, drawing settings and ten-step exploded view therefore remain unchanged. Container export metadata can differ; whole-file byte equality is not claimed. Its SHA-256 is `8e27821c97740a018b51bb9b5ccf1839ff510c98370af20647e30285d42de09f`.

The two differing container fields are `createdAt` and the separate workspace `mainModel` draft (ID/key/sketch and rebuild/editor fields). This equality certification covers the actual assembly object and its embedded accepted part definitions; it does not claim the unrelated workspace draft is equal.

The final cold SVG `artifacts/planchard/AP-drawing-final-browser-2026-10-08.svg` is **byte-identical** to the first independently audited SVG: 290,709 bytes, SHA-256 `3f0eeba4e304653addfb62ae5da5123a7cdec9342649d6d90773638ed0a57ba7`. All nine-row hierarchy, eleven-balloon labels, minimum gap, border and annotation clearance results apply unchanged. Native regeneration and STEP equivalence checks are reused on the exact equal canonical assembly, rather than repeated without a new geometric concern.

`AP-assembly-final-cold-consistency-audit-2026-10-08.json` records equality, hashes and authored-input preservation, and the consolidated final drawing audit now includes this cold export result. Parent separately reports clean Save, current Chrome rendering, and metadata UI durability; source-focused tests and gates passed in the owning agents' work.

Audit artifacts:

- `AP-assembly-grouped-step-native-audit-2026-10-08.json`
- `AP-assembly-grouped-step-equivalence-audit-2026-10-08.json`
- `AP-assembly-final-drawing-audit-2026-10-08.json`
- `AP-assembly-final-cold-consistency-audit-2026-10-08.json`

Authored bundles, STEP, SVG, browser state and ADVANCE were not modified. Previous grouped baseline failures and corrections remain preserved in their earlier reports.
