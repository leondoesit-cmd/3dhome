import { modelerSource } from "./helpers/modeler_source.mjs";
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parse} from '../vendor/acorn/acorn.mjs';
import {sourceFunctionText} from './helpers/source_function.mjs';
import {holeSpan} from '../js/core/hole_span.js';
import {tessellatePart} from '../js/core/part_tessellate.js';
import {circleData, ellipseData, lineData, entityPoints, sketchPoint} from '../js/sketch_solver.js';
import {splineControls, bezierPoint} from '../js/sketch_spline.js';
import {filletGrowDirection} from '../js/modeler_instant3d.js';
import {ensureSketchDoc, ensureSketch, removeSketch, sketchIsAbandoned,
  pruneAbandonedSketches, pruneOrphanPoints, addSketch} from '../js/sketch_solver.js';
import {addSmartDimension, currentMeasure, distanceDimensionLayout, hitSketchDimensionHit} from '../js/sketch_dimensions.js';
import {addCubicSpline, trimSplineAtLines} from '../js/sketch_spline.js';
import {bomCsv} from '../js/modeler_commands.js';
import {drawingEllipseGeometry, drawingArcGeometry} from '../js/core/drawing_primitives.js';
import {addViewToSheet} from '../js/cad_sheet.js';
import {formatLength} from '../js/planning_units.js';

const read = file => file === 'modeler.js' ? modelerSource() : readFileSync(new URL('../js/' + file, import.meta.url), 'utf8');
const source = read('modeler.js'), geometry = read('modeler_part_geometry.js');
const mesh = read('modeler_mesh_geometry.js'), mobile = read('modeler_mobile.js');
function load(text, name, bindings = {}) {
  return new Function(...Object.keys(bindings), sourceFunctionText(text, name) + ';return ' + name)(...Object.values(bindings));
}
function findNode(text, predicate) {
  let found;
  function visit(node) {
    if (!node || typeof node !== 'object' || found) return;
    if (predicate(node)) { found = node; return; }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === 'object') visit(value);
    }
  }
  visit(parse(text, {ecmaVersion:'latest', sourceType:'module'}));
  assert.ok(found, 'expected production handler');
  return found;
}
function listener(text, object, event, contains = '') {
  const node = findNode(text, n => n.type === 'CallExpression' && n.callee?.object?.name === object
    && n.callee?.property?.name === 'addEventListener' && n.arguments[0]?.value === event
    && text.slice(n.start,n.end).includes(contains));
  return text.slice(node.arguments[1].start,node.arguments[1].end);
}
const holeLoop = load(mesh, 'holeLoop');
const mirror = load(geometry, 'mirrorProjectionPart', {
  isKernelBody:()=>false, holeLoop,
  mirrorExtrusionSpan:load(geometry, 'mirrorExtrusionSpan'),
});
const profile = [{u:0,v:0},{u:10,v:0},{u:10,v:10},{u:0,v:10}];
const bore = [{u:2,v:2},{u:4,v:2},{u:4,v:4},{u:2,v:4}];
const frame = {origin:{x:3,y:4,z:5}, xAxis:{x:1,y:0,z:0}, yAxis:{x:0,y:0,z:1}, normal:{x:0,y:-1,z:0}};

test('axial and framed mirrors preserve ordered body and blind-hole limits, including one-sided limits', () => {
  for (const [axis,plane] of [['x','plane:right'],['y','plane:top'],['z','plane:front'],['frame','plane:front']]) {
    const part = {kind:'ext',axis,from:2,to:12,pts:profile,holes:[
      {pts:bore,from:4,to:7}, {points:bore,from:5}, {loop:bore,to:8}, bore,
      {points:bore,from:6,to:9,suppressed:true},
    ],...(axis === 'frame' ? {frame:structuredClone(frame)} : {})};
    const original = structuredClone(part);
    mirror(part,plane);
    assert.deepEqual([part.from,part.to],[-12,-2]);
    assert.deepEqual(part.holes.slice(0,3).map(h=>[h.from,h.to]),[[-7,-4],[null,-5],[-8,null]]);
    assert.equal(part.holes[4].suppressed,true);
    assert.deepEqual(holeSpan(part,part.holes[0]),{from:-7,to:-4});
    mirror(part,plane);
    assert.deepEqual([part.from,part.to],[original.from,original.to]);
    assert.deepEqual(part.holes.map(h=>holeSpan(part,h)),original.holes.map(h=>holeSpan(original,h)));
  }
  const lateral = {kind:'ext',axis:'y',from:2,to:12,pts:structuredClone(profile),holes:[{pts:structuredClone(bore),from:4,to:7}]};
  mirror(lateral,'plane:right');
  assert.deepEqual([lateral.holes[0].from,lateral.holes[0].to],[4,7]);
});

test('feature rebuilding clips blind holes and skips empty/suppressed spans', () => {
  const rebuild = load(source,'rebuildFeatureTreeFromDocument',{
    activeParts:d=>d.parts, cloneData:structuredClone, holeLoop, holeSpan, fin:Number.isFinite,
    addFeature:(d,f)=>{d.features.push(f);return f;},
    emitPartMerges:(_d,_p,f)=>f, emitPartPatternTurn:(_d,_p,f)=>f,
  });
  const def = {parts:[{id:'body',kind:'ext',axis:'y',from:2,to:12,pts:profile,holes:[
    {pts:bore,from:4,to:7}, {points:bore,to:8}, bore,
    {points:bore,from:20,to:25}, {points:bore,from:5,to:8,suppressed:true},
  ]}]};
  rebuild(def);
  assert.deepEqual(def.features.filter(f=>f.id.includes(':hole:')).map(f=>[f.params.from,f.params.to]),[[4,7],[2,8],[2,12]]);
  assert.deepEqual(def.features[1].params.points,bore);
});

test('hole topology and tessellation retain blind depths and closed, outward surfaces', () => {
  const visit = load(mesh,'forEachCutLoop',{holeLoop,holeSpan,fin:Number.isFinite});
  const needsExact = load(geometry,'partNeedsExactMesh',{fin:Number.isFinite});
  for (const axis of ['x','y','z','frame']) {
    const part = {kind:'ext',axis,from:2,to:12,pts:profile,
      holes:[{pts:bore,from:7}, {pts:bore,from:20,to:25}],
      ...(axis === 'frame' ? {frame} : {})};
    const spans=[];visit(part,(_loop,_tag,from,to)=>spans.push([from,to]));
    assert.deepEqual(spans,[[7,12]]);
    assert.equal(needsExact(part),true);
    const p=tessellatePart(part).positions;
    let volume=0;
    for(let i=0;i<p.length;i+=9) {
      const [ax,ay,az,bx,by,bz,cx,cy,cz]=p.slice(i,i+9);
      volume+=(ax*(by*cz-bz*cy)+ay*(bz*cx-bx*cz)+az*(bx*cy-by*cx))/6;
    }
    assert.ok(Math.abs(volume-980)<1e-8, `${axis} signed volume ${volume}`);
  }
});

test('right splitter follows LTR/RTL pointer direction and schedules 3D layout', () => {
  const handler=listener(source,'resizer','pointermove');
  for(const [dir,expected] of [['ltr','280px'],['rtl','320px']]) {
    const panel={style:{}};let layouts=0,sketches=0;
    const bindings={rDrag:{startX:100,startW:300},rightPanel:panel,document:{documentElement:{dir}},window:{innerWidth:1200},
      sizeSketch:()=>sketches++,drawSketch:()=>{},requestAnimationFrame:fn=>fn(),layout3DHost:()=>layouts++};
    const run=new Function(...Object.keys(bindings),'return '+handler)(...Object.values(bindings));
    run({clientX:120});assert.equal(panel.style.width,expected);assert.equal(layouts,1);assert.equal(sketches,1);
  }
});

function sketchBindings(sketch) {
  const bindings={circleData,ellipseData,lineData,entityPoints,sketchPoint,splineControls,bezierPoint,
    positiveArcSweep:(start,end)=>((end-start)%(2*Math.PI)+2*Math.PI)%(2*Math.PI)};
  bindings.sampleSplinePoints=load(source,'sampleSplinePoints',bindings);
  bindings.splineLength=load(source,'splineLength',bindings);
  bindings.sketchUvPolylines=load(source,'sketchUvPolylines',bindings);
  const E={def:{},ssel:[]};
  const types=source.match(/var SKETCH_ENTITY_TYPES = ([^;]+);/)[1];
  bindings.SKETCH_ENTITY_TYPES=JSON.parse(types);
  Object.assign(bindings,{E,ensureSketch:()=>sketch,modelLengthText:v=>String(Math.round(v*1e6)/1e6),
    modelLengthUnit:()=> 'mm',modelAreaText:String,t:key=>key});
  bindings.selEntities=load(source,'selEntities',bindings);
  bindings.selPoints=load(source,'selPoints',bindings);
  return bindings;
}
test('standalone point entities are sketch objects, selected entities and visible preview crosshairs', () => {
  const point={id:'p',x:12,y:-3},entity={id:'point',type:'point',p:'p'};
  const sketch={points:[point],entities:[entity]},b=sketchBindings(sketch);
  const isSketch=load(source,'isSketchObject',b);
  assert.equal(isSketch(entity),true);assert.equal(isSketch(point),true);assert.ok(!isSketch({kind:'box'}));
  b.E.ssel=[entity];assert.deepEqual(b.selEntities(),[entity]);
  const lines=b.sketchUvPolylines(sketch);assert.equal(lines.length,2);
  assert.deepEqual(lines[0],[{u:11.5,v:-3},{u:12.5,v:-3}]);
  assert.deepEqual(lines[1],[{u:12,v:-3.5},{u:12,v:-2.5}]);
  assert.deepEqual(b.sketchUvPolylines({points:[],entities:[entity]}),[]);
});

test('ellipse, arc and spline screen bounds use their curves without centers or off-curve handles', () => {
  const sketch={points:[{id:'c',x:0,y:0},{id:'a',x:Math.sqrt(75),y:5},{id:'b',x:-Math.sqrt(75),y:5},
    {id:'s0',x:0,y:0},{id:'s1',x:0,y:100},{id:'s2',x:10,y:100},{id:'s3',x:10,y:0}]};
  const b=sketchBindings(sketch);
  const bounds=load(source,'sketchEntityScreenBounds',{...b,toPx:(x,y)=>({x:10+x*2,y:20-y*2})});
  const ellipse=bounds({type:'ellipse',c:'c',rx:10,ry:4,rot:Math.PI/4},sketch);
  const extent=Math.sqrt(58)*2;
  assert.ok(Math.abs(ellipse.x0-(10-extent))<.03);assert.ok(Math.abs(ellipse.y1-(20+extent))<.03);
  const arc=bounds({type:'arc',c:'c',a:'a',b:'b'},sketch);
  assert.ok(Math.abs(arc.y0)<1e-8);assert.ok(Math.abs(arc.y1-10)<1e-8,'centre is excluded');
  const spline=bounds({type:'spline',degree:3,a:'s0',h1:'s1',h2:'s2',b:'s3'},sketch);
  assert.deepEqual(spline,{x0:10,y0:-130,x1:30,y1:20});
});

test('point and spline summaries show coordinates and sampled length, including mixed selections', () => {
  const point={id:'p',x:12,y:-3},spline={id:'s',type:'spline',degree:3,a:'a',h1:'h1',h2:'h2',b:'b'};
  const sketch={points:[point,{id:'a',x:0,y:0},{id:'h1',x:0,y:10},{id:'h2',x:10,y:10},{id:'b',x:10,y:0}]};
  const b=sketchBindings(sketch),summary=load(source,'sketchSelectionSummary',b);
  b.E.ssel=[{type:'point',p:'p'}];assert.equal(summary(),'X 12 · Y -3 mm');
  b.E.ssel=[spline];const length=Number(summary().split(' ')[1]);assert.ok(length>19.9 && length<20);
  b.E.ssel=[spline,{type:'line',a:'a',b:'b'},{type:'point',p:'p'}];
  assert.match(summary(),/^3 selectedLabel · Σ 29\.9/);
  b.E.ssel=[point];assert.equal(summary(),'X 12 · Y -3 mm');
});

test('Z-axis fillet direction defaults missing/nonfinite X to zero and preserves negative X', () => {
  for(const x of [undefined,NaN,0,5]) assert.deepEqual(filletGrowDirection({axis:{x:0,y:0,z:1},origin:{x}}),{x:1,y:0,z:0});
  assert.deepEqual(filletGrowDirection({axis:{x:0,y:0,z:1},origin:{x:-5}}),{x:-1,y:0,z:0});
});

test('drawing settings stay open while preview is pending or fails and close only on success', async () => {
  const node=findNode(source,n=>n.type==='AssignmentExpression' && n.left?.object?.name==='preview' && n.left?.property?.name==='onclick');
  const handler=source.slice(node.right.start,node.right.end);
  for(const success of [false,true]) {
    let resolve,closed=0,applied=0;
    const promise=new Promise(done=>{resolve=done;});
    const run=new Function('apply','showDrawingPreview','dialog','return '+handler)(()=>applied++,()=>promise,{close:()=>closed++});
    const pending=run();assert.equal(applied,1);assert.equal(closed,0);
    resolve(success);await pending;assert.equal(closed,success?1:0);
  }
});

test('mobile drawers use a clean label for state, accessible name and targeted reopening', () => {
  const attrs={},classes=new Set();let summary=null;
  const head={dataset:{},get textContent(){return 'Direct'+(summary?.textContent || '');},
    querySelector:()=>summary,appendChild:n=>{summary=n;n.remove=()=>{summary=null;};},setAttribute:(k,v)=>{attrs[k]=v;},
    closest:()=>group};
  const group={querySelector:()=>head,querySelectorAll:()=>Array(5),classList:{contains:c=>classes.has(c),add:c=>classes.add(c),
    toggle(c,on){on=on??!classes.has(c);if(on)classes.add(c);else classes.delete(c);}}};
  const openCommandGroups={Direct:true},sheet={querySelectorAll:()=>[group],querySelector:()=>({closest:()=>group})};
  const mark=load(mobile,'markGroupDrawers',{sheet,openCommandGroups,document:{createElement:()=>({})}});
  mark();mark();assert.equal(summary.textContent,'5 tools');assert.equal(attrs['aria-label'],'Direct');
  assert.equal(attrs['aria-describedby'],summary.id);assert.equal(attrs['aria-expanded'],'true');
  const click=listener(mobile,'sheet','click','openCommandGroups');
  const run=new Function('openKey','openCommandGroups','return '+click)('cmd',openCommandGroups);
  run({target:{closest:()=>head},preventDefault(){},stopPropagation(){}});
  assert.deepEqual(openCommandGroups,{Direct:false});mark();assert.equal(attrs['aria-expanded'],'false');
  load(mobile,'showModelerSheet',{sheet,openCommandGroups,showSheet(){}})('cmd','[data-command]');
  assert.deepEqual(openCommandGroups,{Direct:true});mark();assert.equal(attrs['aria-expanded'],'true');
});

// Batch #2: execute production handlers with the real history implementation.
import {createHistory} from '../js/edit_history.js';
import {solveSketch} from '../js/sketch_solver.js';
import {buildCommandCatalog, KEY_TOOL} from '../js/modeler_commands.js';
const drawingSource = read('modeler_drawing.js');
const noop = () => {};
function evaluate(text, bindings) {
  return new Function(...Object.keys(bindings), 'return (' + text + ')')(...Object.values(bindings));
}
function eventNode(tag = '', _class = '', text = '') {
  return {tag, textContent:text, children:[], events:{}, style:{}, dataset:{},
    appendChild(n){this.children.push(n);return n;}, setAttribute:noop,
    addEventListener(k,fn){(this.events[k] ||= []).push(fn);},
    removeEventListener(k,fn){this.events[k] = (this.events[k] || []).filter(f=>f!==fn);},
    emit(k,e={}){for(const fn of [...(this.events[k] || [])]) fn(e);},
    setPointerCapture:noop, releasePointerCapture:noop, querySelector:()=>null};
}
function historyHarness(def) {
  const E = {def, topologySelection:[], paintMode:'face', paintColor:'#ff0000'};
  let pushes=0;
  const H=createHistory({get:()=>JSON.stringify(E.def),set:s=>{E.def=JSON.parse(s);}});
  const bindings={E,t:k=>k,pushUndo:label=>{pushes++;H.push(label);},
    updatePreview:noop,refreshParts:noop,refreshAll:noop,flash:noop,closeNoteEditor:noop,
    scheduleModelerDraft:noop,syncNotesAndMarkups:noop,syncPaintToolbar:noop};
  return {E,H,bindings,get pushes(){return pushes;}};
}
function assertUndoRedo(h,before,after) {
  const saved = JSON.parse(JSON.stringify(after));
  assert.deepEqual(h.E.def,after);assert.equal(h.H.undo(),true);assert.deepEqual(h.E.def,before);
  assert.equal(h.H.redo(),true);assert.deepEqual(h.E.def,saved);
}

for (const action of ['finishSection','finishDetail','editNote','deleteDim','deleteNote','addView',
  'duplicateSelectedView','addHoleCallouts','refreshHoleCallouts','insertModelItems','autoDimension','relayout']) {
  test(`batch 2 #1: ${action} commits to the normalized drawing and undoes/redoes`, async()=>{
    const before={views:[{id:'v',dir:'front',x:20,y:30}],dims:[{id:'d',viewId:'v'}],notes:[{id:'n',text:'old'}]};
    if(action==='refreshHoleCallouts')before.notes.push({id:'hole',feature:'h',text:'bore',leader:{viewId:'v',u:1,v:2},x:15,y:-8});
    const h=historyHarness(structuredClone(before));
    const stale=h.E.def,state={selection:{kind:'view',id:'v'}};
    const place={id:'v',view:stale.views[0],scale:'1:1',k:1,box:{x:0,y:0},
      toModel:p=>({u:p.x,v:p.y}),toSheet:p=>({x:p.u,y:p.v}),projection:{bounds:{u0:0,u1:10,v0:0,v1:20}}};
    const built={views:[place],primaryId:'v'};
    const host={doc:()=>h.E.def,t:k=>k,markDirty:noop,flash:noop,
      pushUndo:label=>{h.bindings.pushUndo(label);h.E.def=structuredClone(h.E.def);},
      promptFields:async()=>({text:'new'}),holeCallouts:()=>[{id:'h',text:'bore'}]};
    const b={host,state,scene:()=>built,invalidate:noop,nextSectionTag:()=> 'A',
      viewBasis:()=>({right:{x:1,y:0,z:0},up:{x:0,y:1,z:0}}),viewForSight:()=> 'right',pickDetailScale:()=> '2:1',
      defaultViewLabel:d=>d,projectionBounds:p=>p.bounds,
      holeLeaderForViews:()=>null,holeTopologyAnchor:()=>null,
      planModelItems:()=>[{viewId:'v',type:'horizontal'}],addHoleCallouts:()=>0,
      addViewToSheet:(doc,dir,options)=>{const v={...options,id:'copy',dir};doc.views.push(v);return v;}};
    if(action==='deleteDim'||action==='deleteNote')state.selection={kind:action==='deleteDim'?'dim':'note',id:action==='deleteDim'?'d':'n'};
    const name=action.startsWith('delete')?'deleteSelection':action==='refreshHoleCallouts'?'addHoleCallouts':action;
    const run=load(drawingSource,name,b);
    if(action==='finishSection')run({viewId:'v',start:{x:0,y:0}},{x:10,y:0});
    else if(action==='finishDetail')run({viewId:'v',centre:{x:0,y:0}},{x:10,y:0});
    else if(action==='editNote')await run('n');
    else run(action==='addView'?'right':undefined);
    assert.equal(h.pushes,1);
    assert.deepEqual(stale,before,'history normalization detached all old records');
    const after=structuredClone(h.E.def);assert.notDeepEqual(after,before);
    if(action==='duplicateSelectedView')assert.equal(after.dims.length,2);
    if(action==='refreshHoleCallouts'){assert.equal(after.notes.length,2);assert.equal(after.notes[1].leader,null);}
    assertUndoRedo(h,before,after);
  });
}

for(const [object,mutation] of [['clearPaintBtn','clearFacePaint'],['clearMarkupsBtn','clearMarkupsFromDef'],
  ['noteEditorDone','updateNoteInDef'],['noteEditorDelete','deleteNoteFromDef']]) {
  test(`batch 2 #2: ${object} captures the pre-edit state`,()=>{
    const before={notes:[{id:'n',text:'old'}],markups:[{id:'m'}],appearances:[{id:'f'}]};
    const h=historyHarness(structuredClone(before));h.E.activeNoteId='n';h.E.topologySelection=[{kind:'face'}];
    const b={...h.bindings,root:{querySelector:()=>({value:'new'})},
      clearFacePaint:d=>{d.appearances=[];},clearMarkupsFromDef:d=>{d.markups=[];},
      updateNoteInDef:(d,id,patch)=>Object.assign(d.notes.find(n=>n.id===id),patch),
      deleteNoteFromDef:(d,id)=>{d.notes=d.notes.filter(n=>n.id!==id);}};
    evaluate(listener(source,object,'click',mutation),b)();
    const after=structuredClone(h.E.def);assert.notDeepEqual(after,before);assert.equal(h.pushes,1);assertUndoRedo(h,before,after);
  });
}

for(const target of ['card','delBtn']) {
  test(`batch 2 #2: ${target} note delete is undoable`,()=>{
    const before={notes:[{id:'n',text:'old'}]},h=historyHarness(structuredClone(before));
    evaluate(listener(source,target,'click','deleteNoteFromDef'),{...h.bindings,n:{id:'n'},note:{id:'n'},
      deleteNoteFromDef:(d,id)=>{d.notes=d.notes.filter(n=>n.id!==id);}})({target:{closest:()=>true},stopPropagation:noop});
    assert.equal(h.pushes,1);assertUndoRedo(h,before,{notes:[]});
  });
}

test('batch 2 #2: note offset drag records once before moving, and clicks do not edit',()=>{
  const before={notes:[{id:'n',offset:{x:40,y:-40}}]},h=historyHarness(structuredClone(before)),card=eventNode();
  const bind=load(source,'bindNoteCardEvents',{...h.bindings,deleteNoteFromDef:noop,openNoteEditor:noop});
  bind(card,h.E.def.notes[0]);const pointer={clientX:0,clientY:0,pointerId:1,target:{closest:()=>false},stopPropagation:noop};
  card.emit('pointerdown',pointer);card.emit('pointermove',{clientX:1,clientY:1});card.emit('pointerup',pointer);
  assert.equal(h.pushes,0);assert.deepEqual(h.E.def,before);
  card.emit('pointerdown',pointer);card.emit('pointermove',{clientX:10,clientY:20});card.emit('pointermove',{clientX:20,clientY:30});card.emit('pointerup',pointer);
  assert.equal(h.pushes,1);assertUndoRedo(h,before,{notes:[{id:'n',offset:{x:60,y:-10}}]});
});

test('batch 2 #2: note category chip creates an undo step',()=>{
  const before={notes:[{id:'n',category:'general',color:'blue'}]},h=historyHarness(structuredClone(before));
  evaluate(listener(source,'chip','click','updateNoteInDef'),{...h.bindings,note:h.E.def.notes[0],key:'review',cat:{color:'red'},
    updateNoteInDef:(d,id,patch)=>Object.assign(d.notes.find(n=>n.id===id),patch),openNoteEditor:noop})();
  assert.equal(h.pushes,1);assertUndoRedo(h,before,{notes:[{id:'n',category:'review',color:'red'}]});
});

for(const mode of ['face','body']) for(const drag of [false,true]) {
  test(`batch 2 #2: ${mode} paint ${drag?'drag':'click'} undoes the entire action`,()=>{
    const before={parts:[{id:'b1'},{id:'b2'}],appearances:[]},h=historyHarness(structuredClone(before));h.E.paintMode=mode;
    const window=eventNode(),canvas=eventNode(),view={grp:{},rr:{domElement:canvas}};
    const b={...h.bindings,window,resolveTopologyPick:ev=>({part:h.E.def.parts[ev.second?1:0],reference:{kind:'face',persistentId:ev.second?'f2':'f1'}}),
      requestAnimationFrame:()=>1,cancelAnimationFrame:noop,
      applyFacePaint:(d,r)=>d.appearances.push(r.persistentId),applyBodyPaint:p=>{p.color='red';}};
    const run=load(source,drag?'beginPaintDrag':'pickPaintAction',b);
    run({preventDefault:noop,pointerId:1},view);
    if(drag){window.emit('pointermove',{second:true});window.emit('pointermove',{second:true});window.emit('pointerup',{pointerId:1});}
    assert.equal(h.pushes,1);const after=structuredClone(h.E.def);assert.notDeepEqual(after,before);assertUndoRedo(h,before,after);
  });
}

for(const eraser of [false,true]) for(const active of [false,true]) {
  test(`batch 2 #2: ${eraser?'eraser':'pen'} ${active?'gesture':'empty gesture'} history`,()=>{
    const before={markups:[{points:[{x:0,y:0}]},{points:[{x:50,y:0}]}]},h=historyHarness(structuredClone(before));
    h.E.noteMode=eraser?'eraser':'markup';const window=eventNode();
    const b={...h.bindings,window,addMarkupToDef:(d,m)=>d.markups.push(m)};
    b.eraseMarkupAt=load(source,'eraseMarkupAt',b);
    load(source,'beginMarkupDrag',b)({clientX:active?0:100,clientY:0,preventDefault:noop},{rr:{domElement:{getBoundingClientRect:()=>({left:0,top:0})}}});
    if(active)window.emit('pointermove',{clientX:50,clientY:0});window.emit('pointerup');
    assert.equal(h.pushes,active?1:0);
    if(active){const after=structuredClone(h.E.def);assertUndoRedo(h,before,after);assert.equal(after.markups.length,eraser?0:3);}
    else assert.deepEqual(h.E.def,before);
  });
}

test('batch 2 #2: callout creation is undoable',()=>{
  const before={notes:[]},h=historyHarness(structuredClone(before));
  const hit={object:{isMesh:true,userData:{}},point:{x:1,y:2,z:3}};
  load(source,'pickNoteAction',{...h.bindings,retainingExactPreview:()=>false,pickScratch:()=>({setFromCamera:noop,intersectObjects:()=>[hit]}),
    pickPointer:{set:noop},openNoteEditor:noop,addNoteToDef:(d,n)=>{n.id='n';d.notes.push(n);return n;}})
    ({clientX:0,clientY:0},{grp:{children:[]},rr:{domElement:{getBoundingClientRect:()=>({left:0,top:0}),clientWidth:100,clientHeight:100}}});
  assert.equal(h.pushes,1);assertUndoRedo(h,before,structuredClone(h.E.def));
});

function shapeHarness(p,sketch) {
  const rows=[],host=eventNode(),h=historyHarness({parts:[],sketches:[sketch]});h.E.sel=p;
  const b={...h.bindings,root:{querySelector:()=>host},el:eventNode,fillCabinetParameters:noop,isCanonicalAuthoring:()=>false,
    isSketchObject:()=>true,ensureSketch:()=>sketch,solveSketch:()=>({status:'ok',degreesOfFreedom:0}),
    numLengthRow:(_host,label,get,set)=>rows.push({label,get,set}),numRow:(_host,label,get,set)=>rows.push({label,get,set}),
    sketchPoint,ellipseData,setSketchCenterCoordinate:(point,axis,value)=>{point[axis]=value;}};
  return {h,b,host,rows};
}
for(const type of ['line','circle','arc','ellipse','spline','point']) {
  test(`batch 2 #3: ${type} name fallback uses the sketch type`,()=>{
    const p={id:'e',type},h=historyHarness({});
    const nameInp={value:''};evaluate(listener(source,'nameInp','change'),{...h.bindings,p,nameInp,root:{querySelector:()=>null}})();
    assert.equal(p.name,type);
    const n=findNode(source,n=>n.type==='AssignmentExpression'&&n.left?.object?.name==='nameInp'&&n.left?.property?.name==='value');
    assert.equal(evaluate(source.slice(n.right.start,n.right.end),{p:{type}}),type);
  });
}
for(const p of [{id:'e',type:'point',p:'p0'},{id:'e',type:'spline',degree:3,a:'p0',h1:'p1',h2:'p2',b:'p3'}]) {
  test(`batch 2 #3: ${p.type} inspector edits point coordinates without solid depth fields`,()=>{
    const sketch={points:Array.from({length:4},(_,i)=>({id:'p'+i,x:i,y:i*2})),entities:[p]};
    const {b,rows}=shapeHarness(p,sketch);load(source,'fillShape',b)();
    assert.equal(rows.length,p.type==='point'?2:8);assert.ok(rows.every(row=>Number.isFinite(row.get())));
    rows[0].set(12);assert.equal(sketch.points[0].x,12);assert.equal(p.from,undefined);assert.equal(p.to,undefined);
  });
}

const mirrorForInspector = load(geometry,'mirrorProjectionPart',{
  isKernelBody:load(read('core/kernel_body.js'),'isKernelBody',{KERNEL_BODY_KIND:'kernel'}),holeLoop,
  mirrorExtrusionSpan:load(geometry,'mirrorExtrusionSpan'),cloneData:structuredClone,
  basePartBounds:load(geometry,'basePartBounds',{isKernelBody:()=>false}),
  reflectProjectionMesh:load(geometry,'reflectProjectionMesh',{clearMeshProjectionCache:noop,clearTopologyCache:noop}),
});
for(const kind of ['axial','framed','mesh','kernel']) {
  test(`batch 2 #4: mirror button handles ${kind} geometry and undo`,()=>{
    const node=findNode(source,n=>n.type==='CallExpression'&&n.callee?.name==='btn'&&source.slice(n.arguments[0]?.start,n.arguments[0]?.end).includes('t("mirrorX")'));
    const handler=source.slice(node.arguments[1].start,node.arguments[1].end);
    let p={id:'seed',kind:'ext',axis:'x',from:2,to:12,pts:structuredClone(profile),holes:[{pts:structuredClone(bore),from:4,to:7}]};
    if(kind==='framed')Object.assign(p,{axis:'frame',frame:structuredClone(frame)});
    if(kind==='mesh')p={id:'seed',kind:'mesh',bounds:{x0:1,x1:3,y0:0,y1:2,z0:0,z1:0},meshData:{positions:[1,0,0,3,0,0,1,2,0],normals:[0,0,1,0,0,1,0,0,1]}};
    if(kind==='kernel')p={id:'seed',kind:'kernel',kernel:{type:'sweep'}};
    const before={parts:[structuredClone(p)]},h=historyHarness(structuredClone(before));
    evaluate(handler,{...h.bindings,p,cloneData:structuredClone,resetClonedPartIdentity:q=>({...q,id:'copy'}),
      mirrorProjectionPart:mirrorForInspector,addPart:q=>h.E.def.parts.push(q)})();
    assert.deepEqual(p,before.parts[0]);assert.equal(h.pushes,kind==='kernel'?0:1);
    if(kind==='kernel'){assert.deepEqual(h.E.def,before);return;}
    const copy=h.E.def.parts[1];
    if(kind==='mesh'){
      assert.deepEqual(copy.meshData.positions,[-1,0,0,-1,2,0,-3,0,0]);
      assert.deepEqual([copy.bounds.x0,copy.bounds.x1],[-3,-1]);assert.equal(copy.from,undefined);assert.equal(copy.to,undefined);
    } else {
      assert.deepEqual([copy.from,copy.to],[-12,-2]);assert.deepEqual([copy.holes[0].from,copy.holes[0].to],[-7,-4]);
      if(kind==='framed')assert.equal(copy.frame.origin.x,-frame.origin.x);
    }
    assertUndoRedo(h,before,structuredClone(h.E.def));
  });
}

test('batch 2 #5: construction edit captures history, solves and refreshes',()=>{
  const before={entities:[{id:'e',type:'line',construction:false}]},h=historyHarness(structuredClone(before));let solves=0,refreshes=0;
  evaluate(listener(source,'check','change','p.construction'),{...h.bindings,p:h.E.def.entities[0],check:{checked:true},
    resolveSketch:()=>solves++,refreshAll:()=>refreshes++})();
  assert.equal(solves,1);assert.equal(refreshes,1);assertUndoRedo(h,before,{entities:[{id:'e',type:'line',construction:true}]});
});
for(const key of ['metal','rough','opacity']) {
  test(`batch 2 #5: ${key} slider coalesces one undo per gesture`,()=>{
    const node=findNode(source,n=>n.type==='CallExpression'&&n.callee?.property?.name==='forEach'&&source.slice(n.start,n.end).startsWith('[["metal"'));
    const before={parts:[{id:'b',[key]:.2}]},h=historyHarness(structuredClone(before)),host=eventNode();
    evaluate(source.slice(node.arguments[0].start,node.arguments[0].end),{...h.bindings,el:eventNode,host,p:h.E.def.parts[0],fin:Number.isFinite})([key,key]);
    const slider=host.children[0].children.find(n=>n.type==='range');
    slider.value=.4;slider.emit('input');slider.value=.6;slider.emit('input');slider.emit('change');
    assert.equal(h.pushes,1);const first=structuredClone(h.E.def);
    slider.value=.9;slider.emit('input');slider.emit('change');assert.equal(h.pushes,2);
    const second=structuredClone(h.E.def);h.H.undo();assert.deepEqual(h.E.def,first);h.H.undo();assert.deepEqual(h.E.def,before);
    h.H.redo();h.H.redo();assert.deepEqual(h.E.def,second);
  });
}

test('batch 2 #6: ellipse radius rows retarget each driving axis and preserve reference dimensions',()=>{
  const p={id:'e',type:'ellipse',c:'c',rx:10,ry:4},sketch={points:[{id:'c',x:0,y:0,fixed:true}],entities:[p],constraints:[
    {id:'reference',type:'radius',entity:'e',value:99,driven:true},
    {id:'major',type:'radius',entity:'e',value:10},{id:'minor',type:'radius',entity:'e',axis:'minor',value:4}]};
  const {b,rows}=shapeHarness(p,sketch);
  b.setEntityDimension=load(source,'setEntityDimension',{E:b.E,ensureSketch:()=>sketch,uid:()=> 'new',
    resolveSketch:()=>{solveSketch(sketch);return false;}});
  load(source,'fillShape',b)();rows.find(r=>r.label==='dyn_major').set(15);rows.find(r=>r.label==='dyn_minor').set(6);
  assert.ok(Math.abs(p.rx-15)<1e-5);assert.ok(Math.abs(p.ry-6)<1e-5);
  assert.deepEqual(sketch.constraints.slice(1).map(c=>c.value),[15,6]);assert.equal(sketch.constraints[0].value,99);
  sketch.constraints=sketch.constraints.slice(0,2);rows.find(r=>r.label==='dyn_minor').set(7);
  assert.equal(sketch.constraints.at(-1).axis,'minor');assert.equal(sketch.constraints.at(-1).value,7);
});

test('batch 2 #7: catalog shortcuts agree with active keyboard bindings and have no duplicates',()=>{
  const catalog=buildCommandCatalog({t:k=>k,editor:{docType:'part'},activeParts:()=>[],closedSketchProfile:()=>false});
  for(const id of ['directsph','paint','note'])assert.equal(catalog.find(c=>c.id===id).shortcut,undefined);
  assert.equal(catalog.find(c=>c.id==='directpoly').shortcut,'P');assert.equal(KEY_TOOL.p,'poly');
  assert.equal(catalog.find(c=>c.id==='spoly').shortcut,'N');assert.equal(KEY_TOOL.n,'spoly');
  const keys=catalog.map(c=>c.shortcut).filter(Boolean);assert.equal(new Set(keys).size,keys.length);
});

test('batch 2 #8: subassembly names survive empty tree and inspector renames',()=>{
  const component={id:'c',assemblyKey:'fixture'},h=historyHarness({});
  const rename=findNode(source,n=>n.type==='Property'&&n.key?.name==='onRename'&&source.slice(n.start,n.end).includes('assemblyComponentForNode'));
  evaluate(source.slice(rename.value.start,rename.value.end),{...h.bindings,assemblyComponentForNode:()=>component})({kind:'component'},'');
  assert.equal(component.name,'fixture');
  delete component.name;
  const scan=load(source,'scanDoc',{t:k=>k,conLabel:()=>''});assert.equal(scan(JSON.stringify({a:{components:[component]}}))[0].label,'fixture');
  assert.equal(load(source,'componentLabel',{E:{assembly:{components:[component]}},ASSEMBLY_ORIGIN_ID:'origin',assemblyComponentById:()=>component,t:k=>k})('c'),'fixture');
  const name={value:''};load(source,'commitComponentName',{component,name,committedName:'previous',...h.bindings,invalidateDrawing:noop,syncDirty:noop})();
  assert.equal(component.name,'fixture');
  const assignment=findNode(source,n=>n.type==='VariableDeclarator'&&n.id?.name==='nextName'&&source.slice(n.start,n.end).includes('name.value.slice(0,80)'));
  assert.equal(evaluate(source.slice(assignment.init.start,assignment.init.end),{name,component:{assemblyKey:'fixture'},t:k=>k}),'fixture');
});

for(const canonical of [false,true]) {
  test(`batch 2 #9: ${canonical?'canonical':'legacy'} rollback releases with one undo and refresh`,()=>{
    const before=canonical?{rollbackIndex:2}:{rollback:2},h=historyHarness(structuredClone(before));let refreshes=0;
    const b={...h.bindings,el:eventNode,refreshAll:()=>refreshes++,setHistoryRollback:(d,i)=>{d.rollbackIndex=i;}};
    b.rollbackBar=load(source,'rollbackBar',b);
    const bar=canonical?load(source,'parametricRollbackBar',b)():b.rollbackBar();
    bar.emit('dblclick');assert.equal(h.pushes,1);assert.equal(refreshes,1);
    assertUndoRedo(h,before,canonical?{rollbackIndex:null}:{rollback:null});
  });
}

test('batch 2 #10: spline handles and legacy pts affect history signatures',()=>{
  const scan=load(source,'scanDoc',{t:k=>k,conLabel:()=>''});
  for(const entity of [{id:'s',type:'spline',degree:3,a:'a',h1:'h1',h2:'h2',b:'b'},{id:'s',type:'spline',pts:['a','h1','h2','b']}]) {
    const doc={d:{sketches:[{id:'sk',entities:[entity],points:['a','h1','h2','b'].map(id=>({id,x:0,y:0}))}]}};
    const signature=()=>scan(JSON.stringify(doc)).find(e=>e.id==='ent:s').sig;
    const first=signature();doc.d.sketches[0].points[1].x=10;assert.notEqual(signature(),first);
  }
});

test('batch 2 #10: History chips select two-entity constraints, components and features',()=>{
  const a={id:'a',type:'line'},b={id:'b',type:'line'},component={id:'c'},part={id:'body',featureId:'f'};
  const E={def:{parts:[part],features:[{id:'f'}],sketches:[{id:'s',entities:[a,b],constraints:[]}]},assembly:{components:[component]},authoring:{}};
  let refreshes=0;const pick=load(source,'docPick',{E,histPanel:null,refreshAll:()=>refreshes++,partsForFeature:()=>[part]});
  for(const type of ['distance','parallel','perpendicular','equal','tangent','concentric','collinear','symmetric','angle']) {
    E.def.sketches[0].constraints=[{id:'con',type,a:'a',b:'b'}];E.sel=null;pick('con:con');
    assert.equal(E.sel,a);assert.equal(E.def.activeSketch,'s');assert.deepEqual(E.ssel,[a,b]);
  }
  E.def.sketches[0].constraints=[{id:'con',entity:'b'}];pick('con:con');assert.equal(E.sel,b);
  pick('comp:c');assert.equal(E.sel,component);assert.deepEqual(E.componentSel,[component]);
  pick('feat:f');assert.deepEqual(E.authoring.featureSelection,['f']);assert.equal(E.sel,part);assert.deepEqual(E.ssel,[]);
  const count=refreshes;pick('feat:missing');assert.equal(refreshes,count);
});


// Batch #3: reported bugs #1-20. Run production functions/handlers; substitute
// only their host/UI boundaries so failures, commits and undo are observable.
import {inferSmartMate} from '../js/modeler_smartmates.js';
import {applyHandleDrag} from '../js/modeler_instant3d.js';
import {bomTableRows} from '../js/modeler_commands.js';
import {assemblyDrawingBOM, occurrenceBOMKey} from '../js/core/assembly_drawing_bom.js';
import {removeHistoryNode} from '../js/core/parametric_document.js';
import {cylinderBounds} from '../js/core/cylinder_axis.js';
import {setDocumentProperty} from '../js/core/custom_properties.js';
import {validateDrawingPrimitive} from '../js/core/drawing_primitives.js';
import {canCropView, cropSplinePoints} from '../js/core/drawing_crop.js';
import {canBreakOutView, projectBrokenOutView} from '../js/core/drawing_broken_out.js';

const featureFormSource=sourceFunctionText(source,'openParametricFeature');
const domeApplyNode=findNode(featureFormSource,n=>n.type==='CallExpression'
  && n.callee?.name==='btn' && featureFormSource.slice(n.start,n.end).includes('quickDomePart(params)'));
const domeApplyText=featureFormSource.slice(domeApplyNode.arguments[1].start,domeApplyNode.arguments[1].end);
for(const outcome of ['success','failure','reject']) {
  test(`batch 3 #1: dome ${outcome} waits for completion before updating the form`,async()=>{
    let resolve,reject,closed=0,previews=0;const messages=[];
    const pending=new Promise((yes,no)=>{resolve=yes;reject=no;});
    const E={authoring:{featureType:'dome'}},state={params:{height:5},references:{}};
    const run=evaluate(domeApplyText,{E,state,type:'dome',host:{},shellEditor:null,controls:[],liveBadge:{},coreRunFresh:false,
      FINISH_FEATURES:['dome'],validateFeatureInputs:()=>true,featureSelectionReady:()=>true,isCanonicalAuthoring:()=>false,
      readFeatureParameterForm:()=>({params:state.params,references:{}}),clearFeaturePreview:noop,quickDomePart:()=>pending,
      cloneData:structuredClone,rememberFinishAmount:noop,closeFeaturePanel:()=>closed++,setMode:noop,setTab:noop,
      syncAuthoringWorkflow:noop,syncNewFeaturePreview:()=>previews++,refreshAll:noop,flash:s=>messages.push(s)});
    const done=run();await Promise.resolve();
    assert.equal(closed,0);assert.equal(previews,0);assert.equal(E.lastOperation,undefined);
    if(outcome==='reject')reject(new Error('Dome failed'));else resolve(outcome==='success');
    await done;
    assert.equal(closed,outcome==='success'?1:0);assert.equal(previews,outcome==='failure'?1:0);
    assert.equal(E.authoring.featureType,outcome==='success'?null:'dome');
    if(outcome==='reject')assert.deepEqual(messages,['Dome failed']);
    if(outcome==='success')assert.deepEqual(E.lastOperation,{type:'dome',params:{}});
  });
}

test('batch 3 #2: inspector shell awaits and forwards success/failure, rejecting invalid thickness',async()=>{
  const text=sourceFunctionText(source,'fillOps');
  const node=findNode(text,n=>n.type==='Property' && n.key?.name==='onApply' && text.slice(n.start,n.end).includes('quickShellPart(thickness)'));
  let resolve,calls=0;
  const run=evaluate(text.slice(node.value.start,node.value.end),{fin:Number.isFinite,quickShellPart:()=>{calls++;return new Promise(done=>{resolve=done;});}});
  for(const thickness of ['',0,-1,'bad',NaN,Infinity])assert.equal(await run({thickness}),false);
  assert.equal(calls,0);
  for(const outcome of [false,true]) {
    let settled=false;const done=run({thickness:'2'}).then(value=>{settled=true;return value;});
    await Promise.resolve();assert.equal(settled,false);resolve(outcome);assert.equal(await done,outcome);
  }
  const reject=evaluate(text.slice(node.value.start,node.value.end),{fin:Number.isFinite,quickShellPart:async()=>{throw new Error('Shell failed');}});
  await assert.rejects(reject({thickness:2}),/Shell failed/);
});

test('batch 3 #3: switching either document type enters 3D and frames the preview once',()=>{
  for(const type of ['part','assembly']) {
    const E={docType:type==='part'?'assembly':'part',assembly:{}};let frames=0;
    const run=load(source,'setDocumentType',{E,abandonDocumentExactWork:noop,closeEvalCard:noop,invalidateInterference:noop,
      root:{classList:{toggle:noop},querySelectorAll:()=>[]},syncInspectorTabLabels:noop,activeTab:()=> 'parts',
      setMode:mode=>{E.mode=mode;},setCommandTab:noop,setTab:noop,syncHead:noop,refreshLib:noop,refreshAll:noop,
      fitPreview:()=>{assert.equal(E.mode,'3d');frames++;},fitSketch:()=>assert.fail('hidden sketch must not be fitted')});
    run(type);assert.equal(E.docType,type);assert.equal(frames,1);run(type);assert.equal(frames,1);
  }
});

test('batch 3 #4: fingerprint tolerates absent selections and invalidates memoized profiles for every point representation',()=>{
  const fingerprint=load(source,'sketchFingerprint');
  const sketch={points:[{id:'a',x:0,y:0},{id:'b',x:10,y:0}],entities:[]};
  assert.equal(fingerprint(sketch),fingerprint(sketch,[]));assert.equal(fingerprint(sketch,null),fingerprint(sketch,[]));
  assert.notEqual(fingerprint(sketch,['a']),fingerprint(sketch,['b']));
  const cases=[
    [{type:'point',p:'a'},e=>{e.p='b';}], [{type:'point',p:{x:1,y:2}},e=>{e.p.x=3;}],
    [{type:'circle',center:'a'},e=>{e.center='b';}], [{type:'circle',center:{x:1,y:2}},e=>{e.center.y=4;}],
    [{type:'arc',c:{x:1,y:2}},e=>{e.c.x=5;}], [{type:'circle',radius:2},e=>{e.radius=3;}],
    [{type:'spline',pts:['a','b']},e=>{e.pts[1]='a';}], [{type:'spline',pts:[{x:1,y:2}]},e=>{e.pts[0].x=4;}],
    [{type:'spline',h1:'a'},e=>{e.h1='b';}], [{type:'spline',h2:'a'},e=>{e.h2='b';}],
    [{type:'spline',h1:{x:1,y:2}},e=>{e.h1.y=4;}], [{type:'spline',h2:{x:1,y:2}},e=>{e.h2.x=4;}],
  ];
  cases.push([{type:'circle',center:{x:1,y:23}},e=>{e.center={x:12,y:3};}]);
  cases.push([{type:'spline',pts:['a','bc']},e=>{e.pts=['ab','c'];}]);
  for(const [entity,mutate] of cases) {
    sketch.entities=[entity];let analyses=0;
    const run=load(source,'sketchProfileAnalysis',{E:{def:{}},ensureSketch:()=>sketch,selEntities:()=>[],
      sketchFingerprint:fingerprint,profileMemo:{sketch:null,key:0,value:null},analyzeSketchProfiles:()=>({revision:++analyses})});
    const first=run(),key=fingerprint(sketch);assert.equal(run(),first);assert.equal(analyses,1);
    mutate(entity);assert.notEqual(fingerprint(sketch),key,JSON.stringify(entity));
    assert.notEqual(run(),first);assert.equal(analyses,2);assert.equal(run().revision,2);
  }
});

test('batch 3 #5: SmartMates distinguish tangent, planar, cylindrical and unsupported face pairs',()=>{
  const ref=(componentId,surface,extra={})=>({componentId,kind:'face',descriptor:{surface,...extra}});
  for(const [a,b] of [['cylinder','plane'],['plane','cylinder']])assert.equal(inferSmartMate(ref('a',a),ref('b',b)).type,'tangent');
  assert.equal(inferSmartMate(ref('a','plane'),ref('b','plane')).type,'coincident');
  assert.equal(inferSmartMate(ref('a','cylinder'),ref('b','cylinder')).type,'concentric');
  assert.equal(inferSmartMate({...ref('a','cylinder'),threadGeometry:{pitch:2}},ref('b','cylinder')).pitch,2);
  for(const [a,b] of [['sphere','sphere'],['sphere','plane'],['plane','sphere'],['cone','cylinder'],['','']]) {
    assert.equal(inferSmartMate(ref('a',a),ref('b',b)),null);
  }
  const circle={curve:'circle',axis:{x:0,y:1,z:0}};
  assert.equal(inferSmartMate(ref('a','',circle),ref('b','plane')).type,'coincident');
  assert.equal(inferSmartMate(ref('same','plane'),ref('same','plane')),null);
});

test('batch 3 #6: drawing shortcuts ignore input, textarea and inherited contentEditable targets',()=>{
  const run=load(drawingSource,'keyDown');
  for(const target of [{tagName:'INPUT'},{tagName:'textarea'},{tagName:'SPAN',isContentEditable:true}]) {
    for(const key of ['d','f','b','c','v','n','s','h','Delete','Backspace','Enter','Escape'])assert.equal(run({key,target}),false);
  }
  let fits=0,refreshes=0;
  const canvasKey=load(drawingSource,'keyDown',{state:{},fit:()=>fits++,host:{refresh:()=>refreshes++}});
  assert.equal(canvasKey({key:'f',target:{tagName:'CANVAS'}}),true);assert.equal(fits,1);assert.equal(refreshes,1);
});

function sectionHarness(depth=10) {
  const before={views:[{id:'v',dir:'front'}]},h=historyHarness(structuredClone(before)),messages=[];
  const state={draft:{kind:'brokenout',viewId:'v',points:structuredClone(profile)}};
  const host={doc:()=>h.E.def,refresh:noop,markDirty:noop,flash:s=>messages.push(s),bodiesToken:()=>1,bodies:()=>[],
    promptFields:async()=>({depth}),pushUndo:label=>{h.bindings.pushUndo(label);h.E.def=structuredClone(h.E.def);}};
  const b={host,state,canBreakOutView,canCropView,cropSplinePoints,projectBrokenOutView:noop,invalidate:noop};
  return {before,h,state,host,b,messages};
}

test('batch 3 #7: broken-out rejects non-finite/negative depths without changing the drawing or undo',async()=>{
  for(const depth of ['bad',NaN,Infinity,-Infinity,-1,'-0.1']) {
    const f=sectionHarness(depth);let projections=0;f.b.projectBrokenOutView=()=>projections++;
    await load(drawingSource,'commitBrokenOut',f.b)(f.state.draft);
    assert.deepEqual(f.h.E.def,f.before);assert.equal(f.h.pushes,0);assert.equal(projections,0);
    assert.ok(f.messages.includes('Invalid broken-out depth'));
  }
});
for(const depth of [10,'25']) {
  test(`batch 3 #7: broken-out accepts depth ${depth}, commits to normalized records and undoes/redoes`,async()=>{
    const f=sectionHarness(depth),stale=f.h.E.def;let projected;
    f.b.projectBrokenOutView=(_b,v)=>{projected=v.brokenOut.depth;};
    await load(drawingSource,'commitBrokenOut',f.b)(f.state.draft);
    assert.equal(f.h.pushes,1);assert.equal(projected,Number(depth)/10);
    assert.equal(f.h.E.def.views[0].brokenOut.depth,Number(depth)/10);assert.deepEqual(stale,f.before);
    assertUndoRedo(f.h,f.before,structuredClone(f.h.E.def));
  });
}

test('batch 3 #7: zero depth still obeys the real projection validator without committing undo',async()=>{
  const f=sectionHarness(0);
  f.host.bodies=()=>[{positions:tessellatePart({kind:'box',x0:0,x1:10,y0:0,y1:10,z0:0,z1:10}).positions}];
  f.b.projectBrokenOutView=projectBrokenOutView;
  await load(drawingSource,'commitBrokenOut',f.b)(f.state.draft);
  assert.equal(f.h.pushes,0);assert.deepEqual(f.h.E.def,f.before);
  assert.match(f.messages[0],/depth must be positive/);
});

test('batch 3 #7: broken-out verifies the parent before undo and rejects changes during the prompt',async()=>{
  for(const stage of ['prompt','projection']) {
    const f=sectionHarness();
    if(stage==='prompt')f.host.promptFields=async()=>{f.h.E.def.views=[];return {depth:10};};
    else f.b.projectBrokenOutView=()=>{f.h.E.def.views=[];};
    await load(drawingSource,'commitBrokenOut',f.b)(f.state.draft);
    assert.equal(f.h.pushes,0);assert.equal(f.messages.length,1);assert.equal(f.h.E.def.views.length,0);
  }
});

test('batch 3 #8: crop verifies live view before undo and writes to normalized records on success',()=>{
  for(const missing of [true,false]) {
    const f=sectionHarness();f.state.draft.kind='crop';const stale=f.h.E.def;
    f.b.cropSplinePoints=sketch=>{const result=cropSplinePoints(sketch);if(missing)f.h.E.def.views=[];return result;};
    assert.equal(load(drawingSource,'keyDown',f.b)({key:'Enter'}),true);
    assert.equal(f.h.pushes,missing?0:1);
    if(missing)assert.deepEqual(f.messages,['Crop parent is no longer available']);
    else {assert.deepEqual(stale,f.before);assert.deepEqual(f.h.E.def.views[0].cropSketch.points,profile);assertUndoRedo(f.h,f.before,structuredClone(f.h.E.def));}
  }
});

function keyboardHarness(def,canonical=true) {
  const h=historyHarness(structuredClone(def));
  Object.assign(h.E,{open:true,docType:'part',mode:'3d',sel:h.E.def.parts?.[0]});
  const b={...h.bindings,document:{activeElement:null},root:{querySelector:()=>null},modelerDecisionOpen:()=>false,
    handleSelectionFilterChord:()=>false,dynKey:()=>false,KEY_VIEW:{},KEY_TOOL:{},isSketchObject:()=>false,isCanonicalAuthoring:()=>canonical,
    cutTargetFeatureId:p=>p.derivedFeatureId,verifiedExactTopology:()=>null,compileKernelFeatureTree:()=>({features:[]}),
    H:h.H,removeHistoryNode,syncSketchAfterRemoval:noop,markLiveDirtyPart:noop,partNeedsExactMesh:()=>false};
  b.removeTreeNode=load(source,'removeTreeNode',b);
  return {h,b,run:load(source,'onKey',b)};
}
for(const backing of ['featureId','derivedFeatureId']) {
  test(`batch 3 #9: Delete removes ${backing} from canonical history and parts, undo/redo restores both`,()=>{
    const before={parts:[{id:'body',kind:'box',[backing]:'f'}],features:[{id:'f',type:'extrude'}],
      history:[{id:'custom-history-id',kind:'feature',targetId:'f',name:'Boss'}]};
    const {h,run}=keyboardHarness(before);let prevented=0;
    run({key:'Delete',preventDefault:()=>prevented++});
    assert.equal(prevented,1);assert.equal(h.pushes,1);assert.equal(h.E.sel,null);
    assert.deepEqual(h.E.def.features,[]);assert.deepEqual(h.E.def.history,[]);assert.deepEqual(h.E.def.parts,[]);
    assertUndoRedo(h,before,structuredClone(h.E.def));
  });
}

test('batch 3 #9: canonical Delete respects feature dependants and legacy Delete still removes the part',()=>{
  const before={parts:[{id:'body',kind:'box',featureId:'f'}],features:[{id:'f',type:'extrude'},
    {id:'child',type:'hole',inputs:['f']}],history:[{id:'history:feature:f',kind:'feature',targetId:'f',name:'Boss'}]};
  const canonical=keyboardHarness(before);canonical.run({key:'Backspace',preventDefault:noop});
  assert.deepEqual(canonical.h.E.def,before);assert.equal(canonical.h.H.undo(),false);
  const legacy=keyboardHarness({parts:[{id:'body',kind:'box'}]},false);legacy.run({key:'Delete',preventDefault:noop});
  assert.equal(legacy.h.E.def.parts.length,0);assert.equal(legacy.h.pushes,1);
});

test('batch 3 #10: drawingDocument returns null without an owner and creates drawings for loaded owners',()=>{
  for(const def of [null,undefined])assert.equal(load(source,'drawingDocument',{E:{docType:'part',def}})(),null);
  assert.equal(load(source,'drawingDocument',{E:{docType:'assembly'}})(),null);
  for(const docType of ['part','assembly']) {
    const owner={},E={docType,def:owner,assembly:owner};let creations=0;
    const ensure=o=>{creations++;return o.drawing ||= {};};
    const doc=load(source,'drawingDocument',{E,ensureSheetDoc:ensure,ensureAssemblyDrawingDoc:ensure})();
    assert.equal(doc,owner.drawing);assert.equal(doc.assemblyLayout,docType==='assembly');assert.equal(creations,1);
  }
});

test('batch 3 #11: primitives initialize on the live legacy drawing, support edit and undo/redo',async()=>{
  const before={views:[]},h=historyHarness(structuredClone(before)),state={},stale=h.E.def;
  const host={doc:()=>h.E.def,pushUndo:label=>{h.bindings.pushUndo(label);h.E.def=structuredClone(h.E.def);},
    flash:s=>assert.fail(s),markDirty:noop,promptFields:async()=>({x0:2,y0:3,x1:12,y1:13,style:'hidden'})};
  const b={host,state,invalidate:noop,validateDrawingPrimitive,sheetPaper:()=>({w:200,h:200})};
  await load(drawingSource,'editPrimitive',b)('missing');assert.equal(h.pushes,0);
  assert.equal(load(drawingSource,'commitPrimitive',b)({type:'line',points:[{x:1,y:1},{x:10,y:10}]}),true);
  assert.deepEqual(stale,before);assert.equal(h.pushes,1);
  const after=structuredClone(h.E.def);assert.equal(after.primitives.length,1);assertUndoRedo(h,before,after);
  await load(drawingSource,'editPrimitive',b)(after.primitives[0].id);
  assert.equal(h.pushes,2);assert.deepEqual(h.E.def.primitives[0].points,[{x:2,y:3},{x:12,y:13}]);
  assert.equal(h.E.def.primitives[0].style,'hidden');h.H.undo();assert.deepEqual(h.E.def,after);
});

test('batch 3 #12: unclaimed entities tolerate missing documents and ignore nullish claims from all sources',()=>{
  const sketch={entities:[{id:'a'},{id:'b'},{construction:true,id:'construction'}]};
  for(const def of [null,undefined])assert.deepEqual(load(source,'unclaimedSketchEntityIds',{E:{def}})(sketch),[]);
  for(const def of [
    {features:[{params:{profileEntityIds:['a',undefined,null]}}]},
    {features:[{references:{profileEntityIds:['a',undefined,null]}}]},
    {features:[{params:{holeProfileEntityIds:[['a',undefined,null]]}}]},
    {features:[{params:{regionProfileEntityIds:[['a',undefined,null]]}}]},
    {parts:[{profileEntityIds:['a',undefined,null]}]},
    {parts:[{holeProfileEntityIds:[['a',undefined,null]]}]},
  ]) {
    const run=load(source,'unclaimedSketchEntityIds',{E:{def}});
    assert.deepEqual(run(sketch),['b']);
    assert.deepEqual(run({entities:[{id:'a'},{id:'b'},{id:undefined},{id:null}]}),['b',undefined,null]);
  }
});

test('batch 3 #13: BOM table resolves assemblyKey metadata and preserves row and modelKey precedence',()=>{
  const components=[null,{assemblyKey:'fixture',name:'Fixture',customProperties:{Description:'Nested assembly'},material:'Steel'},
    {modelKey:'part',assemblyKey:'ignored',name:'Part',def:{customProperties:{Description:'Part description'},material:'Wood'}}];
  const rows=bomTableRows([{key:'fixture',name:'Fixture',quantity:2},{key:'part',name:'Part',quantity:1},
    {key:'fixture',description:'Row override',material:'Aluminium'}],components);
  assert.deepEqual(rows.map(r=>[r.description,r.material]),[['Nested assembly','Steel'],['Part description','Wood'],['Row override','Aluminium']]);
});

test('batch 3 #14: BOM defensively skips empty singleton results in flat and indented modes',()=>{
  // Normal visibility filtering already excludes suppressed components. Exercise
  // an empty provider result explicitly, without pretending that path is common.
  const good={id:'good'},skip={id:'skip'},assembly={components:[skip,good]};
  const generate=components=>components.filter(c=>c!==skip).map(c=>({key:c.id,name:c.id,quantity:1}));
  const run=load(read('core/assembly_drawing_bom.js'),'assemblyDrawingBOM',{
    generateOccurrenceBOM:generate,flattenAssembly:a=>a.components.map(c=>({component:c,path:[c.id],parents:[]})),
    isSubassembly:()=>false,occurrenceBOMKey});
  for(const scope of ['partsOnly','indented']) {
    const result=run(assembly,scope);assert.equal(result.rows.length,1);assert.equal(result.rows[0].key,'good');
    assert.equal(result.itemByPath.size,1);assert.ok(result.itemByPath.has(occurrenceBOMKey(['good'])));
    const filtered=assemblyDrawingBOM({components:[{id:'s',suppressed:true},{id:'h',visible:false}]},scope);
    assert.equal(filtered.rows.length,0);assert.equal(filtered.itemByPath.size,0);
  }
});

test('batch 3 #15: deleting all custom property rows removes the property container and supports undo/redo',()=>{
  const text=sourceFunctionText(source,'openCustomProperties');
  const node=findNode(text,n=>n.type==='AssignmentExpression' && n.left?.object?.name==='save' && n.left?.property?.name==='onclick');
  for(const entries of [[],[['Description','  new  ']]]) {
    const before={customProperties:{Description:'old'}},h=historyHarness(structuredClone(before));let closed=0;
    evaluate(text.slice(node.right.start,node.right.end),{doc:h.E.def,rows:{children:entries.map(pair=>({querySelectorAll:()=>pair.map(value=>({value}))}))},
      ...h.bindings,setDocumentProperty,syncHead:noop,dialog:{close:()=>closed++}})();
    assert.equal(closed,1);assert.equal(h.pushes,1);
    assert.deepEqual(h.E.def,entries.length?{customProperties:{Description:'new'}}:{});
    assertUndoRedo(h,before,structuredClone(h.E.def));
  }
});

test('batch 3 #16: cylinder bounds have one authoritative branch and support tilted axes/negative heights',()=>{
  const text=sourceFunctionText(geometry,'basePartBounds');
  const ast=parse(text,{ecmaVersion:'latest'});
  const branches=ast.body[0].body.body.filter(n=>n.type==='IfStatement' && n.test?.right?.value==='cyl');
  assert.equal(branches.length,1,'no unreachable second cylinder branch');
  const bounds=load(geometry,'basePartBounds',{isKernelBody:()=>false,cylinderBounds});
  for(const axis of ['x','y','z',{x:1,y:1,z:1}]) {
    const part={kind:'cyl',x:2,y:3,z:4,r:2,r2:3,h:-5,axis};
    assert.deepEqual(bounds(part),cylinderBounds(part));
  }
});

test('batch 3 #17: 2/3/7 mode shortcuts are defined once and retain field/modifier/dynamic-entry guards',()=>{
  const text=sourceFunctionText(source,'onKey'),ast=parse(text,{ecmaVersion:'latest'}),counts={2:0,3:0,7:0};
  function visit(node) {
    if(!node || typeof node!=='object')return;
    if(node.type==='BinaryExpression' && node.operator==='===' && node.left?.object?.name==='e'
      && node.left?.property?.name==='key' && Object.hasOwn(counts,node.right?.value))counts[node.right.value]++;
    for(const value of Object.values(node)){if(Array.isArray(value))value.forEach(visit);else if(value&&typeof value==='object')visit(value);}
  }
  visit(ast);assert.deepEqual(counts,{2:1,3:1,7:1});
  for(const [key,mode] of [['2','2d'],['3','3d'],['7','drawing']]) {
    const f=keyboardHarness({parts:[]},false),modes=[];f.b.setMode=m=>modes.push(m);
    const run=load(source,'onKey',f.b);run({key});assert.deepEqual(modes,[mode]);
    run({key,ctrlKey:true});run({key,metaKey:true});run({key,altKey:true});
    f.b.document.activeElement={tagName:'INPUT'};run({key});assert.deepEqual(modes,[mode]);
    f.b.document.activeElement=null;
    load(source,'onKey',{...f.b,dynKey:()=>true})({key});assert.deepEqual(modes,[mode]);
  }
});

test('batch 3 #18: moving incomplete lofts tolerates each missing profile and moves remaining coordinates on every axis',()=>{
  const move=load(geometry,'movePart',{isKernelBody:()=>false});
  for(const axis of ['x','y','z'])for(const missing of [null,undefined])for(const field of ['pts0','pts1']) {
    const other=field==='pts0'?'pts1':'pts0';
    const part={kind:'loft',axis,from:1,to:4,[field]:missing,[other]:[{u:2,v:3}]};
    move(part,10,20,30);
    const [du,dv,dw]=axis==='x'?[30,20,10]:axis==='y'?[10,30,20]:[10,20,30];
    assert.equal(part[field],missing);assert.deepEqual(part[other],[{u:2+du,v:3+dv}]);
    assert.deepEqual([part.from,part.to],[1+dw,4+dw]);
  }
  assert.doesNotThrow(()=>move({kind:'loft',from:0,to:1},1,2,3));
});

test('batch 3 #19: revolve drag remains finite for overflow/NaN and clamps ordinary angles',()=>{
  const max=Number.MAX_VALUE;
  for(const [delta,direction] of [[{x:max,y:max},{x:max,y:-max}],[{x:max},{x:2}],
    [{x:NaN},{x:1}],[{x:Infinity},{x:1}]]) {
    const next=applyHandleDrag('revolve',{angle:120},delta,direction);
    assert.ok(Number.isFinite(next.angle));assert.ok(next.angle>=1e-6 && next.angle<=360);
  }
  assert.equal(applyHandleDrag('revolve',{angle:120},{x:max},{x:2}).angle,360);
  assert.equal(applyHandleDrag('revolve',{angle:120},{x:2},{x:1}).angle,128);
  assert.equal(applyHandleDrag('revolve',{angle:2},{x:-10},{x:1}).angle,1e-6);
  assert.equal(applyHandleDrag('revolve',{angle:350},{x:10},{x:1}).angle,360);
});

test('batch 3 #20: symmetric depth drags cross zero without flipping direction; ordinary depth drags still flip',()=>{
  for(const type of ['extrude','extrudeCut','hole'])for(const config of [{endCondition:'mid-plane'},{symmetric:true}]) {
    for(const direction of [undefined,'forward','reverse'])for(const delta of [-20,-10,5]) {
      const start={depth:10,...config,...(direction?{direction}:{})},before=structuredClone(start);
      const next=applyHandleDrag(type,start,{x:delta},{x:1});
      assert.equal(next.direction,direction);assert.equal(next.depth,Math.max(1e-6,Math.abs(10+delta)));
      assert.deepEqual(start,before);assert.deepEqual(Object.keys(next).sort(),Object.keys(start).sort());
    }
  }
  for(const [direction,expected] of [['forward','reverse'],['reverse','forward']]) {
    const next=applyHandleDrag('extrude',{depth:10,direction},{x:-20},{x:1});
    assert.equal(next.direction,expected);assert.equal(next.depth,10);
  }
});

// Batch #4: exercise the production functions, stubbing browser/GPU boundaries.
import {cylinderAxis} from '../js/core/cylinder_axis.js';
import {ensureConfigurations} from '../js/cad_configurations.js';
import {canAlignedSectionParent} from '../js/core/drawing_aligned_section.js';
import {Vector3} from '../vendor/three/three.core.js';
import {curveSegments} from '../js/sketch_profiles.js';

test('batch 4 #1: aligned sections verify their parent before undo and commit to normalized records',()=>{
  for(const missing of [true,false]) {
    const before={views:[{id:'v',dir:'front',configurationId:'cfg',configurationName:'Default'}]};
    const h=historyHarness(structuredClone(before)),stale=h.E.def,messages=[],state={};
    const draft={viewId:'v',token:1,fingerprint:JSON.stringify(stale.views[0]),points:[{u:1,v:0},{u:0,v:0},{u:0,v:1}]};
    state.draft=draft;
    const host={doc:()=>h.E.def,bodiesToken:()=>1,bodies:()=>[],refresh:noop,markDirty:noop,flash:s=>messages.push(s),
      pushUndo:label=>{h.bindings.pushUndo(label);h.E.def=structuredClone(h.E.def);}};
    const run=load(drawingSource,'finishAlignedSection',{host,state,canAlignedSectionParent,nextSectionTag:()=> 'A',invalidate:noop,
      projectAlignedSection:()=>{if(missing)h.E.def={views:[]};},
      addViewToSheet:(doc,dir,options)=>{const view={id:'aligned',dir,...options};doc.views.push(view);return view;}});
    run(draft);
    assert.equal(h.pushes,missing?0:1);assert.deepEqual(stale,before);
    if(missing) {
      assert.deepEqual(messages,['Aligned Section parent disappeared']);
      assert.equal(h.H.undo(),false);assert.equal(state.draft,draft);
    } else {
      assert.equal(state.draft,null);assert.deepEqual(state.selection,{kind:'view',id:'aligned'});
      assert.equal(h.E.def.views[1].parent,'v');assert.equal(h.E.def.views[1].configurationId,'cfg');
      assert.deepEqual(h.E.def.views[1].alignedSection.points,draft.points);
      assertUndoRedo(h,before,structuredClone(h.E.def));
    }
  }
});

test('batch 4 #2: fit dispatches to the drawing sheet, 3D preview or sketch for the current mode',()=>{
  for(const mode of ['drawing','3d','2d']) {
    const calls=[];
    load(source,'runCommand',{E:{mode},DIRECT_COMMAND_TOOLS:{},commandUnavailableReason:()=>null,
      drawingSheet:()=>({fit:()=>calls.push('sheet')}),refreshAll:()=>calls.push('refresh'),
      fitPreview:()=>calls.push('preview'),fitSketch:()=>calls.push('sketch'),
      closeCommandSearch:()=>calls.push('close'),syncCommandManager:()=>calls.push('sync')})('fit');
    assert.deepEqual(calls,[...(mode==='drawing'?['sheet','refresh']:[mode==='3d'?'preview':'sketch']),'close','sync']);
  }
});

test('batch 4 #3: mass properties return before evaluation when the active document is absent',async()=>{
  for(const docType of ['part','assembly'])for(const missing of [null,undefined]) {
    // A retained background part must not be evaluated for an absent assembly.
    const E={docType,def:docType==='part'?missing:{name:'Background'},assembly:missing};
    await load(source,'showMassProperties',{E})();
    assert.equal(E.massEvaluation,undefined);
  }
  const def={parts:[]};let opened=0;
  await load(source,'showMassProperties',{E:{docType:'part',def},cloneData:structuredClone,activeParts:d=>d.parts,t:k=>k,
    openEvalCard:()=>{opened++;return null;}})();
  assert.equal(opened,1,'loaded documents still open the evaluation card');
});

test('batch 4 #4: GLB export uses the active document name consistently and retains model fallback',async()=>{
  // Replace only the dynamic browser import; execute the complete export handler.
  const text=sourceFunctionText(source,'exportModelGlb');
  const node=findNode(text,n=>n.type==='ImportExpression');
  const handler=text.slice(0,node.start)+'loadExporter()'+text.slice(node.end);
  for(const [docType,def,assembly,name] of [
    ['assembly',null,{name:'Assembly'},'Assembly'],['assembly',{name:'Background'},{name:'Fixture'},'Fixture'],
    ['part',{name:'Part'},null,'Part'],['part',undefined,null,'model'],['assembly',null,{},'model'],
  ]) {
    const downloads=[],messages=[],clone={};let exported,scale;
    class Group {constructor(){this.scale={setScalar:v=>{scale=v;}};}add(child){assert.equal(child,clone);}}
    class GLTFExporter {async parseAsync(group,options){exported=group;assert.deepEqual(options,{binary:true,onlyVisible:true,trs:true});return 'glb';}}
    const E={docType,def,assembly,pv:{grp:{clone:deep=>{assert.equal(deep,true);return clone;}}}};
    const run=new Function('E','THREE','loadExporter','rejectFlexibleSpringPreview','downloadBytes','flash',handler+';return exportModelGlb')(
      E,{Group},async()=>({GLTFExporter}),()=>false,(...args)=>downloads.push(args),s=>messages.push(s));
    await run();assert.deepEqual(messages,[]);assert.equal(exported.name,name);assert.equal(scale,.01);
    assert.deepEqual(downloads,[['glb',name+'.glb','model/gltf-binary']]);
  }
});

test('batch 4 #5: layer analysis and FFF preview explain absent print setup without rejecting',async()=>{
  for(const [name,message] of [['openPrintLayerAnalysis','Save Print setup before analyzing oriented layers'],
    ['openFffSlicePreview','Save Print setup before generating FFF paths']]) {
    for(const docType of ['part','assembly'])for(const doc of [null,undefined,{}]) {
      const messages=[],E={docType,def:docType==='part'?doc:{printSetup:{}},assembly:doc};
      await load(source,name,{E,flash:(...args)=>messages.push(args)})();
      assert.deepEqual(messages,[[message,5000]]);
    }
    await load(source,name,{E:{docType:'drawing'}})();
  }
});

test('batch 4 #6: print setup returns before expensive preparation without an active document',async()=>{
  for(const docType of ['part','assembly'])for(const missing of [null,undefined]) {
    await load(source,'openPrintSetupForm',{E:{docType,def:docType==='part'?missing:{},assembly:missing}})();
  }
  const messages=[];
  await load(source,'openPrintSetupForm',{E:{docType:'part',def:{}},exactRunIsCurrent:()=>false,
    regenerateExactModel:async()=>null,flash:s=>messages.push(s)})();
  assert.deepEqual(messages,['Print setup needs a closed native solid']);
});

test('batch 4 #7: evaluation cards tolerate each missing child and still initialize available children',()=>{
  const ids=['#mdEvalKicker','#mdEvalTitle','#mdEvalBody','#mdEvalActions'];
  for(let mask=0;mask<16;mask++) {
    const nodes={'#mdEvalCard':{hidden:true}},E={};
    ids.forEach((id,i)=>{if(mask&(1<<i))nodes[id]={textContent:'old',innerHTML:'old',hidden:false};});
    const body=load(source,'openEvalCard',{E,root:{querySelector:id=>nodes[id] || null}})('mass','Evaluate','Mass');
    assert.equal(body,nodes['#mdEvalBody'] || null);assert.equal(E.evalCard,'mass');assert.equal(nodes['#mdEvalCard'].hidden,false);
    if(nodes[ids[0]])assert.equal(nodes[ids[0]].textContent,'Evaluate');
    if(nodes[ids[1]])assert.equal(nodes[ids[1]].textContent,'Mass');
    if(nodes[ids[2]])assert.equal(nodes[ids[2]].innerHTML,'');
    if(nodes[ids[3]]){assert.equal(nodes[ids[3]].innerHTML,'');assert.equal(nodes[ids[3]].hidden,true);}
  }
  for(const root of [null,{querySelector:()=>null}])assert.equal(load(source,'openEvalCard',{root})('mass'),null);
});

function printFrameHarness(doc,win) {
  const messages=[],calls=[],frame=eventNode('iframe');
  Object.assign(frame,{contentDocument:doc,contentWindow:win,remove:()=>calls.push('remove')});
  const run=load(source,'printDrawingSheet',{rejectFlexibleSpringPreview:()=>false,prepareConfiguredDrawingExport:async()=>{},
    drawingSheet:()=>({svg:()=>'<svg/>'}),document:{createElement:()=>frame,body:{appendChild:()=>calls.push('append')}},
    flash:s=>messages.push(s),t:k=>k,setTimeout:(fn,delay)=>{assert.equal(delay,1000);fn();}});
  return {run,messages,calls,frame};
}
test('batch 4 #8: printing cleans up unavailable iframe documents/windows and reports failure',async()=>{
  for(const [doc,win] of [[null,{}],[undefined,{}],[{},null],[{},undefined]]) {
    const f=printFrameHarness(doc,win);await f.run();
    assert.deepEqual(f.messages,['drawPrintFailed']);assert.deepEqual(f.calls,['append','remove']);
  }
});
test('batch 4 #8: printing still writes SVG, waits for load, prints and removes its iframe',async()=>{
  for(const readyState of ['complete','loading'])for(const lostWindow of [false,true]) {
    const calls=[],doc={readyState,open:()=>calls.push('open'),write:s=>{assert.ok(s.endsWith('<svg/>'));calls.push('write');},close:()=>calls.push('close')};
    const f=printFrameHarness(doc,{focus:()=>calls.push('focus'),print:()=>calls.push('print')});await f.run();
    if(readyState==='loading') {
      assert.deepEqual(calls,['open','write','close']);
      if(lostWindow)f.frame.contentWindow=null;
      f.frame.emit('load');
    }
    const fails=readyState==='loading' && lostWindow;
    assert.deepEqual(calls,['open','write','close',...(fails?[]:['focus','print'])]);
    assert.deepEqual(f.messages,fails?['drawPrintFailed']:[]);assert.deepEqual(f.calls,['append','remove']);
  }
});

test('batch 4 #9: drawing command availability handles absent assembly components',()=>{
  const editor={docType:'assembly'},catalog=buildCommandCatalog({editor,t:k=>k,closedSketchProfile:()=>false,activeParts:()=>[]});
  const command=catalog.find(c=>c.id==='drawing');
  for(const assembly of [null,undefined,{}, {components:null},{components:[]}]) {
    editor.assembly=assembly;assert.equal(!!command.available(),false);assert.equal(command.reason(),'cmdNeedOneComponent');
  }
  editor.assembly={components:[{}]};assert.equal(!!command.available(),true);
  editor.docType='part';editor.assembly=null;assert.equal(command.available(),true);
});

test('batch 4 #10: sketch synchronization returns false without a definition and still syncs loaded holes',()=>{
  for(const def of [null,undefined])assert.equal(load(source,'syncSketchDrivenParts',{E:{def}})(),false);
  let helices=0;
  const E={def:{}},b={E,syncSweptSourceParts:()=>false,synchronizeSketchHelices:()=>{helices++;return [];}};
  assert.equal(load(source,'syncSketchDrivenParts',b)(),false);assert.equal(helices,1);
  const part={meshData:{}},sketch={},feature={type:'hole',params:{sketchId:'s'}};
  E.def={features:[feature],parts:[part]};let holes=0;
  const run=load(source,'syncSketchDrivenParts',{...b,sketchById:()=>sketch,
    syncHoleCutPlacement:(p,f,s,d)=>{assert.equal(p,part);assert.equal(f,feature);assert.equal(s,sketch);assert.equal(d,E.def);holes++;return true;}});
  assert.equal(run(),true);assert.equal(holes,1);assert.equal(part.meshData,undefined);
});

test('batch 4 #11: configurations require the active owner and retain loaded part/assembly menus',()=>{
  for(const docType of ['part','assembly'])for(const missing of [null,undefined]) {
    load(source,'showConfigurations',{E:{docType,def:docType==='part'?missing:{},assembly:missing}})();
  }
  for(const docType of ['part','assembly']) {
    const doc={},menus=[];
    load(source,'showConfigurations',{E:{docType,def:docType==='part'?doc:{},assembly:doc},ensureConfigurations,
      circularSweepTableRows:()=>null,t:k=>k,showPickList:(_title,_hint,items)=>menus.push(items)})();
    assert.ok(doc.configurations.length);assert.equal(menus.length,1);
    assert.ok(menus[0].some(item=>item.id===doc.activeConfiguration));
    assert.ok(menus[0].some(item=>item.id==='__new__'));
  }
});

function assemblySettingsHarness() {
  const h=historyHarness({name:'Fixture',customProperties:{Keep:'Unrelated'}}),E=h.E;
  Object.defineProperty(E,'assembly',{get:()=>E.def,set:doc=>{E.def=doc;}});
  const fields={},buttons={};let refreshes=0,outputs=0,previews=0,modes=0;
  const dialog=eventNode('dialog');Object.assign(dialog,{append:noop,showModal:noop,close:noop});
  const el=(tag,cls,text)=>{const n=eventNode(tag,cls,text);if(tag==='button')buttons[text]=n;return n;};
  const b={...h.bindings,root:{querySelector:()=>null,appendChild:noop},document:{createElement:tag=>tag==='dialog'?dialog:eventNode(tag)},el,
    sheetRow:(_dialog,label,field)=>{fields[label]=field;return field;},sheetSelect:(_choices,value)=>({value,setAttribute:noop}),
    SHEET_SIZES:{A3:{}},t:k=>k,setDocumentProperty,syncHead:noop,refreshAll:()=>refreshes++,
    exportDrawingSvg:()=>outputs++,showDrawingPreview:async()=>{previews++;return true;},setMode:()=>modes++};
  load(source,'showAssemblyDrawingSettings',b)();
  return {h,fields,buttons,get refreshes(){return refreshes;},get outputs(){return outputs;},get previews(){return previews;},get modes(){return modes;}};
}
test('batch 4 #12: repeated apply/export/preview/open actions leave unchanged drawing history alone',async()=>{
  const f=assemblySettingsHarness(),before=structuredClone(f.h.E.def);
  f.buttons['Apply drawing settings'].onclick();
  assert.equal(f.h.pushes,1);assert.equal(f.refreshes,1);assert.equal(f.h.E.def.customProperties.Keep,'Unrelated');
  const saved=structuredClone(f.h.E.def);assertUndoRedo(f.h,before,saved);
  for(const label of ['Apply drawing settings','Export drawing SVG','Preview drawing','Open native Drawing'])await f.buttons[label].onclick();
  assert.equal(f.h.pushes,1);assert.equal(f.refreshes,1);assert.deepEqual(f.h.E.def,saved);
  assert.equal(f.outputs,1);assert.equal(f.previews,1);assert.equal(f.modes,1);
  // A property-only change still needs undo even when drawingSettings match.
  f.h.E.def.customProperties.Description='External edit';
  const propertyBefore=structuredClone(f.h.E.def);
  f.buttons['Apply drawing settings'].onclick();assert.equal(f.h.pushes,2);
  assert.equal(f.h.E.def.customProperties.Description,'Fixture');assertUndoRedo(f.h,propertyBefore,saved);
  f.fields['Drawing notes'].value='  Reviewed  ';
  f.fields.Number.value='  F-42  ';
  f.buttons['Apply drawing settings'].onclick();assert.equal(f.h.pushes,3);
  assert.equal(f.h.E.def.drawingSettings.notes,'Reviewed');assert.equal(f.h.E.def.customProperties.Number,'F-42');
  assertUndoRedo(f.h,saved,structuredClone(f.h.E.def));
});

test('batch 4 #13: 3MF/AMF exports handle absent definitions and preserve names and draft suffixes',async()=>{
  for(const def of [null,undefined,{}, {name:'Part'}])for(const format of ['3mf','amf'])for(const draft of [false,true]) {
    const downloads=[],exports=[],messages=[],shape={},settings={quality:'fine'};
    const exportBytes=async(s,n,opts)=>{assert.equal(s,shape);assert.equal(opts,settings);exports.push(n);return 'bytes';};
    await load(source,'exportThreeMfDocument',{E:{docType:'part',def,brepRun:{ok:true,finalShape:shape}},
      standardsGate:()=>true,exactRunIsCurrent:()=>true,exportThreeMf:exportBytes,exportAmf:exportBytes,
      downloadBytes:(...args)=>downloads.push(args),flash:s=>messages.push(s)})(settings,format,draft);
    const name=(def?.name || 'model')+(draft?'__UNQUALIFIED_DRAFT':'');
    assert.deepEqual(exports,[name]);assert.deepEqual(downloads,[['bytes',name+'.'+format,format==='amf'?'application/xml':'model/3mf']]);
    assert.ok(!messages.some(s=>s.includes('failed')));
  }
});

test('batch 4 #14: curve mismatches cannot match through nearby endpoints; same curves still match',()=>{
  const edgePoints=load(mesh,'edgePoints',{THREE:{Vector3},fin:Number.isFinite,curveSegments});
  const circleDescriptorsMatch=load(mesh,'circleDescriptorsMatch',{fin:Number.isFinite,distanceToCircularEdge:()=>0});
  const match=load(mesh,'edgesGeometricallyMatch',{edgePoints,circleDescriptorsMatch});
  const circle={curve:'circle',radius:1,origin:{x:0,y:0,z:0},axis:{x:0,y:0,z:1}};
  const point=edgePoints(circle)[0],near={x:point.x+.1,y:point.y,z:point.z};
  const line={curve:'line',endpoints:[point,near]};
  for(const curve of ['line','polyline','spline']) {
    const other={...line,curve};assert.equal(match({descriptor:circle},{descriptor:other}),false);
    assert.equal(match({descriptor:other},{descriptor:circle}),false);
  }
  assert.equal(match({descriptor:circle},{descriptor:structuredClone(circle)}),true);
  assert.equal(match({descriptor:circle},{descriptor:{...circle,radius:3}}),false);
  assert.equal(match({descriptor:line},{descriptor:{...line,endpoints:[near,point]}}),true);
  assert.equal(match({descriptor:line},{descriptor:{...line,endpoints:[{x:10,y:0,z:0},{x:11,y:0,z:0}]}}),false);
  assert.equal(match(null,{}),false);assert.equal(match({},{}),false);
});

test('batch 4 #15: mesh reflection tolerates absent mesh/bounds and preserves winding and normals',()=>{
  let cleared=0;
  const reflect=load(geometry,'reflectProjectionMesh',{clearMeshProjectionCache:()=>cleared++,clearTopologyCache:()=>cleared++});
  for(const meshData of [null,undefined])assert.doesNotThrow(()=>reflect({meshData},'x'));
  assert.equal(cleared,0);
  for(const axis of ['x','y','z'])for(const exactBounds of [undefined,{}, {min:{x:1,y:2,z:3}},{max:{x:4,y:5,z:6}},
    {min:{x:1,y:2,z:3},max:{x:4,y:5,z:6}}])for(const indexed of [false,true]) {
    const meshData={positions:[1,2,3,4,5,6,7,8,9],normals:[1,0,0,0,1,0,0,0,1],
      colors:[1,0,0,0,1,0,0,0,1],...(exactBounds?{exactBounds:structuredClone(exactBounds)}:{}),...(indexed?{indices:[0,1,2]}:{})};
    const part={meshData},before=structuredClone(part),component={x:0,y:1,z:2}[axis];
    reflect(part,axis);
    assert.equal(meshData.positions[component],-before.meshData.positions[component]);
    if(indexed)assert.deepEqual(meshData.indices,[0,2,1]);
    else assert.deepEqual(meshData.positions.slice(3,6),before.meshData.positions.slice(6,9).map((v,i)=>i===component?-v:v));
    if(exactBounds?.min && exactBounds?.max) {
      assert.equal(meshData.exactBounds.min[axis],-exactBounds.max[axis]);assert.equal(meshData.exactBounds.max[axis],-exactBounds.min[axis]);
    }
    reflect(part,axis);assert.deepEqual(part,before,'reflection is an involution');
  }
});

test('batch 4 #16: cylinder mirrors have one branch and preserve directed axes and cone radii',()=>{
  const text=sourceFunctionText(geometry,'mirrorProjectionPart');
  let cylinderChecks=0;
  function visit(node) {
    if(!node || typeof node!=='object')return;
    if(node.type==='BinaryExpression' && node.left?.object?.name==='q' && node.left?.property?.name==='kind' && node.right?.value==='cyl')cylinderChecks++;
    for(const value of Object.values(node)){if(Array.isArray(value))value.forEach(visit);else if(value&&typeof value==='object')visit(value);}
  }
  visit(parse(text,{ecmaVersion:'latest',sourceType:'module'}));assert.equal(cylinderChecks,1);
  const mirror=load(geometry,'mirrorProjectionPart',{isKernelBody:()=>false,cylinderAxis});
  for(const [plane,axis] of [['plane:top','y'],['plane:front','z'],['plane:right','x']])for(const directed of ['x','y','z',{x:1,y:2,z:3}]) {
    const part={kind:'cyl',x:2,y:3,z:4,h:5,r:2,r2:1,axis:directed},before=structuredClone(part),bounds=cylinderBounds(part);
    assert.equal(mirror(part,plane),part);assert.equal(part[axis],-before[axis]);
    const result=cylinderBounds(part);
    for(const key of ['x','y','z']) {
      assert.ok(Math.abs(result[key+'0']-(key===axis?-bounds[key+'1']:bounds[key+'0']))<1e-10);
      assert.ok(Math.abs(result[key+'1']-(key===axis?-bounds[key+'0']:bounds[key+'1']))<1e-10);
    }
    assert.deepEqual([part.h,part.r,part.r2],[5,2,1]);
  }
});

test('batch 4 #17: fold tools tolerate an absent provider and render when it is available',()=>{
  for(const provider of [null,undefined])load(mobile,'renderFoldPanel',{sheet:{},window:{__proToolTabs:provider}})();
  const strong={},close={setAttribute:noop},body={},calls=[],sheet={querySelector:()=>null};
  const foldPanel={parentNode:sheet,querySelector:s=>s==='strong'?strong:s==='.m-fold-body'?body:close,setAttribute:noop};
  load(mobile,'renderFoldPanel',{sheet,foldPanel,foldTab:0,foldTabs:()=>[{full:'Sketch',count:3}],t:k=>k==='foldAll'?'{tab} ({n})':k,
    window:{__proToolTabs:{render:(...args)=>calls.push(args),sync:()=>calls.push('sync')}},sync:noop})();
  assert.equal(strong.textContent,'Sketch (3)');assert.equal(calls[0][0],body);
  assert.deepEqual(calls[0].slice(1,3),['model',0]);assert.equal(calls[1],'sync');
});

test('batch 4 #18: contextual actions handle absent lists/providers and skip null entries',()=>{
  const calls=[],api={state:()=>({mode:'3d',topologyCount:1}),chromeLabel:id=>'Label '+id,runChrome:id=>calls.push(id)};
  const run=()=>load(mobile,'ctxActions',{api,CTX_MAX_ACTIONS:3,sync:()=>calls.push('sync')})();
  assert.deepEqual(run(),[]);
  for(const items of [null,undefined,[],[null,undefined]]){api.contextItems=()=>items;assert.deepEqual(run(),[]);}
  api.contextItems=()=>[null,{id:'measure'},undefined,{id:'measure'},{id:'mass'},{id:'fit'},{id:'extra'}];
  const actions=run();assert.deepEqual(actions.map(a=>a.action),['measure','mass','fit']);
  assert.equal(actions[0].label,'Label measure');actions[0].run();assert.deepEqual(calls,['measure','sync']);
});

test('batch 4 #19: selection filter cycles from click-time state, wraps and defaults unknown filters',()=>{
  let state={topologyCount:1,selFilter:'all'};
  const buttons=[],bar={appendChild:b=>buttons.push(b)},api={state:()=>state,setSelFilter:value=>{state={...state,selFilter:value};}};
  load(mobile,'renderSelectionBar',{api,selectionBar:bar,btn:spec=>spec,t:k=>k})();
  const filter=buttons.find(b=>b.ph==='ph-funnel');assert.ok(filter);
  for(const [current,expected] of [['edge','body'],['body','all'],['all','face'],['face','edge'],['unknown','face'],[undefined,'face']]) {
    state={...state,selFilter:current};filter.run();assert.equal(state.selFilter,expected);
  }
  state=null;assert.doesNotThrow(()=>filter.run());assert.equal(state.selFilter,'face');
});

test('batch 4 #20: revolve radius ignores absent/nonfinite points and keeps the largest finite absolute radius',()=>{
  const radius=load(geometry,'revMaxR');
  for(const part of [null,undefined,{}, {pts:null},{pts:[]}])assert.equal(radius(part),0);
  const part={pts:[null,undefined,{}, {u:NaN},{u:Infinity},{u:-Infinity},{u:'100'}, {u:-7},{u:3},{u:0}]};
  const before=structuredClone(part);assert.equal(radius(part),7);assert.deepEqual(part,before);
  assert.equal(radius({pts:[{u:-2},{u:4},{u:3}]}),4);
});

test('batch 5 #1: drawing tools delegate before clearing editor state and reflect the sheet tool',()=>{
  const tools=['select','dim','angle','baseline','chain','section','detail','sheetrect','sheetline','sheetcircle','sheetellipse','sheetpolyline','note'];
  for(const id of [...tools,'unknown','saveformat'])for(const getter of [true,false]) {
    const E={mode:'drawing',tool:'dim',dimPick:['p'],dimSel:'d',dynInput:{value:7},poly:['p']};
    const calls=[],sheet={setTool:value=>calls.push(value)};
    if(getter)sheet.getTool=()=>tools.includes(id)?id:id==='saveformat'?'dim':'select';
    let synced=0;
    const run=load(source,'setTool',{E,drawingSheet:()=>sheet,syncTools:()=>synced++,syncHint:()=>synced++,
      MODEL_PLANE_TOOLS:[],DRAWING_TOOLS:tools,setMode:mode=>{E.mode=mode;},syncModelPlane:noop,
      drawSketch:noop,updateTourProgress:noop});
    run(id);
    assert.deepEqual(calls,[id]);assert.equal(E.tool,getter?sheet.getTool():id);assert.equal(synced,2);
    assert.equal(E.mode,'drawing');assert.deepEqual(E.dimPick,['p']);assert.equal(E.dimSel,'d');
    assert.deepEqual(E.dynInput,{value:7});assert.deepEqual(E.poly,['p']);
  }
});

test('batch 5 #2: feature editors tolerate missing documents and authoring state',()=>{
  const feature={id:'hole',type:'hole',params:{holeProfileSketchId:'profile'}};
  for(const def of [null,undefined])for(const authoring of [null,undefined,{featureEdit:{featureId:'hole'}}]) {
    const E={def,authoring};
    assert.doesNotThrow(()=>load(source,'cancelFeatureParameterEdit',{E})(true));
    assert.doesNotThrow(()=>load(source,'openFeatureEditor',{E})(feature));
  }
  for(const authoring of [null,undefined])assert.doesNotThrow(()=>load(source,'openFeatureEditor',{E:{def:{},authoring}})({type:'extrude'}));
  const sketch={id:'profile'},opened=[];
  load(source,'openFeatureEditor',{E:{def:{sketches:[sketch]},authoring:{}},editHoleWizardSketch:s=>opened.push(s)})(feature);
  assert.deepEqual(opened,[sketch]);
});

test('batch 5 #3: consumed hole/profile sketches stay out of overlays unless explicitly shown',()=>{
  const consumed=load(source,'consumedSketchIds');
  const def={features:[null,{params:{sketchId:'position',holeProfileSketchId:'hole',profileSketchId:'profile'},
    references:{sketches:['reference',{id:'object'}]}},{}],sketches:['position','hole','profile','user'].map(id=>({id,plane:'top'}))};
  assert.deepEqual([...consumed(def)],['position','hole','profile','reference','object']);
  assert.equal(consumed(null).size,0);
  const overlays=load(source,'documentSketchOverlays',{E:{docType:'part',mode:'3d'},consumedSketchIds:consumed,
    ensureSketchDoc:d=>d.sketches,isHoleWizardSketch:()=>false,standardPlaneFrame:()=>({}),framePoint:(_f,u,v)=>({x:u,y:v,z:0}),
    analyzeSketchProfiles:()=>({profiles:[{points:[{u:0,v:0},{u:1,v:0},{u:0,v:1}]}]}),analyzeSketchChains:()=>({chains:[]})});
  assert.equal(overlays(def).length,1);
  def.sketches[1].show3d=true;assert.equal(overlays(def).length,2);
});

test('batch 5 #4: document overlays accept absent authoring state',()=>{
  for(const authoring of [null,undefined]) {
    const added=[],overlay={id:'datum'};
    load(source,'addDocumentOverlays',{E:{docType:'part',mode:'3d',authoring},ensureSketch:()=>({entities:[]}),
      documentPlaneOverlays:()=>[overlay],documentSketchOverlays:()=>[],documentHelixOverlays:()=>[],documentThreadOverlays:()=>[]})({add:o=>added.push(o)},{});
    assert.deepEqual(added,[overlay]);
  }
});

test('batch 5 #5: section offset uses the active display formatter and suffix settings',()=>{
  for(const unit of ['mm','m','in','ft'])for(const suffix of [true,false]) {
    const E={},output={},slider={},controls={};
    const fmtLen=load(read('display_units.js'),'fmtLen',{displayUnit:()=>unit,getDomainDigits:()=>2,
      withDisplayOptions:opts=>({...opts,suffix}),formatLength});
    const root={querySelector:s=>({'#mdSectionValue':output,'#mdSectionOffset':slider,'#mdSectionControls':controls}[s]),querySelectorAll:()=>[]};
    load(source,'setSectionState',{E,root,fmtLen})({enabled:true,offset:25.4});
    assert.equal(output.textContent,fmtLen(25.4));assert.equal(slider.value,'25.4');assert.equal(controls.hidden,false);
    assert.equal(E.section.offset,25.4);
  }
});

const testPlaneSketch=plane=>JSON.parse(JSON.stringify(addSketch({},plane,0)));
test('batch 5 #6: forced face sketch attachment records undo; absent documents and unchanged support are no-ops',()=>{
  for(const forceNew of [false,true]) {
    const sketch=testPlaneSketch('top'),before={sketches:[sketch],activeSketch:sketch.id};
    const h=historyHarness(structuredClone(before)),attachment={support:{persistentId:'face'},plane:'front',offset:2,frame:{},frameAnchor:'bounds-center'};
    const attach=load(source,'attachSketchToSelectedFace',{...h.bindings,faceSketchAttachment:()=>attachment,ensureSketch,addSketch});
    assert.equal(attach(forceNew),true);assert.equal(h.pushes,1);
    const after=structuredClone(h.E.def);assert.equal(after.sketches[0].support.persistentId,'face');
    assertUndoRedo(h,before,after);
    assert.equal(attach(false),true);assert.equal(h.pushes,1,'same support does not change history');
    assert.equal(attach(true),true);assert.equal(h.pushes,2);assert.equal(h.E.def.sketches.length,2);
    assertUndoRedo(h,after,structuredClone(h.E.def));
  }
  for(const def of [null,undefined])assert.equal(load(source,'attachSketchToSelectedFace',{E:{def},faceSketchAttachment:()=>{throw new Error('no attachment without a document');}})(true),false);
});

test('batch 5 #7: face attachment tolerates missing document parts during exact support lookup',()=>{
  const support={kind:'face',descriptor:{surface:'plane',normal:{x:0,y:1,z:0}}};
  for(const def of [null,undefined,{}]) {
    const result=load(source,'faceSketchAttachment',{E:{def,brepRun:{results:new Map()}},isCanonicalAuthoring:()=>true,
      cutTargetFeatureId:p=>p?.id,cloneData:structuredClone,faceFrameOrigin:()=>({x:0,y:0,z:0}),frameFromPlane:()=>frame})(support);
    assert.equal(result.plane,'top');assert.deepEqual(result.support,support);assert.deepEqual(result.frame,frame);
  }
});

test('batch 5 #8: sketch initialization handles non-documents and still persists valid sketches',()=>{
  for(const def of [null,undefined,0,1,'', 'model',true]) {
    assert.deepEqual(ensureSketchDoc(def),[]);
    const sketch=ensureSketch(def);assert.equal(sketch.plane,'top');assert.equal(sketch.offset,0);
    assert.deepEqual([sketch.points,sketch.entities,sketch.constraints],[[],[],[]]);
  }
  const def={};const sketch=ensureSketch(def);
  assert.equal(ensureSketch(def),sketch);assert.equal(def.activeSketch,sketch.id);assert.deepEqual(ensureSketchDoc(def),[sketch]);
});

test('batch 5 #9: abandoned sketch checks/pruning tolerate absent documents and preserve active sketches',()=>{
  const sketch=testPlaneSketch('top');
  for(const def of [null,undefined]) {
    assert.equal(sketchIsAbandoned(def,sketch),false);assert.deepEqual(pruneAbandonedSketches(def),[]);
  }
  const active=testPlaneSketch('front'),def={sketches:[sketch,active],activeSketch:active.id};
  assert.equal(sketchIsAbandoned(def,sketch),true);assert.equal(sketchIsAbandoned(def,active),false);
  assert.deepEqual(pruneAbandonedSketches(def),[sketch.id]);assert.deepEqual(def.sketches,[active]);
});

test('batch 5 #10: sketch removal has a null active fallback when duplicate IDs empty history-backed sketches',()=>{
  // Normal documents retain at least one sketch. Malformed duplicate IDs cause
  // removeHistoryNode to remove every matching record despite the length guard.
  const a=testPlaneSketch('top'),b={...testPlaneSketch('front'),id:a.id};
  const def={sketches:[a,b],activeSketch:a.id,history:[{id:'history',kind:'sketch',targetId:a.id}]};
  assert.equal(removeSketch(def,a.id),true);assert.deepEqual(def.sketches,[]);assert.equal(def.activeSketch,null);
  for(const withHistory of [false,true]) {
    const doc={};const first=ensureSketch(doc),second=addSketch(doc,'front',0);addSketch(doc,'side',0);
    doc.activeSketch=second.id;
    if(withHistory)doc.history=[{id:'history',kind:'sketch',targetId:second.id}];
    assert.equal(removeSketch(doc,second.id),true);assert.equal(doc.activeSketch,first.id);assert.equal(doc.sketches.length,2);
  }
});

test('batch 5 #11: orphan pruning normalizes partial sketches and retains points used by live entities',()=>{
  for(const sketch of [null,undefined,1,'sketch'])assert.doesNotThrow(()=>pruneOrphanPoints(sketch));
  for(const sketch of [{},{points:[]},{entities:[]},{constraints:[]}]) {
    pruneOrphanPoints(sketch);assert.deepEqual(sketch,{points:[],entities:[],constraints:[]});
  }
  const sketch={points:[{id:'a',x:0,y:0},{id:'b',x:1,y:0},{id:'orphan',x:2,y:0}],entities:[{id:'line',type:'line',a:'a',b:'b'}]};
  pruneOrphanPoints(sketch);assert.deepEqual(sketch.points.map(p=>p.id),['a','b']);assert.deepEqual(sketch.constraints,[]);
});

test('batch 5 #12: smart dimensions return neutral results for missing sketches or targets',()=>{
  for(const [sketch,target] of [[null,{}],[undefined,{}],[{},null],[{},undefined],[null,null]]) {
    assert.equal(addSmartDimension(sketch,target,2),null);assert.equal(currentMeasure(sketch,target),0);
    if(sketch)assert.deepEqual(sketch,{},'missing target must not mutate the sketch');
  }
  const line={id:'l',type:'line',a:'a',b:'b'},sketch={points:[{id:'a',x:0,y:0},{id:'b',x:3,y:4}],entities:[line]};
  assert.equal(currentMeasure(sketch,line),5);const id=addSmartDimension(sketch,line,5);
  assert.deepEqual(sketch.constraints,[{id,type:'distance',entity:'l',value:5,driven:false}]);
});

test('batch 5 #13: distance layouts skip either failed screen projection',()=>{
  const sketch={points:[{id:'a',x:0,y:0},{id:'b',x:10,y:0}]},constraint={type:'distance',a:'a',b:'b'};
  for(const missing of [null,undefined])for(const failed of [0,10]) {
    assert.equal(distanceDimensionLayout(sketch,constraint,(x,y)=>x===failed?missing:{x,y}),null);
  }
  const layout=distanceDimensionLayout(sketch,constraint,(x,y)=>({x,y}));
  assert.deepEqual(layout.a,{x:0,y:20});assert.deepEqual(layout.b,{x:10,y:20});
});

test('batch 5 #14: dimension hit testing accepts label-less geometry and preserves real label/line hits',()=>{
  // Defensive contract test: today's dimensionHitShape always supplies a box.
  // Inject only the missing optional box to exercise the requested fallback.
  const constraint={id:'d',type:'distance',a:'a',b:'b',value:10},sketch={points:[{id:'a',x:0,y:0},{id:'b',x:10,y:0}],constraints:[constraint]};
  for(const box of [null,undefined]) {
    const hit=load(read('sketch_dimensions.js'),'hitSketchDimensionHit',{
      dimensionHitShape:()=>({box,a:{x:0,y:0},b:{x:10,y:0}}),
      pointSegmentDistance:load(read('sketch_dimensions.js'),'pointSegmentDistance')});
    assert.deepEqual(hit(sketch,5,0,noop),{constraint,kind:'line'});assert.equal(hit(sketch,100,100,noop),null);
  }
  const toPx=(x,y)=>({x,y});
  assert.deepEqual(hitSketchDimensionHit(sketch,10,16,toPx),{constraint,kind:'label'});
  assert.deepEqual(hitSketchDimensionHit(sketch,1,20,toPx),{constraint,kind:'line'});
});

const splineTestControls=[{x:0,y:0},{x:1,y:0},{x:2,y:1},{x:3,y:1}];
test('batch 5 #15: cubic splines initialize partial sketches and reject absent sketches clearly',()=>{
  for(const sketch of [null,undefined,1,'sketch'])assert.throws(()=>addCubicSpline(sketch,splineTestControls),/^Error: Sketch is required$/);
  for(const sketch of [{},{points:[]},{entities:[]}]) {
    const entity=addCubicSpline(sketch,splineTestControls);
    assert.equal(sketch.entities[0],entity);assert.equal(sketch.points.length,4);
    assert.deepEqual(splineControls(entity,new Map(sketch.points.map(p=>[p.id,p]))).map(({x,y})=>({x,y})),splineTestControls);
  }
});

test('batch 5 #16: spline trim rejects incomplete sketches and invalid picks without mutation',()=>{
  for(const sketch of [null,undefined,{}, {points:[]},{entities:[]}])assert.equal(trimSplineAtLines(sketch,{}, {x:0,y:0}),false);
  for(const pick of [null,undefined,{}, {x:NaN,y:0},{x:Infinity,y:0},{x:0,y:NaN},{x:0,y:Infinity},{x:'1',y:0}]) {
    const sketch={points:[],entities:[]},entity=addCubicSpline(sketch,splineTestControls);
    sketch.points.push({id:'c',x:1.5,y:-1},{id:'d',x:1.5,y:2});sketch.entities.push({id:'line',type:'line',a:'c',b:'d'});
    const before=structuredClone(sketch);assert.equal(trimSplineAtLines(sketch,entity,pick),false);assert.deepEqual(sketch,before);
  }
  const sketch={points:[],entities:[]},entity=addCubicSpline(sketch,splineTestControls);
  sketch.points.push({id:'c',x:1.5,y:-1},{id:'d',x:1.5,y:2});sketch.entities.push({id:'line',type:'line',a:'c',b:'d'});
  assert.equal(trimSplineAtLines(sketch,entity,{x:.5,y:0}),true);assert.equal(sketch.entities.filter(e=>e.type==='spline').length,1);
});

test('batch 5 #17: BOM CSV quotes CR/LF/comma/quotes and omits absent header rows',()=>{
  for(const name of ['a\rb','a\nb','a\r\nb','a,b','a"b']) {
    const rows=[{item:1,quantity:2,name,material:'steel\rgrade'}],quoted='"'+name.replace(/"/g,'""')+'"';
    for(const headers of [null,undefined,[]]) {
      assert.equal(bomCsv(rows,headers,false),'1,2,'+quoted);
      assert.equal(bomCsv(rows,headers,true),'1,2,'+quoted+',"steel\rgrade"');
      assert.equal(bomCsv([],headers,false),'');
    }
    assert.equal(bomCsv(rows,['Item','Qty','Name','Material','Extra'],true),'Item,Qty,Name,Material\n1,2,'+quoted+',"steel\rgrade"');
  }
  assert.equal(bomCsv([{item:1,quantity:1,name:'plain'}],['I','Q','N'],false),'I,Q,N\n1,1,plain');
});

test('batch 5 #18: view duplication supports absent dimensions and deep-copies existing ones',()=>{
  for(const dims of [undefined,null,[],[{id:'d',viewId:'v',refs:[{u:1,v:2}]}]]) {
    const view={id:'v',dir:'front',x:20,y:30,configurationId:'cfg'},before={views:[view],...(dims===undefined?{}:{dims})};
    const h=historyHarness(structuredClone(before)),state={selection:{kind:'view',id:'v'}};
    const host={doc:()=>h.E.def,t:k=>k,pushUndo:label=>{h.bindings.pushUndo(label);h.E.def=structuredClone(h.E.def);},markDirty:noop};
    const copy=load(drawingSource,'duplicateSelectedView',{host,state,addViewToSheet,invalidate:noop})();
    assert.equal(copy.x,100);assert.equal(copy.y,30);assert.equal(copy.configurationId,'cfg');assert.equal(copy.primary,false);
    assert.deepEqual(state.selection,{kind:'view',id:copy.id});assert.equal(h.E.def.dims.length,(dims?.length||0)*2);
    if(dims?.length){assert.notEqual(h.E.def.dims[1].id,'d');assert.equal(h.E.def.dims[1].viewId,copy.id);assert.notEqual(h.E.def.dims[0].refs,h.E.def.dims[1].refs);}
    assertUndoRedo(h,before,structuredClone(h.E.def));
  }
});

test('batch 5 #19: hole callouts initialize notes on the document reacquired after undo',()=>{
  for(const replaceOnUndo of [false,true])for(const oldNote of [false,true]) {
    const first={...(oldNote?{notes:[{id:'old',feature:'hole',leader:{viewId:'v'}}]}:{})};
    let doc=first,undos=0,dirty=0;
    const state={},host={doc:()=>doc,t:k=>k,holeCallouts:()=>[{id:'hole',text:'Bore'}],
      pushUndo:()=>{undos++;if(replaceOnUndo)doc={};},markDirty:()=>dirty++,flash:noop};
    const place={id:'v',view:{},box:{x:20,y:30},toSheet:p=>({x:p.u||0,y:p.v||0})},before=structuredClone(first);
    const count=load(drawingSource,'addHoleCallouts',{host,state,scene:()=>({views:[place],primaryId:'v'}),
      holeLeaderForViews:()=>null,holeTopologyAnchor:()=>null,invalidate:noop})();
    assert.equal(count,1);assert.equal(undos,1);assert.equal(dirty,1);assert.equal(doc.notes.length,1);
    assert.equal(doc.notes[0].feature,'hole');assert.equal(doc.notes[0].leader,null);
    assert.deepEqual(state.selection,{kind:'note',id:doc.notes[0].id});
    if(replaceOnUndo)assert.deepEqual(first,before,'writes target the reacquired document');
  }
});

test('batch 5 #20: arc and ellipse helpers reject non-array point sets with geometry errors',()=>{
  for(const points of [null,undefined,{},'abc',{length:3},[],[{x:0,y:0}]]) {
    assert.throws(()=>drawingEllipseGeometry(points),/^Error: An ellipse needs center, major axis and minor radius points$/);
    assert.throws(()=>drawingArcGeometry(points),/^Error: An arc needs start, through and end points$/);
  }
  const ellipse=drawingEllipseGeometry([{x:0,y:0},{x:3,y:0},{x:0,y:2}]);
  assert.equal(ellipse.rx,3);assert.equal(ellipse.ry,2);
  const arc=drawingArcGeometry([{x:1,y:0},{x:0,y:1},{x:-1,y:0}]);assert.equal(arc.r,1);assert.equal(arc.cx,0);assert.equal(arc.cy,0);
});
