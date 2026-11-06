import { modelerSource } from "./helpers/modeler_source.mjs";
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sourceFunctionText } from './helpers/source_function.mjs';
import * as THREE from '../vendor/three/three.core.js';
import { KEY_TOOL, KEY_VIEW } from '../js/modeler_commands.js';
const source = name => name === 'modeler' ? modelerSource() : readFileSync(new URL('../js/' + name + '.js', import.meta.url), 'utf8');
function extract(file, name, bindings = {}) {
  const text = sourceFunctionText(source(file), name);
  return Function(...Object.keys(bindings), 'return (' + text + ')')(...Object.values(bindings));
}
function keyboard(E, extra = {}) {
  return extract('modeler', 'onKey', {
    E, root:null, document:{activeElement:null}, modelerDecisionOpen:()=>false, reportOpen:()=>false,
    handleSelectionFilterChord:()=>false, dynKey:()=>false, dynHasEntry:()=>false,
    KEY_TOOL, KEY_VIEW, isSketchObject:()=>false, isCanonicalAuthoring:()=>false, ...extra,
  });
}
const editor = () => ({open:true, mode:'3d', docType:'part', def:{parts:[]}});
test('modeler ignores keydown events that identify no key before any editor action', () => {
  const E = {...editor(), cutPending:true};
  let actions = 0;
  const key = keyboard(E, {modelerDecisionOpen:()=>{actions++; return false;}});
  for (const event of [undefined, null, {}, {key:undefined}, {key:null}, {key:42}, {key:''}]) {
    assert.doesNotThrow(()=>key(event));
  }
  assert.equal(actions,0);
  assert.deepEqual(E,{...editor(),cutPending:true});
});
test('stale Delete selection leaves bodies and undo history untouched', () => {
  const E=editor(), body={id:'keep'}; E.def.parts=[body]; E.sel={id:'stale'};
  keyboard(E)({key:'Delete',preventDefault:()=>assert.fail('must be a no-op')});
  assert.deepEqual(E.def.parts,[body]);
});
test('Delete still removes a selected document body', () => {
  const E=editor(), body={id:'remove'}; E.def.parts=[body]; E.sel=body;
  let undos=0;
  keyboard(E,{pushUndo:()=>undos++,t:x=>x,refreshAll:()=>{}})({key:'Delete',preventDefault:()=>{}});
  assert.deepEqual(E.def.parts,[]); assert.equal(undos,1);
});
test('B selects Box while P selects Paint', () => {
  const tools=[]; const key=keyboard(editor(),{setTool:t=>tools.push(t)});
  key({key:'b'}); key({key:'p'}); assert.deepEqual(tools,['rect','paint']);
});
test('an open report blocks the Box shortcut until Escape closes it', () => {
  const tools = [];
  let open = true, prevented = false;
  const key = keyboard(editor(), {
    reportOpen: () => open,
    closeReport: () => { open = false; },
    setTool: tool => tools.push(tool),
  });
  key({key:'b'});
  assert.deepEqual(tools, []);
  key({key:'Escape', preventDefault:() => { prevented = true; }});
  assert.equal(prevented, true);
  assert.equal(open, false);
  key({key:'b'});
  assert.deepEqual(tools, ['rect']);
});
test('drawing letter shortcuts ignore modifiers', () => {
  const selected=[];
  const key=extract('modeler_drawing','keyDown',{setTool:x=>selected.push(x)});
  for(const modifier of ['ctrlKey','metaKey','altKey']) for(const letter of ['a','b','c','d','f','v','n','s','h']) {
    assert.equal(key({key:letter,[modifier]:true}),false);
  }
  key({key:'b'}); assert.deepEqual(selected,['baseline']);
});
test('Ctrl+B and Command+B reach regenerate in drawing mode', () => {
  let calls=0; const E={...editor(),mode:'drawing'};
  const key=keyboard(E,{regenerateExactModel:()=>calls++});
  for(const modifier of ['ctrlKey','metaKey'])key({key:'b',[modifier]:true,preventDefault:()=>{}});
  assert.equal(calls,2);
});
test('invalid imported positions never fall through to a profile', () => {
  const bounds=extract('modeler_part_geometry','basePartBounds',{isKernelBody:()=>false});
  for(const kind of ['mesh','direct'])for(const meshData of [undefined,{}, {positions:[]},{positions:[NaN,0,0,1,Infinity,2]}]) {
    assert.deepEqual(bounds({kind,meshData}),{x0:0,x1:0,y0:0,y1:0,z0:0,z1:0});
  }
  assert.deepEqual(bounds({kind:'mesh',meshData:{positions:[NaN,0,0,1,2,3,4,5,6]}}),{x0:1,x1:4,y0:2,y1:5,z0:3,z1:6});
});
test('drafted and cut part size uses exact kernel bounds before any merge', () => {
  const bounds=extract('modeler_part_geometry','basePartBounds',{isKernelBody:()=>false});
  const part={kind:'ext',axis:'z',from:0,to:-4.3815,pts:[{u:-6.2239,v:-6.2239},{u:6.2239,v:-6.2239},{u:6.2239,v:6.2239},{u:-6.2239,v:6.2239}],
    draftAngle:5,cuts3d:[{kind:'revolveCut'}],meshData:{exactBounds:{min:{x:-6.551,y:-6.551,z:-4.3815},max:{x:6.551,y:6.551,z:0}}}};
  assert.deepEqual(bounds(part),{x0:-6.551,x1:6.551,y0:-6.551,y1:6.551,z0:-4.3815,z1:0});
  assert.notEqual(bounds({...part,meshData:null}).x1,bounds(part).x1);
});
test('unsupported mirror representations are refused without mutation', () => {
  const mirror=extract('modeler_part_geometry','mirrorProjectionPart',{isKernelBody:q=>q.kind==='kernel'});
  for(const q of [{kind:'mesh'},{kind:'direct',meshData:{}},{kind:'kernel'},{kind:'ext',cuts3d:[{}]}]) {
    const before=structuredClone(q); assert.equal(mirror(q,'plane:right'),null); assert.deepEqual(q,before);
  }
  assert.deepEqual(mirror({kind:'box',x0:2,x1:5},'plane:right'),{kind:'box',x0:-5,x1:-2});
});
test('legacy lofts survive feature reconstruction with both sections on every axis', () => {
  const rebuild=extract('modeler','rebuildFeatureTreeFromDocument',{
    activeParts:d=>d.parts,addFeature:(d,f)=>(d.features.push(f),f),
    emitPartMerges:(_d,_p,f)=>f,emitPartPatternTurn:(_d,_p,f)=>f,fin:Number.isFinite,
  });
  for(const axis of ['x','y','z']) {
    const d={parts:[{id:'l',kind:'loft',axis,from:2,to:7,pts0:[{u:1,v:3},{u:3,v:3},{u:1,v:5}],pts1:[{u:4,v:6},{u:5,v:6},{u:4,v:7}]}]};
    const f=rebuild(d); assert.equal(f.type,'loft'); assert.equal(f.params.solid,true); assert.equal(f.params.ruled,true);
    const expected=axis==='x'?[[2,3,1],[7,6,4]]:axis==='y'?[[1,2,3],[4,7,6]]:[[1,3,2],[4,6,7]];
    assert.deepEqual(f.params.sections.map(s=>Object.values(s[0])),expected);
  }
});
test('exact meshes smooth supplied facet normals while preserving sharp corners', () => {
  const smooth=extract('modeler_mesh_geometry','smoothTessellationNormals',{THREE});
  const build=extract('modeler_mesh_geometry','buildExactMesh',{THREE,smoothTessellationNormals:smooth,fin:Number.isFinite,hexNum:()=>0xffffff});
  const raw=new THREE.CylinderGeometry(1,1,2,32).toNonIndexed(); raw.computeVertexNormals();
  const p={kind:'kernel',meshData:{positions:raw.attributes.position.array,normals:raw.attributes.normal.array}};
  const mesh=build(new THREE.Group(),p);
  assert.notDeepEqual(mesh.geometry.attributes.normal.array,raw.attributes.normal.array);
  const box=new THREE.BoxGeometry().toNonIndexed(); box.computeVertexNormals(); const before=box.attributes.normal.array.slice();
  smooth(box); assert.ok(box.attributes.normal.array.every((n,i)=>Math.abs(n-before[i])<1e-6));
});

test('the exact mesh renders the same indexed triangles used by host drawings', () => {
  const build=extract('modeler_mesh_geometry','buildExactMesh',{
    THREE,smoothTessellationNormals:g=>g,fin:Number.isFinite,hexNum:()=>0xffffff,
  });
  const meshData={positions:[0,0,0,11.43,0,0,11.43,2,0,0,2,0],indices:[0,1,2,0,2,3]};
  const {geometry}=build(new THREE.Group(),{meshData});
  assert.deepEqual(Array.from(geometry.index.array),meshData.indices);
  assert.equal(geometry.attributes.position.getX(1),Math.fround(11.43));
});

const partBoundsForTest=extract('modeler_part_geometry','basePartBounds',{isKernelBody:()=>false,framePoint});
const mirrorForTest=extract('modeler_part_geometry','mirrorProjectionPart',{
  isKernelBody:q=>q.kind==='kernel',basePartBounds:partBoundsForTest,cloneData:structuredClone,
  mirrorExtrusionSpan:extract('modeler_part_geometry','mirrorExtrusionSpan',{}),
  reflectProjectionMesh:extract('modeler_part_geometry','reflectProjectionMesh',{clearMeshProjectionCache:()=>{},clearTopologyCache:()=>{}}),
});
import { frameFromPlane, framePoint, frameCross, frameDot } from '../js/core/frame.js';
import { makeBrepExtrusion, shapeToMeshData, disposeBrep } from '../js/cad_kernel.js';
test('missing and empty profiles return finite empty bounds',()=>{
  for(const pts of [undefined,null,[],{}])assert.deepEqual(partBoundsForTest({kind:'ext',pts}),{x0:0,x1:0,y0:0,y1:0,z0:0,z1:0});
});
test('framed mirrors reflect every profile point and retain a right-handed frame',async()=>{
  const seed={kind:'ext',axis:'frame',frame:frameFromPlane({x:5,y:6,z:7},{x:1,y:2,z:3}),from:2,to:5,
    pts:[{u:0,v:0},{u:4,v:0},{u:0,v:3}],support:{ownerFeatureId:'seed'}};
  for(const [plane,axis] of [['right','x'],['top','y'],['front','z']]){
    const copy=mirrorForTest(structuredClone(seed),'plane:'+plane);
    assert.equal(copy.support,undefined);
    assert.ok(Math.abs(frameDot(frameCross(copy.frame.xAxis,copy.frame.yAxis),copy.frame.normal)-1)<1e-8);
    assert.ok(copy.from < copy.to);
    for(const p of seed.pts)for(const [before,after] of [[seed.from,copy.to],[seed.to,copy.from]]){
      const expected=framePoint(seed.frame,p.u,p.v,before);expected[axis]*=-1;
      const actual=framePoint(copy.frame,p.u,p.v,after);
      for(const key of ['x','y','z'])assert.ok(Math.abs(actual[key]-expected[key])<1e-8);
    }
    const solid=await makeBrepExtrusion({...copy,points:copy.pts});
    try {
      const mesh=await shapeToMeshData(solid), bounds=partBoundsForTest(copy);
      for(const [i,key] of ['x','y','z'].entries()){
        const values=mesh.positions.filter((_v,j)=>j%3===i);
        assert.ok(Math.abs(Math.min(...values)-bounds[key+'0'])<1e-5);
        assert.ok(Math.abs(Math.max(...values)-bounds[key+'1'])<1e-5);
      }
    }finally{disposeBrep(solid);}
  }
});
test('mesh mirrors reflect normals, winding, bounds and exact import provenance',()=>{
  for(const [plane,axis,index] of [['right','x',0],['top','y',1],['front','z',2]]){
    const seed={kind:'mesh',meshData:{positions:new Float32Array([1,2,3,4,2,3,1,5,3]),normals:new Float32Array([0,0,1,0,0,1,0,0,1]),colors:[1,0,0,0,1,0,0,0,1]}};
    const copy=mirrorForTest(structuredClone(seed),'plane:'+plane);
    const expected=Array.from(seed.meshData.positions);for(let i=index;i<expected.length;i+=3)expected[i]*=-1;
    assert.deepEqual(Array.from(copy.meshData.positions),[...expected.slice(0,3),...expected.slice(6,9),...expected.slice(3,6)]);
    assert.deepEqual(copy.meshData.colors,[1,0,0,0,0,1,0,1,0]);
    const a=new THREE.Vector3().fromArray(copy.meshData.positions,0),b=new THREE.Vector3().fromArray(copy.meshData.positions,3),c=new THREE.Vector3().fromArray(copy.meshData.positions,6);
    assert.ok(b.sub(a).cross(c.sub(a)).normalize().dot(new THREE.Vector3().fromArray(copy.meshData.normals))>.999);
    assert.deepEqual(copy.mirrorImportAxes,[axis]);assert.deepEqual(copy.mirrorImportSeed.bounds,partBoundsForTest(seed));
    const twice=mirrorForTest(copy,'plane:'+plane);
    assert.deepEqual(twice.meshData.positions,seed.meshData.positions);
  }
});
test('mirrored imports rebuild as source plus exact reflection',()=>{
  const rebuild=extract('modeler','rebuildFeatureTreeFromDocument',{
    activeParts:d=>d.parts,addFeature:(d,f)=>(d.features.push(f),f),
    emitPartMerges:(_d,_p,f)=>f,emitPartPatternTurn:(_d,_p,f)=>f,fin:Number.isFinite,
    isKernelBody:()=>false,cloneData:structuredClone,partBounds:partBoundsForTest,
  });
  const seed={id:'mesh',featureId:'mesh-feature',kind:'direct',sourcePayload:{format:'brep',text:'retained-source'},meshData:{positions:[1,2,3,4,2,3,1,5,3]}};
  const copy=mirrorForTest(structuredClone(seed),'plane:front'),doc={parts:[copy]};
  const result=rebuild(doc);
  assert.equal(doc.features[0].type,'import');
  assert.deepEqual(doc.features[0].params.sourcePayload,seed.sourcePayload);
  assert.deepEqual(doc.features[0].params.bounds,{min:{x:1,y:2,z:3},max:{x:4,y:5,z:3}});
  assert.equal(result.type,'mirror');assert.deepEqual(result.inputs,['mesh-feature']);
  assert.deepEqual(result.params.plane.normal,{x:0,y:0,z:1});assert.equal(result.params.keepOriginal,false);
});
