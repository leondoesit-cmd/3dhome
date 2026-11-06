import { modelerSource } from "./helpers/modeler_source.mjs";
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sourceFunctionText} from './helpers/source_function.mjs';
import {assemblyMobilityReport,currentAssemblyMobility} from '../js/core/assembly_mobility_status.js';
import {solveTopologyMates} from '../js/cad_mates.js';

const source=modelerSource();
const fixture=()=>({components:[{id:'fixed',grounded:true,transform:{x:0,y:0,z:0,rx:0,ry:0,rz:0}}],mates:[],topologyMates:[]});
test('assembly status explicitly shows native checked zero mobility and distinguishes fresh 1/2 from unknown/stale results',()=>{
 const assembly=fixture(),E={docType:'assembly',assembly,componentSel:[],mateDegreesOfFreedom:0},status={innerHTML:''};
 const context={E,root:{querySelector:()=>status},currentAssemblyMobility,assemblyMateCount:a=>a.mates.length+a.topologyMates.length,brokenMateCount:()=>0,documentDirty:()=>false,t:key=>({mateDof:'degrees of freedom',mateDofOne:'degree of freedom',mateMobilityUnchecked:'Mobility not checked'})[key]||key};
 context.countLabel=(count,one,many)=>count+' '+context.t(count===1?one:many);
 const sync=new Function(...Object.keys(context),sourceFunctionText(source,'syncStatusLine')+';return syncStatusLine;')(...Object.values(context));
 sync();assert.match(status.innerHTML,/Mobility not checked/);assert.doesNotMatch(status.innerHTML,/0 degrees/);
 const native=solveTopologyMates(assembly);assert.equal(native.ok,true);assert.equal(native.degreesOfFreedom,0);
 E.mateMobilityReport=assemblyMobilityReport(assembly,native,native.issues);sync();assert.match(status.innerHTML,/0 degrees of freedom/);
 for(const count of [1,2]){E.mateMobilityReport=assemblyMobilityReport(assembly,{ok:true,degreesOfFreedom:count});sync();assert.match(status.innerHTML,new RegExp(count+' degree'));}
 assembly.components[0].transform.x=1;sync();assert.match(status.innerHTML,/Mobility not checked/);
});
test('mobility snapshot rejects failed/incomplete solve, changed mate drive and reopened document, while metadata edits keep a valid report',()=>{
 const assembly=fixture();assembly.topologyMates=[{id:'stop',type:'rotationlimit',driveAngle:0}];
 const report=assemblyMobilityReport(assembly,{ok:true,degreesOfFreedom:0});assert.equal(currentAssemblyMobility(assembly,report),0);
 assembly.components[0].description='Readable description';assert.equal(currentAssemblyMobility(assembly,report),0);
 assert.equal(currentAssemblyMobility(JSON.parse(JSON.stringify(assembly)),report),null);
 assembly.topologyMates[0].driveAngle=-4;assert.equal(currentAssemblyMobility(assembly,report),null);
 for(const result of [{ok:false,degreesOfFreedom:0},{ok:true},{ok:true,degreesOfFreedom:NaN},{ok:true,degreesOfFreedom:0,unsatisfied:[{mate:'stop'}]}])assert.equal(currentAssemblyMobility(assembly,assemblyMobilityReport(assembly,result)),null);
 assert.equal(currentAssemblyMobility(assembly,assemblyMobilityReport(assembly,{ok:true,degreesOfFreedom:0},[{mate:'stop'}])),null);
 assembly.components[0].asm=fixture();const nested=assemblyMobilityReport(assembly,{ok:true,degreesOfFreedom:0});
 assembly.components[0].asm.components[0].transform.x=2;assert.equal(currentAssemblyMobility(assembly,nested),null);
});
test('actual assembly solve records current mobility, including zero, without promoting a missing count to checked zero',()=>{
 const assembly=fixture(),E={};let result={ok:true,degreesOfFreedom:0,issues:[]};
 const context={E,mateSolveCount:0,contextPartTopology:()=>[],solveTopologyMates:()=>result,updateAssemblyContexts:()=>({issues:[]}),assemblyMobilityReport};
 const apply=new Function(...Object.keys(context),sourceFunctionText(source,'applyAssemblyMates')+';return applyAssemblyMates;')(...Object.values(context));
 apply(assembly);assert.equal(currentAssemblyMobility(assembly,E.mateMobilityReport),0);
 result={ok:true,issues:[]};apply(assembly);assert.equal(currentAssemblyMobility(assembly,E.mateMobilityReport),null);
});
test('atomic mechanical-mate commit refreshes the mobility snapshot used by the status bar',()=>{
 const E={assembly:fixture()},context={E,assemblyMobilityReport,invalidateInterference(){},updateAssemblyContexts:()=>({issues:[]}),refreshAll(){},assemblySolveFresh:false};
 const accept=new Function(...Object.keys(context),sourceFunctionText(source,'acceptRackPinionSolve')+';return acceptRackPinionSolve;')(...Object.values(context));
 accept({ok:true,degreesOfFreedom:0});assert.equal(currentAssemblyMobility(E.assembly,E.mateMobilityReport),0);
 accept({ok:false,degreesOfFreedom:0,issues:[{mate:'hinge'}]});assert.equal(currentAssemblyMobility(E.assembly,E.mateMobilityReport),null);
});

test('actual Save of one grounded and eight unmated occurrences never publishes native empty-cluster zero as whole-assembly mobility',async()=>{
 const assembly={name:'Unmated chain',components:Array.from({length:9},(_,index)=>({id:'occ-'+index,modelKey:'part',grounded:index===0,transform:{x:index,y:0,z:0,rx:0,ry:0,rz:0}})),mates:[],topologyMates:[]};
 const E={docType:'assembly',assembly,componentSel:[]},status={innerHTML:''};let stored=null;
 const native=solveTopologyMates(assembly);assert.equal(native.ok,true);assert.equal(native.degreesOfFreedom,0);assert.deepEqual(native.clusters,[],'native result only sums mate-connected clusters');
 const before=structuredClone(assembly.components);
 const context={E,root:{querySelector:selector=>selector==='#mdName'?{value:assembly.name}:selector==='#mdDescription'?{value:''}:status},
  mateSolveCount:0,contextPartTopology:()=>[],solveTopologyMates,updateAssemblyContexts:()=>({issues:[]}),assemblyMobilityReport,currentAssemblyMobility,
  H:{generation:1,editRevision:()=>1},currentHistoryNode:()=>1,assemblySaveSession:doc=>doc,applyTrackedUpdates:()=>false,rejectFlexibleSpringPreview:()=>false,setDocumentDescription(){},cloneData:structuredClone,saveAssemblies:async saved=>{stored=saved;return true;},assemblyOpenBaseline:null,
  refreshLib(){},flash(){},markDocumentClean(){},reconcileModelerDraft(){},updateTourProgress(){},
  assemblyMateCount:a=>a.mates.length+a.topologyMates.length,brokenMateCount:()=>0,documentDirty:()=>false,
  t:key=>({mateDof:'degrees of freedom',mateDofOne:'degree of freedom',mateMobilityUnchecked:'Mobility not checked'})[key]||key};
 context.countLabel=(count,one,many)=>count+' '+context.t(count===1?one:many);
 const names=['applyAssemblyMates','saveAssemblyDocument','syncStatusLine'];
 const api=new Function(...Object.keys(context),names.map(name=>sourceFunctionText(source,name)).join('\n')+';return {'+names.join(',')+'};')(...Object.values(context));
 api.syncStatusLine();assert.match(status.innerHTML,/Mobility not checked/);
 await api.saveAssemblyDocument();api.syncStatusLine();assert.match(status.innerHTML,/Mobility not checked/);assert.doesNotMatch(status.innerHTML,/0 degrees/);
 assert.deepEqual(stored.components,before);assert.deepEqual(stored.topologyMates,[]);assert.deepEqual(stored.mates,[]);
 const cold=JSON.parse(JSON.stringify(stored)),coldResult=solveTopologyMates(cold);assert.equal(currentAssemblyMobility(cold,assemblyMobilityReport(cold,coldResult)),null);
 cold.components.forEach(component=>component.grounded=true);const grounded=solveTopologyMates(cold);
 assert.equal(currentAssemblyMobility(cold,assemblyMobilityReport(cold,grounded)),0,'fully grounded no-mate assembly really is checked zero');
});

test('a partial cluster report stays unknown until all active ungrounded occurrences are covered',()=>{
 const assembly={components:[{id:'fixed',grounded:true},{id:'mated'},{id:'floating'},{id:'suppressed',suppressed:true}],mates:[],topologyMates:[]};
 const partial={ok:true,degreesOfFreedom:1,clusters:[{components:['mated'],degreesOfFreedom:1}]};
 assert.equal(currentAssemblyMobility(assembly,assemblyMobilityReport(assembly,partial)),null);
 const complete={...partial,degreesOfFreedom:7,clusters:partial.clusters.concat({components:['floating'],degreesOfFreedom:6})};
 assert.equal(currentAssemblyMobility(assembly,assemblyMobilityReport(assembly,complete)),7);
 assert.equal(currentAssemblyMobility(assembly,assemblyMobilityReport(assembly,{ok:true,degreesOfFreedom:0})),null,'absent coverage is not a checked zero');
 assembly.components[2].grounded=true;assert.equal(currentAssemblyMobility(assembly,assemblyMobilityReport(assembly,partial)),1);
});
