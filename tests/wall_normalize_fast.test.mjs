import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { Session } from 'node:inspector';
import * as fast from '../js/wall_types.js';
import * as geometry from '../js/geometry.js';
import * as rooms from '../js/room_area.js';
import * as polygons from '../js/polygon_area.js';
import * as spatial from '../js/core/spatial_project.js';
import { S } from '../js/state.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const temporary = await mkdtemp(join(tmpdir(), 'wall-normalize-'));
const referenceURLs = new Map();
async function reference(file, overrides = {}) {
  if (referenceURLs.has(file)) return import(referenceURLs.get(file));
  const source = execFileSync('git', ['show', `HEAD:${file}`], { cwd: root, encoding: 'utf8', maxBuffer: 8e6 });
  const rewritten = source.replace(/from\s+(["'])(\.[^"']+)\1/g, (match, quote, specifier) =>
    `from ${quote}${overrides[specifier] || pathToFileURL(resolve(root, dirname(file), specifier)).href}${quote}`);
  const url = pathToFileURL(join(temporary, file.replaceAll('/', '_') + '.mjs')).href;
  await writeFile(fileURLToPath(url), rewritten);
  referenceURLs.set(file, url);
  return import(url);
}
const old = await reference('js/wall_types.js');
test.after(() => rm(temporary, { recursive: true, force: true }));
const copy = value => JSON.parse(JSON.stringify(value));
const json = value => JSON.stringify(value);
function random(seed) {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
}
function project(count = 200) {
  return { walls: Array.from({ length: count }, (_, id) => ({ id, thickness: 10 + id % 13,
    ...(id % 3 ? {} : { wallTypeId: 'exterior' }),
    ...(id % 5 ? {} : { layers: [{ thickness: 7 }, { thickness: 2, main: true }] }),
  })), nodes: [], openings: [] };
}

test('seeded edits preserve HEAD JSON and helper returns at migration/edit boundaries', () => {
  for (const seed of [1, 42, 991, 8675309]) {
    const rand = random(seed), pick = n => Math.floor(rand() * n);
    const a = project(8), b = copy(a);
    old.ensureWallTypes(a); fast.ensureWallTypes(b);
    for (let step = 0; step < 180; step++) {
      const index = pick(a.walls.length), kind = pick(10), value = pick(35) - 3;
      const mutate = state => {
        const wall = state.walls[index];
        if (kind === 0) state.walls.push({ id: step + 200, thickness: value,
          ...(step % 2 ? { wallTypeId: 'missing', layers: [{ thickness: value }] } : {}) });
        if (kind === 1 && state.walls.length > 1) state.walls.splice(index, 1);
        if (kind === 2) state.wallTypes = copy(state.wallTypes).reverse();
        if (kind === 3) state.wallTypes[0].layers[0].thickness = value;
        if (kind === 4) state.wallTypes.push({ id: `custom-${step}`, layers: [{ thickness: value }] });
        if (kind === 5) { wall.layers ||= [{ thickness: 4 }]; wall.layers[0].thickness = value; wall.layers[0].main = !wall.layers[0].main; }
        if (kind === 6) { wall.wallTypeId = ['drywall', 'missing', 'concrete'][pickForStep % 3]; delete wall.layers; }
        if (kind === 7) { wall.datum = 'outside-main'; wall.phase = 'demo'; wall.height = value; wall.layersReversed = step % 2; }
        if (kind === 8) state.walls = copy(state.walls);
        if (kind === 9) { delete state.wallTypes[0].name; state.wallTypes[0].layers.reverse(); }
      };
      const pickForStep = pick(10);
      mutate(a); mutate(b);
      // UI wall edits repair their target before other consumers. Arbitrary
      // cross-wall ordering has a separate explicit-repair test below.
      if (kind >= 5 && kind <= 7) {
        old.normalizeWall(a.walls[index], a); fast.normalizeWall(b.walls[index], b);
      }
      const target = pick(a.walls.length);
      const name = ['normalizeWall', 'wallLayers', 'wallThickness', 'wallLayerBands', 'wallDatumOffset', 'wallMainLayer', 'ensureWallTypes', 'wallTypeById'][pick(8)];
      const call = (api, state) => name === 'ensureWallTypes' ? api[name](state) :
        name === 'wallTypeById' ? api[name](state, 'generic') : api[name](state.walls[target], state);
      assert.equal(json(call(fast, b)), json(call(old, a)), `return seed=${seed} step=${step} ${name}`);
      assert.equal(json(b), json(a), `state seed=${seed} step=${step} ${name}`);
    }
  }
});

test('arbitrary cross-wall edit/query order has identical requested results and full repair JSON', () => {
  const a = project(16), b = copy(a), rand = random(417);
  old.ensureWallTypes(a); fast.ensureWallTypes(b);
  for (let step = 0; step < 120; step++) {
    const edited = Math.floor(rand() * a.walls.length), queried = Math.floor(rand() * a.walls.length);
    for (const state of [a, b]) state.walls[edited].layers = [{ thickness: step % 17, role: 'finish' }];
    const name = ['normalizeWall', 'wallLayers', 'wallThickness'][step % 3];
    assert.equal(json(fast[name](b.walls[queried], b)), json(old[name](a.walls[queried], a)));
    assert.equal(json(b.wallTypes), json(a.wallTypes));
    // An explicit whole-project repair is the contract for unrelated dirty walls.
    old.ensureWallTypes(a); fast.ensureWallTypes(b);
    assert.equal(json(b), json(a));
  }
});

test('catalogue identity is stable and retained-reference edits invalidate exactly', () => {
  const state = project(3); fast.ensureWallTypes(state);
  const catalogue = state.wallTypes;
  for (let i = 0; i < 10; i++) fast.wallLayerBands(state.walls[i % 3], state);
  assert.equal(state.wallTypes, catalogue);
  const mutations = [
    s => s.wallTypes[0].id = 'renamed',
    s => s.wallTypes[0].layers[0].thickness = -5,
    s => s.wallTypes[0].layers.splice(0, 1),
    s => s.wallTypes.reverse(),
    s => s.wallTypes[1] = { id: 'custom', layers: [{ thickness: 8 }] },
    s => delete s.wallTypes[0].category,
    s => s.wallTypes.push({ id: 'generic', layers: [] }),
    s => s.wallTypes = { legacy: { layers: [{ thickness: 3 }] } },
    s => delete s.wallTypes,
  ];
  for (const mutate of mutations) {
    mutate(state); const expected = copy(state);
    const result = fast.wallLayers(state.walls[0], state);
    assert.equal(json(result), json(old.wallLayers(expected.walls[0], expected)));
    assert.equal(json(state), json(expected));
  }
  // Nested metadata is shared by normalization, so it needs no catalogue repair.
  const type = state.wallTypes.find(t => t.id === 'drywall');
  const stable = state.wallTypes;
  type.layers[1].framing.spacing = 42;
  assert.equal(fast.wallTypeById(state, 'drywall').layers[1].framing.spacing, 42);
  assert.equal(state.wallTypes, stable);
});

test('replacement/resized wall arrays migrate neighbours before raw geometry reads', () => {
  const state = project(1); fast.ensureWallTypes(state);
  for (const introduce of [
    s => s.walls.push({ id: 2, wallTypeId: 'exterior' }),
    s => s.walls = [{ id: 3, wallTypeId: 'concrete' }, { id: 4, thickness: 17 }],
  ]) {
    introduce(state); const expected = copy(state);
    fast.normalizeWall(state.walls[0], state); old.normalizeWall(expected.walls[0], expected);
    assert.equal(json(state), json(expected));
  }
  state.walls[1].layers[0].thickness = 33;
  fast.normalizeWall(state.walls[0], state);
  assert.equal(state.walls[1].thickness, 17, 'ordinary helper does not repair unrelated in-place edits');
  fast.ensureWallTypes(state);
  assert.equal(state.walls[1].thickness, 33);
});

function renderPass(api, state) {
  for (const wall of state.walls) { api.normalizeWall(wall, state); api.wallLayers(wall, state); }
}
function milliseconds(run, repeats = 5) {
  const times = [];
  for (let i = 0; i < repeats; i++) { const start = performance.now(); run(); times.push(performance.now() - start); }
  return times.sort((a, b) => a - b)[Math.floor(repeats / 2)];
}
test('200-wall render-like pass is at least five times faster than HEAD', () => {
  const a = project(), b = copy(a); old.ensureWallTypes(a); fast.ensureWallTypes(b);
  renderPass(old, a); renderPass(fast, b);
  const before = milliseconds(() => renderPass(old, a));
  const after = milliseconds(() => renderPass(fast, b));
  console.table([{ workload: '200 walls: normalizeWall + wallLayers', before_ms: +before.toFixed(3), after_ms: +after.toFixed(3), speedup: +(before / after).toFixed(2) }]);
  assert.ok(after < before / 5, `${after.toFixed(2)} ms vs HEAD ${before.toFixed(2)} ms`);
  assert.equal(json(b), json(a));
});

// The remaining hotspot workloads and their CPU profile live in this same
// executable test file, so the benchmark needs no browser or extra JS assets.
async function cpuProfile(run) {
  const session = new Session(); session.connect();
  const post = (method, params = {}) => new Promise((resolve, reject) => session.post(method, params, (error, result) => error ? reject(error) : resolve(result)));
  try {
    await post('Profiler.enable'); await post('Profiler.start'); run();
    const { profile } = await post('Profiler.stop');
    const counts = new Map();
    profile.samples?.forEach((id, i) => counts.set(id, (counts.get(id) || 0) + profile.timeDeltas[i] / 1000));
    console.table(profile.nodes.filter(n => /wall_types|geometry|room_area|polygon_area|spatial_project/.test(n.callFrame.url))
      .map(n => ({ function: n.callFrame.functionName || '(anonymous)', self_ms: +(counts.get(n.id) || 0).toFixed(2), file: n.callFrame.url.split('/').at(-1) }))
      .sort((a, b) => b.self_ms - a.self_ms).slice(0, 10));
  } finally { session.disconnect(); }
}

function apartmentTiles(count = 50) {
  const state = { nodes: [], walls: [], openings: [] }, list = [];
  for (let tile = 0; tile < count; tile++) {
    const x = tile * 1000, start = state.nodes.length;
    const points = [{ x, z: 0 }, { x: x + 400, z: 0 }, { x: x + 400, z: 300 }, { x, z: 300 }];
    state.nodes.push(...points);
    const walls = points.map((_, i) => ({ id: tile * 4 + i, a: start + i, b: start + (i + 1) % 4, thickness: 10, height: 270 }));
    state.walls.push(...walls);
    state.openings.push({ wall: walls[0].id, s: 180, width: 90, height: 210, sill: 0 });
    list.push({ key: walls.map(w => w.id).join(','), pts: points, area: 120000 });
  }
  return { state, list };
}
const rectangle = (x, z, w, d) => [{ x, z }, { x: x + w, z }, { x: x + w, z: z + d }, { x, z: z + d }];

test('joint calculations match HEAD after in-place opening, topology and height edits', async () => {
  const baseline = await reference('js/geometry.js');
  const saved = { nodes: S.nodes, walls: S.walls, openings: S.openings };
  const rand = random(913), pick = n => Math.floor(rand() * n);
  S.nodes = [{ x: 0, z: 0 }, { x: 300, z: 0 }, { x: 600, z: 0 }, { x: 300, z: 250 }, { x: 500, z: -180 }];
  S.walls = [[0, 1], [1, 2], [1, 3], [4, 1]].map(([a, b], id) => ({ id, a, b, height: 270, thickness: 10 + id * 5 }));
  S.openings = [{ wall: 0, s: 280, width: 80, height: 270, sill: 0 }, { wall: 2, s: 0, width: 60, height: 270, sill: 0 }];
  try {
    for (let step = 0; step < 80; step++) {
      const opening = S.openings[pick(S.openings.length)];
      switch (step % 9) {
        case 0: opening.wall = pick(4); break;
        case 1: opening.s = pick(350); break;
        case 2: opening.width = pick(350); break;
        case 3: opening.sill = pick(2) ? 0 : 20; opening.height = pick(2) ? 270 : 210; break;
        case 4: S.openings.reverse(); break;
        case 5: S.openings = copy(S.openings); break;
        case 6: S.openings.splice(0, 1, { ...opening, wall: String(pick(4)) }); break;
        case 7: S.walls[2].kind = ['half', 'normal', 'railing'][pick(3)]; S.walls[2].halfHeight = 100; break;
        case 8: S.nodes[3].x = 200 + pick(200); break;
      }
      for (const wall of S.walls) for (const height of [undefined, 120, 280]) {
        assert.deepEqual(geometry.wallOutline(wall, height), baseline.wallOutline(wall, height), `outline ${step}`);
        assert.deepEqual(geometry.wallBandOutline(wall, -2, 3, height), baseline.wallBandOutline(wall, -2, 3, height));
        assert.equal(geometry.wallSolidAtNode(wall, wall.a, height), baseline.wallSolidAtNode(wall, wall.a, height));
      }
    }
  } finally { Object.assign(S, saved); }
});

test('polygon sweeps match HEAD over seeded overlapping, concave and mutated polygons', async () => {
  const baseline = await reference('js/polygon_area.js'), rand = random(513);
  for (let step = 0; step < 100; step++) {
    const groups = Array.from({ length: 3 }, () => Array.from({ length: 3 }, () => {
      const x = Math.floor(rand() * 40), z = Math.floor(rand() * 40), w = rand() * 25 + 1, d = rand() * 25 + 1;
      const polygon = step % 2 ? rectangle(x, z, w, d) : [{ x, z }, { x: x + w, z: z + d / 3 }, { x: x - 2, z: z + d }, { x: x + w / 4, z: z + d / 2 }];
      return step % 3 ? polygon : polygon.reverse();
    }));
    for (const accept of [s => s[0] && !s[1], s => s[0] || s[2], s => s.filter(Boolean).length === 1])
      assert.equal(polygons.polygonBooleanArea(groups, accept), baseline.polygonBooleanArea(groups, accept));
    assert.equal(polygons.polygonDifferenceArea(groups[0], groups[1]), baseline.polygonDifferenceArea(groups[0], groups[1]));
    groups[1][0][0].x += 10;
    assert.equal(polygons.polygonDifferenceArea(groups[0], groups[1]), baseline.polygonDifferenceArea(groups[0], groups[1]));
  }
});

test('room solid index matches HEAD after edits without mutating project state', async () => {
  const baseline = await reference('js/room_area.js', { './wall_types.js': referenceURLs.get('js/wall_types.js') });
  const { state, list } = apartmentTiles(4);
  const compare = () => {
    const before = json(state);
    assert.deepEqual(rooms.floorClearAreas(state, list), baseline.floorClearAreas(state, list));
    for (const room of list) assert.deepEqual(rooms.roomClearArea(state, room), baseline.roomClearArea(state, room));
    assert.equal(json(state), before);
  };
  compare();
  state.nodes.push({ x: 100, z: 100 }, { x: 200, z: 100 });
  state.walls.push({ id: 'solid', a: 16, b: 17, thickness: 10 }); compare();
  state.nodes[16].z = state.nodes[17].z = 1000; compare();
  state.walls.at(-1).layers = [{ thickness: 2500 }]; compare();
  state.walls.at(-1).datum = 3500; compare();
  state.walls.at(-1).bulge = 0.5; compare();
  state.walls.at(-1).a = 999; compare();
  state.walls.pop(); state.slabOpenings = [{ x: 200, z: 150, w: 30, d: 30 }]; compare();
  state.wallTypes = [{ id: 'custom', layers: [{ thickness: 30, main: true }] }];
  state.walls[0].wallTypeId = 'custom'; compare();
});

test('spatial alias reuse repairs redefinitions and follows document replacement', async () => {
  const baseline = await reference('js/core/spatial_project.js');
  const a = { walls: [], nodes: [], workspace: {} }, b = copy(a);
  for (const api of [baseline, spatial]) api.installSpatialProject(api === baseline ? a : b);
  const descriptor = Object.getOwnPropertyDescriptor(b, 'walls');
  spatial.installSpatialProject(b);
  assert.equal(Object.getOwnPropertyDescriptor(b, 'walls').get, descriptor.get);
  for (const state of [a, b]) {
    Object.defineProperty(state, 'walls', { configurable: true, enumerable: false, writable: true, value: [{ id: 4 }] });
    delete state.nodes;
    state.spatial = { ...state.spatial, walls: [{ id: 9 }], nodes: [{ x: 1, z: 2 }] };
    state.spatial.floors = [];
  }
  baseline.installSpatialProject(a); spatial.installSpatialProject(b);
  a.walls = [{ id: 11 }]; b.walls = [{ id: 11 }];
  assert.equal(baseline.touchSpatialProject(a), spatial.touchSpatialProject(b));
  assert.equal(json(a), json(b));
  assert.equal(Object.getOwnPropertyDescriptor(b, 'walls').enumerable, true);
});

test('remaining Node hotspots match HEAD and print timing/profile tables', async () => {
  const beforeGeometry = await reference('js/geometry.js');
  const beforeRooms = await reference('js/room_area.js', { './wall_types.js': referenceURLs.get('js/wall_types.js') });
  const beforePolygons = await reference('js/polygon_area.js');
  const beforeSpatial = await reference('js/core/spatial_project.js');
  const { state, list } = apartmentTiles();
  const saved = { nodes: S.nodes, walls: S.walls, openings: S.openings };
  Object.assign(S, copy(state));
  try {
    const groups = [list.map(r => r.pts), state.walls.map(w => rectangle(state.nodes[w.a].x - 5, state.nodes[w.a].z - 5, 20, 20)), [], []];
    const accept = s => s[0] && !s[1];
    const beforeState = copy(state), afterState = copy(state);
    const workloads = [
      ['200 wall outlines, 50 openings', () => S.walls.map(w => beforeGeometry.wallOutline(w)), () => S.walls.map(w => geometry.wallOutline(w))],
      ['50 room clear areas / 200 walls', () => beforeRooms.floorClearAreas(state, list), () => rooms.floorClearAreas(state, list)],
      ['50 individual render room queries', () => list.map(room => beforeRooms.roomClearArea(state, room)), () => list.map(room => rooms.roomClearArea(state, room))],
      ['polygon boolean: 250 polygons', () => beforePolygons.polygonBooleanArea(groups, accept), () => polygons.polygonBooleanArea(groups, accept)],
      ['200 spatial installs', () => { for (let i = 0; i < 200; i++) beforeSpatial.installSpatialProject(beforeState); return beforeSpatial.exportSpatialProject(beforeState); },
        () => { for (let i = 0; i < 200; i++) spatial.installSpatialProject(afterState); return spatial.exportSpatialProject(afterState); }],
    ];
    const table = [];
    for (const [workload, before, after] of workloads) {
      assert.deepEqual(after(), before(), workload);
      const baseline = milliseconds(before, 3), current = milliseconds(after, 3);
      table.push({ workload, before_ms: +baseline.toFixed(3), after_ms: +current.toFixed(3), speedup: +(baseline / current).toFixed(2) });
    }
    console.table(table);
    await cpuProfile(() => { for (let i = 0; i < 4; i++) for (const [, , after] of workloads) after(); });
  } finally { Object.assign(S, saved); }
});
