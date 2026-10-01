import fs from 'node:fs';import test from 'node:test';import assert from 'node:assert/strict';
import {featureReferenceValue} from '../js/modeler_feature_form.js';
test('named datum references survive Mirror and axis form reopen',()=>{
 assert.equal(featureReferenceValue({references:{references:['plane_datum55']}},'plane-reference'),'plane_datum55');
 assert.equal(featureReferenceValue({references:{references:['axis_named']}},'axis-reference'),'axis_named');
});
test('editing finish candidates come from exact input stage rather than downstream mesh',()=>{
 const source=fs.readFileSync(new URL('../js/modeler.js',import.meta.url),'utf8'),body=source.slice(source.indexOf('function allCandidateFinishEdges(part) {'),source.indexOf('/* The params object the open feature form'));
 const E={authoring:{featureEdit:{featureId:'fillet'},finishEditTopology:[{kind:'face',persistentId:'face'},{kind:'edge',persistentId:'upstream-edge'}]}};
 const read=new Function('E','dedupeFinishRefs','topologyReferenceFromEntry',body+';return allCandidateFinishEdges;')(E,a=>a,e=>e);
 assert.deepEqual(read({meshData:{topology:[{kind:'edge',persistentId:'downstream-edge'}]}}).map(e=>e.persistentId),['upstream-edge']);
});
