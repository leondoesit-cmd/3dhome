/* Strings for stacking storeys: the floor strip's reference toggle, a new
   storey's name and the ghost of the other storey on the plan. English and
   Hebrew side by side, kept out of js/i18n/*.js, which are frozen at their
   size by the structure gate. */
import { getLang, t } from "./i18n.js";

const S = {
  floorN: ["Floor {n}", "קומה {n}"],
  elevTip: ["Floor level {elev}", "מפלס {elev}"],
  showBelow: ["Show the floor below", "הצג את הקומה שמתחת"],
  hideBelow: ["Hide the floor below", "הסתר את הקומה שמתחת"],
  showAbove: ["Show the floor above", "הצג את הקומה שמעל"],
  hideAbove: ["Hide the floor above", "הסתר את הקומה שמעל"],
  over: ["over {name}", "מעל {name}"],
  under: ["under {name}", "מתחת ל{name}"],
  tagBelow: ["{name} (below)", "{name} (מתחת)"],
  tagAbove: ["{name} (above)", "{name} (מעל)"],
  stairwellCut: ["Stairwell opening cut for the stairs from {name}", "נפתח חלל מדרגות עבור המדרגות מ{name}"],
  wallsCopied: ["Copied {n} walls from {name}", "הועתקו {n} קירות מ{name}"],
  nothingToCopy: ["The floor below has no walls to copy", "בקומה שמתחת אין קירות להעתקה"],
};

export function floorText(key, vars) {
  const pair = S[key];
  let text = pair ? (getLang() === "he" ? pair[1] : pair[0]) : key;
  if (vars) text = text.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? vars[k] : m));
  return text;
}

export const FLOOR_TEXT_KEYS = Object.keys(S);

/* The name a storey shows: the auto-created first storey speaks the current
   language unless the user renamed it. */
export function floorDisplayName(floor, index) {
  if (!floor) return "";
  if (floor.id === "floor-1" && (!floor.name || floor.name === "Ground floor" || floor.name === "קומת קרקע"))
    return t("floor_ground_name");
  /* "Floor 2" / "קומה 2" is the name the app gave, not the user's: show it in
     the current language, the way the ground floor is. */
  var auto = /^(?:Floor|קומה) (\d+)$/.exec(floor.name || "");
  if (auto) return floorText("floorN", { n: auto[1] });
  return floor.name || t("floor_ground") + " " + ((index || 0) + 1);
}
