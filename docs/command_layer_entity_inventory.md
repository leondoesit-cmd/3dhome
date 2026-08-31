# Command-layer entity inventory

This inventory is enforced by `tests/command_registry.test.mjs`. “Explicit temporary exception” is the shrinking allow-list: creation paths leave it only when a validated command becomes their owner.

| Creatable kind | Classification | Command / boundary |
|---|---|---|
| Wall | implemented command | `wall.draw` |
| Node | solver/internal-only | Materialized by wall topology and the constraint solver |
| Opening | implemented command | `opening.place` |
| Item | implemented command | `item.place`, `item.duplicate` |
| Room | implemented command | `room.create`; rooms derive from wall loops |
| Marker | explicit temporary exception | Existing marker path |
| Slab opening | explicit temporary exception | Existing slab/floor path |
| Wall constraint | explicit temporary exception | Existing wall-constraint path |
| Room constraint | explicit temporary exception | Existing room-parameter path |
| Plan variable | explicit temporary exception | Existing room-parameter path |
| MEP node | explicit temporary exception | Existing MEP path |
| MEP run | explicit temporary exception | Existing MEP path |
| Floor | document-level operation | Floor lifecycle |
| Custom model definition | document-level operation | Model catalog/document lifecycle |
| Cabinet preset | document-level operation | Cabinet document/preset lifecycle |
| Project import | document-level operation | Destructive whole-document import |
| Snapshot/clone topology | solver/internal-only | Snapshot restoration and clone materialization |

## Remaining source boundaries

The command inventory proves that each main kind has a programmatic command; it does not pretend every legacy gesture or whole-document importer has already been decomposed. `tests/command_registry.test.mjs` also enforces a shrinking, counted source allow-list from `DIRECT_CREATION_BOUNDARIES`, so a new direct push cannot quietly appear.

- `interaction.js`: offset-wall and arc-wall gestures still own specialized topology; wall splitting/materialization is an internal service used by `wall.draw`.
- `ui_room_scan.js`: scan merge/replace is one document import boundary, including detected furniture.
- `ui_site.js`: footprint append is a document import boundary.
- `ui.js`: temporary snapshot restoration is internal rollback, not user creation.
- `constraint_engine.js`: node materialization is solver-owned.

The apartment generator is now `document.generate_apartment`: its nested entity commands run under one executor transaction and a late failure restores the complete pre-generation document. Pointer, elevation, selected-wall and corridor opening creation use `opening.place`; ordinary and cabinet duplication use `item.duplicate`; marker-held furniture uses `item.place` inside its composite marker operation.
