import { modelerSource } from "./helpers/modeler_source.mjs";
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import {dimensionUnit} from '../js/sketch_equations.js';
import {makeDimensionTolerance} from '../js/core/dimension_tolerance.js';
import {sourceFunctionText} from './helpers/source_function.mjs';

const source=modelerSource();
const start=source.indexOf('function applyDimensionEditor() {');
const end=source.indexOf('function deleteDimensionEditor()',start);

function apply(type,value,tolerance=null) {
  const constraint={type,value,driven:false};
  const fields={mdDimValue:{value:String(value),focus(){}},mdDimMode:{value:'driving'},mdDimName:{value:''},mdDimTolerance:{value:'none'},mdDimTolUpper:{value:'0'},mdDimTolLower:{value:'0'}};
  if(tolerance){fields.mdDimTolerance.value='deviation';fields.mdDimTolUpper.value=tolerance.upper;fields.mdDimTolLower.value=tolerance.lower;}
  const E={def:{},dimEditor:{constraint,sketch:{},before:{text:String(value),value,driven:false,name:'',tolerance:null},historyAlreadyOpen:true}};
  let resolved=0,hidden=0;
  const context={E,dimensionUnit,makeDimensionTolerance,root:{querySelector:s=>fields[s.slice(1)]||null},fin:Number.isFinite,
    flash(message){throw new Error('Unexpected editor refusal: '+message);},
    clearDimensionRefusal(){},nameAvailable:()=>true,activateDrawingSketch(){},
    resolveSketch:()=>{resolved++;return true;},hideDimensionEditor:()=>{hidden++;},refreshAll(){}};
  vm.createContext(context);
  vm.runInContext(sourceFunctionText(source,'dimensionEditorUnit'),context);
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

test('directed angle editor keeps valid signed slope while applying real degree tolerance metadata',()=>{
  const result=apply('angle',-160,{upper:'0.5',lower:'-0.25'});
  assert.equal(result.accepted,true);assert.equal(result.constraint.value,-160);
  assert.equal(result.constraint.tolerance.unit,'deg');assert.equal(result.constraint.tolerance.upper,.5);assert.equal(result.constraint.tolerance.lower,-.25);assert.equal(result.hidden,1);
});
