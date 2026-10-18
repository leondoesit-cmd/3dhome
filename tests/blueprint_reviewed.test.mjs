import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {reviewedBlueprintResult} from '../js/core/blueprint_reviewed.js';
import {S} from '../js/state.js';
import {detectRooms,pointInPoly} from '../js/geometry.js';
import {normalizeWall,wallThickness} from '../js/wall_types.js';
const source = JSON.parse(readFileSync(new URL('../plans/images.reviewed.json',import.meta.url)));
const clone = () => structuredClone(source);

test('the manually reviewed reference artifact retains its provenance',()=>{
  assert.equal(source.provenance.kind,'reviewed-reconstruction');
  assert.ok(source.provenance.estimates.length);
});
test('reviewed wall graph encloses all eight named regions without extra partitions',()=>{
  const r=reviewedBlueprintResult(clone());
  Object.assign(S,r.reconstruction); S.roomMeta={};
  const rooms=detectRooms(); assert.equal(rooms.length,8);
  for(const label of source.rooms)
    assert.equal(rooms.filter(room=>pointInPoly(label.seed.x,label.seed.z,room.pts)).length,1,label.name);
  assert.equal(S.openings.filter(o=>o.type==='door').length,7);
  assert.equal(S.openings.filter(o=>o.type==='window').length,6);
  assert.equal(S.items.length,44);
});
test('printed clear dimensions are geometric distances, with the safe room notch retained',()=>{
  const r=reviewedBlueprintResult(clone());
  for (const wall of r.reconstruction.walls) {
    const expected=wall.thickness;
    normalizeWall(wall,S);
    assert.equal(wallThickness(wall,S),expected,'semantic normalization must retain calibrated thickness');
  }
  const w=id=>source.walls.find(w=>w.id===id);
  assert.equal(w('bed-right').a.x-10-(w('bed-left-upper').a.x+10),417);
  assert.equal(w('bed-bottom').a.z-10-10,265);
  assert.equal(w('bath-door-wall').a.x-10-10,329);
  assert.equal(w('bath-bottom-left').a.z-10-(w('bath-top-left').a.z+10),200);
  assert.equal(w('shower-right').a.x-10-10,225);
  assert.equal(w('shower-bottom').a.z-10-(w('bath-bottom-left').a.z+10),125);
  assert.equal(w('middle-bed-bottom-safe').a.z-10-(w('middle-bed-door').a.z+10),287);
  assert.equal(w('safe-right-lower').a.x-20-(w('safe-left').a.x+20),308);
  assert.equal(w('safe-bottom').a.z-20-(w('middle-bed-bottom-safe').a.z+10),368);
  assert.equal(w('safe-bottom').a.z-20-(w('safe-door').a.z+10),268);
  assert.equal(w('balcony-right').a.x-10-(w('safe-right-shared').a.x+20),458);
  assert.equal(w('balcony-bottom').a.z-10-(w('balcony-glazing').a.z+10),154);
});
test('rejects disconnected opening references, out-of-wall and overlapping openings',()=>{
  for(const edit of [s=>s.openings[0].wall='missing',s=>s.openings[0].s=0,
    s=>s.openings.push({...s.openings[0]})]){
    const s=clone(); edit(s); assert.throws(()=>reviewedBlueprintResult(s));
  }
});
test('compilation does not mutate the reviewed source or lose door swing and glazing',()=>{
  const s=clone(),before=JSON.stringify(s),r=reviewedBlueprintResult(s);
  assert.equal(JSON.stringify(s),before);
  assert.equal(r.reconstruction.openings[0].swingDir,'L_IN');
  assert.ok(r.reconstruction.openings.some(o=>o.isSliding && o.mat==='glass'));
  assert.ok(r.reconstruction.walls.some(w=>w.kind==='railing'));
  assert.equal(new Set(r.reconstruction.items.map(it=>it.id)).size,44);
});
