import { modelerSource } from "./helpers/modeler_source.mjs";
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sourceFunctionText} from './helpers/source_function.mjs';
import {topologyReference,solveTopologyMates} from '../js/cad_mates.js';
import {setConcentricAxisDirection} from '../js/cad_screw_controls.js';
const p=(x,y,z)=>({x,y,z}),axis=p(0,1,0);
const cylinder=id=>topologyReference(id,'face',id+'-cylinder',{surface:'cylinder',origin:p(0,0,0),axis,radius:.2});
const plane=id=>topologyReference(id,'face',id+'-plane',{surface:'plane',origin:p(0,0,0),normal:axis});
function fixture(opposed=false,seat=false){return {components:[{id:'weight',grounded:true,transform:{}},{id:'hook',transform:{rx:opposed?180:0}}],topologyMates:[{id:'axis',type:'concentric',a:cylinder('weight'),b:cylinder('hook'),aligned:false},...(seat?[{id:'seat',type:'coincident',a:plane('weight'),b:plane('hook'),aligned:true}]:[])]};}
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);

test('legacy concentric automatic preserves opposite pose; explicit direction drives native axis and cold survives',()=>{
 const a=fixture(true);assert.equal(solveTopologyMates(a).ok,true);near(Math.abs(a.components[1].transform.rx),180);assert.equal(a.topologyMates[0].axisOpposed,undefined);
 let undo=0;assert.equal(setConcentricAxisDirection(a,'axis',false,()=>undo++).ok,true);near(a.components[1].transform.rx,0);assert.equal(undo,1);
 const cold=JSON.parse(JSON.stringify(a));assert.equal(solveTopologyMates(cold).ok,true);near(cold.components[1].transform.rx,0);assert.equal(cold.topologyMates[0].axisOpposed,false);
 assert.equal(setConcentricAxisDirection(a,'axis',true).ok,true);near(Math.abs(a.components[1].transform.rx),180);
 assert.equal(setConcentricAxisDirection(a,'axis',null).ok,true);assert.equal(Object.hasOwn(a.topologyMates[0],'axisOpposed'),false);near(Math.abs(a.components[1].transform.rx),180);
});

test('direction conflict with retained axial face rejects without mutation or Undo; aligned branch retains seat',()=>{
 const a=fixture(false,true);assert.equal(solveTopologyMates(a).ok,true);const before=JSON.stringify(a);let undo=0;
 const bad=setConcentricAxisDirection(a,'axis',true,()=>undo++);assert.equal(bad.ok,false);assert.equal(JSON.stringify(a),before);assert.equal(undo,0);
 assert.equal(setConcentricAxisDirection(a,'axis',false,()=>undo++).ok,true);near(a.components[1].transform.rx,0);assert.equal(undo,1);assert.equal(solveTopologyMates(a).ok,true);
 assert.equal(setConcentricAxisDirection(a,'axis','opposed').ok,false);
});

test('actual inspector control directly selects Aligned/Opposed/Automatic with an accessible stable name',()=>{
 const source=modelerSource(),a=fixture(true),mate=a.topologyMates[0];let undo=0,refresh=0;
 const context={E:{assembly:a},setConcentricAxisDirection,pushUndo:()=>undo++,flash:()=>{throw new Error('unexpected rejection');},solveAssembly:()=>solveTopologyMates(a),refreshAll:()=>refresh++,el:(tag,cls,label)=>({tag,label,children:[],appendChild(c){this.children.push(c);},setAttribute(k,v){this[k]=v;},addEventListener(k,fn){this[k]=fn;}})};
 const make=new Function(...Object.keys(context),sourceFunctionText(source,'concentricAxisDirectionControl')+';return concentricAxisDirectionControl;')(...Object.values(context));
 for(const value of ['aligned','opposed','automatic']){const control=make(mate).children[1];assert.equal(control['aria-label'],'Concentric axis direction');assert.deepEqual(control.children.map(o=>o.label),['Automatic','Aligned','Opposed']);control.value=value;control.change();}
 assert.equal(undo,3);assert.equal(refresh,3);assert.equal(mate.axisOpposed,undefined);
});
