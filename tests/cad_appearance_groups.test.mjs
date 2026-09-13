import test from 'node:test';
import assert from 'node:assert/strict';
import { appearanceGroups } from '../js/core/appearance_groups.js';
import { createAppearanceOverride } from '../js/cad_appearances.js';

test('merged feature transparency changes only its surviving faces, with face precedence', () => {
  const feature = createAppearanceOverride({kind:'feature',persistentId:'shield',opacity:.25});
  const face = createAppearanceOverride({kind:'face',persistentId:'shield:tool:face:2',opacity:.5});
  const result = appearanceGroups([
    {triangleStart:0,triangleCount:2,persistentId:'cover:face:1'},
    {triangleStart:2,triangleCount:3,persistentId:'shield:tool:face:1'},
    {triangleStart:5,triangleCount:2,persistentId:'shield:tool:face:2'},
    {triangleStart:7,triangleCount:1,persistentId:'shieldOther:face:1'},
  ],10,[feature,face]);
  assert.deepEqual(result.groups.map(g=>[g.start,g.count,g.materialIndex]),[[0,6,0],[6,9,1],[15,6,2],[21,3,0],[24,6,0]]);
  assert.equal(result.materials[0].opacity,.25);
  assert.equal(result.materials[1].opacity,.5);
  assert.equal(JSON.parse(JSON.stringify(feature)).opacity,.25);
});
