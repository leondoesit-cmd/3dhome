import test from 'node:test';
import assert from 'node:assert/strict';
import {generateToolboxPart} from '../js/toolbox/generate.js';
import {validateToolboxSpec} from '../js/toolbox/audit.js';
import {assemblyToolboxDocument} from '../js/cad_assembly_toolbox.js';
import {compileKernelFeatureTree} from '../js/core/kernel_feature_adapter.js';
import {toolboxFamily,lengthOptionsForSize} from '../js/toolbox/catalog.js';

test('ANSI inch lengths are exact, not rounded metric substitutions',()=>{
  const lengths=lengthOptionsForSize(toolboxFamily('ansi-pan-cross'),'5/16');
  assert.ok(lengths.includes(.75*25.4));
  assert.ok(lengths.includes(.375*25.4));
  assert.equal(lengths.includes(19),false);
});

test('ANSI hardware preserves inch dimensions and Unified thread declarations on reopen',()=>{
  const washer=generateToolboxPart({kind:'ansi-washer-narrow',sizeKey:'5/16'});
  assert.equal(washer.ok,true);
  assert.equal(washer.metadata.dimensionsMm.idMm,.344*25.4);
  assert.equal(washer.metadata.dimensionsMm.odMm,.688*25.4);
  const nut=generateToolboxPart({kind:'ansi-hex-machine-nut',sizeKey:'5/16'});
  assert.equal(nut.spec.series,'unc');
  assert.equal(nut.spec.toleranceClass,'2B');
  assert.equal(nut.parts[0].threadGeometry.profile,'unified-60');
  for(const generated of [washer,nut]) {
    assert.equal(validateToolboxSpec(generated.metadata).ok,true);
    const doc=JSON.parse(JSON.stringify(assemblyToolboxDocument(generated,{key:generated.kind})));
    assert.equal(compileKernelFeatureTree(doc).ok,true);
  }
});

test('ANSI cross recess is subtracted in the native recipe and remains honestly representative',()=>{
  const generated=generateToolboxPart({kind:'ansi-pan-cross',sizeKey:'5/16',lengthMm:19.05});
  assert.equal(generated.spec.toleranceClass,'2A');
  assert.equal(generated.metadata.representative,true);
  assert.equal(validateToolboxSpec(generated.metadata).status,'representative');
  const doc=JSON.parse(JSON.stringify(assemblyToolboxDocument(generated,{key:'pan-qa'})));
  const tree=compileKernelFeatureTree(doc);
  assert.equal(tree.ok,true,JSON.stringify(tree.issues));
  assert.equal(tree.features.filter(row=>row.type==='subtract').length,2);
  const cutters=tree.features.filter(row=>row.type==='box');
  assert.equal(cutters.length,2);
  assert.ok(cutters.every(row=>row.params.h>0));
  assert.ok(Math.abs(cutters[0].params.w-cutters[1].params.d)<1e-12);
  assert.equal(tree.features.at(-1).id,doc.features[0].id);
  doc.features[0].params.sizeKey='1/4';
  assert.notEqual(JSON.stringify(compileKernelFeatureTree(doc).features),JSON.stringify(tree.features));
});
