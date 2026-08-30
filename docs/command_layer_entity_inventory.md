# Command-layer entity inventory

This inventory is enforced by `tests/command_registry.test.mjs`. “Explicit temporary exception” is the shrinking allow-list: creation paths leave it only when a validated command becomes their owner.

| Creatable kind | Classification | Command / boundary |
|---|---|---|
| Wall | implemented command | `wall.draw` |
| Node | solver/internal-only | Materialized by wall topology and the constraint solver |
| Opening | implemented command | `opening.place` |
| Item | implemented command | `item.place` |
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
