# Plan — Structure browser: named hierarchy, icons, in-place editing, Kanban tree drag, drill-down selection

Revision of the reviewed draft. The draft's UI surface is right and is kept nearly whole —
normalized icons, in-place rename, breadcrumbs, friendly kind names, the drop seam, the CSS,
the i18n keys. What follows corrects twelve things that would have failed against this
codebase, and adds the three pieces the draft does not cover: menus, depth, and the boundary
guard that keeps the module portable.

---

## 0. Corrections to the reviewed draft

Each one is a fact about the code, with the file it came from.

### C1 — Icons must come from the host contract, not from the DOM  ⛔ blocking

The draft's `iconFor(node)` resolves "adopted DOM icon (`i.ph`, `svg`)" and falls back to
`ph-squares-four`, `ph-rows`, `ph-sidebar`, `ph-article`, `ph-layout`, `ph-minus` — inside
`uikit/editor/tree.js`.

That contract already exists and already forbids this. `js/uikit_host/index.js:167`:

> *uikit stores an icon NAME and never learns what a name looks like. The host resolves it, so
> a button uikit places still follows whichever of the ten icon sets the user has chosen, and
> the icon picker offers the app's real vocabulary rather than a list uikit invented.*

```js
icons: { list: () => …, resolve: (name) => …, render: (name, hostEl) => … }
```

Phosphor is 3dhome's choice of icon set, one of ten the app offers. Hardcoding `ph-*` in the
portable module breaks the other nine, breaks the demo app, and is the **third** repetition of
one bug: host vocabulary inside `uikit/`. It was removed from `policy.js` (its header records
why) and it is still live at `designer.js:160`.

**Fix.** `iconFor` returns a *name*; the row calls `ctx.icons.render(name, span)`. The
per-type fallback is a name the host supplies, not a class the module invents. §6 makes this
mechanically enforceable rather than a promise.

### C2 — `e.detail >= 2` will never fire  ⛔ blocking

The draft detects double-click with `if (e.detail >= 2 || …)` inside `onPointerDown`. Two
independent reasons it cannot work here:

- `detail` is 0 on `pointerdown` / `pointerup` under the Pointer Events spec; it is a
  `MouseEvent` click counter and pointer events do not populate it.
- `designer.js` `onClick` calls `preventDefault()` + `stopPropagation()` unconditionally —
  clicks are swallowed by design so that clicking *Save* selects the button instead of saving.
  There is no click sequence to count.

**Fix.** Synthesise: two `pointerup`s within **400ms and 16px** on the same node. One code
path, so mouse and finger can never drift apart, and one thing to test.

### C3 — "1 click always selects the outermost group" is a usability trap

The draft's single-click rule has no memory, so every click after a drill throws you back to
the top. Selecting three buttons in the same toolbar costs six double-clicks.

**Fix.** One piece of state, `focus` — *the container whose children are currently
selectable* — and it is **sticky**. Full model in §2. It also gives Escape something to mean,
gives the breadcrumb a job beyond decoration, and keeps a multi-selection inside one parent,
which is what `groupProblem` in `uikit/editor/group.js` already requires before it will group
anything.

### C4 — Double-click cannot mean both "rename" and "drill deeper"

The draft binds double-click on a tree label to inline rename, while double-click everywhere
else descends a level. Same gesture, two meanings, one screen.

**Fix.** Rename is `F2` and the pencil action. Double-click descends, in the tree and on the
canvas alike. The inline input itself is kept exactly as drafted.

### C5 — A tree rename must honour "Rename everywhere" and the language

`inspector.js:340-351` already forks on a checkbox:

```js
if (els.everywhere.checked) ops.setText(doc, { key, lang: ctx.lang(), value })   // every occurrence
else                        ops.retitle(doc, { id, label: value })              // this node only
```

A tree rename that only calls `retitle` does something quietly different from the field two
panels away, in a way nobody will attribute to the checkbox.

**Fix.** The tree's rename routes through `command("retitle", …)`, and that command reproduces
the fork. Same for `reicon`, which also takes `variant` — renaming while the phone variant is
active must not silently edit base.

### C6 — There is nothing to drill into yet  ⛔ blocking for the drill tests

`js/uikit_host/layout.js` describes `n:app → n:topbar → panel:tb-start`, and `panel:tb-start`
is `{ type: "item" }` — a leaf. The sidebar is the same shape; the modeler ribbon's fourteen
groups are also leaves. Three levels, and the leaves are whole regions.

`js/uikit_host/panels.js` says so in its own header: going finer than the panel is *"a later
phase, and each place it breaks a selector is a rule that has to be changed deliberately
rather than discovered in production."*

So the draft's test **"1 click on a command in a group selects the enclosing group"** has no
command in the tree to click. It passes only after the test places one from the palette, or
after deep adoption (§5).

**Fix.** Phases 1–5 place a command in their fixtures and say so. Phase 6 is deep adoption.

### C7 — Menus cannot be opened while customizing  ⛔ blocking for "on app menus as well"

The draft assumes touch drag "across menus/canvas". Three verified facts say otherwise:

- `designer.js` `onPointerDown` preventDefaults in the capture phase, so a click on
  `.dropdown-trigger` never reaches the host's handler — no menu can be opened.
- `js/ui.js:2806` portals an open menu to `body > .dropdown-menu.open`.
- `css/styles.css:3452,3471` — `.dropdown-menu` is `display: none` until `.open`, so its
  children have no box: nothing to hit-test, nothing to draw a preview against.

**Fix.** A `holdOpen(nodeId, on)` host hook, plus tree editing of menus that are not open —
rows exist without rects, which is what the `Missing` state in `tree.js` is already for. §7.

### C8 — Deep adoption breaks child-combinator CSS

Two rules that make a moved node keep working and look wrong:

- `#left-sidebar > .panel-section` — the whole left-pane switcher
- `body.compact-nav #topbar .tb-start > .dropdown` — `css/styles.css:12503`

**Fix.** An `escapes` flag per node — *moving this out of its parent changes how it looks* —
and warn once, in words. Do not refuse: it is the user's layout.

### C9 — The tree's insertion arithmetic belongs in `drag.js`

The draft computes the 35/30/35 zones inline in `tree.js`, so the only way to test the drop
seam is to drive a browser. `uikit/editor/drag.js` exists precisely to avoid that, and says so:
*"the part that decides WHERE a thing goes can be tested as arithmetic."*

**Fix.** `treeZone(rowRect, point, isContainer)` and `treeDropTarget(...)` live in `drag.js`,
pure, tested under plain `node --test`. The zones themselves are kept as drafted.

### C10 — "Inside" needs an index, and an expansion

Dropping *into* a container must state index `0` or `children.length`. Append, and expand the
container on drop — otherwise the dragged node disappears into a collapsed row and reads as a
failed drag.

### C11 — Touch numbers are mouse numbers

`DRAG_THRESHOLD = 4` is a mouse constant. A finger moves further than that while holding
still.

**Fix.** `TOUCH_DRAG_THRESHOLD = 10` beside it; long-press `500ms` as a named constant (the
draft's 400ms is inside the range where a slow deliberate tap misfires); and
`touch-action: none` on the mount **while customizing only**, or the page scrolls out from
under every drag.

### C12 — Refusal must be visible before the release, not after

Today an illegal drop is recomputed in `onPointerUp` and silently discarded, so the gesture
looks like it worked and then nothing happens. The draft keeps this for the canvas ("hide
indicator") and only shows a state in the tree.

**Fix.** Both surfaces show the refusal *during* the drag, with the reason in words.

---

## 1. What already exists

Worth stating, because it is most of the machinery:

- `uikit/editor/tree.js` — read-only browser, full keyboard nav, collapse state, selection
  sync, `Hidden` / `Missing` badges, roving tabindex.
- `uikit/editor/drag.js` — `axisOf`, `insertionIndex` (midpoint counting, correct under
  reversed visual order), `dropIndicator`, `DRAG_THRESHOLD`, `passedThreshold`. Pure, tested.
- `uikit/editor/designer.js` — capture-phase routing, an overlay that draws rather than
  contains, `containerAt` walking up to the nearest accepting container.
- `uikit/editor/policy.js` — `containerAccepts`, host-declared via `constraints.accepts`.
- `uikit/model/ops.js:112` — `move` already refuses a container into its own subtree, clamps
  the index, and returns the same object on a no-op. `retitle:284`, `reicon:289` exist.
- `js/uikit_host/index.js:167` — the `icons` contract, with `list` / `resolve` / `render`.

Missing: depth, names, the preview, and touch.

---

## 2. Selection model

```
focus = the container whose children are currently selectable   (starts at root)

click P        hit  = deepest node under P
               if hit is outside focus: focus = root        ← this is "click outside"
               select the ancestor of hit that is a direct child of focus

double-click   if the selection is a container: focus = selection,
                 then select the child of it under P
               if it is a leaf: already the deepest, nothing to do

Escape         focus = parent(focus), select what focus was
               at the root, Escape keeps its meaning: exit customize mode

Accel+click    select the deepest node directly, focus = its parent   (power-user bypass)
```

Sticky focus is the whole point (C3). Dragging moves the current selection, group or leaf —
that part of the draft is right and unchanged.

New pure module `uikit/editor/depth.js`, same shape as `drag.js` — arithmetic over a flattened
tree, no DOM:

```js
export function candidateAt(chain, focusId)   // chain = [root … hit] -> the child of focus
export function drillTarget(node)             // -> node.id if enterable, else null
export function ascend(focusId, parentOf)     // -> parent, or null at the root
export function withinFocus(chain, focusId)   // -> bool; drives the click-outside reset
```

**The invariant worth a test:** `focus` is an ancestor of every selected id, and a
multi-selection never spans two depths.

Tree and canvas share the state: clicking a tree row sets `focus = parent(row)`, so the two
views cannot disagree about what "one level" means. `Escape` gains an `ascend` command;
`a11y.js:35` keeps returning `exit`, and the designer intercepts Escape first when
`focus !== root`. The existing test asserting *"Escape exits"* narrows to *"Escape exits from
the root"* — still true, now specific.

---

## 3. Visual identity and in-place editing

Kept from the draft, with C1, C4 and C5 applied.

**Row anatomy** — `▸`  ·  icon button  ·  name  ·  role  ·  badges  ·  pencil

```
▾  [icon]  Top toolbar      group · 3 items
   [icon]  File             menu · 9 items
   [icon]  Save             button
```

Never a tag name, never a class, never `act:save`.

**Name resolution**, first hit wins:

1. the user's rename (`ops.retitle`, already per-language)
2. a **host-supplied name for the node id** — new
3. the registry entry's title (already read from `data-i18n`, so it follows the language)
4. the node's `label`
5. a prettified id — last resort, with *Rename* offered on the same row

The host-supplied names are a new optional context entry, same shape as the registry:

```js
createUIKit({ …, names: { "n:app": "uikit_n_app", "n:topbar": "uikit_n_topbar", … } })
```

`js/uikit_host/` fills it from what it already has — `PANELS[].key/.en`, `ribbon.js`
`GROUPS[].key`, and the four `uikit_n_*` keys already sitting in `js/i18n/en.js:959` and
`js/i18n/he.js:1498`. **The table at `designer.js:160-165` is deleted.** Nothing user-visible
changes; the module stops knowing about 3dhome.

**Role words** come from `kindOf` in `policy.js` through the draft's friendly map — that part
is kept verbatim, including replacing `els.kind.textContent = node.type` at `inspector.js:466`,
which today shows a raw schema type to the user.

**Icons** — `ctx.icons.render(name, span)` (C1). The picker's grid is `ctx.icons.list()`,
which is already what the inspector's datalist uses at `inspector.js:287`. Reset clears the
override via `reicon(…, { icon: null })`.

**Rename** — inline input exactly as drafted, opened by `F2` or the pencil, never by
double-click (C4), committed through `command("retitle", …)` which honours the everywhere
checkbox, the language and the variant (C5).

**Breadcrumb** — as drafted, and it is also the focus path made visible: each crumb sets
`focus` there. On touch it is the only way up, since there is no Escape key.

**Scope** — the tree shows the focus subtree by default with an "everything" toggle. After
phase 6 the full document is several hundred rows and unreadable as a default.

---

## 4. Drag with a landing preview

Two surfaces, one geometry module (C9), one command.

`drag.js` gains, all pure:

```js
export function dropPlaceholder(containerRect, rects, index, axis, size)  // the box, not the line
export function treeZone(rowRect, point, isContainer)                     // "before" | "inside" | "after"
export function treeDropTarget(rows, point, dragging)                     // -> { parent, index } | null
```

Route both surfaces through `command("move", { id, parent, index })`. Today the canvas drop
calls `ops().move` directly at `designer.js:628`, contradicting that file's own stated doctrine
— *"EVERY GESTURE IS A COMMAND"* — and it is why tree drag would otherwise need its own copy of
the apply/refresh/select dance.

**In the tree** — uikit owns every row, so a real gap opens and the rows below genuinely move.
The Kanban feel, free, without touching anything the host styles. Drop seam, indent notch,
`.is-dragging`, dwell-expand (~600ms), edge auto-scroll: all as drafted. Plus C10's index and
expand-on-drop, and C12's visible refusal.

**On the live UI** — the overlay paints: the accepting container outlined, the **placeholder
box** at the landing index (not a 2px line), a translucent ghost following the pointer, and the
refusal state with its reason.

> **Decision, locked.** No host DOM is mutated during a canvas drag. True Kanban would push the
> real siblings apart, and that means writing transforms onto adopted host elements — the exact
> thing the *"the node IS the element"* rule exists to prevent, and the thing that broke host
> CSS the first time. The placeholder is painted in the overlay. This costs a little realism on
> the canvas and nothing at all in the tree.

---

## 5. Touch

One synthesised gesture layer feeding the same commands (C2).

```
tap                                  -> click        (select at the current depth)
press, still, 500ms, release         -> double-click (drill in)
press, movement past 10px            -> drag         ← movement wins, checked before the timer
```

Movement beating the timer is the entire disambiguation. It does mean long-press-then-drag
stops being a drag — the price of the mapping you asked for. If it fights muscle memory, the
fallback is drill-on-double-tap, a one-line change in the same layer.

Plus C11's constants and `touch-action`, `navigator.vibrate?.(15)` and the pulse as drafted,
and 44px rows under `@media (pointer: coarse)`.

---

## 6. The boundary guard  *(new — this is what stops C1 recurring)*

`tools/link_check.mjs` enforces the uikit boundary for **imports**, which is why it never
caught `designer.js:160`: strings are not imports. The same blind spot would have let the
draft's `ph-*` fallbacks through.

Add `uikit/tests/no_host_vocabulary.test.mjs` — strip comments, then assert no source line
under `uikit/` (excluding `demo/` and `tests/`) contains `ph-`, `#topbar`, `#left-sidebar`,
`.dropdown`, or an `n:` / `panel:` / `act:` literal.

Verified today: every current match outside `designer.js:160-163` is inside a comment
explaining the rule, so the guard flags exactly the one real offender and nothing else. It
goes in **first**, red, and phase 1 turns it green.

---

## 7. Menus  (C7)

New optional host hook:

```js
holdOpen(nodeId, on)   // the host pins a transient surface open while customizing
```

3dhome's implementation adds `.open` to the dropdown wrapper, runs the same portal path
`js/ui.js` already uses, and suppresses `closeDropdowns()` while anything is pinned. Selecting
a menu node pins it; deselecting unpins.

The tree edits menu contents whether or not the menu is open. Canvas drag into a menu works
only while it is pinned, and the tree is the honest answer for everything else.

---

## 8. Deep adoption  (C6, C8)

The host declares which descendants of a container become nodes:

```js
{ id: "panel:tb-start",
  deep: { sel: ":scope > .dropdown, :scope > button[data-act]", idFrom: "data-act" } }
```

`escapes` is set on any node whose parent styles it by child combinator; the editor warns once
on the first such move. One container at a time, each step gated by
`tests/uikit_parity.browser.mjs` — which is what says the render still changes nothing.

---

## 9. Phases

Each independently shippable, each independently green.

| # | Phase | Contains |
| - | ----- | -------- |
| 0 | Boundary guard | §6, red first |
| 1 | Names & icons | host `names`, delete `designer.js:160`, `icons.render`, role words, breadcrumb |
| 2 | Drill | `depth.js`, focus state, click/dbl/Escape/Accel, tree ↔ canvas shared |
| 3 | In-place editing | F2 rename, icon picker, both through `command()` with everywhere/lang/variant |
| 4 | Move as a command | route the canvas drop through `command()`; placeholder, ghost, refusal |
| 5 | Tree drag | real gap rows, dwell-expand, auto-scroll, `treeZone` in `drag.js` |
| 6 | Touch | synthesised gestures, thresholds, 44px rows, `touch-action` |
| 7 | Deep adoption | one container at a time, `escapes` warning, parity green throughout |
| 8 | Menus | `holdOpen`, tree editing of unopened menus |

Phases 0–6 are useful on today's three-level tree. Phase 7 is what makes the feature match the
sentence you wrote, and it is the one that can break host CSS — which is why it is late and
incremental rather than first and sweeping.

---

## 10. Tests

The draft's list is browser-only; roughly half of this is arithmetic and should not need a
browser to prove.

**Pure — `uikit/tests/`, runs anywhere the module is dropped**

- `no_host_vocabulary.test.mjs` — §6
- `editor_depth.test.mjs` — `candidateAt` at each level, `ascend` stopping at the root, the
  focus-is-an-ancestor invariant, multi-select never spanning depths
- `editor_drag.test.mjs` *(extend)* — `dropPlaceholder` for empty containers, both axes,
  reversed visual order; `treeZone` at each boundary; `treeDropTarget` refusing a node into its
  own subtree

**Browser — `tests/`**

- `uikit_tree.browser.mjs` *(extend)* — the draft's seven, plus: rename opens on `F2` and
  **not** on double-click; a rename with "everywhere" checked changes every occurrence;
  dropping *inside* a collapsed container expands it and appends
- `uikit_designer.browser.mjs` *(extend)* — the draft's five, with the fixture placing a
  command first (C6); plus Escape ascends one level and exits from the root; a breadcrumb crumb
  sets focus; sticky focus — two consecutive single clicks at depth stay at depth
- `uikit_touch.browser.mjs` *(new)* — synthesised `pointerType: "touch"`: long-press drills,
  move-first drags, and the two never both fire
- `uikit_names.browser.mjs` *(new)* — no row's text matches a tag name, a class, or an id with
  a colon. The "english, not html" requirement as an assertion rather than a promise.
- `uikit_parity.browser.mjs` *(existing)* — stays green through every phase-7 step

**Commands**

```bash
npm run check                                  # module + link + comment-assertion gates
node --test uikit/tests/*.test.mjs             # the pure half, no browser
node --test tests/uikit_tree.browser.mjs tests/uikit_designer.browser.mjs
node --test tests/uikit_touch.browser.mjs tests/uikit_names.browser.mjs
npm run ci                                     # check + test + test:browser
```

---

## 11. Decisions locked here

- **Icons and names come from the host contract.** No `ph-*` in `uikit/`, enforced by phase 0.
- **The canvas preview is painted, not opened.** No transforms or reparenting on adopted host
  elements mid-drag.
- **Double-click descends, everywhere.** Rename is `F2` and the pencil.
- **Focus is sticky.** Single click does not reset depth; Escape and the breadcrumb ascend.
- **Movement beats the hold timer on touch.** Long-press-then-drag stops being a drag.
- **Deep adoption warns rather than refuses** when a move escapes a styling parent.
- **Escape ascends before it exits.**
- **Everything stays behind `mf_uikit`,** off by default. Turning it on is a product call, not
  part of this work.
