// Reusable document defaults, never a snapshot of CAD or source identity.
export const DOCUMENT_PRESET_STORAGE_KEY='modelForge.documentPresets.v1';
const clone=value=>JSON.parse(JSON.stringify(value));
const keys=['lengthUnit','massUnit','angleUnit','draftingStandard','projection','lengthPrecision','anglePrecision','dualDimensions'];
export function documentDefaults(document={}) {
  const unit=document.context?.units?.length || 'cm';
  return validateDocumentDefaults({lengthUnit:unit,massUnit:document.context?.units?.mass || (unit==='in'?'lb':'g'),angleUnit:'deg',draftingStandard:unit==='in'?'ANSI':'ISO',projection:unit==='in'?'third':'first',lengthPrecision:document.context?.units?.precision ?? (unit==='in'?3:2),anglePrecision:document.context?.units?.anglePrecision ?? 0,dualDimensions:false,...document.documentProperties,lengthUnit:unit});
}
export function validateDocumentDefaults(value) {
  if(!value || Object.keys(value).some(k=>!keys.includes(k)) || keys.some(k=>value[k]===undefined)
    || !['mm','cm','m','in','ft'].includes(value.lengthUnit) || !['g','kg','lb'].includes(value.massUnit)
    || value.angleUnit!=='deg' || !['ANSI','ISO'].includes(value.draftingStandard) || !['first','third'].includes(value.projection)
    || typeof value.dualDimensions!=='boolean' || ['lengthPrecision','anglePrecision'].some(k=>!Number.isInteger(value[k])||value[k]<0||value[k]>8))throw new Error('Invalid document defaults');
  return clone(value);
}
export function applyDocumentDefaults(document,defaults) {
  const properties=validateDocumentDefaults(defaults),next=clone(document);
  next.documentProperties=properties;
  next.context={...next.context,units:{...next.context?.units,length:properties.lengthUnit,angle:properties.angleUnit,mass:properties.massUnit,precision:properties.lengthPrecision,anglePrecision:properties.anglePrecision}};
  return next;
}
export function captureDocumentPreset(document,{id,name,kind}={}) {
  const record={version:1,id,name:String(name||'').trim(),kind,defaults:documentDefaults(document)};
  validateDocumentPreset(record);return clone(record);
}
export function validateDocumentPreset(record) {
  if(!record || record.version!==1 || typeof record.id!=='string' || !record.id.trim() || typeof record.name!=='string' || !record.name.trim() || record.name.length>100
    || !['part-template','assembly-template'].includes(record.kind) || Object.keys(record).some(k=>!['version','id','name','kind','defaults'].includes(k)))throw new Error('Invalid document template');
  validateDocumentDefaults(record.defaults);return record;
}
export function documentFromPreset(blank,record,kind) {
  validateDocumentPreset(record);
  if(record.kind!==kind)throw new Error('Choose a matching document template');
  if(!blank?.key || ['parts','features','history','components','mates','topologyMates'].some(k=>(blank[k]||[]).length)
    || (blank.sketches||[]).some(s=>['entities','points','constraints'].some(k=>(s[k]||[]).length)))throw new Error('Document templates require a fresh blank document');
  const next=applyDocumentDefaults(blank,record.defaults);
  next.documentTemplate={version:1,id:record.id,name:record.name,kind:record.kind};return next;
}
export function hasDocumentPresetDefaults(document) {
  try {
    const p=document?.documentTemplate;
    if(!p||Object.keys(p).some(k=>!['version','id','name','kind'].includes(k)))return false;
    validateDocumentPreset({...p,defaults:document.documentProperties});return true;
  }catch{return false;}
}
export function loadDocumentPresets(storage) {
  const raw=storage.getItem(DOCUMENT_PRESET_STORAGE_KEY);if(!raw)return [];
  const data=JSON.parse(raw);if(data.version!==1||!Array.isArray(data.records)||data.records.length>24)throw new Error('Invalid document template library');
  data.records.forEach(validateDocumentPreset);if(new Set(data.records.map(r=>r.id)).size!==data.records.length)throw new Error('Duplicate document template identity');return clone(data.records);
}
export function saveDocumentPreset(storage,record) {
  validateDocumentPreset(record);const records=loadDocumentPresets(storage),at=records.findIndex(r=>r.kind===record.kind&&r.name===record.name);
  if(records.some((r,i)=>r.id===record.id&&i!==at))throw new Error('Duplicate document template identity');
  if(at<0)records.push(clone(record));else records[at]=clone(record);
  if(records.length>24)throw new Error('Document library supports at most 24 templates');
  storage.setItem(DOCUMENT_PRESET_STORAGE_KEY,JSON.stringify({version:1,records}));return clone(record);
}
