/* The showcase house: a furnished single-storey home laid out by the
   generator (the "showcase" entry in js/generation_layout.js) and opened the
   way it is meant to be seen — the presentation plan, the dollhouse cutaway
   and warm afternoon light. Services are left out: a showroom plan is about
   the rooms, and MEP runs would draw over them. */
import { S } from "./state.js";
import { generateApartment } from "./generator.js";
import { normalizeCutaway } from "./wall_cut.js";
import { openingHasSwingConflict } from "./swing_clearance.js";
import { mkItem } from "./furniture.js";

const SWINGS = ["R_IN", "L_IN", "R_OUT", "L_OUT"];
/* A door the generator hung into its own fixtures (a bathroom door onto the
   WC) is re-hung the first way that clears: other hinge, then outward. */
export function clearDoorSwings(state) {
  let fixed = 0;
  state.openings.forEach((o) => {
    if (o.type !== "door" || o.isSliding || o.isPocket || !openingHasSwingConflict(o)) return;
    const was = o.swingDir;
    const ok = SWINGS.find((dir) => { o.swingDir = dir; return !openingHasSwingConflict(o); });
    if (ok) fixed++;
    else o.swingDir = was;
  });
  return fixed;
}

export const SHOWCASE_VIEW = Object.freeze({ planStyle: "presentation", cutaway: { on: true, height: 150, cap: "white" }, hour: 15 });

export function showcaseHouse() {
  const result = generateApartment("showcase", true, { infrastructure: false });
  if (result && result.ok === false) return result;
  clearDoorSwings(S);
  dressSite(S);
  S.planStyle = SHOWCASE_VIEW.planStyle;
  S.cutaway = normalizeCutaway(SHOWCASE_VIEW.cutaway);
  S.hour = SHOWCASE_VIEW.hour;
  S.dirty3D = true;
  return result;
}

/* The site: a car on the drive in front of the kitchen wing and two garden
   trees at opposite corners — outside every room, so no furnishing rule
   sees them. Positions are relative to the showcase layout (16.8 x 10 m,
   front along z = 0). */
export function dressSite(state) {
  [["car", 1330, -330, 90, "silver"], ["tree", -230, -220, 0], ["tree", 1930, 1180, 30], ["tree", -260, 1150, 60]].forEach(function (d) {
    const it = mkItem(d[0], d[1], d[2], d[3]);
    if (d[4]) it.variant = d[4];
    state.items.push(it);
  });
}
