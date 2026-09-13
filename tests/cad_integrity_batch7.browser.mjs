import test from 'node:test';
import assert from 'node:assert/strict';
import {openPage,findChrome} from '../tools/browser_harness.mjs';
const chrome=await findChrome();
test('drawing SVG shows the complete sketch-hole count and a top-view leader',chrome?{timeout:60000}:{skip:'Chrome unavailable'},async()=>{
 const page=await openPage({width:1300,height:900,lang:'en'});
 try{const result=await page.eval(async()=>{
  const {buildDrawingScene}=await import('/js/cad_drawings.js');const {createSheetDoc,sceneToSvg}=await import('/js/cad_sheet.js');
  const doc=createSheetDoc({views:['front','top']}),def={parts:[{kind:'box',x0:0,x1:10,y0:0,y1:2,z0:0,z1:10}],features:[{id:'h',type:'hole',params:{sketchId:'s',layout:'sketch',holeType:'simple',diameterMm:6,depthMm:20}}],sketches:[{id:'s',plane:'top',points:[{id:'a',x:2,y:3},{id:'b',x:7,y:8}],entities:[{id:'c1',type:'circle',c:'a',r:.3},{id:'c2',type:'circle',c:'b',r:.3}]}]};
  const scene=buildDrawingScene(def,{doc}),host=document.createElement('div');host.innerHTML=sceneToSvg(scene);document.body.appendChild(host);await document.fonts.ready;
  const text=host.textContent,note=doc.notes[0],view=doc.views.find(v=>v.id===note.leader.viewId);return {text,leader:note.leader,view:view.dir};
 });assert.match(result.text,/×2/);assert.equal(result.view,'top');assert.equal(result.leader.u,2);assert.equal(result.leader.v,-3);}
 finally{await page.close();}
});
