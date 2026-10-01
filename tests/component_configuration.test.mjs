import test from 'node:test';
import assert from 'node:assert/strict';
import {replaceComponentDefinition,setComponentConfiguration} from '../js/core/component_configuration.js';
import {ensureConfigurations,captureConfiguration} from '../js/cad_configurations.js';

test('assembly occurrences independently select named configurations from one saved part',()=>{
  const part={key:'bar',parts:[{id:'body',density:2.7}],sketches:[],features:[{id:'pattern',params:{count:3}}]};
  ensureConfigurations(part);
  const three=part.activeConfiguration;
  part.features[0].params.count=7;
  const seven=captureConfiguration(part,{name:'7HOLES'}).id;
  const a={id:'a',modelKey:'old',transform:{x:10},grounded:true},b={id:'b',transform:{x:20}};
  replaceComponentDefinition(a,part);replaceComponentDefinition(b,part);
  setComponentConfiguration(a,three);setComponentConfiguration(b,seven);
  assert.equal(a.def.features[0].params.count,3);
  assert.equal(b.def.features[0].params.count,7);
  assert.equal(part.features[0].params.count,7,'the saved library definition is not edited');
  assert.equal(a.transform.x,10);assert.equal(a.grounded,true);assert.equal(a.id,'a');
  assert.equal(a.modelKey,'bar');assert.equal(a.configurationId,three);
  assert.throws(()=>setComponentConfiguration(a,'missing'),/does not exist/);
});
