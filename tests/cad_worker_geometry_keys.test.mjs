import test from 'node:test';
import assert from 'node:assert/strict';
import {cadWorkerGeometryKeys} from '../js/core/cad_worker_runtime.js';
import {stableStringify} from '../js/core/dependency_graph.js';

test('worker Shell cache tolerates saved attached-frame roundoff but tracks driving edits',()=>{
 const document={sketches:[{id:'stock',points:[{id:1,x:2,y:3}],frame:{origin:{x:0,y:-.5416630433329717,z:-3.302}}}],features:[
  {id:'boss',type:'extrude',params:{sketchId:'stock',profileEntityIds:[1],depth:11.176,frame:{origin:{x:0,y:-.5416630433329717,z:-3.302}}}},
  {id:'shell',type:'shell',inputs:['boss'],params:{thickness:.254}}
 ]};
 const key=d=>cadWorkerGeometryKeys(d,d.features).get('shell'),before=key(document),copy=structuredClone(document);
 for(const frame of [copy.sketches[0].frame,copy.features[0].params.frame]){frame.origin.x=1.3147309878134104e-14;frame.origin.y=-.5416630433329669;}
 assert.equal(key(copy),before,'actual HOUSING saved/resolved frame values');
 copy.features[0].params.frame.origin.y+=1e-8;assert.notEqual(key(copy),before,'material frame change');
 copy.features[0].params.frame=structuredClone(document.features[0].params.frame);
 copy.features[0].params.depth+=5e-13;assert.notEqual(key(copy),before,'nonzero driving depth is not rounded');
 copy.features[0].params.depth=document.features[0].params.depth;
 copy.sketches[0].points[0].x+=5e-13;assert.notEqual(key(copy),before,'nonzero profile point is not rounded');
});

test('Shell cache ignores overwritten loft display snapshots but follows source geometry',()=>{
  const document={sketches:[{id:'front',points:[{id:1,x:0,y:0}],frame:{origin:{z:0}}},{id:'back',points:[{id:2,x:1,y:1}],frame:{origin:{z:-3}}}],features:[
    {id:'loft',type:'loft',params:{sections:[[{z:0}],[{z:-3}]],sectionSegments:[],sketchSources:{kind:'loft',sections:[{sketchId:'front',entityIds:[1]},{sketchId:'back',entityIds:[2]}]}}},
    {id:'shell',type:'shell',inputs:['loft'],params:{thickness:.1}}
  ]};
  const key=d=>cadWorkerGeometryKeys(d,d.features).get('shell'),original=key(document),copy=structuredClone(document);
  copy.features[0].params.sections=[[{z:3}],[{z:6}]];copy.features[0].params.sectionSegments=[{stale:true}];
  assert.equal(key(copy),original,'live display snapshots are overwritten by driving sketches');
  copy.sketches[1].points[0].x=2;assert.notEqual(key(copy),original,'actual source geometry invalidates');
  copy.sketches[1].points[0].x=1;copy.sketches[1].frame.origin.z=-4;assert.notEqual(key(copy),original,'source support frame invalidates');
  copy.sketches[1].frame.origin.z=-3;copy.features[1].params.thickness=.2;assert.notEqual(key(copy),original,'Shell parameters invalidate');
});

test('appending or selecting an unrelated active sketch retains named extrusion and Shell prefixes',()=>{
  const source={id:'stock',points:[{id:1,x:0,y:0}],entities:[]};
  const document={sketches:[source],sketch:source,features:[
    {id:'boss',type:'extrude',params:{sketchId:'stock',profileEntityIds:[1]}},
    {id:'shell',type:'shell',inputs:['boss'],params:{thickness:.1}}
  ]};
  const keys=d=>cadWorkerGeometryKeys(d,d.features),before=keys(document);
  const edited=structuredClone(document);
  edited.sketch={id:'thread-profile',points:[{id:2,x:5,y:7}],entities:[]};edited.sketches.push(edited.sketch);
  for(const id of ['boss','shell'])assert.equal(keys(edited).get(id),before.get(id));
  edited.sketches[0].points[0].x=1;
  for(const id of ['boss','shell'])assert.notEqual(keys(edited).get(id),before.get(id));
});

test('legacy active and first-sketch fallback geometry remain native cache dependencies',()=>{
  for(const hasActive of [true,false]){
    const source={id:'legacy',points:[{id:1,x:0,y:0}],entities:[]};
    const document={sketches:[source],features:[{id:'boss',type:'extrude',params:{profileEntityIds:[1]}}]};
    if(hasActive)document.sketch=source;
    const key=d=>cadWorkerGeometryKeys(d,d.features).get('boss'),before=key(document);
    const edited=structuredClone(document);
    if(hasActive)edited.sketch.points[0].x=3;else edited.sketches[0].points[0].x=3;
    assert.notEqual(key(edited),before);
  }
});

test('assembled cache prefixes equal full canonical serialization of every reachable input',()=>{
  const stock={id:'stock',points:[{id:1,x:.12345678912345678,y:0}],support:{reference:'support'},frame:{origin:{x:0,y:0,z:2}}};
  const unused={id:'unused',points:[{id:2,x:99,y:99}]};
  const document={sketches:[unused,stock],references:[{id:'support',offset:2}],referenceGeometry:[{id:'guide',ownerFeatureId:'boss',points:[{x:1,y:2,z:3}]}],
    localFrame:{origin:{x:0,y:0,z:0}},attachments:{support:'support'},parameters:{depth:{value:3}},variables:{wall:.1},features:[
      {id:'boss',type:'extrude',params:{sketchId:'stock',profileEntityIds:[1],depth:3}},
      {id:'shell',type:'shell',inputs:['boss'],params:{thickness:.1}},
    ]};
  const options={parameterOverrides:{depth:4}};
  const keys=cadWorkerGeometryKeys(document,document.features,options);
  for(const [index,feature] of document.features.entries()) {
    const features=document.features.slice(0,index+1).map(({id,type,params,inputs,references,suppressed})=>({id,type,params,inputs,references,suppressed}));
    const expected=stableStringify({features,sketches:[stock],references:document.references,referenceGeometry:document.referenceGeometry,
      localFrame:document.localFrame,attachments:document.attachments,parameters:document.parameters,variables:document.variables,parameterOverrides:options.parameterOverrides});
    assert.equal(keys.get(feature.id),expected);
  }
  const before=keys.get('shell');
  for(const mutate of [d=>d.attachments.support='other',d=>d.parameters.depth.value=5,d=>d.variables.wall=.2,
    d=>d.references[0].offset=3,d=>d.referenceGeometry[0].points[0].x=2,d=>d.localFrame.origin.z=1,
    d=>d.features[0].suppressed=true,d=>d.features[1].inputs=[],d=>d.sketches[1].points[0].x+=5e-13]) {
    const changed=structuredClone(document);mutate(changed);
    assert.notEqual(cadWorkerGeometryKeys(changed,changed.features,options).get('shell'),before);
  }
  document.sketches[0].points[0].x=100;
  assert.equal(cadWorkerGeometryKeys(document,document.features,options).get('shell'),before,'unreachable geometry cannot expire a body');
});

test('prefix construction serializes each feature payload once without changing key order',()=>{
  let visits=0;
  const features=Array.from({length:80},(_,index)=>({id:'feature-'+index,type:'box',params:{geometry:{toJSON(){visits++;return {w:index+1,h:2,d:3};}}}}));
  const keys=cadWorkerGeometryKeys({},features);
  assert.equal(visits,features.length);
  const final=JSON.parse(keys.get('feature-79'));
  assert.equal(final.features.length,80);assert.equal(final.features[79].params.geometry.w,80);
});

test('native operation revisions invalidate changed algorithms only from their feature onward',()=>{
 const features=[{id:'shell',type:'shell',params:{}},{id:'blend',type:'fillet',inputs:['shell'],params:{radius:.6}},{id:'web',type:'rib',inputs:['blend'],params:{draftAngle:1}}];
 const keys=cadWorkerGeometryKeys({},features);
 assert.equal(keys.get('shell').includes('kernelRevision'),false);
 assert.ok(keys.get('blend').includes('supported-corner-repair-3'));
 assert.ok(keys.get('web').includes('supported-corner-repair-3'));
 assert.ok(keys.get('web').includes('parallel-draft-1'));
});

test('canonical union transport preserves serialized union keys but invalidates changed downstream corner fillings',()=>{
 const features=[{id:'base',type:'box',params:{w:2}},{id:'joined',type:'union',inputs:['base','base'],params:{}},{id:'blend',type:'fillet',inputs:['joined'],params:{radius:.1}}];
 const keys=cadWorkerGeometryKeys({},features);
 assert.equal(keys.get('base').includes('kernelRevision'),false);
 assert.equal(keys.get('joined').includes('kernelRevision'),false,'existing serialized unions already have the canonical representation');
 assert.ok(keys.get('blend').includes('supported-corner-repair-3'),'only the changed consumer result must expire');
 assert.equal(keys.get('blend').includes('supported-corner-repair-2'),false);
});

test('helical cutter revision expires its worker prefix while retaining the original additive sweep',()=>{
 const features=[{id:'hook',type:'sweep',params:{operation:'add',helixId:''}},{id:'cutter',type:'sweep',params:{operation:'subtract',helixId:'path'},inputs:[]},{id:'cut',type:'subtract',params:{},inputs:['hook','cutter']}];
 const keys=cadWorkerGeometryKeys({},features);assert.equal(keys.get('hook').includes('contained-helical-sweep-cut-1'),false);
 assert.ok(keys.get('cutter').includes('contained-helical-sweep-cut-1'));assert.ok(keys.get('cut').includes('contained-helical-sweep-cut-1'));
 const ordinary=cadWorkerGeometryKeys({},[{id:'cutter',type:'sweep',params:{operation:'subtract'}}]);assert.equal(ordinary.get('cutter').includes('contained-helical-sweep-cut-1'),false);
});
