/* A set of pieces moved as one (a kitchen run, a table with its chairs, any
   multi-selection): the frame it is measured and snapped in, pure.

   groupLead(items)          the piece the set takes its orientation from (the
                             largest footprint; ties: the first)
   groupOutline(items, outlineOf)
                             the convex cover of the members' outlines: what the
                             live distances sweep (js/measure.js measureSides
                             `outline`), so a chair is not measured to its own
                             table
   groupProxy(items, rot, at) one box in the lead's orientation covering every
                             member (js/item_wall_snap.js footReach), centred on
                             the members' cover; `at` [{ x, z }] per member
                             overrides their positions (the drag's start pose).
                             -> { w, d, rot, x, z } */
import { footReach } from "./item_wall_snap.js";

function num(v) { v = Number(v); return Number.isFinite(v) ? v : 0; }

// Configuration follows the piece through the planner's save/import mapper.
// A layout set is an optional selection, while groupId is a user's rigid group.
export function layoutSetId(it) {
  return it?.configuration?.layoutSetId;
}

export function setLayoutSetId(it, id) {
  if (id == null) {
    if (it.configuration) delete it.configuration.layoutSetId;
  } else {
    it.configuration = { ...it.configuration, layoutSetId: id };
  }
  return it;
}

export function layoutSetMembers(items, it) {
  const id = layoutSetId(it);
  return id == null ? [] : items.filter(other => layoutSetId(other) === id);
}

// Before layout sets, the generator allocated the dining id BEFORE the table
// and the sleeping id BEFORE the nightstands. A manual group is allocated
// after all its pieces. Kitchen ids followed the last contiguous module but
// preceded the track light. A run without a light also has a distinctive
// end fridge, snap orientation, catalogue module sequence and 2 cm seams.
function oldKitchenRun(items, id) {
  const units = items.filter(it => it.type !== "trackLight").sort((a, b) => a.id - b.id);
  if (units.length < 3 || !units.every((it, i) => it.id === id - units.length + i)) return false;
  const sequence = units.map(it => it.type);
  if (sequence[0] !== "fridge") sequence.reverse();
  if (!["fridge base sink dishwasher base cooktop oven", "fridge sink dishwasher base cooktop oven",
    "fridge base sink base cooktop", "fridge sink base cooktop", "fridge sink cooktop"].includes(sequence.join(" "))) return false;
  if (items.some(it => it.type === "trackLight" && it.id > id)) return true;
  const first = units[0], axis = first.rot % 180 === 0 ? "x" : "z";
  return units.every((it, i) => !i || (it.rot === first.rot &&
    Math.abs(it[axis] - units[i - 1][axis] - (it.w + units[i - 1].w) / 2 - 2) < 0.1));
}

export function restoreLayoutSets(items) {
  const groups = new Map();
  for (const it of items) {
    if (it.groupId == null || layoutSetId(it) != null) continue;
    if (!groups.has(it.groupId)) groups.set(it.groupId, []);
    groups.get(it.groupId).push(it);
  }
  for (const [id, members] of groups) {
    const dining = members.some(it => it.type === "table" && it.id === id + 1) &&
      members.every(it => it.type === "table" || (it.type === "chair" && it.id > id));
    const sleeping = members.some(it => it.type === "bed" && it.id < id) &&
      members.some(it => it.type === "nightstand" && it.id > id) &&
      members.every(it => it.type === "bed" || it.type === "nightstand");
    if (!dining && !sleeping && !oldKitchenRun(members, id)) continue;
    for (const it of members) {
      setLayoutSetId(it, id);
      delete it.groupId;
    }
  }
}

export function groupLead(items) {
  var lead = null, best = -1;
  (items || []).forEach(function (it) {
    if (!it) return;
    var a = num(it.w) * num(it.d);
    if (a > best) { best = a; lead = it; }
  });
  return lead;
}

export function groupOutline(items, outlineOf) {
  var pts = [];
  (items || []).forEach(function (it) {
    if (it) (outlineOf(it) || []).forEach(function (p) { pts.push(p); });
  });
  pts = pts.filter(function (p) { return p && Number.isFinite(p.x) && Number.isFinite(p.z); })
    .sort(function (a, b) { return a.x - b.x || a.z - b.z; });
  if (pts.length < 3) return pts;
  function cross(o, a, b) { return (a.x - o.x) * (b.z - o.z) - (a.z - o.z) * (b.x - o.x); }
  function half(src) {
    var out = [];
    src.forEach(function (p) {
      while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], p) <= 1e-9) out.pop();
      out.push(p);
    });
    out.pop();
    return out;
  }
  return half(pts).concat(half(pts.slice().reverse()));
}

export function groupProxy(items, rot, at) {
  var a = (num(rot) * Math.PI) / 180, ux = Math.cos(a), uz = Math.sin(a), vx = -uz, vz = ux,
    u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
  (items || []).forEach(function (it, i) {
    if (!it) return;
    var p = at && at[i] ? at[i] : it, x = num(p.x), z = num(p.z),
      cu = x * ux + z * uz, cv = x * vx + z * vz, ru = footReach(it, ux, uz), rv = footReach(it, vx, vz);
    u0 = Math.min(u0, cu - ru); u1 = Math.max(u1, cu + ru);
    v0 = Math.min(v0, cv - rv); v1 = Math.max(v1, cv + rv);
  });
  if (!(u1 > u0 && v1 > v0)) return null;
  var cu = (u0 + u1) / 2, cv = (v0 + v1) / 2;
  return { w: u1 - u0, d: v1 - v0, rot: num(rot), x: cu * ux + cv * vx, z: cu * uz + cv * vz };
}
