import test from 'node:test';
import assert from 'node:assert/strict';
import {openPage,findChrome} from '../tools/browser_harness.mjs';
const chrome=await findChrome();
test('joinery form plans paired operations without JSON and blocks stale downloads',{skip:!chrome},async()=>{
 const page=await openPage({width:1280,height:900,lang:'en'});
 try{
  const setup=await page.eval(async()=>{
   const {makeSpec}=await import('/js/cabinet.js'),{mountCabinetJoinery}=await import('/js/ui_cabinet_joinery.js'),{cabinetProductionParts}=await import('/js/cabinet_production_parts.js');
   const item={id:'joinery-ui',type:'cabsys',x:0,y:0,w:120,h:240,d:60,rot:0,cab:makeSpec('w_classic',120,240,60)};
   window.joineryTest={items:[item],downloads:[]};const host=document.createElement('div');document.body.appendChild(host);
   window.joineryTest.controller=mountCabinetJoinery(host,()=>window.joineryTest.items,(name,data)=>window.joineryTest.downloads.push({name,data}));
   const parts=cabinetProductionParts([item]).parts.filter(p=>p.geometry==='rectangle'&&p.finished?.length>100&&p.finished.width>80&&p.finished.thickness>=18);
   const fill=(key,value)=>{const n=document.querySelector('[data-joinery-field="'+key+'"]');n.value=String(value);n.dispatchEvent(new Event('change',{bubbles:true}));};
   fill('facePanel',parts[0].id);fill('edgePanel',parts[1].id);
   for(const [k,v] of Object.entries({manufacturer:'Test shop',sku:'D8-30',revision:'A',sourceDrawing:'Shop drawing 42',diameterMm:8,lengthMm:30,faceDiameterMm:8,faceDepthMm:10,edgeDiameterMm:8,edgeDepthMm:25,minEdgeDistanceMm:10,faceOffsetMm:30,edgeOffsetMm:9,positions:'40, 80'}))fill(k,v);
   document.getElementById('nzJoineryReview').click();
   return {sameExcluded:!Array.from(document.querySelector('[data-joinery-field="edgePanel"]').options).some(o=>o.value===parts[0].id),rows:document.querySelectorAll('#nzJoineryPreview tr').length,warning:document.getElementById('nzJoinerySizes').textContent,enabled:!document.getElementById('nzJoineryDownload').disabled,selection:parts[0].id};
  });
  assert.equal(setup.sameExcluded,true);assert.equal(setup.rows,5);assert.equal(setup.enabled,true);assert.match(setup.warning,/FINISHED dimensions only/);
  const exported=await page.eval(()=>{document.getElementById('nzJoineryDownload').click();return JSON.parse(window.joineryTest.downloads[0].data);});
  assert.equal(exported.machineReady,false);assert.equal(exported.operations.length,4);assert.equal(exported.input.article.sku,'D8-30');assert.equal(exported.input.facePanel.dimensionBasis,'finished-only');
  const stale=await page.eval(()=>{window.joineryTest.items[0].w+=10;document.getElementById('nzJoineryDownload').click();return {count:window.joineryTest.downloads.length,text:document.getElementById('nzJoineryStatus').textContent,disabled:document.getElementById('nzJoineryDownload').disabled};});
  assert.equal(stale.count,1);assert.equal(stale.disabled,true);assert.match(stale.text,/changed/);
  const refreshed=await page.eval(()=>{const selected=document.querySelector('[data-joinery-field="facePanel"]').value;window.joineryTest.controller.refresh();return {selected,after:document.querySelector('[data-joinery-field="facePanel"]').value};});assert.equal(refreshed.selected,refreshed.after);
  const substrate=await page.eval(async()=>{
   const {cabinetProductionParts}=await import('/js/cabinet_production_parts.js');const item=window.joineryTest.items[0],selected=document.querySelector('[data-joinery-field="facePanel"]').value;
   const part=cabinetProductionParts([item]).parts.find(p=>p.id===selected);const {BANDING}=await import('/js/stock.js');const band=BANDING[0];
   item.cab.productionOverrides={[part.partId]:{datum:part.datum,topologyBinding:part.topologyBinding,edges:Object.fromEntries(['lengthStart','lengthEnd','widthStart','widthEnd'].map(k=>[k,{thicknessMm:band.t*10,stockId:band.id}]))}};
   window.joineryTest.controller.refresh();document.getElementById('nzJoineryReview').click();document.getElementById('nzJoineryDownload').click();
   return {status:document.getElementById('nzJoineryPreview').textContent,expected:part.finished.length-2*band.t*10,report:JSON.parse(window.joineryTest.downloads.at(-1).data)};
  });assert.equal(substrate.report.input.facePanel.dimensionBasis,'substrate',substrate.status);assert.ok(Math.abs(substrate.report.input.facePanel.length-substrate.expected)<1e-6);
  const invalid=await page.eval(()=>{document.querySelector('[data-joinery-field="positions"]').value='40,';document.getElementById('nzJoineryReview').click();return {disabled:document.getElementById('nzJoineryDownload').disabled,rows:document.querySelectorAll('#nzJoineryPreview tr').length};});assert.equal(invalid.disabled,true);assert.equal(invalid.rows,0);
 }finally{await page.close();}
});
test('shop hardware catalog persists article-only definitions and rejects invalid imports',{skip:!chrome},async()=>{
 const page=await openPage({width:1280,height:900,lang:'en'});
 try{
  const saved=await page.eval(async()=>{
   const {mountCabinetJoinery}=await import('/js/ui_cabinet_joinery.js');const host=document.createElement('div');document.body.appendChild(host);window.hardwareExports=[];
   mountCabinetJoinery(host,()=>[],(name,data)=>window.hardwareExports.push({name,data}));
   for(const [key,value] of Object.entries({manufacturer:'Shop A',sku:'Dow-8',revision:'1',sourceDrawing:'Drawing 7',diameterMm:8,lengthMm:30,faceDiameterMm:8,faceDepthMm:10,edgeDiameterMm:8,edgeDepthMm:25,minEdgeDistanceMm:10,faceOffsetMm:30,edgeOffsetMm:9,positions:'40,80'}))document.querySelector('[data-joinery-field="'+key+'"]').value=value;
   document.getElementById('nzJoineryCatalogSave').click();document.querySelector('[data-joinery-field="sku"]').value='changed';document.getElementById('nzJoineryCatalogLoad').click();
   document.getElementById('nzJoineryCatalogExport').click();return {data:JSON.parse(window.hardwareExports[0].data),sku:document.querySelector('[data-joinery-field="sku"]').value,disabled:document.getElementById('nzJoineryDownload').disabled,stored:JSON.parse(localStorage.getItem('modelforge.cabinet-hardware-articles.v1'))};
  });
  assert.equal(saved.sku,'Dow-8');assert.equal(saved.disabled,true);assert.equal(saved.data.verified,false);assert.equal(saved.data.articles.length,1);assert.deepEqual(saved.data,saved.stored);assert.equal(saved.data.articles[0].positions,undefined);assert.equal(saved.data.articles[0].facePanel,undefined);
  const conflict=await page.eval(()=>{document.querySelector('[data-joinery-field="lengthMm"]').value='31';document.getElementById('nzJoineryCatalogSave').click();return {message:document.getElementById('nzJoineryCatalogStatus').textContent,stored:JSON.parse(localStorage.getItem('modelforge.cabinet-hardware-articles.v1'))};});assert.match(conflict.message,/already exists/);assert.equal(conflict.stored.articles[0].dimensions.lengthMm,30);
  await page.eval(()=>{const transfer=new DataTransfer();transfer.items.add(new File([JSON.stringify({schema:'modelforge-shop-hardware-catalog',version:1,articles:[{manufacturer:'Broken'}]})],'bad.json',{type:'application/json'}));const input=document.getElementById('nzJoineryCatalogImport');input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));});
  await page.waitUntil(()=>document.getElementById('nzJoineryCatalogStatus').textContent.includes('Article requires'),{what:'invalid catalog rejected'});
  const validImport=await page.eval(()=>{
   const data=JSON.parse(window.hardwareExports[0].data);data.articles[0].revision='2';data.articles[0].positions=[100];window.hardwareImport=data;
   const transfer=new DataTransfer();transfer.items.add(new File([JSON.stringify(data)],'valid.json',{type:'application/json'}));const input=document.getElementById('nzJoineryCatalogImport');input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));return true;
  });assert.equal(validImport,true);
  await page.waitUntil(()=>document.getElementById('nzJoineryCatalog').options.length===3,{what:'valid imported article revision'});
  const roundtrip=await page.eval(async()=>{
   document.getElementById('nzJoineryCatalogLoad').click();const loaded=document.querySelector('[data-joinery-field="revision"]').value;
   const data=JSON.parse(localStorage.getItem('modelforge.cabinet-hardware-articles.v1'));document.getElementById('nzJoinery').remove();const host=document.createElement('div');document.body.appendChild(host);(await import('/js/ui_cabinet_joinery.js')).mountCabinetJoinery(host,()=>[],()=>{});
   return {loaded,data,options:document.getElementById('nzJoineryCatalog').options.length};
  });assert.equal(roundtrip.loaded,'2');assert.equal(roundtrip.options,3);assert.equal(roundtrip.data.articles[1].positions,undefined);assert.equal(roundtrip.data.articles[0].dimensions.lengthMm,30);
 }finally{await page.close();}
});

test('saved joinery survives reopening, joins revision exports and requires review after resizing',{skip:!chrome},async()=>{
 const page=await openPage({width:1280,height:900,lang:'en'});
 try{
  const saved=await page.eval(async()=>{
   const {makeSpec}=await import('/js/cabinet.js'),{mountCabinetJoinery}=await import('/js/ui_cabinet_joinery.js'),{cabinetProductionParts}=await import('/js/cabinet_production_parts.js');
   const item={id:'saved-joinery-ui',type:'cabsys',x:0,y:0,w:120,h:240,d:60,rot:0,cab:makeSpec('w_classic',120,240,60)};
   window.savedJoineryTest={items:[item],mutations:0,exports:[]};const state=window.savedJoineryTest,host=document.createElement('div');host.id='savedJoineryHost';document.body.appendChild(host);
   state.controller=mountCabinetJoinery(host,()=>state.items,(name,data)=>state.exports.push({name,data}),change=>{state.mutations++;change();});
   const parts=cabinetProductionParts(state.items).parts.filter(p=>p.geometry==='rectangle'&&p.finished.length>100&&p.finished.width>80&&Math.abs(p.finished.thickness-18)<1e-6);
   const fill=(key,value)=>{const n=document.querySelector('[data-joinery-field="'+key+'"]');n.value=String(value);n.dispatchEvent(new Event('change',{bubbles:true}));};
   fill('facePanel',parts[0].id);fill('edgePanel',parts[1].id);
   for(const [key,value]of Object.entries({manufacturer:'Shop',sku:'D8',revision:'A',sourceDrawing:'Drawing 42',diameterMm:8,lengthMm:30,faceDiameterMm:8,faceDepthMm:10,edgeDiameterMm:8,edgeDepthMm:25,minEdgeDistanceMm:10,faceOffsetMm:30,edgeOffsetMm:9,positions:'40,80'}))fill(key,value);
   document.getElementById('nzJoineryReview').click();const enabled=!document.getElementById('nzJoineryPersist').disabled;document.getElementById('nzJoineryPersist').click();
   return {enabled,count:item.cab.joineryPlans?.length,mutations:state.mutations,status:document.getElementById('nzJoineryStatus').textContent,id:item.cab.joineryPlans?.[0].id};
  });
  assert.equal(saved.enabled,true);assert.equal(saved.count,1,saved.status);assert.equal(saved.mutations,1);
  const reopened=await page.eval(async()=>{
   const state=window.savedJoineryTest;state.items=JSON.parse(JSON.stringify(state.items));document.getElementById('savedJoineryHost').replaceChildren();state.controller=(await import('/js/ui_cabinet_joinery.js')).mountCabinetJoinery(document.getElementById('savedJoineryHost'),()=>state.items,(name,data)=>state.exports.push({name,data}),change=>{state.mutations++;change();});
   const {createCabinetProductionJob}=await import('/js/cabinet_production_workflow.js');state.job=createCabinetProductionJob(state.items);const exported=JSON.parse(JSON.stringify(state.job));
   return {savedText:document.getElementById('nzJoinerySavedPlans').textContent,plans:exported.manifest.joinery.plans.length,operations:exported.manifest.joinery.operations.length,scope:exported.productionRelease};
  });assert.match(reopened.savedText,/Current/);assert.equal(reopened.plans,1);assert.equal(reopened.operations,4);assert.equal(reopened.scope,false);
  const stale=await page.eval(async()=>{
   const state=window.savedJoineryTest;state.items[0].h+=10;state.controller.refresh();const {createCabinetProductionJob,transitionCabinetProductionJob}=await import('/js/cabinet_production_workflow.js');const job=createCabinetProductionJob(state.items);let error='';try{transitionCabinetProductionJob(job,'checked',{items:state.items,reviewer:'Reviewer',evidence:'Review',acknowledgedIssues:job.manifest.issues.map(i=>i.code)});}catch(e){error=e.message;}
   return {text:document.getElementById('nzJoinerySavedPlans').textContent,operations:job.manifest.joinery.operations.length,error};
  });assert.match(stale.text,/STALE/);assert.equal(stale.operations,0);assert.match(stale.error,/joinery/i);
  const revalidated=await page.eval(async()=>{
   const state=window.savedJoineryTest,buttons=Array.from(document.querySelectorAll('#nzJoinerySavedPlans button'));buttons.find(button=>button.textContent.includes('revalidate')).click();
   const rows=document.querySelectorAll('#nzJoineryPreview tr').length,enabled=!document.getElementById('nzJoineryPersist').disabled;document.getElementById('nzJoineryPersist').click();
   const {createCabinetProductionJob}=await import('/js/cabinet_production_workflow.js'),job=createCabinetProductionJob(state.items);
   return {rows,enabled,count:state.items[0].cab.joineryPlans.length,id:state.items[0].cab.joineryPlans[0].id,operations:job.manifest.joinery.operations.length,mutations:state.mutations,status:document.getElementById('nzJoineryStatus').textContent};
  });assert.equal(revalidated.rows,5);assert.equal(revalidated.enabled,true);assert.equal(revalidated.count,1,revalidated.status);assert.equal(revalidated.id,saved.id);assert.equal(revalidated.operations,4);assert.equal(revalidated.mutations,2);
  const removed=await page.eval(()=>{Array.from(document.querySelectorAll('#nzJoinerySavedPlans button')).find(button=>button.textContent.includes('Remove')).click();return {count:window.savedJoineryTest.items[0].cab.joineryPlans.length,mutations:window.savedJoineryTest.mutations};});assert.equal(removed.count,0);assert.equal(removed.mutations,3);
 }finally{await page.close();}
});
