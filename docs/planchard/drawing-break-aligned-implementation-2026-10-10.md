# Aligned principal-view Break implementation — 2026-10-10

Source qualification: supplied PDF 111 / printed 2-25 shows a shortened single view with wavy boundaries and retained original dimensions. PDF 494 / printed 10-14 identifies a single zigzag Break view. Neither page explicitly requires linked projected-view propagation. This extension addresses the requested principal-view workflow quality gap; it does not invent a publisher exercise or claim a completed browser witness.

## Implemented finite scope

- A single ordinary orthographic edge view remains supported. A multi-view cluster starts on its principal Front view. Its width (world X) or height (world Y) Break propagates to all matching ordinary principal projections of the same configuration.
- Front horizontal shortening affects Top, Bottom and Back; Right/Left are end-on and remain unshortened. Front vertical shortening affects Right, Left and Back; Top/Bottom remain unshortened. A secondary Back view reverses the physical interval correctly. First- and third-angle sheet placement both retain physical feature alignment.
- Group metadata stores the common physical interval, original common span, principal/member IDs, resolved fixed scale and each member's direction sign. Each affected view retains its actual original projection bounds and dimensions. The shared projected centre follows a common physical datum. A symmetric conservative layout envelope accommodates unequal silhouettes without replacing actual source/display bounds.
- The ordinary Break form validates a complete plan before one undo/mutation. Editing either an affected member or the principal replaces the whole group; changing X to Y clears the previous group. Remove Break on an affected member removes the complete group in one undo step. The form's stale check covers every view and the native-body token.
- Persisted group membership, source interval, configuration, direction, ordinary-view compatibility and fixed scale are validated. Cache keys include group-relevant drawing changes. Invalid groups emit invalid-break-view diagnostics and do not render misleading unbroken geometry. A legacy single-view Break followed by added projections requires reapplication on the principal.
- Source-space clipping, actual dimension/reference measurements, shared Canvas/SVG output, blank-gap null picking and native geometry immutability remain in place. Inverse mapping now accepts numerically rounded seam points within the existing source tolerance.

Independent sections, Details, Auxiliary views and isometric views do not inherit a Break. A principal derived/cropped/broken-out/exploded/shaded view is rejected. The principal cluster must share a configuration and scale; each shortened projection must retain both ends. Back and other non-Front principal orientations and multi-axis simultaneous groups remain excluded.

## Verification

`node --test tests/drawing_break.test.mjs`: **10/10 passed**. Covers original single-view behavior; source line/circle clipping; true dimensions; gap picking; actual controller apply/remove; first/third-angle six-view propagation; reversed Back; asymmetric silhouettes; native bodies unchanged; cold JSON and shared SVG equality; scale/configuration/derived-view/stale/member-boundary rejection before mutation.

Final broader related drawing run: **100/100 passed** across drawing_break, cad_sheet, drawing_sheet, drawing_crop, drawing_broken_out, drawing_auxiliary, drawing_reference_dimension, drawing_export and cad_drawing_configurations.

`npm run check`: module and link checks pass, **672 modules**; all **1487 source assertions** pass. `git diff --check` clean at handoff.

## Actual browser witness required

1. Reopen an accepted long part with a Front/Top/Right principal drawing cluster, same configuration and fixed scale. Record native part count/history and true overall dimension.
2. Apply a horizontal Break from the Front view with interior source boundaries and a small paper gap. Front/Top must show the same physical omitted interval and corresponding retained features on the same vertical projection lines; Right stays unshortened. Overall dimension remains original.
3. Save/export mforge, SVG and screenshot; hard reload, reopen the exact saved record and compare whole drawing/group metadata plus SVG. Native source geometry must be unchanged.
4. Edit the Break to vertical and verify Front/Right share shortening while Top returns to full height; remove from Right and verify all group members restored in one undo. Exercise Undo/Redo.
5. Optional Back view checks reversed horizontal interval. The source's single-view Break remains a separate accepted witness.

No actual browser model was authored by this agent, no physical/CAD geometry was fabricated, and no ADVANCE edit or commit was performed.


## Normalized-host correction

Independent review reproduced a rejected valid first Front Break: ensureSheetDoc recreates view records during document reads, so object identity was not a stable ownership check. The principal check now compares persistent IDs; the old group is captured before history, and application reacquires live views after pushUndo. A regression runs the actual ensureSheetDoc host with normalization during every read and undo capture. It verifies horizontal application, vertical group replacement, removal from Right, history restore, cold SVG equality and unchanged native-source parts. Final focused 10/10 and broader 100/100 runs include this correction.
