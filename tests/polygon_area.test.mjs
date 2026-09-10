import test from 'node:test';
import assert from 'node:assert/strict';
import {polygonDifferenceArea as area} from '../js/polygon_area.js';
const rect=(x,z,w,d)=>[{x,z},{x:x+w,z},{x:x+w,z:z+d},{x,z:z+d}];
test('unions count shared solids once and clip overlapping voids',()=>{
 assert.equal(area([rect(0,0,10,10),rect(5,0,10,10)]),150);
 assert.equal(area([rect(0,0,10,10)],[rect(2,2,4,4),rect(4,2,4,4)]),76);
 assert.equal(area([rect(0,0,10,10)],[rect(5,-5,10,20)]),50);
});
test('concave boundaries and diagonal edge crossings integrate without sampling error',()=>{
 const l=[{x:0,z:0},{x:10,z:0},{x:10,z:4},{x:4,z:4},{x:4,z:10},{x:0,z:10}];
 assert.equal(area([l]),64);
 const triangle=[{x:0,z:0},{x:10,z:0},{x:5,z:10}];
 assert.equal(area([triangle]),50);
 assert.equal(area([triangle],[rect(0,0,10,5)]),12.5);
 assert.equal(area([l.slice().reverse()]),64);
});
test('empty and malformed geometry are distinguished',()=>{
 assert.equal(area([]),0);assert.equal(area([[{x:NaN,z:0}]]),null);
});
