import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  classifyOpeningCut, clipTrianglesBelowY, topFaceTriangles, cutHeightFor, normalizeCutaway, CUT_MIN,
  nearSideWall, NEAR_FACING_CUT, NEAR_FACING_KEEP,
} from "../js/wall_cut.js";
import en from "../js/i18n/en.js";
import he from "../js/i18n/he.js";

test("openings against the cut: none / cut / notch / hole", () => {
  const H = 160;
  assert.equal(classifyOpeningCut(180, 240, H), "none"); // clerestory above the cut
  assert.equal(classifyOpeningCut(-2.5, 210, H), "cut"); // a door
  assert.equal(classifyOpeningCut(90, 220, H), "notch"); // a window crossing the cut
  assert.equal(classifyOpeningCut(90, 140, H), "hole"); // a low window below it
  assert.equal(classifyOpeningCut(-2.5, 120, H), "hole"); // a low hatch from the floor
});

function tri(a, b, c) { return [...a, ...b, ...c]; }
function area(pos) {
  let s = 0;
  for (let i = 0; i < pos.length; i += 9) {
    const ax = pos[i + 3] - pos[i], ay = pos[i + 4] - pos[i + 1], az = pos[i + 5] - pos[i + 2];
    const bx = pos[i + 6] - pos[i], by = pos[i + 7] - pos[i + 1], bz = pos[i + 8] - pos[i + 2];
    s += Math.hypot(ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx) / 2;
  }
  return s;
}

test("clipping keeps what is below the plane and nothing above it", () => {
  // a vertical 100x100 square in the XY plane, as two triangles
  const pos = [...tri([0, 0, 0], [100, 0, 0], [100, 100, 0]), ...tri([0, 0, 0], [100, 100, 0], [0, 100, 0])];
  const uv = [0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1];
  const c = clipTrianglesBelowY(pos, null, uv, 40);
  assert.ok(Math.abs(area(c.pos) - 4000) < 1e-6);
  for (let i = 1; i < c.pos.length; i += 3) assert.ok(c.pos[i] <= 40 + 1e-9);
  assert.equal(c.uv.length / 2, c.pos.length / 3);
  // uvs are interpolated along the cut edge
  for (let i = 0; i < c.pos.length / 3; i++) if (Math.abs(c.pos[i * 3 + 1] - 40) < 1e-9) assert.ok(Math.abs(c.uv[i * 2 + 1] - 0.4) < 1e-9);
  assert.equal(clipTrianglesBelowY(pos, null, null, -1).pos.length, 0);
  assert.deepEqual(clipTrianglesBelowY(pos, null, null, 500).pos, pos);
});

test("the cap is the up-facing faces lying on the cut plane", () => {
  const top1 = tri([0, 160, 0], [0, 160, 10], [100, 160, 0]); // faces +y
  const down = tri([0, 160, 0], [100, 160, 0], [0, 160, 10]); // same plane, faces -y
  const side = tri([0, 0, 0], [100, 0, 0], [100, 160, 0]);
  const top2 = tri([100, 160, 0], [0, 160, 10], [100, 160, 10]);
  const pos = [...top1, ...down, ...side, ...top2];
  assert.deepEqual(topFaceTriangles(pos, 160), [0, 3]);
});

test("cut height: off, walking and games see full walls", () => {
  assert.equal(cutHeightFor(null), Infinity);
  assert.equal(cutHeightFor({ on: false, height: 120 }), Infinity);
  assert.equal(cutHeightFor({ on: true, height: 120 }), 120);
  assert.equal(cutHeightFor({ on: true, height: 120 }, { walk: true }), Infinity);
  assert.equal(cutHeightFor({ on: true, height: 120 }, { game: true }), Infinity);
  assert.equal(cutHeightFor({ on: true, height: 5 }), CUT_MIN);
  assert.deepEqual(normalizeCutaway(undefined), { on: false, height: 160, cap: "white" });
  assert.deepEqual(normalizeCutaway({ on: 1, height: 9999, cap: "dark" }), { on: true, height: 400, cap: "dark" });
});

test("cutaway: wired into the wall builder, saved with the scene, strings in both locales", async () => {
  const v = await readFile(new URL("../js/view3d.js", import.meta.url), "utf8");
  assert.match(v, /H = Math\.min\(Hfull, cutH\(\)\)/);
  assert.match(v, /mesh\.userData\.role = "wallCap"/);
  assert.match(v, /clipBelow\(group, Hc\);\r?\n\s+addWallCaps\(group, Hc\);/);
  const ui = await readFile(new URL("../js/ui.js", import.meta.url), "utf8");
  assert.match(ui, /\n\s+cutaway: S\.cutaway,/);
  assert.match(ui, /S\.cutaway = normalizeCutaway\(d\.cutaway\);/);
  for (const k of ["cutaway", "cutaway_t", "cutaway_height", "cutaway_cap_white", "cutaway_cap_dark", "view_dollhouse"]) {
    assert.equal(typeof en[k], "string", "en " + k);
    assert.equal(typeof he[k], "string", "he " + k);
  }
});

/* The near-side cut of 3D edit mode (js/view3d.js updateSeeThrough). A camera
   south of a 400 cm square room, looking north at its middle. */
function wallSeg(x0, z0, x1, z1, half = 6) {
  const L = Math.hypot(x1 - x0, z1 - z0);
  return { ax: x0, az: z0, ux: (x1 - x0) / L, uz: (z1 - z0) / L, L, half };
}
const CAM = { x: 200, y: 900, z: 1400 }, TGT = { x: 200, y: 100, z: 200 };

test("near side: the whole near side is cut, not only the wall on the centre ray", () => {
  assert.equal(nearSideWall(wallSeg(0, 400, 400, 400), CAM, TGT, false), true, "near wall across the view");
  // the next room's near wall is nowhere near the centre ray, and still hides that room
  assert.equal(nearSideWall(wallSeg(500, 400, 900, 400), CAM, TGT, false), true, "near wall off to the side");
  assert.equal(nearSideWall(wallSeg(0, 0, 400, 0), CAM, TGT, false), false, "far wall");
  assert.equal(nearSideWall(wallSeg(0, 0, 0, 400), CAM, TGT, false), false, "side wall seen edge-on");
  // a wall behind the target whose infinite line slants across the view
  assert.equal(nearSideWall(wallSeg(600, 100, 1000, -300), CAM, TGT, false), false, "far diagonal");
});

test("near side: looking straight down cuts nothing", () => {
  const above = { x: 200, y: 2000, z: 260 };
  assert.equal(nearSideWall(wallSeg(0, 400, 400, 400), above, TGT, false), false);
  assert.equal(nearSideWall(wallSeg(0, 400, 400, 400), above, TGT, true), false);
});

test("near side: thresholds have hysteresis so a resting camera never flickers", () => {
  // turned so |cos| between its normal and the view is 0.36: between keep and cut
  const a = Math.acos(0.36), ux = Math.cos(a), uz = Math.sin(a);
  const w = { ax: 200 - ux * 200, az: 400 - uz * 200, ux, uz, L: 400, half: 6 };
  assert.ok(0.36 > NEAR_FACING_KEEP && 0.36 < NEAR_FACING_CUT);
  assert.equal(nearSideWall(w, CAM, TGT, false), false, "not cut yet: stays up");
  assert.equal(nearSideWall(w, CAM, TGT, true), true, "already cut: stays cut");
  // a target sitting on the wall line keeps whatever the wall was
  const onLine = { x: 200, y: 100, z: 405 };
  assert.equal(nearSideWall(wallSeg(0, 400, 400, 400), CAM, onLine, false), false);
  assert.equal(nearSideWall(wallSeg(0, 400, 400, 400), CAM, onLine, true), true);
});

test("near side: view3d fades walls through the shared rule and keeps cut walls unpickable", async () => {
  const src = await readFile(new URL("../js/view3d.js", import.meta.url), "utf8");
  const see = src.slice(src.indexOf("function updateSeeThrough("), src.indexOf("/* The presentation cutaway camera"));
  assert.match(see, /nearSideWall\(/);
  assert.doesNotMatch(see, /sAt > -60/, "the centre-ray span test is gone");
  // fades work on clones and hand the originals back, like the layer ghost
  assert.match(see, /o\.userData\.seeBase = o\.material/);
  assert.match(see, /o\.material = o\.userData\.seeBase/);
  // a rebuild re-applies the cut without a fade, and settles fades before disposal
  assert.match(src, /updateSeeThrough\(true\)/);
  assert.match(src, /settleSeeFades\(\);[^\n]*\n\s*ghostRoot\(structureRoot, false\)/);
  // a hidden wall's doors and windows no longer answer the 3D pick
  const pick = src.slice(src.indexOf("function pickEditTarget("), src.indexOf("function pxScaleAt("));
  assert.match(pick, /cutAway\(h\.object\)/);
});
