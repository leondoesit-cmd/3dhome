import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../js/modeler.js',import.meta.url),'utf8');
const start=source.indexOf('function applyDimensionEditor() {');
const end=source.indexOf('function deleteDimensionEditor()',start);

function apply(type,value) {
  const constraint={type,value,driven:false};
  const fields={mdDimValue:{value:String(value),focus(){}},mdDimMode:{value:'driving'},mdDimName:{value:''}};
  const E={def:{},dimEditor:{constraint,sketch:{},before:{text:String(value),value,driven:false,name:''},historyAlreadyOpen:true}};
  let resolved=0,hidden=0;
  const context={E,root:{querySelector:s=>fields[s.slice(1)]||null},fin:Number.isFinite,
    clearDimensionRefusal(){},nameAvailable:()=>true,activateDrawingSketch(){},
    resolveSketch:()=>{resolved++;return true;},hideDimensionEditor:()=>{hidden++;},refreshAll(){}};
  vm.createContext(context);
  vm.runInContext(source.slice(start,end),context);
  return {accepted:vm.runInContext('applyDimensionEditor()',context),constraint,resolved,hidden};
}

test('the actual dimension editor accepts its measured directed -160 degree slope',()=>{
  const result=apply('angle',-160);
  assert.equal(result.accepted,true);
  assert.equal(result.constraint.value,-160);
  assert.equal(result.resolved,1);
  assert.equal(result.hidden,1,'Apply closes the editor instead of silently retaining the dialog');
});

test('parallel zero angle is valid but zero/negative lengths and nonfinite angles are refused',()=>{
  assert.equal(apply('angle',0).accepted,true);
  for(const value of [0,-160]) assert.equal(apply('distance',value).accepted,false);
  assert.equal(apply('angle',NaN).accepted,false);
});
