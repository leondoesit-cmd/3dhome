import test from 'node:test';
import assert from 'node:assert/strict';
import {makeBrepExtrusion,extractBrepTopology,filletBrep,disposeBrep} from '../js/cad_kernel.js';
import {offsetFaceBoundary,appendBoundarySketch,splitClosedKernelCurve} from '../js/cad_face_offset.js';
import {analyzeSketchProfiles} from '../js/sketch_profiles.js';
import {frameFromPlane} from '../js/core/frame.js';
import {solveSketch} from '../js/sketch_solver.js';
import {segmentProfilePoints, sketchProfileSegments} from '../js/core/profile_curves.js';
import {toolFeatureRecipe,translateToolRecord} from '../js/core/tool_recipe.js';
import {edgeLiesOnFace} from '../js/core/topology.js';

test('rim face selection excludes edges on a shallow pocket floor',()=>{
 const face={descriptor:{surface:'plane',origin:{x:0,y:10.414,z:0},normal:{x:0,y:1,z:0},measure:4}};
 const edge=y=>({descriptor:{curve:'circle',origin:{x:0,y,z:0},axis:{x:0,y:1,z:0},radius:.889}});
 assert.equal(edgeLiesOnFace(edge(10.414),face),true);
 assert.equal(edgeLiesOnFace(edge(9.906),face),false);
});

function assertWired(segments) {
  for (let i = 0; i < segments.length; i++) {
    const a = segments[i], b = segments[(i + 1) % segments.length];
    assert.ok(Math.hypot(a.to.u - b.from.u, a.to.v - b.from.v) < 1e-6, JSON.stringify({ i, from: a.to, next: b.from, types: [a.type, b.type] }));
  }
}

test('a box top at offset 0 keeps wire order on every edge', async () => {
  const box = await makeBrepExtrusion({ points: [{ u: 0, v: 0 }, { u: 10, v: 0 }, { u: 10, v: 8 }, { u: 0, v: 8 }], from: 0, to: 4, axis: 'y' });
  try {
    extractBrepTopology(box);
    const face = box.topology.find((item) => item.kind === 'face' && item.descriptor.surface === 'plane' && item.descriptor.origin.y > 3);
    const frame = frameFromPlane({ x: 5, y: 4, z: 4 }, { x: 0, y: 1, z: 0 });
    const loops = offsetFaceBoundary(box, face, frame, 0);
    assert.equal(loops.length, 1);
    assert.equal(loops[0].length, 4);
    assertWired(loops[0]);
  } finally { disposeBrep(box); }
});

test('a filleted battery top at offset 0 still chains lines and arcs', async () => {
  let base, rounded;
  try {
    base = await makeBrepExtrusion({ points: [{ u: -3.429, v: -3.429 }, { u: 3.429, v: -3.429 }, { u: 3.429, v: 3.429 }, { u: -3.429, v: 3.429 }], from: 0, to: 10.414, axis: 'y' });
    extractBrepTopology(base);
    const edges = base.topology.filter((e) => e.kind === 'edge' && Math.abs(e.descriptor.axis.y) > 0.99).map((e) => e.persistentId);
    rounded = await filletBrep(base, 1.27, { edgePersistentIds: edges });
    extractBrepTopology(rounded);
    const face = rounded.topology.find((e) => e.kind === 'face' && e.descriptor.surface === 'plane' && e.descriptor.origin.y > 10);
    const frame = frameFromPlane({ x: 0, y: 10.414, z: 0 }, { x: 0, y: 1, z: 0 });
    const loops = offsetFaceBoundary(rounded, face, frame, 0);
    assert.equal(loops.length, 1);
    assertWired(loops[0]);
  } finally { disposeBrep(rounded); disposeBrep(base); }
});

test('a closed ellipse face becomes an ellipse entity, not a zero-length line', async () => {
  const boss = await makeBrepExtrusion({
    points: [{ u: 5, v: 0 }, { u: 0, v: 2 }, { u: -5, v: 0 }, { u: 0, v: -2 }],
    segments: [{ type: 'ellipse', center: { u: 0, v: 0 }, rx: 5, ry: 2, rot: 0 }],
    from: 0, to: 3, axis: 'y',
  });
  try {
    extractBrepTopology(boss);
    const face = boss.topology.find((item) => item.kind === 'face' && item.descriptor.surface === 'plane' && item.descriptor.origin.y > 2);
    const frame = frameFromPlane({ x: 0, y: 3, z: 0 }, { x: 0, y: 1, z: 0 });
    const loops = offsetFaceBoundary(boss, face, frame, 0);
    assert.equal(loops.length, 1);
    assert.ok(loops[0].some((segment) => segment.type === 'ellipse'), JSON.stringify(loops[0].map((s) => s.type)));
    assert.equal(loops[0].some((segment) => segment.type === 'line' && Math.hypot(segment.from.u - segment.to.u, segment.from.v - segment.to.v) < 1e-7), false);
    let n = 0;
    const sketch = { points: [], entities: [], constraints: [] };
    appendBoundarySketch(sketch, loops, () => `e${++n}`);
    assert.ok(sketch.entities.some((entity) => entity.type === 'ellipse' && entity.rx > 4 && entity.ry > 1));
    assert.equal(sketch.entities.some((entity) => entity.type === 'line' && entity.a === entity.b), false);
  } finally { disposeBrep(boss); }
});

test('a frozen arc with unequal endpoint radii remains invalid',()=>{
 const sketch={points:[{id:'c',x:0,y:0,fixed:true},{id:'a',x:1,y:0,fixed:true},{id:'b',x:0,y:2,fixed:true}],entities:[{id:'arc',type:'arc',c:'c',a:'a',b:'b'}],constraints:[]};
 assert.equal(solveSketch(sketch).status,'conflicting');
});

test('battery face inset retains four true lines and four true arcs',async()=>{
 let base,rounded;
 try{
  base=await makeBrepExtrusion({points:[{u:-3.429,v:-3.429},{u:3.429,v:-3.429},{u:3.429,v:3.429},{u:-3.429,v:3.429}],from:0,to:10.414,axis:'y'});
  extractBrepTopology(base);
  const edges=base.topology.filter(e=>e.kind==='edge'&&Math.abs(e.descriptor.axis.y)>.99).map(e=>e.persistentId);
  rounded=await filletBrep(base,1.27,{edgePersistentIds:edges});
  extractBrepTopology(rounded);
  const face=rounded.topology.find(e=>e.kind==='face'&&e.descriptor.surface==='plane'&&e.descriptor.origin.y>10);
  const frame=frameFromPlane({x:0,y:10.414,z:0},{x:0,y:1,z:0});
  const loops=offsetFaceBoundary(rounded,face,frame,-.381);
  assert.equal(loops.length,1);
  assert.equal(loops[0].filter(s=>s.type==='line').length,4);
  assert.equal(loops[0].filter(s=>s.type==='arc').length,4);
  assert.ok(loops[0].filter(s=>s.type==='arc').every(s=>Math.abs(s.radius-.889)<1e-6));
  let n=0;const sketch={points:[],entities:[],constraints:[]};
  appendBoundarySketch(sketch,loops,()=>`p${++n}`);
  assert.equal(solveSketch(sketch).status,'fully-constrained');
  assert.equal(analyzeSketchProfiles(sketch).profiles.length,1);
  const segments=sketchProfileSegments(sketch,sketch.entities.map(e=>e.id));
  const record={axis:'y',from:9.906,to:10.414,loop:analyzeSketchProfiles(sketch).profiles[0].points,segments};
  const recipe=toolFeatureRecipe(record);
  const cutter=await makeBrepExtrusion(recipe.params);
  try {
    extractBrepTopology(cutter);
    assert.equal(cutter.topology.filter(e=>e.kind==='face').length,10);
    assert.equal(cutter.topology.filter(e=>e.kind==='face'&&e.descriptor.surface==='cylinder').length,4);
  } finally {disposeBrep(cutter);}
  const original=structuredClone(record.segments);
  translateToolRecord(record,2,3,4);
  assert.equal(record.segments[0].from.u,original[0].from.u+2);
  assert.equal(record.segments[0].from.v,original[0].from.v+4);
  assert.equal(record.from,12.906);
 }finally{disposeBrep(rounded);disposeBrep(base);}
});

test('a reversed closed kernelCurve splits on the sample walk, not the forward parameter range', () => {
  const samples = Array.from({ length: 9 }, (_, i) => {
    const a = (i / 8) * Math.PI * 2;
    return { u: Math.cos(a), v: Math.sin(a) };
  });
  const segment = { type: 'kernelCurve', from: samples[0], to: samples[8], samples, first: 2, last: 8, reversed: true };
  const [a, b] = splitClosedKernelCurve(segment);
  assert.equal(a.samples[0].u, samples[0].u);
  assert.equal(a.samples[0].v, samples[0].v);
  assert.equal(a.to.u, samples[4].u);
  assert.ok(Math.abs(a.first - 5) < 1e-9, 'first ' + a.first);
  assert.ok(Math.abs(a.last - 8) < 1e-9, 'last ' + a.last);
  assert.ok(Math.abs(b.first - 2) < 1e-9, 'b.first ' + b.first);
  assert.ok(Math.abs(b.last - 5) < 1e-9, 'b.last ' + b.last);
  const tess = segmentProfilePoints([a]);
  assert.equal(tess[0].u, a.samples[0].u);
  assert.equal(tess[0].v, a.samples[0].v);
});

test('a backwards closed spline edge still tessellates from from toward to', async () => {
  const points = [
    { u: 2, v: 0 }, { u: 1.5, v: 1.2 }, { u: 0, v: 2 }, { u: -1.6, v: 1 },
    { u: -2, v: 0 }, { u: -1, v: -1.4 }, { u: 0, v: -2 }, { u: 1.4, v: -1.1 },
  ];
  const blob = await makeBrepExtrusion({
    points,
    segments: [{ type: 'spline', points: points.concat([points[0]]) }],
    from: 0, to: 3, axis: 'y',
  });
  try {
    extractBrepTopology(blob);
    const face = blob.topology.find((item) => item.kind === 'face' && item.descriptor.surface === 'plane' && item.descriptor.origin.y > 2);
    const frame = frameFromPlane({ x: 0, y: 3, z: 0 }, { x: 0, y: 1, z: 0 });
    const loops = offsetFaceBoundary(blob, face, frame, 0);
    const curves = loops.flat().filter((segment) => segment.type === 'kernelCurve');
    assert.ok(curves.length >= 1, 'expected a closed spline as kernelCurve halves');
    const reversed = curves.filter((segment) => segment.reversed);
    assert.ok(reversed.length >= 1, 'the closed spline edge is reversed on the wire');
    for (const segment of reversed) {
      assert.ok(Math.hypot(segment.samples[0].u - segment.from.u, segment.samples[0].v - segment.from.v) < 1e-6);
      const tess = segmentProfilePoints([segment]);
      assert.ok(Math.hypot(tess[0].u - segment.from.u, tess[0].v - segment.from.v) < 1e-6);
    }
    const rebuilt = await makeBrepExtrusion({
      points: loops[0].flatMap((segment) => segment.samples || [segment.from]),
      segments: loops[0],
      from: 3, to: 4, axis: 'y',
    });
    try {
      extractBrepTopology(rebuilt);
      assert.ok(rebuilt.topology.some((item) => item.kind === 'face'));
    } finally { disposeBrep(rebuilt); }
  } finally { disposeBrep(blob); }
});
