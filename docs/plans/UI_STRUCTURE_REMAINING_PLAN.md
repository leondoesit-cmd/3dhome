# Plan — what is left of UI_STRUCTURE_BROWSER_PLAN.md

*Updated after the delivery of items A–F, A-rest, Minor, and D-rest. Verified independently: `npm run ci` green at
**295 browser / 1,657 unit**, exit 0, and mechanical mutation audits of all new tests in which
**every mutation was killed**.*

---

## Delivered, and holding

| # | Item | Verified how |
| - | ---- | ------------ |
| **B** | Kanban tree drag now has real pointer tests | the fake `command("move")` test is gone; the new one drives pointerdown/move/up and asserts seams, container highlight, dwell expansion, `.is-dragging` lifecycle and the drop. Breaking the dwell timer, the seam paint, or the inside-highlight each turns it red. |
| **C** | `role="none"` on the tree row wrapper | removing it goes red |
| **A** | File menu contents are layout nodes | the two-node split landed as designed: `menu:file` stays a leaf, `menuitems:file` is a `group` bound to a **runtime slot**, so the binding follows the element when the host portals it to `<body>`. Dropping the slot registration goes red. |
| **D** | `panel:leftTabs` adopted, 4 tab buttons | parity still 7/7, 0 created elements |
| **E** | RTL pin, 44px coarse targets, no-English-in-Hebrew | the harness really does emulate touch (`Emulation.setTouchEmulationEnabled`), so the media query applies; dropping the row height to 24px goes red |
| **F** | Double placement refused | disabling the `alreadyClaimed` guard goes red |
| **Minor** | Drop seam `--uikit-tree-depth` asserted | asserted in `tests/uikit_tree.browser.mjs:625`. Mutating the expected depth turns it red. |
| **A-rest** | Edit and Export menus adopted as slot-bound groups | `menuitems:edit` (6 buttons) and `menuitems:export` (4 buttons) adopted as runtime-slot groups; DOM reorder, body portal, and `escapes: true` tested in `tests/uikit_designer.browser.mjs`. Disabling slots or `escapes` turns tests red (4 mutations killed). |
| **D-rest** | Fourteen ribbon groups with all 76 buttons adopted | all 14 ribbon groups promoted to containers; buttons placed into `.md-command-items` via host-agnostic `node.entry.target` without touching label or 2-row grid. Reorder, `escapes: true`, Hebrew inspector localization, and survival across language `buildDOM()` rebuild tested in `tests/uikit_ribbon.browser.mjs`. 5 mutations tested and killed. |

The portal trap in item A was handled correctly and is worth recording as the pattern: **bind the
container to the element through a runtime slot, never to a DOM position.** That is what makes
`.dropdown-menu` survive being moved to `<body>` on open.

For D-rest, **inner container placement targets (`node.entry.target(el)`)** allow host containers
with inner layouts (such as `.md-command-items` flanked by `.md-command-group-label`) to host adopted
items without breaking host styling or displacing surrounding chrome.

---

## Explicitly not doing

| | Why |
| - | --- |
| `menuitems:history` | app-generated content, not chrome |
| Library, Smart home, Services, Parameters, Warnings, Tree panels | content |
| Properties, Cost, Environment, Collaborators, Site panels | content |
| The `.tb-pill` view/play switchers | one rounded control with dividers; taking it apart gives three naked buttons and no way back |
| Turning `mf_uikit` on | product decision |
| A native Hebrew read of the strings | worth a person, not a test |

The rule that has now survived all rounds: **adopt containers of chrome, not containers of
content.**

---

## Standard

Held across every item: every test gets mutation-checked before it counts.
- Initial audit: 7 of 7 killed.
- A-rest & Minor audit: 5 of 5 killed.
- D-rest audit: 5 of 5 killed (target hook, escapes flag, adopt query, layout container promotion, Hebrew inspection leak).
Total mutations tested and killed: 17 of 17. Full CI: 295 browser / 1,657 unit, 0 failures, exit 0.

