import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parse} from '../vendor/acorn/acorn.mjs';
import {refreshedExtrudeProfile} from '../js/core/feature_profile_refresh.js';
import {compileKernelFeatureTree} from '../js/core/kernel_feature_adapter.js';
import {regenerateFeatures,releaseRegeneration} from '../js/cad_feature_tree.js';
import {shapeMassProperties,validateBrepForExport} from '../js/cad_kernel.js';
import {synchronizeSketchExtrusionFrames,extrusionPreviewDirection} from '../js/core/extrusion_projection.js';
import {createHistory} from '../js/edit_history.js';
import {sourceFunctionText} from './helpers/source_function.mjs';

const source=readFileSync(new URL('../js/modeler.js',import.meta.url),'utf8');
const fixture=()=>JSON.parse(readFileSync(new URL('../artifacts/planchard/ADVANCED-Q1-rear-four-fillet-refresh-browser-2026-10-09.mforge',import.meta.url),'utf8')).mainModel;
const load=(name,ctx)=>new Function(...Object.keys(ctx),sourceFunctionText(source,name)+';return '+name+';')(...Object.values(ctx));
function callbackText(){let callback;function visit(n){if(!n||typeof n!=='object')return;if(n.type==='VariableDeclarator'&&n.id?.name==='contourRefresh')callback=n.init.arguments[1];for(const v of Object.values(n)){if(Array.isArray(v))v.forEach(visit);else if(v&&typeof v==='object')visit(v);}}visit(parse(source,{ecmaVersion:'latest',sourceType:'module'}));assert.ok(callback);return source.slice(callback.start,callback.end);}
const callback=callbackText();
function context(document){
 const E={def:document,authoring:{}},status={attributes:{},setAttribute(k,v){this.attributes[k]=v;},removeAttribute(k){delete this.attributes[k];}};
 const noop=()=>{},bindings={E,refreshedExtrudeProfile,contourStatus:status,cloneData:structuredClone,synchronizeSketchExtrusionFrames,extrusionPreviewDirection,
  transitionExtrudeProjection:()=>[],markLiveDirtyPart:noop,scheduleExactMesh:noop,closeFeaturePanel:noop,refreshAll:noop,flash:noop,t:k=>k};
 bindings.syncProjectionFromFeature=load('syncProjectionFromFeature',bindings);
 return {E,status,bindings,refresh:feature=>new Function(...Object.keys({...bindings,feature}),'return ('+callback+');')(...Object.values({...bindings,feature}))()};
}

test('actual Refresh sketch contour callback repairs the exported Q1 solid and its live associative body without rewriting downstream history',()=>{
 const d=fixture(),{E,status,bindings,refresh}=context(d),feature=d.features[0];
 const downstream=JSON.stringify(d.features.slice(1)),history=JSON.stringify(d.history),identity=JSON.stringify([feature.id,feature.inputs,feature.params.operation,feature.params.from,feature.params.to]);
 const H=createHistory({get:()=>JSON.stringify(E.def),set:v=>{E.def=JSON.parse(v);}});H.clear();H.push('Edit feature');
 refresh(feature);assert.equal(status.attributes['data-error'],undefined);assert.equal(feature.params.profileEntityIds.length,8);
 assert.equal(feature.params.profileEntityIds.filter(id=>d.sketches[0].entities.find(e=>e.id===id)?.type==='arc').length,4);
 assert.equal(JSON.stringify([feature.id,feature.inputs,feature.params.operation,feature.params.from,feature.params.to]),identity);
 assert.equal(JSON.stringify(d.features.slice(1)),downstream);assert.equal(JSON.stringify(d.history),history);
 bindings.syncProjectionFromFeature(feature);
 assert.deepEqual(d.parts[0].profileEntityIds,feature.params.profileEntityIds);
 assert.deepEqual(d.parts[0].holeProfileEntityIds,[]);
 H.undo();assert.deepEqual(E.def.features[0].params.profileEntityIds,[5656,5657,5658,5659]);assert.deepEqual(E.def.parts[0].profileEntityIds,[5656,5657,5658,5659]);
 H.redo();assert.equal(E.def.features[0].params.profileEntityIds.length,8);assert.deepEqual(E.def.parts[0].profileEntityIds,E.def.features[0].params.profileEntityIds);
});

test('Cancel restores original contour IDs in both the edited feature and its live body',()=>{
 const d=fixture(),{E,bindings,refresh}=context(d),feature=d.features[0],original=structuredClone(feature);
 E.authoring={featureEdit:{featureId:feature.id,snapshot:original},editFeatureId:feature.id};bindings.H={discard(){}};
 refresh(feature);bindings.syncProjectionFromFeature(feature);assert.equal(d.parts[0].profileEntityIds.length,8);
 load('cancelFeatureParameterEdit',bindings)(true);assert.deepEqual(feature,original);assert.deepEqual(d.parts[0].profileEntityIds,original.params.profileEntityIds);
});

test('explicit refresh preserves New body intent and atomically refuses Thin and ambiguous sketch contours',()=>{
 const d=fixture(),feature=d.features[0],sketch=d.sketches[0];feature.params.operation='new-body';feature.params.mergeResult=false;
 const result=refreshedExtrudeProfile(feature,sketch);assert.equal(result.params.operation,'new-body');assert.equal(result.params.mergeResult,false);
 const {status,refresh}=context(d);feature.params.thinFeature=true;const before=JSON.stringify(feature);refresh(feature);
 assert.equal(JSON.stringify(feature),before);assert.equal(status.attributes['data-error'],'true');assert.match(status.textContent,/Thin/);
 feature.params.thinFeature=false;sketch.points.push({id:'other',x:20,y:20});sketch.entities.push({id:'other-circle',type:'circle',c:'other',r:1});
 const ambiguous=JSON.stringify(feature);refresh(feature);assert.equal(JSON.stringify(feature),ambiguous);assert.match(status.textContent,/multiple contours/);
});

test('refresh removing an inner sketch contour clears stale live body holes while Undo retains the prior binding',()=>{
 const sketch={id:'annulus',plane:'front',offset:0,points:[{id:'center',x:0,y:0}],entities:[{id:'outer',type:'circle',c:'center',r:2}],constraints:[]};
 const oldHole=[{u:1,v:0},{u:0,v:1},{u:-1,v:0},{u:0,v:-1}];
 const feature={id:'boss',type:'extrude',inputs:[],references:{sketches:[sketch.id],features:[],topology:[]},params:{sketchId:sketch.id,profileEntityIds:['outer'],holeProfileEntityIds:[['deleted-inner']],holes:[oldHole],depth:1,direction:'forward',operation:'add',mergeResult:true}};
 const part={id:'body',kind:'ext',featureId:feature.id,sketchId:sketch.id,sketchDriven:true,profileEntityIds:['outer'],holeProfileEntityIds:[['deleted-inner']],holes:[oldHole],pts:[],from:0,to:1};
 const d={features:[feature],sketches:[sketch],parts:[part]},ctx=context(d);
 const H=createHistory({get:()=>JSON.stringify(ctx.E.def),set:v=>{ctx.E.def=JSON.parse(v);}});H.clear();H.push('Edit feature');
 ctx.refresh(feature);ctx.bindings.syncProjectionFromFeature(feature);
 assert.deepEqual(feature.params.holeProfileEntityIds,[]);assert.deepEqual(feature.params.holes,[]);
 assert.deepEqual(part.holeProfileEntityIds,[]);assert.deepEqual(part.holes,[],'live body must not retain a hole absent from its canonical feature');
 H.undo();assert.deepEqual(ctx.E.def.parts[0].holes,[oldHole]);H.redo();assert.deepEqual(ctx.E.def.parts[0].holes,[]);
});

test('projection reconciliation retains legacy sampled holes and unresolved associative holes',()=>{
 const sketch={id:'s',plane:'front',offset:0,points:[{id:'center',x:0,y:0}],entities:[{id:'outer',type:'circle',c:'center',r:2}],constraints:[]};
 const hole=[{u:1,v:0},{u:0,v:1},{u:-1,v:0},{u:0,v:-1}];
 const feature={id:'boss',type:'extrude',params:{sketchId:'s',profileEntityIds:['outer'],holes:[hole],depth:1},references:{sketches:['s']}};
 const body={id:'body',kind:'ext',featureId:'boss',holes:[hole]},d={features:[feature],sketches:[sketch],parts:[body]};
 synchronizeSketchExtrusionFrames(d,'s');assert.deepEqual(body.holes,[hole]);assert.deepEqual(feature.params.holes,[hole]);
 feature.params.holeProfileEntityIds=[['missing']];synchronizeSketchExtrusionFrames(d,'s');
 assert.deepEqual(body.holes,[hole]);assert.deepEqual(feature.params.holes,[hole]);
});

test('protected actual Q1 export cold rebuilds the refreshed four-line/four-arc boss and all downstream bosses',async()=>{
 const d=fixture(),feature=d.features[0],sketch=d.sketches[0],refreshed=refreshedExtrudeProfile(feature,sketch);
 Object.assign(feature,refreshed);const cold=JSON.parse(JSON.stringify(d)),compiled=compileKernelFeatureTree(cold);
 assert.equal(compiled.ok,true,JSON.stringify(compiled.issues));const run=await regenerateFeatures({...compiled.document,features:compiled.features});
 try{
  assert.deepEqual(run.issues,[]);assert.equal(run.ok,true);
  const first=run.results.get(feature.id),last=run.results.get(d.features.at(-1).id),firstProps=await shapeMassProperties(first),lastProps=await shapeMassProperties(last);
  const diameter=sketch.constraints.find(c=>c.type==='diameter').value,radius=sketch.constraints.find(c=>c.type==='radius').value;
  const expected=(diameter*diameter/2-4*radius*radius*(1-Math.PI/4))*(feature.params.to-feature.params.from);
  assert.ok(Math.abs(firstProps.volume-expected)<1e-6,'native rounded diamond follows its source dimensions');
  const proof=await validateBrepForExport(last);assert.equal(proof.valid,true);assert.equal(proof.solidCount,1);assert.ok(lastProps.volume>firstProps.volume);
 }finally{releaseRegeneration(run);}
});
