/* Sweep and loft re-derive from their sketches.
 *
 * They used to snapshot profile/path/sections into params at creation and never
 * look again, so editing the driving sketch left the body behind — invisible
 * while these bodies did not draw, a plain staleness bug now that they do. And
 * the snapshot mapped (u,v) -> (x,y) whatever plane the sketch was on, which is
 * how a sweep along a helix came out as a zero-volume sheet.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { resolveProfilePoints, solveSketch } from "../js/sketch_solver.js";
import { loftSourceRecord, resolveSketchSources, sketchWorldPoint, sweepSourceRecord } from "../js/core/swept_sources.js";
import { disposeBrep, loadCadKernel, makeBrepSweep } from "../js/cad_kernel.js";
import { sampleHelix } from "../js/cad_helix.js";
import { synchronizeSketchHelices } from "../js/core/sketch_helix.js";

const modeler = readFileSync(new URL("../js/modeler.js", import.meta.url), "utf8");

const volume = async (brep) => {
  const oc = await loadCadKernel(), props = new oc.GProp_GProps_1();
  try { oc.BRepGProp.VolumeProperties_1(brep.shape, props, false, false, false); return props.Mass(); }
  finally { props.delete(); }
};

const rect = (id, plane, w, h, offset = 0) => ({
  id, plane, offset,
  points: [
    { id: id + "a", x: 0, y: 0 }, { id: id + "b", x: w, y: 0 },
    { id: id + "c", x: w, y: h }, { id: id + "d", x: 0, y: h },
  ],
  entities: [
    { id: id + "1", type: "line", a: id + "a", b: id + "b" }, { id: id + "2", type: "line", a: id + "b", b: id + "c" },
    { id: id + "3", type: "line", a: id + "c", b: id + "d" }, { id: id + "4", type: "line", a: id + "d", b: id + "a" },
  ],
  constraints: [],
});
const idsOf = (sketch) => sketch.entities.map((e) => e.id);

/* --- which plane the points live on -------------------------------------- */

test("a sketch's points land on the sketch's own plane, not always on XY", () => {
  // the bug: (u,v) -> (x,y) whatever the plane, which is only right for "front"
  assert.deepEqual(sketchWorldPoint({ plane: "front", offset: 3 }, 1, 2), { x: 1, y: 2, z: 3 });
  assert.deepEqual(sketchWorldPoint({ plane: "top", offset: 3 }, 1, 2), { x: 1, y: 3, z: 2 });
  assert.deepEqual(sketchWorldPoint({ plane: "right", offset: 3 }, 1, 2), { x: 3, y: 2, z: 1 });
});

test("a sketch on a local frame is placed by the frame, offset and all", () => {
  const frame = { origin: { x: 5, y: 1, z: 0 }, xAxis: { x: 0, y: 0, z: 1 }, yAxis: { x: 0, y: 1, z: 0 }, normal: { x: -1, y: 0, z: 0 } };
  const point = sketchWorldPoint({ frameSpace: "local", frame, plane: "top", offset: 99 }, 2, 3);
  assert.ok(Math.abs(point.x - 5) < 1e-9 && Math.abs(point.y - 4) < 1e-9 && Math.abs(point.z - 2) < 1e-9, JSON.stringify(point));
});

/* --- re-derivation ------------------------------------------------------- */

test("a swept body follows the sketch that drives it", () => {
  const profile = rect("p", "front", 2, 2), path = rect("q", "top", 10, 10);
  const def = { sketches: [profile, path] };
  const sources = sweepSourceRecord(profile, idsOf(profile), path);
  const before = resolveSketchSources(def, sources, resolveProfilePoints);
  assert.equal(before.profile.length, 4);
  assert.equal(before.path.length, 5); // closed path repeats its start
  assert.ok(before.path.every((q) => Math.abs(q.y) < 1e-9), "the path is on its own (top) plane");

  // drive the profile sketch, exactly as a dimension edit would
  profile.constraints.push({ id: "d1", type: "distance", entity: "p1", value: 8 });
  profile.points[0].fixed = true;
  solveSketch(profile);
  const after = resolveSketchSources(def, sources, resolveProfilePoints);
  const width = Math.max(...after.profile.map((q) => q.x)) - Math.min(...after.profile.map((q) => q.x));
  assert.ok(Math.abs(width - 8) < 1e-3, "the swept profile followed the dimension, got " + width);
});

test("a lofted body follows every section sketch, and needs two of them", () => {
  const lower = rect("l", "top", 4, 4, 0), upper = rect("u", "top", 6, 6, 10);
  const def = { sketches: [lower, upper] };
  const sources = loftSourceRecord([lower, upper], [idsOf(lower), idsOf(upper)]);
  const resolved = resolveSketchSources(def, sources, resolveProfilePoints);
  assert.equal(resolved.sections.length, 2);
  assert.ok(resolved.sections[0].every((q) => Math.abs(q.y) < 1e-9), "the lower section sits at its sketch's offset");
  assert.ok(resolved.sections[1].every((q) => Math.abs(q.y - 10) < 1e-9), "and the upper one at its own");

  upper.points[1].x = 20; upper.points[2].x = 20;
  const after = resolveSketchSources(def, sources, resolveProfilePoints);
  assert.ok(Math.abs(Math.max(...after.sections[1].map((q) => q.x)) - 20) < 1e-9, "the top section re-read");
});

test("a source that no longer resolves keeps the last good body instead of deleting it", () => {
  const profile = rect("p", "front", 2, 2), path = rect("q", "top", 10, 10);
  const def = { sketches: [profile, path] };
  const sources = sweepSourceRecord(profile, idsOf(profile), path);
  profile.entities = profile.entities.slice(0, 3);            // the loop is now open
  assert.equal(resolveSketchSources(def, sources, resolveProfilePoints), null);
  assert.equal(resolveSketchSources(def, { kind: "loft", sections: [{ sketchId: "nope", entityIds: ["x"] }] }, resolveProfilePoints), null);
});

test("a helix-driven sweep re-samples the helix rather than a sketch", () => {
  const profile = rect("p", "top", 1, 1);
  const helix = { id: "h1", origin: { x: 0, y: 0, z: 0 }, axis: { x: 0, y: 1, z: 0 }, radius: 5, radiusEnd: 5, pitch: 2, turns: 2, height: 4, handedness: "right", startAngle: 0 };
  const def = { sketches: [profile], referenceGeometry: [helix] };
  const sources = { kind: "sweep", profile: { sketchId: "p", entityIds: idsOf(profile) }, helixId: "h1" };
  const resolved = resolveSketchSources(def, sources, resolveProfilePoints);
  assert.equal(resolved.path.length, sampleHelix(helix).points.length);
  helix.turns = 4;
  assert.ok(resolveSketchSources(def, sources, resolveProfilePoints).path.length > resolved.path.length, "more turns, longer path");
});

test("a driving-circle edit refreshes both the helix reference and its sweep path", () => {
  const profile = rect("p", "top", 1, 1);
  const pathSketch = {
    id:"path-sketch", plane:"top", offset:0,
    points:[{id:"centre",x:0,y:0}],
    entities:[{id:"circle",type:"circle",c:"centre",r:6.223876}], constraints:[],
  };
  const feature={id:"thread-path",type:"helix",params:{sketchId:pathSketch.id,circleId:"circle",definition:"pitch-turns",pitch:.2,turns:5,taper:0}};
  const reference={id:"helix-ref",type:"reference_helix",featureId:feature.id,origin:{x:0,y:0,z:0},axis:{x:0,y:1,z:0},radius:6.223876,radiusEnd:6.223876,pitch:.2,turns:5,height:1};
  const def={sketches:[profile,pathSketch],features:[feature],referenceGeometry:[reference]};
  const sources={kind:"sweep",profile:{sketchId:profile.id,entityIds:idsOf(profile)},helixId:reference.id,helixFeatureId:feature.id};

  pathSketch.entities[0].r=6.1239;
  assert.deepEqual(synchronizeSketchHelices(def),[reference.id]);
  assert.equal(reference.radius,6.1239);
  const resolved=resolveSketchSources(def,sources,resolveProfilePoints);
  assert.ok(Math.abs(Math.hypot(resolved.path[0].x,resolved.path[0].z)-6.1239)<1e-9,JSON.stringify(resolved.path[0]));
});

test("a helix sweep ignores a stale reference snapshot when its feature is available", () => {
  const profile=rect("p","top",1,1),pathSketch={id:"path",plane:"top",points:[{id:"c",x:0,y:0}],entities:[{id:"circle",type:"circle",c:"c",r:4}],constraints:[]};
  const feature={id:"h-feature",type:"helix",params:{sketchId:"path",circleId:"circle",definition:"pitch-turns",pitch:1,turns:2,taper:0}};
  const stale={id:"h-ref",type:"reference_helix",featureId:feature.id,origin:{x:0,y:0,z:0},axis:{x:0,y:1,z:0},radius:9,radiusEnd:9,pitch:1,turns:2,height:2};
  const def={sketches:[profile,pathSketch],features:[feature],referenceGeometry:[stale]};
  const resolved=resolveSketchSources(def,{kind:"sweep",profile:{sketchId:"p",entityIds:idsOf(profile)},helixId:"h-ref",helixFeatureId:feature.id},resolveProfilePoints);
  assert.ok(Math.abs(Math.hypot(resolved.path[0].x,resolved.path[0].z)-4)<1e-9,JSON.stringify(resolved.path[0]));
});

/* --- and the geometry it produces ---------------------------------------- */

test("the plane rule is what makes a helical sweep a solid at all", async () => {
  // The old mapping put the profile in the plane its own path runs along, so
  // OpenCascade swept a sheet: a real volume is the whole proof.
  const helix = { origin: { x: 0, y: 0, z: 0 }, axis: { x: 0, y: 1, z: 0 }, radius: 5, radiusEnd: 5, pitch: 2, turns: 2, height: 4, handedness: "right", startAngle: 0 };
  const path = sampleHelix(helix).points;
  const square = (map) => [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]].map(([u, v]) => map(u, v));
  let front = null, top = null;
  try {
    front = await makeBrepSweep({ profile: square((u, v) => sketchWorldPoint({ plane: "front" }, u, v)), path, solid: true });
    top = await makeBrepSweep({ profile: square((u, v) => sketchWorldPoint({ plane: "top" }, u, v)), path, solid: true });
    assert.ok(Math.abs(await volume(front)) < 1e-6, "the old unconditional XY mapping swept nothing");
    assert.ok(await volume(top) > 1, "the sketch's own plane sweeps a solid");
  } finally { [front, top].forEach((entry) => entry && disposeBrep(entry)); }
});

/* --- the wiring ---------------------------------------------------------- */

test("the editor records the sources and re-derives from them", () => {
  assert.match(modeler, /function syncSweptSourceParts\(\) \{/);
  assert.match(modeler, /if \(syncSweptSourceParts\(\)\) changed = true;/);   // runs with the extrusions
  assert.match(modeler, /sources=sweepSourceRecord\(profile,profileLoop\.entityIds,path\);/);
  assert.match(modeler, /sources=loftSourceRecord\(sectionSketches,sectionSources\);/);
  assert.match(modeler, /addKernelBodyPart\(created,type,params,sources\)/);
  // the snapshot is now built with the same mapping the resolver uses
  assert.doesNotMatch(modeler, /return \{x:point\.u,y:point\.v,z:0\};/);
  assert.doesNotMatch(modeler, /z:sketch\.offset \|\| 0\};/);
});
