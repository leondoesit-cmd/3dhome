import assert from 'node:assert/strict';
import { getEventListeners } from 'node:events';
import { registerHooks } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import * as three from '../vendor/three/three.webgpu.js';
import { THREE } from '../js/three_lazy.js';
import { modelerSource } from './helpers/modeler_source.mjs';
import { sourceFunctionText } from './helpers/source_function.mjs';

test('CAD DOM teardown removes only its own view resize listener on every reopen', async t => {
  const rendererStub = `
    export const LUX = 1, ready = r => r.pending.promise, render = r => {r.renders++;};
    export function createRenderer() {
      return {pending:Promise.withResolvers(), live:false, disposeCalls:0, disposals:0, renders:0,
        setSize(){}, setClearColor(){}, setPixelRatio(){},
        initialize(){this.live = true; this.pending.resolve(this);},
        dispose(){this.disposeCalls++; if (this.live) {this.live = false; this.disposals++;}}
      };
    }`;
  const hooks = registerHooks({load(url, context, next) {
    if (url.endsWith('/js/gpu.js')) return {format:'module', shortCircuit:true, source:rendererStub};
    if (url.endsWith('/js/primitives.js')) return {format:'module', shortCircuit:true, source:'export function clearGroup() {}'};
    return next(url, context);
  }});
  t.after(() => hooks.deregister());
  Object.assign(THREE, three);
  const {createEditorView} = await import('../js/editor_view.js');
  const target = new EventTarget();
  globalThis.window = target;
  t.after(() => { delete globalThis.window; });
  const unrelated = () => {};
  target.addEventListener('resize', unrelated);
  const source = modelerSource();
  const noop = () => {};
  const context = {E:{}, window:target, onKey:noop, ribbon:{detach:noop},
    root:null, teardownModelerMobile:noop, setModelerBackgroundIsolation:noop};
  const destroy = vm.runInNewContext(sourceFunctionText(source, 'destroyDOM') + '\ndestroyDOM', context);
  for (let cycle = 0; cycle < 20; cycle++) {
    let width = 200;
    const canvas = new EventTarget();
    canvas.parentElement = {getBoundingClientRect:() => ({width, height:150})};
    const view = createEditorView({canvas});
    context.E.pv = view;
    assert.equal(getEventListeners(target, 'resize').length, 2);
    view.resize();
    width++;
    assert.equal(view.resize(), false);
    target.dispatchEvent(new Event('resize'));
    assert.equal(view.resize(), true);
    if (cycle % 2) {
      view.rr.initialize();
      await Promise.resolve();
      assert.equal(view.rr.renders, 1);
    }
    destroy();
    assert.deepEqual(getEventListeners(target, 'resize'), [unrelated]);
    assert.equal(context.E.pv, null);
    view.dispose();
    if (cycle % 2 === 0) {
      assert.equal(view.rr.disposals, 0);
      view.rr.initialize();
      await Promise.resolve();
      assert.equal(view.rr.renders, 0);
    }
    assert.equal(view.rr.live, false);
    assert.equal(view.rr.disposals, 1);
    assert.equal(view.rr.disposeCalls, 1);
  }
  const failed = createEditorView({canvas:new EventTarget()});
  failed.dispose();
  failed.rr.pending.reject(new Error('backend initialization failed'));
  await Promise.resolve();
  assert.equal(failed.rr.renders, 0);
  assert.deepEqual(getEventListeners(target, 'resize'), [unrelated]);
});
