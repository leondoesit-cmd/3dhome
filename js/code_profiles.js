/* Building-code profiles: the LEGAL minimums a plan is checked against, kept
   apart from the design advice in js/apartment_rules.js (which is what the
   generator holds itself to and may be stricter or looser than any code).

   A profile names a jurisdiction, the edition of its code, and one value per
   rule with the clause it comes from. Regional profiles inherit from a base
   (a US state from the model IRC edition it adopted) and override only what
   the region amends, so a state with steeper stairs changes two numbers, not a
   copy of the whole code.

   Every value is stored in model units — lengths in cm, areas in m², ratios as
   fractions — and the profile's `units` says how a report should print them.
   US values are exact conversions of the inch/foot figures in the code.

   NONE of these values has been checked against the official text: they come
   from secondary summaries (see each profile's `sources`) and carry
   `verified: false`. A check built on them is advisory and says so; it is not
   a permit review. Codes change (Israel amended room heights on 19.10.2025;
   the 2024 IRC renumbered Chapter 3), so each profile records its edition. */

const IN = 2.54, FT = 30.48, SQFT = 0.09290304;

const rule = (value, clause, extra) => Object.freeze({ value, clause, verified: false, ...(extra || {}) });

const IL_SOURCES = [
  "https://massad-group.com/%D7%AA%D7%99%D7%A7%D7%95%D7%9F-%D7%92%D7%95%D7%91%D7%94-%D7%9E%D7%99%D7%A0%D7%99%D7%9E%D7%9C%D7%99-%D7%AA%D7%A7%D7%A0%D7%95%D7%AA-%D7%94%D7%91%D7%A0%D7%99%D7%94-2025/",
  "https://www.sh-lawyer.co.il/single-post/%D7%A9%D7%98%D7%97%D7%9D-%D7%94%D7%9E%D7%99%D7%A0%D7%99%D7%9E%D7%9C%D7%99-%D7%A9%D7%9C-%D7%97%D7%93%D7%A8%D7%99-%D7%94%D7%91%D7%99%D7%AA",
  "https://adrk.co.il/mamad-takni",
  "https://www.bedekb.co.il/2022/08/%D7%AA%D7%A7%D7%9F-%D7%9E%D7%A2%D7%A7%D7%94-%D7%9E%D7%93%D7%A8%D7%92%D7%95%D7%AA/",
];
const IRC_SOURCES = [
  "https://www.finehomebuilding.com/2024/01/10/minimum-dimensions-in-the-irc",
  "https://bsd.dli.mt.gov/_docs/Training/IRC-Means-of-Egress-2021-IRC.pdf",
  "https://www.iccsafe.org/wp-content/uploads/Session-1-and-31-2024-IRC-Significant-Changes.pdf",
];
const UK_SOURCES = [
  "https://www.gov.uk/government/publications/technical-housing-standards-nationally-described-space-standard/technical-housing-standards-nationally-described-space-standard",
  "https://www.designingbuildings.co.uk/wiki/Stairs",
  "https://www.north-norfolk.gov.uk/media/1809/building-control-guidance-notes-means_of_escape.pdf",
  "https://camdocs.camden.gov.uk/CMWebDrawer/Record/10812666/file/document",
];
const DE_SOURCES = [
  "https://www.baunetzwissen.de/brandschutz/fachwissen/flucht--rettungswege/anleiterbare-fenster-3143585",
  "https://www.weka.de/architekten-ingenieure/din-18065/",
  "https://lexmea.de/de/gesetz/baybo/art-45",
  "https://lexmea.de/de/gesetz/baybo/art-35",
  "https://lexmea.de/de/gesetz/bauo-2018-nrw/46",
  "https://lxgesetze.de/lbo/34",
  "https://gesetze.co/BE/BauO_Bln/47",
];

/* NDSS Table 1, one-storey dwellings: minimum gross internal area in m² by
   bedrooms (b) and bedspaces (p). A bedroom of 11.5 m² or more is a double,
   two bedspaces; a smaller one is a single. 1b1p is 37 with a shower room. */
const NDSS_ONE_STOREY = Object.freeze({
  "1b1p": 39, "1b2p": 50, "2b3p": 61, "2b4p": 70, "3b4p": 74, "3b5p": 86, "3b6p": 95,
  "4b5p": 90, "4b6p": 99, "4b7p": 108, "4b8p": 117, "5b6p": 103, "5b7p": 112, "5b8p": 121,
  "6b7p": 116, "6b8p": 125,
});

/* A `conditional` rule binds only in circumstances the plan does not record
   (the storey, the building class, how the fire brigade reaches it): the
   check flags a shortfall for review instead of failing it, and shows the
   condition. */
const UK_ESCAPE = { en: "habitable rooms on storeys up to 4.5 m; ground-floor rooms opening onto a hall with an exit door are exempt", he: "חדרי מגורים בקומות עד 4.5 מ׳; חדרים בקומת הקרקע הנפתחים למבואה עם דלת יציאה פטורים" };
const DE_CEILING_GK12 = { en: "not for residential buildings of building classes 1 and 2; attics 2.20 m over half the area", he: "לא חל על בנייני מגורים בדרגות בנייה 1 ו-2; בעליות גג 2.20 מ׳ במחצית השטח" };
const DE_RESCUE = { en: "where the second escape route is a window the fire brigade reaches by ladder", he: "היכן שדרך המילוט השנייה היא חלון שכבאים מגיעים אליו בסולם" };
const DE_STATE_SUFFIX = " (MBO/DIN text; the state's own section may differ)";

const PROFILES = [
  {
    id: "il",
    country: "IL",
    name: { en: "Israel — Planning and Building Regulations", he: "ישראל — תקנות התכנון והבנייה" },
    edition: { en: "Permit Application Regulations 1970, as amended 19.10.2025; Home Front Command safe-room spec", he: "תקנות בקשה להיתר התש״ל-1970, בנוסח תיקון 19.10.2025; מפרט פיקוד העורף לממ״ד" },
    units: "metric",
    sources: IL_SOURCES,
    rules: {
      habitableMinArea: rule(8, { en: "Second Schedule, Part 2 — habitable room", he: "תוספת שנייה, חלק ב׳ — חדר מגורים" }),
      habitableMinWidth: rule(260, { en: "Second Schedule, Part 2 — habitable room", he: "תוספת שנייה, חלק ב׳ — חדר מגורים" }),
      largeRoomMinArea: rule(12, { en: "Second Schedule, Part 2 — one room in a dwelling of 2+ rooms", he: "תוספת שנייה, חלק ב׳ — חדר אחד בדירה של 2 חדרים ומעלה" }),
      studioMinArea: rule(14, { en: "Second Schedule, Part 2 — one-room dwelling", he: "תוספת שנייה, חלק ב׳ — דירת חדר אחד" }),
      halfRoomMinArea: rule(6, { en: "Second Schedule, Part 2 — half room (חדרון)", he: "תוספת שנייה, חלק ב׳ — חדרון" }),
      halfRoomMinWidth: rule(200, { en: "Second Schedule, Part 2 — half room (חדרון)", he: "תוספת שנייה, חלק ב׳ — חדרון" }),
      ceilingHabitable: rule(250, { en: "Reg. 2.03 — minimum height (amended 19.10.2025)", he: "תקנה 2.03 — גובה מינימלי (תיקון 19.10.2025)" }),
      glazingRatio: rule(0.10, { en: "Second Schedule — light and ventilation", he: "תוספת שנייה — תאורה ואוורור" }, { conflicting: true }),
      stairMaxRiser: rule(17.5, { en: "Second Schedule — stairs", he: "תוספת שנייה — מדרגות" }, { conflicting: true }),
      stairMinTread: rule(26, { en: "Second Schedule — stairs", he: "תוספת שנייה — מדרגות" }, { conflicting: true }),
      guardMinHeight: rule(105, { en: "SI 1142 — guards on landings and balconies", he: "ת״י 1142 — מעקות במשטחים ובמרפסות" }),
      safeRoomRequired: rule(true, { en: "Civil Defence (shelter specification) regulations — new dwellings", he: "תקנות ההתגוננות האזרחית (מפרטים לבניית מקלטים) — דירות חדשות" }),
      safeRoomArea: rule(9, { en: "Home Front Command spec — net area", he: "מפרט פיקוד העורף — שטח נטו" }),
      safeRoomAbsoluteMinArea: rule(5, { en: "Home Front Command spec — reduced area with approval", he: "מפרט פיקוד העורף — שטח מוקטן באישור" }),
      safeRoomMinWidth: rule(160, { en: "Home Front Command spec — width", he: "מפרט פיקוד העורף — רוחב" }),
      safeRoomCeiling: rule(250, { en: "Home Front Command spec — net height", he: "מפרט פיקוד העורף — גובה נטו" }),
      safeRoomWallThickness: rule(20, { en: "Home Front Command spec — reinforced-concrete walls", he: "מפרט פיקוד העורף — קירות בטון מזוין" }, { conflicting: true }),
    },
  },
  {
    id: "us-irc-2021",
    country: "US",
    name: { en: "United States — IRC 2021 (model code)", he: "ארה״ב — IRC 2021 (קוד מודל)" },
    edition: { en: "International Residential Code 2021", he: "International Residential Code 2021" },
    units: "imperial",
    sources: IRC_SOURCES,
    note: { en: "Applies only where a state or city adopted it; use the state profile when there is one.", he: "חל רק היכן שמדינה או עירייה אימצו אותו; העדיפו את פרופיל המדינה אם קיים." },
    rules: {
      habitableMinArea: rule(70 * SQFT, "R304.1"),
      habitableMinWidth: rule(7 * FT, "R304.2"),
      ceilingHabitable: rule(7 * FT, "R305.1"),
      ceilingCorridor: rule(7 * FT, "R305.1"),
      corridorMinWidth: rule(3 * FT, "R311.6"),
      glazingRatio: rule(0.08, "R303.1"),
      escapeMinArea: rule(5.7 * SQFT, "R310.2.1"),
      escapeMinHeight: rule(24 * IN, "R310.2.1"),
      escapeMinWidth: rule(20 * IN, "R310.2.1"),
      escapeMaxSill: rule(44 * IN, "R310.2.2"),
      stairMaxRiser: rule(7.75 * IN, "R311.7.5.1"),
      stairMinTread: rule(10 * IN, "R311.7.5.2"),
      guardMinHeight: rule(36 * IN, "R312.1.2"),
    },
  },
  {
    id: "us-irc-2024",
    parent: "us-irc-2021",
    country: "US",
    name: { en: "United States — IRC 2024 (model code)", he: "ארה״ב — IRC 2024 (קוד מודל)" },
    edition: { en: "International Residential Code 2024 (Chapter 3 renumbered; section numbers shown are the 2021 ones)", he: "International Residential Code 2024 (פרק 3 מוספר מחדש; מוצגים מספרי הסעיפים של 2021)" },
    units: "imperial",
    clauseSuffix: " (2021 numbering)",
  },
  {
    id: "us-ca", parent: "us-irc-2024", country: "US", region: "CA",
    name: { en: "California — California Residential Code 2025", he: "קליפורניה — California Residential Code 2025" },
    edition: { en: "CRC 2025 (Title 24 Part 2.5), based on IRC 2024, effective 1 Jan 2026", he: "CRC 2025 (Title 24 Part 2.5), מבוסס IRC 2024, בתוקף מ-1.1.2026" },
    units: "imperial",
    sources: ["https://up.codes/viewer/california/ca-residential-code-2025"],
  },
  {
    id: "us-fl", parent: "us-irc-2021", country: "US", region: "FL",
    name: { en: "Florida — Florida Building Code, Residential", he: "פלורידה — Florida Building Code, Residential" },
    edition: { en: "FBC-R 8th edition (2023), based on IRC 2021; check for a newer edition", he: "FBC-R מהדורה 8 (2023), מבוסס IRC 2021; בדקו אם יצאה מהדורה חדשה" },
    units: "imperial",
  },
  {
    id: "us-ny", parent: "us-irc-2021", country: "US", region: "NY",
    name: { en: "New York State — Residential Code of NYS", he: "מדינת ניו יורק — Residential Code of NYS" },
    edition: { en: "RCNYS (IRC-based; edition in force varies). New York City uses its own code, not modelled here.", he: "RCNYS (מבוסס IRC; המהדורה בתוקף משתנה). העיר ניו יורק משתמשת בקוד משלה שאינו ממודל כאן." },
    units: "imperial",
  },
  {
    id: "us-tx", parent: "us-irc-2021", country: "US", region: "TX",
    name: { en: "Texas — local adoption of the IRC", he: "טקסס — אימוץ מקומי של IRC" },
    edition: { en: "No uniform statewide residential code; each city sets its IRC edition and amendments", he: "אין קוד מגורים אחיד ברמת המדינה; כל עירייה קובעת מהדורת IRC ותיקונים" },
    units: "imperial",
  },
  {
    id: "us-mi", parent: "us-irc-2021", country: "US", region: "MI",
    name: { en: "Michigan — Michigan Residential Code", he: "מישיגן — Michigan Residential Code" },
    edition: { en: "Michigan Residential Code (IRC with state amendments)", he: "Michigan Residential Code (IRC עם תיקוני מדינה)" },
    units: "imperial",
    sources: ["https://www.law.cornell.edu/regulations/michigan/Mich-Admin-Code-R-408-30519"],
    rules: {
      stairMaxRiser: rule(8.25 * IN, "Mich. Admin. Code R 408.30519"),
      stairMinTread: rule(9 * IN, "Mich. Admin. Code R 408.30519"),
    },
  },
  {
    id: "us-pa", parent: "us-irc-2021", country: "US", region: "PA",
    name: { en: "Pennsylvania — Uniform Construction Code", he: "פנסילבניה — Uniform Construction Code" },
    edition: { en: "PA UCC (IRC with 34 Pa. Code §403.21 amendments)", he: "PA UCC (IRC עם תיקוני 34 Pa. Code §403.21)" },
    units: "imperial",
    sources: ["https://paconstructioncodesacademy.org/2018-irc-update-publication-pa"],
    rules: {
      stairMaxRiser: rule(8.25 * IN, "34 Pa. Code §403.21 — within dwelling units"),
      stairMinTread: rule(9 * IN, "34 Pa. Code §403.21 — within dwelling units"),
    },
  },
  {
    id: "us-ct", parent: "us-irc-2021", country: "US", region: "CT",
    name: { en: "Connecticut — State Building Code (IRC portion)", he: "קונטיקט — State Building Code (חלק IRC)" },
    edition: { en: "CT State Building Code, IRC with CT supplement", he: "CT State Building Code, IRC עם תוספת CT" },
    units: "imperial",
    rules: {
      stairMaxRiser: rule(8.25 * IN, "CT supplement to IRC R311.7.5", { conflicting: true }),
      stairMinTread: rule(9 * IN, "CT supplement to IRC R311.7.5", { conflicting: true }),
    },
  },

  // ── United Kingdom (England). The Building Regulations set no room sizes or
  // ceiling heights; those are the space standard's, which binds only where
  // the local plan adopts it — hence a separate profile on top.
  {
    id: "uk-eng", country: "GB", region: "ENG",
    name: { en: "England — Building Regulations (Approved Documents)", he: "אנגליה — תקנות הבנייה (Approved Documents)" },
    edition: { en: "Building Regulations 2010: Approved Document B vol. 1 (2019 incl. 2022 amendments), Approved Document K (2013 incl. 2015 amendments)", he: "Building Regulations 2010: מסמך B כרך 1 (2019 כולל תיקוני 2022), מסמך K (2013 כולל תיקוני 2015)" },
    units: "metric-mm",
    sources: UK_SOURCES,
    note: { en: "No room-size or ceiling minimums in the Building Regulations: use the NDSS profile where the local plan adopts the space standard. Scotland, Wales and Northern Ireland have their own regulations, not modelled here.", he: "בתקנות הבנייה אין מינימום לגודל חדר או לגובה תקרה: השתמשו בפרופיל NDSS היכן שהתוכנית המקומית אימצה את תקן השטחים. לסקוטלנד, ויילס וצפון אירלנד תקנות משלהן שאינן ממודלות כאן." },
    rules: {
      escapeMinArea: rule(0.33, "ADB vol. 1 §2.10 — escape window", { rooms: "habitable", conditional: true, condition: UK_ESCAPE }),
      escapeMinWidth: rule(45, "ADB vol. 1 §2.10 — escape window", { conditional: true, condition: UK_ESCAPE }),
      escapeMinHeight: rule(45, "ADB vol. 1 §2.10 — escape window", { conditional: true, condition: UK_ESCAPE }),
      escapeMaxSill: rule(110, "ADB vol. 1 §2.10 — escape window", { conditional: true, condition: UK_ESCAPE }),
      stairMaxRiser: rule(22, "ADK §1.2, Table 1.1 — private stair"),
      stairMinTread: rule(22, "ADK §1.2, Table 1.1 — private stair"),
      stairMaxPitch: rule(42, "ADK §1.2 — private stair"),
      stairStrideMin: rule(55, "ADK §1.2 — 2R + G"),
      stairStrideMax: rule(70, "ADK §1.2 — 2R + G"),
      guardMinHeight: rule(90, "ADK Table 3.1 — stairs and landings in a dwelling (1100 mm at external balconies)"),
    },
  },
  {
    id: "uk-eng-ndss", parent: "uk-eng", country: "GB", region: "ENG",
    name: { en: "England — Building Regulations + space standard (NDSS)", he: "אנגליה — תקנות הבנייה + תקן השטחים (NDSS)" },
    edition: { en: "Technical housing standards — nationally described space standard (March 2015), where the local plan adopts it", he: "Technical housing standards — nationally described space standard (מרץ 2015), היכן שהתוכנית המקומית אימצה אותו" },
    units: "metric-mm",
    note: { en: "Dwelling area uses the one-storey figures and sums the room areas, which leaves out internal walls: a shortfall is flagged for checking, not failed. The ceiling rule is 2.3 m over 75% of the floor area; this check applies it to every habitable room.", he: "שטח הדירה נבדק לפי ערכי דירה בקומה אחת ומסכם את שטחי החדרים, ללא הקירות הפנימיים: חוסר מסומן לבדיקה ולא כליקוי. כלל התקרה הוא 2.3 מ׳ ב-75% מהשטח; בדיקה זו מחילה אותו על כל חדר מגורים." },
    rules: {
      singleBedroomMinArea: rule(7.5, "NDSS §10(c) — single bedroom"),
      singleBedroomMinWidth: rule(215, "NDSS §10(c) — single bedroom"),
      doubleBedroomMinArea: rule(11.5, "NDSS §10(d) — double bedroom"),
      mainBedroomMinWidth: rule(275, "NDSS §10(e) — main double bedroom"),
      doubleBedroomMinWidth: rule(255, "NDSS §10(e) — other double bedrooms"),
      ceilingHabitable: rule(230, "NDSS §10(i) — 2.3 m over 75% of GIA"),
      dwellingMinArea: rule(NDSS_ONE_STOREY, "NDSS Table 1 — one-storey dwelling"),
    },
  },
  {
    id: "uk-london", parent: "uk-eng-ndss", country: "GB", region: "LDN",
    name: { en: "London — London Plan 2021 (NDSS + Policy D6)", he: "לונדון — London Plan 2021 (NDSS + מדיניות D6)" },
    edition: { en: "The London Plan 2021, Policy D6 Housing quality and standards", he: "The London Plan 2021, מדיניות D6 איכות ותקני דיור" },
    units: "metric-mm",
    rules: {
      ceilingHabitable: rule(250, "London Plan 2021, Policy D6 — 2.5 m over 75% of GIA"),
    },
  },

  // ── Germany. Building law is the states' (Landesbauordnungen); the model
  // code (MBO) is what they copy, so it is the base and each state overrides
  // its own heights, daylight fractions and rescue-window sizes.
  {
    id: "de-mbo", country: "DE",
    name: { en: "Germany — Model Building Code (MBO)", he: "גרמניה — קוד הבנייה לדוגמה (MBO)" },
    edition: { en: "Musterbauordnung 2002 as amended; DIN 18065 stairs. The binding law is each state's Landesbauordnung.", he: "Musterbauordnung 2002 בנוסחה המתוקן; DIN 18065 למדרגות. החוק המחייב הוא חוק הבנייה של כל מדינה (Landesbauordnung)." },
    units: "metric",
    sources: DE_SOURCES,
    note: { en: "A model, not law: use the state profile when there is one. Stair limits are DIN 18065's for residential buildings with up to two dwellings; larger buildings need risers ≤ 19 cm and treads ≥ 26 cm. Germany sets no minimum room area.", he: "קוד לדוגמה ולא חוק: העדיפו את פרופיל המדינה אם קיים. מגבלות המדרגות הן של DIN 18065 לבנייני מגורים עד שתי דירות; בבניינים גדולים יותר נדרש רום ≤ 19 ס״מ ושלח ≥ 26 ס״מ. בגרמניה אין שטח חדר מינימלי." },
    rules: {
      ceilingHabitable: rule(240, "§ 47 Abs. 1 MBO", { conditional: true, condition: DE_CEILING_GK12 }),
      glazingRatio: rule(1 / 8, "§ 47 Abs. 2 MBO — rough opening ≥ 1/8 of the net floor area"),
      escapeMinArea: rule(0.9 * 1.2, "§ 37 Abs. 5 MBO — rescue window", { rooms: "habitable", conditional: true, condition: DE_RESCUE }),
      escapeMinWidth: rule(90, "§ 37 Abs. 5 MBO — rescue window", { conditional: true, condition: DE_RESCUE }),
      escapeMinHeight: rule(120, "§ 37 Abs. 5 MBO — rescue window", { conditional: true, condition: DE_RESCUE }),
      escapeMaxSill: rule(120, "§ 37 Abs. 5 MBO — rescue window", { conditional: true, condition: DE_RESCUE }),
      stairMaxRiser: rule(20, "DIN 18065 Table 1 — residential, ≤ 2 dwellings"),
      stairMinTread: rule(23, "DIN 18065 Table 1 — residential, ≤ 2 dwellings"),
      guardMinHeight: rule(90, "§ 38 Abs. 4 MBO (1.10 m above a 12 m drop)"),
    },
  },
  {
    id: "de-by", parent: "de-mbo", country: "DE", region: "BY",
    name: { en: "Bavaria — BayBO", he: "בוואריה — BayBO" },
    edition: { en: "Bayerische Bauordnung (BayBO)", he: "Bayerische Bauordnung (BayBO)" },
    units: "metric", clauseSuffix: DE_STATE_SUFFIX,
    rules: {
      ceilingHabitable: rule(240, "Art. 45 Abs. 1 BayBO", { conditional: true, condition: DE_CEILING_GK12 }),
      glazingRatio: rule(1 / 8, "Art. 45 Abs. 2 BayBO"),
      escapeMinArea: rule(0.6 * 1.0, "Art. 35 Abs. 4 BayBO — rescue window", { rooms: "habitable", conditional: true, condition: DE_RESCUE }),
      escapeMinWidth: rule(60, "Art. 35 Abs. 4 BayBO — rescue window", { conditional: true, condition: DE_RESCUE }),
      escapeMinHeight: rule(100, "Art. 35 Abs. 4 BayBO — rescue window", { conditional: true, condition: DE_RESCUE }),
      escapeMaxSill: rule(120, "Art. 35 Abs. 4 BayBO — rescue window", { conditional: true, condition: DE_RESCUE }),
    },
  },
  {
    id: "de-nw", parent: "de-mbo", country: "DE", region: "NW",
    name: { en: "North Rhine-Westphalia — BauO NRW 2018", he: "נורדריין-וסטפאליה — BauO NRW 2018" },
    edition: { en: "Bauordnung für das Land Nordrhein-Westfalen 2018", he: "Bauordnung für das Land Nordrhein-Westfalen 2018" },
    units: "metric", clauseSuffix: DE_STATE_SUFFIX,
    rules: {
      ceilingHabitable: rule(240, "§ 46 Abs. 1 BauO NRW", { conditional: true, condition: { en: "2.30 m may be permitted in residential buildings of classes 1 and 2; attics and basements 2.20 m over half the area", he: "בבנייני מגורים בדרגות 1 ו-2 ניתן להתיר 2.30 מ׳; בעליות גג ובמרתפים 2.20 מ׳ במחצית השטח" } }),
      glazingRatio: rule(1 / 8, "§ 46 Abs. 2 BauO NRW"),
    },
  },
  {
    id: "de-bw", parent: "de-mbo", country: "DE", region: "BW",
    name: { en: "Baden-Württemberg — LBO", he: "באדן-וירטמברג — LBO" },
    edition: { en: "Landesbauordnung für Baden-Württemberg (LBO)", he: "Landesbauordnung für Baden-Württemberg (LBO)" },
    units: "metric", clauseSuffix: DE_STATE_SUFFIX,
    rules: {
      ceilingHabitable: rule(230, "§ 34 Abs. 1 Nr. 2 LBO (attics: 2.20 m over half the area)"),
      glazingRatio: rule(1 / 10, "§ 34 Abs. 2 LBO — rough opening ≥ 1/10 of the floor area"),
    },
  },
  {
    id: "de-be", parent: "de-mbo", country: "DE", region: "BE",
    name: { en: "Berlin — BauO Bln", he: "ברלין — BauO Bln" },
    edition: { en: "Bauordnung für Berlin (BauO Bln)", he: "Bauordnung für Berlin (BauO Bln)" },
    units: "metric", clauseSuffix: DE_STATE_SUFFIX,
    rules: {
      ceilingHabitable: rule(240, "§ 47 Abs. 1 BauO Bln (attics: 2.30 m over half the area)"),
      glazingRatio: rule(1 / 8, "§ 47 Abs. 2 BauO Bln"),
    },
  },
];

const BY_ID = new Map(PROFILES.map((p) => [p.id, p]));

/* The profile with its ancestors' rules merged in (nearest wins), or null.
   A child's clauseSuffix is applied to the rules it inherits, not to its own. */
export function codeProfile(id) {
  const own = BY_ID.get(id);
  if (!own) return null;
  const chain = [];
  for (let p = own, guard = 0; p && guard < 8; p = BY_ID.get(p.parent), guard++) chain.unshift(p);
  const rules = {};
  chain.forEach((p) => {
    Object.entries(rules).forEach(([key, r]) => {
      if (!p.clauseSuffix) return;
      const clause = typeof r.clause === "string" ? r.clause + p.clauseSuffix
        : Object.fromEntries(Object.entries(r.clause).map(([lang, text]) => [lang, text + p.clauseSuffix]));
      rules[key] = Object.freeze({ ...r, clause });
    });
    Object.assign(rules, p.rules || {});
  });
  const sources = [...new Set(chain.flatMap((p) => p.sources || []))];
  return Object.freeze({
    id: own.id, country: own.country, region: own.region || null, parent: own.parent || null,
    name: own.name, edition: own.edition, note: own.note || null,
    units: own.units, sources, rules: Object.freeze(rules),
  });
}

export function codeProfileIds() {
  return PROFILES.map((p) => p.id);
}

/* The profile a new project starts with: Israel for a Hebrew UI, the current
   model IRC otherwise. The user picks the real jurisdiction in the check. */
export function defaultCodeProfileId(lang) {
  return lang === "he" ? "il" : "us-irc-2024";
}

export function localized(text, lang) {
  if (text == null || typeof text === "string") return text || "";
  return text[lang] || text.en || "";
}

/* Print a rule value in the profile's own unit system: metric profiles in
   m / cm / m², "metric-mm" ones (UK practice) in m / mm / m², imperial ones
   in ft-in / in / sq ft. `kind` is "length", "area", "ratio" or "angle".
   Hebrew metric units use gershayim and geresh. */
export function formatCodeValue(kind, value, units, lang) {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  const v = Number(value);
  if (kind === "ratio") return Math.round(v * 1000) / 10 + "%";
  if (kind === "angle") return Math.round(v * 10) / 10 + "°";
  if (units === "imperial") {
    if (kind === "area") return (Math.round(v / SQFT * 10) / 10) + " sq ft";
    const inches = v / IN;
    if (inches >= 48) {
      const ft = Math.floor((inches + 0.05) / 12), rest = Math.round((inches - ft * 12) * 4) / 4;
      return rest ? `${ft}'-${rest}"` : `${ft}'-0"`;
    }
    return (Math.round(inches * 4) / 4) + '"';
  }
  const he = lang === "he";
  if (kind === "area") return (Math.round(v * 100) / 100) + (he ? " מ״ר" : " m²");
  if (units === "metric-mm" && v < 100) return Math.round(v * 10) + (he ? " מ״מ" : " mm");
  return v >= 100 ? (Math.round(v) / 100).toFixed(2) + (he ? " מ׳" : " m") : (Math.round(v * 10) / 10) + (he ? " ס״מ" : " cm");
}
