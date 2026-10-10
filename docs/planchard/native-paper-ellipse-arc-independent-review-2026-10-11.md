# Paper ellipse arc independent review — 2026-10-11

**26/26 focused tests PASS**, covering ellipse, ordinary paper arcs and primitives. Read-only review found no blocking issue for the source cylinder's half-elliptical outline. This is code/controller verification, not actual Chrome source-sheet acceptance.

Run: `node --test tests/drawing_paper_ellipse.test.mjs tests/drawing_paper_arc.test.mjs tests/drawing_primitives.test.mjs`.

Start/end angles are finite degrees in the persisted primitive, with nonzero directed sweep capped at360°. Existing full ellipse records default to0→360. Scene conversion supplies radians/direction; Canvas uses native `ellipse` with the same rotation/start/end/anticlockwise values. Partial SVG uses genuine elliptical `A` commands with the corresponding endpoints, rotation, large-arc and sweep flags. Full curves remain native `<ellipse>`. No circular-arc or polyline substitute is introduced.

Restricted hit tests minimize distance only over the directed saved interval and explicitly include both endpoints; the unselected complementary half remains unpickable. Rotated partial-arc paper bounds test endpoints plus the exact X/Y extrema that fall within the saved sweep. Existing control-point paper validation remains conservative: a mathematically inside partial arc may still be refused if its construction handles themselves leave the sheet. This is safe bounded behavior, not full unrestricted conic support.

Independent analytic probes beyond the focused fixtures exercised40 rotated forward/reverse130° sweeps:840 curve points selected,40 complementary points rejected,40040 dense extent probes inside the admitted paper. Zero failures. The nearest-point hit algorithm remains numerically approximate as documented in the earlier full-ellipse review, rather than a symbolic global-distance guarantee.

Ordinary numeric angle fields edit the current host record after Undo normalization, preserve styles/geometry, validate empty/nonfinite/oversized/zero sweeps before history, and round-trip partial SVG through Undo/Redo and serialized cold-controller recreation. Focused half/reverse/wrap/large-sweep cases and the preceding cancel/stale-document/Delete/persistence regressions pass. Source CAD/history are untouched. Real Chrome Save/reload/half-outline witness remains parent-owned.

`npm run check` also PASS: no free identifiers,686 linked modules and1487 source assertions. No implementation edits, browser/CAD authoring, ADVANCE or Git operation performed. Report frozen.
