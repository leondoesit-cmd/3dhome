import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../js/modeler.js', import.meta.url), 'utf8');
function fnSource(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, name);
  return source.slice(start, source.indexOf('\n}', start) + 2);
}

function harness(phase) {
  const faceSketch = { id: 'battery', plane: 'front', frameSpace: 'local', entities: [{ id: 'l' }] };
  const def = { sketches: [faceSketch], activeSketch: 'battery', metadata: { authoringSystem: 'parametric-v1' } };
  let added = 0;
  const E = { def, view: 'top', docType: 'part', authoring: { phase }, ssel: [] };
  const context = {
    E,
    ensureSketch: (d) => d.sketches.find((s) => s.id === d.activeSketch),
    sketchesOnPlane: (plane) => def.sketches.filter((s) => s.plane === plane && s.frameSpace !== 'local'),
    addSketch: (d, plane) => { added++; const s = { id: 's' + added, plane, entities: [] }; d.sketches.push(s); return s; },
  };
  vm.runInNewContext(fnSource('isCanonicalAuthoring') + '\n' + fnSource('sketchForView'), context);
  return { context, def, get added() { return added; } };
}

test('drawing while a datum sketch is open keeps using it instead of adding a principal sketch per segment', () => {
  const h = harness('sketch');
  for (let i = 0; i < 3; i++) assert.equal(h.context.sketchForView().id, 'battery');
  assert.equal(h.added, 0);
  assert.equal(h.def.sketches.length, 1);
});

test('an open principal-plane sketch also owns subsequent drawing when the camera view differs', () => {
  const h=harness('sketch');delete h.def.sketches[0].frameSpace;
  assert.equal(h.context.sketchForView().id,'battery');
  assert.equal(h.added,0);assert.equal(h.def.activeSketch,'battery');
});

test('outside a sketch session a view still adopts or creates its own principal sketch', () => {
  const h = harness('model');
  assert.equal(h.context.sketchForView().plane, 'top');
  assert.equal(h.added, 1);
});

test('choosing a drawing tool with a sketch session open does not attach a new sketch to a picked face', () => {
  const setTool = fnSource('setTool');
  assert.match(setTool, /openingModelPlane && !sessionOpen \? attachSketchToSelectedFace\(\)/);
});

test('Escape inside an open model-plane sketch is handled before the branch that leaves the surface', () => {
  const guard = source.indexOf('E.modelPlaneActive && E.authoring && E.authoring.phase === "sketch") {');
  const leave = source.indexOf('if (E.mode === "3d" && E.modelPlaneActive) { finishModelPlane(); return; }');
  assert.ok(guard > 0 && leave > guard);
  assert.ok(!source.slice(guard, leave).includes('finishModelPlane('));
});
