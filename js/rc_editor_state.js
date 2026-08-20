// RC track editor — shared state, constants and small helpers.
//
// The editor's two mutable roots are REASSIGNED at runtime (`E` when rc.js
// hands over its env, `D` on every open/close), so they cannot be plain
// exports: an importing module would keep the stale binding. They live as
// properties of `ST` instead, and every module reaches them as `ST.D` / `ST.E`.
// Same rule as drive_state.js — if it is shared and it changes, it hangs off a
// container, never off a bare `let`.
import { getLang } from "./i18n.js";
import { STEP_UP as SHARED_STEP_UP } from "./road_surface.js";

export const ST = {
  E: null, // env handed over by rc.js (scene, camera, rebuild hooks, …)
  D: null, // live editor state (null while the editor is closed)
};

export const GHOST_SEG = 10; // ghost samples per anchor span
export const HIT_PX = 14; // 2D grab radius
export const CLEAR_BAND = 6; // body band used to decide whether a box blocks the deck
export const STEP_UP = SHARED_STEP_UP; // ledge the truck drives over instead of into (single-sourced in road_surface.js)
export const ANG_SNAP = Math.PI / 12; // 15° — Ctrl-drag angle snap
export const SAVE_KEY = "home3d_rc_custom_tracks";
export const THEMES = ["asphalt", "wood", "neon", "gold"];
export const THEME_COL = {
  asphalt: "#3c4149", wood: "#7c4e29", neon: "#0d0926", gold: "#d4af37",
};
export const PHYS_PRESETS = {
  arcade: { MAXV: 115, ACC: 130, TURN_MAX: 4.2, GRAV: 700 },
  offroad: { MAXV: 65, ACC: 95, TURN_MAX: 2.8, GRAV: 950 },
  drift: { MAXV: 95, ACC: 110, TURN_MAX: 5.0, GRAV: 550 },
  relaxed: { MAXV: 55, ACC: 65, TURN_MAX: 2.5, GRAV: 600 },
};

export function editorActive() {
  return !!(ST.D && ST.D.on);
}

export function L(he, en) {
  return getLang() === "he" ? he : en;
}
export function fin(v) {
  return typeof v === "number" && isFinite(v);
}
export function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}
// `f` is the id of the pass-by rule that laid this point (rc_editor_faces.js)
// and `ride` marks a point that belongs ON a piece of furniture. Both have to
// survive every clone — history, presets and the write-through to rc.js all go
// through here, and a point that loses its tag stops belonging to its rule.
export function copyAnchor(a) {
  var out = { x: a.x, z: a.z };
  if (fin(a.y)) out.y = a.y;
  if (a.f) out.f = a.f;
  if (a.ride) out.ride = true;
  // per-section surface: "road" pours a deck on this leg, "home" keeps the
  // floor/furniture even if the builder would have bridged it
  if (a.surf === "road" || a.surf === "home") out.surf = a.surf;
  return out;
}
export function cloneAnchors(pts) {
  return pts.map(copyAnchor);
}

// detectRooms() is not cheap and the map repaints ~11×/s — cache it and only
// re-detect when the track (and therefore the scene) has changed.
export function rooms() {
  if (!ST.D.roomCache) ST.D.roomCache = ST.E.rooms();
  return ST.D.roomCache;
}
