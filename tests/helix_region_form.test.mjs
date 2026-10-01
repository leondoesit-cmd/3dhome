import test from 'node:test';
import assert from 'node:assert/strict';
import {createHelixRegionEditor} from '../js/helix_region_form.js';
import {evaluateFeatureNumber,featureControlValue,readFeatureParameterForm} from '../js/modeler_feature_form.js';

function el(tag,_class,text){return {tag,children:[],listeners:{},attributes:{},dataset:{},value:'',text:text || '',get textContent(){return this.text;},set textContent(value){this.text=value;this.children=[];},appendChild(child){this.children.push(child);},setAttribute(key,value){this.attributes[key]=value;},setCustomValidity(value){this.validity=value;},addEventListener(type,handler){(this.listeners[type] ||= []).push(handler);},dispatchEvent(event){for(const listener of this.listeners[event.type] || [])listener(event);}};}
function find(host,label){if(host.attributes?.['aria-label']===label)return host;for(const child of host.children || []){const found=find(child,label);if(found)return found;}return null;}
const inch=2.54,rows=[.021,.021,.080,.080,.021,.021,.021].map((pitch,revolution)=>({revolution,pitch:pitch*inch,diameter:.235*inch}));

test('region table displays document units and integrated heights, and editable rows feed the real form reader',()=>{
  const table=createHelixRegionEditor(rows,{el,evaluateNumber:evaluateFeatureNumber,units:{length:'in'}});
  assert.equal(find(table,'Region 2 pitch (in)').value,'0.021');
  assert.equal(find(table,'Region 4 height (in)').textContent,'0.1515');
  const pitch=find(table,'Region 4 pitch (in)');pitch.value='.090 in';
  const control={field:{key:'pitchRegions',type:'helix-regions'},input:table};
  const values=readFeatureParameterForm([control],{pitchMode:'variable'});
  assert.equal(values.valid,true);assert.ok(Math.abs(values.params.pitchRegions[3].pitch-.09*inch)<1e-12);
  assert.equal(find(table,'Region 7 height (in)').textContent,'0.254');
});

test('Add and Remove region preserve prior edits and emit live form changes; invalid ordered regions prevent commit',()=>{
  const table=createHelixRegionEditor(rows.slice(0,2),{el,evaluateNumber:evaluateFeatureNumber,units:{length:'in'}});let changes=0;
  table.addEventListener('change',()=>{changes++;});
  table.children.find(item=>item.tag==='button').listeners.click[0]();
  assert.equal(featureControlValue({field:{type:'helix-regions'},input:table}).length,3);assert.equal(changes,1);
  assert.equal(find(table,'Region 3 revolution').value,'2');
  find(table,'Remove region 3').listeners.click[0]();assert.equal(table.getRegionRows().length,2);assert.equal(changes,2);
  find(table,'Region 2 revolution').value='0';
  assert.equal(readFeatureParameterForm([{field:{key:'pitchRegions',type:'helix-regions'},input:table}],{}).valid,false);
  assert.match(find(table,'Region 1 revolution').validity,/increase/);
});
