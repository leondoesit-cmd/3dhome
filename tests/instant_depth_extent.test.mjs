import test from 'node:test';import assert from 'node:assert/strict';
import {extrudeHandlePose} from '../js/modeler_instant3d.js';
test('only numeric-depth extents offer a depth handle',()=>{
 const b={x0:0,x1:10,y0:0,y1:10,z0:0,z1:10};
 for(const endCondition of ['through-all','up-to-face'])assert.equal(extrudeHandlePose(b,'x',{endCondition,depth:60}),null);
 assert.equal(extrudeHandlePose(b,'x',{endCondition:'blind',depth:5}).value,5);
 assert.equal(extrudeHandlePose(b,'x',{depth:5}).value,5);
});
