import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sourceFunctionText} from './helpers/source_function.mjs';
import {formatDocumentScreenScale} from '../js/core/document_length_units.js';

test('D6 mm sketch scale uses document units rather than a room-sized percentage baseline',()=>{
 assert.equal(formatDocumentScreenScale(894.06,'mm'),'89.41 px/mm');
 assert.equal(formatDocumentScreenScale(894.06,'cm'),'894.1 px/cm');
 assert.equal(formatDocumentScreenScale(100,'in'),'254 px/in');
 assert.equal(formatDocumentScreenScale(Infinity,'mm'),'—');assert.equal(formatDocumentScreenScale(0,'mm'),'—');
});
test('actual status line reports scale during sketching and omits stale sketch zoom in orbit view',()=>{
 const source=readFileSync(new URL('../js/modeler.js',import.meta.url),'utf8'),st={};
 const E={mode:'3d',docType:'part',scl:894.06,view:'front',grid:1,modelPlaneActive:false,def:{}};
 const context={E,root:{querySelector:()=>st},t:key=>key,activeSketchFrame:()=>null,sketchPlaneCaption:()=> 'Front',modelLengthText:String,modelLengthUnit:()=> 'mm',formatDocumentScreenScale,sketchSelectionSummary:()=>'',inferAuthoringMode:()=> 'parametric',activeParts:()=>[],nativeSolidSummary:()=>({}),hasSingleToolboxKernelRecipe:()=>false,rebuildStatusCaption:()=> '',topologyStatusCaption:()=> '',documentDirty:()=>false};
 const run=new Function(...Object.keys(context),sourceFunctionText(source,'syncStatusLine')+';return syncStatusLine;')(...Object.values(context));
 run();assert.doesNotMatch(st.innerHTML,/px\/mm|44703%/);
 E.modelPlaneActive=true;run();assert.match(st.innerHTML,/89\.41 px\/mm/);
 E.mode='2d';E.modelPlaneActive=false;run();assert.match(st.innerHTML,/89\.41 px\/mm/);
});
