import test from 'node:test';
import assert from 'node:assert/strict';
import {openPage,findChrome} from '../tools/browser_harness.mjs';
const chrome=await findChrome();
test('exported dimension glyphs clear their line on both sides of the geometry',chrome?{timeout:60000}:{skip:'Chrome unavailable'},async()=>{
 const page=await openPage({width:1200,height:900,lang:'en'});
 try{
  const results=await page.eval(async()=>{
   const {createSheetDoc,createProjector,buildSheetScene,sceneToSvg}=await import('/js/cad_sheet.js');
   const {tessellateParts}=await import('/js/core/part_tessellate.js');
   const results=[];
   for(const offset of [-10,10]){
    const doc=createSheetDoc({views:['front']});
    doc.dims=[{id:'clearance',viewId:doc.views[0].id,type:'horizontal',offset,text:'CLEARANCE',refs:[{u:0,v:0},{u:2,v:0}]}];
    const scene=buildSheetScene(doc,{projection:createProjector(doc,tessellateParts([{kind:'box',x0:0,x1:2,y0:0,y1:2,z0:0,z1:2}]))});
    const label=scene.items.find(i=>i.dimId==='clearance'&&i.type==='text');
    const lineY=label.y+(offset<0?-1.6:1.6);
    const host=document.createElement('div');host.innerHTML=sceneToSvg(scene);document.body.appendChild(host);
    await document.fonts.ready;
    const text=Array.from(host.querySelectorAll('text')).find(t=>t.textContent.includes('CLEARANCE'));
    const bbox=text.getBBox();results.push({offset,lineY,minY:bbox.y,maxY:bbox.y+bbox.height,baseline:text.getAttribute('dominant-baseline')});host.remove();
   }
   return results;
  });
  for(const result of results)assert.ok(result.offset<0?result.minY>result.lineY:result.maxY<result.lineY,JSON.stringify(result));
 }finally{await page.close();}
});
