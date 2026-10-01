import test from 'node:test';
import assert from 'node:assert/strict';
import {solveTopologyMates,topologyReference,mateFramesSupport} from '../js/cad_mates.js';
import {createFrameResolver,mateResidualVector} from '../js/cad_mate_model.js';
import {exactMateReferenceChoices} from '../js/cad_mate_reference_choices.js';
import {descriptorToParent} from '../js/core/assembly_structure.js';
const p=(x=0,y=0,z=0)=>({x,y,z});
const plane={kind:'face',persistentId:'face',descriptor:{surface:'plane',origin:p(),normal:p(0,1,0)}};
const edge={kind:'edge',ownerFeatureId:'loft',persistentId:'loft:edge:top',descriptor:{curve:'line',origin:p(0,2,0),endpoints:[p(0,2,0),p(1,2,0)]}};
const vertex=()=>exactMateReferenceChoices([edge]).find(choice=>choice.entry.kind==='vertex').entry;
function fixture(reverse){
 const v=vertex(),a={id:'a',grounded:true,transform:p(),topology:[structuredClone(reverse?edge:plane)]},b={id:'b',transform:{...p(1,4,3),rx:24,rz:16},topology:[structuredClone(reverse?plane:edge)]};
 const ref=(c,e)=>topologyReference(c.id,e.kind,e.persistentId,e.descriptor);
 return {components:[a,b],topologyMates:[{id:'gap',type:'distance',value:.254,aligned:true,a:ref(a,reverse?v:plane),b:ref(b,reverse?plane:v)}]};
}
test('point-plane signed Distance preserves five freedoms in both holder orders and cold round trips',()=>{
 for(const reverse of [false,true]){
  let assembly=fixture(reverse);
  for(let n=0;n<3;n++){
   const result=solveTopologyMates(assembly);
   assert.deepEqual(result.issues,[]);assert.deepEqual(result.unsatisfied,[]);
   assert.equal(result.clusters[0].degreesOfFreedom,5);
   const m=assembly.topologyMates[0],resolve=createFrameResolver({issues:[],rebindings:[]});
   const rows=mateResidualVector(m,resolve(m.a,assembly.components[0]),resolve(m.b,assembly.components[1]),assembly.components[1]);
   assert.equal(rows.length,1);assert.ok(Math.abs(rows[0])<1e-7);
   assembly=JSON.parse(JSON.stringify(assembly));
  }
 }
});
test('native vertex follows current edge endpoint, transforms nested endpoints and never uses missing captured geometry',()=>{
 const a=fixture(false),m=a.topologyMates[0],b=a.components[1];
 b.topology[0].descriptor=structuredClone(edge.descriptor);b.topology[0].descriptor.endpoints[0].y=7;
 b.transform=p();
 assert.equal(createFrameResolver({issues:[],rebindings:[]})(m.b,b).origin.y,7);
 const nested=descriptorToParent(edge.descriptor,{transform:{...p(2,3,4),rz:90}});
 assert.ok(Math.abs(nested.endpoints[0].x)<1e-9);assert.ok(Math.abs(nested.endpoints[0].y-3)<1e-9);
 b.topology=[];const sink={issues:[],rebindings:[]};
 assert.equal(createFrameResolver(sink)(m.b,b,'gap',true),null);assert.equal(sink.issues[0].code,'missing-topology');
});
test('Distance rejects point-point and preserves existing plane-plane orientation constraints',()=>{
 assert.equal(mateFramesSupport('distance',vertex().descriptor,vertex().descriptor),false);
 const assembly={components:[{id:'a',grounded:true,transform:p()},{id:'b',transform:p(1,3,2)}],topologyMates:[{id:'gap',type:'distance',value:.254,aligned:true,a:topologyReference('a','face','a',plane.descriptor),b:topologyReference('b','face','b',plane.descriptor)}]};
 const result=solveTopologyMates(assembly);assert.deepEqual(result.unsatisfied,[]);assert.equal(result.clusters[0].degreesOfFreedom,3);
});
