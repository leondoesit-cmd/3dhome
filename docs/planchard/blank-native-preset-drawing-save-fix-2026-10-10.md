# Blank native template/format drawing save

The ordinary Save guard rejected an empty Drawing created from a saved native template because it counted only CAD/sketch authoring or paper notes/primitives/images. Reusable paper/defaults/provenance are now recognized as authored drawing content without requiring a fabricated witness note.

Scope: `js/core/model_save_policy.js` validates native drawing version1, known paper/orientation/units/drafting standard/projection, title and native content arrays, positive two-number scale or fit, valid decimal defaults/secondary units, and a complete version1 sheetFormat id/name. Optional templateSource must also have complete version1 id/name. A standalone applied format is eligible. Ordinary blank New models/sheets and malformed or missing provenance/defaults remain excluded. This validates the persisted native schema; provenance is not a cryptographic authenticity guarantee.

Blank qualifying library records are classified Drawing with zero annotations/zero notes rather than Sketch only. No notes, views, parts, sketches, features or mesh data are invented by the guard. Existing Save/library/export/normalization paths remain in use. Normal sheet normalization supplies the new document's own title when initially blank; it does not copy BATTERY's title or geometry.

Three new meaningful regressions cover genuine native factory/format outputs, malformed provenance and defaults (including inherited-object-name inputs), immutable content checks, zero-CAD rebuild, library storage/export/reopen, and exact shared SVG after cold normalization. Related preset/image/library/sketch-save regressions: **21/21 PASS**. `npm run check`: **680 linked modules,1487 source assertions, no free identifiers**. Diff whitespace check clean.

Parent browser acceptance remains pending: hard reload fixed code, Save MY-A-FORMAT and A-IN-ANSI, New from A-IN-ANSI, apply MY-A-FORMAT/Undo/Redo, Save the independent blank Drawing directly, then export/cold reopen. The optional witness Note is no longer necessary. No accepted BATTERY source/artifact, ADVANCE, ledger or Git state was authored by this repair.
