import test from "node:test";
import assert from "node:assert/strict";
import { canonicalPlacementItem, placementBatchFitsScene, resolvePlacementIntent } from "../js/placement_resolver.js";

function wall(id, a, b, extra = {}) {
  return { id, thickness: 10, physical: true, curved: false, points: [a, b], ...extra };
}

test("canonical item projection owns vertical spans and non-blocking policy", () => {
  const rug = canonicalPlacementItem({ id: 1, type: "rug", x: 2, z: 3, w: 40, d: 50,
    h: 2, rot: 0, hold: { wall: 7 } }, { itemVSpan: () => ({ lo: 10, hi: 12 }) });
  assert.deepEqual({ elev: rug.elev, h: rug.h, blocks: rug.blocksPlacement, hold: rug.hold },
    { elev: 10, h: 2, blocks: false, hold: { wall: 7 } });
  const chair = canonicalPlacementItem({ id: 2, type: "chair", h: 90, elev: 5 });
  assert.deepEqual({ elev: chair.elev, h: chair.h, blocks: chair.blocksPlacement },
    { elev: 5, h: 90, blocks: true });
});

test("room-local right snap chooses the partition, not the building envelope", () => {
  const scene = {
    floorId: "floor-a",
    items: [{ id: 1, type: "bed", x: 150, z: 150, w: 50, d: 50, rot: 0 }],
    walls: [
      wall("left", { x: 0, z: 0 }, { x: 0, z: 300 }),
      wall("top-left", { x: 0, z: 0 }, { x: 300, z: 0 }),
      wall("partition", { x: 300, z: 0 }, { x: 300, z: 300 }),
      wall("bottom-left", { x: 300, z: 300 }, { x: 0, z: 300 }),
      wall("outer-right", { x: 600, z: 0 }, { x: 600, z: 300 }),
    ],
    rooms: [{ key: "left-room", area: 90000, cx: 150, cz: 150,
      pts: [{ x: 0, z: 0 }, { x: 300, z: 0 }, { x: 300, z: 300 }, { x: 0, z: 300 }],
      wallIds: ["left", "top-left", "partition", "bottom-left"] }],
  };
  const result = resolvePlacementIntent({ itemId: 1, wall: "right", face: "keep" }, scene);
  assert.equal(result.ok, true);
  assert.equal(result.moves[0].holdWallId, "partition");
  assert.equal(result.moves[0].x, 270);
  assert.equal(result.moves[0].floorId, "floor-a");
});

test("diagonal wall snap uses its local normal and faces into the room", () => {
  const pts = [{ x: 0, z: -100 }, { x: 100, z: 0 }, { x: 0, z: 100 }, { x: -100, z: 0 }];
  const scene = {
    floorId: "diamond",
    items: [{ id: 2, type: "sofa", x: 0, z: 0, w: 40, d: 20, rot: 0 }],
    walls: [wall("ne", pts[0], pts[1]), wall("se", pts[1], pts[2]),
      wall("sw", pts[2], pts[3]), wall("nw", pts[3], pts[0])],
    rooms: [{ key: "diamond-room", area: 20000, cx: 0, cz: 0, pts,
      wallIds: ["ne", "se", "sw", "nw"] }],
  };
  const result = resolvePlacementIntent({ itemId: 2, wall: "right", face: "into-room" }, scene);
  assert.equal(result.ok, true);
  const move = result.moves[0];
  assert.ok(Math.abs(move.x) + Math.abs(move.z) < 100, "center is offset inside the diamond boundary");
  const rad = move.rot * Math.PI / 180;
  const front = { x: -Math.sin(rad), z: Math.cos(rad) };
  const towardRoom = { x: -move.x, z: -move.z };
  assert.ok(front.x * towardRoom.x + front.z * towardRoom.z > 0, "front follows the diagonal inward normal");
});

test("beside right uses the reference item's local width axis", () => {
  const scene = {
    floorId: "floor-a", walls: [], rooms: [],
    items: [
      { id: 3, type: "cabinet", x: 100, z: 100, w: 60, d: 40, rot: 90 },
      { id: 4, type: "fridge", x: 0, z: 0, w: 50, d: 50, rot: 0 },
    ],
  };
  const result = resolvePlacementIntent({ itemId: 4, beside: { itemId: 3, side: "right" } }, scene);
  assert.equal(result.ok, true);
  assert.equal(result.moves[0].x, 100);
  assert.equal(result.moves[0].z, 155);
  assert.equal(result.moves[0].rot, 90);
  assert.equal(result.moves[0].rotationProvenance, "automatic");
});

test("compass facing resolves an untruncated late item without requiring a room", () => {
  const scene = { floorId: "floor-a", walls: [], rooms: [],
    items: Array.from({ length: 300 }, (_, index) => ({ id: index, x: index * 30, z: 0,
      w: 20, d: 20, h: 20, rot: 0 })) };
  const result = resolvePlacementIntent({ itemId: 299, face: "west" }, scene);
  assert.equal(result.ok, true);
  assert.deepEqual({ ...result.moves[0], placementGuard: undefined }, {
    itemId: 299, x: 8970, z: 0, rot: 90,
    rotationSpecified: true, rotationProvenance: "explicit",
    choiceLabelKey: null, holdWallId: null, floorId: "floor-a",
    placementGuard: undefined,
  });
  assert.equal(result.moves[0].placementGuard.occupancyFingerprint, undefined);
});

test("wall snap refuses an item whose footprint cannot fit in the room", () => {
  const pts = [{ x: 0, z: 0 }, { x: 150, z: 0 }, { x: 150, z: 150 }, { x: 0, z: 150 }];
  const scene = { floorId: "small", rooms: [{ key: "small", area: 22500, pts,
    wallIds: ["top", "right", "bottom", "left"] }], walls: [
    wall("top", pts[0], pts[1]), wall("right", pts[1], pts[2]),
    wall("bottom", pts[2], pts[3]), wall("left", pts[3], pts[0]),
  ], items: [{ id: 30, x: 75, z: 75, w: 180, d: 60, h: 80, rot: 0 }] };
  const result = resolvePlacementIntent({ itemId: 30, wall: "right", face: "keep" }, scene);
  assert.deepEqual(result, { ok: false, reason: "NO_PLACEMENT_FIT" });
});

test("semantic placement rejects an occupied destination but permits vertical clearance", () => {
  const pts = [{ x: 0, z: 0 }, { x: 300, z: 0 }, { x: 300, z: 300 }, { x: 0, z: 300 }];
  const base = { floorId: "room", rooms: [{ key: "room", area: 90000, pts,
    wallIds: ["top", "right", "bottom", "left"] }], walls: [
    wall("top", pts[0], pts[1]), wall("right", pts[1], pts[2]),
    wall("bottom", pts[2], pts[3]), wall("left", pts[3], pts[0]),
  ] };
  const mover = { id: 31, x: 100, z: 150, w: 50, d: 50, h: 80, elev: 0, rot: 0 };
  const obstacle = { id: 32, x: 270, z: 150, w: 50, d: 50, h: 80, elev: 0, rot: 0 };
  const blocked = resolvePlacementIntent({ itemId: 31, wall: "right", face: "keep" },
    { ...base, items: [mover, obstacle] });
  assert.deepEqual(blocked, { ok: false, reason: "NO_PLACEMENT_FIT" });
  const clear = resolvePlacementIntent({ itemId: 31, wall: "right", face: "keep" },
    { ...base, items: [mover, { ...obstacle, elev: 100 }] });
  assert.equal(clear.ok, true);
});

test("final semantic batch validation catches collisions between jointly moved targets", () => {
  const scene = { walls: [], rooms: [], items: [
    { id: 40, x: 0, z: 0, w: 40, d: 40, h: 80, elev: 0, rot: 0 },
    { id: 41, x: 200, z: 0, w: 40, d: 40, h: 80, elev: 0, rot: 0 },
  ] };
  assert.equal(placementBatchFitsScene(scene, [
    { itemId: 40, x: 100, z: 100, rot: 0 },
    { itemId: 41, x: 100, z: 100, rot: 0 },
  ]), false);
  assert.equal(placementBatchFitsScene(scene, [
    { itemId: 40, x: 80, z: 100, rot: 0 },
    { itemId: 41, x: 120, z: 100, rot: 0 },
  ]), true, "touching edges are allowed");
});

test("beside placement at a wall endpoint refuses overlap instead of clamping through the reference", () => {
  const room = { key: "room", area: 90000, cx: 150, cz: 150,
    pts: [{ x: 0, z: 0 }, { x: 300, z: 0 }, { x: 300, z: 300 }, { x: 0, z: 300 }],
    wallIds: ["top", "right", "bottom", "left"] };
  const scene = { floorId: "floor-a", rooms: [room], walls: [
    wall("top", room.pts[0], room.pts[1]), wall("right", room.pts[1], room.pts[2]),
    wall("bottom", room.pts[2], room.pts[3]), wall("left", room.pts[3], room.pts[0]),
  ], items: [
    { id: 10, x: 270, z: 40, w: 60, d: 60, rot: 0, hold: { wall: "top", side: 1 } },
    { id: 11, x: 100, z: 150, w: 70, d: 70, rot: 0 },
  ] };
  const result = resolvePlacementIntent({ itemId: 11, beside: { itemId: 10, side: "right" } }, scene);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "NO_PLACEMENT_FIT");
});

test("curved wall placement fails closed until full OBB clearance can be proven", () => {
  const scene = { floorId: "floor-a",
    items: [{ id: 20, x: 100, z: 100, w: 120, d: 60, rot: 0 }],
    walls: [wall("curve", { x: 0, z: 0 }, { x: 200, z: 0 }, { curved: true,
      points: [{ x: 0, z: 0 }, { x: 100, z: -40 }, { x: 200, z: 0 }] })],
    rooms: [{ key: "curved", area: 40000, cx: 100, cz: 100,
      pts: [{ x: 0, z: 0 }, { x: 200, z: 0 }, { x: 200, z: 200 }, { x: 0, z: 200 }],
      wallIds: ["curve"] }],
  };
  const result = resolvePlacementIntent({ itemId: 20, wall: "top", face: "into-room" }, scene);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "CURVED_WALL_PLACEMENT_UNSUPPORTED");
});
