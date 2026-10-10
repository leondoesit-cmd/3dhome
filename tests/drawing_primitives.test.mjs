import test from 'node:test';
import assert from 'node:assert/strict';
import {ensureSheetDoc,createSheetDoc} from '../js/cad_sheet.js';
import {createDrawingController} from '../js/modeler_drawing.js';
import {drawingPrimitiveItems,snapDrawingPrimitivePoint,validateDrawingPrimitive} from '../js/core/drawing_primitives.js';
import {hasSaveableModelContent} from '../js/core/model_save_policy.js';
import {createPartDocument,ensureParametricDocument} from '../js/core/parametric_document.js';
import {rebuildParametricDocument} from '../js/core/parametric_rebuild.js';
import {clearMemoryModelLibrary,libraryBundle,loadModelLibrary,parseLibraryBundle,putModelLibraryRecord} from '../js/core/model_library_store.js';
function table(normalizingHistory=false){
 const def=createPartDocument({id:'paper',key:'cm_paper',name:'Paper only',parts:[],metadata:{authoringSystem:'parametric-v1'}});
 ensureSheetDoc(def);const undo=[],redo=[],messages=[];let reply=null;
 const host={doc:()=>ensureSheetDoc(def),model:()=>def,bodies:()=>[],bodiesToken:()=>0,canvas:()=>({}),width:()=>900,height:()=>600,topology:()=>[],t:key=>key,refresh(){},markDirty(){},flash:msg=>messages.push(msg),pushUndo:label=>{undo.push({label,snap:JSON.stringify(def)});redo.length=0;if(normalizingHistory)def.drawing=JSON.parse(JSON.stringify(def.drawing));},promptFields:async()=>reply};
 const controller=createDrawingController(host);controller.state.zoom=1;
 return {def,controller,host,undo,messages,answer:value=>reply=value,undoStep(){redo.push(JSON.stringify(def));Object.assign(def,JSON.parse(undo.pop().snap));controller.invalidate();},redoStep(){undo.push({snap:JSON.stringify(def)});Object.assign(def,JSON.parse(redo.pop()));controller.invalidate();},click(x,y,extra={}){controller.pointerDown({button:0,...extra},x,y);controller.pointerUp({},x,y);}};
}
test('blank sheet keeps zero views; populated CAD retains its standard four views',()=>{
 const t=table();assert.deepEqual(t.def.drawing.views,[]);assert.equal(hasSaveableModelContent(t.def),false);
 assert.equal(ensureSheetDoc({parts:[{}]}).views.length,4);
 const existing={parts:[{}],drawing:createSheetDoc({views:[]})};assert.equal(ensureSheetDoc(existing).views.length,0);
});
test('actual pointer handlers create paper line rectangle circle and polyline without CAD changes',()=>{
 const t=table(),source=JSON.stringify({parts:t.def.parts,features:t.def.features,sketches:t.def.sketches,history:t.def.history});
 for(const [tool,a,b] of [['sheetline',[20,20],[60,20]],['sheetrect',[80,20],[100,40]],['sheetcircle',[130,30],[140,30]]]){t.controller.setTool(tool);t.click(...a);t.click(...b);}
 t.controller.setTool('sheetpolyline');t.click(20,60);t.click(60,60);t.click(60,90);t.controller.keyDown({key:'Enter'});
 assert.equal(t.undo.length,4);assert.equal(t.def.drawing.primitives.length,4);
 assert.equal(JSON.stringify({parts:t.def.parts,features:t.def.features,sketches:t.def.sketches,history:t.def.history}),source);
 const items=t.controller.scene().items.filter(i=>i.primitiveId);assert.equal(items.length,8);
 const svg=t.controller.svg();assert.match(svg,/<circle[^>]*cx="130"[^>]*cy="30"[^>]*r="10"/);
 assert.equal(hasSaveableModelContent(t.def),true);
 t.undoStep();assert.equal(t.def.drawing.primitives.length,3);t.redoStep();assert.equal(t.def.drawing.primitives.length,4);
});
test('polyline closes at its first endpoint; Escape and rejected second points do not author work',()=>{
 const t=table();t.controller.setTool('sheetpolyline');t.click(20,20);t.click(50,20);t.click(50,50);t.click(20.2,20.2);
 assert.equal(t.def.drawing.primitives.length,1);assert.deepEqual(t.def.drawing.primitives[0].points.at(-1),{x:20,y:20});
 t.controller.setTool('sheetrect');t.click(80,20);t.click(100,20);assert.equal(t.undo.length,1);t.click(100,40);assert.equal(t.undo.length,2);
 t.click(150,20);t.controller.keyDown({key:'Escape'});assert.equal(t.undo.length,2);
 t.click(-20,20);assert.equal(t.controller.state.draft,null);
});
test('selected primitive numeric edit and delete are atomic and undoable',async()=>{
 const t=table();t.controller.setTool('sheetline');t.click(20,20);t.click(60,20);t.controller.setTool('select');
 t.click(40,20);assert.equal(t.controller.selection().kind,'primitive');const id=t.controller.selection().id;
 t.answer({x0:'20',y0:'25',x1:'60',y1:'25',style:'hidden'});await t.controller.editPrimitive(id);
 assert.equal(t.def.drawing.primitives[0].points[0].y,25);assert.equal(t.def.drawing.primitives[0].style,'hidden');
 assert.match(t.controller.svg(),/stroke-dasharray/);
 const snapshot=JSON.stringify(t.def),steps=t.undo.length;
 t.answer({x0:'bad',y0:'25',x1:'60',y1:'25',style:'center'});await t.controller.editPrimitive(id);assert.equal(JSON.stringify(t.def),snapshot);assert.equal(t.undo.length,steps);
 t.controller.keyDown({key:'Delete'});assert.equal(t.def.drawing.primitives.length,0);t.undoStep();assert.equal(t.def.drawing.primitives.length,1);
});
test('primitive validation and snapping preserve paper semantics and bounds',()=>{
 assert.throws(()=>validateDrawingPrimitive({type:'circle',points:[{x:5,y:5},{x:15,y:5}]},{w:100,h:100}),/whole circle/);
 assert.throws(()=>validateDrawingPrimitive({type:'line',points:[{x:0,y:0},{x:Infinity,y:0}]}),/finite/);
 assert.deepEqual(snapDrawingPrimitivePoint({x:12.3,y:15.8},[],4,{x:2,y:3},true),{x:2,y:16});
 assert.deepEqual(snapDrawingPrimitivePoint({x:12.3,y:15.8},[],4,null,false,true),{x:12.3,y:15.8});
 assert.equal(drawingPrimitiveItems({type:'rectangle',points:[{x:10,y:10},{x:30,y:20}]}).length,4);
});
test('annotation-only document survives real library bundle storage and reopen without geometry',async()=>{
 clearMemoryModelLibrary();try{
 const t=table();t.controller.setTool('sheetline');t.click(20,20);t.click(60,20);t.def.drawing.notes.push({id:'n1',text:'Educational grid; no nominal model dimensions',x:20,y:80});
 assert.equal(rebuildParametricDocument(t.def).ok,true);
 assert.equal((await putModelLibraryRecord(t.def,{expected:null})).ok,true);
 const loaded=ensureParametricDocument(parseLibraryBundle(JSON.stringify(libraryBundle(await loadModelLibrary(),[]))).models[0]);
 assert.deepEqual(ensureSheetDoc(loaded),t.def.drawing);assert.equal(hasSaveableModelContent(loaded),true);assert.equal(loaded.parts.length,0);assert.equal(loaded.features.length,0);
 assert.equal(rebuildParametricDocument(loaded).ok,true);
 }finally{clearMemoryModelLibrary();}
});

test('annotation-only canonical save compiles regenerates and captures an empty native document honestly',async()=>{
 const {compileKernelFeatureTree}=await import('../js/core/kernel_feature_adapter.js');
 const {regenerateFeatures,releaseRegeneration}=await import('../js/cad_feature_tree.js');
 const {captureExactTopology}=await import('../js/core/exact_topology_cache.js');
 const t=table();t.controller.setTool('sheetline');t.click(20,20);t.click(60,20);
 const compiled=compileKernelFeatureTree(t.def);assert.equal(compiled.ok,true,JSON.stringify(compiled.issues));assert.equal(compiled.features.length,0);
 const run=await regenerateFeatures({...compiled.document,features:compiled.features});
 try{assert.equal(run.ok,true,JSON.stringify(run.issues));assert.equal(run.finalShape,null);const proof=captureExactTopology(t.def,compiled.features,run);assert.ok(proof);assert.equal(rebuildParametricDocument({...t.def,exactTopologyCache:proof}).ok,true);}finally{releaseRegeneration(run);}
});
test('canvas double-click routes to paper edit fields and late answers cannot edit a replaced sheet',async()=>{
 const t=table();t.controller.setTool('sheetline');t.click(20,20);t.click(60,20);t.controller.setTool('select');
 t.answer({x0:'20',y0:'30',x1:'60',y1:'30',style:'center'});assert.equal(t.controller.doubleClick({},40,20),true);
 await new Promise(resolve=>setImmediate(resolve));assert.equal(t.def.drawing.primitives[0].style,'center');
 assert.equal(t.def.drawing.primitives[0].points[0].y,30);
 let resolve; t.host.promptFields=()=>new Promise(done=>resolve=done);
 const id=t.def.drawing.primitives[0].id,pending=t.controller.editPrimitive(id),steps=t.undo.length;
 t.def.drawing=createSheetDoc({views:[]});
 resolve({x0:'20',y0:'40',x1:'60',y1:'40',style:'hidden'});await pending;
 assert.equal(t.def.drawing.primitives.length,0);assert.equal(t.undo.length,steps);
});

test('real primitive editor commits exact paper coordinates/style to normalized live records through Undo Redo and cold SVG',async()=>{
 const t=table(true),cad=JSON.stringify({features:t.def.features,sketches:t.def.sketches,parts:t.def.parts,history:t.def.history});
 t.controller.setTool('sheetpolyline');for(const p of [[20,20],[60,20],[60,60],[20,20]])t.click(...p);t.controller.keyDown({key:'Enter'});
 const id=t.def.drawing.primitives[0].id,old=t.def.drawing.primitives[0],before=JSON.stringify(old);t.host.historyToken=()=>t.undo.length;
 t.answer({x0:'30.25',y0:'40.5',x1:'90.75',y1:'40.5',x2:'90.75',y2:'85.125',x3:'30.25',y3:'40.5',style:'center'});
 await t.controller.editPrimitive(id);
 const live=t.def.drawing.primitives[0];assert.notEqual(live,old);assert.equal(JSON.stringify(old),before);assert.deepEqual(live.points,[{x:30.25,y:40.5},{x:90.75,y:40.5},{x:90.75,y:85.125},{x:30.25,y:40.5}]);assert.equal(live.style,'center');
 const edited=JSON.stringify(live),svg=t.controller.svg();assert.match(svg,/x1="30.25"[^>]*y1="40.5"/);assert.match(svg,/stroke-dasharray/);
 assert.equal(JSON.stringify({features:t.def.features,sketches:t.def.sketches,parts:t.def.parts,history:t.def.history}),cad);
 t.undoStep();assert.equal(JSON.stringify(t.def.drawing.primitives[0]),before);t.redoStep();assert.equal(JSON.stringify(t.def.drawing.primitives[0]),edited);assert.equal(t.controller.svg(),svg);
 const cold=JSON.parse(JSON.stringify(t.def)),controller=createDrawingController({...t.host,doc:()=>ensureSheetDoc(cold),model:()=>cold});assert.equal(controller.svg(),svg);
});

test('primitive edit cancellation, invalid coordinates and intervening owner/history/source changes never commit or push Undo',async()=>{
 for(const kind of ['cancel','invalid','history','owner','primitive','sheet']){
  const t=table(true);t.controller.setTool('sheetline');t.click(20,20);t.click(60,20);const id=t.def.drawing.primitives[0].id,steps=t.undo.length;let resolve,revision=steps,owner=t.def;
  t.host.historyToken=()=>revision;t.host.model=()=>owner;t.host.promptFields=()=>new Promise(r=>resolve=r);const pending=t.controller.editPrimitive(id);
  if(kind==='history')revision++;
  if(kind==='owner')owner={drawing:t.def.drawing};
  if(kind==='primitive')t.def.drawing.primitives[0].style='center';
  if(kind==='sheet')t.def.drawing=JSON.parse(JSON.stringify(t.def.drawing));
  const before=JSON.stringify(t.def);resolve(kind==='cancel'?null:{x0:kind==='invalid'?'bad':'20',y0:'25',x1:'60',y1:'25',style:'hidden'});await pending;
  assert.equal(JSON.stringify(t.def),before,kind);assert.equal(t.undo.length,steps,kind);
 }
});
