import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { selectionReadout } from "../js/cad_hud_readout.js";
import { sourceFunctionText } from "./helpers/source_function.mjs";

const fmt = (cm, domain) => cm + " cm/" + domain;
const wallLen = (w) => w.len;

test("an item reads name and width × depth, and follows a size edit", () => {
  const it = { type: "sofa", name: "Sofa", w: 100, d: 60, h: 80 };
  assert.deepEqual(selectionReadout({ kind: "item", ref: it }, fmt, wallLen), {
    name: "Sofa",
    detail: "100 cm/furniture × 60 cm/furniture",
  });
  it.w = 150; // the Inspector edit
  assert.equal(selectionReadout({ kind: "item", ref: it }, fmt, wallLen).detail, "150 cm/furniture × 60 cm/furniture");
  assert.doesNotMatch(selectionReadout({ kind: "item", ref: it }, fmt, wallLen).detail, /80/, "no height");
});

test("walls, openings, voids and multi-selections", () => {
  const wall = selectionReadout({ kind: "wall", ref: { id: 4, len: 320 } }, fmt, wallLen);
  assert.equal(wall.detail, "320 cm/rooms");
  assert.match(wall.name, /4/);
  const door = selectionReadout({ kind: "opening", ref: { type: "door", width: 90, height: 210 } }, fmt, wallLen);
  assert.equal(door.detail, "90 cm/openings × 210 cm/openings");
  assert.ok(door.name);
  const sv = selectionReadout({ kind: "slabvoid", ref: { w: 100, d: 200 } }, fmt, wallLen);
  assert.equal(sv.detail, "100 cm/rooms × 200 cm/rooms");
  const many = selectionReadout({ kind: "items", refs: [{}, {}, {}] }, fmt, wallLen);
  assert.match(many.name, /3/);
  assert.equal(many.detail, "");
});

test("no selection reads nothing", () => {
  assert.deepEqual(selectionReadout(null, fmt, wallLen), { name: "", detail: "" });
});

test("the readout is refreshed by every Inspector refresh, not only a 2D paint", () => {
  const hud = readFileSync(new URL("../js/cad_hud.js", import.meta.url), "utf8");
  assert.match(hud, /addEventListener\("planner-props", updateCadHud\)/);
  assert.match(sourceFunctionText(hud, "updateCadHud"), /selectionReadout\(S\.sel,/);
  const cons = readFileSync(new URL("../js/ui_props/cons.js", import.meta.url), "utf8");
  assert.match(sourceFunctionText(cons, "fillProps"), /dispatchEvent\(new CustomEvent\("planner-props"\)\)/);
});
