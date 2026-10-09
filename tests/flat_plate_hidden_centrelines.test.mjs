import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildDrawingScene} from '../js/cad_drawings.js';
import {sceneToSvg} from '../js/cad_sheet.js';

const fixture=()=>JSON.parse(readFileSync(new URL('../artifacts/planchard/FLAT-PLATE-9.6-browser-2026-09-28.mforge',import.meta.url),'utf8')).mainModel;
const axes=(scene,id)=>scene.items.filter(item=>item.type==='line'&&item.style==='center'&&item.viewId===id);

test('actual FLAT-PLATE hidden countersink rims define one exact Front/Right axis without model edits',()=>{
 const def=fixture(),authored=doc=>JSON.stringify({features:doc.features,sketches:doc.sketches,history:doc.history,parts:doc.parts,customProperties:doc.customProperties}),before=authored(def),scene=buildDrawingScene(def);
 for(const id of ['v5urcy92','v1i82fs2']){
  const projection=scene.projections.get(id),view=scene.views.find(item=>item.id===id);
  assert.equal(projection.circles.length,3);
  assert.ok(projection.circles.every(circle=>circle.kind==='edge'&&!circle.visible));
  const lines=axes(scene,id);assert.equal(lines.length,1,'coaxial countersink and bore rims share one axis');
  const line=lines[0],point=view.toSheet(projection.circles[0]);
  assert.ok(Math.abs(line.x1-point.x)<1e-8&&Math.abs(line.x2-point.x)<1e-8,'axis follows exact projected hole center');
  const ys=projection.circles.map(circle=>view.toSheet(circle).y);
  assert.ok(Math.min(line.y1,line.y2)<Math.min(...ys)&&Math.max(line.y1,line.y2)>Math.max(...ys),'axis extends beyond both ends');
 }
 assert.equal(axes(scene,'vkdjooex').length,4,'existing Top bore/countersink center marks persist');
 assert.equal(axes(scene,'vdbr87fu').length,0,'no fabricated isometric axis');
 assert.match(sceneToSvg(scene),/stroke-dasharray/);
 assert.equal(authored(def),before,'drawing normalization does not alter authored geometry, references or material');
});

test('hidden side-view axes obey sheet and view Hidden lines and Centre marks settings',()=>{
 const def=fixture();def.drawing.showHidden=false;
 let scene=buildDrawingScene(def);
 assert.equal(axes(scene,'v5urcy92').length,0);assert.equal(axes(scene,'v1i82fs2').length,0);
 assert.equal(axes(scene,'vkdjooex').length,4);
 def.drawing.views.find(view=>view.id==='v5urcy92').hidden=true;
 scene=buildDrawingScene(def);assert.equal(axes(scene,'v5urcy92').length,1);assert.equal(axes(scene,'v1i82fs2').length,0);
 def.drawing.showHidden=true;def.drawing.showCenters=false;
 scene=buildDrawingScene(def);assert.ok(scene.items.every(item=>item.style!=='center'||!item.viewId));
 def.drawing.showCenters=true;def.drawing.views.find(view=>view.id==='v1i82fs2').centers=false;
 scene=buildDrawingScene(def);assert.equal(axes(scene,'v5urcy92').length,1);assert.equal(axes(scene,'v1i82fs2').length,0);
});
