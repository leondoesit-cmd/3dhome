import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../js/plan2d.js', import.meta.url), 'utf8');
function canvas() {
  let width = 0, height = 0, allocations = 0;
  const transforms = [];
  return {
    clientWidth: 400, clientHeight: 300, transforms,
    get allocations() { return allocations; },
    get width() { return width; }, set width(v) { width = v; allocations++; },
    get height() { return height; }, set height(v) { height = v; allocations++; },
    getContext() { return { setTransform(...args) { transforms.push(args); }, clearRect() {} }; },
  };
}

test('same-size 2D resizes preserve backing storage and changing DPR resizes both canvases', () => {
  const plan = canvas(), planHud = canvas();
  const ctx = vm.createContext({ plan, planHud, mc: plan.getContext(), hc: planHud.getContext(),
    S: { CW: 400, CH: 300, OX: 10, OY: 20, SC: 1 }, window: { devicePixelRatio: 2 }, fittingView: false });
  vm.runInContext(source.slice(source.indexOf('export function sizeCanvas()'), source.indexOf('export function fitView()')).replace('export ', ''), ctx);
  ctx.sizeCanvas();
  assert.equal(plan.width, 800);
  assert.equal(planHud.height, 600);
  ctx.sizeCanvas();
  assert.equal(plan.allocations, 2);
  assert.equal(planHud.allocations, 2);
  assert.equal(ctx.S.OX, 10);
  ctx.window.devicePixelRatio = 1;
  ctx.sizeCanvas();
  assert.equal(plan.width, 400);
  assert.equal(planHud.width, 400);
  plan.clientWidth = 0;
  ctx.sizeCanvas();
  assert.equal(plan.width, 400, 'hidden view retains its backing canvas');
});

test('room cache paints at backing resolution, blits at CSS size and reuses unchanged pixels', () => {
  const cache = canvas(), draws = [];
  let paints = 0, hiddenQueries = 0;
  const ctx = vm.createContext({
    S: { CW: 400, CH: 300, OX: 0, OY: 0, SC: 1 }, plan: { width: 800, height: 600 },
    detectRooms: () => [], hiddenSets: () => { hiddenQueries++; return {}; }, roomsTopologyKey: () => 'room',
    roomLayer: { key: '', canvas: null }, document: { createElement: () => cache },
    paintRooms: () => { paints++; }, pc: { drawImage: (...args) => draws.push(args) },
    planStyle: () => 'technical', userLayerKey: () => '',
  });
  vm.runInContext(source.slice(source.indexOf('function drawCachedRooms()'), source.indexOf('function drawReferenceFloor()')), ctx);
  ctx.drawCachedRooms();
  assert.equal(cache.width, 800);
  assert.equal(cache.height, 600);
  assert.deepEqual(cache.transforms.at(-1), [2, 0, 0, 2, 0, 0]);
  assert.deepEqual(draws.at(-1).slice(1), [0, 0, 400, 300]);
  ctx.drawCachedRooms();
  assert.equal(paints, 1);
  assert.equal(hiddenQueries, 1);
  ctx.plan.width = 400; ctx.plan.height = 300;
  ctx.drawCachedRooms();
  assert.equal(paints, 2, 'DPR changes invalidate the bitmap');
  assert.deepEqual(cache.transforms.at(-1), [1, 0, 0, 1, 0, 0]);
});

test('3D resize reuses render targets unless dimensions or pixel ratio change', () => {
  const view = readFileSync(new URL('../js/view3d.js', import.meta.url), 'utf8');
  let allocations = 0, projections = 0, ratio = 2;
  const ctx = vm.createContext({ ready3D: true, needsRender: false, settle: 0, SETTLE_FRAMES: 6,
    renderer: { getPixelRatio: () => ratio, setSize: () => allocations++ },
    camera: { updateProjectionMatrix: () => projections++ },
  });
  vm.runInContext(view.slice(view.indexOf('var lastViewWidth ='), view.indexOf('// One render tick:')).replace('export ', ''), ctx);
  ctx.setSize(400, 300);
  ctx.settle = 0;
  ctx.setSize(400, 300);
  assert.equal(allocations, 1);
  assert.equal(projections, 1);
  assert.equal(ctx.settle, 0);
  ratio = 1;
  ctx.setSize(400, 300);
  assert.equal(allocations, 2);
  assert.equal(ctx.settle, 6);
  ctx.setSize(0, 0);
  assert.equal(allocations, 2);
});
