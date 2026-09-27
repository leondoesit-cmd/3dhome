/* The Round-6 layout in a real browser (css/pro_skin.css, js/pro_ribbon.js):
 * the desktop header, ribbon and Split, and the phone and fold chrome — the
 * slim header, the strip, the bottom tools-grid + Ask bar that replaces the
 * five-slot navigations — in all three editors. The classic chrome still
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

test("phone planner: slim header, the tools grid and Ask bar at the bottom, no five-slot navigation", opts, async () => {
  const page = await openPage({ width: 390, height: 844, lang: "en", mobile: true, touch: true });
  try {
    await ready(page);
    const layout = await page.eval(() => {
      const bar = document.querySelector("#center-canvas > .ps-cmdbar");
      const head = document.getElementById("psPhoneHead");
      const nav = document.getElementById("mobile-nav");
      const r = bar.getBoundingClientRect();
      return {
        compact: document.body.classList.contains("pro-compact"),
        navShown: getComputedStyle(nav).display !== "none",
        headShown: !!head && head.getBoundingClientRect().height > 0,
        name: head && head.querySelector(".ps-ph-name").textContent.length > 0,
        grid: !!bar.querySelector(".ps-grid"),
        barBottom: r.bottom, barTop: r.top, viewport: innerHeight, barWidth: r.width,
      };
    });
    assert.equal(layout.compact, true);
    assert.equal(layout.navShown, false, "the five-slot navigation is replaced");
    assert.equal(layout.headShown, true);
    assert.equal(layout.name, true, "the header names the project");
    assert.equal(layout.grid, true, "the bar leads with the tools grid");
    assert.ok(layout.barBottom <= layout.viewport && layout.barBottom > layout.viewport - 24, "the bar sits at the bottom: " + JSON.stringify(layout));
    assert.ok(layout.barWidth > 340, "the bar spans the phone");
    // the grid opens the tools sheet, and the sheet ends above the bar
    await page.eval(() => document.querySelector("#center-canvas > .ps-cmdbar .ps-grid").click());
    await page.waitUntil(() => document.body.classList.contains("m-sheet-open") &&
      document.getElementById("m-sheet").getBoundingClientRect().bottom <= innerHeight, { what: "the tools sheet, settled" });
    await page.eval(() => new Promise((r) => setTimeout(r, 700))); // the slide-in
    const sheet = await page.eval(() => ({
      bottom: document.getElementById("m-sheet").getBoundingClientRect().bottom,
      barTop: document.querySelector("#center-canvas > .ps-cmdbar").getBoundingClientRect().top,
    }));
    assert.ok(sheet.bottom <= sheet.barTop + 1, "the sheet ends above the bar: " + JSON.stringify(sheet));
  } finally { await page.close(); }
});

test("phone model editor and cabinet designer: the view pill on a strip, a header that fits, the bar at the bottom", opts, async () => {
  const page = await openPage({ width: 390, height: 844, lang: "en", mobile: true, touch: true });
  try {
    await ready(page);
    await page.eval(async () => { (await import("/js/pro_shell.js")).switchEditor("model"); });
    await page.waitUntil(() => {
      const el = document.getElementById("modeler");
      return el && el.getBoundingClientRect().height > 0 && !!el.querySelector(".ps-ed-strip #mdModes");
    }, { what: "the model editor on its strip" });
    const md = await page.eval(() => {
      const head = document.querySelector("#modeler .md-head");
      const bar = document.querySelector("#modeler .md-mid > .ps-cmdbar");
      const banner = document.querySelector("#modeler .md-mobile-status");
      const hint = document.getElementById("mdHint");
      if (banner) { banner.hidden = false; banner.textContent = "Rebuild errors · 1"; }
      const br = banner && banner.getBoundingClientRect(), hr = hint && hint.getBoundingClientRect();
      return {
        overflow: head.scrollWidth - head.clientWidth,
        navShown: !!document.getElementById("md-nav") && getComputedStyle(document.getElementById("md-nav")).display !== "none",
        barBottom: bar.getBoundingClientRect().bottom, viewport: innerHeight,
        plannerBarShown: getComputedStyle(document.querySelector("#center-canvas > .ps-cmdbar")).display !== "none",
        bannerClear: !br || !hr || br.top >= hr.bottom || br.bottom <= hr.top,
      };
    });
    assert.ok(md.overflow <= 0, "the header fits: " + md.overflow);
    assert.equal(md.navShown, false);
    assert.ok(md.barBottom <= md.viewport && md.barBottom > md.viewport - 24, "the bar at the bottom");
    assert.equal(md.plannerBarShown, false, "the planner's bar steps aside for the editor's");
    assert.equal(md.bannerClear, true, "the status banner is clear of the hint under the strip");

    await page.eval(async () => {
      (await import("/js/pro_shell.js")).switchEditor("plan");
      const st = await import("/js/state.js"), cab = await import("/js/ui_cabinet.js");
      let it = st.S.items.find((i) => i.type === "base" || i.cab);
      if (!it) it = st.S.items[0];
      cab.openCabinet(it);
    });
    await page.waitUntil(() => !!document.querySelector("#cabdes .ps-ed-strip .cb-vmodes"), { what: "the cabinet designer on its strip" });
    // two passes of the shell later, still exactly one strip
    await page.eval(() => new Promise((r) => setTimeout(r, 3300)));
    const cb = await page.eval(() => {
      const head = document.querySelector("#cabdes .cb-head-main");
      const bar = document.querySelector("#cabdes .cb-mid > .ps-cmdbar");
      return {
        strips: document.querySelectorAll("#cabdes .ps-ed-strip").length,
        overflow: head.scrollWidth - head.clientWidth,
        grid: !!bar.querySelector(".ps-grid"),
        barBottom: bar.getBoundingClientRect().bottom, viewport: innerHeight,
      };
    });
    assert.equal(cb.strips, 1, "one strip, however many passes");
    assert.ok(cb.overflow <= 0, "the header fits: " + cb.overflow);
    assert.equal(cb.grid, true);
    assert.ok(cb.barBottom <= cb.viewport && cb.barBottom > cb.viewport - 24);
  } finally { await page.close(); }
});

test("fold: the bar sits under the plan, inside the canvas", opts, async () => {
  const page = await openPage({ width: 832, height: 750, lang: "en", mobile: false, touch: true });
  try {
    await ready(page);
    await page.waitUntil(() => document.body.classList.contains("dock-rail"), { what: "the fold posture" });
    const r = await page.eval(() => {
      const bar = document.querySelector("#center-canvas > .ps-cmdbar").getBoundingClientRect();
      const canvas = document.getElementById("center-canvas").getBoundingClientRect();
      return { bar: { l: bar.left, r: bar.right, b: bar.bottom }, canvas: { l: canvas.left, r: canvas.right, b: canvas.bottom } };
    });
    assert.ok(r.bar.l >= r.canvas.l - 1 && r.bar.r <= r.canvas.r + 1 && r.bar.b <= r.canvas.b + 1, JSON.stringify(r));
  } finally { await page.close(); }
});

test("desktop: one header, the search in the tabs row, Split over the inspector, and the classic layout on request", opts, async () => {
  const page = await openPage({ width: 1440, height: 900, lang: "en", mobile: false, touch: false });
  try {
    await ready(page);
    const head = await page.eval(() => ({
      skin: document.body.classList.contains("pro-skin"),
      switcher: !!document.querySelector("#topbar .pr-editors[data-ps-moved]"),
      search: document.getElementById("toolSearch").parentElement.classList.contains("pr-bar"),
      topbarHeight: document.getElementById("topbar").getBoundingClientRect().height,
      stripHidden: getComputedStyle(document.getElementById("plan-toolbar")).display === "none",
    }));
    assert.deepEqual(head, { skin: true, switcher: true, search: true, topbarHeight: 44, stripHidden: true });
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
      searchHome: !document.getElementById("toolSearch").closest(".pro-ribbon"),
    }));
    assert.deepEqual(classic, { skin: false, searchHome: true });
    await page.eval(() => localStorage.removeItem("mf.proSkin"));
  } finally { await page.close(); }
});
