/* Chrome that has to stay clear of other chrome at the sizes people use:
   the first-run card between the phone's top bar and dock, Share keeping a
   label on a narrow desktop, the plan-style chip above a tablet's floating
   dock, Fit framing the plan above a sideways phone's dock, and the plan's
   corner cards apart at 1280px. Each was found overlapping in a
   desktop/phone/fold layout pass. */
import test from "node:test";
import assert from "node:assert/strict";
import { openPage, findChrome } from "../tools/browser_harness.mjs";

const chrome = await findChrome();
const opts = chrome ? {} : { skip: "no Chrome found (set CHROME_PATH)" };

const box = (sel) => {
  const el = typeof sel === "string" ? document.querySelector(sel) : sel;
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
};

test("phone: the start card scrolls between the top bar and the dock", opts, async () => {
  for (const [width, height] of [[390, 844], [344, 882], [844, 390]]) {
    const page = await openPage({ width, height, mobile: true, touch: true });
    try {
      const out = await page.eval((boxSrc) => {
        const box = new Function("return " + boxSrc)();
        const start = document.getElementById("start-screen");
        start.hidden = false;
        return { screen: box("#start-screen"), top: box("#topbar"), dock: box(".ps-dock") };
      }, box.toString());
      assert.ok(out.screen.top >= out.top.bottom - 1, `${width}px: the card starts under the top bar`);
      assert.ok(out.screen.bottom <= out.dock.top + 1, `${width}px: the card ends above the dock`);
    } finally {
      await page.close();
    }
  }
});

test("desktop 1024px: Share keeps its label", opts, async () => {
  const page = await openPage({ width: 1024, height: 768, mobile: false, touch: false });
  try {
    const share = await page.eval(() => {
      const b = document.querySelector("#topbar .ps-share");
      const label = b && b.querySelector("span");
      return { width: b ? b.getBoundingClientRect().width : 0, label: label ? getComputedStyle(label).display : "missing" };
    });
    assert.notEqual(share.label, "none");
    assert.ok(share.width > 40, "Share is " + share.width + "px wide");
  } finally {
    await page.close();
  }
});

test("tablet and fold: the plan-style chip sits above the floating dock", opts, async () => {
  for (const [width, height] of [[768, 1024], [673, 841]]) {
    const page = await openPage({ width, height, mobile: true, touch: true });
    try {
      const out = await page.eval((boxSrc) => {
        const box = new Function("return " + boxSrc)();
        document.getElementById("start-screen").hidden = true;
        return { chip: box("#view-2d > .plan-style-btn"), dock: box(".ps-dock") };
      }, box.toString());
      assert.ok(out.chip && out.chip.height > 0, "the chip is shown");
      assert.ok(out.chip.bottom <= out.dock.top, `${width}px: chip ${out.chip.bottom} vs dock ${out.dock.top}`);
    } finally {
      await page.close();
    }
  }
});

test("phone held sideways: Fit frames the whole plan above the dock", opts, async () => {
  const page = await openPage({ width: 844, height: 390, mobile: true, touch: true });
  try {
    const out = await page.eval(async () => {
      document.getElementById("start-screen").hidden = true;
      const [{ S }, plan2d, geom] = await Promise.all([
        import("/js/state.js"), import("/js/plan2d.js"), import("/js/geometry.js"),
      ]);
      plan2d.fitView();
      const bb = geom.contentBounds();
      const canvas = document.getElementById("plan").getBoundingClientRect();
      const dock = document.querySelector(".ps-dock").getBoundingClientRect();
      return { planBottom: canvas.top + plan2d.sz(bb.maxz), dockTop: dock.top, sc: S.SC };
    });
    assert.ok(out.sc > 0);
    assert.ok(out.planBottom <= out.dockTop, `plan ends at ${out.planBottom}, dock starts at ${out.dockTop}`);
  } finally {
    await page.close();
  }
});

test("desktop 1280px: the floor track and the plan compass do not overlap", opts, async () => {
  const page = await openPage({ width: 1280, height: 800, mobile: false, touch: false });
  try {
    const out = await page.eval((boxSrc) => {
      const box = new Function("return " + boxSrc)();
      document.getElementById("start-screen").hidden = true;
      return {
        floors: box('#plan-tools .pt-panel[data-panel="floors"]'),
        gizmo: box('#plan-tools .pt-panel[data-panel="gizmo"]'),
        max: box('#plan-tools .pt-panel[data-panel="max"]'),
      };
    }, box.toString());
    const hits = (a, b) => a && b && a.width && b.width &&
      a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
    assert.equal(hits(out.floors, out.gizmo), false, "floors vs compass");
    assert.equal(hits(out.max, out.gizmo), false, "maximise vs compass");
  } finally {
    await page.close();
  }
});

test("model editor: the six views sit behind one button and the rail no longer scrolls", opts, async () => {
  const page = await openPage({ width: 1280, height: 800, mobile: false, touch: false });
  try {
    const out = await page.evalWithTimeout(60000, async () => {
      document.getElementById("start-screen").hidden = true;
      const m = await import("/js/modeler.js");
      await m.openModeler();
      for (let i = 0; i < 100 && !document.getElementById("mdViewOrient"); i++) await new Promise((r) => setTimeout(r, 100));
      document.getElementById("mdWelcomeClose")?.click();
      await new Promise((r) => setTimeout(r, 300));
      const rail = document.getElementById("mdViews"), toggle = document.getElementById("mdViewOrient");
      const fly = document.getElementById("mdViewFlyout");
      const closedHidden = fly.hidden;
      toggle.click();
      await new Promise((r) => setTimeout(r, 100));
      const f = fly.getBoundingClientRect(), b = toggle.getBoundingClientRect();
      const views = [...fly.querySelectorAll("[data-view]")].map((x) => x.getAttribute("data-view"));
      fly.querySelector('[data-view="front"]').click();
      await new Promise((r) => setTimeout(r, 300));
      return {
        closedHidden, views, beside: f.left >= b.right && f.left - b.right < 16 && Math.abs(f.top - b.top) < 40,
        closedAfterPick: fly.hidden, scrolls: rail.scrollHeight > rail.clientHeight + 1,
        showsFront: toggle.querySelector("svg").outerHTML === fly.querySelector('[data-view="front"] svg').outerHTML,
      };
    });
    assert.equal(out.closedHidden, true);
    assert.deepEqual(out.views, ["top", "bottom", "front", "back", "side", "left"]);
    assert.equal(out.beside, true, "the flyout opens beside its button");
    assert.equal(out.closedAfterPick, true);
    assert.equal(out.showsFront, true, "the rail button shows the chosen view");
    assert.equal(out.scrolls, false, "the rail fits a 800px window");
  } finally {
    await page.close();
  }
});
