// Pure domain command for placing one catalog item. Browser integrations inject
// the runtime factory/orientation services; Node callers only need dimensions.
import { tabletopPlacement } from "../placement_resolver.js";
import { S } from "../state.js";
import { itemVSpan } from "../furniture_api.js";

export const ITEM_PLACE_CODES = Object.freeze([
  "INVALID_ITEM_TYPE",
  "ITEM_TYPE_NOT_FOUND",
  "INVALID_ITEM_POSITION",
  "INVALID_ITEM_DIMENSIONS",
  "ITEM_CREATE_FAILED",
  "PLACEMENT_GEOMETRY_CHANGED",
]);

function finite(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function fail(reason) {
  return { ok: false, reason: reason };
}

function versionOf(env) {
  if (env && env.version && typeof env.version.current === "function")
    return env.version.current();
  if (env && env.version != null && typeof env.version !== "object") return env.version;
  return null;
}

function catalogOf(env) {
  return env && (env.itemCatalog || env.catalog || env.services && env.services.itemCatalog);
}

function catalogEntry(catalog, type) {
  if (!catalog) return null;
  if (catalog instanceof Map) return catalog.get(type) || null;
  return Object.prototype.hasOwnProperty.call(catalog, type) ? catalog[type] : null;
}

function dimension(entry, shortName, longName) {
  if (!entry || typeof entry !== "object") return NaN;
  var value = entry[shortName] != null ? entry[shortName] : entry[longName];
  return Number(value);
}

function snap2(value) {
  return Math.round(value / 2) * 2;
}

function surfaceTop(host, state) {
  // A probe must not create a parametric definition during command preview.
  return state === S ? itemVSpan({ ...host, id: undefined }).hi : (host.elev || 0) + host.h;
}

export function prepareItemPlace(params, env) {
  params = params || {};
  var type = typeof params.type === "string" ? params.type.trim() : "";
  if (!type) return fail("INVALID_ITEM_TYPE");
  var entry = catalogEntry(catalogOf(env), type);
  if (!entry) return fail("ITEM_TYPE_NOT_FOUND");
  var x = Number(params.x), z = Number(params.z);
  if (!finite(x) || !finite(z)) return fail("INVALID_ITEM_POSITION");
  var w = dimension(entry, "w", "width"),
    d = dimension(entry, "d", "depth"),
    h = dimension(entry, "h", "height");
  if (!finite(w) || w <= 0 || !finite(d) || d <= 0 || !finite(h) || h <= 0)
    return fail("INVALID_ITEM_DIMENSIONS");
  var rot = params.rot == null ? 0 : Number(params.rot);
  if (!finite(rot)) return fail("INVALID_ITEM_POSITION");
  const pose = { type, x: snap2(x), z: snap2(z), rot, w, d };
  const surface = tabletopPlacement(pose, env.state?.items || [], params.rot != null);
  if (surface && !surface.fits) return fail("INVALID_ITEM_POSITION");

  return {
    ok: true,
    plan: {
      command: "item.place",
      expectedVersion: params.expectedVersion != null ? params.expectedVersion : versionOf(env),
      params: {
        type: type,
        x: snap2(x),
        z: snap2(z),
        rot: surface ? surface.rot : rot,
        ...(surface && { on: surface.host.id, elev: surfaceTop(surface.host, env.state) }),
        rotationSpecified: params.rot != null,
        w: w,
        d: d,
        h: h,
      },
    },
  };
}

export function previewItemPlace(plan) {
  var params = plan && plan.params;
  if (!params) return null;
  return {
    kind: "item",
    type: params.type,
    center: { x: params.x, z: params.z },
    width: params.w,
    depth: params.d,
    height: params.h,
    rotation: params.rot,
    ...(params.on != null && { on: params.on, elev: params.elev }),
    style: "ghost-valid",
  };
}

export function applyItemPlace(plan, env) {
  var state = env && env.state,
    params = plan && plan.params,
    services = env && env.services || {};
  if (!state || !Array.isArray(state.items) || !params) return fail("ITEM_CREATE_FAILED");
  // A batch may have moved the support or put another lamp on it since preview.
  const surface = tabletopPlacement(params, state.items, true);
  if (surface?.host.id !== params.on || (surface && !surface.fits)) return fail("PLACEMENT_GEOMETRY_CHANGED");

  var item;
  if (typeof services.createItem === "function") {
    item = surface
      ? services.createItem(params.type, params.x, params.z, params.rot, surface.host)
      : services.createItem(params.type, params.x, params.z, params.rot);
  } else {
    if (!finite(Number(state.idc))) return fail("ITEM_CREATE_FAILED");
    item = {
      id: state.idc++,
      type: params.type,
      x: params.x,
      z: params.z,
      w: params.w,
      d: params.d,
      h: params.h,
      rot: params.rot,
    };
  }
  if (!item || item.id == null || !finite(Number(item.x)) || !finite(Number(item.z)))
    return fail("ITEM_CREATE_FAILED");

  if (params.rotationSpecified) { item.rot=params.rot; item.rotUser=true; }
  if (surface && item.on == null) {
    item.on = surface.host.id;
    item.elev = surfaceTop(surface.host, state);
  }
  if (!surface && typeof services.applyAutoFace === "function" && !params.rotationSpecified)
    services.applyAutoFace(item, params.x, params.z, {});
  state.items.push(item);
  return {
    ok: true,
    created: [{ kind: "item", id: item.id }],
    changed: [],
    effects: {
      dirty3D: true,
      refreshTree: true,
      refreshInspector: true,
      updateCost: true,
      events: [{ type: "planner-item-created", entityId: item.id }],
    },
  };
}

export const itemPlaceCommand = Object.freeze({
  id: "item.place",
  failureCodes: ITEM_PLACE_CODES,
  prepare: prepareItemPlace,
  preview: previewItemPlace,
  apply: applyItemPlace,
});
