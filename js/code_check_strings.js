/* Strings for the building-code check (js/ui_code_check.js), English and
   Hebrew side by side. Kept out of js/i18n/*.js, which are frozen at their
   size by the structure gate. */
import { getLang } from "./i18n.js";

const S = {
  title: ["Building code check", "בדיקת תקנות בנייה"],
  jurisdiction: ["Jurisdiction", "תחום שיפוט"],
  edition: ["Edition", "מהדורה"],
  disclaimer: [
    "Advisory only. The values come from secondary summaries and have not been checked against the official code text. This is not a permit review; confirm with the authority having jurisdiction.",
    "בדיקה מייעצת בלבד. הערכים לקוחים מסיכומים משניים ולא נבדקו מול נוסח התקנות הרשמי. זו אינה בדיקת היתר; יש לאמת מול הרשות המוסמכת.",
  ],
  assumptions: [
    "Measured from the plan: clear height is the lowest wall height round the room, clear width is the short side of the room's interior bounding box, window areas are rough openings.",
    "נמדד מהתוכנית: גובה נטו הוא גובה הקיר הנמוך ביותר סביב החדר, רוחב נטו הוא הצלע הקצרה של מלבן החדר הפנימי, שטחי חלונות הם פתחים גולמיים.",
  ],
  none: ["No issues found against this profile.", "לא נמצאו ליקויים מול פרופיל זה."],
  noRooms: ["No enclosed rooms to check.", "אין חדרים סגורים לבדיקה."],
  untyped: ["{n} rooms have no type and were not checked. Set a room type to include them.", "ל-{n} חדרים לא הוגדר סוג והם לא נבדקו. הגדירו סוג חדר כדי לכלול אותם."],
  sources: ["Sources", "מקורות"],
  error: ["Below minimum", "מתחת למינימום"],
  warn: ["Check", "לבדיקה"],
  info: ["Confirm", "לאישור"],
  unverified: ["unverified", "לא אומת"],
  conflicting: ["sources disagree", "המקורות חלוקים"],
  conditional: ["applies only:", "חל רק:"],
  apartment: ["Dwelling", "הדירה"],
  required: ["required", "נדרש"],
  close: ["Close", "סגירה"],
  country_IL: ["Israel", "ישראל"],
  country_US: ["United States", "ארצות הברית"],
  country_GB: ["United Kingdom", "בריטניה"],
  country_DE: ["Germany", "גרמניה"],
  // one label per rule key in js/code_profiles.js
  habitableMinArea: ["Habitable room area", "שטח חדר מגורים"],
  habitableMinWidth: ["Habitable room width", "רוחב חדר מגורים"],
  largeRoomMinArea: ["One room must reach the larger minimum", "נדרש חדר אחד בשטח המינימלי המוגדל"],
  studioMinArea: ["One-room dwelling area", "שטח דירת חדר אחד"],
  halfRoomMinArea: ["Half-room area", "שטח חדרון"],
  halfRoomMinWidth: ["Half-room width", "רוחב חדרון"],
  ceilingHabitable: ["Ceiling height", "גובה תקרה"],
  ceilingCorridor: ["Hallway ceiling height", "גובה תקרה במסדרון"],
  corridorMinWidth: ["Hallway width", "רוחב מסדרון"],
  glazingRatio: ["Window area to floor area", "שטח חלון ביחס לשטח הרצפה"],
  escapeMinArea: ["Emergency escape opening area", "שטח פתח מילוט"],
  escapeMinHeight: ["Emergency escape opening height", "גובה פתח מילוט"],
  escapeMinWidth: ["Emergency escape opening width", "רוחב פתח מילוט"],
  escapeMaxSill: ["Emergency escape sill height (maximum)", "גובה אדן פתח מילוט (מרבי)"],
  escapeOk: ["Escape window passes on its rough opening; confirm the net clear opening of the sash", "חלון המילוט עומד בדרישה לפי הפתח הגולמי; יש לאשר את פתח המעבר נטו של הכנף"],
  stairMaxRiser: ["Stair riser (maximum)", "רום מדרגה (מרבי)"],
  stairMinTread: ["Stair tread", "שלח מדרגה"],
  stairMaxPitch: ["Stair pitch (maximum)", "שיפוע מדרגות (מרבי)"],
  stairStrideMin: ["Stair 2 × riser + tread", "2 × רום + שלח"],
  stairStrideMax: ["Stair 2 × riser + tread (maximum)", "2 × רום + שלח (מרבי)"],
  singleBedroomMinArea: ["Single bedroom area", "שטח חדר שינה ליחיד"],
  singleBedroomMinWidth: ["Single bedroom width", "רוחב חדר שינה ליחיד"],
  doubleBedroomMinArea: ["Main bedroom area (double)", "שטח חדר שינה ראשי (זוגי)"],
  doubleBedroomMinWidth: ["Double bedroom width", "רוחב חדר שינה זוגי"],
  mainBedroomMinWidth: ["Main double bedroom width", "רוחב חדר השינה הזוגי הראשי"],
  dwellingMinArea: ["Dwelling area (sum of indoor rooms; internal walls not counted)", "שטח הדירה (סכום החדרים הפנימיים, ללא קירות פנימיים)"],
  guardMinHeight: ["Railing height (if it guards a drop)", "גובה מעקה (אם הוא מגן מפני נפילה)"],
  safeRoomRequired: ["No safe room (ממ״ד): required in new dwellings unless exempt", "אין ממ״ד: נדרש בדירות חדשות אלא אם ניתן פטור"],
  safeRoomArea: ["Safe room area (smaller needs Home Front Command approval)", "שטח ממ״ד (שטח קטן יותר טעון אישור פיקוד העורף)"],
  safeRoomAbsoluteMinArea: ["Safe room area", "שטח ממ״ד"],
  safeRoomMinWidth: ["Safe room width", "רוחב ממ״ד"],
  safeRoomCeiling: ["Safe room height", "גובה ממ״ד"],
  safeRoomWallThickness: ["Safe room wall thickness", "עובי קירות ממ״ד"],
};

export function codeText(key, vars) {
  const pair = S[key];
  let text = pair ? (getLang() === "he" ? pair[1] : pair[0]) : key;
  if (vars) text = text.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? vars[k] : m));
  return text;
}

export const CODE_TEXT_KEYS = Object.keys(S);
