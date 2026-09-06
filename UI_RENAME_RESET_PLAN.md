# Plan — menu hierarchy, per-node rename, and per-item reset

Revision of the reviewed draft. The per-item reset is kept nearly whole. The dual-rename half is
re-sited, because the feature it describes already exists in one form and the proposed
implementation breaks an invariant `runtime/render.js` states about itself. A new item 0 comes
first: it is what the screenshot shows, and it *removes* code rather than adding it.

---

## 0. Export should be the parent of PNG 2D  ← do this first

### What is on screen

```
Toolbar start   Tool group
  Model editor  Item
  File          Item
  Edit          Item
  Export        Item      ← a leaf, with four children hidden somewhere else
```

The four export commands are real nodes. They are just in the wrong place: `menuitems:export`
is a **child of the root**, a sibling of `n:topbar`.

```
n:app
├─ n:topbar → panel:tb-start → [ …, menu:export (leaf), … ]
├─ menuitems:file
├─ menuitems:edit
└─ menuitems:export → [act:exportjson, act:png2d, act:png3d, act:exportgltf]
```

That shape came from the portal problem: the host moves `.dropdown-menu` to `<body>` when the
menu opens, so the container was bound to a runtime slot and parked at the root, where nothing
would try to reparent it. It renders correctly and reads wrongly.

### The shape to move to

```
panel:tb-start
└─ menu:export          group, adopts the .dropdown wrapper
   ├─ act:exportjson
   ├─ act:png2d
   ├─ act:png3d
   └─ act:exportgltf
```

Three levels become two, the `menuitems:*` nodes disappear, and the tree reads
`Interface › Top toolbar › Toolbar start › Export › PNG 2D`.

### Why this is safe, using two mechanisms that already exist

**The `target()` hook.** `render.js:434` already syncs a container's children into an element
the host names rather than into the container's own box — that is how ribbon buttons land in
`.md-command-items` without displacing the group label. A menu is the same case:

```js
target: menuItemsFor(d, "menu_export", 2)      // the host's selector, not uikit's
```

**`menuItemsFor` already survives the portal.** `panels.js:91` looks for the portaled
`body > .dropdown-menu` whose `_dd` matches the wrapper **first**, and falls back to
`dd.querySelector(".dropdown-menu")`. So it finds the menu whether it is open or closed. That is
the whole reason the slot was needed, and it is already solved one layer down.

So `menuitems:file` / `:edit` / `:export`, their three registry entries, their three
`ui.registerSlot` calls in `js/uikit_host/index.js:309-316` and their three root-child entries
all go away. Net: less code.

### What to watch

- `menu:export` becomes a container adopting the `.dropdown` **wrapper**, so it keeps its
  position among `.tb-start`'s children. Its `target()` sends the children elsewhere.
- The wrapper's own `.dropdown-trigger` is a host element and never appears in `wanted`;
  `advanceCursor` skips non-created children without removing them. Already proven by
  *"adopting a column's children leaves the host's own plumbing where it was"*.
- `.menu-divider` elements inside the menu are unclaimed host plumbing under the same rule, and
  must stay in place. Assert their order, not just their presence.
- `menu:*` needs `constraints.accepts: ["command"]`.
- `holdOpen` is unchanged: it still pins the wrapper open on selection.
- `tests/uikit_parity.browser.mjs`'s tagged-id list loses the three `menuitems:*` ids.

### Tests

- the tree shows the four export commands **as children of Export**, at Export's depth + 1
- reordering inside Export moves the real menu buttons, with `.menu-divider` unmoved
- a re-render **while the menu is open** syncs into the body-mounted element and does not pull
  the buttons back into the `.dropdown` wrapper *(the original trap, now handled by `target()`
  instead of by the slot — so this is the assertion that must fail if `target()` is reverted to
  a plain `querySelector` on the wrapper)*

---

## 1. Renaming — the feature is narrower than the draft says

### What already exists

`js/uikit_host/texts.js:65` — `applyTextOverrides` walks `[data-i18n]`, `-title`, `-aria`, `-ph`,
`-label` and writes the user's words into the live host DOM, re-applying **after** the app's own
i18n pass so a language change cannot undo it. Dual renaming works today, and it works in the
host, which is where knowledge of those attributes belongs.

### What does not exist

`ops.setText` is keyed by **i18n key**, so renaming *Save* renames every *Save*. That is the
"Rename app text in this language" checkbox in the screenshot, and it is correct. What has
nowhere to live is a rename that changes **this one button** — `ops.retitle` stores a per-node
label, and nothing carries it to the DOM.

So the feature is: *per-node rename reaches the element, and only that element.*

**Confirmed on screen.** Renaming the Structure tab to "Stru" changes the overlay tag, the
breadcrumb, the tree row and the inspector — and the sidebar button still reads STRUCTURE. The
label is uikit's name for the node; nothing carries it to the host's own words. That is the whole
bug, and it is why the `labels` contract below is the feature rather than a refactor.

### Why not the draft's implementation

`render.js`'s own header states the loan:

> Everything uikit writes onto a borrowed element is inside the `data-uikit-*` / `--uikit-*`
> namespaces or is `hidden`, which is exactly the loan `runtime/adopt.js` knows how to take back.

`adopt.js:82-92` restores precisely those three things and has no concept of text. A
`held.textSnapshot` inside `render.js` would be a **second restore path the adopter knows nothing
about**, and `tests/uikit_parity.browser.mjs` — the test that guarantees byte-identical markup on
unmount — never performs a rename, so it could not catch the two diverging.

The draft's `findTextTarget` also carries host vocabulary into the portable module:
`[class*='caret']` is this app's dropdown caret, `[class*='badge']` is `.tb-badge`,
`[class*='title']` is a guess about someone's naming. The boundary guard forbids `ph-`,
`#topbar`, `#left-sidebar`, `.dropdown`, the `n:`/`panel:`/`act:` prefixes and four icon names —
none of these match. It would be the fifth appearance of one bug: `policy.js`, the name table in
`designer.js`, `fallbackIcon`, `render("pencil")`, and now this.

### The shape to build instead

uikit knows the element — it stamped `data-uikit-id` on it. The host knows which child carries
the words. So extend the host contract, exactly as `icons` was extended two rounds ago:

```js
labels: {
  apply(el, text),   // host writes the words where they belong on ITS element
  restore(el),       // host puts back what was there
}
```

- `render.js` calls `ctx.labels.apply(el, node.label)` when a per-node label is set and
  `ctx.labels.restore(el)` when it is cleared or the element is released. It never looks at
  classes.
- 3dhome's implementation reuses the `KINDS` table already in `texts.js` — it is the same five
  attributes — and snapshots per element.
- **Ordering matters and must be stated:** the host re-applies after `applyStatic()`, the same
  way `applyTextOverrides` already does. A write from inside uikit's `paint()` is not ordered
  against the app's i18n pass at all, and would be clobbered on the next language change.
- **Do not re-apply every paint.** Apply on change; the host's post-i18n hook covers the rest.
  The draft writes `textContent` on every render, which also fights any label the app updates
  from state.

`resolve.js` still gains `customLabel` / `customIcon` as the draft proposes — that part is right,
and it is what tells the renderer there is anything to apply.

### Extend the guard

Add `[class*=` to `uikit/tests/no_host_vocabulary.test.mjs`'s forbidden patterns. A class-fragment
selector in the portable module is host vocabulary by construction, whatever the fragment is.

---

## 2. Fix the tree row before adding a button to it

`tree.js:256` creates the row as `<button role="treeitem">`. `tree.js:285` appends `iconBtn` — a
`<button>` — inside it, and `tree.js:379` appends `pencilBtn`, another one. Nested interactive
content is invalid HTML; the parser's and the screen reader's behaviour is undefined, and this is
the row whose ARIA ownership was just repaired.

The reset button makes three. So:

- the row becomes `div[role="treeitem"]` with `tabindex` for the roving focus it already manages
- `iconBtn`, `pencilBtn` and the new reset button become **siblings** of the label, not descendants
- the existing pointer handling already filters on `.uikit-ins-tree-mark` / `.uikit-ins-tree-icon-btn`,
  so the selection gesture survives; the change is structural

Test: no `[role="treeitem"]` contains a `button`, `a[href]`, `input`, `select` or `textarea`.
Asserted as the rule, so it also covers the next control someone adds.

---

## 3. Reset — per parameter, and for the whole item

A single "Reset to default" is too blunt. An item carries several independent edits, and undoing
one should not undo the rest. `schema.PATCHABLE` already names them:

```
hidden  size  rect  slot  label  icon  collapsed  orient  flow  tokens
```

plus one that is not a field at all — **where the item sits**, which lives in the tree as a parent
and an index, and is recoverable only from `defaults`.

### Every parameter gets its own reset

A ↺ appears beside a control **only when that parameter is actually overridden**. So the panel
answers a second question for free: *what have I changed on this item?* — the row with a ↺ is the
row you touched.

| Control | Reset clears | Op |
| ------- | ------------ | -- |
| **Name (this item)** | `node.label` | `resetField(id, "label")` |
| **Name (app text in this language)** | `overrides.text[key][lang]` | `resetText(key, lang)` |
| **Icon** | `node.icon` | `resetField(id, "icon")` |
| **Size** | `node.size` / `node.rect` | `resetField(id, "size")` |
| **Hidden** | `node.hidden` | `resetField(id, "hidden")` |
| **Collapsed / Orientation / Flow** | the matching field, containers only | `resetField(id, …)` |
| **Colours** | `node.tokens` | `resetField(id, "tokens")` |
| **Position** | parent + index, from `defaults` | `resetPosition(id, defaults)` |

The two Name rows are the point. They are different edits with different reach — one renames this
button, one renames the app's wording everywhere that string appears — and giving each its own ↺
is what makes the difference visible instead of something the user has to be told.

### Two new ops, both narrow

```js
resetField(doc, { id, field, variant })   // one key, base or variant patch
resetPosition(doc, { id, defaults })      // base only; move() already guards the variant case
```

`resetField` is `resetNode` narrowed to one field: in `base`, delete that key from the node; in a
variant, delete it from that variant's patch entry (and drop the entry when it empties). `ops.js`
line 383 already does exactly this for the whole `PATCHABLE` list, so the shape is established.

`resetPosition` reads the node's default parent and index out of `defaults` and calls `move`.
`move` calls `structuralGuard(variant, "move")`, so this is base-only by construction rather than
by remembering.

### Whole-item reset

The tree row's ↺ and the inspector's **Reset to default** clear every per-node field *and* the
position — everything in the table above except the app-wide wording, which has its own ↺ two
rows up and a reach the item does not own.

That is now a defensible line rather than a silent one: the user has a separate control for the
app-wide case, sitting next to the checkbox that created it.

### Tests

- a ↺ appears next to a parameter only after it is overridden, and disappears when it is cleared
- resetting the name leaves the icon, size and position untouched — and each of the others,
  likewise, in isolation
- resetting the name restores the host element's own words, not just the label
- resetting position moves an item back to its original parent **and** index, including back into
  a container it was dragged out of
- whole-item reset clears every per-node parameter and the position, and leaves an
  everywhere-rename standing
- resetting the everywhere-rename restores the wording on every element sharing that key

## 4. Order

1. **0** — menu hierarchy. Removes three nodes, three entries and three slot registrations, and
   is what the screenshot asks for.
2. **2** — row restructure. Must precede any new row control.
3. **1** — per-node rename through a `labels` host contract, plus the guard extension.
4. **3** — reset: `resetField` and `resetPosition` first, then the per-control ↺s, then the
   whole-item reset on top of them.

## 5. Standard

Every test added here is mutation-checked before it counts: break the mechanism it names,
confirm it goes red, restore. Specifically —

- revert `target()` to a plain `querySelector` on the wrapper → the render-while-open test must fail
- make `labels.restore` a no-op → an unmount-after-rename test must fail
- put a `<button>` back inside a `[role="treeitem"]` → the structural test must fail
- skip the position restore in `resetPosition` → the moved-item reset test must fail
- make `resetField` clear every field instead of one → the isolation tests must fail
