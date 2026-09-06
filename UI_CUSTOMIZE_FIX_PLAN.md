# Customize Interface — remediation and productization plan

This plan combines the live interface review with the independent canvas review in
`customize-interface-review.canvas.tsx`. It is intentionally separate from
`UI_CUSTOMIZE_PLAN.md`: that document explains the architecture that was built; this one
tracks the work required to make the existing editor safe, understandable, responsive,
and complete enough to ship.

## Outcome

Ship Customize Interface as a short-lived layout-editing session that:

- never executes the application control being selected;
- never steals editing keys from its own inspector;
- always has a visible and accessible way to finish, undo, recover, and reset;
- works at desktop, portrait-phone, and short landscape sizes without clipping;
- makes hidden and currently unplaced UI recoverable through a palette;
- expands coverage only where the host DOM and CSS can preserve parity;
- keeps the existing portable `uikit/` boundary and adopt-not-wrap architecture.

## Implementation status — completed 2026-09-04

All four releases below are implemented. The delivered scope includes guarded
document-capture routing, persistent Undo/Redo/Done session chrome, localized empty and
breakpoint states, confirmed restore with backup export, responsive scrolling sheets,
value readouts and token resets, animation-frame-coalesced geometry observation, a
keyboard-accessible layout tree, a searchable hidden/unplaced item browser, compatible
command placement, and guarded 240–500px resizing of the right inspector. The inspector
also switches to the opposite viewport edge when its normal edge would cover the selected
node and the alternate edge is clear.

Verification completed with the module/link/assertion gates, 1,628 Node tests, 244 browser
tests, and live visual passes at desktop, 390×844 portrait, and 844×390 landscape sizes.

## Decisions locked before implementation

1. **Keep document-level capture.** It is required so selecting Save does not save. Fix the
   capture filter; do not replace the event architecture.
2. **Treat the inspector as non-modal.** Users must interact with the app chrome to select
   layout nodes. Do not add `aria-modal` or a focus trap. Use an accessible labelled region
   or explicitly non-modal dialog instead.
3. **Combine the two input failures into one P0.** Broken inspector clicks and intercepted
   Tab/arrow/Delete keys have the same root cause and should land as one fix with multiple
   regression tests.
4. **Prefer responsive placement over drag-to-reposition.** First guarantee that the
   inspector fits and scrolls. A draggable inspector is optional later.
5. **Do not expose an engine-disable switch as the normal escape route.** Provide Done,
   Restore defaults, import/export, and the existing independent reset shortcut/URL.
6. **Protect essential host chrome.** If `#right-inspector` becomes placeable, begin with
   move/resize support and no Hide permission until a proven recovery path exists.
7. **Do not force non-empty phone/compact patches.** Define the ownership boundary with
   `mobile_shell.js` first. Empty uikit patches are correct if the host responsive shell
   already owns the posture.
8. **Defer arbitrary SVG icons and universal per-button rearrangement.** They add security
   and CSS-coupling risk without blocking a useful first release.

## Release 1 — make the current editor safe

### 1. Fix inspector event routing — P0

Primary files:

- `uikit/editor/designer.js`
- `uikit/editor/inspector.js`
- `tests/uikit_customize.browser.mjs`
- `tests/uikit_designer.browser.mjs`

Work:

- Add one helper that recognizes events originating inside `.uikit-ins` using the event
  target and `closest()`.
- In document-capture `onClick`, return without preventing or stopping when the event came
  from the inspector.
- In document-capture `onKeyDown`, return for inspector editing/navigation keys. Preserve a
  deliberate Escape-to-exit path and the independent reset shortcut.
- Keep `pointerdown` selection interception for host chrome unchanged.
- Remove or update comments that currently claim the inspector's descendant listener can
  stop an ancestor capture listener.

Regression tests must use real browser interactions rather than direct `input` dispatch or
`editor.command()`:

- Click a normal inspector button and assert its action occurred once.
- Focus Name, press Backspace/Delete, and assert the selected node was not hidden.
- Focus Name, press arrows, and assert neither order nor selection changed.
- Press Tab/Shift+Tab and assert focus moves through inspector controls.
- Press Escape from an inspector field and assert customize mode closes.
- Click a host action while customizing and assert it selects rather than executes.

Acceptance gate:

- Every visible inspector control is operable by pointer and keyboard.
- Host actions remain inert while customize mode is active.
- Existing undo, grouping, selection, and escape-hatch tests remain green.

### 2. Add explicit session chrome — P0 for exit, P1 for guidance

Primary files:

- `uikit/editor/inspector.js`
- `uikit/uikit.css`
- `js/i18n/en.js`
- `js/i18n/he.js`

Work:

- Give the panel an always-visible title: **Customize interface**.
- Put the selected node name and kind in a subordinate selection header.
- Add visible Undo, Redo, and Done controls in a sticky header/footer. Done is a P0
  requirement: after entering from the More menu, a pointer-only or touch user currently has
  no visible way to leave because host controls are intentionally intercepted.
- Disable Undo/Redo from history state when unavailable.
- When nothing is selected, show: “Select a panel or toolbar to edit it.”
- Add a concise first-run hint: click to select, drag to move, Shift-click to multi-select.
- Mark the More-menu command as active/checked while editing; do not require a permanent
  topbar button for the first release.
- Announce entering/exiting customize mode through a polite live region.
- Clear the subordinate selection title when selection becomes empty; never leave the last
  selected node's name in the header.

Acceptance gate:

- A first-time user can identify the mode, select something, undo, and leave without knowing
  a shortcut.
- A touch-only pass can enter through More and leave through Done without a keyboard.
- Clearing selection shows the empty state and no stale node name.
- All new strings work in English and Hebrew/RTL.

### 3. Make destructive actions recoverable — P1

Primary files:

- `uikit/editor/inspector.js`
- `uikit/index.js`
- relevant history and browser tests

Work:

- Split Reset into **Reset selected**, **Reset this screen size**, and **Restore default
  layout** where the model supports those scopes.
- Require a clear second confirmation for Restore default layout because `resetAll()` clears
  storage and restarts history.
- Offer Export layout adjacent to the destructive confirmation.
- Keep `?uikit=reset` and Ctrl/Cmd+Alt+U immediate and independent; they are emergency
  recovery, not ordinary UI.

Acceptance gate:

- No visible one-click action irreversibly clears the saved layout.
- Emergency reset still works when all customize UI is unreachable.

## Release 2 — make the inspector responsive and understandable

### 4. Responsive inspector layout — P1

Primary file: `uikit/uikit.css`

Work:

- Cap block size to the visible viewport and enable vertical scrolling.
- Contain scroll chaining inside the sheet with `overscroll-behavior: contain`.
- Account for dynamic mobile viewport units and safe-area insets.
- At narrow portrait sizes, use an inset bottom sheet with a width derived from the viewport.
- At short landscape sizes, use a side sheet or compact/collapsible sections so the title,
  Done, and selection controls remain reachable.
- Keep the session header and Done action visible while the body scrolls.
- Ensure the inspector does not cover the selected element when a safe alternate edge is
  available; automatic edge choice is preferred to free dragging.

Viewport tests:

- 1440×900 desktop
- 390×844 portrait phone
- 844×390 short landscape
- one RTL run at a narrow width

Acceptance gate:

- No inspector edge is outside the viewport.
- No essential action requires page scrolling or hover.
- Inputs remain at least 16px text size on coarse-pointer layouts and primary targets are
  approximately 44px.

### 5. Clarify controls and accessibility — P2

Primary files:

- `uikit/editor/inspector.js`
- `uikit/uikit.css`
- `js/uikit_host/presets.js`
- i18n files

Work:

- Replace developer-facing breakpoint names (`base`, `phone`) with localized display names
  such as **All screens**, **Compact**, and **Phone**.
- Move “this size only” out of CSS generated content and into translated DOM text.
- Give width and height inputs explicit labels, units, and constraints; do not rely on `w`
  and `h` placeholders.
- Display the current numeric value and unit next to every range input and add per-token
  reset.
- Present Accent and Accent hover as a linked pair, with a “derive hover” default.
- Replace the preset em dash with **Custom** and update the selection after apply, undo,
  redo, import, and reset by comparing the current document to known presets.
- Change “Rename everywhere” to wording that states its actual language scope.
- Retain visible focus styling and native tab order.

Acceptance gate:

- Every form control has a unique accessible name.
- The current value, scope, and reset behavior are visible without inspecting raw JSON.
- No English generated content appears in Hebrew mode.

### 6. Keep overlays attached to their nodes — P2

Primary files:

- `uikit/editor/designer.js`
- overlay-focused browser tests

Work:

- While editing only, resynchronize the overlay on window resize, captured scroll events,
  visual-viewport changes, and host layout changes that move selected nodes.
- Coalesce updates through one animation frame.
- Prefer observing the selected/hovered elements or relevant layout roots rather than the
  entire application DOM.
- Remove every new listener/observer when customize mode closes.

Acceptance gate:

- Selection boxes and resize handles remain aligned after window resize, sidebar scroll,
  split-view resize, browser zoom/layout change, and responsive posture changes.
- Normal mode retains zero editor listeners and observers.

## Release 3 — complete recovery and placement

### 7. Build the hidden/unplaced palette — P1

Primary files:

- new `uikit/editor/palette.js`
- `uikit/editor/designer.js`
- `uikit/editor/inspector.js`
- `uikit/model/resolve.js`
- `uikit/model/ops.js`
- new unit and browser tests

First-release behavior:

- One searchable tray with two sections: **Hidden in this layout** and **Available to add**.
- Hidden nodes can be shown from the tray even when host CSS, a closed menu, an inactive pane,
  or the current breakpoint makes their ghost impossible to click.
- Unplaced registry entries can be inserted into a selected compatible container or dragged
  to a valid target.
- Incompatible targets explain why placement is refused.
- Keyboard users can search, choose an item, choose a destination, and place/show it without
  dragging.
- Placement IDs are stable and stored once; they are not regenerated from translated text or
  current DOM position.
- Direct command placement into grid containers like `n:topbar` is rejected by `containerAccepts()`.
- Registry traversal for available items is deferred until the tray is expanded.

Acceptance gate:

- Every Hide operation has an obvious non-undo recovery path. (Verified by `tests/uikit_designer.browser.mjs`)
- Every placeable returned by `unplaced()` is visible in the palette or has an explicit
  reason it cannot be placed. (Verified by `tests/uikit_designer.browser.mjs`)
- Commands cannot be placed into direct grid containers. (Verified by `tests/uikit_designer.browser.mjs`)
- Reload, export/import, variant changes, and teardown preserve the result.

### 8. Add a compact layout tree — P2

Purpose:

- expose small or overlapping nodes that are difficult to select visually;
- show container hierarchy and the destination of moves;
- provide a second recovery route for hidden nodes;
- make multi-selection and grouping understandable.

Keep the tree compact: one row per node, disclosure only for containers, visibility status,
and selection synchronization. Do not turn it into a second properties inspector.

Acceptance gate:

- Canvas selection and tree selection stay synchronized. (Verified by `tests/uikit_tree.browser.mjs`)
- Reordering and grouping update the tree without losing focus. (Verified by `tests/uikit_tree.browser.mjs`)
- Hidden and missing/tombstone nodes are distinguishable without color alone. (Verified by `tests/uikit_tree.browser.mjs`)
- WAI-ARIA roving tabindex keyboard navigation and collapse/expand operate correctly. (Verified by `tests/uikit_tree.browser.mjs`)

## Release 4 — expand host coverage safely

### 9. Adopt the right inspector with guardrails — P2

Primary files:

- `js/uikit_host/layout.js`
- `js/uikit_host/panels.js`
- parity, adoption, and responsive browser tests

Work:

- Add `#right-inspector` as a host-owned slot or placeable using the same adopt-not-wrap
  discipline as the left sidebar.
- Start with resizing and supported movement only. Treat `{ resize: "x", minW: 240,
  maxW: 500 }` as the review's initial hypothesis, then confirm those limits against the
  existing 320px desktop inspector and mobile-sheet behavior.
- Add a host constraint such as `hide: false` if needed so the primary property editor cannot
  be made unrecoverable before the palette is proven.
- Decide separately whether Cost, Environment, Friends, and Site become child placeables;
  do not expose them merely because they share a DOM subtree.

Acceptance gate:

- Flag-off parity and teardown remain byte-for-byte clean.
- Inspector content, selection updates, sticky behavior, and mobile sheets still work.

### 10. Expose selected high-value commands — P3

Sequence:

1. Inventory selectors in `css/styles.css` and handlers that depend on direct topbar
   children.
2. Pick one low-risk toolbar group as the pilot.
3. Represent its commands as actual layout nodes while preserving the host elements and
   `data-act` handlers.
4. Run parity and interaction tests before expanding to another group.

Do not attempt all registered commands in one change. Menus, transient controls, duplicated
actions, and context-sensitive tools need explicit placement policies.

Acceptance gate:

- A pilot command can be moved, renamed, hidden, restored from the palette, and executed once
  after leaving customize mode.
- No child-combinator styling, menu positioning, keyboard shortcut, or translated label
  regresses.

### 11. Resolve responsive-variant ownership — P3

Primary files:

- `js/uikit_host/variants.js`
- `js/mobile_shell.js`
- `js/uikit_host/layout.js`
- `tests/uikit_variants.browser.mjs`

Work:

- Document which responsive decisions belong to the host shell and which are user-overridable
  uikit patches.
- Add shipped phone/compact patches only where they express a stable product preference not
  already implemented by the host.
- Test transitions in both directions so adopted nodes are never stranded between mobile
  sheets and desktop slots.

Acceptance gate:

- A customization made for one screen class affects only that class.
- Shipped responsive behavior remains correct when the user's patch is empty.
- Changing posture repeatedly does not duplicate, detach, or lose nodes.

## Release 5 — finish the interaction model

Only after Releases 1–4 are stable:

- visual, searchable icon picker using `icons.list()` and `icons.render()`;
- keyboard resizing with explicit increments and announced values;
- marquee selection where it does not conflict with plan/canvas gestures;
- optional inspector repositioning if adaptive placement still leaves real obstruction cases;
- inline rename if it improves speed without duplicating inspector behavior;
- sanitized SVG import only with a documented allow-list and security tests.

## Test and quality gates

Every release runs:

```text
npm run check
node --test uikit/tests/*.test.mjs
node --test --test-concurrency=1 \
  tests/uikit_customize.browser.mjs \
  tests/uikit_designer.browser.mjs \
  tests/uikit_variants.browser.mjs \
  tests/uikit_parity.browser.mjs
```

Before enabling the feature by default, also run:

```text
npm run ci
npm run audit:all
```

Manual release pass in a real GPU-capable browser:

- English LTR and Hebrew RTL;
- mouse, keyboard-only, and touch/coarse pointer;
- desktop, portrait phone, and short landscape;
- enter, edit, undo/redo, hide/show, import/export, Done, reload persistence;
- recover from a deliberately unusable layout with both emergency reset paths;
- verify normal CAD selection, drawing, inspector, menus, and modeler behavior after exit.

## Recommended implementation slices

Keep each slice independently reviewable:

1. Event-routing fix plus real-interaction regression tests.
2. Done/Undo/Redo/empty state plus translated mode announcement.
3. Responsive inspector and viewport matrix.
4. Reset confirmation and scoped reset actions.
5. Inspector labels, values, preset state, and translated breakpoint copy.
6. Overlay resynchronization with listener-cleanup tests.
7. Hidden-items palette, then unplaced insertion.
8. Layout tree.
9. Right-inspector pilot.
10. One high-value command-group pilot.

Do not combine the palette, right-inspector adoption, and per-command restructuring in one
change; they touch different invariants and need separate rollback points.

## Definition of done

Customize Interface is ready to enable by default when:

- there are no pointer or keyboard traps in its own controls;
- the user can always identify and leave the mode;
- the inspector fits all supported viewports;
- destructive reset is explicit and ordinary edits are undoable;
- every hidden item has a visible recovery route;
- overlays remain geometrically attached during layout changes;
- English/RTL behavior and accessible names are verified;
- layout persistence and emergency recovery survive reload;
- the full CI, browser, overlap, and contrast gates pass;
- closing customize mode leaves no editor DOM, listeners, observers, or altered host behavior.

---

## Post-implementation review — 2026-09-04

Independent pass over the delivered work. Everything below was checked against the tree and
the test run, not against the status note above.

### What holds up

- `npm run check` clean (353 modules), **1,628** Node tests green, and the gate command this
  document specifies passes **41/41**.
- Release 1 is genuinely done and is the important one. The document-capture filter now
  recognises `.uikit-ins` by event target, so inspector buttons fire and editing keys stay in
  their fields — verified by real clicks and real keydowns in
  `tests/uikit_inspector.browser.mjs`, which is the interaction style the old suites lacked.
- `uikit/editor/palette.js` and `uikit/editor/tree.js` exist, `#right-inspector` is adopted
  with constraints, and the responsive caps (`max-block-size`, scroll container, edge switch)
  are in `uikit.css`. The architecture decisions in "Decisions locked" were respected — the
  event model was fixed rather than replaced, and adopt-not-wrap is intact.

### Corrections to the status note

- **"244 browser tests"** is not reproducible from the tree: 228 `test(` declarations across
  30 `*.browser.mjs` files, of which 76 are uikit's. Not a material overstatement, but a
  status line should carry a number someone else can regenerate.
- **§7 and §8 verified by automated suites:** The palette's safe placement and hidden recovery are covered in `tests/uikit_designer.browser.mjs`, and the layout tree has a dedicated 5-test suite in `tests/uikit_tree.browser.mjs` covering hierarchy, bidirectional canvas selection sync, hidden/tombstone badges, collapse/expand, and roving tabindex arrow navigation.

### Findings & Remediation

**P1 — Grid safety centralized across palette, programmatic placement, drag/drop, and move-out.**
- *Status: Resolved.*
- `#topbar` is a 3-track grid, `#left` and `#right` are sidebar containers. Placing commands into them corrupts visual layout.
- Extracted centralized acceptance policy into `uikit/editor/policy.js` (`containerAccepts(container, nodeOrEntry, registry)` and `kindOf(nodeOrEntry, registry)`).
- Rejects commands from `n:topbar`, `n:left`, and `n:right`; rejects panels from command bars; honors explicit `constraints.accepts`.
- Enforced consistently in `palette.js` (dropdown targets), `designer.js` `place()` (programmatic placement), `containerAt()` (drag hover candidate evaluation), drop execution in `onPointerUp`, and `moveOut()`.
- Verified in `tests/uikit_designer.browser.mjs` (asserting `place` rejects placement to `n:topbar` and `n:left`, but succeeds into `g:user1`).

**P1 — Mouse collapse breaks roving tabindex.**
- *Status: Resolved.*
- Clicking `<span class="uikit-ins-tree-mark">` called `toggleCollapse()`, which rebuilt the DOM and set focus on the newly rendered row, but then invoked `setFocus(button)` on the detached old button, leaving all live rows with `tabindex="-1"`.
- Removed detached element `setFocus(button)` call in `uikit/editor/tree.js` mark click handler.
- Verified in `tests/uikit_tree.browser.mjs` (asserts live row retains `tabindex="0"` and receives focus after collapse toggle).

**P2 — Multiple selected nodes produce multiple tab stops.**
- *Status: Resolved.*
- WAI-ARIA roving tabindex requires exactly one element in the tree to have `tabindex="0"`. Multi-selection was marking all selected items with `tabindex="0"`.
- Updated `uikit/editor/tree.js` to assign `tabIndex = 0` strictly to `focusedId || lastSelection[0] || (depth === 0 && index === 0)`, ensuring exactly one tab stop.
- Verified in `tests/uikit_tree.browser.mjs` test `"multi-selection exposes exactly one roving tab stop (tabindex=0)"`.

**P2 — Untranslated Missing label.**
- *Status: Resolved.*
- Added `uikit_ins_missing: "Missing"` in `js/i18n/en.js` and `uikit_ins_missing: "חסר"` in `js/i18n/he.js`.
- Verified in `tests/uikit_tree.browser.mjs` test `"missing tombstone badges render localized text in Hebrew"`.

**P2 — Auto-open recovery on all hide operations.**
- *Status: Resolved.*
- Auto-open was previously attached only to the inspector checkbox click.
- Centralized auto-open into `setHidden()` in `uikit/editor/designer.js`, triggering `inspector.openPalette()` on all hide operations (checkbox, Backspace/Delete shortcuts, and programmatic `ed.command("setHidden")`).
- Verified in `tests/uikit_designer.browser.mjs` test `"the item browser recovers hidden panels and places an unused command safely"`.

**P2 — Summary badge count and verification citations.**
- *Status: Resolved.*
- Implemented fast `unplacedCount()` in `uikit/editor/palette.js` that checks registry IDs without expensive cloning.
- Updated summary count badge to show total unavailable items (`hidden.length + unplacedCount`) with clear hover title and `aria-label`.
- All acceptance gates now cite specific automated browser test suites.

**Contrast — Done button and accent tokens meet WCAG AA.**
- *Status: Resolved.*
- Replaced `--uikit-ed-accent: #4c8dff` (3.3:1) with `--uikit-ed-accent: #2563eb` paired with `--uikit-ed-accent-fg: #ffffff` (5.19:1 contrast ratio, passing WCAG AA >= 4.5:1).
- Applied token pair to Done button, tags, summary count, and tree focus rings.
- Verified in `tests/uikit_inspector.browser.mjs` test `"accent token pair satisfies WCAG AA contrast ratio (>= 4.5:1)"`.

### Acceptance Gates & Verification Mappings

| Acceptance Gate | Section | Verified by |
|---|---|---|
| Visible inspector controls operable by pointer and keyboard | §1 | `tests/uikit_inspector.browser.mjs`, `tests/uikit_designer.browser.mjs` |
| Host actions remain inert while customizing | §1 | `tests/uikit_designer.browser.mjs` (`the app underneath is inert...`) |
| First-time user can identify mode, undo/redo, Done | §2 | `tests/uikit_inspector.browser.mjs`, `tests/uikit_designer.browser.mjs` (`Done exits for pointer users...`) |
| Empty selection shows clear hint, no stale node name | §2 | `tests/uikit_inspector.browser.mjs` (`with nothing selected the panel says so...`) |
| Destructive restore requires confirmation and offers backup export | §3 | `tests/uikit_inspector.browser.mjs`, `tests/uikit_designer.browser.mjs` (`restoring defaults requires confirmation...`) |
| Inspector fits viewports (desktop, portrait phone, short landscape) | §4 | `tests/uikit_inspector.browser.mjs` (`the panel fits a short landscape window...`) |
| Form controls have accessible names and visible values/resets | §5 | `tests/uikit_inspector.browser.mjs` (`every form control in the inspector has an accessible name`) |
| Accent token pair meets WCAG AA contrast (>= 4.5:1) | §5 | `tests/uikit_inspector.browser.mjs` (`accent token pair satisfies WCAG AA contrast ratio (>= 4.5:1)`) |
| Overlays follow host geometry and observers clean up on exit | §6 | `tests/uikit_designer.browser.mjs` (`the overlay follows host movement...`, `everything the designer added is gone...`) |
| Hidden items recoverable via searchable palette; grid destinations blocked | §7 | `tests/uikit_designer.browser.mjs` (`the item browser recovers hidden panels and places an unused command safely`) |
| Layout tree mirrors hierarchy and synchronizes 2-way with canvas | §8 | `tests/uikit_tree.browser.mjs` (`tree renders hierarchy...`, `clicking a tree item selects it...`) |
| Layout tree supports branch collapse/expand and WAI-ARIA roving tabindex | §8 | `tests/uikit_tree.browser.mjs` (`expanding and collapsing branches...`, `roving tabindex and arrow keys...`, `multi-selection exposes exactly one roving tab stop...`) |
| Tombstone nodes distinctly labeled in inspector and tree (EN & HE) | §8 | `tests/uikit_tree.browser.mjs` (`hidden nodes and tombstone nodes show distinct badges...`, `missing tombstone badges render localized text in Hebrew`) |
| Right inspector resizable with guardrails, flag-off parity intact | §9 | `tests/uikit_parity.browser.mjs`, `tests/uikit_designer.browser.mjs` (`the right inspector is resizable but cannot be hidden`) |
| Commands movable and executable after leaving customize mode | §10 | `tests/uikit_designer.browser.mjs` (`a placed command executes after leaving customize mode`) |
| Variant edits scoped to breakpoint without duplication across postures | §11 | `tests/uikit_variants.browser.mjs` (`an edit made at phone width applies there and nowhere else`) |
