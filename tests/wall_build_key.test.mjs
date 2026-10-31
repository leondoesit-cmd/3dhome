import test from 'node:test';
import assert from 'node:assert/strict';
import { wallBuildKey, createWallBuildKeys } from '../js/core/wall_build_key.js';

test('wall key invalidates own geometry, adjacent arms, openings, types and rendering inputs', () => {
  const state = { nodes: [{x:0,z:0},{x:100,z:0},{x:100,z:100},{x:500,z:500},{x:600,z:500}],
    walls: [{id:1,a:0,b:1,height:280},{id:2,a:1,b:2,height:280},{id:3,a:3,b:4,height:280}],
    openings: [], wallTypes: [] };
  const key = () => wallBuildKey(state, state.walls[0], { color: 123, cut: 'Infinity', xray: false });
  let prior = key();
  state.nodes[4].x++; assert.equal(key(), prior, 'unrelated wall can reuse geometry');
  state.nodes[2].x++; assert.notEqual(key(), prior); prior = key();
  state.walls[1].height++; assert.notEqual(key(), prior); prior = key();
  state.openings.push({wall:2,s:0,width:80}); assert.notEqual(key(), prior); prior = key();
  state.wallTypes.push({id:'new',layers:[]}); assert.notEqual(key(), prior); prior = key();
  state.walls.push({id:4,a:1,b:4}); assert.notEqual(key(), prior);
  assert.notEqual(key(), wallBuildKey(state,state.walls[0],{color:124,cut:'Infinity',xray:false}));
});

const photo = 'data:image/jpeg;base64,' + 'A'.repeat(1 << 20);

test('a rebuild reads only the arms of the walls it asks about', () => {
  let reads = 0;
  const far = { id: 3, a: 3, b: 4, height: 280 };
  // an enumerable getter: JSON.stringify of this wall would read it
  Object.defineProperty(far, 'tex', { enumerable: true, get() { reads++; return photo; } });
  const state = { nodes: [{x:0,z:0},{x:100,z:0},{x:100,z:100},{x:500,z:500},{x:600,z:500}],
    walls: [{id:1,a:0,b:1,height:280},{id:2,a:1,b:2,height:280},far], openings: [], wallTypes: [] };
  const keyFor = createWallBuildKeys(state);
  keyFor(state.walls[0], { color: 1 });
  keyFor(state.walls[1], { color: 1 });
  assert.equal(reads, 0, 'a wall that is no candidate\'s arm is never serialized');
});

test('an uploaded finish on an arm keys by token: small, stable, and new when the finish changes', () => {
  const state = { nodes: [{x:0,z:0},{x:100,z:0},{x:100,z:100}],
    walls: [{id:1,a:0,b:1,height:280},{id:2,a:1,b:2,height:280,tex:photo}], openings: [], wallTypes: [] };
  const key = () => wallBuildKey(state, state.walls[0], { color: 1 });
  const first = key();
  assert.ok(first.length < 1000, `the photo stays out of the key (${first.length} chars)`);
  assert.equal(key(), first, 'the same finish keeps its token across rebuilds');
  state.walls[1].tex = 'data:image/jpeg;base64,' + 'B'.repeat(1 << 20);
  const swapped = key();
  assert.notEqual(swapped, first, 'a new finish invalidates the neighbour');
  state.walls[1].tex = 'textures/brick.jpg';
  assert.notEqual(key(), swapped, 'so does a library finish');
  delete state.walls[1].tex;
  assert.notEqual(key(), swapped, 'and taking the finish off');
  // the arm's other fields are still read in full
  const bare = key();
  state.walls[1].tex = photo; const textured = key();
  state.walls[1].height++;
  assert.notEqual(key(), textured, 'a textured arm\'s geometry still counts');
  assert.notEqual(textured, bare);
});
