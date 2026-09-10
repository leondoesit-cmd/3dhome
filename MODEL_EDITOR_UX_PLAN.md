# Model editor UX plan

Companion to `MODEL_EDITOR_PERF_PLAN.md`, `MODEL_EDITOR_PERF_FIXES.md`, and
`docs/model-editor-ux-implementation.md`. Search for needles, not line numbers.

**Rechecked 10 Sep 2026 (afternoon).** The work-order body was stale: a banner
said T1–T5 and P2–P5 had landed, while the facts table and sequencing still
described them as open. Code, tests, and the implementation notes agree —
**the product slices are in the working tree.** What remains is hygiene
(stale companion docs, a weak source pin) and uncommitted merge cost.

## Status

| Slice | Status | Needle / evidence |
|---|---|---|
| T1 Viewport colours | **Done.** | `appendViewportColor` `input` → dirty deco groups + `refreshDecorations()`, not `updatePreview()`. |
| T1 Part colour | **Done.** | rAF-coalesced `updatePreview` + `refreshParts`; `pushUndo` on first `input` (history must capture *before* mutation). `change` clears the editing flag and drafts. No `drawSketch()`. |
| T2 Decoration gate | **Done.** | `hasSelection` / `finishActive` gone from `needsRebuild`. Per-group `selectionStamp`. `isEntryAffectedByHover` matches `partId`, never `return true`. Covered by `tests/modeler_ux_plan.test.mjs`. |
| T3 Pattern overlap | **Done.** | Merge-off AABB via shared `boundsMayOverlap`; red `#d0342c` copies; `livePatternOverlap` / `Hint`; Apply flashes and still commits; kernel still unused when merge is off. |
| T4 Right column | **Done.** | `E.rightCollapsed` / `rightCollapsedPreference` default **true**. Toggle persists. `#mdPrev` untouched. |
| T5 Status row | **Done.** | `#mdName` / `#mdPrice` live in Settings. `#mdWorkflow` + `#mdCoach` share `.md-status-row`; inactive crumbs hidden. Save / Close / Undo / Redo stay in the header. |
| T6 Tab following | **Retained.** | Sketch → Sketch tab; finish → Features; assembly remaps. No new tab manager. |
| P2 Instant3D HUD | **Done.** | `.md-instant3d-value` is an `<input type="number">`. Draft has a face-anchored `angle` handle. Typing during a drag owns the value (`tests/modeler_ux_plan.test.mjs`). |
| P3 Empty part | **Done.** | Three translucent origin-plane meshes (`cadReferenceId: plane:…`) plus `#mdEmptyStart` Top/Front/Right buttons. Welcome consumed after first automatic display. |
| P4 Repair | **Done.** | Tree warn is a button; Enter on an error row calls `onRepair` → `runDiagnosticAction`. Missing refs: amber `repairMarker` at last known origin, not a fake live face. Ambiguous: surviving candidates selected. |
| P5 Density pref | **Done.** | Guided / Standard / Expert wrap `welcomeOnOpen`, `coachEnabled`, `workflowVisible`, `expertDensity`. uikit unchanged. |

Implementation notes, traps that were corrected in flight, and test counts:
[`docs/model-editor-ux-implementation.md`](docs/model-editor-ux-implementation.md).

Tests: `tests/modeler_ux_plan.test.mjs`, `tests/modeler_ux_plan.browser.mjs`.
Doctrine tests still in force: `tests/modeler_workflow_loop.test.mjs` (no
`prompt(`), `tests/modeler_viewport_overlap.browser.mjs`,
`tests/modeler_responsive_flow.browser.mjs`, hover-zero-rebuild in
`tests/modeler_perf.test.mjs`.

## Thesis (still true)

Give the canvas back. Finish the intent → ghost → click → commit loop on it.
Do not add another launcher. Hover does not rebuild the model.

## Doctrine (keep)

These are constraints, not suggestions. Rediscovering them is expensive.

- Stay in 3D. Sketch on a face or Top; Select does not flatten the view.
- One home per command. Ribbon owns verbs; the tree is the FeatureManager.
- No `window.prompt`. Measure / mass / BOM float as `#mdEvalCard`.
- Coach suggests and never blocks.
- Viewport overlays live on rails so they do not cover each other.
- Confirmation corner + Property Manager (`#mdQuickTools`) while a feature is
  defined.
- Closed sketch offers Extrude / Cut / Revolve / Hole. Leading is not deciding.
- Mobile two-row chrome (`js/modeler_mobile.js`) is the density target, not a
  separate product.
- `finishCommandActive()` is fillet/chamfer only; `FINISH_FEATURES` is wider.
  Do not merge those constants — T2 depends on the narrow one.

## What not to do (still)

- **Do not add a seventh home for Extrude.** Density pref already wraps
  welcome + coach. Do not add a third guidance system.
- **Do not delete `#mdPrev`.** It is the 3D viewport, swapped into `#md3dHost`.
  Context Room is `drawInRoom()`.
- **Do not reopen modals.**
- **Do not customize the layout first.** uikit already hosts the ribbon.
- **Do not quote the 2025 hover→`updatePreview()` claim**, and do not quote
  the Sep 2026 “colour sliders still rebuild / `hasSelection` gate” leftover
  either — both are closed. (`MODEL_EDITOR_PERF_PLAN.md` status note was
  updated in this recheck.)
- **Do not treat AABB overlap as exact.** The warning copy says “may overlap”
  / “approximate check” on purpose. Merge-off must not call
  `brepConnectedGroups`.

## Leftovers (hygiene, not a new product slice)

1. **`tests/modeler_perf.test.mjs`** `"refreshDecorations uses spatial and hover
   filtering…"` still only asserts that `needsRebuild` *starts* with
   `children.length === 0`. It does **not** pin the absence of `hasSelection` /
   `finishActive`. Behaviour is covered in `tests/modeler_ux_plan.test.mjs`.
   Strengthen the old pin if that file is touched; do not reopen T2 for it.
2. **`applyTexTo`** loader callback still calls `updatePreview()` when a bitmap
   lands. Was explicitly out of T1 scope. Same rAF pattern as part colour if
   it becomes a stutter.
3. **Density vs individual checkboxes.** Changing Guided/Standard/Expert writes
   `welcomeOnOpen` / `coachEnabled` / `workflowVisible`. The Welcome and Coach
   checkboxes can still be flipped independently afterwards; the `<select>`
   recomputes on `syncDensity()`. Acceptable; do not add a fourth source of
   truth.
4. **Physical devices.** Automated Chrome covers 344–1280px, en/he, and
   keyboard space. Folding, touch hit targets, and real mobile keyboards still
   need a device pass (`docs/model-editor-ux-implementation.md`).
5. **Uncommitted.** ~208 dirty paths, including every `js/modeler*.js` this
   plan names. The UX work is in the working tree, not a PR. Landing it is a
   merge against the rest of that dirt, not more chrome design.

## Sequencing now

There is no “P0 next.” Product work from this plan is in the tree.

If anything follows, in order:

1. Commit or split the UX diff (T1–T5, P2–P5, tests, CSS) off the unrelated
   dirty files — or accept one large merge.
2. Optional: strengthen the `modeler_perf.test.mjs` source pin (leftover 1).
3. Device pass (leftover 4).

Do not start another ribbon, empty-state, or diagnostics rewrite.

## Verification (keep green)

- `npm run check`
- `npm test -- tests/modeler_ux_plan.test.mjs tests/modeler_perf.test.mjs tests/cad_pattern_merge.test.mjs tests/modeler_workflow_loop.test.mjs`
- With Chrome: `tests/modeler_ux_plan.browser.mjs`,
  `tests/modeler_viewport_overlap.browser.mjs`,
  `tests/modeler_responsive_flow.browser.mjs`,
  hover-zero-rebuild in `tests/modeler_perf.test.mjs`
