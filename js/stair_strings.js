/* Strings for the stair designer (js/ui_props/stairs.js), the stairs dialog
   (js/pro_actions.js openStairs) and stairwell voids, English and Hebrew side
   by side. Kept out of js/i18n/*.js, which are frozen at their size by the
   structure gate. Hebrew terms: רום (riser), שלח (going), מהלך (run),
   משטח ביניים / פודסט (landing), מדרגות משופעות (winders). */
import { getLang } from "./i18n.js";

const S = {
  title: ["Stair design", "תכנון מדרגות"],
  shape: ["Shape", "צורה"],
  straight: ["Straight", "ישרות"],
  L: ["L", "L"],
  U: ["U", "U"],
  custom: ["Custom", "מותאם"],
  turn: ["Turn", "פנייה"],
  left: ["Left", "שמאלה"],
  right: ["Right", "ימינה"],
  turnL: ["Turn left", "פנייה שמאלה"],
  turnR: ["Turn right", "פנייה ימינה"],
  turnS: ["Straight landing", "משטח ביניים ישר"],
  turnsAs: ["Turns as", "סוג הפנייה"],
  landing: ["Flat landing", "משטח ביניים (פודסט)"],
  winder: ["Winders", "מדרגות משופעות"],
  width: ["Width", "רוחב"],
  going: ["Going", "שלח"],
  risers: ["Steps", "רומים"],
  auto: ["Auto (to code)", "אוטומטי (לפי התקנות)"],
  autoT: ["Steps and going follow the rise and the building code", "מספר הרומים והשלח נקבעים לפי הגובה והתקנות"],
  rise: ["Rise", "גובה עלייה"],
  matchAbove: ["Match the floor above ({name})", "לפי הקומה שמעל ({name})"],
  runs: ["Runs", "מהלכים"],
  run: ["Run {n}", "מהלך {n}"],
  stepsUnit: ["steps", "מדרגות"],
  addTurn: ["+ Add a turn", "+ הוספת פנייה"],
  removeRun: ["Remove this run", "הסרת המהלך"],
  code: ["Building code: {name}", "תקנות בנייה: {name}"],
  riser: ["Riser", "רום"],
  goingRow: ["Going", "שלח"],
  stride: ["2R + G", "2 × רום + שלח"],
  pitch: ["Pitch", "שיפוע"],
  fit: ["Fit to code", "התאמה לתקנות"],
  winderNote: ["winders measured at the walking line", "מדרגות משופעות נמדדות בקו ההליכה"],
  curvedNote: ["The curved stair keeps its catalogue shape.", "מדרגות הקשת שומרות על צורת הקטלוג."],
  sizeLocked: ["Set by Stair design", "נקבע בתכנון המדרגות"],
  equalNote: ["All risers equal ({n} × {r}), equal going on every run.", "כל הרומים שווים ({n} × {r}), שלח שווה בכל מהלך."],
  stairwell: ["Stairwell", "חלל מדרגות"],
  voidFollows: ["Follows the stairs on {floor}", "צמוד למדרגות בקומה {floor}"],
  editStairs: ["Edit the stairs", "עריכת המדרגות"],
  voidReseated: ["Stairwell on {floor} updated", "חלל המדרגות בקומה {floor} עודכן"],
  noFloorAbove: ["No floor above yet: the stairwell will be cut when you add a floor above and choose Stairwell.", "אין עדיין קומה מעל: חלל המדרגות ייחתך כשתוסיפו קומה מעל ותבחרו ביצירת חלל."],
  risesTo: ["The flight rises to {floor} and cuts its slab. Pick a spot on the plan after Place.", "המהלך עולה אל {floor} וחותך את התקרה. לאחר \"מיקום\" בחרו נקודה בתוכנית."],
  dialogTitle: ["Stairs", "מדרגות"],
  place: ["Place", "מיקום"],
  rotateT: ["Drag to rotate (Shift: free)", "גררו לסיבוב (Shift: חופשי)"],
};

export function stairText(key, vars) {
  const pair = S[key];
  let text = pair ? (getLang() === "he" ? pair[1] : pair[0]) : key;
  if (vars) text = text.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? vars[k] : m));
  return text;
}

/* A stored void name shown in the UI language: voids cut from stairs are
   saved as the English "Stairwell". */
export function voidDisplayName(o) {
  const name = o && typeof o.name === "string" ? o.name : "";
  return o && o.stairsId != null && name === "Stairwell" ? stairText("stairwell") : name;
}

export const STAIR_TEXT_KEYS = Object.keys(S);
