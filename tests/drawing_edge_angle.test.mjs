import test from 'node:test';
import assert from 'node:assert/strict';
import {edgeAngleRefs,resolveDim,measureDim} from '../js/cad_sheet.js';
const basis={right:{x:1,y:0,z:0},up:{x:0,y:1,z:0}};
const make=(angle)=>new Map([
 ['slope',{kind:'edge',descriptor:{curve:'line',endpoints:[{x:0,y:0,z:0},{x:Math.sin(angle*Math.PI/180),y:Math.cos(angle*Math.PI/180),z:0}]}}],
 ['vertical',{kind:'edge',descriptor:{curve:'line',endpoints:[{x:2,y:0,z:0},{x:2,y:1,z:0}]}}]
]);
const edgeRefs=['slope','vertical'].flatMap(pid=>['a','b'].map(at=>({pid,kind:'edge',at})));
test('two-edge angle follows topology changes without changing stored references',()=>{
 const dim={type:'angle',edgeRefs,refs:[]};
 for(const angle of [20,35]) {
  const result=resolveDim(dim,make(angle),basis);
  assert.equal(result.dangling,false);
  assert.ok(Math.abs(measureDim(result.dim)-angle)<1e-8);
 }
 assert.deepEqual(dim.refs,[]);
 const missing=make(20);missing.delete('slope');
 assert.equal(resolveDim(dim,missing,basis).dangling,true);
});
test('parallel and degenerate edges do not produce an angular dimension',()=>{
 assert.equal(edgeAngleRefs([{u:0,v:0},{u:0,v:1},{u:1,v:0},{u:1,v:1}]),null);
 assert.equal(edgeAngleRefs([{u:0,v:0},{u:0,v:0},{u:1,v:0},{u:1,v:1}]),null);
});
