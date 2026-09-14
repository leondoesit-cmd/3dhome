import test from 'node:test';
import assert from 'node:assert/strict';
import { inferAuthoringMode } from '../js/core/authoring_mode.js';

const mesh = () => ({ positions: [0, 0, 0, 1, 0, 0, 0, 1, 0] });

test('an exact-regeneration mesh cache on a recipe part does not make a parametric model hybrid', () => {
  // HOUSING after its first save: Base Extrude + two sketches, the ext part carrying its display cache
  const housing = { features: [{ id: 'base', type: 'extrude' }], sketches: [{}, {}], parts: [{ kind: 'ext', meshData: mesh() }] };
  assert.equal(inferAuthoringMode(housing), 'fully-parametric');
  for (const kind of ['rev', 'loft', 'box', 'cyl', 'sph', 'kernel']) {
    assert.equal(inferAuthoringMode({ features: [{ type: 'extrude' }], parts: [{ kind, meshData: mesh() }] }), 'fully-parametric', kind);
  }
});

test('real triangle bodies still count as direct geometry', () => {
  assert.equal(inferAuthoringMode({ parts: [{ kind: 'mesh', meshData: mesh() }] }), 'direct-only');
  assert.equal(inferAuthoringMode({ features: [{ type: 'extrude' }], parts: [{ kind: 'direct', meshData: mesh() }] }), 'hybrid');
  assert.equal(inferAuthoringMode({ features: [{ type: 'extrude' }], parts: [{ meshData: mesh() }] }), 'hybrid');
});
