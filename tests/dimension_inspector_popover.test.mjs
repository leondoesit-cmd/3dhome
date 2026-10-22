import { modelerSource } from "./helpers/modeler_source.mjs";
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const source=modelerSource();
const helperStart=source.indexOf('function dismissCommittedDimensionEditor(');
const helper=source.slice(helperStart,source.indexOf('\nfunction dimensionEditorUnit(',helperStart));
const start=source.indexOf('inp.addEventListener("change", function () {',source.indexOf('// A driving dimension is editable in place'));
const handler=source.slice(start+'inp.addEventListener("change", function () {'.length,source.indexOf('\n      });',start));

for(const resolves of [true,false])test(`inspector dimension ${resolves?'commit supersedes':'refusal retains'} a matching active popover`,()=>{
 const con={id:'diameter',value:3.4},sketch={constraints:[con]},E={def:{},dimEditor:{sketch,constraint:con,before:{value:3.4}}};
 const dismiss=new Function('E','hideDimensionEditor',helper+';return dismissCommittedDimensionEditor;')(E,()=>{E.dimEditor=null;});
 const run=new Function('inp','con','sketch','E','parseSketchDimensionEntry','modelLengthUnit','collectSymbols','pushUndo','t','resolveSketch','explainSketchConflict','H','showSketchRefusal','relationSubjects','sketchInstanceNames','instanceLabels','detachDrivenSketchDimension','dismissCommittedDimensionEditor','refreshAll',handler);
 run({value:'1.18'},con,sketch,E,()=>({value:1.18,expr:null}),()=> 'cm',()=>new Map(),()=>{},x=>x,()=>resolves,()=>({}),{discard(){}},()=>{},()=>[],()=>({}),()=>({}),()=>{},dismiss,()=>{});
 assert.equal(con.value,resolves?1.18:3.4);
 assert.equal(E.dimEditor===null,resolves);
 // Finish sketch applies an open popover's captured value. Successful inline
 // commits must leave no stale popover able to overwrite the new dimension.
 if(E.dimEditor)con.value=E.dimEditor.before.value;
 assert.equal(con.value,resolves?1.18:3.4);
});

test('an inspector commit never dismisses another constraint or sketch editor',()=>{
 const sketch={},con={},E={dimEditor:{sketch,constraint:{}}};let hidden=0;
 const dismiss=new Function('E','hideDimensionEditor',helper+';return dismissCommittedDimensionEditor;')(E,()=>hidden++);
 dismiss(sketch,con);dismiss({},E.dimEditor.constraint);assert.equal(hidden,0);
});
