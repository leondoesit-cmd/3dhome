import test from 'node:test';
import assert from 'node:assert/strict';
import {smartDimensionOriginWins} from '../js/core/sketch_origin.js';
import {dimensionHitYieldsToPoint} from '../js/sketch_dimensions.js';
const label = {kind:'label',constraint:{id:'width'}};
function result(tool, uv, point) {
  return smartDimensionOriginWins(tool,uv,14/30,point) ? null : dimensionHitYieldsToPoint(label,point);
}
test('Smart Dimension acquires virtual and existing origin despite a width label covering it', () => {
  assert.equal(result('dim',{u:0,v:0},null),null);
  assert.equal(result('dim',{u:.1,v:.1},{x:0,y:0}),null);
});
test('Select still edits the covering label; distant labels and nearby geometry retain priority', () => {
  assert.equal(result('select',{u:0,v:0},null),label);
  assert.equal(result('dim',{u:1,v:0},null),label);
  assert.equal(result('dim',{u:0,v:0},{x:.1,y:.1}),label);
  assert.equal(result('dim',{u:0,v:0},{type:'line',id:'line'}),label);
});
