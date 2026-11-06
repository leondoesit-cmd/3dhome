import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSheetScene,createSheetDoc,createView,createProjector,projectToView,sceneToSvg,titleBlockBox,sheetFrame} from '../js/cad_sheet.js';
import {tessellateParts} from '../js/core/part_tessellate.js';
import {createExplodedView,addExplodeStep,applyExplodedView,explodeLines} from '../js/cad_exploded_view.js';

const bodies=tessellateParts([{kind:'box',x0:-2,x1:2,y0:-1,y1:1,z0:-1,z1:12}]);
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
function scene(doc,leaders) {return buildSheetScene(doc,{projection:createProjector(doc,bodies),explodeLines:leaders});}
test('actual explode endpoints use isometric geometry projection, scale and paper placement',()=>{
  const assembly={components:[{id:7,transform:{}}]},view=createExplodedView(assembly);
  addExplodeStep(view,[7],{x:0,y:0,z:10});applyExplodedView(assembly,view.id,1);
  const leaders=explodeLines(assembly,()=>({x:1,y:2,z:0}));
  const doc=createSheetDoc({size:'A',orientation:'landscape',views:['front','iso'],scale:'1:2'});
  const result=scene(doc,leaders),lines=result.items.filter(item=>item.explodeLeader);
  assert.equal(lines.length,1);assert.equal(lines[0].componentId,7);assert.equal(lines[0].style,'center');
  const place=result.views.find(v=>v.view.dir==='iso');
  for(const [point,x,y] of [[leaders[0].from,'x1','y1'],[leaders[0].to,'x2','y2']]) {
    const expected=place.toSheet(projectToView(point,place.projection.basis));
    close(lines[0][x],expected.x);close(lines[0][y],expected.y);
  }
  assert.equal(lines[0].viewId,place.id);
  assert.match(sceneToSvg(result),/stroke-dasharray=/);
  applyExplodedView(assembly,null);
  assert.equal(scene(doc,explodeLines(assembly,()=>({x:1,y:2,z:0}))).items.filter(i=>i.explodeLeader).length,0);
});
test('explicit view binding works while invalid and end-on leaders are omitted',()=>{
  const doc=createSheetDoc({views:['front','iso']}),front=doc.views.find(v=>v.dir==='front');
  const result=scene(doc,[
    {id:'front',viewId:front.id,from:{x:0,y:0,z:0},to:{x:2,y:0,z:0}},
    {id:'end-on',viewId:front.id,from:{x:0,y:0,z:0},to:{x:0,y:0,z:10}},
    {id:'broken',from:{x:NaN,y:0,z:0},to:{x:0,y:0,z:1}},
  ]);
  const lines=result.items.filter(item=>item.explodeLeader);
  assert.equal(lines.length,1);assert.equal(lines[0].componentId,'front');assert.equal(lines[0].viewId,front.id);
});
test('an orphaned isometric Detail cannot receive default or explicitly targeted assembly leaders',()=>{
  const doc=createSheetDoc({views:['iso']});
  const iso=doc.views[0], orphan=createView('iso',{id:'lost',detail:{from:'absent',u:0,v:0,radius:1}});
  doc.views.unshift(orphan);
  const endpoints={from:{x:0,y:0,z:0},to:{x:2,y:0,z:0}};
  const leaders=[{id:'automatic',...endpoints},{id:'bound-to-orphan',viewId:orphan.id,...endpoints}];
  const lines=()=>scene(doc,leaders).items.filter(item=>item.explodeLeader).map(item=>[item.componentId,item.viewId]);
  assert.deepEqual(lines(),[['automatic',iso.id]]);
  doc.views=[orphan];
  assert.deepEqual(lines(),[]);
});

test('notes band reserves bottom space for principal and floating views without moving title',()=>{
  const doc=createSheetDoc({size:'A',orientation:'landscape',views:['front','top','right','iso']}),title=titleBlockBox(doc);
  doc.notesBandHeight=55;
  const result=scene(doc,[]),bottom=sheetFrame(doc).y1-55-6;
  assert.deepEqual(titleBlockBox(doc),title);
  for(const place of result.views)assert.ok(place.box.y+place.box.h<=bottom+1e-7,`${place.view.dir} encroaches into notes band`);
});
