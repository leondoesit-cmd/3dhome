import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from '../vendor/acorn/acorn.mjs';
import * as cabinet from '../js/cabinet.js';
import { captureCabinetSession, restoreCabinetSession } from '../js/cabinet_session.js';
import { syncCabinetDefinition } from '../js/parametric_cabinet.js';
import { parseCabinetDimension } from '../js/cabinet_units.js';
import { numInput } from '../js/ui_cabinet_ctx.js';
import { loadUnitSettings, saveUnitSettings } from '../js/unit_settings.js';

// Exercise the actual UI functions with controlled DOM/dependencies, without
// importing their GPU/browser graph. Acorn keeps nested callbacks intact.
const modules = new Map();
function functions(file, names, bindings = {}) {
  if (!modules.has(file)) {
    const source = readFileSync(new URL('../js/' + file + '.js', import.meta.url), 'utf8');
    const declarations = new Map();
    for (const entry of parse(source, { ecmaVersion: 'latest', sourceType: 'module' }).body) {
      const node = entry.declaration || entry;
      if (node.type === 'FunctionDeclaration') declarations.set(node.id.name, source.slice(node.start, node.end));
    }
    modules.set(file, declarations);
  }
  return new Function(...Object.keys(bindings), names.map(name => {
    const code = modules.get(file).get(name);
    assert.ok(code, `${file}: ${name}`);
    return code;
  }).join('\n') + '\nreturn {' + names.join(',') + '};')(...Object.values(bindings));
}

class Node {
  constructor(tag = 'div') {
    this.tag = tag;
    this.children = [];
    this.events = {};
    this.value = '';
    this.textContent = '';
    this.style = {};
    this.dataset = {};
    this.classList = { add() {}, remove() {}, toggle() {} };
  }
  get nextSibling() { return this.parentNode?.children[this.parentNode.children.indexOf(this) + 1] || null; }
  appendChild(node) { return this.insertBefore(node, null); }
  insertBefore(node, next) {
    assert.ok(!next || this.children.includes(next));
    if (node.parentNode) node.parentNode.children.splice(node.parentNode.children.indexOf(node), 1);
    this.children.splice(next ? this.children.indexOf(next) : this.children.length, 0, node);
    node.parentNode = this;
    return node;
  }
  replaceChildren(...nodes) { this.children.forEach(node => { node.parentNode = null; }); this.children = []; nodes.forEach(node => this.appendChild(node)); }
  addEventListener(type, fn) { (this.events[type] ||= []).push(fn); }
  emit(type, event = {}) { for (const fn of this.events[type] || []) fn.call(this, event); }
  click() { this.emit('click'); }
  setAttribute() {}
  focus() {}
  select() {}
  querySelector() { return null; }
  querySelectorAll() { return []; }
  setPointerCapture() {}
}
const el = (tag, cls, html) => Object.assign(new Node(tag), { className: cls, innerHTML: html });
const btn = (html, callback, cls) => {
  const node = el('button', cls, html);
  node.addEventListener('click', callback);
  return node;
};
function descendants(node) { return [node, ...node.children.flatMap(descendants)]; }
function fixture(cols = [{ w: 50, secs: [{ t: 'shelves', h: 100 }, { t: 'shelves', h: 100 }] }]) {
  const calls = [];
  const spec = { fam: 'wardrobe', panel: 1.8, shelf: 1.8, cols };
  const E = { it: { w: 120, h: 240, d: 60, cab: spec }, sel: { col: 0, sec: 0 } };
  const api = Object.fromEntries(['act', 'touch', 'changed', 'flashHint', 'fillInspector'].map(key => [key, (...args) => calls.push([key, ...args])]));
  return { ...cabinet, E, api, calls, sp: () => E.it?.cab, T: key => key, isEn: () => true };
}

test('#1 BOM render and export tolerate missing definitions and metadata', () => {
  const f = fixture(), wrap = new Node();
  f.E.it.definitionId = 'def';
  f.E.host = { querySelector: () => wrap };
  const S = {};
  const ui = functions('ui_cabinet_inspect', ['fillBOM', 'exportBOM'], {
    ...f, S, el, layoutCab: () => ({}), cutList: () => [], hardwareList: () => [], cabPrice: () => 0,
    bandById: () => null, bandMeters: () => 0, document: { createElement: el },
    URL: { createObjectURL: () => 'blob:test', revokeObjectURL() {} }, setTimeout: fn => fn(),
  });
  for (const parametric of [undefined, {}, { definitions: {} }, { definitions: { def: {} } }, { definitions: { def: { metadata: { manufacturingReviewRequired: true } } } }]) {
    S.parametric = parametric;
    ui.fillBOM();
    ui.exportBOM();
  }
  assert.ok(wrap.children.some(node => node.className === 'cb-check cb-warn'));
});

test('#2 deleting a section requires a valid compartment and records only real changes', () => {
  const f = fixture(), { delSection } = functions('ui_cabinet_inspect', ['delSection'], f);
  const before = structuredClone(f.sp());
  for (const sel of [null, { col: 0 }, { col: 0, sec: null }, { col: 9, sec: 0 }, { col: 0, sec: -1 }, { col: 0, sec: 9 }]) {
    f.E.sel = sel;
    delSection();
  }
  assert.deepEqual(f.sp(), before);
  assert.deepEqual(f.calls, []);
  f.E.sel = { col: 0, sec: 1 };
  delSection();
  assert.equal(f.sp().cols[0].secs.length, 1);
  assert.equal(f.E.sel.sec, 0);
  assert.deepEqual(f.calls.map(call => call[0]), ['act', 'touch', 'changed']);
  f.calls.length = 0;
  delSection();
  assert.deepEqual(f.calls, []);
});

test('#3 column duplication validates selection and clears copied part IDs', () => {
  const f = fixture([{ hid: 'C1', fixed: true, w: 50, secs: [{ hid: 'S1', t: 'drawers', n: 4, h: 100 }] }]);
  const { dupColumn } = functions('ui_cabinet_inspect', ['dupColumn'], f);
  for (const sel of [null, {}, { col: -1 }, { col: 99 }]) { f.E.sel = sel; dupColumn(); }
  assert.deepEqual(f.calls, []);
  f.E.sel = { col: 0 };
  dupColumn();
  const [original, copy] = f.sp().cols;
  assert.equal(original.hid, 'C1');
  assert.equal(original.secs[0].hid, 'S1');
  assert.equal(copy.hid, undefined);
  assert.equal(copy.secs[0].hid, undefined);
  assert.equal(copy.fixed, undefined);
  assert.equal(copy.secs[0].n, 4);
});

test('#4 mobile disposal returns borrowed controls and clears their saved homes', () => {
  const header = new Node(), levels = new Node(), between = new Node(), bar = new Node(), park = new Node();
  [levels, between, bar].forEach(node => header.appendChild(node));
  const homes = [];
  const ui = functions('ui_cabinet_mobile', ['borrow', 'giveBack', 'disposeCabinetMobile'], {
    homes, foldRail: {}, foldPanel: {}, foldTab: 'tools', host: {}, timer: null,
    window: { removeEventListener() {} }, applyCompact() {}, closeSheet() {},
  });
  ui.borrow(levels, park);
  ui.borrow(bar, park);
  ui.disposeCabinetMobile();
  assert.deepEqual(header.children, [levels, between, bar]);
  assert.equal(park.children.length, 0);
  // A second cleanup must not try to restore obsolete parent references.
  header.replaceChildren();
  ui.disposeCabinetMobile();
  assert.equal(header.children.length, 0);
});

function wire(f, hit) {
  const cv = new Node('canvas');
  Object.assign(f.E, { cv, open: true, mode: '2d', axis: 'front', view: {} });
  functions('ui_cabinet_view', ['wireCanvas'], {
    ...f, hit, resetElevationView() {}, toModel: event => event, draw() {}, queueDraw() {},
    displayUnit: () => 'cm', toDisp: value => value, fromDisp: value => value,
    fin: Number.isFinite, ...f.overrides,
  }).wireCanvas();
  return cv;
}

test('#5 divider double-click edits its left column and ignores missing columns', () => {
  const f = fixture([{ w: 40 }, { w: 60 }]);
  const prompts = [];
  // the exact-size field is handed the current size and applies what is typed
  f.overrides = { openSizeEdit: (what, _event, apply) => { prompts.push(what.cm); apply(45); } };
  f.api.setColumnWidth = (ci, cm) => { f.sp().cols[ci].w = cm; };
  let target = { kind: 'colDiv', i: 1 };
  const cv = wire(f, () => target);
  cv.emit('dblclick');
  assert.equal(f.sp().cols[0].w, 45);
  assert.equal(f.sp().cols[1].w, 60);
  target = { kind: 'colDiv', i: 2 };
  cv.emit('dblclick');
  assert.deepEqual(prompts, [40, 60]);
  target = { kind: 'colDiv', i: 99 };
  cv.emit('dblclick');
  assert.equal(prompts.length, 2);
});

test('#6 shelf hit testing uses shelf stock thickness, with legacy panel fallback', () => {
  const E = { view: { k: 100, L: { t: 1.8, st: 3.8, yb: 0, yt: 100, cols: [{ x0: 0, x1: 50, secs: [{ y0: 0, y1: 46.2 }, { y0: 50, y1: 100 }] }] } } };
  const { hit } = functions('ui_cabinet_view', ['hit'], { E });
  assert.deepEqual(hit({ x: 25, y: 46.3 }), { kind: 'secDiv', col: 0, i: 1 });
  assert.equal(hit({ x: 25, y: 46 }).kind, 'cell');
  delete E.view.L.st;
  assert.equal(hit({ x: 25, y: 48.3 }).kind, 'secDiv');
});

test('#7 dragged divider widths survive actual normalization', () => {
  const spec = cabinet.makeSpec('w_classic', 120, 240, 60);
  spec.auto = false;
  spec.cols = [0, 1, 2].map(() => ({ w: 40, secs: [{ t: 'shelves', h: 200 }] }));
  cabinet.normalizeSpec(spec, 120, 240, 60);
  const f = fixture(spec.cols);
  f.E.it.cab = spec;
  const before = spec.cols.map(col => col.w);
  const cv = wire(f, () => ({ kind: 'colDiv', i: 1 }));
  cv.emit('pointerdown', { x: 0, y: 0 });
  cv.emit('pointermove', { x: 5, y: 0 });
  assert.equal(spec.cols[0].w, before[0] + 5);
  assert.equal(spec.cols[1].w, before[1] - 5);
  assert.equal(spec.cols[2].w, before[2]);
  assert.equal(spec.cols[0].fixed, true);
  assert.equal(spec.cols[1].fixed, true);
});

test('#8 drawing a vertical partition clears cloned column and section IDs', () => {
  const f = fixture([{ hid: 'C1', w: 100, secs: [{ hid: 'S1', t: 'shelves', h: 100 }] }]);
  functions('ui_cabinet_view', ['drawVWall'], f).drawVWall({ ok: true, col: 0, a: 40, b: 58.2 });
  assert.equal(f.sp().cols[0].hid, 'C1');
  assert.equal(f.sp().cols[1].hid, undefined);
  assert.equal(f.sp().cols[1].secs[0].hid, undefined);
});

test('#9 horizontal partitions divide counted fittings and avoid copying single appliances', () => {
  for (const [type, count] of [['drawers', 4], ['drawers', 1], ['pullout', 4], ['appl', undefined]]) {
    const f = fixture([{ w: 50, secs: [{ hid: 'S1', t: type, n: count, heights: [1, 1, 1, 1], h: 100 }] }]);
    f.E.view = { L: { cols: [{ secs: [{ y0: 0, y1: 100 }] }] } };
    functions('ui_cabinet_view', ['drawHWall'], f).drawHWall({ ok: true, col: 0, y: 50 });
    const [a, b] = f.sp().cols[0].secs;
    assert.equal(a.hid, 'S1');
    assert.equal(b.hid, undefined);
    if (count != null) {
      assert.equal(a.n + (b.t === type ? b.n : 0), count);
      assert.equal(a.heights, undefined);
      assert.equal(b.heights, undefined);
    }
    if (type === 'appl' || count === 1) assert.equal(b.t, 'shelves');
  }
});

test('#10 erased partitions preserve drawers, appliances and doors over empty shelves', () => {
  for (const rich of [{ secs: [{ t: 'drawers', n: 4, h: 80 }] }, { secs: [{ t: 'shelves', h: 80 }], door: { t: 'hinged' } }]) {
    const f = fixture([{ w: 50, secs: [{ t: 'shelves', h: 120 }] }, { w: 50, ...rich }]);
    functions('ui_cabinet_view', ['sectionContent', 'columnContent', 'eraseAt'], { ...f, hit: () => ({ kind: 'colDiv', i: 1 }) }).eraseAt({});
    assert.equal(f.sp().cols[0].secs, rich.secs);
    if (rich.door) assert.equal(f.sp().cols[0].door, rich.door);
  }
  for (const t of ['drawers', 'appl']) {
    const rich = { t, h: 60, n: 4 }, f = fixture([{ w: 50, secs: [{ t: 'shelves', h: 120 }, rich] }]);
    functions('ui_cabinet_view', ['sectionContent', 'columnContent', 'eraseAt'], { ...f, hit: () => ({ kind: 'secDiv', col: 0, i: 1 }) }).eraseAt({});
    assert.equal(f.sp().cols[0].secs[0], rich);
    assert.equal(rich.h, 181.8);
  }
});

test('#11 PNG export restores the selected axis before returning to 3D or split mode', () => {
  for (const mode of ['2d', '3d', 'split']) {
    const f = fixture(), calls = [];
    Object.assign(f.E, { axis: 'right', mode: mode === '3d' ? '3d' : '2d', split: mode === 'split', cv: { width: 200, height: 100 } });
    const context = Object.fromEntries(['fillRect', 'drawImage', 'fillText', 'strokeRect'].map(key => [key, () => {}]));
    const document = { createElement: tag => tag === 'canvas' ? { getContext: () => context, toDataURL: () => 'data:test' } : new Node(tag) };
    functions('ui_cabinet_view', ['exportPNG'], {
      ...f, document, setAxis: axis => { f.E.axis = axis; f.E.mode = '2d'; calls.push(['axis', axis]); },
      setMode: value => { f.E.mode = value; calls.push(['mode', value]); }, sizeCanvas() {}, draw() {},
      famLabel: () => '', cabSummary: () => '', frontLabel: () => '', cabPrice: () => 0,
      displayUnit: () => 'mm', dimLen: String,
    }).exportPNG();
    assert.equal(f.E.axis, 'right');
    assert.ok(calls.some(([kind, value]) => kind === 'axis' && value === 'right'));
    assert.equal(f.E.mode, mode);
  }
});

test('#12 restoring a session locates linked cabinets by ID after definition changes', () => {
  const a = { id: 'a', type: 'cabsys', w: 120, h: 240, d: 60, cab: cabinet.makeSpec('w_classic', 120, 240, 60) };
  const state = { items: [a] };
  syncCabinetDefinition(state, a);
  const b = structuredClone(a); b.id = 'b'; state.items.push(b);
  const saved = captureCabinetSession(state, a);
  b.definitionId = 'changed-during-edit'; b.w = 150; b.cab.cols[0].secs[0].t = 'drawers';
  restoreCabinetSession(state, a, saved);
  assert.equal(b.definitionId, saved.linked[0].definitionId);
  assert.equal(b.w, saved.linked[0].w);
  assert.deepEqual(b.cab, saved.linked[0].cab);
});

test('#13 normalization preserves explicit zero plinths and defaults missing values', () => {
  for (const plinthType of ['recessed', 'flush', 'legs']) {
    const spec = cabinet.makeSpec('w_classic', 120, 240, 60);
    spec.plinthType = plinthType; spec.plinth = 0;
    cabinet.normalizeSpec(spec, 120, 240, 60);
    assert.equal(spec.plinth, 0);
    delete spec.plinth;
    cabinet.normalizeSpec(spec, 120, 240, 60);
    assert.ok(spec.plinth > 0);
  }
});

test('#14 architectural foot suffix converts to model centimetres', () => {
  assert.equal(parseCabinetDimension("3'"), 91.44);
  assert.equal(parseCabinetDimension(" 3.5 ' ", 'in'), 106.68);
  assert.equal(parseCabinetDimension('12"', 'ft'), 30.48);
});

test('#15 agent selection reports absent indices explicitly without NaN', () => {
  const f = fixture();
  const { state } = functions('ui_cabinet_agent', ['state'], { ...f, mm: v => v * 10, CAB_LIMITS: {}, famLabel: () => '', cabSummary: () => '' });
  for (const [selection, expected] of [[{ col: 0 }, { column: 1, compartment: null }], [{}, { column: null, compartment: null }], [{ col: 0, sec: 0 }, { column: 1, compartment: 1 }], [null, null]]) {
    f.E.sel = selection;
    assert.deepEqual(state().selected, expected);
  }
});

test('#16 joinery callbacks tolerate missing owners/plans and report a missing save owner', () => {
  for (const owner of [undefined, { id: 'owner' }, { id: 'owner', cab: {} }, { id: 'owner', cab: { joineryPlans: null } }]) {
    const host = new Node();
    const report = { plans: [{ id: 'plan', ownerItemId: 'owner', issues: [] }], issues: [] };
    const { mountCabinetJoinery } = functions('ui_cabinet_joinery', ['mountCabinetJoinery'], {
      el: (tag, text) => Object.assign(new Node(tag), { textContent: text || '' }), text: en => en,
      cabinetProductionParts: () => ({ parts: [], issues: [] }), cabinetSavedJoineryReport: () => report,
      planCabinetJoinery: () => ({ operations: [{}], issues: [] }),
      createSavedCabinetJoinery: () => ({ ownerItemId: 'missing', id: 'new' }),
    });
    mountCabinetJoinery(host, () => owner ? [owner] : [], () => {});
    const nodes = () => descendants(host);
    nodes().find(node => node.textContent === 'Load and revalidate').click();
    assert.match(nodes().find(node => node.id === 'nzJoineryStatus').textContent, /no valid request/);
    nodes().find(node => node.textContent === 'Remove plan').click();
    if (owner?.cab) assert.deepEqual(owner.cab.joineryPlans, []);
    nodes().find(node => node.id === 'nzJoineryReview').click();
    nodes().find(node => node.id === 'nzJoineryPersist').click();
    assert.match(nodes().find(node => node.id === 'nzJoineryStatus').textContent, /Owning cabinet not found/);
  }
});

test('#17 incomplete joinery panel dimensions cannot crash production drawings', () => {
  const { cabinetProductionDrawingHTML } = functions('cabinet_production_drawings', ['cabinetProductionDrawingHTML'], {
    cabinetProductionStaleness: () => ({ stale: false }), cabinetManufacturingReport: () => ({ items: [], issues: [] }),
    cabinetSavedJoineryReport: () => ({ plans: [{ valid: true, request: {}, report: { operations: [{ panelId: 'p', setup: 'edge' }] } }], issues: [] }),
    esc: value => String(value ?? ''), size: () => '', view: () => '', number: String,
  });
  const html = cabinetProductionDrawingHTML({ manifest: { parts: [{ id: 'p' }] } }, []);
  assert.ok(html.includes('no dimensional drawing available'));
});

test('#18 section paste names the action correctly and pasted parts shed copied IDs', () => {
  for (const kind of ['sec', 'col']) {
    const f = fixture();
    f.E.clip = { kind, json: JSON.stringify(kind === 'sec' ? { hid: 'S1', t: 'shelves', h: 20 } : { hid: 'C1', w: 30, secs: [{ hid: 'S1', t: 'shelves', h: 100 }] }) };
    functions('ui_cabinet', ['pasteColumn'], { ...f, act: f.api.act, touch: f.api.touch, changed: f.api.changed }).pasteColumn();
    assert.deepEqual(f.calls[0], ['act', kind === 'sec' ? 'pasteSec' : 'pasteCol']);
    const pasted = kind === 'sec' ? f.sp().cols[0].secs[1] : f.sp().cols[1];
    assert.equal(pasted.hid, undefined);
    if (pasted.secs) assert.equal(pasted.secs[0].hid, undefined);
  }
});

test('#19 carcass stock updates matching shelves and preserves a custom shelf thickness', () => {
  for (const [shelf, expected] of [[undefined, 2.5], [1.8, 2.5], [3.8, 3.8]]) {
    const f = fixture(), selections = [];
    f.sp().shelf = shelf;
    f.E.host = { querySelector: () => new Node() };
    functions('ui_cabinet_inspect', ['fillLook'], {
      ...f, el, layoutCab: () => ({}), fitCtx: () => ({}), FRONTS: {}, FINISH: {}, BANDING: [],
      sheetsFor: role => role === 'carcass' ? [{ id: 'sheet', t: 2.5 }] : [],
      sheetLabel: () => '', sheetPrice: () => 0, sheetById: () => ({ t: 2.5 }),
      row: (_, node) => node, select: (_, __, cb) => { selections.push(cb); return new Node(); },
    }).fillLook();
    selections[0]('sheet');
    assert.equal(f.sp().panel, 2.5);
    assert.equal(f.sp().shelf, expected);
  }
});

test('#20 dimension inputs convert furniture units and bounds while counts stay unitless', () => {
  const previousDocument = globalThis.document, settings = structuredClone(loadUnitSettings());
  globalThis.document = { createElement: tag => new Node(tag) };
  try {
    for (const [unit, factor] of [['mm', 10], ['cm', 1], ['in', 1 / 2.54], ['ft', 1 / 30.48]]) {
      saveUnitSettings({ overrides: { furniture: { unit } } });
      let result;
      const input = numInput(60, value => { result = value; }, 10, 100);
      assert.ok(Math.abs(+input.value - 60 * factor) < 1e-6);
      assert.ok(Math.abs(+input.min - 10 * factor) < 1e-6);
      assert.ok(Math.abs(+input.max - 100 * factor) < 1e-6);
      input.value = String(80 * factor); input.emit('change');
      assert.ok(Math.abs(result - 80) < 1e-8);
      input.value = String(200 * factor); input.emit('change');
      assert.equal(result, 100);
      input.value = ''; input.emit('change');
      assert.equal(result, 100);
      const count = numInput(4, value => { result = value; }, 1, 8, null);
      assert.equal(count.value, '4');
      count.value = '5'; count.emit('change');
      assert.equal(result, 5);
    }
  } finally {
    globalThis.document = previousDocument;
    saveUnitSettings(settings);
  }
});

// Extract an actual event callback, including its nested branches, from the UI.
function eventCallback(file, target, type, bindings) {
  const source = readFileSync(new URL('../js/' + file + '.js', import.meta.url), 'utf8');
  let callback;
  function visit(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'CallExpression' && node.callee.type === 'MemberExpression' &&
        node.callee.object.name === target && node.callee.property.name === 'addEventListener' &&
        node.arguments[0]?.value === type) callback = node.arguments[1];
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === 'object') visit(value);
    }
  }
  visit(parse(source, { ecmaVersion: 'latest', sourceType: 'module' }));
  assert.ok(callback, `${target} ${type} listener`);
  return new Function(...Object.keys(bindings), 'return (' + source.slice(callback.start, callback.end) + ');')(...Object.values(bindings));
}

test('#21 native typing undo/redo stays in inputs while canvas shortcuts still work', () => {
  const f = fixture(), document = { activeElement: {} };
  f.E.open = true;
  const keydown = eventCallback('ui_cabinet', 'document', 'keydown', {
    ...f, document, isNestOpen: () => false, isSizeDlgOpen: () => false, isKeysOpen: () => false,
    undo: () => f.calls.push(['undo']), redo: () => f.calls.push(['redo']),
  });
  for (const tagName of ['INPUT', 'TEXTAREA', 'SELECT', 'CANVAS']) {
    document.activeElement.tagName = tagName;
    f.calls.length = 0;
    for (const [key, shiftKey, modifier] of [['z', false, 'ctrlKey'], ['z', true, 'metaKey'], ['y', false, 'ctrlKey']]) {
      keydown({ key, shiftKey, [modifier]: true, preventDefault: () => f.calls.push(['preventDefault']) });
    }
    assert.deepEqual(f.calls, tagName === 'CANVAS' ? [
      ['preventDefault'], ['undo'], ['preventDefault'], ['redo'], ['preventDefault'], ['redo'],
    ] : []);
  }
});

test('#22 invalid overall size restores all displayed model dimensions without editing', () => {
  const f = fixture(), inputs = Object.fromEntries(['W', 'D', 'H'].map(key => ['#cb' + key, new Node('input')]));
  f.E.host = { querySelector: key => inputs[key], querySelectorAll: () => [] };
  const ui = functions('ui_cabinet', ['applyOverallSize', 'syncDimInputs'], {
    ...f, CAB_LIMITS: { width: { field: 'w' } }, parseCabinetDimension,
    displayUnit: () => 'cm', formatCabinetDimension: String, flashHint: f.api.flashHint,
  });
  inputs['#cbW'].value = 'bad dimension';
  ui.applyOverallSize('width', inputs['#cbW']);
  assert.equal(inputs['#cbW'].value, '120');
  assert.equal(inputs['#cbD'].value, '60');
  assert.equal(inputs['#cbH'].value, '240');
  assert.equal(f.E.it.w, 120);
  assert.deepEqual(f.calls.map(call => call[0]), ['flashHint']);
});

test('#23 invalid column copy preserves the clipboard and never reports success', () => {
  const f = fixture(), clip = { kind: 'col', json: '{"w":30,"secs":[]}' };
  f.E.clip = clip;
  const { copyColumn } = functions('ui_cabinet', ['copyColumn'], { ...f, flashHint: f.api.flashHint });
  for (const sel of [null, {}, { col: null }, { col: -1 }, { col: 99 }]) {
    f.E.sel = sel;
    copyColumn();
    assert.equal(f.E.clip, clip);
  }
  assert.deepEqual(f.calls, []);
  f.E.sel = { col: 0 };
  copyColumn();
  assert.deepEqual(JSON.parse(f.E.clip.json), f.sp().cols[0]);
  assert.equal(f.calls.length, 1);
});

test('#24 pasting a column with no selection appends and selects its actual index', () => {
  for (const sel of [null, {}, { col: null }, { col: 0 }]) {
    const f = fixture([{ w: 40 }, { w: 60 }]);
    f.E.sel = sel;
    f.E.clip = { kind: 'col', json: '{"w":30,"secs":[]}' };
    functions('ui_cabinet', ['pasteColumn'], { ...f, act: f.api.act, touch: f.api.touch, changed: f.api.changed }).pasteColumn();
    const at = sel?.col === 0 ? 1 : 2;
    assert.equal(f.sp().cols[at].w, 30);
    assert.deepEqual(f.E.sel, { col: at, sec: 0 });
    assert.deepEqual(f.calls.map(call => call[0]), ['act', 'touch', 'changed']);
  }
});

test('#25 replacing a size proposal restores original inert states on dismissal', () => {
  const f = fixture(), body = new Node(), host = new Node(), dlg = new Node(), sibling = new Node(), alreadyInert = new Node();
  body.appendChild(host); body.appendChild(alreadyInert);
  host.appendChild(dlg); host.appendChild(sibling);
  alreadyInert.inert = true; sibling.inert = false; dlg.hidden = true;
  for (const node of [dlg, host]) Object.defineProperty(node, 'parentElement', { get() { return this.parentNode; } });
  const controls = new Map();
  dlg.querySelector = key => { if (!controls.has(key)) controls.set(key, new Node()); return controls.get(key); };
  f.E.host = { querySelector: () => dlg };
  const ui = functions('ui_cabinet', ['isSizeDlgOpen', 'dismissSizeDlg', 'showSizeProposal'], {
    ...f, document: { body }, el, syncDimInputs() {},
  });
  ui.showSizeProposal('width', {}, null);
  assert.equal(sibling.inert, true);
  ui.showSizeProposal('height', {}, null);
  assert.equal(sibling.inert, true);
  ui.dismissSizeDlg();
  assert.equal(dlg.hidden, true);
  assert.equal(sibling.inert, false);
  assert.equal(alreadyInert.inert, true);
  assert.equal(f.E.sizeDlg, null);
});

test('#26 search door hits use column zero for absent selection and record the action first', () => {
  const f = fixture(), wrap = new Node();
  f.E.q = 'door'; f.E.sel = {}; f.E.host = { querySelector: () => wrap };
  const before = structuredClone(f.sp());
  f.api.act = label => { assert.deepEqual(f.sp(), before); f.calls.push(['act', label]); };
  functions('ui_cabinet_inspect', ['fillHits'], {
    ...f, el, btn, SEC: {}, DOORS: { hinged: {} }, matches: () => true,
    layoutCab: () => ({ cols: [{}] }), fitCtx: () => ({}), doorFit: () => ({ ok: true }), doorLabel: String,
  }).fillHits();
  f.E.sel = null;
  wrap.children[0].click();
  assert.equal(f.sp().cols[0].door.t, 'hinged');
  assert.deepEqual(f.calls, [['act', 'door'], ['touch'], ['changed']]);
  f.calls.length = 0;
  f.E.sel = { col: 99 };
  wrap.children[0].click();
  assert.deepEqual(f.calls, []);
});

test('#27 section type rejects missing selections/types and records valid edits before mutation', () => {
  const f = fixture(), before = structuredClone(f.sp());
  const { applySecType } = functions('ui_cabinet_inspect', ['applySecType'], f);
  for (const sel of [null, {}, { col: 99, sec: 0 }, { col: 0 }, { col: 0, sec: 99 }]) {
    f.E.sel = sel; applySecType('drawers');
  }
  f.E.sel = { col: 0, sec: 0 }; applySecType('unknown');
  assert.deepEqual(f.sp(), before); assert.deepEqual(f.calls, []);
  f.api.act = label => { assert.deepEqual(f.sp(), before); f.calls.push(['act', label]); };
  applySecType('drawers');
  assert.equal(f.sp().cols[0].secs[0].t, 'drawers');
  assert.deepEqual(f.calls, [['act', 'secType'], ['touch'], ['changed']]);
  f.E.it.cab = null; applySecType('drawers');
});

test('#28 preset previews tolerate absent specs, unknown families and zero totals', () => {
  const f = fixture(), args = [];
  f.E.it.cab = null;
  let cols = [{ w: 0, secs: [{ h: 0 }, { h: 0 }] }];
  const { presetPreview } = functions('ui_cabinet_inspect', ['presetPreview'], {
    ...f, formatCm: String, makeSpec: (...values) => { args.push(values); return { cols }; },
  });
  let html = presetPreview({ id: 'custom', fam: 'unknown' });
  assert.ok(html.includes('<svg')); assert.doesNotMatch(html, /NaN|Infinity/);
  assert.equal(args[0][2], f.FAM.wardrobe.h);
  assert.equal(args[0][3], f.FAM.wardrobe.d);
  assert.equal(args[0][4], undefined);
  f.E.it.cab = { fam: 'wardrobe' };
  cols = [{ w: 40, secs: [{ h: 0 }, { h: 0 }] }, { w: 60, secs: [] }];
  html = presetPreview({ id: 'custom', fam: 'wardrobe' });
  assert.doesNotMatch(html, /NaN|Infinity/);
  assert.equal(args[1][2], f.E.it.h);
});

test('#29 preset card clicks tolerate missing specs/families and retain valid family sizing', () => {
  for (const [spec, family] of [[null, 'wardrobe'], [{ fam: 'wardrobe' }, 'unknown'], [{ fam: 'free' }, 'wardrobe']]) {
    const f = fixture(), wrap = new Node(), preset = { id: 'custom', fam: family };
    f.E.it.cab = spec;
    Object.assign(f.api, { syncDimInputs: () => f.calls.push(['dims']), setTool: value => f.calls.push(['tool', value]) });
    functions('ui_cabinet_inspect', ['fillPresetCards'], {
      ...f, el, PRESETS: [preset], matches: () => true, presetLabel: () => 'Custom', presetNote: () => '',
      famLabel: String, presetPreview: () => '', fillPresets() {}, fillFamilies() {},
      makeSpec: () => ({ preset: 'custom' }),
    }).fillPresetCards(wrap, family);
    wrap.children[0].click();
    assert.equal(f.sp().preset, 'custom');
    assert.ok(f.calls.some(call => call[0] === 'changed'));
    assert.equal(f.calls.some(call => call[0] === 'dims'), !!spec && family === 'wardrobe');
    if (spec && family === 'wardrobe') assert.equal(f.E.it.h, f.FAM.wardrobe.h);
  }
});

test('#30 inspector door leaf controls fall back safely before elevation layout exists', () => {
  const f = fixture([{ w: 50, secs: [], door: { t: 'hinged' } }]);
  f.E.sel = { col: 0 };
  const labels = [];
  f.E.host = { querySelector: () => new Node() };
  const { fillInspector } = functions('ui_cabinet_inspect', ['fillInspector'], {
    ...f, el, btn, withFocusPreserved: (_, cb) => cb(), row: (_, node) => node,
    select: options => { labels.push(options); return new Node(); }, numInput: () => new Node(),
    layoutCab: () => ({ cols: [{}] }), fitCtx: () => ({ w: 50, colH: 200, d: 60 }),
    splitColumn() {}, dupColumn() {}, delColumn() {},
    moveBtn: () => new Node(), columnsEven: () => true, evenWidths() {}, mirrorCabinet() {},
    moveColumnBy() {}, moveSectionBy() {},
  });
  for (const view of [null, {}, { L: null }, { L: {} }, { L: { cols: [] } }, { L: { cols: [{ doorLeaves: 2 }] } }]) {
    labels.length = 0; f.E.view = view; fillInspector();
    const leaves = labels.find(options => options[0]?.[1]?.startsWith('auto ('));
    assert.equal(leaves[0][1], view?.L?.cols?.[0] ? 'auto (2)' : 'auto (1)');
  }
});

test('#31 column refill uses cabinet height when no rendered layout exists', () => {
  const f = fixture(), args = [];
  f.sp().plinth = 8;
  const { refillColumn } = functions('ui_cabinet_inspect', ['refillColumn'], {
    ...f, columnFill: (...values) => { args.push(values); return [{ t: 'shelves', h: values[1] }]; },
  });
  refillColumn(null, 'shelf'); assert.deepEqual(f.calls, []);
  for (const view of [null, {}, { L: null }, { L: { yt: 230, yb: 10 } }]) {
    f.E.view = view; refillColumn(f.sp().cols[0], 'shelf');
    assert.deepEqual(args.at(-1), ['shelf', view?.L ? 220 : 232, 1.8]);
    assert.equal(f.E.sel.sec, 0);
  }
  f.E.it.cab = null; refillColumn({}, 'shelf'); assert.equal(args.length, 4);
});

test('#32 section split ignores column-only or invalid selections without recording history', () => {
  const f = fixture(), before = structuredClone(f.sp());
  const { splitSection } = functions('ui_cabinet_inspect', ['splitSection'], f);
  for (const sel of [null, {}, { col: 0 }, { col: 0, sec: null }, { col: 99, sec: 0 }, { col: 0, sec: 99 }]) {
    f.E.sel = sel; splitSection();
  }
  assert.deepEqual(f.calls, []); assert.deepEqual(f.sp(), before);
  f.E.sel = { col: 0, sec: 0 }; splitSection();
  assert.equal(f.sp().cols[0].secs.length, 3);
  assert.equal(f.sp().cols[0].secs[0].h, 49.1);
  assert.deepEqual(f.calls.map(call => call[0]), ['act', 'touch', 'changed']);
});

test('#33 column splitting rejects absent columns and strips cloned persistent identities', () => {
  const f = fixture([{ hid: 'C1', w: 100, secs: [{ hid: 'S1', t: 'drawers', n: 4, h: 100 }] }]);
  const { splitColumn } = functions('ui_cabinet_inspect', ['splitColumn'], f);
  for (const sel of [null, {}, { col: null }, { col: 99 }]) { f.E.sel = sel; splitColumn(); }
  assert.deepEqual(f.calls, []);
  f.E.sel = { col: 0 }; splitColumn();
  const [original, copy] = f.sp().cols;
  assert.equal(original.w, 49.1); assert.equal(copy.w, 49.1);
  assert.equal(original.hid, 'C1'); assert.equal(original.secs[0].hid, 'S1');
  assert.equal(copy.hid, undefined); assert.equal(copy.secs[0].hid, undefined);
  assert.equal(copy.secs[0].n, 4);
});

test('#34 column deletion validates selection and last-column protection before history/touch', () => {
  const f = fixture([{ w: 40 }, { w: 60 }]), before = structuredClone(f.sp());
  const { delColumn } = functions('ui_cabinet_inspect', ['delColumn'], f);
  for (const sel of [null, {}, { col: null }, { col: -1 }, { col: 99 }]) { f.E.sel = sel; delColumn(); }
  assert.deepEqual(f.calls, []); assert.deepEqual(f.sp(), before);
  f.E.sel = { col: 1 }; delColumn();
  assert.deepEqual(f.sp().cols, [{ w: 40 }]); assert.deepEqual(f.E.sel, { col: 0, sec: 0 });
  assert.deepEqual(f.calls.map(call => call[0]), ['act', 'touch', 'changed']);
  f.calls.length = 0; delColumn(); assert.deepEqual(f.calls, []);
  f.E.it.cab = null; delColumn(); assert.deepEqual(f.calls, []);
});

test('#35 user presets record an action, touch the new spec and disarm drawing tools', () => {
  const f = fixture(), wrap = new Node(), before = structuredClone(f.sp());
  const preset = { name: 'Saved design', w: 100, h: 200, d: 60, cab: { ...structuredClone(before), auto: true } };
  f.E.host = { querySelector: () => wrap }; f.E.tool = 'vwall';
  f.api.act = label => { assert.deepEqual(f.sp(), before); f.calls.push(['act', label]); };
  f.api.touch = () => { f.sp().auto = false; f.calls.push(['touch']); };
  f.api.setTool = value => { f.E.tool = value; f.calls.push(['setTool', value]); };
  functions('ui_cabinet_inspect', ['fillMine'], {
    ...f, el, btn, document: { createElement: el }, cabinetPresets: () => [preset], matches: () => true,
    fillPresets() {}, fillFamilies() {}, normalizeSpec() {},
  }).fillMine();
  wrap.children[0].click();
  assert.equal(f.sp().auto, false); assert.equal(f.E.tool, null);
  assert.deepEqual(f.calls.map(call => call[0]), ['act', 'touch', 'setTool', 'changed']);
  assert.match(f.calls[0][1], /opPreset.*Saved design/);
  assert.notEqual(f.sp(), preset.cab); assert.equal(preset.cab.auto, true);
});

test('#36 hardware inspector initializes missing hardware and its controls update that object', () => {
  const f = fixture(), picks = [], checks = [];
  f.E.host = { querySelector: () => new Node() };
  const { fillHardware } = functions('ui_cabinet_inspect', ['fillHardware'], {
    ...f, el, row: (_, node) => node,
    select: (_, __, cb) => { picks.push(cb); return new Node(); },
    checkbox: (_, __, cb) => { checks.push(cb); return new Node(); },
  });
  fillHardware(); assert.deepEqual(f.sp().hw, {});
  picks[0]('custom-handle'); checks[0](true);
  assert.deepEqual(f.sp().hw, { handle: 'custom-handle', led: true });
  const hw = f.sp().hw; fillHardware(); assert.equal(f.sp().hw, hw);
});

test('#37 technical carcass stock preserves custom shelf thickness and updates matching shelves', () => {
  for (const [shelf, expected] of [[undefined, 2.5], [1.8, 2.5], [3.8, 3.8]]) {
    const f = fixture(), selections = [];
    f.sp().shelf = shelf; f.E.host = { querySelector: () => new Node() };
    functions('ui_cabinet_inspect', ['fillTechnical'], {
      ...f, el, btn, withFocusPreserved: (_, cb) => cb(), row: (_, node) => node,
      select: (options, _, cb) => { selections.push({ options, cb }); return new Node(); },
      numInput: () => new Node(), cabinetProductionPreset: () => null, cabPrice: () => 0,
      sheetsFor: role => role === 'carcass' ? [{ id: 'sheet', t: 2.5 }] : [],
      sheetLabel: () => '', sheetPrice: () => 0, sheetById: () => ({ t: 2.5 }),
    }).fillTechnical();
    selections.find(({ options }) => options[0][0] === 'sheet').cb('sheet');
    assert.equal(f.sp().panel, 2.5); assert.equal(f.sp().shelf, expected);
  }
});

test('#38 drawing gestures record one action only when a partition actually changes', () => {
  const f = fixture([{ w: 100, secs: [{ t: 'shelves', h: 100 }] }, { w: 100, secs: [{ t: 'shelves', h: 100 }] }]);
  let target = null, ghost = null;
  const ui = functions('ui_cabinet_view', ['drawVWall', 'drawHWall', 'eraseAt', 'sectionContent', 'columnContent'], {
    ...f, hit: () => target,
  });
  f.overrides = { ...ui, ghostAt: () => ghost };
  const cv = wire(f, () => target);
  f.E.view.L = { cols: [{ secs: [{ y0: 0, y1: 100 }] }, { secs: [{ y0: 0, y1: 100 }] }] };
  const before = structuredClone(f.sp());
  for (const tool of ['erase', 'vwall', 'hwall']) {
    f.E.tool = tool; ghost = null; target = null; cv.emit('pointerdown', {});
    ghost = { ok: false, col: 0, y: 2 }; target = { kind: 'cell', col: 0, sec: 0 };
    cv.emit('pointerdown', {}); cv.emit('pointerdown', { shiftKey: true });
  }
  assert.deepEqual(f.sp(), before);
  assert.ok(f.calls.every(call => call[0] === 'flashHint'));
  f.calls.length = 0; f.E.tool = 'hwall'; ghost = { ok: true, col: 0, y: 50 };
  cv.emit('pointerdown', { shiftKey: true });
  assert.equal(f.sp().cols[0].secs.length, 2); assert.equal(f.sp().cols[1].secs.length, 2);
  assert.deepEqual(f.calls, [['act', 'opDraw'], ['touch'], ['changed']]);
  f.calls.length = 0; f.E.tool = 'erase'; target = { kind: 'secDiv', col: 0, i: 1 };
  cv.emit('pointerdown', {});
  assert.deepEqual(f.calls, [['act', 'opErase'], ['touch'], ['changed']]);
  f.calls.length = 0; f.E.tool = 'vwall'; ghost = { ok: true, col: 0, a: 40, b: 58.2 };
  cv.emit('pointerdown', {});
  assert.deepEqual(f.calls, [['act', 'opDraw'], ['touch'], ['changed']]);
  f.calls.length = 0; f.E.tool = 'erase'; target = { kind: 'colDiv', i: 1 };
  cv.emit('pointerdown', {});
  assert.deepEqual(f.calls, [['act', 'opErase'], ['touch'], ['changed']]);
});

test('#39 horizontal round snapping is anchored to each compartment bottom', () => {
  const f = fixture(); f.E.tool = 'hwall'; f.E.snap = true;
  const { ghostAt } = functions('ui_cabinet_view', ['ghostAt', 'roundCands', 'pickSnap'], {
    ...f, SNAP_PULL: { align: 0.5, mid: 0.45, eq: 0.3, round: 0 },
  });
  for (const y0 of [11.8, 48.6]) {
    f.E.view = { k: 10, L: { t: 1.8, cols: [{ x0: 0, x1: 50, secs: [{ y0, y1: y0 + 100 }] }] } };
    const ghost = ghostAt({ x: 25, y: y0 + 20.2 });
    assert.equal(ghost.snap, 'round'); assert.equal(ghost.ok, true);
    assert.ok(Math.abs(ghost.y - y0 - 20) < 1e-9);
    assert.ok(Math.abs(ghost.a + f.sp().shelf / 2 - 20) < 1e-9);
  }
});

test('#40 saving joinery reports a missing production face panel as a descriptive error', () => {
  const request = { facePanel: { id: 'face', length: 100, width: 50, thickness: 18 }, edgePanel: { id: 'edge', length: 100, width: 50, thickness: 18 } };
  let parts = [];
  const { createSavedCabinetJoinery } = functions('cabinet_joinery', ['createSavedCabinetJoinery'], {
    cabinetJoineryRequestForItems: () => structuredClone(request),
    planCabinetJoinery: () => ({ operations: [{}] }), cabinetProductionParts: () => ({ parts }),
    copy: structuredClone, joineryBinding: () => 'binding',
  });
  assert.throws(() => createSavedCabinetJoinery([], request), error =>
    error.constructor === Error && error.message === 'Face panel not found in production parts.');
  parts = [{ id: 'face', itemId: 'owner' }];
  const saved = createSavedCabinetJoinery([], request, { id: 'saved', reviewedAt: '2026-10-17T00:00:00Z' });
  assert.equal(saved.ownerItemId, 'owner'); assert.deepEqual(saved.request, request);
});
