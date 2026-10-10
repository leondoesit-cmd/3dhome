import test from 'node:test';
import assert from 'node:assert/strict';
import {canBreakOutView,brokenOutDepthRange,projectBrokenOutView} from '../js/core/drawing_broken_out.js';
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
