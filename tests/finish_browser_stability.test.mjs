import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sourceFunctionText} from './helpers/source_function.mjs';
import {createShellOpeningFaceBrowser,createShellFaceThicknessEditor} from '../js/modeler_shell_thickness_form.js';
import {featureField} from '../js/modeler_feature_form.js';

function el(tag,cls='',text=''){
 const node={tagName:tag.toUpperCase(),cls,children:[],attrs:{},dataset:{},textContent:text,scrollTop:0,classList:{add(){},remove(){}},
  appendChild(child){this.children.push(child);return child;},setAttribute(key,value){this.attrs[key]=value;},removeAttribute(key){delete this.attrs[key];},
  addEventListener(name,fn){(this.listeners ||= {})[name]=fn;},setCustomValidity(){},get options(){return this.children;},set innerHTML(value){this.children=[];},
  querySelector(selector){const wanted=selector.slice(1);return this.children.find(child=>child.cls===wanted)||this.children.map(child=>child.querySelector(selector)).find(Boolean);}};
 return node;
}
const btn=(text,click,cls)=>Object.assign(el('button',cls,text),{click});
const source=readFileSync(new URL('../js/modeler.js',import.meta.url),'utf8');

test('actual edge renderer preserves scroll and physical row labels across checked selection and async redraw',()=>{
 const host=el('div'),part={id:'stock'},candidates=Array.from({length:24},(_,i)=>({kind:'edge',persistentId:'edge:'+i,descriptor:{origin:{x:5,y:i,z:5}}}));let selected=[];
 const E={authoring:{},topologySelection:[]};
 const context={root:{querySelector:()=>host},E,selectedSolid:()=>part,currentFinishEdges:()=>selected,activeFilletParams:()=>null,syncFilletEndpoints(){},
  allCandidateFinishEdges:()=>candidates,el,btn,t:key=>key,selectedTopologyFaces:()=>[],setFinishEdges(){},parallelStraightEdges:()=>[],
  sameFinishEdge:(a,b)=>a.persistentId===b.persistentId,finishEdgeDescription:ref=>'center '+ref.descriptor.origin.y+' · '+('long label '.repeat(5)),
  toggleFinishEdges:refs=>{selected=selected.some(ref=>ref.persistentId===refs[0].persistentId)?selected.filter(ref=>ref.persistentId!==refs[0].persistentId):selected.concat(refs);render();},
  refreshChangedPart(){},finishEdgeLabel:ref=>ref.persistentId};
 const render=new Function(...Object.keys(context),sourceFunctionText(source,'renderFinishEdgeList')+';return renderFinishEdgeList;')(...Object.values(context));
 render();let choices=host.querySelector('.md-edge-browser-choices');choices.scrollTop=340;host.querySelector('.md-edge-browser').open=true;
 const label=choices.children[20].children[1].textContent;choices.children[20].click();
 choices=host.querySelector('.md-edge-browser-choices');assert.equal(choices.scrollTop,340);assert.equal(host.querySelector('.md-edge-browser').open,true);
 assert.equal(choices.children[20].children[1].textContent,label);assert.equal(choices.children[20].attrs['aria-pressed'],'true');assert.equal(selected[0].persistentId,'edge:20');
 choices.children[3].click();assert.deepEqual(selected.map(ref=>ref.persistentId),['edge:20','edge:3']);
 render();assert.equal(host.querySelector('.md-edge-browser-choices').scrollTop,340);
 const css=readFileSync(new URL('../css/modeler.css',import.meta.url),'utf8');assert.match(css,/grid-template-columns: 14px minmax\(0, 1fr\)/);
});

test('Shell opening browser toggles exact face IDs without replacing buttons or touching thickness rows',()=>{
 const host=el('div'),entries=['center','inclined-upper','inclined-lower','top'].map(id=>({kind:'face',persistentId:id,descriptor:{surface:'plane'}}));let selected=[];
 const thicknesses=[{facePersistentId:'top',thickness:2.5}];
 const browser=createShellOpeningFaceBrowser(host,{el,btn,getEntries:()=>entries,getSelected:()=>selected,onChange:faces=>selected=faces,label:entry=>entry.persistentId});
 const choices=host.querySelector('.md-edge-browser-choices'),buttons=choices.children.slice();choices.scrollTop=150;
 buttons[0].click();buttons[1].click();buttons[2].click();browser.sync();
 assert.deepEqual(browser.read().map(face=>face.persistentId),['center','inclined-upper','inclined-lower']);
 assert.deepEqual(choices.children,buttons);assert.equal(choices.scrollTop,150);assert.deepEqual(thicknesses,[{facePersistentId:'top',thickness:2.5}]);
 buttons[1].click();assert.deepEqual(selected.map(face=>face.persistentId),['center','inclined-lower']);
 entries.splice(0,1);browser.sync();assert.throws(()=>browser.read(),/unavailable/);assert.equal(selected[0].persistentId,'center','missing IDs remain explicit, never substituted');
});

test('pending retained-face dropdown choice survives sync and exact refresh until Add',async()=>{
 const host=el('div'),params={thickness:1,direction:'inside',faceThicknesses:[]},choices=['upper','lower'].map(id=>({entry:{persistentId:id,descriptor:{surface:'plane'}},label:id}));
 const editor=createShellFaceThicknessEditor(host,{el,btn,field:(host,definition,value)=>featureField(host,definition,value,{el,units:{length:'mm'}}),t:key=>key,unit:'mm',getParams:()=>params,getChoices:()=>choices,getOpeningIds:()=>[],onChange(){},refresh:async()=>{}});
 const find=(node,name)=>node.attrs['aria-label']===name||node.tagName==='BUTTON'&&node.textContent===name?node:node.children.map(child=>find(child,name)).find(Boolean);
 const picker=find(host,'shellRetainedFace');picker.value='upper';editor.sync();assert.equal(picker.value,'upper');
 await find(host,'shellRefreshFaces').click();assert.equal(picker.value,'upper');find(host,'shellAddThickness').click();
 assert.deepEqual(params.faceThicknesses,[{facePersistentId:'upper',thickness:1}]);
 assert.match(source,/openingBrowser\.read\(\);return readThicknesses\(\)/,'creation and edit commits validate opening IDs');
});

test('actual Shell edit handler persists multi-opening targets and independent thickness overrides',()=>{
 const faces=['center','upper','lower','top'].map(id=>({kind:'face',ownerFeatureId:'boss',persistentId:id,descriptor:{surface:'plane',origin:{x:0,y:0,z:0},normal:{x:1,y:0,z:0}}}));
 const feature={id:'shell',type:'shell',inputs:['boss'],references:{topology:[faces[0]]},params:{thickness:1,direction:'inside',faceThicknesses:[{facePersistentId:'top',thickness:2.5}]}};
 const operation={id:'shell',targets:[faces[0]]},E={def:{features:[feature],parts:[{exactOperations:[operation]}]},authoring:{featureType:'shell'}};let edits=0;
 const context={E,createShellOpeningFaceBrowser,createShellFaceThicknessEditor,el,btn,t:key=>key,
  featureField:(host,definition,value)=>featureField(host,definition,value,{el,units:{length:'mm'}}),
  modelLengthUnit:()=> 'mm',modelLengthText:v=>String(v*10),compileKernelFeatureTree:()=>({ok:true,features:[feature]}),
  verifiedExactTopology:()=>new Map([['boss',faces]]),planarMateFaceChoices:entries=>entries.map(entry=>({entry,label:entry.persistentId})),
  topologyReferenceFromEntry:entry=>structuredClone(entry),cloneData:structuredClone};
 const add=new Function(...Object.keys(context),sourceFunctionText(source,'addShellFaceThicknessControls')+';return addShellFaceThicknessControls;')(...Object.values(context));
 const host=el('div'),editor=add(host,feature,()=>edits++,feature);
 const buttons=host.querySelector('.md-edge-browser-choices').children;buttons[1].click();buttons[2].click();
 assert.deepEqual(feature.references.topology.map(face=>face.persistentId),['center','upper','lower']);
 assert.deepEqual(operation.targets,feature.references.topology);assert.deepEqual(E.topologySelection,feature.references.topology);
 assert.deepEqual(editor.read(),[{facePersistentId:'top',thickness:2.5}]);assert.equal(edits,2);
 assert.equal(Object.hasOwn(feature,'syncShellThicknesses'),false,'functions must not be stored on persisted feature objects');
 assert.deepEqual(JSON.parse(JSON.stringify(feature)).references.topology,feature.references.topology);
});


test('actual 268-edge browser AND filter keeps selected IDs and query across redraws and clears without selecting hidden rows',()=>{
 const host=el('div'),part={id:'lugs'},candidates=Array.from({length:268},(_,i)=>({kind:'edge',persistentId:'edge:'+i,descriptor:{curve:i%2?'circle':'line',origin:{x:5,y:i,z:1}}}));let selected=[];
 const E={authoring:{},topologySelection:[]};let render;
 const context={root:{querySelector:()=>host},E,selectedSolid:()=>part,currentFinishEdges:()=>selected,activeFilletParams:()=>null,syncFilletEndpoints(){},
  allCandidateFinishEdges:()=>candidates,el,btn,t:key=>key,selectedTopologyFaces:()=>[],setFinishEdges(){},parallelStraightEdges:()=>[],
  sameFinishEdge:(a,b)=>a.persistentId===b.persistentId,finishEdgeDescription:ref=>ref.descriptor.curve+' · center (5, '+ref.descriptor.origin.y+', 1) mm',
  toggleFinishEdges:refs=>{selected=selected.some(ref=>ref.persistentId===refs[0].persistentId)?selected.filter(ref=>ref.persistentId!==refs[0].persistentId):selected.concat(refs);render();},
  refreshChangedPart(){},finishEdgeLabel:ref=>ref.persistentId};
 render=new Function(...Object.keys(context),sourceFunctionText(source,'renderFinishEdgeList')+';return renderFinishEdgeList;')(...Object.values(context));render();
 const query=value=>{const input=host.querySelector('.md-edge-browser-search');input.value=value;input.listeners.input();};
 const rows=()=>host.querySelector('.md-edge-browser-choices').children;
 query('LINE center 20');assert.equal(rows().filter(r=>!r.hidden).length,8);assert.equal(host.querySelector('.md-edge-browser-count').textContent,'8 of 268 edges');
 rows()[20].click();assert.equal(host.querySelector('.md-edge-browser-search').value,'LINE center 20');assert.equal(rows()[20].attrs['aria-pressed'],'true');
 rows()[200].click();assert.deepEqual(selected.map(r=>r.persistentId),['edge:20','edge:200']);
 query('circle 21');assert.equal(rows()[20].hidden,true);assert.deepEqual(selected.map(r=>r.persistentId),['edge:20','edge:200']);
 render();assert.equal(host.querySelector('.md-edge-browser-search').value,'circle 21');
 query('nothing matches');assert.equal(rows().filter(r=>!r.hidden).length,0);assert.equal(host.querySelector('.md-edge-browser-count').textContent,'0 of 268 edges');
 host.querySelector('.md-edge-browser-clear').click();assert.equal(rows().filter(r=>!r.hidden).length,268);assert.equal(host.dataset.edgeBrowserFilter,'');assert.equal(rows()[20].attrs['aria-pressed'],'true');
 const css=readFileSync(new URL('../css/modeler.css',import.meta.url),'utf8');assert.match(css,/\.md-edge-browser-label\s*\{[^}]*overflow-wrap: anywhere/s);assert.match(css,/button\[hidden\]\s*\{\s*display: none !important/);
});
