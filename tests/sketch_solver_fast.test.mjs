import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { solveLinear } from '../js/core/least_squares.js';
import { solveSketch, sketchJacobian, rankOf, explainSketchConflict } from '../js/sketch_solver.js';

// The pre-optimization implementation is deliberately independent of production.
function oldSolveLinear(A, b) {
  const n = b.length, M = A.map((row, i) => row.slice().concat(b[i]));
  const pivots = [];
  for (let col = 0, row = 0; col < n && row < n; col++) {
    let pivot = row;
    for (let i = row + 1; i < n; i++) if (Math.abs(M[i][col]) > Math.abs(M[pivot][col])) pivot = i;
    if (Math.abs(M[pivot][col]) < 1e-12) continue;
    [M[row], M[pivot]] = [M[pivot], M[row]];
    const d = M[row][col];
    for (let j = col; j <= n; j++) M[row][j] /= d;
    for (let i = 0; i < n; i++) {
      if (i === row) continue;
      const f = M[i][col];
      for (let j = col; j <= n; j++) M[i][j] -= f * M[row][j];
    }
    pivots.push(col); row++;
  }
  const solution = Array(n).fill(0);
  pivots.forEach((col, row) => { solution[col] = Number.isFinite(M[row][n]) ? M[row][n] : 0; });
  return solution;
}

// Load the original global path with the old linear solve, without changing files.
const solverUrl = new URL('../js/sketch_solver.js', import.meta.url);
const numericsUrl = new URL('../js/core/least_squares.js', import.meta.url);
const dataModule = source => 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
const oldNumerics = dataModule(readFileSync(numericsUrl, 'utf8')
  .replace('export function solveLinear(A, b)', 'function unusedSolveLinear(A, b)')
  + '\nexport const solveLinear = ' + oldSolveLinear.toString() + ';');
const oldSource = readFileSync(solverUrl, 'utf8')
  .replace('export function solveSketch(sketch, options = {}) {',
    'export function solveSketch(sketch, options = {}) { options = { ...options, cluster: false };')
  .replace(/from (["'])(\.[^"']+)\1/g,
  (_match, _quote, path) => `from ${JSON.stringify(path === './core/least_squares.js' ? oldNumerics : new URL(path, solverUrl).href)}`);
const { solveSketch: oldSolveSketch, explainSketchConflict: oldExplainSketchConflict,
  testBlockRank } = await import(dataModule(oldSource + '\nexport { blockRank as testBlockRank };'));

function randomGenerator(seed) {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
}

test('linear elimination matches the original bit-for-bit for n=1..200', () => {
  const random = randomGenerator(0xdecafbad);
  for (let n = 1; n <= 200; n++) {
    for (const kind of ['dense', 'singular', 'deficient', 'ill-conditioned', 'sparse']) {
      const A = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => {
        const v = random() * 2 - 1;
        return kind === 'sparse' && random() < 0.9 ? 0 : kind === 'ill-conditioned' ? v * 10 ** (-(j % 14)) : v;
      }));
      const b = Array.from({ length: n }, () => random() * 2 - 1);
      if (kind === 'singular') for (const row of A) row[0] = 0;
      if (kind === 'deficient' && n > 1) { A[n - 1] = A[0].slice(); b[n - 1] = b[0]; }
      const originalA = structuredClone(A), originalB = b.slice();
      const expected = oldSolveLinear(A, b), actual = solveLinear(A, b);
      actual.forEach((v, i) => assert.ok(Object.is(v, expected[i]), `${kind} n=${n} column=${i}: ${v} != ${expected[i]}`));
      assert.deepEqual(A, originalA); assert.deepEqual(b, originalB);
    }
  }
});

test('linear elimination preserves skipped columns, signed zeros and finite overflow', () => {
  const cases = [
    [[[0, 1], [0, 2]], [1, 2]],
    [[[1e-13, 2], [0, 4]], [2, 4]],
    [[[1e-12, 0], [0, 1]], [1, 2]],
    [[[1, -0], [-0, 1]], [-0, -0]],
    [[[1e-11, 1e308], [0, 1]], [1, 2]],
    [[[1, 1e308, 0], [1e308, 1, 0], [0, 0, 1]], [1e308, 1, -0]],
  ];
  const random = randomGenerator(38);
  for (let sample = 0; sample < 1000; sample++) {
    const values = [0, -0, 1, -1, 1e-13, 1e-12, 1e308, -1e308, Number.MIN_VALUE];
    const pick = () => values[Math.floor(random() * values.length)];
    cases.push([Array.from({ length: 4 }, () => Array.from({ length: 4 }, pick)), Array.from({ length: 4 }, pick)]);
  }
  for (const [A, b] of cases) {
    const actual = solveLinear(A, b), expected = oldSolveLinear(A, b);
    actual.forEach((v, i) => assert.ok(Object.is(v, expected[i]), `edge case ${JSON.stringify([A, b])}, column ${i}`));
  }
});

test('block rank keeps row equilibration, pivot ties and global row swaps', () => {
  const random = randomGenerator(118);
  for (let sample = 0; sample < 400; sample++) {
    const n = 4 + sample % 29;
    const J = Array.from({ length: n + 3 }, (_, i) => Array.from({ length: n }, (_, j) =>
      Math.floor(i / 4) === Math.floor(j / 4) ? (Math.floor(random() * 5) - 2) * 10 ** (sample % 19 - 9) : 0));
    // Include both near-dependencies and exact ties, then interleave the blocks.
    J[1] = J[0].map((v, j) => j === 1 ? v + 1e-9 : v);
    for (let i = J.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [J[i], J[j]] = [J[j], J[i]];
    }
    for (const tolerance of [0, 1e-12, 1e-9, 1e-6, 0.5, -1])
      assert.equal(testBlockRank(J, tolerance), rankOf(J, tolerance), `sample ${sample}, tolerance ${tolerance}`);
  }
});

function independentSketch(n) {
  const sketch = { points: [], entities: [], constraints: [] };
  // Half the variables belong to rectangles; the rest include circle scalars.
  for (let i = 0; i < n / 16; i++) {
    const x = i * 30, ids = [0, 1, 2, 3].map(j => `p${i}_${j}`);
    [[x, 0], [x + 10, 0], [x + 10, 6], [x, 6]].forEach(([x, y], j) => sketch.points.push({ id: ids[j], x, y }));
    ids.forEach((id, j) => {
      const entity = `l${i}_${j}`;
      sketch.entities.push({ id: entity, type: 'line', a: id, b: ids[(j + 1) % 4] });
      sketch.constraints.push({ id: `axis${i}_${j}`, type: j % 2 ? 'vertical' : 'horizontal', entity });
    });
    sketch.constraints.push({ id: `origin${i}`, type: 'fixed', point: ids[0], x, y: 0 },
      { id: `width${i}`, type: 'distance', entity: `l${i}_0`, value: 10 },
      { id: `height${i}`, type: 'distance', entity: `l${i}_1`, value: 6 });
  }
  // Fill to the requested variable count with dimensioned circles / loose points.
  let count = sketch.points.length * 2;
  for (let i = 0; count + 3 <= n && n - count !== 4; i++, count += 3) {
    const id = `c${i}`;
    sketch.points.push({ id, x: i * 20, y: 30 });
    sketch.entities.push({ id: `C${i}`, type: 'circle', c: id, r: 4 });
    sketch.constraints.push({ id: `cf${i}`, type: 'fixed', point: id, x: i * 20, y: 30 },
      { id: `cr${i}`, type: 'radius', entity: `C${i}`, value: 4 });
  }
  while (count < n) { sketch.points.push({ id: `loose${count}`, x: 0, y: 0 }); count += 2; }
  assert.equal(sketchJacobian(sketch).variables.length, n);
  return sketch;
}

const diagnosticKeys = ['converged', 'status', 'rank', 'degreesOfFreedom', 'variableCount', 'residualCount', 'conflicts', 'redundant', 'redundancy', 'repeated'];
function compareSolves(input, options = {}) {
  const actualSketch = structuredClone(input), expectedSketch = structuredClone(input);
  const actual = solveSketch(actualSketch, options), expected = oldSolveSketch(expectedSketch, { ...options, cluster: false });
  for (const key of diagnosticKeys) assert.deepEqual(actual[key], expected[key], key);
  for (let i = 0; i < actualSketch.points.length; i++) for (const key of ['x', 'y'])
    assert.ok(Math.abs(actualSketch.points[i][key] - expectedSketch.points[i][key]) <= 1e-9, `point ${i} ${key}`);
  for (let i = 0; i < actualSketch.entities.length; i++) for (const key of ['r', 'rx', 'ry', 'rot'])
    if (key in actualSketch.entities[i]) assert.ok(Math.abs(actualSketch.entities[i][key] - expectedSketch.entities[i][key]) <= 1e-9, `entity ${i} ${key}`);
  return actual;
}

for (const n of [320, 640]) test(`${n} independent rectangle/circle variables retain geometry and diagnostics`, () => {
  const sketch = independentSketch(n);
  sketch.points[2].x += 2; sketch.points[2].y -= 1;
  compareSolves(sketch);
  compareSolves(sketch, { diagnostics: false });
  const circles = independentSketch(n);
  const circle = circles.entities.find(e => e.type === 'circle');
  circles.points.find(p => p.id === circle.c).x += 3;
  circle.r += 2;
  compareSolves(circles);
});

test('coupled, conflicting, redundant and under-constrained sketches retain reports', () => {
  const base = independentSketch(32);
  base.constraints.push({ id: 'couple', type: 'distance', a: 'p0_2', b: 'p1_0', value: Math.hypot(20, -6) });
  base.points[2].x += 1;
  compareSolves(base);
  const conflicting = independentSketch(16);
  conflicting.constraints.push({ id: 'wrong', type: 'distance', entity: 'l0_0', value: 15 });
  compareSolves(conflicting);
  assert.deepEqual(explainSketchConflict(conflicting), oldExplainSketchConflict(conflicting));
  const redundant = independentSketch(16);
  redundant.constraints.push({ id: 'repeat', type: 'distance', entity: 'l0_0', value: 10 });
  compareSolves(redundant);
  assert.deepEqual(explainSketchConflict(redundant), oldExplainSketchConflict(redundant));
  const under = independentSketch(16);
  under.constraints = under.constraints.filter(c => !c.id.startsWith('width') && !c.id.startsWith('cf'));
  under.points[2].y += 1;
  compareSolves(under);
  assert.deepEqual(explainSketchConflict(under), oldExplainSketchConflict(under));
});

test('one coupled cluster and changing zero slopes keep the original steps', () => {
  const coupled = {
    points: [{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 6, y: 3 }, { id: 'c', x: 12, y: 1 }],
    entities: [{ id: 'ab', type: 'line', a: 'a', b: 'b' }, { id: 'bc', type: 'line', a: 'b', b: 'c' }],
    constraints: [
      { id: 'anchor', type: 'fixed', point: 'a', x: 0, y: 0 },
      { id: 'length1', type: 'distance', entity: 'ab', value: 8 },
      { id: 'length2', type: 'distance', entity: 'bc', value: 9 },
      { id: 'angle', type: 'perpendicular', a: 'ab', b: 'bc' },
    ],
  };
  compareSolves(coupled);
  compareSolves(coupled, { diagnostics: false });
  // Initially the horizontal distance has no y derivative; moving the target
  // in y makes the next Jacobian connect x and y. A cached nonzero graph fails.
  const turning = {
    points: [{ id: 'a', x: 0, y: 0, fixed: true }, { id: 'b', x: 10, y: 0 }],
    entities: [{ id: 'line', type: 'line', a: 'a', b: 'b' }],
    constraints: [{ id: 'length', type: 'distance', entity: 'line', value: 10 },
      { id: 'target', type: 'fixed', point: 'b', y: 6 }],
  };
  compareSolves(turning);
  compareSolves(turning, { diagnostics: false });
  const before = structuredClone(independentSketch(320));
  const sketch = structuredClone(before);
  sketch.points[2].x += 2;
  solveSketch(sketch, { diagnostics: false });
  assert.deepEqual(sketch.points.slice(4), before.points.slice(4), 'satisfied components remain untouched');
  assert.deepEqual(sketch.entities, before.entities);
});

function timings(fn, runs = 7) {
  for (let i = 0; i < 3; i++) fn();
  const times = [];
  for (let i = 0; i < runs; i++) { const start = performance.now(); fn(); times.push(performance.now() - start); }
  times.sort((a, b) => a - b);
  return { median: times[Math.floor(times.length / 2)], p95: times[Math.ceil(times.length * 0.95) - 1] };
}

test('print warmed median and p95 drag / linear timings at 320 and 640 variables', () => {
  for (const n of [320, 640]) {
    const sketch = independentSketch(n);
    sketch.points[2].x += 2; sketch.points[2].y -= 1;
    const J = sketchJacobian(sketch).J;
    const A = Array.from({ length: n }, (_, j) => Array.from({ length: n }, (_, k) => j === k ? 2 : Math.floor(j / 8) === Math.floor(k / 8) ? 0.125 : 0));
    const b = Array.from({ length: n }, (_, i) => Math.sin(i));
    const oldLinear = timings(() => oldSolveLinear(A, b), 5), newLinear = timings(() => solveLinear(A, b), 5);
    const oldDrag = timings(() => oldSolveSketch(structuredClone(sketch), { diagnostics: false, cluster: false }), 7);
    const newDrag = timings(() => solveSketch(structuredClone(sketch), { diagnostics: false }), 21);
    const oldReport = timings(() => oldSolveSketch(structuredClone(sketch), { cluster: false }), 3);
    const newReport = timings(() => solveSketch(structuredClone(sketch)), 5);
    console.log(JSON.stringify({ variables: n, oldLinear, newLinear, oldDrag, newDrag, oldReport, newReport }));
    assert.ok(newDrag.median < Math.max(100, oldDrag.median * 2), 'loose timing regression bound');
    assert.equal(rankOf(J), oldSolveSketch(structuredClone(sketch), { cluster: false }).rank);
  }
});
