import test from "node:test";
import assert from "node:assert/strict";
import {
  spacesFromWalls, statedAreas, textStream, roomCountHint, countedRooms, roomLabelCheck, judgePage,
} from "../tools/plan_triage_lib.mjs";

// A 10 m x 8 m flat (cm), 20 cm walls: a partition at x = 600 splits it into
// a 6 x 8 living space and a 4 x 8 strip, which a partition at y = 400
// splits into two 4 x 4 bedrooms. Plus a balcony open on its far side (two
// walls; the flat's own wall is its third side).
const W = (ax, ay, bx, by, thickness = 20) => ({ a: { x: ax, y: ay }, b: { x: bx, y: by }, thickness });
const flat = [
  W(0, 0, 1000, 0), W(1000, 0, 1000, 800), W(1000, 800, 0, 800), W(0, 800, 0, 0),
  W(600, 0, 600, 800, 10), W(600, 400, 1000, 400, 10),
  W(0, 800, 0, 1000), W(300, 1000, 300, 800),
];

test("spaces: enclosed rooms and footprint; an open balcony stays outside", () => {
  const { spaces, footprint, locate } = spacesFromWalls(flat);
  assert.equal(spaces.length, 3);
  assert.ok(Math.abs(spaces[0].area - 6 * 8 * 0.95) < 3, "living ~ 6 x 8 minus wall halves");
  assert.ok(spaces.slice(1).every((s) => Math.abs(s.area - 15) < 2), "two ~4 x 4 bedrooms");
  // 10.2 x 8.2 to the outer faces, plus the balcony's own two walls (~0.8 m²)
  assert.ok(footprint > 82 && footprint < 86, `footprint ${footprint}`);
  assert.equal(countedRooms(spaces), 3);
  assert.equal(locate(300, 400), 0);
  assert.equal(locate(800, 200) === locate(800, 600), false, "bedrooms are separate spaces");
  assert.equal(locate(150, 900), -1, "the balcony floods from outside");
});

test("stated area: read across pdf.js fragments, not confused with the balcony", () => {
  const texts = ["דירה מס", "'", "7,11", "שטח דירה", "110.8", "מ", '"', "ר", "11.75", "מ", '"', "ר", "שטח מרפסת"].map((str) => ({ str }));
  assert.equal(textStream(texts).includes('110.8 מ"ר'), true);
  const s = statedAreas(texts);
  assert.equal(s.apartment, 110.8);
  assert.deepEqual(s.all, [110.8, 11.75]);
  assert.equal(statedAreas([{ str: "שטח מרפסת" }, { str: "12" }, { str: 'מ"ר' }]).apartment, null);
  assert.equal(statedAreas([{ str: '98.5 מ"ר' }, { str: "שטח דירה" }]).apartment, 98.5, "right-to-left extraction order");
});

test("room count hints from link text, file names and Hebrew abbreviations", () => {
  assert.equal(roomCountHint("הורדת PDF 4 חדרים"), 4);
  assert.equal(roomCountHint(null, "A1-5-%D7%97%D7%93-1.pdf"), 5, "5-חד in a URL-encoded file name");
  assert.equal(roomCountHint("דגם C דירת 5.5 חדרים"), 5.5);
  assert.equal(roomCountHint("דירות: 2,5,8,11"), null);
  assert.equal(roomCountHint("5 rooms"), 5);
});

test("room names must land in separate enclosed rooms", () => {
  const { locate } = spacesFromWalls(flat);
  const at = (str, x, y) => ({ str, x, y, size: 0, width: 0, angle: 0 }); // k = 1: sheet units are cm
  const good = [at("סלון", 300, 400), at("שינה", 800, 200), at("ממ\"ד", 800, 600)];
  assert.deepEqual(roomLabelCheck(good, 1, locate), { labels: 3, inside: 1, shared: 0, ok: true });
  const shared = [at("סלון", 300, 400), at("שינה", 800, 200), at("שינה", 820, 220)];
  assert.equal(roomLabelCheck(shared, 1, locate).ok, false, "two bedrooms in one space = missing partition");
  const outside = [at("סלון", 300, 400), at("שינה", 1500, 200), at("מטבח", -400, 200)];
  assert.equal(roomLabelCheck(outside, 1, locate).ok, false);
  assert.equal(roomLabelCheck(good.slice(0, 2), 1, locate).ok, null, "fewer than 3 names: no verdict");
});

test("verdicts: train only when the sheet confirms the plan", () => {
  const { spaces, footprint } = spacesFromWalls(flat);
  const base = { walls: 9, wallMeters: 50, scale: "dimensions", spaces, footprint };
  assert.equal(judgePage({ ...base, stated: { apartment: 82 } }).status, "train");
  assert.equal(judgePage({ ...base, stated: { apartment: 120 } }).status, "review");
  assert.equal(judgePage({ ...base, labels: { ok: true, inside: 1, shared: 0 } }).status, "train");
  assert.equal(judgePage({ ...base, stated: { apartment: 82 }, labels: { ok: false, inside: 0.3, shared: 1 } }).status, "train",
    "names outside rooms do not block a plan the printed area confirms");
  assert.equal(judgePage({ ...base, labels: { ok: false, inside: 0.3, shared: 1 } }).status, "review", "but alone they confirm nothing");
  assert.equal(judgePage({ ...base, roomHint: 3 }).status, "review", "a matching room count alone does not confirm");
  assert.equal(judgePage({ ...base, scale: "door-swings", stated: { apartment: 82 } }).status, "review");
  assert.equal(judgePage({ ...base, walls: 3 }).status, "reject");
  assert.equal(judgePage({ raster: true }).status, "raster");
});
