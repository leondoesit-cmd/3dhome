# Principal-view caption and overall-dimension clearance

The actual first-angle BRACKET cold screenshot showed the FRONT caption at the upper edge of TOP geometry. The automatic 20 mm width dimension occupies the same inter-view gap: its signed paper offset is -12 mm, and the caption is deliberately rendered beneath its annotations. Geometry-only overlap checks therefore passed while visible ink collided.

Source observation: `artifacts/planchard/BRACKET-seven-view-cold-browser-2026-10-11.png` and its genuine `.mforge`. Read-only source extents are X 0..2, Y 0..9, Z -2.25..2.25 cm; all seven views have null manual positions/scales. The source overall width and height offsets are -12 and +12 mm respectively. Protected artifacts were not modified.

## Bounded repair

`js/cad_sheet.js` reserves vertical paper bands for principal captions and automatic horizontal extent dimensions. Negative horizontal offsets reserve below; positive offsets reserve above. The lower caption follows that outward dimension band. Aligned vertical spacing takes the larger of the existing geometric gap and the neighboring annotation bands plus clearance. Fit accounting includes the outer bands as well, so placement and fit use the same reservation.

This is a conservative paper reserve from the geometry outline, not an exact bound for every possible dimension-reference midpoint. The existing standard-scale chooser is retained; there is no custom scale multiplier or deleted view. Explicit manual coordinates remain authoritative. Manually placed dimension runs do not trigger this new automatic extent-band repositioning, preserving ongoing dimension interaction. Oversized forced-scale drawings without automatic dimensions retain their prior best-effort fallback.

The finite repair addresses aligned principal captions and automatic horizontal overall dimensions. It does not newly establish arbitrary note/balloon, floating-view or every possible manually positioned annotation collision avoidance.

## Verification

- `node --test tests/cad_sheet.test.mjs`: **66/66 PASS**, zero skipped, exit 0. Log: `scratch/planchard/drawing-annotation-clearance-2026-10-11.log`.
- `npm run check`: exit 0; no free identifiers, **691 modules / 1487 source assertions PASS**. Log: `scratch/planchard/drawing-annotation-clearance-gates-2026-10-11.log`. Owned diff check clean.
- New regression uses actual BRACKET extent/overall-offset values with all seven views in both projection angles and both horizontal offset signs. It checks rendered caption/dimension items against other view geometry, positive upper-band clearance, alignment, no authored document mutation and retained explicit manual placement. Existing forced-scale/title-block and dimension-run regressions also pass.
- Independent `theory_answers` review reran **66/66 PASS** and found no confirmed defect; see `drawing-principal-annotation-clearance-independent-review-2026-10-11.md`. Actual ordinary Chrome re-layout/visual acceptance is parent-owned and pending at this report's implementation checkpoint.

Ordinary browser check: reopen the BRACKET seven-view drawing, choose **Re-lay out views**, and inspect the FRONT caption/width dimension above TOP in first angle, then the corresponding below/above spacing in third angle. Preserve all seven views and export/save/cold-reopen the accepted drawing.
