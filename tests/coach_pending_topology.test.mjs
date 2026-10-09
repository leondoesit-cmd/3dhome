import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sourceFunctionText} from './helpers/source_function.mjs';
import {rebuildParametricDocument} from '../js/core/parametric_rebuild.js';
const source=readFileSync(new URL('../js/modeler.js',import.meta.url),'utf8');
test('pending exact rebuild does not coach topology repairs; settled failures retain actionable repair',()=>{
 const E={docType:'part',def:{parts:[{exactPending:false}]},exactRestoring:false,kernelBusy:false};
 let helpCalls=0,actions=0;
 const bindings={E,activeParts:d=>d.parts,diagnosticHelp:()=>{helpCalls++;return {next:'Edit the feature',action:'edit-feature'};},diagnosticMessage:()=> 'Fillet 1 lost a selected face or edge',diagnosticActionLabel:()=> 'Edit feature',runDiagnosticAction:()=>{actions++;}};
 const api=new Function(...Object.keys(bindings),sourceFunctionText(source,'modelRebuildPending')+'\n'+sourceFunctionText(source,'coachRebuildSuggestion')+';return coachRebuildSuggestion;')(...Object.values(bindings));
 const issue={code:'missing-topology-reference',severity:'error',featureId:'fillet'};
 for(const state of ['exactRestoring','kernelBusy','exactPending']){if(state==='exactPending')E.def.parts[0].exactPending=true;else E[state]=true;assert.equal(api(issue),null);if(state==='exactPending')E.def.parts[0].exactPending=false;else E[state]=false;}
 assert.equal(helpCalls,0,'no premature repair guidance');
 const suggestion=api(issue);assert.match(suggestion.phrase,/lost a selected face/);assert.equal(suggestion.rebuild,true);suggestion.run();assert.equal(actions,1);
 assert.ok(api({...issue,code:'ambiguous-topology-reference',severity:'warning'}),'settled unresolved warning is not masked');
});
test('actual Q4 settled export has no residual Fillet lost-selection issue',()=>{
 const d=JSON.parse(readFileSync(new URL('../artifacts/planchard/BASIC-Q4-fixed-cold-accepted-browser-2026-10-09.mforge',import.meta.url),'utf8')).mainModel;
 const r=rebuildParametricDocument(structuredClone(d));assert.equal(r.ok,true);assert.deepEqual(r.issues,[]);assert.equal(d.features.find(f=>f.type==='fillet').state,'rebuilt');
});
