# Blocker: cannot replace a finishing fillet while preserving downstream features

## Ebook workflow

David Planchard, Engineering Graphics with SOLIDWORKS 2021, PDF page 251 (printed 5-33), steps 221–236: delete Top Face Fillet, roll back below Top Cut, insert a Full Round fillet using inner wall / top rim / outer wall, then restore downstream history on the next page.

## Browser reproduction

1. Open http://localhost:8765/, Model editor, Saved models.
2. Open `BATTERYPLATE - repaired support`.
3. Baseline has 12 history steps, one solid, two holes and the drafted annular Holder. Status: `Rebuild succeeded`.
4. In the feature tree, click Delete on step 6, `Fillet 2` (the old top rim fillet).
5. Actual response: `Fillet 2 is used by Extrude Cut 2`.
6. No feature is deleted and no preservation/remapping option is offered.

Full Round and Multiple Radius controls are present in the Fillet form. Their geometry was not tested in this continuation because the preceding required history edit is blocked.

## Relevant code

- `js/modeler.js`, removeTreeNode, around line 15802: calls removeHistoryNode; discards undo and flashes its first issue on refusal.
- `js/core/parametric_document.js`, removeHistoryNode, around lines 348–355: refuses any node with dependants using `history-node-has-dependants`.

This establishes the immediate refusal path, not that every downstream topology reference can safely be rebound. Do not merely remove the dependency guard.

## Expected capability

For removal of an intermediate finishing operation, offer a safe way to preserve downstream features by reconnecting the body chain to the removed operation's predecessor. Remap only references to uniquely corresponding surviving topology. Surface actual deleted/ambiguous face or edge references as repairable diagnostics; never silently select a different support face. Keep unrelated features and sketches intact. Support Undo and save/reopen.

## Acceptance checks

- Deleting this old rim fillet preserves both vertical Ø12.7 mm holes and the Holder's floor support and concentric profile.
- Holder remains 10.16 mm high with 3-degree inward draft, profile radii 13.97 and 16.51 mm.
- Roll back to Top Cut, add the three-face Full Round fillet, restore history to the end, then save and reopen with a valid solid.
- Test removal of a reference genuinely consumed by the fillet: require explicit repair rather than guessing.
- Undo restores the previous feature and valid references.

## Retained state

Renamed the new extrusion `Holder` per ebook step 219 and saved `BATTERYPLATE - repaired support`. The old rim fillet remains present; attempted deletion was refused. Final browser status: `Rebuild succeeded`, 12 steps, one solid. No application code was changed during this continuation. Stopped at the functional blocker as requested.
