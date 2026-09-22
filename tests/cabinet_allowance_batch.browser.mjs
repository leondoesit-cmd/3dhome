import test from 'node:test';
import assert from 'node:assert/strict';
import {openPage,findChrome} from '../tools/browser_harness.mjs';
const chrome=await findChrome();
test('batch UI explicitly selects targets, previews changes and blocks stale apply',{skip:!chrome},async()=>{
 const page=await openPage({width:1280,height:900,lang:'en'});
 try{
  const setup=await page.eval(async()=>{
   const {makeSpec}=await import('/js/cabinet.js'),{cabinetProductionParts}=await import('/js/cabinet_production_parts.js'),{mountCabinetAllowanceBatch}=await import('/js/ui_cabinet_allowance_batch.js');
   const items=['batch-source','batch-target'].map(id=>({id,type:'cabsys',x:0,y:0,w:60,h:80,d:60,cab:makeSpec('k_base',60,80,60)}));const parts=cabinetProductionParts(items).parts,source=parts.find(p=>p.itemId==='batch-source'&&p.geometry==='rectangle'),target=parts.find(p=>p.itemId==='batch-target'&&p.partId===source.partId);
   items[0].cab.productionOverrides={[source.partId]:{datum:source.datum,topologyBinding:source.topologyBinding,edges:Object.fromEntries(['lengthStart','lengthEnd','widthStart','widthEnd'].map(key=>[key,{thicknessMm:0,stockId:''}])),roughAllowance:{lengthMm:4,widthMm:6}}};
   window.batchTest={items,source,target,mutations:0};const host=document.createElement('div');document.body.appendChild(host);window.batchTest.ui=mountCabinetAllowanceBatch(host,()=>items,fn=>{fn();window.batchTest.mutations++;});
   const select=document.getElementById('nzAllowanceBatchSource');select.value=source.id;select.dispatchEvent(new Event('change',{bubbles:true}));document.getElementById('nzAllowanceBatchReview').click();return {checked:document.querySelectorAll('#nzAllowanceBatchTargets input:checked').length,disabled:document.getElementById('nzAllowanceBatchApply').disabled};
  });assert.equal(setup.checked,0);assert.equal(setup.disabled,true);
  const preview=await page.eval(()=>{const check=[...document.querySelectorAll('#nzAllowanceBatchTargets input')].find(n=>n.value===window.batchTest.target.id);check.checked=true;check.dispatchEvent(new Event('change',{bubbles:true}));document.getElementById('nzAllowanceBatchReview').click();return {rows:document.querySelectorAll('#nzAllowanceBatchPreview tr').length,disabled:document.getElementById('nzAllowanceBatchApply').disabled,mutated:!!window.batchTest.items[1].cab.productionOverrides};});assert.equal(preview.rows,2);assert.equal(preview.disabled,false);assert.equal(preview.mutated,false);
  const stale=await page.eval(()=>{window.batchTest.items[0].cab.productionOverrides[window.batchTest.source.partId].roughAllowance.lengthMm=7;document.getElementById('nzAllowanceBatchApply').click();return {status:document.getElementById('nzAllowanceBatchStatus').textContent,mutations:window.batchTest.mutations};});assert.match(stale.status,/changed/);assert.equal(stale.mutations,0);
  const result=await page.eval(()=>{document.getElementById('nzAllowanceBatchReview').click();document.getElementById('nzAllowanceBatchApply').click();return {value:window.batchTest.items[1].cab.productionOverrides[window.batchTest.target.partId],mutations:window.batchTest.mutations,status:document.getElementById('nzAllowanceBatchStatus').textContent};});assert.equal(result.mutations,1);assert.equal(result.value.roughAllowance.lengthMm,7);assert.equal(result.value.machiningDatum,undefined);assert.match(result.status,/1 parts updated/);
 }finally{await page.close();}
});
