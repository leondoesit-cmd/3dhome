# Plan — `uikit/`: a runtime UI-designer layer, shipped as a standalone module

**Goal.** Let the *end user* move, resize, group, rename, re-icon, hide, restyle and
re-arrange any panel / toolbar / button / label in the app while the app is running — the
way a UI-UX design tool works — and ship that ability as a self-contained module that can be
dropped into an unrelated app.

---

## 0. Should it be a separate module? Yes — and here is the exact boundary

Separate is better for three concrete reasons, not just tidiness:

1. **It forces the contracts to be real.** The moment `uikit/` may not `import` from `js/`,
   every assumption about 3dhome has to become an explicit input. That is the only thing
   that makes it reusable, and it is also what keeps it from fusing into `js/ui.js`
   (4,319 lines) the way every other UI concern in this repo has.
2. **It is independently testable.** The pure half (schema, ops, undo, hit-testing, snap
   maths) runs under `node --test` with no DOM at all — the same split that made
   `js/chrome_posture.js` unit-testable across an eight-device matrix.
3. **It can be deleted.** Behind one flag, with the legacy chrome still in the DOM, a failed
   experiment costs one line.

The boundary is: **uikit owns arrangement, identity and overrides. The host owns behaviour,
styling and content.** uikit never learns what a wall is, never calls a command directly
(it calls back through an adapter), and emits only structure + CSS custom properties so
`css/styles.css` keeps winning the cascade. Break either rule and it stops being portable.

Not-a-module alternatives, rejected: a `js/ui_customize.js` next to the other 40 `ui_*.js`
files would immediately reach into `S`, `render2D()` and `fillProps()` — the repo's gravity
is very strong here — and a build-time theming system cannot do "move this button" at all.

---

## 1. What already exists (this is the part the earlier draft got wrong)

Three of the hardest pieces are already built and shipping. The plan is to **generalise and
absorb**, not to invent.

| Already there | Where | What it gives us |
|---|---|---|
| **A single command dispatcher with a global handle** | `runAction(act)` at [js/ui.js:2966](js/ui.js:2966), exposed as `window.__runAction` at [js/ui.js:2965](js/ui.js:2965) | The command adapter is ~30 lines. `mobile_shell.js`, `tool_search.js` and `interaction.js` already drive the app this way. **No handler anywhere needs rewriting.** |
| **A working dock-and-drag panel system with persistence** | [js/plan_tools_dock.js](js/plan_tools_dock.js) — 8 zones (4 edges + 4 corners), per-zone `axis`/`flow`, drag grips, drop indicator, `home3d_plan_dock` prefs, covered by [tests/plan_tools_dock.browser.mjs](tests/plan_tools_dock.browser.mjs) | The **prototype for the whole model.** Its zone/axis/flow/order vocabulary is exactly right and battle-tested; uikit generalises it from "the plan pane's 4 panels" to "any container, any node". |
| **"Adopt, don't rewrite" panel handling** | [js/mobile_shell.js:581](js/mobile_shell.js:581), [:686](js/mobile_shell.js:686), [:725](js/mobile_shell.js:725) — re-parents *real* DOM nodes into sheets and mirrors `data-act` | Proves the key trick works in this codebase: a moved panel is the same live element, so its handlers, state and `getElementById` callers keep working. |
| A capability registry | [js/core/tool_registry.js:89](js/core/tool_registry.js:89) `seedCuratedToolMetadata()` | Where the placeable catalogue plugs in. |
| 16 curated tool entries with `{id, label(en/he), icon, action, selector, location, keywords}` | [js/tool_search.js:100](js/tool_search.js:100)–149 | A ready-made seed for the palette: labels, icons and DOM selectors already paired. |
| 10 icon themes + per-icon override + a MutationObserver that re-skins late DOM | [js/icon_settings.js](js/icon_settings.js) (`home3d_icon_theme`, `home3d_icon_overrides`, `resolveIconName()` at :128) | The icon half of "re-icon anything" is **done**. uikit delegates to it rather than shipping a second icon system. |
| Attribute-driven text | `data-i18n` ×443, `data-i18n-title` ×94, `data-i18n-aria` ×36, `data-i18n-ph` ×5, `data-i18n-label` ×8 in `index.html`; applied at [js/i18n.js:86](js/i18n.js:86)–101 | The text-override layer hooks one function, not 443 call sites. |
| A label on/off toggle | `toggleToolNames()` [js/ui.js:2266](js/ui.js:2266), `mf_tool_titles` | The one existing "customise" affordance; becomes a preset knob. |
| A pure responsive posture function | [js/chrome_posture.js](js/chrome_posture.js) + `tests/chrome_posture.test.mjs` | Becomes the *variant chooser* instead of hard-coded chrome. |

**What is genuinely missing:** a user-owned layout document, arbitrary move/resize/group of
anything (not just those 4 plan panels), an editor overlay, per-node text overrides,
and a portable module boundary around all of it.

### The surface being customised

- `index.html` is 128 KB of hand-written markup: **368 `id=`**, **179 `data-act`** (151
  unique), plus generated DOM from ~40 `ui_*.js` modules.
- Layout today is CSS, not data: `#workspace { display:flex }` with `#left-sidebar` (300px)
  and `#right-inspector` (320px) fixed ([css/styles.css:431](css/styles.css:431)),
  `#topbar` a 3-column grid ([css/styles.css:348](css/styles.css:348)).
- **The model editor is a second host surface and a much harder one:** `#modeler`'s ribbon
  is built from JS template strings inside `js/modeler.js` (19,650 lines, `commandGroup()`
  at ~:5078) with its own `CAD_ICONS` set in `js/modeler_icons.js`. It is staged last, and
  it is the reason the registry must accept *generated* placeables, not only static ones.

---

## 2. The three contracts (the entire public surface)

```js
import { createUIKit } from "../uikit/index.js";

const ui = createUIKit({
  mount:    document.getElementById("app"),
  registry, // Contract A — what can be placed
  storage,  // Contract C — where the layout lives
  i18n:  { t, lang: () => getLang(), onChange },
  icons: { resolve: resolveIconName, list: () => ICON_NAMES, render: (name, el) => {} },
});
```

### Contract A — the registry (host → uikit): *what may be placed*

A flat catalogue of placeables. Every entry is one of five kinds:

```js
{ id: "act:save",                 // stable, namespaced, permanent
  kind: "command",                // command | toggle | panel | text | icon | separator | slot
  title: "Save",                  // or an i18n key
  icon: "ph-floppy-disk",
  group: "file",                  // default grouping hint
  run: () => window.__runAction("save"),
  adopt: () => document.querySelector('[data-act="save"]'), // optional: the live node
  constraints: { minW: 32, minH: 28, maxW: null, resizable: false } }
```

Three adapters produce this catalogue for 3dhome, none of which requires touching a handler:

1. **`adapters/host_3dhome/commands.js`** — walks `[data-act]` in the DOM, pairs each with
   `window.__runAction`, and enriches from `tool_registry` + the `tool_search` curated list
   (which already supplies bilingual label + icon + selector).
2. **`.../panels.js`** — a hand-written table of ~25 container ids (`#furnUI`, `#pvList`,
   `#tree`, `#warnPanel`, `#plan-toolbar`, `#layer-chips`, `#right-inspector` tabs …) each
   with `adopt: () => $(id)` and min-size constraints.
3. **`.../texts.js`** — every `[data-i18n*]` node, so labels are placeable/overridable too.

### Contract B — the layout document (uikit owns, host persists)

Versioned, diffable JSON. Nodes are addressed by id; a node is either a **container**
(dock / bar / group / stack / float) or a **leaf** bound to a registry entry by `ref`.

```json
{ "v": 1,
  "variants": {
    "base": { "root": "n:app" },
    "phone": { "root": "n:app", "patch": { "n:left": { "slot": "sheet" } } }
  },
  "nodes": {
    "n:app":    { "type": "dock", "children": ["n:topbar", "n:workspace"] },
    "n:topbar": { "type": "bar", "orient": "row", "children": ["g:file", "act:openModeler"] },
    "g:file":   { "type": "group", "label": null, "icon": null, "collapsed": false,
                  "children": ["act:newPlan", "act:save", "act:load"] },
    "act:save": { "type": "item", "ref": "act:save",
                  "label": null, "icon": null, "hidden": false, "size": null },
    "n:left":   { "type": "stack", "slot": "left", "size": { "w": 300 },
                  "children": ["panel:furnUI", "panel:tree"] }
  },
  "overrides": { "text": {}, "tokens": {} } }
```

Rules that must hold from day one:

- `label: null` / `icon: null` = **inherit from the registry**. A string = user override.
  This is what makes "reset this one node" a one-key delete, and what keeps a user's layout
  working when the app renames a command in the next release.
- **An unknown node is preserved, never dropped** — same invariant as the FeatureManager
  tree. A layout authored by a newer app version must survive a round-trip through an older
  one.
- A leaf whose `ref` no longer resolves renders as a **tombstone** in customize mode and
  nothing at all in normal mode. It is never deleted automatically.
- `variants.*.patch` is a sparse overlay on `base`, so editing at phone width edits *only*
  the phone variant and everything untouched still follows `base`.

### Contract C — storage

`{ load(key) -> doc|null, save(key, doc) -> void }`. Default `storage_local.js`
(localStorage, key `uikit_layout`). 3dhome can later swap in a project-file or cloud-profile
adapter without uikit knowing.

---

## 3. Module layout

`uikit/` at repo root: own `package.json`, vanilla ESM, **zero imports from `js/`**, no build
step — matching the rest of the codebase.

```
uikit/
  index.js              createUIKit(); the only entry point
  model/
    schema.js           node types, defaults, migrate(v)->v+1
    ops.js              pure: move, resize, group, ungroup, reorder, hide, retitle,
                        reicon, setToken, resetNode, resetAll  (doc -> doc)
    history.js          undo/redo over ops (mirrors js/edit_history.js semantics)
    validate.js         guard + unknown-node preservation
    resolve.js          (doc, registry, variant) -> resolved render tree
  runtime/
    render.js           resolved tree -> DOM, incremental keyed patch
    adopt.js            re-parent a live host node into a uikit container, and put
                        it back exactly where it was on teardown
    slots.js            named regions: top, left, right, bottom, float, overlay
    variants.js         breakpoint -> variant selection (host supplies the chooser)
    tokens.js           writes --uikit-* custom properties; never sets raw colours
  editor/
    designer.js         customize mode: overlay, hit-test, marquee + multi-select
    drag.js             pointer move; snap to slot / sibling / grid; drop indicator
    resize.js           8 handles, honours constraints.min/max
    group.js            group / ungroup / nest / collapse
    inspector.js        properties panel: label, icon, size, visibility, order, tokens
    palette.js          unused-placeables tray, searchable, drag onto any container
    a11y.js             keyboard equivalents for every gesture
  adapters/
    storage_local.js  storage_none.js
    host_3dhome/      commands.js  panels.js  texts.js  variants.js
  uikit.css             only :where() selectors + CSS vars, so host styles win
  demo/                 standalone page with a fake registry — proves portability
  tests/
  README.md
```

---

## 4. Identity — the actual hard problem

Dragging is easy. **A layout is worthless if a node's id changes between sessions or
releases.** Rules, in priority order, resolved once at adapter time:

1. `data-act="save"` → `act:save`. Stable, 151 of them, already meaningful.
2. `id="furnUI"` → `panel:furnUI`. Stable, 368 of them.
3. `data-i18n="menu_file"` → `text:menu_file`.
4. Otherwise → `path:<hash of tagName + class + ordinal chain>`, marked `weak: true`.
   Weak ids are allowed to break; when one fails to resolve the node is a tombstone, never
   a silent deletion.

**No mass edit of `index.html` is required** — that was the earlier draft's biggest
overestimate ("~200 nodes need ids assigned"). Rules 1–3 already cover essentially every
placeable worth placing. Anything that lands on rule 4 and matters gets one `id` added, one
at a time, as it comes up.

---

## 5. Text and icons

**Icons** — delegate to `js/icon_settings.js` through the `icons` contract. uikit stores
`icon: "ph-star"` on a node; rendering goes through the host's `resolve()` so the user's
chosen icon *theme* still applies to the user's chosen icon *name*. The picker lists the
Phosphor set plus `CAD_ICON_KEYS`, plus paste-your-own SVG (sanitised: parse, allow-list
`path/circle/rect/g/svg` + geometry attrs, strip everything else — never `innerHTML` of
user text).

**Text** — this app is bilingual with RTL Hebrew, so an override must not silently break the
other language:

- overrides are stored **per language**: `overrides.text = { "he": { "text:menu_file": "…" } }`.
- uikit installs one hook in front of the host's `t()` and re-applies after each
  `applyI18n()` pass, so `data-i18n` keeps working untouched.
- editing a label while `lang=he` writes only the `he` override; `en` still shows the
  shipped string. An explicit "use for all languages" checkbox writes to a `"*"` bucket.

---

## 6. Customize mode

Two modes, and normal mode must cost **nothing**:

- **Normal.** The layout doc has been applied; `editor/` is not even imported. Zero
  listeners, zero overlay.
- **Customize** (`ui.edit(true)`) — lazy-imports `editor/`, adds one overlay layer.

Gestures (all pointer-events, so touch/pen/Fold postures come free):

| | |
|---|---|
| **Move** | drag any node. Live drop indicator. Targets: slot, bar, group, stack index, or free-float (absolute rect). Reuses `plan_tools_dock`'s zone/axis/flow vocabulary. |
| **Resize** | 8 handles, clamped by `constraints`. Bars resize on one axis. A panel can never be crushed below usability. |
| **Group** | select 2+ siblings → group. A group is a real container node: movable, nestable, collapsible, labellable, icon-able. Ungroup splices children back in place. |
| **Rename / re-icon** | inline edit; icon picker (§5). |
| **Hide** | never destructive — hidden nodes stay in the doc and in the palette. |
| **Style** | token editor: density, radius, spacing, font size, accent — written as `--uikit-*` vars scoped to the node or the root. Not raw CSS. |
| **Undo/redo** | over ops, `Ctrl+Z`/`Ctrl+Shift+Z`, same semantics as `js/edit_history.js`. |
| **Reset** | per node, per container, or all. |
| **Presets** | Default / Compact / CAD / Touch, shipped as layout docs. |
| **Export/import** | `.uilayout.json`, so a layout can be shared or shipped as a preset. |

**Keyboard parity is not optional** (`editor/a11y.js`): select with Tab, move with
arrows, resize with `Shift`+arrows, group with `Ctrl+G`, reorder with `Alt`+arrows. A
designer tool that is mouse-only is unusable for the people most likely to rearrange
a UI, and it is also how the browser tests drive it deterministically.

**The escape hatch.** A user can hide the button that opens customize mode. Therefore:
`?uikit=reset` in the URL, plus a fixed `Ctrl+Alt+U`, always restore the default layout.
Non-negotiable — without it a bad drag can brick the app for that browser profile.

---

## 7. Integration into 3dhome (kept reversible at every step)

1. Existing DOM ids stay and become **slots**. `#topbar`, `#left-sidebar`,
   `#right-inspector`, `#plan-tools` are still queryable, so nothing that does
   `getElementById` breaks.
2. Panels are **adopted, not re-implemented**: `runtime/adopt.js` moves the live element and
   records its original parent + next-sibling so teardown is exact. No panel code changes.
3. Commands keep their `data-act`; the adapter routes through `window.__runAction`.
4. Feature flag `mf_uikit` (off by default). Legacy chrome stays in the tree until parity is
   proven, exactly as `legacy-chrome` / `toggleLegacy` already works.
5. `plan_tools_dock.js` is **not** touched until phase 5, and then only to re-express its
   four panels as uikit nodes — its behaviour is the acceptance test for the generalisation.

---

## 8. Phases

| # | Scope | Ships / proves | Status |
|---|---|---|---|
| 1 | `model/` + tests | schema, ops, migrate, undo, unknown-node preservation. Pure, DOM-free, `node --test`. | **done** — 47 tests in `uikit/tests/` |
| 2 | `runtime/` + `adopt.js` + `storage_local` | a hand-written doc renders and adopts real nodes; teardown restores the DOM byte-for-byte. Flagged off. | **done** — 8 tests in `tests/uikit_adopt.browser.mjs` |
| 3 | host adapter (`js/uikit_host/`) | topbar + left sidebar drive off the doc and are **visually identical** to today. This is the risky phase; it ships nothing user-visible on purpose. | **done** — 6 tests in `tests/uikit_parity.browser.mjs` | |
| 4 | `editor/`: select, move, hide, reorder + escape hatch | first user-visible customize mode. | **done** — 9 tests in `tests/uikit_customize.browser.mjs`, 9 in `uikit/tests/editor_input.test.mjs` | |
| 5 | resize, group, inspector, text/icon override | the full designer for the planner. | **done** — 9 tests in `tests/uikit_designer.browser.mjs`, 11 in `uikit/tests/editor_resize.test.mjs` |
| 5b | `plan_tools_dock` re-expressed | the dock's eight zones become uikit slots. | **done** — 7 tests in `tests/uikit_dock.browser.mjs`; the dock's own 8 still pass unchanged with the flag off | |
| 6 | variants (phone/fold/desktop), presets, export/import, token editor | `chrome_posture.js` becomes the variant chooser rather than hard-coded chrome. | **done** — 6 tests in `tests/uikit_variants.browser.mjs`, 9 in `uikit/tests/document_ops.test.mjs` | |
| 7 | `#modeler` ribbon adapter | the generated-DOM host surface. Needs `commandGroup()` to emit ids — the only place real refactoring is required. | **done** — 5 tests in `tests/uikit_ribbon.browser.mjs` | |
| 8 | `uikit/README.md`, `demo/`, extraction | runs against a fake registry with no 3dhome in the tree; ready to publish as its own repo. | **done** — 7 tests in `tests/uikit_demo.browser.mjs`; boundary enforced in `tools/link_check.mjs` | |

**All eight phases are complete.** The module is 23 files under `uikit/`, the host glue is 7
under `js/uikit_host/`, and the whole thing is behind `mf_uikit` with a menu entry that turns
it on. Coverage: 95 DOM-free tests inside the module, and 8 browser suites against the real
app — `uikit_adopt`, `uikit_parity`, `uikit_customize`, `uikit_designer`, `uikit_dock`,
`uikit_variants`, `uikit_ribbon`, `uikit_demo`.

Phases 1–2 were worth doing even if the rest had been deferred: they are self-contained and
testable.

**What phase 8 settled — and the boundary is now a build failure, not a promise.**

- **`tools/link_check.mjs` refuses any import that leaves `uikit/`.** It is the pass that
  already knows where every specifier resolves, so the rule costs a few lines there and
  cannot drift. Verified by planting an import and watching the build fail. Traffic the other
  way is fine and expected: `js/uikit_host/` is host glue and imports from both sides.
- **`uikit/demo/index.html` is a real application, not a fixture.** Its own element names, its
  own stylesheet, no framework, nothing imported from this project — and it deliberately
  carries a `#side > .pane` rule, the smallest reproduction of why an adopted node is never
  wrapped. It is kept separate from `demo/fixture.html`, which the reversibility tests drive
  and which asserts on an exact string of markup.
- **Extraction was tested, not assumed.** `uikit/` copied to an empty directory runs its own
  95 tests with no repo around it.

The only mentions of 3dhome left inside `uikit/` are in comments, naming the concrete case a
rule exists for. Those are the module's best asset and they stay.

**What phase 7 settled.**

The generated-DOM surface needed **no new capability** — only the identity `js/modeler.js`
was not emitting. Everything else came from phase 5b: slots that register at runtime, and a
container whose slot is absent rendering nothing. `js/uikit_host/ribbon.js` is the same shape
as `dock.js`, and that it is the same shape is the result worth keeping.

- **The refactor the plan predicted was one function.** `commandGroup(label, …)` became
  `commandGroup(key, …)` and stamps `data-mdgroup`. The key is what is stable: it does not
  move when the wording is edited and it does not differ between English and Hebrew, so a
  saved layout still resolves after a release. Fourteen call sites, and the label lookup moved
  from each of them into the function.
- **The lifecycle is two different things, and both matter.** Closing the editor HIDES its
  root — uikit is still holding live elements, and nothing needs to happen. A language change
  DESTROYS it, because every caption was baked in at build time, so `ribbon.detach()` runs
  before `root.remove()`: unregister first, and uikit hands the groups back into the tree
  that is about to go rather than being left holding them in a detached one. A layout made
  against one ribbon is reapplied to the completely different elements the next one builds.
- **One document, not two.** The ribbon's groups are nodes in the same layout as the
  planner's panels, so there is one customize mode, one undo history and one export across
  both. A second instance would have meant two of each, and two escape hatches to remember.

**What phase 6 settled.**

- **`chrome_posture.js` really is the variant chooser now.** An edit made at phone width
  writes a sparse patch on the `phone` variant and touches neither `base` nor the shared
  node; the wide layout is waiting untouched when the window grows back. The inspector says
  which breakpoint is being edited and marks anything but `base` as *this size only* —
  otherwise the user's only way to learn that rule is to wonder why a change did not follow
  them.
- **A preset is a DIFFERENCE, not a document.** They are built by applying ops to the shipped
  layout, so every node the default has, a preset has. Written out as literals they would be
  copies that silently stop being copies: add a panel to the app and every hand-written
  preset is missing it, with nothing to say so.
- **The token editor edits the HOST's variables, not uikit's.** `--accent` is read by 620
  rules in `css/styles.css`; written on the layout root it cascades over `:root` and retints
  the whole app without one of those rules changing. uikit still never invents a colour — the
  allow-list is declared in `js/uikit_host/presets.js`, and an undeclared name is refused
  rather than quietly written. Adding a knob is adding a line there.
- **Export is pretty-printed**, because a layout is meant to be diffable and hand-editable —
  that is most of why it is a flat document. Import goes through the same `normalizeDoc` path
  as storage, so a file from a newer build keeps the fields this one cannot read.

**What phase 5b settled.**

The split held: the dock kept flush edges, join borders, the axis that turns a tool column
into a tool row, and the measure-both-ways fit; the document took over which panel is in
which zone and in what order. `members()` and `dock()` turned out to be the only two points
that needed touching — everything else in that file is geometry.

Three rules came out of it, all of them general rather than dock-specific:

- **A container whose slot is absent renders nothing** (and is reported by `missingSlots()`).
  On a phone the dock tears its zones down; falling back to a box of its own would have put
  the pane's floating tool panels in the middle of the app shell.
- **Slots can be registered and unregistered at runtime.** A registry fixed at `mount()`
  cannot describe a region that comes and goes with the posture.
- **uikit only unhides what uikit hid.** A borrowed element's visibility is often the host's
  own business — the dock shows and hides the wall palette with the active tool — and writing
  `hidden = false` on every pass dragged it back on screen a frame after the app hid it. The
  converse needed the dock's cooperation: two independent reasons to hide a panel, OR'd in
  the one place that writes it.

**Off by default still means off.** Everything here is gated on uikit being live, so the
dock's own eight tests describe the shipped behaviour unchanged. A layout arrangement made
before any of this existed is read once out of `home3d_plan_dock` to seed a fresh document,
so nobody's docked corner is silently reset.

**What phase 5 settled, and why the dock was split out.**

- **A user's size has to outrank the host.** `#left-sidebar { width: 300px }` is specificity
  1-0-0, so a rule at `:where()`'s zero could never move it and every drag of that edge would
  do nothing visible. Sized nodes now carry `data-uikit-sized="w"|"h"|"wh"` and get an
  `!important` width or height — the second and last place uikit deliberately outranks the
  host, for the same reason as the first (`hidden`): the user asked for it. Scoped per axis,
  so resizing a height never pins a width nobody chose.
- **The resize axis is declared, not inferred.** You widen a sidebar and heighten a toolbar;
  offering the other edge is a promise the layout cannot keep. The host says so
  (`constraints.resize`), because the host is what knows its own chrome — the three topbar
  columns are grid tracks and offer no handles at all. Geometry could not answer this: the
  layout document is a logical tree, and `#left-sidebar` is a child of `n:app` in the
  document while sitting two elements deeper in the DOM.
- **Two kinds of rename, kept apart.** `retitle()` renames *this placement*; `setText()`
  renames *the string everywhere*, stored per language. The inspector's checkbox is the
  difference, and both are independent edits on the same node.

**Why 5b was its own phase.** `plan_tools_dock.js` is not a port; it is a richer model than
uikit has. Its eight zones carry `data-flush` (which borders and corner radii are dropped
where a panel meets the pane edge), `data-join` between neighbours, `data-give`, a per-zone
`axis` that changes each panel's *internal* layout, `data-rev` for right- and bottom-flush
zones, and a measurement pass that flips the axis to measure and flips back. "Flush is the
whole point," as that file says. Absorbing all of it would bloat the module with concepts
specific to panels floating over a canvas.

The right shape is the inverse: **the dock registers its eight zones as uikit slots** and
keeps owning flush/join/axis rendering, while the layout document owns which panel sits in
which zone and in what order. That is a small, honest design — and it still needs
dynamically registered slots, reconciling `home3d_plan_dock` with the uikit document, and
merging two drag implementations. Half-doing it would break the ten tests in
`tests/plan_tools_dock.browser.mjs` that pin the behaviour it is supposed to preserve.

**What phase 4 settled.**

- **The overlay draws; it never contains.** Handles are boxes painted in a fixed layer from
  each node's `getBoundingClientRect()`, which is forced by the same rule as phase 3 — an
  adopted node is the host's element, so uikit chrome can go neither inside it nor around it.
  Pointers are intercepted on the document in the **capture phase**, so clicking Save while
  customizing selects it instead of saving, without uikit knowing what any host handler is.
- **Every gesture is a command**, so pointer and keyboard cannot drift, and the browser tests
  assert what an *edit* did rather than what a sequence of coordinates did. The geometry that
  decides where a drop lands is pure arithmetic tested without a DOM.
- **A hidden node stays on screen while customizing**, marked instead of removed. Something
  that vanishes the instant it is hidden can only be recovered through undo, and only if the
  user works out that is what happened.
- **The stylesheet is injected by the host adapter**, not linked from `index.html`, so a page
  with the flag off pays nothing. This was found by a test, not by design: `uikit.css` had
  never been loaded at all, which left the fixed full-viewport overlay at
  `pointer-events: auto` — it would have swallowed every click in the app.

Entry is `Ctrl+Alt+E`, deliberately not a toolbar button: adding a control to the chrome is a
design decision about the app, and phase 3's claim is that the chrome is unchanged.

**What phase 3 settled, and what it cost.**

Three corrections came out of contact with the real `index.html`:

- **The host adapter lives in `js/uikit_host/`, not `uikit/adapters/host_3dhome/`.** §3's
  file layout contradicted §0's load-bearing rule — the adapter needs `tool_search`,
  `chrome_posture` and `i18n`, so putting it inside `uikit/` would have meant `uikit/`
  importing from `js/`. The rule is the architecture; the folder was incidental. Host glue
  is the host's code, and extraction later is now moving a directory rather than
  disentangling one.
- **Adopted elements are never wrapped.** The obvious renderer — one uikit `<div>` per node
  — is unusable against a real stylesheet. `#left-sidebar > .panel-section { display: none }`
  plus a `[data-left-pane]` rule *is* the left-pane switcher, and one wrapper shows every
  pane at once. `display: contents` does not help: it removes the box, not the element, and
  selector matching never sees display. 31 rules in `css/styles.css` use a child combinator
  from a container uikit would own. So **the node IS the element** — the host's own element
  for an adopted node, a bound *slot* (`#topbar`, `#left-sidebar`, `#app`) for a container,
  one uikit created only where nothing existed. Only created elements carry
  `class="uikit-node"`, so no rule in `uikit.css` can reach a borrowed element. Customize-mode
  handles will be drawn in the overlay from each node's rect, which is what a design tool
  does anyway.
- **No markup changed.** The plan budgeted for adding ids to `index.html`; curated selectors
  turned out to be just as stable and more readable, so the parity claim is a fact about
  uikit rather than about edits made to help it along. The render adds **zero** elements to
  the document.

That last point is the phase-3 result worth keeping: with the flag on, every measured box,
computed display and child order is identical, and the whole render is borrowed elements.

**What phases 1–2 settled.** Two things were decided by writing them rather than by
argument. The float question in §9 is closed: a floating node is a node in the `overlay`
slot with an absolute rect, never `position: fixed`. And `createUIKit()` now touches nothing
until `mount()` is called — building an instance to read its document must not tag a single
host element, which the borrowed-slot test caught. `demo/fixture.html` is the standalone
page phase 8 needs; it imports nothing from `js/`, so a hidden dependency on 3dhome breaks it
before it breaks anything else.

---

## 9. Risks and decisions to lock before writing code

- **The registry is the hard part, not the dragging.** Budget accordingly. Phase 3 has no
  user-visible payoff and is the phase most likely to be abandoned halfway — which would
  leave the app with two chrome systems. Do not start phase 4 until 3 is at parity.
- **uikit must not own styling.** Structure + CSS vars only, `:where()` for defaults so
  specificity stays at zero and `css/styles.css` (707 KB) keeps winning. The first time
  uikit ships a colour, portability is gone.
- **Never migrate an unknown node away.** An old doc from another app must round-trip.
- **Adoption must be exactly reversible.** Record parent + nextSibling; restore on teardown.
  A half-restored DOM is worse than no feature. Assert it in a browser test.
- **Perf.** Incremental keyed patch; editor lazy-imported; no observers in normal mode.
  Gate with the existing `tools/perf_harness.mjs` / `perf-baseline.json`.
- **`tools/module_check.mjs` must cover `uikit/`** from the first commit — a bad file split
  in this repo silently kills the UI, which is exactly what that gate exists for.
- **Open question to decide in phase 1:** does a floating panel get a real `position:fixed`
  rect (simple, but escapes the host's stacking/scroll contexts), or a portal into an
  overlay slot (safer, more machinery)? Recommendation: overlay slot — `#ctx-menu` and the
  portaled topbar dropdowns already established that pattern here.

## 10. Tests

- `uikit/tests/*.test.mjs` — ops, schema, migrate, undo, id derivation, snap maths, variant
  resolution. No DOM.
- `tests/uikit_adopt.browser.mjs` — adopt → move → teardown restores the DOM exactly.
- `tests/uikit_customize.browser.mjs` — drive customize mode through the keyboard API, then
  assert the resulting doc; reload and assert it reapplies.
- `tests/uikit_parity.browser.mjs` — phase 3 gate: flag on vs. off produces the same
  bounding boxes for the topbar and sidebars.
- Wire into `npm run ci` alongside the existing 170 test files.
