import test from 'node:test';
import assert from 'node:assert/strict';
import {openPage,findChrome} from '../tools/browser_harness.mjs';
const chrome=await findChrome();
test('cut planner selects router rectangular blanks and exports matching metadata',{skip:!chrome},async()=>{
 const page=await openPage({width:1280,height:900,lang:'en'});
 try{
  await page.eval(async()=>{const {S}=await import('/js/state.js'),{makeSpec}=await import('/js/cabinet.js'),{openNest}=await import('/js/ui_nest.js');const item={id:'router-browser',type:'cabsys',x:0,y:0,w:120,h:200,d:60,rot:0,cab:makeSpec('w_classic',120,200,60)};S.items=[item];openNest(item);});
  await page.waitUntil(()=>!!document.getElementById('nzNestingAlgorithm'),{what:'nesting method selector'});
  const output=await page.eval(async()=>{
   const select=document.getElementById('nzNestingAlgorithm');const initial=select.value;select.value='router-rectangular';select.dispatchEvent(new Event('change',{bubbles:true}));
   const oldURL=URL.createObjectURL,oldClick=HTMLAnchorElement.prototype.click,blobs=[],names=[];URL.createObjectURL=blob=>{blobs.push(blob);return 'blob:router-review';};HTMLAnchorElement.prototype.click=function(){names.push(this.download);};
   try{document.getElementById('nzCsv').click();document.getElementById('nzDxf').click();return {initial,value:document.getElementById('nzNestingAlgorithm').value,text:document.getElementById('nzSaw').textContent,names,contents:await Promise.all(blobs.map(b=>b.text()))};}finally{URL.createObjectURL=oldURL;HTMLAnchorElement.prototype.click=oldClick;}
  });
  assert.equal(output.initial,'guillotine');assert.equal(output.value,'router-rectangular');assert.match(output.text,/Rectangular blanks only/);assert.deepEqual(output.names,['cut-list.csv','nesting-review.dxf']);assert.match(output.contents[0],/router-rectangular/);assert.match(output.contents[0],/item:router-browser:/);assert.match(output.contents[1],/router-rectangular \/ NOT CAM/);
  assert.equal(await page.eval(()=>{const select=document.getElementById('nzNestingAlgorithm');select.value='guillotine';select.dispatchEvent(new Event('change',{bubbles:true}));return document.getElementById('nzNestingAlgorithm').value;}),'guillotine');
 }finally{await page.close();}
});
