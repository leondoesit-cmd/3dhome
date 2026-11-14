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
  sheet_tb_project: ["PROJECT", "פרויקט"],
  sheet_tb_address: ["ADDRESS", "כתובת"],
  sheet_tb_client: ["CLIENT", "מזמין"],
  sheet_tb_designer: ["DESIGNER", "מתכנן"],
  sheet_tb_title: ["DRAWING", "שם השרטוט"],
  sheet_tb_rev: ["REV", "מהד׳"],
  sheet_tb_rev_desc: ["DESCRIPTION", "תיאור השינוי"],
  sheet_tb_approval: ["APPROVALS / STAMP", "אישורים / חותמת"],
  sheet_legend: ["LEGEND", "מקרא"],
  legend_concrete: ["Reinforced concrete", "בטון מזוין"],
  legend_masonry: ["Masonry / block", "בנייה / בלוקים"],
  legend_partition: ["Partition", "מחיצה"],
  legend_insulation: ["Insulation", "בידוד"],
  legend_membrane: ["Membrane", "יריעת איטום"],
  legend_finish: ["Plaster / boards", "טיח / לוחות"],
  legend_door_tag: ["Door number", "מספר דלת"],
  legend_window_tag: ["Window letter", "אות חלון"],
  legend_opening: ["Opening, frame and glazing", "פתח, משקוף וזיגוג"],
  legend_level: ["Finished floor level", "מפלס רצפה גמורה"],
  legend_dim: ["Dimension", "מידה"],
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
  pro_drawing_sources: ["Sources", "מקורות"],
  pro_drawing_zoom_in: ["Zoom in", "הגדלה"],
  pro_drawing_actual: ["Actual size (1:1 on screen)", "גודל אמיתי"],
  pro_drawing_furniture: ["Furniture", "ריהוט"],
  pro_drawing_info: ["Title block", "פרטי גיליון"],
  pro_drawing_add_rev: ["Add revision", "הוספת מהדורה"],
  pro_drawing_rev_note: ["What changed", "מה השתנה"],
  pro_drawing_zoom_out: ["Zoom out", "הקטנה"],
  pro_drawing_fit: ["Fit page", "התאמה לדף"],
  pro_drawing_why_scale: ["{scale} is the scale {std} uses for this sheet.", "{scale} הוא קנה המידה שבו {std} משרטט גיליון זה."],
  pro_drawing_why_paper: ["{paper} is the smallest sheet it fits: the drawing needs {need} mm.", "{paper} הוא הגיליון הקטן ביותר שהשרטוט נכנס בו: נדרשים {need} מ״מ."],
  pro_drawing_why_smaller: ["{smaller} has only {room} mm.", "ב-{smaller} יש רק {room} מ״מ."],
  pro_drawing_why_finer: ["The plan filled under 40% of the field at the coarser scale, so the standard's finer scale is used.", "בקנה המידה הגס התוכנית מילאה פחות מ-40% מהשטח, ולכן נבחר קנה המידה המפורט של התקן."],
  pro_drawing_why_fill: ["The plan fills {fill}% of the drawing field.", "התוכנית ממלאת {fill}% משטח השרטוט."],
  pro_drawing_why_pinned: ["Paper or scale set by you.", "הנייר או קנה המידה נבחרו ידנית."],
  view_drawing: ["Drawing", "שרטוט"],
  view_mode_aria: ["View", "תצוגה"],
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
