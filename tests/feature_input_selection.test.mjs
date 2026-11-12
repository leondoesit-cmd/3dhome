import { modelerSource } from "./helpers/modeler_source.mjs";
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=modelerSource();
const start=source.indexOf('function selectedFeatureIds() {'),end=source.indexOf('\nfunction selectedSketchIds()',start);
function selection(explicit,part){
  const select=vm.runInNewContext('('+source.slice(start,end)+')',{
    E:{authoring:{featureSelection:explicit}},selectedSolid:()=>part,cutTargetFeatureId:item=>item.head,
  });
  return Array.from(select());
}
test('two explicit finished body heads are the exact Combine inputs',()=>{
  assert.deepEqual(selection(['ramp-cut','pad-fillet'],{featureId:'ramp-boss',head:'ramp-cut'}),['ramp-cut','pad-fillet']);
});
test('a canvas-only solid selection uses its finished head',()=>{
  assert.deepEqual(selection([],{featureId:'pad-boss',head:'pad-fillet'}),['pad-fillet']);
  assert.deepEqual(selection([],null),[]);
});
