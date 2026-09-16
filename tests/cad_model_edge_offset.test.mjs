import test from 'node:test';
import assert from 'node:assert/strict';
import {appendCircularEdgeOffset,updateSilhouetteSketch} from '../js/core/cone_silhouette.js';
import {offsetEntity} from '../js/sketch_trim.js';
const edge=(radius=.635,x=0)=>({kind:'edge',ownerFeatureId:'holes',persistentId:'holes:circle',descriptor:{curve:'circle',radius,measure:2*Math.PI*radius,origin:{x,y:0,z:.508},axis:{x:0,y:0,z:1}}});
const sketch=()=>({plane:'front',offset:.508,points:[],entities:[],constraints:[]});
let sequence=0;const id=()=>`offset_test_${sequence++}`;
test('BATTERYPLATE holder offsets retain the exact edge through save and a moved, resized hole',()=>{
 const s=sketch(),inner=appendCircularEdgeOffset(s,edge(),.762,id),outer=offsetEntity(s,inner.id,.254);
 assert.ok(Math.abs(inner.r-1.397)<1e-12);assert.ok(Math.abs(outer.r-1.651)<1e-12);
 assert.equal(s.entities.length,2);assert.equal(s.entities.some(e=>e.construction),false);
 const saved=JSON.parse(JSON.stringify(s));
 const rebuilt=updateSilhouetteSketch(saved,ref=>{assert.equal(ref.persistentId,'holes:circle');return edge(.8,2);});
 assert.ok(Math.abs(rebuilt.entities[0].r-1.562)<1e-12);
 assert.ok(Math.abs(rebuilt.entities[1].r-1.816)<1e-12);
 assert.deepEqual(rebuilt.points.map(p=>[p.x,p.y]),[[2,0],[2,0]]);
 assert.equal(rebuilt.constraints.find(c=>c.type==='diameter').value,3.124);
 assert.equal(s.points[0].x,0,'rebuild does not mutate the authored sketch');
 delete saved.circleCopies[1].offsetFrom; // Earlier saved offsets infer their linked parent from the relation.
 saved.constraints.find(c=>c.type==='offset').value=.3;
 const edited=updateSilhouetteSketch(saved,()=>edge());
 assert.ok(Math.abs(edited.entities[1].r-1.697)<1e-12,'editing the offset dimension remains authoritative');
});
test('inward model-edge offset rejects collapse and unsupported curves without mutation',()=>{
 const s=sketch();appendCircularEdgeOffset(s,edge(),-.1,id);assert.equal(s.entities[0].r,.535);
 for(const distance of [-.635,-1,0,NaN,Infinity]){
  const before=structuredClone(s);assert.throws(()=>appendCircularEdgeOffset(s,edge(),distance,id),/positive/);assert.deepEqual(s,before);
 }
 assert.throws(()=>appendCircularEdgeOffset(s,{descriptor:{curve:'line'}},.1,id),/complete/);
 assert.throws(()=>appendCircularEdgeOffset({...s,plane:'right'},edge(),.1,id),/parallel/);
 assert.throws(()=>updateSilhouetteSketch(s,()=>edge(.05)),/collapses/);
 assert.throws(()=>updateSilhouetteSketch(s,()=>undefined),/unavailable/);
});
