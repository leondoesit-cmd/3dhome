/* Strings for the Draw cabinet tool (fitcab) and the 3D pane's selection bar,
   English and Hebrew side by side. Kept out of js/i18n/*.js, which are frozen
   at their size by the structure gate. */
import { getLang } from "./i18n.js";

const S = {
  toolName: ["Draw cabinet", "צייר ארון"],
  hint3d: ["Drag a box on the floor or a wall · click a wall to fill it", "גררו מלבן על הרצפה או על קיר · לחצו על קיר כדי למלא אותו"],
  hint2d: ["Drag a box on the floor · drag along a wall · click a wall to fill it", "גררו מלבן על הרצפה · גררו לאורך קיר · לחצו על קיר כדי למלא אותו"],
  family: ["Cabinet type", "סוג ארון"],
  auto: ["Auto (by size)", "אוטומטי (לפי גודל)"],
  tooShallow: ["Too shallow", "רדוד מדי"],
  tooShort: ["Too low", "נמוך מדי"],
  f_tooShallow: ["That box is too shallow for a cabinet", "המלבן רדוד מדי לארון"],
  f_tooShort: ["That box is too low for a cabinet", "המלבן נמוך מדי לארון"],
  rotate: ["Rotate 90°", "סובב 90°"],
  rotateTip: ["Turn a quarter turn about its centre", "סיבוב רבע סיבוב סביב המרכז"],
  flip: ["Flip", "הפוך"],
  flipTip: ["Turn it round to face the other way", "סיבוב לכיוון ההפוך"],
  onWall: ["On wall", "על הקיר"],
  onWallTip: ["Hang it on the wall it faces", "תלייה על הקיר שמולו"],
  dup: ["Duplicate", "שכפל"],
  del: ["Delete", "מחק"],
  dragNote: ["Drag to move", "גררו להזזה"],
};

export function fitText(key, vars) {
  const pair = S[key];
  let text = pair ? (getLang() === "he" ? pair[1] : pair[0]) : key;
  if (vars) for (const k of Object.keys(vars)) text = text.split("{" + k + "}").join(String(vars[k]));
  return text;
}
