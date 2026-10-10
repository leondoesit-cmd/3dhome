import test from 'node:test';
import assert from 'node:assert/strict';
import {canBreakView,breakMapping,breakProjection,clipBreakEdges} from '../js/core/drawing_break.js';
import {createSheetDoc,createView,createProjector,buildSheetScene,sceneToSvg,measureDim} from '../js/cad_sheet.js';
import {tessellateParts} from '../js/core/part_tessellate.js';
import {createDrawingController} from '../js/modeler_drawing.js';

const bounds={u0:0,u1:20,v0:-1,v1:1};
const modifier={version:1,axis:'u',from:4,to:16,gapMm:6,style:'zigzag'};
const edge={a:{u:0,v:0},b:{u:20,v:0}};
test('Break retains source coordinates and true size with constant paper gap at two scales',()=>{
  for(const k of [10,5]) {
    const map=breakMapping(modifier,bounds,k);
    assert.equal(map.forward({u:8,v:0}),null);
    assert.equal(map.inverse({u:4+map.gap/2,v:0}),null);
    assert.ok(Math.abs(map.bounds.u1*k-(k===10?86:46))<1e-10);
    assert.ok(Math.abs((map.forward({u:16,v:0}).u-4)*k-6)<1e-10);
    assert.deepEqual(map.inverse(map.forward({u:19,v:.5})),{u:19,v:.5});
    const clipped=clipBreakEdges([edge],map);
    assert.deepEqual(clipped.map(e=>[e.a.u,e.b.u]),[[0,4],[16,20]]);
    assert.equal(measureDim({type:'horizontal',refs:[edge.a,edge.b]}),20);
  }
});
test('Break removes internal holes and clips partial circles plus visible and hidden lines',()=>{
  const input={bounds,visible:[edge],hidden:[edge],cuts:[edge],circles:[{u:1,v:0,radius:.5,drawn:'visible'},{u:8,v:0,radius:.5,drawn:'visible'},{u:4,v:0,radius:1,drawn:'hidden'}]};
  const result=breakProjection(input,modifier,10);
  assert.equal(result.circles.length,1);
  assert.equal(result.circles[0].u,1);
  assert.ok(result.hidden.length>2);
  for(const type of ['visible','hidden','cuts'])for(const e of result[type])assert.ok(result.breakMap.retained(e.a)&&result.breakMap.retained(e.b));
  assert.deepEqual(input.bounds,bounds);assert.equal(input.circles.length,3);
});
test('Break validation excludes unimplemented aligned clusters and incompatible views',()=>{
  const view=createView('front');assert.equal(canBreakView(view,{views:[view]}),true);
  for(const change of [{dir:'iso'},{section:{}},{detail:{}},{cropSketch:{}},{brokenOut:{}},{displayStyle:'shaded'}])assert.equal(canBreakView({...view,...change},{views:[view]}),false);
  assert.equal(canBreakView(view,{views:[view,createView('top')]}),false);
  for(const change of [{version:2},{axis:'x'},{style:'bad'},{from:0},{to:20},{from:17},{gapMm:0},{gapMm:120},{from:NaN}])assert.throws(()=>breakMapping({...modifier,...change},bounds,10));
  const vertical=breakMapping({...modifier,axis:'v',from:-.5,to:.5,gapMm:2},bounds,10);
  assert.equal(vertical.forward({u:2,v:0}),null);assert.deepEqual(vertical.inverse(vertical.forward({u:2,v:1})),{u:2,v:1});
});
test('shared scene Break preserves automatic and reference measurements, hidden anchor diagnostics, cold SVG and removal',()=>{
  const doc=createSheetDoc({scale:'1:1',views:[]});
  const view=createView('front',{id:'p',primary:true,breakView:modifier});doc.views=[view];
  const projection={bounds,visible:[edge,{a:{u:0,v:1},b:{u:20,v:1}}],hidden:[],circles:[]};
  const build=d=>buildSheetScene(d,{projection:v=>breakProjection(projection,v.breakView,10)});
  doc.dims=[{id:'overall',viewId:'p',type:'horizontal',auto:'extent',refs:[],offset:10},{id:'reference',viewId:'p',type:'horizontal',reference:true,refs:[edge.a,edge.b],offset:-10},{id:'omitted',viewId:'p',type:'horizontal',refs:[{u:8,v:0},{u:9,v:0}]}];
  doc.notes=[{id:'n',text:'Hidden feature',leader:{viewId:'p',u:8,v:0}}];
  const warm=build(doc),place=warm.views[0];
  assert.equal(place.w,86);
  assert.equal(measureDim(warm.dims.get('overall').dim),20);
  assert.equal(measureDim(warm.dims.get('reference').dim),20);
  assert.ok(warm.items.some(i=>i.breakBoundary));
  assert.ok(warm.diagnostics.some(d=>d.code==='break-hidden-dimension-anchor'));
  assert.ok(warm.diagnostics.some(d=>d.code==='break-hidden-note-anchor'));
  assert.equal(place.toModel({x:place.toSheet({u:4,v:0}).x+3,y:place.y}),null);
  assert.equal(sceneToSvg(warm),sceneToSvg(build(JSON.parse(JSON.stringify(doc)))));
  const bodies=tessellateParts([{kind:'box',x0:0,x1:20,y0:-1,y1:1,z0:-1,z1:1}]);
  const bytes=JSON.stringify(bodies);const project=createProjector(doc,bodies);
  assert.ok(project(view).breakMap);assert.equal(JSON.stringify(bodies),bytes);
  view.breakView=null;assert.equal(project(view).breakMap,undefined);
  assert.equal(project(view).bounds.u1-project(view).bounds.u0,20);
});

test('actual controller form edits same view atomically, rejects gap picks and removes Break without CAD changes',async()=>{
  const doc=createSheetDoc({scale:'1:1',views:[]});doc.views=[createView('front',{id:'one',primary:true})];
  const bodies=tessellateParts([{kind:'box',x0:0,x1:20,y0:-1,y1:1,z0:-1,z1:1}]),source=JSON.stringify(bodies),undo=[],messages=[];
  let answer={axis:'u',from:'40',to:'160',gapMm:'6',style:'zigzag'};
  const host={doc:()=>doc,bodies:()=>bodies,bodiesToken:()=>0,canvas:()=>({}),width:()=>900,height:()=>600,t:x=>x,refresh(){},markDirty(){},flash:m=>messages.push(m),pushUndo:m=>undo.push(m),promptFields:async()=>answer};
  const controller=createDrawingController(host);controller.state.zoom=1;
  const click=p=>controller.pointerDown({button:0},p.x,p.y);
  controller.setTool('break');let place=controller.scene().views[0];click(place.toSheet({u:1,v:0}));
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(doc.views[0].breakView,modifier);assert.equal(doc.views[0].id,'one');assert.equal(undo.length,1);
  place=controller.scene().views[0];controller.setTool('dim');click({x:place.toSheet({u:4,v:0}).x+3,y:place.y});
  assert.equal(controller.state.draft,null);assert.equal(undo.length,1);assert.match(messages.at(-1),/gap/);
  controller.setTool('break');answer={axis:'u',from:'0',to:'160',gapMm:'6',style:'wave'};click(place.toSheet({u:1,v:0}));
  await new Promise(resolve=>setImmediate(resolve));assert.equal(undo.length,1);assert.deepEqual(doc.views[0].breakView,modifier);
  controller.setTool('unbreak');click(place.toSheet({u:1,v:0}));assert.equal(doc.views[0].breakView,null);assert.equal(undo.length,2);
  assert.equal(JSON.stringify(bodies),source);
});
