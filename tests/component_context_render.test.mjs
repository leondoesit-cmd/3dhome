import { modelerSource } from "./helpers/modeler_source.mjs";
import { sourceFunctionText, documentHistoryText, withSetters } from "./helpers/source_function.mjs";
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Group as NativeGroup,Vector3} from '../vendor/three/three.module.js';
import {nestedComponentOccurrence,assemblyWithoutNestedOccurrence} from '../js/core/nested_component_edit.js';
import {explodedOccurrenceOffset} from '../js/cad_exploded_view.js';
import {createHistorySnapshotCodec} from '../js/core/history_value_pool.js';

const source=modelerSource();
function fn(name){return sourceFunctionText(source,name);}
class Group {
  constructor(){this.userData={};this.children=[];this.matrix={copy(){return this;},invert(){return this;}};this.position={set:(...values)=>this.xyz=values};this.rotation={set:(...values)=>this.euler=values};}
  updateMatrix(){this.updated=true;}
  add(child){this.children.push(child);}
  traverse(visit){visit(this);this.children.forEach(child=>child.traverse?.(visit));}
}

test('local component Undo snapshots exclude unchanged parent native geometry while assembly transactions still include it',()=>{
  const E={def:{features:[{id:'rib',params:{thickness:.19}}]},contextEdit:{componentId:12}};
  Object.defineProperty(E,'assembly',{get(){throw new Error('local component history must not traverse parent native geometry');},configurable:true});
  const declaration=sourceFunctionText(source,'snapDoc');
  const snap=new Function('E','historySnapshots',declaration+';return snapDoc;')(E,createHistorySnapshotCodec(["meshData","exactTopologyCache"]));
  assert.deepEqual(JSON.parse(snap()),{d:E.def,contextComponentId:12});
  Object.defineProperty(E,'assembly',{value:{components:[{id:12,def:{features:[{id:'old'}]}}]},configurable:true});
  E.contextEdit=null;
  assert.deepEqual(JSON.parse(snap()).a,E.assembly);
});

test('restoring local component Undo retains parent assembly identity and restores only the working recipe',()=>{
  const parent={components:[{id:12,def:{features:[{id:'unchanged-parent-rib'}]}}]};
  const E={docType:'part',contextEdit:{componentId:12},assembly:parent,def:{features:[{id:'new-rib'}]}};
  const noop=()=>{};
  let restoredName;
  const restore=new Function('E','createHistory','closeEvalCard','invalidateDrawing','invalidateInterference','resolveSketch','refreshAll','syncSheetPanel','scanDoc','docSubtree','syncUndoButtons','syncHead','historySnapshots',withSetters('function snapDoc(){return null;}'+documentHistoryText(source))+';return H.set;')(E,options=>options,noop,noop,noop,noop,noop,noop,noop,noop,noop,()=>{restoredName=E.def.name;},createHistorySnapshotCodec(["meshData","exactTopologyCache"]));
  restore(JSON.stringify({d:{name:'Original component',features:[{id:'prior-rib',params:{draftAngle:1}}]},contextComponentId:12}));
  assert.equal(restoredName,'Original component');
  assert.equal(E.assembly,parent);
  assert.equal(E.def.features[0].id,'prior-rib');
  assert.equal(parent.components[0].def.features[0].id,'unchanged-parent-rib');
  E.contextEdit=null;E.docType='assembly';
  const historicalAssembly={components:[{id:12,def:{features:[{id:'before-component-commit'}]}}]};
  restore(JSON.stringify({d:{features:[]},a:historicalAssembly}));
  assert.deepEqual(E.assembly,historicalAssembly);
});

test('context ghosts read edited component pose without building its geometry, and other bodies use presentation-only rendering',()=>{
  const current={id:1,transform:{x:3,y:4,z:5,rx:10,ry:20,rz:30},explodedOffset:{x:2,y:0,z:0}},other={id:2};
  Object.defineProperty(current,'def',{get(){throw new Error('current geometry must not be built for placement');}});
  const E={contextEdit:{componentId:1},assembly:{components:[current,other]}};
  const calls=[],groups=[];
  class TrackedGroup extends NativeGroup {constructor(){super();groups.push(this);}}
  const run=new Function('E','THREE','nestedComponentOccurrence','assemblyWithoutNestedOccurrence','explodedOccurrenceOffset','buildComponentGroup',fn('addAssemblyContextGhosts')+';return addAssemblyContextGhosts;')(E,{Group:TrackedGroup,Vector3},nestedComponentOccurrence,assemblyWithoutNestedOccurrence,explodedOccurrenceOffset,(...args)=>{calls.push(args);return new NativeGroup();});
  const parent=new Group();run(parent);
  assert.deepEqual(calls,[[other,null,'',true]]);
  assert.deepEqual(groups[0].matrix.elements.slice(12,15),[5,4,5]);
  assert.ok(Math.abs(groups[0].matrix.elements[0]-Math.cos(20*Math.PI/180)*Math.cos(30*Math.PI/180))<1e-12);
  assert.equal(parent.children[0].userData.cadAssemblyContext,true);
  assert.equal(parent.children[0].children[0].userData.cadOverlay,true);
});

test('presentation-only flag reaches every body in nested component rendering without changing ordinary selectable bodies',()=>{
  const body={id:8},leaf={id:2,def:{parts:[body]}},assembly={id:1,asm:{components:[leaf]}};
  const E={displayStyle:'solid'},calls=[],previews=[];
  const run=new Function('E','THREE','normalizeTransform','isSubassembly','componentDef','activeParts','buildPart','addFlexibleSpringPreview',fn('buildComponentGroup')+';return buildComponentGroup;')(E,{Group},()=>({x:0,y:0,z:0,rx:0,ry:0,rz:0}),c=>!!c.asm,c=>c.def,d=>d.parts,(...args)=>calls.push(args),(_group,component)=>{previews.push(component);return false;});
  run(assembly,null,'',true);
  assert.equal(calls[0][3],true);
  assert.equal(calls[0][1],body);
  run(leaf,null,'');
  assert.equal(calls[1][3],false);
  assert.equal(E.buildComponent,null);
  assert.deepEqual(previews,[leaf,leaf],'ordinary exact leaf bodies check the preview branch and keep native rendering');
});

test('assembly insertion choices use catalog metadata without copying mesh or topology payloads',()=>{
  const models=[{key:'fresh',name:'Fresh part'}],assemblies=[];
  Object.defineProperty(models[0],'meshData',{get(){throw new Error('choice population must not read geometry');}});
  const host={querySelector(){return null;},appendChild(){}},select={options:[],setAttribute(){},appendChild(o){this.options.push(o);}};
  const element=()=>({appendChild(){},setAttribute(){}});
  const prefix=fn('refreshComponents');
  const setup=prefix.slice(0,prefix.indexOf('  var count ='))+'\n}';
  new Function('root','addFeatureFilter','modelLibraryCache','assemblyLibraryCache','el','document','btn','E','containsAssembly','t','insertAssemblyComponent','openNewContextPart','startTour','selectTourTrack',setup+';refreshComponents();')({querySelector:()=>host},()=>{},models,assemblies,(tag)=>tag==='select'?select:element(),{createElement:()=>element()},()=>element(),{assembly:{key:'current'}},()=>false,x=>x,()=>{},()=>{},()=>{},()=>{});
  assert.equal(select.options[0].value,'fresh');
  assert.equal(select.options[0].textContent,'Fresh part');
});


test('transient flexible component renders its preview without also rendering the unchanged native endpoint',()=>{
  const body={id:8},leaf={id:2,def:{parts:[body]},flexibleSpringState:{height:1.75,exact:false}};
  const E={displayStyle:'solid'};let nativeCalls=0,previewCalls=0;
  const run=new Function('E','THREE','normalizeTransform','isSubassembly','componentDef','activeParts','buildPart','addFlexibleSpringPreview',fn('buildComponentGroup')+';return buildComponentGroup;')(E,{Group},()=>({x:0,y:0,z:0,rx:0,ry:0,rz:0}),()=>false,c=>c.def,d=>d.parts,()=>nativeCalls++,(_group,component)=>{assert.equal(component,leaf);previewCalls++;return component.flexibleSpringState.exact===false;});
  run(leaf,null,'');assert.equal(previewCalls,1);assert.equal(nativeCalls,0);
  leaf.flexibleSpringState.exact=true;run(leaf,null,'');assert.equal(previewCalls,2);assert.equal(nativeCalls,1);
  assert.equal(E.buildComponent,null);
});
