import test from "node:test";
import { moduleSource } from "./helpers/module_source.mjs";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { S } from "../js/state.js";
import {
  wallOutline,
  wallBandOutline,
  tJoinStep,
  wallClearLength,
  equalWallAngleTranslation,
  wallAnglePair,
  wallJoinRole,
  straightThroughAt,
  wallCuts,
  wallGeom,
  faceShiftAt,
  wallSolidAtNode,
  wallSolidTop,
  openingAtWallPosition,
} from "../js/geometry.js";

// the unit direction a wall leaves `node` in — what both the mitre and the 3D
// end cut are asked about
function dirFrom(w, node) {
  var a = S.nodes[node],
    b = S.nodes[w.a === node ? w.b : w.a],
    L = Math.hypot(b.x - a.x, b.z - a.z);
  return { ux: (b.x - a.x) / L, uz: (b.z - a.z) / L };
}

/* A joint is closed when the two walls hand each other the SAME two corner
   points. A square corner always did; an oblique one used to leave a wedge of
   daylight on the outside and a lump on the inside, because both walls ended
   square across their own direction. */
function plan(nodes, walls) {
  S.nodes.length = 0;
  S.walls.length = 0;
  S.items && (S.items.length = 0);
  S.rooms && (S.rooms.length = 0);
  nodes.forEach((n) => S.nodes.push(n));
  walls.forEach((w, i) =>
    S.walls.push({ id: i + 1, a: w[0], b: w[1], thickness: w[2] || 20, height: 260 }),
  );
}
function near(a, b, tol = 0.01) {
  return Math.abs(a.x - b.x) < tol && Math.abs(a.z - b.z) < tol;
}
// the two outlines share a full edge: every corner of one meets one of the other
function jointClosed(o1, o2) {
  var shared = 0;
  o1.forEach((p) => {
    if (o2.some((q) => near(p, q))) shared++;
  });
  return shared;
}

test("an oblique corner mitres closed instead of leaving a wedge", () => {
  S.interiorDims = true;
  plan(
    [
      { x: -200, z: 0 },
      { x: 100, z: 0 },
      { x: 300, z: 200 },
    ],
    [
      [0, 1],
      [1, 2],
    ],
  );
  var o1 = wallOutline(S.walls[0]),
    o2 = wallOutline(S.walls[1]);
  assert.equal(jointClosed(o1, o2), 2, "the 45-degree joint shares both corners");
  // 20 cm walls at 45 degrees: the mitre point sits 10*tan(22.5) in from the node
  var inner = o1.find((p) => Math.abs(p.z - 10) < 0.01 && p.x > 0);
  assert.ok(Math.abs(inner.x - (100 - 10 * Math.tan(Math.PI / 8))) < 0.01);
});

test("square corners and their clear lengths are unchanged", () => {
  S.interiorDims = true;
  plan(
    [
      { x: 0, z: 0 },
      { x: 400, z: 0 },
      { x: 400, z: 300 },
      { x: 0, z: 300 },
    ],
    [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 0],
    ],
  );
  assert.equal(wallClearLength(S.walls[0]), 380);
  assert.equal(wallClearLength(S.walls[1]), 280);
  S.walls.forEach((w, i) => {
    var next = S.walls[(i + 1) % 4];
    assert.equal(jointClosed(wallOutline(w), wallOutline(next)), 2);
  });
});

test("a free end stays square and a split wall is not a corner", () => {
  S.interiorDims = true;
  plan(
    [
      { x: 0, z: 0 },
      { x: 200, z: 0 },
      { x: 400, z: 0 },
    ],
    [
      [0, 1],
      [1, 2],
    ],
  );
  var o = wallOutline(S.walls[0]);
  assert.ok(o.every((p) => Math.abs(p.x - 0) < 0.01 || Math.abs(p.x - 200) < 0.01));
});

/* Two walls drawn end to end are one straight run, so neither end is mitred —
   which means the 3D builder's plain end cut is the only thing closing the
   joint and it has to land on the shared node. It used to cut each wall back by
   the OTHER one's half thickness, which only cancels while both are equally
   thick: 12 cm meeting 14 cm left a 1 cm slot straight through the wall. */
test("a straight run of unequal walls is not a corner at either end", () => {
  plan(
    [
      { x: 0, z: 0 },
      { x: 200, z: 0 },
      { x: 400, z: 0 },
    ],
    [
      [0, 1, 14],
      [1, 2, 20],
    ],
  );
  var thin = S.walls[0],
    thick = S.walls[1];
  assert.ok(straightThroughAt(1, dirFrom(thin, 1).ux, dirFrom(thin, 1).uz, thin));
  assert.ok(straightThroughAt(1, dirFrom(thick, 1).ux, dirFrom(thick, 1).uz, thick));
  // ...and the outlines still hand each other the shared node's two corners,
  // each on its own thickness, so the step sits exactly at the node
  assert.ok(wallOutline(thin).filter((p) => Math.abs(p.x - 200) < 0.01).length === 2);
  assert.ok(wallOutline(thick).filter((p) => Math.abs(p.x - 200) < 0.01).length === 2);
  // a real corner at the same node is still a corner
  plan(
    [
      { x: 0, z: 0 },
      { x: 200, z: 0 },
      { x: 200, z: 300 },
    ],
    [
      [0, 1, 14],
      [1, 2, 20],
    ],
  );
  var w = S.walls[0];
  assert.equal(straightThroughAt(1, dirFrom(w, 1).ux, dirFrom(w, 1).uz, w), false);
});

/* Open a segment in a wall, then draw off the upper jamb, along, and back to
   the lower one to close the space the opening made. Landing on both jambs
   splits the host there, so the middle wall IS the passage — it draws nothing.
   That ghost used to still count as a straight-through arm at each jamb node,
   so the stub beside it was told "not a corner": the drawn wall butted into a
   face that was never built and half its end hung into the empty doorway. */
test("walls drawn off the jambs of an opened segment mitre with the stubs", () => {
  plan(
    [
      { x: 0, z: 0 }, // 0  host wall start
      { x: 0, z: 42 }, // 1  upper jamb
      { x: 0, z: 128 }, // 2  lower jamb
      { x: 0, z: 168 }, // 3  host wall end
      { x: 100, z: 42 }, // 4
      { x: 100, z: 128 }, // 5
    ],
    [
      [0, 1, 12], // 1 stub above the opening
      [1, 2, 12], // 2 the segment the passage consumed entirely
      [2, 3, 12], // 3 stub below
      [1, 4, 12], // 4 drawn out of the upper jamb
      [4, 5, 12], // 5 drawn along
      [5, 2, 12], // 6 drawn back to the lower jamb
    ],
  );
  S.openings = [
    { id: 1, wall: 2, s: 43, width: 86, height: 260, sill: 0, type: "passage" },
  ];
  var stub = S.walls[0],
    ghost = S.walls[1],
    drawn = S.walls[3];
  assert.equal(wallSolidAtNode(ghost, 1), false, "the consumed segment is not an arm");
  assert.equal(wallSolidAtNode(stub, 1), true, "the stub beside it still is");
  assert.equal(
    jointClosed(wallOutline(stub), wallOutline(drawn)),
    2,
    "the jamb is an ordinary mitred corner, not a butt joint into a missing face",
  );
  // the corner closes on the far face and opens on the near one, like every L
  assert.ok(wallOutline(stub).some((p) => near(p, { x: -6, z: 48 })));
  assert.ok(wallOutline(stub).some((p) => near(p, { x: 6, z: 36 })));
  // a window at the same place leaves wall above and below, so it stays a T
  S.openings = [
    { id: 1, wall: 2, s: 43, width: 86, height: 120, sill: 90, type: "window" },
  ];
  assert.equal(wallSolidAtNode(ghost, 1), true);
  S.openings = [];
});

/* The same bay drawn with FACE snapping (js/interaction.js, the jamb block):
   each landing sits half a new-wall thickness back into the solid side, so the
   host keeps a short solid piece either side of the passage, the joints are
   plain Ts, and the drawn walls' own faces continue the reveal. The number that
   has to survive is the one the user opened: 86 in, 86 through. */
test("a bay drawn off both jambs leaves the opening's clear width alone", () => {
  plan(
    [
      { x: 0, z: 0 }, // 0
      { x: 0, z: 159 }, // 1  jamb 164 backed off by WALL_T/2
      { x: 0, z: 255 }, // 2  jamb 250 backed off by WALL_T/2
      { x: 0, z: 295 }, // 3
      { x: 221, z: 159 }, // 4
      { x: 221, z: 255 }, // 5
    ],
    [
      [0, 1, 12],
      [1, 2, 12], // host segment carrying the passage
      [2, 3, 12],
      [1, 4, 10], // drawn walls use the new-wall thickness
      [4, 5, 10],
      [5, 2, 10],
    ],
  );
  // the passage still spans 164..250 of the host — i.e. 5..91 of this segment
  S.openings = [
    { id: 1, wall: 2, s: 48, width: 86, height: 260, sill: 0, type: "passage" },
  ];
  var host = S.walls[1],
    top = S.walls[3],
    bottom = S.walls[5];
  // solid host either side of the reveal, so each jamb is a plain T
  assert.equal(wallSolidAtNode(host, 1), true);
  assert.equal(wallSolidAtNode(host, 2), true);
  // and each drawn wall's inner face lands ON the reveal, not inside it
  var inner = (w, z) =>
    wallOutline(w).filter((p) => Math.abs(p.z - z) < 0.01).length === 2;
  assert.ok(inner(top, 164), "the top wall's face continues the 164 reveal");
  assert.ok(inner(bottom, 250), "the bottom wall's face continues the 250 reveal");
  S.openings = [];
});

test("a T-junction keeps its straight-through run square", () => {
  plan(
    [
      { x: 0, z: -100 },
      { x: 0, z: 0 },
      { x: 0, z: 100 },
      { x: 100, z: 0 },
    ],
    [
      [0, 1],
      [1, 2],
      [1, 3],
    ],
  );
  var upper = wallOutline(S.walls[0]),
    lower = wallOutline(S.walls[1]),
    branch = wallOutline(S.walls[2]);
  assert.ok(
    upper.every((p) => Math.abs(p.z + 100) < 0.01 || Math.abs(p.z) < 0.01),
    "the first half ends square at the shared centre",
  );
  assert.ok(
    lower.every((p) => Math.abs(p.z - 100) < 0.01 || Math.abs(p.z) < 0.01),
    "the continuation starts square instead of growing a triangular spike",
  );
  assert.ok(
    branch.every((p) => Math.abs(p.x - 10) < 0.01 || Math.abs(p.x - 100) < 0.01),
    "the branch butts into the outside face of the through wall",
  );
  assert.equal(wallJoinRole(S.walls[0], 1), "continuation");
  assert.equal(wallJoinRole(S.walls[1], 1), "continuation");
  assert.equal(wallJoinRole(S.walls[2], 1), "branch");
});

test("join roles do not depend on which wall was created first", () => {
  plan(
    [
      { x: 100, z: 0 },
      { x: 0, z: 0 },
      { x: 0, z: -100 },
      { x: 0, z: 100 },
    ],
    [
      [1, 0], // branch deliberately has the lowest id
      [2, 1],
      [1, 3],
    ],
  );
  assert.equal(wallJoinRole(S.walls[0], 1), "branch");
  assert.equal(wallJoinRole(S.walls[1], 1), "continuation");
  assert.equal(wallJoinRole(S.walls[2], 1), "continuation");
});

test("an opening span is empty while its jambs remain valid wall points", () => {
  plan(
    [{ x: 0, z: 0 }, { x: 300, z: 0 }],
    [[0, 1]],
  );
  S.openings = [{ id: 9, type: "door", wall: 1, s: 150, width: 90 }];
  var w = S.walls[0];
  assert.equal(openingAtWallPosition(w, 150).id, 9);
  assert.equal(openingAtWallPosition(w, 106).id, 9);
  assert.equal(openingAtWallPosition(w, 105), null, "the jamb itself is solid");
  assert.equal(openingAtWallPosition(w, 195), null, "the far jamb itself is solid");
});

test("a cut-corner wall projects to the nearest equal-end-angle translation", () => {
  plan(
    [
      { x: 0, z: 100 },
      { x: 100, z: 100 },
      { x: 200, z: 0 },
      { x: 200, z: -100 },
    ],
    [
      [0, 1],
      [1, 2],
      [2, 3],
    ],
  );
  var w = S.walls[1],
    base = { a: { ...S.nodes[w.a] }, b: { ...S.nodes[w.b] } },
    solved = equalWallAngleTranslation(w, base, 8, 3);
  assert.ok(solved);
  assert.ok(Math.abs(solved.dx - solved.dz) < 0.001, "equal angles lie on the symmetric diagonal");
  assert.ok(solved.correction < 4, "the weak snap uses the nearby solution");
  assert.ok(Math.abs(solved.rawA - solved.rawB) > 2, "the unsnapped drag was visibly asymmetric");
});

test("equal-angle snapping is offered only with one neighbour at each end", () => {
  plan(
    [
      { x: 0, z: 0 },
      { x: 100, z: 0 },
      { x: 200, z: 0 },
      { x: 100, z: 100 },
      { x: 200, z: 100 },
    ],
    [
      [0, 1],
      [1, 2],
      [1, 3],
      [2, 4],
    ],
  );
  assert.equal(wallAnglePair(S.walls[1]), null, "a three-arm end is not a cut corner");
});

/* A shallow joint mitres to a spike longer than the wall it belongs to. The
   OUTLINE has always cut that square (clampShift), but wallCuts() handed the
   same unbounded number to the dimension layer, so a 30 cm wall was measured as
   if 48 cm of it had been eaten by the corner — and preserveClear(), told the
   wall was that short, stretched the geometry for real. The measurement now
   describes the wall that is drawn. */
test("an end cut can never eat more than the wall it is measured on", () => {
  const r = (6 * Math.PI) / 180; // 6° off straight: past the straight-run band
  for (const side of [1, -1]) {
    plan(
      [
        { x: 0, z: 0 },
        { x: 30, z: 0 },
        { x: 30 + Math.cos(r) * 300, z: Math.sin(r) * 300 },
      ],
      [
        [0, 1, 10],
        [1, 2, 34], // unequal thicknesses: both mitre roots run away together
      ],
    );
    const stub = S.walls[0],
      L = 30;
    stub.dimSide = side;
    const g = wallGeom(stub),
      raw = faceShiftAt(stub.b, -g.ux, -g.uz, -side, stub, 5),
      cut = wallCuts(stub).b;

    assert.ok(Math.abs(raw) > 100, "the unbounded mitre really is metres long here");
    assert.ok(Math.abs(cut) <= L, `end cut ${cut.toFixed(1)} stays inside the wall`);
    assert.ok(wallClearLength(stub) >= 0, "the wall never measures negative");
    // and the number agrees with the polygon the plan actually fills
    const o = wallOutline(stub),
      face = side === 1 ? [o[0], o[1]] : [o[3], o[2]],
      drawn = Math.hypot(face[1].x - face[0].x, face[1].z - face[0].z);
    assert.ok(
      Math.abs(wallClearLength(stub) - drawn) < 0.3,
      `stated ${wallClearLength(stub).toFixed(2)} matches the drawn face ${drawn.toFixed(2)}`,
    );
  }
});

test("a thickness band's outer edges are the mitred outline", () => {
  plan(
    [
      { x: 0, z: 0 },
      { x: 400, z: 0 },
      { x: 400, z: 300 },
    ],
    [
      [0, 1],
      [1, 2],
    ],
  );
  var w = S.walls[0],
    o = wallOutline(w),
    b = wallBandOutline(w, -10, 10);
  assert.ok(b, "straight walls have a mitred band");
  assert.ok(near(b.a1, o[0]) && near(b.b1, o[1]) && near(b.b0, o[2]) && near(b.a0, o[3]));
});

test("a full wall above a half-wall cap is not mitred by the half wall", () => {
  S.interiorDims = true;
  S.openings = [];
  S.nodes = [{ x: 0, z: 0 }, { x: 200, z: 0 }, { x: 200, z: 200 }];
  S.walls = [
    { id: 1, a: 0, b: 1, thickness: 20, height: 270, kind: "normal" },
    { id: 2, a: 1, b: 2, thickness: 20, height: 110, kind: "half", halfHeight: 110 },
  ];
  var full = S.walls[0], half = S.walls[1];
  assert.equal(wallSolidTop(half), 110);
  assert.equal(wallSolidAtNode(half, 1, 0), true, "the half wall is an arm at floor level");
  assert.equal(wallSolidAtNode(half, 1, 110), false, "and is gone above its cap");
  var low = wallOutline(full, 0),
    high = wallOutline(full, 200);
  assert.ok(
    low.filter((p) => Math.abs(p.x - 200) < 0.01).length < 2,
    "below the cap the full wall still mitres against the half wall",
  );
  assert.ok(
    high.filter((p) => Math.abs(p.x - 200) < 0.01).length === 2,
    "above the cap the full wall ends square at the shared node",
  );
  assert.equal(jointClosed(low, wallOutline(half)), 2, "the overlapping height still shares both corners");
});

test("a 90° branch still meets a face-located through-run of mixed thickness", () => {
  S.interiorDims = true;
  S.openings = [];
  S.nodes = [
    { x: 0, z: 0 },
    { x: 0, z: 200 },
    { x: 0, z: 500 },
    { x: 200, z: 200 },
  ];
  S.walls = [
    { id: 1, a: 0, b: 1, thickness: 10, height: 270, dimSide: 1, loc: "face" },
    { id: 2, a: 1, b: 2, thickness: 20, height: 270, dimSide: 1, loc: "face" },
    { id: 3, a: 1, b: 3, thickness: 16, height: 270 },
  ];
  var thin = wallOutline(S.walls[0]),
    thick = wallOutline(S.walls[1]),
    branch = wallOutline(S.walls[2]),
    step = tJoinStep(S.walls[2], "a");
  assert.ok(step, "the branch sees the thickness step");
  assert.ok(Math.abs(step.tp - 20) < 0.05 && Math.abs(step.tm - 10) < 0.05);
  assert.ok(near(step.plusJoint, { x: 20, z: 200 }), "step lands on the thick outer face at the node");
  assert.ok(near(step.minusJoint, { x: 10, z: 200 }), "and on the thin outer face at the node");
  assert.ok(
    branch.some((p) => near(p, step.plusJoint)) && branch.some((p) => near(p, step.minusJoint)),
    "the branch outline includes the step instead of shearing across it",
  );
  assert.ok(thin.some((p) => near(p, step.minusJoint)), "thin wall shares the step corner");
  assert.ok(thick.some((p) => near(p, step.plusJoint)), "thick wall shares the other step corner");
});

test("a 90° branch hung against an interior-face through-run has no gap", () => {
  S.interiorDims = true;
  S.openings = [];
  S.nodes = [
    { x: 0, z: 0 },
    { x: 0, z: 200 },
    { x: 0, z: 500 },
    { x: 200, z: 200 },
  ];
  S.walls = [
    { id: 1, a: 0, b: 1, thickness: 10, height: 270, dimSide: -1, loc: "face" },
    { id: 2, a: 1, b: 2, thickness: 20, height: 270, dimSide: -1, loc: "face" },
    { id: 3, a: 1, b: 3, thickness: 16, height: 270 },
  ];
  var thin = wallOutline(S.walls[0]),
    thick = wallOutline(S.walls[1]),
    branch = wallOutline(S.walls[2]);
  assert.ok(Math.abs(wallCuts(S.walls[2]).a) < 0.5, "the branch reaches the shared node");
  assert.ok(
    branch.some((p) => Math.abs(p.x) < 0.05) &&
      thin.some((p) => Math.abs(p.x) < 0.05) &&
      thick.some((p) => Math.abs(p.x) < 0.05),
    "branch and through-run share the interior plane",
  );
});

test("3D T-branch ends use the through-run's near face, not half its thickness", async () => {
  const src = moduleSource("js/view3d.js");
  assert.match(src, /wallJoinRole\(w, nodeId\) === "branch"/,
    "a T-branch is cut with the join role, not the L-corner fallback");
  assert.match(src, /faceShiftAt\(nodeId, bx, bz/,
    "the cut is the adjoining face, so hanging the run on its interior cannot open a gap");
});

test("a centreline T of mixed thickness also follows the step", () => {
  S.interiorDims = true;
  S.openings = [];
  S.nodes = [
    { x: 0, z: 0 },
    { x: 0, z: 200 },
    { x: 0, z: 500 },
    { x: 200, z: 200 },
  ];
  S.walls = [
    { id: 1, a: 0, b: 1, thickness: 10, height: 270 },
    { id: 2, a: 1, b: 2, thickness: 20, height: 270 },
    { id: 3, a: 1, b: 3, thickness: 16, height: 270 },
  ];
  var step = tJoinStep(S.walls[2], "a"),
    branch = wallOutline(S.walls[2]);
  assert.ok(step, "unequal through-walls are a step even on the centreline");
  assert.ok(
    branch.some((p) => near(p, step.plusJoint)) && branch.some((p) => near(p, step.minusJoint)),
    "the branch fill follows the step",
  );
});

test("sampled 3D walls mitre with the same outline the plan uses", async () => {
  const src = moduleSource("js/view3d.js");
  assert.match(src, /wallBandOutline/, "half / pony / railing walls take their end cuts from the mitred band");
  assert.match(src, /hasHeightMismatchedJoin/, "a full wall meeting a half wall is split at the cap");
  const plan = moduleSource("js/plan2d.js");
  assert.match(plan, /wallBandOutline/, "plan layer fills use the same mitred band");
});
