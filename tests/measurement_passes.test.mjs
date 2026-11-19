import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sourceFunctionText } from "./helpers/source_function.mjs";
import * as areas from "../js/room_area.js";
import { measureSides, measureVertical } from "../js/measure.js";
import { S } from "../js/state.js";

test("one label pass serializes solid geometry at most once, without wall images", () => {
  const nodes = [{ x: 0, z: 0 }, { x: 400, z: 0 }, { x: 400, z: 300 }, { x: 0, z: 300 }];
  const wallTex = "data:image/png;base64," + "Z".repeat(10000);
  const walls = nodes.map((_, i) => ({ id: i, a: i, b: (i + 1) % 4, thickness: 10, tex: wallTex }));
  const room = { key: "0,1,2,3", pts: nodes, area: 120000 };
  const state = { walls, nodes, showDims: true };
  const labels = [];
  const bindings = { ...areas, S: state, roomName: () => "", roomHidden: () => false,
    mepStampObstacles: () => null, roomInteriorSize: () => null, fmtAreaM2: n => n,
    t: (key, vars) => [key, vars.area], label: (x, z, value) => labels.push(value) };
  const src = readFileSync(new URL("../js/plan2d/room_labels.js", import.meta.url), "utf8");
  const code = ["labelFocusPoints", "selectedRoomKeys", "roomLabelFocused", "focusedRoomLabels", "drawRoomLabels"]
    .map(name => sourceFunctionText(src, name)).join("\n");
  const draw = Function(...Object.keys(bindings), code + "\nreturn drawRoomLabels;")(...Object.values(bindings));
  const stringify = JSON.stringify;
  let signatures = 0, images = 0;
  try {
    JSON.stringify = function (value, ...args) {
      const json = stringify(value, ...args);
      if (value?.[0] === nodes && value[1] === walls) signatures++;
      if (json?.includes(wallTex)) images++;
      return json;
    };
    draw([room, room, { key: "missing", pts: nodes, area: 120000 }]);
    assert.deepEqual(labels, [["room_area_usable_short", 11.31], ["room_area_usable_short", 11.31],
      ["room_area_reference_short", 12]]);
    assert.equal(signatures, 1);
    assert.equal(images, 0);
    state.slabOpenings = [{ x: 200, z: 150, w: 10, d: 10 }];
    draw([room]);
    assert.deepEqual(labels.at(-1), ["room_area_reference_short", 12]);
    assert.equal(signatures, 1, "a void needs no solid index");
  } finally { JSON.stringify = stringify; }
});

test("side and vertical measurements preserve ordered hits and scan stack ids once per pass", () => {
  const piece = (id, on, x = 0, elev = 0) => ({ id, on, type: "box", x, z: 0, w: 10, d: 10, h: 10, elev });
  const subject = piece(1, "base");
  const base = piece("base"), duplicate = piece("base", null, 30);
  const rider = piece("rider", 1), typed = piece("typed", "1", 0, 20);
  const chain = [rider];
  for (let i = 1; i <= 32; i++) chain.push(piece(i + 10, chain.at(-1).id, i === 32 ? -30 : 0));
  const dangling = piece("dangling", "missing", 80);
  const items = [subject, base, duplicate, typed, dangling, ...chain];
  S.walls = []; S.openings = [];
  for (const measure of [measureSides, measureVertical]) {
    // Keep only the unrelated pieces and the 33rd descendant for the reference result.
    const eligible = [subject, duplicate, typed, dangling, chain.at(-1)].map(it => ({ ...it, on: null }));
    S.items = eligible;
    const expected = measure(eligible[0], { target: "object" }).filter(hit => hit.dir !== "down");
    let reads = 0;
    S.items = new Proxy(items, { get(target, key) {
      if (typeof key === "string" && /^\d+$/.test(key)) reads++;
      return target[key];
    } });
    assert.deepEqual(measure(subject, { target: "object" }), expected);
    assert.ok(reads <= items.length * 3, `read ${reads} slots for ${items.length} pieces`);
  }
});
