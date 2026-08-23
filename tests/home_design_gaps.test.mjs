import test from "node:test";
import assert from "node:assert/strict";
import { S } from "../js/state.js";
import { ensureWallTypes } from "../js/wall_types.js";
import {
  doorSwingPoly, polyHitsItem, checkSwingConflicts, sectorPoly, polysIntersect,
  doorSwingBand, invalidateSwingCache, swingConflicts,
} from "../js/swing_clearance.js";
import {
  addSlabOpening, openingCorners, holesForRoom, hitSlabOpening, openingFromRect, slabOpenings,
  stairVoidFields, applyStairMoveTo,
} from "../js/slab_openings.js";
import { floorAbove, addSlabOpeningToFloor, configureFloorIO } from "../js/floors.js";
import { convertCadToWalls } from "../js/cad_to_walls.js";
import { scaleScan, longestScanEdge, roomScanFromPoints, RoomScanError, insetScan, scanBounds } from "../js/room_scan.js";
import { applyPlanOp } from "../js/plan_sync.js";
import { titleBlockSVG, wrapPlanSVG, sheetLayout, PAPER_SIZES } from "../js/sheet_print.js";

function reset() {
  S.nodes = [{ x: 0, z: 0 }, { x: 400, z: 0 }, { x: 400, z: 300 }, { x: 0, z: 300 }];
  S.walls = [
    { id: 1, a: 0, b: 1, thickness: 10, height: 270 },
    { id: 2, a: 1, b: 2, thickness: 10, height: 270 },
    { id: 3, a: 2, b: 3, thickness: 10, height: 270 },
    { id: 4, a: 3, b: 0, thickness: 10, height: 270 },
  ];
  S.openings = [];
  S.items = [];
  S.slabOpenings = [];
  S.idc = 10;
  S.wallTypes = [];
  ensureWallTypes(S);
}

test("laser calibration scales a scan so the longest wall matches the tape", () => {
  const result = roomScanFromPoints([
    { x: 0, z: 0 }, { x: 400, z: 0 }, { x: 400, z: 300 }, { x: 0, z: 300 },
  ]);
  assert.equal(Math.round(longestScanEdge(result).length), 400);
  scaleScan(result, 500);
  assert.equal(Math.round(longestScanEdge(result).length), 500);
  assert.equal(Math.round(result.cad.lines[1].b.z - result.cad.lines[1].a.z), 375);
});

test("scaleScan rejects a zero tape reading", () => {
  const result = roomScanFromPoints([
    { x: 0, z: 0 }, { x: 200, z: 0 }, { x: 200, z: 200 }, { x: 0, z: 200 },
  ]);
  assert.throws(() => scaleScan(result, 0), RoomScanError);
});

test("a hinged door sector occupies the room in front of the leaf", () => {
  reset();
  S.openings = [{ id: 9, type: "door", wall: 1, s: 200, width: 90, height: 205, swingDir: "R_IN" }];
  const poly = doorSwingPoly(S.openings[0]);
  assert.ok(poly && poly.length >= 8);
  const xs = poly.map((p) => p.x), zs = poly.map((p) => p.z);
  assert.ok(Math.max(...xs) - Math.min(...xs) > 40);
  assert.ok(Math.max(...zs) - Math.min(...zs) > 40);
});

test("a sofa in the door swing is reported as a conflict", () => {
  reset();
  S.openings = [{ id: 9, type: "door", wall: 1, s: 200, width: 90, height: 205, swingDir: "R_IN" }];
  const poly = doorSwingPoly(S.openings[0]);
  const mid = poly[Math.floor(poly.length / 2)];
  S.items = [{ id: 20, type: "sofa", x: mid.x, z: mid.z, w: 80, d: 80, h: 80, rot: 0 }];
  assert.equal(polyHitsItem(poly, S.items[0]), true);
  const issues = checkSwingConflicts(S);
  assert.ok(issues.some((i) => i.ref === 9 && i.itemId === 20));
});

/* plan_view.sz() does not flip Y, and plan2d rotates the canvas by
   atan2(t.z, t.x), so local +Y is world (-t.z, t.x) and drawOpening's
   sy = -1 for IN sweeps toward world (t.z, -t.x). The collision sector has to
   land on that same side or the warning contradicts the drawn arc. */
test("the clearance sector sits on the side plan2d draws the arc", () => {
  reset();
  const tangent = { x: 1, z: 0 }; // wall 1 runs along +x
  for (const dir of ["R_IN", "R_OUT", "L_IN", "L_OUT"]) {
    const o = { id: 9, type: "door", wall: 1, s: 200, width: 90, height: 205, swingDir: dir };
    S.openings = [o];
    invalidateSwingCache();
    const poly = doorSwingPoly(o);
    const centroidZ = poly.reduce((sum, p) => sum + p.z, 0) / poly.length;
    // plan2d: local +Y = world (-t.z, t.x) = (0, 1) here; sy = -1 for IN
    const sy = dir.slice(-2) === "IN" ? -1 : 1;
    const drawnZ = sy * tangent.x;
    assert.equal(centroidZ > 0, drawnZ > 0, dir + " sector is mirrored vs the drawn arc");
  }
});

test("swing clearance compares vertical bands, not just footprints", () => {
  reset();
  const o = { id: 9, type: "door", wall: 1, s: 200, width: 90, height: 205, swingDir: "R_IN" };
  S.openings = [o];
  const poly = doorSwingPoly(o);
  const band = doorSwingBand(o);
  const mid = poly[Math.floor(poly.length / 2)];
  const at = (fields) => Object.assign({ id: 20, x: mid.x, z: mid.z, w: 60, d: 60, rot: 0 }, fields);

  // a wall-hung TV above the leaf is not a blocked door
  assert.equal(polyHitsItem(poly, at({ h: 60, elev: 220 }), band), false);
  // a rug under the leaf undercut is not either
  assert.equal(polyHitsItem(poly, at({ h: 2, elev: 0 }), band), false);
  // a wall cabinet at 140 IS in the leaf's way, even though it is off the floor
  assert.equal(polyHitsItem(poly, at({ h: 70, elev: 140 }), band), true);
  // the old h < 28 cut-off silently exempted this
  assert.equal(polyHitsItem(poly, at({ h: 25, elev: 0 }), band), true);
});

test("the conflict set is memoized until the geometry moves", () => {
  reset();
  S.openings = [{ id: 9, type: "door", wall: 1, s: 200, width: 90, height: 205, swingDir: "R_IN" }];
  invalidateSwingCache();
  const first = swingConflicts();
  assert.equal(swingConflicts(), first, "same geometry should reuse the cached result");
  S.items = [{ id: 30, type: "sofa", x: 100, z: 100, w: 40, d: 40, h: 80, rot: 0 }];
  assert.notEqual(swingConflicts(), first, "moving furniture must invalidate the memo");
});

test("furniture well away from the swing is not a hit", () => {
  reset();
  S.openings = [{ id: 9, type: "door", wall: 1, s: 50, width: 80, height: 205, swingDir: "R_IN" }];
  S.items = [{ id: 21, type: "sofa", x: 350, z: 250, w: 40, d: 40, h: 80, rot: 0 }];
  const issues = checkSwingConflicts(S);
  assert.equal(issues.length, 0);
});

test("slab opening corners and room hole assignment", () => {
  reset();
  const o = addSlabOpening({ x: 200, z: 150, w: 100, d: 80, rot: 0 });
  const cs = openingCorners(o);
  assert.equal(cs.length, 4);
  assert.ok(hitSlabOpening(200, 150));
  assert.equal(hitSlabOpening(10, 10), null);
  const room = [{ x: 0, z: 0 }, { x: 400, z: 0 }, { x: 400, z: 300 }, { x: 0, z: 300 }];
  const holes = holesForRoom(room, slabOpenings());
  assert.equal(holes.length, 1);
  assert.equal(holes[0].length, 4);
  assert.equal(openingFromRect({ x: 0, z: 0 }, { x: 10, z: 10 }), null);
});

test("plan ops move items and voids without a DOM", () => {
  const st = {
    items: [{ id: 5, x: 10, z: 20, rot: 0 }],
    openings: [{ id: 8, s: 100, width: 90 }],
    slabOpenings: [{ id: 3, x: 0, z: 0, w: 100, d: 200 }],
    nodes: [{ x: 0, z: 0 }],
  };
  assert.equal(applyPlanOp({ type: "itemMove", id: 5, x: 40, z: 50 }, st), true);
  assert.equal(st.items[0].x, 40);
  assert.equal(applyPlanOp({ type: "openingSet", id: 8, fields: { s: 140 } }, st), true);
  assert.equal(st.openings[0].s, 140);
  assert.equal(applyPlanOp({ type: "slabMove", id: 3, x: 12, z: 9 }, st), true);
  assert.equal(st.slabOpenings[0].x, 12);
  assert.equal(applyPlanOp({ type: "bogus" }, st), false);
});

/* JSON.parse makes `__proto__` a real own enumerable key, so a blind
   key copy runs the Object.prototype setter and swaps the opening's
   prototype. Only known opening fields may cross the wire. */
test("openingSet only accepts whitelisted fields", () => {
  const st = { openings: [{ id: 8, s: 100, width: 90 }] };
  const hostile = JSON.parse('{"__proto__":{"polluted":1},"s":140,"evil":"x"}');
  assert.equal(applyPlanOp({ type: "openingSet", id: 8, fields: hostile }, st), true);
  assert.equal(st.openings[0].s, 140, "the legitimate field still applies");
  assert.equal(st.openings[0].evil, undefined, "unknown fields are dropped");
  assert.equal(Object.getPrototypeOf(st.openings[0]), Object.prototype,
    "the opening's prototype must be untouched");
  // nothing but unknown keys is not an edit
  assert.equal(applyPlanOp({ type: "openingSet", id: 8, fields: { nope: 1 } }, st), false);
});

/* Node ops address corners by array index, and wall creation is not synced,
   so a peer whose node array has grown must refuse rather than move the
   wrong corner. */
test("nodeMove refuses when the peers' node arrays have diverged", () => {
  const st = { nodes: [{ x: 0, z: 0 }, { x: 100, z: 0 }] };
  assert.equal(applyPlanOp({ type: "nodeMove", index: 1, n: 2, x: 50, z: 5 }, st), true);
  assert.equal(st.nodes[1].x, 50);
  assert.equal(applyPlanOp({ type: "nodeMove", index: 1, n: 7, x: 999, z: 999 }, st), false);
  assert.equal(st.nodes[1].x, 50, "a stale index must not move anything");
  // an op without a count still works, for older peers
  assert.equal(applyPlanOp({ type: "nodeMove", index: 0, x: 3, z: 4 }, st), true);
});

test("title block SVG names the sheet and the scale", () => {
  const svg = titleBlockSVG({ name: "Test house", scale: "1:50", width: 400, height: 40 });
  assert.match(svg, /Test house/);
  assert.match(svg, /1:50/);
  assert.match(svg, /<svg/);
});

test("wrapPlanSVG hangs a title block under the plan", () => {
  const svg = wrapPlanSVG('<line x1="0" y1="0" x2="10" y2="10"/>', { w: 400, d: 300 }, { name: "Villa" });
  assert.match(svg, /Villa/);
  assert.match(svg, /1:20/);
  assert.match(svg, /A-01/);
});

/* The whole point of a scale caption is that a ruler on the paper agrees with
   it. The sheet used to print at 1:100 no matter what the block claimed. */
test("the sheet prints at the scale its title block advertises", () => {
  const bounds = { w: 400, d: 300 };
  const L = sheetLayout(bounds);
  const svg = wrapPlanSVG("<line/>", bounds, { name: "Villa" });
  const mm = svg.match(/width="([\d.]+)mm" height="([\d.]+)mm"/);
  const view = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
  assert.ok(mm && view, "root svg must carry physical size and a viewBox");

  // one model centimetre must land on 10/denominator millimetres of paper
  const mmPerUnit = Number(mm[1]) / Number(view[1]);
  assert.ok(Math.abs(mmPerUnit - 10 / L.denom) < 1e-6,
    `printed ${mmPerUnit} mm/cm, block says 1:${L.denom} (${10 / L.denom} mm/cm)`);
  assert.equal(Number(mm[2]) / Number(view[2]).toFixed(6) > 0, true);
  assert.match(svg, new RegExp("1:" + L.denom));
});

test("sheet layout picks a real paper size and a conventional scale", () => {
  const L = sheetLayout({ w: 400, d: 300 });
  assert.ok(PAPER_SIZES[L.paperName], "paper must be a named size");
  assert.equal(L.widthMm, PAPER_SIZES[L.paperName].w);
  assert.ok([10, 20, 25, 50, 100, 200, 500].includes(L.denom));
  // the drawing plus margins and the title block has to fit the sheet
  const availH = L.heightMm - L.marginMm * 2 - L.blockMm;
  assert.ok(400 * 10 / L.denom <= L.widthMm - L.marginMm * 2);
  assert.ok(300 * 10 / L.denom <= availH);
  // a forced sheet is honoured
  assert.equal(sheetLayout({ w: 400, d: 300 }, { paper: "ArchD" }).paperName, "ArchD");
});

test("the title block is sized in paper millimetres, not model centimetres", () => {
  const L = sheetLayout({ w: 400, d: 300 });
  // 18 mm of paper, whatever the scale — the old block was 42 model cm (4.2 mm)
  assert.equal(L.blockMm, 18);
  const svg = wrapPlanSVG("<line/>", { w: 400, d: 300 }, { name: "Villa" });
  const nested = svg.match(/<svg[^>]*viewBox="0 0 [\d.]+ 18"[^>]*height="([\d.]+)"/);
  assert.ok(nested, "title block should be nested at the block height in user units");
  assert.ok(Math.abs(Number(nested[1]) - L.blockMm * L.cmPerMm) < 1e-6);
});

test("two disjoint boxes do not intersect", () => {
  const a = [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 10 }, { x: 0, z: 10 }];
  const b = [{ x: 50, z: 50 }, { x: 60, z: 50 }, { x: 60, z: 60 }, { x: 50, z: 60 }];
  assert.equal(polysIntersect(a, b), false);
  const c = [{ x: 5, z: 5 }, { x: 15, z: 5 }, { x: 15, z: 15 }, { x: 5, z: 15 }];
  assert.equal(polysIntersect(a, c), true);
});

test("sector poly starts at the hinge", () => {
  const poly = sectorPoly({ x: 0, z: 0 }, { x: 1, z: 0 }, { x: 0, z: 1 }, 90, 8);
  assert.equal(poly[0].x, 0);
  assert.equal(poly[0].z, 0);
  assert.ok(Math.abs(poly[poly.length - 1].z - 90) < 1e-6);
});

/* --- stairwell voids --------------------------------------------------- */

test("a stairwell void follows the flight it is bound to", () => {
  reset();
  const stairs = { id: 42, type: "stairs", x: 100, z: 100, w: 110, d: 260, rot: 0 };
  const fields = stairVoidFields(stairs);
  assert.equal(fields.stairsId, 42);
  const list = [fields, { id: 7, x: 0, z: 0, w: 100, d: 100 }];

  stairs.x = 300; stairs.z = 250; stairs.rot = 90;
  assert.equal(applyStairMoveTo(list, stairs), true);
  assert.equal(list[0].x, 300);
  assert.equal(list[0].z, 250);
  assert.equal(list[0].rot, 90);
  assert.equal(list[1].x, 0, "an unrelated void must not move");
  // idempotent: nothing moved, nothing reported
  assert.equal(applyStairMoveTo(list, stairs), false);
});

test("a stairwell void lands on the storey above, not the stairs' own", () => {
  configureFloorIO({ sceneObject: () => ({ nodes: [], walls: [] }), applyData: () => {} });
  S.workspace = {
    id: "p1",
    activeFloor: "g",
    floors: [
      { id: "g", name: "Ground", elevation: 0, scene: { slabOpenings: [] } },
      { id: "u", name: "Upper", elevation: 280, scene: { slabOpenings: [] } },
      { id: "r", name: "Roof", elevation: 560, scene: { slabOpenings: [] } },
    ],
  };
  const above = floorAbove();
  assert.equal(above.id, "u", "nearest storey above by elevation, not the top one");

  const vo = stairVoidFields({ id: 9, x: 50, z: 60, w: 100, d: 250, rot: 0 });
  addSlabOpeningToFloor(above.id, vo);
  assert.equal(S.workspace.floors[1].scene.slabOpenings.length, 1);
  assert.equal(S.workspace.floors[1].scene.slabOpenings[0].stairsId, 9);
  // captureFloor() re-snapshots the active storey on the way through, so the
  // assertion is that nothing was ADDED to it — not that the object is untouched
  assert.equal((S.workspace.floors[0].scene.slabOpenings || []).length, 0,
    "the stairs' own storey keeps its slab intact");

  // the top storey has nothing above it, so there is no slab to cut
  S.workspace.activeFloor = "r";
  assert.equal(floorAbove(), null);
});

/* --- room scan --------------------------------------------------------- */

test("calibration corrects the plan without stretching door heights", () => {
  const r = roomScanFromPoints([
    { x: 0, z: 0 }, { x: 400, z: 0 }, { x: 400, z: 300 }, { x: 0, z: 300 },
  ]);
  scaleScan(r, 500);
  assert.equal(Math.round(longestScanEdge(r).length), 500);
  assert.equal(r.cad.lines[0].height, 270, "a tape across a wall says nothing about its height");
  // an explicitly mis-scaled capture can still opt in
  const r2 = roomScanFromPoints([{ x: 0, z: 0 }, { x: 400, z: 0 }, { x: 400, z: 300 }, { x: 0, z: 300 }]);
  scaleScan(r2, 500, null, null, { heights: true });
  assert.ok(Math.abs(r2.cad.lines[0].height - 337.5) < 0.01);
});

test("inside-face corners are offset out to wall centre-lines", () => {
  const r = roomScanFromPoints([
    { x: 0, z: 0 }, { x: 400, z: 0 }, { x: 400, z: 300 }, { x: 0, z: 300 },
  ], { thicknessCm: 12 });
  const before = scanBounds(r);
  insetScan(r, 1);
  const after = scanBounds(r);
  // a tapped loop is the inside face, so centre-lines sit half a wall further out
  assert.ok(Math.abs(after.width - (before.width + 12)) < 0.01);
  assert.ok(Math.abs(after.depth - (before.depth + 12)) < 0.01);
});

test("a scanned wall keeps its own measured height", () => {
  const converted = convertCadToWalls({
    lines: [
      { a: { x: 0, z: 0 }, b: { x: 300, z: 0 }, height: 244, thickness: 10 },
      { a: { x: 300, z: 0 }, b: { x: 300, z: 300 }, height: 301, thickness: 10 },
      { a: { x: 300, z: 300 }, b: { x: 0, z: 300 }, thickness: 10 },
    ],
    doors: [], windows: [],
  }, { singleLineWalls: true, height: 270, nodeTolerance: 18, firstId: 1 });
  assert.equal(converted.walls[0].height, 244);
  assert.equal(converted.walls[1].height, 301);
  assert.equal(converted.walls[2].height, 270, "a line with no height falls back");
});
