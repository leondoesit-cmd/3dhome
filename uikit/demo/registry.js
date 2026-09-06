/* A host registry with no host: the five kinds of placeable, backed by plain
   DOM and plain functions.
 *
 * This exists to prove the module is actually portable. It imports nothing
 * from 3dhome, and the fixture page it drives has no application behind it —
 * if uikit ever grows a hidden dependency on the planner, this stops working
 * before anything else does. */

export function demoRegistry(doc, onRun) {
  const ran = [];
  const el = (id) => doc.getElementById(id);
  const run = (id) => {
    ran.push(id);
    if (onRun) onRun(id);
  };

  return {
    ran,
    entries: [
      /* Adopted: a live element the host already built and still owns. This is
         the kind that matters — the other four are conveniences. */
      { id: "act:save", kind: "command", title: "Save", icon: "save",
        adopt: () => el("host-save"), constraints: { minW: 32, minH: 28 } },
      { id: "act:load", kind: "command", title: "Load", icon: "load",
        adopt: () => el("host-load") },
      { id: "panel:notes", kind: "panel", title: "Notes", icon: "notes",
        adopt: () => el("host-notes"), constraints: { minW: 180 } },

      // Built by uikit from metadata alone.
      { id: "act:new", kind: "command", title: "New", icon: "new",
        run: () => run("act:new") },

      // Rendered by the host into a box uikit provides.
      { id: "widget:clock", kind: "panel", title: "Clock",
        render(host) {
          host.textContent = "12:00";
          return () => host.replaceChildren();
        } },
    ],
  };
}

export function demoLayout() {
  return {
    v: 1,
    variants: {
      base: { root: "n:app", patch: {} },
      phone: { root: "n:app", patch: { "n:side": { slot: "bottom" } } },
    },
    nodes: {
      "n:app": { type: "dock", children: ["n:top", "n:side"] },
      "n:top": { type: "bar", slot: "top", orient: "row",
                 children: ["g:file", "act:new", "sep:1", "widget:clock"] },
      "g:file": { type: "group", label: "File", children: ["act:save", "act:load"] },
      "sep:1": { type: "separator" },
      "n:side": { type: "stack", slot: "left", size: { w: 220 }, children: ["panel:notes"] },
      "act:save": { type: "item", ref: "act:save" },
      "act:load": { type: "item", ref: "act:load" },
      "act:new": { type: "item", ref: "act:new" },
      "panel:notes": { type: "item", ref: "panel:notes" },
      "widget:clock": { type: "item", ref: "widget:clock" },
    },
    overrides: { text: {}, tokens: {} },
  };
}
