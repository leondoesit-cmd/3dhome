/* The see-through walls switch, one flag with two controls: the Services
   panel's "X-Ray Walls" box (js/ui_mep.js) and the 3D pane's Display popover
   (js/build3d_ui.js, Walls: Solid | See-through). Both read and write
   S.mep.xray.walls (normalised in js/mep.js ensureMEP), so they cannot drift.
   Pure state helpers: no DOM, no three. */

/** Is the wall X-ray on in this plan state? Accepts the legacy boolean form. */
export function wallXrayOn(state) {
  var x = state && state.mep && state.mep.xray;
  if (!x) return false;
  return typeof x === "object" ? !!x.walls : !!x;
}

/** Turn the wall X-ray on or off; true when that changed anything. The caller
    marks the 3D view dirty (S.dirty3D), as the Services panel's box does,
    and calls ensureMEP() first so a plan with no services block gets a full
    one (a bare `mep` here would lack its nodes/runs arrays). */
export function setWallXray(state, on) {
  var m = state && state.mep;
  if (!m) return false;
  if (!m.xray || typeof m.xray !== "object") m.xray = { walls: !!m.xray, floor: false, ceiling: false };
  var want = !!on;
  if (!!m.xray.walls === want) return false;
  m.xray.walls = want;
  return true;
}
