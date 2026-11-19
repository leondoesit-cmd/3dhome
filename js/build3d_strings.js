/* Strings for building in the 3D pane (the Display popover, the chain action
   strip), English and Hebrew side by side. Kept out of js/i18n/*.js, which are
   frozen at their size by the structure gate. */
import { getLang } from "./i18n.js";

const S = {
  preview: ["Display", "תצוגה"],
  previewTip: ["How the 3D view shows walls and tool previews", "איך התצוגה התלת־ממדית מציגה קירות ותצוגה מקדימה של כלים"],
  sectionWalls: ["Walls", "קירות"],
  wallsSolid: ["Solid", "אטומים"],
  wallsXray: ["See-through", "שקופים"],
  sectionPreview: ["Tool preview", "תצוגה מקדימה של כלי"],
  previewNote: ["Shows only while you draw with a tool", "מוצג רק בזמן ציור עם כלי"],
  wallOpacity: ["Opacity", "אטימות"],
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
