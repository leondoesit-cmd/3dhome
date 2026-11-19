/* Hover-only refresh of the CAD editor's topology pick edges. Crossing from
   one edge or face to another used to dispose and re-create every edge Line
   of the body (a BufferGeometry and a LineBasicMaterial each). The lines'
   geometry does not depend on hover, so a hover-only refresh keeps them and
   restyles them in place; library_assembly_state.js does the THREE side, this
   piece holds the decisions and the style table, with no THREE import so Node
   tests can run them.

   The one thing a kept line cannot reproduce is its object id: three breaks
   ties between transparent objects of equal renderOrder and depth by id, and a
   rebuilt line is always the newest. Each build is therefore stamped with a
   sequence number, and a restyle is refused (the caller rebuilds) whenever a
   line of differing style in another body would now draw in a different order
   than the rebuild would have put it. Lines of one identical style blend the
   same in either order, so only differing styles count. */

var pickEdgeRecords = new WeakMap();
var pickEdgeBuildSeq = 0;

/* Per-edge style. Exactly the expressions addTopologyPickEdges always used;
   `visible` keeps the raw `||` value, as line.visible and cadPickVisible did. */
export function pickEdgeStyle(selected, hovered, finish, show, colors) {
  var raised = selected || hovered;
  return {
    color: selected ? colors.selected : hovered ? colors.hover : finish ? 0xf2d27a : colors.edge,
    opacity: raised ? .98 : finish ? .9 : .95,
    visible: show || finish || selected || hovered,
    renderOrder: raised ? 22 : 20,
    glow: !!(raised || finish),
  };
}

/* Everything a line's construction read that a restyle does not recompute. */
export function pickEdgeSettings(show, finish, colors, docType) {
  return { show: show, finish: finish, edge: colors.edge, hover: colors.hover, selected: colors.selected, docType: docType };
}

function samePickEdgeSettings(a, b) {
  return !!(a && b) && ["show", "finish", "edge", "hover", "selected", "docType"].every(function (key) { return Object.is(a[key], b[key]); });
}

/* The style classes a body's visible lines draw with, per renderOrder. */
export function pickEdgeSignature(styles) {
  var signature = {};
  styles.forEach(function (style) {
    if (!style.visible) return;
    var list = signature[style.renderOrder] || (signature[style.renderOrder] = []);
    var key = style.color + "/" + style.opacity;
    if (list.indexOf(key) < 0) list.push(key);
  });
  return signature;
}

/* True when the draw order between two bodies' lines can change pixels: at
   some renderOrder both draw lines and they do not all share one style. */
export function pickEdgeSignaturesConflict(a, b) {
  return Object.keys(a || {}).some(function (order) {
    var left = a[order], right = b && b[order];
    if (!left || !left.length || !right || !right.length) return false;
    return left.concat(right).some(function (key, index, all) { return key !== all[0]; });
  });
}

/* setFromPoints stores each point as float32 x, y, z (z through `|| 0`). */
export function pickEdgePointsMatch(array, points) {
  if (!array || !points || array.length !== points.length * 3) return false;
  for (var i = 0; i < points.length; i++) {
    var point = points[i];
    var x = point.x === undefined ? 0 : point.x, y = point.y === undefined ? 0 : point.y, z = point.z === undefined ? 0 : point.z;
    if (!Object.is(array[i * 3], Math.fround(x)) || !Object.is(array[i * 3 + 1], Math.fround(y)) || !Object.is(array[i * 3 + 2], Math.fround(z || 0))) return false;
  }
  return true;
}

export function rememberPickEdges(group, lines, styles, settings) {
  var record = { lineSeq: ++pickEdgeBuildSeq, lines: lines.slice(), signature: pickEdgeSignature(styles), settings: settings };
  pickEdgeRecords.set(group, record);
  return record;
}

export function forgetPickEdges(group) {
  pickEdgeRecords.delete(group);
}

export function pickEdgeRecord(group) {
  return pickEdgeRecords.get(group) || null;
}

/* May the lines now in the group be restyled instead of rebuilt? Only when
   they are exactly the lines the last build made, in order, and that build
   read the same edge settings. Geometry is checked per edge by the caller. */
export function canRestylePickEdges(record, lines, settings) {
  if (!record || !samePickEdgeSettings(record.settings, settings)) return false;
  if (!lines.length || lines.length !== record.lines.length) return false;
  return lines.every(function (line, index) { return line === record.lines[index]; });
}

/* A rebuild would make this body's lines the newest. Keeping them is exact
   only if they already are newer than every other body's lines they could be
   confused with. `others` are the records of bodies not rebuilt later in the
   same refresh (those are ordered after this one either way). */
export function pickEdgeOrderSafe(record, signature, others) {
  return (others || []).every(function (other) {
    if (!other || other === record || other.lineSeq < record.lineSeq) return true;
    return !pickEdgeSignaturesConflict(signature, other.signature);
  });
}

export function updatePickEdgeSignature(record, styles) {
  record.signature = pickEdgeSignature(styles);
  return record;
}
