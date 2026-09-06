import test from "node:test";
import assert from "node:assert/strict";

import { stampRect, removeWall, wallSeparates, pointOnSegment, segmentCross, rectOverlapsRoom, rectOverlapsRooms, rectInsideRoom } from "../js/room_graph.js";
import { solveDock, corridorRect, translateRect } from "../js/room_dock.js";
import { placeRoom, stampPresetAt, cutOpening, proposeInsert } from "../js/room_stamp.js";
import { presetRect, roomPreset, rectInterior } from "../js/room_presets.js";

function blank() {
  return { nodes: [], walls: [], openings: [], items: [], roomMeta: {}, idc: 1 };
}

/* A stand-in for geometry.js's face trace: the tests only need to know how
   many enclosed areas the graph has, which is Euler's formula on the planar
   graph (V - E + F = 2, minus the outer face). Using it rather than importing
   the planner keeps this suite DOM-free. */
function faceCount(state) {
  const used = new Set();
  state.walls.forEach((w) => { used.add(w.a); used.add(w.b); });
  const V = used.size, E = state.walls.length;
  if (!E) return 0;
  // connected components over the used nodes
  const adj = new Map();
  used.forEach((n) => adj.set(n, []));
  state.walls.forEach((w) => { adj.get(w.a).push(w.b); adj.get(w.b).push(w.a); });
  const seen = new Set();
  let C = 0;
  used.forEach((n) => {
    if (seen.has(n)) return;
    C++;
    const stack = [n];
    while (stack.length) {
      const cur = stack.pop();
      if (seen.has(cur)) continue;
      seen.add(cur);
      adj.get(cur).forEach((m) => { if (!seen.has(m)) stack.push(m); });
    }
  });
  return E - V + C; // interior faces
}

test("segment helpers only cut where a cut is needed", () => {
  const a = { x: 0, z: 0 }, b = { x: 100, z: 0 };
  assert.equal(pointOnSegment({ x: 50, z: 0 }, a, b).interior, true);
  assert.equal(pointOnSegment({ x: 0, z: 0 }, a, b).interior, false);
  assert.equal(pointOnSegment({ x: 50, z: 40 }, a, b), null);
  assert.equal(pointOnSegment({ x: 150, z: 0 }, a, b), null);
  // collinear overlap is a shared wall, not a crossing
  assert.equal(segmentCross(a, b, { x: 50, z: 0 }, { x: 150, z: 0 }), null);
  // touching at an endpoint is a joint, not a crossing
  assert.equal(segmentCross(a, b, { x: 50, z: 0 }, { x: 50, z: 90 }), null);
  const x = segmentCross(a, b, { x: 50, z: -50 }, { x: 50, z: 50 });
  assert.ok(x && Math.abs(x.x - 50) < 1e-6);
});

test("a stamped rectangle is four walls and one enclosed area", () => {
  const s = blank();
  const out = stampRect(s, { x0: 0, z0: 0, x1: 400, z1: 300 }, {});
  assert.ok(out.ok);
  assert.equal(out.created.length, 4);
  assert.equal(out.shared.length, 0);
  assert.equal(faceCount(s), 1);
  assert.equal(out.key, "1,2,3,4");
});

test("a rectangle stamped flush against another shares its wall", () => {
  const s = blank();
  stampRect(s, { x0: 0, z0: 0, x1: 400, z1: 300 }, {});
  const out = stampRect(s, { x0: 400, z0: 0, x1: 700, z1: 300 }, {});
  assert.ok(out.ok);
  assert.equal(out.shared.length, 1, "the touching face is recognised, not rebuilt");
  assert.equal(out.created.length, 3);
  assert.equal(s.walls.length, 7);
  assert.equal(faceCount(s), 2);
});

test("a partial overlap splits the wall it lands against", () => {
  const s = blank();
  stampRect(s, { x0: 0, z0: 0, x1: 400, z1: 400 }, {});
  // shares only the top half of the right-hand wall
  const out = stampRect(s, { x0: 400, z0: 0, x1: 700, z1: 200 }, {});
  assert.ok(out.ok);
  assert.equal(out.shared.length, 1);
  assert.equal(faceCount(s), 2, "both rooms are still closed after the split");
  // the original right-hand wall became two, so the plan gained one wall from
  // the split plus the three new sides
  assert.equal(s.walls.length, 8);
});

test("splitting a wall carries its openings onto the right half", () => {
  const s = blank();
  stampRect(s, { x0: 0, z0: 0, x1: 400, z1: 400 }, {});
  const right = s.walls.find((w) => s.nodes[w.a].x === 400 && s.nodes[w.b].x === 400);
  cutOpening(s, right.id, { type: "door", width: 80 }); // at s = 200, the far half
  stampRect(s, { x0: 400, z0: 0, x1: 700, z1: 150 }, {});
  const door = s.openings[0];
  assert.notEqual(door.wall, right.id, "the door moved to the half it now falls in");
  assert.ok(door.s > 0);
});

test("the dock solver pulls a near miss flush and offers a corridor", () => {
  const s = blank();
  stampRect(s, { x0: 0, z0: 0, x1: 400, z1: 300 }, {});
  const near = { x0: 404, z0: 6, x1: 704, z1: 306 };
  const dock = solveDock(s, near);
  assert.ok(dock, "a rectangle four centimetres off finds the wall");
  assert.equal(dock.mode, "abut");
  const snapped = translateRect(near, dock.dx, dock.dz);
  assert.equal(snapped.x0, 400);
  assert.equal(snapped.z0, 0, "it lines up along the wall as well as against it");

  const far = { x0: 522, z0: 0, x1: 822, z1: 300 };
  const gap = solveDock(s, far);
  assert.ok(gap && gap.mode === "corridor");
  assert.equal(gap.gap, 120);
  const corridor = corridorRect(translateRect(far, gap.dx, gap.dz), gap);
  assert.equal(corridor.x0, 400);
  assert.equal(corridor.x1, 520);
});

test("a room dropped out on its own does not invent a dock", () => {
  const s = blank();
  stampRect(s, { x0: 0, z0: 0, x1: 400, z1: 300 }, {});
  assert.equal(solveDock(s, { x0: 900, z0: 900, x1: 1200, z1: 1200 }), null);
});

test("placing a preset room against a neighbour cuts a door through the party wall", () => {
  const s = blank();
  const first = stampPresetAt(s, "livingKitchen", 300, 300);
  assert.ok(first.ok);
  assert.equal(s.roomMeta[first.key].name, "Living / kitchen");
  assert.equal(s.roomMeta[first.key].floor, "wood");

  const living = presetRect(roomPreset("livingKitchen"), 300, 300, { thickness: 10 });
  const bedroom = roomPreset("bedroom");
  // aim just past the right-hand wall, deliberately a few centimetres off
  const cx = living.x1 + (bedroom.w + 10) / 2 + 5;
  const second = stampPresetAt(s, "bedroom", cx, 300);
  assert.ok(second.ok);
  assert.equal(second.dock.mode, "abut");
  assert.equal(second.shared.length, 1);
  assert.equal(second.openings.length, 1);
  assert.equal(second.openings[0].type, "door");
  assert.equal(second.openings[0].width, bedroom.door);
  assert.equal(faceCount(s), 2);
});

test("a corridor preset opens rather than doors onto what it serves", () => {
  const s = blank();
  const first = stampPresetAt(s, "bedroom", 200, 200);
  const rect = presetRect(roomPreset("bedroom"), 200, 200, { thickness: 10 });
  const corridor = roomPreset("corridor");
  const out = stampPresetAt(s, "corridor", rect.x1 + (corridor.w + 10) / 2 + 3, 200);
  assert.ok(out.ok && first.ok);
  assert.equal(out.openings[0].type, "passage");
});

test("erasing the party wall merges the two rooms into one space", () => {
  const s = blank();
  const a = stampRect(s, { x0: 0, z0: 0, x1: 400, z1: 300 }, {});
  const b = stampRect(s, { x0: 400, z0: 0, x1: 700, z1: 300 }, {});
  const party = b.shared[0];
  const rooms = [{ key: a.key }, { key: b.key }];
  assert.ok(wallSeparates(rooms, party), "the eraser can tell it is a party wall");
  cutOpening(s, party, { type: "door", width: 80 });
  assert.equal(s.openings.length, 1);

  const gone = removeWall(s, party);
  assert.ok(gone.ok);
  assert.equal(gone.openings.length, 1, "the door in it goes with it");
  assert.equal(s.openings.length, 0);
  assert.equal(faceCount(s), 1, "two spaces became one");
  assert.equal(s.walls.length, 6);
});

test("interior sizes survive the round trip through centreline coordinates", () => {
  const bedroom = roomPreset("bedroom");
  const rect = presetRect(bedroom, 0, 0, { thickness: 20 });
  const back = rectInterior(rect, 20);
  assert.equal(back.w, bedroom.w);
  assert.equal(back.d, bedroom.d);
  const turned = presetRect(bedroom, 0, 0, { thickness: 20, rot: 90 });
  assert.equal(rectInterior(turned, 20).w, bedroom.d);
});

test("a room too small to be a room is refused", () => {
  const s = blank();
  assert.equal(stampRect(s, { x0: 0, z0: 0, x1: 10, z1: 10 }, {}).reason, "ROOM_TOO_SMALL");
  assert.equal(s.walls.length, 0);
});

test("placeRoom leaves the drawing planar when a room straddles two others", () => {
  const s = blank();
  stampRect(s, { x0: 0, z0: 0, x1: 300, z1: 300 }, {});
  stampRect(s, { x0: 0, z0: 300, x1: 300, z1: 600 }, {});
  /* Spans both of the rooms above, so its left edge must cut through the wall
     between them and pick up that node.

     `allowOverlap` is the point of the test, not an oversight: this is the
     unguarded path — no face trace to check against — and what it must still
     produce is a PLANAR graph. The guard that stops a user doing this is
     covered separately, in the overlap tests below and in
     room_stamp_plan.test.mjs against the real trace. */
  const out = placeRoom(s, {
    rect: { x0: 300, z0: 0, x1: 600, z1: 600 }, spec: {}, allowOverlap: true,
  });
  assert.ok(out.ok);
  assert.equal(faceCount(s), 3);
  const nodeAt = s.nodes.some((n) => n.x === 300 && n.z === 300);
  assert.ok(nodeAt, "the T-junction is a real node");
});

/* ---- refusing to land on a room ----------------------------------------- */

const ROOM_300 = [{ x: 0, z: 0 }, { x: 300, z: 0 }, { x: 300, z: 300 }, { x: 0, z: 300 }];

test("a rectangle flush against a room is not overlapping it", () => {
  assert.equal(rectOverlapsRoom({ x0: 300, z0: 0, x1: 600, z1: 300 }, ROOM_300), false);
  assert.equal(rectOverlapsRoom({ x0: 0, z0: 300, x1: 300, z1: 600 }, ROOM_300), false);
  // and a corner-to-corner touch is not either
  assert.equal(rectOverlapsRoom({ x0: 300, z0: 300, x1: 600, z1: 600 }, ROOM_300), false);
});

test("inside, across and around all count as overlapping", () => {
  assert.equal(rectOverlapsRoom({ x0: 60, z0: 60, x1: 200, z1: 200 }, ROOM_300), true, "island");
  assert.equal(rectOverlapsRoom({ x0: 150, z0: 150, x1: 500, z1: 500 }, ROOM_300), true, "straddle");
  assert.equal(rectOverlapsRoom({ x0: -50, z0: -50, x1: 400, z1: 400 }, ROOM_300), true, "swallowed");
  assert.equal(rectOverlapsRoom({ x0: -100, z0: 100, x1: 400, z1: 200 }, ROOM_300), true, "skewered");
});

test("a rectangle flush inside a room is contained; one sitting outside it is not", () => {
  assert.equal(rectInsideRoom({ x0: 140, z0: 90, x1: 300, z1: 210 }, ROOM_300), true, "flush to the right wall");
  assert.equal(rectInsideRoom({ x0: 60, z0: 60, x1: 200, z1: 200 }, ROOM_300), true, "island is inside too");
  assert.equal(rectInsideRoom({ x0: 300, z0: 0, x1: 600, z1: 300 }, ROOM_300), false, "abutting outside");
  assert.equal(rectInsideRoom({ x0: 200, z0: 100, x1: 400, z1: 200 }, ROOM_300), false, "straddling");
});

test("an inward abut becomes an insert; an island with no wall to sit on does not", () => {
  const rooms = [{ key: "1,2,3,4", pts: ROOM_300, area: 90000 }];
  const dock = { mode: "abut", axis: "v", side: -1 };
  const insert = proposeInsert({ x0: 140, z0: 90, x1: 300, z1: 210 }, dock, rooms);
  assert.ok(insert);
  assert.equal(insert.mode, "insert");
  assert.equal(insert.hostKey, "1,2,3,4");
  assert.equal(proposeInsert({ x0: 60, z0: 60, x1: 200, z1: 200 }, null, rooms), null,
    "without a wall to sit against, sitting inside is still a collision");
});

test("placeRoom refuses a rectangle that lands on a room, and changes nothing", () => {
  const s = blank();
  const first = placeRoom(s, { preset: "bedroom", rect: { x0: 0, z0: 0, x1: 300, z1: 300 }, spec: {} });
  const rooms = [{ key: first.key, pts: ROOM_300 }];
  const before = JSON.stringify(s);
  const out = placeRoom(s, { preset: "wc", rect: { x0: 60, z0: 60, x1: 200, z1: 200 }, spec: {}, rooms });
  assert.equal(out.ok, false);
  assert.equal(out.reason, "ROOM_OVERLAPS");
  assert.equal(JSON.stringify(s), before, "a refused stamp must not leave half a room behind");
});

/* ---- doors go round what is already in the wall -------------------------- */

test("a window in the party wall no longer swallows the door", () => {
  const s = blank();
  stampRect(s, { x0: 0, z0: 0, x1: 400, z1: 300 }, {});
  const right = s.walls.find((w) => s.nodes[w.a].x === 400 && s.nodes[w.b].x === 400);
  s.openings.push({ id: s.idc++, type: "window", wall: right.id, s: 150, width: 120, height: 120, sill: 90 });
  const door = cutOpening(s, right.id, { type: "door", width: 80 });
  assert.ok(door, "the wall is not connected just because it has a window in it");
  assert.equal(door.type, "door");
  // it took a clear stretch of the wall rather than cutting through the window
  const clash = door.s + door.width / 2 > 150 - 60 && door.s - door.width / 2 < 150 + 60;
  assert.equal(clash, false, "the door does not overlap the window");
});

test("a door already there is the answer; a second one is not", () => {
  const s = blank();
  stampRect(s, { x0: 0, z0: 0, x1: 400, z1: 300 }, {});
  const right = s.walls.find((w) => s.nodes[w.a].x === 400 && s.nodes[w.b].x === 400);
  const first = cutOpening(s, right.id, { type: "door", width: 80 });
  assert.equal(cutOpening(s, right.id, { type: "door", width: 80 }), first);
  assert.equal(s.openings.length, 1);
});

test("a wall with no clear stretch left gets no door rather than a sliver", () => {
  const s = blank();
  stampRect(s, { x0: 0, z0: 0, x1: 400, z1: 300 }, {});
  const right = s.walls.find((w) => s.nodes[w.a].x === 400 && s.nodes[w.b].x === 400);
  s.openings.push({ id: s.idc++, type: "window", wall: right.id, s: 150, width: 250, height: 120, sill: 90 });
  assert.equal(cutOpening(s, right.id, { type: "door", width: 80 }), null);
});

test("only a gap near a corridor's width proposes a corridor", () => {
  const s = blank();
  stampRect(s, { x0: 0, z0: 0, x1: 400, z1: 300 }, {});
  const at = (gap) => {
    const dock = solveDock(s, { x0: 400 + gap, z0: 0, x1: 700 + gap, z1: 300 });
    return dock ? dock.mode : null;
  };
  assert.equal(at(2), "abut", "nearly touching is a party wall");
  assert.equal(at(50), "abut");
  assert.equal(at(70), null, "too far to abut, too near to be a corridor — leave it where it is");
  assert.equal(at(120), "corridor");
  assert.equal(at(150), "corridor");
  assert.equal(at(200), null, "a room parked well clear of a wall invents nothing");
});

test("a drag can ask for flush answers only", () => {
  const s = blank();
  stampRect(s, { x0: 0, z0: 0, x1: 400, z1: 300 }, {});
  const rect = { x0: 520, z0: 0, x1: 820, z1: 300 };
  assert.equal(solveDock(s, rect).mode, "corridor");
  assert.equal(solveDock(s, rect, { abutOnly: true }), null);
});

test("the overlap guard is on unless it is switched off", () => {
  const s = blank();
  const first = placeRoom(s, { preset: "bedroom", rect: { x0: 0, z0: 0, x1: 300, z1: 300 }, spec: {} });
  const rooms = [{ key: first.key, pts: ROOM_300 }];
  const on = { rect: { x0: 60, z0: 60, x1: 200, z1: 200 }, spec: {}, rooms };
  assert.equal(placeRoom(s, on).reason, "ROOM_OVERLAPS");
  // a caller that has a trace to offer gets checked even when it offers it as
  // a re-trace function rather than a list
  assert.equal(
    placeRoom(s, { rect: on.rect, spec: {}, detectRooms: () => rooms }).reason,
    "ROOM_OVERLAPS",
  );
  assert.equal(placeRoom(s, Object.assign({}, on, { allowOverlap: true })).ok, true);
});
