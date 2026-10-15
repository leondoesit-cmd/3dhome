import test from 'node:test';
import assert from 'node:assert/strict';
import {canBreakOutView,brokenOutDepthRange,projectBrokenOutView,clipBreakBoundaryToBodies} from '../js/core/drawing_broken_out.js';
import fs from 'node:fs';
import {compileKernelFeatureTree} from '../js/core/kernel_feature_adapter.js';
import {regenerateFeatures,releaseRegeneration} from '../js/cad_feature_tree.js';
import {shapeToMeshData,validateBrepForExport} from '../js/cad_kernel.js';
import {cropDrawingProjection,pointInCrop,cropSplinePoints} from '../js/core/drawing_crop.js';
import {projectSolid} from '../js/core/hidden_line.js';
import {tessellateParts} from '../js/core/part_tessellate.js';
import {createView,createSheetDoc,createProjector,buildSheetScene,sceneToSvg} from '../js/cad_sheet.js';

const ring=(u)=>Array.from({length:48},(_,i)=>({u:u+Math.cos(i*Math.PI/24),v:Math.sin(i*Math.PI/24)}));
const bodies=tessellateParts([
  {kind:'ext',axis:'z',from:0,to:1,pts:[{u:-6,v:-4},{u:6,v:-4},{u:6,v:4},{u:-6,v:4}],holes:[ring(0),ring(4)]},
  {kind:'box',x0:-6,x1:6,y0:-4,y1:4,z0:1,z1:2}
]);
const sketch={type:'closed-spline',closed:true,points:[{u:-2,v:-2},{u:2,v:-2},{u:2,v:2},{u:-2,v:2}]};
const modifier=depth=>({sketch,depth,datum:'front-envelope'});
const view=depth=>createView('front',{id:'p',brokenOut:modifier(depth)});

test('break boundary clips to projected material, leaving through holes and gaps empty inside bounding box',()=>{
  const pierced=tessellateParts([{kind:'ext',axis:'z',from:0,to:1,pts:[{u:-3,v:-2},{u:3,v:-2},{u:3,v:2},{u:-3,v:2}],holes:[ring(0)]}]);
  const segments=clipBreakBoundaryToBodies([{u:-4,v:0},{u:4,v:0},{u:4,v:.3},{u:-4,v:.3}],pierced,'front');
  assert.ok(segments.length>=4);
  for(const e of segments)for(let i=0;i<=10;i++){
    const u=e.a.u+(e.b.u-e.a.u)*i/10,v=e.a.v+(e.b.v-e.a.v)*i/10;
    assert.ok(Math.abs(u)<=3+1e-8);assert.ok(Math.hypot(u,v)>=.99,'through hole has no break line');
  }
});

test('native mobile stepped tube ends visible break line at silhouette while keeping closed removal spline',async()=>{
  const def=JSON.parse(fs.readFileSync(new URL('./fixtures/broken-out-stepped-tube.json',import.meta.url)));
  const compiled=compileKernelFeatureTree(def),run=await regenerateFeatures({...compiled.document,features:compiled.features});
  try {
    const solid=run.results.get(def.features.at(-1).id);assert.equal((await validateBrepForExport(solid)).solidCount,1);
    const mesh=await shapeToMeshData(solid),doc=def.drawing,original=JSON.stringify(doc.views[0].brokenOut);
    const projector=createProjector(doc,[mesh]),projection=projector(doc.views[0]),scene=buildSheetScene(doc,{projection:projector});
    assert.ok(projection.brokenOutBoundary.some(p=>p.v>2.5),'closed removal shape remains above stock');
    assert.ok(projection.brokenOutBoundarySegments.length<projection.brokenOutBoundary.length);
    for(const e of projection.brokenOutBoundarySegments)for(const p of[e.a,e.b])assert.ok(p.v<=2+1e-7,'visible break line stops at actual silhouette');
    const meshTop=Math.max(...Array.from(mesh.positions).filter((_,i)=>i%3===1));
    assert.ok(projection.brokenOutBoundarySegments.some(e=>Math.abs(e.a.v-meshTop)<1e-7 || Math.abs(e.b.v-meshTop)<1e-7));
    const placed=scene.views[0];
    for(const line of scene.items.filter(i=>i.brokenOutBoundary))for(const p of[{x:line.x1,y:line.y1},{x:line.x2,y:line.y2}])assert.ok(placed.toModel(p).v<=2+1e-7);
    assert.equal(scene.items.filter(i=>i.style==='hatch').length,12,'local material exposure unchanged');
    assert.equal(JSON.stringify(doc.views[0].brokenOut),original);
    const cold=JSON.parse(JSON.stringify(doc));
    assert.equal(sceneToSvg(buildSheetScene(cold,{projection:createProjector(cold,[mesh])})),sceneToSvg(scene));
  }finally{releaseRegeneration(run);}
});

test('actual depth section reveals a covered bore only inside broken-out region and retains outside HLR',()=>{
  const original=projectSolid(bodies,'front'),result=projectBrokenOutView(bodies,view(1.5));
  const outside=cropDrawingProjection(original,sketch,{outside:true}),inside=cropDrawingProjection(result,sketch);
  assert.deepEqual(cropDrawingProjection(result,sketch,{outside:true}).hidden,outside.hidden);
  assert.ok(inside.visible.some(edge=>Math.hypot(edge.a.u,edge.a.v)<1.01)||inside.circles.some(circle=>Math.hypot(circle.u,circle.v)<.01),'covered bore becomes visible after cut reaches actual rear plate');
  const shallow=projectBrokenOutView(bodies,view(.5));
  assert.notDeepEqual({visible:result.visible,circles:result.circles},{visible:shallow.visible,circles:shallow.circles},'depth is geometric, not metadata');
  assert.equal(result.brokenOutPlane.offset,.5);
  assert.ok(result.cropSourceCuts.length);
  assert.deepEqual(result.bounds,original.bounds,'outer view remains unchanged');
});

test('depth uses chosen orientation front envelope; invalid modifier inputs are rejected',()=>{
  assert.deepEqual(brokenOutDepthRange(bodies,'front'),{front:2,back:0,extent:2});
  assert.deepEqual(brokenOutDepthRange(bodies,'back'),{front:0,back:-2,extent:2});
  for(const depth of [0,-1,2,Infinity,NaN])assert.throws(()=>projectBrokenOutView(bodies,view(depth)));
  for(const extra of [{dir:'iso'},{detail:{}},{section:{}},{cropSketch:sketch},{displayStyle:'shaded'}])assert.equal(canBreakOutView({...view(.5),...extra}),false);
  assert.equal(canBreakOutView(view(.5),{exploded:true}),false);
});
test('side-view shallow broken-out never draws face-on circles from edge-on cylinder rim metadata',()=>{
  const nativeMesh=tessellateParts([{kind:'cyl',x:0,y:0,z:0,r:3,h:6}]);
  const original=projectSolid(nativeMesh,'right');
  assert.ok(original.circles.some(c=>c.kind==='edge'));
  const region={type:'closed-spline',points:[{u:-1,v:1},{u:1,v:1},{u:1,v:3},{u:-1,v:3}]};
  const result=projectBrokenOutView(nativeMesh,createView('right',{brokenOut:{sketch:region,depth:.5,datum:'front-envelope'}}));
  assert.ok(result.visible.length<32,'edge-on rim metadata must not create hundreds of spurious circular spans');
  assert.ok(result.circles.every(c=>c.kind!=='round'||!c.drawn));
});

test('broken-out shared scene preserves hidden outer region and clips all hatch after cold save/SVG',()=>{
  const doc=createSheetDoc();doc.views=[view(1.5)];doc.views[0].primary=true;
  const build=d=>buildSheetScene(d,{projection:createProjector(d,bodies)}),warm=build(doc),cold=build(JSON.parse(JSON.stringify(doc)));
  assert.equal(sceneToSvg(warm),sceneToSvg(cold));
  assert.equal(warm.diagnostics.length,0);
  const hatch=warm.items.filter(i=>i.style==='hatch'),place=warm.views[0],boundary=cropSplinePoints(sketch);
  assert.ok(hatch.length>0);
  for(const line of hatch)for(const p of [{x:line.x1,y:line.y1},{x:line.x2,y:line.y2}])assert.ok(pointInCrop(place.toModel(p),boundary));
  assert.ok(warm.items.some(i=>i.style==='hidden'),'nonsectioned area retains hidden lines');
});
