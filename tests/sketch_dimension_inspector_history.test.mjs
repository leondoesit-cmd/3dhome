import { modelerSource } from "./helpers/modeler_source.mjs";
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHistory} from '../js/edit_history.js';
import {parseSketchDimensionEntry} from '../js/core/sketch_dimension_entry.js';
import {dimensionUnit} from '../js/sketch_equations.js';

const source=modelerSource();
test('actual sketch dimension inspector Enter records its own Undo and stops global commands',()=>{
 let document={sketches:[{id:'sketch',constraints:[{id:'radius',type:'radius',value:0.5}]}]};
 const sketch=document.sketches[0],con=sketch.constraints[0];let undoTitle='',refreshes=0;
 const H=createHistory({get:()=>JSON.stringify(document),set:value=>{document=JSON.parse(value);},onChange:()=>{undoTitle=H.undoLabel();}});H.clear();
 H.push('Add reference geometry');document.reference=true;
 class Input extends EventTarget{value='';disabled=false;}
 const context={el:()=>new Input(),con,sketch,E:{def:document},t:key=>key,dimensionUnit,modelLengthText:value=>String(value*10),modelLengthUnit:()=> 'mm',parseSketchDimensionEntry,collectSymbols:()=>new Map(),
  pushUndo:label=>H.push(label),resolveSketch:()=>true,detachDrivenSketchDimension:()=>{},dismissCommittedDimensionEditor:()=>{},refreshAll:()=>refreshes++,flash:message=>{throw new Error(message);},Event};
 const begin=source.indexOf('var inp = el("input", "md-dim-value")',source.indexOf('function fillSketchPane'));
 const end=source.indexOf('row.appendChild(inp);',begin);
 const input=new Function(...Object.keys(context),source.slice(begin,end)+'return inp;')(...Object.values(context));
 input.value='5.2';const event=new Event('keydown',{cancelable:true,bubbles:true});Object.defineProperty(event,'key',{value:'Enter'});let stopped=false;event.stopPropagation=()=>{stopped=true;};input.dispatchEvent(event);
 assert.equal(event.defaultPrevented,true);assert.equal(stopped,true);assert.equal(con.value,0.52);assert.equal(undoTitle,'opDim');assert.equal(refreshes,1);
 H.undo();assert.equal(document.sketches[0].constraints[0].value,0.5);assert.equal(document.reference,true);
 H.redo();assert.equal(document.sketches[0].constraints[0].value,0.52);
});
