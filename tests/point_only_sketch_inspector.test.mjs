import { modelerSource } from "./helpers/modeler_source.mjs";
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sourceFunctionText} from './helpers/source_function.mjs';
import {solveSketch} from '../js/sketch_solver.js';
import {createHistory} from '../js/edit_history.js';

const source=modelerSource();
function node(tag,cls,text){return {tag,cls,text,children:[],dataset:{},events:{},style:{},appendChild(child){this.children.push(child);},addEventListener(type,fn){this.events[type]=fn;},setAttribute(key,value){this[key]=value;},closest(){return null;}};}
const walk=n=>[n,...n.children.flatMap(walk)];

test('actual point-only Hole positioning sketch renders geometry and edits coordinates with Undo/Redo',()=>{
 const bundle=JSON.parse(readFileSync(new URL('../artifacts/planchard/FLAT-PLATE-upstream-stage-local-point-pending-diagnostic-browser-2026-10-09.mforge',import.meta.url),'utf8'));
 let document={sketches:[structuredClone(bundle.mainModel.sketches[2])]};const sketch=document.sketches[0],E={def:document,ssel:[]};
 const host=node('div'),root={querySelector:selector=>selector==='#mdSketch'?host:null};let quick,refreshes=0;
 const H=createHistory({get:()=>JSON.stringify(document),set:value=>{document=JSON.parse(value);}});H.clear();
 const context={E,root,el:node,t:key=>key,btn:(label,run,cls)=>{const b=node('button',cls,label);b.click=run;return b;},
  ensureSketch:()=>sketch,solveSketch,sketchProfileAnalysis:()=>({profiles:[],openEnds:[],branchPoints:[],nearMergeCount:0}),surfaceUVGuide:()=>'',
  emptyState:()=>{throw new Error('One point must not be reported as an empty sketch');},buildEquationList:()=>{},syncDofBadge:()=>{},
  highlightSketchIssueBanner:()=>{},sketchRegionAnalysis:()=>({regions:[]}),sketchProfilePresentation:()=>({status:'open',textKey:'profileOpen',icon:'ph-warning'}),
  modelLengthText:value=>String(value/2.54),modelLengthUnit:()=> 'in',entityPoints:()=>[],selectSketch:object=>{E.ssel=[object];},refreshSelection:()=>{refreshes++;}};
 const append=new Function(...Object.keys(context),sourceFunctionText(source,'appendSketchGeometryList')+';return appendSketchGeometryList;')(...Object.values(context));
 context.appendSketchGeometryList=append;
 const prefix=sourceFunctionText(source,'fillSketchPane').split('  if (E.ssel.length) {')[0]+'}';
 new Function(...Object.keys(context),prefix+';fillSketchPane();')(...Object.values(context));
 const nodes=walk(host),details=nodes.find(n=>n.cls==='md-sketch-geometry');assert.ok(details);
 assert.ok(nodes.some(n=>n.cls==='md-dof md-dof-fully-constrained'));
 assert.ok(nodes.every(n=>!String(n.cls).startsWith('md-profile-state')),'point positions do not show false open-solid failure');
 const pointButton=nodes.find(n=>n.dataset.sketchObjectId===String(sketch.points[0].id));assert.ok(pointButton);assert.equal(pointButton.dataset.sketchObjectKind,'point');
 pointButton.events.click({preventDefault(){},stopPropagation(){}});assert.equal(E.ssel[0],sketch.points[0]);
 const start=source.indexOf('      host.appendChild(btn("Set point coordinates"'),end=source.indexOf('      host.appendChild(btn("Pierce curve"',start);
 const editorContext={...context,host,sketch,selPoints:()=>E.ssel,openQuickForm:form=>{quick=form;},pushUndo:label=>H.push(label),cloneData:structuredClone,uid:()=> 'new-fixed',
  resolveSketch:()=>{const result=solveSketch(sketch);return result.status==='fully-constrained';},refreshAll:()=>refreshes++,H};
 editorContext.openSketchPointCoordinates=new Function(...Object.keys(editorContext),sourceFunctionText(source,'openSketchPointCoordinates')+';return openSketchPointCoordinates;')(...Object.values(editorContext));
 new Function(...Object.keys(editorContext),source.slice(start,end))(...Object.values(editorContext));
 host.children.at(-1).click();assert.equal(quick.title,'Point coordinates');
 const before=JSON.stringify(sketch);assert.equal(quick.onApply({x:NaN,y:0}),false);assert.equal(JSON.stringify(sketch),before);
 assert.equal(quick.onApply({x:1.016,y:0}),true);assert.ok(Math.abs(sketch.points[0].x-1.016)<1e-8);
 assert.equal(H.undoLabel(),'Point coordinates');H.undo();assert.ok(Math.abs(document.sketches[0].points[0].x+.508)<1e-8);
 H.redo();assert.ok(Math.abs(document.sketches[0].points[0].x-1.016)<1e-8);assert.ok(refreshes>=2);
});

test('actual geometry list includes standalone points without duplicating entity-owned points',()=>{
 const host=node('div'),sketch={points:[{id:1,x:0,y:0},{id:2,x:1,y:0},{id:3,x:2,y:1}],entities:[{id:'line',type:'line'}]};
 const context={E:{ssel:[]},el:node,t:key=>key,modelLengthText:String,modelLengthUnit:()=> 'mm',entityPoints:()=>sketch.points.slice(0,2)};
 const append=new Function(...Object.keys(context),sourceFunctionText(source,'appendSketchGeometryList')+';return appendSketchGeometryList;')(...Object.values(context));append(host,sketch);
 const buttons=walk(host).filter(n=>n.dataset.sketchObjectKind==='point');assert.deepEqual(buttons.map(n=>n.dataset.sketchObjectId),['1','2','3']);
});

test('genuinely empty sketches retain their empty state and document equations',()=>{
 const sketch={points:[],entities:[],constraints:[]},host=node('div');let empty=0,equations=0,badge=0;
 const context={root:{querySelector:()=>host},E:{def:{}},ensureSketch:()=>sketch,solveSketch,sketchProfileAnalysis:()=>({}),surfaceUVGuide:()=>'',t:key=>key,
  emptyState:()=>empty++,buildEquationList:()=>equations++,syncDofBadge:()=>badge++};
 const prefix=sourceFunctionText(source,'fillSketchPane').split('  // status:')[0]+'}';
 new Function(...Object.keys(context),prefix+';fillSketchPane();')(...Object.values(context));
 assert.deepEqual([empty,equations,badge],[1,1,1]);
});
