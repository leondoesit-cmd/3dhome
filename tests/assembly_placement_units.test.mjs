import { modelerSource } from "./helpers/modeler_source.mjs";
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {sourceFunctionText} from './helpers/source_function.mjs';
import {lengthFromDocument,lengthToDocument,formatDocumentLength,documentLengthUnit} from '../js/core/document_length_units.js';
import {normalizePose} from '../js/cad_mate_model.js';
import {solveTopologyMates} from '../js/cad_mates.js';
import {applyDrivenAssemblyPlacement} from '../js/core/assembly_placement.js';
const source=modelerSource();
function node(tag,_class,text){return {tag,textContent:text,children:[],events:{},value:'',appendChild(child){this.children.push(child);},append(...children){this.children.push(...children);},addEventListener(event,fn){this.events[event]=fn;},setAttribute(){}};}
function all(node){return [node,...node.children.flatMap(all)];}
function fixture(unit,grounded=false){
  const tr={x:4.5,y:0,z:0,rx:0,ry:0,rz:0},component={id:'moving',name:'Spring',modelKey:'saved-part',grounded,transform:tr},E={sel:component,assembly:{components:[component],topologyMates:[]},mateFreedom:[],mateDegreesOfFreedom:6},host=node('host');let undos=0,refreshes=0,fullRefreshes=0;
  const inspector=new Function('E','root','el','t','fin','modelLengthUnit','lengthToDocument','lengthFromDocument','normalizeTransform','assemblyBomProperties','isSubassembly','btn','pushUndo','solveAssembly','refreshAll','fitPreview','cloneData','applyDrivenAssemblyPlacement','flash','refreshParts','invalidateDrawing','syncDirty',
    'var propGen=0;function fillLibraryLinkStatus(){}'+sourceFunctionText(source,'numRow')+sourceFunctionText(source,'numLengthRow')+sourceFunctionText(source,'assemblyTransformInspector')+';return assemblyTransformInspector;')
    (E,{querySelector:()=>host},node,key=>key,Number.isFinite,()=>unit,lengthToDocument,lengthFromDocument,c=>normalizePose(c.transform),()=>{},()=>false,(text,fn)=>Object.assign(node('button','',text),{onclick:fn}),()=>undos++,opts=>solveTopologyMates(E.assembly,opts),()=>{refreshes++;fullRefreshes++;host.children=[];inspector();},()=>{},structuredClone,applyDrivenAssemblyPlacement,()=>{},()=>refreshes++,()=>{},()=>{});
  inspector();
  const field=label=>all(host).filter(n=>n.tag==='label').find(n=>n.children[0]?.textContent===label)?.children.find(n=>n.tag==='input');
  const apply=all(host).find(n=>n.textContent==='Apply placement');
  return {tr,component,field,apply,get undos(){return undos;},get refreshes(){return refreshes;},get fullRefreshes(){return fullRefreshes;}};
}
for(const commit of ['blur','Enter'])test('all six staged placement values survive naming last then Apply via '+commit,()=>{
  const f=fixture('mm'),inputs=['X (mm)','Y (mm)','Z (mm)','RX°','RY°','RZ°'].map(label=>f.field(label));
  const values=[85,-12,40,15,-25,35];inputs.forEach((input,i)=>{input.value=String(values[i]);input.events.change();});
  const before=JSON.stringify(f.component.transform),name=f.field('partName');name.value='Articulated rod 4';
  if(commit==='blur')name.events.blur();else name.events.keydown({key:'Enter',preventDefault(){},stopPropagation(){}});
  assert.equal(f.fullRefreshes,0,'name metadata commit must retain the existing placement controls');
  assert.equal(JSON.stringify(f.component.transform),before,'rename must not apply staged pose early');
  assert.equal(f.field('X (mm)'),inputs[0]);assert.equal(f.field('RZ°'),inputs[5]);
  f.apply.onclick();assert.equal(f.component.name,'Articulated rod 4');
  ['x','y','z','rx','ry','rz'].forEach((key,i)=>assert.ok(Math.abs(f.component.transform[key]-(i<3?values[i]/10:values[i]))<1e-9,key+' must preserve typed value'));
  assert.equal(f.fullRefreshes,1,'Apply refreshes after atomic commit');
});
for(const grounded of [false,true])test('component name Enter and blur commit independently of placement; grounded='+grounded,()=>{
  const f=fixture('mm',grounded),name=f.field('partName'),before=JSON.stringify(f.tr);let prevented=0,stopped=0;
  name.value='Piston head 1';name.events.keydown({key:'Enter',preventDefault(){prevented++;},stopPropagation(){stopped++;}});
  assert.equal(f.component.name,'Piston head 1');assert.equal(f.undos,1);assert.equal(f.refreshes,1);assert.equal(prevented,1);assert.equal(stopped,1);
  name.events.change();name.events.blur();assert.equal(f.undos,1,'duplicate native events must not create undo entries');
  name.value='Ring 4';name.events.blur();assert.equal(f.component.name,'Ring 4');assert.equal(f.undos,2);
  name.value='';name.events.blur();assert.equal(f.component.name,'saved-part');
  assert.equal(JSON.stringify(f.tr),before,'metadata edit must preserve placed transform');
  assert.equal(JSON.parse(JSON.stringify(f.component)).name,'saved-part','saved occurrence retains committed name');
});
for(const unit of ['mm','cm','in'])test('assembly placement displays and applies '+unit+' while rotations remain degrees',()=>{
  const f=fixture(unit),x=f.field('X ('+unit+')'),y=f.field('Y ('+unit+')'),z=f.field('Z ('+unit+')'),angle=f.field('RZ°');
  assert.equal(Number(x.value),Number(lengthToDocument(4.5,unit).toPrecision(12)));
  x.value='45';x.events.change();x.events.blur();assert.equal(f.component.transform.x,4.5,'input editing is draft-only');
  x.value='12.5';y.value='45';z.value='-2.5';angle.value='90';f.apply.onclick();
  assert.equal(f.component.transform.x,lengthFromDocument(12.5,unit));assert.equal(f.component.transform.y,lengthFromDocument(45,unit));assert.equal(f.component.transform.z,lengthFromDocument(-2.5,unit));
  assert.ok(Math.abs(f.component.transform.rz-90)<1e-10);assert.ok(Math.abs(f.component.transform.q.z-Math.SQRT1_2)<1e-10);
});
test('grounded component ignores inline and Apply placement changes',()=>{
  const f=fixture('mm',true),x=f.field('X (mm)');x.value='45';x.events.change();f.apply.onclick();
  assert.equal(f.component.transform.x,4.5);assert.equal(f.apply.disabled,true);
});

for(const unit of ['mm','cm','in'])test('selected component size summary uses assembly '+unit+' regardless of source part units',()=>{
 const component={name:'Drill guide base',def:{context:{units:{length:'cm'}},parts:[{id:'base'}]}};
 const E={docType:'assembly',assembly:{context:{units:{length:unit}}},sel:component},host=node('host');
 const bounds={x0:-7,x1:7,y0:0,y1:4.6,z0:-7,z1:7},before=JSON.stringify(component);
 const modelLengthUnit= new Function('E','documentLengthUnit',sourceFunctionText(source,'modelLengthUnit')+';return modelLengthUnit;')(E,documentLengthUnit);
 const modelLengthText=new Function('modelLengthUnit','formatDocumentLength',sourceFunctionText(source,'modelLengthText')+';return modelLengthText;')(modelLengthUnit,formatDocumentLength);
 const bindings={E,root:{querySelector:()=>host},el:node,t:x=>x,isSubassembly:()=>false,btn:text=>node('button','',text),componentDef:c=>c.def,activeParts:d=>d.parts,defBounds:()=>bounds,springSource:()=>{throw Error('not spring');},modelLengthText,modelLengthUnit};
 new Function(...Object.keys(bindings),sourceFunctionText(source,'assemblyFlagsInspector')+';assemblyFlagsInspector();')(...Object.values(bindings));
 const expected=[14,4.6,14].map(x=>formatDocumentLength(x,unit,6)).join('×');
 assert.ok(all(host).some(n=>n.textContent==='1 partCount · '+expected+' '+unit));
 assert.equal(JSON.stringify(component),before);
});
