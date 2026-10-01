import test from 'node:test';
import assert from 'node:assert/strict';
import {solveTopologyMates, topologyReference} from '../js/cad_mates.js';
import {validLimitMateBounds} from '../js/cad_mate_model.js';

// Synthetic planes exercise the mate solver, not an ebook model or seed part.
const frame = normal => ({surface:'plane', origin:{x:0,y:0,z:0}, normal});
function slider(position) {
  const ref = (component,id,normal) => topologyReference(component,'face',id,frame(normal));
  return {components:[{id:'fixed',grounded:true,transform:{}},
    {id:'slider',transform:{x:position,y:0,z:0}}], topologyMates:[
    {id:'travel',type:'limit',aligned:true,min:2,max:8,value:2,
      a:ref('fixed','travel-a',{x:1,y:0,z:0}),b:ref('slider','travel-b',{x:1,y:0,z:0})},
    {id:'guide-y',type:'coincident',aligned:true,
      a:ref('fixed','guide-y-a',{x:0,y:1,z:0}),b:ref('slider','guide-y-b',{x:0,y:1,z:0})},
    {id:'guide-z',type:'coincident',aligned:true,
      a:ref('fixed','guide-z-a',{x:0,y:0,z:1}),b:ref('slider','guide-z-b',{x:0,y:0,z:1})},
  ]};
}
test('Chapter 8.4 limit mate preserves interior travel and reports a sliding DOF',()=>{
  const assembly=slider(5);
  for(const position of [5,3,7]){
    assembly.components[1].transform.x=position;
    const result=solveTopologyMates(assembly);
    assert.equal(result.ok,true,JSON.stringify(result));
    assert.ok(Math.abs(assembly.components[1].transform.x-position)<1e-5);
    assert.equal(result.degreesOfFreedom,1);
  }
});
test('Chapter 8.4 limit mate enforces both end stops and allows moving back inside',()=>{
  for(const [start,stop] of [[-4,2],[12,8]]){
    const assembly=slider(start), result=solveTopologyMates(assembly);
    assert.equal(result.ok,true,JSON.stringify(result));
    assert.ok(Math.abs(assembly.components[1].transform.x-stop)<1e-5);
    assert.equal(result.degreesOfFreedom,1,'an end stop still permits returning into the interval');
    assert.equal(result.clusters[0].perComponent.slider,1);
    const repeated=solveTopologyMates(assembly);
    assert.equal(repeated.degreesOfFreedom,1,'solving again at the stop retains the available motion');
    assembly.components[1].transform.x=5;
    assert.equal(solveTopologyMates(assembly).ok,true);
    assert.ok(Math.abs(assembly.components[1].transform.x-5)<1e-5);
  }
});
test('equal travel limits retain a fixed distance and a fully constrained slider',()=>{
  const assembly=slider(5);assembly.topologyMates[0].min=4;assembly.topologyMates[0].max=4;
  const result=solveTopologyMates(assembly);
  assert.equal(result.ok,true,JSON.stringify(result));
  assert.ok(Math.abs(assembly.components[1].transform.x-4)<1e-5);
  assert.equal(result.degreesOfFreedom,0);
});
test('limit range edits reject missing, nonfinite and reversed bounds without rejecting signed or equal limits',()=>{
  for(const bounds of [['',2],[0,''],[NaN,2],[0,Infinity],[3,2]])assert.equal(validLimitMateBounds(...bounds),null);
  assert.deepEqual(validLimitMateBounds(-2,3),{min:-2,max:3});
  assert.deepEqual(validLimitMateBounds('4','4'),{min:4,max:4});
});
