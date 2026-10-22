import { modelerSource } from "./helpers/modeler_source.mjs";
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {sheetTitleText,sheetTitleMeta,setSheetTitleSource,validateSheetTitleSources} from '../js/core/custom_properties.js';
import {createSheetDoc,ensureSheetDoc,buildSheetScene,sceneToSvg} from '../js/cad_sheet.js';
import {createDrawingController} from '../js/modeler_drawing.js';
import {captureDrawingPreset,applyDrawingFormat,drawingFromTemplate,saveDrawingPreset,loadDrawingPresets} from '../js/core/drawing_presets.js';
import {createDrawingSvg} from '../js/cad_drawings.js';

const model=()=>({name:'BATTERY',customProperties:{Description:'BATTERY, 6-VOLT'},parts:[],features:[],sketches:[],drawing:createSheetDoc({views:[],title:{title:'MANUAL TITLE',number:'MANUAL NUMBER'}})});
const linked=()=>{const def=model();setSheetTitleSource(def.drawing,'title','description');setSheetTitleSource(def.drawing,'number','name');return def;};

test('explicit independent fields follow source rename/Description, preserve manual strings and never strip names',()=>{
 const def=linked(),before=JSON.stringify({...def,drawing:undefined});
 assert.deepEqual(sheetTitleMeta(def.drawing,def),{title:'BATTERY, 6-VOLT',number:'BATTERY'});
 def.name='BATTERY witness - source copy';assert.equal(sheetTitleMeta(def.drawing,def).number,def.name);
 assert.equal(sheetTitleText(def.drawing,def),'BATTERY, 6-VOLT');
 def.customProperties.Description='BATTERY, revised';assert.equal(sheetTitleText(def.drawing,def),'BATTERY, revised');
 setSheetTitleSource(def.drawing,'title','manual');setSheetTitleSource(def.drawing,'number','manual');
 assert.deepEqual(sheetTitleMeta(def.drawing,def),{title:'MANUAL TITLE',number:'MANUAL NUMBER'});
 assert.deepEqual(def.parts,[]);assert.equal(before,JSON.stringify({...model(),drawing:undefined}));
});

test('legacy fields remain unchanged; explicit manual current-name or empty text is literal after normalization',()=>{
 const def=model();def.drawing.title.title='BATTERY';
 assert.equal(sheetTitleText(def.drawing,def),'BATTERY, 6-VOLT');assert.equal(sheetTitleMeta(def.drawing,def).number,'MANUAL NUMBER');
 setSheetTitleSource(def.drawing,'title','manual');assert.equal(sheetTitleText(def.drawing,def),'BATTERY');
 def.drawing.title.title='';ensureSheetDoc(def);assert.equal(def.drawing.title.title,'');assert.equal(sheetTitleText(def.drawing,def),'');
 assert.equal(def.drawing.title.number,'MANUAL NUMBER');
});

test('missing or invalid explicit source fails closed without manual/source-property substitution',()=>{
 const def=linked();delete def.customProperties.Description;assert.equal(sheetTitleText(def.drawing,def),'');
 assert.equal(sheetTitleMeta(def.drawing,null).number,'');
 def.drawing.title.sources.title='other';assert.equal(sheetTitleText(def.drawing,def),'');
 for(const value of [{number:'description'},{title:'filename'},{material:'name'},[],null])assert.throws(()=>validateSheetTitleSources(value),/Invalid/);
 assert.throws(()=>setSheetTitleSource(def.drawing,'number','description'),/Invalid/);
});

test('shared Canvas/SVG items and actual controller cache track metadata-only source changes and cold',()=>{
 const def=linked(),cad=JSON.stringify({parts:def.parts,features:def.features,sketches:def.sketches});
 const host={doc:()=>ensureSheetDoc(def),model:()=>def,bodies:()=>[],bodiesToken:()=>1,t:k=>k,canvas:()=>({}),width:()=>900,height:()=>600,refresh(){}};
 const controller=createDrawingController(host);let svg=controller.svg();assert.match(svg,/BATTERY, 6-VOLT/);assert.match(svg,/>BATTERY<\/text>/);
 def.name='RENAMED';svg=controller.svg();assert.match(svg,/>RENAMED<\/text>/);assert.doesNotMatch(svg,/>BATTERY<\/text>/);
 def.customProperties.Description='LIVE DESCRIPTION';svg=controller.svg();assert.match(svg,/LIVE DESCRIPTION/);
 const scene=buildSheetScene(def.drawing,{model:def});assert.equal(sceneToSvg(scene),svg);
 assert.ok(scene.items.some(i=>i.type==='text'&&i.text==='LIVE DESCRIPTION'));
 const saved=JSON.parse(JSON.stringify(def));ensureSheetDoc(saved);
 assert.equal(createDrawingController({...host,doc:()=>ensureSheetDoc(saved),model:()=>saved}).svg(),svg);
 assert.match(createDrawingSvg(def,{overallDimensions:false,holeCallouts:false}),/RENAMED/);
 assert.equal(JSON.stringify({parts:def.parts,features:def.features,sketches:def.sketches}),cad);
});

test('reusable formats/templates persist binding definitions but resolve the new document source',()=>{
 const def=linked(),record=captureDrawingPreset(def.drawing,{id:'bound',name:'SOURCE LINKS',kind:'drawing-template'});
 assert.deepEqual(record.format.titleSources,{title:'description',number:'name'});
 assert.equal(record.format.title.title,undefined);assert.equal(record.format.title.number,undefined);
 const map=new Map(),storage={getItem:k=>map.get(k),setItem:(k,v)=>map.set(k,v)};
 saveDrawingPreset(storage,record);const cold=loadDrawingPresets(storage)[0];
 const fresh={name:'LENS',customProperties:{Description:'NEW LENS'},drawing:drawingFromTemplate(cold)};
 assert.deepEqual(sheetTitleMeta(fresh.drawing,fresh),{title:'NEW LENS',number:'LENS'});
 const local=model(),applied=applyDrawingFormat(local.drawing,cold);
 assert.equal(applied.title.title,'MANUAL TITLE');assert.equal(applied.title.number,'MANUAL NUMBER');
 assert.deepEqual(sheetTitleMeta(applied,local),{title:'BATTERY, 6-VOLT',number:'BATTERY'});
 applied.title.sources.title='manual';assert.equal(cold.format.titleSources.title,'description');
 const invalid=JSON.parse(JSON.stringify(cold));invalid.format.titleSources.number='description';assert.throws(()=>drawingFromTemplate(invalid),/Invalid/);
 const legacy=captureDrawingPreset(model().drawing,{id:'legacy',name:'LEGACY'});
 assert.equal(legacy.format.titleSources,undefined);assert.deepEqual(applyDrawingFormat(def.drawing,legacy).title.sources,def.drawing.title.sources);
});

test('actual ordinary source selector reacquires normalized document after Undo and restores manual values',()=>{
 const source=modelerSource();
 const start=source.indexOf('function bindTitleSource('),end=source.indexOf('function buildSheetPanel(',start);
 assert.ok(start>=0&&end>start);let current=model().drawing,listener,history=[],paints=0;
 const picker={value:'description',addEventListener:(event,fn)=>{assert.equal(event,'change');listener=fn;}},host={};
 const context={setSheetTitleSource,drawingDocument:()=>current,t:k=>k,pushUndo:()=>{history.push(JSON.stringify(current));current=JSON.parse(JSON.stringify(current));},drawSketch:()=>paints++,buildSheetPanel:panel=>assert.equal(panel,host)};
 vm.createContext(context);vm.runInContext(source.slice(start,end),context);context.bindTitleSource(picker,'title',host);
 const old=current;listener();assert.notEqual(current,old);assert.equal(old.title.sources,undefined);
 assert.equal(current.title.sources.title,'description');assert.equal(current.title.title,'MANUAL TITLE');assert.equal(history.length,1);
 picker.value='manual';listener();assert.equal(sheetTitleText(current,model()),'MANUAL TITLE');assert.equal(history.length,2);assert.equal(paints,2);
 current=JSON.parse(history[0]);assert.equal(current.title.sources,undefined,'Undo restores legacy selection without altering manual values');
});
