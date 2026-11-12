import { modelerSource } from "./helpers/modeler_source.mjs";
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sourceFunctionText} from './helpers/source_function.mjs';
import {formSubassembly} from '../js/core/assembly_form_subassembly.js';
import {flattenAssembly} from '../js/core/assembly_structure.js';
import {generateBOM} from '../js/cad_interference.js';
import {assemblyDrawingBOM,occurrenceBOMKey} from '../js/core/assembly_drawing_bom.js';
import {buildDrawingScene} from '../js/cad_drawings.js';
import {sceneToSvg} from '../js/cad_sheet.js';
import {documentDescription,assemblyPartNumber,setDocumentProperty} from '../js/core/custom_properties.js';
import {assemblyHasExplodedOffsets,defaultExplodeLayout,createExplodedView,addExplodeStep,applyExplodedView,explodeTargets,explodedOccurrenceOffset} from '../js/cad_exploded_view.js';
const source=modelerSource();
const bundle=JSON.parse(readFileSync(new URL('../artifacts/planchard/AP-assembly-free-home-browser-2026-10-08.mforge',import.meta.url)));
function fixture(){
 const assembly=structuredClone(bundle.assemblies[0]),E={docType:'assembly',assembly,componentSel:assembly.components.slice(0,6),topologySelection:[]};
 let form,undo=0,accepted,refresh;const messages=[];
 const context={E,t:key=>key,flash:message=>messages.push(message),openQuickForm:spec=>{form=spec;},uid:()=> 'column-group',formSubassembly,pushUndo:()=>undo++,acceptRackPinionSolve:result=>{accepted=result;},refreshAll:options=>{refresh=options;}};
 const open=new Function(...Object.keys(context),sourceFunctionText(source,'openFormSubassembly')+';return openFormSubassembly;')(...Object.values(context));
 return {E,assembly,open,messages,get form(){return form;},get undo(){return undo;},get accepted(){return accepted;},get refresh(){return refresh;}};
}
test('actual Form subassembly name dialog groups six browser-authored column parts with one undo and preserved world geometry',()=>{
 const f=fixture(),before=flattenAssembly(f.assembly).map(leaf=>({id:leaf.component.id,placement:structuredClone(leaf.placement)}));
 const definitions=f.E.componentSel.map(component=>JSON.stringify(component.def));f.open();
 assert.equal(f.form.action,'formsubassembly');assert.match(f.form.hint,/AP01 Column/);assert.equal(f.form.onApply({name:'  Column  '}),true);
 assert.equal(f.undo,1);assert.equal(f.E.componentSel.length,1);assert.equal(f.E.sel,f.E.componentSel[0]);
 const group=f.E.sel;assert.equal(group.name,'Column');assert.equal(group.asm.components.length,6);assert.equal(group.asm.topologyMates.length,5);assert.equal(f.assembly.topologyMates.length,9);assert.equal(f.assembly.components.length,6);assert.equal(group.grounded,true);
 assert.equal(f.accepted.degreesOfFreedom,1);assert.equal(f.refresh.skipAssemblySolve,true);
 assert.deepEqual(group.asm.components.map(component=>JSON.stringify(component.def)),definitions);
 assert.deepEqual(flattenAssembly(f.assembly).map(leaf=>({id:leaf.component.id,placement:leaf.placement})),before);
});
test('actual Form subassembly refuses blank name and nonrigid selection without history, poses or selection mutation',()=>{
 const f=fixture();f.E.componentSel=[f.assembly.components[0],f.assembly.components[10]];f.open();const before=JSON.stringify(f.assembly),selection=f.E.componentSel;
 assert.equal(f.form.onApply({name:''}),false);assert.equal(f.form.onApply({name:'Unsafe rigid group'}),false);
 assert.equal(f.undo,0);assert.equal(JSON.stringify(f.assembly),before);assert.equal(f.E.componentSel,selection);assert.equal(f.accepted,undefined);
 assert.deepEqual(f.messages,['formSubassemblyNameRequired','formSubassemblyNeedRigid']);
});
test('Form subassembly requires top-level multi-selection and does not publish into a switched document',()=>{
 const f=fixture();f.E.componentSel=[f.assembly.components[0],{id:'outside'}];f.open();assert.equal(f.form,undefined);assert.deepEqual(f.messages,['formSubassemblySelection']);
 f.E.componentSel=f.assembly.components.slice(0,6);f.open();const before=JSON.stringify(f.assembly);f.E.assembly={components:[]};assert.equal(f.form.onApply({name:'Column'}),false);assert.equal(f.undo,0);assert.equal(JSON.stringify(f.assembly),before);
});
test('grouped browser AP drawing BOM keeps eight leaf definitions while automatic explosion addresses all eleven leaf occurrences',()=>{
 const f=fixture();f.open();f.form.onApply({name:'Column'});
 const context={E:f.E,flattenAssembly,generateBOM,assemblyDrawingBOM,assemblyHasExplodedOffsets,defaultExplodeLayout,createExplodedView,addExplodeStep,applyExplodedView,explodeTargets,
  occurrenceWorldBounds:(component,placement)=>({x0:placement.origin.x-1,x1:placement.origin.x+1,y0:placement.origin.y-1,y1:placement.origin.y+1,z0:placement.origin.z-1,z1:placement.origin.z+1}),pushUndo(){},t:key=>key,refreshAll(){},fitPreview(){},flash(){},openExplodedPlayback(){}};
 const bom=new Function(...Object.keys(context),sourceFunctionText(source,'assemblyDrawingBOMRows')+';return assemblyDrawingBOMRows;')(...Object.values(context));
 const rows=bom();assert.equal(rows.length,8);assert.equal(rows.reduce((sum,row)=>sum+row.quantity,0),11);assert.equal(rows.find(row=>row.name.includes('AP03 Hex screw')).quantity,4);assert.equal(rows.some(row=>row.name==='Column'),false);
 const before=flattenAssembly(f.assembly).map(leaf=>structuredClone(leaf.placement));
 const explode=new Function(...Object.keys(context),sourceFunctionText(source,'createDefaultExplodedView')+';return createDefaultExplodedView;')(...Object.values(context));
 explode();const view=f.assembly.explodedViews[0];assert.equal(view.steps.length,10);
 const targets=new Set(view.steps.flatMap(step=>step.components));assert.ok(targets.has('column-group/4797'));assert.ok(targets.has('column-group/4801'));assert.ok(targets.has('4806'));assert.equal(targets.has('column-group'),false);
 assert.deepEqual(flattenAssembly(f.assembly).map(leaf=>leaf.placement),before,'explosion must preserve physical world poses');
 assert.equal(flattenAssembly(f.assembly).filter(leaf=>leaf.component.explodedOffset).length,10);
});
test('cold indented scope produces the book nine-row hierarchy and eleven correctly numbered rendered leaf balloons',()=>{
 const f=fixture();f.open();f.form.onApply({name:'AP-FRAME'});f.assembly.drawingSettings={bomScope:'indented'};
 const assembly=JSON.parse(JSON.stringify(f.assembly)),E={assembly},expected=['1','1.1','1.2','1.3','2','3','4','5','6'];
 const bom=assemblyDrawingBOM(assembly,assembly.drawingSettings.bomScope);assert.deepEqual(bom.rows.map(row=>row.item),expected);
 assert.equal(bom.rows[0].name,'AP-FRAME');assert.equal(bom.rows[3].quantity,4);assert.equal(bom.itemByPath.size,11);
 for(const id of [4798,4799,4800,4801])assert.equal(bom.itemByPath.get(occurrenceBOMKey(['column-group',id])),'1.3');
 const context={E,flattenAssembly,assemblyDrawingBOM,occurrenceBOMKey,explodedOccurrenceOffset,componentDef:component=>component.def,activeParts:def=>def.parts||[],cloneData:structuredClone,t:key=>key,
  occurrenceWorldBounds:(_component,placement)=>({x0:placement.origin.x-1,x1:placement.origin.x+1,y0:placement.origin.y-1,y1:placement.origin.y+1,z0:placement.origin.z-1,z1:placement.origin.z+1})};
 const drawing=new Function(...Object.keys(context),sourceFunctionText(source,'assemblyDrawingDocument')+';return assemblyDrawingDocument;')(...Object.values(context))();
 assert.deepEqual(drawing.balloons.map(row=>row.item),expected);assert.equal(drawing.targets.length,11);
 const scene=buildDrawingScene(drawing.def,{size:'ANSI_C',views:['iso'],overallDimensions:false,balloons:drawing.balloons,balloonTargets:drawing.targets});
 const labels=scene.items.filter(item=>item.type==='text'&&item.balloon).map(item=>item.text).sort();
 assert.deepEqual(labels,['1.1','1.2','1.3','1.3','1.3','1.3','2','3','4','5','6'].sort());
 const svg=sceneToSvg(scene);assert.match(svg,/>1\.3<\/text>/);assert.match(svg,/AP-FRAME/);
 for(const row of expected)assert.ok(scene.items.some(item=>item.type==='text'&&item.fullText===row),`table includes ${row}`);
 const flat=assemblyDrawingBOM(assembly,'partsOnly');assert.equal(flat.rows.length,8);assert.equal(flat.itemByPath.size,11);
});
test('indented numbering disambiguates same part identity at different depths and excludes hidden children',()=>{
 const part=(id,key)=>({id,modelKey:key,name:key});
 const assembly={components:[{id:'frame',kind:'assembly',assemblyKey:'frame',name:'Frame',asm:{components:[part(1,'pin'),part(2,'pin'),{id:'bracket',kind:'assembly',assemblyKey:'bracket',name:'Bracket',asm:{components:[part(1,'pin'),{...part(2,'hidden'),visible:false}]}}]}},part(1,'pin')]};
 const bom=assemblyDrawingBOM(assembly,'indented');assert.deepEqual(bom.rows.map(row=>row.item),['1','1.1','1.2','1.2.1','2']);
 assert.equal(bom.rows.find(row=>row.item==='1.1').quantity,2);
 assert.equal(bom.itemByPath.get(occurrenceBOMKey(['frame',1])),'1.1');assert.equal(bom.itemByPath.get(occurrenceBOMKey(['frame','bracket',1])),'1.2.1');assert.equal(bom.itemByPath.get(occurrenceBOMKey([1])),'2');
 assert.equal(bom.itemByPath.size,4);
});
test('group occurrence metadata commits preserve retained placement UI, geometry, projection token and pre-edit undo snapshots',()=>{
 const f=fixture();f.open();f.form.onApply({name:'AP-FRAME'});const component=f.E.sel;
 const geometry=JSON.stringify(component.asm),snapshots=[],host={children:[],appendChild(child){this.children.push(child);}};
 const node=()=>({children:[],events:{},appendChild(child){this.children.push(child);},setAttribute(){},addEventListener(key,fn){this.events[key]=fn;}});
 let invalidations=0,dirty=0;
 const E={mode:'3d',sheetToken:42,sheet:{invalidateLayout(){invalidations++;}}};
 const context={E,el:()=>node(),documentDescription,assemblyPartNumber,setDocumentProperty,pushUndo:()=>snapshots.push(structuredClone(component.customProperties||{})),syncDirty:()=>dirty++,
  drawSketch(){throw Error('3D metadata must not redraw');},refreshSelection(){throw Error('Metadata must not run whole UI/inspector refresh');},refreshAll(){throw Error('Metadata must not rebuild');},updatePreview(){throw Error('Metadata must not rebuild meshes');}};
 const render=new Function(...Object.keys(context),sourceFunctionText(source,'assemblyBomProperties')+';return assemblyBomProperties;')(...Object.values(context));
 render(host,component);const inputs=host.children.map(row=>row.children[1]),retainedRows=host.children.slice();
 inputs[0].value='AP-FRAME';inputs[0].events.blur();inputs[0].events.change();inputs[1].value='AP-FRAME-01';inputs[1].events.blur();
 assert.equal(documentDescription(component),'AP-FRAME');assert.equal(assemblyPartNumber(component,component.asm),'AP-FRAME-01');
 assert.equal(snapshots.length,2);assert.equal(snapshots[0].Description,undefined);assert.equal(snapshots[1].Description,'AP-FRAME');assert.equal(snapshots[1].PartNo,undefined);
 assert.deepEqual(host.children,retainedRows);assert.equal(JSON.stringify(component.asm),geometry);assert.equal(E.sheetToken,42);assert.equal(invalidations,2);assert.equal(dirty,2);
 const restored=JSON.parse(JSON.stringify(f.assembly));const row=assemblyDrawingBOM(restored,'indented').rows[0];assert.equal(row.description,'AP-FRAME');assert.equal(row.partNumber,'AP-FRAME-01');
 component.customProperties=snapshots.pop();assert.equal(assemblyPartNumber(component,component.asm),'');assert.equal(documentDescription(component),'AP-FRAME');
 component.customProperties=snapshots.pop();assert.equal(documentDescription(component),'');
});
