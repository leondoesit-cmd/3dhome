import test from 'node:test';
import assert from 'node:assert/strict';
import { bitmapContours } from '../js/sketch_text.js';
import { makeSpec, layoutCab, cabRun } from '../js/cabinet.js';
import { cabinetProductionParts } from '../js/cabinet_production_parts.js';

test('sketch text raster traces outside and counter as closed editable loops', () => {
  const rows = ['11111', '10001', '10001', '10001', '11111'];
  const loops = bitmapContours(Uint8Array.from(rows.join(''), digit => Number(digit)), 5, 5);
  assert.equal(loops.length, 2);
  assert.ok(loops.every(loop => loop.length >= 4));
  const signedArea = loop => loop.reduce((sum, point, i) => {
    const next = loop[(i + 1) % loop.length];
    return sum + point.x * next.y - next.x * point.y;
  }, 0);
  assert.ok(signedArea(loops[0]) * signedArea(loops[1]) < 0);
});

test('run worktop cutout reaches layout and revision-bound production review', () => {
  const item = (id, x) => ({ id, type:'base', x, z:0, rot:0, w:60, h:90, d:60,
    cab:makeSpec('k_base_drawers',60,90,60) });
  const a = item('run-a', 0), b = item('run-b', 60);
  a.cab.worktopCutouts = b.cab.worktopCutouts = [{kind:'sink',x0:35,x1:85,z0:-20,z1:20}];
  const items = [a,b], run = cabRun(a,items);
  assert.equal(run.n, 2);
  const top = layoutCab(a,run).parts.find(part => part.role === 'worktop');
  assert.equal(top.cutouts.length, 1);
  assert.equal(top.cutouts[0].x0, 5);
  const report = cabinetProductionParts(items);
  assert.ok(report.parts.some(part => part.role === 'worktop' && part.cutoutsMm.length === 1));
  assert.ok(report.issues.some(issue => issue.code === 'worktop-cutout-review'));
});
