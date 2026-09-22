import test from 'node:test';
import assert from 'node:assert/strict';
import {openPage,findChrome} from '../tools/browser_harness.mjs';
const chrome=await findChrome();
test('production revisions compare changed parts and export only against the current saved design',{skip:!chrome},async()=>{
 const page=await openPage({width:1280,height:900,lang:'en'});
 try{
  await page.eval(async()=>{
   const {S}=await import('/js/state.js'),{makeSpec}=await import('/js/cabinet.js'),{openNest}=await import('/js/ui_nest.js');
   const item={id:'diff-browser',type:'cabsys',x:0,y:0,w:80,h:160,d:60,rot:0,cab:makeSpec('w_classic',80,160,60)};
   window.diffTest={item};S.items=[item];openNest(item);
  });
  const compared=await page.eval(()=>{
   document.getElementById('nzProductionSnapshot').click();window.diffTest.item.w+=1;
   document.getElementById('nzProductionSnapshot').click();document.getElementById('nzProductionCompare').click();
   return {status:document.getElementById('nzProductionDiffStatus').textContent,rows:document.getElementById('nzProductionDiffRows').textContent,archives:document.getElementById('nzProductionArchive').options.length};
  });
  assert.equal(compared.archives,1);assert.match(compared.status,/changed/);assert.match(compared.rows,/finished/);assert.match(compared.rows,/diff-browser/);
  const exported=await page.eval(async()=>{
   const original=URL.createObjectURL,click=HTMLAnchorElement.prototype.click,blobs=[],names=[];
   URL.createObjectURL=blob=>{blobs.push(blob);return 'blob:revision-diff';};HTMLAnchorElement.prototype.click=function(){names.push(this.download);};
   try{document.getElementById('nzProductionDiffHTML').click();document.getElementById('nzProductionDiffCSV').click();return {names,contents:await Promise.all(blobs.map(blob=>blob.text()))};}
   finally{URL.createObjectURL=original;HTMLAnchorElement.prototype.click=click;}
  });
  assert.deepEqual(exported.names,['cabinet-revision-comparison.html','cabinet-revision-comparison.csv']);assert.match(exported.contents[0],/Cabinet revision comparison/);assert.match(exported.contents[1],/finished/);
  const stale=await page.eval(()=>{window.diffTest.item.w+=1;document.getElementById('nzProductionCompare').click();return document.getElementById('nzProductionStatus').textContent;});assert.match(stale,/design changed/);
 }finally{await page.close();}
});
