/* Regional drafting standards for the construction sheet (js/drawing_sheet.js):
   how a floor plan is dimensioned, labelled, scaled and titled where the
   project is built. The geometry is the same everywhere; what changes is the
   unit and format of a dimension string, the opening annotation, the level
   mark, the room label, the paper series and the title block.

   Pure data plus formatters, importable in Node (no S, no DOM). The region
   follows the project's building-code jurisdiction (js/code_profiles.js ids),
   then the drafting convention the unit settings detected, then the UI
   language; an explicit override wins over all of them.

   NONE of this has been checked against the standards' own text: the values
   come from secondary sources (each profile's `sources`) and carry
   `verified: false`, exactly like the code profiles. */

const IN = 2.54;
const SUP = "⁰¹²³⁴⁵⁶⁷⁸⁹";
const RLI = "⁧", PDI = "⁩";

const ISO_SOURCES = [
  "https://www.iso.org/standard/66926.html", // ISO 128-1 general principles
  "https://www.iso.org/standard/64007.html", // ISO 129-1 dimensions
  "https://www.iso.org/standard/11518.html", // ISO 5455 scales
  "https://www.iso.org/standard/35446.html", // ISO 7200 title blocks
];
const SOURCES = {
  il: [
    "https://www.isra-arch.org.il/wp-content/uploads/2021/04/%D7%9E%D7%93%D7%A8%D7%99%D7%9A-%D7%90%D7%93%D7%A8%D7%99%D7%9B%D7%9C-%D7%94%D7%A2%D7%99%D7%A8-%D7%9C%D7%A2%D7%A8%D7%99%D7%9B%D7%AA-%D7%91%D7%A7%D7%A9%D7%95%D7%AA-%D7%9C%D7%94%D7%99%D7%AA%D7%A8%D7%99-%D7%91%D7%A0%D7%99%D7%94-%D7%9E%D7%94%D7%93%D7%95%D7%A8%D7%94-3-%D7%92%D7%A8%D7%A1%D7%AA-%D7%94%D7%A4%D7%A6%D7%94-%D7%96%D7%9E%D7%A0%D7%99%D7%AA.pdf",
    "https://meyda.education.gov.il/files/MadaTech/adrichalot/ins2021-14.pdf",
    "https://www.midrag.co.il/Content/Tip/9804",
  ],
  us: [
    "https://archtoolbox.com/construction-document-sheet-numbers",
    "https://vdci.edu/learn/blueprint-reading/architectural-abbreviations-symbols-and-sheet-identification-in-construction-documents",
    "https://learnarchitecture.net/articles/40545-door-window-schedule.html",
    "https://www.wbdg.org/FFC/VA/VACAD/VHACADAppGuide.pdf",
  ],
  uk: [
    "https://www.designingbuildings.co.uk/wiki/Annotation",
    "https://forums.cgarchitect.com/topic/71754-what-is-the-standard-for-dimensioning-architectural-metric-drawing-m-or-mm",
    "https://tte-lisa.ac.uk/wp-content/uploads/vle_content/Phase2/mechanical/CME32/Resource/Engineering%20Drawing%20Specifications.pdf",
  ],
  de: [
    "https://www.bauprofessor.de/bemassung-bauzeichnungen/",
    "https://bau.de/forum/fenster-tueren/12264.php",
    "https://www.din.de/de/mitwirken/normenausschuesse/nabau/veroeffentlichungen/wdc-beuth:din21:325728444/toc-3177416/download",
  ],
};

const A_SERIES = Object.freeze(["A4", "A3", "A2", "A1", "A0"]);
const ARCH = Object.freeze(["ArchC", "ArchD", "ArchE"]);

const freeze = (o) => Object.freeze(o);
const PROFILES = [
  {
    id: "il", country: "IL",
    name: { en: "Israel (working drawing)", he: "ישראל (תוכנית עבודה)" },
    units: "cm", decimal: ".", scales: [50, 100], papers: A_SERIES, imperial: false,
    titleBlock: "bottom", rtlTitle: true, sheetNumber: "1",
    openings: "wh-sill", level: "il", levelPlace: "room", room: "area",
    terminator: "tick",
    words: { sill: { en: "sill", he: "אדן" }, area: { en: "m²", he: "מ״ר" } },
  },
  {
    id: "us", country: "US",
    name: { en: "United States (NCS)", he: "ארה״ב (NCS)" },
    units: "ft-in", decimal: ".", scales: [48, 96], papers: ARCH, imperial: true,
    titleBlock: "right", rtlTitle: false, sheetNumber: "A-101",
    openings: "tags", level: "us", levelPlace: "sheet", room: "number",
    terminator: "tick",
    words: {},
  },
  {
    id: "uk", country: "GB",
    name: { en: "United Kingdom (BS)", he: "בריטניה (BS)" },
    units: "mm", decimal: ".", scales: [50, 100], papers: A_SERIES, imperial: false,
    titleBlock: "bottom", rtlTitle: false, sheetNumber: "A-101",
    openings: "wxh", level: "uk", levelPlace: "room", room: "area",
    terminator: "tick",
    words: { area: { en: "m²" } },
  },
  {
    id: "de", country: "DE",
    name: { en: "Germany (DIN)", he: "גרמניה (DIN)" },
    units: "m-cm", decimal: ",", scales: [50, 100], papers: A_SERIES, imperial: false,
    titleBlock: "bottom", rtlTitle: false, sheetNumber: "1",
    openings: "w-over-h", level: "de", levelPlace: "room", room: "area",
    terminator: "tick",
    words: { sill: { en: "BRH" }, area: { en: "m²" }, level: { en: "OKFF" } },
  },
  {
    id: "iso", country: null,
    name: { en: "International (ISO)", he: "בינלאומי (ISO)" },
    units: "cm", decimal: ".", scales: [50, 100], papers: A_SERIES, imperial: false,
    titleBlock: "bottom", rtlTitle: false, sheetNumber: "A-01",
    openings: "wxh", level: "iso", levelPlace: "room", room: "area",
    terminator: "tick",
    words: { area: { en: "m²" } },
  },
];

function deepFreeze(p) {
  const words = Object.fromEntries(Object.entries(p.words).map(([k, v]) => [k, freeze({ ...v })]));
  return freeze({
    ...p, name: freeze({ ...p.name }), scales: freeze(p.scales.slice()), words: freeze(words),
    sources: freeze((SOURCES[p.id] || []).concat(ISO_SOURCES)), verified: false,
  });
}
const BY_ID = new Map(PROFILES.map((p) => [p.id, deepFreeze(p)]));

export function draftingStandardIds() {
  return PROFILES.map((p) => p.id);
}

/* The frozen profile, or null. `unitOverride` ("mm" | "cm") gives the generic
   ISO profile the unit the project drafts in; the others ignore it. */
export function draftingStandard(id, unitOverride) {
  const p = BY_ID.get(id);
  if (!p) return null;
  if (id === "iso" && (unitOverride === "mm" || unitOverride === "cm") && unitOverride !== p.units)
    return freeze({ ...p, units: unitOverride });
  return p;
}

/* Which standard a project draws to. `codeProfileId` is
   S.workspace.codeProfile ("il", "us-irc-2024", "uk-eng", "de-by", ...),
   `convention` the detected drafting unit ("cm" | "mm"), `lang` the UI
   language, `override` S.workspace.draftingStandard (absent = automatic). */
export function resolveDraftingStandard(args) {
  const a = args || {};
  const conv = a.convention === "mm" ? "mm" : a.convention === "cm" ? "cm" : null;
  if (a.override && BY_ID.has(a.override)) return draftingStandard(a.override, conv);
  const code = String(a.codeProfileId || "");
  let id = null;
  if (code === "il" || code.startsWith("il-")) id = "il";
  else if (code.startsWith("us-") || code === "us") id = "us";
  else if (code.startsWith("uk-") || code === "uk" || code.startsWith("gb-")) id = "uk";
  else if (code.startsWith("de-") || code === "de") id = "de";
  else if (!code && a.lang === "he") id = "il";
  return draftingStandard(id || "iso", conv);
}

export function localizedWord(std, key, lang) {
  const w = std && std.words && std.words[key];
  if (!w) return "";
  return w[lang] || w.en || "";
}

const decimal = (std, s) => (std.decimal === "," ? s.replace(".", ",") : s);
const sup = (digits) => String(digits).split("").map((d) => SUP[+d]).join("");

/* Feet and inches to the nearest half inch: 12'-6", 3'-0 1/2", under a foot 9". */
function feetInches(cm) {
  const halves = Math.round(Math.abs(cm) / IN * 2);
  const sign = cm < 0 ? "-" : "";
  const ft = Math.floor(halves / 24), rest = halves - ft * 24;
  const whole = Math.floor(rest / 2), half = rest % 2 ? " 1/2" : "";
  if (!ft) return sign + whole + half + '"';
  return sign + ft + "'-" + whole + half + '"';
}

/* A dimension string as the standard writes it, from model centimetres:
   il 252 (cm), uk 2515 (mm, no unit), us 12'-6", de 2,51⁵ (metres with the
   millimetre raised; under a metre in cm: 36⁵), iso in its unit. */
export function formatDimension(std, cm) {
  const v = Number(cm) || 0;
  if (std.units === "ft-in") return feetInches(v);
  if (std.units === "mm") return String(Math.round(v * 10));
  if (std.units === "m-cm") {
    const mm = Math.round(Math.abs(v) * 10), sign = v < 0 ? "-" : "";
    const cmInt = Math.floor(mm / 10), mmDigit = mm % 10;
    const raised = mmDigit ? sup(mmDigit) : "";
    if (cmInt < 100) return sign + cmInt + raised;
    const m = Math.floor(cmInt / 100), rest = String(cmInt % 100).padStart(2, "0");
    return sign + m + std.decimal + rest + raised;
  }
  return String(Math.round(v));
}

export function dimensionFormatter(std) {
  return (cm) => formatDimension(std, cm);
}

/* The floor level mark, from the storey's elevation in cm. */
export function formatLevel(std, cm, lang) {
  const v = Math.round(Number(cm) || 0);
  const sign = v === 0 ? "±" : v > 0 ? "+" : "-";
  const m = Math.abs(v) / 100;
  switch (std.level) {
    case "us": return "FIN. FLR. " + (v < 0 ? "-" : "") + feetInches(Math.abs(v)).replace(/^(\d+(?: 1\/2)?)"$/, "0'-$1\"");
    case "uk": return "FFL " + (v === 0 ? "" : sign) + m.toFixed(3);
    case "de": return sign + decimal(std, m.toFixed(2)) + " " + localizedWord(std, "level", lang);
    case "il": return sign + m.toFixed(2);
    default: return sign + m.toFixed(3);
  }
}

/* "12.50 m²" in the standard's decimal mark; Israeli sheets in Hebrew say
   מ״ר, isolated so the number stays on its left. US sheets: whole sq ft. */
export function formatArea(std, m2, lang) {
  if (std.units === "ft-in") return Math.round((Number(m2) || 0) / 0.09290304) + " sq ft";
  const word = localizedWord(std, "area", lang) || "m²";
  const text = decimal(std, (Math.round((Number(m2) || 0) * 100) / 100).toFixed(2)) + " " + word;
  return /[֐-׿]/.test(word) ? RLI + text + PDI : text;
}

/* The text written beside an opening (empty when the standard tags it
   instead). Width, height and sill are cm. */
export function formatOpeningLabel(std, op, lang) {
  const f = (cm) => formatDimension(std, cm);
  const w = Number(op.width) || 0, h = Number(op.height) || 0, sill = Number(op.sill) || 0;
  const isWindow = op.type === "window";
  switch (std.openings) {
    case "wh-sill": {
      const main = f(w) + "/" + f(h);
      if (!isWindow) return main;
      const word = localizedWord(std, "sill", lang);
      const sillText = word + " " + f(sill);
      return /[֐-׿]/.test(word) ? main + "  " + RLI + sillText + PDI : main + "  " + sillText;
    }
    case "w-over-h": return { over: f(w), under: f(h), sill: isWindow ? localizedWord(std, "sill", lang) + " " + f(sill) : "" };
    case "tags": return "";
    default: return f(w) + " × " + f(h);
  }
}

/* US practice: doors numbered, windows lettered, in plan order. */
export function openingTags(openings) {
  let d = 0, w = 0;
  return (openings || []).map((op) => {
    if (op.type === "window") {
      let n = w++, s = "";
      do { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; } while (n >= 0);
      return s;
    }
    return String(++d);
  });
}

/* Imperial scale captions for the US scales a sheet may use (1:48 is 1/4"). */
export const IMPERIAL_SCALE_LABELS = Object.freeze({
  24: '1/2" = 1\'-0"', 48: '1/4" = 1\'-0"', 64: '3/16" = 1\'-0"', 96: '1/8" = 1\'-0"', 192: '1/16" = 1\'-0"', 384: '1/32" = 1\'-0"',
});
