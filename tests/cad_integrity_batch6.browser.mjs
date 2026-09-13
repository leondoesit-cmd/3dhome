import test from 'node:test';
import assert from 'node:assert/strict';
import {openPage,findChrome} from '../tools/browser_harness.mjs';
const chrome=await findChrome();
test('hole form defaults and size/fit changes use corrected clearance dimensions',chrome?{timeout:90000}:{skip:'Chrome unavailable'},async()=>{
 const page=await openPage({width:1440,height:1000,lang:'en'});
 try{const values=await page.eval(async()=>{
  const {openModeler}=await import('/js/modeler.js');
  openModeler(null,{key:'clearance_fixture',name:'Clearance fixture',parts:[]},null);window.cadOpenFeatureForm('hole');
  const field=key=>document.querySelector('#mdQuickSettings input[data-parameter="'+key+'"],#mdQuickSettings select[data-parameter="'+key+'"]');
  const values=[Number(field('diameter').value)];
  const set=(key,value)=>{const input=field(key);input.value=value;input.dispatchEvent(new Event('change',{bubbles:true}));values.push(Number(field('diameter').value));};
  set('standardSize','M10');set('fit','close');set('fit','loose');return values;
 });assert.deepEqual(values,[.66,1.1,1.05,1.2]);}finally{await page.close();}
});
