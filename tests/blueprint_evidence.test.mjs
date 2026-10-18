import test from 'node:test';
import assert from 'node:assert/strict';
import {blueprintEvidence} from '../js/core/blueprint_evidence.js';
const image={width:120,height:100};
const walls=[[10,10,110,10,4],[110,10,110,90,4],[110,90,10,90,4],[10,90,10,10,4],[60,10,60,90,4]];
test('a sealed exterior and substantial interior partitions are protected',()=>{
  const e=blueprintEvidence(image,walls);assert.equal(e.sealed,true);assert.deepEqual(e.protectedWalls,[0,1,2,3,4]);
});
test('a leaking footprint cannot protect every stroke as an exterior wall',()=>{
  const e=blueprintEvidence(image,walls.slice(1,4));assert.equal(e.sealed,false);assert.deepEqual(e.protectedWalls,[]);
});
