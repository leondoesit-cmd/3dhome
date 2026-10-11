import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSheetScene,createSheetDoc,sceneToSvg} from '../js/cad_sheet.js';

// Planchard 2021 printed 2-16 / PDF102 and ISO 128-3 figures5/7:
// fix the frustum narrow-left, then distinguish the projected end-view side.
for(const projection of ['third','first'])test(projection+' projection symbol declares the convention geometrically, without overlap',()=>{
 const doc=createSheetDoc({views:[],projection});
 const scene=buildSheetScene(doc),circles=scene.items.filter(item=>item.type==='circle');
 const outer=circles.find(item=>item.r===2.1),inner=circles.find(item=>item.r===1.2);
 const cone=scene.items.find(item=>item.type==='poly'&&item.closed&&item.style==='frame');
 assert.ok(outer&&inner&&cone);assert.equal(outer.cx,inner.cx);assert.equal(outer.cy,inner.cy);
 const left=Math.min(...cone.pts.map(point=>point.x)),right=Math.max(...cone.pts.map(point=>point.x));
 const span=x=>Math.max(...cone.pts.filter(p=>p.x===x).map(p=>p.y))-Math.min(...cone.pts.filter(p=>p.x===x).map(p=>p.y));
 assert.ok(span(left)<span(right),'the frustum narrow end stays left for both methods');
 if(projection==='third')assert.ok(outer.cx+outer.r<left,'third-angle end view sits left beside narrow end, as the book shows');
 else assert.ok(outer.cx-outer.r>right,'first-angle end view sits right beside large end');
 const axes=scene.items.filter(item=>item.type==='line'&&item.style==='center');
 assert.ok(axes.some(line=>line.x1===outer.cx&&line.x2===outer.cx&&line.y1<outer.cy-outer.r&&line.y2>outer.cy+outer.r));
 const svg=sceneToSvg(scene);assert.match(svg,new RegExp(projection.toUpperCase()+' ANGLE'));
 assert.equal(sceneToSvg(buildSheetScene(JSON.parse(JSON.stringify(doc)))),svg,'cold serialization retains the symbol convention');
});
