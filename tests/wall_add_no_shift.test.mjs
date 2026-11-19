/* Adding a wall outside an existing room must not move or re-measure the room
   (WALL_ADD_SHIFT_PLAN.md).
   Invariant C: a wall whose own measured face did not change keeps its clear
   length, whatever is added on the far side of a node.
   Invariant D: after a wall-creation action every node that existed before it
   is exactly where it was, and every existing wall reads the same clear length.
   Walls are added the way the wall tool adds them (js/interaction/mep_tools.js
   wallPoint): the stated length is the rubber band's reading (pendingCuts)
   unless a test states one, then settleNewWalls() for the draw run. */
import test from "node:test";
import assert from "node:assert/strict";
import { S } from "../js/state.js";
import { pendingCuts, wallClearLength } from "../js/geometry.js";
import { CLEAR_RULE, loadClears, preserveClear, settleNewWalls, syncClears, syncLocks } from "../js/constraint_engine.js";

const T = 10;
function room() {
  S.interiorDims = true;
  S.roomMeta = {};
  S.openings = [];
  S.items = [];
  S.nodes = [{ x: 0, z: 0 }, { x: 400, z: 0 }, { x: 400, z: 300 }, { x: 0, z: 300 }];
  S.walls = [[0, 1], [1, 2], [2, 3], [3, 0]].map(([a, b], id) => ({ id, a, b, thickness: T, height: 270 }));
  syncClears();
  syncLocks();
  S.drawWalls = [];
}
const snap = () => ({
  nodes: S.nodes.map((n) => ({ x: n.x, z: n.z })),
  clear: S.walls.map((w) => wallClearLength(w)),
});
function nodeOf(p) {
  if (typeof p === "number") return p;
  return S.nodes.push({ x: p.x, z: p.z }) - 1;
}
/* One wall of a draw run, committed as the tool commits it: the clicked point
   becomes the new corner, and the wall's own two ends are held as well as
   every corner that existed before the run. `stated` overrides the rubber
   band's reading (a typed length that disagrees with the geometry). */
function draw(a, to, stated, slide = true, extra = {}, settle = settleNewWalls) {
  const from = S.nodes[a],
    pt = typeof to === "number" ? S.nodes[to] : to,
    drawn = Math.hypot(pt.x - from.x, pt.z - from.z) - pendingCuts(a, pt);
  const w = { id: 100 + S.walls.length, a, b: nodeOf(to), thickness: T, height: 270, ...extra };
  S.walls.push(w);
  if (stated != null) w.clearL = stated;
  else if (drawn > 0) w.clearL = drawn;
  S.drawWalls.push(w.id);
  settle(S.drawWalls, slide, [w.a, w.b]);
  return w;
}
// the run ends (finishDraw): whatever the run could not meet is re-read
function endRun() {
  settleNewWalls(S.drawWalls, false);
}
// HEAD's wall tool: preserveClear with the new wall's two ends pinned
function headSettle(runIds, slide, ends) {
  if (slide) preserveClear(ends);
}
function assertUntouched(before, label, readings = true) {
  before.nodes.forEach((n, i) => {
    assert.equal(S.nodes[i].x, n.x, `${label}: node ${i} x`);
    assert.equal(S.nodes[i].z, n.z, `${label}: node ${i} z`);
  });
  if (readings) before.clear.forEach((c, i) => {
    assert.ok(Math.abs(wallClearLength(S.walls[i]) - c) < 1e-6,
      `${label}: wall ${i} reads ${wallClearLength(S.walls[i])}, was ${c}`);
  });
}
function assertStatedIsMeasured(walls, label) {
  walls.forEach((w) => {
    assert.ok(Math.abs(w.clearL - wallClearLength(w)) < 0.02,
      `${label}: wall ${w.id} states ${w.clearL}, measures ${wallClearLength(w)}`);
  });
}

test("the room itself reads 390 x 290 inside", () => {
  room();
  assert.deepEqual(snap().clear.map((c) => +c.toFixed(6)), [390, 290, 390, 290]);
});

test("a wall continuing the top wall outward leaves the room alone", () => {
  room();
  const before = snap();
  const w = draw(1, { x: 700, z: 0 });
  assertUntouched(before, "continuation");
  endRun();
  assertStatedIsMeasured([w], "continuation");
});

test("a stated length the clicked corners cannot meet is re-read; nothing moves", () => {
  room();
  const before = snap();
  const w = draw(1, { x: 700, z: 0 }, 300);
  assertUntouched(before, "stated continuation");
  endRun();
  assertStatedIsMeasured([w], "stated continuation");
  assert.deepEqual(S.nodes[4], { x: 700, z: 0 }, "the clicked end stays where it was clicked");
});

test("a wall going out perpendicular from a corner leaves the side wall at 290", () => {
  room();
  const before = snap();
  const w = draw(1, { x: 400, z: -250 }, 250);
  assertUntouched(before, "perpendicular");
  endRun();
  assertStatedIsMeasured([w], "perpendicular");
});

test("an oblique outside wall from a corner changes nothing existing", () => {
  room();
  const before = snap();
  const w = draw(1, { x: 650, z: -200 });
  assertUntouched(before, "oblique");
  endRun();
  assertStatedIsMeasured([w], "oblique");
  assert.deepEqual(S.nodes[4], { x: 650, z: -200 }, "the clicked end stays where it was clicked");
});

test("a second room attached outside does not slide or re-measure the first", () => {
  room();
  const before = snap();
  const run = [draw(1, { x: 700, z: 0 }, 300), draw(4, { x: 700, z: 300 }, 300), draw(5, 2, 300)];
  assertUntouched(before, "second room (stated 300s)");
  endRun();
  assertStatedIsMeasured(run, "second room (stated 300s)");
});

test("a second room drawn with the rubber band's readings leaves the first alone", () => {
  room();
  const before = snap();
  const run = [draw(1, { x: 700, z: 0 }), draw(4, { x: 700, z: 300 }), draw(5, 2)];
  assertUntouched(before, "second room (drawn)");
  endRun();
  assertStatedIsMeasured(run, "second room (drawn)");
  assert.deepEqual(S.nodes.slice(4), [{ x: 700, z: 0 }, { x: 700, z: 300 }], "new corners as clicked");
  run.forEach((w) => {
    const p = S.nodes[w.a], q = S.nodes[w.b];
    assert.ok(p.x === q.x || p.z === q.z, `wall ${w.id} is axis-aligned: (${p.x},${p.z})-(${q.x},${q.z})`);
  });
});

test("a later wall that turns the previous end into a corner: clicked corners stay, the length is re-read", () => {
  room();
  const before = snap();
  const first = draw(1, { x: 700, z: 0 });
  draw(4, { x: 700, z: 300 });
  assertUntouched(before, "chain");
  // the first wall runs from an existing corner to a held one: nothing can slide
  assert.deepEqual(S.nodes.slice(4), [{ x: 700, z: 0 }, { x: 700, z: 300 }], "corners as clicked");
  endRun();
  assertStatedIsMeasured(S.walls, "chain");
  assert.ok(Math.abs(first.clearL - 290) < 1e-6, `the first wall now states ${first.clearL}`);
});

/* A room drawn by clicks on an empty plan: (0,0) (400,0) (400,300) (0,300)
   and back onto (0,0). Nothing existed before the run, so the tool's pins are
   exactly HEAD's (the clicked wall's two ends) and the corners must come out
   where HEAD put them, for every way the wall tool can be set to measure. */
function clickRoom(extra, settle) {
  S.interiorDims = true; S.roomMeta = {}; S.openings = []; S.items = [];
  S.nodes = [{ x: 0, z: 0 }]; S.walls = []; S.drawWalls = [];
  let from = 0;
  [{ x: 400, z: 0 }, { x: 400, z: 300 }, { x: 0, z: 300 }, 0].forEach((c) => {
    from = draw(from, c, undefined, true, extra, settle).b;
  });
  if (settle === settleNewWalls) endRun();
  return S.nodes.map((n) => ({ x: n.x, z: n.z }));
}
const DRAW_SETTINGS = [
  ["Auto face, centre line", {}],
  ["exterior face, face line", { loc: "face", dimSide: -1 }],
  ["interior face, face line", { loc: "face", dimSide: 1 }],
  ["outer face pinned, centre line", { dimSide: -1 }],
  ["inner face pinned, centre line", { dimSide: 1 }],
];
test("a room clicked on an empty plan lands on exactly HEAD's corners", () => {
  for (const [label, extra] of DRAW_SETTINGS) {
    const head = clickRoom(extra, headSettle);
    const now = clickRoom(extra, settleNewWalls);
    assert.deepEqual(now, head, label);
    assertStatedIsMeasured(S.walls, label);
  }
});
test("a room clicked on an empty plan with the face presets is square", () => {
  for (const [label, extra] of DRAW_SETTINGS.slice(1, 3)) {
    const [n0, n1, n2, n3] = clickRoom(extra, settleNewWalls);
    assert.ok(n0.z === n1.z && n1.x === n2.x && n2.z === n3.z && n3.x === n0.x, `${label}: axis-aligned`);
    assert.equal(n1.x - n0.x, n2.x - n3.x, `${label}: top and bottom equal`);
    assert.equal(n3.z - n0.z, n2.z - n1.z, `${label}: sides equal`);
    // each clicked corner after the first stays where it was clicked
    assert.deepEqual(n2, { x: 400, z: 300 });
    assert.deepEqual(n3, { x: 0, z: 300 });
  }
});

test("a wall closing between two existing corners takes the measured length", () => {
  room();
  S.walls.pop(); // an open U: walls 0..2, corners 3 and 0 unconnected
  syncClears();
  const before = snap();
  const w = draw(3, 0, 300); // stated 300 cannot be met without moving the U
  /* The U's two free ends just became corners, so those walls' inside faces
     really are 5 cm shorter now: their readings change (390), nothing moves,
     and what they state follows what they measure. */
  assertUntouched(before, "closing", false);
  endRun();
  assertStatedIsMeasured(S.walls, "closing");
  assert.ok(Math.abs(w.clearL - 290) < 0.02, `the closing wall reads 290, states ${w.clearL}`);
  assert.ok(Math.abs(wallClearLength(S.walls[0]) - 390) < 1e-6 && Math.abs(wallClearLength(S.walls[2]) - 390) < 1e-6);
  assert.ok(Math.abs(wallClearLength(S.walls[1]) - before.clear[1]) < 1e-6, "the U's base keeps its reading");
});

test("a wall committed without sliding (it split a host) still states what it measures", () => {
  room();
  const before = snap();
  const w = draw(1, { x: 600, z: -150 }, 999, false);
  assertUntouched(before, "split end");
  endRun();
  assertStatedIsMeasured([w], "split end");
});

/* A partition splitting the top wall at x=200. */
function splitTop() {
  room();
  S.nodes.push({ x: 200, z: 0 }); // node 4
  S.walls[0].b = 4;
  S.walls.push({ id: 10, a: 4, b: 1, thickness: T, height: 270 });
}

test("a partition T on the room side: each half reads to the partition's near face", () => {
  splitTop();
  S.nodes.push({ x: 200, z: 150 });
  S.walls.push({ id: 11, a: 4, b: 5, thickness: T, height: 270 });
  assert.ok(Math.abs(wallClearLength(S.walls[0]) - 190) < 1e-6, `left half ${wallClearLength(S.walls[0])}`);
  assert.ok(Math.abs(wallClearLength(S.walls[4]) - 190) < 1e-6, `right half ${wallClearLength(S.walls[4])}`);
});

test("a T on the far side does not change the halves' reading", () => {
  splitTop();
  const left = wallClearLength(S.walls[0]), right = wallClearLength(S.walls[4]);
  assert.ok(Math.abs(left - 195) < 1e-6 && Math.abs(right - 195) < 1e-6, `split halves ${left}/${right}`);
  S.nodes.push({ x: 200, z: -150 });
  S.walls.push({ id: 11, a: 4, b: 5, thickness: T, height: 270 });
  assert.ok(Math.abs(wallClearLength(S.walls[0]) - left) < 1e-6, `left half ${wallClearLength(S.walls[0])}`);
  assert.ok(Math.abs(wallClearLength(S.walls[4]) - right) < 1e-6, `right half ${wallClearLength(S.walls[4])}`);
});

test("centreline measurement is unchanged at a straight-through joint", () => {
  splitTop();
  S.nodes.push({ x: 200, z: 150 });
  S.walls.push({ id: 11, a: 4, b: 5, thickness: T, height: 270 });
  S.walls[0].dimSide = 0;
  assert.equal(wallClearLength(S.walls[0]), 200);
});

test("a partition drawn off a split room wall: the halves re-read, nothing moves", () => {
  splitTop();
  syncClears(); // the halves hold 195 each, captured when the host was split
  S.drawWalls = [];
  const before = snap();
  draw(4, { x: 200, z: 150 }, undefined, false); // a split start: no slide
  assertUntouched(before, "partition", false);
  endRun();
  assertStatedIsMeasured(S.walls, "partition");
  assert.ok(Math.abs(S.walls[0].clearL - 190) < 1e-6 && Math.abs(S.walls[4].clearL - 190) < 1e-6);
});

function staleT() {
  splitTop();
  S.nodes.push({ x: 200, z: 150 });
  S.walls.push({ id: 11, a: 4, b: 5, thickness: T, height: 270 });
  // the halves saved under the old rule: measured to the node, 195
  S.walls[0].clearL = 195;
  S.walls[4].clearL = 195;
  delete S.clearRule;
}

test("loading an unstamped document re-reads clearL from the geometry, moving nothing", () => {
  staleT();
  const nodes = S.nodes.map((n) => ({ x: n.x, z: n.z }));
  loadClears({ nodes: [], walls: [] });
  assert.deepEqual(S.nodes, nodes);
  assert.ok(Math.abs(S.walls[0].clearL - 190) < 1e-6, `left half states ${S.walls[0].clearL}`);
  assert.ok(Math.abs(S.walls[4].clearL - 190) < 1e-6, `right half states ${S.walls[4].clearL}`);
  assert.ok(Math.abs(S.walls[0].lockClearL - 190) < 1e-6, `left half's lock holds ${S.walls[0].lockClearL}`);
  assert.equal(S.clearRule, CLEAR_RULE);
});

test("loading a stamped document leaves clearL alone", () => {
  staleT();
  loadClears({ clearRule: CLEAR_RULE });
  assert.equal(S.walls[0].clearL, 195);
  assert.equal(S.walls[4].clearL, 195);
  assert.equal(S.clearRule, CLEAR_RULE);
});

/* Wiring Node cannot run (ui.js needs the DOM): a loaded document goes through
   loadClears with the document, a saved one carries the stamp, and an undo
   snapshot restore (history.js apply) does not re-read anything. */
test("documents are re-read on load and stamped on save; undo does not re-read", async () => {
  const { readFile } = await import("node:fs/promises");
  const { moduleSource } = await import("./helpers/module_source.mjs");
  const { sourceFunctionText } = await import("./helpers/source_function.mjs");
  const ui = moduleSource("js/ui.js");
  assert.match(sourceFunctionText(ui, "applyDataRequest"), /\bloadClears\(d\)/);
  assert.match(sourceFunctionText(ui, "sceneObject"), /\bclearRule:\s*CLEAR_RULE\b/);
  const history = await readFile(new URL("../js/history.js", import.meta.url), "utf8");
  assert.doesNotMatch(sourceFunctionText(history, "apply"), /loadClears|clearRule/);
});
