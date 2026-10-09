import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {thinExtrudeSketchReadiness} from '../js/modeler_thin_extrude_profiles.js';
import {analyzeSketchChains,analyzeSketchProfiles} from '../js/sketch_profiles.js';
import {ribSketchReady} from '../js/core/rib_profile.js';
import {sourceFunctionText} from './helpers/source_function.mjs';

const source=readFileSync(new URL('../js/modeler.js',import.meta.url),'utf8');
const load=(name,bindings)=>new Function(...Object.keys(bindings),sourceFunctionText(source,name)+';return '+name+';')(...Object.values(bindings));
const sketch=()=>({id:'guide',points:[{id:'a',x:0,y:0},{id:'b',x:3,y:0}],entities:[{id:'line',type:'line',a:'a',b:'b'}],constraints:[]});
const thin={thinFeature:true,thickness:.38,thinMode:'reverse'};
function context(s=sketch()){
 const E={docType:'part',def:{features:[]},authoring:{},sselAuto:true};
 const bindings={E,thinExtrudeSketchReadiness,analyzeSketchChains,ribSketchReady,selEntities:()=>[],t:key=>key};
 bindings.sketchOpenPathReadiness=load('sketchOpenPathReadiness',bindings);
 bindings.sketchProfilePresentation=load('sketchProfilePresentation',bindings);
 return {E,bindings,s};
}

test('actual sketch presentation distinguishes open path availability, valid Thin, and ordinary solid errors',()=>{
 const {E,bindings,s}=context(),info=analyzeSketchProfiles(s);
 let view=bindings.sketchProfilePresentation(s,info,0);
 assert.equal(view.status,'path');assert.equal(view.textKey,'profileOpenPath');assert.equal(view.pathEnds,true);
 E.authoring={featureType:'extrude',featurePreviewState:{params:{...thin},thinChainKeys:[]}};
 view=bindings.sketchProfilePresentation(s,info,0);assert.equal(view.status,'ready');assert.equal(view.textKey,'profileThinReady');
 E.authoring.featurePreviewState.params.thinFeature=false;
 view=bindings.sketchProfilePresentation(s,info,0);assert.equal(view.status,'open');assert.equal(view.textKey,'profileOpen');assert.equal(view.pathEnds,false);
 E.authoring.featurePreviewState.params={...thin,thickness:0};
 assert.equal(bindings.sketchProfilePresentation(s,info,0).status,'open');
 E.authoring.featurePreviewState.params={...thin,thickness:-.38};
 assert.equal(bindings.sketchProfilePresentation(s,info,0).status,'open');
 assert.equal(JSON.stringify(s),JSON.stringify(sketch()),'readiness never edits the guide');
});

test('saved Thin readiness validates primary and additional chains with actual widths and independent sides',()=>{
 const s=sketch();s.points.push({id:'c',x:0,y:2},{id:'d',x:3,y:2});s.entities.push({id:'upper',type:'line',a:'c',b:'d'});
 const saved={type:'extrudeCut',params:{...thin,sketchId:s.id,profileEntityIds:['line'],regionProfileEntityIds:[['upper']],thinRegionModes:['forward']}};
 assert.equal(thinExtrudeSketchReadiness(s,{features:[saved]}).kind,'thin');
 saved.suppressed=true;assert.equal(thinExtrudeSketchReadiness(s,{features:[saved]}).kind,'path');saved.suppressed=false;
 saved.params.thinRegionModes=['invalid'];assert.equal(thinExtrudeSketchReadiness(s,{features:[saved]}).kind,'path');saved.params.thinRegionModes=['forward'];
 saved.params.regionProfileEntityIds=[['missing']];assert.equal(thinExtrudeSketchReadiness(s,{features:[saved]}).kind,'path');
 assert.deepEqual(thinExtrudeSketchReadiness(s,{type:'extrude',params:thin,chainKeys:['upper']}).entityIds,['upper']);
 assert.equal(thinExtrudeSketchReadiness(s,{type:'extrude',params:thin,chainKeys:['missing']}),null);
 assert.equal(thinExtrudeSketchReadiness(s,{type:'extrude',params:thin,selectedIds:['missing']}),null);
});

test('branch, zero-length, and unsupported geometry retain profile warnings instead of reporting Thin readiness',()=>{
 const cases=[];let s=sketch();s.points.push({id:'c',x:3,y:2},{id:'d',x:5,y:0});s.entities.push({id:'branch1',type:'line',a:'b',b:'c'},{id:'branch2',type:'line',a:'b',b:'d'});cases.push(s);
 s=sketch();s.points[1].x=0;cases.push(s);
 s=sketch();s.entities.push({id:'unsupported',type:'ellipse',c:'a',rx:1,ry:2});cases.push(s);
 for(const bad of cases){assert.equal(thinExtrudeSketchReadiness(bad),null);assert.equal(thinExtrudeSketchReadiness(bad,{type:'extrude',params:thin}),null);}
});

test('actual coach finishes valid open paths and retains Close profile for a requested ordinary solid or branch',()=>{
 const {E,bindings,s}=context();let finished=0,tool;
 const suggest=load('coachSuggestion',{...bindings,isCanonicalAuthoring:()=>true,currentWorkflowStep:()=> 'sketch',ensureSketch:()=>s,
  recommendedDiagnostic:()=>null,displayedCoreIssues:()=>[],closedSketchProfile:()=>false,finishSketchWorkflow:()=>finished++,setCommandTab(){},setTool:t=>tool=t});
 assert.equal(suggest().text,'coachStepOpenPath');suggest().run();assert.equal(finished,1);
 E.authoring={featureType:'extrude',featurePreviewState:{params:{thinFeature:false}}};
 assert.equal(suggest().text,'coachStepClose');suggest().run();assert.equal(tool,'wall');
 E.authoring={};s.points.push({id:'c',x:3,y:2},{id:'d',x:5,y:0});s.entities.push({id:'branch1',type:'line',a:'b',b:'c'},{id:'branch2',type:'line',a:'b',b:'d'});
 assert.equal(suggest().text,'coachStepClose');
});

test('a saved Rib keeps its path-ready presentation while a new ordinary extrusion still requires closure',()=>{
 const {E,bindings,s}=context();E.def.features=[{type:'rib',params:{sketchId:s.id,chainEntityIds:['line']}}];
 const info=analyzeSketchProfiles(s);assert.equal(bindings.sketchProfilePresentation(s,info,0).textKey,'profileRibReady');
 E.authoring={featureType:'extrude',featurePreviewState:{params:{thinFeature:false}}};
 assert.equal(bindings.sketchProfilePresentation(s,info,0).textKey,'profileOpen');
});

test('actual preview feedback replaces stale green Thin readiness when Thin is disabled or its width is invalid',()=>{
 const {E,bindings,s}=context();E.authoring={featureType:'extrude',featurePreviewState:{params:{...thin},thinChainKeys:[]}};
 const label={},icon={},ends={},card={querySelector:selector=>selector.endsWith(' b')?label:selector.endsWith(' i')?icon:ends};
 const button={};let toolbarSyncs=0;
 const root={querySelector:()=>card,querySelectorAll:()=>[button]};
 const extra={...bindings,root,ensureSketch:()=>s,sketchProfileAnalysis:()=>analyzeSketchProfiles(s),sketchRegionAnalysis:()=>({regions:[]}),syncCommandManager:()=>toolbarSyncs++};
 extra.syncExtrudeButton=load('syncExtrudeButton',extra);
 const sync=load('syncSketchOpenPathFeedback',extra);sync();
 assert.equal(card.className,'md-profile-state md-profile-ready');assert.equal(label.textContent,'profileThinReady');assert.equal(button.title,'profileThinReady');
 E.authoring.featurePreviewState.params.thinFeature=false;sync();
 assert.equal(card.className,'md-profile-state md-profile-open');assert.equal(label.textContent,'profileOpen');assert.match(button.title,/profileOpen/);assert.equal(ends.textContent,'2 profileEnds');
 E.authoring.featurePreviewState.params={...thin,thickness:0};sync();assert.equal(card.className,'md-profile-state md-profile-open');assert.equal(toolbarSyncs,3);
});
