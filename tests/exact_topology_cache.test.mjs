import test from 'node:test';
import assert from 'node:assert/strict';
import {captureExactTopology,verifiedExactTopology,verifiedFinalTopology} from '../js/core/exact_topology_cache.js';
import {createPartDocument,createSketchDefinition,createFeatureDefinition} from '../js/core/parametric_document.js';
import {compileKernelFeatureTree} from '../js/core/kernel_feature_adapter.js';
import {createFrameResolver} from '../js/cad_mate_model.js';

test('verified topology survives appended features but expires when its inputs change',()=>{
 const document={parameters:{},sketches:[{id:'s',points:[{id:'p',x:0,y:0}],entities:[],constraints:[]}]};
 const features=[{id:'a',type:'extrude',params:{sketchId:'s',depth:10},inputs:[]}];
 const run={results:new Map([['a',{shape:{},topology:[{persistentId:'a:generated',kind:'edge'}]}]])};
 document.exactTopologyCache=captureExactTopology(document,features,run);
 assert.equal(verifiedExactTopology(document,features).size,1);
 features.push({id:'b',type:'fillet',params:{radius:1},inputs:['a']});
 assert.equal(verifiedExactTopology(document,features).size,1);
 document.sketches.push({id:'unused',points:[]});
 assert.equal(verifiedExactTopology(document,features).size,1);
 document.sketches[0].points[0].x=2;
 assert.equal(verifiedExactTopology(document,features).size,0);
 document.sketches[0].points[0].x=0;
 features[0].params.depth=20;
 assert.equal(verifiedExactTopology(document,features).size,0);
 features[0].params.depth=10;
 document.sketches[0].constraints.push({id:'driving',type:'distance',value:2});
 assert.equal(verifiedExactTopology(document,features).size,0);
});

test('assembly faces come only from verified surviving results and expire when geometry changes',()=>{
 const document={parameters:{},sketches:[]};
 const features=[{id:'sweep',type:'sweep',params:{radius:1},inputs:[]},{id:'thread',type:'thread',params:{pitch:.1},inputs:['sweep']}];
 document.exactTopologyCache=captureExactTopology(document,features,{results:new Map([
  ['sweep',{shape:{},topology:[{persistentId:'sweep:old-face',kind:'face'}]}],
  ['thread',{shape:{},topology:[{persistentId:'thread:loop-torus',kind:'face'}]}]
 ])});
 assert.deepEqual(verifiedFinalTopology(document,features).map(entry=>entry.persistentId),['thread:loop-torus']);
 features[0].params.radius=2;
 assert.deepEqual(verifiedFinalTopology(document,features),[]);
 features[0].params.radius=1;
 features[1].suppressed=true;
 assert.deepEqual(verifiedFinalTopology(document,features).map(entry=>entry.persistentId),['sweep:old-face']);
});

test('an assembly resolver uses saved exact faces before display meshes exist and refuses expired captured frames',()=>{
 const document=createPartDocument({id:'part:cached-component'});
 createSketchDefinition(document,{id:'s',referenceId:'plane:front',points:[{id:'c',x:0,y:0}],entities:[{id:'circle',type:'circle',c:'c',r:1}]});
 const feature=createFeatureDefinition(document,'extrude',{id:'boss',references:{sketches:['s'],features:[],topology:[],references:[]},params:{depth:1,profileEntityIds:['circle']}});
 const compiled=compileKernelFeatureTree(document);assert.equal(compiled.ok,true);
 const descriptor={surface:'plane',origin:{x:0,y:0,z:1},normal:{x:0,y:0,z:1}};
 document.exactTopologyCache=captureExactTopology(document,compiled.features,{results:new Map([['boss',{shape:{},topology:[{persistentId:'boss:end',kind:'face',descriptor}]}]])});
 const component={id:'component',def:document,transform:{x:0,y:0,z:0}};
 const reference={componentId:'component',persistentId:'boss:end',kind:'face',frameSpace:'component',frame:structuredClone(descriptor)};
 const sink={issues:[],rebindings:[]};
 // A display projection is irrelevant to face stamp validation. It may be
 // enormous or contain a live renderer handle that cannot be cloned.
 document.parts=[{meshData:{toJSON(){throw new Error('Viewport projection must not be cloned for mate resolution');}}}];
 assert.equal(createFrameResolver(sink)(reference,component,'mate',true).origin.z,1);
 feature.params.depth=2;
 assert.equal(createFrameResolver(sink)(reference,component,'mate',true),null);
 assert.equal(sink.issues.at(-1).code,'missing-topology');
});

test('renaming a driving dimension keeps exact loft topology available to live rebuild',()=>{
 const document={parameters:{},sketches:[{id:'section',points:[{id:'centre',x:0,y:0}],entities:[],constraints:[{id:'diameter',type:'diameter',name:'OldName',value:1.27}]}]};
 const features=[{id:'loft',type:'loft',params:{},inputs:[],references:{sketches:['section']}}];
 const run={results:new Map([['loft',{shape:{},topology:[{persistentId:'loft:top-face',kind:'face'}]}]])};
 document.exactTopologyCache=captureExactTopology(document,features,run);
 document.sketches[0].constraints[0].name='BaseWidth';
 assert.equal(verifiedExactTopology(document,features).get('loft')?.[0].persistentId,'loft:top-face');
 document.sketches[0].constraints[0].value=1.5;
 assert.equal(verifiedExactTopology(document,features).size,0);
});

test('derived loft display sections do not expire exact faces but source frames and points do',()=>{
 const document={parameters:{},sketches:[{id:'source',points:[{id:'p',x:0,y:0}],entities:[],constraints:[],frame:{origin:{x:0,y:0,z:-3.302}}}]};
 const features=[{id:'loft',type:'loft',params:{sketchSources:{kind:'loft',sections:[{sketchId:'source'}]},sections:[[{x:0,y:0,z:-3.302}]]},inputs:[]}];
 document.exactTopologyCache=captureExactTopology(document,features,{results:new Map([['loft',{shape:{},topology:[{persistentId:'loft:end',kind:'face'}]}]])});
 features[0].params.sections=[[{x:0,y:0,z:3.302}]];
 assert.equal(verifiedExactTopology(document,features).get('loft')?.[0].persistentId,'loft:end');
 document.sketches[0].frame.origin.z=-4;
 assert.equal(verifiedExactTopology(document,features).size,0);
 document.sketches[0].frame.origin.z=-3.302;
 document.sketches[0].points[0].x=1;
 assert.equal(verifiedExactTopology(document,features).size,0);
});

test('verified topology survives JSON round trip of shared frame vectors',()=>{
 const origin={x:0,y:0,z:2};
 const document={parameters:{},sketches:[{id:'s',points:[],entities:[],constraints:[],frame:{origin},support:{descriptor:{origin}}}]};
 const features=[{id:'boss',type:'extrude',params:{sketchId:'s',depth:1},inputs:[]}];
 document.exactTopologyCache=captureExactTopology(document,features,{results:new Map([['boss',{shape:{},topology:[{persistentId:'boss:end',kind:'face'}]}]])});
 const saved=JSON.parse(JSON.stringify(document));
 assert.equal(verifiedExactTopology(saved,features).size,1);
 saved.sketches[0].frame.origin.z=3;
 assert.equal(verifiedExactTopology(saved,features).size,0);
});

test('saved source-backed loft stamps normalize derived snapshots and origin round-off only',()=>{
 const document={parameters:{},sketches:[{id:'s',points:[{id:'p',x:0,y:0}],entities:[],constraints:[],frame:{origin:{x:0,y:0,z:3.302}}}]};
 const features=[{id:'loft',type:'loft',params:{sketchSources:{kind:'loft',sections:[{sketchId:'s'}]},sections:[[1]],sectionSegments:[[2]]},inputs:[]}];
 document.exactTopologyCache=captureExactTopology(document,features,{results:new Map([['loft',{shape:{},topology:[{persistentId:'loft:end',kind:'face'}]}]])});
 const old=JSON.parse(document.exactTopologyCache.loft.signature);
 old.features[0].params.sections=[[100]];old.features[0].params.sectionSegments=[[200]];
 old.sketches[0].frame.origin.x=1.7763568394002505e-15;
 document.exactTopologyCache.loft.signature=JSON.stringify(old);
 assert.equal(verifiedExactTopology(document,features).size,1);
 document.sketches[0].frame.origin.x=1e-8;
 assert.equal(verifiedExactTopology(document,features).size,0);
 document.sketches[0].frame.origin.x=0;
 document.sketches[0].points[0].x=.01;
 assert.equal(verifiedExactTopology(document,features).size,0);
 document.sketches[0].points[0].x=0;
 old.sketches[0].frame.origin='[circular]';document.exactTopologyCache.loft.signature=JSON.stringify(old);
 assert.equal(verifiedExactTopology(document,features).size,0);
});

test('nonzero attached-frame round-off preserves exact topology without masking driving edits',()=>{
 const document={parameters:{},sketches:[]};
 const features=[{id:'battery',type:'extrude',params:{depth:11.176,frame:{origin:{x:0,y:-.5416630433329717,z:-3.302},u:{x:1,y:0,z:0}}},inputs:[]}];
 document.exactTopologyCache=captureExactTopology(document,features,{results:new Map([['battery',{shape:{},topology:[{persistentId:'battery:end',kind:'face'}]}]])});
 features[0].params.frame.origin.y=-.5416630433329669;
 assert.equal(verifiedExactTopology(document,features).size,1);
 features[0].params.frame.origin.y+=1e-8;
 assert.equal(verifiedExactTopology(document,features).size,0);
 features[0].params.frame.origin.y=-.5416630433329717;
 features[0].params.depth+=5e-13;
 assert.equal(verifiedExactTopology(document,features).size,0,'driving depth remains exact in the stamp');
});

test('a requested-head capture retains verified upstream faces and drops changed prefixes',()=>{
 const document={parameters:{},sketches:[]};
 const features=[{id:'revolve',type:'revolve',params:{angle:360},inputs:[]}];
 const exact=(id)=>({shape:{},topology:[{persistentId:id+':face',kind:'face'}]});
 document.exactTopologyCache=captureExactTopology(document,features,{results:new Map([['revolve',exact('revolve')]])});
 features.push({id:'shell',type:'shell',params:{thickness:.1524},inputs:['revolve']});
 document.exactTopologyCache=captureExactTopology(document,features,{results:new Map([['shell',exact('shell')]])});
 assert.deepEqual([...verifiedExactTopology(document,features).keys()],['revolve','shell']);
 features.push({id:'fillet',type:'fillet',params:{radius:.0762},inputs:['shell']});
 assert.equal(verifiedExactTopology(document,features).size,2);
 const failed=captureExactTopology(document,features,{results:new Map([['shell',{...exact('shell'),invalid:'kernel rejected'}]])});
 assert.deepEqual(Object.keys(failed),['revolve'],'an explicit failed result replaces any prior successful stamp');
 features[0].params.angle=270;
 document.exactTopologyCache=captureExactTopology(document,features,{results:new Map([['fillet',exact('fillet')]])});
 assert.deepEqual([...verifiedExactTopology(document,features).keys()],['fillet']);
});

test('a zero attached-face offset stamp matches documents saved before supportOffset existed',()=>{
 const document={parameters:{},sketches:[{id:'s',points:[],entities:[],constraints:[]}]};
 const legacy=[{id:'a',type:'extrude',params:{sketchId:'s',depth:10},inputs:[]}];
 document.exactTopologyCache=captureExactTopology(document,legacy,{results:new Map([['a',{shape:{},topology:[{persistentId:'a:end',kind:'face'}]}]])});
 const current=[{id:'a',type:'extrude',params:{sketchId:'s',depth:10,supportOffset:0},inputs:[]}];
 assert.equal(verifiedExactTopology(document,current).size,1,'explicit zero offset is the same geometry');
 current[0].params.supportOffset=.1;
 assert.equal(verifiedExactTopology(document,current).size,0,'a real offset still expires the stamp');
});

test('old native implementation topology is rejected while unchanged upstream remains verified',()=>{
 const document={sketches:[]},features=[{id:'shell',type:'shell',params:{}},{id:'blend',type:'fillet',params:{radius:.6},inputs:['shell']}];
 const run={results:new Map(features.map(f=>[f.id,{shape:{},topology:[{persistentId:f.id+':face',kind:'face'}]}]))};
 document.exactTopologyCache=captureExactTopology(document,features,run);
 assert.equal(verifiedExactTopology(document,features).size,2);
 const legacy=JSON.parse(document.exactTopologyCache.blend.signature);legacy.features.forEach(f=>delete f.kernelRevision);
 document.exactTopologyCache.blend.signature=JSON.stringify(legacy);
 const verified=verifiedExactTopology(document,features);assert.equal(verified.has('shell'),true);assert.equal(verified.has('blend'),false);
});
