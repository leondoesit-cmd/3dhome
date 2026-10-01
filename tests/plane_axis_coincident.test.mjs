import test from 'node:test';
import assert from 'node:assert/strict';
import {solveTopologyMates,topologyReference,mateFramesSupport} from '../js/cad_mates.js';
import {createFrameResolver,mateResidualVector,worldFrame} from '../js/cad_mate_model.js';
import {exactMateReferenceChoices} from '../js/cad_mate_reference_choices.js';
const point=(x=0,y=0,z=0)=>({x,y,z});
const plane={surface:'plane',origin:point(),normal:point(0,1,0)};
const face={kind:'face',ownerFeatureId:'hole',persistentId:'hole:face:side:bore',semantic:'side:bore',descriptor:{surface:'cylinder',origin:point(0,2,0),axis:point(1,0,0),radius:.5}};
function fixture(reverse=false){
 const axis=exactMateReferenceChoices([face]).find(choice=>choice.entry.kind==='axis').entry;
 const a={id:'fixed',grounded:true,topology:[reverse?face:{kind:'face',persistentId:'plane',descriptor:plane}],transform:point()};
 const b={id:'moving',topology:[reverse?{kind:'face',persistentId:'plane',descriptor:plane}:face],transform:{...point(3,5,4),rz:40,rx:20}};
 const ref=(c,entry)=>topologyReference(c.id,entry.kind,entry.persistentId,entry.descriptor);
 return {components:[a,b],topologyMates:[{id:'seat-axis',type:'coincident',a:ref(a,reverse?axis:{kind:'face',persistentId:'plane',descriptor:plane}),b:ref(b,reverse?{kind:'face',persistentId:'plane',descriptor:plane}:axis)}]};
}
test('native cylinder-derived axis lies in a plane with exactly two independent constraints, in either holder order',()=>{
 for(const reversed of [false,true]){
  const assembly=fixture(reversed),report=solveTopologyMates(assembly);
  assert.deepEqual(report.issues,[]);assert.deepEqual(report.unsatisfied,[]);
  assert.equal(report.clusters[0].degreesOfFreedom,4);
  const resolve=createFrameResolver({issues:[],rebindings:[]}),mate=assembly.topologyMates[0];
  const rows=mateResidualVector(mate,resolve(mate.a,assembly.components[0],mate.id),resolve(mate.b,assembly.components[1],mate.id),assembly.components[1]);
  assert.equal(rows.length,2);assert.ok(Math.hypot(...rows)<1e-7);
  const reopened=JSON.parse(JSON.stringify(assembly)),cold=solveTopologyMates(reopened);
  assert.deepEqual(cold.unsatisfied,[]);assert.equal(cold.clusters[0].degreesOfFreedom,4);
 }
});
test('saved exact axis dynamically follows its native cylinder and rejects unavailable topology',()=>{
 const assembly=fixture(),mate=assembly.topologyMates[0],moving=assembly.components[1];
 const reopened=JSON.parse(JSON.stringify(assembly));
 reopened.components[1].topology[0].descriptor.origin.y=6;
 const resolve=createFrameResolver({issues:[],rebindings:[]});
 const actual=resolve(reopened.topologyMates[0].b,reopened.components[1],'axis',true);
 assert.deepEqual(actual.origin,worldFrame({...face.descriptor,origin:point(0,6,0)},reopened.components[1],'component').origin);
 const sink={issues:[],rebindings:[]};moving.topology=[];
 assert.equal(createFrameResolver(sink)(mate.b,moving,'axis',true),null);
 assert.equal(sink.issues[0].code,'missing-topology');
});
test('coincident rejects two axes and raw cylindrical faces; existing two-plane Coincident retains three constraints',()=>{
 const axis={surface:'axis',origin:point(),axis:point(1,0,0)};
 assert.equal(mateFramesSupport('coincident',axis,axis),false);
 assert.equal(mateFramesSupport('coincident',plane,face.descriptor),false);
 assert.equal(mateFramesSupport('coincident',plane,axis),true);
 const assembly={components:[{id:'a',grounded:true,transform:point()},{id:'b',transform:point(1,4,2)}],topologyMates:[{id:'p',type:'coincident',aligned:true,a:topologyReference('a','face','a',plane),b:topologyReference('b','face','b',plane)}]};
 const result=solveTopologyMates(assembly);assert.deepEqual(result.unsatisfied,[]);assert.equal(result.clusters[0].degreesOfFreedom,3);
});
