import { modelerSource } from "./helpers/modeler_source.mjs";
import { sourceFunctionText } from "./helpers/source_function.mjs";
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {captureDrawingPreset,applyDrawingFormat,drawingFromTemplate,saveDrawingPreset,loadDrawingPresets} from '../js/core/drawing_presets.js';
import {createSheetDoc,buildSheetScene,sceneToSvg,ensureSheetDoc} from '../js/cad_sheet.js';
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jr5sAAAAASUVORK5CYII=';
const source=modelerSource();
function fixture(){const d=createSheetDoc({size:'A4',units:'in',scale:[2,1],title:{company:'Example School',author:'Student',tolerance:'±.005 in',mass:'PART MASS',title:'PART DESCRIPTION'}});
 d.images=[{id:'logo',dataUrl:png,x:20,y:20,w:25,h:10}];d.primitives=[{id:'border-line',type:'line',points:[{x:20,y:30},{x:45,y:30}]}];
 d.notes=[{id:'general',x:20,y:40,text:'GENERAL TOLERANCE'},{id:'part-note',x:20,y:50,text:'PART NOTE',leader:{viewId:d.views[0].id,u:0,v:0}}];
 d.dims=[{id:'partdim',viewId:d.views[0].id,type:'horizontal',refs:[{u:0,v:0},{u:4,v:0}]}];return d;}
const capture=(doc,kind='sheet-format')=>captureDrawingPreset(doc,{id:'preset',name:'MY-A',kind,includePaperArt:true});

test('format captures only independent reusable paper content and template separately captures document defaults',()=>{
 const doc=fixture(),before=JSON.stringify(doc),format=capture(doc),template=capture(doc,'drawing-template');
 assert.equal(JSON.stringify(doc),before);assert.equal(format.defaults,undefined);assert.equal(format.format.notes.length,1);
 assert.equal(format.format.title.title,undefined);assert.equal(format.format.title.mass,undefined);assert.equal(format.format.title.company,'Example School');
 assert.equal(template.defaults.units,'in');assert.deepEqual(template.defaults.scale,[2,1]);
 for(const p of [format,template])assert.equal(p.views,undefined);assert.equal(template.dims,undefined);
 template.format.images[0].w=1;assert.equal(doc.images[0].w,25,'captured data is independent');
});

test('format application preserves all source views/dimensions/notes and replaces only prior format-owned content',()=>{
 const doc=fixture(),preset=capture(doc),before=JSON.stringify(doc),applied=applyDrawingFormat(doc,preset);
 assert.equal(JSON.stringify(doc),before);assert.deepEqual(applied.views,doc.views);assert.deepEqual(applied.dims,doc.dims);assert.equal(applied.notes.filter(n=>n.id==='part-note').length,1);
 assert.equal(applied.title.mass,'PART MASS');assert.equal(applied.title.title,'PART DESCRIPTION');assert.equal(applied.units,'in');
 assert.equal(applied.images.filter(i=>i.formatOwner==='preset').length,1);assert.equal(applied.images.filter(i=>i.id==='logo').length,1);
 const twice=applyDrawingFormat(applied,preset);assert.deepEqual(twice,applied,'reapply does not accumulate format duplicates');
 const wrong=createSheetDoc({size:'A3'});assert.throws(()=>applyDrawingFormat(wrong,preset),/matching paper/);
 const rendered=sceneToSvg(buildSheetScene(applied)),cold=JSON.parse(JSON.stringify({name:'Other part',drawing:applied}));ensureSheetDoc(cold);
 assert.equal(sceneToSvg(buildSheetScene(cold.drawing)),rendered);assert.deepEqual(cold.drawing.dims,doc.dims);
});

test('new drawing template is a blank independent sheet with genuine defaults and pixels, not a cloned source drawing',()=>{
 const doc=fixture(),template=capture(doc,'drawing-template'),fresh=drawingFromTemplate(template);
 assert.deepEqual(fresh.views,[]);assert.deepEqual(fresh.dims,[]);assert.equal(fresh.notes.length,1);assert.equal(fresh.images.length,1);
 assert.equal(fresh.units,'in');assert.equal(fresh.size,'A4');assert.deepEqual(fresh.scale,[2,1]);assert.equal(fresh.title.company,'Example School');assert.equal(fresh.title.mass,'');
 assert.equal(fresh.templateSource.name,'MY-A');fresh.images[0].w=50;assert.equal(template.format.images[0].w,25);assert.equal(doc.images[0].w,25);
 assert.throws(()=>drawingFromTemplate(capture(doc)),/template/);
});

test('persistent local presets cold-load independent snapshots and failed quota write never reports committed data',()=>{
 const map=new Map(),store={getItem:k=>map.get(k),setItem:(k,v)=>map.set(k,v)},preset=capture(fixture());
 saveDrawingPreset(store,preset);const cold=loadDrawingPresets(store);assert.deepEqual(cold,[preset]);cold[0].name='local edit';assert.equal(loadDrawingPresets(store)[0].name,'MY-A');
 const previous=JSON.stringify([...map]);const failing={getItem:store.getItem,setItem(){throw new Error('Quota exceeded');}};
 assert.throws(()=>saveDrawingPreset(failing,{...preset,name:'Other'}),/Quota/);assert.equal(JSON.stringify([...map]),previous);
});

test('actual New model lifecycle creates independent template document and respects unsaved-document guard',async()=>{
 const code=sourceFunctionText(source,'newModel');
 const original={key:'source',parts:[{id:'native-body'}],drawing:fixture()},before=JSON.stringify(original);let allow=false,seed=0,mode;
 const context={E:{def:original,docType:'part'},confirmDiscardDocument:async()=>allow,closeEvalCard(){},reconcileModelerDraft(){},newDef:()=>({key:'new',parts:[]}),
  drawingFromTemplate,H:{clear:()=>({seed(){seed++;}})},markDocumentClean(){},syncHead(){},refreshAll(){},setTab(){},setMode:value=>mode=value};
 vm.createContext(context);vm.runInContext(code,context);const template=capture(original.drawing,'drawing-template');
 await context.newModel(template);assert.equal(context.E.def,original);assert.equal(seed,0);
 allow=true;await context.newModel(template);assert.notEqual(context.E.def,original);assert.equal(JSON.stringify(original),before);assert.equal(context.E.def.parts.length,0);assert.equal(context.E.def.drawing.views.length,0);assert.equal(mode,'drawing');assert.equal(seed,1);
});

test('actual format action commits one undo and preserves native model/property links; stale dialog fails closed',async()=>{
 const code=sourceFunctionText(source,'drawingPresetAction');
 const map=new Map(),storage={getItem:k=>map.get(k),setItem:(k,v)=>map.set(k,v)},preset=capture(fixture());saveDrawingPreset(storage,preset);
 const original={key:'source',parts:[{id:'native',meshData:{positions:[0,0,0]}}],features:[{id:'boss'}],customProperties:{Description:'SOURCE PART'},drawing:fixture()},cad=JSON.stringify({...original,drawing:undefined});
 const messages=[];let history=1,undos=0,finish;
 const context={E:{def:original,docType:'part'},drawingDocument:()=>context.E.def.drawing,currentHistoryNode:()=>history,
  sheetForm:async()=>({preset:'preset'}),localStorage:storage,captureDrawingPreset,applyDrawingFormat,drawingFromTemplate,loadDrawingPresets,saveDrawingPreset,
  pushUndo:()=>{undos++;history++;},drawingSheet:()=>({invalidate(){}}),refreshAll(){},flash:m=>messages.push(m),crypto:{randomUUID:()=> 'new-id'}};
 vm.createContext(context);vm.runInContext(code,context);await context.drawingPresetAction('applyformat');
 assert.equal(undos,1);assert.equal(JSON.stringify({...original,drawing:undefined}),cad);assert.deepEqual(original.drawing.dims,fixture().dims.map(d=>({...d,viewId:original.drawing.views[0].id})));
 context.sheetForm=()=>new Promise(resolve=>{finish=resolve;});const pending=context.drawingPresetAction('applyformat');history++;finish({preset:'preset'});await pending;
 assert.equal(undos,1);assert.match(messages.at(-1),/changed/);
});
