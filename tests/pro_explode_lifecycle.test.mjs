import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sourceFunctionText} from './helpers/source_function.mjs';

const source=readFileSync(new URL('../js/pro_ribbon.js',import.meta.url),'utf8');
function fixture(){
  const node=()=>({dataset:{},attributes:{},span:{textContent:''},writes:0,listeners:{},classList:{toggle(){}},
    querySelector(){return this.span;},setAttribute(key,value){this.attributes[key]=value;this.writes++;},
    getAttribute(key){return this.attributes[key]??null;},addEventListener(key,fn){this.listeners[key]=fn;}});
  const command=node();command.setAttribute('aria-label','Collapse exploded view');command.setAttribute('aria-pressed','true');command.title='Collapse exploded view · Assembly exploded';
  let buttons=[],frame,observer,observeOptions;
  class Observer{constructor(callback){this.callback=callback;observer=this;}observe(_root,options){observeOptions=options;}}
  const doc={createElement:()=>node(),querySelector:selector=>selector.includes('data-command="explode"')?command:null,
    querySelectorAll:()=>buttons};
  const context={document:doc,window:{MutationObserver:Observer},MutationObserver:Observer,
    requestAnimationFrame:callback=>{frame=callback;},L:label=>label,M:key=>key,runProBinding:()=>{},railBindActive:()=>false};
  const api=new Function(...Object.keys(context),'var ribbon=null;'+['syncModelDocumentRibbon','syncExplodeBinding','toolButton','watchEditorCommandState','syncActive'].map(name=>sourceFunctionText(source,name)).join('\n')+';return {toolButton,watchEditorCommandState,syncActive};')(...Object.values(context));
  return{api,command,document:doc,set buttons(value){buttons=value;},get observer(){return observer;},get options(){return observeOptions;},runFrame(){const callback=frame;frame=null;callback();},node};
}

test('Pro ribbon creation and recreation inherit current explode label, tooltip and pressed state',()=>{
  const f=fixture(),tool={label:'Exploded view',bind:'mcmd:explode',icon:'ph-arrows-out'};
  const first=f.api.toolButton(tool);assert.equal(first.span.textContent,'Collapse exploded view');assert.equal(first.getAttribute('aria-pressed'),'true');
  f.command.setAttribute('aria-label','Explode assembly');f.command.setAttribute('aria-pressed','false');f.command.title='Explode assembly · Assembly assembled';
  const recreated=f.api.toolButton(tool);assert.equal(recreated.span.textContent,'Explode assembly');assert.equal(recreated.getAttribute('aria-label'),'Explode assembly');assert.equal(recreated.getAttribute('aria-pressed'),'false');assert.match(recreated.title,/Assembly assembled/);
});

test('ordinary modeler command refresh publishes explode state before the Pro Assembly tab is recreated',async()=>{
  const {assemblyHasExplodedOffsets}=await import('../js/cad_exploded_view.js');
  const f=fixture(),tool={label:'Exploded view',bind:'mcmd:explode',icon:'ph-arrows-out'};
  f.command.setAttribute('data-command','explode');f.command.setAttribute('aria-label','Exploded view');delete f.command.attributes['aria-pressed'];
  const first=f.api.toolButton(tool);f.buttons=[first];
  const E={docType:'assembly',assembly:{components:[{id:'base'},{id:'bolt'}]}};
  const bindings={E,assemblyHasExplodedOffsets,t:key=>key,syncRelationCommands:()=>{},commandCatalog:()=>[{id:'explode',label:'Exploded view'}],
    isCanonicalAuthoring:()=>false,FEATURE_COMMAND:{},COMMAND_TOOLTIP:{},root:{ownerDocument:f.document,querySelector:()=>null,querySelectorAll:()=>[f.command]}};
  const modeler=readFileSync(new URL('../js/modeler.js',import.meta.url),'utf8');
  const refresh=new Function(...Object.keys(bindings),sourceFunctionText(modeler,'syncExplodeCommandState')+sourceFunctionText(modeler,'syncCommandManager')+';return syncCommandManager;')(...Object.values(bindings));
  refresh();assert.equal(f.command.getAttribute('aria-label'),'explodeAssembly');assert.equal(first.span.textContent,'explodeAssembly');
  let recreated=f.api.toolButton(tool);assert.equal(recreated.span.textContent,'explodeAssembly');assert.equal(recreated.getAttribute('aria-pressed'),'false');
  E.assembly.components[1].explodedOffset={x:5,y:0,z:0};refresh();
  recreated=f.api.toolButton(tool);assert.equal(recreated.span.textContent,'collapseExplodeView');assert.equal(recreated.getAttribute('aria-pressed'),'true');
});

test('Pro lifecycle observes source presentation attributes and batches idempotent state synchronization',()=>{
  const f=fixture(),button=f.api.toolButton({label:'Exploded view',bind:'mcmd:explode',icon:'ph-arrows-out'}),root={};f.buttons=[button];
  f.api.watchEditorCommandState(root);const observer=f.observer;f.api.watchEditorCommandState(root);assert.equal(f.observer,observer);
  assert.equal(f.options.childList,true);for(const key of ['aria-label','aria-pressed','title'])assert.ok(f.options.attributeFilter.includes(key));
  f.command.setAttribute('aria-label','Explode assembly');f.command.setAttribute('aria-pressed','false');f.command.title='Explode assembly · Assembly assembled';
  observer.callback();observer.callback();f.runFrame();
  assert.equal(button.span.textContent,'Explode assembly');assert.equal(button.getAttribute('aria-pressed'),'false');
  const writes=button.writes;observer.callback();f.runFrame();assert.equal(button.writes,writes,'synchronized attributes must not create an observer feedback loop');
});
