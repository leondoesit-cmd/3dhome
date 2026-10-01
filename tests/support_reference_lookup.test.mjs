import test from 'node:test';
import assert from 'node:assert/strict';
import {lookupSupportReference,supportReferenceResolutionRevision} from '../js/core/support_reference_lookup.js';
import {throughVertexPoint} from '../js/core/offset_planes.js';
const edge=(id,x,z)=>({ownerFeatureId:'pattern',kind:'edge',persistentId:id,semantic:id.endsWith('8')?'generated-8':'generated-9',descriptor:{curve:'line',origin:{x,y:2,z},axis:{x:0,y:0,z:1},measure:1,endpoints:[{x,y:2,z:z-.5},{x,y:2,z:z+.5}]}});
test('generated plane-support edge IDs recover the physical edge after extraction renumbers them',()=>{
 const wanted=edge('pattern:edge:generated:line:8',1,0);
 const wrong=edge(wanted.persistentId,8,0),actual=edge('pattern:edge:generated:line:9',1,0);
 assert.equal(lookupSupportReference(wanted,[wrong,actual]),actual);
});
test('an unsupported ordinal never replaces the retained through-vertex plane with an unrelated edge junction',()=>{
 const wantedA=edge('pattern:edge:generated:line:8',1,0),wantedB=edge('pattern:edge:generated:line:9',1,1);
 const entries=[edge(wantedA.persistentId,8,0),edge(wantedB.persistentId,8,1)];
 assert.equal(lookupSupportReference(wantedA,entries),null);
 const point=throughVertexPoint({throughEdges:[wantedA,wantedB],throughVertex:{descriptor:{point:{x:1,y:2,z:.5}}}},reference=>lookupSupportReference(reference,entries));
 assert.deepEqual(point,{x:1,y:2,z:.5});
});
test('stable semantic roles continue to follow deliberate upstream geometry edits',()=>{
 const reference={kind:'face',persistentId:'boss:face:end',semantic:'end',descriptor:{surface:'plane',origin:{x:0,y:1,z:0},normal:{x:0,y:1,z:0}}};
 const moved={...reference,descriptor:{...reference.descriptor,origin:{x:0,y:3,z:0}}};
 assert.equal(lookupSupportReference(reference,[moved]),moved);
});
test('only consumers of generated support-plane ancestry receive a new native cache revision',()=>{
 const doc={sketches:[{id:'rib',referenceId:'offset'},{id:'base',referenceId:'plane:front'}],references:[{id:'offset',baseReferenceId:'picked'},{id:'picked',throughEdges:[edge('pattern:edge:generated:line:8',1,0)]}]};
 assert.equal(supportReferenceResolutionRevision(doc,'rib'),'descriptor-support-1');
 assert.equal(supportReferenceResolutionRevision(doc,'base'),null);
 assert.equal(supportReferenceResolutionRevision(doc,'missing'),null);
});
