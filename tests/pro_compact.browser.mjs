/* The Round-6 layout in a real browser (css/pro_skin.css, js/pro_ribbon.js):
 * the desktop header, ribbon and Split, and the phone and fold chrome
 * (js/pro_compact.js) — one header row with the editor knob, the slim bottom
 * toolbar, the ask panel — in all three editors. The classic chrome still
 * exists behind localStorage mf.proSkin = "0"; its own tests ask for it.
 *
 * Skips itself when Chrome is absent — set CHROME_PATH to point at a binary.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { openPage, findChrome } from "../tools/browser_harness.mjs";

const opts = await findChrome() ? {} : { skip: "no Chrome found (set CHROME_PATH)" };

async function ready(page) {
  await page.eval(() => {
    const start = document.getElementById("start-screen");
    if (start) start.hidden = true;
  });
  // the layout is placed on the shell's next pass
  await page.waitUntil(() => document.body.classList.contains("pro-compact") || document.body.classList.contains("pro-skin"),
    { what: "the Round-6 layout" });
}
const box = (el) => { const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height }; };

test("phone planner: one header row with the editor knob, the plan to the bottom toolbar, the ask panel on request", opts, async () => {
  const page = await openPage({ width: 390, height: 844, lang: "en", mobile: true, touch: true });
  try {
    await ready(page);
    await page.waitUntil(() => !!document.querySelector("#psPhoneHead .ps-edknob") && !!document.querySelector("#center-canvas > .ps-dock #m-ctx"),
      { what: "the knob header and the toolbar" });
    const layout = await page.eval(() => {
      const head = document.getElementById("psPhoneHead");
      const dock = document.querySelector("#center-canvas > .ps-dock");
      const plan = document.getElementById("center-canvas").getBoundingClientRect();
      const shown = (el) => !!el && getComputedStyle(el).display !== "none" && el.getBoundingClientRect().height > 0;
      const split = head.querySelector('.ps-view [data-view="split"]');
      return {
        knob: head.querySelector(".ps-edknob").dataset.editor,
        title: head.querySelector(".ps-ph-name").textContent.length > 0,
        headHeight: document.getElementById("topbar").getBoundingClientRect().height,
        strip: shown(document.getElementById("m-editor-strip")),
        nav: shown(document.getElementById("mobile-nav")),
        bar: shown(document.querySelector('.ps-cmdbar[data-ps-bar="plan"]')),
        split: shown(split),
        undoInDock: !!dock.querySelector('.mctx-undo') && shown(dock.querySelector('.mctx-undo')),
        undoInHead: !!head.querySelector('[data-ph="undo"]') && !!head.querySelector('[data-ph="redo"]'),
        dockBottom: dock.getBoundingClientRect().bottom, dockTop: dock.getBoundingClientRect().top, viewport: innerHeight,
        planTop: plan.top, planHeight: plan.height,
        ask: !!dock.querySelector(".ps-dock-ask svg"), grid: !!dock.querySelector(".ps-dock-grid"),
      };
    });
    assert.equal(layout.knob, "plan", "the knob shows the planner in front");
    assert.equal(layout.title, true, "the header names the project");
    assert.ok(layout.headHeight <= 50, "one header row: " + layout.headHeight);
    assert.equal(layout.strip, false, "no strip row under the header");
    assert.equal(layout.nav, false, "the five-slot navigation is replaced");
    assert.equal(layout.bar, false, "the command bar is not a permanent row");
    assert.equal(layout.split, false, "no Split on a phone");
    assert.equal(layout.undoInDock, false, "undo and redo are in the header only");
    assert.equal(layout.undoInHead, true);
    assert.ok(layout.dockBottom <= layout.viewport && layout.dockBottom > layout.viewport - 4, "the toolbar at the bottom: " + JSON.stringify(layout));
    assert.ok(layout.planHeight >= 700, "the plan gets the screen: " + layout.planHeight);
    assert.ok(Math.abs(layout.planTop + layout.planHeight - layout.dockTop) <= 1, "the plan runs down to the toolbar");
    assert.equal(layout.ask, true);
    assert.equal(layout.grid, true);
    // the grid opens the tools sheet, and it ends above the toolbar
    await page.eval(() => document.querySelector("#center-canvas > .ps-dock .ps-dock-grid").click());
    await page.waitUntil(() => document.body.classList.contains("m-sheet-open"), { what: "the tools sheet" });
    await page.eval(() => new Promise((r) => setTimeout(r, 700))); // the slide-in
    const sheet = await page.eval(() => ({
      bottom: document.getElementById("m-sheet").getBoundingClientRect().bottom,
      dockTop: document.querySelector("#center-canvas > .ps-dock").getBoundingClientRect().top,
    }));
    assert.ok(sheet.bottom <= sheet.dockTop + 1, "the sheet ends above the toolbar: " + JSON.stringify(sheet));
    // the ask button slides the command bar up in a panel; Escape puts it away
    await page.eval(() => { document.querySelector("#m-sheet .m-sheet-x, #m-sheet [data-m-close]")?.click(); document.querySelector("#center-canvas > .ps-dock .ps-dock-ask").click(); });
    await page.waitUntil(() => !!document.querySelector(".ps-ask .ps-cmdbar .ps-cmd-input"), { what: "the ask panel" });
    await page.eval(() => new Promise((r) => setTimeout(r, 350))); // the slide-up
    const ask = await page.eval(() => {
      const panel = document.querySelector(".ps-ask"), input = panel.querySelector(".ps-cmd-input");
      return { focused: document.activeElement === input, bottom: panel.getBoundingClientRect().bottom, viewport: innerHeight, modes: getComputedStyle(panel.querySelector(".ps-modes")).display !== "none" };
    });
    assert.equal(ask.focused, true, "the field is ready to type into");
    assert.equal(ask.modes, true, "the AI | Cmd switch is in the panel");
    assert.ok(ask.bottom <= ask.viewport + 1);
    await page.eval(() => document.querySelector(".ps-ask .ps-cmd-input").dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    await page.waitUntil(() => !document.querySelector(".ps-ask") && !!document.querySelector('#center-canvas > .ps-cmdbar[data-ps-bar="plan"]'),
      { what: "the panel closed and the bar home" });
  } finally { await page.close(); }
});

test("phone: the knob turns to the model editor and back, each editor with one header row and the toolbar", opts, async () => {
  const page = await openPage({ width: 390, height: 844, lang: "en", mobile: true, touch: true });
  try {
    await ready(page);
    await page.waitUntil(() => !!document.querySelector("#psPhoneHead .ps-edknob"), { what: "the knob" });
    await page.eval(() => document.querySelector("#psPhoneHead .ps-edknob").dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })));
    await page.waitUntil(() => {
      const el = document.getElementById("modeler");
      return el && el.getBoundingClientRect().height > 0 && !!el.querySelector(".md-head > .ps-head #mdModes") && !!el.querySelector(".md-mid > .ps-dock #md-ctx");
    }, { what: "the model editor in the new chrome" });
    const md = await page.eval(() => {
      const head = document.querySelector("#modeler .md-head");
      const dock = document.querySelector("#modeler .md-mid > .ps-dock");
      return {
        knob: head.querySelector(".ps-edknob").dataset.editor,
        overflow: head.scrollWidth - head.clientWidth,
        headHeight: head.getBoundingClientRect().height,
        strips: document.querySelectorAll("#modeler .ps-ed-strip").length,
        redo: !!head.querySelector("#mdRedo"),
        dockBottom: dock.getBoundingClientRect().bottom, viewport: innerHeight,
        plannerDock: getComputedStyle(document.querySelector("#center-canvas > .ps-dock")).display !== "none",
      };
    });
    assert.equal(md.knob, "model");
    assert.ok(md.overflow <= 0, "the header fits: " + md.overflow);
    assert.ok(md.headHeight <= 50, "one row: " + md.headHeight);
    assert.equal(md.strips, 0, "no strip row");
    assert.equal(md.redo, true, "undo and redo in the header");
    assert.ok(md.dockBottom <= md.viewport && md.dockBottom > md.viewport - 4, "the toolbar at the bottom");
    assert.equal(md.plannerDock, false, "the planner's toolbar steps aside");

    await page.eval(async () => {
      (await import("/js/pro_shell.js")).switchEditor("plan");
      const st = await import("/js/state.js"), cab = await import("/js/ui_cabinet.js");
      let it = st.S.items.find((i) => i.type === "base" || i.cab);
      if (!it) it = st.S.items[0];
      cab.openCabinet(it);
    });
    await page.waitUntil(() => !!document.querySelector("#cabdes .cb-head-main > .ps-head .cb-vmodes") && !!document.querySelector("#cabdes .cb-mid > .ps-dock .cb-m-ctx"),
      { what: "the cabinet designer in the new chrome" });
    // two passes of the shell later, still exactly one header and one toolbar
    await page.eval(() => new Promise((r) => setTimeout(r, 3300)));
    const cb = await page.eval(() => {
      const head = document.querySelector("#cabdes .cb-head-main");
      return {
        heads: document.querySelectorAll("#cabdes .ps-head").length,
        docks: document.querySelectorAll("#cabdes .ps-dock").length,
        knob: head.querySelector(".ps-edknob").dataset.editor,
        overflow: head.scrollWidth - head.clientWidth,
        headHeight: head.getBoundingClientRect().height,
        done: !!head.querySelector(".ps-head-done #cbClose"),
        split: getComputedStyle(head.querySelector('.cb-vmodes [data-mode="split"]')).display !== "none",
      };
    });
    assert.equal(cb.heads, 1, "one header, however many passes");
    assert.equal(cb.docks, 1, "one toolbar, however many passes");
    assert.equal(cb.knob, "cab");
    assert.ok(cb.overflow <= 0, "the header fits: " + cb.overflow);
    assert.ok(cb.headHeight <= 50, "one row: " + cb.headHeight);
    assert.equal(cb.done, true);
    assert.equal(cb.split, false, "no Split on a phone");
  } finally { await page.close(); }
});

test("fold: the toolbar floats under the plan inside its column, and Split is offered", opts, async () => {
  const page = await openPage({ width: 832, height: 750, lang: "en", mobile: false, touch: true });
  try {
    await ready(page);
    await page.waitUntil(() => document.body.classList.contains("dock-rail") && !!document.querySelector("#center-canvas > .ps-dock"), { what: "the fold posture" });
    const r = await page.eval(() => {
      const dock = document.querySelector("#center-canvas > .ps-dock").getBoundingClientRect();
      const canvas = document.getElementById("center-canvas").getBoundingClientRect();
      const split = document.querySelector('#psPhoneHead .ps-view [data-view="split"]');
      return { dock: { l: dock.left, r: dock.right, b: dock.bottom }, canvas: { l: canvas.left, r: canvas.right, b: canvas.bottom },
        split: getComputedStyle(split).display !== "none", strip: getComputedStyle(document.getElementById("m-editor-strip")).display !== "none" };
    });
    assert.ok(r.dock.l >= r.canvas.l - 1 && r.dock.r <= r.canvas.r + 1 && r.dock.b <= r.canvas.b + 1, JSON.stringify(r));
    assert.equal(r.split, true, "a fold keeps Split");
    assert.equal(r.strip, false, "no strip row");
  } finally { await page.close(); }
});

test("desktop: one header, the search in the tabs row, Split over the inspector, and the classic layout on request", opts, async () => {
  const page = await openPage({ width: 1440, height: 900, lang: "en", mobile: false, touch: false });
  try {
    await ready(page);
    const head = await page.eval(() => ({
      skin: document.body.classList.contains("pro-skin"),
      switcher: !!document.querySelector("#topbar .pr-editors[data-ps-moved]"),
      // no Every command pill: the bottom bar's All commands opens the catalog
      every: getComputedStyle(document.querySelector("#pro-ribbon .pr-every")).display === "none" &&
        !!document.querySelector("#psPlanBar > .ps-cmdbar .ps-allcmds"),
      topbarHeight: document.getElementById("topbar").getBoundingClientRect().height,
      stripHidden: getComputedStyle(document.getElementById("plan-toolbar")).display === "none",
    }));
    assert.deepEqual(head, { skin: true, switcher: true, every: true, topbarHeight: 44, stripHidden: true });
    // All commands: the whole catalog, narrowed as you type, Escape closes
    await page.eval(() => document.querySelector("#psPlanBar .ps-allcmds").click());
    const every = await page.eval(() => {
      const panel = document.querySelector(".pr-every-panel");
      const cards = panel.querySelectorAll(".pe-card").length;
      const input = panel.querySelector(".pe-search input");
      input.value = "window"; input.dispatchEvent(new Event("input"));
      const narrowed = [...panel.querySelectorAll(".pe-tools button span")].map((s) => s.textContent);
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      return { cards, narrowed, closed: !document.querySelector(".pr-every-panel") };
    });
    assert.ok(every.cards >= 8, "every tab is a card: " + every.cards);
    assert.ok(every.narrowed.includes("Window") && every.narrowed.length < 10, JSON.stringify(every.narrowed));
    assert.equal(every.closed, true);
    await page.eval(() => window.__setViewMode("split"));
    await page.waitUntil(() => document.getElementById("view-3d").parentElement.id === "right-inspector", { what: "the 3D over the inspector" });
    await page.eval(() => window.__setViewMode("3d"));
    await page.waitUntil(() => document.getElementById("view-3d").parentElement.id === "center-canvas", { what: "the 3D back on the canvas" });
    // the editors get the catalog ribbon under their header
    await page.eval(async () => { (await import("/js/pro_shell.js")).switchEditor("model"); });
    await page.waitUntil(() => {
      const rb = document.querySelector("#modeler .pr-editor-ribbon");
      return rb && rb.getBoundingClientRect().height > 60 && !!document.querySelector("#modeler .md-head > #mdModes");
    }, { what: "the model editor's ribbon" });
    // the classic desktop layout, on request
    await page.eval(async () => { (await import("/js/pro_shell.js")).switchEditor("plan"); localStorage.setItem("mf.proSkin", "0"); });
    await page.goto("/");
    await page.eval(() => { const s = document.getElementById("start-screen"); if (s) s.hidden = true; });
    await page.eval(() => new Promise((r) => setTimeout(r, 1800)));
    const classic = await page.eval(() => ({
      skin: document.body.classList.contains("pro-skin"),
      searchShown: document.getElementById("toolSearch").getBoundingClientRect().width > 0,
    }));
    assert.deepEqual(classic, { skin: false, searchShown: true });
    await page.eval(() => localStorage.removeItem("mf.proSkin"));
  } finally { await page.close(); }
});

test("fold, left-handed: the rail goes right and the tools and inspector left; right-handed is the default", opts, async () => {
  const page = await openPage({ width: 832, height: 750, lang: "en", mobile: false, touch: true });
  try {
    await ready(page);
    await page.waitUntil(() => document.body.classList.contains("dock-rail"), { what: "the fold posture" });
    const place = () => page.eval(() => ({
      mirror: document.body.classList.contains("side-mirror"),
      rail: document.querySelector("#workspace > .m-fold-rail").getBoundingClientRect().left,
      canvas: document.getElementById("center-canvas").getBoundingClientRect().left,
    }));
    const before = await place();
    assert.equal(before.mirror, false, "right-handed unless chosen");
    assert.ok(before.rail < before.canvas, "rail on the left by default");
    await page.eval(async () => (await import("/js/side_mirror.js")).setLeftHanded(true));
    const after = await place();
    assert.equal(after.mirror, true);
    assert.ok(after.rail > after.canvas, "rail on the right, mirrored: " + JSON.stringify(after));
    await page.eval(async () => (await import("/js/side_mirror.js")).setLeftHanded(false));
    assert.equal((await place()).mirror, false);
  } finally { await page.close(); }
});
