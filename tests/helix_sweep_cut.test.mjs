import { modelerSource } from "./helpers/modeler_source.mjs";
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {createPartDocument,createSketchDefinition,createFeatureDefinition} from '../js/core/parametric_document.js';
import {removeHistoryNode} from '../js/core/parametric_document.js';
import {featureDefaults,validateFeatureDefinition,FEATURE_CATALOG} from '../js/core/feature_catalog.js';
import {helixFromSketch} from '../js/core/sketch_helix.js';
import {helixSweepPath,normalizeHelixSpec} from '../js/cad_helix.js';
import {compileKernelFeatureTree} from '../js/core/kernel_feature_adapter.js';
import {resolveSketchSources} from '../js/core/swept_sources.js';
import {resolveProfilePoints} from '../js/sketch_solver.js';
import {regenerateFeatures,releaseRegeneration} from '../js/cad_feature_tree.js';
import {shapeMassProperties,validateBrepForExport,exportStep} from '../js/cad_kernel.js';

function fixture(){
 const document=createPartDocument();
 const base=createSketchDefinition(document,{id:'base-profile',referenceId:'plane:top',points:[{id:'b',x:0,y:0,fixed:true}],entities:[{id:'base-circle',type:'circle',c:'b',r:.1905,fixed:true}],constraints:[]});base.plane='top';
 const cylinder=createFeatureDefinition(document,'extrude',{id:'stem',references:{sketches:[base.id]},params:{depth:.635,axis:'y',operation:'add',profileEntityIds:['base-circle']}});
 const helix=createFeatureDefinition(document,'helix',{id:'thread-path',params:{radius:.1905,origin:{x:0,y:.0508,z:0},axis:{x:0,y:1,z:0},pitch:.127,turns:4,height:.508,definition:'pitch-turns',taperMode:'delta',taper:0}});
 const spec={...normalizeHelixSpec(helixFromSketch(document,helix.params)),id:'helix-ref',featureId:helix.id,type:'reference_helix'};
 document.referenceGeometry=[spec];
 const profile=createSketchDefinition(document,{id:'cut-profile',referenceId:'plane:right',points:[{id:'c',x:-.1905,y:.0508,fixed:true}],entities:[{id:'profile-circle',type:'circle',c:'c',r:.0381,fixed:true}],constraints:[]});
 // Independent analytic section in the radial/axial plane; source cut radius .015in.
 profile.plane='side';
 return {document,cylinder,spec,profile};
}

test('Sweep Cut helix validation retains an explicit target and ordinary two-sketch requirement',()=>{
 const good={id:'cut',type:'sweepCut',inputs:['stem'],references:{sketches:['profile'],features:['stem'],references:['helix']},params:{...featureDefaults('sweepCut'),helixId:'helix',sweepPathMode:'helix'}};
 assert.deepEqual(validateFeatureDefinition(good),[]);
 assert.ok(validateFeatureDefinition({...good,references:{sketches:['profile'],references:['helix']}}).some(i=>i.role==='features'));
 assert.ok(validateFeatureDefinition({...good,params:featureDefaults('sweepCut')}).some(i=>i.role==='sketches'));
 assert.equal(FEATURE_CATALOG.sweepCut.editor.groups[0].fields[0].type,'helix-reference');
});

function runUI(f,targetAvailable=true){
 const source=modelerSource();
 const start=source.indexOf('function createHelixSweepCut('),end=source.indexOf('\nfunction selectedHelixRecord()',start);
 const target={id:'body',featureId:f.cylinder.id,cuts3d:[]};let undo=0,queued=0;
 const context={E:{def:f.document},cutTargetBody:()=>targetAvailable?target:null,cutTargetFeatureId:p=>p.featureId,partSupportsExactMesh:()=>true,
 analyzeSketchProfiles:()=>({profiles:[{entityIds:['profile-circle'],points:[{u:-.2286,v:.0508},{u:-.1905,v:.0889},{u:-.1524,v:.0508},{u:-.1905,v:.0127}]}]}),
 sketchWorldPoint:(s,u,v)=>({x:0,y:v,z:u}),featureDefaults,helixSweepPath,cloneData:structuredClone,
 pushUndo:()=>undo++,H:{discard:()=>undo--},createFeatureDefinition,featureTypeLabel:x=>x,t:x=>x,flash:()=>{},invalidatePartMeshAfterEdit:()=>{},queueExactMesh:()=>queued++,refreshAll:()=>{}};
 runInNewContext(source.slice(start,end)+'\nthis.run=createHelixSweepCut;',context);
 const ok=context.run(f.spec,{helixId:f.spec.id},f.profile.id);
 return {ok,target,undo,queued};
}

test('actual UI handler creates one-profile native-target cut history and rejects absent target before mutation',()=>{
 const f=fixture(),result=runUI(f);assert.equal(result.ok,true);assert.equal(result.undo,1);assert.equal(result.queued,1);
 const cut=f.document.features.at(-1);assert.equal(cut.type,'sweepCut');assert.deepEqual([...cut.inputs],['stem']);assert.deepEqual([...cut.references.sketches],['cut-profile']);assert.equal(cut.params.sketchSources.helixFeatureId,'thread-path');assert.equal(result.target.cuts3d[0].featureId,cut.id);
 assert.deepEqual([...cut.references.features],['stem','thread-path']);
 assert.equal(removeHistoryNode(f.document,'history:feature:thread-path').ok,false,'do not delete the driving helix beneath its dependent cut');
 const missing=fixture(),before=JSON.stringify(missing.document);const failed=runUI(missing,false);assert.equal(failed.ok,false);assert.equal(failed.undo,0);assert.equal(JSON.stringify(missing.document),before);
});

test('cold native helical cut reduces connected stem volume and exports valid STEP; profile and pitch edits drive rebuild',async()=>{
 const f=fixture();assert.equal(runUI(f).ok,true);
 const volumes=[];
 for(const edit of [false,true]){
  if(edit){f.document.features.find(x=>x.id==='thread-path').params.pitch=.10;f.profile.entities[0].r=.03;}
  const cold=JSON.parse(JSON.stringify(f.document)),compiled=compileKernelFeatureTree(cold);
  const resolved=resolveSketchSources(cold,cold.features.at(-1).params.sketchSources,resolveProfilePoints);
  assert.equal(resolved.profileSegments.length,2,'native helix cut preserves analytic circular section');
  assert.equal(compiled.ok,true,JSON.stringify(compiled.issues));
  const run=await regenerateFeatures({...compiled.document,features:compiled.features});
  try{assert.equal(run.ok,true,JSON.stringify(run.issues));const cut=run.results.get(f.document.features.at(-1).id),mass=await shapeMassProperties(cut);const original=Math.PI*.1905**2*.635;
   assert.equal(mass.solidCount,1,'cut retains one connected native stem');
   await validateBrepForExport(run.results.get(f.document.features.at(-1).id+':tool'));
   assert.ok(mass.volume>original*.45 && mass.volume<original*.99,JSON.stringify(mass));volumes.push(mass.volume);await validateBrepForExport(cut);const step=new TextDecoder().decode(await exportStep(cut));assert.ok(step.includes('ISO-10303-21'));assert.ok(step.includes('END-ISO-10303-21'));
  }finally{releaseRegeneration(run);}
 }
 assert.ok(Math.abs(volumes[0]-volumes[1])>1e-4,'driving circle/pitch edits change actual cut solid');
});

test('editing the actual Sweep Cut Path retargets canonical and compatibility dependencies together',()=>{
 const f=fixture(),result=runUI(f);assert.equal(result.ok,true);
 const feature=f.document.features.at(-1);feature.params.helixId='next-ref';
 f.document.parts=[result.target];const source=modelerSource(),start=source.indexOf('function retargetSweepHelix('),end=source.indexOf('\nfunction sweepHelixRecord(',start);
 const context={E:{def:f.document},documentHelixRecords:()=>[{id:'next-ref',featureId:'next-helix'}]};
 runInNewContext(source.slice(start,end)+'\nthis.run=retargetSweepHelix;',context);context.run(feature);
 assert.equal(feature.params.sketchSources.helixId,'next-ref');assert.equal(feature.params.sketchSources.helixFeatureId,'next-helix');
 assert.deepEqual([...feature.references.references],['next-ref']);assert.deepEqual([...feature.inputs],['stem']);
 assert.deepEqual([...feature.references.features],['stem','next-helix']);
 assert.equal(result.target.cuts3d[0].sketchSources.helixId,'next-ref');
});
