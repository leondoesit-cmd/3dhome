import test from 'node:test';
import assert from 'node:assert/strict';
import {threadPlacementFromFace} from '../js/core/thread_placement.js';
import {cosmeticThread} from '../js/cad_thread.js';

test('native bore cylinder range uses kernel reference point, preserving negative X thread direction',()=>{
  const descriptor={origin:{x:0,y:0,z:0},axis:{x:-1,y:0,z:0},
    referenceOrigin:{x:-.6,y:0,z:0},axisRange:[-1.2000000000000455,0]};
  const before=structuredClone(descriptor),placement=threadPlacementFromFace(descriptor);
  assert.deepEqual(placement,{origin:{x:.6,y:0,z:0},axis:{x:-1,y:0,z:0}});
  assert.deepEqual(descriptor,before);
});

test('fresh browser lead screw cosmetic overlay spans its actual shaft rather than extending from midpoint',()=>{
  const descriptor={origin:{x:.50455,y:0,z:0},axis:{x:-1,y:0,z:0},
    referenceOrigin:{x:-4,y:0,z:0},axisRange:[-9.0091,0]};
  const placement=threadPlacementFromFace(descriptor);
  const thread=cosmeticThread({threadPreset:'custom',side:'external',mode:'cosmetic',diameterMm:8,
    pitchMm:4,length:9.0091,...placement});
  assert.ok(Math.abs(Math.max(...thread.overlay.map(p=>p.x))-5.0091)<1e-10);
  assert.ok(Math.abs(Math.min(...thread.overlay.map(p=>p.x))+4)<1e-10);
  assert.deepEqual(thread.spec.axis,{x:-1,y:0,z:0});
});

test('native oblique cylinder range is measured along its axis rather than guessed from AABB corners',()=>{
  const axis={x:.6,y:.8,z:0};
  const placement=threadPlacementFromFace({origin:{x:20,y:30,z:40},referenceOrigin:{x:1,y:2,z:3},
    axis,axisRange:[-2,3],along:{min:99}});
  assert.ok(Math.abs(placement.origin.x+.2)<1e-12);
  assert.ok(Math.abs(placement.origin.y-.4)<1e-12);
  assert.equal(placement.origin.z,3);
  assert.deepEqual(placement.axis,axis);
});

test('analytic face descriptors retain midpoint-relative along range semantics',()=>{
  assert.deepEqual(threadPlacementFromFace({origin:{x:3,y:2,z:1},axis:{x:2,y:0,z:0},along:{min:-.5,max:.5}}),
    {origin:{x:2.5,y:2,z:1},axis:{x:1,y:0,z:0}});
});
