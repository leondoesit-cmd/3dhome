import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateMassProperties } from '../js/cad_mass_properties.js';
import { partMaterialDensity, STOCK_MATERIALS } from '../js/cad_appearances.js';
import { assertRevolveProfile, assertRevolveProfileFrame, REVOLVE_AXIS_CROSSING, revolveRecipe } from '../js/core/revolve_geometry.js';
import { loadAssemblyLibrary, saveAssemblyLibrary, loadModelerDraftRecord, saveModelerDraftRecord, clearModelerDraftRecord, clearMemoryModelLibrary, libraryBundle, parseLibraryBundle, mergeLibraryRecords, collidingLibraryKeys } from '../js/core/model_library_store.js';

const box = (id, x0) => ({id, kind:'box', x0, x1:x0+2, y0:0, y1:2, z0:0, z1:2});

test('mass uses each body material density and answers in grams', async () => {
  const aluminum={...box('alu',0), materialCatalogId:'stock:aluminum', materialName:STOCK_MATERIALS.aluminum.name};
  const steel={...box('stl',10), materialCatalogId:'stock:steel', materialName:STOCK_MATERIALS.steel.name};
  assert.equal(partMaterialDensity(aluminum), 2.70);
  const mass=await evaluateMassProperties({parts:[aluminum, steel]});
  assert.equal(mass.accuracy,'exact');
  assert.equal(mass.density, null);
  const volume=8;
  assert.ok(Math.abs(mass.volumeCm3-16)<1e-6);
  assert.ok(Math.abs(mass.massG-(volume*2.70+volume*8.00))<1e-6);
  assert.ok(Math.abs(mass.bodies[0].massKg-volume*2.70/1000)<1e-9);
  assert.ok(Math.abs(mass.bodies[1].massKg-volume*8.00/1000)<1e-9);
  const weighted=(volume*2.70*1+volume*8.00*11)/(volume*2.70+volume*8.00);
  assert.ok(Math.abs(mass.centerOfMass.x-weighted)<1e-6, String(mass.centerOfMass.x));
});

test('a revolve profile that crosses the axis is rejected', () => {
  const points=[{u:-1,v:0},{u:1,v:0},{u:1,v:2},{u:-1,v:2}];
  assert.throws(()=>assertRevolveProfile(points), {message:REVOLVE_AXIS_CROSSING});
  assert.throws(()=>revolveRecipe({pts:points}), {message:REVOLVE_AXIS_CROSSING});
  assert.equal(assertRevolveProfile([{u:0,v:0},{u:2,v:0},{u:2,v:1}]), 1);
  assert.equal(assertRevolveProfile([{u:0,v:0},{u:-2,v:0},{u:-2,v:1}]), -1);
});

test('toolbox, custom, rubber and polycarbonate densities are not silent steel', () => {
  assert.equal(partMaterialDensity({ materialCatalogId: 'toolbox:nylon' }), 1.14);
  assert.equal(partMaterialDensity({ materialCatalogId: 'custom', customDensity: 0.95 }), 0.95);
  assert.equal(partMaterialDensity({ materialCatalogId: 'stock:rubber' }), 1.30);
  assert.equal(partMaterialDensity({ materialCatalogId: 'stock:polycarbonate' }), 1.20);
});

test('a sketch-plane revolve that crosses the axis is rejected', () => {
  const frame = { origin: { x: 0, y: 0, z: 0 }, xAxis: { x: 1, y: 0, z: 0 }, yAxis: { x: 0, y: 1, z: 0 }, normal: { x: 0, y: 0, z: 1 } };
  assert.throws(() => assertRevolveProfileFrame([{ u: -1, v: 0 }, { u: 1, v: 0 }, { u: 1, v: 2 }], { axis: 'y', profileFrame: frame }), { message: REVOLVE_AXIS_CROSSING });
  assert.equal(assertRevolveProfileFrame([{ u: 1, v: 0 }, { u: 2, v: 0 }, { u: 2, v: 2 }], { axis: 'y', profileFrame: frame }), 1);
});

test('a revolve profile is measured from the world axis, not the sketch origin', () => {
  const frame = { origin: { x: 5, y: 0, z: 0 }, xAxis: { x: 1, y: 0, z: 0 }, yAxis: { x: 0, y: 1, z: 0 }, normal: { x: 0, y: 0, z: 1 } };
  const spec = { axis: 'y', profileFrame: frame };
  assert.equal(assertRevolveProfileFrame([{ u: -1, v: 0 }, { u: 1, v: 0 }, { u: 1, v: 2 }, { u: -1, v: 2 }], spec), 1);
  assert.throws(
    () => assertRevolveProfileFrame([{ u: -6, v: 0 }, { u: -1, v: 0 }, { u: -1, v: 2 }, { u: -6, v: 2 }], spec),
    { message: REVOLVE_AXIS_CROSSING },
  );
});

test('a library JSON bundle round-trips models and assemblies', () => {
  const models = [{ key: 'LENSCAP', name: 'LENSCAP', parts: [{ id: 'p1' }] }];
  const assemblies = [{ key: 'CAPANDLENS', name: 'CAPANDLENS', components: [{ id: 'c1' }] }];
  const raw = JSON.stringify(libraryBundle(models, assemblies));
  const parsed = parseLibraryBundle(raw);
  assert.equal(parsed.models[0].name, 'LENSCAP');
  assert.equal(parsed.assemblies[0].name, 'CAPANDLENS');
  const merged = mergeLibraryRecords([{ key: 'LENSCAP', name: 'old' }], parsed.models);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].name, 'LENSCAP');
  assert.deepEqual(collidingLibraryKeys([{ key: 'LENSCAP' }], parsed.models), ['LENSCAP']);
  const kept = mergeLibraryRecords([{ key: 'LENSCAP', name: 'old' }], parsed.models, { conflict: 'keep-both' });
  assert.equal(kept.length, 2);
  assert.equal(kept.find((item) => item.key === 'LENSCAP').name, 'old');
  assert.equal(kept.find((item) => item.key === 'LENSCAP-2').key, 'LENSCAP-2');
  assert.throws(() => parseLibraryBundle({ format: 'nope' }), /Not a ModelForge library file/);
});

test('assembly library and drafts persist in the in-memory store', async () => {
  clearMemoryModelLibrary();
  const assemblies=[{key:'asm1', name:'CAPANDLENS', components:[{id:'c1'}]}];
  await saveAssemblyLibrary(assemblies);
  const loaded=await loadAssemblyLibrary();
  assert.equal(loaded[0].name,'CAPANDLENS');
  loaded[0].name='mutated';
  assert.equal((await loadAssemblyLibrary())[0].name,'CAPANDLENS');
  await saveModelerDraftRecord({v:1, at:1, docType:'part', def:{id:'p', name:'LENSCAP'}});
  const draft=await loadModelerDraftRecord();
  assert.equal(draft.def.name,'LENSCAP');
  await clearModelerDraftRecord();
  assert.equal(await loadModelerDraftRecord(), null);
});
