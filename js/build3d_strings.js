/* Strings for building in the 3D pane (the Preview setting, the chain action
   strip), English and Hebrew side by side. Kept out of js/i18n/*.js, which are
   frozen at their size by the structure gate. */
import { getLang } from "./i18n.js";

const S = {
  preview: ["Preview", "תצוגה מקדימה"],
  previewTip: ["How the 3D view previews what a tool will build", "איך התצוגה התלת־ממדית מציגה את מה שהכלי עומד לבנות"],
  modeGhost: ["Transparent", "שקוף"],
  modeSolid: ["Solid", "אטום"],
  modeOutline: ["Outline", "קווי מתאר"],
  opacity: ["Opacity", "אטימות"],
  finish: ["Finish", "סיום"],
  finishTip: ["Finish this run (Enter / double-click)", "סיום הרצף (Enter / לחיצה כפולה)"],
  undoPoint: ["Undo point", "בטל נקודה"],
  undoPointTip: ["Take back the last point", "ביטול הנקודה האחרונה"],
  cancel: ["Cancel", "ביטול"],
  cancelTip: ["Cancel (Esc)", "ביטול (Esc)"],
  design: ["Design", "עיצוב"],
  designTip: ["Open this cabinet in the cabinet designer", "פתיחת הארון במעצב הארונות"],
};

export function buildText(key, vars) {
  const pair = S[key];
  let text = pair ? (getLang() === "he" ? pair[1] : pair[0]) : key;
  if (vars) for (const k of Object.keys(vars)) text = text.split("{" + k + "}").join(String(vars[k]));
  return text;
}
