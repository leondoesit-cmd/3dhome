/* Selection depth and sticky focus arithmetic.
 *
 * The geometry is separated from DOM listeners so drill-down, single-click,
 * and escape can be tested as pure arithmetic over ancestor chains.
 */

function toId(item) {
  return typeof item === "string" ? item : (item && item.id != null ? item.id : null);
}

/* Is the clicked node inside the container currently focused?
   Drives the click-outside reset: clicking outside focus resets focus to root. */
export function withinFocus(chain, focusId) {
  if (!focusId) return true;
  if (!Array.isArray(chain) || !chain.length) return false;
  return chain.some((item) => toId(item) === focusId);
}

/* Given an ancestor chain from root to hit, find the selectable direct child of focus.
   If focusId is root or null, returns the topmost child below root. */
export function candidateAt(chain, focusId, rootId) {
  if (!Array.isArray(chain) || !chain.length) return null;
  const ids = chain.map(toId);
  const effectiveFocus = focusId || rootId || ids[0];
  const at = ids.indexOf(effectiveFocus);
  if (at < 0) {
    // Hit is outside focus; candidate is top child below root
    return ids.length > 1 ? ids[1] : ids[0];
  }
  if (at < ids.length - 1) {
    return ids[at + 1];
  }
  return ids[at];
}

/* Can this node be drilled into? Returns its id if it is an enterable container, else null. */
export function drillTarget(node) {
  if (!node) return null;
  if (node.type === "item" || node.type === "separator") return null;
  if (Array.isArray(node.children)) {
    return node.id;
  }
  return null;
}

/* Ascend one level up the hierarchy. Returns the parent of focus, or null at root. */
export function ascend(focusId, parentOf, rootId) {
  if (!focusId) return null;
  if (rootId && focusId === rootId) return null;
  const parent = typeof parentOf === "function" ? parentOf(focusId) : null;
  const parentId = toId(parent);
  if (!parentId || (rootId && parentId === rootId)) {
    return rootId || null;
  }
  return parentId;
}
