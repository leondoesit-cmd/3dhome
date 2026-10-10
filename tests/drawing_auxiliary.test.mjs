import test from 'node:test';
import assert from 'node:assert/strict';
import {auxiliaryFaceCandidates,resolveAuxiliaryBasis} from '../js/core/drawing_auxiliary.js';
import {viewBasis,projectSolid,projectionBounds,ORTHO_VIEWS} from '../js/core/hidden_line.js';
import {createView,createSheetDoc,createTopologyIndex,createProjector,buildSheetScene,sceneToSvg,removeViewFromSheet} from '../js/cad_sheet.js';
import {makeBrepExtrusion,extractBrepTopology,shapeToMeshData,disposeBrep} from '../js/cad_kernel.js';
import {tessellateParts} from '../js/core/part_tessellate.js';
import {createDrawingController} from '../js/modeler_drawing.js';
import {ensureSheetDoc} from '../js/cad_sheet.js';

const dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
function fixture(dir='front') {
  const parent=createView(dir,{id:'p',primary:true}),b=viewBasis(dir);
  const vector=(x,y)=>({x:b.right.x*x+b.up.x*y,y:b.right.y*x+b.up.y*y,z:b.right.z*x+b.up.z*y});
  const edge={persistentId:'edge',kind:'edge',descriptor:{curve:'line',endpoints:[vector(3,0),vector(0,4)]}};
  const face={persistentId:'face',kind:'face',descriptor:{surface:'plane',origin:vector(3,0),normal:vector(.8,.6)}};
  const child=createView('auxiliary',{id:'a',parent:'p',auxiliary:{from:'p',edgeReference:{pid:'edge'},faceReference:{pid:'face'},flip:false}});
  const doc=createSheetDoc();doc.views=[parent,child];return {parent,child,doc,index:createTopologyIndex([edge,face])};
}
test('all principal parents yield genuine orthonormal Auxiliary face basis, including flip',()=>{
  for(const dir of ORTHO_VIEWS) {
    const f=fixture(dir),b=resolveAuxiliaryBasis(f.child,f.doc,f.index);
    near(dot(b.forward,b.up),0);near(dot(b.forward,b.right),0);near(dot(b.up,b.right),0);
    near(dot(b.forward,b.forward),1);near(dot(b.up,b.up),1);near(dot(b.right,b.right),1);
    near(dot(b.forward,f.index.get('face').descriptor.normal),1);
    f.child.auxiliary.flip=true;near(dot(resolveAuxiliaryBasis(f.child,f.doc,f.index).forward,b.forward),-1);
  }
  assert.throws(()=>viewBasis({forward:{x:0,y:0,z:0},up:{x:0,y:1,z:0}}));
  assert.throws(()=>viewBasis({forward:{x:0,y:1,z:0},up:{x:0,y:1,z:0}}));
});
test('missing/nonplanar/modified/reference ownership inputs never fall back to Front',()=>{
  const f=fixture();f.child.auxiliary.faceReference.pid='missing';assert.throws(()=>resolveAuxiliaryBasis(f.child,f.doc,f.index));
  f.child.auxiliary.faceReference.pid='face';f.index.get('face').descriptor.surface='cylinder';assert.throws(()=>resolveAuxiliaryBasis(f.child,f.doc,f.index));
  f.index.get('face').descriptor.surface='plane';f.parent.cropSketch={};assert.throws(()=>auxiliaryFaceCandidates(f.parent,'edge',f.index));
  f.parent.cropSketch=null;f.index.get('edge').partId='one';f.index.get('face').partId='two';assert.deepEqual(auxiliaryFaceCandidates(f.parent,'edge',f.index),[]);
});
test('persistent Auxiliary references follow an upstream slope change and diagnose removed sources',()=>{
  const f=fixture(),before=resolveAuxiliaryBasis(f.child,f.doc,f.index);
  f.index.get('edge').descriptor.endpoints=[{x:4,y:0,z:0},{x:0,y:3,z:0}];
  f.index.get('face').descriptor.origin={x:4,y:0,z:0};f.index.get('face').descriptor.normal={x:.6,y:.8,z:0};
  assert.notDeepEqual(resolveAuxiliaryBasis(f.child,f.doc,f.index).forward,before.forward);
  const bodies=tessellateParts([{kind:'box',x0:0,x1:4,y0:0,y1:3,z0:0,z1:2}]);
  const invalid=buildSheetScene(f.doc,{projection:createProjector(f.doc,bodies,{topology:[]})});
  assert.ok(invalid.diagnostics.some(i=>i.code==='auxiliary-reference-unavailable'));
});
test('arbitrary-basis projected circle is round only down the actual inclined normal',()=>{
  const f=fixture(),b=resolveAuxiliaryBasis(f.child,f.doc,f.index);
  const body=tessellateParts([{kind:'cyl',x:0,y:0,z:0,r:1,h:2,axis:b.forward}]);
  assert.ok(projectSolid(body,b).circles.some(c=>c.kind==='round'));
  assert.ok(!projectSolid(body,'front').circles.some(c=>c.kind==='round'));
});
test('native 30–40–50 wedge yields true 20×50 mm inclined face and cold shared SVG',async()=>{
  const body=await makeBrepExtrusion({axis:'z',from:0,to:2,points:[{u:0,v:0},{u:3,v:0},{u:0,v:4}]});
  try {
    const topology=extractBrepTopology(body,{featureId:'wedge'}).topology,index=createTopologyIndex(topology),parent=createView('front',{id:'p',primary:true});
    const edge=topology.find(e=>e.kind==='edge'&&e.descriptor?.curve==='line'&&Math.abs(e.descriptor.measure-5)<1e-6&&auxiliaryFaceCandidates(parent,e.persistentId,index).length);
    assert.ok(edge,'actual native inclined edge is selectable');
    const face=auxiliaryFaceCandidates(parent,edge.persistentId,index)[0];near(face.descriptor.measure,10);
    const child=createView('auxiliary',{id:'a',parent:'p',auxiliary:{from:'p',edgeReference:{pid:edge.persistentId},faceReference:{pid:face.persistentId},flip:false}});
    const doc=createSheetDoc();doc.views=[parent,child];
    doc.dims=[{id:'true-length',viewId:'a',type:'vertical',refs:[{pid:edge.persistentId,kind:'edge',at:'a',u:0,v:0},{pid:edge.persistentId,kind:'edge',at:'b',u:0,v:0}],offset:12}];
    const mesh=await shapeToMeshData(body,{deflection:.05,angle:.1}),bodies=[{positions:mesh.positions}],project=createProjector(doc,bodies,{topology});
    const bounds=projectionBounds(project(child));near(bounds.u1-bounds.u0,2);near(bounds.v1-bounds.v0,5);
    const scene=buildSheetScene(doc,{projection:project,topology}),cold=JSON.parse(JSON.stringify(doc));
    assert.ok(sceneToSvg(scene).includes('>50<'),'native bound edge dimension reads true 50 mm in Auxiliary');
    assert.equal(sceneToSvg(scene),sceneToSvg(buildSheetScene(cold,{projection:createProjector(cold,bodies,{topology}),topology})));
    assert.ok(scene.items.some(i=>i.auxiliarySight),'sight direction is tied to the real native parent edge');
    const sight=scene.items.find(i=>i.auxiliarySight),normal=resolveAuxiliaryBasis(child,doc,index).forward;
    assert.ok((sight.x2-sight.x1)*normal.x-(sight.y2-sight.y1)*normal.y<0,'sight arrow looks toward face, opposite forward-to-viewer');
    const authored={drawing:{...doc,views:[parent]},parts:[]},snapshots=[];
    let controller,revision=1,dialogResolve;
    controller=createDrawingController({canvas:()=>({}),width:()=>900,height:()=>600,
      doc:()=>ensureSheetDoc(authored),bodies:()=>bodies,bodiesToken:()=>revision,topology:()=>topology,
      t:key=>key,flash:()=>{},refresh:()=>{},markDirty:()=>controller.invalidate(),
      pushUndo:()=>{snapshots.push(JSON.stringify(authored.drawing));ensureSheetDoc(authored);},
      promptFields:async(_,fields)=>revision===1?{face:fields[0].choices[0].value,flip:false}:new Promise(resolve=>{dialogResolve=resolve;})});
    controller.fit();const placement=controller.scene().views[0],ends=edge.descriptor.endpoints;
    const uv=ends.map(p=>({u:p.x,v:p.y})),at=placement.toSheet({u:(uv[0].u+uv[1].u)/2,v:(uv[0].v+uv[1].v)/2});
    controller.setTool('auxiliary');controller.pointerDown({button:0},at.x*controller.state.zoom+controller.state.ox,at.y*controller.state.zoom+controller.state.oy);
    await new Promise(resolve=>setImmediate(resolve));
    const live=authored.drawing.views.find(v=>v.auxiliary);assert.ok(live,'ordinary edge/face UI creates genuine child');
    assert.ok(controller.scene().views.find(p=>p.id===live.id).projection);
    assert.equal(snapshots.length,1);
    const saved=JSON.parse(JSON.stringify(authored.drawing));assert.ok(createProjector(saved,bodies,{topology})(saved.views.find(v=>v.id===live.id)));
    revision=2;controller.invalidate();const currentParent=controller.scene().views.find(p=>p.id===parent.id),click=currentParent.toSheet({u:(uv[0].u+uv[1].u)/2,v:(uv[0].v+uv[1].v)/2});
    controller.pointerDown({button:0},click.x*controller.state.zoom+controller.state.ox,click.y*controller.state.zoom+controller.state.oy);
    assert.ok(dialogResolve);revision=3;dialogResolve({face:face.persistentId,flip:false});
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(authored.drawing.views.length,2,'stale native face selector must not add another child');
    const details=createView('auxiliary',{id:'detail',parent:'a',detail:{from:'a',u:1,v:0,radius:1}});doc.views.push(details);
    removeViewFromSheet(doc,'p');assert.equal(doc.views.length,0,'Auxiliary and downstream Detail are genuine dependencies');
  } finally {disposeBrep(body);}
});
