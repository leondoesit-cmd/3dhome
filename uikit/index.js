/* uikit — a runtime UI-designer layer.
 *
 * createUIKit() is the only entry point, and it takes the three contracts the
 * module is built around and nothing else:
 *
 *   registry  what may be placed          (the host says what its UI is made of)
 *   storage   where the layout lives      (the host says where to keep it)
 *   layout    a document uikit owns       (versioned JSON, see model/schema.js)
 *
 * It has no imports from the host application, by rule. Everything it needs to
 * know about the app arrives through those contracts, which is what lets the
 * same module be dropped into an unrelated one — and, just as importantly, is
 * what stops it slowly growing a dependency on the app it was written for.
 *
 * WHAT IT DOES NOT DO. Behaviour, styling and content stay with the host.
 * uikit moves the host's own elements, gives them structure, and writes
 * `--uikit-*` custom properties. It never sets a colour, never calls a command
 * directly, and never re-implements a panel it was asked to arrange.
 *
 * The editor is not loaded here. In normal mode there is no overlay, no
 * pointer listener and no observer — the layout is applied and then uikit is
 * inert. Customize mode lazy-imports editor/ when it is first switched on.
 */

import * as ops from "./model/ops.js";
import { createHistory } from "./model/history.js";
import { emptyDoc } from "./model/schema.js";
import { resolve } from "./model/resolve.js";
import { normalizeDoc } from "./model/validate.js";
import { createAdopter } from "./runtime/adopt.js";
import { createRenderer } from "./runtime/render.js";
import { createSlots } from "./runtime/slots.js";
import { createVariants } from "./runtime/variants.js";
import { accel, matchesLetter } from "./runtime/keys.js";
import { createNullStorage } from "./adapters/storage_none.js";

export { createLocalStorage } from "./adapters/storage_local.js";
export { createNullStorage } from "./adapters/storage_none.js";
export { ops };
export { emptyDoc, makeNode, DOC_VERSION } from "./model/schema.js";
export { normalizeDoc } from "./model/validate.js";
export { resolve, unplaced } from "./model/resolve.js";

export function createUIKit(options) {
  const opts = options || {};
  const mount = opts.mount;
  if (!mount || mount.nodeType !== 1) throw new TypeError("uikit: mount must be an element");

  const registry = opts.registry || [];
  const storage = opts.storage || createNullStorage();
  const storageKey = opts.key || "layout";
  const i18n = opts.i18n || null;
  const defaults = opts.defaults || null;
  /* Variables the host is willing to let a user retheme, and the layouts it
     ships as starting points. Both are the host's vocabulary, not uikit's. */
  const getPresets = () => (typeof opts.presets === "function" ? opts.presets() : Array.isArray(opts.presets) ? opts.presets : []);
  const getTokens = () => (typeof opts.tokens === "function" ? opts.tokens() : Array.isArray(opts.tokens) ? opts.tokens : []);
  const tokenSpecs = getTokens();
  const presets = getPresets();
  const allowedTokens = tokenSpecs.map((spec) => spec.name).filter(Boolean);

  let doc = null;
  let problems = [];
  let edit = false;
  let mounted = false;
  let frame = 0;

  const adopter = createAdopter();

  /* Slots are built by mount(), not here. Constructing a uikit instance must
     not touch a single node of the host's DOM: a borrowed slot is TAGGED with
     data-uikit-slot when it is claimed, and doing that in the constructor
     meant an application that merely created an instance — to read its
     document, to decide whether to enable the feature at all — had already
     been modified. `slotsView` is the indirection that lets the renderer be
     built once while the slots behind it come and go with mount/unmount. */
  let slots = null;
  const slotsView = {
    get: (name) => (slots ? slots.get(name) : null),
    has: (name) => (slots ? slots.has(name) : false),
    names: () => (slots ? slots.names() : []),
  };

  /* Slots the host adds and removes while the page is up. Pending
     registrations are remembered so a host that offers a region before uikit
     has mounted is not simply ignored. */
  const pendingSlots = new Map();

  const renderer = createRenderer({
    mount,
    slots: slotsView,
    adopter,
    icons: opts.icons || null,
    /* Optional. Without it a per-node rename still shows everywhere uikit
       draws — tree, breadcrumb, inspector, overlay tag — and simply does not
       reach the host's own element, which is the behaviour before this
       contract existed. */
    labels: opts.labels || null,
    onRun: opts.onRun || null,
    allowedTokens,
  });

  const history = createHistory({
    doc: null,
    cap: opts.historyCap,
    onChange: opts.onHistoryChange || null,
  });

  const variants = createVariants({
    window: opts.window,
    choose: opts.variants && opts.variants.choose,
    onChange: () => schedule(),
  });

  /* Renders are coalesced to one per frame. A language change, a variant
     change and an op can all land in the same tick, and each one on its own
     would otherwise walk and patch the whole tree. */
  function resetRequested() {
    if (opts.escapeHatch === false) return false;
    const view = opts.window || (typeof window !== "undefined" ? window : null);
    const search = view && view.location && view.location.search;
    if (!search) return false;
    try {
      return new URLSearchParams(search).get("uikit") === "reset";
    } catch (_) {
      return false;
    }
  }

  /* Ctrl+Alt+U (Cmd+Alt+U on a Mac) is the same door from inside a running
     page. Installed on the document rather than the mount, because the mount
     is exactly the region a broken layout may have made unreachable.
   *
     Matched on the physical key: macOS turns Option+U into a dead key for the
     umlaut, so `e.key` is "¨" and a shortcut written against the letter is
     unreachable on the platform — silently, which is the worst way for an
     escape hatch to fail. */
  function onEscapeKey(e) {
    if (!accel(e) || !e.altKey) return;
    if (!matchesLetter(e, "u")) return;
    e.preventDefault();
    api.resetAll();
  }

  function schedule() {
    if (!mounted || frame) return;
    const raf = (opts.window || globalThis).requestAnimationFrame;
    if (typeof raf !== "function") {
      frame = 0;
      refresh();
      return;
    }
    frame = raf(() => {
      frame = 0;
      refresh();
    });
  }

  let lastResolved = null;
  let lastRender = null;

  function refresh() {
    if (!mounted || !doc) return null;
    lastRender = null;
    const resolved = resolve(doc, {
      registry,
      variant: variants.current(),
      lang: i18n && typeof i18n.lang === "function" ? i18n.lang() : null,
      edit,
    });
    lastRender = renderer.update(resolved);
    lastResolved = resolved;
    if (api._editor && edit) api._editor.sync();
    /* After the DOM is settled, not before: a host that lays out around what
       uikit placed — the plan dock measuring its zones — has to run second or
       it measures the previous arrangement. */
    if (typeof opts.onRender === "function") opts.onRender(resolved, lastRender);
    return resolved;
  }

  function adopt(next, options2) {
    const report = normalizeDoc(next);
    doc = report.doc;
    problems = report.problems;
    if (!options2 || options2.record !== false) history.reset(doc, (options2 && options2.label) || "");
    schedule();
    return doc;
  }

  let stopLang = null;

  const api = {
    get doc() {
      return doc;
    },
    get problems() {
      return problems;
    },
    get history() {
      return history;
    },
    get variant() {
      return variants.current();
    },
    get editing() {
      return edit;
    },

    /* Load the saved layout, falling back to the host's shipped default. A
       stored document is normalized before it is trusted: it may have been
       written by another build, hand-edited, or half-written by a crash. */
    load() {
      /* THE ESCAPE HATCH. A user can hide the very control that opens customize
         mode, or drag the chrome into a state they cannot use. Without a way in
         that does not depend on the UI, one bad gesture bricks the app for that
         browser profile — and the layout is restored from storage on every
         reload, so it stays bricked. `?uikit=reset` is checked HERE, before the
         saved document is read, because by the time anything is on screen it is
         already too late to be sure a control is reachable. */
      if (resetRequested()) {
        storage.clear(storageKey);
        return adopt(defaults || emptyDoc(), { label: "Reset" });
      }
      const saved = storage.load(storageKey);
      if (!saved) return adopt(defaults || emptyDoc(), { label: "Default" });
      /* A saved layout names nodes by the HOST's ids. When the host renames one
         or changes what contains what, every document already in a user's
         browser describes a shape that no longer exists — and the honest
         failure modes make it look like data loss: a node whose entry has gone
         resolves to a tombstone, a container whose slot is absent renders
         nothing. uikit cannot repair that without learning the host's
         vocabulary, which is exactly what it must not do, so the host is given
         the loaded document and hands back one in the shape it now ships. */
      const migrated = typeof opts.migrateDocument === "function"
        ? (opts.migrateDocument(saved) || saved)
        : saved;
      return adopt(migrated, { label: "Loaded" });
    },

    /* Back to the layout the host shipped. Not undoable on purpose: it is the
       thing you reach for when the document is the problem, and an undo stack
       that can put the problem back is not a way out. */
    resetAll() {
      storage.clear(storageKey);
      adopt(defaults || emptyDoc(), { label: "Reset" });
      /* Rendered now, not on the next frame. Every other change can wait for
         the coalescing pass, but this one is what someone types when the UI is
         already unusable — an escape hatch that takes effect "shortly" reads
         as one that did not work, and invites them to press it again. */
      refresh();
      return doc;
    },

    setDoc(next, label) {
      return adopt(next, { label: label || "" });
    },

    save() {
      return doc ? storage.save(storageKey, doc) : false;
    },

    /* The one way the document changes. `next` comes from ops.js, which
       returns the SAME object when nothing changed — so a gesture that ended
       where it started costs no history step, no save and no repaint. */
    apply(label, next, tag) {
      if (!next || next === doc) return doc;
      history.apply(label, next, tag);
      doc = history.doc;
      api.save();
      schedule();
      return doc;
    },

    undo() {
      const next = history.undo();
      if (!next) return null;
      doc = next;
      api.save();
      schedule();
      return doc;
    },

    redo() {
      const next = history.redo();
      if (!next) return null;
      doc = next;
      api.save();
      schedule();
      return doc;
    },

    setVariant(name) {
      if (variants.set(name)) schedule();
      return variants.current();
    },

    /* Customize mode. The editor is imported the first time it is switched on
       and never in normal mode, so a user who never customizes anything never
       pays for the code that would let them. */
    async edit(on) {
      const want = !!on;
      if (want === edit) return edit;
      edit = want;
      if (edit && !api._editor) {
        const mod = await import("./editor/designer.js").catch(() => null);
        api._editor = mod
          ? mod.createDesigner({
              uikit: api, mount, renderer, slots: slotsView, ops,
              icons: opts.icons || null,
              names: opts.names || null,
              holdOpen: opts.holdOpen || null,
              surfaces: opts.surfaces || null,
              tokens: () => getTokens(),
              exportName: opts.exportName || storageKey,
              /* A host t() that answers a missing key WITH the key — which is
                 what this app's does — would put "uikit_ins_label" on screen
                 as a field name. Fall back to the module's own English so a
                 host that has not translated uikit yet still reads. */
              t: i18n && typeof i18n.t === "function"
                ? (key, fallback) => {
                    const value = i18n.t(key);
                    return value == null || value === key ? fallback : value;
                  }
                : null,
              lang: i18n && typeof i18n.lang === "function" ? i18n.lang : () => null,
            })
          : null;
      }
      mount.classList.toggle("uikit-editing", edit);
      refresh();
      if (api._editor) api._editor.setActive(edit);
      if (typeof opts.onEditChange === "function") opts.onEditChange(edit);
      return edit;
    },

    mount() {
      if (mounted) return api;
      mounted = true;
      mount.classList.add("uikit-root");
      slots = createSlots(mount, opts.slots, { names: opts.slotNames });
      for (const [name, el] of pendingSlots) slots.register(name, el);
      if (i18n && typeof i18n.onChange === "function") stopLang = i18n.onChange(() => schedule());
      if (opts.escapeHatch !== false) mount.ownerDocument.addEventListener("keydown", onEscapeKey, true);
      variants.watch();
      if (!doc) api.load();
      else refresh();
      return api;
    },

    /* Give the host back exactly the DOM it lent us. Order matters: adopted
       elements go home before the wrappers around them are removed, and the
       slots uikit created go last so nothing is restored into a subtree that
       has already been detached. */
    unmount() {
      if (!mounted) return [];
      mounted = false;
      if (frame && (opts.window || globalThis).cancelAnimationFrame) {
        (opts.window || globalThis).cancelAnimationFrame(frame);
      }
      frame = 0;
      variants.stop();
      mount.ownerDocument.removeEventListener("keydown", onEscapeKey, true);
      if (typeof stopLang === "function") stopLang();
      stopLang = null;
      if (api._editor) api._editor.setActive(false);
      if (edit) {
        edit = false;
        if (typeof opts.onEditChange === "function") opts.onEditChange(false);
      }
      const report = renderer.teardown();
      if (slots) slots.teardown();
      slots = null;
      mount.classList.remove("uikit-root", "uikit-editing");
      /* classList.remove leaves class="" behind. On a host element that never
         had the attribute that is a visible difference in the markup, and this
         module's whole claim is that unmounting is invisible. */
      if (!mount.getAttribute("class")) mount.removeAttribute("class");
      return report;
    },

    /* Regions the host owns and may take away again. Registering or removing
       one re-renders, because a container bound to a slot that has just
       appeared (or vanished) changes what is on screen. */
    registerSlot(name, el) {
      pendingSlots.set(name, el);
      if (!slots) return false;
      const before = slots.get(name);
      const done = !!slots.register(name, el);
      /* Only when it actually changed. The plan dock re-offers its eight zones
         on every layout pass, and a render triggered by each of those would
         call straight back into the pass that triggered it. */
      if (done && mounted && before !== slots.get(name)) refresh();
      return done;
    },

    unregisterSlot(name) {
      pendingSlots.delete(name);
      if (!slots) return false;
      const done = slots.unregister(name);
      if (done && mounted) refresh();
      return done;
    },

    /* Containers skipped this pass because their slot was not on the page. */
    missingSlots: () => (lastRender ? lastRender.missing.slice() : []),

    /* ---- document-level ------------------------------------------------ */

    tokens: () => getTokens().slice(),
    presets: () => getPresets().map((p) => ({ id: p.id, label: p.label, key: p.key })),

    /* Keep the preset selector honest after undo, redo, import and edits. */
    matchingPreset() {
      if (!doc) return null;
      const current = JSON.stringify(doc);
      for (const preset of getPresets()) {
        const built = typeof preset.doc === "function" ? preset.doc() : preset.doc;
        if (!built) continue;
        const report = normalizeDoc(built);
        if (JSON.stringify(report.doc) === current) return preset.id;
      }
      return null;
    },

    /* A preset REPLACES the document. It is not a merge: a starting point that
       half-applies over whatever was there is neither the preset nor what the
       user had, and there is no way to describe the result to them. Undoable,
       unlike resetAll — picking a preset is a choice, not an escape. */
    applyPreset(id) {
      const preset = presets.find((p) => p.id === id);
      if (!preset) return null;
      const built = typeof preset.doc === "function" ? preset.doc() : preset.doc;
      if (!built) return null;
      const report = normalizeDoc(built);
      history.apply("Preset: " + (preset.label || id), report.doc);
      doc = history.doc;
      problems = report.problems;
      api.save();
      refresh();
      return doc;
    },

    /* Pretty-printed on purpose: a layout is meant to be readable, diffable
       and hand-editable — that is most of why it is a flat document. */
    exportLayout() {
      return doc ? JSON.stringify(doc, null, 2) : "";
    },

    /* Import is normalize-then-adopt, which is the same path a document from
       storage takes. Anything it could not make sense of comes back in
       `problems` rather than being thrown, because the file came from a person
       and "your layout is slightly wrong" is more use than a stack trace. */
    importLayout(source) {
      let raw = source;
      if (typeof source === "string") {
        try {
          raw = JSON.parse(source);
        } catch (_) {
          return { ok: false, problems: [{ code: "not-json", id: null }] };
        }
      }
      const report = normalizeDoc(raw);
      history.apply("Import layout", report.doc);
      doc = history.doc;
      problems = report.problems;
      api.save();
      refresh();
      return { ok: true, problems: report.problems };
    },

    refresh: schedule,
    refreshNow: refresh,
    /* The layout as it shipped. The editor needs it to answer "where did this
       item start", which is the one thing a reset cannot work out from the
       current document — a node's place is its parent's child list, and once
       it has moved the old list no longer mentions it. */
    get defaults() {
      return defaults;
    },
    mountDocument: mount.ownerDocument,
    resolved: () => lastResolved,
    registry,
    get editor() {
      return api._editor || null;
    },
    slotFor: (name) => slotsView.get(name),
    wrapperFor: (id) => renderer.wrapperFor(id),
    adoptedFor: (id) => renderer.adoptedFor(id),
    adopter,
  };

  return api;
}
