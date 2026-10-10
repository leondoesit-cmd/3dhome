# Auxiliary numeric scale inspector fix — 2026-10-10

Actual Chrome created a genuine Auxiliary view from the native inclined face and then crashed during Dimension tool panel refresh: `view.scale.join is not a function` in `syncSheetPanel`. The core supports numeric scales; Auxiliary correctly copies its parent's resolved numeric placement scale. Both the panel signature and selected-view scale dropdown incorrectly assumed every saved scale was a two-element array.

The bounded fix represents inherited, numeric, ratio-array and ratio-object scales through one inspector control helper. Standard scalar2 displays/selects2:1. A nonstandard scalar has an exact ratio option value and the existing formatted label; rendering never rewrites canonical scale or quantizes it through the rounded label. Both panel signature and selected dropdown use the helper. The generic ratio editor still changes scale only after explicit user input.

Eight focused tests pass: three new meaningful regressions exercise valid scale representations/cold normalization, the actual extracted `syncSheetPanel` under numeric Auxiliary selection/Dimension refresh, and actual selected-view dropdown behavior; five existing Auxiliary tests prove real native20×50mm inclined face/associative dimension, source rebuild, stale/native-reference failure guards and cold SVG parity. Scoped whitespace check is clean. Full `npm run check` passes: no free identifiers, no link errors (675 modules), all1487 source assertions checked.

Parent actual saved model **Planchard Auxiliary - native inclined-face witness - browser2026-10-10** remains unchanged by this patch. Parent owns actual reload/dimension/SVG/cold acceptance. No browser/CAD/ADVANCE/ledger/Git writes by this agent.

## Actual reverse-control adapter mismatch

The parent also observed **Reverse sight direction** as a textbox containing `false`, while its saved Auxiliary modifier was flip=true. The controller correctly declared type=checkbox, but the generic `sheetForm` adapter only recognized type=boolean, downgraded checkbox to text and returned string `false`; the creator's boolean coercion therefore enabled reversal. The adapter now accepts checkbox as an alias for the native Quickform boolean control and returns actual booleans. Unchecked=false, checked=true; existing persisted modifiers remain unchanged until explicit authoring.

An additional regression executes the actual extracted drawing-form adapter, proves checkbox control schema/default false, preserves both submitted booleans and cancellation. Latest combined focused suite is **9/9 PASS** (four new inspector/form cases plus five native Auxiliary cases). Final gate rerun passes no free identifiers, no link errors (675 modules) and all1487 source assertions checked; scoped whitespace check is clean.
