import { modelerSource } from "./helpers/modeler_source.mjs";
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {sourceFunctionText} from './helpers/source_function.mjs';

test('worker footer retains an actionable Cancel button across timer refreshes',()=>{
  const source=modelerSource();
  const node=(cls='')=>({className:cls,children:[],appendChild(child){this.children.push(child);child.parent=this;},setAttribute(){},querySelector(selector){return this.children.find(child=>'.'+child.className===selector)||null;},remove(){this.parent.children=this.parent.children.filter(child=>child!==this);},set textContent(value){this.text=value;this.children=[];},get textContent(){return this.text;}});
  const status=node(),job={startedAt:Date.now(),name:'Exact model',progress:null};let jobs=[job],cancelled=0,flashed='';
  const deps={root:{querySelector(){return status;}},cadWorkerAvailable:()=>true,subscribeCadWorkerActivity:listener=>listener(),cadWorkerActivity:()=>jobs,
    el:(_tag,cls)=>node(cls),btn:(_label,callback,cls)=>Object.assign(node(cls),{callback}),cancelExactModelRebuild:()=>{cancelled++;jobs=[];},flash:value=>{flashed=value;},setInterval:()=>1,clearInterval:()=>{}};
  const run=new Function(...Object.keys(deps),'var exactWorkerActivitySubscribed=false,exactWorkerActivityTimer=0;'+sourceFunctionText(source,'syncExactWorkerActivity')+';return syncExactWorkerActivity;')(...Object.values(deps));
  run();const chip=status.querySelector('.md-exact-activity'),cancel=chip.querySelector('.md-cancel-exact');
  assert.match(chip.querySelector('.md-exact-activity-text').textContent,/Queued/);
  job.progress={stage:'loading-runtime',name:'Exact model'};run();
  assert.match(chip.querySelector('.md-exact-activity-text').textContent,/Loading CAD runtime/);
  job.progress={stage:'queued',name:'Shell'};run();
  assert.match(chip.querySelector('.md-exact-activity-text').textContent,/Queued/);
  job.progress={stage:'finish',name:'Shell'};run();
  assert.equal(chip.querySelector('.md-cancel-exact'),cancel,'the live click target survives every timer tick');
  assert.match(chip.querySelector('.md-exact-activity-text').textContent,/Computing/);
  cancel.callback({stopPropagation(){}});run();
  assert.equal(cancelled,1);assert.match(flashed,/cancelled/);assert.equal(status.children.length,0);
});
