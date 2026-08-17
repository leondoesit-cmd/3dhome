// Semantic wall assemblies.
import { wallCurveGeom, normalizeWallKind, verticalSegments } from "./wall_curves.js";
//
// Units follow the rest of the planner: centimetres for length and square /
// cubic centimetres for quantity take-off.  A type's layers are authored from
// its exterior face to its interior face.  `layersReversed` mirrors that stack
// across the wall's reference line without reversing the wall endpoints.

const DEFAULT_HEIGHT = 270;
const DEFAULT_TYPE_ID = "generic";

const BUILTINS = [
  {
    id: "generic", name: "Generic wall", category: "generic",
    layers: [
      { id: "generic-core", thickness: 10, material: "generic-masonry", color: "#d8d3c8", role: "core", main: true, structural: true, rValue: 0.18 },
    ],
  },
  {
    id: "interior", name: "Interior masonry", category: "interior",
    layers: [
      { id: "interior-finish-a", thickness: 1.5, material: "plaster", color: "#f0ede5", role: "finish-exterior", rValue: 0.02 },
      { id: "interior-block", thickness: 9, material: "concrete-block", color: "#c8c5bb", role: "core", main: true, structural: false, rValue: 0.14 },
      { id: "interior-finish-b", thickness: 1.5, material: "plaster", color: "#f0ede5", role: "finish-interior", rValue: 0.02 },
    ],
  },
  {
    id: "exterior", name: "Insulated exterior", category: "exterior",
    layers: [
      { id: "exterior-render", thickness: 2, material: "render", color: "#ded9cc", role: "finish-exterior", rValue: 0.03 },
      { id: "exterior-insulation", thickness: 5, material: "rigid-insulation", color: "#eadb88", role: "insulation", rValue: 1.65 },
      { id: "exterior-block", thickness: 20, material: "concrete-block", color: "#bebbb2", role: "core", main: true, structural: true, rValue: 0.31 },
      { id: "exterior-plaster", thickness: 2, material: "plaster", color: "#f0ede5", role: "finish-interior", rValue: 0.03 },
    ],
  },
  {
    id: "concrete", name: "Reinforced concrete", category: "structural",
    layers: [
      { id: "concrete-core", thickness: 20, material: "reinforced-concrete", color: "#aaa9a4", role: "core", main: true, structural: true, rValue: 0.12 },
    ],
  },
  {
    id: "block", name: "Concrete block", category: "masonry",
    layers: [
      { id: "block-core", thickness: 20, material: "concrete-block", color: "#c5c1b6", role: "core", main: true, structural: true, rValue: 0.31 },
    ],
  },
  {
    id: "drywall", name: "Drywall partition", category: "interior",
    layers: [
      { id: "drywall-board-a", thickness: 1.25, material: "gypsum-board", color: "#e8e3d4", role: "finish-exterior", rValue: 0.08 },
      { id: "drywall-frame", thickness: 7.5, material: "steel-stud-air-cavity", color: "#c4ccd1", role: "core", main: true, structural: false, airGap: true, framing: { material: "galvanized-steel", spacing: 60 }, rValue: 0.22 },
      { id: "drywall-board-b", thickness: 1.25, material: "gypsum-board", color: "#e8e3d4", role: "finish-interior", rValue: 0.08 },
    ],
  },
  {
    id: "glass", name: "Glass wall", category: "glazing",
    layers: [
      { id: "glass-pane", thickness: 1.2, material: "tempered-glass", color: "#9fc4d6", role: "glazing", main: true, structural: false, rValue: 0.17 },
    ],
  },
  {
    id: "foundation", name: "Foundation wall", category: "foundation",
    layers: [
      { id: "foundation-waterproofing", thickness: 0.5, material: "waterproofing-membrane", color: "#343a40", role: "membrane-exterior", rValue: 0.01 },
      { id: "foundation-core", thickness: 30, material: "reinforced-concrete", color: "#999894", role: "core", main: true, structural: true, rValue: 0.18 },
    ],
  },
];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  Object.values(value).forEach(deepFreeze);
  return value;
}

/** Immutable templates.  `ensureWallTypes` installs mutable copies in state. */
export const BUILTIN_WALL_TYPES = deepFreeze(clone(BUILTINS));
// A discoverable alias for consumers that call their other catalogues CATALOG.
export const WALL_TYPE_CATALOG = BUILTIN_WALL_TYPES;

function positive(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function normalizedLayer(source, index) {
  const layer = source && typeof source === "object" ? source : {};
  const role = String(layer.role || (index === 0 ? "core" : "layer"));
  return {
    ...layer,
    id: String(layer.id || `${role}-${index + 1}`),
    thickness: positive(layer.thickness, 0.1),
    material: String(layer.material || "generic"),
    color: layer.color ?? "#d8d3c8",
    role,
    main: Boolean(layer.main),
    structural: Boolean(layer.structural),
    airGap: Boolean(layer.airGap),
    framing: layer.framing ?? false,
    rValue: Math.max(0, Number(layer.rValue) || 0),
  };
}

function normalizedLayers(layers, fallbackThickness = 10) {
  let result = Array.isArray(layers) && layers.length
    ? layers.map(normalizedLayer)
    : [normalizedLayer({ thickness: positive(fallbackThickness, 10), main: true, structural: true }, 0)];
  let firstMain = result.findIndex(layer => layer.main);
  if (firstMain < 0) {
    firstMain = result.findIndex(layer => layer.structural);
    if (firstMain < 0) firstMain = result.reduce((best, layer, index) => layer.thickness > result[best].thickness ? index : best, 0);
  }
  result = result.map((layer, index) => ({ ...layer, main: index === firstMain }));
  return result;
}

function typeThickness(type) {
  return (type?.layers || []).reduce((sum, layer) => sum + positive(layer.thickness, 0), 0);
}

function normalizedType(source, fallback) {
  const base = fallback || {};
  const type = source && typeof source === "object" ? source : {};
  const layers = normalizedLayers(type.layers || base.layers, type.thickness || base.thickness || 10);
  return {
    ...base,
    ...type,
    id: String(type.id || base.id || DEFAULT_TYPE_ID),
    name: String(type.name || base.name || type.id || base.id || "Wall"),
    category: String(type.category || base.category || "custom"),
    layers,
    thickness: layers.reduce((sum, layer) => sum + layer.thickness, 0),
  };
}

function catalogueValues(catalogue) {
  if (Array.isArray(catalogue)) return catalogue;
  if (catalogue && typeof catalogue === "object") return Object.entries(catalogue).map(([id, value]) => ({ id, ...(value || {}) }));
  return [];
}

function findType(state, id) {
  return (state.wallTypes || []).find(type => type.id === id) || null;
}

function canonicalDatum(value) {
  if (value && typeof value === "object") value = value.kind ?? value.id ?? value.offset;
  if (Number.isFinite(Number(value)) && value !== "" && value !== null) return Number(value);
  const key = String(value || "center").trim().toLowerCase().replace(/[ _]+/g, "-");
  const aliases = {
    centre: "center", "wall-center": "center", centerline: "center",
    outside: "exterior", outer: "exterior", "outside-face": "exterior", "exterior-face": "exterior",
    inside: "interior", inner: "interior", "inside-face": "interior", "interior-face": "interior",
    left: "side-a", start: "side-a", "face-a": "side-a",
    right: "side-b", end: "side-b", "face-b": "side-b",
    core: "main-center", "core-center": "main-center",
    "core-exterior": "main-exterior", "outside-main": "main-exterior", mainoutside: "main-exterior", "main-outside": "main-exterior",
    "core-interior": "main-interior", "inside-main": "main-interior", maininside: "main-interior", "main-inside": "main-interior",
  };
  return aliases[key] || key;
}

function normalizePhase(value) {
  const key = String(value || "new").trim().toLowerCase();
  if (["existing", "exist", "as-built", "as_built"].includes(key)) return "existing";
  if (["demolition", "demolished", "demolish", "demo", "removed"].includes(key)) return "demolition";
  return "new";
}

function normalizeWallInternal(wall, state) {
  if (!wall || typeof wall !== "object") return wall;
  const hadSemanticType = typeof wall.wallTypeId === "string" && Boolean(findType(state, wall.wallTypeId));
  if (!hadSemanticType) wall.wallTypeId = DEFAULT_TYPE_ID;
  const type = findType(state, wall.wallTypeId) || findType(state, DEFAULT_TYPE_ID);
  const legacyThickness = positive(wall.thickness, typeThickness(type) || 10);

  // A legacy wall's authored thickness is geometry, not a hint.  Represent a
  // non-default value as a per-wall assembly override so loading old drawings
  // cannot make rooms grow or shrink.
  if (!hadSemanticType && !Array.isArray(wall.layers) && Math.abs(legacyThickness - typeThickness(type)) > 1e-9) {
    wall.layers = normalizedLayers([{ id: "legacy-core", thickness: legacyThickness, material: "generic-masonry", color: "#d8d3c8", role: "core", main: true, structural: true }]);
  } else if (Array.isArray(wall.layers)) {
    wall.layers = normalizedLayers(wall.layers, legacyThickness);
  }

  const effective = Array.isArray(wall.layers) && wall.layers.length ? wall.layers : type.layers;
  wall.thickness = effective.reduce((sum, layer) => sum + positive(layer.thickness, 0), 0) || legacyThickness;
  wall.height = positive(wall.height, DEFAULT_HEIGHT);
  wall.datum = canonicalDatum(wall.datum ?? wall.referenceLine ?? "center");
  wall.layersReversed = Boolean(wall.layersReversed ?? wall.reverseLayers);
  wall.phase = normalizePhase(wall.phase ?? wall.renovationPhase);
  return wall;
}

/** Install/repair the project catalogue and migrate all legacy walls in-place. */
export function ensureWallTypes(state) {
  if (!state || typeof state !== "object") throw new TypeError("A project state object is required");
  const authored = catalogueValues(state.wallTypes);
  const seen = new Set();
  const result = [];

  for (const raw of authored) {
    if (!raw || raw.id == null || seen.has(String(raw.id))) continue;
    const fallback = BUILTIN_WALL_TYPES.find(type => type.id === String(raw.id));
    const type = normalizedType(raw, fallback);
    seen.add(type.id);
    result.push(type);
  }
  for (const builtin of BUILTIN_WALL_TYPES) {
    if (seen.has(builtin.id)) continue;
    result.push(normalizedType(clone(builtin)));
    seen.add(builtin.id);
  }
  state.wallTypes = result;
  if (!Array.isArray(state.walls)) state.walls = [];
  state.walls.forEach(wall => normalizeWallInternal(wall, state));
  return state.wallTypes;
}

/** Exact lookup. Unknown ids return null rather than silently changing type. */
export function wallTypeById(state, id) {
  ensureWallTypes(state);
  return findType(state, String(id)) || null;
}

/** Migrate/repair one wall in place and return it. */
export function normalizeWall(wall, state) {
  ensureWallTypes(state);
  return normalizeWallInternal(wall, state);
}

/** Effective physical layer order (side A to side B). */
export function wallLayers(wall, state) {
  normalizeWall(wall, state);
  const type = findType(state, wall.wallTypeId) || findType(state, DEFAULT_TYPE_ID);
  const layers = Array.isArray(wall.layers) && wall.layers.length ? wall.layers : type.layers;
  return wall.layersReversed ? layers.slice().reverse() : layers.slice();
}

export function wallThickness(wall, state) {
  const thickness = wallLayers(wall, state).reduce((sum, layer) => sum + layer.thickness, 0);
  wall.thickness = thickness;
  return thickness;
}

export function wallMainLayer(wall, state) {
  return wallLayers(wall, state).find(layer => layer.main) || null;
}

function intrinsicBands(wall, state) {
  const layers = wallLayers(wall, state);
  const total = layers.reduce((sum, layer) => sum + layer.thickness, 0);
  let cursor = -total / 2;
  return layers.map((layer, index) => {
    const start = cursor;
    cursor += layer.thickness;
    return { layer, index, start, end: cursor, center: (start + cursor) / 2 };
  });
}

/**
 * Offset of a reference surface from the assembly's geometric centre.
 * Positive offsets point from side A to side B (the layer ordering returned by
 * `wallLayers`). Numeric datums are accepted for custom reference planes.
 */
export function wallDatumOffset(wall, state, datum) {
  normalizeWall(wall, state);
  const key = canonicalDatum(datum ?? wall.datum);
  if (typeof key === "number") return key;
  const bands = intrinsicBands(wall, state);
  const half = wallThickness(wall, state) / 2;
  const main = bands.find(band => band.layer.main) || { start: -half, end: half, center: 0 };
  const reversed = Boolean(wall.layersReversed);
  const exterior = reversed ? half : -half;
  const interior = -exterior;
  const mainExterior = reversed ? main.end : main.start;
  const mainInterior = reversed ? main.start : main.end;
  switch (key) {
    case "side-a": return -half;
    case "side-b": return half;
    case "exterior": return exterior;
    case "interior": return interior;
    case "main-exterior": return mainExterior;
    case "main-interior": return mainInterior;
    case "main-center": return main.center;
    default: return 0;
  }
}

/** Mirror the assembly while keeping endpoints and the named datum stationary. */
export function flipWall(wall) {
  if (!wall || typeof wall !== "object") return wall;
  wall.layersReversed = !Boolean(wall.layersReversed ?? wall.reverseLayers);
  delete wall.reverseLayers;
  return wall;
}

/** Apply a catalogue assembly, retaining height and (by default) datum kind. */
export function setWallType(wall, typeId, state, { preserveDatum = true } = {}) {
  normalizeWall(wall, state);
  const type = findType(state, String(typeId));
  if (!type) return wall;
  const datum = wall.datum;
  wall.wallTypeId = type.id;
  delete wall.layers;
  wall.thickness = typeThickness(type);
  wall.datum = preserveDatum ? datum : "center";
  return wall;
}

/**
 * Layer extents relative to the wall's authored reference line.  Several clear
 * aliases are exposed because plan, renderer and take-off code speak in
 * different terms (`start/end`, `sideA/sideB`, or `offsetA/offsetB`).
 */
export function wallLayerBands(wall, state) {
  const datumOffset = wallDatumOffset(wall, state);
  return intrinsicBands(wall, state).map(band => {
    const start = band.start - datumOffset;
    const end = band.end - datumOffset;
    return {
      ...band.layer,
      layer: band.layer,
      index: band.index,
      start,
      end,
      from: start,
      to: end,
      sideA: start,
      sideB: end,
      offsetA: start,
      offsetB: end,
      center: (start + end) / 2,
    };
  });
}

export function wallPhase(wall) {
  return normalizePhase(wall?.phase ?? wall?.renovationPhase);
}

export function setWallPhase(wall, phase) {
  if (!wall || typeof wall !== "object") return wall;
  wall.phase = normalizePhase(phase);
  delete wall.renovationPhase;
  return wall;
}

function wallLength(state, wall) {
  const geometry = wallCurveGeom(wall, state.nodes);
  return geometry ? geometry.length : positive(wall.length, 0);
}

function openingAreaForWall(state, wall, length, height) {
  let area = 0;
  for (const opening of state.openings || []) {
    if (opening?.wall !== wall.id && opening?.wallId !== wall.id) continue;
    const width = Math.min(length, positive(opening.width ?? opening.w, 0));
    const sill = Math.max(0, Number(opening.sill ?? opening.y ?? 0) || 0);
    const openingHeight = Math.max(0, Number(opening.height ?? opening.h) || 0);
    const clippedHeight = Math.max(0, Math.min(height, sill + openingHeight) - Math.min(height, sill));
    area += width * clippedHeight;
  }
  // Openings can overlap; this is intentionally an approximate take-off, but
  // never subtract more face than the wall owns.
  return Math.min(length * height, area);
}

/**
 * Material take-off grouped by material + semantic layer role.  Returned units
 * are cm, cm2 and cm3. Each group also breaks quantities down by renovation
 * phase while preserving one convenient flat total.
 */
export function wallMaterialQuantities(state) {
  ensureWallTypes(state);
  const grouped = new Map();
  for (const wall of state.walls) {
    if (normalizeWallKind(wall) === "roomDivider") continue;
    const length = wallLength(state, wall);
    const solids = verticalSegments(wall, state.wallTypes);
    const height = solids.reduce((sum, segment) => sum + (segment.solid === false ? 0 : Math.max(0, segment.top - segment.bottom)), 0)
      || positive(wall.height, DEFAULT_HEIGHT);
    if (!(length > 0 && height > 0)) continue;
    const grossArea = length * height;
    const openingArea = openingAreaForWall(state, wall, length, height);
    const netArea = Math.max(0, grossArea - openingArea);
    const phase = wallPhase(wall);
    for (const layer of wallLayers(wall, state)) {
      const layerName = layer.role || layer.id;
      const key = `${layer.material}|${layerName}`;
      let group = grouped.get(key);
      if (!group) {
        group = {
          key,
          material: layer.material,
          layer: layerName,
          role: layer.role,
          length: 0,
          grossArea: 0,
          openingArea: 0,
          netArea: 0,
          volume: 0,
          wallCount: 0,
          wallIds: [],
          phases: {},
        };
        grouped.set(key, group);
      }
      group.length += length;
      group.grossArea += grossArea;
      group.openingArea += openingArea;
      group.netArea += netArea;
      group.volume += netArea * layer.thickness;
      group.wallCount += 1;
      group.wallIds.push(wall.id);
      const phaseQuantity = group.phases[phase] || { length: 0, netArea: 0, volume: 0, wallCount: 0 };
      phaseQuantity.length += length;
      phaseQuantity.netArea += netArea;
      phaseQuantity.volume += netArea * layer.thickness;
      phaseQuantity.wallCount += 1;
      group.phases[phase] = phaseQuantity;
    }
  }
  return Array.from(grouped.values()).sort((a, b) => a.key.localeCompare(b.key));
}
