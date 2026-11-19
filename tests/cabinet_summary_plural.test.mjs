import test from "node:test";
import assert from "node:assert/strict";
import * as cab from "../js/cabinet.js";
import { setLang } from "../js/i18n.js";
import { S } from "../js/state.js";

// one column, one door, one drawer, one shelf, one rail
function single(cols = 1) {
  const w = 60 * cols;
  const it = { type: "cabsys", w, d: 60, h: 240, x: 0, z: 0, rot: 0, room: null };
  it.cab = cab.makeSpec("w_classic", w, 240, 60);
  it.cab.auto = false;
  const col = () => ({
    w: 56,
    secs: [{ t: "drawers", h: 21, n: 1 }, { t: "shelves", h: 40, n: 1 }, { t: "hang", h: 160 }],
    door: { t: "hinged", leaves: 1, hinge: "R" },
  });
  it.cab.cols = Array.from({ length: cols }, col);
  cab.normalizeSpec(it.cab, w, 240, 60);
  S.items = [it];
  return it;
}

// setLang repaints static markup; Node has none, so give it an empty page
async function inLang(lang, fn) {
  const prev = globalThis.document;
  globalThis.document = { documentElement: {}, querySelectorAll: () => [] };
  try {
    await setLang(lang);
    return fn();
  } finally {
    if (prev === undefined) delete globalThis.document;
    else globalThis.document = prev;
  }
}

test("English: singular for one, plural for more", async () => {
  await inLang("en", () => {
    assert.equal(cab.cabSummary(single(1)), "1 column · 1 door · 1 drawer · 1 shelf · 1 rail");
    assert.equal(cab.cabSummary(single(2)), "2 columns · 2 doors · 2 drawers · 2 shelves · 2 rails");
  });
});

test("Hebrew: singular for one, plural for more", async () => {
  await inLang("he", () => {
    assert.equal(cab.cabSummary(single(1)), "1 עמודה · 1 דלת · 1 מגירה · 1 מדף · 1 מוט");
    assert.equal(cab.cabSummary(single(2)), "2 עמודות · 2 דלתות · 2 מגירות · 2 מדפים · 2 מוטות");
  });
  await inLang("en", () => {});
});
