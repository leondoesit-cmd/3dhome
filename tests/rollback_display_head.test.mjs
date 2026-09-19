import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { historyEntryRolled, setHistoryRollback } from '../js/core/parametric_document.js';
import { leavesInputStanding } from '../js/core/rebuild.js';

/* Rolling HOUSING back to Boss-Battery left Boss-Loft1 above the bar, yet the
   viewport showed only the Base Extrude cylinder: the displayed body's head was
   still Shell1, which a rolled-back regeneration does not build. */

const src = readFileSync(new URL('../js/modeler.js', import.meta.url), 'utf8');
const start = src.indexOf('function cutTargetFeatureId(');
let depth = 0, end = src.indexOf('{', start);
for (let i = end; i < src.length; i++) {
  if (src[i] === '{') depth++;
  else if (src[i] === '}' && --depth === 0) { end = i + 1; break; }
}
const headOf = vm.runInNewContext('(' + src.slice(start, end).replace('document = E.def', 'document') + ')', { historyEntryRolled, leavesInputStanding, Set });

const housing = () => ({
  features: [
    { id: 'base', type: 'extrude', params: {}, inputs: [] },
    { id: 'loft', type: 'loft', params: {}, inputs: ['base'] },
    { id: 'battery', type: 'extrude', params: {}, inputs: ['loft'] },
    { id: 'shell', type: 'shell', params: {}, inputs: ['battery'] },
  ],
  history: [
    { id: 'h0', kind: 'sketch', targetId: 's0' }, { id: 'h1', kind: 'feature', targetId: 'base' },
    { id: 'h2', kind: 'sketch', targetId: 's1' }, { id: 'h3', kind: 'sketch', targetId: 's2' }, { id: 'h4', kind: 'feature', targetId: 'loft' },
    { id: 'h5', kind: 'sketch', targetId: 's3' }, { id: 'h6', kind: 'feature', targetId: 'battery' },
    { id: 'h7', kind: 'feature', targetId: 'shell' },
  ],
});
const body = { featureId: 'base' };

test('with no rollback the merged body is shown at its last step', () => {
  assert.equal(headOf(body, housing()), 'shell');
});

test('rolled back to Boss-Battery, the body is shown at Boss-Loft1, the last step above the bar', () => {
  const doc = housing();
  setHistoryRollback(doc, 6);
  assert.equal(headOf(body, doc), 'loft');
});

test('rolled back to Shell1 the head is Boss-Battery; a suppressed step is skipped the same way', () => {
  const doc = housing();
  setHistoryRollback(doc, 7);
  assert.equal(headOf(body, doc), 'battery');
  const suppressed = housing();
  suppressed.history[6].suppressed = true;
  assert.equal(headOf(body, suppressed), 'loft', 'a suppressed Boss-Battery breaks the chain there');
});

test('an inserted finish follows history order even when its storage entry was appended',()=>{
 const doc=housing();
 doc.features.push({id:'rim',type:'fillet',params:{},inputs:['base']});
 doc.features.find(f=>f.id==='loft').inputs=['rim'];
 doc.history.splice(2,0,{id:'hr',kind:'feature',targetId:'rim'});
 assert.equal(headOf(body,doc),'shell');
 setHistoryRollback(doc,3);assert.equal(headOf(body,doc),'rim');
 setHistoryRollback(doc,null);assert.equal(headOf(body,doc),'shell');
});
