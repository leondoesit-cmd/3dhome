/* Pointer-driven move: where a drop lands, and what it looks like on the way.
 *
 * The geometry is separated from the pointer plumbing so the part that decides
 * WHERE a thing goes can be tested as arithmetic. Everything below the state
 * machine is a pure function of rectangles and a point.
 */

/* Which way a container lays its children out. Read from the resolved node
   where it is stated, and otherwise inferred from the children themselves —
   a bar that has never been told it is a row still behaves like one, and
   guessing from the boxes is more reliable than defaulting. */
export function axisOf(node, rects) {
  /* A menu is a column of items even though it is a group — groups default
     to a row (toolbar clusters), and withDefaults would stamp that on every
     menu. Measuring X then makes dragging Undo onto Redo a no-op. */
  const kind = node && node.entry && node.entry.kind;
  if (kind === "menu") return "col";
  if (node && node.orient === "col") return "col";
  if (node && node.orient === "row") return "row";
  if (node && node.flow === "col") return "col";
  if (node && node.flow === "row") return "row";
  if (!rects || rects.length < 2) return "row";
  const spreadX = Math.abs(rects[rects.length - 1].x - rects[0].x);
  const spreadY = Math.abs(rects[rects.length - 1].y - rects[0].y);
  return spreadY > spreadX ? "col" : "row";
}

/* The index a drop at `point` should insert at, given the children's boxes in
 * document order.
 *
 * Counting midpoints rather than testing "is the pointer inside child N" is
 * what makes the gap between two children a valid target, and what makes the
 * far end of a bar mean "last" instead of "nothing".
 *
 * The ascending/descending check keeps this correct when visual order is the
 * reverse of DOM order, which is what an RTL row does. This app pins
 * documentElement.dir to ltr even in Hebrew, so it does not arise here today —
 * but the assumption would be invisible until it broke, and it costs four
 * lines to not make it.
 */
export function insertionIndex(rects, point, axis) {
  if (!rects || !rects.length) return 0;
  const mid = (r) => (axis === "col" ? r.y + r.h / 2 : r.x + r.w / 2);
  const p = axis === "col" ? point.y : point.x;
  const descending = rects.length > 1 && mid(rects[rects.length - 1]) < mid(rects[0]);
  let index = 0;
  for (const r of rects) {
    if (descending ? p <= mid(r) : p >= mid(r)) index++;
  }
  return index;
}

/* The line to draw for a pending drop: between two children, or against the
   leading edge of an empty container. Returned in viewport coordinates,
   because that is the space the overlay draws in. */
export function dropIndicator(containerRect, rects, index, axis) {
  const thickness = 2;
  if (!rects || !rects.length) {
    return axis === "col"
      ? { x: containerRect.x, y: containerRect.y, w: containerRect.w, h: thickness }
      : { x: containerRect.x, y: containerRect.y, w: thickness, h: containerRect.h };
  }
  const before = rects[Math.min(index, rects.length - 1)];
  const after = index >= rects.length;
  if (axis === "col") {
    const y = after ? before.y + before.h : before.y;
    return { x: containerRect.x, y: y - thickness / 2, w: containerRect.w, h: thickness };
  }
  const x = after ? before.x + before.w : before.x;
  return { x: x - thickness / 2, y: containerRect.y, w: thickness, h: containerRect.h };
}

/* How far the pointer must travel before a press becomes a drag. Below this a
   press is a selection, which is the far commoner intention — without it every
   click on a button nudges it one place. */
export const DRAG_THRESHOLD = 4;
export const TOUCH_DRAG_THRESHOLD = 10;
export const TOUCH_LONG_PRESS_MS = 500;

export function passedThreshold(from, to, threshold = DRAG_THRESHOLD) {
  return Math.abs(to.x - from.x) > threshold || Math.abs(to.y - from.y) > threshold;
}

/* Drop placeholder box for canvas: paints a box at insertion index rather than only a 2px line. */
export function dropPlaceholder(containerRect, rects, index, axis, size = { w: 32, h: 32 }) {
  if (!containerRect) return null;
  const thickness = axis === "col" ? (size.h || 32) : (size.w || 32);
  if (!rects || !rects.length) {
    return axis === "col"
      ? { x: containerRect.x + 2, y: containerRect.y + 2, w: containerRect.w - 4, h: thickness }
      : { x: containerRect.x + 2, y: containerRect.y + 2, w: thickness, h: containerRect.h - 4 };
  }
  const after = index >= rects.length;
  const ref = rects[Math.min(index, rects.length - 1)];
  if (axis === "col") {
    const y = after ? ref.y + ref.h : ref.y;
    return { x: containerRect.x + 2, y, w: containerRect.w - 4, h: thickness };
  }
  const x = after ? ref.x + ref.w : ref.x;
  return { x, y: containerRect.y + 2, w: thickness, h: containerRect.h - 4 };
}

/* Calculate the drop zone relative to a tree row (before, inside, after). */
export function treeZone(rowRect, point, isContainer) {
  if (!rowRect) return "after";
  const relY = point.y - rowRect.y;
  const h = rowRect.h || 1;
  const ratio = Math.max(0, Math.min(1, relY / h));
  if (isContainer) {
    if (ratio < 0.35) return "before";
    if (ratio > 0.65) return "after";
    return "inside";
  }
  return ratio < 0.5 ? "before" : "after";
}

/* Calculate target parent, insertion index, and validity for dropping onto tree rows. */
export function treeDropTarget(rows, point, draggingId, acceptsFn) {
  if (!Array.isArray(rows) || !rows.length) return null;
  let target = null;
  for (const r of rows) {
    if (r.rect && point.y >= r.rect.y && point.y <= r.rect.y + r.rect.h) {
      target = r;
      break;
    }
  }
  if (!target) {
    if (point.y < rows[0].rect.y) target = rows[0];
    else if (point.y > rows[rows.length - 1].rect.y + rows[rows.length - 1].rect.h) {
      target = rows[rows.length - 1];
    } else {
      return null;
    }
  }
  if (target.id === draggingId) return null;

  const zone = treeZone(target.rect, point, target.isContainer);
  let parentId = null;
  let index = 0;

  if (zone === "inside") {
    parentId = target.id;
    index = target.childrenCount || 0;
  } else if (zone === "before") {
    parentId = target.parentId;
    index = target.index != null ? target.index : 0;
  } else {
    parentId = target.parentId;
    index = (target.index != null ? target.index : 0) + 1;
  }

  /* ops.move reads the index AFTER the node has left. A same-parent drop
     taken from aria-posinset still counts the dragged row, so every downward
     move lands one slot too far and "drop on the next sibling's top half"
     (leave it) becomes a swap. */
  const dragged = rows.find((r) => r.id === draggingId);
  if (dragged && zone !== "inside" && dragged.parentId === parentId &&
      dragged.index != null && dragged.index < index) {
    index -= 1;
  }

  let valid = typeof acceptsFn === "function" ? acceptsFn(parentId, draggingId) : true;
  /* A container cannot become a child of itself. Type policy will not catch
     two nested groups; the parent chain will. */
  if (valid && occupies(rows, draggingId, parentId)) valid = false;

  return {
    valid: !!valid,
    reason: valid ? null : "incompatible",
    parentId,
    index,
    zone,
    targetId: target.id,
  };
}

/* Is `id` the node `ancestorId`, or a descendant of it, in this visible tree? */
function occupies(rows, ancestorId, id) {
  if (!ancestorId || !id) return false;
  if (ancestorId === id) return true;
  let cur = rows.find((r) => r.id === id);
  const seen = new Set();
  while (cur && cur.parentId && !seen.has(cur.id)) {
    if (cur.parentId === ancestorId) return true;
    seen.add(cur.id);
    cur = rows.find((r) => r.id === cur.parentId);
  }
  return false;
}
