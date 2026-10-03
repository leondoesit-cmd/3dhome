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

test('a native editable Toolbox recipe needs no sketch to be fully parametric', () => {
  const source={features:[{id:'screw',type:'toolbox',params:{size:'M6',lengthMm:25}}],parts:[{kind:'cyl',meshData:mesh()}],sketches:[]};
  assert.equal(inferAuthoringMode(source),'fully-parametric');
  assert.equal(inferAuthoringMode({...source,metadata:{import:true}}),'hybrid','import provenance remains conservative');
  assert.equal(inferAuthoringMode({...source,parts:[{kind:'mesh',meshData:mesh()}]}),'hybrid','a separate direct body is still direct');
});
