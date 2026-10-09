import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sourceFunctionText} from './helpers/source_function.mjs';
import {bindMateNumericCommit} from '../js/modeler_mate_numeric_commit.js';
import {setTopologyMateValue} from '../js/cad_mate_value_controls.js';
import {topologyReference,solveTopologyMates,captureLockPose} from '../js/cad_mates.js';

const source=readFileSync(new URL('../js/modeler.js',import.meta.url),'utf8');
function fixture(type='angle',grounded=false){
 const descriptor={surface:'plane',origin:{x:0,y:0,z:0},normal:{x:1,y:0,z:0}};
 const mate={id:'edited',type,value:type==='angle'?25:2,aligned:true,a:topologyReference('fixed','face','a',descriptor),b:topologyReference('moving','face','b',descriptor)};
 const assembly={components:[{id:'fixed',grounded:true,transform:{x:0,y:0,z:0,rx:0,ry:0,rz:0}},{id:'moving',transform:{x:type==='distance'?2:0,y:0,z:0,rx:0,ry:0,rz:type==='angle'?25:0}}],topologyMates:[mate],mates:[]};
 assert.equal(solveTopologyMates(assembly).ok,true);
 if(grounded){const lock={id:'lock',type:'lock',a:structuredClone(mate.a),b:structuredClone(mate.b)};captureLockPose(lock,assembly.components[0],assembly.components[1]);assembly.topologyMates.unshift(lock);assert.equal(solveTopologyMates(assembly).ok,true);}
 return {assembly,mate};
}
function inspector(assembly,mate,overrides={}){
 const nodes=[],undos=[],messages=[];let refreshes=0;
 const el=tag=>{const node={tag,children:[],attrs:{},listeners:{},appendChild(child){this.children.push(child);},setAttribute(key,value){this.attrs[key]=value;},addEventListener(type,handler){this.listeners[type]=handler;}};nodes.push(node);return node;};
 const context={E:{assembly},mate,el,btn:()=>el('button'),t:key=>key,fin:Number.isFinite,bindMateNumericCommit,setTopologyMateValue,
  clampMateAngle:value=>Math.max(0,Math.min(180,Number(value)||0)),modelLengthUnit:()=> 'mm',lengthToDocument:value=>value*10,lengthFromDocument:value=>value/10,
  pushUndo:()=>undos.push(structuredClone(assembly)),flash:message=>messages.push(message),acceptRackPinionSolve:()=>refreshes++,...overrides};
 const start=source.indexOf('mate.type === "angle" ? {',source.indexOf('function assemblyMateInspector'));
 const end=source.indexOf('        ["coincident",',start),descriptor=source.slice(start,end).trim().replace(/,$/,'');
 const edit=new Function(...Object.keys(context),'return ('+descriptor+');')(...Object.values(context));
 const row=new Function(...Object.keys(context),sourceFunctionText(source,'mateRow')+';return mateRow;')(...Object.values(context));
 row(el('div'),typeLabel(mate),'',null,()=>{},null,edit);
 return {input:nodes.find(node=>node.tag==='input'),undos,messages,get refreshes(){return refreshes;}};
}
const typeLabel=mate=>mate.type;
const enter=input=>input.listeners.keydown({key:'Enter',preventDefault(){},stopPropagation(){}});

test('actual Angle row blur commits 25→30 without change dispatch and Enter/change/blur produce one Undo',()=>{
 const {assembly,mate}=fixture(),f=inspector(assembly,mate);f.input.value='30';f.input.listeners.blur();
 assert.equal(mate.value,30);assert.equal(f.undos.length,1);assert.equal(f.undos[0].topologyMates[0].value,25);assert.equal(f.refreshes,1);
 f.input.listeners.change();enter(f.input);f.input.listeners.blur();assert.equal(f.undos.length,1);
 f.input.value='35';enter(f.input);f.input.listeners.blur();f.input.listeners.change();assert.equal(mate.value,35);assert.equal(f.undos.length,2);
 const cold=JSON.parse(JSON.stringify(assembly));assert.equal(solveTopologyMates(cold).ok,true);assert.equal(cold.topologyMates[0].value,35);
 assert.equal(inspector(cold,cold.topologyMates[0]).input.value,'35');
});

test('invalid and inconsistent Angle blur restores actual value and preserves poses and Undo atomically',()=>{
 const {assembly,mate}=fixture('angle',true),before=JSON.stringify(assembly),f=inspector(assembly,mate);
 for(const value of ['','bad','181','-1','30']){
  f.input.value=value;f.input.listeners.blur();assert.equal(f.input.value,'25');assert.equal(JSON.stringify(assembly),before);assert.equal(f.undos.length,0);
 }
 assert.equal(f.refreshes,0);assert.equal(f.messages.length,5);f.input.listeners.change();assert.equal(f.messages.length,5);
});

test('Distance blur uses document units and rejects an inconsistent target without publishing poses or history',()=>{
 const {assembly,mate}=fixture('distance'),f=inspector(assembly,mate);assert.equal(f.input.value,'20');f.input.value='30';f.input.listeners.blur();
 assert.equal(mate.value,3);assert.equal(f.undos.length,1);assert.equal(f.input.value,'30');f.input.listeners.change();assert.equal(f.undos.length,1);
 const fixed=fixture('distance',true),before=JSON.stringify(fixed.assembly),g=inspector(fixed.assembly,fixed.mate);g.input.value='40';enter(g.input);g.input.listeners.blur();
 assert.equal(g.input.value,'20');assert.equal(g.undos.length,0);assert.equal(JSON.stringify(fixed.assembly),before);
});

test('numeric commit binder calls once for blur, change or Enter and once again for a distinct value',()=>{
 const input={value:'1',listeners:{},addEventListener(type,handler){this.listeners[type]=handler;}};let calls=0;
 bindMateNumericCommit(input,()=>{calls++;input.listeners.blur();});input.value='2';input.listeners.change();input.listeners.blur();enter(input);assert.equal(calls,1,'inspector replacement can blur the field during the commit without reentry');
 input.value='3';input.listeners.blur();assert.equal(calls,2);assert.match(source,/bindMateNumericCommit\(input,commitLimit\)/);
 assert.match(source,/bindMateNumericCommit\(input,function\(\)\{commit\(input\.value\.trim\(\)===''/);
});

test('unexpected callback failure still restores the listed canonical field and releases the commit guard',()=>{
 const {assembly,mate}=fixture(),before=JSON.stringify(assembly);let attempts=0;
 const f=inspector(assembly,mate,{setTopologyMateValue(){attempts++;throw new Error('native unavailable');}});
 f.input.value='30';assert.throws(()=>f.input.listeners.blur(),/native unavailable/);
 assert.equal(f.input.value,'25');assert.equal(JSON.stringify(assembly),before);assert.equal(f.undos.length,0);
 f.input.listeners.change();assert.equal(attempts,1,'canonical restored value does not retrigger failure');
 f.input.value='35';assert.throws(()=>enter(f.input),/native unavailable/);assert.equal(f.input.value,'25');assert.equal(attempts,2);
});

test('Undo capture runs after successful trial solve but before live publication; capture failure leaves live assembly unchanged',()=>{
 const {assembly,mate}=fixture(),before=JSON.stringify(assembly);let captures=0;
 assert.throws(()=>setTopologyMateValue(assembly,mate.id,30,()=>{captures++;assert.equal(JSON.stringify(assembly),before);throw new Error('capture failed');}),/capture failed/);
 assert.equal(captures,1);assert.equal(JSON.stringify(assembly),before);
 const result=setTopologyMateValue(assembly,mate.id,30,()=>{captures++;assert.equal(mate.value,25);});
 assert.equal(result.ok,true);assert.equal(captures,2);assert.equal(mate.value,30);
});

test('accepted scalar edits retain native legacy Screw zero capture so cold motor zero does not drift to the moved pose',()=>{
 const origin={x:0,y:0,z:0},axis={x:0,y:0,z:1};
 const ref=(id,kind)=>topologyReference(id,'face',id+'-'+kind,kind==='axis'?{surface:'cylinder',origin,axis,radius:.25}:{surface:'plane',origin,normal:axis});
 const screw={id:'screw',type:'screw',pitch:.4,coupledMotion:true,a:ref('nut','axis'),b:ref('shaft','axis')};
 const distance={id:'distance',type:'distance',value:0,aligned:true,a:ref('nut','plane'),b:ref('shaft','plane')};
 const assembly={components:[{id:'nut',grounded:true,transform:{x:0,y:0,z:0,rx:0,ry:0,rz:0}},{id:'shaft',transform:{x:0,y:0,z:0,rx:0,ry:0,rz:0}}],topologyMates:[screw,distance],mates:[]};
 distance.b.componentId='missing';const invalidBefore=JSON.stringify(assembly);
 const rejected=setTopologyMateValue(assembly,'distance',.1,()=>assert.fail('failed trial must not capture Undo'));
 assert.equal(rejected.ok,false);assert.equal(JSON.stringify(assembly),invalidBefore,'failed trial cannot publish zero captures or normalized poses');distance.b.componentId='shaft';
 let undos=0;const result=setTopologyMateValue(assembly,'distance',.1,()=>{undos++;assert.equal(screw.coupledAxial0,undefined);assert.equal(distance.value,0);});
 assert.equal(result.ok,true,JSON.stringify(result));assert.equal(undos,1);assert.equal(assembly.topologyMates[0],screw);assert.equal(assembly.topologyMates[1],distance);
 assert.equal(screw.coupledAxialBasis,'component-origin');assert.equal(screw.coupledAxial0,0);assert.ok(Math.abs(screw.coupledPhase0)<1e-12);
 const cold=JSON.parse(JSON.stringify(assembly));cold.topologyMates=cold.topologyMates.filter(mate=>mate.type!=='distance');cold.topologyMates[0].driveTurns=0;
 assert.equal(solveTopologyMates(cold).ok,true);assert.ok(Math.abs(cold.components[1].transform.z)<1e-5,'zero motor returns to original zero, not moved scalar-edit pose');
});
