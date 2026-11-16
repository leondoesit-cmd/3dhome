/* Draw cabinet (fitcab, FURNITURE_PLACEMENT_PLAN.md Stage 4): the gesture a
   press starts, the wall / floor rectangles built from drag samples, the
   family a box gets (js/fit_cabinet_area.js), the 3D selection bar
   (js/build3d_input.js selectionBar) and the draft volume at its real height
   (js/build3d_ghost.js). */
import test from "node:test";
import assert from "node:assert/strict";
import { fitAreaBox } from "../js/fit_cabinet.js";
import {
  classifyFitPress, facingFromRay, fitFamilyFor, fitFamilyIds, floorRectFromSamples, isRealDrag,
  rayFloorPoint, spanStillHolds, wallFaceFrame, wallFamilies, wallRectFromSamples, wallSample, FIT_AUTO,
} from "../js/fit_cabinet_area.js";
import { selectionBar } from "../js/build3d_input.js";
import { ghostSpecs } from "../js/build3d_ghost.js";

// A 400 x 300 room (inner faces at 5/395 and 5/295 with 10 cm walls on the axes).
function room() {
  var p = [{ x: 0, z: 0 }, { x: 400, z: 0 }, { x: 400, z: 300 }, { x: 0, z: 300 }];
  return [0, 1, 2, 3].map(function (i) { return { id: "w" + i, a: p[i], b: p[(i + 1) % 4], t: 10, h: 260 }; });
}
function near(actual, expected, tol, msg) {
  assert.ok(Math.abs(actual - expected) <= (tol || 0.01), (msg || "") + " expected " + expected + " got " + actual);
}

test("a press decides the gesture: wall face in 3D, span by a wall in 2D, floor otherwise", function () {
  assert.equal(classifyFitPress({ in3D: true, aim: { wallId: "w0" } }), "wall");
  assert.equal(classifyFitPress({ in3D: true, aim: null, hit: { kind: "wall", point: { x: 0, y: 90, z: 5 } } }), "wall");
  assert.equal(classifyFitPress({ in3D: true, aim: null, hit: { kind: "item" } }), "floor");
  assert.equal(classifyFitPress({ in3D: true, aim: null, hit: null }), "floor");
  // 2D: inside the depth band in front of a free run -> today's span along the wall
  assert.equal(classifyFitPress({ in3D: false, band: { ok: true, q: 20, depth: 60 } }), "span");
  assert.equal(classifyFitPress({ in3D: false, band: { ok: true, q: -4, depth: 60 } }), "span");
  // beyond the band, or no free run there -> a floor box
  assert.equal(classifyFitPress({ in3D: false, band: { ok: true, q: 75, depth: 60 } }), "floor");
  assert.equal(classifyFitPress({ in3D: false, band: null }), "floor");
  // the 3D pane never takes the 2D span, even by a wall
  assert.equal(classifyFitPress({ in3D: true, band: { ok: true, q: 10, depth: 60 } }), "floor");
});

test("a span holds while the pointer stays in the band, and lets go beyond it", function () {
  assert.equal(spanStillHolds(30, 60, 10), true);
  assert.equal(spanStillHolds(60, 60, 10), true);
  assert.equal(spanStillHolds(61, 60, 10), false);
  assert.equal(spanStillHolds(-12, 60, 10), true); // on the wall itself
  assert.equal(spanStillHolds(-40, 60, 10), false); // through it, into the next room
  assert.equal(spanStillHolds(NaN, 60, 10), false);
});

test("a press released without real movement is a click", function () {
  assert.equal(isRealDrag(2, 1.5), false); // 3 px
  assert.equal(isRealDrag(5, 1.5), true); // 7.5 px
  assert.equal(isRealDrag(30, 0.1), false); // zoomed far out: 3 px
  assert.equal(isRealDrag(3, undefined), false); // no scale: 4 cm
  assert.equal(isRealDrag(6, undefined), true);
  assert.equal(isRealDrag(NaN, 1), false);
});

test("a 3D drag on a wall face builds the rectangle fitAreaBox reads: a hung unit", function () {
  var walls = room(), w0 = walls[0];
  var press = { wallId: "w0", nx: 0, nz: 1, x: 150, y: 140, z: 5 };
  var frame = wallFaceFrame(w0, press, { x: press.nx, z: press.nz });
  near(frame.ox, 150); near(frame.oz, 5); near(frame.nz, 1);
  var start = wallSample(frame, "w0", press, null);
  near(start.s, 0); near(start.y, 140);
  var cur = wallSample(frame, "w0", { wallId: "w0", nx: 0, nz: 1, x: 250, y: 210.4, z: 5 }, null);
  var rect = wallRectFromSamples(frame, "w0", { x: press.x, z: press.z }, start, cur);
  assert.deepEqual([rect.s0, rect.s1, rect.y0, rect.y1], [0, 100, 140, 210]);
  var r = fitAreaBox("wall", rect, walls, [], {});
  assert.equal(r.ok, true); assert.equal(r.mount, "hung"); assert.equal(r.wall, "w0");
  near(r.x, 200); near(r.w, 100); assert.equal(r.elev, 140); near(r.h, 70); near(r.d, 35);
});

test("a wall drag that leaves the wall's mesh follows the ray on the face plane", function () {
  var w0 = room()[0];
  var frame = wallFaceFrame(w0, { x: 150, z: 5 }, { x: 0, z: 1 });
  // the cursor is now over the side wall: aim names another wall
  var ray = { o: { x: 300, y: 200, z: 300 }, d: { x: 0, y: -20 / 295, z: -1 } };
  var q = wallSample(frame, "w0", { wallId: "w1", nx: -1, nz: 0, x: 395, y: 100, z: 100 }, ray);
  near(q.s, 150); near(q.y, 180);
  // a ray running along the face gives nothing (the caller keeps the last sample)
  assert.equal(wallSample(frame, "w0", null, { o: { x: 0, y: 100, z: 100 }, d: { x: 1, y: 0, z: 0 } }), null);
  // a floor-to-ceiling drag at the press is a full-height unit
  var full = fitAreaBox("wall", wallRectFromSamples(frame, "w0", { x: 150, z: 5 }, { s: -50, y: 3 }, { s: 50, y: 257 }), room(), [], {});
  assert.equal(full.mount, "full"); near(full.h, 260); near(full.x, 150); near(full.w, 100);
});

test("the face frame takes the side the camera is on, and clamps to the wall", function () {
  var w0 = room()[0];
  var back = wallFaceFrame(w0, { x: 100, z: -5 }, { x: 0, z: -1 });
  near(back.nz, -1); near(back.oz, -5);
  var past = wallFaceFrame(w0, { x: 480, z: 5 }, null);
  near(past.ox, 400); near(past.s0, 400); near(past.nz, 1);
  assert.equal(wallFaceFrame({ a: { x: 0, z: 0 }, b: { x: 0, z: 0 }, t: 10 }, { x: 0, z: 0 }), null);
});

test("a floor drag in 3D samples the ray on the floor; the front looks back at the camera", function () {
  var p = rayFloorPoint({ o: { x: 0, y: 100, z: 0 }, d: { x: 1, y: -1, z: 0 } });
  near(p.x, 100); near(p.z, 0);
  assert.equal(rayFloorPoint({ o: { x: 0, y: 100, z: 0 }, d: { x: 1, y: 0, z: 0 } }), null);
  assert.equal(rayFloorPoint({ o: { x: 0, y: 100, z: 0 }, d: { x: 0, y: 1, z: 0 } }), null);
  var f = facingFromRay({ o: { x: 0, y: 0, z: 0 }, d: { x: 0, y: -0.5, z: -2 } });
  near(f.x, 0); near(f.z, 1);
  assert.equal(facingFromRay({ o: { x: 0, y: 0, z: 0 }, d: { x: 0, y: -1, z: 0 } }), null);
  // a free-standing box in the middle of the room faces the camera (here: toward +z)
  var rect = floorRectFromSamples({ x: 150.4, z: 120 }, { x: 250, z: 170.2 });
  assert.deepEqual(rect, { a: { x: 150, z: 120 }, b: { x: 250, z: 170 } });
  var r = fitAreaBox("floor", rect, room(), [], { facing: f });
  assert.equal(r.ok, true); assert.equal(r.wall, null); assert.equal(r.rot, 0); near(r.w, 100); near(r.d, 50);
  // a box drawn against the back wall stands with its back to it
  var against = fitAreaBox("floor", floorRectFromSamples({ x: 100, z: 15 }, { x: 220, z: 70 }), room(), [], { facing: f });
  assert.equal(against.wall, "w0"); near(against.z, 5 + against.d / 2);
  assert.equal(floorRectFromSamples({ x: NaN, z: 0 }, { x: 1, z: 1 }), null);
});

var FAMS = {
  wardrobe: {}, kitchenBase: {}, kitchenUpper: { elev: 145 }, kitchenCorner: {}, bookcase: {},
  shelving: { elev: 90 }, tvUnit: {},
};

test("the chooser lists the families that fill a box, auto first", function () {
  var ids = fitFamilyIds(FAMS);
  assert.equal(ids[0], FIT_AUTO);
  assert.ok(ids.includes("wardrobe") && ids.includes("kitchenUpper"));
  assert.ok(!ids.includes("kitchenCorner"), "a diagonal corner unit is a shape, not a fill");
  assert.deepEqual(wallFamilies(FAMS), ["kitchenUpper", "shelving"]);
});

test("which family fills a box", function () {
  // auto: by size, as js/cabinet/layout.js famOf does
  assert.equal(fitFamilyFor({ choice: FIT_AUTO, mount: "floor", h: 240, d: 60 }, FAMS), "wardrobe");
  assert.equal(fitFamilyFor({ choice: FIT_AUTO, mount: "floor", h: 200, d: 30 }, FAMS), "bookcase");
  assert.equal(fitFamilyFor({ choice: FIT_AUTO, mount: "floor", h: 90, d: 60 }, FAMS), "kitchenBase");
  // the remembered choice wins on the floor
  assert.equal(fitFamilyFor({ choice: "bookcase", mount: "full", h: 260, d: 60 }, FAMS), "bookcase");
  // a hung box: the wall family, unless the choice hangs by nature
  assert.equal(fitFamilyFor({ choice: FIT_AUTO, mount: "hung", h: 70, d: 35 }, FAMS), "kitchenUpper");
  assert.equal(fitFamilyFor({ choice: "wardrobe", mount: "hung", h: 70, d: 35 }, FAMS), "kitchenUpper");
  assert.equal(fitFamilyFor({ choice: "shelving", mount: "hung", h: 70, d: 30 }, FAMS), "shelving");
  // no wall family in the catalogue: the hung box keeps the choice
  assert.equal(fitFamilyFor({ choice: "bookcase", mount: "hung", h: 70, d: 30 }, { wardrobe: {}, bookcase: {} }), "bookcase");
  // an unknown or excluded choice is auto
  assert.equal(fitFamilyFor({ choice: "nope", mount: "floor", h: 240, d: 60 }, FAMS), "wardrobe");
  assert.equal(fitFamilyFor({ choice: "kitchenCorner", mount: "floor", h: 240, d: 60 }, FAMS), "wardrobe");
});

test("the 3D selection bar: verbs around one selected piece, the On wall slot only once its action exists", function () {
  var cab = { type: "cabsys", cab: {}, x: 0, z: 0, rot: 0 };
  var bar = selectionBar({ tool: "select", sel: { kind: "item", ref: cab } }, false, false);
  assert.deepEqual(bar, { rotate: true, flip: true, onWall: false, onWallOn: false, onWallFixed: false, dup: true, del: true, design: true, note: true });
  // a type that always hangs reads pressed and fixed; once held on a wall it can come off
  var byType = (type) => type === "art";
  var art = selectionBar({ tool: "select", sel: { kind: "item", ref: { type: "art" } } }, false, true, byType);
  assert.deepEqual([art.onWall, art.onWallOn, art.onWallFixed], [true, true, true]);
  var heldArt = selectionBar({ tool: "select", sel: { kind: "item", ref: { type: "art", hold: { onWall: 1 } } } }, false, true, byType);
  assert.deepEqual([heldArt.onWallOn, heldArt.onWallFixed], [true, false]);
  var sofa = { type: "sofa", x: 0, z: 0, rot: 0 };
  var b2 = selectionBar({ tool: null, sel: { kind: "item", ref: sofa } }, false, true);
  assert.equal(b2.design, false); assert.equal(b2.onWall, true); assert.equal(b2.flip, true);
  // a wall-backed unit keeps its back to the wall: no Flip
  var fitted = { type: "cabsys", cab: {}, fit: { wall: "w0" }, hold: { wall: "w0", gap: 0, side: 1, onWall: 1 } };
  var b3 = selectionBar({ tool: "select", sel: { kind: "item", ref: fitted } }, false, true);
  assert.equal(b3.flip, false); assert.equal(b3.onWallOn, true);
  // locked: nothing that changes it
  var b4 = selectionBar({ tool: "select", sel: { kind: "item", ref: { type: "sofa", locked: true } } }, false, true);
  assert.deepEqual([b4.rotate, b4.flip, b4.onWall, b4.del, b4.dup], [false, false, false, false, true]);
  // the phone's dock carries the verbs already: Design only
  assert.deepEqual(selectionBar({ tool: "select", sel: { kind: "item", ref: cab } }, true, true).design, true);
  assert.equal(selectionBar({ tool: "select", sel: { kind: "item", ref: sofa } }, true, true), null);
  // a tool armed, a piece being placed, or no single piece: no bar
  assert.equal(selectionBar({ tool: "fitcab", sel: { kind: "item", ref: cab } }, false, true), null);
  assert.equal(selectionBar({ tool: "select", placeType: "sofa", sel: { kind: "item", ref: cab } }, false, true), null);
  assert.equal(selectionBar({ tool: "select", sel: { kind: "wall", ref: {} } }, false, true), null);
  assert.equal(selectionBar({ tool: "select", sel: null }, false, true), null);
});

test("a hung modular cabinet's measured span is its own: the cache tells elevations apart", async function () {
  const { elevOffset, seedVSpan, vSpanKeyOf } = await import("../js/furniture_api.js");
  var floor = { type: "cabsys", w: 101, d: 35, h: 71, cab: { elev: 0 } };
  var hung = { type: "cabsys", w: 101, d: 35, h: 71, cab: { elev: 140 }, elev: 140 };
  assert.notEqual(vSpanKeyOf(floor), vSpanKeyOf(hung));
  // the two measurements live side by side; the hung one is already at its height, so nothing is added
  assert.equal(seedVSpan(vSpanKeyOf(floor), { lo: 0, hi: 71 }), true);
  assert.equal(seedVSpan(vSpanKeyOf(hung), { lo: 140, hi: 211 }), true);
  assert.equal(elevOffset(hung), 0);
  assert.equal(elevOffset({ type: "cabsys", w: 101, d: 35, h: 71, cab: { elev: 0 }, elev: 140 }), 140);
});

test("the fitcab draft volume stands at its real height off the floor", function () {
  var draft = { box: { x: 200, z: 22.5, w: 100, d: 35, h: 70, rot: 0, elev: 140 } };
  var specs = ghostSpecs({ tool: "fitcab" }, { fitCabDraft: function () { return draft; } });
  var body = specs.find(function (s) { return s.shape === "box" && Math.abs(s.w - 100) < 0.01; });
  assert.ok(body, "the unit's volume");
  near(body.cy - body.h / 2, 140); near(body.cy + body.h / 2, 210);
  // no elev (a run unit): on the floor, as before
  draft = { box: { x: 200, z: 35, w: 100, d: 60, h: 240, rot: 0 } };
  body = ghostSpecs({ tool: "fitcab" }, { fitCabDraft: function () { return draft; } })
    .find(function (s) { return s.shape === "box" && Math.abs(s.w - 100) < 0.01; });
  near(body.cy - body.h / 2, 0); near(body.cy + body.h / 2, 240);
});
