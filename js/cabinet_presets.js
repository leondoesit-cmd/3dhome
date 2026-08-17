// User cabinet presets belong to the spatial project so they travel with
// save/load, visits and history — not with this browser's localStorage.
// A one-time read of the old localStorage key seeds a project that has none.

import { S } from "./state.js";
import { installSpatialProject, touchSpatialProject } from "./core/spatial_project.js";
import { markDirty } from "./persist.js";

export const LS_CAB_PRESETS = "home3d_cab_presets";
var MAX = 30;

function cloneList(list) {
  try {
    return JSON.parse(JSON.stringify(Array.isArray(list) ? list : []));
  } catch (e) {
    return [];
  }
}

function migrateLocalPresets() {
  try {
    if (typeof localStorage === "undefined") return [];
    return cloneList(JSON.parse(localStorage.getItem(LS_CAB_PRESETS) || "[]"));
  } catch (e) {
    return [];
  }
}

export function cabinetPresets(state) {
  var st = state || S;
  var spatial = installSpatialProject(st);
  if (!Array.isArray(spatial.cabinetPresets)) {
    spatial.cabinetPresets = migrateLocalPresets().slice(0, MAX);
  }
  return spatial.cabinetPresets;
}

export function setCabinetPresets(list, state) {
  var st = state || S;
  var spatial = installSpatialProject(st);
  spatial.cabinetPresets = cloneList(list).slice(0, MAX);
  touchSpatialProject(st);
  markDirty();
  return spatial.cabinetPresets;
}

export function saveCabinetPreset(entry, state) {
  var list = cabinetPresets(state).slice();
  list.unshift(entry);
  return setCabinetPresets(list, state);
}

export function deleteCabinetPreset(index, state) {
  var list = cabinetPresets(state).slice();
  list.splice(index, 1);
  return setCabinetPresets(list, state);
}
