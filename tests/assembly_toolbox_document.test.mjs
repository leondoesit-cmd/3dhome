import test from 'node:test';
import assert from 'node:assert/strict';
import {toolboxFastener} from '../js/cad_toolbox.js';
import {assemblyToolboxDocument,hasSingleToolboxKernelRecipe} from '../js/cad_assembly_toolbox.js';
import {compileKernelFeatureTree} from '../js/core/kernel_feature_adapter.js';

test('assembly washer is an editable native recipe after save/reopen and size revision',()=>{
  const generated=toolboxFastener({kind:'washer-flat',sizeKey:'M8',size:'M8',lod:2});
  let next=20;
  const doc=assemblyToolboxDocument(generated,{key:'washer-qa',nextId:()=>next++});
  assert.equal(doc.parts[0].id,20);
  assert.equal(doc.features.length,1);
  assert.equal(doc.history.length,1);
  assert.equal(doc.features[0].type,'toolbox');
  assert.equal(doc.toolboxParts[0].featureId,doc.features[0].id);
  assert.notEqual(doc.parts[0],generated.parts[0]);
  const reopened=JSON.parse(JSON.stringify(doc));
  const compiled=compileKernelFeatureTree(reopened);
  assert.equal(compiled.ok,true,JSON.stringify(compiled.issues));
  assert.ok(compiled.features.length>0);
  const before=JSON.stringify(compiled.features);
  reopened.features[0].params.sizeKey='M10';
  reopened.features[0].params.size='M10';
  const revised=compileKernelFeatureTree(reopened);
  assert.equal(revised.ok,true);
  assert.notEqual(JSON.stringify(revised.features),before,'size edit changes the native geometric recipe');
  assert.equal(doc.features[0].params.sizeKey,'M8','occurrence edits leave the original generated source untouched');
});

test('failed standard generation cannot insert an empty assembly component',()=>{
  assert.throws(()=>assemblyToolboxDocument({ok:false,message:'unknown size'}),/unknown size/);
});

test('pan screw viewport primitives and cutters remain one complete native evaluation recipe',()=>{
  const doc=assemblyToolboxDocument(toolboxFastener({kind:'ansi-pan-cross',sizeKey:'5/16',lengthMm:19.05,lod:2}));
  assert.equal(doc.parts.length,4);
  assert.equal(doc.parts.filter(part=>part.previewOnly).length,2);
  assert.equal(hasSingleToolboxKernelRecipe(JSON.parse(JSON.stringify(doc))),true);
  const compiled=compileKernelFeatureTree(doc);
  assert.equal(compiled.ok,true,JSON.stringify(compiled.issues));
  assert.equal(compiled.features.at(-1).type,'subtract');
  assert.equal(compiled.features.at(-1).id,doc.features[0].id);
  assert.equal(hasSingleToolboxKernelRecipe({...doc,parts:[...doc.parts,{id:'unrelated'}]}),false);
  assert.equal(hasSingleToolboxKernelRecipe({...doc,rollbackIndex:0}),false);
  assert.equal(hasSingleToolboxKernelRecipe({...doc,features:[...doc.features,{type:'extrude',id:'later'}]}),false);
});

test('saved null rollback preserves the complete native screw recipe for interference',()=>{
  const doc=assemblyToolboxDocument(toolboxFastener({kind:'shcs',size:'M6',sizeKey:'M6',lengthMm:25,lod:2}));
  const reopened=JSON.parse(JSON.stringify({...doc,rollback:null,rollbackIndex:null}));
  assert.ok(reopened.parts.length>1,'screw uses multiple display projections');
  assert.equal(hasSingleToolboxKernelRecipe(reopened),true,'null denotes no legacy rollback');
  const compiled=compileKernelFeatureTree(reopened);
  assert.equal(compiled.ok,true,JSON.stringify(compiled.issues));
  assert.equal(compiled.features.at(-1).id,reopened.features[0].id,'all projections lower to one native body');
  for(const rollback of [0,1]) {
    assert.equal(hasSingleToolboxKernelRecipe({...reopened,rollback}),false,'active legacy rollback cannot use the full recipe');
  }
  assert.equal(hasSingleToolboxKernelRecipe({...reopened,rollback:-1}),true);
  assert.equal(hasSingleToolboxKernelRecipe({...reopened,rollbackIndex:0}),false);
});
