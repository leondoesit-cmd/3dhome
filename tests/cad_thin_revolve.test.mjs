import test from 'node:test';
import assert from 'node:assert/strict';
import {thinSketchProfile} from '../js/core/thin_profile.js';
import {regenerateFeatures,releaseRegeneration} from '../js/cad_feature_tree.js';
import {shapeMassProperties} from '../js/cad_kernel.js';
const sketch={id:'connectorSketch',plane:'side',referenceId:'plane:right',points:[{id:'c',x:5.842,y:1.016},{id:'a',x:6.096,y:1.016},{id:'b',x:5.842,y:1.27}],entities:[{id:'arc',type:'arc',a:'a',b:'b',c:'c'}],constraints:[]};
const params={axis:'z',angle:360,useSketchPlane:true,thinFeature:true,thickness:.127,thinMode:'mid-plane',sketchId:sketch.id,profileEntityIds:['arc']};
test('thin arc retains concentric analytic walls and flat end caps',()=>{
 const profile=thinSketchProfile(sketch,['arc'],.127);
 assert.deepEqual(profile.segments.map(s=>s.type),['arc','line','arc','line']);
 assert.ok(Math.abs(profile.segments[0].radius-.1905)<1e-10);
 assert.ok(Math.abs(profile.segments[2].radius-.3175)<1e-10);
 assert.throws(()=>thinSketchProfile(sketch,['arc'],1),/collapses/);
});
test('book lens connector thin revolve has analytic volume and merges with neck',async()=>{
 const run=await regenerateFeatures({sketches:[sketch],features:[{id:'neck',type:'cylinder',params:{r:1.016,h:1.016,axis:'z',z:5.08}},{id:'connector',type:'revolve',params},{id:'joined',type:'union',inputs:['neck','connector']}]});
 try{
  assert.equal(run.ok,true,JSON.stringify(run.issues));
  const mass=await shapeMassProperties(run.results.get('connector'));
  const ri=.1905,ro=.3175,area=Math.PI*(ro*ro-ri*ri)/4,centroid=1.016+4*(ro**3-ri**3)/(3*Math.PI*(ro*ro-ri*ri));
  assert.ok(Math.abs(mass.volume-area*centroid*2*Math.PI)<1e-6,JSON.stringify(mass));
  assert.ok((await shapeMassProperties(run.results.get('joined'))).volume>mass.volume);
 }finally{releaseRegeneration(run);}
});
test('thin open polyline has joined offset walls and exact end caps',()=>{
 const path={points:[{id:'a',x:0,y:0},{id:'b',x:2,y:0},{id:'c',x:2,y:2}],entities:[{id:'ab',type:'line',a:'a',b:'b'},{id:'bc',type:'line',a:'b',b:'c'}]};
 const profile=thinSketchProfile(path,['ab','bc'],.2,'mid-plane');
 assert.equal(profile.segments.length,6);
 assert.deepEqual(profile.segments[0].to,{u:2.1,v:-.1});
 assert.deepEqual(profile.segments[3].to,{u:1.9,v:.1});
 const points=profile.segments.map(s=>s.from);
 const area=Math.abs(points.reduce((sum,p,i)=>{const q=points[(i+1)%points.length];return sum+p.u*q.v-q.u*p.v;},0))/2;
 assert.ok(Math.abs(area-.8)<1e-10);
 for(let i=0;i<profile.segments.length;i++)assert.deepEqual(profile.segments[i].to,profile.segments[(i+1)%profile.segments.length].from);
});
