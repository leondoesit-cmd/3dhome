import test from 'node:test';
import assert from 'node:assert/strict';
import {openPage,findChrome} from '../tools/browser_harness.mjs';

const chrome=await findChrome();
test('regional preset previews before an undoable apply and refreshes handoff gates',{skip:!chrome},async()=>{
  const page=await openPage({width:1280,height:900,lang:'en'});
  try{
    const result=await page.eval(async()=>{
      const {S}=await import('/js/state.js'),{makeSpec}=await import('/js/cabinet.js'),{openNest}=await import('/js/ui_nest.js');
      const item={id:'preset-browser',type:'cabsys',x:0,y:0,w:60,h:90,d:60,rot:0,cab:makeSpec('k_base_drawers',60,90,60)};
      window.productionPresetItem=item;S.items=[item];openNest(item);
      const select=document.getElementById('nzProductionPreset');select.value='us-frameless';select.dispatchEvent(new Event('change',{bubbles:true}));
      const before={panel:item.cab.panel,context:item.cab.productionConvention,preview:document.getElementById('nzProductionPresetChanges').textContent,
        stockWarning:document.querySelector('#nzProductionPresetChanges .nz-preset-stock')?.textContent};
      document.getElementById('nzProductionApplyPresetScope').click();
      const scoped={panel:item.cab.panel,market:document.getElementById('nzProductionMarket').value};
      document.getElementById('nzProductionApplyPreset').click();
      return {before,scoped,after:{panel:item.cab.panel,back:item.cab.back,gap:item.cab.gap,plinth:item.cab.plinth,profile:item.cab.productionConvention?.presetId,market:document.getElementById('nzProductionMarket').value},
        gates:[...document.querySelectorAll('#nzProductionReadiness .nz-readiness-stage summary')].map(node=>node.textContent),job:document.getElementById('nzProductionJobStatus').textContent,
        quoteWarning:document.getElementById('nzWarn')?.textContent};
    });
    assert.equal(result.before.panel,1.8);assert.equal(result.before.context,undefined);assert.match(result.before.preview,/would change/);
    assert.match(result.before.stockWarning,/lack matching sheet stock/);
    assert.equal(result.scoped.panel,1.8);assert.equal(result.scoped.market,'US');
    assert.equal(result.after.panel,1.905);assert.equal(result.after.back,0.635);assert.equal(result.after.gap,0.3175);assert.equal(result.after.plinth,10.16);assert.equal(result.after.profile,'us-frameless');assert.equal(result.after.market,'US');
    assert.equal(result.gates.length,6,JSON.stringify(result.gates));assert.ok(result.gates.some(value=>/Stock.*Blocked/.test(value)));assert.match(result.job,/No revision snapshot/);
    assert.match(result.quoteWarning,/no matching sheet stock/);
    const snapshot=await page.eval(()=>{
      document.getElementById('nzProductionSnapshot').click();
      return {revision:[...document.querySelectorAll('#nzProductionReadiness .nz-readiness-stage')].find(node=>/Revision & documents/.test(node.textContent))?.className,
        stock:[...document.querySelectorAll('#nzProductionReadiness .nz-readiness-stage')].find(node=>/Stock & finished edges/.test(node.textContent))?.className,
        issues:document.getElementById('nzProductionIssueList').textContent};
    });
    assert.match(snapshot.revision,/review/);assert.match(snapshot.stock,/blocked/);assert.match(snapshot.issues,/19\.05 mm/);
    const designer=await page.eval(async()=>{
      const {closeNest}=await import('/js/ui_nest.js'),{openCabinet}=await import('/js/ui_cabinet.js');closeNest();openCabinet(window.productionPresetItem);
      document.querySelector('#cabdes [data-level="technical"]').click();const card=document.querySelector('#cabdes .cb-production-convention');
      const text=card?.textContent||'';card?.querySelector('button')?.click();return {text,productionVisible:getComputedStyle(document.getElementById('nestplan')).display!=='none'};
    });
    assert.match(designer.text,/US frameless/);assert.equal(designer.productionVisible,true);
  }finally{await page.close();}
});
