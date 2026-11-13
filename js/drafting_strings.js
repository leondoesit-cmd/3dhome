/* Strings for the professional drawing sheet (js/ui_pro_drawing.js, the
   regional sheet in js/exports_pro.js with its title block and schedule),
   English and Hebrew side by side. Kept out of js/i18n/*.js, which are frozen
   at their size by the structure gate. Hebrew drafting terms: קנה מידה
   (scale), גיליון (sheet), אדן (sill), סימון (mark). */
import { getLang } from "./i18n.js";

const D = {
  sheet_tb_scale: ["SCALE", "קנה מידה"],
  sheet_tb_date: ["DATE", "תאריך"],
  sheet_tb_sheet: ["SHEET", "גיליון"],
  sheet_door_schedule: ["DOOR SCHEDULE", "רשימת דלתות"],
  sheet_window_schedule: ["WINDOW SCHEDULE", "רשימת חלונות"],
  sheet_col_mark: ["MARK", "סימון"],
  sheet_col_width: ["WIDTH", "רוחב"],
  sheet_col_height: ["HEIGHT", "גובה"],
  sheet_col_sill: ["SILL", "אדן"],
  drafting_unit_cm: ["centimetres", "סנטימטרים"],
  drafting_unit_mm: ["millimetres", "מילימטרים"],
  drafting_unit_m_cm: ["metres, under 1 m in centimetres (raised digit = mm)", "מטרים, מתחת למטר בסנטימטרים (ספרה מורמת = מ״מ)"],
  drafting_unit_ft_in: ["feet and inches", "רגל ואינץ׳"],
  pro_drawing: ["Professional drawing", "שרטוט מקצועי"],
  pro_drawing_title: ["Professional drawing sheet", "גיליון שרטוט מקצועי"],
  pro_drawing_standard: ["Drafting standard", "תקן שרטוט"],
  pro_drawing_auto: ["Automatic: {name}", "אוטומטי: {name}"],
  pro_drawing_paper: ["Paper", "נייר"],
  pro_drawing_scale: ["Scale", "קנה מידה"],
  pro_drawing_best_fit: ["Best fit", "התאמה אוטומטית"],
  pro_drawing_print: ["Print", "הדפסה"],
  pro_drawing_download: ["Download SVG", "הורדת SVG"],
  pro_drawing_close: ["Close", "סגירה"],
  pro_drawing_sources: ["Sources", "מקורות"],
  pro_drawing_unverified: [
    "The regional conventions come from secondary sources and have not been checked against the standards' own text. Check the sheet before you submit it.",
    "מוסכמות השרטוט האזוריות לקוחות ממקורות משניים ולא נבדקו מול נוסח התקנים עצמם. בדקו את הגיליון לפני הגשה.",
  ],
};

export function draftText(key, vars) {
  const pair = D[key];
  let text = pair ? (getLang() === "he" ? pair[1] : pair[0]) : key;
  if (vars) text = text.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? vars[k] : m));
  return text;
}

export const DRAFT_TEXT_KEYS = Object.keys(D);
