// Parametric framing and material take-off for semantic wall assemblies.
//
// Length units are centimetres, volumes are cubic centimetres. Stations (`s`)
// are measured along the wall centre-line, so the same API works for straight
// and circular walls without chord-length approximations.

import { pointAtWall, tangentAtWall, verticalSegments, wallCurveGeom, wallProfileHeight } from "./wall_curves.js";
import { wallAxisNodes } from "./geometry.js";
import { ensureWallTypes, wallLayers, wallPhase } from "./wall_types.js";

const EPS = 1e-7;

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function positive(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function clamp(value, low, high) {
  return Math.max(low, Math.min(high, value));
}

function openingWallId(opening) {
  return opening?.wall ?? opening?.wallId;
}

function openingStation(opening, length) {
  const raw = opening?.s ?? opening?.station ?? opening?.distance ?? opening?.offset;
  return clamp(number(raw, length / 2), 0, length);
}

function normalizedOpenings(state, wall, length) {
  return (state.openings || [])
    .filter(opening => opening && openingWallId(opening) === wall.id)
    .map((opening, index) => {
      const width = clamp(positive(opening.width ?? opening.w, 0), 0, length);
      const s = openingStation(opening, length);
      const bottom = Math.max(0, number(opening.sill ?? opening.y ?? opening.bottom, 0));
      const height = Math.max(0, number(opening.height ?? opening.h, 0));
      return {
        source: opening,
        id: opening.id ?? `opening-${index + 1}`,
        type: String(opening.type || (bottom <= EPS ? "door" : "window")),
        s,
        width,
        left: clamp(s - width / 2, 0, length),
        right: clamp(s + width / 2, 0, length),
        bottom,
        top: bottom + height,
      };
    })
    .filter(opening => opening.width > EPS && opening.top - opening.bottom > EPS)
    .sort((a, b) => a.left - b.left || a.right - b.right);
}

function mergeRanges(ranges, length) {
  const sorted = ranges
    .map(range => [clamp(range[0], 0, length), clamp(range[1], 0, length)])
    .filter(range => range[1] - range[0] > EPS)
    .sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const range of sorted) {
    const previous = merged[merged.length - 1];
    if (previous && range[0] <= previous[1] + EPS) previous[1] = Math.max(previous[1], range[1]);
    else merged.push(range.slice());
  }
  return merged;
}

function remainingSegments(length, excluded) {
  const segments = [];
  let cursor = 0;
  for (const [start, end] of mergeRanges(excluded, length)) {
    if (start - cursor > EPS) segments.push([cursor, start]);
    cursor = Math.max(cursor, end);
  }
  if (length - cursor > EPS) segments.push([cursor, length]);
  return segments;
}

function configFor(layer) {
  const authored = layer.framing === true ? {} : (layer.framing || {});
  const studWidth = positive(
    authored.studWidth ?? authored.memberWidth ?? authored.width,
    5,
  );
  const spacing = positive(authored.spacing ?? authored.onCenter ?? authored.oc, 60);
  const plateHeight = positive(authored.plateHeight ?? authored.trackHeight, Math.min(studWidth, 5));
  const headerHeight = positive(authored.headerHeight, studWidth * 2);
  const topPlateCount = Math.max(0, Math.round(number(
    authored.topPlateCount ?? authored.topPlates,
    authored.doubleTopPlate ? 2 : 1,
  )));
  const bottomPlateCount = Math.max(0, Math.round(number(authored.bottomPlateCount ?? authored.bottomPlates, 1)));
  return {
    ...authored,
    material: String(authored.material || layer.material || "framing"),
    spacing,
    studWidth,
    plateHeight,
    headerHeight,
    headerDepth: positive(authored.headerDepth, layer.thickness),
    topPlateCount,
    bottomPlateCount,
    jackStudCount: Math.max(0, Math.round(number(authored.jackStudCount ?? authored.jackStuds, 1))),
    plates: authored.plates !== false,
    headers: authored.headers !== false,
    sills: authored.sills !== false,
    cripples: authored.cripples !== false,
  };
}

function framingBands(state, wall) {
  const types = new Map((state.wallTypes || []).map(type => [type.id, type]));
  const segments = verticalSegments(wall, types);
  const primaryId = wall.wallTypeId ?? wall.typeId ?? wall.wallType;
  const bands = [];
  for (const segment of segments) {
    if (segment.solid === false) continue;
    let layers;
    if ((segment.role === "body" || segment.wallTypeId === primaryId) && Array.isArray(wall.layers) && wall.layers.length)
      layers = wallLayers(wall, state);
    else
      layers = segment.wallType?.layers || types.get(segment.wallTypeId)?.layers || (segment.role === "body" ? wallLayers(wall, state) : []);
    for (const layer of layers || []) {
      if (!layer?.framing) continue;
      bands.push({
        segment,
        layer,
        config: configFor(layer),
        bottom: Math.max(0, number(segment.bottom, 0)),
        top: Math.max(0, number(segment.top, wall.height || 270)),
      });
    }
  }
  return bands.filter(band => band.top - band.bottom > EPS);
}

function gridStations(length, spacing) {
  const values = [0];
  for (let s = spacing; s < length - EPS; s += spacing) values.push(s);
  if (length > EPS) values.push(length);
  return values;
}

function insideAny(value, ranges, allowance = 0) {
  return ranges.some(([start, end]) => value > start - allowance + EPS && value < end + allowance - EPS);
}

function stationSamples(left, right, spacing, width) {
  const result = [];
  for (let s = Math.ceil((left + width) / spacing) * spacing; s < right - width - EPS; s += spacing)
    result.push(s);
  if (!result.length && right - left > width * 2 + EPS) result.push((left + right) / 2);
  return result;
}

function frameAt(wall, nodes, s) {
  const point = pointAtWall(wall, s, nodes);
  const tangent = tangentAtWall(wall, s, nodes);
  if (!point || !tangent) return {};
  return {
    point: { x: point.x, z: point.z },
    tangent: { x: tangent.x, z: tangent.z },
    normal: { x: -tangent.z, z: tangent.x },
  };
}

function profileTop(wall, length, s) {
  // Supplying the measured curve length also makes normalized `t` profile
  // controls work for walls that do not persist a redundant length property.
  return wallProfileHeight({ ...wall, length }, s, wall.height || 270);
}

function makeMember(context, authored) {
  const member = {
    id: `${context.wall.id}:${context.layer.id || context.layer.role || "frame"}:${authored.kind}:${context.nextId++}`,
    wallId: context.wall.id,
    phase: context.phase,
    layerId: context.layer.id ?? null,
    layerRole: context.layer.role ?? null,
    material: context.config.material,
    ...authored,
    depth: authored.depth ?? context.layer.thickness,
    width: authored.width,
  };
  member.length = Math.max(0, number(member.length, 0));
  member.volume = member.length * Math.max(0, number(member.width, 0)) * Math.max(0, number(member.depth, 0));
  if (Number.isFinite(member.s)) Object.assign(member, frameAt(context.wall, context.nodes, member.s));
  else if (Number.isFinite(member.start) && Number.isFinite(member.end)) {
    member.s = (member.start + member.end) / 2;
    Object.assign(member, frameAt(context.wall, context.nodes, member.s));
    member.startPoint = pointAtWall(context.wall, member.start, context.nodes);
    member.endPoint = pointAtWall(context.wall, member.end, context.nodes);
  }
  context.members.push(member);
  return member;
}

function addVertical(context, kind, s, bottom, top, openingId = null) {
  const cappedTop = Math.min(top, profileTop(context.wall, context.length, s));
  if (cappedTop - bottom <= EPS) return null;
  return makeMember(context, {
    kind,
    openingId,
    s,
    bottom,
    top: cappedTop,
    length: cappedTop - bottom,
    width: context.config.studWidth,
  });
}

function addHorizontal(context, kind, start, end, bottom, height, openingId = null, depth) {
  start = clamp(start, 0, context.length);
  end = clamp(end, 0, context.length);
  if (end - start <= EPS || height <= EPS) return null;
  return makeMember(context, {
    kind,
    openingId,
    start,
    end,
    bottom,
    top: bottom + height,
    length: end - start,
    width: height,
    depth,
  });
}

function buildBand(state, wall, geometry, openings, band, nextId) {
  const { layer, config } = band;
  const context = {
    wall,
    // real timber stands on the wall's own line: a wall stored on its measured
    // face has its centreline half a thickness off the node the graph keeps
    nodes: wallAxisNodes(wall, state.nodes),
    length: geometry.length,
    phase: wallPhase(wall),
    layer,
    config,
    members: [],
    nextId,
  };
  const plate = config.plateHeight;
  const bodyBottom = band.bottom + (config.plates ? config.bottomPlateCount * plate : 0);
  const topPlateDepth = config.plates ? config.topPlateCount * plate : 0;
  const relevant = openings.filter(opening => opening.bottom < band.top - EPS && opening.top > band.bottom + EPS);
  const voidRanges = relevant.map(opening => [opening.left, opening.right]);

  for (const s of gridStations(geometry.length, config.spacing)) {
    if (insideAny(s, voidRanges, config.studWidth / 2)) continue;
    addVertical(context, "stud", s, bodyBottom, band.top - topPlateDepth);
  }

  if (config.plates) {
    const bottomVoids = relevant
      .filter(opening => opening.bottom <= band.bottom + config.bottomPlateCount * plate + EPS)
      .map(opening => [opening.left, opening.right]);
    for (let index = 0; index < config.bottomPlateCount; index++) {
      for (const [start, end] of remainingSegments(geometry.length, bottomVoids))
        addHorizontal(context, "bottomPlate", start, end, band.bottom + index * plate, plate);
    }
    for (let index = 0; index < config.topPlateCount; index++)
      addHorizontal(context, "topPlate", 0, geometry.length, band.top - (index + 1) * plate, plate);
  }

  for (const opening of relevant) {
    const leftKing = clamp(opening.left - config.studWidth / 2, 0, geometry.length);
    const rightKing = clamp(opening.right + config.studWidth / 2, 0, geometry.length);
    addVertical(context, "kingStud", leftKing, bodyBottom, band.top - topPlateDepth, opening.id);
    addVertical(context, "kingStud", rightKing, bodyBottom, band.top - topPlateDepth, opening.id);

    const headerBottom = clamp(opening.top, band.bottom, band.top);
    const headerHeight = Math.min(config.headerHeight, Math.max(0, band.top - topPlateDepth - headerBottom));
    if (config.headers && headerHeight > EPS)
      addHorizontal(
        context, "header",
        opening.left - config.studWidth, opening.right + config.studWidth,
        headerBottom, headerHeight, opening.id, config.headerDepth,
      );

    const jackTop = Math.min(headerBottom, band.top - topPlateDepth);
    for (let index = 0; index < config.jackStudCount; index++) {
      const inset = (index + 0.5) * config.studWidth;
      addVertical(context, "jackStud", clamp(opening.left - inset, 0, geometry.length), bodyBottom, jackTop, opening.id);
      addVertical(context, "jackStud", clamp(opening.right + inset, 0, geometry.length), bodyBottom, jackTop, opening.id);
    }

    const sillBottom = clamp(opening.bottom - plate, band.bottom, band.top);
    if (config.sills && opening.bottom > bodyBottom + EPS)
      addHorizontal(context, "sill", opening.left, opening.right, sillBottom, plate, opening.id);

    if (config.cripples) {
      const samples = stationSamples(opening.left, opening.right, config.spacing, config.studWidth);
      for (const s of samples) {
        if (opening.bottom > bodyBottom + EPS)
          addVertical(context, "crippleStud", s, bodyBottom, Math.min(sillBottom, band.top), opening.id);
        const crippleBottom = Math.min(band.top, headerBottom + headerHeight);
        addVertical(context, "crippleStud", s, crippleBottom, band.top - topPlateDepth, opening.id);
      }
    }
  }

  return { ...band, members: context.members, nextId: context.nextId };
}

/** Group member count, linear length and volume by phase/material/layer/kind. */
export function groupFramingQuantities(members) {
  const groups = new Map();
  for (const member of members || []) {
    const key = [member.phase || "new", member.material || "framing", member.layerId || "", member.kind || "member"].join("|");
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        phase: member.phase || "new",
        material: member.material || "framing",
        layerId: member.layerId ?? null,
        kind: member.kind || "member",
        count: 0,
        length: 0,
        volume: 0,
        wallIds: [],
      };
      groups.set(key, group);
    }
    group.count += 1;
    group.length += number(member.length, 0);
    group.volume += number(member.volume, 0);
    if (!group.wallIds.includes(member.wallId)) group.wallIds.push(member.wallId);
  }
  return Array.from(groups.values()).sort((a, b) => a.key.localeCompare(b.key));
}

/**
 * Build framing members for one wall. The returned studs/plates/headers arrays
 * are convenient views over `members`; `quantities` is ready for schedules.
 */
export function wallFramingMembers(state, wall, options = {}) {
  if (!state || !wall) return {
    wallId: wall?.id ?? null, length: 0, layers: [], members: [], studs: [], plates: [], headers: [], sills: [], quantities: [], totals: { count: 0, length: 0, volume: 0 },
  };
  ensureWallTypes(state);
  const geometry = wallCurveGeom(wall, state.nodes);
  if (!geometry) return {
    wallId: wall.id, length: 0, layers: [], members: [], studs: [], plates: [], headers: [], sills: [], quantities: [], totals: { count: 0, length: 0, volume: 0 },
  };
  const openings = normalizedOpenings(state, wall, geometry.length);
  let nextId = 1;
  const layers = framingBands(state, wall).map(band => {
    const built = buildBand(state, wall, geometry, openings, band, nextId);
    nextId = built.nextId;
    return built;
  });
  const members = layers.flatMap(layer => layer.members);
  const quantities = groupFramingQuantities(members);
  const result = {
    wallId: wall.id,
    phase: wallPhase(wall),
    geometry,
    length: geometry.length,
    openings,
    layers,
    members,
    studs: members.filter(member => member.kind === "stud" || member.kind.endsWith("Stud")),
    plates: members.filter(member => member.kind === "topPlate" || member.kind === "bottomPlate"),
    headers: members.filter(member => member.kind === "header"),
    sills: members.filter(member => member.kind === "sill"),
    quantities,
    totals: {
      count: members.length,
      length: members.reduce((sum, member) => sum + member.length, 0),
      volume: members.reduce((sum, member) => sum + member.volume, 0),
    },
  };
  if (options.includeGeometry === false) delete result.geometry;
  return result;
}

/** Short alias useful to mesh and inspector callers. */
export const wallFraming = wallFramingMembers;

/** Aggregate framing and grouped take-off quantities for an entire project. */
export function wallFramingTakeoff(state, options = {}) {
  ensureWallTypes(state);
  const walls = (state.walls || []).map(wall => wallFramingMembers(state, wall, options));
  const members = walls.flatMap(result => result.members);
  return {
    walls,
    members,
    quantities: groupFramingQuantities(members),
    totals: {
      wallCount: walls.filter(result => result.members.length).length,
      count: members.length,
      length: members.reduce((sum, member) => sum + member.length, 0),
      volume: members.reduce((sum, member) => sum + member.volume, 0),
    },
  };
}
