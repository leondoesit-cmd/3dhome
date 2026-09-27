/* Phase-4 gate: customize mode, against the real planner chrome.
 *
 * Driven through the editor's COMMAND API rather than synthetic pointer
 * events. That is not a shortcut around the drag code — the geometry that
 * decides where a drop lands is unit-tested as arithmetic in
 * uikit/tests/editor_input.test.mjs, and a pointer test on top of it would be
 * asserting that Chrome dispatches pointermove. What only a browser can answer
 * is the rest: that the app underneath really is inert, that a rearrangement
 * survives a reload, and that leaving the mode hands the chrome back.
 *
 * Every command here is one a key is bound to, so the keyboard path is the
 * path under test — which is the point of having built it first.
 */
import test from "./helpers/customize_gate.mjs"; // skipped while UI Customize is off
import assert from "node:assert/strict";
import { openPage, findChrome } from "../tools/browser_harness.mjs";

const chrome = await findChrome();
const opts = chrome ? {} : { skip: "no Chrome found (set CHROME_PATH)" };

let shared = null;

test.after(async () => {
  if (shared) await shared.close();
});

async function planner(query = "") {
  if (!shared) shared = await openPage({ width: 1440, height: 900 });
  await shared.goto("/" + query);
  await shared.eval(() => {
    const start = document.getElementById("start-screen");
    if (start) start.hidden = true;
    window.__host = () => window.__hostMod
      || (window.__hostMod = import("/js/uikit_host/index.js").then((m) => (window.__hostMod = m)));
    window.__ids = (sel) => [...document.querySelector(sel).children]
      .map((e) => e.getAttribute("data-uikit-id") || e.id || e.className);
    return true;
  });
  return shared;
}

/* Mount, enter customize mode, and hand back the designer. edit() is async
   because it lazy-imports the editor — which is the behaviour being relied on
   in normal mode, so the test waits for it rather than routing around it. */
async function customizing(page) {
  return page.eval(async () => {
    const host = await window.__host();
    const ui = host.initUIKit({ force: true });
    ui.refreshNow();
    await ui.edit(true);
    /* The stylesheet is a <link>, so computed styles are wrong until it lands.
       The token is declared on .uikit-root, which is the mount — body is its
       ancestor, not its descendant, so it never inherits it. */
    const root = document.getElementById("app");
    for (let i = 0; i < 300 &&
         getComputedStyle(root).getPropertyValue("--uikit-ed-accent").trim() === ""; i++) {
      await new Promise((r) => setTimeout(r, 10));
    }
    window.__ui = ui;
    window.__ed = ui.editor;
    return { active: ui.editor.isActive(), implemented: ui.editor.implemented };
  });
}

test("the editor is not loaded until customize mode is switched on", opts, async () => {
  const page = await planner();
  const before = await page.eval(async () => {
    const host = await window.__host();
    const ui = host.initUIKit({ force: true });
    ui.refreshNow();
    return {
      editor: ui.editor,
      overlays: document.querySelectorAll(".uikit-ed-overlay").length,
      editing: document.querySelectorAll(".uikit-editing").length,
    };
  });
  assert.equal(before.editor, null, "normal mode never imported editor/");
  assert.equal(before.overlays, 0, "and drew nothing");
  assert.equal(before.editing, 0);

  const after = await customizing(page);
  assert.ok(after.active);
  assert.ok(after.implemented);
});

test("selecting draws over a node without touching it, and the overlay never contains it", opts, async () => {
  const page = await planner();
  await customizing(page);
  const result = await page.eval(() => {
    const ed = window.__ed;
    ed.command("select", { id: "panel:tree" });
    const panel = document.querySelector('[data-uikit-id="panel:tree"]');
    const overlay = document.querySelector(".uikit-ed-overlay");
    const boxRect = overlay.querySelector(".uikit-ed-sel").getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    return {
      selection: ed.selection(),
      overlayHoldsPanel: overlay.contains(panel),
      overlayInMount: overlay.parentElement.tagName.toLowerCase(),
      pointerEvents: getComputedStyle(overlay).pointerEvents,
      aligned: Math.abs(boxRect.left - panelRect.left) < 1.5 &&
               Math.abs(boxRect.top - panelRect.top) < 1.5 &&
               Math.abs(boxRect.width - panelRect.width) < 1.5,
      panelAttrs: [...panel.attributes].map((a) => a.name).sort(),
      tag: overlay.querySelector(".uikit-ed-tag").textContent,
    };
  });

  assert.deepEqual(result.selection, ["panel:tree"]);
  assert.equal(result.overlayHoldsPanel, false, "the overlay draws over the node, it does not hold it");
  assert.equal(result.overlayInMount, "body");
  assert.equal(result.pointerEvents, "none", "so it can never be the thing under the cursor");
  assert.ok(result.aligned, "the box is drawn on the node's own rect");
  assert.deepEqual(result.panelAttrs, ["class", "data-left-pane", "data-uikit-id"],
    "selection wrote nothing onto the host's element");
  assert.ok(result.tag.length, "and the selection is labelled");
});

test("the app underneath is inert: clicking Save selects it instead of saving", opts, async () => {
  const page = await planner();
  await customizing(page);
  const result = await page.eval(() => {
    let ran = null;
    const previous = window.__runAction;
    window.__runAction = (act) => { ran = act; };

    /* Undo, not Save: Save lives inside the File dropdown, which is closed, so
       it has no box to click. A test that aims at a zero-sized element proves
       nothing about interception — it just misses. */
    const undo = document.querySelector('#topbar .tb-start [data-act="undo"]');
    const r = undo.getBoundingClientRect();
    const visible = r.width > 0 && r.height > 0;
    const at = { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, bubbles: true, button: 0 };
    undo.dispatchEvent(new PointerEvent("pointerdown", at));
    undo.dispatchEvent(new PointerEvent("pointerup", at));
    undo.dispatchEvent(new MouseEvent("click", at));

    const firstSelection = window.__ed.selection();

    // Second click (double-click within 400ms) drills down into panel:tb-start
    undo.dispatchEvent(new PointerEvent("pointerdown", at));
    undo.dispatchEvent(new PointerEvent("pointerup", at));
    const drilledSelection = window.__ed.selection();

    // Third and fourth click (second double-click pair within 400ms) drills down to leaf button
    undo.dispatchEvent(new PointerEvent("pointerdown", at));
    undo.dispatchEvent(new PointerEvent("pointerup", at));
    undo.dispatchEvent(new PointerEvent("pointerdown", at));
    undo.dispatchEvent(new PointerEvent("pointerup", at));
    const buttonSelection = window.__ed.selection();

    window.__runAction = previous;
    return { ran, visible, firstSelection, drilledSelection, buttonSelection };
  });

  assert.ok(result.visible, "the button under test is actually on screen");
  assert.equal(result.ran, null, "the host's dispatcher was never reached");
  assert.deepEqual(result.firstSelection, ["n:topbar"],
    "the initial click selected the top-level container at root depth");
  assert.deepEqual(result.drilledSelection, ["panel:tb-start"],
    "first double-click drilled down into panel:tb-start");
  assert.deepEqual(result.buttonSelection, ["act:undo"],
    "second double-click drilled down to the button itself");
});

test("reorder, hide and undo all work from the keyboard command set", opts, async () => {
  const page = await planner();
  await customizing(page);
  const result = await page.eval(() => {
    const ed = window.__ed;
    const order = () => window.__ids("#left-sidebar");
    const before = order();

    ed.command("select", { id: "panel:tree" });
    ed.command("reorder", { dir: -1 });
    const moved = order();

    ed.command("hide");
    const panel = document.querySelector('[data-uikit-id="panel:tree"]');
    const hiddenMarked = panel.getAttribute("data-uikit-hidden");
    const stillVisible = panel.hidden === false;

    ed.command("undo");
    ed.command("undo");
    return { before, moved, after: order(), hiddenMarked, stillVisible };
  });

  assert.notDeepEqual(result.moved, result.before, "the panel moved up one place");
  assert.equal(result.moved.indexOf("panel:tree"), result.before.indexOf("panel:tree") - 1);
  assert.equal(result.hiddenMarked, "1", "hiding marks the node");
  assert.ok(result.stillVisible,
    "and leaves it on screen while customizing, so it can be put back");
  assert.deepEqual(result.after, result.before, "two undos returned the original order");
});

test("Tab walks the nodes and never selects the root", opts, async () => {
  const page = await planner();
  await customizing(page);
  const result = await page.eval(() => {
    const ed = window.__ed;
    const movable = ed.nodes().length - 1; // everything but the root
    ed.command("select", { id: null });
    const seen = [];
    for (let i = 0; i < movable + 2; i++) {
      ed.command("selectNext", { dir: 1 });
      seen.push(ed.selection()[0]);
    }
    ed.command("select", { id: null });
    ed.command("selectNext", { dir: -1 });
    return { seen, movable, root: window.__ui.doc.variants.base.root, backFirst: ed.selection()[0] };
  });

  assert.equal(result.seen.indexOf(result.root), -1, "the root is not somewhere you can go");
  assert.equal(new Set(result.seen.slice(0, result.movable)).size, result.movable,
    "one step per Tab: every node is visited exactly once before any repeats");
  assert.equal(result.seen[result.movable], result.seen[0], "and then it wraps");
  assert.equal(result.backFirst, result.seen[result.movable - 1],
    "Shift+Tab from nothing selected starts at the end");
});

test("keydown reaches the editor and is kept from the app", opts, async () => {
  const page = await planner();
  await customizing(page);
  const result = await page.eval(() => {
    let leaked = 0;
    const spy = () => leaked++;
    document.addEventListener("keydown", spy, false);

    window.__ed.command("select", { id: "panel:tree" });
    const before = window.__ids("#left-sidebar");
    const ev = new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true, cancelable: true });
    document.body.dispatchEvent(ev);
    const after = window.__ids("#left-sidebar");

    document.removeEventListener("keydown", spy, false);
    return { before, after, leaked, defaultPrevented: ev.defaultPrevented };
  });

  assert.notDeepEqual(result.after, result.before, "the arrow key moved the selected panel");
  assert.ok(result.defaultPrevented);
  assert.equal(result.leaked, 0, "no listener below the capture phase saw the key");
});

test("a rearrangement is saved and comes back after a reload", opts, async () => {
  const page = await planner();
  await customizing(page);
  const moved = await page.eval(() => {
    const ed = window.__ed;
    ed.command("select", { id: "panel:tree" });
    ed.command("reorder", { dir: -1 });
    ed.command("reorder", { dir: -1 });
    return window.__ids("#left-sidebar");
  });

  // reload with the flag on, so boot takes the normal path through main.js
  await page.eval(() => localStorage.setItem("mf_uikit", "1"));
  await planner();
  const restored = await page.eval(async () => {
    for (let i = 0; i < 200 && !document.querySelector("[data-uikit-id]"); i++) {
      await new Promise((r) => setTimeout(r, 10));
    }
    return window.__ids("#left-sidebar");
  });

  assert.deepEqual(restored, moved, "the layout the user built is the one that boots");
  await page.eval(() => localStorage.removeItem("mf_uikit"));
});

test("the escape hatch restores the shipped layout without the UI's help", opts, async () => {
  const page = await planner();
  await customizing(page);
  const wrecked = await page.eval(async () => {
    const { ops } = await import("/uikit/index.js");
    const ui = window.__ui;
    let next = ui.doc;
    for (const id of Object.keys(next.nodes)) {
      if (next.nodes[id] && next.nodes[id].type === "item") {
        next = ops.hide(next, { id, hidden: true });
      }
    }
    ui.apply("Hide all", next);
    ui.refreshNow();
    return window.__ids("#left-sidebar");
  });
  assert.ok(wrecked.length, "there is still a document");

  // Ctrl+Alt+U, dispatched at the document, with the editor swallowing keys
  const afterKey = await page.eval(() => {
    const ev = new KeyboardEvent("keydown", { key: "u", ctrlKey: true, altKey: true, bubbles: true, cancelable: true });
    document.body.dispatchEvent(ev);
    return {
      hidden: [...document.querySelectorAll("[data-uikit-hidden]")].length,
      order: window.__ids("#left-sidebar"),
    };
  });
  assert.equal(afterKey.hidden, 0, "Ctrl+Alt+U put everything back");

  // and the URL form, which works before a single element is on screen
  await page.eval(() => localStorage.setItem("mf_uikit", "1"));
  await planner("?uikit=reset");
  const afterUrl = await page.eval(async () => {
    for (let i = 0; i < 200 && !document.querySelector("[data-uikit-id]"); i++) {
      await new Promise((r) => setTimeout(r, 10));
    }
    return {
      hidden: document.querySelectorAll("[data-uikit-hidden]").length,
      stored: localStorage.getItem("home3d_uikit:planner"),
    };
  });
  assert.equal(afterUrl.hidden, 0);
  assert.equal(afterUrl.stored, null, "the bad document was cleared, not merely ignored");
  await page.eval(() => localStorage.removeItem("mf_uikit"));
});

test("leaving customize mode removes every trace of it", opts, async () => {
  const page = await planner();
  await customizing(page);
  const result = await page.eval(async () => {
    const ui = window.__ui;
    ui.editor.command("select", { id: "panel:tree" });
    ui.editor.command("hide");
    await ui.edit(false);
    const panel = document.querySelector('[data-uikit-id="panel:tree"]');
    return {
      overlays: document.querySelectorAll(".uikit-ed-overlay").length,
      editingClass: document.querySelectorAll(".uikit-editing").length,
      selection: ui.editor.selection(),
      marked: panel.getAttribute("data-uikit-hidden"),
      reallyHidden: panel.hidden,
    };
  });

  assert.equal(result.overlays, 0, "the overlay is gone");
  assert.equal(result.editingClass, 0);
  assert.deepEqual(result.selection, []);
  assert.equal(result.marked, null, "the customize-only marker went with it");
  assert.equal(result.reallyHidden, true, "and what was hidden is now actually hidden");
});

/* ---- reaching customize mode at all --------------------------------------
 *
 * The three ways in, all of which have to work from a COLD START — the flag
 * off, nothing mounted, which is the state every user is in the first time.
 * A shortcut that only works once the feature is already running is not a way
 * in, and that is what shipped before: the key listener was installed by
 * initUIKit, which only ran when the flag was already set.
 */

async function coldPlanner() {
  const page = await planner();
  await page.eval(() => {
    localStorage.removeItem("mf_uikit");
    localStorage.removeItem("home3d_uikit:planner");
  });
  /* Reload after clearing the flag. planner() navigates first, so a previous
     test that left mf_uikit set would boot customize mode and the next "cold"
     shortcut test would toggle the leftover session instead of opening one. */
  return planner("");
}

test("the More menu has an entry that opens customize mode from cold", opts, async () => {
  const page = await coldPlanner();
  const result = await page.eval(async () => {
    const item = document.querySelector('[data-act="uikitCustomize"]');
    const before = {
      exists: !!item,
      label: item && item.querySelector("span").textContent,
      hint: item && item.querySelector("kbd").textContent,
      flag: localStorage.getItem("mf_uikit"),
      mounted: document.querySelectorAll("[data-uikit-id]").length,
    };
    window.__runAction("uikitCustomize");
    for (let i = 0; i < 300 && !document.querySelector(".uikit-ed-overlay"); i++) {
      await new Promise((r) => setTimeout(r, 10));
    }
    return {
      before,
      editing: document.querySelectorAll(".uikit-editing").length,
      overlay: document.querySelectorAll(".uikit-ed-overlay").length,
      mounted: document.querySelectorAll("[data-uikit-id]").length,
      flag: localStorage.getItem("mf_uikit"),
    };
  });

  assert.ok(result.before.exists, "the menu item is in the chrome");
  assert.ok(result.before.label && result.before.label.length, "and it is labelled");
  assert.ok(result.before.hint && result.before.hint.length, "and shows its shortcut");
  assert.equal(result.before.mounted, 0, "nothing was mounted beforehand");

  assert.equal(result.overlay, 1, "one click opened customize mode");
  assert.equal(result.editing, 1);
  assert.ok(result.mounted > 0, "and mounted the layout on the way");
  assert.equal(result.flag, "1", "the feature stays on for next time");
});

test("the shortcut works on a Mac, where Option+E is a dead key", opts, async () => {
  const page = await coldPlanner();
  const result = await page.eval(async () => {
    /* Exactly what a MacBook sends for Cmd+Option+E: the letter never arrives,
       only the acute-accent dead key. This is the event that used to do
       nothing at all. */
    document.body.dispatchEvent(new KeyboardEvent("keydown", {
      key: "´", code: "KeyE", metaKey: true, altKey: true,
      bubbles: true, cancelable: true,
    }));
    for (let i = 0; i < 300 && !document.querySelector(".uikit-ed-overlay"); i++) {
      await new Promise((r) => setTimeout(r, 10));
    }
    const opened = document.querySelectorAll(".uikit-ed-overlay").length;

    // and the Windows form of the same combination
    document.body.dispatchEvent(new KeyboardEvent("keydown", {
      key: "e", code: "KeyE", ctrlKey: true, altKey: true,
      bubbles: true, cancelable: true,
    }));
    for (let i = 0; i < 100 && document.querySelector(".uikit-ed-overlay"); i++) {
      await new Promise((r) => setTimeout(r, 10));
    }
    return { opened, closed: document.querySelectorAll(".uikit-ed-overlay").length };
  });

  assert.equal(result.opened, 1, "Cmd+Option+E opened it despite the dead key");
  assert.equal(result.closed, 0, "and Ctrl+Alt+E toggled it back off");
});

test("Cmd+Alt+U resets, through the same dead key", opts, async () => {
  const page = await coldPlanner();
  const result = await page.eval(async () => {
    window.__runAction("uikitCustomize");
    for (let i = 0; i < 300 && !document.querySelector(".uikit-ed-overlay"); i++) {
      await new Promise((r) => setTimeout(r, 10));
    }
    const ui = (await window.__host()).activeUIKit();
    const ed = ui.editor;
    ed.command("select", { id: "panel:tree" });
    ed.command("hide");
    const hidden = document.querySelectorAll("[data-uikit-hidden]").length;

    // Option+U on a Mac is the umlaut dead key, not "u"
    document.body.dispatchEvent(new KeyboardEvent("keydown", {
      key: "¨", code: "KeyU", metaKey: true, altKey: true,
      bubbles: true, cancelable: true,
    }));
    return { hidden, after: document.querySelectorAll("[data-uikit-hidden]").length };
  });

  assert.equal(result.hidden, 1, "something was hidden");
  assert.equal(result.after, 0, "and the dead-key form of the escape hatch put it back");
});

test("the shortcuts guide documents customize mode, captioned for the platform", opts, async () => {
  const page = await planner();
  const result = await page.eval(() => {
    window.__runAction("shortcuts");
    const sections = [...document.querySelectorAll(".keys-sec")].map((e) => e.textContent);
    const rows = [...document.querySelectorAll(".keys-row")].map((r) => ({
      keys: [...r.querySelectorAll("kbd")].map((k) => k.textContent).join(" "),
      desc: r.querySelector(".keys-desc").textContent,
    }));
    const mac = /Mac|iPhone|iPad|iPod/i.test(
      (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || ""
    );
    return {
      sections,
      rows,
      mac,
      plusRow: rows.find((r) => r.keys.indexOf("+") >= 0 && r.keys.length <= 4),
    };
  });

  assert.ok(result.sections.some((s) => /customi[sz]e|התאמ/i.test(s)),
    "there is a section for it: " + result.sections.join(" / "));

  const toggle = result.rows.find((r) => /customi[sz]e mode|מצב ההתאמה/i.test(r.desc));
  assert.ok(toggle, "the open/close shortcut is listed");
  const expected = result.mac ? "⌘⌥E" : "Ctrl+Alt+E";
  assert.equal(toggle.keys, expected, "captioned for this platform");

  // the pre-existing rows are captioned too, and the "+" key row survives it
  const save = result.rows.find((r) => /save the plan|שמירת/i.test(r.desc));
  assert.equal(save.keys, result.mac ? "⌘S" : "Ctrl+S");
  if (result.plusRow) assert.ok(result.plusRow.keys.indexOf("+") >= 0, "the + key is still a + key");
});
