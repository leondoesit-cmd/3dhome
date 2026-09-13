import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateMassProperties } from '../js/cad_mass_properties.js';
import { partMaterialDensity, STOCK_MATERIALS } from '../js/cad_appearances.js';
import { assertRevolveProfile, REVOLVE_AXIS_CROSSING, revolveRecipe } from '../js/core/revolve_geometry.js';
import { loadAssemblyLibrary, saveAssemblyLibrary, loadModelerDraftRecord, saveModelerDraftRecord, clearModelerDraftRecord, clearMemoryModelLibrary } from '../js/core/model_library_store.js';

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
