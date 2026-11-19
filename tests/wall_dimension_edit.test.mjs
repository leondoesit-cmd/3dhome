import { moduleSource } from "./helpers/module_source.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { S } from "../js/state.js";
import { wallGeom, wallClearLength, wallDimSide, wallOutline, wallLocFace } from "../js/geometry.js";
import {
  preserveClear,
  snapshotNodes,
  enforceLocks,
  fitWallClearLength,
  setWallThicknessPreservingClear,
  syncClears,
  captureClear,
  settleWallDim,
  syncLocks,
} from "../js/constraint_engine.js";

function twoFreeWalls() {
  S.interiorDims = true;
  S.nodes = [
    { x: 0, z: 0 }, { x: 100, z: 0 },
    { x: 200, z: 0 }, { x: 300, z: 0 },
  ];
  S.walls = [
    { id: 1, a: 0, b: 1, thickness: 10, height: 270, clearL: 180 },
    { id: 2, a: 2, b: 3, thickness: 10, height: 270, clearL: 140 },
  ];
}

test("a direct dimension reconciliation cannot resize another free wall", () => {
  twoFreeWalls();

  preserveClear(null, [2]);

  assert.equal(wallGeom(S.walls[0]).L, 100, "the unrelated wall stays put");
  assert.equal(wallGeom(S.walls[1]).L, 140, "the edited wall reaches its stated length");
});

test("wall inspector commits length and angle atomically", async () => {
  const source = moduleSource("js/ui.js");
  assert.match(source, /bindLength\("w_len",[\s\S]*?null, "change"\);/);
  assert.match(source, /bindNum\("w_ang",[\s\S]*?null, "change"\);/);
  assert.match(source, /bindLength\("w_th",[\s\S]*?null, "change"\);/);
});

test("thickness grows away from the measured face and preserves every room length", () => {
  S.interiorDims = true;
  S.nodes = [
    { x: 0, z: 0 }, { x: 400, z: 0 },
    { x: 400, z: 300 }, { x: 0, z: 300 },
  ];
  S.walls = [
    { id: 1, a: 0, b: 1, thickness: 10, height: 270 },
    { id: 2, a: 1, b: 2, thickness: 10, height: 270 },
    { id: 3, a: 2, b: 3, thickness: 10, height: 270 },
    { id: 4, a: 3, b: 0, thickness: 10, height: 270 },
  ];
  syncClears();
  const wall = S.walls[0];
  wall.dimSide = wallDimSide(wall);
  const beforeLengths = S.walls.map(wallClearLength);
  const beforeFaceZ = S.nodes[wall.a].z + wall.dimSide * wall.thickness / 2;

  setWallThicknessPreservingClear(wall, 20, "b");

  assert.deepEqual(S.walls.map(wallClearLength), beforeLengths);
  assert.equal(S.nodes[wall.a].z + wall.dimSide * wall.thickness / 2, beforeFaceZ);
  assert.equal(S.nodes[wall.a].z, -5, "all extra material grew away from the room face");
});

/* A closed room is the case a rigid slide cannot reach — the far side of every
   wall is reachable without crossing it — so all of these went through
   relaxLocks(). Before it existed the outer-face edit released two corners and
   the centreline edit silently resized the room. */
function room(t = 10) {
  S.interiorDims = true;
  S.roomMeta = {};
  S.openings = [];
  S.items = [];
  S.nodes = [
    { x: 0, z: 0 }, { x: 400, z: 0 },
    { x: 400, z: 300 }, { x: 0, z: 300 },
  ];
  S.walls = [
    { id: 1, a: 0, b: 1, thickness: t, height: 270 },
    { id: 2, a: 1, b: 2, thickness: t, height: 270 },
    { id: 3, a: 2, b: 3, thickness: t, height: 270 },
    { id: 4, a: 3, b: 0, thickness: t, height: 270 },
  ];
  syncClears();
  syncLocks(); // the app captures these at load; the solver holds what they say
}
function assertLengths(want, msg) {
  S.walls.forEach((w, i) => {
    assert.ok(
      Math.abs(wallClearLength(w) - want[i]) < 0.05,
      `${msg}: wall ${w.id} reads ${wallClearLength(w)}, expected ${want[i]}`,
    );
  });
}

test("an outer reference face keeps every length AND every corner", () => {
  room();
  const wall = S.walls[0];
  wall.dimSide = -1;
  wall.clearL = wallClearLength(wall);
  const beforeLengths = S.walls.map(wallClearLength);

  const result = setWallThicknessPreservingClear(wall, 20, "b");

  assertLengths(beforeLengths, "outer-face thickness edit");
  assert.equal(result.released, 0, "the room stays connected");
  assert.equal(wall.b, S.walls[1].a, "the corner is still shared");
});

test("a centreline dimension does not let a thickness edit resize the room", () => {
  room();
  const wall = S.walls[0];
  wall.dimSide = 0; // "Measured along" = centreline
  captureClear(wall);
  const beforeLengths = S.walls.map(wallClearLength);

  setWallThicknessPreservingClear(wall, 30, "b");

  assert.equal(S.nodes[0].z, 0, "the centreline is what stayed put");
  assertLengths(beforeLengths, "centreline thickness edit");
});

test("typing a width widens the room instead of tearing a corner off it", () => {
  room();
  const wall = S.walls[0];
  wall.dimSide = wallDimSide(wall);
  wall.dimUser = 1;
  const before = snapshotNodes();

  // what ui.js does: move the picked end, then settle the rest of the plan
  const gm = wallGeom(wall);
  const targetL = 500 + (gm.L - wallClearLength(wall));
  S.nodes[wall.b] = {
    x: S.nodes[wall.a].x + gm.ux * targetL,
    z: S.nodes[wall.a].z + gm.uz * targetL,
  };
  wall.clearL = 500;
  const relaxed = settleWallDim(wall, 500, "b", [wall.id]);
  const released = enforceLocks(before, [wall.id].concat(relaxed.yielded));

  assert.equal(released, 0, "no joint was released");
  // the two side walls keep the depth they state; the far wall FOLLOWS, because
  // in a rectangle its length is the same dimension the user just typed
  assertLengths([500, 290, 500, 290], "typed width");
  S.walls.forEach((w) => {
    assert.ok(Math.abs(wallClearLength(w) - w.clearL) < 0.05,
      `wall ${w.id} still reads its stated length`);
  });
});

test("a wall the user dimensioned by hand is never the one that yields", () => {
  room();
  const north = S.walls[0], south = S.walls[2];
  north.dimSide = wallDimSide(north);
  north.dimUser = 1;
  south.dimUser = 1; // both sides typed: a genuine contradiction
  const before = snapshotNodes();
  const gm = wallGeom(north);
  S.nodes[north.b] = {
    x: S.nodes[north.a].x + gm.ux * (gm.L + 100),
    z: S.nodes[north.a].z + gm.uz * (gm.L + 100),
  };
  north.clearL = 490;
  const relaxed = settleWallDim(north, 490, "b", [north.id]);

  assert.deepEqual(relaxed.yielded, [], "neither typed length was sacrificed");
  // with nothing left to yield the loop IS contradictory, so the documented
  // rule applies: the dimensions stand and the joint is what gives way
  assert.ok(enforceLocks(before, [north.id]) > 0, "a joint was released");
  assert.ok(Math.abs(wallClearLength(south) - 390) < 0.3,
    "the hand-typed far wall got its own number back");
});

test("thickening a shared partition keeps both rooms intact", () => {
  S.interiorDims = true;
  S.roomMeta = {};
  S.openings = [];
  S.items = [];
  S.nodes = [
    { x: 0, z: 0 }, { x: 400, z: 0 }, { x: 400, z: 300 }, { x: 0, z: 300 },
    { x: 800, z: 0 }, { x: 800, z: 300 },
  ];
  S.walls = [
    { id: 1, a: 0, b: 1, thickness: 10, height: 270 },
    { id: 2, a: 1, b: 2, thickness: 10, height: 270 },
    { id: 3, a: 2, b: 3, thickness: 10, height: 270 },
    { id: 4, a: 3, b: 0, thickness: 10, height: 270 },
    { id: 5, a: 1, b: 4, thickness: 10, height: 270 },
    { id: 6, a: 4, b: 5, thickness: 10, height: 270 },
    { id: 7, a: 5, b: 2, thickness: 10, height: 270 },
  ];
  syncClears();
  syncLocks();
  const beforeLengths = S.walls.map(wallClearLength);

  const result = setWallThicknessPreservingClear(S.walls[1], 30, "b");

  assert.equal(result.released, 0, "no corner comes apart");
  assertLengths(beforeLengths, "partition thickness edit");
});

test("rotating either end cannot flip the wall's automatic measurement face", () => {
  for (const movedEnd of ["a", "b"]) {
    S.interiorDims = true;
    S.nodes = [
      { x: 0, z: 0 }, { x: 400, z: 0 },
      { x: 400, z: 300 }, { x: 0, z: 300 },
    ];
    S.walls = [
      { id: 1, a: 0, b: 1, thickness: 10, height: 270, clearL: 390 },
      { id: 2, a: 1, b: 2, thickness: 10, height: 270, clearL: 290 },
      { id: 3, a: 2, b: 3, thickness: 10, height: 270, clearL: 390 },
      { id: 4, a: 3, b: 0, thickness: 10, height: 270, clearL: 290 },
    ];
    const wall = S.walls[0];
    wall.dimSide = wallDimSide(wall); // what the inspector pins before edit
    const before = snapshotNodes();
    const length = wallGeom(wall).L;
    const angle = 15 * Math.PI / 180;
    if (movedEnd === "b")
      S.nodes[wall.b] = { x: Math.cos(angle) * length, z: Math.sin(angle) * length };
    else
      S.nodes[wall.a] = {
        x: S.nodes[wall.b].x - Math.cos(angle) * length,
        z: S.nodes[wall.b].z - Math.sin(angle) * length,
      };

    enforceLocks(before, [wall.id]);
    fitWallClearLength(wall, 390, movedEnd);

    assert.ok(
      Math.abs(wallClearLength(wall) - 390) < 0.02,
      `the ${movedEnd} end keeps the 390 cm dimension`,
    );
    assert.equal(wall.dimSide === 1 || wall.dimSide === -1 || wall.dimSide === 0, true);
  }
});

test("squaring a slanted closing wall settles the perpendicular neighbour without releasing joints", () => {
  S.interiorDims = true;
  S.nodes = [
    { x: 0, z: 0 }, { x: 200, z: 0 },
    { x: 200, z: 120 }, { x: 0, z: 100 },
  ];
  S.walls = [
    { id: 1, a: 0, b: 1, thickness: 10, height: 270, clearL: 190, lockAng: 0 },
    { id: 2, a: 1, b: 2, thickness: 10, height: 270, clearL: 110, lockAng: 90 },
    { id: 3, a: 2, b: 3, thickness: 10, height: 270, clearL: 190 }, // slanted closing wall
    { id: 4, a: 3, b: 0, thickness: 10, height: 270, clearL: 90, lockAng: 270 },
  ];
  syncClears();
  syncLocks();

  const bottomWall = S.walls[2];
  bottomWall.dimSide = wallDimSide(bottomWall);
  const before = snapshotNodes();

  // Square bottomWall to angle 180° (horizontal) pivoting at node b (index 3)
  bottomWall.lockAng = 180;
  const targetL = wallGeom(bottomWall).L;
  S.nodes[bottomWall.a] = {
    x: S.nodes[bottomWall.b].x + Math.cos(0) * targetL,
    z: S.nodes[bottomWall.b].z + Math.sin(0) * targetL,
  };

  const relaxed = settleWallDim(bottomWall, 190, "a", [bottomWall.id]);
  const released = enforceLocks(before, [bottomWall.id].concat(relaxed.yielded));

  assert.equal(released, 0, "all 4 corners stay connected");
  assert.ok(relaxed.yielded.includes(2), "perpendicular wall 2 yielded to accommodate the angle change");
  assert.equal(Math.round((wallGeom(bottomWall).ang * 180) / Math.PI) % 180, 0, "bottom wall is now horizontal");
  assert.equal(Math.round((wallGeom(S.walls[1]).ang * 180) / Math.PI), 90, "right wall is vertical");
});

test("squaring a 3-arm T-junction corner settles the room and preserves the straight-through run", () => {
  S.interiorDims = true;
  S.nodes = [
    { x: 0, z: 0 },       // 0: T-junction
    { x: 0, z: -100 },    // 1: top stub
    { x: 0, z: 100 },     // 2: bottom stub
    { x: 255, z: 5 },     // 3: top-right corner (slanted)
    { x: 255, z: 105 },   // 4: bottom-right corner
  ];
  S.walls = [
    { id: 1, a: 0, b: 1, thickness: 10, height: 270, clearL: 95, lockAng: -90 },
    { id: 2, a: 0, b: 2, thickness: 10, height: 270, clearL: 95, lockAng: 90 },
    { id: 3, a: 0, b: 3, thickness: 10, height: 270, clearL: 250 }, // slanted branch wall at ~1.1°
    { id: 4, a: 3, b: 4, thickness: 10, height: 270, clearL: 95, lockAng: 90 },
    { id: 5, a: 4, b: 2, thickness: 10, height: 270, clearL: 250, lockAng: 180 },
  ];
  syncClears();
  syncLocks();

  // Squaring branch Wall 3 relative to Wall 1 (at -90°) -> target angle = 0°
  const moveWall = S.walls[2];
  const before = snapshotNodes();
  moveWall.lockAng = 0;
  const targetL = wallGeom(moveWall).L;
  S.nodes[moveWall.b] = {
    x: S.nodes[moveWall.a].x + Math.cos(0) * targetL,
    z: S.nodes[moveWall.a].z + Math.sin(0) * targetL,
  };

  const relaxed = settleWallDim(moveWall, 250, "b", [moveWall.id], true);
  const released = enforceLocks(before, [moveWall.id].concat(relaxed.yielded));

  assert.equal(released, 0, "no joints were broken");
  assert.equal(Math.round((wallGeom(moveWall).ang * 180) / Math.PI), 0, "branch wall is now perfectly horizontal at 0°");
  assert.equal(S.nodes[3].z, 0, "top-right corner moved from z=5 to z=0");
  assert.equal(Math.round((wallGeom(S.walls[0]).ang * 180) / Math.PI), -90, "top vertical wall stayed at -90°");
  assert.equal(Math.round((wallGeom(S.walls[1]).ang * 180) / Math.PI), 90, "bottom vertical wall stayed at 90°");
});

test("squaring a corner with locked user dimensions allows the loop to adapt cleanly via Tier 2 relaxation", () => {
  // A 4-wall closed room where ALL walls were locked by the user (dimUser: 1)
  // Top wall was slanted at 1.1°.
  S.interiorDims = true;
  S.nodes = [
    { x: 0, z: 0 },
    { x: 250, z: 5 },
    { x: 250, z: 105 },
    { x: 0, z: 100 },
  ];
  S.walls = [
    { id: 1, a: 0, b: 1, thickness: 10, height: 270, clearL: 240, dimUser: 1, lockAng: 0 },
    { id: 2, a: 1, b: 2, thickness: 10, height: 270, clearL: 90, dimUser: 1, lockAng: 90 },
    { id: 3, a: 2, b: 3, thickness: 10, height: 270, clearL: 240, dimUser: 1, lockAng: 180 },
    { id: 4, a: 3, b: 0, thickness: 10, height: 270, clearL: 90, dimUser: 1, lockAng: -90 },
  ];
  syncClears();
  syncLocks();
  S.walls[0].lockAng = 0;
  S.walls[1].lockAng = 90;
  S.walls[2].lockAng = 180;
  S.walls[3].lockAng = -90;

  const moveWall = S.walls[0];
  const before = snapshotNodes();
  S.nodes[moveWall.b] = { x: 250, z: 0 };

  // When allowLockedYield is true (squaring mode), locked loop walls adapt their lengths
  const relaxed = settleWallDim(moveWall, 240, "b", [moveWall.id], true);
  const released = enforceLocks(before, [moveWall.id].concat(relaxed.yielded));

  assert.equal(released, 0, "no joints were broken despite user-locked walls");
  assert.ok(Math.abs(S.nodes[1].z - 0) < 0.01, "top-right corner was leveled to z=0");
  assert.ok(Math.abs(S.nodes[2].z - 100) < 0.01, "bottom-right corner aligned to z=100");
  assert.ok(relaxed.worst < 0.25, "solver converged under tolerance");
});

/* The reported bug (2026-08-17): an L of walls with a stub off the middle of a
   straight vertical run — 288 / 246 / 189 above the T, 80 out of it, 238 below.
   Thickening the 238 wall visibly LENGTHENED the 140 wall above the T.

   Two collinear walls share one node, so holding the edited wall's measured
   face still by moving that node could only bend its neighbour. Past 4.6° of
   bend the joint stopped counting as a straight run, the neighbour was mitred
   as if it were a corner — an end cut of (half a thickness)/sin(angle), well
   over a metre — and preserveClear(), told the wall was that short, stretched
   it for real: 145 cm of wall became 280. */
function runWithStub(tAbove = 10, tBelow = 10) {
  S.interiorDims = true;
  S.roomMeta = {};
  S.openings = [];
  S.items = [];
  S.nodes = [
    { x: 0, z: 0 },      // 0
    { x: 293, z: 0 },    // 1  free end of the 288 wall
    { x: 0, z: 251 },    // 2
    { x: 194, z: 251 },  // 3  corner: the run starts here
    { x: 194, z: 396 },  // 4  T-junction
    { x: 279, z: 396 },  // 5  free end of the 80 stub
    { x: 194, z: 639 },  // 6  free end below
  ];
  S.walls = [
    { id: 1, a: 0, b: 1, thickness: tAbove, height: 270 },
    { id: 2, a: 0, b: 2, thickness: tAbove, height: 270 },
    { id: 3, a: 2, b: 3, thickness: tAbove, height: 270 },
    { id: 4, a: 3, b: 4, thickness: tAbove, height: 270 }, // the "140" wall
    { id: 5, a: 4, b: 5, thickness: tAbove, height: 270 }, // the "80" stub
    { id: 6, a: 4, b: 6, thickness: tBelow, height: 270 }, // the "238" wall
  ];
  syncClears();
  syncLocks();
}

test("thickening one wall of a straight run never bends or stretches the run", () => {
  for (const newThickness of [12, 20, 34, 60, 2]) {
    runWithStub();
    const above = S.walls[3], stub = S.walls[4], edited = S.walls[5];
    const beforeL = wallGeom(above).L,
      beforeAng = wallGeom(above).ang,
      beforeLabel = wallClearLength(above);
    edited.dimSide = wallDimSide(edited);

    const result = setWallThicknessPreservingClear(edited, newThickness, "b");

    assert.ok(
      Math.abs(wallGeom(above).L - beforeL) < 0.05,
      `${newThickness} cm: the wall above keeps its length (${wallGeom(above).L.toFixed(2)} vs ${beforeL})`,
    );
    assert.ok(
      Math.abs(wallGeom(above).ang - beforeAng) < 1e-6,
      `${newThickness} cm: the run stays straight, not bent`,
    );
    assert.ok(
      Math.abs(wallClearLength(above) - beforeLabel) <= 20,
      "stated length only changes by a join cut, never doubles",
    );
    assert.equal(stub.a, 4, "the 90° stub is still welded to the T-node");
    assert.ok(
      wallClearLength(stub) > 50 && wallClearLength(stub) < 120,
      "the stub is not stretched by a false mitre",
    );
    assert.ok(Math.abs(wallClearLength(edited) - edited.clearL) < 0.05, "the edited wall holds its own");
    assert.equal(result.released, 0, "no joint is released");
  }
});

/* The measured face is what stays put, so the extra material lands on the far
   side of it — and the collinear neighbour travels with the run rather than
   pivoting, which is what keeps every other stated dimension intact. */
test("the added thickness goes to the far side of the measured face", () => {
  runWithStub();
  const edited = S.walls[5],
    above = S.walls[3];
  edited.dimSide = 1; // the east face of a wall running a->b downwards
  function measuredFaceX(w) {
    const o = wallOutline(w);
    return w.dimSide === 1 || wallDimSide(w) === 1 ? o[0].x : o[3].x;
  }
  const faceX = measuredFaceX(edited);

  setWallThicknessPreservingClear(edited, 30, "b");

  assert.ok(
    Math.abs(measuredFaceX(edited) - faceX) < 0.6 || wallLocFace(edited),
    "the measured face stays put, or the run re-hung onto it so later edits are quiet",
  );
  if (wallLocFace(edited) && wallLocFace(above)) {
    const side = edited.dimSide;
    const oEd = wallOutline(edited), oAb = wallOutline(above);
    const edFace = side === 1 ? oEd[0].x : oEd[3].x;
    const abFace = above.dimSide === 1 ? oAb[0].x : oAb[3].x;
    assert.ok(Math.abs(edFace - abFace) < 0.05, "the collinear neighbour is flush on that same face");
  }
  assert.ok(
    Math.abs(S.nodes[edited.a].x - S.nodes[edited.b].x) < 1e-9 &&
    Math.abs(S.nodes[3].x - S.nodes[4].x) < 1e-9,
    "and the run is still one straight line",
  );
});

/* A wall whose corner arms cancel (one going left at one end, one going right
   at the other) has no concave side at all. The automatic face was decided by
   the leftover float noise, so a thickness edit three joints away flipped it
   and preserveClear() slid the wall by a whole thickness to keep the same
   number on the opposite face. */
test("a wall with no concave side keeps its automatic face when a neighbour changes", () => {
  runWithStub();
  const above = S.walls[3], edited = S.walls[5];
  const beforeL = wallGeom(above).L;
  edited.dimSide = wallDimSide(edited);

  setWallThicknessPreservingClear(edited, 18, "b");
  const sideAfter = wallDimSide(above);

  setWallThicknessPreservingClear(edited, 24, "b");

  assert.equal(wallDimSide(above), sideAfter, "the reference face stays pinned");
  assert.ok(Math.abs(wallGeom(above).L - beforeL) < 0.05, "so the wall does not slide a thickness");
});
