import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as cab from "../js/cabinet.js";
import { S } from "../js/state.js";

// one column, a shoe compartment of `h` under a shelf compartment filling the rest
function oneColumn(secs, preset = "w_classic") {
  const it = { type: "cabsys", w: 90, d: 60, h: 240, x: 0, z: 0, rot: 0, room: null };
  it.cab = cab.makeSpec(preset, 90, 240, 60);
  it.cab.auto = false;
  it.cab.cols = [{ w: 86.4, secs, door: { t: "hinged", leaves: 1, hinge: "R" } }];
  cab.normalizeSpec(it.cab, 90, 240, 60);
  S.items = [it];
  return it;
}

test("defaultShelfCount keeps round(h / spacing) - 1 for shelves; shoe shelves fill by floor(h / spacing)", () => {
  assert.equal(cab.defaultShelfCount({ t: "shoe" }, 42), 2, "floor(42 / 19) → 2 shoe shelves");
  assert.equal(cab.defaultShelfCount({ t: "shelves" }, 42), 0, "42 / 36 → 1 spacing → 0 shelves");
  assert.equal(cab.defaultShelfCount({ t: "shelves" }, 180), 4);
  assert.equal(cab.defaultShelfCount({ t: "shelves" }, 180, 30), 5, "the cabinet's spacing for shelves");
  assert.equal(cab.defaultShelfCount({ t: "shoe" }, 76, 30), 4, "shoe ignores the cabinet's shelf spacing");
  assert.equal(cab.defaultShelfCount({ t: "shoe", space: 25 }, 76), 3, "own spacing wins");
  assert.equal(cab.defaultShelfCount({ t: "shoe", n: 4 }, 42), 4, "a typed count wins");
  assert.equal(cab.defaultShelfCount({ t: "shelves", n: -2 }, 42), 0);
  assert.equal(cab.defaultShelfCount({ t: "shelves" }, 5), 0);
});

test("a 42 cm shoe compartment: the Count field and the layout agree", () => {
  const it = oneColumn([{ t: "shoe", h: 42 }, { t: "shelves", h: 150 }]);
  const L = cab.layoutCab(it);
  const shoe = L.cols[0].secs.find((c) => c.ref.t === "shoe");
  assert.ok(Math.abs(shoe.y1 - shoe.y0 - shoe.ref.h) < 1e-6, "the built cell is the section height");
  const field = cab.defaultShelfCount(shoe.ref, shoe.ref.h, it.cab.space);
  assert.equal(shoe.shelves, field);
  assert.equal(field, Math.floor(shoe.ref.h / cab.STD.shoeSpace));
  assert.ok(field >= 1, "not the 0 the field used to show");
  const shelves = L.cols[0].secs.find((c) => c.ref.t === "shelves");
  assert.equal(shelves.shelves, cab.defaultShelfCount(shelves.ref, shelves.ref.h, it.cab.space));
});

test("a corner unit counts over its whole clear height, shoe spacing for shoe", () => {
  const it = { type: "cabsys", w: 90, d: 90, h: 90, x: 0, z: 0, rot: 0, room: null };
  it.cab = cab.makeSpec("k_corner", 90, 90, 90);
  S.items = [it];
  let cell = cab.layoutCab(it).cols[0].secs[0];
  assert.equal(cell.shelves, cab.defaultShelfCount(cell.ref, cell.y1 - cell.y0));
  it.cab.cols[0].secs[0].t = "shoe";
  delete it.cab.cols[0].secs[0].space; // the preset's own spacing would win
  cell = cab.layoutCab(it).cols[0].secs[0];
  assert.equal(cell.shelves, Math.max(1, Math.floor((cell.y1 - cell.y0) / cab.STD.shoeSpace)));
});

test("the Inspector field and both layout sites ask defaultShelfCount", () => {
  const inspect = readFileSync(new URL("../js/ui_cabinet_inspect.js", import.meta.url), "utf8");
  assert.match(inspect, /defaultShelfCount\(s, cornerCell\.y1 - cornerCell\.y0\) : defaultShelfCount\(s, s\.h, \(sp\(\) \|\| \{\}\)\.space\)/);
  assert.match(inspect, /numInput\(shelfCount,/);
  const layout = readFileSync(new URL("../js/cabinet/layout.js", import.meta.url), "utf8");
  assert.equal(layout.split("defaultShelfCount(s, ").length - 1, 2);
});

test("shoeShelfCount: max(1, floor(clear height / spacing)), default spacing when unset", () => {
  assert.equal(cab.shoeShelfCount(96, 19), 5);
  assert.equal(cab.shoeShelfCount(96), 5, "STD.shoeSpace when unset");
  assert.equal(cab.shoeShelfCount(96, 0), 5, "a 0 spacing falls back to the default");
  assert.equal(cab.shoeShelfCount(100, 25), 4);
  assert.equal(cab.shoeShelfCount(10, 19), 1, "never 0");
  assert.equal(cab.shoeShelfCount(0, 19), 1);
});

test("a shoe compartment with count 0 or no count still gets shelves", () => {
  assert.equal(cab.defaultShelfCount({ t: "shoe", n: 0 }, 96), 5, "an old save's 0 reads as the default");
  assert.equal(cab.defaultShelfCount({ t: "shoe" }, 96), 5);
  assert.equal(cab.defaultShelfCount({ t: "shoe", n: 3 }, 96), 3, "a typed count still wins");
  assert.equal(cab.defaultShelfCount({ t: "shelves", n: 0 }, 96), 0, "plain shelves may still be empty");
});

test("an old saved cabinet with 0 shoe shelves renders and normalises", () => {
  const it = oneColumn([{ t: "shoe", h: 96, n: 0 }, { t: "shelves", h: 96 }]);
  const shoeSec = it.cab.cols[0].secs.find((s) => s.t === "shoe");
  assert.equal(shoeSec.n, undefined, "normalizeSpec drops the stored 0");
  shoeSec.n = 0; // and even un-normalised, the layout builds shelves
  const cell = cab.layoutCab(it).cols[0].secs.find((c) => c.ref.t === "shoe");
  assert.ok(cell.shelves >= 1);
  assert.equal(cell.shelves, cab.shoeShelfCount(cell.y1 - cell.y0, shoeSec.space));
  assert.equal(cab.layoutCab(it).parts.filter((p) => p.role === "shelf" && p.tilt).length, cell.shelves, "tilted shoe shelves are built");
});
