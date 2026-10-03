import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {sourceFunctionText} from './helpers/source_function.mjs';
import {lengthFromDocument,lengthToDocument,formatDocumentLength,documentLengthUnit} from '../js/core/document_length_units.js';
const source=fs.readFileSync(new URL('../js/modeler.js',import.meta.url),'utf8');
function node(tag,_class,text){return {tag,textContent:text,children:[],events:{},value:'',appendChild(child){this.children.push(child);},append(...children){this.children.push(...children);},addEventListener(event,fn){this.events[event]=fn;},setAttribute(){}};}
function all(node){return [node,...node.children.flatMap(all)];}
function fixture(unit,grounded=false){
  const tr={x:4.5,y:0,z:0,rx:0,ry:0,rz:0},component={name:'Spring',grounded,transform:tr},E={sel:component},host=node('host');let rotations=0;
  const inspector=new Function('E','root','el','t','fin','modelLengthUnit','lengthToDocument','lengthFromDocument','normalizeTransform','assemblyBomProperties','isSubassembly','btn','pushUndo','solveAssembly','refreshAll','fitPreview','setRotation','eulerMatrix',
    'var propGen=0;'+sourceFunctionText(source,'numRow')+sourceFunctionText(source,'numLengthRow')+sourceFunctionText(source,'assemblyTransformInspector')+';return assemblyTransformInspector;')
    (E,{querySelector:()=>host},node,key=>key,Number.isFinite,()=>unit,lengthToDocument,lengthFromDocument,c=>c.transform,()=>{},()=>false,(text,fn)=>Object.assign(node('button','',text),{onclick:fn}),()=>{},()=>{},()=>{},()=>{},()=>rotations++,()=>({}));
  inspector();const labels=all(host).filter(n=>n.tag==='label');
  const field=label=>labels.find(n=>n.children[0]?.textContent===label)?.children.find(n=>n.tag==='input');
  const apply=all(host).find(n=>n.textContent==='Apply placement');
  return {tr,field,apply,get rotations(){return rotations;}};
}
for(const unit of ['mm','cm','in'])test('assembly placement displays and applies '+unit+' while rotations remain degrees',()=>{
  const f=fixture(unit),x=f.field('X ('+unit+')'),y=f.field('Y ('+unit+')'),z=f.field('Z ('+unit+')'),angle=f.field('RZ°');
  assert.equal(Number(x.value),Number(lengthToDocument(4.5,unit).toPrecision(12)));
  x.value='45';x.events.change();assert.equal(f.tr.x,lengthFromDocument(45,unit));
  x.value='12.5';y.value='45';z.value='-2.5';angle.value='90';f.apply.onclick();
  assert.equal(f.tr.x,lengthFromDocument(12.5,unit));assert.equal(f.tr.y,lengthFromDocument(45,unit));assert.equal(f.tr.z,lengthFromDocument(-2.5,unit));
  assert.equal(f.tr.rz,90);assert.equal(f.rotations,1);
});
test('grounded component ignores inline and Apply placement changes',()=>{
  const f=fixture('mm',true),x=f.field('X (mm)');x.value='45';x.events.change();f.apply.onclick();
  assert.equal(f.tr.x,4.5);assert.equal(f.apply.disabled,true);assert.equal(f.rotations,0);
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
