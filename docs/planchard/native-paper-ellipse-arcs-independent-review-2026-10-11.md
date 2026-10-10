# Paper ellipse arcs — independent review

Read-only review, 2026-10-11. Independent `node --test tests/drawing_paper_ellipse.test.mjs tests/drawing_primitives.test.mjs tests/drawing_paper_arc.test.mjs`: **26/26 PASS**. Owner reports module/link686 and assertions1487 PASS; no production edits by reviewer.

No confirmed defect in finite native-paper scope. Reviewed geometry, exact arc-extrema validation, numerical hit selection, Canvas and SVG integration, ordinary editor and normalized-history/cold tests. Optional degree angles default0/360 preserve old full ellipses. Nonzero finite sweeps of magnitude<=360 are required. The parameter angles are local ellipse angles:0 along positive major semi-axis,90 along positive minor semi-axis; increasing angles appear clockwise in paper Y-down coordinates.

Rotated coordinate extrema are derived analytically and checked only where they lie on the chosen arc, alongside endpoints. Hit minimization is restricted to that sweep and includes endpoint distances, so the complementary ellipse is not selected. Canvas passes matching start/end/anticlockwise arguments. Full ellipse remains actual SVG ellipse; partial ellipse is a native elliptic A command with rotation, large-arc and sweep flags matching stored geometry. No sampled outline or circular surrogate.

New tests cover half-ellipse opposite-side exclusion, SVG/Canvas agreement, reversed/wrapped/major sweeps and rotated arc bounds. Actual controller angle edits survive normalization, Undo/Redo and cold SVG with source CAD unchanged. This is implementation acceptance, not the parent's source PDF94 cylinder worksheet browser acceptance.
