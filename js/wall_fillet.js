// Architectural wall-corner fillets.  The geometric kernel can already build
// a tangent arc; this module turns that result into a safe plan edit while
// keeping hosted openings and MEP points at their parametric wall positions.
import { makeTangentArc, wallCurveGeom } from "./wall_curves.js";

const EPS = 1e-6;
const GEOMETRY_KEYS = new Set([
  "id", "a", "b", "curve", "profile", "baseProfile", "clearL", "cornerTreatment",
]);

function copyValue(value) {
  if (value == null || typeof value !== "object") return value;
  return JSON.parse(JSON.stringify(value));
}

function styleFrom(wall) {
  const style = {};
  Object.keys(wall || {}).forEach((key) => {
    if (!GEOMETRY_KEYS.has(key)) style[key] = copyValue(wall[key]);
  });
  return style;
}

function fail(reason, extra = {}) {
  return { ok: false, reason, ...extra };
}

function sharedEnd(first, second) {
  for (const end1 of ["a", "b"]) {
    for (const end2 of ["a", "b"]) {
      if (first[end1] === second[end2]) return { node: first[end1], end1, end2 };
    }
  }
  return null;
}

function hostedOn(state, wall) {
  const openings = (state.openings || []).filter((item) => item.wall === wall.id).map((item) => ({
    kind: "opening", item, s: Number(item.s) || 0, half: Math.max(0, Number(item.width ?? item.w) || 0) / 2,
  }));
  const mep = state.mep && Array.isArray(state.mep.nodes)
    ? state.mep.nodes.filter((item) => item.wall === wall.id && Number.isFinite(Number(item.s))).map((item) => ({
      kind: "mep", item, s: Number(item.s), half: 0,
    }))
    : [];
  return openings.concat(mep);
}

function trimInfo(state, wall, jointEnd, tangent) {
  const geometry = wallCurveGeom(wall, state.nodes);
  if (!geometry || geometry.kind !== "line") return fail("curved-input");
  const joint = state.nodes[wall[jointEnd]];
  const trim = Math.hypot(tangent.x - joint.x, tangent.z - joint.z);
  const nextLength = geometry.length - trim;
  if (nextLength <= EPS) return fail("too-large");
  for (const hosted of hostedOn(state, wall)) {
    const survives = jointEnd === "a"
      ? hosted.s - hosted.half >= trim - EPS
      : hosted.s + hosted.half <= nextLength + EPS;
    if (!survives) return fail("hosted", { hostedKind: hosted.kind, hosted: hosted.item });
  }
  return { ok: true, wall, end: jointEnd, trim, oldLength: geometry.length, nextLength };
}

/**
 * Compute a finite tangent fillet for two straight walls sharing one node.
 * The function is pure: callers may use it to preview/enable UI without
 * touching model state.
 */
export function proposeWallFillet(state, firstWall, secondWall, radiusValue) {
  const radius = Number(radiusValue);
  if (!state || !firstWall || !secondWall || firstWall === secondWall || !Number.isFinite(radius) || radius <= EPS)
    return fail("radius");
  const shared = sharedEnd(firstWall, secondWall);
  if (!shared) return fail("not-shared");
  const joint = state.nodes && state.nodes[shared.node];
  const far1 = state.nodes && state.nodes[shared.end1 === "a" ? firstWall.b : firstWall.a];
  const far2 = state.nodes && state.nodes[shared.end2 === "a" ? secondWall.b : secondWall.a];
  if (!joint || !far1 || !far2) return fail("geometry");
  if (wallCurveGeom(firstWall, state.nodes)?.kind !== "line" || wallCurveGeom(secondWall, state.nodes)?.kind !== "line")
    return fail("curved-input");

  // Directed as an arriving first arm and a departing second arm, matching
  // makeTangentArc's finite-segment convention.
  const arc = makeTangentArc({ a: far1, b: joint }, { a: joint, b: far2 }, radius);
  if (!arc) return fail("too-large");
  const first = trimInfo(state, firstWall, shared.end1, arc.a);
  if (!first.ok) return first;
  const second = trimInfo(state, secondWall, shared.end2, arc.b);
  if (!second.ok) return second;
  return { ok: true, radius, shared, joint, arc, first, second };
}

function shiftHosted(state, trim) {
  if (trim.end !== "a") return;
  hostedOn(state, trim.wall).forEach((hosted) => { hosted.item.s = Math.max(0, hosted.s - trim.trim); });
}

/** Apply a previously validated fillet as two trims plus one analytic arc. */
export function applyWallFillet(state, firstWall, secondWall, radiusValue, options = {}) {
  const proposal = proposeWallFillet(state, firstWall, secondWall, radiusValue);
  if (!proposal.ok) return proposal;
  const node1 = state.nodes.push({ x: proposal.arc.a.x, z: proposal.arc.a.z }) - 1;
  const node2 = state.nodes.push({ x: proposal.arc.b.x, z: proposal.arc.b.z }) - 1;
  shiftHosted(state, proposal.first);
  shiftHosted(state, proposal.second);
  firstWall[proposal.first.end] = node1;
  secondWall[proposal.second.end] = node2;
  const nextId = typeof options.makeId === "function"
    ? options.makeId()
    : Math.max(0, ...(state.walls || []).map((wall) => Number(wall.id) || 0)) + 1;
  const wall = {
    ...styleFrom(firstWall),
    id: nextId,
    a: node1,
    b: node2,
    curve: { type: "arc", bulge: proposal.arc.bulge },
    cornerTreatment: {
      type: "fillet", value: proposal.radius, originalNode: proposal.shared.node,
      arms: [
        { wall: firstWall.id, end: proposal.first.end },
        { wall: secondWall.id, end: proposal.second.end },
      ],
    },
  };
  state.walls.push(wall);
  return { ok: true, wall, proposal };
}

/**
 * Compute an equal-setback chamfer.  Unlike a fillet, the authored value is
 * the distance measured back from the old corner along each wall; the new
 * diagonal therefore remains unambiguous at any corner angle.
 */
export function proposeWallChamfer(state, firstWall, secondWall, setbackValue) {
  const setback = Number(setbackValue);
  if (!state || !firstWall || !secondWall || firstWall === secondWall || !Number.isFinite(setback) || setback <= EPS)
    return fail("distance");
  const shared = sharedEnd(firstWall, secondWall);
  if (!shared) return fail("not-shared");
  const joint = state.nodes && state.nodes[shared.node];
  const far1 = state.nodes && state.nodes[shared.end1 === "a" ? firstWall.b : firstWall.a];
  const far2 = state.nodes && state.nodes[shared.end2 === "a" ? secondWall.b : secondWall.a];
  const geometry1 = wallCurveGeom(firstWall, state.nodes);
  const geometry2 = wallCurveGeom(secondWall, state.nodes);
  if (!joint || !far1 || !far2) return fail("geometry");
  if (!geometry1 || !geometry2 || geometry1.kind !== "line" || geometry2.kind !== "line") return fail("curved-input");
  if (setback >= geometry1.length - EPS || setback >= geometry2.length - EPS) return fail("too-large");
  const length1 = Math.hypot(far1.x - joint.x, far1.z - joint.z);
  const length2 = Math.hypot(far2.x - joint.x, far2.z - joint.z);
  const u1 = { x: (far1.x - joint.x) / length1, z: (far1.z - joint.z) / length1 };
  const u2 = { x: (far2.x - joint.x) / length2, z: (far2.z - joint.z) / length2 };
  if (Math.abs(u1.x * u2.z - u1.z * u2.x) <= EPS) return fail("collinear");
  const cut = {
    a: { x: joint.x + u1.x * setback, z: joint.z + u1.z * setback },
    b: { x: joint.x + u2.x * setback, z: joint.z + u2.z * setback },
  };
  const first = trimInfo(state, firstWall, shared.end1, cut.a);
  if (!first.ok) return first;
  const second = trimInfo(state, secondWall, shared.end2, cut.b);
  if (!second.ok) return second;
  return { ok: true, setback, shared, joint, cut, first, second };
}

/** Apply an equal-setback chamfer as two trims plus one straight wall. */
export function applyWallChamfer(state, firstWall, secondWall, setbackValue, options = {}) {
  const proposal = proposeWallChamfer(state, firstWall, secondWall, setbackValue);
  if (!proposal.ok) return proposal;
  const node1 = state.nodes.push({ x: proposal.cut.a.x, z: proposal.cut.a.z }) - 1;
  const node2 = state.nodes.push({ x: proposal.cut.b.x, z: proposal.cut.b.z }) - 1;
  shiftHosted(state, proposal.first);
  shiftHosted(state, proposal.second);
  firstWall[proposal.first.end] = node1;
  secondWall[proposal.second.end] = node2;
  const nextId = typeof options.makeId === "function"
    ? options.makeId()
    : Math.max(0, ...(state.walls || []).map((wall) => Number(wall.id) || 0)) + 1;
  const wall = {
    ...styleFrom(firstWall), id: nextId, a: node1, b: node2,
    cornerTreatment: {
      type: "chamfer", value: proposal.setback, originalNode: proposal.shared.node,
      arms: [
        { wall: firstWall.id, end: proposal.first.end },
        { wall: secondWall.id, end: proposal.second.end },
      ],
    },
  };
  state.walls.push(wall);
  return { ok: true, wall, proposal };
}

function lineIntersection(a, b, c, d) {
  const adx = b.x - a.x, adz = b.z - a.z;
  const bdx = d.x - c.x, bdz = d.z - c.z;
  const cross = adx * bdz - adz * bdx;
  if (Math.abs(cross) <= EPS * Math.max(1, Math.hypot(adx, adz) * Math.hypot(bdx, bdz))) return null;
  const qx = c.x - a.x, qz = c.z - a.z;
  const ta = (qx * bdz - qz * bdx) / cross;
  const tb = (qx * adz - qz * adx) / cross;
  return { point: { x: a.x + adx * ta, z: a.z + adz * ta }, ta, tb };
}

function armRecord(state, spec, connectorNode) {
  const wall = (state.walls || []).find((candidate) => candidate.id === spec.wall);
  if (!wall || (spec.end !== "a" && spec.end !== "b") || wall[spec.end] !== connectorNode) return null;
  const farNode = wall[spec.end === "a" ? "b" : "a"];
  const near = state.nodes[connectorNode], far = state.nodes[farNode];
  if (!near || !far || wallCurveGeom(wall, state.nodes)?.kind !== "line") return null;
  return { wall, end: spec.end, near, far };
}

/** Validate collapsing a generated fillet/chamfer back into one sharp joint. */
export function proposeCornerRestore(state, connector) {
  const treatment = connector && connector.cornerTreatment;
  if (!state || !connector || !treatment || !Array.isArray(treatment.arms) || treatment.arms.length !== 2)
    return fail("not-treatment");
  if (hostedOn(state, connector).length) return fail("connector-hosted");
  const first = armRecord(state, treatment.arms[0], connector.a);
  const second = armRecord(state, treatment.arms[1], connector.b);
  if (!first || !second || first.wall === second.wall) return fail("changed");
  // Both directed lines run from their far end toward the cut endpoint.  The
  // desired sharp joint must lie beyond both cut endpoints, never behind them.
  const hit = lineIntersection(first.far, first.near, second.far, second.near);
  if (!hit || hit.ta < 1 - EPS || hit.tb < 1 - EPS) return fail("changed");
  return {
    ok: true, connector, treatment, first, second, point: hit.point,
    add1: Math.hypot(hit.point.x - first.near.x, hit.point.z - first.near.z),
    add2: Math.hypot(hit.point.x - second.near.x, hit.point.z - second.near.z),
  };
}

function extendHosted(state, arm, amount) {
  if (arm.end !== "a") return;
  hostedOn(state, arm.wall).forEach((hosted) => { hosted.item.s = hosted.s + amount; });
}

/** Remove a generated corner connector and extend its two arms to intersect. */
export function applyCornerRestore(state, connector) {
  const proposal = proposeCornerRestore(state, connector);
  if (!proposal.ok) return proposal;
  let jointNode = proposal.treatment.originalNode;
  const oldJoint = Number.isInteger(jointNode) ? state.nodes[jointNode] : null;
  if (!oldJoint || Math.hypot(oldJoint.x - proposal.point.x, oldJoint.z - proposal.point.z) > EPS) {
    jointNode = state.nodes.push({ x: proposal.point.x, z: proposal.point.z }) - 1;
  }
  extendHosted(state, proposal.first, proposal.add1);
  extendHosted(state, proposal.second, proposal.add2);
  proposal.first.wall[proposal.first.end] = jointNode;
  proposal.second.wall[proposal.second.end] = jointNode;
  const index = state.walls.indexOf(connector);
  if (index >= 0) state.walls.splice(index, 1);
  return { ok: true, jointNode, arms: [proposal.first.wall, proposal.second.wall], proposal };
}

function restoredPreview(state, connector) {
  const restore = proposeCornerRestore(state, connector);
  if (!restore.ok) return restore;
  const nodes = (state.nodes || []).map((node) => node && { ...node });
  let jointNode = restore.treatment.originalNode;
  const oldJoint = Number.isInteger(jointNode) ? nodes[jointNode] : null;
  if (!oldJoint || Math.hypot(oldJoint.x - restore.point.x, oldJoint.z - restore.point.z) > EPS)
    jointNode = nodes.push({ x: restore.point.x, z: restore.point.z }) - 1;
  const first = copyValue(restore.first.wall), second = copyValue(restore.second.wall);
  first[restore.first.end] = jointNode;
  second[restore.second.end] = jointNode;
  const openings = copyValue(state.openings || []);
  const mep = state.mep ? { ...copyValue(state.mep), nodes: copyValue(state.mep.nodes || []) } : undefined;
  function extendPreview(wallId, end, amount) {
    if (end !== "a") return;
    openings.filter((item) => item.wall === wallId).forEach((item) => { item.s = (Number(item.s) || 0) + amount; });
    if (mep) mep.nodes.filter((item) => item.wall === wallId && Number.isFinite(Number(item.s)))
      .forEach((item) => { item.s = Number(item.s) + amount; });
  }
  extendPreview(first.id, restore.first.end, restore.add1);
  extendPreview(second.id, restore.second.end, restore.add2);
  return { ok: true, restore, state: { nodes, walls: [first, second], openings, mep }, first, second };
}

/** Validate changing an existing treatment's size and/or kind atomically. */
export function proposeCornerTreatmentUpdate(state, connector, typeValue, value) {
  const type = typeValue === "fillet" || typeValue === "chamfer" ? typeValue : null;
  if (!type) return fail("treatment-type");
  const preview = restoredPreview(state, connector);
  if (!preview.ok) return preview;
  const proposal = type === "fillet"
    ? proposeWallFillet(preview.state, preview.first, preview.second, value)
    : proposeWallChamfer(preview.state, preview.first, preview.second, value);
  if (!proposal.ok) return proposal;
  return { ok: true, type, value: Number(value), preview, proposal };
}

/**
 * Rebuild a generated corner treatment while preserving its wall id and its
 * independently edited wall style.  Validation is complete before mutation.
 */
export function applyCornerTreatmentUpdate(state, connector, typeValue, value) {
  const update = proposeCornerTreatmentUpdate(state, connector, typeValue, value);
  if (!update.ok) return update;
  const connectorId = connector.id;
  const preservedStyle = styleFrom(connector);
  const restored = applyCornerRestore(state, connector);
  if (!restored.ok) return restored;
  const created = update.type === "fillet"
    ? applyWallFillet(state, restored.arms[0], restored.arms[1], value, { makeId: () => connectorId })
    : applyWallChamfer(state, restored.arms[0], restored.arms[1], value, { makeId: () => connectorId });
  if (!created.ok) return created;
  Object.assign(created.wall, preservedStyle);
  return { ok: true, wall: created.wall, arms: restored.arms, type: update.type, value: Number(value) };
}
