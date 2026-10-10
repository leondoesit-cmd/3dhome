import { validateDrawingPrimitive } from "./drawing_primitives.js";
import {drawingImageItem} from './drawing_image.js';
import {sheetPaper,SHEET_SIZES,UNIT_FACTORS} from '../cad_sheet.js';
import {hasDocumentPresetDefaults} from './document_presets.js';

// A reusable format/template is authored paper even before its first note.
// Require the native schema; an ordinary empty editor has no provenance.
function hasNativePresetSheet(definition) {
  const d=definition?.drawing;
  if(!d || d.version!==1 || !Object.hasOwn(SHEET_SIZES,d.size) || !['landscape','portrait'].includes(d.orientation)
    || !Object.hasOwn(UNIT_FACTORS,d.units) || !['ANSI','ISO','custom'].includes(d.draftingStandard)
    || !['first','third'].includes(d.projection) || !d.title || typeof d.title!=='object'
    || !['views','dims','notes','primitives','images'].every(k=>Array.isArray(d[k])))return false;
  const provenance=p=>p && p.version===1 && typeof p.id==='string' && p.id.trim()
    && typeof p.name==='string' && p.name.trim();
  if(!d.sheetFormat || !provenance(d.sheetFormat) || d.templateSource && !provenance(d.templateSource))return false;
  if(d.scale!=='fit' && !(Array.isArray(d.scale) && d.scale.length===2
    && d.scale.every(n=>Number.isFinite(n)&&n>0)))return false;
  for(const k of ['precision','secondaryPrecision'])if(d[k]!==undefined
    && (!Number.isInteger(d[k])||d[k]<0||d[k]>8))return false;
  if(d.secondaryUnits && !Object.hasOwn(UNIT_FACTORS,d.secondaryUnits))return false;
  return true;
}

const savedImages=definition=>(Array.isArray(definition?.drawing?.images)?definition.drawing.images:[]).filter(image=>{
  try {drawingImageItem(image,sheetPaper(definition.drawing));return true;}catch{return false;}
});

export function drawingOnlyContentSummary(definition) {
  if (!definition || (definition.parts || []).length || (definition.features || []).length) return null;
  const sketches=Array.isArray(definition.sketches) ? definition.sketches : [];
  // Canonical normalization records the editor's empty working sketch in
  // history too. Classify visible content; never delete or rewrite that history.
  if(sketches.some(sketch => sketch && ['points','entities','constraints'].some(key => (sketch[key] || []).length))) return null;
  const notes=(Array.isArray(definition.drawing?.notes) ? definition.drawing.notes : []).filter(note => String(note?.text || '').trim()).length;
  const annotations=(Array.isArray(definition.drawing?.primitives) ? definition.drawing.primitives : []).filter(primitive => {
    try { validateDrawingPrimitive(primitive); return true; } catch { return false; }
  }).length+savedImages(definition).length;
  return notes || annotations || hasNativePresetSheet(definition) ? {annotations,notes} : null;
}
// A new editor document gets an implicit, empty working sketch. That is not
// authored work. A recorded sketch history row is, even before its first line
// is drawn, and sketch geometry imported from an older document is work too.
export function hasSaveableModelContent(definition) {
  if (!definition || typeof definition !== "object") return false;
  if(hasDocumentPresetDefaults(definition))return true;
  if (Array.isArray(definition.parts) && definition.parts.length) return true;
  if(hasNativePresetSheet(definition))return true;
  if(savedImages(definition).length)return true;
  if (Array.isArray(definition.drawing?.notes) && definition.drawing.notes.some(note => String(note?.text || '').trim())) return true;
  if (Array.isArray(definition.drawing?.primitives) && definition.drawing.primitives.some(primitive => {
    try { validateDrawingPrimitive(primitive); return true; } catch { return false; }
  })) return true;
  const sketches = Array.isArray(definition.sketches) ? definition.sketches : [];
  if (sketches.some((sketch) => Array.isArray(sketch?.entities) && sketch.entities.length)) return true;
  const sketchIds = new Set(sketches.map((sketch) => sketch?.id).filter(Boolean));
  return Array.isArray(definition.history) && definition.history.some((entry) =>
    entry?.kind === "sketch" && sketchIds.has(entry.targetId));
}
