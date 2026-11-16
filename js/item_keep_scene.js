/* Kept distances in the planner, the reading half: the plan (S) as the pure
   model's plain scene (js/item_keep.js, js/item_keep_plan.js).
   - keepScene(): straight physical walls, every piece's real outline and known
     height band, the openings, the ceiling; rebuilt only when
     js/measure_cache.js clearanceSceneSig() or the ceiling changes.
   - keepItem(it): the piece itself, its own height band measured.
   The painters read only this (js/keep_paint.js); the edits are in
   js/item_keep_edit.js. */
import { S } from "./state.js";
import { wallGeom } from "./geometry.js";
import { itemOutline } from "./item_outline.js";
import { itemVSpan, knownVSpan } from "./furniture.js";
import { ceilingHeight } from "./elevation.js";
import { clearanceSceneSig } from "./measure_cache.js";
import { buildKeepScene, keepItemOf } from "./item_keep_plan.js";

function n(v, d) { v = Number(v); return Number.isFinite(v) ? v : d; }

var sceneMemo = { key: null, scene: null };
/** The plan as js/item_keep.js reads it (cached on the scene signature). */
export function keepScene() {
  var ceil = n(ceilingHeight(), NaN), key = clearanceSceneSig() + "|" + ceil;
  if (sceneMemo.key === key && sceneMemo.scene) return sceneMemo.scene;
  var scene = buildKeepScene({ walls: S.walls, openings: S.openings, items: S.items, ceiling: ceil }, {
    geom: wallGeom,
    outline: function (it) { return itemOutline(it); },
    span: function (it) { return knownVSpan(it); },
  });
  sceneMemo = { key: key, scene: scene };
  return scene;
}
/** The piece itself, at its pose now (its own height band measured). */
export function keepItem(it) {
  return keepItemOf(it, itemOutline(it), itemVSpan(it));
}
