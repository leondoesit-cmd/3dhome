// ISO 286-1 hole/shaft fits. Tolerances are tabulated in micrometres against
// the standard diameter steps; a fit report returns millimetres and the
// resulting clearance (positive) or interference (negative).

const RANGES = Object.freeze([
  { max: 3, it: { 6: 6, 7: 10, 8: 14, 9: 25, 10: 40, 11: 60 } },
  { max: 6, it: { 6: 8, 7: 12, 8: 18, 9: 30, 10: 48, 11: 75 } },
  { max: 10, it: { 6: 9, 7: 15, 8: 22, 9: 36, 10: 58, 11: 90 } },
  { max: 18, it: { 6: 11, 7: 18, 8: 27, 9: 43, 10: 70, 11: 110 } },
  { max: 30, it: { 6: 13, 7: 21, 8: 33, 9: 52, 10: 84, 11: 130 } },
  { max: 50, it: { 6: 16, 7: 25, 8: 39, 9: 62, 10: 100, 11: 160 } },
  { max: 80, it: { 6: 19, 7: 30, 8: 46, 9: 74, 10: 120, 11: 190 } },
  { max: 120, it: { 6: 22, 7: 35, 8: 54, 9: 87, 10: 140, 11: 220 } },
]);

// Fundamental deviations in micrometres. Shaft letters are lowercase; hole
// letters are uppercase. Values are the deviation nearest the basic size
// (es for shaft a–h, ei for k–u; EI for hole A–H, ES for K–U).
const SHAFT_DEV = Object.freeze({
  a: [270, 270, 280, 290, 300, 310, 320, 340],
  c: [60, 70, 80, 95, 110, 120, 130, 150],
  d: [20, 30, 40, 50, 65, 80, 100, 120],
  e: [14, 20, 25, 32, 40, 50, 60, 72],
  f: [6, 10, 13, 16, 20, 25, 30, 36],
  g: [2, 4, 5, 6, 7, 9, 10, 12],
  h: [0, 0, 0, 0, 0, 0, 0, 0],
  js: [0, 0, 0, 0, 0, 0, 0, 0],
  k: [0, 1, 1, 1, 2, 2, 2, 3],
  m: [2, 4, 6, 7, 8, 9, 11, 13],
  n: [4, 8, 10, 12, 15, 17, 20, 23],
  p: [6, 12, 15, 18, 22, 26, 32, 37],
  s: [14, 19, 23, 28, 35, 43, 53, 66],
  u: [18, 23, 28, 33, 41, 53, 66, 87],
});

const HOLE_DEV = Object.freeze({
  A: SHAFT_DEV.a, C: SHAFT_DEV.c, D: SHAFT_DEV.d, E: SHAFT_DEV.e,
  F: SHAFT_DEV.f, G: SHAFT_DEV.g, H: SHAFT_DEV.h, JS: SHAFT_DEV.js,
  K: SHAFT_DEV.k, M: SHAFT_DEV.m, N: SHAFT_DEV.n, P: SHAFT_DEV.p,
  S: SHAFT_DEV.s, U: SHAFT_DEV.u,
});

export const FIT_CLASSES = Object.freeze({
  clearance: ["H11/c11", "H9/d9", "H8/f7", "H8/e8", "H7/g6", "H7/h6"],
  transition: ["H7/k6", "H7/n6", "H7/js6"],
  interference: ["H7/p6", "H7/s6", "H7/u6"],
});

function rangeIndex(diameterMm) {
  const d = Number(diameterMm);
  return RANGES.findIndex((row) => d <= row.max);
}

function rangeRow(diameterMm) {
  const d = Number(diameterMm);
  if (!(d > 0)) throw new Error("Fit diameter must be positive, got Ø" + diameterMm + " mm");
  const index = rangeIndex(d);
  if (index < 0) throw new Error("Ø" + d + " mm is outside the tabulated ISO 286 range (≤120 mm)");
  return { row: RANGES[index], index };
}

function itValue(diameterMm, grade) {
  const { row } = rangeRow(diameterMm);
  const value = row.it[Number(grade)];
  if (value == null) throw new Error("Unsupported IT grade " + grade + " for Ø" + diameterMm + " mm");
  return value;
}

function deviationValue(table, letter, diameterMm) {
  const key = String(letter);
  const series = table[key] || table[key.toLowerCase()] || table[key.toUpperCase()];
  if (!series) throw new Error("Unknown fundamental deviation " + letter);
  const { index } = rangeRow(diameterMm);
  return series[Math.min(index, series.length - 1)];
}

export function parseFitCode(code) {
  const text = String(code || "").trim();
  const match = text.match(/^([A-Z]+)(\d+)\s*\/\s*([a-z]+)(\d+)$/);
  if (!match) throw new Error("Fit must look like H7/g6, got " + text);
  return { holeLetter: match[1], holeGrade: Number(match[2]), shaftLetter: match[3], shaftGrade: Number(match[4]), code: match[1] + match[2] + "/" + match[3] + match[4] };
}

export function holeTolerance(diameterMm, letter, grade) {
  const it = itValue(diameterMm, grade);
  const L = String(letter).toUpperCase();
  if (L === "H") return { EI: 0, ES: it, IT: it };
  if (L === "JS") return { EI: -it / 2, ES: it / 2, IT: it };
  const dev = deviationValue(HOLE_DEV, L, diameterMm);
  if ("ABCDEFGH".includes(L)) return { EI: dev, ES: dev + it, IT: it };
  return { EI: -dev - it, ES: -dev, IT: it };
}

export function shaftTolerance(diameterMm, letter, grade) {
  const it = itValue(diameterMm, grade);
  const L = String(letter).toLowerCase();
  if (L === "h") return { es: 0, ei: -it, IT: it };
  if (L === "js") return { es: it / 2, ei: -it / 2, IT: it };
  const dev = deviationValue(SHAFT_DEV, L, diameterMm);
  if ("abcdefgh".includes(L)) return { es: -dev, ei: -dev - it, IT: it };
  // k–u store ei (the deviation nearest the basic size). The shaft sits
  // above that floor by one IT grade.
  return { ei: dev, es: dev + it, IT: it };
}

export function evaluateFit(diameterMm, code) {
  const parsed = typeof code === "string" ? parseFitCode(code) : code;
  const hole = holeTolerance(diameterMm, parsed.holeLetter, parsed.holeGrade);
  const shaft = shaftTolerance(diameterMm, parsed.shaftLetter, parsed.shaftGrade);
  const maxClearance = (hole.ES - shaft.ei) / 1000;
  const minClearance = (hole.EI - shaft.es) / 1000;
  // H/h locational clearance has min clearance of exactly 0 and is still a
  // clearance fit. Transition is the mixed case (min negative, max positive).
  const kind = minClearance >= 0 ? "clearance" : maxClearance < 0 ? "interference" : "transition";
  return {
    code: parsed.code || parsed.holeLetter + parsed.holeGrade + "/" + parsed.shaftLetter + parsed.shaftGrade,
    diameterMm: Number(diameterMm),
    hole,
    shaft,
    holeMaxMm: Number(diameterMm) + hole.ES / 1000,
    holeMinMm: Number(diameterMm) + hole.EI / 1000,
    shaftMaxMm: Number(diameterMm) + shaft.es / 1000,
    shaftMinMm: Number(diameterMm) + shaft.ei / 1000,
    maxClearanceMm: maxClearance,
    minClearanceMm: minClearance,
    maxInterferenceMm: -minClearance,
    minInterferenceMm: -maxClearance,
    kind,
  };
}

export function fitCallout(diameterMm, code) {
  const fit = evaluateFit(diameterMm, code);
  return "Ø" + fit.diameterMm + " " + fit.code;
}

export function classifyFit(diameterMm, code) {
  return evaluateFit(diameterMm, code).kind;
}
