/* Strings for placing pieces on walls and the live distances
   (js/interaction/wall_plane_guides.js, the itemOnWall action), English and
   Hebrew side by side. Kept out of js/i18n/*.js, which are frozen at their
   size by the structure gate. */
import { getLang } from "./i18n.js";

const S = {
  onWall: ["On wall", "על הקיר"],
  onWallTip: ["Hang this piece on the nearest wall and drag it across the wall", "תליית הפריט על הקיר הקרוב וגרירתו על פני הקיר"],
  offWall: ["Off wall", "הורד מהקיר"],
  offWallTip: ["Put this piece back on the floor", "החזרת הפריט לרצפה"],
  alwaysOnWall: ["This piece always hangs on a wall", "פריט זה תלוי תמיד על קיר"],
  noWall: ["No wall near this piece", "אין קיר קרוב לפריט"],
  putOnWall: ["On the wall", "הוצב על הקיר"],
  putOnFloor: ["Back on the floor", "הוחזר לרצפה"],
  hint: ["Drag across the wall · Shift: straight · Alt: free", "גרירה על פני הקיר · Shift: בקו ישר · Alt: חופשי"],
  // engaged snap names
  end: ["corner", "פינה"],
  "run-centre": ["centre of wall", "מרכז הקיר"],
  "item-edge": ["aligned with edge", "מיושר לקצה"],
  "item-centre": ["centred on piece", "ממורכז לפריט"],
  "item-top": ["on top of piece", "מעל הפריט"],
  "item-bottom": ["aligned with bottom", "מיושר לתחתית"],
  "opening-edge": ["aligned with opening", "מיושר לפתח"],
  "opening-centre": ["centred on opening", "ממורכז לפתח"],
  equal: ["equal gaps", "מרווחים שווים"],
  floor: ["on the floor", "על הרצפה"],
  ceiling: ["at the top", "צמוד לתקרה"],
  sill: ["aligned with sill", "מיושר לאדן"],
  head: ["aligned with window head", "מיושר לראש החלון"],
  point: ["on the point", "על הנקודה"],
  // what a live distance reached (dims' `reach` / `what`, floor hits' `what` / `facing`)
  "reach-door": ["door", "דלת"],
  "reach-window": ["window", "חלון"],
  "reach-passage": ["passage", "מעבר"],
  "reach-opening": ["opening", "פתח"],
  "reach-end": ["wall end", "קצה הקיר"],
};

/** The short name of an opening type (or "end") a distance reached. */
export function reachName(what) {
  return wallPlaneText(S["reach-" + what] ? "reach-" + what : "reach-opening");
}

export function wallPlaneText(key, vars) {
  const pair = S[key];
  let text = pair ? (getLang() === "he" ? pair[1] : pair[0]) : key;
  if (vars) for (const k of Object.keys(vars)) text = text.split("{" + k + "}").join(String(vars[k]));
  return text;
}
