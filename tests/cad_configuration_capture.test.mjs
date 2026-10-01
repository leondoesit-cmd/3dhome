import test from 'node:test';
import assert from 'node:assert/strict';
import {ensureConfigurations,captureConfiguration,setActiveConfiguration,updateConfiguration} from '../js/cad_configurations.js';

test('named configurations restore driving dimensions, pattern settings and engineering properties after serialization',()=>{
  const document={
    sketches:[{id:'profile',points:[{id:'p',x:10,y:0}],entities:[],constraints:[{id:'length',type:'distance',name:'Length',value:10}]}],
    features:[{id:'holes',type:'pattern',params:{count:3,spacing:2},suppressed:false}],
    history:[{kind:'feature',targetId:'holes'}],
    parts:[{id:'body',density:7.85,materialName:'Steel',meshData:{stale:true}}],
    customProperties:{PartNumber:'BAR-3'},
  };
  ensureConfigurations(document);
  const first=document.activeConfiguration;
  document.sketches[0].points[0].x=14;
  document.sketches[0].constraints[0].value=14;
  document.features[0].params.count=5;
  document.parts[0].density=2.7;
  document.parts[0].materialName='Aluminum';
  document.customProperties.PartNumber='BAR-5';
  const five=captureConfiguration(document,{name:'5 HOLES'});
  const reopened=JSON.parse(JSON.stringify(document));
  setActiveConfiguration(reopened,first);
  assert.equal(reopened.sketches[0].constraints[0].value,10);
  assert.equal(reopened.features[0].params.count,3);
  assert.equal(reopened.parts[0].density,7.85);
  assert.equal(reopened.customProperties.PartNumber,'BAR-3');
  assert.equal(reopened.parts[0].meshData,undefined,'the previous configuration mesh cannot be displayed as current geometry');
  setActiveConfiguration(reopened,five.id);
  assert.equal(reopened.sketches[0].points[0].x,14);
  assert.equal(reopened.features[0].params.count,5);
  assert.equal(reopened.parts[0].materialName,'Aluminum');
  assert.equal(reopened.customProperties.PartNumber,'BAR-5');
  reopened.features[0].params.count=7;
  assert.equal(reopened.configurations[1].modelValues.featureParameters[0].params.count,5,'live edits do not mutate the saved configuration');
  updateConfiguration(reopened,five.id,{name:'7 HOLES',capture:true});
  setActiveConfiguration(reopened,first);
  setActiveConfiguration(reopened,five.id);
  assert.equal(reopened.features[0].params.count,7);
  assert.throws(()=>updateConfiguration(reopened,five.id,{name:'Default'}),/unique/);
  assert.throws(()=>captureConfiguration(reopened,{name:'Default'}),/unique/);
});

test('legacy override-only configurations still switch without deleting authored geometry',()=>{
  const document={sketches:[{id:'sk',points:[]}],features:[],configurations:[{id:'a',name:'A',parameterOverrides:{Height:12}}]};
  setActiveConfiguration(document,'a');
  assert.equal(document.parameterOverrides.Height,12);
  assert.equal(document.sketches[0].id,'sk');
});
