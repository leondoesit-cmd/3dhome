/* The demo application's side of the three contracts.
 *
 * Kept apart from registry.js, which belongs to the minimal fixture the
 * reversibility tests drive: those assert on an exact string of markup, so a
 * placeable added for the demo would quietly change what they are measuring.
 * Two pages, two registries, one module.
 *
 * Nothing here imports from uikit. A registry is a description of an
 * application, written by that application — which is the point being
 * demonstrated.
 */

export function appRegistry(doc, onRun) {
  const ran = [];
  const run = (id) => {
    ran.push(id);
    if (onRun) onRun(id);
  };
  const adopt = (sel) => () => doc.querySelector(sel);

  return {
    ran,
    entries: [
      // Commands: the host's own buttons, moved rather than re-created.
      { id: "act:new", kind: "command", title: "New", icon: "file",
        adopt: adopt("#act-new"), run: () => run("act:new"), constraints: { resize: "none" } },
      { id: "act:open", kind: "command", title: "Open", icon: "folder",
        adopt: adopt("#act-open"), run: () => run("act:open"), constraints: { resize: "none" } },
      { id: "act:save", kind: "command", title: "Save", icon: "save",
        adopt: adopt("#act-save"), run: () => run("act:save"), constraints: { resize: "none" } },
      { id: "act:undo", kind: "command", title: "Undo", icon: "undo",
        adopt: adopt("#act-undo"), run: () => run("act:undo"), constraints: { resize: "none" } },
      { id: "act:redo", kind: "command", title: "Redo", icon: "redo",
        adopt: adopt("#act-redo"), run: () => run("act:redo"), constraints: { resize: "none" } },

      /* Panels. The host's stylesheet reaches these with `#side > .pane`,
         which is precisely the rule a wrapper would break — the demo carries
         it deliberately, as the smallest reproduction of why an adopted node
         is never wrapped. */
      { id: "item:tabs", kind: "panel", title: "Tabs",
        adopt: adopt("#tabs"), constraints: { resize: "none" } },
      { id: "item:layers", kind: "panel", title: "Layers",
        adopt: adopt('[data-pane-id="layers"]'), constraints: { resize: "y", minH: 40 } },
      { id: "item:notes", kind: "panel", title: "Notes",
        adopt: adopt('[data-pane-id="notes"]'), constraints: { resize: "y", minH: 40 } },
      { id: "item:info", kind: "panel", title: "Info",
        adopt: adopt('[data-pane-id="info"]'), constraints: { resize: "y", minH: 40 } },

      // A placeable with no element of its own: uikit builds the button.
      { id: "act:about", kind: "command", title: "About", icon: "info",
        run: () => run("act:about"), constraints: { resize: "none" } },
    ],
  };
}

const item = (ref) => ({ type: "item", ref });

export function appLayout() {
  return {
    v: 1,
    variants: {
      base: { root: "n:app", patch: {} },
      /* On a narrow window the sidebar folds away. One patched field, and
         everything else still follows base. */
      phone: { root: "n:app", patch: { "n:side": { hidden: true } } },
    },
    nodes: {
      "n:app": { type: "dock", children: ["n:top", "n:side"] },
      "n:top": { type: "bar", slot: "topbar", orient: "row", children: ["g:file", "g:edit"] },
      "g:file": { type: "group", label: "File", children: ["act:new", "act:open", "act:save"] },
      "g:edit": { type: "group", label: "Edit", children: ["act:undo", "act:redo"] },
      "n:side": {
        type: "stack",
        slot: "side",
        children: ["item:tabs", "item:layers", "item:notes", "item:info"],
      },
      "act:new": item("act:new"),
      "act:open": item("act:open"),
      "act:save": item("act:save"),
      "act:undo": item("act:undo"),
      "act:redo": item("act:redo"),
      "item:tabs": item("item:tabs"),
      "item:layers": item("item:layers"),
      "item:notes": item("item:notes"),
      "item:info": item("item:info"),
      // act:about is deliberately unplaced, so the palette has something in it
    },
    overrides: { text: {}, tokens: {} },
  };
}
