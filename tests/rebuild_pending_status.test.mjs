import { modelerSource } from "./helpers/modeler_source.mjs";
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sourceFunctionText} from './helpers/source_function.mjs';

const source=modelerSource();
function fixture(){
 const part={id:1},st={},E={docType:'part',mode:'3d',def:{parts:[part]},coreRun:{issues:[],bodies:[{}]}};
 const bindings={E,root:{querySelector:()=>st},t:key=>key,activeParts:def=>def.parts,
  inferAuthoringMode:()=> 'parametric',nativeSolidSummary:()=>({known:true,count:1}),hasSingleToolboxKernelRecipe:()=>false,
  topologyStatusCaption:()=>'',documentDirty:()=>true};
 const names=['displayedCoreIssues','modelRebuildPending','rebuildStatusCaption','syncStatusLine'];
 const api=new Function(...Object.keys(bindings),names.map(name=>sourceFunctionText(source,name)).join('\n')+';return {'+names.join(',')+'};')(...Object.values(bindings));
 return {E,part,st,api};
}
test('support edit retains old healthy core run but cannot report success or its solid counts while exact restore is pending',()=>{
 const f=fixture();f.api.syncStatusLine();assert.match(f.st.innerHTML,/rebuildOk/);assert.match(f.st.innerHTML,/Native solids: 1/);
 f.E.exactRestoring=true;f.api.syncStatusLine();assert.match(f.st.innerHTML,/rebuildPending/);
 assert.doesNotMatch(f.st.innerHTML,/rebuildOk|Native solids:|1 parts/);
 f.E.exactRestoring=false;f.api.syncStatusLine();assert.match(f.st.innerHTML,/rebuildOk/);assert.match(f.st.innerHTML,/Native solids: 1/);
});
test('native busy and per-part mesh builds mask previous success, then failures remain visible',()=>{
 const f=fixture();f.E.kernelBusy=true;assert.match(f.api.rebuildStatusCaption(),/rebuildPending/);
 f.E.kernelBusy=false;f.part.exactPending=true;f.part.exactError='Slow computation';assert.match(f.api.rebuildStatusCaption(),/rebuildPending/);
 f.part.exactPending=false;f.part.exactError='Failed native branch';assert.match(f.api.rebuildStatusCaption(),/rebuildFail/);assert.doesNotMatch(f.api.rebuildStatusCaption(),/rebuildOk/);
 delete f.part.exactError;f.E.coreRun=null;assert.match(f.api.rebuildStatusCaption(),/rebuildUnchecked/);
 f.E.coreRun={issues:[{severity:'warning'}]};assert.match(f.api.rebuildStatusCaption(),/rebuildWarn/);
 f.E.coreRun.issues=[{severity:'error'}];assert.match(f.api.rebuildStatusCaption(),/rebuildFail/);
});
test('native rebuild publishes busy status before compilation and releases status on all current completions',()=>{
 const body=sourceFunctionText(source,'regenerateExactModelNow');
 assert.ok(body.indexOf('syncStatus();')<body.indexOf('compileKernelFeatureTree(E.def)'), 'publish pending before synchronous native preparation');
 assert.match(body,/finally \{ if\(queueIsCurrent\(\)\)\{E\.kernelBusy = false; syncCommandManager\(\); syncStatus\(\);\}/);
 const mesh=sourceFunctionText(source,'queueExactMesh');
 assert.match(mesh,/p\.exactPending = true;\s*p\.exactError = null;\s*syncStatus\(\);/);
 assert.match(mesh,/p\.exactPending = false;\s*p\.exactError = null;\s*syncStatus\(\);/);
 assert.match(mesh,/console\.warn\("Exact CAD mesh build failed:", error\);\s*syncStatus\(\);/);
});
test('same coach button changes both accessible and visible action from finish sketch to save',()=>{
 const node=()=>({classList:{toggle(){}},setAttribute(name,value){this[name]=value;}});
 const nodes=Object.fromEntries(['mdCoach','mdCoachIcon','mdCoachLabel','mdCoachText','mdCoachGo','mdCoachDots'].map(id=>['#'+id,node()]));
 const E={open:true,coachEnabled:true,tour:{active:false},docType:'part',mode:'3d'};
 let suggestion={icon:'ph-check',text:'finish',act:'Finish sketch',run:()=> 'finish'};
 const bindings={root:{querySelector:id=>nodes[id]},E,clearCoachTarget(){},coachSuggestion:()=>suggestion,t:key=>key,
  isCanonicalAuthoring:()=>true,currentWorkflowStep:()=> 'history',syncEmptyStart(){},syncModelerMobile(){}};
 const sync=new Function(...Object.keys(bindings),sourceFunctionText(source,'syncCoach')+';return syncCoach;')(...Object.values(bindings));
 sync();const button=nodes['#mdCoachGo'];assert.equal(button['aria-label'],'Finish sketch');assert.match(button.innerHTML,/Finish sketch/);
 suggestion={icon:'ph-save',text:'save',act:'Save to library',run:()=> 'save'};sync();
 assert.equal(button['aria-label'],'Save to library');assert.match(button.innerHTML,/Save to library/);assert.doesNotMatch(button.innerHTML,/Finish sketch/);
 assert.equal(E._coachSug.run(),'save','click handler consumes the new command suggestion');
});
