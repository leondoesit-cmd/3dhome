// Every command stays reachable with minimum friction, in every posture:
//   desktop / narrow windows — each catalog tool of each ribbon tab is a
//     visible, unobstructed tile, or one click away in its group's fold or
//     "+N" drop-down (js/ribbon_fit.js); nothing slides off under a hidden
//     scrollbar;
//   big touch screens — the same layout with finger-sized tabs and menu rows;
//   phones and folds — the dock's buttons are 44px and uncovered, its verb
//     row never overflows (the rest sit in More), the tools sheet reaches every
//     tool of all three editors and searches them, and the More sheet keeps
//     Reset all apart.
import test from "node:test";
import assert from "node:assert/strict";
import { openPage, findChrome } from "../tools/browser_harness.mjs";

const chrome = await findChrome();

/* A fresh profile opens on the first-run start dialog, which covers the
   ribbon on purpose; what is measured here is the ribbon behind it. */
const skipStart = (page) => page.eval(() => {
  const start = document.getElementById("start-screen");
  if (start) start.hidden = true;
});

/* In the page: walk every tab of one ribbon. Returns the problems found and
   how many tools were checked. */
async function auditRibbon(selector, minTarget) {
  const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
  const host = [...document.querySelectorAll(selector)].find((h) => h.getBoundingClientRect().width > 0);
  if (!host) return { problems: ["no visible ribbon for " + selector], checked: 0 };
  const problems = [];
  let checked = 0;
  const label = (b) => (b.getAttribute("aria-label") || b.textContent || "").trim();
  const onScreen = (b, what) => {
    const r = b.getBoundingClientRect();
    if (!r.width || r.left < -1 || r.right > innerWidth + 1 || r.top < -1 || r.bottom > innerHeight + 1) { problems.push(what + " is off-screen"); return false; }
    if (r.height < minTarget || r.width < minTarget) problems.push(what + " is " + Math.round(r.width) + "×" + Math.round(r.height) + "px");
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    if (!hit || !(b === hit || b.contains(hit))) problems.push(what + " is covered by " + (hit ? hit.tagName + "." + hit.className : "nothing"));
    return true;
  };
  const tabs = [...host.querySelectorAll(".pr-tab")];
  for (const tab of tabs) {
    tab.click();
    await frame(); await frame();
    const tabName = tab.textContent.trim();
    for (const g of host.querySelectorAll(".pr-groups > .pr-group")) {
      const all = [...g.querySelectorAll(".pr-items > .pr-tool")].filter((b) => !b.disabled);
      const folded = g.classList.contains("pr-g-folded");
      const shown = folded ? [] : all.filter((b) => !b.classList.contains("pr-t-over"));
      const opener = folded ? g.querySelector(".pr-fold") : g.querySelector(".pr-items > .pr-fold-more:not([hidden])");
      const reach = new Set();
      shown.forEach((b) => { if (onScreen(b, tabName + " › " + label(b))) reach.add(label(b)); });
      if (opener && onScreen(opener, tabName + " › fold " + label(opener))) {
        opener.click();
        await frame();
        const menu = document.querySelector(".pr-fold-menu");
        if (!menu) problems.push(tabName + " › " + label(opener) + " opened no menu");
        else {
          for (const item of menu.querySelectorAll(".pr-menu-item")) {
            if (onScreen(item, tabName + " › " + label(opener) + " › " + label(item))) reach.add(label(item));
          }
          menu.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
          await frame();
          if (document.querySelector(".pr-fold-menu")) problems.push(tabName + " › " + label(opener) + " did not close on Escape");
        }
      }
      for (const b of all) {
        checked++;
        if (!reach.has(label(b))) problems.push(tabName + " › " + label(b) + " is not reachable");
      }
    }
    if (host.classList.contains("pr-overflow")) {
      const next = host.querySelector(".pr-scroll-next");
      if (!next || !next.getBoundingClientRect().width) problems.push(tabName + " overflows with no scroll button");
    }
  }
  tabs[0].click();
  return { problems, checked };
}

async function openModel(page) {
  await page.eval(() => window.__runAction("openModeler"));
  await page.waitUntil(() => [...document.querySelectorAll("#modeler .pr-editor-ribbon, #md-nav")].some((e) => e.getBoundingClientRect().height > 0), { what: "the model editor" });
  await page.eval(() => { const x = document.querySelector("#mdWelcomeClose"); if (x && x.getBoundingClientRect().width) x.click(); });
}
async function openCabinet(page) {
  await page.eval(async () => {
    const { openCabinet } = await import("/js/ui_cabinet.js");
    const { S } = await import("/js/state.js");
    const item = { id: "menu-reach", type: "cabsys", x: 0, y: 0, z: 0, w: 120, h: 200, d: 60, rot: 0 };
    S.items.push(item);
    openCabinet(item);
  });
  await page.waitUntil(() => [...document.querySelectorAll("#cabdes .pr-editor-ribbon, #cabdes .cb-m-nav, #cabdes .ps-dock")].some((e) => e.getBoundingClientRect().height > 0), { what: "the cabinet designer" });
}

for (const [width, height, lang, editors] of [
  [1440, 900, "en", ["plan"]],
  [1280, 800, "en", ["plan", "model", "cab"]],
  [1024, 768, "en", ["plan", "model", "cab"]],
  [1024, 768, "he", ["plan", "model"]],
  [720, 800, "en", ["plan", "model"]],
]) {
  test(`desktop ${width}×${height} ${lang}: every ribbon tool is visible or one click away`, { skip: !chrome }, async () => {
    const page = await openPage({ width, height, lang, mobile: false, touch: false });
    try {
      await page.waitForBoot();
    await skipStart(page);
      assert.equal(await page.eval(() => document.body.classList.contains("pro-skin")), true, "the desktop layout");
      for (const ed of editors) {
        if (ed === "model") await openModel(page);
        if (ed === "cab") await openCabinet(page);
        const sel = ed === "plan" ? "#pro-ribbon" : ed === "model" ? "#modeler .pr-editor-ribbon" : "#cabdes .pr-editor-ribbon";
        const out = await page.eval(auditRibbon, sel, 24);
        assert.ok(out.checked > 20, ed + ": checked " + out.checked + " tools");
        assert.deepEqual(out.problems, [], ed + " at " + width + "px");
        if (ed === "model") await page.eval(() => window.__runAction && window.__runAction("closeModeler"));
        if (ed === "cab") await page.eval(() => document.querySelector("#cbClose")?.click());
      }
    } finally {
      await page.close();
    }
  });
}

test("big touch screen 1366×1024: the desktop layout with finger-sized tabs and menus", { skip: !chrome }, async () => {
  const page = await openPage({ width: 1366, height: 1024, lang: "en", mobile: false, touch: true });
  try {
    await page.waitForBoot();
    await skipStart(page);
    const posture = await page.eval(() => ({ desk: document.body.classList.contains("pro-skin"), touch: document.body.classList.contains("touch-desk"), compact: document.body.classList.contains("compact-nav") }));
    assert.deepEqual(posture, { desk: true, touch: true, compact: false });
    const out = await page.eval(auditRibbon, "#pro-ribbon", 44);
    assert.deepEqual(out.problems, []);
    const tab = await page.eval(() => Math.round(document.querySelector("#pro-ribbon .pr-tab").getBoundingClientRect().height));
    assert.ok(tab >= 44, "ribbon tabs are " + tab + "px");
  } finally {
    await page.close();
  }
});

for (const [width, height, lang] of [[375, 812, "en"], [390, 844, "he"], [717, 829, "en"]]) {
  test(`compact ${width}×${height} ${lang}: dock, tools sheet search and More reach everything`, { skip: !chrome }, async () => {
    const page = await openPage({ width, height, lang, mobile: true, touch: true });
    try {
      await page.waitForBoot();
    await skipStart(page);
      await page.waitUntil(() => [...document.querySelectorAll(".ps-dock")].some((d) => d.getBoundingClientRect().height > 0), { what: "the dock" });
      // a frame for the dock's verb row to fit itself
      await page.eval(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      const dock = await page.eval(() => {
        const d = [...document.querySelectorAll(".ps-dock")].find((x) => x.getBoundingClientRect().height > 0);
        const row = d.querySelector(".ps-dock-slot > :not(.ps-dock-more)");
        const problems = [];
        d.querySelectorAll("button").forEach((b) => {
          const r = b.getBoundingClientRect();
          if (!r.width) return;
          const name = (b.getAttribute("aria-label") || b.textContent).trim();
          if (r.height < 44 || r.width < 44) problems.push(name + " is " + Math.round(r.width) + "×" + Math.round(r.height));
          if (r.left < -1 || r.right > innerWidth + 1) problems.push(name + " is off-screen");
          const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          if (!hit || !b.contains(hit)) problems.push(name + " is covered");
        });
        const captions = [...d.querySelectorAll(".ps-dock-grid .ps-cap, .ps-dock-browse .ps-cap")].map((c) => c.textContent.trim());
        return { problems, overflow: row ? row.scrollWidth - row.clientWidth : 0, captions };
      });
      assert.deepEqual(dock.problems, [], "dock buttons");
      assert.ok(dock.overflow <= 1, "the verb row does not scroll sideways (" + dock.overflow + "px)");
      assert.equal(dock.captions.filter(Boolean).length, 2, "Tools and the browser are captioned");

      // the tools sheet: search across editors, then every tool by chip and tab
      const sheet = await page.eval(async () => {
        const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
        const { proTools } = await import("/js/pro_catalog.js");
        window.__mobileFindTool();
        await frame();
        const input = document.querySelector("#m-sheet .pro-sheet-search input");
        const focused = document.activeElement === input;
        const visible = !!input && input.getBoundingClientRect().height >= 36;
        input.value = "smart dimension";
        input.dispatchEvent(new Event("input"));
        await frame();
        const found = [...document.querySelectorAll("#m-sheet .pro-sheet-results .m-grid-btn")].map((b) => b.getAttribute("aria-label"));
        input.value = "";
        input.dispatchEvent(new Event("input"));
        await frame();
        const seen = new Set();
        const chips = () => [...document.querySelectorAll("#m-sheet .pro-sheet > .pro-sheet-chips:not(.pro-sheet-tabs) .pro-chip")];
        for (let e = 0; e < chips().length; e++) {
          chips()[e].click();
          await frame();
          const tabs = () => [...document.querySelectorAll("#m-sheet .pro-sheet-tabs .pro-chip")];
          for (let t = 0; t < tabs().length; t++) {
            tabs()[t].click();
            await frame();
            document.querySelectorAll("#m-sheet .pro-sheet .m-grid-btn").forEach((b) => seen.add(e + "|" + b.dataset.proTool));
          }
        }
        const total = ["plan", "model", "cab"].reduce((n, ed) => n + new Set(proTools(ed).map((t) => t.label)).size, 0);
        return { focused, visible, found, seen: seen.size, total };
      });
      assert.equal(sheet.visible, true, "the search field shows");
      assert.equal(sheet.focused, true, "Find a tool focuses it");
      assert.ok(sheet.found.some((l) => /^Smart dimension/.test(l) || /^מידה חכמה/.test(l)), "searching finds the model editor's Smart dimension: " + sheet.found.join(", "));
      assert.equal(sheet.seen, sheet.total, "every tool of all three editors is on the sheet");

      const more = await page.eval(async () => {
        const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
        const { S } = await import("/js/state.js");
        S.sel = null;
        document.querySelector("#m-sheet .m-sheet-x")?.click();
        await frame();
        document.querySelector('[data-mnav="more"]').click();
        await frame();
        const bodyEl = document.querySelector("#m-sheet .m-sheet-body");
        const last = bodyEl.lastElementChild;
        const reset = last && last.matches(".m-more-danger") ? last.querySelector(".m-list-btn") : null;
        const greyed = [...bodyEl.querySelectorAll(".m-list-btn:disabled")].length;
        return { resetLast: !!reset, resetOnly: last ? last.querySelectorAll(".m-list-btn").length : 0, greyed, note: !!bodyEl.querySelector(".m-list-note") };
      });
      assert.equal(more.resetLast, true, "Reset all closes the More sheet, in its own section");
      assert.equal(more.resetOnly, 1, "and nothing shares that section");
      assert.ok(more.greyed >= 3 && more.note, "selection verbs are greyed, with the reason, when nothing is selected");
    } finally {
      await page.close();
    }
  });
}
