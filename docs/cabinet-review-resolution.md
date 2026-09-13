# Cabinet designer audit resolution — 2026-09-12

The supplied 25-item audit was checked against the working tree. Fixes preserve existing unrelated edits. This is a targeted correctness review, not certification of the complete CAD or manufacturing system.

| Audit item | Resolution |
| --- | --- |
| 1. Partial parameter updates | Omitted/null dimensions retain generated baseline values; generated parameter metadata stays complete. |
| 2. Custom preset resizing | Unknown and blank presets retain their composition and family in resize proposals. |
| 3. Linked dimensions | Propagation stamps the receiving instance's dimensions before rebuilding. |
| 4. Polygon projection | Reads `{x,z}` points rather than tuple indices. |
| 5. Polygon orientation | Corrected reflected plan coordinates and extrusion base height. The reported winding diagnosis was inaccurate; the regression checks bounds, thickness and outward top normals. |
| 6. Polygon texture size | Supplies polygon board width/depth instead of missing box coordinates. |
| 7. Sliding tracks | Generates one cabinet-wide top/bottom track pair. |
| 8. Paired/split door drilling | Records each generated front's envelope and motion unit; emits separate local-coordinate patterns for each hinged leaf/run. |
| 9. Wide lift handle holes | Keeps height/width axes consistent and places horizontal handle patterns within the leaf. |
| 10. Corner carcass drilling | Uses actual corner side board dimensions. The single-bay corner already had no central divider; the incorrect rectangular depths were real. Floating shelves no longer acquire fictitious carcass drilling. |
| 11. Worktop banding | Worktops already belonged to entire runs. Added exposed-return counts per slab so interior slab joints do not receive edge tape. |
| 12. Plinth banding | Uses the exposed long edge before the generic face-board rule. |
| 13. Keyboard listener | Already tied to the cabinet AbortSignal in this checkout; no fix needed. |
| 14. Mobile listeners | Explicitly removes session listeners before reinitialization and on close. Identical callback registrations are already deduplicated by browsers, so the audit's unbounded-accumulation claim was inaccurate. |
| 15. Mobile polling | Clears the interval when the designer closes, even though its host remains mounted. |
| 16. Corner structural controls | Disables column/section structural buttons; guards command paths and paste; suppresses partition-tool targets. |
| 17. Negative distribution | Distributes deficits only across available slack above minima. Impossible layouts remain overfull and produce construction errors instead of negative compartments or false-valid resize choices. |
| 18. Corner door weight | Uses diagonal front width. |
| 19. Corner sag message | Does not apply the rectangular single-span warning to polygon shelves. This is not structural load verification. |
| 20. Corner edge/Gola handles | Spans and centers the handle on the actual diagonal leaf. |
| 21. Shelf split/erase | Uses shelf thickness in inspector actions, drawing-tool previews, insertion and erasing. |
| 22. Floating bay split/erase | Uses zero vertical-divider thickness. |
| 23. Compartment paste | Reserves shelf thickness and preserves the remaining host height; rejects insufficient space before creating history. |
| 24. Shoe shelf elevation | Draws a horizontal front edge. |
| 25. Dimension labels | Uses the same cell bounds as the dimension ticks. |

Additional fixes: System 32 snapping now converts centimetres to millimetres before snapping; divider drilling uses its own board height and datum. Invalid split actions no longer create undo entries. The standalone cabinet QA page now initializes the current lazy-loaded Three.js runtime.

## Verification

- `npm test` final follow-up: 2,430 passed, zero failed/skipped, including the cabinet regression and manufacturing suites.
- Focused cabinet suites: 74 passed.
- Focused browser tests: cabinet inspector/resize/model-editor save, corner geometry/normals, shelf splitting, corner command guards and repeated mobile open/close cleanup.
- `npm run check`: free identifiers, module exports/imports and source assertions pass.
- Real browser standalone cabinet QA: 65 checks passed. Its nesting-dialog integration check reports a skip because that standalone page does not mount the full app UI.

## Manufacturing limits

The manufacturing workflow now includes panel faces, component-level drilling, complete shop-authored recipes and six vertical-drilling export dialects. Generic patterns and shop-authored recipes do not certify hardware fit, structural load or physical machine compatibility. See the linked workflow for exact native-format coverage and qualification limits.


## Follow-up manufacturing work

The [manufacturing review workflow](cabinet-manufacturing-workflow.md) now adds explicit machining faces, component-level front drilling, depth/collision validation and review-labelled exports. Machine and hardware qualification remain dependent on the target shop specifications.
