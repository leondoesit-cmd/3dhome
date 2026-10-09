import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sourceFunctionText} from './helpers/source_function.mjs';
import {holeSupportChoices,holeSupportChoiceReference} from '../js/core/hole_support_choices.js';
import {reattachFeatureSketchSupport,sketchSupportNeedsUpdate} from '../js/core/sketch_support_edit.js';
import {verifiedExactTopology} from '../js/core/exact_topology_cache.js';
import {compileKernelFeatureTree} from '../js/core/kernel_feature_adapter.js';
import {regenerateFeatures,releaseRegeneration} from '../js/cad_feature_tree.js';
import {faceFrameOrigin,frameFromPlane} from '../js/core/frame.js';

const fixture=()=>JSON.parse(readFileSync(new URL('../artifacts/planchard/FLAT-PLATE-hidden-axis-centrelines-browser-2026-10-09.mforge',import.meta.url),'utf8')).mainModel;
const baseId='feature_mulxmsdx_3',unionId='feature_mulxs4ua_4',holeId='feature_mulxu7df_5',faceId=baseId+':face:side:1277';
function choices(doc){const compiled=compileKernelFeatureTree(doc);assert.ok(compiled.ok);return holeSupportChoices(doc.features.slice(0,2),verifiedExactTopology(doc,compiled.features),doc.sketches[2].support,unionId,'in');}
function attachment(entry){return {support:holeSupportChoiceReference({key:'stage',entry}),plane:'top',offset:0,frame:frameFromPlane(faceFrameOrigin(entry.descriptor,'bounds-center'),entry.descriptor.normal),frameAnchor:'bounds-center'};}

test('verified Hole stage picker distinguishes the same face ID at upstream and trimmed union stages',()=>{
 const doc=fixture(),before=JSON.stringify(doc),list=choices(doc);
 const base=list.find(choice=>choice.entry.ownerFeatureId===baseId&&choice.entry.persistentId===faceId);
 const union=list.find(choice=>choice.key!=='current'&&choice.entry.ownerFeatureId===unionId&&choice.entry.persistentId===faceId);
 assert.ok(base&&union);assert.notEqual(base.key,union.key);
 assert.match(base.label,/Upstream stage · BasePlate/);assert.match(union.label,/Latest input stage · Upright/);
 assert.equal(list[0].key,'current');assert.deepEqual(list[0].entry,doc.sketches[2].support);
 assert.ok(Math.abs(faceFrameOrigin(base.entry.descriptor,'bounds-center').x-5.08)<1e-8);
 assert.ok(Math.abs(faceFrameOrigin(union.entry.descriptor,'bounds-center').x-6.604)<1e-8);
 assert.ok(list.every(choice=>choice.entry.ownerFeatureId!==holeId));assert.equal(JSON.stringify(doc),before);
 assert.ok(sketchSupportNeedsUpdate({...doc.sketches[2],frame:attachment(base.entry).frame},attachment(base.entry)),'owner-only change cannot be swallowed');
});

test('unverified or suppressed earlier stages are never offered and current binding remains available',()=>{
 const doc=fixture();doc.features[0].params.depth=6.35;
 assert.deepEqual(choices(doc).map(choice=>choice.key),['current']);
 const stage={id:'suppressed',suppressed:true};assert.equal(holeSupportChoices([stage],new Map([['suppressed',[{kind:'face',persistentId:'f',descriptor:{surface:'plane',normal:{x:0,y:1,z:0}}}]]]),null,'suppressed').length,0);
});

test('actual Hole edit picker and Update handler keep stage-qualified selection and current binding',()=>{
 const source=readFileSync(new URL('../js/modeler.js',import.meta.url),'utf8'),editorAt=source.indexOf('function openFeatureEditor(');
 const start=source.indexOf('  if(supportSketch){',editorAt),end=source.indexOf('  var pendingFrame=',start),block=source.slice(start,end);
 const node=()=>({children:[],appendChild(child){this.children.push(child);},setAttribute(key,value){this[key]=value;}});
 const host=node(),doc=fixture(),feature=doc.features[2],env={E:{def:doc},feature,supportSketch:doc.sketches[2],host,
  dependencyReferenceId:value=>value,compileKernelFeatureTree,verifiedExactTopology,holeSupportChoices,modelLengthUnit:()=> 'in',
  el:(tag,cls,text)=>({...node(),tag,cls,text}),document:{createElement:()=>node()},t:key=>key};
 const result=new Function(...Object.keys(env),'var supportSelect=null,supportChoices=[];'+block+'return {supportSelect,supportChoices};')(...Object.values(env));
 assert.equal(result.supportSelect.value,'current');
 assert.ok(host.children.some(child=>/preserves local point coordinates/.test(child.text || '')));
 const base=result.supportChoices.find(choice=>choice.entry.ownerFeatureId===baseId&&choice.entry.persistentId===faceId);
 result.supportSelect.value=base.key;
 const updateStart=source.indexOf('      var chosenSupport=',end),updateEnd=source.indexOf('      var supportChanged=',updateStart);
 const exactAttachment=new Function('E','cloneData','faceFrameOrigin','frameFromPlane','isCanonicalAuthoring',sourceFunctionText(source,'faceSketchAttachment')+';return faceSketchAttachment;')
  ({brepRun:{results:new Map()},def:doc},structuredClone,faceFrameOrigin,frameFromPlane,()=>{throw new Error('Exact stage pick must bypass viewport/global support lookup');});
 const readSelected=new Function('supportSelect','supportChoices','holeSupportChoiceReference','faceSketchAttachment',source.slice(updateStart,updateEnd)+'return attachment;');
 const selected=readSelected(result.supportSelect,result.supportChoices,holeSupportChoiceReference,exactAttachment);
 assert.equal(selected.support.ownerFeatureId,baseId);assert.equal(selected.support.stageFeatureId,baseId);
 assert.equal(selected.support.persistentId,faceId);
 assert.ok(Math.abs(selected.frame.origin.x-5.08)<1e-8,'actual exact attachment uses BasePlate X2in, not trimmed union X2.6in');
 result.supportSelect.value='current';
 assert.deepEqual(holeSupportChoiceReference(result.supportChoices[0]),doc.sketches[2].support);
 const current=readSelected(result.supportSelect,result.supportChoices,holeSupportChoiceReference,exactAttachment);
 assert.equal(current.support.stageFeatureId,undefined);
 assert.deepEqual(current.support,doc.sketches[2].support);
 assert.ok(Math.abs(current.frame.origin.x-6.604)<1e-8);
});

async function boreOrigin(doc){
 const compiled=compileKernelFeatureTree(doc);assert.ok(compiled.ok,JSON.stringify(compiled.issues));
 const run=await regenerateFeatures({...compiled.document,features:compiled.features});
 try{assert.ok(run.ok,JSON.stringify(run.issues));return run.results.get(holeId+':tool:bore').topology.find(entry=>entry.descriptor.surface==='cylinder').descriptor.referenceOrigin;}
 finally{releaseRegeneration(run);}
}

test('explicit upstream face plus local .4in keeps native hole X2.4 and follows half base depth through cold edits',async()=>{
 const doc=fixture(),initial=structuredClone(doc),entry=choices(doc).find(choice=>choice.entry.ownerFeatureId===baseId&&choice.entry.persistentId===faceId).entry;
 const feature=doc.features.find(item=>item.id===holeId),changed=reattachFeatureSketchSupport(doc,feature,attachment(entry),'unused');
 assert.equal(changed.forked,false);assert.equal(changed.sketch.points[0].x,initial.sketches[2].points[0].x,'reattachment preserves local coordinates');
 changed.sketch.points[0].x=1.016;changed.sketch.constraints[0].x=1.016;
 assert.equal(feature.references.topology[0].ownerFeatureId,baseId);assert.equal(feature.inputs[0],unionId,'hole still cuts the latest union body');
 const cold=JSON.parse(JSON.stringify(doc));
 for(const [depth,z] of [[5.08,2.54],[6.35,3.175],[5.08,2.54]]){
  cold.features[0].params.depth=depth;cold.features[0].params.to=depth;
  const origin=await boreOrigin(cold);assert.ok(Math.abs(origin.x-6.096)<1e-8,JSON.stringify({depth,origin}));assert.ok(Math.abs(origin.z-z)<1e-8);
 }
 assert.deepEqual(initial,fixture(),'protected actual export is unchanged');
});

test('existing manual union-face bounds-relative hole behavior remains unchanged',async()=>{
 const doc=fixture();doc.features[0].params.depth=6.35;doc.features[0].params.to=6.35;
 const origin=await boreOrigin(doc);assert.ok(Math.abs(origin.x-4.572)<1e-8);assert.ok(Math.abs(origin.z-3.175)<1e-8);
});

test('invalid explicit stage rejects native rebuilding instead of falling back to the global trimmed face',async()=>{
 for(const stageId of ['missing-stage',unionId]){
  const doc=fixture(),choice=choices(doc).find(item=>item.entry.ownerFeatureId===baseId&&item.entry.persistentId===faceId);
  reattachFeatureSketchSupport(doc,doc.features[2],attachment(choice.entry),'unused');
  doc.sketches[2].support.stageFeatureId=stageId;doc.features[2].references.topology[0].stageFeatureId=stageId;
  const before=JSON.stringify(doc),compiled=compileKernelFeatureTree(doc);assert.ok(compiled.ok);
  const run=await regenerateFeatures({...compiled.document,features:compiled.features});
  try{assert.equal(run.ok,false);assert.ok(run.issues.some(issue=>issue.code==='missing-topology-reference'||issue.code==='regeneration-failed'));}
  finally{releaseRegeneration(run);}
  assert.equal(JSON.stringify(doc),before);
 }
});
