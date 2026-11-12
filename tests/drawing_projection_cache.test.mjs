import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createDrawingController } from '../js/modeler_drawing.js';
import { createProjector, createSheetDoc } from '../js/cad_sheet.js';
import { tessellateParts } from '../js/core/part_tessellate.js';
import { bossPlate } from './helpers/boss_plate.mjs';

const source = readFileSync(new URL('../js/modeler/drawing_sheet_render.js', import.meta.url), 'utf8');
const factory = source.slice(source.indexOf('function drawingSheet()'), source.indexOf('function invalidateDrawing()'));
const box = depth => tessellateParts([{kind:'box', x0:0, x1:2, y0:0, y1:3, z0:0, z1:depth}]);

// Run the production host's dirty callback and repaint synchronously, as the sheet does.
function setup(bodies, legacy = false) {
  const rig = {doc:createSheetDoc({views:['front','top','right','iso']}), bodies, token:0, revision:0, projections:0};
  const noop = () => {};
  const context = {
    E:{}, drawingDocument:()=>rig.doc, drawingBodies:()=>rig.bodies,
    drawingViewBodies(view, base) { rig.projections++; return view.source ? rig.foreign : base; },
    drawingViewSourceToken:view=>view.source ? rig.revision : '',
    drawSketch:()=>context.E.sheet.scene(), syncSheetPanel:noop, syncStatus:noop,
    createDrawingController(host) {
      return createDrawingController({
        doc:host.doc, bodies:host.bodies, bodiesForView:host.bodiesForView, viewSourceToken:host.viewSourceToken,
        bodiesToken:()=>rig.token, pushUndo:noop, t:key=>key, refresh:noop,
        markDirty:legacy ? () => { context.E.sheet.invalidate(); context.drawSketch(); } : host.markDirty,
      });
    },
  };
  for (const name of ['drawingTopologyAllowed','drawingViewSourceIssue','pushUndo','flash','t','sheetPrompt',
    'sheetForm','currentHistoryNode','chooseDrawingImage','chooseDrawingProjectImage','drawingPresetAction']) context[name]=noop;
  rig.sheet = vm.runInNewContext(factory + '\ndrawingSheet()', context);
  return rig;
}

test('paper settings and deleted annotations repaint using the four existing projections', () => {
  const rig = setup(box(1)), sheet = rig.sheet;
  const first = sheet.scene();
  sheet.setSheetOption('precision', 4);
  const second = sheet.scene();
  assert.notEqual(first, second);
  assert.equal(rig.doc.precision, 4);
  sheet.setSheetOption('showZones', false);
  assert.ok(sheet.scene().items.length < second.items.length);
  sheet.setSheetOption('scale', '1:1');
  assert.equal(rig.doc.scale, '1:1');
  rig.doc.notes.push({id:'note',text:'Stock',x:12,y:15});
  sheet.select({kind:'note', id:'note'});
  assert.match(sheet.svg(), /Stock/);
  sheet.deleteSelection();
  assert.doesNotMatch(sheet.svg(), /Stock/);
  assert.equal(rig.projections, 4);
  sheet.scene().views.forEach((place, i) => assert.equal(place.projection, first.views[i].projection));
});

test('replacement with matching sheet fields, edited bodies and revised view sources reproject', () => {
  const rig = setup(box(1)), sheet = rig.sheet;
  const first = sheet.svg();
  rig.doc = structuredClone(rig.doc);
  rig.bodies = box(2);
  const replacement = sheet.svg();
  assert.notEqual(replacement, first);
  rig.bodies = box(3);
  rig.token++;
  const edited = sheet.svg();
  assert.notEqual(edited, replacement);
  rig.foreign = box(4);
  sheet.select({kind:'view', id:rig.doc.views[2].id});
  sheet.setSheetOption('viewSource', {kind:'part',key:'remote'});
  const foreign = sheet.svg();
  assert.notEqual(foreign, edited);
  rig.foreign = box(5);
  rig.revision++;
  assert.notEqual(sheet.svg(), foreign);
});

test('four-view boss plate sheet redraw benchmark', {skip:!process.env.DRAWING_BENCH}, () => {
  const body = bossPlate();
  assert.equal(body.positions.length / 9, 56412);
  for (const legacy of [true, false]) {
    const rig = setup([body], legacy);
    rig.sheet.scene();
    const samples = [];
    for (const [key, value] of [['precision',3], ['showZones',false], ['precision',2], ['showZones',true]]) {
      const before = rig.projections, start = performance.now();
      rig.sheet.setSheetOption(key, value);
      samples.push(Math.round(performance.now() - start));
      assert.equal(rig.projections - before, legacy ? 4 : 0);
    }
    console.log(legacy ? 'full invalidation (ms)' : 'layout invalidation (ms)', samples);
  }
});


test('20 source revisions evict obsolete projections while an unrelated view stays warm', () => {
  const rig = setup(box(1)), sheet = rig.sheet, foreignId = rig.doc.views[2].id;
  sheet.select({kind:'view',id:foreignId});
  rig.foreign = box(1);
  sheet.setSheetOption('viewSource',{kind:'part',key:'external'});
  const snapshots = [];
  const hostProjection = sheet.scene().views[0].projection;
  for (let rev = 0; rev <= 20; rev++) {
    rig.revision = rev;
    rig.foreign = box(rev+1);
    const views = sheet.scene().views;
    assert.equal(views[0].projection,hostProjection);
    snapshots.push(views[2].projection);
    assert.equal(sheet.scene().views[2].projection,snapshots[rev]);
  }
  // Revisit each old token. A retained historical entry would skip the
  // provider and return old geometry instead of the currently supplied body.
  for (let rev = 0; rev < 20; rev++) {
    rig.revision = rev;
    rig.foreign = box(rev+100);
    const before = rig.projections;
    const p = sheet.scene().views[2].projection;
    assert.equal(rig.projections,before+1);
    assert.notDeepEqual(p.bounds,snapshots[rev].bounds);
  }
});

test('a live projector keeps only the current source projection reachable', {skip:!globalThis.gc}, async () => {
  const doc = createSheetDoc({views:['right']}), view = doc.views[0];
  view.source = {kind:'part',key:'external'};
  let revision = 0;
  const project = createProjector(doc, [], {
    sourceToken:()=>revision, bodiesForView:()=>box(revision+1),
  });
  const refs = [];
  for (revision = 0; revision <= 20; revision++) refs.push(new WeakRef(project(view)));
  await new Promise(resolve => setImmediate(resolve));
  globalThis.gc();
  revision = 20;
  assert.equal(refs.filter(ref => ref.deref()).length, 1);
  assert.equal(project(view), refs[20].deref());
});

test('a failed source read can be retried and Detail style variants share the current revision', () => {
  const doc = createSheetDoc({views:['right']});
  const parent = doc.views[0];
  parent.source = {kind:'part',key:'external'};
  let revision=0, reads=0;
  const project=createProjector(doc,[],{sourceToken:()=>revision,bodiesForView:()=>{
    if (++reads===1) throw Error('source unavailable');
    return box(revision+1);
  }});
  assert.throws(()=>project(parent),/source unavailable/);
  const edges=project(parent), shaded=project({...parent,displayStyle:'shaded'});
  assert.ok(edges && shaded);
  assert.equal(project(parent),edges);
  assert.equal(project({...parent,displayStyle:'shaded'}),shaded);
  assert.equal(reads,3);
  revision++;
  assert.notEqual(project(parent),edges);
  assert.notEqual(project({...parent,displayStyle:'shaded'}),shaded);
  assert.equal(reads,5);
});
