import test from 'node:test';
import assert from 'node:assert/strict';
import {rebindTopologyMate} from '../js/core/topology_mate_rebind.js';

test('explicit mate repair accepts either pick order and retains mate identity and motion settings',()=>{
  const mate={id:'hinge',type:'screw',pitch:1,turns:2,axisOpposed:true,a:{componentId:'base',persistentId:'old-a'},b:{componentId:'shaft',persistentId:'old-b'}};
  const a={componentId:'base',persistentId:'new-a',frame:{axis:{x:1,y:0,z:0}}},b={componentId:'shaft',persistentId:'new-b'};
  rebindTopologyMate(mate,b,a);
  assert.equal(mate.a.persistentId,'new-a');assert.equal(mate.b.persistentId,'new-b');
  assert.equal(mate.id,'hinge');assert.equal(mate.pitch,1);assert.equal(mate.turns,2);assert.equal(mate.axisOpposed,true);
  a.frame.axis.x=99;assert.equal(mate.a.frame.axis.x,1);
  assert.throws(()=>rebindTopologyMate(mate,a,{componentId:'other'}),/two components/);
  assert.equal(mate.b.persistentId,'new-b','a refused pick pair leaves the previous references intact');
});
