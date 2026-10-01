import test from 'node:test';
import assert from 'node:assert/strict';
import {dimensionText,measureDim,resolveDim} from '../js/cad_sheet.js';

test('a bolt-circle diameter prefix follows changed associative anchors',()=>{
  const dim={type:'vertical',text:'Ø<>',refs:[{pid:'edge',kind:'edge',at:'a'},{pid:'edge',kind:'edge',at:'b'}]};
  const basis={right:{x:1,y:0,z:0},up:{x:0,y:1,z:0}};
  for(const [length,expected] of [[9.9568,'Ø3.92'],[10.16,'Ø4.00']]) {
    const index=new Map([['edge',{kind:'edge',descriptor:{curve:'line',endpoints:[{x:0,y:0,z:0},{x:0,y:length,z:0}]}}]]);
    const resolved=resolveDim(structuredClone(dim),index,basis).dim;
    assert.equal(dimensionText({...resolved,measure:measureDim(resolved)},{units:'in',precision:2}),expected);
  }
  assert.equal(dim.text,'Ø<>');
});

test('live text retains quantity, reference, tolerance and secondary units once',()=>{
  assert.equal(dimensionText({type:'horizontal',measure:2.54,text:'SPAN <>',quantity:2,reference:true,tolerance:'±.01'},
    {units:'in',precision:2,secondaryUnits:'mm',secondaryPrecision:1}),'(2X SPAN 1.00 [25.4] ±.01)');
  assert.equal(dimensionText({type:'angle',measure:82,text:'<> COUNTERSINK',tolerance:'±1°'},{}),'82° COUNTERSINK ±1°');
});

test('literal overrides remain unchanged and diameter templates retain their symbol',()=>{
  assert.equal(dimensionText({type:'vertical',measure:10.16,text:'Ø3.92'},{units:'in',precision:2}),'Ø3.92');
  assert.equal(dimensionText({type:'diameter',measure:2,text:'<> THRU'},{units:'mm',precision:0}),'⌀20 THRU');
});
