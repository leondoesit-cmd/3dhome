import { stylesSource } from "./helpers/styles_source.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readI18nSource } from "./helpers/i18n_source.mjs";
import {
  castWeb, aimAnchor, findCling, findCeiling, wallBasis, ropeConstrain, lookDir,
  swingCharge, WEB_RANGE, CLING_REACH,
} from "../js/lava_spider.js";
import { P_RAD, P_CLEAR, P_SCALE, MANTLE_MAX, JUMP_V, GRAV, jumpApex } from "../js/lava_state.js";

/* One north-south wall at x=100, and a shoebox sitting west of it. */
const WALL = { ax: 100, az: -200, bx: 100, bz: 200, half: 6 };
const BOX = { x0: 20, x1: 60, z0: 60, z1: 100, y0: 0, y1: 45, item: { id: "box" } };
const SHELF = { x0: -40, x1: 40, z0: -40, z1: 40, y0: 60, y1: 72, item: { id: "shelf" } };
const col = { segs: [WALL], doorSegs: [], rects: [BOX, SHELF] };

test("a web fired at a wall stops at its near face", () => {
  const h = castWeb(col, 0, 20, 0, 1, 0, 0, WEB_RANGE);
  assert.ok(h, "the wall is hit");
  assert.equal(h.kind, "wall");
  assert.ok(Math.abs(h.x - 94) < 0.001, "the face, not the centre line: " + h.x);
  assert.equal(h.nx, -1, "the normal points back at the shooter");
  assert.ok(Math.abs(h.dist - 94) < 0.001);
});

test("range is a real limit, and a miss is null", () => {
  assert.equal(castWeb(col, 0, 20, 0, 1, 0, 0, 40), null, "out of range");
  assert.equal(castWeb(col, 0, 20, 0, -1, 0, 0, WEB_RANGE, { floor: false }), null, "nothing that way");
  const above = castWeb(col, 0, 400, 0, 1, 0, 0, WEB_RANGE, { wallTop: 260, floor: false });
  assert.equal(above, null, "a web over the top of the wall catches nothing");
});

test("the nearest surface wins, whatever kind it is", () => {
  const h = castWeb(col, 0, 20, 0, 1, 0, 0, WEB_RANGE);
  assert.equal(h.kind, "wall");
  const h2 = castWeb(col, 0, 20, 0, 1, 0, 0, WEB_RANGE, {});
  assert.equal(h2.dist, h.dist);
  // aim through the box instead and it is the box that answers
  const h3 = castWeb(col, 0, 20, 80, 1, 0, 0, WEB_RANGE);
  assert.equal(h3.kind, "rect");
  assert.ok(Math.abs(h3.x - 20) < 0.001);
  assert.equal(h3.nx, -1);
});

test("a ceiling shot hits the underside, the floor catches a dropped line", () => {
  const up = castWeb(col, 0, 20, 0, 0, 1, 0, WEB_RANGE);
  assert.ok(up);
  assert.equal(up.ny, -1, "the underside faces down at you");
  assert.ok(Math.abs(up.y - 60) < 0.001);
  const down = castWeb(col, 0, 20, 0, 0, -1, 0, WEB_RANGE);
  assert.ok(down && down.kind === "floor");
  assert.ok(Math.abs(down.dist - 20) < 0.001);
  assert.equal(castWeb(col, 0, 20, 0, 0, -1, 0, WEB_RANGE, { floor: false }), null);
});

test("a swing anchor has to be above you", () => {
  // level with a wall: the sightline misses nothing, but a rope at eye height
  // is not a swing, so the fan finds the shelf overhead instead
  const a = aimAnchor(col, 0, 20, 0, Math.PI / 2, 0, { range: WEB_RANGE });
  assert.ok(a, "something up there");
  assert.ok(a.y >= 20, "and it is above the shooter: " + a.y);
  // out in the open with nothing overhead there is no swing to take
  const bare = { segs: [], doorSegs: [], rects: [] };
  assert.equal(aimAnchor(bare, 0, 20, 0, 0, 0, { range: WEB_RANGE }), null);
});

test("cling finds the wall you are up against, and only then", () => {
  const near = 94 - P_RAD - 3;
  const cl = findCling(col, near, 20, 0, CLING_REACH);
  assert.ok(cl, "a wall within reach is a wall you are holding");
  assert.equal(cl.kind, "wall");
  assert.ok(Math.abs(cl.gap - 3) < 0.001, "gap is body-to-surface: " + cl.gap);
  assert.equal(cl.nx, -1);
  assert.ok(Math.abs(cl.px - 94) < 0.001);
  assert.equal(findCling(col, 0, 20, 0, CLING_REACH), null, "the middle of the room holds nothing");
  assert.equal(findCling(col, near, 400, 0, CLING_REACH, { wallTop: 260 }), null, "over the top");
});

test("a box face is a wall; its top and its ceiling are not", () => {
  const beside = findCling(col, 60 + P_RAD + 2, 20, 80, CLING_REACH);
  assert.ok(beside && beside.kind === "rect");
  assert.equal(beside.top, 45, "the lip you can crawl over");
  assert.equal(beside.nx, 1);
  // standing on top of it, the same box is a floor
  assert.equal(findCling(col, 60 + P_RAD + 2, 45, 80, CLING_REACH), null);
  // and a shelf overhead is a ceiling, not a face beside you — until you are
  // level with it
  const onlyShelf = { segs: [], doorSegs: [], rects: [SHELF] };
  assert.equal(findCling(onlyShelf, 50, 0, 0, 100), null, "its face is over your head");
  const level = findCling(onlyShelf, 50, 62, 0, 100);
  assert.ok(level && level.kind === "rect", "level with it, it is a wall again");
});

test("a ceiling is the underside just over your head", () => {
  const y = 60 - P_CLEAR - 3;
  const c = findCeiling(col, 0, y, 0, CLING_REACH);
  assert.ok(c, "hanging range");
  assert.equal(c.y, 60);
  assert.equal(findCeiling(col, 0, y - 40, 0, CLING_REACH), null, "too far below");
  assert.equal(findCeiling(col, 200, y, 0, CLING_REACH), null, "not under it at all");
});

test("crawling steers by the sightline and keeps a right hand", () => {
  // facing the wall at x=100 (normal back at us is -x), looking up
  const up = wallBasis(-1, 0, Math.PI / 2, 0.9);
  assert.ok(up.uy > 0.7, "look up, climb up: " + up.uy);
  const down = wallBasis(-1, 0, Math.PI / 2, -0.9);
  assert.ok(down.uy < -0.7, "look down, climb down");
  // staring dead into the wall still has to leave a direction to move in
  const flat = wallBasis(0, 1, Math.PI, 0);
  assert.ok(Math.abs(Math.hypot(flat.ux, flat.uy, flat.uz) - 1) < 1e-6);
  const b = wallBasis(0, 1, 0, 0);
  assert.ok(Math.abs(Math.hypot(b.rx, b.ry, b.rz) - 1) < 1e-6, "the right vector is a unit vector");
  assert.ok(Math.abs(b.ux * b.rx + b.uy * b.ry + b.uz * b.rz) < 1e-6, "and it is across the climb");
});

test("the rope is inextensible, not a spring", () => {
  assert.equal(ropeConstrain(0, 0, 0, 0, 0, 0, 0, 100, 0, 100), null, "slack does nothing");
  // hanging 120 below a 100 rope, falling straight down
  const r = ropeConstrain(0, -20, 0, 0, -200, 0, 0, 100, 0, 100);
  assert.ok(r && r.taut);
  assert.equal(r.y, 0, "pulled back onto the sphere");
  assert.ok(Math.abs(r.vy) < 1e-9, "the outward fall is spent");
  // swinging sideways at the bottom keeps every bit of the arc
  const t = ropeConstrain(0, -0.5, 0, 300, 0, 0, 0, 100, 0, 100);
  assert.ok(t);
  assert.ok(Math.abs(t.vx - 300) < 1, "tangential speed survives: " + t.vx);
  // and swinging back INTO the anchor is never braked
  const inward = ropeConstrain(0, -100.5, 0, 0, 400, 0, 0, 0, 0, 100);
  assert.ok(inward && inward.vy > 399);
});

test("the swing arc reads as a charge, 0 at the anchor and 1 at the bottom", () => {
  assert.equal(swingCharge(100, 100, 100), 0);
  assert.equal(swingCharge(100, 0, 100), 1);
  assert.ok(swingCharge(100, 50, 100) > 0.49);
  assert.equal(swingCharge(100, 0, 0), 0, "a rope with no length has no arc");
});

test("look directions are unit vectors on both axes", () => {
  [0, 1, -2.2, 3.9].forEach((yaw) => {
    [0, 0.8, -1.2].forEach((pitch) => {
      const d = lookDir(yaw, pitch);
      assert.ok(Math.abs(Math.hypot(d.x, d.y, d.z) - 1) < 1e-9);
    });
  });
  assert.ok(lookDir(0, 0).z > 0.99, "yaw 0 looks down +z, same as the walk code");
});

/* ---- the kit has to be reachable from the run, not just from a test ---- */

const game = await readFile(new URL("../js/lava_game.js", import.meta.url), "utf8");
const world = await readFile(new URL("../js/lava_world.js", import.meta.url), "utf8");
const css = stylesSource();
const i18n = await readI18nSource();

test("the runner is a quarter of a person and cannot jump the furniture", () => {
  assert.equal(P_SCALE, 0.25);
  assert.ok(P_CLEAR < 45 && P_CLEAR > 38, "about 42cm tall: " + P_CLEAR);
  assert.ok(jumpApex(JUMP_V, GRAV) < MANTLE_MAX, "a jump never beats a mantle");
  assert.ok(MANTLE_MAX < 35, "and a mantle never beats a sofa: " + MANTLE_MAX);
  assert.match(world, /grp\.scale\.setScalar\(P_SCALE\)/, "the ghost is the same runner");
});

test("cling, leap, swing and zip are wired into the player loop", () => {
  assert.match(game, /if \(P\.zip\) \{\s*stepZip\(P, dt\);/);
  assert.match(game, /if \(P\.cling \|\| P\.ceil\) \{[\s\S]{0,80}stepCling\(P, dt\);/);
  assert.match(game, /if \(P\.web\) stepSwing\(P, dt\);/);
  assert.match(game, /if \(P\.airborne && !P\.web && !P\.mantle\) tryCling\(P\);/);
  assert.match(game, /if \(P\.cling \|\| P\.ceil\) \{\s*wallLeap\(P\);/, "space leaps off a wall");
  assert.match(game, /updateWebLine\(line \? handPos\(P\) : null, line\)/);
});

test("both mouse buttons and both keys fire a line, and both let go", () => {
  assert.match(game, /if \(e\.button === 2\) fireZip\(\);/);
  assert.match(game, /if \(e\.code === "KeyE"\) \{\s*fireZip\(\);/);
  assert.match(game, /if \(e\.code === "KeyF"\)/);
  assert.match(game, /function onMouseUp\(e\)[\s\S]{0,200}releaseWeb\(L\.p\)/);
  assert.match(game, /data-act="web"/);
  assert.match(game, /data-act="zip"/);
  assert.match(css, /\.lv-touch-actions button\[data-act="web"\]/);
  assert.match(css, /#lvHud\.aim #lvCross/);
});

test("the briefing says what the powers are, in both languages", () => {
  ["lv_control_cling", "lv_control_walljump", "lv_control_swing", "lv_control_zip",
    "lv_web_miss", "lv_touch_web", "lv_touch_zip"].forEach((k) => {
    const hits = i18n.match(new RegExp("\\b" + k + ":", "g")) || [];
    assert.equal(hits.length, 2, k + " needs an English and a Hebrew string");
  });
});
