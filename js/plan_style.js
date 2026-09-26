/* Plan drawing style.

   "technical" is the clean CAD plan the editor has always drawn: flat room
   tints, layered wall bands, line-art furniture glyphs. "presentation" is the
   marketing plan: textured floors, dark walls with a soft shadow, furniture
   as top-down renders of the real 3D models, lawn and paving round the house,
   and room names with their size underneath.

   The style is a property of the document (it saves with the scene, so a
   shared plan opens the way it was presented), not a layer or a display
   preference, and it never changes geometry — only how plan2d.js paints. */
import { S } from "./state.js";

export const PLAN_STYLES = ["technical", "presentation"];

export function normalizePlanStyle(v) {
  return PLAN_STYLES.indexOf(v) !== -1 ? v : "technical";
}

export function planStyle() {
  return normalizePlanStyle(S.planStyle);
}

export function isPresentation() {
  return planStyle() === "presentation";
}

/* Only the colours that differ between the two styles live here; everything
   else in plan2d.js stays a literal. */
export const PLAN_THEME = {
  technical: {
    wallFill: "#7a7060",
    wallStroke: "#635b50",
    roomTitle: "#33312c",
    roomSub: "#46504f",
  },
  presentation: {
    wallFill: "#2b2926",
    wallStroke: "#161514",
    wallShadow: "rgba(0,0,0,.38)",
    itemShadow: "rgba(40,30,20,.34)",
    threshold: "#e6e1d8",
    sill: "#f4f5f4",
    glass: "#8fb4c4",
    roomTitle: "#1f1d1a",
    roomSub: "#3d3a35",
    halo: "rgba(255,255,255,.82)",
    lawn: "#8fae5d",
  },
};

export function planTheme() {
  return PLAN_THEME[planStyle()];
}
