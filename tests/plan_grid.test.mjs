/* The plan grid's styles, saved choice and spacing (js/plan_grid.js). */
import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_GRID, GRID_STYLES, getGridPrefs, gridPalette, gridSteps, isDarkColor,
  normalizeGridPrefs, onGridChange, paintGrid, setGridPrefs,
} from "../js/plan_grid.js";

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
}

test("unknown styles and out-of-range opacity fall back or clamp", () => {
  assert.deepEqual(normalizeGridPrefs(null), DEFAULT_GRID);
  assert.deepEqual(normalizeGridPrefs({ style: "plaid", opacity: "x" }), DEFAULT_GRID);
  assert.equal(normalizeGridPrefs({ style: "dots", opacity: 3 }).opacity, 1);
  assert.equal(normalizeGridPrefs({ style: "dots", opacity: 0 }).opacity, 0.1);
  for (const style of GRID_STYLES) assert.equal(normalizeGridPrefs({ style }).style, style);
});

test("the default is the soft adaptive grid, not the old even net", () => {
  assert.equal(DEFAULT_GRID.style, "soft");
  assert.ok(DEFAULT_GRID.opacity < 1);
});

test("a choice is saved, read back and announced", () => {
  const storage = memoryStorage();
  const seen = [];
  const off = onGridChange((p) => seen.push(p.style));
  setGridPrefs({ style: "blueprint", opacity: 0.4 }, storage);
  off();
  assert.deepEqual(getGridPrefs(storage), { style: "blueprint", opacity: 0.4 });
  assert.deepEqual(seen, ["blueprint"]);
});

test("majors are round metres at least 56px apart; minors fade in from 9px", () => {
  for (const sc of [0.02, 0.1, 0.3, 0.6, 1.5, 4]) {
    const s = gridSteps(sc);
    assert.ok([100, 500, 1000, 5000, 10000].includes(s.major), "major " + s.major);
    if (s.major < 10000) assert.ok(s.major * sc >= 56, `sc ${sc}: major ${s.major}`);
    if (s.minor) {
      assert.ok(s.minor * sc >= 9 && s.major % s.minor === 0, `sc ${sc}: minor ${s.minor}`);
      assert.ok(s.minorFade >= 0 && s.minorFade <= 1);
    }
  }
  assert.equal(gridSteps(1.5).minor, 10, "close in: 10 cm minors");
});

test("lines are light on a dark canvas and ink on a light one", () => {
  assert.equal(isDarkColor("#0e1219"), true);
  assert.equal(isDarkColor("#f9fafb"), false);
  assert.equal(isDarkColor("rgb(213, 203, 191)"), false);
  assert.match(gridPalette("soft", true, 1).major, /^rgba\(226,232,240,/);
  assert.match(gridPalette("soft", false, 1).major, /^rgba\(30,41,59,/);
  const alpha = (c) => Number(c.match(/,([\d.]+)\)$/)[1]);
  assert.ok(alpha(gridPalette("soft", true, 0.3).major) < alpha(gridPalette("soft", true, 0.9).major), "opacity scales");
  assert.ok(alpha(gridPalette("soft", true, 1).minor) < alpha(gridPalette("soft", true, 1).major), "minors under majors");
});

function recorder() {
  const calls = { stroke: 0, fillRect: 0, moveTo: 0 };
  const ctx = new Proxy({}, {
    get(_, k) {
      if (k in calls) return () => { calls[k]++; };
      return () => {};
    },
    set() { return true; },
  });
  return { ctx, calls };
}

test("every style paints within bounds, and Off paints nothing", () => {
  const ext = { bxmin: 0, bxmax: 1200, bymin: 0, bymax: 800 };
  for (const style of GRID_STYLES) {
    for (const sc of [0.05, 0.5, 2]) {
      const { ctx, calls } = recorder();
      paintGrid(ctx, { ext, sc, ox: 37, oy: -12, dark: true, prefs: { style, opacity: 0.6 } });
      const marks = calls.stroke + calls.fillRect;
      if (style === "none") assert.equal(marks, 0);
      else assert.ok(marks > 0, `${style} at ${sc} drew nothing`);
      assert.ok(calls.fillRect <= 12000 && calls.moveTo <= 4000, `${style} at ${sc}: ${JSON.stringify(calls)}`);
    }
  }
});
