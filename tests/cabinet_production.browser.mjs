import test from 'node:test';
import assert from 'node:assert/strict';
import {openPage,findChrome} from '../tools/browser_harness.mjs';
const chrome=await findChrome();
test('production UI binds allowances, reviewed exports and market context to live design scope',{skip:!chrome},async()=>{
 const page=await openPage({width:1280,height:900,lang:'en'});
 try{
  await page.eval(async()=>{
   const {S}=await import('/js/state.js'),{makeSpec}=await import('/js/cabinet.js'),{openNest}=await import('/js/ui_nest.js');
   const item={id:'production-browser',type:'cabsys',x:100,y:100,w:60,h:90,d:60,rot:0,cab:makeSpec('k_base_drawers',60,90,60)};
   window.productionTest={item};S.items=[item];openNest(item);
  });
  await page.waitUntil(()=>document.querySelector('#nzProductionPart')?.options.length>0,{what:'production parts panel'});
  const allowances=await page.eval(async()=>{
   const {cabinetProductionParts}=await import('/js/cabinet_production_parts.js');const item=window.productionTest.item;
   const before=cabinetProductionParts([item]),part=before.parts.find(p=>p.geometry==='rectangle'&&p.finished);
   const select=document.getElementById('nzProductionPart');select.value=part.id;select.dispatchEvent(new Event('change',{bubbles:true}));
   for(const input of document.querySelectorAll('#nzProduction input[data-edge]'))input.value='0';
   document.getElementById('nzProductionRoughL').value='4';document.getElementById('nzProductionRoughW').value='6';document.getElementById('nzProductionApplyEdges').click();
   const after=cabinetProductionParts([item]).parts.find(p=>p.id===part.id);
   return {override:item.cab.productionOverrides?.[part.partId],after,display:document.getElementById('nzProductionDimensions').textContent};
  });
  assert.equal(allowances.override.datum,allowances.after.datum);assert.equal(allowances.after.substrate.length,allowances.after.finished.length);
  assert.equal(allowances.after.rough.length,allowances.after.finished.length+4);assert.equal(allowances.after.rough.width,allowances.after.finished.width+6);assert.match(allowances.display,/Substrate:/);
  const datum=await page.eval(async()=>{
   const {cabinetProductionParts}=await import('/js/cabinet_production_parts.js'),item=window.productionTest.item;
   document.getElementById('nzProductionDatumL').value='5';document.getElementById('nzProductionDatumW').value='3';
   document.getElementById('nzProductionDatumReviewer').value='Stock reviewer';document.getElementById('nzProductionDatumReference').value='Setup drawing B';
   document.getElementById('nzProductionApplyDatum').click();const rejected=document.getElementById('nzProductionStatus').textContent;
   const before=cabinetProductionParts([item]).parts.find(p=>p.id===document.getElementById('nzProductionPart').value);
   document.getElementById('nzProductionDatumL').value='1';document.getElementById('nzProductionApplyDatum').click();
   const after=cabinetProductionParts([item]).parts.find(p=>p.id===before.id);
   return {rejected,before:before.stockMapping,after:after.stockMapping,status:document.getElementById('nzProductionDatumStatus').textContent};
  });
  assert.equal(datum.before,null);assert.ok(datum.after);assert.match(datum.status,/recorded/);assert.ok(datum.rejected.length);
  await page.eval(async()=>{
   const {cabinetDrillingRecipeDraft}=await import('/js/cabinet_manufacturing.js');
   const editor=document.getElementById('nzCncProfile'),profile=JSON.parse(editor.value);
   profile.completeRecipes=cabinetDrillingRecipeDraft([window.productionTest.item]);
   for(const recipe of profile.completeRecipes){recipe.partNumber='Shop article';recipe.sourceDrawing='Shop drawing B';for(const panel of recipe.panels)panel.noDrillReason='Reviewed assembly without drilling';}
   editor.value=JSON.stringify(profile);editor.dispatchEvent(new Event('input',{bubbles:true}));document.getElementById('nzCncApply').click();
  });
  const review=await page.eval(()=>{
   document.getElementById('nzProductionJobName').value='browser-shop-job';document.getElementById('nzProductionSnapshot').click();
   document.getElementById('nzProductionReviewer').value='Shop reviewer';document.getElementById('nzProductionReviewRef').value='Internal review 42';
   document.getElementById('nzProductionchecked').click();const unack=document.getElementById('nzProductionStatus').textContent;
   document.getElementById('nzProductionAcknowledge').checked=true;document.getElementById('nzProductionchecked').click();const checked=document.getElementById('nzProductionJobStatus').textContent;
   document.getElementById('nzProductionreleased').click();return {unack,checked,released:document.getElementById('nzProductionJobStatus').textContent};
  });
  assert.match(review.unack,/acknowledge/);assert.match(review.checked,/checked/);assert.match(review.released,/released/);
  const exports=await page.eval(async()=>{
   const original=URL.createObjectURL,click=HTMLAnchorElement.prototype.click,blobs=[],names=[];
   URL.createObjectURL=blob=>{blobs.push(blob);return 'blob:production-browser';};HTMLAnchorElement.prototype.click=function(){names.push(this.download);};
   try{for(const id of ['CSV','Labels','Traveler','Drawings','Job'])document.getElementById('nzProductionExport'+id).click();return {names,contents:await Promise.all(blobs.map(b=>b.text()))};}
   finally{URL.createObjectURL=original;HTMLAnchorElement.prototype.click=click;}
  });
  assert.deepEqual(exports.names,['cabinet-parts-review.csv','cabinet-part-labels.html','cabinet-assembly-travelers.html','cabinet-part-drawings.html','cabinet-production-job.json']);
  const job=JSON.parse(exports.contents[4].replace(/^\uFEFF/,''));assert.equal(job.status,'released');assert.equal(job.machineReady,false);assert.equal(job.productionRelease,false);assert.equal(job.releaseScope,'review-documents-only');assert.ok(job.manifest.parts.length>0);
  assert.ok(exports.contents[0].includes(allowances.after.id));for(const html of exports.contents.slice(1,4)){assert.match(html,/html/i);assert.ok(html.includes('browser-shop-job'));}assert.match(exports.contents[3],/<svg/);
  assert.match(exports.contents[3],/REVIEWED CUT-STOCK VIEW/);assert.match(exports.contents[3],/Setup drawing B/);
  const market=await page.eval(async()=>{
   const select=document.getElementById('nzProductionMarket');select.value='IL';select.dispatchEvent(new Event('change',{bubbles:true}));
   const summaries=[...document.querySelectorAll('#nzProductionRules summary')].map(n=>n.textContent);
   const original=URL.createObjectURL,click=HTMLAnchorElement.prototype.click,blobs=[];
   URL.createObjectURL=blob=>{blobs.push(blob);return 'blob:standards-browser';};HTMLAnchorElement.prototype.click=function(){};
   try{document.getElementById('nzProductionStandardsExport').click();return {summaries,data:JSON.parse((await blobs[0].text()).replace(/^\uFEFF/,''))};}
   finally{URL.createObjectURL=original;HTMLAnchorElement.prototype.click=click;}
  });
  assert.ok(market.summaries.every(s=>s.includes('Not evaluated')));assert.equal(market.data.assessment.certified,false);assert.equal(market.data.assessment.overallStatus,'not-evaluated');
  const reopened=await page.eval(async()=>{const {closeNest,openNest}=await import('/js/ui_nest.js');closeNest();openNest(window.productionTest.item);return {job:document.getElementById('nzProductionJobStatus').textContent,market:document.getElementById('nzProductionMarket').value};});
  assert.match(reopened.job,/released/);assert.equal(reopened.market,'IL');
  const stale=await page.eval(async()=>{
   window.productionTest.item.w+=5;const original=URL.createObjectURL,click=HTMLAnchorElement.prototype.click;let count=0;URL.createObjectURL=()=>{count++;return 'blob:unexpected';};HTMLAnchorElement.prototype.click=function(){};
   try{for(const id of ['CSV','Labels','Traveler','Drawings','Job'])document.getElementById('nzProductionExport'+id).click();return {count,status:document.getElementById('nzProductionStatus').textContent};}finally{URL.createObjectURL=original;HTMLAnchorElement.prototype.click=click;}
  });assert.equal(stale.count,0);assert.match(stale.status,/design changed/i);
  const independent=await page.eval(async()=>{
   const {S}=await import('/js/state.js'),{closeNest,openNest}=await import('/js/ui_nest.js');closeNest();const copy=JSON.parse(JSON.stringify(window.productionTest.item));S.items=[copy];openNest(copy);
   const replacement={job:document.getElementById('nzProductionJobStatus').textContent,market:document.getElementById('nzProductionMarket').value};
   closeNest();copy.id='other-production-scope';openNest(copy);return {replacement,other:{job:document.getElementById('nzProductionJobStatus').textContent,market:document.getElementById('nzProductionMarket').value}};
  });
  for(const scope of [independent.replacement,independent.other]){assert.match(scope.job,/No revision snapshot/);assert.equal(scope.market,'international');}
 }finally{await page.close();}
});
test('cabinet width inspector reads and commits display inches as centimetre geometry',{skip:!chrome},async()=>{
 const page=await openPage({width:1280,height:900,lang:'en'});
 try{
  const result=await page.eval(async()=>{
   const {S}=await import('/js/state.js'),{makeSpec}=await import('/js/cabinet.js'),{openCabinet}=await import('/js/ui_cabinet.js'),{loadUnitSettings,saveUnitSettings}=await import('/js/unit_settings.js');
   const settings=loadUnitSettings();saveUnitSettings({...settings,overrides:{...settings.overrides,furniture:{unit:'in',digits:3}}});
   const item={id:'production-inch',type:'cabsys',x:0,y:0,w:60.96,h:90,d:60,rot:0,cab:makeSpec('k_base_drawers',60.96,90,60)};S.items=[item];openCabinet(item);
   const input=document.getElementById('cbW'),before=input.value;input.value='25 1/2 in';input.dispatchEvent(new Event('change',{bubbles:true}));
   const dialog=document.getElementById('cbSizeDlg');if(dialog&&!dialog.hidden){const choice=document.querySelector('#cbSizeDlgChoices button');if(choice)choice.click();}
   return {before,width:item.w,after:input.value,unit:input.parentElement.textContent};
  });assert.equal(Number(result.before),24);assert.ok(Math.abs(result.width-64.77)<1e-6,JSON.stringify(result));assert.equal(Number(result.after),25.5);assert.match(result.unit,/in/);
 }finally{await page.close();}
});
