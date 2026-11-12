import { modelerSource } from "./helpers/modeler_source.mjs";
import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {createPartDocument,createSketchDefinition,createFeatureDefinition} from '../js/core/parametric_document.js';
import {compileKernelFeatureTree} from '../js/core/kernel_feature_adapter.js';
import {holeCutRecords,holeToolPlacements} from '../js/core/hole_geometry.js';
import {featureSpec,featureDefaults,featureEditorGroups} from '../js/core/feature_catalog.js';
import {holeCallouts} from '../js/core/hole_callout.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
function fixture(direction,offset,local){
 const doc=createPartDocument({id:'offset'});
 const pad=createSketchDefinition(doc,{id:'pad',referenceId:'plane:top',points:[{id:'a',x:0,y:0},{id:'b',x:4,y:0},{id:'c',x:4,y:4},{id:'d',x:0,y:4}],entities:[['a','b'],['b','c'],['c','d'],['d','a']].map(([a,b],i)=>({id:'e'+i,type:'line',a,b}))});
 createFeatureDefinition(doc,'extrude',{id:'base',references:{sketches:[pad.id]},params:{depth:4,profileEntityIds:['e0','e1','e2','e3']}});
 const sketch=createSketchDefinition(doc,{id:'s',referenceId:'plane:top',offset:2,points:[{id:'c',x:2,y:2}],entities:[{id:'circle',type:'circle',c:'c',r:.3}]});sketch.offset=2;
 if(local){sketch.frameSpace='local';sketch.frame={origin:{x:0,y:3,z:0},xAxis:{x:1,y:0,z:0},yAxis:{x:0,y:0,z:1},normal:{x:0,y:1,z:0}};}
 const hole=createFeatureDefinition(doc,'hole',{id:'h',inputs:['base'],references:{sketches:[sketch.id],features:['base']},params:{standardSize:'custom',diameter:.6,depth:.5,drillPointAngle:180,endCondition:'blind',offset,direction,sketchId:sketch.id,profileEntityIds:['circle']}});
 return {doc,sketch,hole};
}
for(const direction of ['forward','reverse'])for(const offset of [-1,0,1])for(const local of [false,true])test(`${direction} signed offset${offset} ${local?'frame':'datum'} keeps native and preview start equal`,()=>{
 const {doc,sketch,hole}=fixture(direction,offset,local),compiled=compileKernelFeatureTree(doc);assert.ok(compiled.ok,JSON.stringify(compiled.issues));
 const spec=compiled.features.find(f=>f.type==='holeTool').params,preview=holeCutRecords(hole.params,sketch,['circle'])[0].params;
 const a=holeToolPlacements(spec)[0],b=holeToolPlacements(preview)[0];
 near(a.origin.y,(local?3:2)+offset);near(a.origin.y,b.origin.y);assert.deepEqual(a.axis,b.axis);
 near(a.axis.y,direction==='reverse'?-1:1);
 const callout=holeCallouts(doc)[0];assert.ok(callout);near(callout.worldPoints[0].y,a.origin.y);
});
test('Hole exposes signed length start offset in shared create/edit catalog',()=>{
 assert.equal(featureDefaults('hole').offset,0);assert.equal(featureSpec('hole').parameters.offset.unit,'document-length');assert.equal(featureSpec('hole').parameters.offset.min,undefined);
 const field=featureEditorGroups('hole').flatMap(g=>g.fields).find(f=>f.key==='offset');assert.equal(field.unit,'length');assert.equal(field.min,undefined);
});
test('native unattached support picker defaults to datum rather than first offered face',()=>{
 const source=modelerSource(),a=source.indexOf('  if(supportSketch){',source.indexOf('function openFeatureEditor(')),b=source.indexOf('  var pendingFrame=',a);
 const node=()=>({children:[],appendChild(n){this.children.push(n);},setAttribute(){}}),feature={id:'h',inputs:['base']},sketch={plane:'front'},host=node();
 const env={supportSketch:sketch,E:{def:{features:[{id:'base'},feature]}},feature,host,dependencyReferenceId:x=>x,compileKernelFeatureTree:()=>({ok:true,features:[]}),verifiedExactTopology:()=>new Map(),holeSupportChoices:()=>[{key:'first-face',label:'Side face',entry:{}}],modelLengthUnit:()=> 'mm',el:node,document:{createElement:node},t:x=>x};
 const picker=new Function(...Object.keys(env),'var supportSelect,supportChoices;'+source.slice(a,b)+';return supportSelect;')(...Object.values(env));
 assert.equal(picker.value,'');assert.match(picker.children[0].textContent,/Datum sketch \(unattached\).*front/);
 assert.equal(picker.children[1].value,'first-face');assert.equal(sketch.support,undefined);
});

import {alignExtrusionToSupport} from '../js/cad_feature_tree.js';
test('native support realignment preserves direct-normal Hole start while extrude remains direction-relative',()=>{
 const support={persistentId:'f',ownerFeatureId:'base'},frame={origin:{x:0,y:3,z:0},xAxis:{x:1,y:0,z:0},yAxis:{x:0,y:0,z:1},normal:{x:0,y:1,z:0}};
 const resolutions=[{reference:support,topology:{descriptor:{origin:{x:0,y:3,z:0},normal:{x:0,y:1,z:0}}}}];
 for(const local of [true,false]){
  const params={support,axis:'y',...(local?{frame}:{}),baseOffset:1,depth:.5,direction:'reverse'};
  const hole=alignExtrusionToSupport({...params,holeOffsetNormal:true},resolutions),extrude=alignExtrusionToSupport(params,resolutions);
  near(hole.from,local?1:4);near(extrude.from,local?-1:2);
 }
});
import {regenerateFeatures,releaseRegeneration} from '../js/cad_feature_tree.js';
import {shapeMassProperties} from '../js/cad_kernel.js';
test('cold native Hole reverse with positive start offset cuts at the requested entry coordinate',async()=>{
 const {doc}=fixture('reverse',1,false),compiled=compileKernelFeatureTree(JSON.parse(JSON.stringify(doc)));
 const run=await regenerateFeatures({...compiled.document,features:compiled.features});
 try{
  assert.ok(run.ok,JSON.stringify(run.issues));
  const tool=run.results.get('h:tool'),mass=await shapeMassProperties(tool.brep || tool);
  near(mass.bounds.min.y,2.5);near(mass.bounds.max.y,3);
  const cut=run.results.get('h'),result=await shapeMassProperties(cut.brep || cut);near(result.volume,64-Math.PI*.3*.3*.5);
 }finally{releaseRegeneration(run);}
});
