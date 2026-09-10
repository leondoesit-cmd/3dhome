/* Room presets — the catalogue the "place a room" tool draws from.
 *
 * A plan drawn wall by wall asks the user to think in walls. Most people think
 * in ROOMS: "a bedroom, about three and a half by three, next to the bathroom".
 * A preset is that sentence made placeable — a named rectangle with a sensible
 * clear size, a floor finish, and the width of the door it wants.
 *
 * SIZES ARE INTERIOR (clear) DIMENSIONS, in centimetres, because that is the
 * number a brief, a building code and a tape measure all use, and because
 * S.interiorDims already makes the rest of the plan behave that way. The
 * stamping code grows the rectangle by half a wall thickness on each side to
 * get the centreline rectangle it actually builds (see js/room_graph.js).
 *
 * `window` is DELIBERATELY unused by manual stamping. A room placed by hand is
 * placed one at a time, and where its windows go is a decision the user is
 * about to make with the wall in front of them — guessing an exterior wall and
 * cutting a window into it is the kind of help that has to be undone. It is
 * here for the automatic apartment generator, which has no user to ask, and for
 * the guided semi-automatic flow that will ask once and apply to many.
 *
 * `min` describes advisory furnishing preferences. Manual capture and resizing
 * may use smaller positive dimensions while topology and locks stay enforced.
 * `kind` drives the connection the docking code makes — a wet room gets a
 * door, a circulation space gets an open passage.
 */

export const ROOM_CATEGORIES = [
  { id: "living", i18n: "rp_cat_living" },
  { id: "sleeping", i18n: "rp_cat_sleeping" },
  { id: "service", i18n: "rp_cat_service" },
  { id: "circulation", i18n: "rp_cat_circulation" },
  { id: "outdoor", i18n: "rp_cat_outdoor" },
];

/* kind:
     room        - a habitable room; connects with a hinged door
     wet         - bathroom / WC / laundry; door, and a tiled floor
     circulation - corridor, entry, landing; connects with an open passage
     outdoor     - balcony / terrace; connects with a door, no auto window */
export const ROOM_PRESETS = [
  { id: "living", i18n: "rp_living", name: "Living room", cat: "living", kind: "room", w: 450, d: 400, min: { w: 260, d: 240 }, floor: "wood", door: 90, window: { width: 200, height: 200, sill: 20 } },
  { id: "livingKitchen", i18n: "rp_livingKitchen", name: "Living / kitchen", cat: "living", kind: "room", w: 520, d: 420, min: { w: 320, d: 280 }, floor: "wood", door: 90, window: { width: 200, height: 160, sill: 60 } },
  { id: "kitchen", i18n: "rp_kitchen", name: "Kitchen", cat: "living", kind: "room", w: 320, d: 300, min: { w: 180, d: 180 }, floor: "tiles", door: 80, window: { width: 100, height: 120, sill: 90 } },
  { id: "dining", i18n: "rp_dining", name: "Dining room", cat: "living", kind: "room", w: 360, d: 300, min: { w: 240, d: 240 }, floor: "wood", door: 90, window: { width: 160, height: 160, sill: 60 } },
  { id: "office", i18n: "rp_office", name: "Study", cat: "living", kind: "room", w: 280, d: 260, min: { w: 200, d: 180 }, floor: "wood", door: 80, window: { width: 120, height: 120, sill: 90 } },

  { id: "bedroom", i18n: "rp_bedroom", name: "Bedroom", cat: "sleeping", kind: "room", w: 350, d: 300, min: { w: 240, d: 220 }, floor: "wood", door: 80, window: { width: 120, height: 120, sill: 90 } },
  { id: "masterBedroom", i18n: "rp_masterBedroom", name: "Master bedroom", cat: "sleeping", kind: "room", w: 420, d: 360, min: { w: 300, d: 260 }, floor: "wood", door: 90, window: { width: 160, height: 140, sill: 80 } },
  { id: "kidsRoom", i18n: "rp_kidsRoom", name: "Child's room", cat: "sleeping", kind: "room", w: 300, d: 280, min: { w: 220, d: 200 }, floor: "wood", door: 80, window: { width: 120, height: 120, sill: 90 } },
  { id: "closet", i18n: "rp_closet", name: "Walk-in closet", cat: "sleeping", kind: "room", w: 220, d: 180, min: { w: 120, d: 100 }, floor: "wood", door: 70, window: null },

  { id: "bathroom", i18n: "rp_bathroom", name: "Bathroom", cat: "service", kind: "wet", w: 240, d: 200, min: { w: 150, d: 140 }, floor: "tiles", door: 70, window: { width: 60, height: 60, sill: 140 } },
  { id: "ensuite", i18n: "rp_ensuite", name: "En-suite", cat: "service", kind: "wet", w: 200, d: 180, min: { w: 140, d: 130 }, floor: "tiles", door: 70, window: { width: 60, height: 60, sill: 140 } },
  { id: "wc", i18n: "rp_wc", name: "WC", cat: "service", kind: "wet", w: 150, d: 110, min: { w: 110, d: 90 }, floor: "tiles", door: 65, window: null },
  { id: "laundry", i18n: "rp_laundry", name: "Laundry", cat: "service", kind: "wet", w: 190, d: 160, min: { w: 120, d: 110 }, floor: "tiles", door: 70, window: null },
  { id: "storage", i18n: "rp_storage", name: "Store", cat: "service", kind: "room", w: 160, d: 120, min: { w: 90, d: 80 }, floor: "tiles", door: 70, window: null },

  { id: "corridor", i18n: "rp_corridor", name: "Corridor", cat: "circulation", kind: "circulation", w: 120, d: 320, min: { w: 90, d: 90 }, floor: "wood", door: 110, window: null },
  { id: "entry", i18n: "rp_entry", name: "Entrance hall", cat: "circulation", kind: "circulation", w: 200, d: 170, min: { w: 120, d: 110 }, floor: "tiles", door: 100, window: null },
  { id: "landing", i18n: "rp_landing", name: "Stair landing", cat: "circulation", kind: "circulation", w: 260, d: 200, min: { w: 150, d: 150 }, floor: "wood", door: 110, window: null },

  { id: "balcony", i18n: "rp_balcony", name: "Balcony", cat: "outdoor", kind: "outdoor", w: 320, d: 150, min: { w: 120, d: 90 }, floor: "tiles", door: 80, window: null },
  { id: "terrace", i18n: "rp_terrace", name: "Terrace", cat: "outdoor", kind: "outdoor", w: 400, d: 300, min: { w: 200, d: 150 }, floor: "tiles", door: 90, window: null },
];

const BY_ID = new Map(ROOM_PRESETS.map((p) => [p.id, p]));

export function roomPreset(id) {
  return BY_ID.get(id) || null;
}

export function presetsByCategory(cat) {
  return ROOM_PRESETS.filter((p) => p.cat === cat);
}

export const CONNECTION_MODES = Object.freeze(["auto", "door", "passage", "open"]);

/* The opening a preset wants where it meets a neighbour. Circulation spaces
   are open to what they serve — putting a door between a corridor and the
   living room it opens onto is the single most common thing people then have
   to undo, so the default is the passage. Passing an explicit `mode`
   ("door" | "passage" | "open") overrides the preset default. */
export function presetConnection(preset, neighbour, mode) {
  if (mode === "open") return { type: "open" };
  if (mode === "passage")
    return { type: "passage", width: Math.max(presetDoor(preset), presetDoor(neighbour)), height: 205, sill: 0 };
  if (mode === "door")
    return { type: "door", width: Math.min(presetDoor(preset), presetDoor(neighbour)), height: 205, sill: 0 };
  const a = preset && preset.kind, b = neighbour && neighbour.kind;
  if (a === "circulation" || b === "circulation")
    return { type: "passage", width: Math.max(presetDoor(preset), presetDoor(neighbour)), height: 205, sill: 0 };
  return { type: "door", width: Math.min(presetDoor(preset), presetDoor(neighbour)), height: 205, sill: 0 };
}

function presetDoor(preset) {
  const w = preset && Number(preset.door);
  return Number.isFinite(w) && w > 0 ? w : 80;
}

/* Interior size -> the axis-aligned CENTRELINE rectangle the walls are built
   on, centred on (cx,cz). Everything downstream works in centreline
   coordinates because that is what S.nodes holds. */
export function presetRect(preset, cx, cz, options) {
  const opts = options || {};
  const t = Number.isFinite(opts.thickness) ? opts.thickness : 10;
  const rot = ((Number(opts.rot) || 0) % 360 + 360) % 360;
  const swap = rot === 90 || rot === 270;
  const iw = Number.isFinite(opts.w) ? opts.w : preset.w;
  const id = Number.isFinite(opts.d) ? opts.d : preset.d;
  const w = (swap ? id : iw) + t;
  const d = (swap ? iw : id) + t;
  return { x0: cx - w / 2, z0: cz - d / 2, x1: cx + w / 2, z1: cz + d / 2 };
}

/* The other direction: what clear size does this centreline rectangle give? */
export function rectInterior(rect, thickness) {
  const t = Number.isFinite(thickness) ? thickness : 10;
  return { w: rect.x1 - rect.x0 - t, d: rect.z1 - rect.z0 - t };
}
