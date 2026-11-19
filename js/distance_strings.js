/* Strings for editing and keeping distances (js/distance_edit.js, the kept
   distances in the inspector, js/ui_props/keeps.js), English and Hebrew side
   by side. Kept out of js/i18n/*.js, which are frozen at their size. Numbers
   inside Hebrew text go through num(): wrapped in an LTR isolate so "60 cm"
   never reads backwards. */
import { getLang } from "./i18n.js";

const S = {
  title: ["Distance", "מרחק"],
  apply: ["Apply", "החל"],
  keep: ["Keep this distance", "שמור על המרחק"],
  unlock: ["Unlock", "בטל שמירה"],
  kept: ["Kept distances", "מרחקים שמורים"],
  keptTip: ["Kept when walls or other pieces move", "נשמרים כשקירות או פריטים זזים"],
  keptBack: ["Kept distance: {what} stays {value}", "מרחק שמור: {what} נשאר {value}"],
  violated: ["Kept distance not met (Alt)", "מרחק שמור לא מתקיים (Alt)"],
  editHint: ["Click to type a distance", "לחיצה להקלדת מרחק"],
  // what a distance is kept to
  "to-wall": ["wall", "קיר"],
  "to-item": ["{name}", "{name}"],
  "to-opening": ["opening", "פתח"],
  "to-wall-end": ["wall end", "קצה הקיר"],
  "to-floor": ["floor", "רצפה"],
  "to-ceiling": ["ceiling", "תקרה"],
  piece: ["piece", "פריט"],
  // refusals (js/item_keep.js codes)
  "err-bad-value": ["Type a length", "יש להקליד אורך"],
  "err-negative": ["A distance cannot be negative", "מרחק אינו יכול להיות שלילי"],
  "err-blocked": ["A wall is in the way", "קיר חוסם את התזוזה"],
  "err-below-floor": ["That would put it below the floor", "הפריט יירד מתחת לרצפה"],
  "err-above-ceiling": ["That would put it above the ceiling", "הפריט יעלה מעל התקרה"],
  "err-parallel-conflict": ["Conflicts with another kept distance", "סותר מרחק שמור אחר"],
  "err-unsolved": ["Conflicts with another kept distance", "סותר מרחק שמור אחר"],
  "err-cycle": ["Pieces would be kept to each other in a loop", "הפריטים יישמרו זה לזה במעגל"],
  "err-too-many": ["Too many kept distances on this piece", "יותר מדי מרחקים שמורים לפריט"],
  "err-duplicate": ["This distance is already kept", "המרחק כבר שמור"],
  "err-missing": ["What it measured to is gone", "מה שנמדד אליו כבר לא קיים"],
  "err-self": ["A piece cannot keep a distance to itself", "פריט אינו יכול לשמור מרחק מעצמו"],
  "err-locked": ["This piece is locked", "הפריט נעול"],
  "err-invalid": ["This distance cannot be edited", "לא ניתן לערוך מרחק זה"],
};

/** A number (already formatted) set LTR inside text of either direction. */
export function num(text) {
  return "⁦" + String(text) + "⁩";
}

export function distanceText(key, vars) {
  const pair = S[key];
  let text = pair ? (getLang() === "he" ? pair[1] : pair[0]) : key;
  if (vars) for (const k of Object.keys(vars)) text = text.split("{" + k + "}").join(String(vars[k]));
  return text;
}

/** The message for one of the keep model's error codes. */
export function distanceError(code) {
  return S["err-" + code] ? distanceText("err-" + code) : distanceText("err-invalid");
}
