# Cabinet designer review

Reviewed September 10, 2026. Scope: cabinet composition, resizing, history, desktop and phone layouts, and the advanced cabinet manufacturing adapter. This is a review; no application code was changed.

## Fixes in priority order

### 1. P1 — Desktop inspector collapses to zero height

**Observed in the browser at 1280 × 720.** The right panel is 554 px tall, the preview takes 276 px, and the navigation groups consume the remaining space. The `.cb-tabs.cb-fill` editing region has a measured height of **0 px**, starts at y=739, and is clipped by its parent. Compartment controls exist in the DOM but cannot be reached by ordinary scrolling inside the panel.

This blocks everyday changes to shelves, drawers, column widths, and doors in the default 2D workspace. The 390 × 844 phone Properties sheet exposes these controls, so the failure is particularly associated with the desktop arrangement.

**Fix:** Give the active editor a guaranteed usable area. Cap or collapse the preview on short windows, reduce the navigation groups to compact tabs, and let the appropriate panel region scroll. Avoid nesting a zero-height scrolling pane inside an overflow-hidden parent. Keep the selected compartment controls above export actions.

**Sources:** `css/styles.css:9145`, `css/styles.css:9153`, `css/styles.css:9261`, `js/ui_cabinet_view.js:1497`.

**Acceptance:** At 1280 × 720 and 1366 × 768, a user can select a compartment, change its type/count/height, and edit its door without switching to 3D or resizing the browser. Verify actual visible control bounds, not only DOM presence.

### 2. P1 — Resize recommendations can remain invalid

**Reproduced in Node and the browser.** Set a Classic wardrobe's depth from 60 cm to 20 cm. The proposal warns that drawers need at least 30 cm of inside depth and hanging needs 55 cm, but still offers an enabled recommended configuration that retains both errors. A 300 cm height under a 280 cm ceiling similarly produces a recommendation that is still too tall.

`requestCabinetDimension()` validates the existing layout at the requested size but never validates the generated recommendation. `applyCabinetDimension()` accepts that recommendation without a final validity check. The out-of-range clamp branch also creates a proposal without validating its resulting layout.

**Fix:** Validate every candidate, including clamped sizes, against construction and room constraints. Offer valid candidates, or explain that no valid configuration is available. Separate advisory warnings from hard errors. If invalid designs are intentionally allowed, label that action explicitly rather than presenting it as a valid repair.

**Sources:** `js/parametric_cabinet.js:225`, `js/parametric_cabinet.js:237`, `js/parametric_cabinet.js:249`, `js/parametric_cabinet.js:268`.

**Acceptance:** Every recommendation presented as valid passes the same hard-error checks after application. Cover shallow hanging/drawer units, excessive height, clamped requests, and valid custom layouts.

### 3. P1 — Revert and local undo leave linked copies resized

**Reproduced through the actual adapter functions and the same restoration sequence used by Revert.** Two cabinets share a definition and start at 120 cm wide. Resize one to 130 cm: both become 130 cm. Restore the edited cabinet's opening snapshot and propagate: the edited cabinet returns to 120 cm, while the linked copy remains 130 cm.

Dimension application explicitly changes sibling dimensions. Designer history and Revert only snapshot/restore the active cabinet. Their subsequent synchronization copies the cabinet specification while preserving each sibling's current dimensions, so it cannot undo the earlier dimension propagation.

**Fix:** Treat an edit affecting linked instances as a single transaction. Snapshot and restore all affected instances and the shared definition, or keep dimensions instance-specific and stop propagating them. Make the editing scope visible: “This cabinet” or “All linked cabinets.”

**Sources:** `js/parametric_cabinet.js:276`, `js/ui_cabinet.js:620`, `js/ui_cabinet.js:660`, `js/ui_cabinet.js:757`.

**Acceptance:** Resize → undo → redo → revert restores both cabinets and their parameter overrides consistently, including linked instances that began with different dimensions.

### 4. P1 — Advanced sheet nesting accepts oversized panels

**Reproduced directly in Node.** `cabinetSheetNesting()` accepts a classified 400 × 100 cm panel and places it at (0,0) on a 280 × 207 cm sheet. It returns an empty `unplaced` list.

After a width overflow, the algorithm moves to the next row but does not recheck whether the panel itself exceeds the sheet width. Its placement condition only checks height. This finding concerns the advanced cabinet manufacturing adapter; it is separate from the regular nesting engine covered by the existing cabinet layout tests.

**Fix:** Check both dimensions in each orientation before placement; report oversized parts as unplaced. Include unplaced parts in manufacturing readiness. Prefer sharing the established nesting engine so stock, thickness, grain, kerf, and material grouping follow one implementation.

**Source:** `js/core/cabinet_advanced.js:38`.

**Acceptance:** Every placement remains within the sheet boundaries and does not overlap another placement. Oversized panels remain unplaced and prevent a complete manufacturing result.

### 5. P2 — Resize dialog leaves keyboard focus behind the overlay

**Observed in the browser.** Enter a depth of 20 cm and press Enter. The configuration dialog opens, but focus remains on `#cbD`, outside the dialog. The dialog has `aria-modal=true`, yet its opening code neither moves focus nor traps it. The triggering input's Enter handler also explicitly reselects that input.

**Fix:** Move focus into the dialog, contain keyboard navigation, make the background inert while it is open, and restore focus to the dimension input on close. Make preset cards real keyboard-operable buttons as well; currently they are clickable divs.

**Sources:** `js/ui_cabinet.js:200`, `js/ui_cabinet.js:428`, `js/ui_cabinet_inspect.js:155`.

**Acceptance:** A keyboard-only user can open, inspect, choose, and dismiss a proposal without visiting background controls. Presets can be selected using Tab and Enter/Space.

## Product improvements

- **Keep selection central.** Show a short breadcrumb such as “Cabinet → Column 2 → Compartment 3,” with clear width/height/depth and the most relevant actions beside it. Shorten “The selected compartment or column” to “Properties.”
- **Make checks actionable.** Selecting a warning should highlight the exact affected compartment and open the relevant property. Offer specific repairs such as increasing depth, splitting an excessive span, or replacing a compartment type, with a preview before applying.
- **Clarify preset replacement.** Show a small visual thumbnail, the suggested dimensions, and what will change before replacing a custom layout. Distinguish replacing the entire design from filling only the selected column.
- **Separate layout from presentation controls.** Keep partition tools near the drawing; move less-used camera angles and opening stages into compact menus. Preserve the phone's accessible Properties sheet while improving icon labels and orientation cues.
- **Show resize consequences.** Explain which dimensions remain fixed, which compartments redistribute, and whether linked cabinets are affected. Include a before/after layout and price change where useful.
- **Unify manufacturing output.** Advanced edits, the visible model, checks, bill of materials, stock nesting, and price should describe the same final assembly. Surface incomplete manufacturing status in the designer and exports.

## Verification and limits

- `npm run check` passed on the current workspace: no free identifiers, no module-link errors (416 modules), and source assertion checks passed.
- Both cabinet test files passed: **26/26 tests**.
- Browser inspection covered a populated wardrobe, invalid resize proposal, desktop geometry, and the phone Properties sheet at 390 × 844. A real browser rendered the cabinet preview.
- Direct reproductions confirmed invalid recommendations, linked-copy restoration drift, and oversized advanced nesting.
- The full application test suite and exhaustive device/assistive-technology coverage were not run.
- Many designer tests assert source patterns. Add behavioral regression tests for these specific failures; passing source checks currently does not demonstrate correct editing or manufacturing behavior.

Suggested implementation order: restore desktop editing access; fix resize validation and linked-instance transactions; fix advanced nesting; then improve keyboard flow and the selection-focused interface.

## Implementation follow-up

The five confirmed defects above are fixed. Desktop properties remain scrollable; resize alternatives are construction-validated (including clamped requests); dimensions belong to the edited instance while linked layouts and session undo/revert restore consistently; advanced sheet placement checks both dimensions, rotation, stock grouping and overlap; resize dialogs contain focus and presets are keyboard-operable buttons.

Cabinet geometry now imports into the model editor as native editable features. Overall dimensions and board, shelf, back, plinth and front-clearance parameters regenerate the semantic cabinet before the feature graph rebuilds. Cabinet coordinates and cylinder directions are preserved, including corner profiles and zero-thickness open backs. Added features, suppression history and authored panel offsets survive regeneration and saving. Duplicate history targets are normalized once. Saved dimensions also refresh the planner inspector.

The designer includes selection breadcrumbs, clickable checks, preset layout thumbnails and replacement dimensions, explicit editing scope, and a preview sized to its panel. Edited board envelopes feed the designer's bill of materials. Complex edits that the manufacturing adapter cannot fully classify are explicitly marked as partial estimates in the designer, cut plan, CSV and quotation.

Verification added: 14 behavioral cabinet regressions and a browser test covering inspector access, invalid resize focus, editable parameter controls, actual geometry resizing, and save persistence. All preset families rebuild through the native model-editor path. The focused cabinet/authoring/history run passed 61 tests; the desktop model-editor browser suite passed 36 tests. Real GPU browser inspection confirmed cabinet rendering and save/reopen with a changed width. Full-suite verification is recorded in the task's final response.

Final full Node run: **2,199 passed, 0 failed** using concurrency 2. The four failures in the earlier highly concurrent run also passed when rerun separately. Final cabinet browser regression: **1 passed**; desktop model-editor browser suite: **36 passed**. Module/link gates and source assertion checks passed; `git diff --check` is clean.
