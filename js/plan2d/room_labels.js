/* The drafting plan's room name + area labels, moved out of js/plan2d.js's
   model pass. A room the user is working in drops its label: the room under
   the pointer, a selected room, and the room holding a hovered or selected
   piece of furniture. That is where the clearances, sizes and selection
   chrome are drawn, and the label printed straight through them. */
import { fmtAreaM2, fmtLen } from "../display_units.js";
import { pointInPoly, roomHidden, roomName } from "../geometry.js";
import { t } from "../i18n.js";
import { roomClearArea } from "../room_area.js";
import { S } from "../state.js";
import { label } from "../plan2d/constraints.js";
import { roomInteriorSize } from "../plan2d/dim_chains.js";

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

function drawRoomLabels(rooms) {
  var pts = labelFocusPoints(), keys = selectedRoomKeys();
  rooms.forEach(function (r) {
    if (roomLabelFocused(r, pts, keys)) return;
    var nm = roomName(r.key),
      clearArea = roomClearArea(S, r),
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
    if (nm) label(r.cx, r.cz - half, nm, isHid ? "#9a9289" : "#33312c", true);
    if (S.showDims)
      label(r.cx, r.cz + (nm ? half : 0), areaText, isHid ? "#a49c93" : "#46504f", !nm);
  });
}

export { drawRoomLabels, roomLabelFocused };
