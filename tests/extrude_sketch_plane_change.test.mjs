import test from 'node:test';
import assert from 'node:assert/strict';
import {compileKernelFeatureTree} from '../js/core/kernel_feature_adapter.js';

test('moving a driving sketch changes extrusion axis despite its saved compiled axis',()=>{
  for(const [plane,axis] of [['front','z'],['side','x'],['top','y']]){
    const document={sketches:[{id:'s',plane,points:[],entities:[],constraints:[]}],parts:[],
      features:[{id:'boss',type:'extrude',params:{axis:'y',depth:.1524,sketchId:'s'},references:{sketches:['s']},inputs:[]}],
      history:[{id:'h1',kind:'sketch',targetId:'s'},{id:'h2',kind:'feature',targetId:'boss'}]};
    const run=compileKernelFeatureTree(document);
    assert.equal(run.features.find(feature=>feature.id==='boss').params.axis,axis);
    assert.equal(run.features.find(feature=>feature.id==='boss').params.to,.1524);
    assert.equal(document.features[0].params.axis,'y','compilation does not mutate the saved definition');
  }
});
