import { S } from "./state.js";

const clone = (value) => JSON.parse(JSON.stringify(value));
const makeId = () => "floor-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
let floorIO = null;

/* Keep the floor graph independent from the large browser-only ui.js module.
   workspace.js installs these two synchronous functions when the UI starts;
   geometry-only consumers (including tests and reference-floor rendering) can
   import the helpers below without pulling THREE into Node. */
export function configureFloorIO(io) {
  if (!io || typeof io.sceneObject !== "function" || typeof io.applyData !== "function")
    throw new Error("Floor IO requires sceneObject and applyData");
  floorIO = io;
}

function sceneObject(includeWorkspace) {
  if (!floorIO) throw new Error("Floor IO is not configured");
  return floorIO.sceneObject(includeWorkspace);
}

function applyData(data) {
  if (!floorIO) throw new Error("Floor IO is not configured");
  return floorIO.applyData(data);
}

function workspaceOf(workspace) {
  return workspace && typeof workspace === "object" ? workspace : S.workspace;
}

function sceneNodes(scene) {
  if (!scene || typeof scene !== "object") return [];
  if (Array.isArray(scene.nodes)) return scene.nodes;
  return scene.spatial && Array.isArray(scene.spatial.nodes) ? scene.spatial.nodes : [];
}

function sceneWalls(scene) {
  if (Array.isArray(scene)) return scene;
  if (!scene || typeof scene !== "object") return [];
  if (Array.isArray(scene.walls)) return scene.walls;
  return scene.spatial && Array.isArray(scene.spatial.walls) ? scene.spatial.walls : [];
}

function sceneWallTypes(scene) {
  if (!scene || typeof scene !== "object") return [];
  if (Array.isArray(scene.wallTypes)) return scene.wallTypes;
  return scene.spatial && Array.isArray(scene.spatial.wallTypes) ? scene.spatial.wallTypes : [];
}

function finite(value) {
  return typeof value === "number" && Number.isFinite(value);
}

/** Find a floor without changing the live scene. */
export function floorById(id, workspace = S.workspace) {
  const ws = workspaceOf(workspace);
  return (Array.isArray(ws && ws.floors) ? ws.floors : []).find((floor) => floor && floor.id === id) || null;
}

/**
 * Return the scene selected for the translucent reference-floor overlay.
 * Hidden references remain selected but do not produce an overlay unless
 * includeHidden is explicitly requested (alignment uses that form).
 */
export function referenceFloorScene(workspace = S.workspace, includeHidden = false) {
  const ws = workspaceOf(workspace);
  if (!ws || (!includeHidden && !ws.showReferenceFloor)) return null;
  const floor = floorById(ws.referenceFloor, ws);
  return floor && floor.id !== ws.activeFloor ? (floor.scene || null) : null;
}

/** Select (or clear) the floor used as the plan reference overlay. */
export function setReferenceFloor(id, visible = true, workspace = S.workspace) {
  const ws = workspaceOf(workspace);
  const floor = floorById(id, ws);
  if (!floor || floor.id === ws.activeFloor) {
    ws.referenceFloor = "";
    ws.showReferenceFloor = false;
    return null;
  }
  ws.referenceFloor = floor.id;
  ws.showReferenceFloor = visible !== false;
  return floor;
}

function wallGeometry(wall, nodes) {
  if (!wall || !Array.isArray(nodes)) return null;
  const a = nodes[wall.a], b = nodes[wall.b];
  if (!a || !b || !finite(a.x) || !finite(a.z) || !finite(b.x) || !finite(b.z)) return null;
  const dx = b.x - a.x, dz = b.z - a.z, length = Math.hypot(dx, dz);
  if (length < 0.000001) return null;
  const ux = dx / length, uz = dz / length;
  return { a, b, length, ux, uz, nx: -uz, nz: ux };
}

function datumName(value) {
  const name = String(value || "center");
  if (name === "outside") return "outer";
  if (name === "inside") return "inner";
  return ["outer", "mainOutside", "center", "mainInside", "inner"].includes(name) ? name : "center";
}

function optionNumber(options, key) {
  const value = options && options[key];
  return finite(value) ? value : undefined;
}

function mainDatumOffset(wall, name, options) {
  const key = name === "mainOutside" ? "mainOffsetOutside" : "mainOffsetInside";
  const shortKey = name === "mainOutside" ? "mainOutside" : "mainInside";
  const candidates = [
    optionNumber(options, key),
    optionNumber(options, shortKey),
    optionNumber(wall, key),
    optionNumber(wall, shortKey),
    optionNumber(wall && wall.typeSnapshot, key),
    optionNumber(wall && wall.typeSnapshot, shortKey),
  ];
  const explicit = candidates.find((value) => finite(value));
  if (finite(explicit)) return explicit;

  // A floor snapshot can carry its own type catalogue. Derive the main-layer
  // faces locally when one is supplied, keeping this module decoupled from the
  // wall-type implementation and allowing each floor to use a different type.
  const wallTypes = options && options.wallTypes;
  const type = Array.isArray(wallTypes)
    ? wallTypes.find((candidate) => candidate && candidate.id === wall.wallTypeId)
    : wallTypes && typeof wallTypes === "object" ? wallTypes[wall.wallTypeId] : null;
  const layers = Array.isArray(wall && wall.layers) && wall.layers.length
    ? wall.layers
    : Array.isArray(wall && wall.typeSnapshot && wall.typeSnapshot.layers)
      ? wall.typeSnapshot.layers
      : type && Array.isArray(type.layers) ? type.layers : null;
  if (!layers || !layers.length) return undefined;
  const thicknesses = layers.map((layer) => Math.max(0, Number(layer && layer.thickness) || 0));
  const total = thicknesses.reduce((sum, thickness) => sum + thickness, 0);
  const mainIndex = layers.findIndex((layer) => layer && (layer.main || layer.isMain || layer.role === "core"));
  if (!total || mainIndex < 0) return undefined;
  let cursor = total / 2;
  for (let index = 0; index < mainIndex; index++) cursor -= thicknesses[index];
  return name === "mainOutside" ? cursor : cursor - thicknesses[mainIndex];
}

function wallDatumOffset(wall, rawDatum, options, role) {
  const datum = datumName(rawDatum);
  const roleOptions = options && options[role] && typeof options[role] === "object" ? options[role] : {};
  const callback = roleOptions.datumOffset || (options && options.datumOffset);
  if (typeof callback === "function") {
    const custom = callback(wall, datum, role);
    if (finite(custom)) return custom;
  }
  const thickness = finite(wall && wall.thickness) ? Math.max(0, wall.thickness) : 10;
  let offset = 0;
  if (datum === "outer") offset = thickness / 2;
  else if (datum === "inner") offset = -thickness / 2;
  else if (datum === "mainOutside" || datum === "mainInside") {
    const configured = mainDatumOffset(wall, datum, { ...(options || {}), ...roleOptions });
    offset = finite(configured) ? configured : (datum === "mainOutside" ? thickness / 2 : -thickness / 2);
  }
  return wall && (wall.flip || wall.layersReversed || wall.reverseLayers) ? -offset : offset;
}

/**
 * Translate a current-floor wall until its requested datum coincides with the
 * datum of a parallel wall on another floor. The wall length and direction are
 * preserved. opts.currentNodes and opts.referenceNodes make the operation
 * independent of global state; opts.mutate=false returns the proposed move.
 */
export function alignWallToFloor(currentWall, referencedWall, opts = {}) {
  const currentNodes = opts.currentNodes || opts.nodes || S.nodes;
  const referenceNodes = opts.referenceNodes || opts.refNodes || sceneNodes(opts.referenceScene);
  const current = wallGeometry(currentWall, currentNodes);
  const reference = wallGeometry(referencedWall, referenceNodes);
  if (!current || !reference) return null;

  const parallelError = Math.abs(current.ux * reference.uz - current.uz * reference.ux);
  const parallelTolerance = finite(opts.parallelTolerance) ? Math.max(0, opts.parallelTolerance) : 0.035;
  if (parallelError > parallelTolerance) return null;

  const currentDatum = datumName(opts.currentDatum || opts.datum || currentWall.datum);
  const referenceDatum = datumName(opts.referenceDatum || opts.datum || referencedWall.datum);
  const currentOffset = wallDatumOffset(currentWall, currentDatum, opts, "current");
  const referenceOffset = wallDatumOffset(referencedWall, referenceDatum, opts, "reference");
  const cmx = (current.a.x + current.b.x) / 2 + current.nx * currentOffset;
  const cmz = (current.a.z + current.b.z) / 2 + current.nz * currentOffset;
  const rpx = reference.a.x + reference.nx * referenceOffset;
  const rpz = reference.a.z + reference.nz * referenceOffset;
  const signedDistance = (rpx - cmx) * reference.nx + (rpz - cmz) * reference.nz;
  const dx = reference.nx * signedDistance, dz = reference.nz * signedDistance;
  const movedNodes = [currentWall.a, currentWall.b].filter((node, index, all) => all.indexOf(node) === index).map((node) => ({
    index: node,
    x: currentNodes[node].x + dx,
    z: currentNodes[node].z + dz,
  }));

  if (opts.mutate !== false) movedNodes.forEach((point) => {
    currentNodes[point.index].x = point.x;
    currentNodes[point.index].z = point.z;
  });
  return {
    wall: currentWall,
    referencedWall,
    dx,
    dz,
    distance: Math.hypot(dx, dz),
    currentDatum,
    referenceDatum,
    movedNodes,
  };
}

/** Find the closest parallel reference wall whose projected spans overlap. */
export function findOverlappingReferenceWall(currentWall, referenceScene, opts = {}) {
  const currentNodes = opts.currentNodes || opts.nodes || S.nodes;
  const referenceNodes = opts.referenceNodes || opts.refNodes || sceneNodes(referenceScene);
  const current = wallGeometry(currentWall, currentNodes);
  if (!current) return null;
  const parallelTolerance = finite(opts.parallelTolerance) ? Math.max(0, opts.parallelTolerance) : 0.035;
  const minOverlap = finite(opts.minOverlap) ? Math.max(0, opts.minOverlap) : 1;
  const maxDistance = finite(opts.maxDistance) ? Math.max(0, opts.maxDistance) : Infinity;
  let best = null;

  sceneWalls(referenceScene).forEach((wall) => {
    const geometry = wallGeometry(wall, referenceNodes);
    if (!geometry) return;
    const parallelError = Math.abs(current.ux * geometry.uz - current.uz * geometry.ux);
    if (parallelError > parallelTolerance) return;
    const start = (geometry.a.x - current.a.x) * current.ux + (geometry.a.z - current.a.z) * current.uz;
    const end = (geometry.b.x - current.a.x) * current.ux + (geometry.b.z - current.a.z) * current.uz;
    const overlap = Math.max(0, Math.min(current.length, Math.max(start, end)) - Math.max(0, Math.min(start, end)));
    if (overlap < minOverlap) return;
    const mx = (geometry.a.x + geometry.b.x) / 2, mz = (geometry.a.z + geometry.b.z) / 2;
    const distance = Math.abs((mx - (current.a.x + current.b.x) / 2) * current.nx + (mz - (current.a.z + current.b.z) / 2) * current.nz);
    if (distance > maxDistance) return;
    const score = distance + parallelError * 1000 - overlap * 0.001;
    if (!best || score < best.score) best = { wall, overlap, distance, parallelError, score };
  });
  return opts.details ? best : (best && best.wall) || null;
}

function adjacentFloor(workspace, active, direction) {
  if (!active || (direction !== "above" && direction !== "below")) return null;
  const elevation = finite(active.elevation) ? active.elevation : 0;
  return (workspace.floors || []).filter((floor) => floor && floor.id !== active.id && (
    direction === "above" ? Number(floor.elevation) > elevation : Number(floor.elevation) < elevation
  )).sort((a, b) => Math.abs(Number(a.elevation) - elevation) - Math.abs(Number(b.elevation) - elevation))[0] || null;
}

/** Align the single selected live wall to an overlapping wall above/below. */
export function alignSelectedWallToReference(state, direction, options = {}) {
  if (!state || !state.workspace || !state.sel || state.sel.kind !== "wall" || !state.sel.ref) return null;
  let opts = options;
  let requestedDirection = direction;
  if (direction && typeof direction === "object") {
    opts = direction;
    requestedDirection = opts.direction;
  }
  opts = opts || {};
  const workspace = state.workspace;
  const active = floorById(workspace.activeFloor, workspace);
  let referenceFloor = typeof opts.referenceFloor === "object" ? opts.referenceFloor : floorById(opts.referenceFloor, workspace);
  if (!referenceFloor && (requestedDirection === "above" || requestedDirection === "below"))
    referenceFloor = adjacentFloor(workspace, active, requestedDirection);
  if (!referenceFloor) referenceFloor = floorById(workspace.referenceFloor, workspace);
  if (!referenceFloor || referenceFloor.id === workspace.activeFloor || !referenceFloor.scene) return null;

  const wall = state.sel.ref;
  const referenceNodes = sceneNodes(referenceFloor.scene);
  let referencedWall = opts.referenceWall;
  if (referencedWall != null && typeof referencedWall !== "object")
    referencedWall = sceneWalls(referenceFloor.scene).find((candidate) => candidate && candidate.id === referencedWall) || null;
  if (!referencedWall) referencedWall = findOverlappingReferenceWall(wall, referenceFloor.scene, {
    ...opts,
    currentNodes: state.nodes,
    referenceNodes,
  });
  if (!referencedWall) return null;
  const result = alignWallToFloor(wall, referencedWall, {
    ...opts,
    current: {
      ...(opts.current || {}),
      wallTypes: (opts.current && opts.current.wallTypes) || state.wallTypes || [],
    },
    reference: {
      ...(opts.reference || {}),
      wallTypes: (opts.reference && opts.reference.wallTypes) || sceneWallTypes(referenceFloor.scene),
    },
    currentNodes: state.nodes,
    referenceNodes,
  });
  if (!result) return null;
  if (opts.selectReference !== false) workspace.referenceFloor = referenceFloor.id;
  return { ...result, referenceFloor, direction: requestedDirection || null };
}

export function ensureFloors() {
  if (!Array.isArray(S.workspace.floors)) S.workspace.floors = [];
  if (typeof S.workspace.referenceFloor !== "string") S.workspace.referenceFloor = "";
  if (typeof S.workspace.showReferenceFloor !== "boolean") S.workspace.showReferenceFloor = false;
  if (!S.workspace.floors.length) {
    S.workspace.floors.push({ id: "floor-1", name: "Ground floor", elevation: 0, scene: clone(sceneObject(false)) });
    S.workspace.activeFloor = "floor-1";
  }
  return S.workspace.floors;
}

export function captureFloor() {
  ensureFloors();
  const floor = S.workspace.floors.find((f) => f.id === S.workspace.activeFloor);
  if (floor) floor.scene = clone(sceneObject(false));
  return floor;
}

export function addFloor(name, elevation, duplicate) {
  captureFloor();
  const source = duplicate ? sceneObject(false) : { nodes: [], walls: [], openings: [], items: [], markers: [], roomMeta: {}, idc: 1 };
  const floor = { id: makeId(), name: String(name || "New floor").slice(0, 60), elevation: Number(elevation) || 0, scene: clone(source) };
  S.workspace.floors.push(floor);
  return switchFloor(floor.id);
}

export function switchFloor(id) {
  if (id === S.workspace.activeFloor) return S.workspace.floors.find((f) => f.id === id);
  captureFloor();
  const floor = S.workspace.floors.find((f) => f.id === id);
  if (!floor) return null;
  // Snapshot workspace identity before applyData: a floor scene is plain model
  // data (sceneObject(false)), but older or hand-edited saves may still carry a
  // nested workspace — never let that clobber the multi-floor project state.
  const workspace = S.workspace;
  const previous = workspace.activeFloor;
  const previousReference = workspace.referenceFloor;
  workspace.activeFloor = id;
  if (workspace.referenceFloor === id) workspace.referenceFloor = previous;
  try {
    applyData(clone(floor.scene || {}));
  } catch (err) {
    workspace.activeFloor = previous;
    workspace.referenceFloor = previousReference;
    throw err;
  }
  S.workspace = workspace;
  S.workspace.activeFloor = id;
  if (typeof document !== "undefined" && document.body)
    document.body.dataset.projectRole = S.workspace.role || "owner";
  return floor;
}

export function removeFloor(id) {
  ensureFloors();
  if (S.workspace.floors.length <= 1) return false;
  const wasActive = id === S.workspace.activeFloor;
  S.workspace.floors = S.workspace.floors.filter((f) => f.id !== id);
  if (S.workspace.referenceFloor === id) {
    S.workspace.referenceFloor = "";
    S.workspace.showReferenceFloor = false;
  }
  if (wasActive) {
    S.workspace.activeFloor = "";
    switchFloor(S.workspace.floors[0].id);
  }
  return true;
}
