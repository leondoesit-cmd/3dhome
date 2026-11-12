import { modelerSource } from "./helpers/modeler_source.mjs";
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sourceFunctionText} from './helpers/source_function.mjs';

const source=modelerSource();
test('Part workflow accessible names follow current history and sketch status after assembly context changes',()=>{
 const keys=['Context','Reference','Sketch','Feature','History'];
 const buttons=keys.map(text=>({heading:{textContent:text},detail:{textContent:''},attrs:{'aria-label':'old assembly label'},classList:{toggle(){}},querySelector:()=>null,querySelectorAll(){return [this.heading,this.detail];},setAttribute(key,value){this.attrs[key]=value;},removeAttribute(key){delete this.attrs[key];}}));
 buttons.forEach(button=>button.querySelector=()=>button.heading);
 const nodes=Object.fromEntries(['Context','Reference','Sketch','Feature','History'].map((key,i)=>['#mdWorkflow'+key,buttons[i].detail]));
 const root={querySelectorAll:()=>buttons,querySelector:key=>nodes[key],classList:{toggle(){}}};
 const sketch={id:'sketch6',entities:[{}],constraints:[]},E={docType:'part',def:{context:{units:{length:'mm'}},history:Array.from({length:12},()=>({kind:'feature'}))},authoring:{phase:'model'}};
 const context={root,E,PART_WORKFLOW:keys,t:value=>value,currentWorkflowStep:()=> 'history',getDomainUnit:()=> 'mm',ensureSketch:()=>sketch,solveSketch:()=>({status:'fully-constrained',degreesOfFreedom:0}),sketchPlaneCaption:()=> 'Front',closedSketchProfile:()=>true,syncCoach(){}};
 const sync=new Function(...Object.keys(context),sourceFunctionText(source,'syncAuthoringWorkflow')+';return syncAuthoringWorkflow;')(...Object.values(context));
 sync();assert.equal(buttons[4].attrs['aria-label'],'History · 12 wfEditableSteps');assert.equal(buttons[2].attrs['aria-label'],'Sketch · wfFullyDefined');
 E.def.history.push({kind:'feature'});E.solveInfo={status:'under-constrained',degreesOfFreedom:2};sync();
 assert.equal(buttons[4].attrs['aria-label'],'History · 13 wfEditableSteps');assert.equal(buttons[2].attrs['aria-label'],'Sketch · wfUnderDefined · 2 wfDof');
});
