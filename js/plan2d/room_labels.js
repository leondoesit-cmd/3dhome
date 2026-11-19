/* The drafting plan's room name + area labels, moved out of js/plan2d.js's
   model pass. A room the user is working in drops its label: the room under
   the pointer, a selected room, and the room holding a hovered or selected
   piece of furniture. That is where the clearances, sizes and selection
   chrome are drawn, and the label printed straight through them. */
import { fmtAreaM2, fmtLen } from "../display_units.js";
import { pointInPoly, roomHidden, roomName } from "../geometry.js";
import { t } from "../i18n.js";
import { roomAreaPass } from "../room_area.js";
import { S } from "../state.js";
import { label, labelSize } from "../plan2d/constraints.js";
import { roomInteriorSize } from "../plan2d/dim_chains.js";
import { mepStampObstacles, roomScreenPoly, stampSlot, STAMP_FAINT } from "../plan2d/stamp_slots.js";
import { rotatePx, sx, sz } from "../plan_view.js";

/* The plan points the user is focused on right now. */
function labelFocusPoints() {
  var pts = [];
  if (!S.action && S.tool === "select" && S.hoverPt) pts.push(S.hoverPt);
  if (S.hoverItem) pts.push(S.hoverItem);
  var s = S.sel;
  if (s && (s.kind === "item" || s.kind === "items")) {
    (s.refs || [s.ref]).forEach(function (it) {
      if (it && isFinite(it.x) && isFinite(it.z)) pts.push(it);
    });
  }
  return pts;
}

function selectedRoomKeys() {
  var s = S.sel;
  if (!s || (s.kind !== "room" && s.kind !== "rooms")) return [];
  return s.refs || [s.ref];
}

function roomLabelFocused(r, pts, keys) {
  if (keys.indexOf(r.key) !== -1) return true;
  if (!r.pts || r.pts.length < 3) return false;
  for (var i = 0; i < pts.length; i++)
    if (pointInPoly(pts[i].x, pts[i].z, r.pts)) return true;
  return false;
}

/* With services as the work set a stamp steps out from under the device
   badges (js/plan2d/stamp_slots.js): the shift label() is drawn with, or
   undefined when nothing covers it. */
function stampShift(r, nm, areaText, half, badges) {
  var boxes = [];
  if (nm) {
    var a = labelSize(nm, true), pa = rotatePx(sx(r.cx), sz(r.cz - half));
    boxes.push({ x: pa.x, y: pa.y, w: a.w, h: a.h });
  }
  if (S.showDims) {
    var b = labelSize(areaText, !nm), pb = rotatePx(sx(r.cx), sz(r.cz + (nm ? half : 0)));
    boxes.push({ x: pb.x, y: pb.y, w: b.w, h: b.h });
  }
  if (!boxes.length) return undefined;
  var off = stampSlot(boxes, badges, roomScreenPoly(r));
  if (!off) return { dx: 0, dy: 0, alpha: STAMP_FAINT };
  return off[0] || off[1] ? { dx: off[0], dy: off[1] } : undefined;
}

function focusedRoomLabels(rooms) {
  var pts = labelFocusPoints(), keys = selectedRoomKeys();
  return rooms.map(function (r) { return roomLabelFocused(r, pts, keys); });
}

function drawRoomLabels(rooms) {
  var focused = focusedRoomLabels(rooms);
  var badges = mepStampObstacles();
  var areaFor = roomAreaPass(S);
  rooms.forEach(function (r, i) {
    if (focused[i]) return;
    var nm = roomName(r.key),
      clearArea = areaFor(r),
      areaText = clearArea.area == null
        ? t("room_area_reference_short", { area: fmtAreaM2(r.area / 10000) })
        : t("room_area_usable_short", { area: fmtAreaM2(clearArea.area) }),
      isHid = roomHidden(r.key),
      // the room's clear width x depth leads the area line: the number a plan
      // is read for inside a room, in place of a dimension on every wall
      // (js/plan2d/dim_chains.js leaves those walls unlabelled)
      size = S.showDims && roomInteriorSize(r.key),
      // the two pills stack a fixed screen distance apart at any zoom
      half = 12 / (S.SC > 0 ? S.SC : 1);
    if (size)
      areaText = fmtLen(size.width, { domain: "plan", suffix: false }) + " × " +
        fmtLen(size.depth, { domain: "plan", suffix: false }) + "  ·  " + areaText;
    var shift = badges ? stampShift(r, nm, areaText, half, badges) : undefined;
    if (nm) label(r.cx, r.cz - half, nm, isHid ? "#9a9289" : "#33312c", true, shift);
    if (S.showDims)
      label(r.cx, r.cz + (nm ? half : 0), areaText, isHid ? "#a49c93" : "#46504f", !nm, shift);
  });
  return focused;
}

export { drawRoomLabels, focusedRoomLabels, roomLabelFocused };
