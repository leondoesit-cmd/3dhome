/* Resizing a node: which edges you may pull, where the handles are drawn, and
 * what the new size is once the constraints have had their say.
 *
 * WHICH AXIS. Not every edge of every node is meaningful. You resize a
 * sidebar's WIDTH and a toolbar's HEIGHT; pulling the other edge of either is
 * a gesture the layout cannot honour, and offering a handle for it is a
 * promise the editor then breaks. So the axis is decided, in order:
 *
 *   1. the registry entry, when the host has said (constraints.resize)
 *   2. a container's own orientation — a column is resized across, a row down
 *   3. a leaf's PARENT orientation, for the same reason one step up
 *
 * The tree is not used to infer this geometrically. It cannot be: the layout
 * document is a logical hierarchy, and in this app #left-sidebar is a child of
 * n:app in the document while sitting two elements deeper in the DOM. Reading
 * an axis from where boxes happen to fall would get that exactly backwards.
 *
 * Everything here is a pure function of rectangles, so the arithmetic that
 * decides what a drag means is testable without a browser.
 */

export const ALL_HANDLES = Object.freeze(["n", "ne", "e", "se", "s", "sw", "w", "nw"]);
const X_HANDLES = Object.freeze(["w", "e"]);
const Y_HANDLES = Object.freeze(["n", "s"]);

const isContainer = (node) => node && node.type !== "item" && node.type !== "separator";

export function resizeAxis(node, parent) {
  const declared = node && node.constraints && node.constraints.resize;
  if (declared) return declared;
  if (node && node.type === "float") return "both";
  if (isContainer(node)) return orientOf(node) === "col" ? "x" : "y";
  return orientOf(parent) === "col" ? "y" : "x";
}

function orientOf(node) {
  if (!node) return "row";
  return node.orient === "col" || node.flow === "col" ? "col" : "row";
}

export function handlesFor(node, parent) {
  const axis = resizeAxis(node, parent);
  if (axis === "none" || axis === false) return [];
  if (axis === "both") return ALL_HANDLES.slice();
  return axis === "x" ? X_HANDLES.slice() : Y_HANDLES.slice();
}

/* Where each handle is painted, in viewport coordinates. Centred ON the edge
   rather than inside it, so the grab area straddles the boundary the user is
   aiming at — the same reason a window manager's resize border overhangs. */
export function handleRects(rect, size) {
  const s = size || 9;
  const half = s / 2;
  const mid = { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
  const left = rect.x, right = rect.x + rect.w;
  const top = rect.y, bottom = rect.y + rect.h;
  const at = { n: [mid.x, top], ne: [right, top], e: [right, mid.y], se: [right, bottom],
               s: [mid.x, bottom], sw: [left, bottom], w: [left, mid.y], nw: [left, top] };
  const out = {};
  for (const key of ALL_HANDLES) {
    out[key] = { x: at[key][0] - half, y: at[key][1] - half, w: s, h: s };
  }
  return out;
}

export function clamp(value, lo, hi) {
  let out = value;
  if (lo != null && out < lo) out = lo;
  if (hi != null && out > hi) out = hi;
  return out;
}

/* The size a drag produces. A west or north handle grows the box as the
 * pointer moves toward negative coordinates, which is why those deltas are
 * subtracted rather than added.
 *
 * Only w/h are returned. A docked node's position belongs to the layout, not
 * to the drag: pulling a sidebar's left edge makes it wider, it does not move
 * the sidebar. A float is the exception and gets its rect adjusted by the
 * caller, since there the position IS the user's.
 */
export function sizeFrom(start, handle, dx, dy, constraints) {
  const c = constraints || {};
  const grows = {
    n: { w: 0, h: -1 }, s: { w: 0, h: 1 },
    w: { w: -1, h: 0 }, e: { w: 1, h: 0 },
    ne: { w: 1, h: -1 }, nw: { w: -1, h: -1 },
    se: { w: 1, h: 1 }, sw: { w: -1, h: 1 },
  }[handle] || { w: 0, h: 0 };

  const out = {};
  if (grows.w) out.w = clamp(Math.round(start.w + grows.w * dx), c.minW, c.maxW);
  if (grows.h) out.h = clamp(Math.round(start.h + grows.h * dy), c.minH, c.maxH);
  return Object.keys(out).length ? out : null;
}

/* Which handle a point is over, if any. Checked against the drawn rects so the
   hit area and the visible affordance are the same thing by construction. */
export function handleAt(point, rect, handles, size) {
  if (!handles || !handles.length) return null;
  const rects = handleRects(rect, size);
  for (const key of handles) {
    const r = rects[key];
    if (point.x >= r.x && point.x <= r.x + r.w && point.y >= r.y && point.y <= r.y + r.h) return key;
  }
  return null;
}

export const CURSORS = Object.freeze({
  n: "ns-resize", s: "ns-resize", e: "ew-resize", w: "ew-resize",
  ne: "nesw-resize", sw: "nesw-resize", nw: "nwse-resize", se: "nwse-resize",
});
