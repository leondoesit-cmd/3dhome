import test from 'node:test';
import assert from 'node:assert/strict';
import {dimensionText,measureDim,resolveDim} from '../js/cad_sheet.js';
test('reference dimensions keep their measured value and format after geometry changes',()=>{
 const dim={type:'vertical',reference:true,refs:[{pid:'edge',kind:'edge',at:'a'},{pid:'edge',kind:'edge',at:'b'}]};
 const basis={right:{x:1,y:0,z:0},up:{x:0,y:1,z:0}};
 for(const length of [1.95,2.25]) {
  const index=new Map([['edge',{kind:'edge',descriptor:{curve:'line',endpoints:[{x:0,y:0,z:0},{x:0,y:length,z:0}]}}]]);
  const resolved=resolveDim(JSON.parse(JSON.stringify(dim)),index,basis).dim;
  assert.equal(dimensionText({...resolved,measure:measureDim(resolved)},{units:'mm',precision:2}),'('+(length*10).toFixed(2)+')');
 }
 assert.equal(dim.text,undefined);
});
