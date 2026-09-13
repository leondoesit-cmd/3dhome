import test from 'node:test';
import assert from 'node:assert/strict';
import {openPage,findChrome} from '../tools/browser_harness.mjs';
const chrome=await findChrome();
test('cut plan exposes manufacturing review and exports identifiable, face-specific review files',{skip:!chrome},async()=>{
 const page=await openPage({width:1280,height:850,lang:'en'});
 try{
  await page.eval(async()=>{
   const {S}=await import('/js/state.js'),{makeSpec}=await import('/js/cabinet.js'),{openNest}=await import('/js/ui_nest.js');
   const item={id:'manufacturing-ui',type:'cabsys',x:0,y:0,w:120,h:240,d:60,rot:0,cab:makeSpec('w_classic',120,240,60)};
   S.items=[item];openNest(item);
  });
  await page.waitUntil(()=>document.querySelector('#nzManufacturing')?.textContent.includes('Manufacturing review required'),{what:'manufacturing review'});
  const read=await page.eval(()=>({text:document.querySelector('#nzManufacturing').textContent,csv:document.querySelector('#nzDrill').textContent,dxf:document.querySelector('#nzDxf').textContent}));
  assert.ok(read.text.includes('not machine programs'));assert.ok(read.csv.includes('review'));assert.ok(read.dxf.includes('review'));
  const exports=await page.eval(async()=>{
   const saved=URL.createObjectURL,click=HTMLAnchorElement.prototype.click,blobs=[],names=[];
   URL.createObjectURL=blob=>{blobs.push(blob);return 'blob:manufacturing-review-test';};HTMLAnchorElement.prototype.click=function(){names.push(this.download);};
   try{for(const id of ['nzManufacturingJson','nzDrill','nzDxf'])document.getElementById(id).click();return {names,contents:await Promise.all(blobs.map(b=>b.text()))};}
   finally{URL.createObjectURL=saved;HTMLAnchorElement.prototype.click=click;}
  });
  assert.deepEqual(exports.names,['manufacturing-review.json','drilling-review.csv','nesting-review.dxf']);
  const json=JSON.parse(exports.contents[0].replace(/^\uFEFF/,''));assert.equal(json.machineReady,false);assert.ok(json.operationCount>0);
  assert.ok(exports.contents[1].includes('"Face"'));assert.ok(exports.contents[1].includes('"THROUGH"'));assert.ok(exports.contents[2].includes('REVIEW REQUIRED'));
 }finally{await page.close();}
});
