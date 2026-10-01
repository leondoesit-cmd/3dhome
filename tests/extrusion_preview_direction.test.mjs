import test from 'node:test';
import assert from 'node:assert/strict';
import {extrusionPreviewDirection} from '../js/core/extrusion_projection.js';

test('frameless stop changes from reverse to forward independently of its prior interval',()=>{
  const sketch={plane:'front'};
  assert.equal(extrusionPreviewDirection(sketch,'z','reverse'),-1);
  assert.equal(extrusionPreviewDirection(sketch,'z','forward'),1);
});
test('local negative-normal support is applied by the frame once',()=>{
  const sketch={frame:{normal:{x:0,y:0,z:-1}}};
  assert.equal(extrusionPreviewDirection(sketch,'frame','forward'),1);
  assert.equal(extrusionPreviewDirection(sketch,'frame','reverse'),-1);
  assert.equal(extrusionPreviewDirection(sketch,'z','forward'),-1);
});
