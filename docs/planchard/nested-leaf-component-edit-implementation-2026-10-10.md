# Nested leaf component editing and occurrence properties — 2026-10-10

Confirmed trigger: FLASHLIGHT's nested BATTERY/BATTERYPLATE tree rows selected the rigid BATTERYANDPLATE root, leaving no ordinary leaf Edit component action. The root selection behavior remains appropriate for assembly placement/mates, but it prevented refreshing valid leaf-native topology or authoring the eight leaf BOM numbers independently.

Nested tree rows now carry a full occurrence path while retaining their rigid root targetId for ordinary selection. An editable leaf supports Enter/double-click and an explicit **Edit nested component** context-menu action. **Nested component properties** opens **Component part number** and **Component description**, stored only on that occurrence. This uses the existing BOM priority (occurrence PartNo/Description before source defaults); it does not write the Saved part library.

Component authoring deep-clones the selected leaf definition. Finish verifies the same root owner, unambiguous full path, leaf/source identity, unchanged source authoring and ancestor pose; it awaits exact native mesh publication and rejects local history changes while pending. Only that embedded leaf is committed in one assembly history transaction. Parent/root/nested occurrence IDs, mates and sibling definitions remain intact. Duplicate child IDs in different branches are distinct; duplicate IDs within one path level fail closed. No persistent topology references are rewritten or ambiguities relaxed.

Local Undo snapshots and recovery metadata carry the full occurrence path; local history from another repeated child is rejected. Cold draft restoration validates root assembly key and path/leaf identity before reopening. Cancel leaves original source authoring intact. The ghost frame uses composed ancestor placement and exploded offsets; a shallow display-only branch excludes the edited leaf, preserving native source geometry and avoiding a duplicate ghost of the working component.

Shortest parent browser repair after reload: expand BATTERYANDPLATE; right-click BATTERY leaf → Edit nested component (or focus its row and Enter) → Finish component → await native completion. Repeat BATTERYPLATE. These refresh current native operation proofs without changing driving parameters; actual repaired mate acceptance remains parent-owned. Top-level SWITCH's existing Edit component path remains supported.

Read-only exact source leaf paths:

| Path | Leaf |
|---|---|
|1394|HOUSING|
|1395|SWITCH|
|1396/1385|LENSCAP|
|1396/1386|O-RING|
|1396/1387/1379|LENS|
|1396/1387/1381|BULB|
|1397/1372|BATTERY|
|1397/1373|BATTERYPLATE|

For the six nested rows, use Nested component properties to apply the book's independently verified numbers/descriptions. For Housing/Switch, the existing component inspector fields remain available. This report supplies paths/controls, not invented book number values.

Validation: **21/21 focused tests PASS**: seven nested regressions, four existing component edit/native Finish regressions, six rendering/context regressions, and four assembly copy regressions. Tests cover two-level/duplicate-ID paths, genuine native final topology, isolated working data, parent mates/source library unchanged, full assembly Undo/Redo/cold, stale owner/source/parent pose/history, metadata BOM routing, draft identities, ordinary rigid selection vs leaf edit, and cross-path local Undo rejection. No browser/CAD artifact was authored by this implementation.

Owned source: js/core/nested_component_edit.js; modeler tree/context/history/draft/ghost functions; tests/nested_component_edit.test.mjs and adaptations of existing component context/edit fixtures. Drawing/balloon code untouched.

Final gates PASS: no free identifiers, 685 linked modules, 1487 source assertions; git diff --check clean. Source frozen for actual parent browser replay.
