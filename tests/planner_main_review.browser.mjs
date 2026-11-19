import test from "node:test";
import assert from "node:assert/strict";
import { openPage, findChrome } from "../tools/browser_harness.mjs";

const opts = await findChrome() ? {} : { skip: "no Chrome found" };
// The plan's floating tool strip is the classic desktop layout's: the Round-6
// layout (css/pro_skin.css) carries every tool in its ribbon and hides it. These
// tests are about that strip, so they ask for the classic layout.
async function classicLayout(page) {
  await page.eval(() => localStorage.setItem("mf.proSkin", "0"));
  await page.goto("/");
}

test("save status follows edits, stays dirty after recovery backup, and translates", opts, async () => {
  const page = await openPage({ width: 1280, height: 900, mobile: false, touch: false });
  try {
    await page.eval(async () => {
      const { markSaved, markDirty } = await import("/js/persist.js");
      markSaved();
      window.__saveStatusInitial = document.getElementById("planSaveStatus").textContent;
      markDirty();
    });
    await page.waitUntil(() => !!localStorage.getItem("home3d_auto"), { what: "recovery backup" });
    const status = await page.eval(async () => {
      const { markSaved } = await import("/js/persist.js");
      const { setLang } = await import("/js/i18n.js");
      const el = document.getElementById("planSaveStatus");
      const dirty = el.textContent;
      await setLang("he");
      const translated = el.textContent;
      markSaved();
      return { initial: window.__saveStatusInitial, dirty, translated, saved: el.textContent, dirtyClass: el.classList.contains("is-dirty") };
    });
    assert.deepEqual(status, { initial: "Saved", dirty: "Unsaved changes", translated: "שינויים שלא נשמרו", saved: "נשמר", dirtyClass: false });
  } finally { await page.close(); }
});

test("tool names start visible and preserve an explicit preference to hide them", opts, async () => {
  const page = await openPage({ width: 1280, height: 900, mobile: false, touch: false });
  try {
    assert.equal(await page.eval(() => document.getElementById("plan-toolbar").classList.contains("show-titles")), true);
    assert.equal(await page.eval(() => {
      document.getElementById("view3dBtn").click();
      document.getElementById("viewPlanBtn").click();
      return document.getElementById("plan-toolbar").classList.contains("show-titles");
    }), true, "switching through 3D must not silently change the 2D labels preference");
    await page.eval(() => window.__toggleToolNames());
    assert.equal(await page.eval(() => {
      document.getElementById("view3dBtn").click();
      document.getElementById("viewPlanBtn").click();
      return document.getElementById("plan-toolbar").classList.contains("show-titles");
    }), false, "hidden labels must also survive a 3D visit");
    await page.goto("/");
    assert.equal(await page.eval(() => document.getElementById("plan-toolbar").classList.contains("show-titles")), false);
  } finally { await page.close(); }
});

test("split keeps the drawing dock in 2D after visiting 3D and reloading", opts, async () => {
  const page = await openPage({ width: 1180, height: 760, mobile: false, touch: false });
  try {
    const first = await page.eval(async () => {
      document.getElementById("start-screen").hidden = true;
      document.getElementById("view3dBtn").click();
      document.getElementById("viewSplitBtn").click();
      await new Promise(requestAnimationFrame);
      await new Promise(requestAnimationFrame);
      return {
        mode: document.getElementById("viewSplitBtn").getAttribute("aria-pressed"),
        host: document.getElementById("plan-tools").parentElement.id,
      };
    });
    assert.deepEqual(first, { mode: "true", host: "view-2d" });
    await page.goto("/");
    assert.deepEqual(await page.eval(() => ({
      mode: document.getElementById("viewSplitBtn").getAttribute("aria-pressed"),
      host: document.getElementById("plan-tools").parentElement.id,
    })), { mode: "true", host: "view-2d" });
  } finally { await page.close(); }
});

test("Layers visibility persists separately in 2D and 3D", opts, async () => {
  const page = await openPage({ width: 1280, height: 900, mobile: false, touch: false });
  try {
    const states = await page.eval(() => {
      document.getElementById("start-screen").hidden = true;
      const view3 = document.getElementById("view3dBtn"), view2 = document.getElementById("viewPlanBtn");
      const layers = document.getElementById("workflowLayers");
      view3.click();
      const initial3D = document.body.classList.contains("workflow-hide-layers");
      layers.click();
      view2.click();
      const plan = document.body.classList.contains("workflow-hide-layers");
      view3.click();
      return { initial3D, plan, returned3D: document.body.classList.contains("workflow-hide-layers") };
    });
    assert.deepEqual(states, { initial3D: true, plan: false, returned3D: false });
    await page.goto("/");
    assert.equal(await page.eval(() => document.body.classList.contains("workflow-hide-layers")), false);
  } finally { await page.close(); }
});

test("narrow named tools expose real overflow controls and keep Layers menu inside the pane", opts, async () => {
  const page = await openPage({ width: 1180, height: 760, mobile: false, touch: false });
  try {
    await classicLayout(page);
    const initial = await page.eval(() => {
      document.getElementById("start-screen").hidden = true;
      const bar = document.getElementById("plan-toolbar");
      const strip = bar.querySelector(".tool-command-strip");
      return { overflow: strip.scrollWidth > strip.clientWidth, next: !bar.querySelector(".tool-scroll-next").hidden };
    });
    assert.deepEqual(initial, { overflow: true, next: true });
    await page.eval(() => document.querySelector(".tool-scroll-next").click());
    await page.waitUntil(() => document.querySelector(".tool-command-strip").scrollLeft > 30, { what: "tool ribbon scroll" });
    const layerMenu = await page.eval(() => {
      document.getElementById("viewSplitBtn").click();
      document.querySelector('#layer-chips .lchip:not([hidden]) .lchip-more').click();
      const menu = document.querySelector(".layer-pop").getBoundingClientRect();
      const pane = document.getElementById("view-2d").getBoundingClientRect();
      return { right: menu.right, bottom: menu.bottom, paneRight: pane.right, paneBottom: pane.bottom };
    });
    assert.ok(layerMenu.right <= layerMenu.paneRight, "Layers submenu must not spill into Inspector");
    assert.ok(layerMenu.bottom <= layerMenu.paneBottom, "Layers submenu must not spill below the plan");
  } finally { await page.close(); }
});

test("3D command overflow remains reachable and navigation clears the compass", opts, async () => {
  const page = await openPage({ width: 1180, height: 760, mobile: false, touch: false });
  try {
    await classicLayout(page);
    await page.eval(() => {
      document.getElementById('start-screen').hidden=true;
      document.getElementById('view3dBtn').click();
    });
    await page.waitUntil(() => !!document.querySelector('#view-3d .view-gizmo:not(.plan-gizmo)'), {what:'the initialized 3D compass'});
    if (process.env.MF_BROWSER_GPU === '1') await page.eval(async () => {
      await (await import('/js/gpu.js')).ready((await import('/js/view3d.js')).getRenderer());
      await (await import('/js/pbr_material.js')).pbrLoading();
      await document.fonts.ready;
    });
    const initial = await page.eval(async () => {
      await new Promise(requestAnimationFrame);
      await new Promise(requestAnimationFrame);
      const strip = document.querySelector("#view-3d .tool-command-strip");
      const roof = document.getElementById("planner-invisible-roof").getBoundingClientRect();
      const compass = document.querySelector("#view-3d .view-gizmo:not(.plan-gizmo)").getBoundingClientRect();
      const overlap = Math.max(0, Math.min(roof.right, compass.right) - Math.max(roof.left, compass.left)) *
        Math.max(0, Math.min(roof.bottom, compass.bottom) - Math.max(roof.top, compass.top));
      return { host: document.getElementById("plan-tools").parentElement.id,
        overflow: strip.scrollWidth > strip.clientWidth,
        next: !document.querySelector("#view-3d .tool-scroll-next").hidden, overlap };
    });
    assert.deepEqual(initial, { host: "view-3d", overflow: true, next: true, overlap: 0 });
    await page.eval(() => document.querySelector("#view-3d .tool-scroll-next").click());
    await page.waitUntil(() => document.querySelector("#view-3d .tool-command-strip").scrollLeft > 10,
      { what: "3D command ribbon scroll" });
  } finally { await page.close(); }
});

test("Hebrew labels keep CAD command order and overflow navigation usable", opts, async () => {
  const page = await openPage({ width: 1180, height: 760, mobile: false, touch: false });
  try {
    await classicLayout(page);
    const initial = await page.eval(async () => {
      const { setLang } = await import("/js/i18n.js");
      await setLang("he");
      const strip = document.querySelector("#view-2d .tool-command-strip");
      return { direction: getComputedStyle(strip).direction,
        overflow: strip.scrollWidth > strip.clientWidth,
        next: !document.querySelector("#view-2d .tool-scroll-next").hidden };
    });
    assert.deepEqual(initial, { direction: "ltr", overflow: true, next: true });
    await page.eval(() => document.querySelector("#view-2d .tool-scroll-next").click());
    await page.waitUntil(() => document.querySelector("#view-2d .tool-command-strip").scrollLeft > 10,
      { what: "Hebrew command ribbon scroll" });
  } finally { await page.close(); }
});

test("floor navigation stays visible across all desktop view modes", opts, async () => {
  const page = await openPage({ width: 1280, height: 900, mobile: false, touch: false });
  try {
    const results = await page.eval(async () => {
      const chrome = await import(document.querySelector('script[src*="planner_chrome.js"]').src);
      document.getElementById("start-screen").hidden = true;
      chrome.addFloorFromUI();
      const results = [];
      for (const mode of ["plan", "3d", "split", "plan"]) {
        window.__setViewMode(mode);
        await new Promise(requestAnimationFrame);
        await new Promise(requestAnimationFrame);
        const host = document.getElementById("floor-tabs");
        const bounds = host.getBoundingClientRect();
        results.push({ mode, visible: bounds.width > 0 && bounds.height > 0,
          floors: host.querySelectorAll("button:not(.floor-add)").length,
          pressed: document.getElementById({ plan: "viewPlanBtn", "3d": "view3dBtn", split: "viewSplitBtn" }[mode]).getAttribute("aria-pressed") });
      }
      return results;
    });
    for (const result of results) {
      assert.equal(result.visible, true, result.mode + " must expose floor navigation: " + JSON.stringify(result));
      assert.equal(result.floors, 2);
      assert.equal(result.pressed, "true");
    }
  } finally { await page.close(); }
});

test("blank and demo start choices restore the current model with one undo", opts, async () => {
  const page = await openPage({ width: 1280, height: 900, mobile: false, touch: false });
  try {
    const results = await page.eval(async () => {
      const { S } = await import("/js/state.js");
      const { undo } = await import("/js/history.js");
      const { defaultScene } = await import("/js/furniture.js");
      const { openStartScreen } = await import(document.querySelector('script[src*="planner_chrome.js"]').src);
      const results = [];
      const model = () => ({
        walls: S.walls.map(({ id, a, b, thickness, height }) => ({ id, a, b, thickness, height })),
        items: S.items.map(({ id, type, x, z, w, d, h, rot }) => ({ id, type, x, z, w, d, h, rot })),
      });
      for (const kind of ["blank", "demo"]) {
        defaultScene();
        S.items[0].x = 731;
        const before = model();
        openStartScreen();
        document.querySelector('[data-start="' + kind + '"]').click();
        const changed = JSON.stringify(model()) !== JSON.stringify(before);
        undo();
        results.push({ kind, changed, before, after: model() });
      }
      return results;
    });
    for (const result of results) {
      assert.equal(result.changed, true, result.kind);
      assert.deepEqual(result.after, result.before, result.kind + " must undo to the model just replaced");
    }
  } finally { await page.close(); }
});

test("planner chrome and layout toggle tolerate unavailable preference storage", opts, async () => {
  const page = await openPage({ width: 1280, height: 900, mobile: false, touch: false });
  try {
    assert.equal(await page.eval(async () => {
      const chrome = await import(document.querySelector('script[src*="planner_chrome.js"]').src);
      const getItem = Storage.prototype.getItem;
      try {
        Storage.prototype.getItem = function () { throw new DOMException("Storage denied", "SecurityError"); };
        document.getElementById("left-sidebar").removeAttribute("data-left");
        chrome.applyPlannerChrome();
        chrome.toggleLegacyUI();
        chrome.toggleLegacyUI();
        return document.getElementById("left-sidebar").getAttribute("data-left");
      } finally { Storage.prototype.getItem = getItem; }
    }), "library");
  } finally { await page.close(); }
});
