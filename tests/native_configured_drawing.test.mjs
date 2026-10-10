import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createNativeConfiguredDrawingCache,nativeConfiguredKey,configuredViewId} from '../js/core/native_configured_drawing.js';
import {createCadWorkerExecutor} from '../js/core/cad_worker_runtime.js';
import {cadWorkerMeshResult} from '../js/core/cad_worker_client.js';
import {createDrawingSvg} from '../js/cad_drawings.js';
import {createSheetDoc,createView} from '../js/cad_sheet.js';
const source=JSON.parse(fs.readFileSync(new URL('./fixtures/oring_configured_native_source.json',import.meta.url))).document;
const fresh=()=>structuredClone(source);
const ready=doc=>({ok:true,results:new Map([[doc.features.find(f=>f.type==='sweep').id,{verifiedSerializedExact:true,workerMeshData:{positions:[0,0,0,1,0,0,0,1,0]}}]])});
test('actual native configured circular sweep rows are isolated and share prepared SVG geometry',async()=>{
 const doc=fresh(),before=JSON.stringify(doc),execute=createCadWorkerExecutor(),masses=[];
 const cache=createNativeConfiguredDrawingCache({regenerate:async(document,options)=>{
  assert.equal(options.restoreMode,'mesh');const result=await execute({kind:'regenerate',document,meshOnly:true,massProperties:true});
  assert.equal(result.ok,true,JSON.stringify(result.issues));masses.push(result.results.find(([id])=>id===document.features.find(f=>f.type==='sweep').id)[1].massProperties.volume);
  return {...result,results:new Map(result.results.map(([id,p])=>[id,cadWorkerMeshResult(p)]))};
 }});
 const ids=doc.configurations.filter(c=>['Small','Medium','Large'].includes(c.name)).map(c=>c.id);
 for(const id of ids){const [body]=await cache.request(doc,id);assert.equal(body.geometryProof,'exact-native-mesh');assert.ok(body.positions.length>100);
  const cfg=doc.configurations.find(c=>c.id===id),R=cfg.designTableValues.pathDiameterMm/20,r=cfg.designTableValues.profileDiameterMm/20;
  assert.ok(Math.abs(masses.at(-1)-2*Math.PI**2*R*r*r)<1e-5);}
 assert.equal(JSON.stringify(doc),before,'active CAD/history/configuration unchanged');
 const drawing=createSheetDoc({views:[]});drawing.views=ids.map((id,i)=>createView('iso',{id:'v'+i,configurationId:id,x:50+i*65,y:100,scale:[1,2],scaleMode:'manual'}));
 const svg=createDrawingSvg({...doc,drawing},{overallDimensions:false,holeCallouts:false,configuredBodiesForView:v=>cache.state(doc,v.configurationId).bodies});assert.ok(svg.includes('<svg'));
 assert.throws(()=>createDrawingSvg({...doc,drawing}),/prepared native body provider/);
});
test('deduplication, authored invalidation/Undo, stale cancellation and release are fail closed',async()=>{
 const doc=fresh(),id=doc.configurations[1].id,requests=[],releases=[],changes=[];
 const cache=createNativeConfiguredDrawingCache({regenerate:(d,o)=>new Promise(resolve=>requests.push({d,o,resolve})),release:r=>releases.push(r),onChange:()=>changes.push(1)});
 const p=cache.request(doc,id);assert.equal(cache.request(doc,id),p);await Promise.resolve();assert.equal(requests.length,1);
 const old=nativeConfiguredKey(doc,id);doc.configurations[1].designTableValues.pathDiameterMm+=10;assert.notEqual(nativeConfiguredKey(doc,id),old);
 const q=cache.request(doc,id);assert.equal(requests[0].o.signal.aborted,true);requests[0].resolve(ready(requests[0].d));await assert.rejects(p,/changed/);
 requests[1].resolve(ready(requests[1].d));await q;assert.equal(cache.state(doc,id).status,'ready');assert.equal(releases.length,2);assert.equal(changes.length,1);
 doc.configurations[1].designTableValues.pathDiameterMm-=10;assert.equal(cache.state(doc,id).status,'missing');const s=cache.request(doc,id);cache.cancel(doc);requests[2].resolve(ready(requests[2].d));await assert.rejects(s,/changed/);
});
test('incomplete native proof and unsupported rows never supply a sampled fallback',async()=>{
 const doc=fresh(),id=doc.configurations[1].id;
 const cache=createNativeConfiguredDrawingCache({regenerate:async d=>{const r=ready(d);r.results.values().next().value.verifiedSerializedExact=false;return r;}});
 await assert.rejects(cache.request(doc,id),/proof/);assert.equal(cache.state(doc,id).status,'error');assert.equal(cache.state(doc,id).bodies,undefined);
 doc.features.push({id:'extra',type:'extrude'});await assert.rejects(cache.request(doc,id),/one authored/);
 doc.drawing={views:[{id:'parent',configurationId:id},{id:'child',parent:'parent'}]};assert.equal(configuredViewId(doc,doc.drawing.views[1]),id);doc.drawing.views[0]={id:'parent',parent:'child'};assert.equal(configuredViewId(doc,doc.drawing.views[1]),null);
});
test('export prepare waits for every distinct row and rechecks caller ownership',async()=>{
 const doc=fresh(),ids=doc.configurations.slice(1,3).map(c=>c.id),requests=[];let valid=true;
 const cache=createNativeConfiguredDrawingCache({regenerate:(d)=>new Promise(resolve=>requests.push({d,resolve}))});
 const p=cache.prepare(doc,ids.map(configurationId=>({configurationId})),{assertCurrent:()=>{if(!valid)throw new Error('owner changed');}});
 await Promise.resolve();assert.equal(requests.length,1);requests[0].resolve(ready(requests[0].d));await new Promise(r=>setImmediate(r));assert.equal(requests.length,2);
 valid=false;requests[1].resolve(ready(requests[1].d));await assert.rejects(p,/owner changed/);
});

import {createDrawingController} from '../js/modeler_drawing.js';
test('ordinary controller refuses configured-row topology tools and excludes Model Items/callouts',()=>{
 const doc=createSheetDoc({views:['front']}),view=doc.views[0];view.configurationId='small';view.x=100;view.y=100;
 const messages=[];let undo=0;
 const drawing=createDrawingController({doc:()=>doc,bodies:()=>[{id:'body',positions:[0,0,0,1,0,0,0,1,0]}],bodiesToken:()=>1,
  canUseTopologyForView:v=>!v.configurationId,topology:()=>null,model:()=>fresh(),width:()=>800,height:()=>600,
  pushUndo:()=>undo++,markDirty:()=>{},refresh:()=>{},flash:m=>messages.push(m),t:t=>t,holeCallouts:()=>[{id:'hole'}]});
 const place=drawing.scene().views[0];drawing.setTool('dim');drawing.pointerDown({button:0},place.box.x+place.box.w/2,place.box.y+place.box.h/2);
 assert.match(messages.at(-1),/geometry only/);assert.equal(drawing.state.draft,null);
 assert.equal(drawing.insertModelItems(),0);assert.equal(doc.dims.length,0);assert.equal(doc.notes.length,0);assert.equal(undo,0);
});
import {sourceFunctionText} from './helpers/source_function.mjs';
test('actual modeler export preflight waits, invalidates only after success and rejects changed history',async()=>{
 const text=fs.readFileSync(new URL('../js/modeler.js',import.meta.url),'utf8');
 const doc=fresh();doc.drawing={views:[{id:'v',configurationId:doc.configurations[1].id}],dims:[]};
 const E={docType:'part',def:doc};let history=1,resolve,invalidations=0;
 const cache={prepare:async(owner,views,{assertCurrent})=>{assertCurrent();await new Promise(r=>resolve=r);assertCurrent();}};
 const preflight=new Function('E','nativeDrawingOwner','currentHistoryNode','configuredViewId','configuredNativeCache','drawingSheet',sourceFunctionText(text,'prepareConfiguredDrawingExport')+';return prepareConfiguredDrawingExport;')(E,()=>E.def,()=>history,configuredViewId,cache,()=>({invalidate:()=>invalidations++}));
 let p=preflight();assert.equal(invalidations,0);resolve();await p;assert.equal(invalidations,1);
 p=preflight();history++;resolve();await assert.rejects(p,/changed/);assert.equal(invalidations,1);
 doc.drawing.dims=[{refs:[{pid:'active-body:edge'}]}];await assert.rejects(preflight(),/per-view topology/);
});
import {configuredBodyAppearance} from '../js/core/native_configured_drawing.js';
test('live engineering appearance is preserved without rebuilding or editing derived geometry',()=>{
 const doc=fresh(),key=nativeConfiguredKey(doc,doc.configurations[1].id),body={id:'native',positions:[0,0,0]};
 doc.parts=[{featureId:doc.features.find(f=>f.type==='sweep').id,color:'#000000',density:1.13,materialCatalogId:'NBR-770'}];
 const painted=configuredBodyAppearance(doc,[body]);assert.equal(painted[0].color,'#000000');assert.equal(painted[0].materialCatalogId,'NBR-770');assert.equal(painted[0].positions,body.positions);assert.equal(body.color,undefined);assert.equal(nativeConfiguredKey(doc,doc.configurations[1].id),key);
});
test('public SVG rejects unsupported canonical configuration rather than sampling a wrong torus',()=>{
 const doc=fresh();doc.features.push({id:'extra',type:'extrude',params:{}});doc.drawing=createSheetDoc({views:['iso']});doc.drawing.views[0].configurationId=doc.configurations[1].id;
 assert.throws(()=>createDrawingSvg(doc),/one authored circular sweep/);
});
