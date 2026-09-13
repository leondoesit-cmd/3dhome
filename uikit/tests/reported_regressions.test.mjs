import test from 'node:test';
import assert from 'node:assert/strict';
import { setText, setToken, resetText } from '../model/ops.js';
import { applyScopedLayout } from '../model/layout_scope.js';
import { sizeFrom } from '../editor/resize.js';
import { containerAccepts } from '../editor/policy.js';
import { createLocalStorage } from '../adapters/storage_local.js';
import { dispatchPrecisionDown, dispatchPrecisionMove, dispatchPrecisionUp } from '../../js/touch_precision_ui.js';

test('text and theme edits tolerate absent optional override buckets', () => {
  const doc = {nodes:{}, variants:{phone:{root:'root'}}};
  assert.deepEqual(setText(doc,{key:'save',value:'Keep'}).overrides.text, {'*':{save:'Keep'}});
  assert.deepEqual(setToken(doc,{name:'--accent',value:'red'}).overrides.tokens, {'--accent':'red'});
  assert.deepEqual(setToken(doc,{variant:'phone',name:'--accent',value:'red'}).variants.phone.tokens, {'--accent':'red'});
  assert.equal(doc.overrides, undefined);
});

test('resetText remains scoped to the requested language', () => {
  const doc = {overrides:{text:{'*':{save:'Keep'},en:{save:'Store'},he:{save:'Other'}}}};
  const next = resetText(doc,{key:'save',lang:'en'});
  assert.deepEqual(next.overrides.text, {'*':{save:'Keep'},he:{save:'Other'}});
  assert.equal(resetText(next,{key:'save',lang:'en'}),next);
});

test('scoped layouts tolerate absent variant maps', () => {
  const simple = {root:'root', nodes:{root:{type:'dock',children:[]}}};
  assert.equal(applyScopedLayout(simple,simple,'phone').variants.phone.root,'root');
  const current = {...simple,variants:{phone:{root:'root',patch:{}}}};
  assert.ok(applyScopedLayout(current,simple).variants.phone);
});

test('unconstrained dragging cannot invert a panel', () => {
  assert.deepEqual(sizeFrom({w:100,h:80},'se',-200,-200),{w:1,h:1});
  assert.deepEqual(sizeFrom({w:100,h:80},'nw',200,200),{w:1,h:1});
  assert.deepEqual(sizeFrom({w:100,h:80},'se',-200,-200,{minW:20,minH:30}),{w:20,h:30});
});

test('floating containers accept panels but honor host restrictions', () => {
  const node = {type:'float',children:[]};
  assert.equal(containerAccepts(node,{kind:'panel'}),true);
  assert.equal(containerAccepts(node,{type:'group'}),true);
  assert.equal(containerAccepts({...node,accepts:'none'},{kind:'panel'}),false);
  assert.equal(containerAccepts(node,{kind:'command'}),false);
});

test('clearing saved variants removes old scopes without touching another layout', () => {
  const map = new Map();
  const storage = createLocalStorage({storage:{
    get length(){return map.size;}, key(i){return [...map.keys()][i];},
    getItem(k){return map.get(k);},setItem(k,v){map.set(k,v);},removeItem(k){map.delete(k);},
  }});
  for (const key of ['layout:saved:phone','layout:saved:retired','other:saved:phone','layout:saved']) storage.save(key,{});
  assert.equal(storage.clearPrefix('layout:saved:'),true);
  assert.equal(storage.load('layout:saved:phone'),null);
  assert.equal(storage.load('layout:saved:retired'),null);
  assert.deepEqual(storage.load('other:saved:phone'),{});
  assert.deepEqual(storage.load('layout:saved'),{});
});

test('precision drag events keep one pointer identity', () => {
  const original = globalThis.PointerEvent;
  globalThis.PointerEvent = class {constructor(type, init){Object.assign(this,init,{type});}};
  try {
    const events = [];
    const canvas = {getBoundingClientRect:()=>({left:10,top:20}),dispatchEvent:e=>events.push(e)};
    for (const dispatch of [dispatchPrecisionDown,dispatchPrecisionMove,dispatchPrecisionUp]) dispatch(canvas,{x:2,y:3});
    assert.equal(new Set(events.map(e=>e.pointerId)).size,1);
    assert.deepEqual(events.map(e=>e.buttons),[1,1,0]);
  } finally {if(original)globalThis.PointerEvent=original;else delete globalThis.PointerEvent;}
});
