import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {layoutBalloonCenters,distanceToSegment,segmentIntersectsBox,BALLOON_RADIUS} from '../js/core/balloon_layout.js';
import {buildDrawingScene} from '../js/cad_drawings.js';
import {sceneToSvg,createSheetDoc,buildSheetScene,createProjector} from '../js/cad_sheet.js';
import {tessellateParts} from '../js/core/part_tessellate.js';
const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/clamp-balloon-browser-anchors.json',import.meta.url),'utf8'));
const viceSvg=fs.readFileSync(new URL('../artifacts/planchard/BV-drawing-ten-step-exploded-wrapped-browser-2026-10-08.svg',import.meta.url),'utf8');
function clear(centres) {
 const points=[...centres.values()];
 for(let i=0;i<points.length;i++)for(let j=0;j<i;j++){
  assert.ok(Math.hypot(points[i].x-points[j].x,points[i].y-points[j].y)>=2*BALLOON_RADIUS+1.99,'balloon circles need paper clearance');
  assert.ok(distanceToSegment(points[i],points[j],points[j].target)>=BALLOON_RADIUS+1.99,'leader must not pass through another balloon');
  assert.ok(distanceToSegment(points[j],points[i],points[i].target)>=BALLOON_RADIUS+1.99);
 }
}
test('actual 23-instance browser drawing anchors receive separate balloon circles outside geometry',()=>{
 // Also reserve the caption band used by the shared sheet scene.
 const positions=layoutBalloonCenters(fixture.targets,fixture.model,{...fixture.paper,y1:fixture.paper.y1-18},fixture.obstacles);
 assert.equal(positions.size,23,'retain all repeated BOM occurrence callouts');clear(positions);
 for(const target of fixture.targets){
  const p=positions.get(target.id);assert.deepEqual(p.target,target.point,'component leader anchor remains exact');
  assert.ok(p.x+BALLOON_RADIUS<fixture.model.x0||p.x-BALLOON_RADIUS>fixture.model.x1||p.y+BALLOON_RADIUS<fixture.model.y0||p.y-BALLOON_RADIUS>fixture.model.y1);
  assert.ok(p.x-BALLOON_RADIUS>=fixture.paper.x0&&p.x+BALLOON_RADIUS<=fixture.paper.x1&&p.y-BALLOON_RADIUS>=fixture.paper.y0&&p.y+BALLOON_RADIUS<=fixture.paper.y1);
 }
 assert.deepEqual(layoutBalloonCenters(fixture.targets,fixture.model,{...fixture.paper,y1:fixture.paper.y1-18},fixture.obstacles),positions,'stable layout across regeneration');
});

test('actual ten-step bench vice export keeps every balloon and leader clear of BOM and page edges',()=>{
 const number=(attrs,key)=>Number(attrs.match(new RegExp(`\\b${key}="([^"]+)"`))[1]);
 // Extract actual browser-authored component anchors, not synthetic model poses.
 const targets=[...viceSvg.matchAll(/<line([^>]*)\/><polygon([^>]*)\/><circle([^>]*)\/><text[^>]*>([^<]*)<\/text>/g)]
  .map((match,index)=>({id:index,point:{x:number(match[1],'x2'),y:number(match[1],'y2')}}));
 assert.equal(targets.length,16);
 const outlines=[...viceSvg.matchAll(/<line([^>]*)\/>/g)].filter(match=>/stroke-width="0.5"/.test(match[1]));
 const model={x0:Infinity,y0:Infinity,x1:-Infinity,y1:-Infinity};
 for(const [_,attrs] of outlines)for(const end of [1,2]){
  const x=number(attrs,`x${end}`),y=number(attrs,`y${end}`);
  model.x0=Math.min(model.x0,x);model.x1=Math.max(model.x1,x);model.y0=Math.min(model.y0,y);model.y1=Math.max(model.y1,y);
 }
 const rectangles=[...viceSvg.matchAll(/<rect([^>]*)\/>/g)].filter(match=>/stroke-width="0.35"/.test(match[1]));
 const obstacles=rectangles.map(([_,attrs])=>({x0:number(attrs,'x'),y0:number(attrs,'y'),x1:number(attrs,'x')+number(attrs,'width'),y1:number(attrs,'y')+number(attrs,'height')}));
 const paper={x0:22,y0:14,x1:265.4,y1:147.9};
 const positions=layoutBalloonCenters(targets,model,paper,obstacles);
 assert.equal(positions.size,targets.length,'no automatic note falls back to an unchecked offset');
 clear(positions);
 for(const [id,p] of positions){
  assert.deepEqual(p.target,targets[id].point);
  assert.ok(p.x-BALLOON_RADIUS>=paper.x0 && p.x+BALLOON_RADIUS<=paper.x1 && p.y-BALLOON_RADIUS>=paper.y0 && p.y+BALLOON_RADIUS<=paper.y1);
  for(const obstacle of obstacles){
   // Independent sampling verifies the emitted route, not the allocator's
   // own clipping predicate. Its one-mm clearance exceeds the sample spacing.
   for(let step=0;step<=512;step++){
    const t=step/512,x=p.x+(p.target.x-p.x)*t,y=p.y+(p.target.y-p.y)*t;
    assert.ok(x<obstacle.x0 || x>obstacle.x1 || y<obstacle.y0 || y>obstacle.y1,'leader stays outside BOM/title frame');
   }
  }
 }
 assert.deepEqual(layoutBalloonCenters(targets,model,paper,obstacles),positions);
});

test('leader clipping catches crossings with both endpoints outside the annotation obstacle',()=>{
 const box={x0:20,y0:20,x1:80,y1:80};
 assert.equal(segmentIntersectsBox({x:10,y:50},{x:90,y:50},box),true);
 assert.equal(segmentIntersectsBox({x:50,y:10},{x:50,y:90},box),true);
 assert.equal(segmentIntersectsBox({x:10,y:10},{x:90,y:90},box),true);
 assert.equal(segmentIntersectsBox({x:10,y:10},{x:90,y:10},box),false);
 assert.equal(segmentIntersectsBox({x:10,y:19.5},{x:90,y:19.5},box,1),true);
});

test('shared drawing scene and SVG apply automatic clearance but preserve manual balloons',()=>{
 const def={kind:'assembly',name:'Assembly',parts:[{kind:'box',x0:-4,x1:4,y0:-4,y1:4,z0:-4,z1:4}]};
 const targets=Array.from({length:23},(_,i)=>({item:i%15+1,point:{x:(i%5-2),y:(i%3-1),z:(i%7-3)}}));
 const scene=buildDrawingScene(def,{size:'ANSI_C',views:['iso'],scale:'1:1',overallDimensions:false,balloonTargets:targets,balloons:[]});
 const circles=scene.items.filter(i=>i.noteId&&i.type==='circle'&&i.r===BALLOON_RADIUS);
 assert.equal(circles.length,23);
 const positions=new Map(circles.map(c=>{const leader=scene.items.find(i=>i.noteId===c.noteId&&i.type==='line');return [c.noteId,{x:c.cx,y:c.cy,target:{x:leader.x2,y:leader.y2}}];}));clear(positions);
 const svg=sceneToSvg(scene);assert.equal([...svg.matchAll(/r="3\.6"/g)].length,23);
 const caption=scene.items.find(item=>item.viewLabel===scene.views[0].id);
 const balloonBottom=Math.max(...circles.map(circle=>circle.cy+circle.r));
 assert.ok(caption.y-caption.size>balloonBottom,'caption text is below all balloon circles and their leaders');
 assert.equal(circles.every(circle=>circle.viewId===scene.views[0].id),true);
 const autoNotes=[...scene.notes.values()].map(x=>x.note);
 assert.equal(autoNotes.every(n=>n.autoBalloon),true);
 const doc=createSheetDoc({size:'ANSI_C',views:['iso']});
 doc.notes=[{id:'manual',balloon:true,text:'1',dx:5,dy:9,leader:{viewId:doc.views[0].id,u:0,v:0}}];
 const manual=buildSheetScene(doc,{projection:createProjector(doc,tessellateParts(def.parts))});
 const circle=manual.items.find(i=>i.noteId==='manual'&&i.type==='circle');
 const leader=manual.items.find(i=>i.noteId==='manual'&&i.type==='line');
 assert.equal(circle.cx-leader.x2,5);assert.equal(circle.cy-leader.y2,9);
});
