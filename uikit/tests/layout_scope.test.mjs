import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultLayout } from '../../js/uikit_host/layout.js';
import { presetList } from '../../js/uikit_host/presets.js';
import { applyScopedLayout, presentation, scopeTokens } from '../model/layout_scope.js';
import { resize, setToken, resetVariant } from '../model/ops.js';

test('phone, fold and desktop have distinct preset catalogs', () => {
  const names = scope => presetList(null, scope).map(p => p.id);
  assert.ok(names('phone').every(id => id.startsWith('phone-')));
  assert.ok(names('compact').every(id => id.startsWith('compact-')));
  assert.ok(names('base').includes('studio'));
});

test('phone preset and manual appearance edits leave fold and desktop alone', () => {
  const base = defaultLayout();
  const preset = presetList(null, 'phone').find(p => p.id === 'phone-model').doc();
  let next = applyScopedLayout(base, preset, 'phone');
  next = resize(next, {id:'n:left',size:{w:310},variant:'phone'});
  next = setToken(next, {id:null,name:'--accent',value:'#123456',variant:'phone'});
  assert.deepEqual(next.nodes, base.nodes);
  assert.deepEqual(next.variants.compact, base.variants.compact);
  assert.deepEqual(scopeTokens(next,'base'), scopeTokens(base,'base'));
  assert.equal(scopeTokens(next,'phone')['--accent'], '#123456');
  assert.equal(presentation(next,'phone')['n:left'].size.w,310);
});

test('desktop preset retains the existing phone and fold presentations', () => {
  let current = defaultLayout();
  current = resize(current, {id:'n:left',size:{w:301},variant:'phone'});
  current = resize(current, {id:'n:left',size:{w:270},variant:'compact'});
  const phone = presentation(current,'phone');
  const fold = presentation(current,'compact');
  const next = applyScopedLayout(current,presetList(null,'base').find(p=>p.id==='studio').doc(),'base');
  assert.deepEqual(presentation(next,'phone'),phone);
  assert.deepEqual(presentation(next,'compact'),fold);
  assert.equal(next.nodes['n:left'].size.w,360);
});

test('restoring phone snapshot preserves later fold edits; resetting clears phone theme', () => {
  let original = defaultLayout();
  original = setToken(original, {id:null,name:'--accent',value:'#123456',variant:'phone'});
  let edited = resize(original, {id:'n:left',size:{w:280},variant:'compact'});
  edited = setToken(edited, {id:null,name:'--accent',value:'#abcdef',variant:'phone'});
  const restored = applyScopedLayout(edited, original, 'phone', 'phone');
  assert.equal(scopeTokens(restored,'phone')['--accent'],'#123456');
  assert.equal(presentation(restored,'compact')['n:left'].size.w,280);
  assert.deepEqual(scopeTokens(resetVariant(restored,{variant:'phone'}),'phone'),{});
});
