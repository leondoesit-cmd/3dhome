import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sourceFunctionText} from './helpers/source_function.mjs';
import {toolboxFastener} from '../js/cad_toolbox.js';
import {assemblyToolboxDocument,hasSingleToolboxKernelRecipe} from '../js/cad_assembly_toolbox.js';

const source=readFileSync(new URL('../js/modeler.js',import.meta.url),'utf8');
function treeRow(def) {
  const component={id:1,name:'Fastener',def};
  const context={E:{assembly:{components:[component]},componentSel:[]},
    componentDef:c=>c.def,isSubassembly:()=>false,activeParts:d=>d?.parts||[],hasSingleToolboxKernelRecipe,
    assemblyTreeNode:x=>x,assemblyCollapsed:()=>false,planeTreeRows:()=>[],ASSEMBLY_ORIGIN_ID:0,
    t:x=>x,tf:x=>x,countLabel:(n)=>`${n} solids`,freedomLabel:()=>'',componentFreedom:()=>null};
  const build=Function(...Object.keys(context),'return ('+sourceFunctionText(source,'assemblyTreeModel')+')')(...Object.values(context));
  return build().nodes.find(n=>n.id==='section:components').children[0];
}

for(const kind of ['shcs','ansi-pan-cross']) test(`${kind} native Toolbox tree represents one body rather than head/shaft/cutters`,()=>{
  const generated=toolboxFastener({kind,sizeKey:kind==='shcs'?'M6':'5/16',lengthMm:40,lod:2});
  const def=JSON.parse(JSON.stringify(assemblyToolboxDocument(generated)));
  def.rollback=null;
  assert.ok(def.parts.length>1,'recipe has multiple disposable projections');
  const row=treeRow(def);
  assert.equal(row.detail,'1 solids');
  assert.equal(row.children.length,1,'transparent cutter is not listed as an independent solid');
  assert.equal(row.children[0].name,def.features[0].name);
  assert.equal(row.children[0].targetId,1,'body row still selects its occurrence');
});

test('mixed native history and unrelated body records are not collapsed to one Toolbox body',()=>{
  const def=assemblyToolboxDocument(toolboxFastener({kind:'shcs',sizeKey:'M6',lengthMm:40,lod:2}));
  def.features.push({id:'second-body',type:'extrude'});
  def.parts.push({id:'second-body-part',kind:'box',featureId:'second-body'});
  const row=treeRow(def);
  assert.equal(row.detail,`${def.parts.length} solids`);
  assert.equal(row.children.length,def.parts.length);
});

test('rolled-back Toolbox projection records keep their current body listing',()=>{
  const def=assemblyToolboxDocument(toolboxFastener({kind:'shcs',sizeKey:'M6',lengthMm:40,lod:2}));
  def.rollbackIndex=0;
  assert.equal(treeRow(def).children.length,def.parts.length);
});
