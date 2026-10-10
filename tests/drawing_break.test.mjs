import test from 'node:test';
import assert from 'node:assert/strict';
import {canBreakView,breakMapping,breakProjection,clipBreakEdges,alignedBreakPlan} from '../js/core/drawing_break.js';
import {createSheetDoc,createView,createProjector,buildSheetScene,sceneToSvg,measureDim,ensureSheetDoc} from '../js/cad_sheet.js';
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
test('Break validation excludes incompatible views while allowing principal clusters',()=>{
  const view=createView('front');assert.equal(canBreakView(view,{views:[view]}),true);
  for(const change of [{dir:'iso'},{section:{}},{detail:{}},{cropSketch:{}},{brokenOut:{}},{displayStyle:'shaded'}])assert.equal(canBreakView({...view,...change},{views:[view]}),false);
  assert.equal(canBreakView(view,{views:[view,createView('top')]}),true);
  assert.equal(canBreakView({...view,auxiliary:{}}),false);
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

test('aligned principal Break shares physical coordinates, reverses Back and leaves end-on views unchanged',()=>{
  for(const axis of ['u','v'])for(const angle of ['first','third']) {
    const doc=createSheetDoc({scale:'1:1',views:[],projection:angle});
    doc.views=['front','top','right','back','bottom','left'].map((dir,i)=>createView(dir,{id:dir,primary:i===0}));
    const bodies=tessellateParts([{kind:'box',x0:-10,x1:10,y0:-10,y1:10,z0:-2,z1:2}]),source=JSON.stringify(bodies);
    const raw=createProjector(doc,bodies),projections=new Map(doc.views.map(v=>[v.id,raw(v)]));
    const m={...modifier,axis,from:-4,to:3};
    const plan=alignedBreakPlan(doc,doc.views[0],m,projections,10,'1:1');
    assert.deepEqual([...plan.keys()],axis==='u'?['front','top','back','bottom']:['front','right','back','left']);
    for(const v of doc.views)if(plan.has(v.id)){v.breakView=plan.get(v.id);v.scale='1:1';}
    doc.dims=[{id:'original',viewId:'front',type:axis==='u'?'horizontal':'vertical',auto:'extent',refs:[],offset:10}];
    const project=createProjector(doc,bodies),build=d=>buildSheetScene(d,{projection:createProjector(d,bodies)}),warm=build(doc);
    assert.equal(measureDim(warm.dims.get('original').dim),20);
    assert.equal(project(doc.views.find(v=>v.id===(axis==='u'?'right':'top'))).breakMap,undefined);
    const front=warm.views.find(v=>v.id==='front'),linked=warm.views.find(v=>v.id===(axis==='u'?'top':'right'));
    for(const value of [-8,-4,3,8]) {
      const p={u:axis==='u'?value:0,v:axis==='v'?value:0};
      const a=front.toSheet(p),b=linked.toSheet(p);
      assert.ok(Math.abs(a[axis==='u'?'x':'y']-b[axis==='u'?'x':'y'])<1e-8);
      assert.deepEqual(front.toModel(a),p);
    }
    assert.equal(front.toSheet({u:0,v:0}),null);
    const back=warm.views.find(v=>v.id==='back');
    assert.equal(back.projection.breakModifier.groupSign,axis==='u'?-1:1);
    assert.equal(back.projection.breakModifier.from,axis==='u'?-3:-4);
    assert.equal(sceneToSvg(warm),sceneToSvg(build(JSON.parse(JSON.stringify(doc)))));
    assert.equal(JSON.stringify(bodies),source);
    const bad=doc.views.find(v=>v.id===linked.id);bad.scale='1:2';
    assert.ok(project(doc.views[0]).breakError); // Existing projector cache also invalidates.
    assert.ok(build(doc).diagnostics.some(d=>d.code==='invalid-break-view'));
  }
});

test('shared physical datum aligns asymmetric projected extents with conservative layout envelopes',()=>{
  const doc=createSheetDoc({scale:'1:1',views:[]});doc.views=['front','top'].map((dir,i)=>createView(dir,{id:dir,primary:i===0}));
  const projections=new Map([['front',{bounds:{u0:0,u1:20,v0:-1,v1:1},visible:[edge],hidden:[],circles:[]}],['top',{bounds:{u0:1,u1:18,v0:-1,v1:1},visible:[{a:{u:1,v:0},b:{u:18,v:0}}],hidden:[],circles:[]}]]);
  const plan=alignedBreakPlan(doc,doc.views[0],modifier,projections,10,'1:1');
  for(const v of doc.views){v.breakView=plan.get(v.id);v.scale='1:1';}
  const scene=buildSheetScene(doc,{projection:v=>breakProjection(projections.get(v.id),v.breakView,10)}),a=scene.views[0],b=scene.views[1];
  for(const u of [2,4,16,17])assert.equal(a.toSheet({u,v:0}).x,b.toSheet({u,v:0}).x);
  assert.deepEqual(b.projection.sourceBounds,projections.get('top').bounds);
  assert.equal(b.projection.displayBounds.u1-b.projection.displayBounds.u0,5.6);
  for(const u of [1,18]){const p=b.toSheet({u,v:0});assert.ok(p.x>=b.box.x-1e-9&&p.x<=b.box.x+b.box.w+1e-9);}
});

test('actual controller applies and removes an aligned cluster atomically and rejects concurrent member changes',async()=>{
  const doc=createSheetDoc({scale:'1:1',views:[]});doc.views=['front','top','right'].map((dir,i)=>createView(dir,{id:dir,primary:i===0}));
  const bodies=tessellateParts([{kind:'box',x0:0,x1:20,y0:-1,y1:1,z0:-2,z1:2}]),source=JSON.stringify(bodies),undo=[],messages=[];
  let mutate=false;
  const host={doc:()=>doc,bodies:()=>bodies,bodiesToken:()=>0,canvas:()=>({}),width:()=>900,height:()=>600,t:x=>x,refresh(){},markDirty(){},flash:m=>messages.push(m),pushUndo:m=>undo.push(m),promptFields:async()=>{if(mutate)doc.views[1].label='Changed';return {axis:'u',from:'40',to:'160',gapMm:'6',style:'wave'};}};
  const controller=createDrawingController(host);controller.state.zoom=1;
  const click=(id)=>{const p=controller.scene().views.find(v=>v.id===id).toSheet({u:1,v:0});controller.pointerDown({button:0},p.x,p.y);};
  controller.setTool('break');click('front');await new Promise(resolve=>setImmediate(resolve));
  assert.equal(undo.length,1);assert.equal(doc.views[0].breakView.group.id,'front');assert.equal(doc.views[1].breakView.group.id,'front');assert.equal(doc.views[2].breakView,null);
  controller.setTool('unbreak');click('top');assert.equal(undo.length,2);assert.equal(doc.views[0].breakView,null);assert.equal(doc.views[1].breakView,null);
  mutate=true;controller.setTool('break');click('front');await new Promise(resolve=>setImmediate(resolve));
  assert.equal(undo.length,2);assert.equal(doc.views[0].breakView,null);assert.match(messages.at(-1),/changed/);
  assert.equal(JSON.stringify(bodies),source);
});

test('aligned Break rejects mismatched scale/configuration, derived parents and missing retained ends before mutation',()=>{
  const doc=createSheetDoc({scale:'1:1',views:[]});doc.views=['front','top'].map((dir,i)=>createView(dir,{id:dir,primary:i===0}));
  const projections=new Map(doc.views.map(v=>[v.id,{bounds,visible:[edge],hidden:[],circles:[]}]));
  for(const change of [{scale:'1:2'},{configurationId:'other'},{auxiliary:{}},{cropSketch:{}},{displayStyle:'shadedEdges'}]) {
    Object.assign(doc.views[1],change);const bytes=JSON.stringify(doc);
    assert.throws(()=>alignedBreakPlan(doc,doc.views[0],modifier,projections,10,'1:1'));
    assert.equal(JSON.stringify(doc),bytes);
    doc.views[1]=createView('top',{id:'top'});
  }
  const bytes=JSON.stringify(doc);projections.set('top',{bounds:{...bounds,u1:10},visible:[edge],hidden:[],circles:[]});
  assert.throws(()=>alignedBreakPlan(doc,doc.views[0],modifier,projections,10,'1:1'),/retain both ends/);
  assert.equal(JSON.stringify(doc),bytes);
});

test('actual normalized host retains aligned Break apply/edit/remove across recreated view records and undo capture',async()=>{
  const drawing=createSheetDoc({scale:'1:1',views:[]});drawing.views=['front','top','right'].map((dir,i)=>createView(dir,{id:dir,primary:i===0}));
  const def={name:'Normalized aligned Break',drawing,parts:[{kind:'box',x0:0,x1:20,y0:0,y1:20,z0:-2,z1:2}]};
  const bodies=tessellateParts(def.parts),source=JSON.stringify(def.parts),steps=[],messages=[];
  let answer={axis:'u',from:'40',to:'160',gapMm:'6',style:'wave'};
  const host={doc:()=>ensureSheetDoc(def),bodies:()=>bodies,bodiesToken:()=>0,canvas:()=>({}),width:()=>900,height:()=>600,t:x=>x,refresh(){},markDirty(){},flash:m=>messages.push(m),pushUndo:label=>{ensureSheetDoc(def);steps.push({label,snapshot:JSON.stringify(def.drawing)});},promptFields:async()=>answer};
  const controller=createDrawingController(host);controller.state.zoom=1;
  const click=id=>{const place=controller.scene().views.find(v=>v.id===id),p=place.toSheet({u:1,v:1});controller.pointerDown({button:0},p.x,p.y);};
  const originalRecord=host.doc().views[0];assert.notEqual(host.doc().views[0],originalRecord);
  controller.setTool('break');click('front');await new Promise(resolve=>setImmediate(resolve));
  assert.equal(steps.length,1,messages.join('; '));
  assert.equal(host.doc().views[0].breakView.group.id,'front');assert.equal(host.doc().views[1].breakView.group.id,'front');assert.equal(host.doc().views[2].breakView,null);
  answer={axis:'v',from:'40',to:'160',gapMm:'6',style:'zigzag'};
  click('front');await new Promise(resolve=>setImmediate(resolve));
  assert.equal(steps.length,2,messages.join('; '));
  assert.equal(host.doc().views[0].breakView.group.worldAxis,'y');assert.equal(host.doc().views[1].breakView,null);assert.equal(host.doc().views[2].breakView.group.worldAxis,'y');
  controller.setTool('unbreak');click('right');assert.equal(steps.length,3);
  assert.ok(host.doc().views.every(v=>v.breakView===null));
  def.drawing=JSON.parse(steps[2].snapshot);assert.equal(host.doc().views[2].breakView.group.worldAxis,'y');
  const warm=sceneToSvg(controller.scene());def.drawing=JSON.parse(JSON.stringify(def.drawing));
  assert.equal(sceneToSvg(controller.scene()),warm);
  assert.equal(JSON.stringify(def.parts),source);
});
