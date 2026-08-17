import test from "node:test";
import assert from "node:assert/strict";
import {
  BUILTIN_WALL_TYPES,
  ensureWallTypes,
  flipWall,
  normalizeWall,
  setWallPhase,
  setWallType,
  wallDatumOffset,
  wallLayerBands,
  wallLayers,
  wallMainLayer,
  wallMaterialQuantities,
  wallPhase,
  wallThickness,
  wallTypeById,
} from "../js/wall_types.js";

function state(walls = []) {
  return { nodes: [], walls, openings: [] };
}

test("the built-in catalogue has complete ordered semantic assemblies", () => {
  const project = state();
  const catalogue = ensureWallTypes(project);
  assert.deepEqual(catalogue.map(type => type.id), [
    "generic", "interior", "exterior", "concrete", "block", "drywall", "glass", "foundation",
  ]);
  assert.equal(BUILTIN_WALL_TYPES.length, 8);
  assert.ok(Object.isFrozen(BUILTIN_WALL_TYPES));
  for (const type of catalogue) {
    assert.ok(type.layers.length);
    assert.equal(type.layers.filter(layer => layer.main).length, 1);
    assert.equal(type.thickness, type.layers.reduce((sum, layer) => sum + layer.thickness, 0));
    for (const layer of type.layers) {
      for (const property of ["thickness", "material", "color", "role", "main", "structural", "airGap", "framing", "rValue"])
        assert.ok(Object.hasOwn(layer, property), `${type.id}/${layer.id} lacks ${property}`);
    }
  }
  assert.equal(wallTypeById(project, "missing"), null);
});

test("legacy walls migrate without changing authored thickness or height", () => {
  const legacy = { id: 1, a: 0, b: 1, thickness: 17, height: 315 };
  const project = state([legacy]);
  ensureWallTypes(project);
  assert.equal(legacy.wallTypeId, "generic");
  assert.equal(legacy.thickness, 17);
  assert.equal(legacy.height, 315);
  assert.equal(wallThickness(legacy, project), 17);
  assert.equal(wallLayers(legacy, project).length, 1);
  assert.equal(wallMainLayer(legacy, project).thickness, 17);
  assert.equal(legacy.phase, "new");
  assert.equal(legacy.datum, "center");
});

test("custom types survive catalogue repair and malformed layers are normalized", () => {
  const project = state();
  project.wallTypes = {
    acoustic: {
      name: "Acoustic partition",
      layers: [
        { thickness: 2, material: "board", main: true },
        { thickness: 8, material: "wool", main: true, airGap: true },
      ],
    },
  };
  ensureWallTypes(project);
  const custom = wallTypeById(project, "acoustic");
  assert.ok(custom);
  assert.equal(custom.layers.filter(layer => layer.main).length, 1, "an assembly has one authoritative main layer");
  assert.equal(custom.layers[1].airGap, true);
  assert.equal(custom.thickness, 10);
  assert.ok(wallTypeById(project, "exterior"), "missing built-ins are restored");
});

test("datum offsets and layer bands follow the main layer and reverse cleanly", () => {
  const wall = { id: 1, a: 0, b: 1, wallTypeId: "exterior", height: 270, datum: "exterior" };
  const project = state([wall]);
  normalizeWall(wall, project);
  assert.equal(wallThickness(wall, project), 29);
  assert.equal(wallDatumOffset(wall, project, "exterior"), -14.5);
  assert.equal(wallDatumOffset(wall, project, "main-exterior"), -7.5);
  let bands = wallLayerBands(wall, project);
  assert.equal(bands[0].start, 0, "the exterior datum is the zero reference");
  assert.equal(bands.at(-1).end, 29);
  assert.equal(bands[0].sideA, bands[0].start);
  assert.equal(bands[0].offsetB, bands[0].end);

  const endpoints = [wall.a, wall.b];
  flipWall(wall);
  assert.deepEqual([wall.a, wall.b], endpoints, "flipping layers never reverses wall topology");
  assert.equal(wallLayers(wall, project)[0].id, "exterior-plaster");
  assert.equal(wallDatumOffset(wall, project, "exterior"), 14.5);
  bands = wallLayerBands(wall, project);
  assert.equal(bands.at(-1).end, 0, "the named exterior datum remains stationary after mirroring");
  assert.equal(bands[0].start, -29);
});

test("changing type preserves legacy height and optionally preserves the reference surface", () => {
  const wall = { id: 1, a: 0, b: 1, thickness: 14, height: 302, datum: "main-exterior" };
  const project = state([wall]);
  normalizeWall(wall, project);
  setWallType(wall, "drywall", project);
  assert.equal(wall.wallTypeId, "drywall");
  assert.equal(wall.thickness, 10);
  assert.equal(wall.height, 302);
  assert.equal(wall.datum, "main-exterior");
  assert.equal(wall.layers, undefined, "a catalogue type replaces the legacy per-wall assembly");

  setWallType(wall, "concrete", project, { preserveDatum: false });
  assert.equal(wall.datum, "center");
  assert.equal(wall.thickness, 20);
  setWallType(wall, "does-not-exist", project);
  assert.equal(wall.wallTypeId, "concrete", "an invalid catalogue id is a safe no-op");
});

test("material take-off groups layers and subtracts opening area", () => {
  const walls = [
    { id: 7, a: 0, b: 1, wallTypeId: "concrete", height: 300, phase: "existing" },
    { id: 8, a: 1, b: 2, wallTypeId: "concrete", height: 300, phase: "demolished" },
  ];
  const project = state(walls);
  project.nodes = [{ x: 0, z: 0 }, { x: 400, z: 0 }, { x: 500, z: 0 }];
  project.openings = [{ id: 20, wall: 7, width: 100, height: 200, sill: 0 }];
  const groups = wallMaterialQuantities(project);
  const concrete = groups.find(group => group.material === "reinforced-concrete" && group.layer === "core");
  assert.ok(concrete);
  assert.equal(concrete.wallCount, 2);
  assert.equal(concrete.grossArea, 150000);
  assert.equal(concrete.openingArea, 20000);
  assert.equal(concrete.netArea, 130000);
  assert.equal(concrete.volume, 2600000);
  assert.equal(concrete.phases.existing.netArea, 100000);
  assert.equal(concrete.phases.demolition.netArea, 30000);
});

test("renovation phases use stable canonical values", () => {
  const wall = {};
  assert.equal(wallPhase(wall), "new");
  assert.equal(wallPhase(setWallPhase(wall, "demo")), "demolition");
  assert.equal(wallPhase(setWallPhase(wall, "as-built")), "existing");
  assert.equal(wallPhase(setWallPhase(wall, "proposed")), "new");
});
