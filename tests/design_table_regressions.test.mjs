import test from "node:test";
import assert from "node:assert/strict";
import {designTablePart} from "./helpers/design_table_part.mjs";
import {designTableColumns, prepareDesignTable} from "../js/core/design_table.js";
import {updateConfiguration, setActiveConfiguration} from "../js/cad_configurations.js";
import {compileKernelFeatureTree} from "../js/core/kernel_feature_adapter.js";
import {createFeatureDefinition, recordSketchInHistory, suppressHistoryNode, ensureParametricDocument} from "../js/core/parametric_document.js";
import {updateSilhouetteSketch} from "../js/core/cone_silhouette.js";
import {regenerateFeatures, releaseRegeneration} from "../js/cad_feature_tree.js";
import {rebuildParametricDocument} from "../js/core/parametric_rebuild.js";
import {offsetEntity} from "../js/sketch_trim.js";
import {shapeMassProperties} from "../js/cad_kernel.js";
import {createCadWorkerExecutor} from "../js/core/cad_worker_runtime.js";

const reopen = doc => ensureParametricDocument(JSON.parse(JSON.stringify(doc)));

test("an older saved offset with a detached local parent recovers on reopen and row restore", () => {
  let doc = designTablePart();
  const profile = doc.sketches[0];
  profile.circleCopies = [{entityId:2,source:{persistentId:"old-rim"}}];
  const circle = offsetEntity(profile,2,.25);
  profile.circleCopies.shift();
  captureRows(doc);
  doc = reopen(doc);
  for (const row of [null,doc.configurations[1].id]) {
    if (row) setActiveConfiguration(doc,row);
    const sketch = doc.sketches[0];
    assert.equal(sketch.circleCopies.length,0);
    assert.ok(sketch.constraints.some(c=>c.type==="offset" && c.b===circle.id));
    assert.equal(updateSilhouetteSketch(sketch,()=>null).entities.find(e=>e.id===circle.id).r,2.25);
  }
});

function captureRows(doc) {
  for (const cfg of doc.configurations) updateConfiguration(doc,cfg.id,{capture:true});
}
function edit(doc,row,label,text) {
  const {key} = designTableColumns(doc).find(c => c.label === label);
  prepareDesignTable(doc,[{rowId:doc.configurations[row].id,key,text}]).commit();
}
function compile(doc) {
  const result = compileKernelFeatureTree(doc);
  assert.ok(result.ok,JSON.stringify(result.issues));
  return result.features.map(f=>f.id);
}

for (const row of [0,1]) {
  const which = row === 0 ? "active" : "inactive";
  test(which + " converted diameter remains 60 mm after source refresh and configuration restore", () => {
    const doc = designTablePart(), sketch = doc.sketches[0];
    const edge = {kind:"edge",descriptor:{curve:"circle",radius:2,measure:4*Math.PI,
      origin:{x:0,y:0,z:0},axis:{x:0,y:1,z:0}}};
    sketch.circleCopies = [{entityId:2,source:edge}];
    captureRows(doc);
    edit(doc,row,"PinDiameter@Profile","60 mm");
    const selected = doc.configurations[row].id;
    if (row === 1) assert.equal(doc.sketches[0].circleCopies.length,1);
    else assert.ok(Math.abs(updateSilhouetteSketch(doc.sketches[0], () => edge).entities[0].r - 3) < 1e-6);
    setActiveConfiguration(doc,selected);
    const refreshed = updateSilhouetteSketch(doc.sketches[0], () => edge);
    assert.ok(Math.abs(refreshed.entities[0].r - 3) < 1e-6);
    assert.equal(refreshed.constraints[0].value,6);
    setActiveConfiguration(doc,doc.configurations[1-row].id);
    assert.equal(doc.sketches[0].circleCopies.length,1);
    assert.equal(updateSilhouetteSketch(doc.sketches[0], () => edge).entities[0].r,2);
  });

  test(which + " suppression cascades from a boss through a face sketch into a cut", async () => {
    const doc = designTablePart();
    const face = structuredClone(doc.sketches[0]);
    Object.assign(face,{id:"face",name:"Face profile",support:{type:"topology-reference",ownerFeatureId:"boss"}});
    recordSketchInHistory(doc,face);
    createFeatureDefinition(doc,"extrudeCut",{id:"cut",inputs:["boss"],
      references:{sketches:["face"],features:["boss"]},params:{sketchId:"face",profileEntityIds:[2]}});
    createFeatureDefinition(doc,"sphere",{id:"separate"});
    captureRows(doc);
    edit(doc,row,"Suppress@Boss","Suppress");
    if (row === 1) {
      assert.ok(compile(doc).includes("cut"));
      setActiveConfiguration(doc,doc.configurations[row].id);
    }
    function suppressed() {
      assert.deepEqual(compile(doc),["feature:sketch:profile","separate"]);
      assert.ok(doc.sketches.find(s=>s.id==="face").suppressed);
      assert.ok(doc.history.filter(e=>["boss","face","cut"].includes(e.targetId)).every(e=>e.suppressed));
      const light = rebuildParametricDocument(reopen(doc));
      assert.ok(light.ok, JSON.stringify(light.issues));
      assert.deepEqual(light.bodies.map(b=>b.featureId), ["separate"]);
    }
    suppressed();
    const compiled = compileKernelFeatureTree(doc);
    const run = await regenerateFeatures({...compiled.document, features:compiled.features});
    try {
      assert.ok(run.ok,JSON.stringify(run.issues));
      assert.ok(run.results.get("separate")?.shape);
      assert.ok(!run.results.has("cut"));
    } finally { releaseRegeneration(run); }
    updateConfiguration(doc,doc.activeConfiguration,{capture:true});
    setActiveConfiguration(doc,doc.configurations[1-row].id);
    assert.ok(compile(doc).includes("cut"));
    setActiveConfiguration(doc,doc.configurations[row].id);
    suppressed();
    edit(doc,row,"Suppress@Boss","Allow");
    assert.ok(compile(doc).includes("cut"));
    assert.equal(doc.sketches.find(s=>s.id==="face").suppressed,false);
  });
}

test("an uncaptured manual sketch suppression survives unrelated feature edits and a normalized save", () => {
  let doc = designTablePart();
  createFeatureDefinition(doc,"sphere",{id:"other",name:"Other"});
  captureRows(doc);
  suppressHistoryNode(doc,"history:sketch:profile",true);
  doc = ensureParametricDocument(JSON.parse(JSON.stringify(doc)));
  edit(doc,0,"Suppress@Other","Suppress");
  assert.deepEqual(compile(doc),[]);
  assert.deepEqual(doc.configurations[0].suppressedFeatureIds,["other"]);
  assert.ok(!doc.configurations[0].modelValues.sketches[0].suppressed);
  edit(doc,0,"Suppress@Other","Allow");
  assert.deepEqual(compile(doc),["other"]);
  updateConfiguration(doc,doc.activeConfiguration,{capture:true});
  setActiveConfiguration(doc,doc.configurations[1].id);
  assert.ok(compile(doc).includes("boss"));
  setActiveConfiguration(doc,doc.configurations[0].id);
  assert.deepEqual(compile(doc),["other"]);
  suppressHistoryNode(doc,"history:sketch:profile",false);
  assert.ok(compile(doc).includes("boss"));
});

for (const row of [0,1]) {
  test("converted diameter drives its offset chain through exact rebuild and reopen, row " + row, async () => {
    let doc = designTablePart();
    const sketch = doc.sketches[0];
    createFeatureDefinition(doc,"cylinder",{id:"source",params:{r:2,h:1}});
    doc.history.unshift(doc.history.pop());
    const edge = {kind:"edge",ownerFeatureId:"source",persistentId:"source-rim",
      descriptor:{curve:"circle",radius:2,measure:4*Math.PI,origin:{x:0,y:0,z:0},axis:{x:0,y:1,z:0}}};
    sketch.circleCopies = [{entityId:2,source:edge}];
    const child = offsetEntity(sketch,2,0.25);
    const outer = offsetEntity(sketch,child.id,0.5);
    doc.features[0].params.profileEntityIds = [outer.id];
    captureRows(doc);
    edit(doc,row,"PinDiameter@Profile","60 mm");
    doc = reopen(doc);
    for (const index of [row,1-row,row]) {
      setActiveConfiguration(doc,doc.configurations[index].id);
      const profile = doc.sketches[0];
      const radius = index === row ? 3 : 2;
      assert.equal(profile.circleCopies.length,index === row ? 0 : 3);
      assert.ok(Math.abs(profile.entities.find(e=>e.id===outer.id).r-radius-0.75)<1e-6);
      const compiled = compileKernelFeatureTree(doc);
      assert.ok(compiled.ok,JSON.stringify(compiled.issues));
      const run = await regenerateFeatures({...compiled.document,features:compiled.features});
      try {
        assert.ok(run.ok,JSON.stringify(run.issues));
        const mass = await shapeMassProperties(run.results.get("boss"));
        assert.ok(Math.abs(mass.volume - Math.PI * (radius+0.75)**2 * 3)<.01);
      } finally { releaseRegeneration(run); }
    }
  });

  test("staging skips an expression solve only in rows where its face sketch is suppressed, row " + row, () => {
    let doc = designTablePart();
    const face = structuredClone(doc.sketches[0]);
    Object.assign(face,{id:"face",name:"Face",support:{type:"topology-reference",ownerFeatureId:"boss"},
      constraints:[{id:1,type:"radius",entity:2,value:2},{id:2,type:"radius",entity:2,value:2,expr:"PinDiameter / 2"}]});
    recordSketchInHistory(doc,face);
    captureRows(doc);
    edit(doc,row,"Suppress@Boss","Suppress");
    doc = reopen(doc);
    edit(doc,row,"PinDiameter@Profile","60 mm");
    assert.throws(()=>edit(doc,1-row,"PinDiameter@Profile","60 mm"),/Cannot solve Face/);
    doc = reopen(doc);
    setActiveConfiguration(doc,doc.configurations[row].id);
    assert.equal(doc.sketches[1].suppressed,true);
    assert.equal(doc.sketches[1].constraints[1].value,3);
    assert.ok(Math.abs(doc.sketches[0].entities[0].r-3)<1e-6);
    assert.ok(rebuildParametricDocument(doc).ok);
  });
}

test("releasing either Boolean parent keeps the result suppressed until both are available, including reopen", () => {
  for (const first of ["boss","other"]) {
    let doc = designTablePart();
    createFeatureDefinition(doc,"sphere",{id:"other",name:"Other"});
    createFeatureDefinition(doc,"boolean",{id:"union",references:{features:["boss","other"]},params:{operation:"union"}});
    captureRows(doc);
    edit(doc,1,"Suppress@Boss","Suppress");
    edit(doc,1,"Suppress@Other","Suppress");
    setActiveConfiguration(doc,doc.configurations[1].id);
    doc = reopen(doc);
    const second = first === "boss" ? "other" : "boss";
    suppressHistoryNode(doc,"history:feature:"+first,false);
    assert.ok(!compile(doc).includes("union"));
    assert.equal(doc.history.find(e=>e.targetId==="union").autoSuppressedBy,second);
    doc = reopen(doc);
    suppressHistoryNode(doc,"history:feature:"+second,false);
    assert.ok(compile(doc).includes("union"));
  }
});

test("row equations resolve before solving both the edited sketch and its dependent sketch", () => {
  const doc = designTablePart();
  doc.variables = [{name:"Divisor",value:2}];
  doc.sketches[0].constraints.push({id:4,type:"radius",entity:2,value:2,expr:"PinDiameter / 2"});
  const follower = structuredClone(doc.sketches[0]);
  Object.assign(follower,{id:"follower",name:"Follower",constraints:[
    {id:5,type:"radius",entity:2,value:2,expr:"PinDiameter / Divisor"}]});
  recordSketchInHistory(doc,follower);
  captureRows(doc);
  for (const [row,mm] of [[0,60],[1,80]]) {
    edit(doc,row,"PinDiameter@Profile",mm + " mm");
    assert.ok(Math.abs(doc.sketches[1].entities[0].r-3)<1e-6);
    setActiveConfiguration(doc,doc.configurations[row].id);
    for (const sketch of doc.sketches) {
      assert.equal(sketch.constraints.at(-1).value,mm/20);
      assert.ok(Math.abs(sketch.entities[0].r-mm/20)<1e-6);
    }
  }
});

function suppressedEquationPart(named) {
  const doc = designTablePart();
  const face = structuredClone(doc.sketches[0]);
  const radius = {id:7,type:"radius",entity:2,value:1,expr:"sqrt(5 - PinDiameter)"};
  if (named) radius.name = "FaceRadius";
  Object.assign(face,{id:"face", name:"Face profile", support:{type:"topology-reference",ownerFeatureId:"boss"},
    constraints:[radius]});
  recordSketchInHistory(doc,face);
  if (named) {
    face.constraints.push({id:8,type:"radius",entity:2,name:"RelayRadius",value:1,expr:"FaceRadius"});
    const reader = structuredClone(doc.sketches[0]);
    Object.assign(reader,{id:"reader",name:"Reader",constraints:[
      {id:7,type:"radius",entity:2,value:1,expr:"RelayRadius"}]});
    recordSketchInHistory(doc,reader);
  }
  createFeatureDefinition(doc,"sphere",{id:"separate"});
  captureRows(doc);
  return doc;
}

async function checkEquationRebuilds(doc, errorSketchId) {
  function check(run) {
    assert.equal(run.ok,!errorSketchId,JSON.stringify(run.issues));
    const equations = run.issues.filter(i=>i.code==="sketch-equation");
    assert.deepEqual(equations.map(i=>i.sketchId),errorSketchId ? [errorSketchId] : []);
    if (errorSketchId) assert.match(equations[0].message,/sqrt of a negative number/);
  }
  const light = rebuildParametricDocument(doc);
  check(light);
  assert.ok(light.bodies.some(b=>b.featureId==="separate"));
  const compiled = compileKernelFeatureTree(doc);
  assert.ok(compiled.ok,JSON.stringify(compiled.issues));
  const exact = await regenerateFeatures({...compiled.document,features:compiled.features});
  try {
    check(exact);
    assert.ok(exact.results.get("separate")?.shape);
  } finally { releaseRegeneration(exact); }
  const worker = await createCadWorkerExecutor()({kind:"rebuild",canonical:true,document:doc,meshOnly:true});
  check(worker);
  assert.ok(worker.results.find(([id])=>id==="separate")?.[1].meshData.positions.length);
}

for (const row of [0,1]) {
  test("invalid anonymous equation on a suppressed face permits the 60 mm row after reopen, row " + row, async () => {
    let doc = suppressedEquationPart(false);
    edit(doc,row,"Suppress@Boss","Suppress");
    doc = reopen(doc);
    edit(doc,row,"PinDiameter@Profile","60 mm");
    assert.equal(doc.sketches[0].constraints[0].value,row===0 ? 6 : 4);
    assert.throws(()=>edit(doc,1-row,"PinDiameter@Profile","60 mm"),/sqrt of a negative number/);
    doc = reopen(doc);
    setActiveConfiguration(doc,doc.configurations[row].id);
    assert.equal(doc.sketches[0].constraints[0].value,6);
    assert.equal(doc.sketches[1].suppressed,true);
    assert.equal(doc.sketches[1].constraints[0].expr,"sqrt(5 - PinDiameter)");
    assert.throws(()=>edit(doc,row,"Suppress@Boss","Allow"),/sqrt of a negative number/);
    await checkEquationRebuilds(doc);
  });

  test("an active sketch reads through suppressed named equations and reports their failure, row " + row, async () => {
    let doc = suppressedEquationPart(true);
    edit(doc,row,"Suppress@Boss","Suppress");
    edit(doc,row,"PinDiameter@Profile","47.5 mm");
    doc = reopen(doc);
    setActiveConfiguration(doc,doc.configurations[row].id);
    const reader = doc.sketches.find(s=>s.id==="reader");
    assert.ok(Math.abs(reader.entities[0].r-.5)<1e-6);
    const before = JSON.stringify(doc);
    assert.throws(()=>edit(doc,row,"PinDiameter@Profile","60 mm"),/7.*sqrt of a negative number/);
    assert.equal(JSON.stringify(doc),before);
    // Load an already-invalid saved row to exercise both engines independently
    // of the table validation that refused the edit above.
    const cfg = doc.configurations[row];
    cfg.modelValues.sketches[0].constraints[0].value = 6;
    doc = reopen(doc);
    setActiveConfiguration(doc,cfg.id);
    await checkEquationRebuilds(doc,"reader");
  });
}
