// Domain command for placing one door, window, or passage on one explicit wall.
// This module deliberately knows nothing about history, selection, rendering,
// DOM events, or the global planner state.
import { pointAtWall, wallCurveGeom } from "../wall_curves.js";

export const OPENING_PLACE_CODES = Object.freeze([
  "AMBIGUOUS_TARGET",
  "HOST_WALL_NOT_FOUND",
  "INVALID_HOST_WALL",
  "INVALID_OPENING_TYPE",
  "INVALID_OPENING_VALUE",
  "OPENING_OUT_OF_BOUNDS",
  "OPENING_OVERLAP",
  "HOST_WALL_LOCKED",
]);

export const OPENING_DEFAULTS = Object.freeze({
  door: Object.freeze({ width: 90, height: 205, sill: 0 }),
  window: Object.freeze({ width: 120, height: 120, sill: 90 }),
  passage: Object.freeze({ width: 120, height: 210, sill: 0 }),
});

function finite(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function stateOf(env) {
  return env && env.state;
}

function versionOf(env) {
  if (env && env.version && typeof env.version.current === "function")
    return env.version.current();
  if (env && env.version != null && typeof env.version !== "object") return env.version;
  return null;
}

function wallOf(state, wallId) {
  var walls = state && Array.isArray(state.walls) ? state.walls : [];
  for (var i = 0; i < walls.length; i++)
    if (String(walls[i].id) === String(wallId)) return walls[i];
  return null;
}

/* `S.nodes` is the location line. Openings sit on the wall centreline; a
   face-authored straight wall therefore needs the same derived translation as
   geometry.wallAxisNodes(). Kept state-parameterized here so Node tests and
   non-browser command clients never depend on global S. */
function wallAxisNodes(wall, nodes) {
  if (!wall || wall.loc !== "face" || (wall.dimSide !== 1 && wall.dimSide !== -1) ||
      wall.geometry || wall.curve || wall.bulge) return nodes;
  var a = nodes[wall.a], b = nodes[wall.b];
  if (!a || !b) return nodes;
  var dx = b.x - a.x, dz = b.z - a.z, length = Math.hypot(dx, dz) || 1;
  var offset = -wall.dimSide * (Number(wall.thickness) || 0) / 2;
  var out = {};
  out[wall.a] = { x: a.x + (-dz / length) * offset, z: a.z + (dx / length) * offset };
  out[wall.b] = { x: b.x + (-dz / length) * offset, z: b.z + (dx / length) * offset };
  return out;
}

function fail(reason) {
  return { ok: false, reason: reason };
}

export function prepareOpeningPlace(params, env) {
  params = params || {};
  var state = stateOf(env);
  if (params.wallId == null) return fail("AMBIGUOUS_TARGET");
  var wall = wallOf(state, params.wallId);
  if (!wall) return fail("HOST_WALL_NOT_FOUND");
  if(state.workspace?.role==="viewer"||state.structLocked||state.layers?.structure?.locked||wall.locked)return fail("HOST_WALL_LOCKED");
  var type = String(params.type || "");
  var defaults = OPENING_DEFAULTS[type];
  if (!defaults) return fail("INVALID_OPENING_TYPE");
  var nodes = state && Array.isArray(state.nodes) ? state.nodes : [];
  var geometry = wallCurveGeom(wall, wallAxisNodes(wall, nodes));
  if (!geometry || !finite(geometry.L) || geometry.L <= 0) return fail("INVALID_HOST_WALL");

  var width = params.width == null ? defaults.width : Number(params.width);
  var height = params.height == null ? defaults.height : Number(params.height);
  var sill = params.sill == null ? defaults.sill : Number(params.sill);
  var s = Number(params.s);
  if (!finite(width) || width <= 0 || !finite(height) || height <= 0 ||
      !finite(sill) || sill < 0 || !finite(s)) return fail("INVALID_OPENING_VALUE");

  const margin=Math.max(1,Number(wall.thickness||10)/2);
  if(width+2*margin>geometry.L+1e-6||sill+height>Number(wall.height||270)+1e-6)return fail("OPENING_OUT_OF_BOUNDS");
  // The pointer preview and commit share this safe station; dimensions never shrink.
  s = clamp(s, width/2+margin, geometry.L-width/2-margin);
  if((state.openings||[]).some(o=>String(o.wall)===String(wall.id)&&Math.abs(o.s-s)<(o.width+width)/2+1&&Math.min((o.sill||0)+o.height,sill+height)>Math.max(o.sill||0,sill)))return fail("OPENING_OVERLAP");
  return {
    ok: true,
    plan: {
      command: "opening.place",
      expectedVersion: params.expectedVersion != null ? params.expectedVersion : versionOf(env),
      params: {
        wallId: wall.id,
        type: type,
        s: s,
        width: width,
        height: height,
        sill: sill,
      },
    },
  };
}

export function previewOpeningPlace(plan, env) {
  var state = stateOf(env), params = plan && plan.params;
  var wall = params && wallOf(state, params.wallId);
  if (!wall) return null;
  var nodes = state && Array.isArray(state.nodes) ? state.nodes : [];
  var center = pointAtWall(wall, params.s, wallAxisNodes(wall, nodes));
  if (!center || !finite(center.x) || !finite(center.z)) return null;
  return {
    kind: "opening",
    wallId: wall.id,
    center: { x: center.x, z: center.z },
    width: params.width,
    height: params.height,
    style: "ghost-valid",
  };
}

export function applyOpeningPlace(plan, env) {
  var state = stateOf(env), params = plan && plan.params;
  var wall = params && wallOf(state, params.wallId);
  if (!wall) return fail("HOST_WALL_NOT_FOUND");
  const checked=prepareOpeningPlace(params,env);
  if(!checked.ok)return checked;
  if(checked.plan.params.s!==params.s)return fail("OPENING_OUT_OF_BOUNDS");
  if (!Array.isArray(state.openings) || !finite(Number(state.idc)))
    return fail("INVALID_OPENING_VALUE");
  var opening = {
    id: state.idc++,
    type: params.type,
    wall: wall.id,
    s: params.s,
    width: params.width,
    height: params.height,
    sill: params.sill,
  };
  state.openings.push(opening);
  return {
    ok: true,
    created: [{ kind: "opening", id: opening.id }],
    changed: [{ kind: "wall", id: wall.id }],
    effects: {
      dirty3D: true,
      refreshTree: true,
      refreshInspector: true,
      events: [{ type: "planner-opening-created", entityId: opening.id }],
    },
  };
}

export const openingPlaceCommand = Object.freeze({
  id: "opening.place",
  failureCodes: OPENING_PLACE_CODES,
  prepare: prepareOpeningPlace,
  preview: previewOpeningPlace,
  apply: applyOpeningPlace,
});
