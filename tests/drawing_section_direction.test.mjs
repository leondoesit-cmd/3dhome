import test from 'node:test';
import assert from 'node:assert/strict';
import {createSheetDoc,buildSheetScene,createProjector,sceneToSvg} from '../js/cad_sheet.js';
import {createDrawingController} from '../js/modeler_drawing.js';
import {tessellateParts} from '../js/core/part_tessellate.js';
import {viewBasis} from '../js/core/hidden_line.js';

function cut(dir,horizontal,reverse=false,shift=false) {
 const doc=createSheetDoc({views:[dir]});
 // Asymmetric stepped silhouette: upper step is on the left in Front.
 const bodies=tessellateParts([{kind:'box',x0:-10,x1:10,y0:0,y1:5,z0:-5,z1:5},
  {kind:'box',x0:-10,x1:-3,y0:5,y1:12,z0:-5,z1:5}]);
 const controller=createDrawingController({doc:()=>doc,bodies:()=>bodies,bodiesToken:()=>1,canvas:()=>({}),width:()=>390,height:()=>844,t:k=>k,pushUndo(){},markDirty(){},flash(){},refresh(){}});
 controller.fit();
 const place=controller.scene().views[0],c=place.toSheet({u:place.centre.u,v:place.centre.v});
 const span=(horizontal?place.box.w:place.box.h)*.2;
 const p={x:c.x-(horizontal?span:0),y:c.y-(horizontal?0:span)},q={x:c.x+(horizontal?span:0),y:c.y+(horizontal?0:span)};
 const pixel=p=>[p.x*controller.state.zoom+controller.state.ox,p.y*controller.state.zoom+controller.state.oy];
 controller.setTool('section');
 controller.pointerDown({button:0,shiftKey:shift},...pixel(reverse?q:p));
 assert.equal(controller.state.draft?.kind,'section');
 controller.pointerMove({button:0},...pixel(reverse?p:q));
 controller.pointerUp({button:0},...pixel(reverse?p:q));
 const view=doc.views.at(-1),scene=controller.scene();
 assert.ok(view.section);
 return {doc,view,scene,bodies};
}

for(const dir of ['front','back','left','right','top','bottom'])for(const horizontal of [true,false]) {
 test(`${dir} ${horizontal?'horizontal':'vertical'} reverse touch cut flips sight, cut arrows and cold view`,()=>{
  const forward=cut(dir,horizontal),reverse=cut(dir,horizontal,true),shifted=cut(dir,horizontal,false,true);
  assert.notEqual(forward.view.dir,reverse.view.dir);
  assert.notEqual(forward.view.section.flip,reverse.view.section.flip);
  assert.equal(shifted.view.dir,reverse.view.dir);
  assert.equal(shifted.view.section.flip,reverse.view.section.flip);
  const a=viewBasis(forward.view.dir).forward,b=viewBasis(reverse.view.dir).forward;
  for(const axis of ['x','y','z'])assert.equal(a[axis]+b[axis],0);
  for(const [result,sign] of [[forward,1],[reverse,-1]]) {
   const arrows=result.scene.items.filter(i=>i.type==='poly'&&i.closed&&i.pts?.length===3&&i.fill);
   assert.equal(arrows.length,2);
   for(const arrow of arrows) {
    const [tip,tail1,tail2]=arrow.pts;
    const delta=horizontal?tip.y-(tail1.y+tail2.y)/2:tip.x-(tail1.x+tail2.x)/2;
    assert.equal(Math.sign(delta),horizontal?sign:-sign);
   }
   const cold=JSON.parse(JSON.stringify(result.doc));
   const projected=createProjector(cold,result.bodies)(cold.views.at(-1));
   assert.deepEqual(projected,result.scene.views.find(p=>p.id===result.view.id).projection);
   assert.equal(sceneToSvg(buildSheetScene(cold,{projection:createProjector(cold,result.bodies)})),sceneToSvg(result.scene));
  }
 });
}

test('Top reverse horizontal cut produces Front silhouette instead of mirrored Back',()=>{
 const a=cut('top',true),b=cut('top',true,true);
 assert.equal(a.view.dir,'back');assert.equal(b.view.dir,'front');
 const projection=b.scene.views.find(p=>p.id===b.view.id).projection;
 const highest=projection.visible.flatMap(e=>[e.a,e.b]).filter(p=>Math.abs(p.v-12)<1e-8);
 assert.ok(highest.length>0);assert.ok(highest.every(p=>p.u<0));
});


