import test from 'node:test';
import assert from 'node:assert/strict';
import {compileKernelFeatureTree} from '../js/core/kernel_feature_adapter.js';
import {regenerateFeatures,releaseRegeneration} from '../js/cad_feature_tree.js';
import {shapeMassProperties,validateBrepForExport} from '../js/cad_kernel.js';

test('native cut feature mirror reflects only the cutter and preserves intervening cuts',async()=>{
  const document={sketches:[{id:'s',plane:'front',points:[],entities:[],constraints:[]}],features:[
    {id:'base',type:'box',params:{x:-2,y:-1,z:0,w:4,h:2,d:1}},
    {id:'seed',type:'extrudeCut',inputs:['base'],references:{features:['base'],sketches:['s']},params:{depth:1,points:[{u:.5,v:-.25},{u:1.5,v:-.25},{u:1.5,v:.25},{u:.5,v:.25}]}},
    {id:'later',type:'extrudeCut',inputs:['seed'],references:{features:['seed'],sketches:['s']},params:{depth:1,points:[{u:1.6,v:.5},{u:1.8,v:.5},{u:1.8,v:1},{u:1.6,v:1}]}},
    {id:'mirror',type:'mirror',inputs:['later'],references:{features:['later'],references:['plane:right']},params:{scope:'feature',seedFeatureId:'seed',planeReference:'plane:right'}},
  ]};
  const compiled=compileKernelFeatureTree(document);assert.equal(compiled.ok,true,JSON.stringify(compiled.issues));
  assert.deepEqual(compiled.features.find(feature=>feature.id==='mirror:reflection:1').inputs,['seed:tool']);
  assert.deepEqual(compiled.features.find(feature=>feature.id==='mirror').inputs,['later','mirror:reflection:1']);
  const run=await regenerateFeatures({...compiled.document,features:compiled.features});
  try{
    assert.equal(run.ok,true,JSON.stringify(run.issues));
    const result=await shapeMassProperties(run.results.get('mirror'));
    assert.ok(Math.abs(result.volume-6.9)<1e-6,`expected both holes and the later notch; volume ${result.volume}`);
    assert.ok(Math.abs(result.bounds.min.x+2)<1e-6 && Math.abs(result.bounds.max.x-2)<1e-6);
    await validateBrepForExport(run.results.get('mirror'));
  }finally{releaseRegeneration(run);}
});

test('subtractive feature mirrors reference each native seed tool, including counterbore stages',()=>{
  for(const type of ['revolveCut','sweepCut','hole']){
    const document={sketches:['s','path'].map(id=>({id,plane:'front',points:[],entities:[],constraints:[]})),features:[
      {id:'base',type:'box',params:{w:4,h:2,d:1}},
      {id:'seed',type,inputs:['base'],references:{features:['base'],sketches:type==='sweepCut'?['s','path']:['s'],references:['axis:y']},params:type==='hole'?{holeType:'counterbore',standardSize:'M6',diameter:.7,endCondition:'through-all'}:{}},
      {id:'mirror',type:'mirror',inputs:['seed'],references:{features:['seed'],references:['plane:right']},params:{scope:'feature',seedFeatureId:'seed'}},
    ]};
    const compiled=compileKernelFeatureTree(document);
    assert.equal(compiled.ok,true,JSON.stringify(compiled.issues));
    const copies=compiled.features.filter(feature=>feature.id.startsWith('mirror:reflection:'));
    assert.equal(copies.length,type==='hole'?2:1);
    for(const copy of copies){
      const tool=compiled.features.find(feature=>feature.id===copy.inputs[0]);
      assert.ok(['revolve','sweep','holeTool'].includes(tool.type));
      assert.equal(copy.params.keepOriginal,false);
    }
    assert.equal(compiled.features.find(feature=>feature.id==='mirror').type,'subtract');
  }
});

test('mixed additive and cutting seeds mirror in history order and follow upstream edits',async()=>{
  for(const width of [1,1.2]){
    const document={sketches:[{id:'s',plane:'front',points:[],entities:[],constraints:[]}],features:[
      {id:'base',type:'box',params:{x:-2,y:-1,z:0,w:4,h:2,d:1}},
      {id:'ear',type:'extrude',inputs:['base'],references:{features:['base'],sketches:['s']},params:{depth:1,points:[{u:1,v:.5},{u:1+width,v:.5},{u:1+width,v:1.5},{u:1,v:1.5}]}},
      {id:'bore',type:'extrudeCut',inputs:['ear'],references:{features:['ear'],sketches:['s']},params:{depth:1,points:[{u:1.2,v:1},{u:1.4,v:1},{u:1.4,v:1.4},{u:1.2,v:1.4}]}},
      {id:'mirror',type:'mirror',inputs:['bore'],references:{features:['bore','ear'],references:['plane:right']},params:{scope:'feature',seedFeatureIds:['bore','ear'],planeReference:'plane:right'}},
    ]};
    const compiled=compileKernelFeatureTree(document);assert.equal(compiled.ok,true,JSON.stringify(compiled.issues));
    assert.deepEqual(compiled.features.find(row=>row.id==='mirror:seed:1:delta').inputs,['ear','base']);
    const run=await regenerateFeatures({...compiled.document,features:compiled.features});
    try{
      assert.equal(run.ok,true,JSON.stringify(run.issues));
      const mass=await shapeMassProperties(run.results.get('mirror'));
      // Half of each pad overlaps the base; the mirrored holes remove .08 each.
      const added=width-.5;
      assert.ok(Math.abs(mass.volume-(8+2*added-.16))<1e-6,`width ${width}: ${mass.volume}`);
      await validateBrepForExport(run.results.get('mirror'));
    }finally{releaseRegeneration(run);}
  }
});


test('multi-feature mirror rejects an unrelated body or a missing seed',()=>{
  const document={sketches:[{id:'s',plane:'front',points:[],entities:[],constraints:[]}],features:[
    {id:'base',type:'box',params:{w:4,h:2,d:1}},
    {id:'other',type:'box',params:{w:1,h:1,d:1}},
    {id:'ear',type:'extrude',inputs:['base'],references:{features:['base'],sketches:['s']},params:{depth:1}},
    {id:'stranger',type:'extrude',inputs:['other'],references:{features:['other'],sketches:['s']},params:{depth:1}},
    {id:'mirror',type:'mirror',inputs:['ear'],references:{features:['ear'],references:['plane:right']},params:{scope:'feature',seedFeatureIds:['ear','stranger']}},
  ]};
  let result=compileKernelFeatureTree(document);assert.equal(result.ok,false);assert.match(JSON.stringify(result.issues),/current source body/);
  document.features.at(-1).params.seedFeatureIds=['ear','missing'];result=compileKernelFeatureTree(document);assert.equal(result.ok,false);assert.match(JSON.stringify(result.issues),/missing/);
});
