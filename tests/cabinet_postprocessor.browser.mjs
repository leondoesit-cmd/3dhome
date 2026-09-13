import test from 'node:test';
import assert from 'node:assert/strict';
import {openPage,findChrome} from '../tools/browser_harness.mjs';
const chrome=await findChrome();
test('shop setup imports, previews and downloads simulation; stale and unsupported exports are blocked',{skip:!chrome},async()=>{
 const page=await openPage({width:1280,height:900,lang:'en'});
 try{
  await page.eval(async()=>{
   localStorage.removeItem('modelforge.cabinet-shop-profile.v1');
   const {S}=await import('/js/state.js'),{makeSpec,normalizeSpec}=await import('/js/cabinet.js'),{openNest}=await import('/js/ui_nest.js');
   const it={id:'shop-ui',type:'cabsys',x:0,y:0,w:60,h:100,d:60,rot:0,cab:makeSpec('w_classic',60,100,60)};it.cab.auto=false;it.cab.cols=[{w:56.4,door:{t:'hinged',leaves:1,hinge:'L'},secs:[{t:'shelves',h:80,n:2}]}];normalizeSpec(it.cab,it.w,it.h,it.d);S.items=[it];openNest(it);
   document.querySelector('.nz-cnc').open=true;document.querySelector('#nzCncValidate').click();
  });
  assert.ok(await page.eval(()=>document.querySelector('#nzCncStatus').textContent.includes('Export blocked')));
  await page.eval(async()=>{
   const {newCabinetShopProfile}=await import('/js/cabinet_shop_profiles.js');
   const p={...newCabinetShopProfile(),name:'Browser test shop',travel:{x:2500,y:1300,z:150},safeZ:15,breakthrough:1,tools:[5,35].map((diameter,i)=>({number:i+1,diameter,feed:200,rpm:3000,maxDepth:40,holderDiameter:40,spinupSeconds:2}))};
   const input=document.querySelector('#nzCncProfile');input.value=JSON.stringify(p);input.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('#nzCncApply').click();document.querySelector('#nzCncValidate').click();
  });
  const ready=await page.eval(()=>({status:document.querySelector('#nzCncStatus').textContent,code:document.querySelector('#nzCncPreview').value,disabled:document.querySelector('#nzCncDownload').disabled,svg:!!document.querySelector('#nzCncDrawing svg'),tools:document.querySelectorAll('.nz-cnc-tool').length}));
  assert.ok(ready.status.includes('Simulation ready'));assert.ok(ready.code.includes('SIMULATION ONLY'));assert.equal(ready.disabled,false);assert.equal(ready.svg,true);assert.equal(ready.tools,2);
  const downloaded=await page.eval(async()=>{const create=URL.createObjectURL,click=HTMLAnchorElement.prototype.click;let blob,name;
   URL.createObjectURL=b=>{blob=b;return 'blob:shop-test';};HTMLAnchorElement.prototype.click=function(){name=this.download;};
   try{document.querySelector('#nzCncDownload').click();return{name,text:await blob.text()};}finally{URL.createObjectURL=create;HTMLAnchorElement.prototype.click=click;}
  });
  assert.ok(downloaded.name.endsWith('.nc'));assert.ok(downloaded.text.includes('G90 G21'));
  for(const [controller,extension,marker] of [['homag-woodwop','mpr','BohrVert'],['biesse-bsolid','cix','NAME=BG'],['scm-prisma-xxl','xxl','XL2P']]){
   const native=await page.eval(async({controller})=>{
    const p=JSON.parse(localStorage.getItem('modelforge.cabinet-shop-profile.v1'));p.controller=controller;p.native={woodwopMachine:'WEEKE',biesseOrigin:'1',scmReverseZ:false};p.tools.forEach(t=>t.nativeName='DRILL_'+t.diameter);
    document.querySelector('#nzCncProfile').value=JSON.stringify(p);document.querySelector('#nzCncApply').click();document.querySelector('#nzCncValidate').click();
    return {code:document.querySelector('#nzCncPreview').value,name:document.querySelector('#nzCncFiles').selectedOptions[0]?.textContent,disabled:document.querySelector('#nzCncDownload').disabled};
   },{controller});
   assert.equal(native.disabled,false);assert.ok(native.name.endsWith('.'+extension));assert.ok(native.code.includes(marker));
  }
  const recipeDraft=await page.eval(async()=>{const create=URL.createObjectURL,click=HTMLAnchorElement.prototype.click;let blob;
   URL.createObjectURL=b=>{blob=b;return 'blob:recipe-test';};HTMLAnchorElement.prototype.click=function(){};
   try{document.querySelector('#nzCncRecipeDraft').click();return JSON.parse(await blob.text());}finally{URL.createObjectURL=create;HTMLAnchorElement.prototype.click=click;}
  });
  assert.ok(recipeDraft.completeRecipes[0].sourceSignature);assert.ok(recipeDraft.completeRecipes[0].panels.length>3);assert.ok(recipeDraft.completeRecipes[0].panels.every(p=>p.noDrillReason===''));
  await page.eval(()=>{const input=document.querySelector('#nzCncProfile');input.value='not json';input.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('#nzCncValidate').click();});
  assert.equal(await page.eval(()=>document.querySelector('#nzCncDownload').disabled),true);assert.ok(await page.eval(()=>document.querySelector('#nzCncStatus').textContent.includes('Apply the edited')));
  await page.eval(()=>{document.querySelector('#nzCncProfile').value=localStorage.getItem('modelforge.cabinet-shop-profile.v1');document.querySelector('#nzCncApply').click();const c=document.querySelector('#nzCncController');c.value='custom-vendor';c.dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('#nzCncValidate').click();});
  assert.equal(await page.eval(()=>document.querySelector('#nzCncDownload').disabled),true);assert.ok(await page.eval(()=>document.querySelector('#nzCncStatus').textContent.includes('no native postprocessor')));
 }finally{await page.close();}
});
