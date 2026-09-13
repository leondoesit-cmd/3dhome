import test from 'node:test';
import assert from 'node:assert/strict';
import {openPage,findChrome} from '../tools/browser_harness.mjs';
const chrome=await findChrome();
test('manufacturing provenance is visible in the material panel for an ordinary CAD body',chrome?{timeout:60000}:{skip:'Chrome unavailable'},async()=>{
 const page=await openPage({width:1440,height:1000,lang:'en'});
 try{const result=await page.eval(async()=>{
  const {openModeler}=await import('/js/modeler.js');
  openModeler(null,{key:'table_sources',name:'Table sources',parts:[{id:'stock',kind:'box',x0:0,x1:4,y0:0,y1:5,z0:0,z1:6}]},null);
  const tab=document.querySelector('#modeler [data-tab="look"]');if(!tab)throw new Error('Material tab missing');tab.click();
  const details=document.querySelector('.md-table-sources');if(!details)throw new Error('Table sources missing');details.open=true;
  return {count:details.querySelectorAll('[data-manufacturing-table]').length,text:details.textContent,source:details.querySelector('a')?.href};
 });assert.ok(result.count>=61);assert.match(result.text,/Edition unverified/);assert.match(result.source,/clearance-hole-chart/);}
 finally{await page.close();}
});
