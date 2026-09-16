import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { exportSpatialProject } from '../js/core/spatial_project.js';
import { ensureWallTypes, wallThickness } from '../js/wall_types.js';
import { getDirtyRevision, isDirty, markDirty, markSaved } from '../js/persist.js';

test('an asynchronous save cannot mark a newer edit clean', () => {
  markDirty();
  const savingRevision = getDirtyRevision();
  markDirty();
  markSaved(savingRevision);
  assert.equal(isDirty(), true);
  markSaved(getDirtyRevision());
  assert.equal(isDirty(), false);
});

const source = readFileSync(new URL('../js/ui.js', import.meta.url), 'utf8');

test('the browser load mapper preserves an authored wall assembly after JSON export', () => {
  const state = { nodes: [{x:0,z:0},{x:542.29,z:0}], walls: [{id:1,a:0,b:1,height:270,
    wallTypeId:'generic', thickness:13.97, layers:[{id:'custom-core',thickness:13.97,main:true,material:'generic-masonry'}]}] };
  ensureWallTypes(state);
  const data = JSON.parse(JSON.stringify({spatial:exportSpatialProject(state)}));
  // Exercise the browser's actual sanitizing mapper without booting WebGL.
  const mapping = source.slice(source.indexOf('  S.walls = (d.walls || [])'), source.indexOf('  S.openings = (d.openings || [])'));
  const loaded = {nodes:data.spatial.nodes,wallTypes:data.spatial.wallTypes};
  new Function('S','d','fin','uid',mapping)(loaded,data.spatial,Number.isFinite,()=>99);
  ensureWallTypes(loaded);
  assert.equal(wallThickness(loaded.walls[0],loaded),13.97);
  loaded.walls[0].layers[0].thickness=20;
  assert.equal(data.spatial.walls[0].layers[0].thickness,13.97);
});

test('browser load restores saved dimensional relationships and clears stale ones', () => {
  const mapping = source.slice(source.indexOf('  S.wallCons = Array.isArray(d.wallCons)'),source.indexOf('  S.ignoredWarnings ='));
  const apply = new Function('S','d',mapping);
  const data={wallCons:[{id:2,type:'opening-center',opening:9}],roomCons:[{id:3,value:500}],planVars:[{id:4,value:250}]};
  const state={};apply(state,data);
  assert.deepEqual(state,data);
  assert.notEqual(state.wallCons,data.wallCons);
  apply(state,{});
  assert.deepEqual(state,{wallCons:[],roomCons:[],planVars:[]});
});
