import {ensureSheetDoc} from '../cad_sheet.js';

// Legacy export settings seed the first owned sheet only. Once authored,
// its native Drawing is authoritative and must not be reset on mode changes.
export function ensureAssemblyDrawingDoc(assembly) {
  const settings=assembly?.drawingSettings || {};
  const title={title:assembly?.name || ''};
  for(const key of ['title','number','revision','author','company','material','finish','mass','date','tolerance'])
    if(typeof settings[key]==='string')title[key]=settings[key];
  const options={views:['front','top','right','iso'],title};
  for(const key of ['size','orientation','projection','units','draftingStandard','secondaryUnits','secondaryPrecision','precision','trailingZeros','showHidden','showCenters','showZones'])
    if(settings[key]!==undefined)options[key]=settings[key];
  const scale=settings.scale;
  if(Array.isArray(scale)&&scale.length===2&&scale.every(v=>Number.isFinite(v)&&v>0))options.scale=scale.join(':');
  else if(typeof scale==='string'&&(scale==='fit'||/^\d+(?:\.\d+)?:\d+(?:\.\d+)?$/.test(scale)))options.scale=scale;
  return ensureSheetDoc(assembly,options);
}
