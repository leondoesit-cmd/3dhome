import { modelerSource } from "./helpers/modeler_source.mjs";
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parse} from '../vendor/acorn/acorn.mjs';
import {planarMateFaceChoices} from '../js/cad_mate_reference_choices.js';
import {draftFaceChoices} from '../js/core/draft_face_choices.js';
const source=modelerSource();
const ast=parse(source,{ecmaVersion:'latest',sourceType:'module'});
const calls=[];
function visit(node,owner=''){
 if(!node||typeof node!=='object')return;
 if(node.type==='FunctionDeclaration')owner=node.id.name;
 if(node.type==='CallExpression'&&['planarMateFaceChoices','exactMateReferenceChoices','draftFaceChoices'].includes(node.callee?.name))calls.push({node,owner});
 for(const value of Object.values(node)){if(Array.isArray(value))value.forEach(x=>visit(x,owner));else if(value&&typeof value==='object')visit(value,owner);}
}
visit(ast);
const face=(axis,value)=>({kind:'face',ownerFeatureId:'boss',persistentId:'boss:face:'+axis,descriptor:{surface:'plane',origin:{x:0,y:0,z:0,[axis]:value},normal:{x:0,y:0,z:0,[axis]:1}}});

test('all editor face-choice entry points route active document units, including sketch support and async Draft refresh',()=>{
 assert.ok(calls.some(c=>c.owner==='fillSketchPane'));
 assert.ok(calls.some(c=>c.owner==='addTerminatingFaceChoices'));
 for(const {node,owner} of calls){
  assert.equal(node.arguments.length,3,owner+' must supply the display unit');
  assert.equal(source.slice(node.arguments[2].start,node.arguments[2].end),'modelLengthUnit()',owner+' uses active document units');
 }
});

test('actual sketch-support chooser expression displays mm face locations while preserving native descriptors',()=>{
 const {node}=calls.find(c=>c.owner==='fillSketchPane'&&c.node.callee.name==='planarMateFaceChoices');
 const entries=[face('y',4.6),face('x',-7)];
 const E={def:{parts:[{entries}]}};const before=[{id:'boss',name:'Extrude1'}],allowed=new Set(['boss']);
 const choose=new Function('E','before','allowed','topologyEntriesForPart','planarMateFaceChoices','modelLengthUnit','return '+source.slice(node.start,node.end));
 const mm=choose(E,before,allowed,p=>p.entries,planarMateFaceChoices,()=> 'mm');
 assert.match(mm[0].label,/Y 46\.000 mm/);assert.match(mm[1].label,/X -70\.000 mm/);
 assert.equal(mm[0].entry,entries[0]);assert.equal(entries[0].descriptor.origin.y,4.6);
 const inch=choose(E,before,allowed,p=>p.entries,planarMateFaceChoices,()=> 'in');
 assert.match(inch[0].label,/Y 1\.811 in/);
});

test('Draft curved face radius and position labels use document units without changing their native references',()=>{
 const entry={kind:'face',persistentId:'wall',ownerFeatureId:'boss',descriptor:{surface:'cylinder',origin:{x:-7,y:4.6,z:0},radius:.35}};
 const mm=draftFaceChoices([entry],[],'mm')[0];assert.match(mm.label,/R 3\.5 mm.*\(-70, 46, 0\) mm/);
 const cm=draftFaceChoices([entry])[0];assert.match(cm.label,/R 0\.35 cm.*\(-7, 4\.6, 0\) cm/);
 assert.equal(mm.entry,entry);assert.equal(entry.descriptor.radius,.35);
});
