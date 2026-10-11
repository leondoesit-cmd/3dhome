import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import vm from 'node:vm';
import {featureBrowseNodes,featureTreeContext} from '../js/core/feature_browse.js';
import {buildTreeModel} from '../js/core/tree_model.js';
import {sourceFunctionText} from './helpers/source_function.mjs';
const source=readFileSync(new URL('../js/modeler.js',import.meta.url),'utf8');
function doc(){return {metadata:{authoringSystem:'parametric-v1'},references:[],sketches:[{id:'s',name:'Top circle',referenceId:'plane:top',entities:[]}],
 features:[{id:'a',name:'Shaft <custom>',type:'extrude',params:{depth:.8},references:{sketches:['s']}},{id:'b',name:'Socket',type:'extrudeCut',params:{depth:.4},inputs:['a']}],
 history:[{id:'hs',kind:'sketch',targetId:'s'},{id:'ha',kind:'feature',targetId:'a'},{id:'hb',kind:'feature',targetId:'b'}],
 parts:[{id:'body',featureId:'a',exactOperations:[{id:'b'}]}]};}
function context(def){return feature=>featureTreeContext(feature,def,value=>value*10+' mm',type=>type==='extrude'?'Extrude / Boss':'Extrude cut');}
test('compact and full tree show exact driving size/source plane without renaming authored features',()=>{
 const def=doc(),before=JSON.stringify(def),model=buildTreeModel(def,{authoringSystem:'parametric-v1',featureDetail:context(def)});
 const nodes=featureBrowseNodes(model);assert.deepEqual(nodes.map(n=>n.targetId),['s','a','b']);
 assert.equal(nodes[1].name,'Shaft <custom>');assert.equal(nodes[1].detail,'Extrude / Boss · Depth 8 mm · top plane');
 assert.equal(nodes[2].detail,'Extrude cut · Depth 4 mm');
 for(const node of model.nodes)node.collapsed=true;
 assert.deepEqual(featureBrowseNodes(model).map(n=>n.targetId),['s','a','b'],'full history remains browsable when tree sections collapse');
 assert.equal(JSON.stringify(def),before);
 const expression={type:'extrude',params:{depth:'$length'}};assert.equal(featureTreeContext(expression,def),'extrude · Depth $length');
});
function harness(){
 const def=doc(),E={def,docType:'part',mode:'3d',authoring:{phase:'model',featureSelection:[],sketchSelection:[]},topologySelection:[],ssel:[]};
 const make=(tag)=>({tag,children:[],events:{},dataset:{},appendChild(child){this.children.push(child);},setAttribute(key,value){this[key]=value;},addEventListener(name,callback){this.events[name]=callback;}});
 const strip=make('div');Object.defineProperty(strip,'innerHTML',{set(){this.children=[];}});let refreshed=0,expanded=0,formOpen=false;
 const currentTreeModel=()=>buildTreeModel(E.def,{authoringSystem:'parametric-v1',rollbackIndex:E.def.rollbackIndex,featureDetail:context(E.def),selection:{features:E.authoring.featureSelection,sketches:E.authoring.sketchSelection}});
 const ctx={E,root:{querySelector:key=>key==='#mdFeatureNav'?strip:formOpen?make('div'):null},getLang:()=> 'en',currentTreeModel,featureBrowseNodes,
  btn:(text,click)=>{const b=make('button');b.textContent=text;b.click=click;return b;},el:make,cadIcon:()=>'<svg/>',refreshAll(){refreshed++;},showModelerSheet(key){assert.equal(key,'tree');expanded++;}};
 vm.runInNewContext([sourceFunctionText(source,'partBelongsToFeature'),sourceFunctionText(source,'partsForFeature'),sourceFunctionText(source,'selectTreeNode'),sourceFunctionText(source,'syncFeatureNavigator')].join('\n'),ctx);
 return {E,strip,ctx,get refreshed(){return refreshed;},get expanded(){return expanded;},set formOpen(value){formOpen=value;}};
}
test('native feature selector highlights the owning cut body and expands original tree without changing history',()=>{
 const h=harness(),before=JSON.stringify(h.E.def);h.ctx.syncFeatureNavigator();assert.equal(h.strip.hidden,false);
 h.E.authoring.sketchSelection=['s'];
 const select=h.strip.children.find(n=>n.tag==='select');assert.equal(select['aria-label'],'Browse model features');
 select.value='feature:b';select.events.change();assert.deepEqual(Array.from(h.E.authoring.featureSelection),['b']);assert.equal(h.E.sel,h.E.def.parts[0]);assert.equal(h.refreshed,1);assert.deepEqual(Array.from(h.E.authoring.sketchSelection),[]);
 h.strip.children.find(n=>n['aria-label']==='Expand feature tree').click();assert.equal(h.expanded,1);
 assert.equal(JSON.stringify(h.E.def),before);
 h.formOpen=true;h.ctx.syncFeatureNavigator();assert.equal(h.strip.hidden,true);
});
test('sketch browsing stays in model mode and stale or rolled back choices cannot act',()=>{
 const h=harness();h.ctx.syncFeatureNavigator();let select=h.strip.children.find(n=>n.tag==='select');
 select.value='sketch:s';select.events.change();assert.equal(h.E.authoring.phase,'model');assert.equal(h.E.sel,h.E.def.parts[0]);
 assert.deepEqual(Array.from(h.E.authoring.sketchSelection),['s']);
 h.E.def.rollbackIndex=2;h.ctx.syncFeatureNavigator();select=h.strip.children.find(n=>n.tag==='select');assert.equal(select.children.find(n=>n.value==='feature:b').disabled,true);
 const before=h.refreshed;select.value='feature:b';select.events.change();assert.equal(h.refreshed,before);
 h.E.def=doc();select.value='feature:a';select.events.change();assert.equal(h.refreshed,before);
});
