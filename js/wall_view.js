/* How the planner's 3D view shows walls: one switch with three positions,
   the way The Sims does it.

     up   — every wall at full height;
     cut  — the near side steps out of the way as you orbit (nearSideWall() in
            js/wall_cut.js), so the room you look at is always open;
     down — the dollhouse cut: every wall built to the cutaway height.

   "down" IS the dollhouse cutaway (S.cutaway.on), which travels with the
   scene; the other two and the look of a cut wall are a preference about the
   VIEW, kept in localStorage like the layer state (js/layers.js) and never
   undone by Ctrl+Z.

   A near wall that is cut can be shown three ways:
     stub — a low wall about knee high, so the plan stays readable;
     fade — the whole wall, faint;
     hide — gone (the original behaviour).

   IMPORT RULE: state.js only. view3d.js and the UI both read this module, so
   anything more would be an import cycle. */
import { S } from "./state.js";

export const WALL_MODES = ["up", "cut", "down"];
export const CUT_STYLES = ["stub", "fade", "hide"];
export const STUB_HEIGHT = 40; // cm: a wall cut to a stub
export const FADE_LEVEL = 0.18; // opacity of a faded near wall

var PREFS = "home3d_walls3d";
var prefs = { near: true, style: "stub" };

export function loadWallView() {
  try {
    if (typeof localStorage === "undefined") return prefs;
    var p = JSON.parse(localStorage.getItem(PREFS) || "null");
    if (p && typeof p === "object") {
      if (typeof p.near === "boolean") prefs.near = p.near;
      if (CUT_STYLES.indexOf(p.style) >= 0) prefs.style = p.style;
    }
  } catch (err) {
    /* storage blocked or corrupt — the defaults stand */
  }
  return prefs;
}
loadWallView();

function save() {
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(PREFS, JSON.stringify(prefs));
  } catch (err) {
    /* a full or disabled quota must never break the view */
  }
}
function announce() {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("walls3d:changed"));
}

export function nearCutOn() {
  return prefs.near;
}
export function cutStyle() {
  return prefs.style;
}
export function wallMode() {
  return S.cutaway && S.cutaway.on ? "down" : prefs.near ? "cut" : "up";
}

// The near-side half of the switch. "down" goes through setCutaway (js/ui.js),
// which owns the scene field and the rebuild it needs.
export function setNearCut(on) {
  on = !!on;
  if (prefs.near === on) return;
  prefs.near = on;
  save();
  announce();
}
export function setCutStyle(style) {
  if (CUT_STYLES.indexOf(style) < 0 || prefs.style === style) return;
  prefs.style = style;
  save();
  announce();
}

// For the tests: back to the defaults, nothing persisted.
export function resetWallView() {
  prefs = { near: true, style: "stub" };
}
