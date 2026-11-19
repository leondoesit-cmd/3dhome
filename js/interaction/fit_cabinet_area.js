/* Draw cabinet: the drawn-box gestures of the fitcab tool (a floor marquee
   in 3D and 2D, a rectangle on a wall face in 3D), split out of
   js/interaction/fit_cabinet_tool.js, which owns the draft and the commit.

   An `area` is { mode: "floor"|"wall", in3D, start, cur, facing, wall? }:
   floor: start / cur are plan points; wall: wall = { id, frame, pick } and
   start / cur are { s, y } on that face. The decisions are pure
   (js/fit_cabinet_area.js); the box is js/fit_cabinet.js fitAreaBox's. */
import { S } from "../state.js";
import { fitAreaBox, fitFootprint } from "../fit_cabinet.js";
import {
  facingFromRay, floorRectFromSamples, rayFloorPoint, wallFaceFrame, wallRectFromSamples, wallSample,
} from "../fit_cabinet_area.js";
import { groundSampleOk, planBounds } from "../build3d_input.js";
import { fitText } from "../fit_cabinet_strings.js";
import { fmtLen } from "../display_units.js";
import { t } from "../i18n.js";

var AREA_OK = "#26b99a", AREA_BAD = "#ed705a";

function areaFloorPoint(view, px, pz) {
  var ray = view && view.drag && view.drag.ray;
  var p = ray ? rayFloorPoint(ray) : null;
  if (p && groundSampleOk(p, planBounds(S))) return p;
  return Number.isFinite(px) && Number.isFinite(pz) ? { x: px, z: pz } : null;
}

/** Start a box. mode from classifyFitPress; view = plannerInputView() (3D) or null. */
export function startArea(mode, walls, view, px, pz) {
  var drag = view && view.drag, ray = drag && drag.ray;
  if (mode === "wall") {
    var aim = drag && drag.aim, hit = view && view.hit;
    var id = aim ? aim.wallId : hit && hit.ref && hit.ref.id;
    var at = aim ? { x: aim.x, y: aim.y, z: aim.z } : hit && hit.point;
    var wall = id != null && (walls || []).find(function (w) { return String(w.id) === String(id); });
    var side = aim ? { x: aim.nx, z: aim.nz } : facingFromRay(ray);
    var frame = wall && at && wallFaceFrame(wall, at, side);
    if (frame && Number.isFinite(at.y)) {
      var s = { s: (at.x - frame.ox) * frame.ux + (at.z - frame.oz) * frame.uz, y: at.y };
      return { mode: "wall", in3D: true, wall: { id: wall.id, frame: frame, pick: { x: at.x, z: at.z } }, start: s, cur: s };
    }
    mode = "floor"; // a curved wall, or no usable hit: the floor under it
  }
  var p = areaFloorPoint(view, px, pz);
  if (!p) return null;
  return { mode: "floor", in3D: !!view, start: p, cur: p, facing: view ? facingFromRay(ray) : null };
}

/** Follow the pointer; returns how far (cm) the box's corner is from its start. */
export function moveArea(area, view, px, pz) {
  if (!area) return 0;
  if (area.mode === "wall") {
    var drag = view && view.drag;
    var q = wallSample(area.wall.frame, area.wall.id, drag && drag.aim, drag && drag.ray);
    if (q) area.cur = q;
    return Math.hypot(area.cur.s - area.start.s, area.cur.y - area.start.y);
  }
  var p = area.in3D ? areaFloorPoint(view, px, pz) : Number.isFinite(px) && Number.isFinite(pz) ? { x: px, z: pz } : null;
  if (p) area.cur = p;
  return Math.hypot(area.cur.x - area.start.x, area.cur.z - area.start.z);
}

/** fitAreaBox's answer for the area as it stands. */
export function areaResult(area, walls, openings, opts) {
  if (!area) return null;
  if (area.mode === "wall") {
    var w = area.wall;
    return fitAreaBox("wall", wallRectFromSamples(w.frame, w.id, w.pick, area.start, area.cur), walls, openings, opts);
  }
  return fitAreaBox("floor", floorRectFromSamples(area.start, area.cur), walls, openings,
    Object.assign({}, opts, area.facing ? { facing: area.facing } : null));
}

var AREA_HINT = { opening: "fitcab_hint_opening", "too-narrow": "fitcab_hint_narrow", "no-area": "fitcab_hint_narrow", "no-wall": "fitcab_hint_nowall" };
var AREA_FLASH = { opening: "f_fitcab_opening", "too-narrow": "f_fitcab_narrow", "no-area": "f_fitcab_narrow", "no-wall": "f_fitcab_nowall" };
/** The short words for why a box would build nothing. */
export function areaHint(reason) {
  if (reason === "too-shallow") return fitText("tooShallow");
  if (reason === "too-short") return fitText("tooShort");
  return t(AREA_HINT[reason] || "fitcab_hint_narrow");
}
/** The flash for a released box that builds nothing. */
export function areaFlash(reason) {
  if (reason === "too-shallow") return fitText("f_tooShallow");
  if (reason === "too-short") return fitText("f_tooShort");
  return t(AREA_FLASH[reason] || "f_fitcab_narrow");
}
/** "w × d" on the floor, "w × h" on a wall, from the box when it fits. */
export function areaSizeText(area, res) {
  if (res && res.ok) return fmtLen(res.w) + " × " + fmtLen(area.mode === "wall" ? res.h : res.d);
  if (!area) return "";
  if (area.mode === "wall") return fmtLen(Math.abs(Math.round(area.cur.s - area.start.s))) + " × " + fmtLen(Math.abs(Math.round(area.cur.y - area.start.y)));
  return fmtLen(Math.abs(Math.round(area.cur.x - area.start.x))) + " × " + fmtLen(Math.abs(Math.round(area.cur.z - area.start.z)));
}

/* ---- the marquee ---------------------------------------------------------- */

function areaMarquee(area) {
  if (area.mode === "wall") {
    var f = area.wall.frame, a = area.start, b = area.cur;
    var at = function (s, y) { return { x: f.ox + f.ux * s + f.nx * 0.5, y: Math.max(0, y), z: f.oz + f.uz * s + f.nz * 0.5 }; };
    return [at(a.s, a.y), at(b.s, a.y), at(b.s, b.y), at(a.s, b.y)];
  }
  var p = area.start, q = area.cur;
  return [{ x: p.x, y: 1, z: p.z }, { x: q.x, y: 1, z: p.z }, { x: q.x, y: 1, z: q.z }, { x: p.x, y: 1, z: q.z }];
}
function areaMid(pts) {
  var m = { x: 0, y: 0, z: 0 };
  pts.forEach(function (p) { m.x += p.x / pts.length; m.y += p.y / pts.length; m.z += p.z / pts.length; });
  return m;
}

/** The 2D plan: the dashed marquee (floor), the box it makes, a size pill.
 *  P(p) -> screen point; pill(c, x, y, text, bg) draws one. */
export function paintArea2D(c, P, area, res, pill) {
  var ok = res && res.ok;
  c.save();
  if (area.mode === "floor") {
    var m = areaMarquee(area).map(P);
    c.setLineDash([6, 4]); c.lineWidth = 1.5; c.strokeStyle = ok ? AREA_OK : AREA_BAD;
    c.beginPath(); m.forEach(function (p, i) { if (i) c.lineTo(p.x, p.y); else c.moveTo(p.x, p.y); }); c.closePath(); c.stroke();
  }
  var at = null;
  if (ok) {
    var pts = fitFootprint(res, res).map(P);
    c.setLineDash([]); c.lineWidth = 2; c.strokeStyle = AREA_OK; c.fillStyle = "rgba(38,185,154,.14)";
    c.beginPath(); pts.forEach(function (p, i) { if (i) c.lineTo(p.x, p.y); else c.moveTo(p.x, p.y); }); c.closePath();
    c.fill(); c.stroke();
    at = { x: (pts[0].x + pts[2].x) / 2, y: (pts[0].y + pts[2].y) / 2 };
  } else if (area.mode === "floor") {
    at = P({ x: area.cur.x, z: area.cur.z });
    at = { x: at.x, y: at.y - 26 };
  }
  if (at) pill(c, at.x, at.y, ok ? areaSizeText(area, res) : areaHint(res && res.reason), ok ? null : "rgba(196,72,52,.92)");
  c.restore();
}

/** The 3D HUD (planner-overlay-3d detail `o`): the dashed marquee on the floor
 *  or the wall, the box's wire at its real height in Outline mode, the pill. */
export function paintArea3D(o, area, res) {
  var c = o.context, ok = res && res.ok, m = areaMarquee(area);
  c.save();
  c.setLineDash([6, 4]);
  o.path(m, ok ? AREA_OK : AREA_BAD, true);
  c.setLineDash([]);
  if (ok && o.wire !== false) {
    var foot = fitFootprint(res, res), y0 = (res.elev || 0) + 1, y1 = (res.elev || 0) + res.h;
    var lo = foot.map(function (p) { return { x: p.x, y: y0, z: p.z }; });
    var hi = foot.map(function (p) { return { x: p.x, y: y1, z: p.z }; });
    o.path(lo, AREA_OK, true);
    o.path(hi, AREA_OK, true);
    for (var i = 0; i < 4; i++) o.path([lo[i], hi[i]], AREA_OK);
  }
  c.restore();
  o.label(areaMid(m), ok ? areaSizeText(area, res) : areaHint(res && res.reason) + " · " + areaSizeText(area, null));
}
