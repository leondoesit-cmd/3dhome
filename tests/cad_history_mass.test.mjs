import test from 'node:test';
import assert from 'node:assert/strict';
import {regenerateFeatures,releaseRegeneration} from '../js/cad_feature_tree.js';
import {evaluateMassProperties} from '../js/cad_mass_properties.js';
import {createTopologyReference} from '../js/core/topology.js';

test('full-round history retains the three faces and mass measures that history result',async()=>{
 const base={id:'wall',name:'Wall',type:'box',params:{w:2,h:5,d:10},inputs:[]};
 const source=await regenerateFeatures({features:[structuredClone(base)]});let refs;
 try{
  assert.equal(source.ok,true);
  const topology=source.results.get('wall').topology;
  const face=(axis,value)=>topology.find(t=>t.kind==='face'&&Math.abs(t.descriptor.normal[axis]-value)<1e-8);
  refs=[face('x',-1),face('y',1),face('x',1)].map(t=>createTopologyReference('wall','face',t.persistentId,t.descriptor));
 }finally{releaseRegeneration(source);}
 const round={id:'round',type:'fillet',name:'Full round',inputs:['wall'],references:refs,params:{fullRound:true,radius:99}};
 const run=await regenerateFeatures({features:[base,round]});let released=0;
 try{
  assert.equal(run.ok,true,JSON.stringify(run.issues));
  const mass=await evaluateMassProperties({parts:[{id:'wall',exactOperations:[{type:'fillet'}]}]},{buildSolid:async()=>run.results.get('round'),releaseSolid:()=>released++});
  assert.equal(mass.accuracy,'exact');assert.equal(mass.unmeasured,0);
  assert.ok(Math.abs(mass.volumeCm3-(80+5*Math.PI))<1e-6);
  assert.equal(released,1);
 }finally{releaseRegeneration(run);}
});
