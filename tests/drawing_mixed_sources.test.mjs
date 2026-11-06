import test from "node:test";
import assert from "node:assert/strict";
import { buildDrawingScene } from "../js/cad_drawings.js";
import { assemblySourceBodies, partSourceBodies } from "../js/cad_configured_drawing.js";
import { buildSheetScene, createProjector, createView, effectiveViewSource, ensureSheetDoc, measureDim, projectedDimensionBinding } from "../js/cad_sheet.js";
import { importKeptLibraryBundle, listLibrarySources, putAssemblyLibraryRecord, putModelLibraryRecord, readLibrarySource } from "../js/core/model_library_store.js";
import { drawingOnlyContentSummary, hasSaveableModelContent } from "../js/core/model_save_policy.js";

import { alignedBreakPlan, validateAlignedBreak } from "../js/core/drawing_break.js";
import { alternatePositionBodies } from "../js/core/drawing_alternate_position.js";
import { projectSolid, projectionBounds, viewBasis } from "../js/core/hidden_line.js";
import { sectionRibMasks } from "../js/core/section_rib_hatch.js";

const block = (width, id = "solid") => ({ id, kind: "box", x0: 0, x1: width, y0: 0, y1: 2, z0: 0, z1: 3 });
const part = { kind: "part", key: "cm_box", name: "Box" };
const w = projection => projection.bounds.u1 - projection.bounds.u0;

test("a sheet whose only content is a library view can be saved as a drawing", () => {
  const view = createView("front");
  const owner = { parts: [], drawing: { views: [view] } };
  assert.equal(hasSaveableModelContent(owner), false);
  view.source = part;
  assert.equal(hasSaveableModelContent(owner), true);
  assert.deepEqual(drawingOnlyContentSummary(owner), { annotations: 0, notes: 0 });
});

test("a derived section follows its parent through source changes on a legacy sheet", () => {
  const owner = { parts: [block(9)], drawing: { views: [
    { id: "front", dir: "front", primary: true },
    { id: "cut", dir: "top", section: { from: "front", axis: "horizontal", at: 1 } },
  ] } };
  const doc = ensureSheetDoc(owner);
  const [front, cut] = doc.views;
  const project = createProjector(doc, partSourceBodies(owner), {
    bodiesForView: view => effectiveViewSource(doc, view) ? partSourceBodies({ parts: [block(4)] }) : undefined,
  });
  assert.equal(front.source, null);
  assert.equal(w(project(front)), 9);
  assert.equal(w(project(cut)), 9);
  front.source = part;
  assert.deepEqual(effectiveViewSource(doc, cut), part);
  assert.equal(w(project(front)), 4);
  assert.equal(w(project(cut)), 4);
  const copy = createView(front.dir, front);
  assert.deepEqual(copy.source, part);
  front.source = null;
  assert.equal(w(project(cut)), 9);
  assert.deepEqual(copy.source, part);
});

test("a missing source leaves its view empty, reports its name and keeps owner references off its geometry", async () => {
  const owner = { parts: [block(12)], drawing: { views: [
    createView("front", { id: "front", primary: true, source: part }), createView("right", { id: "right" }),
  ], dims: [{ id: "size", viewId: "front", type: "horizontal", refs: [
    { pid: "shared", kind: "edge", at: "a", u: 0, v: 0 }, { u: 4, v: 0 },
  ] }] } };
  const options = { holeCallouts: false, topology: [{ persistentId: "shared", kind: "edge",
    descriptor: { curve: "line", endpoints: [{ x: 0, y: 0, z: 0 }, { x: 12, y: 0, z: 0 }] } }],
  };
  const missing = buildDrawingScene(owner, options);
  assert.equal(missing.views[0].projection.bounds, null);
  assert.ok(missing.views[1].projection.visible.length);
  assert.ok(missing.diagnostics.some(d => d.code === "view-source-unavailable" && d.viewId === "front" && d.message.includes("Box")));
  assert.equal(missing.dims.get("size").dangling, true);

  await putModelLibraryRecord({ ...part, parts: [block(4)] });
  const restored = buildDrawingScene(JSON.parse(JSON.stringify(owner)), options);
  assert.equal(w(restored.views[0].projection), 4);
  assert.equal(restored.dims.get("size").dangling, true, "a matching host edge ID cannot rebind this dimension");
  assert.ok(!restored.diagnostics.some(d => d.code === "view-source-unavailable"));
  await putModelLibraryRecord({ ...part, name: "Renamed box", parts: [block(6)] });
  const updated = buildDrawingScene(owner, options);
  assert.equal(w(updated.views[0].projection), 6);
  assert.ok(listLibrarySources().some(s => s.key === part.key && s.name === "Renamed box"));
});

test("a saved assembly source composes nested occurrence poses and excludes hidden components", () => {
  const def = { parts: [block(2), { ...block(100, "suppressed"), suppressed: true }] };
  const assembly = { components: [
    { id: "sub", kind: "assembly", transform: { x: 10, y: 0, z: 0, rz: 90 },
      asm: { components: [{ id: "box", def, transform: { x: 3 } }] } },
    { id: "hidden", def, transform: { x: 50 }, visible: false },
  ] };
  const [body, ...others] = assemblySourceBodies(assembly);
  assert.deepEqual(others, []);
  assert.equal(body.id, "sub/box:solid");
  const coords = axis => body.positions.filter((_value, i) => i % 3 === axis);
  const extent = axis => [Math.min(...coords(axis)), Math.max(...coords(axis))].map(v => +v.toFixed(5));
  assert.deepEqual(extent(0), [8, 10]);
  assert.deepEqual(extent(1), [3, 5]);
  assert.deepEqual(extent(2), [0, 3]);
  assembly.components.push({ id: "lost", modelKey: "cm_deleted" });
  assert.throws(() => assemblySourceBodies(assembly), /Missing assembly component: lost/);
});

test("manual snaps on a referenced view survive reload and flag changed, replaced, or deleted geometry", () => {
  const view = createView("front", {id:"front", source:part});
  const doc = ensureSheetDoc({drawing:{views:[view]}}), dims = doc.dims;
  const build = width => buildSheetScene(doc, { projection: createProjector(doc,[],{
    bodiesForView: () => width ? partSourceBodies({parts:[block(width)]}) : [],
  }) });
  const p = build(4).views[0].projection;
  const edge = p.visible.find(({a,b}) => a.v === b.v && Math.abs(a.u-b.u) === 4);
  const dim = {id:"pick", type:"horizontal", viewId:"front", refs:[edge.a, edge.b]};
  dim.sourceBinding = projectedDimensionBinding(dim,part,p);
  dims.push(JSON.parse(JSON.stringify(dim)));
  assert.equal(build(4).dims.get("pick").dangling,false);
  assert.equal(build(7).dims.get("pick").dangling,true);
  assert.equal(build(0).dims.get("pick").dangling,true);
  doc.views[0].source = {...part,key:"identical-other-part"};
  assert.equal(build(4).dims.get("pick").dangling,true);
  doc.views[0].source = null;
  assert.equal(build(4).dims.get("pick").dangling,true);
  doc.views[0].source = part;
  delete dims[0].sourceBinding;
  assert.equal(build(4).dims.get("pick").dangling,true,"legacy coordinate-only picks cannot prove a reference");
});

test("a parent-only section uses the named parent, and an orphan cannot cut host stock", () => {
  const front = createView("front",{id:"front",source:part});
  const cut = createView("top",{id:"cut",parent:"front",section:{axis:"horizontal",at:1}});
  const doc = ensureSheetDoc({drawing:{views:[createView("right",{id:"other"}),front,cut]}});
  const project = createProjector(doc,partSourceBodies({parts:[block(13)]}),{
    bodiesForView:v => effectiveViewSource(doc,v) ? partSourceBodies({parts:[block(4)]}) : undefined,
  });
  assert.equal(w(project(cut)),4);
  cut.parent = "absent";
  assert.equal(project(cut).bounds,null);
  assert.match(project(cut).parentError,/parent/);
  doc.views[2]=cut;
  assert.ok(buildSheetScene(doc,{projection:project}).diagnostics.some(d => d.viewId==="cut" && /parent/.test(d.message)));
  cut.parent = cut.id;
  assert.equal(project(cut).bounds,null);
});

test("keep-both assigns both namespaces before rewriting incoming drawings and nested snapshots", async () => {
  const key="shared-review-key", source=kind=>({kind,key,name:"incoming"}), drawing={views:[
    createView("front",{source:source("part")}),createView("iso",{source:source("assembly")}),
  ]};
  await putModelLibraryRecord({key,parts:[block(1)]});
  await putAssemblyLibraryRecord({key,components:[]});
  const embedded = {key,parts:[block(5)],drawing,metadata:{snapshots:[{drawing:structuredClone(drawing)}]}};
  const asm = {key,components:[{id:"box",modelKey:key,def:embedded}],drawing};
  const bundle = {models:[embedded,{key:key+"-2",parts:[]}],assemblies:[asm,{key:"top-review",components:[{id:"sub",assemblyKey:key,asm}]}]};
  const bytes = JSON.stringify(bundle);
  await importKeptLibraryBundle(bundle);
  const top = readLibrarySource({kind:"assembly",key:"top-review"}), sub = top.components[0];
  assert.equal(sub.assemblyKey,key+"-2");
  assert.equal(sub.asm.components[0].modelKey,key+"-3");
  for (const record of [sub.asm,sub.asm.components[0].def,readLibrarySource({kind:"part",key:key+"-3"})]) {
    assert.deepEqual(record.drawing.views.map(v=>v.source.key),[key+"-3",key+"-2"]);
  }
  assert.equal(sub.asm.components[0].def.metadata.snapshots[0].drawing.views[1].source.key,key+"-2");
  assert.equal(readLibrarySource({kind:"part",key}).parts[0].x1,1);
  assert.equal(JSON.stringify(bundle),bytes);
});

test("a lost nested component diagnoses only the failed views in standalone export", async () => {
  const source = {kind:"assembly",key:"missing-child-test",name:"Missing child"};
  await putAssemblyLibraryRecord({...source,components:[{id:"sub",kind:"assembly",asm:{components:[{id:"lost",modelKey:"gone"}]}}]});
  const drawing={views:[createView("front",{source}),createView("iso",{source}),createView("right")]};
  const scene=buildDrawingScene({parts:[block(7)],drawing});
  assert.deepEqual(scene.views.map(v=>!!v.projection.bounds),[false,false,true]);
  assert.equal(scene.diagnostics.filter(d=>d.code==="view-source-unavailable" && d.message.includes("sub/lost")).length,2);
});

test("saved parts use rollback, patterned placements and kernel bounds for orthographic measurements", () => {
  const mesh={positions:partSourceBodies({parts:[block(3)]})[0].positions,
    exactBounds:{min:{x:0,y:0,z:0},max:{x:3.125,y:2,z:3}}};
  const first={...block(3),featureId:"boss",meshData:mesh,patternRotations:[{axis:"z",angle:Math.PI/2,pivot:{x:1,y:0,z:0}}]};
  const def={parts:[first,{...block(50),featureId:"late"}],history:[
    {kind:"feature",targetId:"boss"},{kind:"feature",targetId:"late"}],rollbackIndex:1};
  const check = doc => {
    const bodies=partSourceBodies(doc);
    assert.equal(bodies.length,1);
    const projection=projectSolid(bodies,"front"), b=projectionBounds(projection);
    assert.ok(Math.abs((b.v1-b.v0)-3.125)<1e-8);
    assert.ok(Math.abs(projection.bounds.v0+1)<1e-8);
    assert.ok(Math.abs(projection.bounds.v1-2)<1e-8);
    const view=createView("front",{id:"f",source:part});
    const sheet=ensureSheetDoc({drawing:{views:[view],dims:[{id:"extent",type:"vertical",viewId:"f",auto:"extent"}]}});
    const scene=buildSheetScene(sheet,{projection:()=>projection});
    assert.ok(Math.abs(measureDim(scene.dims.get("extent").dim)-3.125)<1e-8);
  };
  check(def);
  check({...def,rollback:1,rollbackIndex:null});
});

test("Break and Alternate Position verify source identity even when body IDs and dimensions coincide", () => {
  const front=createView("front",{id:"front",primary:true,source:part,scale:1}), top=createView("top",{id:"top",source:part,scale:1});
  const other=createView("back",{id:"other",scale:1});
  const unrelatedSection=createView("right",{id:"cut",parent:"other",section:{axis:"vertical",at:1}});
  const doc={views:[front,top,other,unrelatedSection]}, bounds={u0:0,u1:20,v0:0,v1:5};
  const projections=new Map(doc.views.map(view=>[view.id,{bounds,visible:[],hidden:[]}]));
  const plan=alignedBreakPlan(doc,front,{version:1,axis:"u",style:"zigzag",from:5,to:15,gapMm:6},projections,10,1);
  assert.deepEqual([...plan.keys()],["front","top"]);
  front.breakView=plan.get(front.id);top.breakView=plan.get(top.id);
  validateAlignedBreak(front,doc);
  top.source=null;
  assert.throws(()=>validateAlignedBreak(top,doc),/source/);
  assert.throws(()=>validateAlignedBreak(front,doc),/cluster/);
  const body=partSourceBodies({parts:[block(3)]});
  const view=createView("front",{source:part,alternatePosition:{version:1,scope:"all",label:"Pose",bodyIds:["solid"],source:part,sourceConfigurationId:null,
    translation:{x:1,y:0,z:0},pivot:{x:0,y:0,z:0},rotation:{x:0,y:0,z:0}}});
  assert.equal(alternatePositionBodies(body,view).length,1);
  view.source={...part,key:"another"};
  assert.throws(()=>alternatePositionBodies(body,view),/source changed/);
});

test("opposite pattern and assembly rotations restore the exact flat-bar width", () => {
  const vertices = partSourceBodies({parts:[block(11.426)]})[0].positions;
  const bar = {...block(11.426), meshData:{positions:vertices,
    exactBounds:{min:{x:0,y:0,z:0},max:{x:11.43,y:2,z:3}}},
    patternRotations:[{axis:"z",angle:Math.PI/4,pivot:{x:2,y:1,z:0}}]};
  const def = {parts:[bar]};
  assert.equal(partSourceBodies(def)[0].exactBounds,undefined,"the intermediate oblique AABB is inexact");
  const component = {id:"bar", def, transform:{rz:-45,x:12,y:3}};
  const assembled = assemblySourceBodies({components:[component]});
  const view = createView("front",{id:"bar",source:{kind:"assembly",key:"flat-bar"}});
  const sheet = ensureSheetDoc({drawing:{views:[view],dims:[{id:"width",type:"horizontal",viewId:view.id,auto:"extent"}]}});
  const scene = buildSheetScene(sheet,{projection:createProjector(sheet,[],{bodiesForView:()=>assembled})});
  const bounds = projectionBounds(scene.views[0].projection);
  assert.ok(Math.abs(10*measureDim(scene.dims.get("width").dim)-114.30)<1e-8);
  // The transformed origin must include the rotation about the offset pivot.
  assert.ok(Math.abs(bounds.u0-(12+3/Math.SQRT2-2))<1e-8);
  component.transform.rz=-30;
  assert.equal(assemblySourceBodies({components:[component]})[0].exactBounds,undefined);
});

test("saved rotations with a null pivot turn around the origin", () => {
  const rotated = {...block(4),patternRotations:[{axis:"z",angle:String(Math.PI/2),pivot:null}]};
  const projection=projectSolid(partSourceBodies({parts:[rotated]}),"front");
  assert.ok(Math.abs(projection.bounds.u0+2)<1e-8);
  assert.ok(Math.abs(projection.bounds.v1-4)<1e-8);
});

test("an orphan section note cannot acquire the host edge with the same ID", () => {
  const base=createView("front",{id:"base",source:part});
  const cut=createView("top",{id:"cut",parent:base.id,section:{axis:"horizontal",at:1}});
  const hostView=createView("top",{id:"host"});
  const leader={viewId:"cut",pid:"shared",kind:"edge",at:"a",u:-4,v:-7};
  const doc=ensureSheetDoc({drawing:{views:[hostView,base,cut],notes:[
    {id:"on-cut",x:5,y:4,text:"section",leader},
    {id:"control",x:5,y:4,text:"host",leader:{...leader,viewId:"host"}},
  ]}});
  doc.views=doc.views.filter(v=>v.id!==base.id);
  const scene=buildSheetScene(doc,{projection:createProjector(doc,partSourceBodies({parts:[block(12)]})),
    topology:[{kind:"edge",persistentId:"shared",descriptor:{curve:"line",endpoints:[{x:8,y:0,z:0},{x:12,y:0,z:0}]}}]});
  assert.equal(scene.notes.get("control").dangling,false);
  assert.equal(scene.notes.get("control").note.leader.u,8);
  const orphan=scene.notes.get("on-cut");
  assert.equal(orphan.dangling,true);
  assert.ok(orphan.missing.includes("shared"));
  assert.deepEqual(orphan.note.leader,leader);
});

test("assembly placement moves a saved rib mask and rotates its normal into the section plane", () => {
  const vertices=partSourceBodies({parts:[block(4)]})[0].positions;
  const def={parts:[{id:"solid",meshData:{positions:vertices,sectionRibs:[{featureId:"rib",normal:{x:1,y:0,z:0},positions:vertices}],sectionRibIssue:"upstream issue"}}]};
  const bodies=assemblySourceBodies({components:[{id:"rotated",def,transform:{rz:90,y:8}}]});
  const masks=sectionRibMasks(bodies,{normal:{x:0,y:1,z:0},origin:{x:0,y:10,z:0}},viewBasis("top"));
  assert.deepEqual(masks.groups.map(g=>g.featureId),["rib"]);
  assert.deepEqual(masks.issues,["upstream issue"]);
  assert.equal(sectionRibMasks(bodies,{normal:{x:1,y:0,z:0},origin:{x:-1,y:0,z:0}},viewBasis("right")).groups.length,0);
});
