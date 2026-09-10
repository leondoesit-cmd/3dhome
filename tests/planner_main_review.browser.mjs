import test from "node:test";
import assert from "node:assert/strict";
import { openPage, findChrome } from "../tools/browser_harness.mjs";

const opts = await findChrome() ? {} : { skip: "no Chrome found" };

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
    await page.eval(() => window.__toggleToolNames());
    await page.goto("/");
    assert.equal(await page.eval(() => document.getElementById("plan-toolbar").classList.contains("show-titles")), false);
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
        const host = document.getElementById("floor-tabs");
        const bounds = host.getBoundingClientRect();
        results.push({ mode, visible: bounds.width > 0 && bounds.height > 0,
          floors: host.querySelectorAll("button:not(.floor-add)").length,
          pressed: document.getElementById({ plan: "viewPlanBtn", "3d": "view3dBtn", split: "viewSplitBtn" }[mode]).getAttribute("aria-pressed") });
      }
      return results;
    });
    for (const result of results) {
      assert.equal(result.visible, true, result.mode + " must expose floor navigation");
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
