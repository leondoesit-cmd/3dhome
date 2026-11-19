/* Building-code check: a plan description in, findings out. Pure — no DOM,
   no state — so Node tests drive it with plain objects and the browser feeds
   it from js/code_check_plan.js.

   Input (model units: cm, m²):
     rooms:  [{ key, type, area, width, ceiling, glazing, windows:[{id,width,height,sill}],
                exteriorDoor, wallThickness }]
             `width` is the clear short side, `ceiling` the clear height,
             `glazing` the rough window area serving the room.
     stairs: [{ id, riser, tread }]   tread null when the flight is not straight
     guards: [{ id, height }]         railing walls
   Output: { profile, findings:[{ rule, severity, roomKey?, itemId?, kind, actual,
             required, clause, verified, conflicting?, conditional?, condition?,
             detail? }], counts }

   Severities: "error" — below the profile's minimum; "warn" — a requirement
   that depends on facts the plan does not hold (a new building, the drop
   behind a railing, the storey or building class a `conditional` rule names)
   or a value the sources disagree on; "info" — passes on the rough opening
   but the net clear opening must be confirmed. */
import { codeProfile } from "./code_profiles.js";

export const HABITABLE_TYPES = new Set(["living", "livingKitchen", "kitchen", "dining", "bedroom", "masterBedroom", "kidsRoom", "office", "halfRoom", "safeRoom"]);
export const SLEEPING_TYPES = new Set(["bedroom", "masterBedroom", "kidsRoom"]);
const OUTDOOR_TYPES = new Set(["balcony", "serviceBalcony", "terrace"]);
// Kitchens are habitable (ceiling, daylight) but exempt from the room-size
// minimums in both the IRC (R304 exceptions) and the Israeli regulations,
// where a "habitable room" is a living or sleeping room.
const SIZE_EXEMPT = new Set(["kitchen"]);
const CORRIDOR_TYPES = new Set(["corridor", "entry", "hall", "landing"]);
const TOL = { length: 0.5, area: 0.05, ratio: 1e-6, angle: 0.1 };

export function checkCode(plan, profileId) {
  const profile = codeProfile(profileId);
  if (!profile) return { profile: null, findings: [], counts: { error: 0, warn: 0, info: 0 }, reason: "unknown-profile" };
  const R = profile.rules;
  const rooms = (plan && plan.rooms) || [];
  const findings = [];
  const add = (key, severity, kind, actual, required, where) => {
    const r = R[key];
    findings.push({
      rule: key, severity, kind, actual, required,
      clause: r ? r.clause : "", verified: r ? r.verified : false,
      ...(r && r.conflicting ? { conflicting: true } : {}),
      ...(r && r.conditional ? { conditional: true, condition: r.condition || null } : {}),
      ...(where || {}),
    });
  };
  // A shortfall against a rule: an error, unless the sources disagree on the
  // value or the rule binds only in circumstances the plan does not record.
  const fail = (key, kind, actual, where) =>
    add(key, R[key].conflicting || R[key].conditional ? "warn" : "error", kind, actual, R[key].value, where);
  const below = (actual, key, kind) => R[key] && Number.isFinite(actual) && actual < R[key].value - TOL[kind];
  const above = (actual, key, kind) => R[key] && Number.isFinite(actual) && actual > R[key].value + TOL[kind];
  const ctx = { R, add, fail, below, above };

  const habitable = rooms.filter((r) => HABITABLE_TYPES.has(r.type) && r.type !== "safeRoom" && !SIZE_EXEMPT.has(r.type));
  const escapeRooms = R.escapeMinArea && R.escapeMinArea.rooms === "habitable"
    ? (room) => habitable.includes(room) : (room) => SLEEPING_TYPES.has(room.type);
  rooms.forEach((room) => {
    const at = { roomKey: room.key };
    const isHalf = room.type === "halfRoom" && R.halfRoomMinArea;
    if (HABITABLE_TYPES.has(room.type) && room.type !== "safeRoom") {
      const areaKey = isHalf ? "halfRoomMinArea" : "habitableMinArea";
      const widthKey = isHalf ? "halfRoomMinWidth" : "habitableMinWidth";
      const sized = !SIZE_EXEMPT.has(room.type);
      if (sized && below(room.area, areaKey, "area")) fail(areaKey, "area", room.area, at);
      if (sized && below(room.width, widthKey, "length")) fail(widthKey, "length", room.width, at);
      if (below(room.ceiling, "ceilingHabitable", "length")) fail("ceilingHabitable", "length", room.ceiling, at);
      if (R.glazingRatio && Number.isFinite(room.area) && room.area > 0) {
        const ratio = (room.glazing || 0) / room.area;
        if (ratio < R.glazingRatio.value - TOL.ratio) fail("glazingRatio", "ratio", ratio, at);
      }
    }
    if (CORRIDOR_TYPES.has(room.type)) {
      if (below(room.ceiling, "ceilingCorridor", "length")) fail("ceilingCorridor", "length", room.ceiling, at);
      if (room.type === "corridor" && below(room.width, "corridorMinWidth", "length")) fail("corridorMinWidth", "length", room.width, at);
    }
    if (R.escapeMinArea && escapeRooms(room)) escapeOpening(room, ctx);
    if (room.type === "safeRoom" && R.safeRoomArea) safeRoom(room, R, add);
  });

  if (R.largeRoomMinArea && habitable.length >= 2 && !habitable.some((r) => r.area >= R.largeRoomMinArea.value - TOL.area))
    add("largeRoomMinArea", "error", "area", Math.max(...habitable.map((r) => r.area || 0)), R.largeRoomMinArea.value);
  if (R.studioMinArea && habitable.length === 1 && below(habitable[0].area, "studioMinArea", "area"))
    add("studioMinArea", "error", "area", habitable[0].area, R.studioMinArea.value, { roomKey: habitable[0].key });
  if (R.safeRoomRequired && R.safeRoomRequired.value && habitable.length && !rooms.some((r) => r.type === "safeRoom"))
    add("safeRoomRequired", "warn", "presence", 0, 1);
  if (R.singleBedroomMinArea) {
    const bedspaces = bedroomSpace(rooms, ctx);
    if (R.dwellingMinArea && habitable.length) dwellingSpace(rooms, bedspaces, ctx);
  }

  ((plan && plan.stairs) || []).forEach((s) => {
    const at = { itemId: s.id };
    if (above(s.riser, "stairMaxRiser", "length")) fail("stairMaxRiser", "length", s.riser, at);
    if (s.tread == null) return;
    if (below(s.tread, "stairMinTread", "length")) fail("stairMinTread", "length", s.tread, at);
    if (!(s.tread > 0) || !Number.isFinite(s.riser)) return;
    const pitch = Math.atan2(s.riser, s.tread) * 180 / Math.PI;
    if (above(pitch, "stairMaxPitch", "angle")) fail("stairMaxPitch", "angle", pitch, at);
    const stride = 2 * s.riser + s.tread;
    if (below(stride, "stairStrideMin", "length")) fail("stairStrideMin", "length", stride, at);
    if (above(stride, "stairStrideMax", "length")) fail("stairStrideMax", "length", stride, at);
  });
  // Whether a guard is required at all depends on the drop behind it, which
  // the plan does not record: a low railing is flagged, never failed.
  ((plan && plan.guards) || []).forEach((g) => {
    if (below(g.height, "guardMinHeight", "length")) add("guardMinHeight", "warn", "length", g.height, R.guardMinHeight.value, { itemId: g.id });
  });

  const counts = { error: 0, warn: 0, info: 0 };
  findings.forEach((f) => { counts[f.severity]++; });
  return { profile, findings, counts };
}

/* An escape room needs one window (or an exterior door) big enough to climb
   out of. The plan stores the rough opening, which is always larger than the
   net clear opening of the sash, so a window that fails on the rough opening
   certainly fails, and one that passes still needs its sash type checked. */
function escapeOpening(room, { R, add, fail }) {
  const at = { roomKey: room.key };
  if (room.exteriorDoor) return;
  const windows = room.windows || [];
  const fits = (w) => w.width * w.height / 10000 >= R.escapeMinArea.value - TOL.area &&
    w.height >= R.escapeMinHeight.value - TOL.length && w.width >= R.escapeMinWidth.value - TOL.length &&
    (w.sill || 0) <= R.escapeMaxSill.value + TOL.length;
  const ok = windows.find(fits);
  if (ok) { add("escapeMinArea", "info", "area", ok.width * ok.height / 10000, R.escapeMinArea.value, { ...at, itemId: ok.id }); return; }
  if (!windows.length) { fail("escapeMinArea", "area", 0, at); return; }
  // Report the window closest to qualifying, on the dimension it misses.
  const best = windows.slice().sort((a, b) => b.width * b.height - a.width * a.height)[0];
  const where = { ...at, itemId: best.id };
  if ((best.sill || 0) > R.escapeMaxSill.value + TOL.length) fail("escapeMaxSill", "length", best.sill || 0, where);
  if (best.height < R.escapeMinHeight.value - TOL.length) fail("escapeMinHeight", "length", best.height, where);
  if (best.width < R.escapeMinWidth.value - TOL.length) fail("escapeMinWidth", "length", best.width, where);
  if (best.width * best.height / 10000 < R.escapeMinArea.value - TOL.area) fail("escapeMinArea", "area", best.width * best.height / 10000, where);
}

/* Space-standard bedrooms (England's NDSS): a bedroom of the double area is
   a double with two bedspaces, a smaller one a single with one. The main
   double — a room typed as the master bedroom, else the largest double — has
   the wider minimum. Returns { bedrooms, bedspaces } for the dwelling-area
   table. */
function bedroomSpace(rooms, { R, fail, below }) {
  const beds = rooms.filter((r) => SLEEPING_TYPES.has(r.type) && Number.isFinite(r.area));
  const doubleArea = R.doubleBedroomMinArea ? R.doubleBedroomMinArea.value - TOL.area : Infinity;
  const isDouble = (r) => r.type === "masterBedroom" || r.area >= doubleArea;
  const byArea = (a, b) => b.area - a.area;
  const main = beds.filter((r) => r.type === "masterBedroom").sort(byArea)[0] || beds.filter(isDouble).sort(byArea)[0] || null;
  beds.forEach((room) => {
    const at = { roomKey: room.key };
    if (room.type === "masterBedroom" && R.doubleBedroomMinArea && room.area < doubleArea)
      fail("doubleBedroomMinArea", "area", room.area, at);
    else if (below(room.area, "singleBedroomMinArea", "area")) fail("singleBedroomMinArea", "area", room.area, at);
    const widthKey = !isDouble(room) ? "singleBedroomMinWidth" : room === main ? "mainBedroomMinWidth" : "doubleBedroomMinWidth";
    if (below(room.width, widthKey, "length")) fail(widthKey, "length", room.width, at);
  });
  return { bedrooms: beds.length, bedspaces: beds.reduce((n, r) => n + (isDouble(r) ? 2 : 1), 0) };
}

/* The dwelling's gross internal area against the table row for its bedrooms
   and bedspaces (a studio is 1b1p; a mix the table lacks takes the smallest
   row at or above it). The plan's figure is the sum of the indoor rooms,
   which leaves out internal walls, so a shortfall is flagged, not failed. */
export function dwellingRequirement(table, bedrooms, bedspaces) {
  const b = Math.max(1, bedrooms), p = Math.max(b, bedspaces, 1);
  const rows = Object.entries(table).map(([key, area]) => {
    const m = /^(\d+)b(\d+)p$/.exec(key);
    return m ? { key, b: Number(m[1]), p: Number(m[2]), area } : null;
  }).filter((r) => r && r.b === b).sort((x, y) => x.p - y.p);
  if (!rows.length) return null;
  return rows.find((r) => r.p >= p) || rows[rows.length - 1];
}

function dwellingSpace(rooms, { bedrooms, bedspaces }, { R, add }) {
  const row = dwellingRequirement(R.dwellingMinArea.value, bedrooms, bedspaces);
  if (!row) return;
  const gia = rooms.filter((r) => !OUTDOOR_TYPES.has(r.type) && Number.isFinite(r.area)).reduce((s, r) => s + r.area, 0);
  if (gia < row.area - TOL.area) add("dwellingMinArea", "warn", "area", gia, row.area, { detail: row.key });
}

function safeRoom(room, R, add) {
  const at = { roomKey: room.key };
  if (Number.isFinite(room.area)) {
    if (room.area < R.safeRoomAbsoluteMinArea.value - TOL.area) add("safeRoomAbsoluteMinArea", "error", "area", room.area, R.safeRoomAbsoluteMinArea.value, at);
    else if (room.area < R.safeRoomArea.value - TOL.area) add("safeRoomArea", "warn", "area", room.area, R.safeRoomArea.value, at);
  }
  if (Number.isFinite(room.width) && room.width < R.safeRoomMinWidth.value - TOL.length) add("safeRoomMinWidth", "error", "length", room.width, R.safeRoomMinWidth.value, at);
  if (Number.isFinite(room.ceiling) && room.ceiling < R.safeRoomCeiling.value - TOL.length) add("safeRoomCeiling", "error", "length", room.ceiling, R.safeRoomCeiling.value, at);
  if (Number.isFinite(room.wallThickness) && room.wallThickness < R.safeRoomWallThickness.value - TOL.length)
    add("safeRoomWallThickness", R.safeRoomWallThickness.conflicting ? "warn" : "error", "length", room.wallThickness, R.safeRoomWallThickness.value, at);
}
