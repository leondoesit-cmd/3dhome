/* Night Shift's responsive work is geometry: seven touch controls that must not
   overlap, a HUD that must not collide on a 280 px cover screen, and an
   intermission panel that must stay off a foldable's hinge.
   tests/zombies_responsive.test.mjs asserts that the CSS and JS SOURCE contains
   particular strings, which is a different thing — it cannot tell whether a
   grid resolved wider than its viewport, and it passes unchanged while two
   buttons sit on top of each other. This measures the rendered result instead.

   One browser is started for the whole sweep and resized between postures,
   which is also closer to what actually happens to a phone. */
import test from "node:test";
import assert from "node:assert/strict";
import { openPage } from "../tools/browser_harness.mjs";

const POSTURES = [
  { w: 280, h: 653, name: "folded cover screen" },
  { w: 320, h: 480, name: "small legacy phone" },
  { w: 360, h: 780, name: "narrow phone" },
  { w: 390, h: 844, name: "phone" },
  { w: 720, h: 360, name: "phone landscape" },
  { w: 800, h: 720, name: "foldable open" },
  { w: 844, h: 390, name: "tablet landscape" },
  { w: 1024, h: 768, name: "tablet" },
];

const ACTIONS = /^(reload|flash|shove|jump|weapon|interact|fire)$/;

/* Runs inside the page: every visible HUD box, measured once, with each element
   counted a single time — the fire button matches both .z-touch-fire and the
   action-grid selector, and double counting it reads as a 100% self-overlap. */
const MEASURE = function () {
  const hud = document.getElementById("zHud");
  if (!hud) return { err: "no #zHud" };
  const boxes = [], seen = new Set();
  const add = (el, name) => {
    if (!el || seen.has(el)) return;
    seen.add(el);
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden")
      boxes.push({ name, left: r.left, top: r.top, right: r.right, bottom: r.bottom, w: r.width, h: r.height });
  };
  hud.querySelectorAll(".z-touch-fire").forEach((el) => add(el, "fire"));
  hud.querySelectorAll(".z-touch-actions button").forEach((el) => add(el, el.dataset.act || "unnamed"));
  hud.querySelectorAll(".z-touch-stick").forEach((el) => add(el, "stick"));
  ["zTop", "zRadarWrap", "zMission", "zThreat"].forEach((id) => {
    const el = document.getElementById(id);
    if (el && el.offsetParent !== null) add(el, id);
  });
  const overlaps = [];
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      // a shared edge is not a collision; a shared area is
      if (ox > 1 && oy > 1) overlaps.push(a.name + " over " + b.name);
    }
  }
  const vw = window.innerWidth, vh = window.innerHeight;
  return {
    controls: boxes.filter((b) => /^(reload|flash|shove|jump|weapon|interact|fire)$/.test(b.name)).map((b) => b.name).sort(),
    overlaps,
    offscreen: boxes.filter((b) => b.left < -1 || b.top < -1 || b.right > vw + 1 || b.bottom > vh + 1).map((b) => b.name),
    tooSmall: boxes.filter((b) => /^(reload|flash|shove|jump|weapon|interact|fire)$/.test(b.name))
      .filter((b) => b.w < 40 || b.h < 40).map((b) => b.name + " " + Math.round(b.w) + "x" + Math.round(b.h)),
    hScroll: document.documentElement.scrollWidth > vw + 1,
  };
};

async function nightShift(page) {
  await page.goto("/");
  await page.eval(() => new Promise((r) => setTimeout(r, 3000)));
  await page.eval(async function () {
    const mod = await import("./js/zombies_game.js");
    mod.toggleZombies(true);
    await new Promise((r) => setTimeout(r, 1200));
  });
}

test("Night Shift HUD lays out without collisions on every posture", async (t) => {
  const page = await openPage({ width: 390, height: 844, lang: "en", touch: true, mobile: true });
  if (!page) return t.skip("chrome not installed");
  try {
    await nightShift(page);
    for (const lang of ["en", "he"]) {
      await page.setLang(lang);
      for (const posture of POSTURES) {
        await page.resize(posture.w, posture.h, { mobile: true, touch: true });
        await page.eval(() => new Promise((r) => setTimeout(r, 320)));
        const m = await page.eval(MEASURE);
        const where = `${posture.name} (${posture.w}x${posture.h}, ${lang})`;
        assert.equal(m.err, undefined, where);
        assert.deepEqual(m.controls,
          ["fire", "flash", "interact", "jump", "reload", "shove", "weapon"],
          where + ": all seven controls visible and distinct");
        assert.deepEqual(m.overlaps, [], where + ": HUD boxes must not overlap");
        assert.deepEqual(m.offscreen, [], where + ": HUD must stay inside the viewport");
        assert.deepEqual(m.tooSmall, [], where + ": touch targets stay reachable");
        assert.equal(m.hScroll, false, where + ": the game must not scroll sideways");
      }
    }
  } finally { await page.close(); }
});

test("a spanning foldable keeps the intermission panel clear of the hinge", async (t) => {
  const page = await openPage({ width: 800, height: 720, lang: "en", touch: true, mobile: true });
  if (!page) return t.skip("chrome not installed");
  try {
    await nightShift(page);
    for (const [w, h] of [[800, 720], [884, 720], [1024, 768]]) {
      await page.resize(w, h, { mobile: true, touch: true });
      const m = await page.eval(async function () {
        document.body.classList.add("fold-span");
        const im = document.getElementById("zIntermission");
        if (!im) return { err: "no #zIntermission" };
        const prev = im.style.display;
        im.style.display = "flex";
        await new Promise((r) => setTimeout(r, 160));
        const r = im.getBoundingClientRect();
        const out = {
          left: r.left, right: r.right, hinge: window.innerWidth / 2,
          onScreen: r.left >= -1 && r.right <= window.innerWidth + 1,
        };
        im.style.display = prev;
        document.body.classList.remove("fold-span");
        return out;
      });
      const where = `${w}x${h}`;
      assert.equal(m.err, undefined, where);
      assert.ok(m.left > m.hinge + 1 || m.right < m.hinge - 1,
        `${where}: panel [${Math.round(m.left)}..${Math.round(m.right)}] straddles the hinge at ${Math.round(m.hinge)}`);
      assert.equal(m.onScreen, true, where + ": and it must not solve that by leaving the screen");
    }
  } finally { await page.close(); }
});

test("a breakpoint change cannot collapse the running game's 3D pane", async (t) => {
  const page = await openPage({ width: 390, height: 844, lang: "en", touch: true, mobile: true });
  if (!page) return t.skip("chrome not installed");
  try {
    await nightShift(page);
    const held = await page.eval(() =>
      document.getElementById("center-canvas").classList.contains("max-view-3d"));
    assert.equal(held, true, "the game owns the canvas while it is running");
    // the compact shell promotes the plan pane on a breakpoint; the game has to
    // win that race, or unfolding leaves the HUD over a zero-size #view-3d
    const after = await page.eval(async function () {
      const centre = document.getElementById("center-canvas");
      centre.classList.remove("max-view-3d");
      window.dispatchEvent(new Event("resize"));
      await new Promise((r) => setTimeout(r, 400));
      return centre.classList.contains("max-view-3d");
    });
    assert.equal(after, true, "3D is reasserted after the shell's own resize handler");
  } finally { await page.close(); }
});
