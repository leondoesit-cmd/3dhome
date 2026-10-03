import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sourceFunctionText} from './helpers/source_function.mjs';

const source=readFileSync(new URL('../js/modeler.js',import.meta.url),'utf8');
function harness(part) {
  const base={id:'boss',type:'extrude',name:'Base extrude',params:{depth:8}};
  const hole={id:'holes',type:'hole',name:'Hole wizard 1',params:{diameter:4.5}};
  const E={def:{metadata:{},features:[base,hole],parts:part?[part]:[]},sel:part,
    authoring:{featureSelection:[]},topologySelection:[{ownerFeatureId:'boss'}]};
  const host={children:[],appendChild(node){this.children.push(node);}};
  const context={E,root:{querySelector:()=>host},fillCabinetParameters(){},isCanonicalAuthoring:()=>true,
    featureSpec:()=>({}),highlightFeatureIssueBanner(){},t:x=>x,emptyState(){},
    el:(tag,cls,text)=>({tag,cls,text,children:[],appendChild(node){this.children.push(node);}}),
    btn:(text,click)=>({text,click}),openFeatureEditor:feature=>{context.opened=feature;},
    refreshAll(){},cutTargetFeatureId:p=>p.head};
  for(const name of ['topologySelectionFeature','inspectorHistoryFeature','fillShape','selectTreeNode']) {
    context[name]=Function(...Object.keys(context),'return ('+sourceFunctionText(source,name)+')')(...Object.values(context));
  }
  return {E,host,context,hole,base};
}

for(const projected of [true,false]) test(`history Hole Wizard edit follows selection with ${projected?'merged':'no'} projected part`,()=>{
  const h=harness(projected?{kind:'ext',featureId:'boss',head:'holes'}:null);
  h.context.selectTreeNode({kind:'feature',targetId:'holes'},{mode:'canonical'},{});
  assert.deepEqual(h.E.topologySelection,[],'old model face must not override history selection');
  h.context.fillShape();
  const edit=h.host.children.find(node=>node.text?.includes('Edit feature in history'));
  assert.ok(edit,'explicit history selection has an edit action even without a separate body');
  edit.click();assert.equal(h.context.opened,h.hole);
});

test('ordinary body row clears history intent and edits its own producing feature',()=>{
  const h=harness({id:'body',kind:'ext',featureId:'boss',head:'holes'});
  h.E.authoring.featureSelection=['holes'];h.E.topologySelection=[];
  h.context.selectTreeNode({kind:'body',targetId:'body'},{mode:'canonical'},{});
  assert.deepEqual(h.E.authoring.featureSelection,[]);
  h.context.fillShape();h.host.children.find(node=>node.text?.includes('Edit feature in history')).click();
  assert.equal(h.context.opened,h.base);
});

test('canvas part pick replaces explicit history intent while additive picks retain feature collectors',()=>{
  for(const additive of [false,true]) {
    const h=harness({kind:'ext',featureId:'boss'});
    h.E.docType='part';h.E.authoring.featureSelection=['holes'];
    const pick=Function('E','resolveTopologyPick','chooseSketchReference','refreshSelection','commandSelectionPrefer',
      'return ('+sourceFunctionText(source,'pickAssemblyComponent')+')')(h.E,
        ()=>({helixId:'reference'}),()=>{},()=>{},()=> 'all');
    pick({ctrlKey:additive},{grp:{}});
    assert.deepEqual(h.E.authoring.featureSelection,additive?['holes']:[]);
  }
});

test('clear selection also clears a history feature without its own projection',()=>{
  const h=harness(null);h.E.authoring.featureSelection=['holes'];
  const clear=Function('E','refreshAll','return ('+sourceFunctionText(source,'clearMobileSelection')+')')(h.E,()=>{});
  clear();assert.deepEqual(h.E.authoring.featureSelection,[]);
});
