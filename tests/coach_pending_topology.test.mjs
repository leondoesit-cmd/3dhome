import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sourceFunctionText} from './helpers/source_function.mjs';
import {rebuildParametricDocument} from '../js/core/parametric_rebuild.js';
import {currentNativeFixtureProof} from './helpers/current_native_proof.mjs';
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
test('actual Q4 settled export has no residual Fillet lost-selection issue',async()=>{
 const d=JSON.parse(readFileSync(new URL('../artifacts/planchard/BASIC-Q4-fixed-cold-accepted-browser-2026-10-09.mforge',import.meta.url),'utf8')).mainModel;
 const before=JSON.stringify(d),current=structuredClone(d);
 // The accepted export predates the corner-consumer revision. Prove its
 // unchanged geometry with today's kernel before simulating a settled audit.
 current.exactTopologyCache=await currentNativeFixtureProof(current);
 const r=rebuildParametricDocument(current);assert.equal(r.ok,true);
 const fillet=d.features.find(f=>f.type==='fillet');assert.equal(fillet.state,'rebuilt');
 for(const issue of r.issues){
  assert.equal(issue.code,'topology-reference-rebound','settled current proof has no lost or ambiguous selected geometry');
  assert.equal(issue.severity,'warning');assert.equal(issue.featureId,fillet.id);
  const original=fillet.references.topology.find(ref=>ref.persistentId===issue.reference)?.descriptor;
  const resolved=Object.values(current.exactTopologyCache).flatMap(proof=>proof.topology).find(entry=>entry.persistentId===issue.reboundTo)?.descriptor;
  assert.ok(original&&resolved,'a rebound must resolve the actual selected native contour');
  assert.equal(original.curve,'circle');assert.equal(resolved.curve,original.curve);
  assert.ok(Math.abs(resolved.radius-original.radius)<1e-10);
  for(const axis of ['x','y','z'])assert.ok(Math.abs(resolved.origin[axis]-original.origin[axis])<1e-10,'rebound retains the source circle center');
 }
 assert.equal(JSON.stringify(d),before,'current native proof never rewrites the accepted browser fixture');
});
