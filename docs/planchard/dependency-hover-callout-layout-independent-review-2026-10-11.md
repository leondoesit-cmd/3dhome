# Dependency hover callout layout — independent review

Read-only2026-10-11. Reviewed frozen `modeler_dependency_ui.js` and shipped callout CSS after parent actualChrome row-shift/mouseleave reproduction. No implementation edits.

Independent `node --test tests/dependency_visualization.test.mjs tests/dependency_tree_presentation.test.mjs tests/readability.test.mjs` **12/12 PASS**. Existing source graph, independent direction controls, actual handler identities, named collapsed endpoints and real SVG arrows plus shipped text floor remain covered. No browser layout-engine claim is inferred from Node mocks.

Reference callouts now append directly to modeler root; fixed positioning removes them from tree/control layout. Persistent Parent/Child controls occupy unchanged panel structure. Callouts are pointer-transparent, bounded width/max-height, wrapped text and hidden when empty. Scroll/resize arrow redraw also updates callout viewport-clamped position. Clearing hover rebuilds empty content/removes arrows without source mutation. No confirmed defect in this finite repair; actual settled browser hover evidence remains parent-owned.

This closes the confirmed presentation mechanism that moved the hovered row, rather than changing graph semantics or adding artificial hover delays. Full source dependency review remains in `full-dynamic-reference-visualization-independent-review-2026-10-11.md`.
