# UI editor bug review

Reviewed the 25 findings in the supplied audit against the working tree on 2026-09-12. Implemented fixes or defensive improvements for 23 findings. Findings 10 and 16 describe existing intended behavior and were left unchanged.

| # | Finding | Result |
|---|---|---|
| 1 | Floating size reset ignores rect | Fixed: size and rect overrides reset together in one undo step. |
| 2 | Height-only resize hides reset | Fixed: reset lives in the visible dimension row. |
| 3 | Floating dimensions read/write size | Fixed: inspector reads rect and edits its dimensions, retaining x/y and enforcing constraints. |
| 4 | Shared rename loses to instance label | Fixed in inspector and rename command: selected instance inherits app text; a responsive edit explicitly overrides an inherited base label with null. Other instances retain deliberate local names. |
| 5 | Move out targets leaves | Fixed with the schema container predicate. The audit's suggested children-array check is insufficient because resolved leaves also have children arrays. Empty containers remain eligible. |
| 6 | Tree keys hijack child controls | Fixed: nested controls retain native keyboard handling. |
| 7 | Escape exits editor with picker open | Fixed: open picker owns Escape regardless of focus location. Normal opening already focuses search; the failure needs focus to move elsewhere without dismissing it. |
| 8 | Negative unconstrained drag dimensions | Fixed: default minimum is one pixel. Explicit host bounds remain authoritative. Inspector numeric editing also applies this minimum. |
| 9 | Palette exposes internal IDs | Improved fallback includes registry entry title, including when a custom title callback returns nothing. |
| 10 | No explicit default destination | Not a bug: a normal single-select selects the first enabled option when no preferred match exists. No change. |
| 11 | Float rejects generic panels/groups | Fixed: float accepts panels and containers; explicit host policies still take precedence. |
| 12 | Public wrapper lookup throws | Fixed: public compatibility method delegates to renderer.elementFor. This renderer deliberately has no wrapper elements. |
| 13 | Missing override buckets throw | Hardened token/text operations and optional variant lookup. Normalized documents already contain override buckets. |
| 14 | Wildcard text cannot be reset | Fixed at the inspector: reset the exact-language override if present, otherwise the wildcard override. Model resetText retains explicit language scoping. If both exist, the first reset reveals the wildcard and the next clears it. |
| 15 | Missing variants throw in scoped layout | Hardened optional variant maps and root fallback. Fully normalized documents already have a base variant. |
| 16 | Dense snapshots block inheritance | Intentional for applying presets and restoring saved presentations: other screen sizes must retain their existing appearance. Existing layout-scope tests assert this contract. Ordinary variant edits remain sparse. No change. |
| 17 | Reset leaves named saves | Fixed: clear named saves and local-storage entries for retired screen variants as well. Custom storage without prefix clearing receives explicit clears for known variants. |
| 18 | Slot release unhides host element | Fixed: release no longer unconditionally unhides; only elements UIKit actually changed from visible to hidden are recorded for restoration. |
| 19 | Precision pointer identity differs | Fixed: down, move and up share one pointer ID. |
| 20 | Coordinate Enter does not confirm | Fixed: apply pending coordinate values before confirmation; composing Enter remains untouched. |
| 21 | Missing lightProps throws | Added null guard for optional panel. |
| 22 | Missing square button throws | Added null guard matching adjacent optional controls. |
| 23 | Cabinet history names wrong family | Fixed: pass family key instead of family object. |
| 24 | Empty cabinet title throws | Fixed: assign textContent to the text-only family header. |
| 25 | Detached viewport has no return parent | Hardened: remember a parent supplied after initialization; if there never was one, restore the detached state instead of inventing a destination. |

Regression coverage is in `uikit/tests/reported_regressions.test.mjs` and `tests/uikit_reported_regressions.browser.mjs`. Existing layout-scope tests cover intentional screen snapshot isolation. Browser regressions cover floating geometry and undo, height-only reset, shared text and wildcard resets, icon-picker Escape, borrowed visibility, public element lookup, saved-layout cleanup, moving past leaves, tree controls, and coordinate confirmation. A live browser check also verified height-only reset in the standalone demo.

## Validation

- `npm run check`: passed (module identifiers, 450-module import graph, and 1,402 source assertions).
- Focused UIKit/host/touch unit tests: 166 passed.
- New browser regressions: 10 passed; standalone demo and adoption suites: 17 passed.
- Existing designer/inspector/tree browser suites: 86 of 87 passed initially. The remaining assertion encoded the old instance-name masking behavior; after updating that expectation for finding 4, its targeted rerun passed.
- Full `npm test`: 2,351 passed, one failed in the unrelated legacy migration build-order test. That test changed during concurrent workspace work and passed on an isolated rerun; this task did not edit the migration code or its test. The first full run also encountered a transient modeler parse error that had cleared before the final checks.
- `git diff --check`: passed.

The shared workspace had substantial existing edits and continued changing during validation. No full browser-suite or GPU/3D regression claim is made; browser coverage here targets UIKit and the reported editor interactions.
