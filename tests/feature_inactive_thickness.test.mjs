import test from 'node:test';
import assert from 'node:assert/strict';
import {readFeatureParameterForm,validateFeatureInputs} from '../js/modeler_feature_form.js';

test('solid extrusion edits ignore an absent inactive thin-wall thickness, and enabling thin requires it',()=>{
  const thin={field:{key:'thinFeature',type:'boolean'},input:{checked:false}};
  const thickness={field:{key:'thickness',type:'number',unit:'length'},input:{value:''}};
  const depth={field:{key:'depth',type:'number',unit:'length'},input:{value:'2'}};
  const controls=[thin,thickness,depth];
  let read=readFeatureParameterForm(controls,{thinFeature:false});
  assert.equal(read.valid,true);assert.equal(read.params.depth,2);assert.equal(read.params.thickness,undefined);
  thin.input.checked=true;
  assert.equal(readFeatureParameterForm(controls,{}).valid,false);
  thickness.input.value='.1';
  read=readFeatureParameterForm(controls,{});
  assert.equal(read.valid,true);assert.equal(read.params.thickness,.1);
});

test('inactive thickness does not focus or report an irrelevant empty-expression error',()=>{
  let validated=false;
  const input={dataset:{parameter:'thickness'},closest:()=>null,_validateFeatureValue:()=>{validated=true;},checkValidity:()=>false};
  const host={querySelectorAll:()=>[input],querySelector:()=>({checked:false})};
  assert.equal(validateFeatureInputs(host),true);assert.equal(validated,false);
});
