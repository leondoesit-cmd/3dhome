import { modelerSource } from "./helpers/modeler_source.mjs";
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {occurrenceDependencyId} from '../js/core/dependency_visualization.js';
import {nestedComponentOccurrence,createNestedComponentEdit,nestedEditStillCurrent,commitNestedComponentEdit,assemblyWithoutNestedOccurrence} from '../js/core/nested_component_edit.js';
import {setDocumentProperty,assemblyPartNumber,documentDescription} from '../js/core/custom_properties.js';
import {assemblyDrawingBOM} from '../js/core/assembly_drawing_bom.js';import {createHistory} from '../js/edit_history.js';import {sourceFunctionText} from './helpers/source_function.mjs';
import {currentNativeFixtureProof} from './helpers/current_native_proof.mjs';import {compileKernelFeatureTree} from '../js/core/kernel_feature_adapter.js';import {verifiedFinalTopology} from '../js/core/exact_topology_cache.js';
const source=modelerSource(),clone=x=>structuredClone(x);
function fixture(){const leaf=id=>({id,name:'Leaf',modelKey:'library-original',transform:{x:1,y:2,z:3,rx:0,ry:0,rz:0},def:{key:'library-original',name:'Leaf',parts:[],features:[{id:'f',params:{depth:2}}],history:[{kind:'feature',targetId:'f'}]}});return {key:'root',components:[{id:'left',kind:'assembly',transform:{x:10,y:0,z:0,rx:0,ry:0,rz:90},asm:{components:[{id:'inner',kind:'assembly',transform:{x:0,y:5,z:0,rx:0,ry:0,rz:0},asm:{components:[leaf(7)],topologyMates:[{id:'inner-mate'}]}}],topologyMates:[{id:'left-mate'}]}},{id:'right',kind:'assembly',asm:{components:[leaf(7)]}}],topologyMates:[{id:'root-mate',a:{componentId:'left',persistentId:'inner/7/f:face'}}],explodedViews:[{id:'explode'}]};}
test('two-level paths distinguish duplicate IDs and preserve source/library/mates through commit Undo and cold',()=>{
 let a=fixture(),before=JSON.stringify(a);const path=['left','inner',7],target=nestedComponentOccurrence(a,path),other=nestedComponentOccurrence(a,['right',7]);assert.notEqual(target.component,other.component);assert.ok(Math.abs(target.placement.origin.x-3)<1e-12&&Math.abs(target.placement.origin.y-1)<1e-12&&Math.abs(target.placement.origin.z-3)<1e-12);
 const edit=createNestedComponentEdit(a,path);edit.working.features[0].params.depth=9;edit.working.metadata={contextEditor:{componentPath:path}};assert.equal(JSON.stringify(a),before);
 const H=createHistory({get:()=>JSON.stringify(a),set:s=>a=JSON.parse(s)}).seed();H.push('Edit nested component');commitNestedComponentEdit(a,edit,edit.working);assert.equal(nestedComponentOccurrence(a,path).component.def.features[0].params.depth,9);assert.equal(other.component.def.features[0].params.depth,2);assert.deepEqual(a.topologyMates,JSON.parse(before).topologyMates);assert.equal(nestedComponentOccurrence(a,path).component.def.metadata.contextEditor,undefined);
 H.undo();assert.equal(JSON.stringify(a),before);H.redo();const cold=JSON.parse(JSON.stringify(a));assert.equal(nestedComponentOccurrence(cold,path).component.def.features[0].params.depth,9);assert.deepEqual(cold.topologyMates,JSON.parse(before).topologyMates);
});
test('owner replacement, changed source and ambiguous/missing path fail closed; ghosts omit exactly one nested leaf',()=>{
 const a=fixture(),edit=createNestedComponentEdit(a,['left','inner',7]);assert.equal(nestedEditStillCurrent(clone(a),edit),false);assert.equal(nestedComponentOccurrence(a,['missing',7]),null);
 const ghost=assemblyWithoutNestedOccurrence(a,edit.path);assert.equal(ghost.components[0].asm.components[0].asm.components.length,0);assert.equal(ghost.components[1],a.components[1]);assert.equal(nestedComponentOccurrence(a,edit.path).component,edit.source);
 edit.source.def.features[0].params.depth=4;assert.equal(nestedEditStillCurrent(a,edit),false);assert.throws(()=>commitNestedComponentEdit(a,edit,edit.working),/changed/);
 a.components[1].asm.components.push(clone(a.components[1].asm.components[0]));assert.equal(nestedComponentOccurrence(a,['right',7]),null);
});
function finishFixture(a,path,regenerate){const edit=createNestedComponentEdit(a,path),working=edit.working;delete edit.working;edit.previousDef={name:'prior editor'};
 const E={assembly:a,def:working,contextEdit:edit,docType:'part'},events=[];let history=1;
 const deps={E,root:null,nestedComponentOccurrence,nestedEditStillCurrent,commitNestedComponentEdit,currentHistoryNode:()=>history,flash:m=>events.push(m),isCanonicalAuthoring:()=>true,activeParts:d=>d.parts,
 regenerateExactModel:regenerate,H:{clear(){events.push('seed');return this;},seed(){}},pushUndo:()=>events.push('undo'),setDocumentType:t=>{E.docType=t;events.push(t);},solveAssembly:()=>{},refreshAll:()=>{},fitPreview:()=>{}};
 const fn=new Function(...Object.keys(deps),sourceFunctionText(source,'clearContextPartInteraction')+'\n'+sourceFunctionText(source,'finishContextPart')+';return finishContextPart;')(...Object.values(deps));return {E,edit,working,events,fn,setHistory:x=>history=x};}
test('actual nested Finish waits for genuine native publication and rejects local history changes mid-rebuild',async()=>{
 const a=fixture(),path=['left','inner',7],native=JSON.parse(fs.readFileSync(new URL('./fixtures/bench-vice-edited-base-cache.json',import.meta.url)));nestedComponentOccurrence(a,path).component.def=native;const before=JSON.stringify(a);let release;const barrier=new Promise(r=>release=r);
 let f;f=finishFixture(a,path,async(_,options)=>{assert.equal(options.restoreMode,'mesh');await barrier;f.working.exactTopologyCache=await currentNativeFixtureProof(f.working);return {ok:true};});
 const p=f.fn();assert.equal(JSON.stringify(a),before);assert.equal(await f.fn(),false);release();assert.equal(await p,true);assert.equal(f.E.docType,'assembly');assert.equal(f.E.sel.id,'left');const committed=nestedComponentOccurrence(a,path).component.def,compiled=compileKernelFeatureTree(committed);assert.ok(verifiedFinalTopology(committed,compiled.features).length>0);
 const b=fixture();nestedComponentOccurrence(b,path).component.def=clone(native);let done;const g=finishFixture(b,path,()=>new Promise(r=>done=r));const q=g.fn();g.setHistory(2);done({ok:true});assert.equal(await q,false);assert.equal(g.E.contextEdit,g.edit);assert.equal(g.events.includes('undo'),false);
});
test('ordinary nested metadata dialog changes path-bound occurrence BOM only and supports history/cold',async()=>{
 let a=fixture(),path=['left','inner',7],before=JSON.stringify(a),E={assembly:a,docType:'assembly'};const H=createHistory({get:()=>JSON.stringify(E.assembly),set:s=>E.assembly=JSON.parse(s)}).seed();
 const deps={E,root:null,nestedComponentOccurrence,createNestedComponentEdit,nestedEditStillCurrent,currentHistoryNode:()=>1,assemblyPartNumber,documentDescription,sheetForm:async()=>({partNumber:'P-8',description:'Book nested battery'}),flash:()=>{},pushUndo:label=>H.push(label),setDocumentProperty,invalidateDrawing:()=>{},refreshAll:()=>{},scheduleModelerDraft:()=>{}};
 const fn=new Function(...Object.keys(deps),sourceFunctionText(source,'editNestedComponentProperties')+';return editNestedComponentProperties;')(...Object.values(deps));await fn(path);const c=nestedComponentOccurrence(E.assembly,path).component;assert.equal(c.customProperties.PartNo,'P-8');assert.equal(c.def.customProperties,undefined);assert.equal(nestedComponentOccurrence(E.assembly,['right',7]).component.customProperties,undefined);assert.ok(assemblyDrawingBOM(E.assembly).rows.some(row=>row.partNumber==='P-8'));
 H.undo();assert.equal(JSON.stringify(E.assembly),before);H.redo();const cold=clone(E.assembly);assert.equal(nestedComponentOccurrence(cold,path).component.customProperties.PartNo,'P-8');assert.deepEqual(cold.topologyMates,a.topologyMates);
});
import {restoreNestedComponentEdit} from '../js/core/nested_component_edit.js';
test('cold component draft uses full occurrence path and rejects foreign roots or mismatched repeated IDs',()=>{
 const a=fixture(),path=['left','inner',7],metadata={assemblyKey:a.key,componentId:7,componentPath:path};
 const cold=clone(a),edit=restoreNestedComponentEdit(cold,clone(metadata));assert.equal(edit.source,nestedComponentOccurrence(cold,path).component);assert.equal(nestedEditStillCurrent(cold,edit),true);
 assert.throws(()=>restoreNestedComponentEdit({...cold,key:'other'},metadata),/different assembly/);assert.throws(()=>restoreNestedComponentEdit(cold,{...metadata,componentId:99}),/does not match/);
 cold.components[0].transform.x++;assert.equal(nestedEditStillCurrent(cold,edit),false,'ancestor pose changes invalidate local editing frame');
});
test('tree nested leaf supports Enter edit yet ordinary selection remains rigid top component',()=>{
 const a=fixture(),E={assembly:a};const nodeFactory=new Function(sourceFunctionText(source,'assemblyTreeNode')+';return assemblyTreeNode;')();
 const tree=new Function('isSubassembly','assemblyTreeNode','assemblyCollapsed','t','occurrenceDependencyId',sourceFunctionText(source,'subassemblyTreeRows')+';return subassemblyTreeRows;')(c=>c.kind==='assembly',nodeFactory,()=>false,t=>t,occurrenceDependencyId);
 const root=a.components[0],rows=tree(root,root.asm.components,'sub:left'),leaf=rows[0].children[0];assert.deepEqual(leaf.componentPath,['left','inner',7]);assert.equal(leaf.targetId,'left');assert.equal(leaf.can.edit,true);
 let received;const handlers=new Function('E','nestedComponentOccurrence','beginContextPart',sourceFunctionText(source,'assemblyTreeHandlers')+';return assemblyTreeHandlers;')(E,nestedComponentOccurrence,(...args)=>received=args)({});handlers.onEdit(leaf);assert.equal(received[0],nestedComponentOccurrence(a,leaf.componentPath).component);assert.deepEqual(received[2],leaf.componentPath);
});
test('actual local Undo path identity cannot cross between duplicate child IDs or replace parent',()=>{
 const assembly=fixture(),edit=createNestedComponentEdit(assembly,['left','inner',7]),E={docType:'part',assembly,contextEdit:edit,def:{name:'Current left working copy'}};
 const start=source.indexOf('const H = createHistory('),end=source.indexOf('\n/* ---- what is inside a document',start),noop=()=>{};
 const dependencies={E,createHistory:options=>options,closeEvalCard:noop,invalidateDrawing:noop,invalidateInterference:noop,resolveSketch:noop,refreshAll:noop,syncSheetPanel:noop,scanDoc:noop,docSubtree:noop,syncUndoButtons:noop,syncHead:noop,flash:noop};
 const restore=new Function(...Object.keys(dependencies),'function snapDoc(){return null;}'+source.slice(start,end)+';return H.set;')(...Object.values(dependencies));
 restore(JSON.stringify({d:{name:'Foreign right copy'},contextComponentId:7,contextComponentPath:['right',7]}));assert.equal(E.def.name,'Current left working copy');assert.equal(E.assembly,assembly);
 restore(JSON.stringify({d:{name:'Left Undo restored'},contextComponentId:7,contextComponentPath:['left','inner',7]}));assert.equal(E.def.name,'Left Undo restored');assert.equal(E.assembly,assembly);
});
