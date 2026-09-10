import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateFeatureNumber, featureControlValue, readFeatureParameterForm } from '../js/modeler_feature_form.js';
const field={type:'number',key:'depth',min:0.001};
test('feature arithmetic preserves precision and rejects code, units, and invalid ranges',()=>{
 assert.equal(evaluateFeatureNumber('80/3',field),80/3);
 assert.equal(evaluateFeatureNumber('(10 + 5) * 2',field),30);
 assert.equal(evaluateFeatureNumber('1e-3',field),.001);
 for(const value of ['','1/0','-2','1200 mm','globalThis.alert(1)','NaN']) assert.throws(()=>evaluateFeatureNumber(value,field));
 assert.throws(()=>evaluateFeatureNumber('5/2',{key:'count',min:2}));
 assert.equal(evaluateFeatureNumber('6/2',{key:'count',min:2}),3);
});
test('an incomplete expression never overwrites the last valid feature parameters',()=>{
 const input={value:'80/'};
 const result=readFeatureParameterForm([{field,input}],{depth:12});
 assert.equal(result.valid,false);assert.equal(result.params.depth,12);
 input.value='80/4';assert.equal(featureControlValue({field,input}),20);
 assert.deepEqual(readFeatureParameterForm([{field,input}],{depth:12}),{params:{depth:20},references:{},valid:true});
});
