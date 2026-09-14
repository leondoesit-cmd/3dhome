// Instance names for sketch geometry, and the geometry each relation names.
//
// A refusal that says "It fights: Tangent, Tangent" is true and useless: a slot
// has four tangents. SOLIDWORKS' Display/Delete Relations answers "which one"
// by naming every entity with a per-type instance number (Line3, Arc1, Point7)
// and listing each relation with the entities it ties: "Tangent (Line3, Arc1)".
// The same names are tagged on the canvas while a refusal is showing, so the
// words in the message can be matched to the geometry they mean.
//
// Names are derived, not stored: they count in sketch order, so they are the
// same every time the same sketch is shown, and a deleted entity renumbers the
// ones after it — the same trade SOLIDWORKS makes for sketch instance names.

import { circleData, ellipseData, lineData } from "./sketch_solver.js";

export const DEFAULT_KIND_LABELS = { line: "Line", arc: "Arc", circle: "Circle", ellipse: "Ellipse", spline: "Spline", point: "Point", entity: "Entity" };

export function sketchInstanceNames(sketch, labels = DEFAULT_KIND_LABELS) {
  const entities = new Map(), points = new Map(), count = {};
  for (const e of sketch?.entities || []) {
    const kind = e.type in labels && e.type !== "point" ? e.type : "entity";
    count[kind] = (count[kind] || 0) + 1;
    entities.set(e.id, (labels[kind] || DEFAULT_KIND_LABELS[kind]) + count[kind]);
  }
  (sketch?.points || []).forEach((p, i) => points.set(p.id, (labels.point || "Point") + (i + 1)));
  return { entities, points };
}

// relations whose a/b are points rather than entities
const POINT_PAIRS = new Set(["coincident", "symmetric"]);

/* The geometry a relation ties, in reading order, as {id, kind}. A relation
   with no geometry of its own (a pattern's pairs) names its centre only. */
export function relationTargets(sketch, constraint) {
  const entityIds = new Set((sketch?.entities || []).map((e) => e.id));
  const pointIds = new Set((sketch?.points || []).map((p) => p.id));
  const out = [];
  const add = (id, preferPoint) => {
    if (id == null) return;
    const kind = preferPoint
      ? (pointIds.has(id) ? "point" : entityIds.has(id) ? "entity" : null)
      : (entityIds.has(id) ? "entity" : pointIds.has(id) ? "point" : null);
    if (kind && !out.some((t) => t.id === id && t.kind === kind)) out.push({ id, kind });
  };
  const pointPair = POINT_PAIRS.has(constraint.type) || (constraint.entity == null && constraint.point == null
    && ["horizontal", "vertical", "distance"].includes(constraint.type));
  add(constraint.point, true);
  if (constraint.type === "symmetric") { add(constraint.a, true); add(constraint.b, true); add(constraint.entity, false); }
  else {
    add(constraint.entity, false);
    add(constraint.a, pointPair);
    add(constraint.b, pointPair);
  }
  add(constraint.center, true);
  return out;
}

export function relationSubjects(sketch, constraint, names = sketchInstanceNames(sketch)) {
  return relationTargets(sketch, constraint)
    .map((t) => (t.kind === "point" ? names.points : names.entities).get(t.id))
    .filter(Boolean);
}

/* Where a name tag sits: a line's midpoint, the top of an arc or circle, an
   ellipse's centre, a spline's start, or the point itself. Model units. */
function anchorOf(sketch, target) {
  const points = new Map((sketch.points || []).map((p) => [p.id, p]));
  if (target.kind === "point") return points.get(target.id) || null;
  const e = (sketch.entities || []).find((x) => x.id === target.id);
  if (!e) return null;
  const l = lineData(e, points);
  if (l) return { x: (l.a.x + l.b.x) / 2, y: (l.a.y + l.b.y) / 2 };
  const o = circleData(e, points);
  if (o) return { x: o.center.x, y: o.center.y + o.radius };
  const el = ellipseData(e, points);
  if (el) return el.center;
  return points.get(e.a) || null;
}

/* Red instance-name tags on the canvas for the given targets. Tags that would
   land on the same spot are stacked rather than drawn over each other. */
export function drawNameTags(ctx, sketch, toPx, targets, names = sketchInstanceNames(sketch)) {
  if (!ctx || !sketch || !targets?.length) return 0;
  const used = new Map(), seen = new Set();
  let drawn = 0;
  ctx.save();
  ctx.font = "600 11px Inter, sans-serif";
  ctx.textBaseline = "middle";
  for (const target of targets) {
    const key = target.kind + ":" + target.id;
    if (seen.has(key)) continue;
    seen.add(key);
    const name = (target.kind === "point" ? names.points : names.entities).get(target.id);
    const at = name && anchorOf(sketch, target);
    if (!at) continue;
    const px = toPx(at.x, at.y);
    const slot = Math.round(px.x / 24) + "," + Math.round(px.y / 24);
    const stack = used.get(slot) || 0;
    used.set(slot, stack + 1);
    const width = ctx.measureText ? ctx.measureText(name).width : name.length * 6.5;
    const x = px.x + 8, y = px.y - 12 - stack * 18;
    ctx.fillStyle = "rgba(208, 52, 44, 0.92)";
    if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x - 4, y - 8, width + 8, 16, 4); ctx.fill(); }
    else ctx.fillRect(x - 4, y - 8, width + 8, 16);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(name, x, y);
    drawn++;
  }
  ctx.restore();
  return drawn;
}
