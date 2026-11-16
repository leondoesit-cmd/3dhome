/* js/item_wall_snap.js resolveItemDrag: plain walls and a piece in, a pose out
   (FURNITURE_PLACEMENT_PLAN.md Stage 1c). */
import test from "node:test";
import assert from "node:assert/strict";
import { resolveItemDrag, footReach, CAPTURE, RELEASE_MUL } from "../js/item_wall_snap.js";
import { S } from "../js/state.js";
import { wallSnapSegments, seatNewPiece } from "../js/item_orient.js";

const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
// wall 1 along z = 0 (room on +z), wall 4 along x = 0 (room on +x), 10 cm thick
const W1 = { id: 1, a: { x: 0, z: 0 }, b: { x: 600, z: 0 }, t: 10 };
const W4 = { id: 4, a: { x: 0, z: 400 }, b: { x: 0, z: 0 }, t: 10 };
const tv = (x, z) => ({ type: "tvWall", w: 120, d: 10, rot: 0, x, z });
const shelf = (x, z) => ({ type: "bookcase", w: 80, d: 40, rot: 0, x, z });
const sofa = (x, z) => ({ type: "sofa", w: 200, d: 90, rot: 0, x, z });

test("a TV whose centre is sent to the wall centreline ends flush on the near face", () => {
  const r = resolveItemDrag({ item: tv(300, 100), target: { x: 300, z: 0 }, walls: [W1], mode: "hung" });
  assert.deepEqual([r.x, r.z, r.wallId, r.side, r.flush], [300, 10, 1, 1, true]);
  // coming from the other room: flush on THAT face
  const o = resolveItemDrag({ item: tv(300, -100), target: { x: 300, z: 0 }, walls: [W1], mode: "hung" });
  assert.deepEqual([o.z, o.side], [-10, -1]);
});

test("wall pieces are captured from 30 cm and let go only past 1.6 × that", () => {
  assert.equal(CAPTURE.wall, 30);
  assert.equal(RELEASE_MUL, 1.6);
  const at = (gap, prev) => resolveItemDrag({
    item: shelf(300, 100), target: { x: 300, z: 5 + 20 + gap }, walls: [W1], mode: "wall", prev,
  });
  assert.equal(at(25).z, 25, "25 cm off: pulled flush");
  assert.equal(at(25).wallId, 1);
  assert.deepEqual([at(35).z, at(35).flush], [60, false], "35 cm off: left where it is");
  const held = { wallId: 1, side: 1 };
  assert.equal(at(40, held).z, 25, "already flush: still held at 40 cm");
  assert.deepEqual([at(50, held).z, at(50, held).flush], [75, false], "beyond 48 cm: released");
});

test("a hung piece 2 m out goes flush; past its reach it stays", () => {
  const r = resolveItemDrag({ item: tv(300, 300), target: { x: 300, z: 210 }, walls: [W1], mode: "hung" });
  assert.deepEqual([r.z, r.flush], [10, true]);
  const far = resolveItemDrag({ item: tv(300, 300), target: { x: 300, z: 240 }, walls: [W1], mode: "hung" });
  assert.deepEqual([far.z, far.flush], [240, false]);
});

test("a free piece is not captured at 20 cm, only from 9 cm", () => {
  const rug = (z) => resolveItemDrag({ item: shelf(300, 100), target: { x: 300, z }, walls: [W1], mode: "free" });
  assert.deepEqual([rug(25 + 20).z, rug(25 + 20).flush], [45, false]);
  assert.equal(rug(25 + 6).z, 25);
});

test("in a corner the piece goes flush to both walls", () => {
  const r = resolveItemDrag({ item: shelf(100, 100), target: { x: 65, z: 40 }, walls: [W1, W4], mode: "wall" });
  assert.deepEqual([r.x, r.z, r.wallId, r.corner], [45, 25, 1, 4]);
});

test("pushed into a wall a piece stops flush against it", () => {
  for (const z of [20, -20]) {
    const r = resolveItemDrag({ item: sofa(300, 100), target: { x: 300, z }, walls: [W1], mode: "seat", snap: false });
    assert.ok(near(r.z, 50), `target z=${z}: stopped at the face`);
    assert.deepEqual([r.x, r.blocked, r.flush, r.wallId], [300, true, true, 1]);
  }
});

test("a target 3 m past the wall crosses into the next room", () => {
  const r = resolveItemDrag({ item: sofa(300, 100), target: { x: 300, z: -300 }, walls: [W1], mode: "seat" });
  assert.deepEqual([r.x, r.z, r.blocked], [300, -300, false]);
  // only just past (inside its reach + 30): pushed back to its own side
  const s = resolveItemDrag({ item: sofa(300, 100), target: { x: 300, z: -70 }, walls: [W1], mode: "seat" });
  assert.ok(near(s.z, 50));
});

test("free (Alt): the target, untouched", () => {
  const r = resolveItemDrag({ item: tv(300, 100), target: { x: 300, z: -3 }, walls: [W1], mode: "hung", free: true });
  assert.deepEqual([r.x, r.z, r.flush, r.blocked], [300, -3, false, false]);
});

test("an oblique (45°) wall with a rotated piece: flush by the rotated footprint", () => {
  const W = { id: 7, a: { x: 0, z: 0 }, b: { x: 400, z: 400 }, t: 10 };
  const n = { x: -Math.SQRT1_2, z: Math.SQRT1_2 };
  // turned 45° its back is on the wall: the reach is just half its depth
  const turned = { type: "desk", w: 100, d: 50, rot: 45, x: 150, z: 250 };
  assert.ok(near(footReach(turned, n.x, n.z), 25));
  const r = resolveItemDrag({ item: turned, target: { x: 190, z: 225 }, walls: [W], mode: "wall" });
  const off = (r.x - 0) * n.x + (r.z - 0) * n.z;
  assert.ok(near(off, 30), "centre half the wall + half the depth off the line");
  assert.ok(near(r.x + r.z, 415, 1e-6), "position along the wall kept");
  // unturned, the same piece reaches (50 + 25)·√½ toward the wall
  const square = { ...turned, rot: 0 };
  const q = resolveItemDrag({ item: square, target: { x: 175, z: 240 }, walls: [W], mode: "wall" });
  assert.ok(near((q.x * n.x + q.z * n.z), 5 + 75 * Math.SQRT1_2));
});

test("a wall with physical:false neither captures nor blocks", () => {
  const ghost = { ...W1, physical: false };
  const r = resolveItemDrag({ item: tv(300, 100), target: { x: 300, z: 0 }, walls: [ghost], mode: "hung" });
  assert.deepEqual([r.z, r.flush, r.blocked], [0, false, false]);
});

test("the aimed wall wins: flush on that face at the aim point, whatever the floor point", () => {
  const r = resolveItemDrag({
    item: sofa(300, 200), target: { x: 320, z: -150 }, walls: [W1, W4], mode: "wall",
    aim: { wallId: 1, nx: 0, nz: 1, x: 200, z: 5 },
  });
  assert.deepEqual([r.x, r.z, r.wallId, r.flush], [200, 50, 1, true]);
});

test("snap:false keeps collision but not the magnetic pull", () => {
  const r = resolveItemDrag({ item: shelf(300, 100), target: { x: 300, z: 40 }, walls: [W1], mode: "wall", snap: false });
  assert.deepEqual([r.z, r.flush], [40, false]);
});

/* The planner adapter (js/item_orient.js): S.walls → segments, and the
   library-piece placement both the click and the 3D preview use. */

function planRoom() {
  S.nodes = [{ x: 0, z: 0 }, { x: 600, z: 0 }, { x: 600, z: 400 }, { x: 0, z: 400 }];
  S.walls = [
    { id: 1, a: 0, b: 1, thickness: 10, height: 270 },
    { id: 2, a: 1, b: 2, thickness: 10, height: 270 },
    { id: 3, a: 2, b: 3, thickness: 10, height: 270 },
    { id: 4, a: 3, b: 0, thickness: 10, height: 270, physical: false },
  ];
  Object.assign(S, { openings: [], markers: [], wallCons: [], items: [], autoFace: true, orientHold: false, snapObj: true });
}

test("wallSnapSegments: straight walls on their line, thickness and physical carried", () => {
  planRoom();
  const segs = wallSnapSegments();
  assert.equal(segs.length, 4);
  assert.deepEqual(segs[0], { id: 1, a: { x: 0, z: 0 }, b: { x: 600, z: 0 }, t: 10, physical: true });
  assert.equal(segs[3].physical, false);
});

test("seatNewPiece: a TV placed 1.5 m out lands on the wall; a piece clicked into a wall is pushed out", () => {
  planRoom();
  const tvIt = { id: 1, type: "tvWall", w: 120, d: 10, h: 70, rot: 0, x: 300, z: 160 };
  const r = seatNewPiece(tvIt, 300, 160, {});
  assert.deepEqual([tvIt.x, tvIt.z, tvIt.rot, r.wallId], [300, 10, 0, 1]);
  // turned by hand (no facing, no click nudge): still not left inside the wall
  const box = { id: 2, type: "sofa", w: 200, d: 90, h: 80, rot: 0, rotUser: 1, x: 300, z: 400 - 20 };
  seatNewPiece(box, 300, 380, {});
  assert.equal(box.z, 400 - 5 - 45);
});

test("a held hung piece still crosses into the next room on a clear move", () => {
  const prev = { wallId: 1, side: 1 };
  const r = resolveItemDrag({ item: tv(300, 10), target: { x: 300, z: -150 }, walls: [W1], mode: "hung", prev });
  assert.deepEqual([r.z, r.side], [-10, -1], "flush on the far room's face, not dragged back");
});

test("a capture pass's face survives a separate collision-only pass (moveItemTo's order)", () => {
  const base = { item: tv(300, 10), walls: [W1], mode: "hung", prev: { wallId: 1, side: 1 } };
  const w = resolveItemDrag({ ...base, target: { x: 300, z: -150 }, collide: false });
  const c = resolveItemDrag({ ...base, target: { x: w.x, z: w.z }, snap: false, keep: { wallId: w.wallId, side: w.side } });
  assert.deepEqual([c.z, c.blocked], [-10, false]);
  // aimed at the face from the camera's side: that face, even coming from the other room
  const a = resolveItemDrag({ item: tv(300, -10), target: { x: 300, z: 400 }, walls: [W1], mode: "hung",
    aim: { wallId: 1, nx: 0, nz: 1, x: 300, z: 5 } });
  assert.deepEqual([a.z, a.side], [10, 1]);
});
