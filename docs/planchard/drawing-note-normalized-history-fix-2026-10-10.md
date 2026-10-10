# Drawing Note insertion after history normalization

Source PDF121 describes a Material Custom Property linked to a drawing note. The native Note controller already supports this link, but a bounded regression confirmed an insertion defect when Undo capture normalizes/replaces the drawing document.

The test drives the actual `createDrawingController` Note tool with a host whose `pushUndo` saves the prior state and clones/normalizes its live drawing. Before the fix, ordinary plain Note insertion returned but the live document retained **0 notes instead of1**: the controller appended to the old document reference. This also affected property-linked insertion through the same path.

The Note-only fix reacquires `host.doc()` after `host.pushUndo`, immediately before appending the note. It preserves its original paper position, leader and modelLink, and creates the same single history entry. No CAD geometry, model property or saved artifact is changed by this fix.

Meaningful regression covers plain insertion, genuine `modelLink:{kind:'property',key:'Material'}` insertion, a source Material value change updating SVG without freezing note text, cold JSON/normalization SVG equality, actual prior-state Undo restoration, and Cancel without a history entry. With neighboring shaded/property-note/FLAT BAR/image/template tests: **20/20 PASS**. Browser Material-note insertion/live/cold evidence remains parent-owned and pending; this source/controller regression is not fabricated browser acceptance.

Final module gates: no free identifiers;679 modules linked;1487 source assertions. Scope: one controller statement move, one new focused test, this report. No ADVANCE, ledger, Git or browser/model authoring.
