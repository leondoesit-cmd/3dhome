# Ordinary aligned Break browser recipe — 2026-10-10

Parent source witness: actual supplied PDF111/printed2-25. Break shortens an existing drawing presentation while retaining true physical dimensions. This finite app supports a Front principal cluster and genuine source-space projection clipping; it does not cut CAD solids or add section hatching.

Use a saved copy of the illustrative60×40×30mm bridge. Set Sheet scale2:1 and principal view scales **As sheet**. If copied from the Detail/Crop/Broken-out branch, remove Top Crop and Right Broken-out through **Remove crop**/**Remove broken-out** and click those views. Principal Front/Top/Right must be ordinary edge views with matching configuration; existing pictorial/Detail children can remain independent.

1. **Break** → click principal Front → form **Break view — existing view, true dimensions**.
2. **Shortening axis**: **Horizontal (vertical break lines)**. **First boundary, original view coordinate (mm)**20; **Second boundary, original view coordinate (mm)**40; **Printed gap (mm)**6; **Break line style** **Zigzag**. Apply.
3. Front and matching Top shorten. Right, looking along the shortened X axis, remains full size. At2:1, Front displayed width is86mm (40mm retained source×2+6mm gap), while the existing overall dimension still reads60mm.
4. Rechoose **Break**, click Front: existing fields provide the edit path. Change axis to **Vertical (horizontal break lines)**, first5mm/second20mm, printed gap6mm, **Wavy**, Apply. This replaces the horizontal group: Top restores, Front and Right shorten along Y. At2:1 their displayed height is36mm (15mm retained×2+6mm gap), while true source height remains30mm and width60mm.
5. **Remove Break** → click any linked principal group member removes the entire current group. Ctrl+Z restores the group; Ctrl+Y removes it. Return to the intended final state, clean Save, export ordinary drawing SVG and exact library cold-open/export.

Intervals are original projected model coordinates entered in mm; gap is printed paper mm. Any existing dimension/leader anchor inside the removed band is preserved but omitted with a hidden-by-Break diagnostic, rather than silently attached elsewhere. Native source sketches/features/solid/history and true dimension values must remain unchanged; only saved drawing modifiers/presentation scale change.

Read-only code observation: alignedBreakPlan currently compares explicitly stored view scale with resolved numeric placement scale by strict identity. Equal ratio arrays versus numeric scales can be rejected despite equal values. Sheet2:1 plus inherited principal scales is the clear ordinary route for this proof. This observation does not claim a new implemented repair or actual reproduction; parent may request a bounded fix if needed. No CAD/browser/ADVANCE/ledger/Git writes.
