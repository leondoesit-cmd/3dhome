import { stylesSource } from "./helpers/styles_source.mjs";
import { modelerSource } from "./helpers/modeler_source.mjs";
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {assemblyDependencyGraph,partDependencyGraph,dependencyVisualization,occurrenceDependencyId as occurrence,mateDependencyId as mate} from '../js/core/dependency_visualization.js';
import {dependencyTreeIndex,dependencyTreeAnchor,renderDependencyPresentation} from '../js/modeler_dependency_ui.js';
import {sourceFunctionText} from './helpers/source_function.mjs';
const assembly={components:[{id:'left',name:'Left',asm:{components:[{id:7,name:'Pin'},{id:8,name:'Plate'}],topologyMates:[{id:3,type:'coincident',a:{componentId:7,persistentId:'face:1',kind:'face'},b:{componentId:8,persistentId:'face:2',kind:'face'}}]}},{id:'right',name:'Right',asm:{components:[{id:7,name:'Pin'}]}}],mates:[{id:3,type:'distance',a:'left',b:'right'}],topologyMates:[{id:3,type:'concentric',a:{componentId:'left',persistentId:'7/edge:1',kind:'edge'},b:{componentId:'right',persistentId:'7/face:1',kind:'face'}}]};
test('assembly mate and occurrence hover use exact nested paths, distinct mate kinds and no source mutation',()=>{
 const before=JSON.stringify(assembly),g=assemblyDependencyGraph(assembly),focus=mate([],'topology',3),s=dependencyVisualization(g,focus);
 assert.deepEqual([...s.upstream].sort(),[occurrence(['left',7]),occurrence(['right',7])].sort());assert.equal(s.downstream.size,0);
 assert.ok(s.relations.some(e=>e.label==='edge 7/edge:1'));
 const pin=dependencyVisualization(g,occurrence(['left',7]));assert.ok(pin.downstream.has(focus));assert.ok(pin.downstream.has(mate(['left'],'topology',3)));assert.ok(!pin.downstream.has(mate([],'legacy',3)));
 assert.equal(g.nodes.get(occurrence(['left',7])).name,'Left / Pin');assert.equal(JSON.stringify(assembly),before);
});
test('Parent and Child controls are independent; invalid/ambiguous paths fail closed; explicit origin only',()=>{
 const g=assemblyDependencyGraph(assembly);assert.equal(dependencyVisualization(g,mate([],'topology',3),{parents:false}).upstream.size,0);
 assert.equal(dependencyVisualization(g,occurrence(['left',7]),{children:false}).downstream.size,0);
 const bad=structuredClone(assembly);bad.topologyMates[0].a.persistentId='missing/face:1';const b=assemblyDependencyGraph(bad);assert.ok(b.issues.length);assert.ok(!b.edges.some(e=>e.to===mate([],'topology',3)&&e.side==='a'));
 bad.components.push({id:'right'});assert.ok(assemblyDependencyGraph(bad).issues.some(i=>i.reason==='Ambiguous component occurrence'));
 assert.ok(![...g.nodes.values()].some(n=>n.kind==='reference'));
 bad.topologyMates[0].a={componentId:'assembly:origin',kind:'face',persistentId:'plane:Front'};assert.ok(assemblyDependencyGraph(bad).nodes.has(occurrence(['assembly:origin'])));
});
test('part feature/sketch ancestry and directed references survive collapsed tree/reorder, and stale targets clear',()=>{
 const g=partDependencyGraph({sketches:[{id:'s',name:'Base sketch'}],features:[{id:'a',type:'extrude',name:'Boss1',references:{sketches:['s']}},{id:'b',type:'pattern',name:'Pattern',inputs:['a']}]});
 const s=dependencyVisualization(g,'b');assert.deepEqual([...s.upstream],['a','s']);assert.equal(s.relations.length,2);
 const model={nodes:[{id:'history',name:'History',children:[{id:'boss',targetId:'a',name:'Boss1',children:[{id:'sketch',targetId:'s',name:'Base sketch'}]},{id:'pattern',targetId:'b',children:[]}]}]};
 const i=dependencyTreeIndex(model);assert.deepEqual(dependencyTreeAnchor(i,'s',new Set(['boss','pattern'])),{id:'boss',collapsed:true});assert.equal(dependencyTreeAnchor(i,'s',new Set()),null);
 model.nodes[0].children.reverse();assert.deepEqual(dependencyTreeAnchor(dependencyTreeIndex(model),'s',new Set(['boss'])),{id:'boss',collapsed:true});assert.equal(dependencyVisualization(g,'deleted'),null);
});
test('actual canonical pattern fixture includes explicit sketch-plane support without invented Origin links',()=>{
 const {document}=JSON.parse(fs.readFileSync(new URL('./fixtures/ch4_rollback_native_source.json',import.meta.url),'utf8'));
 const before=JSON.stringify(document),g=partDependencyGraph(document),s=dependencyVisualization(g,'feature_mv2xd0p0_2');
 assert.ok(s.upstream.has('plane:top'));assert.ok(s.relations.some(e=>e.from==='plane:top'&&e.to==='sk_1zmp0'));
 assert.ok(!s.upstream.has('origin'));assert.equal(JSON.stringify(document),before);
 const collar={references:[{id:'plane:top',type:'plane',name:'Top Plane'},{id:'plane6472',type:'plane',name:'Collar plane',baseReferenceId:'plane:top'}],sketches:[{id:'collar',referenceId:'plane6472'}],features:[{id:'boss',type:'extrude',params:{sketchId:'collar'}}]};
 const chain=dependencyVisualization(partDependencyGraph(collar),'boss');assert.ok(chain.upstream.has('plane6472'));assert.ok(chain.upstream.has('plane:top'));assert.ok(chain.relations.some(e=>e.from==='plane:top'&&e.to==='plane6472'));
});
test('production mouse and keyboard hover send mate identity separately from rigid selection, and leave clears',()=>{
 const source=fs.readFileSync(new URL('../js/modeler_tree.js',import.meta.url),'utf8'),events={},calls=[];
 const node={id:'tmate:3',targetId:'left',dependencyId:mate([],'topology',3),can:{},children:[]};
 const row={addEventListener(k,fn){(events[k]||=[]).push(fn);},contains:()=>false};
 const wire=new Function(sourceFunctionText(source,'wireRow')+';return wireRow;')();wire(row,node,{}, {onHover:(...args)=>calls.push(args)},{});
 events.mouseenter[0]();assert.equal(calls.at(-1)[0],'left');assert.equal(calls.at(-1)[1].dependencyId,node.dependencyId);
 events.mouseleave[0]();assert.equal(calls.at(-1)[0],null);events.focusin.forEach(fn=>fn());assert.equal(calls.at(-1)[1],node);events.focusout[0]({relatedTarget:null});assert.equal(calls.at(-1)[0],null);
});
test('actual assembly handler consumes occurrence/mate dependency identity rather than rigid selection target',()=>{
 const source=modelerSource(),calls=[];
 const handlers=new Function('setDependencyHighlight',sourceFunctionText(source,'assemblyTreeHandlers')+';return assemblyTreeHandlers;')(id=>calls.push(id))({});
 handlers.onHover('left',{dependencyId:mate([],'topology',3)});assert.equal(calls.at(-1),mate([],'topology',3));
 handlers.onHover('left',{dependencyId:occurrence(['left',7])});assert.equal(calls.at(-1),occurrence(['left',7]));handlers.onHover(null);assert.equal(calls.at(-1),null);
});

test('real presentation creates independent controls, named collapsed references, directed SVG arrows and recomputes scroll',()=>{
 class Node {
  constructor(tag){this.tag=tag;this.children=[];this.dataset={};this.attributes={};this.events={};this.className='';this.style={};this.rect={left:0,right:200,top:0,bottom:20,width:200,height:20};this.classList={add:n=>this.className+=' '+n,remove:n=>this.className=this.className.split(/\s+/).filter(c=>c!==n).join(' ')};}
  appendChild(n){n.parent=this;this.children.push(n);return n;}append(...nodes){nodes.forEach(n=>this.appendChild(n));}insertBefore(n){n.parent=this;this.children.unshift(n);}replaceChildren(){this.children=[];}remove(){this.parent.children=this.parent.children.filter(n=>n!==this);}
  setAttribute(k,v){this.attributes[k]=v;}addEventListener(k,fn){this.events[k]=fn;}getBoundingClientRect(){return this.rect;}
  querySelectorAll(selector){const match=n=>selector==='#mdParts'?n.attributes.id==='mdParts':selector==='[data-node-id]'?!!n.dataset.nodeId:selector==='input'?n.tag==='input':n.className.split(/\s+/).includes(selector.slice(1));return this.children.flatMap(n=>[...(match(n)?[n]:[]),...n.querySelectorAll(selector)]);}
  querySelector(s){return this.querySelectorAll(s)[0]||null;}
 }
 const oldDocument=globalThis.document,oldWindow=globalThis.window;
 globalThis.document={createElement:t=>new Node(t),createElementNS:(_,t)=>new Node(t)};globalThis.window={innerHeight:900,innerWidth:1200};
 try{
  const root=new Node('root'),host=new Node('div');host.setAttribute('id','mdParts');root.append(host);const mount=new Node('div');mount.className='md-tree-mount';host.append(mount);
  const boss=new Node('div');boss.dataset.nodeId='boss';const pattern=new Node('div');pattern.dataset.nodeId='pattern';pattern.rect={...pattern.rect,top:60,bottom:80};mount.append(boss,pattern);
  const model={nodes:[{id:'boss',name:'Boss1',targetId:'a',children:[{id:'sketch',name:'Base sketch',targetId:'s',children:[]}]},{id:'pattern',targetId:'b',name:'Pattern',children:[]}]};
  const doc={sketches:[{id:'s',name:'Base sketch'}],features:[{id:'a',name:'Boss1',type:'extrude',inputs:['s']},{id:'b',name:'Pattern',type:'pattern',inputs:['a']}]},before=JSON.stringify(doc),graph=partDependencyGraph(doc),options={parents:true,children:true};let state=dependencyVisualization(graph,'b',options);
  const draw=()=>renderDependencyPresentation(root,model,state,options,(key,value)=>{options[key]=value;state=dependencyVisualization(graph,'b',options);draw();});draw();
  const text=n=>[n.textContent,...n.children.map(text)].join(' ');assert.match(text(root),/Base sketch → Boss1/);assert.match(text(root),/inside Boss1/);
  const calls=root.querySelector('.md-dependency-callouts');assert.equal(calls.parent,root,'reference content is outside tree/control host flow');assert.equal(host.querySelector('.md-dependency-callouts'),null);assert.equal(calls.style.left,'208px');
  const panel=host.querySelector('.md-dependency-panel');assert.equal(panel.children.length,1,'only persistent controls consume tree layout space');
  const css=stylesSource();const calloutStyle=css.match(/\.md-dependency-callouts \{([^}]+)\}/)[1];assert.match(calloutStyle,/position:\s*fixed/);assert.match(calloutStyle,/pointer-events:\s*none/);
  let svg=mount.querySelector('.md-dependency-arrows');assert.equal(svg.children.length,1);const first=svg.children[0].attributes.d;
  pattern.rect={...pattern.rect,top:100,bottom:120};root.events.scroll();svg=mount.querySelector('.md-dependency-arrows');assert.notEqual(svg.children[0].attributes.d,first);
  const parentInput=host.querySelectorAll('input').find(n=>n.dataset.dependencyOption==='parents');parentInput.checked=false;parentInput.events.change();assert.equal(state.upstream.size,0);assert.equal(mount.querySelector('.md-dependency-arrows').children.length,0);
  assert.equal(options.children,true);assert.equal(host.querySelectorAll('input').length,2);
  state=null;draw();assert.equal(mount.querySelector('.md-dependency-arrows'),null);assert.equal(JSON.stringify(doc),before);
 }finally{globalThis.document=oldDocument;globalThis.window=oldWindow;}
});
