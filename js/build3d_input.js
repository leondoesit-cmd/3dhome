/* Pure rules for building from the 3D pane (js/planner_3d.js,
   js/build3d_ui.js), kept apart so Node can test them without a GPU.

   - touchCommitsOnRelease: a finger on a tool whose next press would commit
     previews while it is down and commits where it is lifted, so the finger
     never hides the spot it is placing (the 2D plan defers host placement to
     release for touch the same way).
   - groundSampleOk / planBounds: a ray close to the horizon meets the ground
     hundreds of metres away; such a sample is dropped and the last good one
     kept.
   - chainState: which of Finish / Undo point / Cancel a live chain offers. */

const CLICK_COMMIT_TOOLS = new Set([
  "door", "window", "passage", "point", "mepNode", "mepRoute", "roomstamp",
  "wallbreak", "walljoin", "wallreverse", "wallpaint",
]);

export function touchCommitsOnRelease(state) {
  if (!state) return false;
  const tool = state.tool;
  if (state.placeType && (!tool || tool === "select")) return true;
  if (CLICK_COMMIT_TOOLS.has(tool)) return true;
  if (tool === "wall") return !!state.drawing;
  if (tool === "rect" || tool === "slabvoid") return !!state.rectDraft;
  if (tool === "arcwall") return !!state.arcDraft;
  if (tool === "walloffset") return !!state.offsetDraft;
  return false;
}

function grow(b, x, z) {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return;
  if (x < b.x0) b.x0 = x;
  if (x > b.x1) b.x1 = x;
  if (z < b.z0) b.z0 = z;
  if (z > b.z1) b.z1 = z;
}

/** The plan's extent (corners, pieces, the draft in hand), or null when empty. */
export function planBounds(state) {
  const b = { x0: Infinity, z0: Infinity, x1: -Infinity, z1: -Infinity };
  if (!state) return null;
  for (const n of state.nodes || []) if (n) grow(b, n.x, n.z);
  for (const it of state.items || []) if (it) grow(b, it.x, it.z);
  if (state.previewPt) grow(b, state.previewPt.x, state.previewPt.z);
  return b.x0 <= b.x1 ? b : null;
}

export const GROUND_MARGIN = 3000; // cm beyond the plan a ground sample may still land

/** False for a ground point that ran off past the plan (a grazing ray). */
export function groundSampleOk(point, bounds, margin = GROUND_MARGIN) {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.z)) return false;
  if (!bounds) return Math.hypot(point.x, point.z) <= margin * 2;
  return point.x >= bounds.x0 - margin && point.x <= bounds.x1 + margin &&
    point.z >= bounds.z0 - margin && point.z <= bounds.z1 + margin;
}

/* A piece drag in the 3D pane (FURNITURE_PLACEMENT_PLAN.md Stage 2).
   The first hit under a moving cursor is the dragged piece itself, a wall
   behind it or the floor past that wall, so a drag samples the ray against
   the horizontal plane through the point it grabbed instead.

   itemDragGrabY: after a press, the height of that plane, or null when the
   press did not start a one-piece drag (0 when nothing was hit). */
export function itemDragGrabY(state, downHit) {
  if (state?.action !== "item" || !(state.sel?.kind === "item" && state.sel.ref ||
      state.sel?.kind === "items" && state.sel.refs?.length)) return null;
  const y = downHit && downHit.point ? Number(downHit.point.y) : 0;
  return Number.isFinite(y) ? y : 0;
}

/** Which sample a move uses: { plane, grabY } or null for the plain one.
 *  plane: the point comes from the grab plane (a piece drag in progress);
 *  otherwise only the drag field rides along (the fit-cabinet tool). */
export function dragSamplePlan(state, grabY) {
  if (!state) return null;
  if (state.action === "item" && grabY != null && Number.isFinite(grabY)) return { plane: true, grabY };
  if (state.action === "fitcab" || state.tool === "fitcab") return { plane: false, grabY: 0 };
  return null;
}

const dist3 = (a, b) => Math.hypot(a.x - b.x, (a.y || 0) - (b.y || 0), a.z - b.z);

/** The cursor is "on the wall": the ray meets the wall face no farther than
 *  the grab plane (a plane point at or beyond the face, or none at all — a ray
 *  rising above the plane). A sofa dragged over the floor in front of a far
 *  wall meets the floor first, so that wall is not aimed at. */
export function aimCounts(planePoint, rayOrigin, wallHit, eps = 1) {
  if (!wallHit || !wallHit.point || !rayOrigin) return false;
  if (!planePoint) return true;
  return dist3(planePoint, rayOrigin) >= dist3(wallHit.point, rayOrigin) - eps;
}

/** The plan point of a drag sample: the aimed wall face where the cursor is on
 *  a wall (continuous with the plane point where the two meet), else the
 *  plane point, else null (a grazing ray: keep the last sample). */
export function dragPlanPoint(planePoint, aim, bounds) {
  if (aim && Number.isFinite(aim.x) && Number.isFinite(aim.z)) return { x: aim.x, z: aim.z };
  if (planePoint && groundSampleOk(planePoint, bounds)) return { x: planePoint.x, z: planePoint.z };
  return null;
}

/** Plan pixels per cm at `dist` from a perspective camera; 1 when unknown. */
export function viewScale(heightPx, fovDeg, dist) {
  const s = heightPx / (2 * Math.tan((fovDeg || 50) * Math.PI / 360) * Math.max(1, dist || 0));
  return Number.isFinite(s) && s > 0 ? s : 1;
}

/* Pieces the cabinet designer opens as they are (js/ui_cabinet.js openCabinet
   converts any piece; these are the ones that already are casework). */
const CASEWORK = new Set(["cabsys", "wardrobe", "bookshelf", "dresser", "tvunit", "shoeCab", "filingCab"]);
export function isCabinetItem(it) {
  return !!it && (!!it.cab || CASEWORK.has(it.type));
}

/**
 * The 3D pane's selection bar (FURNITURE_PLACEMENT_PLAN.md 4d) for one selected
 * piece while no tool is armed: { rotate, flip, onWall, onWallOn, dup, del,
 * design, note } or null. Flip turns a free piece round; a wall-backed one
 * (hold / fit) keeps its back to the wall, so it gets none. `compact`: the
 * phone layout, whose dock already carries the selection verbs
 * (js/mobile_shell.js), keeps Design only. `onWallReady`: the planner action
 * `itemOnWall` exists (the slot stays empty until it does). `byType`:
 * js/item_orient.js onWallByType; a type that always hangs reads pressed and
 * fixed (onWallFixed: the button is disabled).
 */
export function selectionBar(state, compact, onWallReady, byType) {
  if (!state || (state.tool && state.tool !== "select") || state.placeType) return null;
  const it = state.sel && state.sel.kind === "item" ? state.sel.ref : null;
  if (!it) return null;
  const design = isCabinetItem(it);
  if (compact) return design ? { rotate: false, flip: false, onWall: false, onWallOn: false, onWallFixed: false, dup: false, del: false, design: true, note: false } : null;
  const free = !it.locked, backed = !!(it.hold || it.fit), held = !!(it.hold && it.hold.onWall);
  const fixed = !held && typeof byType === "function" && !!byType(it.type);
  return {
    rotate: free, flip: free && !backed, onWall: free && !!onWallReady, onWallOn: held || fixed, onWallFixed: fixed,
    dup: true, del: free, design, note: free,
  };
}

/* The next-step wording the 2D plan already shows for each tool (the same
   keys js/cad_hud.js and js/planner_chrome.js read through tTouch), so the 3D
   hint chip says nothing new. { key, touch } or null; touch: read through
   tTouch (which picks the "_touch" wording on a finger device). */
const HINT_KEYS = {
  wall: "hint_tool_wall", slabvoid: "hint_tool_slabvoid", walloffset: "hint_tool_offset",
  wallbite: "hint_tool_wallbite", wallbreak: "hint_tool_break", walljoin: "hint_tool_join",
  wallreverse: "hint_tool_reverse", wallpaint: "hint_tool_paint", erase: "hint_tool_erase",
  door: "hint_tool_opening", window: "hint_tool_opening", passage: "hint_tool_opening",
};
/** The hint chip says how an on-wall piece is dragged ("Drag across the
 *  wall · Shift: straight · Alt: free", js/wall_plane_strings.js) while one
 *  is selected and no tool is armed. `onWall`: js/item_orient.js isOnWall. */
export function wallDragHint(state, onWall) {
  if (!state || state.placeType || (state.tool && state.tool !== "select")) return false;
  const it = state.sel && state.sel.kind === "item" ? state.sel.ref : null;
  return !!(it && !it.locked && typeof onWall === "function" && onWall(it));
}

export function toolHintKey(state) {
  if (!state) return null;
  const tool = state.tool;
  if (state.placeType && (!tool || tool === "select")) return { key: "hint_tool_place", touch: true };
  if (tool === "rect") return { key: state.rectDraft ? "hint_tool_rect_next" : "hint_tool_rect", touch: true };
  if (tool === "roomstamp") {
    const g = state.roomGhost;
    if (g && g.blocked) return { key: "rp_overlapShort", touch: false };
    if (g && g.dock) return { key: g.dock.mode === "corridor" ? "hint_tool_roomstamp_corr"
      : g.dock.mode === "insert" ? "hint_tool_roomstamp_insert" : "hint_tool_roomstamp_dock", touch: true };
    return { key: "hint_tool_roomstamp", touch: true };
  }
  if (tool === "fitcab") return { key: "fitcab_hint_nowall", touch: false };
  return HINT_KEYS[tool] ? { key: HINT_KEYS[tool], touch: true } : null;
}

/**
 * The chain a tool has going in the 3D pane and what the strip offers for it:
 * { kind, finish, undo, cancel } or null when nothing is live.
 * `fitDragging`: the fit-cabinet tool's private drag (fit_cabinet_tool.js).
 */
export function chainState(state, fitDragging) {
  if (!state) return null;
  const tool = state.tool;
  if (tool === "wall" && state.drawing)
    return { kind: "wall", finish: (state.drawWalls || []).length > 0, undo: true, cancel: true };
  if (tool === "arcwall" && state.arcDraft) return { kind: "arcwall", finish: false, undo: true, cancel: true };
  if ((tool === "rect" || tool === "slabvoid") && state.rectDraft) return { kind: tool, finish: false, undo: true, cancel: true };
  const route = state.mep && state.mep.route;
  if (tool === "mepRoute" && route && route.pts && route.pts.length)
    return { kind: "mepRoute", finish: route.pts.length >= 2, undo: true, cancel: true };
  if (tool === "walloffset" && state.offsetDraft) return { kind: "walloffset", finish: false, undo: false, cancel: true };
  if (tool === "fitcab" && fitDragging) return { kind: "fitcab", finish: false, undo: false, cancel: true };
  return null;
}
