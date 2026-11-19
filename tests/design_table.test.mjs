import test from "node:test";
import assert from "node:assert/strict";
import {designTablePart} from "./helpers/design_table_part.mjs";
import {designTableColumns, designTableCell, prepareDesignTable} from "../js/core/design_table.js";
import {setComponentConfiguration} from "../js/core/component_configuration.js";
import {compileKernelFeatureTree} from "../js/core/kernel_feature_adapter.js";
import {regenerateFeatures, releaseRegeneration} from "../js/cad_feature_tree.js";
import {shapeMassProperties} from "../js/cad_kernel.js";
import {setActiveConfiguration, updateConfiguration} from "../js/cad_configurations.js";

const edit = (doc, row, label, text) => ({rowId:doc.configurations[row].id,
  key:designTableColumns(doc).find(c => c.label === label).key, text});

test("saved rows drive exact solid volume and independent component definitions", async () => {
  const doc = designTablePart();
  prepareDesignTable(doc, [edit(doc,1,"Depth@Boss","2 in"), edit(doc,1,"PinDiameter@Profile","60")]).commit();
  assert.equal(doc.features[0].params.depth, 3);
  const component = {def:JSON.parse(JSON.stringify(doc))};
  setComponentConfiguration(component, doc.configurations[1].id);
  const compiled = compileKernelFeatureTree(component.def);
  assert.equal(compiled.ok,true);
  assert.equal(compiled.features.find(f => f.id === "boss").params.to, 5.08);
  const run = await regenerateFeatures({...compiled.document, features:compiled.features});
  try {
    assert.equal(run.ok,true,JSON.stringify(run.issues));
    const volume = await shapeMassProperties(run.results.get("boss"));
    assert.ok(Math.abs(volume.volume - Math.PI * 9 * 5.08) < .1,JSON.stringify(volume));
  } finally { releaseRegeneration(run); }
  assert.equal(doc.sketches[0].entities[0].r, 2);
});

test("invalid units, absent targets and conflicting sketch edits reject the whole batch", () => {
  const doc = designTablePart();
  doc.sketches[0].constraints.push({id:4,type:"radius",value:2,entity:2});
  updateConfiguration(doc,doc.activeConfiguration,{capture:true});
  const before = JSON.stringify(doc);
  for (const [bad,reason] of [
    [edit(doc,0,"Depth@Boss","3 deg"), /positive length/],
    [edit(doc,0,"PinDiameter@Profile","2 cm"), /Cannot solve/],
    [{rowId:doc.activeConfiguration,key:"deleted",text:"1"}, /unavailable/],
  ]) {
    assert.throws(()=>prepareDesignTable(doc,[edit(doc,1,"Depth@Boss","40mm"),bad]),reason);
    assert.equal(JSON.stringify(doc), before);
  }
});

test("suppression excludes a feature and its dependent from compiled history and restores on switch", () => {
  const doc = designTablePart();
  doc.features.push({id:"later", type:"mirror", inputs:["boss"], params:{}});
  doc.history.push({kind:"feature",targetId:"later",id:"step2"});
  prepareDesignTable(doc,[edit(doc,1,"Suppress@Boss","Suppress")]).commit();
  setActiveConfiguration(doc, doc.configurations[1].id);
  assert.ok(doc.features.every(f => f.suppressed));
  assert.ok(compileKernelFeatureTree(doc).features.every(f=>f.type==="sketch"));
  setActiveConfiguration(doc, "cfg_default");
  assert.ok(doc.features.every(f => !f.suppressed));
});

test("measured depth, linked and driven dimensions are read-only per row", () => {
  const doc = designTablePart();
  const cfg = doc.configurations[1], cells = designTableColumns(doc);
  cfg.modelValues.featureParameters[0].params.endCondition = "through-all";
  for (const flag of ["driven","expr","parameter"]) {
    cfg.modelValues.sketches[0].constraints[0][flag] = true;
    assert.throws(()=>prepareDesignTable(doc,[edit(doc,1,"PinDiameter@Profile","30")]),/linked/);
    delete cfg.modelValues.sketches[0].constraints[0][flag];
  }
  assert.match(designTableCell(cfg.modelValues,[],cells[0],"mm").reason,/end condition/);
  assert.throws(()=>prepareDesignTable(doc,[edit(doc,1,"Depth@Boss","80")]),/end condition/);
  delete cfg.modelValues;
  assert.throws(()=>prepareDesignTable(doc,[edit(doc,1,"Depth@Boss","80")]),/Capture/);
  doc.features[0].params.draftAngle = 8;
  prepareDesignTable(doc,[edit(doc,0,"Depth@Boss","50mm")]).commit();
  assert.equal(doc.features[0].params.depth,5);
  assert.equal(doc.features[0].params.draftAngle,8);
});

test("active suppression preserves another uncaptured tree toggle without saving it into the row", () => {
  const doc = designTablePart();
  doc.features.push({id:"other", type:"sphere", params:{r:2}, suppressed:true});
  doc.history.push({kind:"feature", targetId:"other", suppressed:true});
  prepareDesignTable(doc,[edit(doc,0,"Suppress@Boss","Suppress")]).commit();
  assert.equal(doc.features[1].suppressed,true);
  assert.deepEqual(doc.configurations[0].suppressedFeatureIds,["boss"]);
  prepareDesignTable(doc,[edit(doc,0,"Suppress@Boss","Allow")]).commit();
  assert.equal(doc.features[0].suppressed,false);
  assert.equal(doc.features[1].suppressed,true);
});

test("revolve angles accept degrees, reject lengths and enforce the native range", () => {
  const doc = designTablePart();
  const boss = doc.features[0];
  boss.type = "revolve";
  boss.params.angle = 360;
  updateConfiguration(doc,doc.activeConfiguration,{capture:true});
  const angle = text => edit(doc,0,"Angle@Boss",text);
  for (const invalid of ["2cm","2 rad","0","370","0.0000001"])
    assert.throws(()=>prepareDesignTable(doc,[angle(invalid)]),/degrees/);
  prepareDesignTable(doc,[angle("90°")]).commit();
  assert.equal(compileKernelFeatureTree(doc).features.find(f=>f.id==="boss").params.angle,90);
});
