/* Hover inputs used by the model pass. Wall-end halves, warning glows,
   probes, marker/node cards and cursor measurements all live on the HUD. */
import { S } from "../state.js";
import { focusedRoomLabels } from "./room_labels.js";

let paintedRooms = null, paintedFocus = null, paintedWall, paintedConstraint;

function dimensionHoverWall() {
  const wall = S.showDims && S.hoverWall;
  return wall && wall.id != null ? wall.id : null;
}

// The annotation band yields its actual room-label focus flags (null for
// presentation, undefined when the entire band was hidden).
export function rememberModelHover(rooms, focused) {
  paintedRooms = rooms;
  paintedFocus = focused;
  paintedConstraint = S.conHover;
  paintedWall = dimensionHoverWall();
}

export function modelHoverUnchanged() {
  if (!paintedRooms) return false;
  if (paintedFocus === undefined) return true;
  if (paintedConstraint !== S.conHover || paintedWall !== dimensionHoverWall()) return false;
  return !paintedFocus || focusedRoomLabels(paintedRooms).every((v, i) => v === paintedFocus[i]);
}
