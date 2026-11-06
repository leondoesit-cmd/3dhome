import test from "node:test";
import { moduleSource } from "./helpers/module_source.mjs";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { S } from "../js/state.js";
import { wallFraming } from "../js/wall_framing.js";
import {
  wallGeom,
  wallNodeGeom,
  wallOffset,
  wallLocFace,
  wallOutline,
  wallCuts,
  wallClearLength,
  wallDimSide,
  wallPointAt,
  wallProject,
  setWallEnd,
  detectRooms,
} from "../js/geometry.js";
import {
  syncClears,
  syncLocks,
  fitWallClearLength,
  setWallThicknessPreservingClear,
  setWallReference,
  hangStraightRunOnFace,
  canWeld,
} from "../js/constraint_engine.js";
/* `S.nodes` stores a wall's LOCATION LINE. `w.loc: "face"` says that line is the
   face named by "Measured along" instead of the centreline — the only way two
   collinear walls of different thickness can join flush, because they meet at
   one node and a shared node line is the only thing they can share. */

// a straight vertical run: thin above, thick below, sharing node 1
function run(loc, tAbove = 10, tBelow = 34) {
  S.interiorDims = true;
  S.roomMeta = {};
  S.openings = [];
  S.items = [];
  S.nodes = [{ x: 100, z: 0 }, { x: 100, z: 200 }, { x: 100, z: 500 }];
  S.walls = [
    { id: 1, a: 0, b: 1, thickness: tAbove, height: 270, dimSide: 1, loc },
    { id: 2, a: 1, b: 2, thickness: tBelow, height: 270, dimSide: 1, loc },
  ];
  syncClears();
  syncLocks();
}
// the x of a wall's face on `side`, read off the polygon the plan fills
function faceX(w, side) {
  const o = wallOutline(w);
  return side === 1 ? o[0].x : o[3].x;
}

test("the default location line is the centreline, exactly as before", () => {
  run(undefined);
  S.walls.forEach((w) => {
    assert.equal(wallLocFace(w), false);
    assert.equal(wallOffset(w), 0);
    assert.deepEqual(wallGeom(w).a, wallNodeGeom(w).a, "no offset, so one line");
  });
  // unequal thicknesses step half and half about the shared node line
  assert.equal(faceX(S.walls[0], 1), 95);
  assert.equal(faceX(S.walls[1], 1), 83);
});

test("a run hung on its measured face is FLUSH there, with the whole step on the far side", () => {
  run("face");
  const [thin, thick] = S.walls;

  assert.equal(faceX(thin, 1), 100, "the thin wall's measured face is the node line");
  assert.equal(faceX(thick, 1), 100, "and so is the thick one's — one straight line");
  assert.equal(
    Math.abs(faceX(thick, -1) - faceX(thin, -1)),
    thick.thickness - thin.thickness,
    "the entire difference in thickness lands on the opposite face",
  );
  // and nothing about the wall itself changed: same length, same bearing
  assert.equal(wallGeom(thin).L, 200);
  assert.equal(wallGeom(thin).ang, wallNodeGeom(thin).ang);
  assert.equal(wallClearLength(thin), 200);
  assert.equal(wallClearLength(thick), 300);
});

test("thickening a face-located wall moves no node at all", () => {
  run("face");
  const before = JSON.stringify(S.nodes);

  const result = setWallThicknessPreservingClear(S.walls[1], 50, "b");

  assert.equal(JSON.stringify(S.nodes), before, "the node graph is untouched");
  assert.equal(result.released, 0);
  assert.equal(wallClearLength(S.walls[0]), 200, "the wall above keeps its number");
  assert.equal(wallClearLength(S.walls[1]), 300, "and so does the edited wall");
  assert.equal(faceX(S.walls[0], 1), 100, "the run is still flush");
  assert.equal(faceX(S.walls[1], 1), 100);
});

/* An offset is a lateral translation, so a face-located wall's own line is half
   a thickness away from the node the graph stores. Any writer that reads
   wallGeom() and assigns straight into S.nodes bakes that offset in and slides
   the wall again on every following edit — which is why setWallEnd() exists. */
test("repeated dimension fitting cannot drift a face-located wall", () => {
  run("face");
  const w = S.walls[0],
    node = JSON.stringify(S.nodes[w.b]);

  for (let i = 0; i < 8; i++) fitWallClearLength(w, w.clearL, "b");

  assert.equal(JSON.stringify(S.nodes[w.b]), node, "eight fits, no drift");
  assert.equal(wallClearLength(w), 200);
});

test("setWallEnd takes a point on the wall's own line and stores the node", () => {
  run("face");
  const w = S.walls[0],
    g = wallGeom(w);

  setWallEnd(w, "b", { x: g.b.x, z: 260 });

  assert.equal(S.nodes[w.b].x, 100, "the node stays on the location line");
  assert.equal(wallGeom(w).b.z, 260, "and the wall's own end is where it was asked for");
});

/* At a corner where both walls are hung on their inside face, that face passes
   through the shared node for both — so the inside of the corner IS the node,
   the outside mitres to the outer intersection, and the stated length of each
   wall is simply the node-to-node distance. */
test("an inside corner of face-located walls closes on the node itself", () => {
  S.interiorDims = true;
  S.roomMeta = {};
  S.openings = [];
  S.items = [];
  S.nodes = [{ x: 0, z: 0 }, { x: 300, z: 0 }, { x: 300, z: 200 }];
  S.walls = [
    { id: 1, a: 0, b: 1, thickness: 10, height: 270, dimSide: 1, loc: "face" },
    { id: 2, a: 1, b: 2, thickness: 20, height: 270, dimSide: 1, loc: "face" },
  ];
  syncClears();
  syncLocks();
  const o1 = wallOutline(S.walls[0]),
    o2 = wallOutline(S.walls[1]);

  const shared = o1.filter((p) =>
    o2.some((q) => Math.abs(p.x - q.x) < 0.02 && Math.abs(p.z - q.z) < 0.02),
  ).length;
  assert.equal(shared, 2, "the joint still hands over both corner points");
  assert.ok(o1.some((p) => Math.abs(p.x - 300) < 0.02 && Math.abs(p.z) < 0.02),
    "the inside corner sits exactly on the node");
  assert.ok(o1.some((p) => Math.abs(p.x - 320) < 0.02 && Math.abs(p.z + 10) < 0.02),
    "the outside faces mitre to their own intersection");
  assert.equal(wallClearLength(S.walls[0]), 300, "so the stated length is node to node");
  assert.equal(wallClearLength(S.walls[1]), 200);
});

test("everything measured along a wall follows its own line, not the node line", () => {
  run("face");
  const w = S.walls[0];

  // a door at s=0 sits on the wall, not half a thickness beside it
  assert.equal(wallPointAt(w, 0).x, 105);
  assert.equal(wallPointAt(w, 0).z, 0);
  // ...and the cursor lands on the wall where it is drawn
  assert.ok(wallProject(w, 105, 100).distance < 0.01, "a point on the wall projects onto it");
  assert.ok(wallProject(w, 100, 100).distance > 4, "the node line is at its face, 5 cm away");
  assert.equal(wallCuts(w).a, 0, "a free end is square on either line");
});

test("a room bounded by face-located walls encloses what those walls enclose", () => {
  S.interiorDims = true;
  S.roomMeta = {};
  S.openings = [];
  S.items = [];
  S.nodes = [{ x: 0, z: 0 }, { x: 400, z: 0 }, { x: 400, z: 300 }, { x: 0, z: 300 }];
  S.walls = [1, 2, 3, 4].map((id, i) => ({
    id,
    a: i,
    b: (i + 1) % 4,
    thickness: 20,
    height: 270,
  }));
  syncClears();
  syncLocks();
  const centred = detectRooms()[0];
  assert.ok(centred, "the centreline room is found");
  assert.ok(
    Math.abs(Math.abs(centred.area) - 400 * 300) < 1,
    "a room is sampled along its walls' own lines, which here are the node lines",
  );

  /* Hang all four on the face turned INTO the room. The node rectangle is now
     the room's inside outline, so every centreline moves half a thickness
     outward and the polygon — still the walls' own lines, so the floor still
     tucks under them — grows by one thickness in each direction. The cache key
     has to notice that, because not one node moved. */
  S.walls.forEach((w) => {
    w.dimSide = 1;
    w.loc = "face";
  });
  const inner = detectRooms()[0];
  assert.ok(inner, "and so is the face-located one");
  /* 420x320 less the four corner steps: consecutive walls' own lines no longer
     meet at a point, so each corner is a 10x10 step and gives up half of it.
     That step is the truth of the model, not an approximation of a mitre. */
  const step = 4 * (20 / 2) * (20 / 2) / 2;
  assert.ok(
    Math.abs(Math.abs(inner.area) - (420 * 320 - step)) < 1,
    `the room followed the re-hung walls, got ${Math.abs(inner.area).toFixed(0)}`,
  );
  assert.equal(inner.pts.length, 8, "and it is honestly eight corners now");
});

/* "face" needs a face to hang on, and an arc cannot be offset by translating it
   (the radius changes), so both cases fall back to the centreline rather than
   producing a wall that is somewhere else than the model thinks. */
test("a centreline dimension and a curved wall cannot be hung on a face", () => {
  run("face");
  const w = S.walls[0];
  w.dimSide = 0;
  assert.equal(wallLocFace(w), false, "there is no face to hang on");
  assert.equal(wallOffset(w), 0);

  w.dimSide = 1;
  w.geometry = { kind: "arc", bulge: 0.4 };
  assert.equal(wallGeom(w).kind, "arc");
  assert.equal(wallLocFace(w), false, "an arc keeps the centreline");
  assert.equal(wallOffset(w), 0);
  delete w.geometry;
});

test("the location line survives a save and a wall split", async () => {
  const ui = moduleSource("js/ui.js");
  assert.match(ui, /loc: w\.loc === "face" \|\| w\.loc === "center" \? w\.loc : undefined/,
    "applyData's wall whitelist carries it");
  const interaction = moduleSource("js/interaction.js");
  assert.match(interaction, /"dimSide", "loc"\]/,
    "and so does the field list splitWallAt copies to the new half");
});

/* Switching the stored line is a statement about the MODEL, not an edit to the
   building, so the shared corner is what holds still and the wall re-hangs on
   it. Holding the body still instead would move the node — dragging every
   neighbour on it, and on a run dragging the very wall being lined up with. */
test("re-hanging a wall keeps the corner and re-reads what the neighbours measure", () => {
  run(undefined);
  const [thin, thick] = S.walls,
    corner = JSON.stringify(S.nodes[1]);

  setWallReference(thick, { loc: "face" });

  assert.equal(JSON.stringify(S.nodes[1]), corner, "the shared corner did not move");
  assert.equal(thick.loc, "face");
  assert.equal(faceX(thick, 1), 100, "the wall re-hung: its measured face is the node line");
  assert.equal(faceX(thin, 1), 95, "the other wall is untouched");
  // every wall at that corner now measures something new, and says so
  S.walls.forEach((w) => {
    assert.ok(Math.abs(w.clearL - wallClearLength(w)) < 0.01,
      `wall ${w.id} states what it measures`);
  });

  // ...and back again
  setWallReference(thick, { loc: "center" });
  assert.equal(thick.loc, "center");
  assert.equal(faceX(thick, 1), 83);
  assert.equal(JSON.stringify(S.nodes[1]), corner);
});

test("hanging a wall on a face resolves Auto instead of storing a centreline", () => {
  run(undefined);
  const w = S.walls[0];
  delete w.dimSide; // Auto

  setWallReference(w, { loc: "face" });

  assert.ok(w.dimSide === 1 || w.dimSide === -1, "Auto was resolved to a real face");
  assert.equal(wallLocFace(w), true);

  w.dimSide = 0; // and a centreline dimension can never be the stored line
  setWallReference(w, { loc: "face" });
  assert.ok(w.dimSide === 1 || w.dimSide === -1, "a centreline pick is replaced, not hung on");
});

/* The plan's "whole run" button: every member takes the face on the same
   PHYSICAL side, which for a wall drawn in the opposite direction is the
   opposite dimSide. Getting that wrong flushes one wall and flips the other. */
test("a run drawn in opposite directions still flushes on one side", () => {
  S.interiorDims = true;
  S.roomMeta = {};
  S.openings = [];
  S.items = [];
  S.nodes = [{ x: 100, z: 0 }, { x: 100, z: 200 }, { x: 100, z: 500 }];
  S.walls = [
    { id: 1, a: 0, b: 1, thickness: 10, height: 270, dimSide: 1 },
    { id: 2, a: 2, b: 1, thickness: 34, height: 270 }, // drawn upwards
  ];
  syncClears();
  syncLocks();
  const side = 1;
  S.walls.forEach((ow) => {
    const og = wallGeom(ow),
      g = wallGeom(S.walls[0]),
      same = og.ux * g.ux + og.uz * g.uz >= 0;
    setWallReference(ow, { dimSide: same ? side : -side, loc: "face" });
  });

  assert.equal(faceX(S.walls[0], 1), 100);
  assert.equal(faceX(S.walls[1], -1), 100, "the reversed wall hangs on the same physical face");
});

/* weldCoincidentNodes() merges corners within 2 cm, and a face-located wall's
   node is deliberately half a thickness away from a centred neighbour's. The
   existing guard already covers it — a weld that would change a locked wall's
   measurements is refused — but it is worth pinning, because the whole feature
   depends on those two nodes being allowed to stay apart. */
test("a face-located wall's corner is not silently welded to a nearby one", () => {
  S.interiorDims = true;
  S.roomMeta = {};
  S.openings = [];
  S.items = [];
  S.nodes = [{ x: 0, z: 0 }, { x: 300, z: 0 }, { x: 301.5, z: 0 }, { x: 301.5, z: 200 }];
  S.walls = [
    { id: 1, a: 0, b: 1, thickness: 10, height: 270, dimSide: 1, loc: "face" },
    { id: 2, a: 2, b: 3, thickness: 10, height: 270 },
  ];
  syncClears();
  syncLocks();

  assert.equal(canWeld(1, 2), false, "1.5 cm apart, and both walls state a length");
});

/* Framing is real timber, so it has to stand on the wall's own line rather than
   on the node line the graph keeps. wall_framing.js is written as a pure
   function over a passed-in state, hence wallAxisNodes(wall, nodes). */
test("framing members stand on the wall's own line", () => {
  S.interiorDims = true;
  S.roomMeta = {};
  S.openings = [];
  S.items = [];
  S.nodes = [{ x: 0, z: 0 }, { x: 300, z: 0 }];
  S.wallTypes = [{
    id: "framed",
    name: "Framed wall",
    layers: [{
      id: "frame",
      role: "core",
      main: true,
      thickness: 12,
      material: "cavity",
      framing: { material: "timber", spacing: 60, studWidth: 5, plateHeight: 5 },
    }],
  }];
  S.walls = [{ id: 1, a: 0, b: 1, wallTypeId: "framed", height: 270, dimSide: 1 }];
  syncClears();
  syncLocks();

  const centred = wallFraming(S, S.walls[0]);
  assert.ok(centred.studs.length > 1, "the wall is framed");
  assert.equal(centred.studs[0].point.z, 0, "on the centreline the studs sit on the node line");

  S.walls[0].loc = "face";
  const hung = wallFraming(S, S.walls[0]);
  assert.equal(
    hung.studs[0].point.z,
    wallGeom(S.walls[0]).a.z,
    "re-hung, they follow the wall instead of staying on the node line",
  );
  assert.equal(hung.studs.map((m) => m.s).join(), centred.studs.map((m) => m.s).join(),
    "and their spacing along the wall is untouched");
  delete S.wallTypes;
});

function tJunction(tTop, tBot, tBranch = 20) {
  S.interiorDims = true;
  S.roomMeta = {};
  S.openings = [];
  S.items = [];
  S.nodes = [
    { x: 100, z: 0 },
    { x: 100, z: 200 },
    { x: 100, z: 400 },
    { x: 300, z: 200 },
  ];
  S.walls = [
    { id: 1, a: 0, b: 1, thickness: tTop, height: 270 },
    { id: 2, a: 1, b: 2, thickness: tBot, height: 270 },
    { id: 3, a: 1, b: 3, thickness: tBranch, height: 270 },
  ];
  syncClears();
  syncLocks();
}
function branchButtsInterior(branch, through) {
  const interior = faceX(through, through.dimSide);
  const node = S.nodes[branch.a === 1 ? 1 : branch.b];
  const o = wallOutline(branch);
  const reach = (through.thickness || 0) + (branch.thickness || 0);
  return o.some((p) => {
    if (Math.hypot(p.x - node.x, p.z - node.z) > reach) return false;
    return Math.abs(p.x - interior) < 0.6 || Math.abs(p.z - interior) < 0.6;
  });
}

test("Whole run flushes the interior of a mixed-thickness T without tearing off the branch", () => {
  tJunction(34, 20);
  const [top, bot, branch] = S.walls;
  const junction = JSON.stringify(S.nodes[1]);

  hangStraightRunOnFace(top, wallDimSide(top));

  assert.equal(JSON.stringify(S.nodes[1]), junction, "the T-node stays put, so the branch stays welded");
  assert.equal(top.loc, "face");
  assert.equal(bot.loc, "face");
  assert.equal(branch.a, 1, "the 90° wall still shares the junction");
  assert.ok(Math.abs(faceX(top, top.dimSide) - faceX(bot, bot.dimSide)) < 0.05, "the interior is one straight line");
  assert.ok(
    Math.abs(Math.abs(faceX(top, -top.dimSide) - faceX(bot, -bot.dimSide)) - (top.thickness - bot.thickness)) < 0.05,
    "the whole thickness step lands on the far side",
  );
  assert.ok(branchButtsInterior(branch, top) && branchButtsInterior(branch, bot),
    "the branch still meets both through-walls");
  assert.ok(Math.abs(wallCuts(branch).a) < 0.5, "the branch butts at the flush interior, not short of it");
});

test("thickening one wall of a T-run flushes the interior automatically", () => {
  tJunction(20, 20);
  const [top, bot, branch] = S.walls;

  setWallThicknessPreservingClear(top, 34, "a");

  assert.equal(top.loc, "face", "the run was hung on the interior without a Whole run click");
  assert.equal(bot.loc, "face");
  assert.equal(branch.a, 1);
  assert.ok(Math.abs(faceX(top, top.dimSide) - faceX(bot, bot.dimSide)) < 0.05, "interiors stay flush");
  assert.ok(branchButtsInterior(branch, top) && branchButtsInterior(branch, bot),
    "the 90° wall is still joined");
});

test("an explicit centreline run keeps the step on both faces", () => {
  tJunction(20, 20);
  const [top, bot] = S.walls;
  top.loc = "center";
  bot.loc = "center";

  setWallThicknessPreservingClear(top, 34, "a");

  assert.equal(top.loc, "center", "the opt-out is honoured");
  assert.ok(Math.abs(faceX(top, 1) - faceX(bot, 1)) > 1, "both faces still step");
});
