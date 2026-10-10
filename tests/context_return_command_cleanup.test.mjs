import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {sourceFunctionText} from './helpers/source_function.mjs';
import {createNestedComponentEdit,nestedComponentOccurrence,nestedEditStillCurrent,commitNestedComponentEdit} from '../js/core/nested_component_edit.js';
import {createHistory} from '../js/edit_history.js';
const source=fs.readFileSync(new URL('../js/modeler.js',import.meta.url),'utf8');
function fixture(){
 const original={features:[{id:'pattern',params:{countX:3}}],parts:[{id:'body'}]},component={id:1,def:structuredClone(original),transform:{x:1,y:2,z:3}},assembly={key:'independent',components:[component],topologyMates:[{id:'mate'}]};
 const edit=createNestedComponentEdit(assembly,[1]);edit.previousDef={name:'previous'};const working=edit.working;delete edit.working;working.features[0].params.countX=2;
 const E={assembly,contextEdit:edit,def:working,docType:'part',tool:'pattern',quickAction:'pattern',quickFormInstance:{},collectingFeature:true,authoring:{phase:'feature',featureType:'pattern',featureEdit:{featureId:'pattern',snapshot:original}}};
 const host={hidden:false,innerHTML:'Old Pattern form'},seedCommands=[];let current=1,native=true;
 const H=createHistory({get:()=>JSON.stringify(E.assembly),set:s=>E.assembly=JSON.parse(s)}).seed(),oldSeed=H.seed;H.seed=function(){seedCommands.push({action:E.quickAction,type:E.authoring.featureType,tool:E.tool});return oldSeed.call(H);};
 const ctx={E,root:{querySelector:()=>host},H,nestedComponentOccurrence,nestedEditStillCurrent,commitNestedComponentEdit,currentHistoryNode:()=>current,
  flash(){},isCanonicalAuthoring:()=>true,activeParts:d=>d.parts,regenerateExactModel:async()=>({ok:native}),pushUndo:label=>H.push(label),setDocumentType:type=>E.docType=type,solveAssembly(){},refreshAll(){},fitPreview(){},scheduleModelerDraft(){}};
 const api=new Function(...Object.keys(ctx),['clearContextPartInteraction','finishContextPart','cancelContextPart'].map(n=>sourceFunctionText(source,n)).join('\n')+';return {finishContextPart,cancelContextPart};')(...Object.values(ctx));
 return {E,host,H,api,seedCommands,original,edit,setNative:v=>native=v,setHistory:v=>current=v};
}
test('successful Finish and assembly Undo retain chosen geometry without a residual feature command',async()=>{
 const f=fixture();assert.equal(await f.api.finishContextPart(),true);assert.equal(f.E.docType,'assembly');assert.equal(f.E.quickAction,null);assert.equal(f.E.quickFormInstance,null);assert.equal(f.E.tool,'select');assert.equal(f.E.authoring.featureType,null);assert.equal(f.E.authoring.featureEdit,undefined);assert.equal(f.E.collectingFeature,false);assert.equal(f.host.hidden,true);assert.deepEqual(f.seedCommands,[{action:null,type:null,tool:'select'}]);assert.equal(f.E.assembly.components[0].def.features[0].params.countX,2);
 f.H.undo();assert.equal(f.E.assembly.components[0].def.features[0].params.countX,3);assert.equal(f.E.quickAction,null);assert.equal(f.E.tool,'select');f.H.redo();assert.equal(f.E.assembly.components[0].def.features[0].params.countX,2);assert.deepEqual(f.E.assembly.topologyMates,[{id:'mate'}]);
});
test('Cancel clears only transient command state; failed or stale Finish keeps active editing untouched',async()=>{
 const cancelled=fixture();cancelled.api.cancelContextPart();assert.equal(cancelled.E.quickAction,null);assert.equal(cancelled.host.hidden,true);assert.deepEqual(cancelled.E.assembly.components[0].def,cancelled.original);
 const failed=fixture(),before=JSON.stringify(failed.E.assembly),token=failed.E.quickFormInstance;failed.setNative(false);assert.equal(await failed.api.finishContextPart(),false);assert.equal(failed.E.quickAction,'pattern');assert.equal(failed.E.quickFormInstance,token);assert.equal(failed.host.hidden,false);assert.equal(JSON.stringify(failed.E.assembly),before);
 failed.E.assembly.components[0].def.features[0].params.countX=4;assert.equal(await failed.api.finishContextPart(),false);assert.equal(failed.E.quickAction,'pattern');assert.equal(failed.host.hidden,false);
});
