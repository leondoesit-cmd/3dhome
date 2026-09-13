import test from 'node:test';
import assert from 'node:assert/strict';
import {regenerateFeatures,releaseRegeneration} from '../js/cad_feature_tree.js';
import {shapeMassProperties} from '../js/cad_kernel.js';
import {createTopologyReference} from '../js/core/topology.js';
const square=h=>[{u:-h,v:-h},{u:h,v:-h},{u:h,v:h},{u:-h,v:h}];
const base=[{id:'base',type:'extrude',params:{axis:'y',from:0,to:1.016,points:square(3.429)},inputs:[]},{id:'pocketTool',type:'extrude',params:{axis:'y',from:1.016,to:.508,points:square(3.048)},inputs:[]},{id:'pocket',type:'subtract',params:{},inputs:['base','pocketTool']}];
test('a hollow holder depends on the pocket result even when its floor retains the original face name',async()=>{
 const first=await regenerateFeatures({features:structuredClone(base)});
 let support;
 try{
  assert.equal(first.ok,true,JSON.stringify(first.issues));
  const floor=first.results.get('pocket').topology.find(t=>t.kind==='face'&&Math.abs(t.descriptor.origin?.y-.508)<1e-6&&t.descriptor.normal?.y>.99);
  assert.ok(floor);support=createTopologyReference('pocket','face',floor.persistentId,floor.descriptor);
 }finally{releaseRegeneration(first);}
 const sketch={id:'holderSketch',plane:'top',support,points:[{id:'center',x:0,y:0}],entities:[{id:'outer',type:'circle',c:'center',r:1.651},{id:'inner',type:'circle',c:'center',r:1.397}],constraints:[]};
 for(const radius of [1.397,1.2]){
  sketch.entities[1].r=radius;
  // Deliberately place the holder before the pocket in input order. The
  // selected face must establish the dependency, regardless of face naming.
  const holder={id:'holderTool',type:'extrude',inputs:[],params:{sketchId:sketch.id,profileEntityIds:['outer'],holeProfileEntityIds:[['inner']],axis:'y',from:.508,to:1.524,depth:1.016,support}};
  const run=await regenerateFeatures({sketches:[sketch],features:[base[0],holder,base[1],base[2],{id:'merged',type:'union',params:{},inputs:['pocket','holderTool']}]});
  try{
   assert.equal(run.ok,true,JSON.stringify(run.issues));
   const mass=await shapeMassProperties(run.finalShape);
   assert.ok(Math.abs(mass.bounds.max.y-1.524)<1e-5,JSON.stringify(mass.bounds));
   const expected=(6.858**2*1.016-6.096**2*.508)+Math.PI*(1.651**2-radius**2)*1.016;
   assert.ok(Math.abs(mass.volume-expected)<1e-5,`${mass.volume} != ${expected}`);
  }finally{releaseRegeneration(run);}
 }
});
