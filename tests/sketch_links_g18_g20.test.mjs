import { modelerSource } from "./helpers/modeler_source.mjs";
import test from "node:test";
import assert from "node:assert/strict";

import { solveSketch } from "../js/sketch_solver.js";
import {
  bindModelEdgeTargets, bindPierceTargets, modelEdgeSketchLine, pierceOfSketchEntity,
} from "../js/sketch_intersection.js";
import { sketchWorldPoint } from "../js/core/swept_sources.js";
import { readFileSync } from "node:fs";
import {
  copySketchForClipboard, pasteSketchGeometry, readSketchClipboard, writeSketchClipboard,
} from "../js/core/sketch_clipboard.js";

const near = (a, b, tol = 1e-6) => Math.abs(a - b) < tol;

/* --- G19: Coincident between a sketch point and one model edge ------------ */

test("a circle seen edge-on projects to a segment on the sketch plane", () => {
  // HOUSING's Boss-Stop back rim: circle R 6.50875 about +Z at z = 0, seen from the Right Plane (u = z, v = y).
  const rim = { kind: "edge", descriptor: { curve: "circle", origin: { x: 0, y: 0, z: 0 }, axis: { x: 0, y: 0, z: 1 }, radius: 6.50875 } };
  const line = modelEdgeSketchLine({ plane: "side", offset: 0 }, rim);
  assert.ok(line, "the rim shows edge-on as a line");
  assert.ok(near(line.a.x, 0) && near(line.b.x, 0), "at z = 0");
  assert.ok(near(Math.abs(line.a.y - line.b.y), 2 * 6.50875), "as long as the diameter");
  // Seen face-on (Front Plane) it is not a line.
  assert.equal(modelEdgeSketchLine({ plane: "front", offset: 0 }, rim), null);
});

test("Coincident with a model edge keeps the point on that edge after the body moves", () => {
  const edges = new Map([["rim", { kind: "edge", descriptor: { curve: "circle", origin: { x: 0, y: 0, z: 0.254 }, axis: { x: 0, y: 0, z: 1 }, radius: 6.50875 } }]]);
  const sketch = {
    plane: "side", offset: 0,
    points: [{ id: "a", x: 3, y: 7 }, { id: "b", x: 9, y: 7, fixed: true }],
    entities: [{ id: "h", type: "line", a: "a", b: "b" }],
    constraints: [
      { id: "hz", type: "horizontal", entity: "h" },
      { id: "on", type: "onModelEdge", point: "a", edge: { persistentId: "rim", ownerFeatureId: "stop" } },
    ],
  };
  bindModelEdgeTargets(sketch, (ref) => edges.get(ref.persistentId));
  assert.equal(solveSketch(sketch).converged, true);
  const a = sketch.points[0];
  assert.ok(near(a.x, 0.254), "the end point lies on the rim's plane: " + JSON.stringify(a));
  assert.ok(near(a.y, 7), "and stays on its horizontal line");
  edges.set("rim", { kind: "edge", descriptor: { curve: "circle", origin: { x: 0, y: 0, z: 1.5 }, axis: { x: 0, y: 0, z: 1 }, radius: 6.50875 } });
  bindModelEdgeTargets(sketch, (ref) => edges.get(ref.persistentId));
  assert.equal(solveSketch(sketch).converged, true);
  assert.ok(near(a.x, 1.5), "it follows the edge when the body changes: " + JSON.stringify(a));
});

test("a missing or face-on edge fails loudly instead of leaving the point free", () => {
  const sketch = { plane: "side", offset: 0, points: [{ id: "p", x: 0, y: 0 }], entities: [], constraints: [{ id: "on", type: "onModelEdge", point: "p", edge: { persistentId: "gone" } }] };
  assert.throws(() => bindModelEdgeTargets(sketch, () => null), /unavailable/);
  const faceOn = { kind: "edge", descriptor: { curve: "circle", origin: { x: 0, y: 0, z: 0 }, axis: { x: 1, y: 0, z: 0 }, radius: 2 } };
  assert.throws(() => bindModelEdgeTargets(sketch, () => faceOn), /does not show as a line/);
});

/* --- G20: Pierce between a sketch point and another sketch's curve --------- */

test("Pierce puts a point where another sketch's line crosses this plane, and follows it", () => {
  // HandlePath on the Right Plane (u = z, v = y): a horizontal line at y = 6 from z = 0 to z = -8.
  const path = {
    id: "path", plane: "side", offset: 0,
    points: [{ id: "p1", x: 0, y: 6 }, { id: "p2", x: -8, y: 6 }],
    entities: [{ id: "L", type: "line", a: "p1", b: "p2" }], constraints: [],
  };
  // HandleProfile on a back plane z = -3 (u = x, v = y).
  const profile = {
    id: "profile", plane: "front", offset: -3,
    points: [{ id: "m", x: 1, y: 1 }], entities: [],
    constraints: [{ id: "pc", type: "pierce", point: "m", sketchId: "path", entityId: "L" }],
  };
  bindPierceTargets(profile, [path, profile], sketchWorldPoint);
  assert.equal(solveSketch(profile).converged, true);
  const m = profile.points[0];
  assert.ok(near(m.x, 0) && near(m.y, 6), "on the path where it crosses z = -3: " + JSON.stringify(m));
  path.points.forEach((point) => { point.y = 7.5; });
  bindPierceTargets(profile, [path, profile], sketchWorldPoint);
  assert.equal(solveSketch(profile).converged, true);
  assert.ok(near(m.y, 7.5), "it follows the path when the path changes");
});

test("Pierce onto an arc finds the crossing on the arc, and refuses a curve that never crosses", () => {
  // A quarter arc in the Right Plane from (z=0,y=6) to (z=-3,y=3), centre (z=-3, y=6)... runs counter-clockwise from a to b.
  const path = {
    id: "path", plane: "side", offset: 0,
    points: [{ id: "c", x: 0, y: 0 }, { id: "a", x: 5, y: 0 }, { id: "b", x: 0, y: 5 }],
    entities: [{ id: "A", type: "arc", c: "c", a: "a", b: "b" }], constraints: [],
  };
  const profile = { id: "profile", plane: "front", offset: 3, points: [], entities: [], constraints: [] };
  const hit = pierceOfSketchEntity(profile, path, "A", sketchWorldPoint);
  // z = 3 on the arc of radius 5 about the origin: y = 4.
  assert.ok(near(hit.x, 0, 1e-6) && near(hit.y, 4, 1e-6), JSON.stringify(hit));
  const far = { ...profile, offset: 9 };
  assert.throws(() => pierceOfSketchEntity(far, path, "A", sketchWorldPoint), /does not cross/);
});

/* --- G18: Copy a sketch in one part and paste it into another -------------- */

test("a copied sketch keeps its own geometry and relations and drops links outside it", () => {
  const threadSection = {
    id: "ts", name: "Threadsection", plane: "top", offset: 0,
    points: [{ id: 1, x: 0, y: 0 }, { id: 2, x: 0, y: 0.3175 }, { id: 3, x: -0.16, y: 0.24 }, { id: 4, x: -0.16, y: 0.08 }, { id: 5, x: 0, y: 0.15875 }],
    entities: [
      { id: 10, type: "line", a: 1, b: 2 }, { id: 11, type: "line", a: 2, b: 3 },
      { id: 12, type: "line", a: 3, b: 4 }, { id: 13, type: "line", a: 4, b: 1 },
    ],
    constraints: [
      { id: 20, type: "equal", a: 11, b: 13 },
      { id: 21, type: "distance", entity: 10, value: 0.3175 },
      { id: 22, type: "midpoint", point: 5, entity: 10 },
      { id: 23, type: "pierce", point: 5, sketchId: "path", entityId: "L" },
      { id: 24, type: "intersection", point: 1, edgeA: { persistentId: "x" }, edgeB: { persistentId: "y" } },
    ],
    circleCopies: [{ source: { persistentId: "edge" }, entityId: 99 }],
  };
  const clip = copySketchForClipboard(threadSection, { documentName: "LENSCAP" });
  assert.equal(clip.entities.length, 4);
  assert.deepEqual(clip.constraints.map((c) => c.type).sort(), ["distance", "equal", "midpoint"]);
  assert.deepEqual(clip.droppedRelations.sort(), ["intersection", "pierce"]);
  assert.deepEqual(clip.droppedLinks, ["converted circle"]);
  assert.equal(clip.sourceDocument, "LENSCAP");

  // Stored and read back through a Storage-like object (the target part is a different document).
  const store = new Map();
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  writeSketchClipboard(storage, clip);
  const back = readSketchClipboard(storage);
  assert.equal(back.name, "Threadsection");

  let next = 1000;
  const pasted = pasteSketchGeometry(back, () => next++);
  const pointIds = new Set(pasted.points.map((p) => p.id));
  assert.ok(pasted.points.every((p) => p.id >= 1000), "fresh point ids");
  assert.ok(pasted.entities.every((e) => pointIds.has(e.a) && pointIds.has(e.b)), "entities follow their points");
  const entityIds = new Set(pasted.entities.map((e) => e.id));
  const equal = pasted.constraints.find((c) => c.type === "equal");
  assert.ok(entityIds.has(equal.a) && entityIds.has(equal.b), "relations follow their entities");
  const midpoint = pasted.constraints.find((c) => c.type === "midpoint");
  assert.ok(pointIds.has(midpoint.point) && entityIds.has(midpoint.entity));
  assert.deepEqual(pasted.points.map((p) => [p.x, p.y]), threadSection.points.map((p) => [p.x, p.y]), "the geometry lands at the same plane coordinates");
  assert.equal(solveSketch({ plane: "top", offset: 0, ...pasted }).converged, true, "the pasted sketch still solves");
});

test("copying an empty sketch or pasting with nothing copied says so", () => {
  assert.throws(() => copySketchForClipboard({ entities: [] }), /Select a sketch with geometry/);
  assert.throws(() => pasteSketchGeometry(null, () => 1), /no copied sketch/);
  const storage = { getItem: () => "not json", setItem: () => {} };
  assert.equal(readSketchClipboard(storage), null);
});

test("copied standalone points and spline handles reference fresh destination points",()=>{
  const source={name:'Threadsection',points:[{id:1,x:0,y:0},{id:2,x:1,y:0},{id:3,x:.3,y:.4},{id:4,x:.7,y:.4}],
    entities:[{id:10,type:'point',p:3},{id:11,type:'spline',a:1,h1:3,h2:4,b:2}],
    constraints:[{id:20,type:'fixed',point:3,x:.3,y:.4}]};
  let next=100;
  const pasted=pasteSketchGeometry(copySketchForClipboard(source),()=>next++);
  const byPosition=pasted.points.find(p=>p.x===.3&&p.y===.4);
  const standalone=pasted.entities.find(e=>e.type==='point'),spline=pasted.entities.find(e=>e.type==='spline');
  assert.equal(standalone.p,byPosition.id);
  assert.equal(spline.h1,standalone.p);
  assert.equal(spline.h2,pasted.points.find(p=>p.x===.7).id);
  assert.equal(pasted.constraints[0].point,standalone.p);
  assert.ok(pasted.entities.every(e=>[e.p,e.a,e.b,e.h1,e.h2].filter(id=>id!=null).every(id=>pasted.points.some(p=>p.id===id))));
  assert.equal(source.entities[0].p,3,'copy leaves the source point identity unchanged');
});

/* --- the editor wiring ---------------------------------------------------- */

const modeler = modelerSource();
const tree = readFileSync(new URL("../js/cad_feature_tree.js", import.meta.url), "utf8");
const relationSources = readFileSync(new URL("../js/core/sketch_relation_sources.js", import.meta.url), "utf8");
const strings = readFileSync(new URL("../js/modeler_strings.js", import.meta.url), "utf8");

test("the editor binds, offers and applies all three", () => {
  assert.match(modeler, /bindModelEdgeTargets\(sketch, resolveIntersectionEdge\)[\s\S]{0,160}bindPierceTargets\(sketch, E\.def\.sketches \|\| \[\], sketchWorldPoint\)/, "live solve binds both links");
  assert.match(tree, /resolveSketchRelationSources\(executionDef,relationSourceSketchIds\(feature,sketchId\),edgeLookup,\(ref,origin,direction\)=>brepFaceLineIntersections\(results\.get\(ref\.ownerFeatureId\),ref,origin,direction\)\)/, "rebuild resolves relations on all driving source sketches with native section intersections");
  assert.match(relationSources, /bindModelEdgeTargets\(updated,resolveEdge\);\s*bindPierceTargets\(updated,document\.sketches,sketchWorldPoint\);/, "source relation helper binds both links before solving");
  assert.match(modeler, /case "coincident": return points\.length === 2 \|\| \(points\.length === 1 && !ents\.length && \(selectedModelEdges\(\)\.length === 1 \|\| \(selectedModelVertices\(\)\.length === 1/, "Coincident takes a point and one model edge");
  assert.match(modeler, /add\(\{ type: "onModelEdge", point: points\[0\]\.id, edge:/, "and records the edge");
  assert.match(modeler, /sketch\.constraints\.push\(\{id:uid\(\),type:"pierce",point:anchor\.id,sketchId:sketchCurve\.sketchId,entityId:sketchCurve\.entityId\}\)/, "Pierce takes another sketch's curve");
  assert.match(modeler, /label: t\("sketchCopy"\) \+ " · Ctrl\+C"/, "tree menu Copy sketch");
  assert.match(modeler, /label: t\("sketchPaste"\) \+ " · Ctrl\+V"/, "tree menu Paste sketch");
  assert.match(modeler, /chord === "c" && E\.docType === "part" && treeSelectedSketch\(\)/, "Ctrl+C copies the chosen sketch");
  assert.match(modeler, /chord === "v" && E\.docType === "part" && readClipboardSketch\(\) && pasteReferenceTarget\(\)/, "Ctrl+V pastes onto the chosen plane");
  for (const key of ["cPierce", "pierceNeed", "pierceConflict", "sketchCopy", "sketchPaste", "sketchCopied", "sketchPasted", "sketchCopyDroppedLinks", "sketchClipboardEmpty", "sketchClipboardUnavailable", "sketchPasteNeedPlane"]) {
    assert.match(strings, new RegExp("\\n  " + key + ': \\["[^"]+", "[^"]+"\\]'), key + " has Hebrew and English");
  }
});

/* --- the rebuild path ----------------------------------------------------- */

test("a feature-tree rebuild re-finds a pierce point when the path sketch changes", async () => {
  const { addFeature, regenerateFeatures, releaseRegeneration } = await import("../js/cad_feature_tree.js");
  const definition = {
    references: [{ id: "plane:side" }, { id: "plane:front" }],
    sketches: [
      { id: "path", plane: "side", offset: 0, points: [{ id: "p1", x: 1, y: 6, fixed: true }, { id: "p2", x: -8, y: 6, fixed: true }], entities: [{ id: "L", type: "line", a: "p1", b: "p2" }], constraints: [] },
      { id: "profile", plane: "front", offset: -3, points: [{ id: "m", x: 2, y: 2 }], entities: [], constraints: [{ id: "pc", type: "pierce", point: "m", sketchId: "path", entityId: "L" }] },
    ],
    features: [],
  };
  addFeature(definition, { id: "pathSketch", type: "sketch", params: { sketchId: "path" } });
  addFeature(definition, { id: "profileSketch", type: "sketch", params: { sketchId: "profile" } });
  const first = await regenerateFeatures(definition);
  try {
    assert.equal(first.ok, true, JSON.stringify(first.issues));
    const m = first.boundaryUpdates.get("profile")?.sketch?.points?.find((point) => point.id === "m");
    assert.ok(m && near(m.x, 0) && near(m.y, 6), "pierced at the path: " + JSON.stringify(m));
  } finally { releaseRegeneration(first); }
  definition.sketches[0].points.forEach((point) => { point.y = 9; });
  const second = await regenerateFeatures(definition);
  try {
    const m = second.boundaryUpdates.get("profile")?.sketch?.points?.find((point) => point.id === "m");
    assert.ok(m && near(m.y, 9), "follows the changed path: " + JSON.stringify(m));
  } finally { releaseRegeneration(second); }
});

test("a rebuilt full circle with its seam vertex as both end points still shows edge-on as a line", () => {
  // Boss-Stop's rim exactly as the kernel topology records it after a rebuild.
  const rim = { kind: "edge", persistentId: "feature_mu153lwk_1:tool:edge:profile:74:start", descriptor: {
    curve: "circle", radius: 6.50875, origin: { x: 0, y: 0, z: 0 }, axis: { x: 0, y: 0, z: 1 },
    endpoints: [{ x: 6.50875, y: -1.594183970790067e-15, z: 0 }, { x: 6.50875, y: 0, z: 0 }],
  } };
  const line = modelEdgeSketchLine({ plane: "side", offset: 0 }, rim);
  assert.ok(line, "the seam end points no longer hide the edge-on diameter");
  assert.ok(near(line.a.x, 0) && near(line.b.x, 0) && near(Math.abs(line.a.y - line.b.y), 2 * 6.50875));
  const sketch = {
    plane: "side", offset: 0,
    points: [{ id: "a", x: -0.6, y: 6.9 }, { id: "b", x: -13.2, y: 6.9 }],
    entities: [{ id: "h", type: "line", a: "a", b: "b" }],
    constraints: [{ id: "hz", type: "horizontal", entity: "h" }, { id: "on", type: "onModelEdge", point: "a", edge: { persistentId: rim.persistentId } }],
  };
  bindModelEdgeTargets(sketch, () => rim);
  assert.equal(solveSketch(sketch).converged, true);
  assert.ok(near(sketch.points[0].x, 0), JSON.stringify(sketch.points[0]));
});
