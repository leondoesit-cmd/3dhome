/* Stairs across storeys: the rise to the floor above, the jurisdiction's
   stair limits, a new flight's first design, and the stairwell voids bound to
   a flight (`stairsId`) that live in OTHER storeys' stored scenes.

   Stored scenes are interned by identity in the undo history, so every edit
   here goes through js/floors.js updateStairVoidsOnFloors (which clones the
   scene before touching it) or addSlabOpeningToFloor. */
import { S } from "./state.js";
import { getLang } from "./i18n.js";
import { addSlabOpeningToFloor, floorAbove, updateStairVoidsOnFloors } from "./floors.js";
import { applyStairMoveTo, stairVoidFields } from "./slab_openings.js";
import { codeProfile, defaultCodeProfileId, localized } from "./code_profiles.js";
import { applyStairConfig, autoStair, normalizeStair, stairPreset, stairRiserCount, stairRulesFrom, stairVariantShape } from "./stair_layout.js";

export var DEFAULT_STAIR_RISE = 300;
export var DEFAULT_STAIR_WIDTH = 100;

function floorsOf(state) {
  return (state && state.workspace && Array.isArray(state.workspace.floors)) ? state.workspace.floors : [];
}
function activeFloor(state) {
  var ws = state && state.workspace;
  return floorsOf(state).find(function (f) { return f.id === (ws && ws.activeFloor); }) || null;
}

/* Floor-to-floor height up to the storey above the active one, or null. */
export function riseToFloorAbove(state) {
  state = state || S;
  var above = floorAbove(state.workspace), active = activeFloor(state);
  if (!above || !active) return null;
  var rise = (Number(above.elevation) || 0) - (Number(active.elevation) || 0);
  return rise > 20 ? rise : null;
}

/* The active jurisdiction (the code check's project setting) and its stair
   limits as plain numbers. */
export function activeStairCode(state) {
  state = state || S;
  var id = state.workspace && state.workspace.codeProfile;
  var profile = codeProfile(id) || codeProfile(defaultCodeProfileId(getLang()));
  return { profile: profile, name: profile ? localized(profile.name, getLang()) : "", rules: stairRulesFrom(profile) };
}

/* A new flight's first design: fitted to the code for the rise to the floor
   above (300 cm with none), L-shaped for the L variant. The curved variant
   keeps its catalogue fan and gets none. */
export function designNewStairs(it, variant) {
  if (!it || it.type !== "stairs") return it;
  var shape = stairVariantShape(variant != null ? variant : it.variant);
  if (shape === "curved" || (it.configuration && it.configuration.stair)) return it;
  var above = riseToFloorAbove();
  var rise = above || DEFAULT_STAIR_RISE;
  var cfg = autoStair({ rise: rise, rules: activeStairCode().rules, preset: shape === "L" ? "L" : "straight", width: DEFAULT_STAIR_WIDTH, turn: "R", turnType: "landing", autoRise: !!above });
  applyStairConfig(it, cfg, rise);
  return it;
}

/* The variant of a flight changed: L applies the L preset, curved drops the
   design (the catalogue fan takes over), a finish-only variant keeps it. */
export function applyStairVariant(it, variant) {
  if (!it || it.type !== "stairs") return false;
  var shape = stairVariantShape(variant), cur = it.configuration && it.configuration.stair;
  if (shape === "curved") {
    if (!cur) return false;
    var rest = Object.assign({}, it.configuration);
    delete rest.stair;
    delete rest.shape;
    it.configuration = rest;
    return true;
  }
  if (shape === "L" && cur) {
    var c = normalizeStair(cur);
    var turn = (c.turns.find(function (t) { return t !== "S"; }) || "R");
    var next = stairPreset("L", { risers: stairRiserCount(c), width: c.width, going: c.going, turn: turn, turnType: c.turnType, autoSteps: c.autoSteps, autoRise: c.autoRise });
    if (c.autoSteps) next = autoStair({ rise: it.h, rules: activeStairCode().rules, preset: "L", width: c.width, turn: turn, turnType: c.turnType, autoRise: c.autoRise });
    applyStairConfig(it, next, it.h);
    return true;
  }
  if (!cur) {
    designNewStairs(it, variant);
    return !!(it.configuration && it.configuration.stair);
  }
  return false;
}

/* ---- voids bound to a flight, on any storey ---- */

function sceneItems(scene) {
  if (!scene) return [];
  if (Array.isArray(scene.items)) return scene.items;
  var sp = scene.spatial;
  return (sp && (sp.instances || sp.items)) || [];
}
function sceneVoids(scene) {
  if (!scene) return [];
  return (scene.slabOpenings || []).concat((scene.spatial && scene.spatial.slabOpenings) || []);
}

/* The flight a void is bound to and the storey it stands on, or null. */
export function findStairsForVoid(o, state) {
  state = state || S;
  if (!o || o.stairsId == null) return null;
  var ws = state.workspace, active = ws && ws.activeFloor;
  var own = (state.items || []).find(function (it) { return it.id === o.stairsId; });
  if (own) return { item: own, floor: activeFloor(state), active: true };
  var floors = floorsOf(state);
  for (var i = 0; i < floors.length; i++) {
    if (floors[i].id === active) continue;
    var hit = sceneItems(floors[i].scene).find(function (it) { return it && it.id === o.stairsId; });
    if (hit) return { item: hit, floor: floors[i], active: false };
  }
  return null;
}

function dropBound(list, it) {
  if (!Array.isArray(list)) return false;
  var before = list.length;
  for (var i = list.length - 1; i >= 0; i--) if (list[i] && list[i].stairsId === it.id) list.splice(i, 1);
  return list.length !== before;
}

/* Remove every void bound to these flights, on this storey and the others.
   The caller has pushed history; returns true when something went. */
export function removeStairVoids(items) {
  var changed = false;
  (items || []).forEach(function (it) {
    if (!it || it.type !== "stairs" || it.id == null) return;
    if (dropBound(S.slabOpenings, it)) changed = true;
    if (floorsOf(S).length && updateStairVoidsOnFloors(it, dropBound)) changed = true;
  });
  if (changed) S.dirty3D = true;
  return changed;
}

/* Cut (or re-seat) the stairwell for a flight on the storey above. A second
   press re-seats the void it already has instead of stacking another. */
export function cutStairVoidAbove(it) {
  var above = floorAbove(S.workspace);
  if (!above || !it) return null;
  var has = sceneVoids(above.scene).some(function (o) { return o && o.stairsId === it.id; });
  if (has) {
    updateStairVoidsOnFloors(it, applyStairMoveTo);
    return { floor: above, reseated: true };
  }
  addSlabOpeningToFloor(above.id, stairVoidFields(it));
  return { floor: above, reseated: false };
}
