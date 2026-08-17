import test from "node:test";
import assert from "node:assert/strict";
import {
  alignSelectedWallToReference,
  alignWallToFloor,
  findOverlappingReferenceWall,
  floorById,
  referenceFloorScene,
  setReferenceFloor,
} from "../js/floors.js";

function wall(id, a, b, thickness = 10, extra = {}) {
  return { id, a, b, thickness, height: 270, ...extra };
}

test("reference-floor selection is stored separately from its visibility", () => {
  const referenceScene = { nodes: [], walls: [] };
  const workspace = {
    activeFloor: "middle",
    floors: [
      { id: "ground", elevation: 0, scene: referenceScene },
      { id: "middle", elevation: 300, scene: {} },
    ],
  };

  assert.equal(floorById("ground", workspace).scene, referenceScene);
  assert.equal(setReferenceFloor("ground", false, workspace).id, "ground");
  assert.equal(workspace.referenceFloor, "ground");
  assert.equal(referenceFloorScene(workspace), null);
  assert.equal(referenceFloorScene(workspace, true), referenceScene);

  setReferenceFloor("ground", true, workspace);
  assert.equal(referenceFloorScene(workspace), referenceScene);
  assert.equal(setReferenceFloor("middle", true, workspace), null);
  assert.equal(workspace.referenceFloor, "");
});

test("wall alignment supports center, faces, main-layer offsets, and flip", () => {
  const currentWall = wall("current", 0, 1, 10);
  const referenceWall = wall("reference", 0, 1, 20);
  const referenceNodes = [{ x: 0, z: 50 }, { x: 100, z: 50 }];

  const proposed = (datum, extra = {}) => alignWallToFloor(currentWall, referenceWall, {
    currentNodes: [{ x: 0, z: 0 }, { x: 100, z: 0 }],
    referenceNodes,
    datum,
    mutate: false,
    ...extra,
  });
  assert.equal(proposed("center").dz, 50);
  assert.equal(proposed("outside").dz, 55);
  assert.equal(proposed("inside").dz, 45);
  assert.equal(proposed("mainOutside", {
    current: { mainOffsetOutside: 2 },
    reference: { mainOffsetOutside: 7 },
  }).dz, 55);
  const catalogue = [{ id: "layered", layers: [
    { thickness: 2 }, { thickness: 6, main: true }, { thickness: 2 },
  ] }];
  assert.equal(alignWallToFloor(
    { ...currentWall, wallTypeId: "layered" },
    { ...referenceWall, wallTypeId: "layered" },
    {
      currentNodes: [{ x: 0, z: 0 }, { x: 100, z: 0 }],
      referenceNodes,
      datum: "mainOutside",
      current: { wallTypes: catalogue },
      reference: { wallTypes: catalogue },
      mutate: false,
    },
  ).dz, 50);

  const flipped = alignWallToFloor(currentWall, { ...referenceWall, flip: true }, {
    currentNodes: [{ x: 0, z: 0 }, { x: 100, z: 0 }],
    referenceNodes,
    datum: "outside",
    mutate: false,
  });
  assert.equal(flipped.dz, 35);
  assert.deepEqual(flipped.movedNodes.map(({ x, z }) => ({ x, z })), [
    { x: 0, z: 35 },
    { x: 100, z: 35 },
  ]);
});

test("alignWallToFloor mutates only the selected wall endpoints and rejects non-parallel walls", () => {
  const nodes = [{ x: 0, z: 0 }, { x: 100, z: 0 }, { x: -20, z: -20 }];
  const referenceNodes = [{ x: 0, z: 25 }, { x: 100, z: 25 }, { x: 0, z: 100 }];
  const selected = wall(1, 0, 1);

  const result = alignWallToFloor(selected, wall(2, 0, 1), {
    currentNodes: nodes,
    referenceNodes,
    datum: "center",
  });
  assert.equal(result.dz, 25);
  assert.deepEqual(nodes, [{ x: 0, z: 25 }, { x: 100, z: 25 }, { x: -20, z: -20 }]);
  assert.equal(alignWallToFloor(selected, wall(3, 0, 2), { currentNodes: nodes, referenceNodes }), null);
});

test("overlap matching ignores nearer walls that do not share a projected span", () => {
  const currentNodes = [{ x: 0, z: 0 }, { x: 100, z: 0 }];
  const referenceScene = {
    nodes: [
      { x: 10, z: 30 }, { x: 90, z: 30 },
      { x: 150, z: 2 }, { x: 250, z: 2 },
      { x: 50, z: -50 }, { x: 50, z: 50 },
    ],
    walls: [wall("overlap", 0, 1), wall("beside", 2, 3), wall("cross", 4, 5)],
  };

  assert.equal(findOverlappingReferenceWall(wall("current", 0, 1), referenceScene, { currentNodes }).id, "overlap");
  const details = findOverlappingReferenceWall(wall("current", 0, 1), referenceScene, { currentNodes, details: true });
  assert.equal(details.overlap, 80);
  assert.equal(details.distance, 30);
});

function alignmentState() {
  const selected = wall("selected", 0, 1);
  const groundScene = { nodes: [{ x: 0, z: 40 }, { x: 100, z: 40 }], walls: [wall("ground-wall", 0, 1)] };
  const upperScene = { nodes: [{ x: 0, z: 80 }, { x: 100, z: 80 }], walls: [wall("upper-wall", 0, 1)] };
  return {
    nodes: [{ x: 0, z: 0 }, { x: 100, z: 0 }],
    walls: [selected],
    sel: { kind: "wall", ref: selected },
    workspace: {
      activeFloor: "middle",
      floors: [
        { id: "ground", name: "Ground", elevation: 0, scene: groundScene },
        { id: "middle", name: "Middle", elevation: 300, scene: {} },
        { id: "upper", name: "Upper", elevation: 600, scene: upperScene },
      ],
      referenceFloor: "",
      showReferenceFloor: false,
    },
  };
}

test("selected-wall alignment resolves the nearest floor above or below", () => {
  const belowState = alignmentState();
  const below = alignSelectedWallToReference(belowState, "below", { datum: "center" });
  assert.equal(below.referenceFloor.id, "ground");
  assert.equal(belowState.workspace.referenceFloor, "ground");
  assert.deepEqual(belowState.nodes.map((node) => node.z), [40, 40]);

  const aboveState = alignmentState();
  const above = alignSelectedWallToReference(aboveState, "above", { datum: "center" });
  assert.equal(above.referenceFloor.id, "upper");
  assert.deepEqual(aboveState.nodes.map((node) => node.z), [80, 80]);
});

test("selected-wall alignment can use an explicitly selected reference floor", () => {
  const state = alignmentState();
  const result = alignSelectedWallToReference(state, {
    referenceFloor: "upper",
    datum: "center",
  });
  assert.equal(result.referencedWall.id, "upper-wall");
  assert.equal(state.nodes[0].z, 80);
});
