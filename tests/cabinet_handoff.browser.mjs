import test from 'node:test';
import assert from 'node:assert/strict';
import {openPage,findChrome} from '../tools/browser_harness.mjs';
const chrome=await findChrome();
test('review package UI binds supplemental evidence, verifies archives and blocks modified content',{skip:!chrome},async()=>{
 const page=await openPage({width:1280,height:900,lang:'en'});
 try{
  await page.eval(async()=>{
   const {S}=await import('/js/state.js'),{makeSpec}=await import('/js/cabinet.js'),{openNest}=await import('/js/ui_nest.js');
   const item={id:'handoff-cabinet',type:'cabsys',x:0,y:0,w:80,h:160,d:60,rot:0,cab:makeSpec('w_classic',80,160,60)};
   window.handoffTest={item};S.items=[item];openNest(item);
  });
  await page.waitUntil(()=>!!document.getElementById('nzProductionPackageExport'),{what:'review package controls'});
  const exported=await page.eval(async()=>{
   document.getElementById('nzProductionCoverageRefresh').click();const coverage=document.getElementById('nzProductionCoverageRows').textContent;
   document.getElementById('nzProductionSnapshot').click();
   const original=URL.createObjectURL,click=HTMLAnchorElement.prototype.click,blobs=[],names=[];
   URL.createObjectURL=blob=>{blobs.push(blob);return 'blob:handoff-test';};HTMLAnchorElement.prototype.click=function(){names.push(this.download);};
   try{document.getElementById('nzProductionPackageExport').click();document.getElementById('nzProductionPackageDocument').click();const contents=await Promise.all(blobs.map(blob=>blob.text()));window.handoffTest.package=JSON.parse(contents[0].replace(/^\uFEFF/,''));return {coverage,names,contents,status:document.getElementById('nzProductionPackageStatus').textContent};}
   finally{URL.createObjectURL=original;HTMLAnchorElement.prototype.click=click;}
  });
  assert.match(exported.coverage,/Missing|Generic \/ partial/);assert.equal(exported.names[0],'cabinet-review-package.json');assert.equal(exported.names.length,2);assert.match(exported.status,/integrity checked/);
  const archive=JSON.parse(exported.contents[0].replace(/^\uFEFF/,''));assert.equal(archive.machineReady,false);assert.equal(archive.supplemental.standardsContext.market,'international');assert.ok(archive.coverage.parts.length>0);
  const importArchive=async(tampered)=>{
   await page.eval(({tampered})=>{
    const value=JSON.parse(JSON.stringify(window.handoffTest.package));if(tampered)value.files[0].content+='tampered';
    const data=new DataTransfer();data.items.add(new File([JSON.stringify(value)],'review.json',{type:'application/json'}));
    const input=document.getElementById('nzProductionPackageImport');input.files=data.files;input.dispatchEvent(new Event('change',{bubbles:true}));
   },{tampered});
   await page.waitUntil(()=>document.getElementById('nzProductionPackageImport').files.length===0,{what:'package verification'});
   return page.eval(()=>({status:document.getElementById('nzProductionPackageStatus').textContent,count:document.getElementById('nzProductionPackageFiles').options.length}));
  };
  const checked=await importArchive(false);assert.match(checked.status,/integrity checked/);assert.ok(checked.count>0);
  const rejected=await importArchive(true);assert.equal(rejected.count,0);assert.doesNotMatch(rejected.status,/integrity checked/);
  const stale=await page.eval(()=>{
   window.handoffTest.item.w+=10;document.getElementById('nzProductionPackageExport').click();return document.getElementById('nzProductionStatus').textContent;
  });assert.match(stale,/design changed/);
 }finally{await page.close();}
});
