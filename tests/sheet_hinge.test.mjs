import test from "node:test";
import assert from "node:assert/strict";
import { sheetPlate, hingeTools, recordHingeHistory, repairSheetOwner, resolveHingeSection } from "../js/cad_sheet_hinge.js";
import { createSheetMetalPart, flatPattern, flatPatternSvg } from "../js/cad_sheet_metal.js";
import { hingeForm } from "../js/modeler/sheet_hinge_form.js";
import { compileKernelFeatureTree } from "../js/core/kernel_feature_adapter.js";
import { regenerateFeatures, releaseRegeneration } from "../js/cad_feature_tree.js";
import { exactBrepForPart, movePart } from "../js/modeler_part_geometry.js";
import { createPartDocument, suppressHistoryNode, removeHistoryNode } from "../js/core/parametric_document.js";
import { registerGeneratedExtrusion } from "../js/core/generated_extrusion.js";
import { shapeMassProperties, disposeBrep } from "../js/cad_kernel.js";

const base = {id:"plate",kind:"ext",axis:"z",from:.1,to:0,
  pts:[{u:0,v:0},{u:64,v:0},{u:64,v:3},{u:0,v:3}]};
const spec = {edge:"top",count:13,pitch:5,offset:0,width:2,radius:.3,straight:.4};

function hingeDocument(count=2) {
  const document = createPartDocument({name:"Hinge"});
  const part = {...structuredClone(base),name:"Leaf",axis:"y",from:0,to:.1};
  document.parts = [part];
  const feature = registerGeneratedExtrusion(document,part);
  const hinge = {...spec,count};
  const tools = hingeTools(sheetPlate(part),hinge);
  recordHingeHistory(document,tools,feature.id,"Rolled tab","roll-profile");
  part.merges3d = tools;
  document.sheetMetal = {...createSheetMetalPart({base:{width:64,height:3},thickness:.1}),
    sourcePartId:part.id,hinge,hingeFeatureIds:tools.map(tool=>tool.featureId)};
  return document;
}

test("moving thirteen tabs moves each once, independently of the history sketch", () => {
  const doc = hingeDocument(13), part = doc.parts[0];
  const sketch = doc.sketches.find(s=>s.id==="roll-profile");
  const before = structuredClone(sketch.frame.origin);
  assert.equal(new Set(part.merges3d.map(tool=>tool.frame)).size,13);
  assert.notEqual(sketch.frame,part.merges3d[0].frame);
  // Also move an older in-memory document that still aliases every frame.
  for (const tool of part.merges3d) tool.frame=sketch.frame;
  movePart(part,3,-2,4);
  assert.deepEqual(sketch.frame.origin,before);
  for (const tool of part.merges3d)
    assert.deepEqual(tool.frame.origin,{x:before.x+3,y:before.y-2,z:before.z+4});
});

test("solved base sketch and stock thickness drive both rolled tabs after reopening old history", async () => {
  const doc = JSON.parse(JSON.stringify(hingeDocument())), part = doc.parts[0];
  const sketch = doc.sketches.find(s=>s.id===part.sketchId);
  // Widen the leaf away from its former top edge, translate it, and double stock thickness.
  for (const point of sketch.points) { point.x+=7; point.y=point.y===3?11:2; }
  doc.features[0].params.depth=.2;
  for (const feature of doc.features.slice(1)) delete feature.params.sheetHingeSource;
  const compiled = compileKernelFeatureTree(doc);
  assert.ok(compiled.ok,JSON.stringify(compiled.issues));
  const run = await regenerateFeatures({...compiled.document,features:compiled.features});
  try {
    assert.ok(run.ok,JSON.stringify(run.issues));
    const mass = await shapeMassProperties(run.finalShape);
    assert.equal(mass.solidCount,1);
    assert.ok(Math.abs(mass.bounds.max.z-(11+.4+.5))<1e-5,JSON.stringify(mass.bounds));
    const expectedVolume = 64*9*.2+2*2*(.4*.2+.75*Math.PI*(.5**2-.3**2));
    assert.ok(Math.abs(mass.volume-expectedVolume)<1e-6,JSON.stringify(mass));
    assert.equal(run.boundaryUpdates.get("roll-profile").sketch.frame.origin.x,7);
  } finally {releaseRegeneration(run);}
});

test("flat-pattern and bend-report export reject suppression, rollback and deletion", () => {
  const doc = hingeDocument(), id = doc.sheetMetal.hingeFeatureIds[1];
  const entry = doc.history.find(e=>e.targetId===id);
  const report = () => flatPattern(doc);
  const svg = () => flatPatternSvg(doc);
  assert.equal(report().bends.length,2);
  suppressHistoryNode(doc,entry.id,true);
  assert.throws(report,/Restore/);
  assert.throws(svg,/Restore/);
  suppressHistoryNode(doc,entry.id,false);
  assert.equal(report().bends.length,2);
  doc.rollbackIndex = doc.history.indexOf(entry);
  assert.throws(report,/Restore/);
  doc.rollbackIndex = null;
  assert.ok(removeHistoryNode(doc,entry.id).ok);
  assert.throws(svg,/Restore/);
});

test("a 1 mm preview cannot export a flat blank for a 2 mm up-to-next base", async () => {
  const doc = hingeDocument(), part = doc.parts[0];
  const baseFeature = doc.features.find(f=>f.id===part.featureId);
  Object.assign(baseFeature.params,{endCondition:"up-to-next",targetFeatureId:"stop"});
  const compiled = compileKernelFeatureTree(doc);
  assert.ok(compiled.ok,JSON.stringify(compiled.issues));
  const stop = {id:"stop",type:"box",params:{x:-1,y:.2,z:-1,w:66,h:1,d:5}};
  const run = await regenerateFeatures({...compiled.document,features:[stop,...compiled.features]});
  try {
    assert.ok(run.ok,JSON.stringify(run.issues));
    const resolved = run.resolvedExtrusions.get(baseFeature.id);
    assert.ok(Math.abs(resolved.to-resolved.from-.2)<1e-6);
    assert.equal(sheetPlate(part).thickness,.1);
    assert.throws(()=>flatPattern(doc),/fixed-depth/);
    assert.throws(()=>flatPatternSvg(doc),/fixed-depth/);
  } finally {releaseRegeneration(run);}
});

test("resized converted stock drives the plain blank and subsequently added tabs", () => {
  const part = structuredClone(base), sheet = {...createSheetMetalPart({base:{width:64,height:3},thickness:.1}),
    sourcePartId:part.id};
  const document = {parts:[part],sheetMetal:sheet};
  const initialPlate = sheetPlate(part);
  let form, undoCount = 0;
  hingeForm({p:part,plate:initialPlate,document,t:key=>key,openQuickForm:value=>{form=value;},
    selectedSolid:()=>part,pushUndo:()=>{undoCount++;},invalidatePartMeshAfterEdit:()=>{}});
  for (const point of part.pts) {
    if (point.u===64) point.u=70;
    if (point.v===3) point.v=6;
  }
  part.from=.2;
  const blank = flatPattern(document);
  assert.equal(blank.thickness,.2);
  assert.equal(Math.max(...blank.outline.map(p=>p.x)),70);
  assert.equal(Math.max(...blank.outline.map(p=>p.y)),6);
  assert.match(flatPatternSvg(document),/width="700mm" height="60mm"/);
  const tabs = {...spec,count:2,offset:63};
  assert.ok(form.onApply(tabs),form.failureMessage());
  assert.equal(undoCount,1);
  assert.deepEqual(document.sheetMetal.base,{width:70,height:6});
  assert.equal(document.sheetMetal.thickness,.2);
  assert.ok(part.merges3d.every(tool=>tool.hingeGauge===.2));
  assert.equal(flatPattern(document).bends[0].line[0].y,6+tabs.straight);
});

test("projection-only leaves rebuild their curled tabs and blank from resized stock", async () => {
  const part = structuredClone(base), hinge = {...spec,count:2};
  part.merges3d = hingeTools(sheetPlate(part),hinge);
  for (const point of part.pts) if (point.v===3) point.v=9;
  part.from = .2;
  const doc = {parts:[part],sheetMetal:{...createSheetMetalPart({base:{width:64,height:3},thickness:.1}),
    sourcePartId:part.id,hinge}};
  const pattern = flatPattern(doc);
  assert.equal(pattern.thickness,.2);
  assert.equal(pattern.bends[0].line[0].y,9+hinge.straight);
  const folded = await exactBrepForPart(part);
  try {
    const mass = await shapeMassProperties(folded);
    assert.equal(mass.solidCount,1);
    assert.ok(Math.abs(mass.bounds.max.y-(9+.4+.5))<1e-5,JSON.stringify(mass.bounds));
  } finally {disposeBrep(folded);}
});

test("moving an edge preserves a custom roll section and prevents a nominal blank export", () => {
  const doc = hingeDocument(), sketch = doc.sketches.find(s=>s.id==="roll-profile");
  const tool = doc.parts[0].merges3d[0];
  const feature = doc.features.find(f=>f.id===tool.featureId);
  const point = sketch.points.find(p=>p.id===sketch.id+"p1");
  point.x+=.05;
  const resolved = resolveHingeSection("extrude",{...base,points:base.pts.map(p=>({...p,v:p.v+4}))},
    feature.params.sheetHingeSource,tool.from,tool.to,sketch);
  assert.deepEqual(resolved.points,sketch.points);
  assert.notDeepEqual(resolved.frame.origin,sketch.frame.origin);
  assert.throws(()=>flatPatternSvg(doc),/modified/);
});

test("deleting the owner releases conversion, including stale reopened documents", () => {
  const doc = hingeDocument();
  doc.parts.push({...base,id:"other"});
  doc.parts.shift();
  assert.equal(repairSheetOwner(doc),null);
  assert.equal(doc.sheetMetal,undefined);
  assert.ok(sheetPlate(doc.parts[0]));
  const legacy = {parts:[{id:"original",kind:"box"}],sheetMetal:createSheetMetalPart()};
  assert.equal(repairSheetOwner(legacy).id,"original");
  legacy.parts=[{id:"replacement",kind:"box"}];
  assert.equal(repairSheetOwner(legacy),null);
});

test("conversion measures the selected rectangular profile in its plane", () => {
  for (const axis of ["x","y","z"]) {
    const {width,height,thickness} = sheetPlate({...base,axis});
    assert.deepEqual([width,height,thickness],[64,3,.1]);
  }
  assert.equal(sheetPlate({...base,holes:[{}]}),null);
  assert.equal(sheetPlate({...base,pts:[...base.pts.slice(0,3),{u:.3,v:3}]}),null);
  assert.equal(sheetPlate({...base,to:10}),null);
  const upright = sheetPlate({kind:"box",x0:0,x1:64,y0:0,y1:3,z0:0,z1:.1});
  assert.deepEqual([upright.width,upright.height,upright.thickness],[64,3,.1]);
});

test("the developed blank has thirteen individual tabs with the specified pitch and bend allowance", () => {
  const plate = sheetPlate(base);
  const tools = hingeTools(plate,spec);
  assert.deepEqual(tools.map(t=>t.from),Array.from({length:13},(_,i)=>i*5));
  assert.throws(()=>hingeTools(plate,{...spec,offset:3}),/fit/);
  assert.throws(()=>hingeTools(plate,{...spec,width:5}),/gap/);
  const sheet = {...createSheetMetalPart({base:plate,thickness:.1}),hinge:spec};
  const {outline,bends} = flatPattern(JSON.parse(JSON.stringify(sheet)));
  const perimeterArea = Math.abs(outline.reduce((a,p,i)=>{
    const q = outline[(i+1)%outline.length];
    return a+p.x*q.y-q.x*p.y;
  },0)/2);
  assert.ok(Math.abs(perimeterArea-(64*3+13*2*(.4+1.5*Math.PI*(.3+.33*.1))))<1e-8);
  assert.equal(bends.length,13);
  assert.equal((flatPatternSvg(sheet).match(/<line /g)||[]).length,13);
});

test("folded projection and reopened feature history both fuse the hollow tabs to one leaf", async () => {
  const tools = hingeTools(sheetPlate(base),{...spec,count:2});
  const def = {features:[{id:"base",type:"box",name:"Leaf",params:{x:0,y:0,z:0,w:64,h:3,d:.1}}],
    history:[{kind:"feature",targetId:"base"}],sketches:[]};
  recordHingeHistory(def,tools,"base","Rolled tab","profile");
  const compiled = compileKernelFeatureTree(JSON.parse(JSON.stringify(def)));
  assert.ok(compiled.ok,JSON.stringify(compiled.issues));
  const run = await regenerateFeatures({...compiled.document,features:compiled.features});
  let folded;
  try {
    assert.ok(run.ok,JSON.stringify(run.issues));
    folded = await exactBrepForPart({...base,merges3d:tools});
    const expected = 64*3*.1+2*2*(.4*.1+.75*Math.PI*(.4**2-.3**2));
    for (const body of [folded,run.finalShape]) {
      const mass = await shapeMassProperties(body);
      assert.ok(Math.abs(mass.volume-expected)<1e-6,JSON.stringify({mass,expected}));
      assert.ok(Math.abs(mass.bounds.max.z-.8)<1e-5);
    }
  } finally { disposeBrep(folded); releaseRegeneration(run); }
});
