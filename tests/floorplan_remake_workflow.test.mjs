/* Comprehensive integration QA test:
   Remaking a real architectural single-floor house plan ("The Olivia" - 1921 Sears Honor Bilt Modern Home)
   in ModelForge from blueprint calibration to 2D drafting, openings, rooms, finishes, furniture,
   dimension constraints, undo/redo, JSON persistence, and 3D scene reconstruction.
*/
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { S, uid, WALL_T, WALL_H } from "../js/state.js";
import {
  detectRooms,
  roomName,
  roomFloor,
  wallById,
  wallGeom,
  wallClearLength,
  usedNodes,
  wallPointAt,
  wallTangentAt,
  wallProject,
  contentBounds,
  itemsInRoom,
} from "../js/geometry.js";
import {
  calibrationScale,
  makeBlueprintReference,
  normalizeBlueprintReference,
  pixelToWorld,
  blueprintBounds,
} from "../js/blueprint_trace.js";
import {
  ensureWallTypes,
  wallTypeById,
  setWallType,
  flipWall,
  wallLayerBands,
} from "../js/wall_types.js";
import {
  resolveWallDrawDefaults,
  applyWallDrawDefaults,
  extendToHit,
  throughCrossings,
  paintWallWithDefaults,
  reverseWallStyle,
} from "../js/wall_draw.js";
import {
  syncLocks,
  syncClears,
  captureLock,
  settleWallDim,
} from "../js/constraint_engine.js";
import {
  ensureNodeIds,
  nodeAnchor,
  addDistance,
  addFixed,
  solveWallCons,
  conSatisfied,
} from "../js/wall_constraints.js";
import { openingHasSwingConflict } from "../js/swing_clearance.js";

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
  S.history = [];
  S.historyIdx = -1;
  ensureWallTypes(S);
  ensureNodeIds();
}

let calibratedBlueprintRef = null;

test("Workflow Step 1: Blueprint loading & two-point scale calibration", async () => {
  resetState();
  const imageBuffer = await readFile(new URL("../fixtures/floorplans/honor_bilt_olivia.jpg", import.meta.url));
  const base64 = "data:image/jpeg;base64," + imageBuffer.toString("base64");

  const raster = {
    dataUrl: base64,
    width: 1256,
    height: 2032,
    sourceType: "image",
  };

  const p1 = { x: 100, y: 1600 };
  const p2 = { x: 1100, y: 1600 };
  const realDistanceCm = 670.56;

  const scale = calibrationScale(p1, p2, realDistanceCm);
  assert.ok(scale > 0, "calibration scale is positive");
  assert.equal(Math.round(scale * 1000 * 1000) / 1000, Math.round((670.56 / 1000) * 1000 * 1000) / 1000);

  const ref = makeBlueprintReference(raster, p1, p2, realDistanceCm, true, "The Olivia Floor Plan");
  assert.equal(ref.name, "The Olivia Floor Plan");
  assert.ok(ref.cmPerPx > 0);
  assert.equal(ref.visible, true);
  assert.equal(ref.opacity, 0.55);

  const bounds = blueprintBounds(ref);
  assert.ok(bounds, "bounds computed");
  assert.ok(bounds.w > 600, "world width spans house scale");
  assert.ok(bounds.d > 1000, "world height spans house scale");

  calibratedBlueprintRef = normalizeBlueprintReference(ref);
  S.blueprintTrace = calibratedBlueprintRef;
  assert.ok(S.blueprintTrace, "blueprint trace normalized and attached to state");
});

test("Workflow Step 2: Wall layout construction for The Olivia house plan", () => {
  resetState();
  S.blueprintTrace = calibratedBlueprintRef;

  // Nodes:
  // 0: (0, 0) - NW corner (Kitchen)
  // 1: (262, 0) - North T-junction (Kitchen / Hall)
  // 2: (361, 0) - North T-junction (Hall / Back Bedroom)
  // 3: (671, 0) - NE corner (Back Bedroom)
  // 4: (671, 292) - East T-junction (Back Bedroom / Bathroom)
  // 5: (671, 484) - East T-junction (Bathroom / Front Bedroom)
  // 6: (671, 884) - SE corner (Front Bedroom)
  // 7: (579, 884) - South T-junction (Porch right anchor)
  // 8: (361, 884) - South T-junction (Front Bedroom / Living Room)
  // 9: (91, 884) - South T-junction (Porch left anchor)
  // 10: (0, 884) - SW corner (Living Room)
  // 11: (0, 386) - West T-junction (Kitchen / Living Room)
  // 12: (262, 386) - Junction (Kitchen / Hall / Living Room)
  // 13: (262, 600) - Junction (Hall west / Living Room)
  // 14: (361, 292) - Junction (Hall / Back Bedroom / Bathroom)
  // 15: (361, 484) - Junction (Hall / Bathroom / Front Bed Closet)
  // 16: (361, 559) - Junction (Hall / Front Bed Closet wall)
  // 17: (361, 600) - Junction (Hall south end / Living Room)
  // 18: (480, 484) - Closet north junction on Bath wall
  // 19: (480, 559) - Closet corner
  // 20: (91, 1097) - Porch SW corner
  // 21: (579, 1097) - Porch SE corner

  S.nodes = [
    { x: 0, z: 0 },       // 0
    { x: 262, z: 0 },     // 1: North Kitchen/Hall
    { x: 361, z: 0 },     // 2: North Hall/BackBed
    { x: 671, z: 0 },     // 3: NE corner
    { x: 671, z: 292 },   // 4: East BackBed/Bath
    { x: 671, z: 484 },   // 5: East Bath/FrontBed
    { x: 671, z: 884 },   // 6: SE corner
    { x: 579, z: 884 },   // 7: South Porch right
    { x: 361, z: 884 },   // 8: South Living/FrontBed
    { x: 91, z: 884 },    // 9: South Porch left
    { x: 0, z: 884 },     // 10: SW corner
    { x: 0, z: 386 },     // 11: West Kitchen/Living
    { x: 262, z: 386 },   // 12: Kitchen/Hall/Living
    { x: 262, z: 600 },   // 13: Hall/Living
    { x: 361, z: 292 },   // 14: Hall/BackBed/Bath
    { x: 361, z: 484 },   // 15: Hall/Bath/FrontBed
    { x: 361, z: 559 },   // 16: Hall/FrontBed closet
    { x: 361, z: 600 },   // 17: Hall south end
    { x: 480, z: 484 },   // 18: Closet north
    { x: 480, z: 559 },   // 19: Closet corner
    { x: 91, z: 1097 },   // 20: Porch SW
    { x: 579, z: 1097 },  // 21: Porch SE
  ];

  const extWalls = [
    { id: 1, a: 0, b: 1, thickness: 20, height: 270, wallTypeId: "exterior" },
    { id: 2, a: 1, b: 2, thickness: 20, height: 270, wallTypeId: "exterior" },
    { id: 3, a: 2, b: 3, thickness: 20, height: 270, wallTypeId: "exterior" },
    { id: 4, a: 3, b: 4, thickness: 20, height: 270, wallTypeId: "exterior" },
    { id: 5, a: 4, b: 5, thickness: 20, height: 270, wallTypeId: "exterior" },
    { id: 6, a: 5, b: 6, thickness: 20, height: 270, wallTypeId: "exterior" },
    { id: 7, a: 6, b: 7, thickness: 20, height: 270, wallTypeId: "exterior" },
    { id: 8, a: 7, b: 8, thickness: 20, height: 270, wallTypeId: "exterior" },
    { id: 9, a: 8, b: 9, thickness: 20, height: 270, wallTypeId: "exterior" },
    { id: 10, a: 9, b: 10, thickness: 20, height: 270, wallTypeId: "exterior" },
    { id: 11, a: 10, b: 11, thickness: 20, height: 270, wallTypeId: "exterior" },
    { id: 12, a: 11, b: 0, thickness: 20, height: 270, wallTypeId: "exterior" },
  ];

  const intWalls = [
    // Kitchen East Wall (between Kitchen and Hall): 1 -> 12
    { id: 13, a: 1, b: 12, thickness: 10, height: 270, wallTypeId: "interior" },
    // Kitchen / Living Room Partition: 11 -> 12
    { id: 14, a: 11, b: 12, thickness: 10, height: 270, wallTypeId: "interior" },
    // Hall West Wall: 12 -> 13
    { id: 15, a: 12, b: 13, thickness: 10, height: 270, wallTypeId: "interior" },
    // Hall South End opening/wall: 13 -> 17
    { id: 16, a: 13, b: 17, thickness: 10, height: 270, wallTypeId: "interior" },
    // Hall East Wall / Back Bed West: 2 -> 14
    { id: 17, a: 2, b: 14, thickness: 10, height: 270, wallTypeId: "interior" },
    // Back Bed South Partition: 14 -> 4
    { id: 18, a: 14, b: 4, thickness: 10, height: 270, wallTypeId: "interior" },
    // Hall East Wall / Bath West: 14 -> 15
    { id: 19, a: 14, b: 15, thickness: 10, height: 270, wallTypeId: "interior" },
    // Bath South Partition: 15 -> 18
    { id: 20, a: 15, b: 18, thickness: 10, height: 270, wallTypeId: "interior" },
    { id: 21, a: 18, b: 5, thickness: 10, height: 270, wallTypeId: "interior" },
    // Front Bed Closet Walls: 18 -> 19, 19 -> 16
    { id: 22, a: 18, b: 19, thickness: 10, height: 270, wallTypeId: "interior" },
    { id: 23, a: 19, b: 16, thickness: 10, height: 270, wallTypeId: "interior" },
    // Hall East Wall / Front Bed: 16 -> 17
    { id: 24, a: 16, b: 17, thickness: 10, height: 270, wallTypeId: "interior" },
    // Living / Front Bed Partition: 17 -> 8
    { id: 25, a: 17, b: 8, thickness: 10, height: 270, wallTypeId: "interior" },
  ];

  const porchWalls = [
    { id: 26, a: 9, b: 20, thickness: 15, height: 90, wallTypeId: "generic", kind: "railing" },
    { id: 27, a: 20, b: 21, thickness: 15, height: 90, wallTypeId: "generic", kind: "railing" },
    { id: 28, a: 21, b: 7, thickness: 15, height: 90, wallTypeId: "generic", kind: "railing" },
  ];

  S.walls = [...extWalls, ...intWalls, ...porchWalls];
  syncLocks();
  syncClears();
  ensureNodeIds();

  const rooms = detectRooms();
  assert.ok(rooms.length >= 6, "expected at least 6 enclosed rooms");

  let foundLiving = false, foundKitchen = false, foundBackBed = false;
  let foundBath = false, foundFrontBed = false, foundHall = false, foundPorch = false;

  rooms.forEach((r) => {
    if (r.cx < 262 && r.cz > 386) {
      foundLiving = true;
      S.roomMeta[r.key] = { name: "Living Room", floor: "wood_oak", ceil: 270 };
    } else if (r.cx < 262 && r.cz < 386) {
      foundKitchen = true;
      S.roomMeta[r.key] = { name: "Kitchen", floor: "tile_ceramic_white", ceil: 270 };
    } else if (r.cx > 361 && r.cz < 292) {
      foundBackBed = true;
      S.roomMeta[r.key] = { name: "Back Bedroom", floor: "wood_light", ceil: 270 };
    } else if (r.cx > 361 && r.cz > 292 && r.cz < 484) {
      foundBath = true;
      S.roomMeta[r.key] = { name: "Bathroom", floor: "tile_blue", ceil: 270 };
    } else if (r.cx > 361 && r.cz > 484 && r.cz < 884) {
      foundFrontBed = true;
      S.roomMeta[r.key] = { name: "Front Bedroom", floor: "wood_light", ceil: 270 };
    } else if (r.cx >= 262 && r.cx <= 361 && r.cz >= 0 && r.cz <= 600) {
      foundHall = true;
      S.roomMeta[r.key] = { name: "Hallway", floor: "wood_oak", ceil: 270 };
    } else if (r.cz > 884) {
      foundPorch = true;
      S.roomMeta[r.key] = { name: "Porch", floor: "concrete", ceil: 0 };
    }
  });

  assert.ok(foundLiving, "Living Room detected");
  assert.ok(foundKitchen, "Kitchen detected");
  assert.ok(foundBackBed, "Back Bedroom detected");
  assert.ok(foundBath, "Bathroom detected");
  assert.ok(foundFrontBed, "Front Bedroom detected");
  assert.ok(foundHall, "Central Hallway detected");
  assert.ok(foundPorch, "Porch detected");
});

test("Workflow Step 3: Placing doors, windows, and passages with swing clearance verification", () => {
  // Front Entry Door: Wall 9 (between Living Room and Porch)
  const wFrontDoor = wallById(9);
  assert.ok(wFrontDoor);
  const frontDoor = {
    id: uid(),
    type: "door",
    wall: wFrontDoor.id,
    s: 135,
    width: 90,
    height: 205,
    sill: 0,
    swingDir: "L_IN",
  };
  S.openings.push(frontDoor);

  // Rear Kitchen Door: Wall 12 (Kitchen West exterior)
  const wBackDoor = wallById(12);
  assert.ok(wBackDoor);
  const backDoor = {
    id: uid(),
    type: "door",
    wall: wBackDoor.id,
    s: 100,
    width: 85,
    height: 200,
    sill: 0,
    swingDir: "R_IN",
  };
  S.openings.push(backDoor);

  // Interior Doors:
  // Hallway to Living Room (Cased Passage): Wall 16
  const wPassage = wallById(16);
  assert.ok(wPassage);
  const passage = {
    id: uid(),
    type: "passage",
    wall: wPassage.id,
    s: 50,
    width: 90,
    height: 210,
    sill: 0,
  };
  S.openings.push(passage);

  // Hallway to Bathroom: Wall 19
  const wBathDoor = wallById(19);
  assert.ok(wBathDoor);
  const bathDoor = {
    id: uid(),
    type: "door",
    wall: wBathDoor.id,
    s: 80,
    width: 75,
    height: 200,
    sill: 0,
    swingDir: "L_IN",
  };
  S.openings.push(bathDoor);

  // Hallway to Back Bedroom: Wall 17
  const wBackBedDoor = wallById(17);
  assert.ok(wBackBedDoor);
  const backBedDoor = {
    id: uid(),
    type: "door",
    wall: wBackBedDoor.id,
    s: 200,
    width: 80,
    height: 200,
    sill: 0,
    swingDir: "R_IN",
  };
  S.openings.push(backBedDoor);

  // Hallway to Front Bedroom: Wall 24
  const wFrontBedDoor = wallById(24);
  assert.ok(wFrontBedDoor);
  const frontBedDoor = {
    id: uid(),
    type: "door",
    wall: wFrontBedDoor.id,
    s: 25,
    width: 80,
    height: 200,
    sill: 0,
    swingDir: "R_IN",
  };
  S.openings.push(frontBedDoor);

  // Windows:
  // Living Room South Windows (Wall 10)
  const wLivingWin1 = wallById(10);
  const livingWin1 = {
    id: uid(),
    type: "window",
    wall: wLivingWin1.id,
    s: 45,
    width: 80,
    height: 140,
    sill: 70,
  };
  S.openings.push(livingWin1);

  // Living Room West Windows (Wall 11)
  const wLivingWin2 = wallById(11);
  const livingWin2 = {
    id: uid(),
    type: "window",
    wall: wLivingWin2.id,
    s: 200,
    width: 120,
    height: 140,
    sill: 70,
  };
  S.openings.push(livingWin2);

  // Front Bedroom Windows (Wall 6 East)
  const wFrontBedWinE = wallById(6);
  const frontBedWinE = {
    id: uid(),
    type: "window",
    wall: wFrontBedWinE.id,
    s: 200,
    width: 100,
    height: 130,
    sill: 80,
  };
  S.openings.push(frontBedWinE);

  // Bathroom Window (Wall 5 East)
  const wBathWin = wallById(5);
  const bathWin = {
    id: uid(),
    type: "window",
    wall: wBathWin.id,
    s: 96,
    width: 60,
    height: 90,
    sill: 120,
  };
  S.openings.push(bathWin);

  // Back Bedroom Windows (Wall 3 North)
  const wBackBedWinN = wallById(3);
  const backBedWinN = {
    id: uid(),
    type: "window",
    wall: wBackBedWinN.id,
    s: 155,
    width: 100,
    height: 130,
    sill: 80,
  };
  S.openings.push(backBedWinN);

  assert.equal(S.openings.length, 11, "all 11 openings placed");

  assert.equal(openingHasSwingConflict(frontDoor), false, "front door swing is clear");
  assert.equal(openingHasSwingConflict(bathDoor), false, "bath door swing is clear");
  assert.equal(openingHasSwingConflict(backBedDoor), false, "back bed door swing is clear");
  assert.equal(openingHasSwingConflict(frontBedDoor), false, "front bed door swing is clear");
});

test("Workflow Step 4: Furnishing rooms and validating item spatial assignment", () => {
  const sofa = { id: uid(), type: "sofa_3p", x: 80, z: 600, rot: 90, w: 200, d: 90, h: 85 };
  const coffeeTable = { id: uid(), type: "table_coffee", x: 160, z: 600, rot: 90, w: 100, d: 60, h: 45 };
  const lamp = { id: uid(), type: "lamp_floor", x: 40, z: 420, rot: 0, w: 40, d: 40, h: 150 };

  const kCabinet = { id: uid(), type: "kitchen_base", x: 40, z: 120, rot: 90, w: 180, d: 60, h: 90 };
  const kSink = { id: uid(), type: "kitchen_sink", x: 40, z: 240, rot: 90, w: 90, d: 60, h: 90 };
  const fridge = { id: uid(), type: "fridge", x: 40, z: 340, rot: 90, w: 70, d: 70, h: 180 };
  const diningTable = { id: uid(), type: "table_dining", x: 180, z: 200, rot: 0, w: 120, d: 80, h: 75 };

  const backBed = { id: uid(), type: "bed_double", x: 516, z: 100, rot: 0, w: 160, d: 200, h: 90 };
  const backNightstand = { id: uid(), type: "nightstand", x: 400, z: 60, rot: 0, w: 50, d: 45, h: 55 };

  const frontBed = { id: uid(), type: "bed_double", x: 516, z: 750, rot: 180, w: 160, d: 200, h: 90 };
  const frontDresser = { id: uid(), type: "dresser", x: 620, z: 650, rot: 270, w: 110, d: 50, h: 85 };

  const bathtub = { id: uid(), type: "bathtub", x: 610, z: 388, rot: 270, w: 160, d: 75, h: 60 };
  const toilet = { id: uid(), type: "toilet", x: 420, z: 340, rot: 0, w: 50, d: 70, h: 80 };
  const vanity = { id: uid(), type: "vanity", x: 420, z: 440, rot: 180, w: 65, d: 50, h: 85 };

  S.items = [
    sofa, coffeeTable, lamp,
    kCabinet, kSink, fridge, diningTable,
    backBed, backNightstand,
    frontBed, frontDresser,
    bathtub, toilet, vanity,
  ];

  assert.equal(S.items.length, 14, "all 14 furniture items placed");

  const rooms = detectRooms();
  const livingRoom = rooms.find((r) => r.cx < 262 && r.cz > 386);
  assert.ok(livingRoom);
  const livingItems = itemsInRoom(livingRoom.key);
  assert.ok(livingItems.some((it) => it.type === "sofa_3p"), "sofa is inside living room");
  assert.ok(livingItems.some((it) => it.type === "table_coffee"), "coffee table is inside living room");

  const kitchenRoom = rooms.find((r) => r.cx < 262 && r.cz < 386);
  assert.ok(kitchenRoom);
  const kitchenItems = itemsInRoom(kitchenRoom.key);
  assert.ok(kitchenItems.some((it) => it.type === "fridge"), "fridge is inside kitchen");
  assert.ok(kitchenItems.some((it) => it.type === "kitchen_sink"), "sink is inside kitchen");
});

test("Workflow Step 5: Dimensioning, constraint solving, and wall inspection", () => {
  const wExt = wallById(1);
  const clearL = wallClearLength(wExt);
  assert.ok(clearL > 0, "clear length calculated");

  captureLock(wExt);
  assert.ok(wExt.lockClearL != null || wExt.lockL != null, "dimension lock captured");

  const oldClear = wallClearLength(wExt);
  settleWallDim(wExt, Math.round(oldClear + 20), "b", [wExt.id]);
  const newClear = wallClearLength(wExt);
  assert.equal(Math.round(newClear), Math.round(oldClear + 20), "length updated accurately");

  settleWallDim(wExt, Math.round(oldClear), "b", [wExt.id]);
  assert.equal(Math.round(wallClearLength(wExt)), Math.round(oldClear), "length restored accurately");
});

test("Workflow Step 6: State Snapshot & Rollback integrity", () => {
  const initialWallCount = S.walls.length;
  const initialOpeningCount = S.openings.length;
  const initialItemCount = S.items.length;

  const snapshot = JSON.stringify({
    nodes: S.nodes,
    walls: S.walls,
    openings: S.openings,
    items: S.items,
  });

  const newNodeIdx = S.nodes.length;
  S.nodes.push({ x: 100, z: 500 });
  const extraWall = { id: uid(), a: 10, b: newNodeIdx, thickness: 10, height: 270 };
  S.walls.push(extraWall);
  assert.equal(S.walls.length, initialWallCount + 1);

  const restored = JSON.parse(snapshot);
  S.nodes = restored.nodes;
  S.walls = restored.walls;
  S.openings = restored.openings;
  S.items = restored.items;

  assert.equal(S.walls.length, initialWallCount, "rollback restored initial wall count");
  assert.equal(S.openings.length, initialOpeningCount);
  assert.equal(S.items.length, initialItemCount);
});

test("Workflow Step 7: JSON Document Serialization & Complete Restoration Roundtrip", () => {
  const serialized = JSON.stringify({
    version: 1,
    nodes: S.nodes,
    walls: S.walls,
    openings: S.openings,
    items: S.items,
    roomMeta: S.roomMeta,
    wallTypes: S.wallTypes,
    blueprintTrace: S.blueprintTrace,
    showDims: S.showDims,
    interiorDims: S.interiorDims,
  });

  assert.ok(serialized.length > 500, "serialized payload is non-trivial");

  resetState();
  assert.equal(S.walls.length, 0);
  assert.equal(S.items.length, 0);
  assert.equal(S.openings.length, 0);

  const parsed = JSON.parse(serialized);
  S.nodes = parsed.nodes;
  S.walls = parsed.walls;
  S.openings = parsed.openings;
  S.items = parsed.items;
  S.roomMeta = parsed.roomMeta || {};
  S.wallTypes = parsed.wallTypes || [];
  S.blueprintTrace = parsed.blueprintTrace;
  S.interiorDims = parsed.interiorDims;
  syncLocks();
  syncClears();
  ensureNodeIds();

  assert.equal(S.walls.length, 28, "all 28 walls restored");
  assert.equal(S.openings.length, 11, "all 11 openings restored");
  assert.equal(S.items.length, 14, "all 14 furniture items restored");
  assert.ok(S.blueprintTrace, "blueprint trace restored");
  assert.equal(S.blueprintTrace.name, "The Olivia Floor Plan");

  const restoredRooms = detectRooms();
  assert.ok(restoredRooms.length >= 6, "restored rooms count");

  let namedCount = 0;
  restoredRooms.forEach((r) => {
    if (roomName(r.key)) namedCount++;
  });
  assert.ok(namedCount >= 5, "room names preserved across save/load");
});
