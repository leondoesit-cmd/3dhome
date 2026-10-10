import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {alternatePositionBodies,canAlternatePosition} from '../js/core/drawing_alternate_position.js';
import {createView,createSheetDoc,createProjector,buildSheetScene,sceneToSvg,measureDim,ensureSheetDoc,LINE_STYLES} from '../js/cad_sheet.js';
import {createDrawingController} from '../js/modeler_drawing.js';
import {ensureAssemblyDrawingDoc} from '../js/core/assembly_drawing_settings.js';
import {projectionBounds} from '../js/core/hidden_line.js';
import {tessellateParts} from '../js/core/part_tessellate.js';
import {makeBrepExtrusion,shapeToMeshData,disposeBrep} from '../js/cad_kernel.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const pose={version:1,label:'Raised <arm>',scope:'selected',bodyIds:['arm'],sourceConfigurationId:null,translation:{x:5,y:0,z:0},rotation:{x:0,y:0,z:90},pivot:{x:0,y:0,z:0}};
const box=()=>tessellateParts([{id:'arm',kind:'box',x0:0,x1:3,y0:0,y1:1,z0:0,z1:1}]);
const docFor=()=>{const doc=createSheetDoc({scale:'1:1',views:[]});doc.views=[createView('front',{id:'p',primary:true,alternatePosition:structuredClone(pose)})];return doc;};

test('Alternate Position transforms current real bodies about explicit pivot without mutating geometry or identities',()=>{
  const bodies=box(),bytes=JSON.stringify(bodies),view=docFor().views[0],alt=alternatePositionBodies(bodies,view);
  assert.equal(alt[0].id,'arm');near(Math.min(...alt[0].positions.filter((_,i)=>i%3===0)),4);near(Math.max(...alt[0].positions.filter((_,i)=>i%3===1)),3);
  assert.equal(JSON.stringify(bodies),bytes);
  view.alternatePosition.pivot={x:1,y:0,z:0};const pivoted=alternatePositionBodies(bodies,view);near(pivoted[0].positions[0],6-bodies[0].positions[1]);
  for(const dir of ['front','back','top','bottom','left','right','iso','isorear','isoleft'])assert.ok(canAlternatePosition({...view,dir}));
  for(const field of ['section','detail','cropSketch','brokenOut','breakView','auxiliary','exploded'])assert.equal(canAlternatePosition({...view,[field]:{}}),false);
});

test('shared sheet uses phantom overlay, union layout and base-source dimension/snaps with cold SVG equality',()=>{
  const bodies=box(),doc=docFor();doc.dims=[{id:'base',type:'horizontal',auto:'extent',viewId:'p',refs:[],offset:12}];
  const build=d=>buildSheetScene(d,{projection:createProjector(d,bodies)}),scene=build(doc),place=scene.views[0];
  const base=projectionBounds(place.projection),alt=projectionBounds(place.projection.alternatePosition.projection);
  near(base.u1-base.u0,3);near(alt.u0,4);near(alt.u1,5);near(alt.v1,3);
  assert.equal(measureDim(scene.dims.get('base').dim),3);assert.ok(scene.items.some(i=>i.style==='phantom'&&i.alternatePosition));
  for(const p of [{u:0,v:0},{u:5,v:3}]){const s=place.toSheet(p);assert.ok(s.x>=place.box.x-1e-6&&s.x<=place.box.x+place.box.w+1e-6);assert.ok(s.y>=place.box.y-1e-6&&s.y<=place.box.y+place.box.h+1e-6);}
  const svg=sceneToSvg(scene);assert.match(svg,/stroke-dasharray="10 2 2 2 2 2"/);assert.match(svg,/Raised &lt;arm&gt;/);assert.equal(svg,sceneToSvg(build(JSON.parse(JSON.stringify(doc)))));
  assert.deepEqual(LINE_STYLES.phantom.dash,[10,2,2,2,2,2]);
  doc.views[0].alternatePosition=null;assert.equal(build(doc).items.some(i=>i.alternatePosition),false);
});

test('missing identities, source configuration changes and incompatible composition diagnose instead of displaying substitute overlay',()=>{
  const doc=docFor(),bodies=box();
  for(const change of [{bodyIds:['missing']},{sourceConfigurationId:'other'},{bodyIds:['arm','arm']},{translation:{x:NaN,y:0,z:0}},{scope:'invalid'},{rotation:{x:0,y:0,z:0},translation:{x:0,y:0,z:0}}]) {
    const d=structuredClone(doc);Object.assign(d.views[0].alternatePosition,change);const scene=buildSheetScene(d,{projection:createProjector(d,bodies)});
    assert.ok(scene.diagnostics.some(i=>i.code==='invalid-alternate-position'));assert.ok(!scene.items.some(i=>i.alternatePosition));assert.ok(scene.views[0].projection.visible.length,'valid base is preserved with explicit overlay error');
  }
  const d=structuredClone(doc);d.views[0].alternatePosition.scope='all';assert.throws(()=>alternatePositionBodies([...bodies,{...bodies[0],id:'new'}],d.views[0]),/body set changed/);
  assert.throws(()=>alternatePositionBodies([...bodies,bodies[0]],doc.views[0]),/unique persistent/);
  doc.views.push(createView('front',{id:'detail',detail:{from:'p',u:1,v:.5,radius:.4}}));const project=createProjector(doc,bodies);assert.equal(project(doc.views[1]).alternatePosition,undefined,'a Detail does not inherit uncropped overlay ink');
});

test('real native extrusion rebuild drives alternate geometry and keeps source configuration selection',async()=>{
  let shape;
  const native=async width=>{if(shape)disposeBrep(shape);shape=await makeBrepExtrusion({axis:'z',from:0,to:1,points:[{u:0,v:0},{u:width,v:0},{u:width,v:1},{u:0,v:1}]});const mesh=await shapeToMeshData(shape,{deflection:.01,angle:.1});return [{id:'arm',positions:mesh.positions,faceRanges:mesh.faceRanges}];};
  try {
    const doc=docFor();doc.views[0].configurationId='active-arm';doc.views[0].alternatePosition.sourceConfigurationId='active-arm';
    let bodies=await native(3),bytes=JSON.stringify(bodies),calls=[];
    const project=()=>createProjector(doc,[],{bodiesForView:v=>{calls.push(v.configurationId);return bodies;}})(doc.views[0]);
    near(projectionBounds(project().alternatePosition.projection).v1,3);assert.equal(JSON.stringify(bodies),bytes);
    bodies=await native(4);near(projectionBounds(project().alternatePosition.projection).v1,4);assert.ok(calls.every(id=>id==='active-arm'));
    doc.views[0].configurationId='different';assert.match(project().alternatePositionError,/configuration/);
  }finally{if(shape)disposeBrep(shape);}
});

test('normalized actual controller applies/edits/removes only presentation metadata and rejects stale/cancelled forms',async()=>{
  const def={name:'Alternate fixture',drawing:docFor(),parts:[]},bodies=box(),source=JSON.stringify(bodies),steps=[],messages=[];def.drawing.views[0].alternatePosition=null;
  let token=1,answer={label:'Study pose',body:'arm',translationx:'50',translationy:'0',translationz:'0',rotationx:'0',rotationy:'0',rotationz:'90',pivotx:'0',pivoty:'0',pivotz:'0'},mutate=false;
  const host={doc:()=>ensureSheetDoc(def),bodies:()=>bodies,bodiesToken:()=>token,canvas:()=>({}),width:()=>900,height:()=>600,t:x=>x,flash:m=>messages.push(m),refresh(){},markDirty(){},pushUndo:label=>{steps.push({label,snapshot:JSON.stringify(def.drawing)});ensureSheetDoc(def);},promptFields:async()=>{if(mutate)token++;return answer;}};
  const c=createDrawingController(host);c.state.zoom=1;const click=()=>{const p=c.scene().views[0].toSheet({u:.5,v:.5});c.pointerDown({button:0},p.x,p.y);};
  c.setTool('alternateposition');click();await new Promise(resolve=>setImmediate(resolve));assert.equal(steps.length,1,messages.join(';'));assert.equal(host.doc().views[0].alternatePosition.translation.x,5);
  answer={...answer,translationx:'60'};click();await new Promise(resolve=>setImmediate(resolve));assert.equal(steps.length,2);assert.equal(host.doc().views[0].alternatePosition.translation.x,6);
  c.setTool('removealternateposition');click();assert.equal(steps.length,3);assert.equal(host.doc().views[0].alternatePosition,null);
  def.drawing=JSON.parse(steps[2].snapshot);assert.equal(host.doc().views[0].alternatePosition.translation.x,6);
  mutate=true;c.setTool('alternateposition');click();await new Promise(resolve=>setImmediate(resolve));assert.equal(steps.length,3);assert.match(messages.at(-1),/changed/);
  mutate=false;answer=null;click();await new Promise(resolve=>setImmediate(resolve));assert.equal(steps.length,3);assert.equal(JSON.stringify(bodies),source);
});

test('actual assembly drawing mesh identities distinguish repeated nested occurrences and match standalone export',()=>{
  const source=fs.readFileSync(new URL('../js/modeler.js',import.meta.url),'utf8'),start=source.indexOf('function drawingBodies()'),end=source.indexOf('\nfunction ',start+1),code=source.slice(start,end);
  const root={userData:{}},top={userData:{cadComponent:10},parent:root},nested={userData:{cadSubComponent:20},parent:top};
  const mesh=path=>({isMesh:true,userData:{cadPart:'arm'},parent:path,matrixWorld:{elements:[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]}});
  const objects=[mesh(nested),mesh({userData:{cadComponent:11},parent:root})];
  class Group {updateMatrixWorld(){} traverse(fn){objects.forEach(fn);}}
  const context={E:{def:{parts:[]},docType:'assembly',assembly:{}},THREE:{Group},threeLoaded:()=>true,renderedParts:()=>[],partPatternRotations:()=>[],buildAssembly(){},meshWorldTriangles:()=>box()[0].positions,clearGroup(){},tessellateParts,sheetSharpSolids:false};
  vm.runInNewContext(code+'; globalThis.bodies=drawingBodies();',context);
  assert.deepEqual(Array.from(context.bodies,b=>b.id),['10/20:arm','11:arm']);assert.match(source,/id: occurrence\.path\.join\('\/'\) \+ ":" \+ part\.id/);
  assert.match(source,/data-drawing-tool="alternateposition"/);assert.match(source,/data-drawing-tool="removealternateposition"/);
});

test('actual drawing owner persists assembly overlays and stored SVG export uses that same sheet',()=>{
  const source=fs.readFileSync(new URL('../js/modeler.js',import.meta.url),'utf8');
  const helper=source.slice(source.indexOf('function drawingDocument()'),source.indexOf('function drawingSheet()'));
  const svgCode=source.slice(source.indexOf('function drawingSvgContent()'),source.indexOf('function drawingSvgFilename()'));
  const E={docType:'assembly',assembly:{name:'Native repeated assembly',components:[{id:10},{id:11}]},def:{name:'Unrelated part',parts:[]}},partBefore=JSON.stringify(E.def);
  let fresh=0,stored=0;
  const context={E,ensureSheetDoc,ensureAssemblyDrawingDoc,drawingSheet:()=>({svg:()=>{stored++;return 'stored-overlay-svg';}}),assemblyDrawingDocument:()=>({def:{parts:[{}]}}),buildDrawingScene:()=>{fresh++;return {};},sceneToSvg:()=> 'fresh-sheet',assemblyExplodeLines:()=>[],t:x=>x};
  vm.runInNewContext(helper+svgCode,context);
  assert.equal(context.drawingSvgContent(),'fresh-sheet');assert.equal(fresh,1);
  const doc=context.drawingDocument();assert.deepEqual(Array.from(doc.views,v=>v.dir),['front','top','right','iso']);assert.equal(doc.title.title,E.assembly.name);
  doc.views[0].alternatePosition=structuredClone(pose);
  E.assembly=JSON.parse(JSON.stringify(E.assembly));assert.deepEqual(context.drawingDocument().views[0].alternatePosition,pose);
  assert.equal(context.drawingSvgContent(),'stored-overlay-svg');assert.equal(stored,1);assert.equal(fresh,1);assert.equal(JSON.stringify(E.def),partBefore);
  E.docType='part';assert.equal(context.drawingDocument(),E.def.drawing);assert.equal(E.def.drawing.assemblyLayout,false);
});
