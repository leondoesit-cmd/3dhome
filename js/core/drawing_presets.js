import {createSheetDoc,sheetPaper,SHEET_SIZES} from '../cad_sheet.js';
import {drawingImageItem} from './drawing_image.js';
import {validateDrawingPrimitive} from './drawing_primitives.js';
import {validateSheetTitleSources} from './custom_properties.js';

export const DRAWING_PRESET_STORAGE_KEY='modelForge.drawingPresets.v1';
const clone=value=>JSON.parse(JSON.stringify(value));
const defaults=['size','orientation','units','draftingStandard','projection','scale','precision','trailingZeros','secondaryUnits','secondaryPrecision','showHidden','showCenters','showZones'];
const reusableTitle=['company','author','tolerance'];
const plainNote=n=>!n?.leader&&!n?.feature&&!n?.modelLink;

export function captureDrawingPreset(doc,{id,name,kind='sheet-format',includePaperArt=false}={}) {
  if(!id||!String(name||'').trim()||!['sheet-format','drawing-template'].includes(kind))throw new Error('Name and preset kind are required');
  const paper=sheetPaper(doc),format={size:doc.size,orientation:doc.orientation,showZones:doc.showZones!==false,title:{},images:clone(doc.images||[]),primitives:[],notes:[]};
  for(const key of reusableTitle)format.title[key]=String(doc.title?.[key]||'');
  if(doc.title?.sources)format.titleSources=clone(validateSheetTitleSources(doc.title.sources));
  for(const image of format.images)drawingImageItem(image,paper);
  if(includePaperArt) {
    format.primitives=clone(doc.primitives||[]);format.primitives.forEach(validateDrawingPrimitive);
    format.notes=clone((doc.notes||[]).filter(plainNote));
  }
  const record={version:1,id:String(id),name:String(name).trim(),kind,format};
  if(kind==='drawing-template'){record.defaults={};for(const key of defaults)if(doc[key]!==undefined)record.defaults[key]=clone(doc[key]);}
  validateDrawingPreset(record);return record;
}

export function validateDrawingPreset(record) {
  if(record?.version!==1||!record.id||!String(record.name||'').trim()||!['sheet-format','drawing-template'].includes(record.kind)||!record.format)throw new Error('Invalid drawing preset');
  const f=record.format,paper=sheetPaper(f);
  if(!SHEET_SIZES[f.size]||!['landscape','portrait'].includes(f.orientation)||!f.title||Object.keys(f.title).some(k=>!reusableTitle.includes(k)||typeof f.title[k]!=='string'))throw new Error('Invalid sheet format defaults');
  if(f.titleSources!==undefined)validateSheetTitleSources(f.titleSources);
  if(!Array.isArray(f.images)||f.images.length>32||!Array.isArray(f.primitives)||!Array.isArray(f.notes))throw new Error('Invalid preset paper content');
  f.images.forEach(i=>drawingImageItem(i,paper));f.primitives.forEach(validateDrawingPrimitive);
  if(f.notes.some(n=>!plainNote(n)||!Number.isFinite(n.x)||!Number.isFinite(n.y)))throw new Error('Sheet formats support only independent paper notes');
  if(record.kind==='drawing-template'&&(!record.defaults||record.defaults.size!==f.size||record.defaults.orientation!==f.orientation))throw new Error('Invalid drawing template defaults');
  return record;
}

export function applyDrawingFormat(doc,record) {
  validateDrawingPreset(record);const next=clone(doc),f=record.format;
  if(next.size!==f.size||next.orientation!==f.orientation)throw new Error('Sheet format requires matching paper size and orientation');
  const previous=next.sheetFormat?.id;
  for(const key of ['images','primitives','notes']) {
    const kept=(next[key]||[]).filter(item=>!previous||item.formatOwner!==previous);
    const copied=f[key].map((item,index)=>({...clone(item),id:'format_'+record.id+'_'+key+'_'+index,formatOwner:record.id}));
    next[key]=kept.concat(copied);
  }
  next.title={...next.title,...clone(f.title)};next.showZones=f.showZones;
  if(f.titleSources)next.title.sources=clone(f.titleSources);
  next.sheetFormat={id:record.id,name:record.name,version:1};return next;
}

export function drawingFromTemplate(record) {
  validateDrawingPreset(record);if(record.kind!=='drawing-template')throw new Error('Choose a drawing template');
  const doc=createSheetDoc({views:[]});for(const key of defaults)if(record.defaults[key]!==undefined)doc[key]=clone(record.defaults[key]);
  const next=applyDrawingFormat(doc,record);next.templateSource={id:record.id,name:record.name,version:1};return next;
}

export function loadDrawingPresets(storage) {
  const raw=storage.getItem(DRAWING_PRESET_STORAGE_KEY);if(!raw)return [];
  const data=JSON.parse(raw);if(data.version!==1||!Array.isArray(data.records)||data.records.length>12)throw new Error('Invalid local drawing preset library');
  data.records.forEach(validateDrawingPreset);return clone(data.records);
}

export function saveDrawingPreset(storage,record) {
  validateDrawingPreset(record);const records=loadDrawingPresets(storage),at=records.findIndex(r=>r.kind===record.kind&&r.name===record.name);
  if(at<0)records.push(clone(record));else records[at]=clone(record);
  if(records.length>12)throw new Error('Local drawing library supports at most 12 presets');
  const json=JSON.stringify({version:1,records});if(json.length>2*1024*1024)throw new Error('Drawing preset library exceeds 2 MiB of encoded content');
  storage.setItem(DRAWING_PRESET_STORAGE_KEY,json);return clone(record);
}
