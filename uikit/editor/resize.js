/* Resizing a node: which edges you may pull, where the handles are drawn, and
 * what the new size is once the constraints have had their say.
 *
 * WHICH AXIS. Both, unless someone says otherwise. An earlier version inferred
 * a single axis per node — you widen a sidebar, you heighten a toolbar — on
 * the grounds that the other edge was a promise the layout could not keep.
 * That reasoning predates the sizing rules in uikit.css, which write `width`
 * and `height` with `!important` and `flex: 0 0 auto` on any node the user has
 * actually sized. Both edges are honoured now, so offering one and hiding the
 * other is not caution, it is a missing feature: a panel whose height is fixed
 * by the host stylesheet had no way back.
 *
 * So the axis is decided, in order:
 *
 *   1. the registry entry or the node, when the host has said so
 *      (constraints.resize: "none" | "x" | "y" | "both")
 *   2. otherwise "both" — every edge, and every corner
 *
 * A host that means it can still pin an axis, and `"none"` still means no
 * handles at all rather than handles that do nothing. What changed is the
 * DEFAULT, which is the case nobody declared.
 *
 * primaryAxis() keeps the old inference for the places that want to know which
 * way a node naturally stretches — a container across its own orientation, a
 * leaf across its parent's — without that answer also being a restriction.
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
  const declared = declaredAxis(node);
  if (declared) return declared;
  return "both";
}

/* The host's word, from the node or from the registry entry behind it. Read
   through the entry too, because a command's constraints live in the catalogue
   the app publishes, not in the layout document the user edits. */
function declaredAxis(node) {
  if (!node) return null;
  const own = node.constraints && node.constraints.resize;
  if (own) return own;
  const entry = node.entry && node.entry.constraints && node.entry.constraints.resize;
  return entry || null;
}

/* Which way this node naturally stretches: a container across its own
   orientation, a leaf across its parent's. Not a restriction — a hint, for
   anything that wants to lead with one number (the inspector's size fields
   order themselves by it). */
export function primaryAxis(node, parent) {
  const declared = declaredAxis(node);
  if (declared && declared !== "both") return declared;
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
export function sizeFrom(start, handle, dx, dy, constraints, options) {
  const c = constraints || {};
  const grows = GROWS[handle];
  if (!grows) return null;

  const opts = options || {};
  let mx = dx;
  let my = dy;

  /* Aspect lock (Shift). Both axes follow whichever one the pointer has moved
     further along, so a corner drag keeps the box's shape and an EDGE drag
     picks up the second dimension it does not normally touch — which is how
     "hold Shift to keep the proportions" behaves in every design tool. */
  if (opts.aspect && start.w && start.h) {
    const ratio = start.w / start.h;
    const wantW = start.w + (grows.w || 1) * mx;
    const wantH = start.h + (grows.h || 1) * my;
    if (Math.abs(wantW - start.w) * (1 / ratio) >= Math.abs(wantH - start.h)) {
      my = ((wantW / ratio) - start.h) / (grows.h || 1);
    } else {
      mx = ((wantH * ratio) - start.w) / (grows.w || 1);
    }
  }

  const both = opts.aspect || opts.free;
  const out = {};
  if (grows.w || both) out.w = clamp(Math.round(start.w + (grows.w || 1) * mx), c.minW ?? 1, c.maxW);
  if (grows.h || both) out.h = clamp(Math.round(start.h + (grows.h || 1) * my), c.minH ?? 1, c.maxH);
  return Object.keys(out).length ? out : null;
}

const GROWS = Object.freeze({
  n: { w: 0, h: -1 }, s: { w: 0, h: 1 },
  w: { w: -1, h: 0 }, e: { w: 1, h: 0 },
  ne: { w: 1, h: -1 }, nw: { w: -1, h: -1 },
  se: { w: 1, h: 1 }, sw: { w: -1, h: 1 },
});

/* A free node keeps its far edge still. Pulling the west handle of a floating
 * panel makes it wider AND moves its left edge left; pulling the east handle
 * moves nothing. For a docked node the position belongs to the layout and this
 * is never called — which is the difference the comment above sizeFrom draws.
 */
export function rectFrom(start, handle, size) {
  const grows = GROWS[handle] || { w: 0, h: 0 };
  const out = {
    x: start.x,
    y: start.y,
    w: size && size.w != null ? size.w : start.w,
    h: size && size.h != null ? size.h : start.h,
  };
  if (grows.w < 0) out.x = start.x + (start.w - out.w);
  if (grows.h < 0) out.y = start.y + (start.h - out.h);
  return out;
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
