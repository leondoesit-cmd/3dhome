import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

/* A face picked on a merged body selects the body's part, and that part carries
   the FIRST feature's id: HOUSING's Boss-Battery and Boss-Loft1 faces read
   "Base Extrude" in the selection name and the Shape panel. The picked
   reference already names its owner; the label must use it. */

const src = readFileSync(new URL('../js/modeler.js', import.meta.url), 'utf8');
function load(name, context) {
  const start = src.indexOf('function ' + name + '(');
  let depth = 0, end = src.indexOf('{', start);
  for (let i = end; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) { end = i + 1; break; }
  }
  return vm.runInNewContext('(' + src.slice(start, end) + ')', context);
}

const features = [{ id: 'f_base', name: 'Base Extrude' }, { id: 'f_loft', name: 'Boss-Loft1' }, { id: 'f_battery', name: 'Boss-Battery' }];

test('a face owned by a later feature names that feature, not the body part', () => {
  const E = { def: { features }, topologySelection: [{ kind: 'face', ownerFeatureId: 'f_loft' }] };
  const owner = load('topologySelectionFeature', { E, String });
  assert.equal(owner().name, 'Boss-Loft1');
  E.topologySelection = [{ kind: 'face', ownerFeatureId: 'f_battery:face:side:2' }];
  assert.equal(owner().name, 'Boss-Battery', 'a sub-id owner resolves to its feature');
});

test('a loft cap owned by the loft tool body names the loft', () => {
  const E = { def: { features }, topologySelection: [{ kind: 'face', ownerFeatureId: 'f_loft:tool', persistentId: 'f_loft:tool:face:generated:plane:1' }] };
  const owner = load('topologySelectionFeature', { E, String });
  assert.equal(owner().id, 'f_loft', 'the :tool suffix maps back to the feature id');
  E.topologySelection = [{ kind: 'face', ownerFeatureId: 'f_loftx:tool' }];
  assert.equal(owner(), null, 'an id that only shares a prefix is not the loft');
});

test('mixed owners, or none, fall back to the selected part', () => {
  const E = { def: { features }, topologySelection: [{ ownerFeatureId: 'f_loft' }, { ownerFeatureId: 'f_base' }] };
  const owner = load('topologySelectionFeature', { E, String });
  assert.equal(owner(), null);
  E.topologySelection = [];
  assert.equal(owner(), null);
});

test('the selection name and the Shape panel both use the owning feature', () => {
  assert.match(src, /var ownerFeature = inspectorHistoryFeature\(\) \|\| \(topologyCount \? topologySelectionFeature\(\) : null\);/);
  assert.match(src, /\(ownerFeature && \(ownerFeature\.name \|\| ownerFeature\.type\)\) \|\| E\.sel\.name/);
  assert.match(src, /var pickedFeature=historyFeature \|\| topologySelectionFeature\(\);\s*var featureId=pickedFeature \? pickedFeature\.id : \(p\.derivedFeatureId \|\| p\.featureId\);/);
});
