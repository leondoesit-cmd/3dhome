# uikit

A runtime UI-designer layer: let the people using an application move, resize,
group, rename, re-icon, hide and re-theme its own chrome, and keep what they
built.

It is not a component library and not a theming system. It rearranges the
elements an application already has.

```js
import { createUIKit } from "./uikit/index.js";

const ui = createUIKit({
  mount: document.getElementById("app"),
  registry,                       // what may be placed
  storage,                        // where the layout lives
  defaults: shippedLayout(),      // what it looks like before anyone touches it
});
ui.mount();
await ui.edit(true);              // customize mode
```

---

## The one idea

**The node IS the element.** When a layout places your Save button, it moves
*your* button — the same DOM node, with its listeners, its state and its
scroll position intact. It is not wrapped in anything, and nothing is
re-created from a description of it.

That is not an optimisation. It is what makes the module usable against a real
stylesheet. The obvious design — one `<div>` per node, host element inside —
survives about five minutes of contact with an application, because a host's
CSS is written against the host's own tree. One real example, from the app this
was built for:

```css
#left-sidebar > .panel-section            { display: none }
#left-sidebar[data-left="x"] > [data-left-pane="x"] { display: flex }
```

That is the entire left-hand pane switcher. Put one wrapper around each panel
and no `>` matches any more: every pane shows at once. `display: contents` does
not help — it removes the wrapper's *box*, not the wrapper, and selector
matching never sees display at all. Thirty-one rules in that one stylesheet use
a child combinator from a container uikit would own.

So:

| | |
|---|---|
| adopted leaf | the host's own element, in the host's own tree position |
| built leaf | an element uikit created (a button, a separator, a tombstone) |
| bound container | a **slot** — `#topbar`, `#left-sidebar` — the container does not create a box, it *is* the region the host already had |
| free container | an element uikit created |

Only elements uikit created carry `class="uikit-node"`, so no rule in
`uikit.css` can reach a borrowed one. Customize-mode handles are drawn in an
overlay from each node's rect, the way a design tool does it — which is the
only version that works when the node is a host element you may not wrap.

**Adoption is exactly reversible.** Unmount and the host gets byte-identical
markup back: same elements, same parents, same order, same whitespace. That is
asserted, not asserted-to.

---

## The three contracts

Everything uikit knows about your application arrives through these. It has no
other way to find out anything, which is what lets it be dropped into a
different one.

### 1. Registry — what may be placed

A flat catalogue. `get(id)` and `ids()`, or just an array.

```js
{ id: "act:save",
  kind: "command",              // command | toggle | panel | text | icon | separator
  title: "Save",
  icon: "save",                 // a NAME; uikit never learns what it looks like
  textKey: "menu_save",         // the string an "everywhere" rename targets
  adopt: () => document.querySelector('[data-act="save"]'),
  run: () => yourApp.save(),
  constraints: { minW: 180, minH: 40, resize: "y" } }
```

`adopt` is resolved on every render, not captured once: a panel can be replaced
by the code that owns it, and a stale reference means adopting a node that is
no longer in the document.

`constraints.resize` is `"x" | "y" | "both" | "none"`. **The default is
`"both"`** — every edge and every corner — because a user size is written with
`!important` and both axes really are honoured. Declare one only where your
chrome genuinely cannot take it: a fixed grid track is `"none"`, a sidebar you
want widened but never heightened is `"x"`. Nothing is pinned on your behalf.

### 2. Layout document — uikit owns it, you persist it

Versioned, flat, diffable JSON.

```json
{ "v": 1,
  "variants": { "base":  { "root": "n:app", "patch": {} },
                "phone": { "root": "n:app", "patch": { "n:left": { "hidden": true } } } },
  "nodes": {
    "n:app":  { "type": "dock", "children": ["n:top", "n:left"] },
    "n:top":  { "type": "bar", "slot": "topbar", "children": ["g:file"] },
    "g:file": { "type": "group", "label": null, "children": ["act:save"] },
    "act:save": { "type": "item", "ref": "act:save", "label": null, "hidden": false }
  },
  "overrides": { "text": {}, "tokens": {} } }
```

Rules that hold everywhere:

- **`null` means inherit**, not empty. A string is a user override. That is why
  "reset this node" is a key delete, and why a saved layout keeps working when
  you rename a command in the next release: the user pinned the *position*, not
  the wording.
- **Unknown is not invalid.** Node types, keys and refs this build has never
  heard of survive a load-save-load round trip. A layout written by a newer
  version of your app loads in an older one without losing what it cannot show.
- **A missing ref is a tombstone**, never a deletion. Visible in customize mode,
  invisible outside it.
- **Structure is shared; presentation is not.** A variant may patch how a node
  looks and where it sits, never what the tree is made of. One tree with four
  presentations is something a person can hold in their head; four trees is four
  layouts to keep in sync by hand.

### 3. Storage — where it lives

```js
{ load(key), save(key, doc), clear(key) }
```

`createLocalStorage()` ships with it. Every access is wrapped, because
localStorage *throws* in a private window rather than returning null.

---

## Slots

A slot is a region of your page a layout can dock into — your element or one
uikit makes.

```js
createUIKit({ slots: { topbar: "#topbar", left: "#left-sidebar" },
              slotNames: ["topbar", "left"] });

ui.registerSlot("panel:zone-3", el);   // regions that come and go
ui.unregisterSlot("panel:zone-3");
```

**A container whose slot is absent renders nothing** — it is not given a box of
its own, and `ui.missingSlots()` reports it. That rule is what lets a layout
describe regions that only exist sometimes: a dock that stands down on a phone,
a ribbon that exists only while an editor is open. Unregister *before* you
remove the elements, and uikit hands back what it borrowed on the way out.

---

## Customize mode

`await ui.edit(true)`. The editor is imported the first time it is switched on
and never otherwise, so a user who never customizes anything never pays for it.
In normal mode there is no overlay, no pointer listener and no observer.

Pointers are intercepted in the **capture phase**, so clicking Save selects it
instead of saving — without uikit knowing what any of your handlers are.

Every gesture is a command, and each has a key, so the two cannot drift and a
test can assert what an *edit* did rather than what a sequence of coordinates
did.

| | |
|---|---|
| `Tab` / `Shift+Tab` | step through nodes |
| arrows | move within the group |
| `Alt`+arrow | move to the neighbouring group |
| `Delete` | hide / show |
| `Ctrl/Cmd+G` / `+Shift+G` | group / ungroup |
| `Ctrl/Cmd+Z` / `+Shift+Z` | undo / redo |
| `Esc` | leave |

Letters are matched on `event.code`, the physical key. On macOS `Option+E` is a
dead key for the acute accent, so `event.key` is `"´"` and any shortcut written
against the letter silently never fires there.

### The escape hatch

A user can hide the control that opens customize mode, or drag the chrome into
a state they cannot use — and the layout is restored from storage on every
reload, so it stays that way.

- **`?uikit=reset`** in the URL, checked *before* the saved document is read.
- **`Ctrl/Cmd+Alt+U`**, on the document, because the mount is exactly the region
  a broken layout may have made unreachable.

Non-negotiable. Pass `escapeHatch: false` only if you provide your own.

---

## Theming

uikit writes CSS custom properties on the layout root and nothing else. Never a
colour of its own.

```js
tokens: [
  { name: "--accent", label: "Accent", type: "color", fallback: "#4f46e5" },
  { name: "--gap", label: "Spacing", type: "length", min: 0, max: 16, unit: "px" },
]
```

Declaring `--accent` is what makes a theme editor possible: in the host this was
built for, that variable is read by 620 rules, and writing it on the root
cascades over `:root` and retints the whole application without one of those
rules changing. An undeclared name is **refused**, not quietly written — and
values that could close a declaration or name a resource are refused whatever
the name, because layouts get imported from files.

---

## Presets, export, import

```js
presets: [{ id: "compact", label: "Compact", doc: () => buildCompact() }]
ui.applyPreset("compact");     // replaces the document; undoable
ui.exportLayout();             // pretty-printed JSON
ui.saveNamedLayout("My workspace"); // saves a separate named snapshot; returns false if storage fails
ui.savedLayouts();              // [{ id, name }], stored independently from the active layout
ui.loadNamedLayout(id);         // restores a snapshot as an undoable edit
ui.importLayout(text);         // -> { ok, problems }
```

Build presets by applying ops to your shipped layout rather than writing them
out. A preset kept as a literal is a copy of the default that silently stops
being one: add a panel to the app and every hand-written preset is missing it,
with nothing to say so.

---

## Layout

```
index.js            createUIKit() — the only entry point
model/              pure, no DOM: schema, validate, ops, history, resolve
runtime/            adopt, render, slots, tokens, variants, keys
editor/             lazy: designer, drag, resize, ghost, group, inspector, a11y
adapters/           storage_local, storage_none
demo/               a standalone application that imports nothing else
tests/              node --test, DOM-free
uikit.css           structure only, :where() throughout
```

`model/` is a pure function of a JSON document, so the whole edit surface —
every op, undo, the drop geometry, the key mapping, the resize arithmetic — is
tested without a browser. What needs a real DOM is adoption, and that has its
own browser tests.

**Ops return the same object when nothing changed.** `if (next === doc) return;`
is how a drag that ends where it started avoids a history step and a repaint.

**History is a tree, not a stack.** Editing after an undo forks rather than
destroying; the branch you rolled past is still there. Snapshots are the
document *objects* — ops never mutate, so every state is already an immutable
value and there is no stringify on every keystroke.

---

## Boundary

Nothing under `uikit/` imports from outside `uikit/`. That is checked
statically, not just intended — see the uikit rule in `tools/link_check.mjs`,
which fails the build on any import that leaves the directory.

Host-specific glue lives in the host. In this repo that is `js/uikit_host/`,
which may import from both sides; `uikit/` stays droppable into an application
that has never heard of this one. `demo/` is the proof that runs: a small app
with its own names, its own stylesheet, and no dependency on this project.

Two files disagreeing about this is how a "standalone" module quietly stops
being one, so it is a build failure rather than a code-review note.
