/* Phase-8 gate: the module works in an application it has never heard of.
 *
 * uikit/demo/index.html is a small app with its own element names, its own
 * stylesheet and no framework, and it imports nothing from this project. If
 * uikit ever grows a hidden dependency on 3dhome — a global it expects, a
 * class it assumes, an id it looks for — this page stops working before
 * anything else does, which is the whole reason it exists.
 *
 * The counterpart to this is the static rule in tools/link_check.mjs, which
 * refuses any import from uikit/ to outside it. That catches the dependency at
 * the source; this catches the ones a linker cannot see.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { openPage, findChrome } from "../tools/browser_harness.mjs";

const chrome = await findChrome();
const opts = chrome ? {} : { skip: "no Chrome found (set CHROME_PATH)" };

let shared = null;

test.after(async () => {
  if (shared) await shared.close();
});

async function demo({ width = 1200, height = 800 } = {}) {
  if (!shared) shared = await openPage({ width, height });
  else await shared.resize(width, height);
  await shared.goto("/uikit/demo/index.html", { boot: false });
  await shared.eval(() => {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith("uikit-demo:")) localStorage.removeItem(key);
    }
  });
  await shared.goto("/uikit/demo/index.html", { boot: false });
  await shared.eval(async () => {
    for (let i = 0; i < 300 && !window.__demoReady; i++) {
      await new Promise((r) => setTimeout(r, 10));
    }
    if (!window.__demoReady) throw new Error("the demo never booted");
    window.__frame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
    window.__ids = (sel) => [...document.querySelector(sel).children]
      .map((e) => e.getAttribute("data-uikit-id") || e.id || e.className);
  });
  return shared;
}

test("the layout renders into an app uikit knows nothing about", opts, async () => {
  const page = await demo();
  const result = await page.eval(() => ({
    top: window.__ids("#topbar").filter(Boolean),
    side: window.__ids("#side"),
    group: [...document.querySelector('[data-uikit-id="g:file"]').children]
      .map((e) => e.getAttribute("data-uikit-id")),
    saveIsHostButton: document.querySelector('[data-uikit-id="act:save"]').id === "act-save",
    errors: [],
  }));

  assert.ok(result.top.includes("g:file"), "the toolbar groups are in the host's own header");
  assert.deepEqual(result.group, ["act:new", "act:open", "act:save"]);
  assert.ok(result.saveIsHostButton, "and the node IS the host's button, not a copy of it");
  assert.deepEqual(result.side,
    ["item:tabs", "item:layers", "item:notes", "item:info"],
    "the sidebar panes are still direct children of #side");
});

test("the host's own CSS still matches, which is the no-wrapper rule in miniature", opts, async () => {
  const page = await demo();
  const result = await page.eval(() => {
    const side = document.getElementById("side");
    const panes = [...side.querySelectorAll(".pane")];
    const visibleFor = (which) => {
      side.dataset.pane = which;
      return panes.filter((p) => getComputedStyle(p).display !== "none")
        .map((p) => p.getAttribute("data-pane-id"));
    };
    return {
      direct: panes.every((p) => p.parentElement === side),
      layers: visibleFor("layers"),
      notes: visibleFor("notes"),
      wrappers: side.querySelectorAll(":scope > .uikit-node").length,
    };
  });

  assert.ok(result.direct);
  assert.equal(result.wrappers, 0, "uikit created nothing inside the sidebar");
  assert.deepEqual(result.layers, ["layers"], "`#side > .pane` still selects exactly one");
  assert.deepEqual(result.notes, ["notes"]);
});

test("customize mode runs here, with the app's own handlers held off", opts, async () => {
  const page = await demo();
  const result = await page.eval(async () => {
    const ui = window.__demo.ui;
    await ui.edit(true);
    await window.__frame();

    const ed = ui.editor;
    ed.command("select", { id: "act:save" });
    const selected = ed.selection();

    // a click on a host button selects it rather than running it
    const save = document.getElementById("act-save");
    const r = save.getBoundingClientRect();
    const at = { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, bubbles: true, cancelable: true, button: 0 };
    save.dispatchEvent(new PointerEvent("pointerdown", at));
    save.dispatchEvent(new MouseEvent("click", at));

    ed.command("select", { id: "act:new" });
    ed.command("reorder", { dir: 1 });
    const order = [...document.querySelector('[data-uikit-id="g:file"]').children]
      .map((e) => e.getAttribute("data-uikit-id"));

    return {
      selected,
      ran: window.__demo.log.slice(),
      order,
      overlay: document.querySelectorAll(".uikit-ed-overlay").length,
      inspector: document.querySelectorAll(".uikit-ins").length,
    };
  });

  assert.deepEqual(result.selected, ["act:save"]);
  assert.deepEqual(result.ran, [], "the app's own command never fired");
  assert.deepEqual(result.order, ["act:open", "act:new", "act:save"], "and the button moved");
  assert.equal(result.overlay, 1);
  assert.equal(result.inspector, 1);
});

test("a placeable with no element of its own is built, and its command runs", opts, async () => {
  const page = await demo();
  const result = await page.eval(async () => {
    const { ops, unplaced } = await import("/uikit/index.js");
    const ui = window.__demo.ui;
    const free = unplaced(ui.doc, ui.registry).map((e) => e.id);

    ui.apply("Place", ops.insert(ui.doc, {
      id: "act:about", node: { type: "item", ref: "act:about" }, parent: "g:edit", index: 0,
    }));
    ui.refreshNow();
    const built = document.querySelector('[data-uikit-id="act:about"]');
    built.click();
    return { free, label: built.textContent, tag: built.tagName, ran: window.__demo.log.slice() };
  });

  assert.deepEqual(result.free, ["act:about"], "the palette offers what the layout has not placed");
  assert.equal(result.tag, "BUTTON", "uikit built it, because the host had no element for it");
  assert.match(result.label, /About/);
  assert.deepEqual(result.ran, ["act:about"], "and clicking it ran the host's function");
});

test("presets, theme tokens and export all work against this host too", opts, async () => {
  const page = await demo();
  const result = await page.eval(async () => {
    const ui = window.__demo.ui;
    /* Not in customize mode: there a hidden node stays on screen and is
       marked, so `hidden` would be false by design and the assertion would be
       measuring the editor rather than the preset. */
    ui.applyPreset("minimal");
    ui.refreshNow();
    const notesHidden = document.querySelector('[data-uikit-id="item:notes"]').hidden;

    const { ops } = await import("/uikit/index.js");
    ui.apply("Theme", ops.setToken(ui.doc, { id: null, name: "--demo-accent", value: "#00aa55" }));
    ui.refreshNow();
    const brand = getComputedStyle(document.querySelector("#topbar .brand")).color;

    const text = ui.exportLayout();
    ui.resetAll();
    const afterReset = document.querySelector('[data-uikit-id="item:notes"]').hidden;
    const back = ui.importLayout(text);
    ui.refreshNow();

    return {
      notesHidden, brand, back,
      afterReset,
      restored: document.querySelector('[data-uikit-id="item:notes"]').hidden,
      presets: ui.presets().map((p) => p.id),
    };
  });

  assert.deepEqual(result.presets, ["default", "minimal"]);
  assert.ok(result.notesHidden, "the preset hid what it said it would");
  assert.equal(result.brand, "rgb(0, 170, 85)", "a token the HOST declared retinted the host");
  assert.equal(result.afterReset, false, "reset went back to the shipped layout");
  assert.deepEqual(result.back, { ok: true, problems: [] });
  assert.ok(result.restored, "and the exported file brought it all back");
});

test("a narrow window folds the sidebar away, through the variant and nothing else", opts, async () => {
  const page = await demo();
  const wide = await page.eval(() => ({
    variant: window.__demo.ui.variant,
    hidden: document.getElementById("side").hidden,
  }));
  assert.equal(wide.variant, "base");
  assert.equal(wide.hidden, false);

  await page.resize(500, 800);
  const narrow = await page.eval(async () => {
    for (let i = 0; i < 40; i++) await window.__frame();
    return { variant: window.__demo.ui.variant, hidden: document.getElementById("side").hidden };
  });
  assert.equal(narrow.variant, "phone", "the host's own chooser picked it");
  assert.ok(narrow.hidden, "and one patched field folded the sidebar");

  await page.resize(1200, 800);
  const back = await page.eval(async () => {
    for (let i = 0; i < 40; i++) await window.__frame();
    return document.getElementById("side").hidden;
  });
  assert.equal(back, false, "and it comes back untouched");
});

test("unmounting hands the demo app back exactly as it was", opts, async () => {
  const page = await demo();
  const result = await page.eval(async () => {
    const ui = window.__demo.ui;
    const { ops } = await import("/uikit/index.js");
    /* The demo mounts on load, so the pristine markup has to be recovered by
       unmounting first. Taking the baseline after mount would compare uikit's
       output against itself and pass however much residue it left. */
    ui.unmount();
    const before = document.getElementById("workspace").outerHTML;
    ui.mount();
    ui.refreshNow();
    await ui.edit(true);
    ui.apply("Edit", ops.reorder(ui.doc, { id: "item:info", index: 0 }));
    ui.refreshNow();
    await ui.edit(false);
    const problems = ui.unmount();
    return {
      before,
      after: document.getElementById("workspace").outerHTML,
      problems,
      leftovers: document.querySelectorAll(".uikit-node, .uikit-slot, .uikit-ins, .uikit-ed-overlay").length,
    };
  });

  assert.deepEqual(result.problems, []);
  assert.equal(result.leftovers, 0);
  assert.equal(result.after, result.before, "byte-identical, in a host uikit was not written for");
});

test("placement rules follow the schema, not another application's names", opts, async () => {
  /* The guard this suite exists to be. When container policy was introduced it
     hardcoded `n:topbar`, `n:left`, `n:right` and the `act:`/`panel:` id
     prefixes — one application's vocabulary, inside the portable module. Every
     3dhome suite stayed green; what broke was THIS host, whose toolbar happens
     to declare `slot: "topbar"` and so collided with a string literal and
     stopped accepting commands.
   *
     Nothing here shares a name with the app uikit was built in. */
  const page = await demo();
  const result = await page.eval(async () => {
    const { containerAccepts, kindOf } = await import("/uikit/editor/policy.js");
    const ui = window.__demo.ui;
    const registry = ui.registry; // a plain ARRAY, which is a supported shape
    const resolved = ui.resolved();
    const find = (id) => {
      const walk = (n) => (n.id === id ? n : (n.children || []).map(walk).find(Boolean));
      return walk(resolved.tree);
    };

    const about = { id: "act:about", kind: "command" };
    return {
      registryIsArray: Array.isArray(registry),
      // kind resolves through an array registry, not by guessing from the id
      kindFromArrayRegistry: kindOf({ ref: "item:notes" }, registry),
      // this host's toolbar is a bar and takes commands, whatever its slot is named
      toolbarSlot: find("n:top").slot,
      commandIntoToolbar: containerAccepts(find("n:top"), about, registry),
      commandIntoGroup: containerAccepts(find("g:file"), about, registry),
      // and its sidebar stacks panels but is not a toolbar
      panelIntoSidebar: containerAccepts(find("n:side"), { kind: "panel" }, registry),
      commandIntoSidebar: containerAccepts(find("n:side"), about, registry),
    };
  });

  assert.ok(result.registryIsArray, "the demo supplies the array form on purpose");
  assert.equal(result.kindFromArrayRegistry, "panel",
    "an array registry is normalised, not skipped and guessed around");
  assert.equal(result.toolbarSlot, "topbar", "a slot name this host chose freely");
  assert.equal(result.commandIntoToolbar, true, "and it does not make the toolbar refuse commands");
  assert.equal(result.commandIntoGroup, true);
  assert.equal(result.panelIntoSidebar, true);
  assert.equal(result.commandIntoSidebar, false, "the generic rule still holds");
});
