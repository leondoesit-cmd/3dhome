import test from 'node:test';
import assert from 'node:assert/strict';
import {createExactSaveCache} from '../js/core/exact_save_cache.js';

function fixture(){
  const document={parts:[{id:'body',density:7.85,color:'#aaa'}],sketches:[{id:'profile',plane:'top',points:[{id:'p',x:1,y:2}],entities:[],constraints:[]}],references:[{id:'plane:top',type:'plane',normal:{x:0,y:1,z:0}}],parameters:{depth:{value:2}}};
  const features=[{id:'solid',type:'extrude',params:{sketchId:'profile',depth:2},references:{sketches:['profile'],references:['plane:top']},inputs:[]}];
  const compiled={ok:true,document,features};
  const body={verifiedSerializedExact:true,workerMeshData:{positions:new Float32Array([0,0,0,1,0,0,0,1,0])},topology:[{persistentId:'solid:face:1',kind:'face'}]};
  return {document,compiled,run:{ok:true,issues:[],results:new Map([['solid',body]]),topologyBindings:[]}};
}

test('material-only repeated save reuses isolated exact mesh and topology byte-for-byte',()=>{
  const {document,compiled,run}=fixture(),cache=createExactSaveCache();
  assert.equal(cache.put(document,compiled,run),true);
  const expected=structuredClone(run);
  document.parts[0].density=2.7;document.parts[0].materialName='Aluminum';document.parts[0].color='#ddd';
  document.name='Renamed';document.description='Updated properties';document.appearances=[{kind:'body',material:'aluminum'}];
  assert.deepEqual(cache.get(document,compiled),expected);
  run.results.get('solid').workerMeshData.positions[0]=123;
  const read=cache.get(document,compiled);
  assert.deepEqual(read,expected,'background publication cannot mutate the saved proof');
  read.results.get('solid').topology[0].persistentId='changed';
  assert.deepEqual(cache.get(document,compiled),expected,'a save receives its own copy');
  assert.equal(cache.get({...document},compiled),null,'another document cannot borrow this proof');
});

for(const change of [
  c=>c.features[0].params.depth=3,
  c=>c.document.sketches[0].points[0].x+=1e-8,
  c=>c.document.references[0].normal.x=.1,
  c=>c.document.parameters.depth.value=3,
  c=>c.features[0].suppressed=true,
  c=>c.features[0].params.sourcePayload={bytes:[1,2,3]},
  c=>c.document.localFrame={origin:{x:1,y:0,z:0}},
])test('changed native input cannot reuse a previous save proof: '+change.toString(),()=>{
  const {document,compiled,run}=fixture(),cache=createExactSaveCache();cache.put(document,compiled,run);
  change(compiled);
  assert.equal(cache.get(document,compiled),null);
});

test('failed, approximate, unverified and native-handle runs cannot enter the save cache',()=>{
  for(const change of [r=>r.ok=false,r=>r.results.get('solid').invalid=true,r=>r.results.get('solid').approximate=true,r=>r.results.get('solid').verifiedSerializedExact=false,r=>r.results.get('solid').shape={}]){
    const {document,compiled,run}=fixture(),cache=createExactSaveCache();change(run);
    assert.equal(cache.put(document,compiled,run),false);
    assert.equal(cache.get(document,compiled),null);
  }
});
