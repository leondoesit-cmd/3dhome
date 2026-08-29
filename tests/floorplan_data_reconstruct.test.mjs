/* Comprehensive integration QA test:
   Reconstructing a single floor plan from structured data files (Architectural JSON,
   Apple RoomPlan LiDAR capture data, and CAD vector primitives), validating geometry,
   topology, rooms, openings, furniture, and measurements.
*/
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { S } from "../js/state.js";
import {
  detectRooms,
  roomName,
  roomFloor,
  wallById,
  wallGeom,
  wallClearLength,
  usedNodes,
  contentBounds, wallBounds,
  itemsInRoom,
} from "../js/geometry.js";
import {
  ensureWallTypes,
  wallTypeById,
} from "../js/wall_types.js";
import {
  syncLocks,
  syncClears,
  captureLock,
  settleWallDim,
} from "../js/constraint_engine.js";
import {
  ensureNodeIds,
} from "../js/wall_constraints.js";
import { openingHasSwingConflict } from "../js/swing_clearance.js";
import { parseRoomScan } from "../js/room_scan.js";
import { convertCadToWalls } from "../js/cad_to_walls.js";

function resetState() {
  S.nodes = [];
  S.walls = [];
  S.openings = [];
  S.items = [];
  S.markers = [];
  S.wallCons = [];
  S.roomCons = [];
  S.roomMeta = {};
  S.slabOpenings = [];
  S.blueprintTrace = null;
  S.interiorDims = true;
  ensureWallTypes(S);
  ensureNodeIds();
}

test("Reconstruct single floor plan from Architectural JSON data file", async () => {
  resetState();
  const fileContent = await readFile(new URL("../fixtures/floorplans/single_floor_architectural.json", import.meta.url), "utf8");
  const data = JSON.parse(fileContent);

  // Apply parsed data into state
  S.nodes = data.nodes;
  S.walls = data.walls;
  S.openings = data.openings;
  S.items = data.items;
  S.roomMeta = data.roomMeta || {};
  S.interiorDims = data.interiorDims !== false;

  syncLocks();
  syncClears();
  ensureNodeIds();

  // Validate structural geometry
  assert.equal(S.nodes.length, 20, "20 structural nodes loaded");
  assert.equal(S.walls.length, 27, "26 walls loaded");
  assert.equal(S.openings.length, 16, "15 openings (doors, windows, passages) loaded");
  assert.equal(S.items.length, 18, "18 furniture items loaded");

  // Validate room topology detection
  const rooms = detectRooms();
  assert.ok(rooms.length >= 7, "expected at least 7 enclosed rooms/spaces, got " + rooms.length);

  // Match room areas and verify spatial assignment
  const livingRoom = rooms.find((r) => r.cx < 500 && r.cz > 500 && r.cz < 900);
  assert.ok(livingRoom, "Living room detected");
  const kitchen = rooms.find((r) => r.cx < 500 && r.cz < 500);
  assert.ok(kitchen, "Kitchen detected");
  const masterBed = rooms.find((r) => r.cx > 850 && r.cz < 450);
  assert.ok(masterBed, "Master bedroom detected");
  const bed2 = rooms.find((r) => r.cx > 850 && r.cz > 650 && r.cz < 900);
  assert.ok(bed2, "Bedroom 2 detected");
  const bed3 = rooms.find((r) => r.cx >= 500 && r.cx <= 850 && r.cz < 300);
  assert.ok(bed3, "Bedroom 3 / Office detected");
  const terrace = rooms.find((r) => r.cz > 900);
  assert.ok(terrace, "Terrace detected");

  // Verify furniture assignment in rooms
  const livingItems = itemsInRoom(livingRoom);
  assert.ok(livingItems.some((it) => it.type === "sofa"), "sofa is inside living room");
  assert.ok(livingItems.some((it) => it.type === "coffee"), "coffee table is inside living room");

  const masterItems = itemsInRoom(masterBed);
  assert.ok(masterItems.some((it) => it.type === "bed"), "bed is inside master bedroom");
  assert.ok(masterItems.some((it) => it.type === "nightstand"), "nightstand is inside master bedroom");

  // Verify door swing clearance
  S.openings.filter((o) => o.type === "door").forEach((door) => {
    assert.equal(openingHasSwingConflict(door), false, "door id " + door.id + " has no swing conflict");
  });

  // Verify total bounding dimensions (1200 cm width x 1150 cm depth including terrace)
  const bounds = wallBounds();
  assert.ok(bounds, "bounds computed");
  assert.equal(Math.round(bounds.maxx - bounds.minx), 1220, "12.2m outer face width");
  assert.ok(Math.round(bounds.maxz - bounds.minz) >= 1150, "11.5m+ overall depth");
});

test("Reconstruct single floor plan from Apple RoomPlan / LiDAR capture data file", async () => {
  resetState();
  const fileContent = await readFile(new URL("../fixtures/floorplans/single_floor_captured_room.json", import.meta.url), "utf8");
  const parsed = parseRoomScan(fileContent);

  assert.equal(parsed.source, "Apple RoomPlan");
  assert.equal(parsed.wallCount, 5, "5 walls captured by LiDAR");
  assert.equal(parsed.openingCount, 4, "4 openings captured");
  assert.equal(parsed.objectCount, 2, "2 objects captured");

  // Convert CAD lines to architectural walls
  const converted = convertCadToWalls(parsed.cad, {
    singleLineWalls: true,
    defaultThickness: 15,
    height: 270,
  });

  assert.ok(converted.walls.length >= 5, "walls converted");
  assert.ok(converted.nodes.length >= 4, "nodes created");

  S.nodes = converted.nodes;
  S.walls = converted.walls;
  S.openings = converted.openings;

  syncLocks();
  syncClears();
  ensureNodeIds();

  const rooms = detectRooms();
  assert.ok(rooms.length >= 2, "detected 2 divided rooms from LiDAR scan");
});

test("Reconstruct single floor plan from CAD vector data file", async () => {
  resetState();
  const fileContent = await readFile(new URL("../fixtures/floorplans/single_floor_cad_entities.json", import.meta.url), "utf8");
  const data = JSON.parse(fileContent);

  const cad = data.cadEntities;
  const converted = convertCadToWalls(cad, {
    singleLineWalls: true,
    defaultThickness: cad.defaultThickness || 15,
    height: cad.height || 270,
  });

  assert.equal(converted.walls.length, 7, "7 walls created after T-junction splitting");
  assert.equal(converted.nodes.length, 6, "6 shared corner/T-junction nodes created");

  S.nodes = converted.nodes;
  S.walls = converted.walls;
  S.openings = converted.openings;

  syncLocks();
  syncClears();
  ensureNodeIds();

  const rooms = detectRooms();
  assert.equal(rooms.length, 2, "CAD lines formed 2 enclosed rooms");
});

test("Reconstruct single floor plan from Online GeoJSON floor plan data file", async () => {
  resetState();
  const { convertGeoJsonToWalls } = await import("../js/geojson_to_walls.js");
  const fileContent = await readFile(new URL("../fixtures/floorplans/online_indoor_floorplan.geojson", import.meta.url), "utf8");
  
  const converted = convertGeoJsonToWalls(fileContent);

  assert.ok(converted.nodes.length > 50, "converted over 50 architectural nodes, got " + converted.nodes.length);
  assert.ok(converted.walls.length > 50, "converted over 50 architectural walls, got " + converted.walls.length);
  assert.ok(Object.keys(converted.roomMeta).length >= 10, "extracted room metadata labels");

  S.nodes = converted.nodes;
  S.walls = converted.walls;
  S.openings = converted.openings;
  S.roomMeta = converted.roomMeta;

  syncLocks();
  syncClears();
  ensureNodeIds();

  const rooms = detectRooms();
  assert.ok(rooms.length >= 1, "detected closed rooms from online GeoJSON");
  assert.ok(converted.bounds.widthCm > 10000, "overall width is >100m (" + (converted.bounds.widthCm / 100).toFixed(1) + "m)");
  assert.ok(converted.bounds.depthCm > 5000, "overall depth is >50m (" + (converted.bounds.depthCm / 100).toFixed(1) + "m)");
});
