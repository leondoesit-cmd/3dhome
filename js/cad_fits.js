// ISO 286-2 published limit deviations, in micrometres. No interpolation.
import {ISO286} from './iso286_data.js';
function freeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
export const FIT_TABLE_DATA=freeze(ISO286);
export const FIT_CLASSES = Object.freeze({
  clearance: ["H11/c11", "H9/d9", "H8/f7", "H8/e8", "H7/g6", "H7/h6"],
  transition: ["H7/k6", "H7/n6", "H7/js6"],
  interference: ["H7/p6", "H7/s6", "H7/u6"],
});

export function parseFitCode(code) {
  const text = String(code || "").trim();
  const match = text.match(/^([A-Z]+)(\d+)\s*\/\s*([a-z]+)(\d+)$/);
  if (!match) throw new Error("Fit must look like H7/g6, got " + text);
  if(![match[2],match[4]].every(g=>/^[1-9]\d?$/.test(g)&&Number(g)<=18))throw new Error("Unsupported tolerance grade in "+text);
  return { holeLetter: match[1], holeGrade: Number(match[2]), shaftLetter: match[3], shaftGrade: Number(match[4]), code: match[1] + match[2] + "/" + match[3] + match[4] };
}

function tolerance(diameterMm,letter,grade){
  const d=Number(diameterMm),key=letter+String(grade);
  if(!Number.isFinite(d)||d<=0)throw new Error("Fit diameter must be positive and finite");
  if(d>3150)throw new Error("Diameter is outside the tabulated ISO 286 range (≤3150 mm)");
  const row=FIT_TABLE_DATA.limits[key]?.find(r=>d>r[0]&&d<=r[1]);
  if(!row)throw new Error("Unsupported tolerance "+key+" at Ø"+d+" mm: not tabulated or restricted by ISO 286");
  return row;
}
export function holeTolerance(diameterMm,letter,grade){
  const [, ,EI,ES]=tolerance(diameterMm,String(letter).toUpperCase(),grade);return {EI,ES,IT:ES-EI};
}
export function shaftTolerance(diameterMm,letter,grade){
  const [, ,ei,es]=tolerance(diameterMm,String(letter).toLowerCase(),grade);return {ei,es,IT:es-ei};
}
// Reports the precise source band and any correction for a review or drawing.
export function fitLimitSource(diameterMm,letter,grade){
  const row=tolerance(diameterMm,letter,grade),key=letter+String(grade);
  return {edition:FIT_TABLE_DATA.edition,class:key,minExclusiveMm:row[0],maxInclusiveMm:row[1],printedPage:row[4],
    correction:FIT_TABLE_DATA.corrections.find(c=>c.class===key&&diameterMm>c.min&&diameterMm<=c.max)||null};
}
export function evaluateFit(diameterMm, code) {
  const parsed = typeof code === "string" ? parseFitCode(code) : code;
  const hole = holeTolerance(diameterMm, parsed.holeLetter, parsed.holeGrade);
  const shaft = shaftTolerance(diameterMm, parsed.shaftLetter, parsed.shaftGrade);
  const maxClearance = (hole.ES - shaft.ei) / 1000;
  const minClearance = (hole.EI - shaft.es) / 1000;
  // H/h locational clearance has min clearance of exactly 0 and is still a
  // clearance fit. Transition is the mixed case (min negative, max positive).
  const kind = minClearance >= 0 ? "clearance" : maxClearance <= 0 ? "interference" : "transition";
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
