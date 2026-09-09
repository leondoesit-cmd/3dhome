/* Finishing a kernel-built body.
 *
 * A sweep or a loft produces a solid only OpenCascade knows. Until now the
 * model editor refused every operation that needs to START from that solid:
 * partSupportsExactMesh() answered false, so a swept pipe could not be cut,
 * filleted, chamfered, shelled or drafted, and a 3D cut through one was
 * collected into the "skipped" list and reported as a refusal.
 *
 * The fix is one branch in exactBrepForPart(): begin at buildKernelBrep(). The
 * whole cut/finish loop below it is already generic, which these tests exercise
 * against the real WASM kernel rather than trusting that.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { buildKernelBrep, kernelBodySpec } from "../js/core/kernel_body.js";
import { booleanBrep, chamferBrep, disposeBrep, draftBrep, extractBrepTopology, filletBrep, loadCadKernel, makeBrepPrimitive, shellBrep } from "../js/cad_kernel.js";

const volume = async (brep) => {
  const oc = await loadCadKernel(), props = new oc.GProp_GProps_1();
  try { oc.BRepGProp.VolumeProperties_1(brep.shape, props, false, false, false); return props.Mass(); }
  finally { props.delete(); }
};

const faceCount = async (brep) => {
  const oc = await loadCadKernel();
  const explorer = new oc.TopExp_Explorer_2(brep.shape, oc.TopAbs_ShapeEnum.TopAbs_FACE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
  let n = 0;
  try { while (explorer.More()) { n++; explorer.Next(); } } finally { explorer.delete(); }
  return n;
};

const square = (half, z = 0) => [
  { x: -half, y: -half, z }, { x: half, y: -half, z }, { x: half, y: half, z }, { x: -half, y: half, z },
];

// A 2x2 bar carried 20 along +Z: volume 80, six planar faces, twelve edges.
const barSpec = () => kernelBodySpec("sweep", {
  profile: square(1),
  path: [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 20 }],
  orientation: "follow-path", solid: true,
});

const bar = async () => {
  const brep = await buildKernelBrep(barSpec(), { origin: { x: 0, y: 0, z: 0 } });
  extractBrepTopology(brep, { ownerFeatureId: "feature:part:sweep1" });
  return brep;
};

test("a swept body is a real solid the finish operations can start from", async () => {
  const brep = await bar();
  try {
    assert.ok(Math.abs(await volume(brep) - 80) < 1.5, "the bar starts at 80");
    assert.ok((brep.topology || []).some((item) => item.kind === "edge"), "its edges are named, so a fillet can select one");
  } finally { disposeBrep(brep); }
});

test("a swept body can be filleted — the operation the refusal used to block", async () => {
  const brep = await bar();
  let rounded = null;
  try {
    const before = await volume(brep);
    const faces = await faceCount(brep);
    // Every edge: a 0.4 round on the four long corners removes the four
    // (1 - pi/4) * r^2 * length slivers; end caps add their own.
    rounded = await filletBrep(brep, 0.4, { propagation: "feature" });
    const after = await volume(rounded);
    assert.ok(after < before, "rounding removes material (" + before + " -> " + after + ")");
    assert.ok(before - after < 8, "and only the corner slivers, not a chunk of the bar");
    assert.ok(await faceCount(rounded) > faces, "the fillet added faces of its own");
  } finally { disposeBrep(brep); if (rounded) disposeBrep(rounded); }
});

test("and chamfered, shelled and drafted — the whole generic finish loop", async () => {
  const brep = await bar();
  const built = [];
  try {
    const before = await volume(brep);
    const chamfered = await chamferBrep(brep, 0.3, { propagation: "feature" }); built.push(chamfered);
    assert.ok(await volume(chamfered) < before, "a chamfer cuts the corners off a swept bar");

    // The +Z cap of the bar, named by the extraction, opened into a tube.
    const cap = brep.topology.find((item) => item.kind === "face"
      && item.descriptor.surface === "plane" && (item.descriptor.normal.z || 0) > 0.99);
    assert.ok(cap, "the sweep's end cap is a named planar face");
    const shelled = await shellBrep(brep, 0.3, { facePersistentIds: [cap.persistentId] }); built.push(shelled);
    const hollow = await volume(shelled);
    // walls only: 80 minus the 1.4 x 1.4 x (20 - 0.3) cavity the open cap leaves
    assert.ok(Math.abs(hollow - (80 - 1.4 * 1.4 * 19.7)) < 0.5, "shelling leaves walls, not a solid (" + hollow + ")");

    const side = brep.topology.find((item) => item.kind === "face"
      && item.descriptor.surface === "plane" && (item.descriptor.normal.x || 0) > 0.99);
    assert.ok(side, "and its side wall is named too");
    const drafted = await draftBrep(brep, 3, {
      facePersistentIds: [side.persistentId], pullAxis: "z", pullDirection: "forward", neutral: "end",
    }); built.push(drafted);
    const tapered = await volume(drafted);
    // the wall pivots on z=20 and flares back down: a wedge 20*tan(3°) x 2 x 20/2
    const wedge = 0.5 * 20 * Math.tan((3 * Math.PI) / 180) * 2 * 20;
    assert.ok(Math.abs((tapered - before) - wedge) < 0.5, "gained " + (tapered - before) + ", expected " + wedge);
  } finally { disposeBrep(brep); built.forEach(disposeBrep); }
});

test("a 3D cut through a swept body removes exactly the tool", async () => {
  const brep = await bar();
  let cutter = null, cut = null;
  try {
    const before = await volume(brep);
    // a 4-long block straight through the 2x2 section
    cutter = await makeBrepPrimitive({ type: "box", x: -2, y: -2, z: 8, w: 4, h: 4, d: 4 });
    cut = await booleanBrep("subtract", brep, cutter);
    assert.ok(Math.abs((before - await volume(cut)) - 16) < 0.5, "the 2x2x4 slot is gone and nothing else");
  } finally { disposeBrep(brep); if (cutter) disposeBrep(cutter); if (cut) disposeBrep(cut); }
});

/* --- the editor wiring: js/modeler.js is a browser module ---------------- */

const modeler = readFileSync(new URL("../js/modeler.js", import.meta.url), "utf8");
/* Pure part geometry and the exact-kernel part recipe, split out of js/modeler.js. */
const partGeometry = readFileSync(new URL("../js/modeler_part_geometry.js", import.meta.url), "utf8");

test("partSupportsExactMesh tells the truth about a kernel body", () => {
  const body = partGeometry.match(/function partSupportsExactMesh\(p\)[\s\S]*?\n\}/)[0];
  assert.match(partGeometry, /if \(isKernelBody\(p\)\) return !!\(p\.kernel && p\.kernel\.type\);/,
    "a body with a recipe can be rebuilt; one without still cannot");
  assert.doesNotMatch(body, /isKernelBody\(p\)\) return false/);
});

test("exactBrepForPart starts a kernel body from its recipe", () => {
  const body = partGeometry.match(/async function exactBrepForPart\(p\)[\s\S]*?\n\}\n/)[0];
  assert.match(partGeometry, /if \(isKernelBody\(p\)\) \{[\s\S]*?buildKernelBrep\(p\.kernel,\{origin:p\.origin\}\)/);
  // and the cut/finish loop below it is the same one every other kind uses
  assert.match(partGeometry, /booleanBrep\("subtract", solid, cutter\)/);
  assert.match(partGeometry, /next=await filletBrep\(solid/);
  // the recipe builder is imported where exactBrepForPart now lives
  assert.match(partGeometry, /import \{ isKernelBody, kernelBodyBounds, buildKernelBrep, offsetKernelBody \} from "\.\/core\/kernel_body\.js";/);
});

test("the finish commands stop refusing bodies the kernel can rebuild", () => {
  // A hand-rolled kind list ["box","cyl","ext"] guarded fillet, chamfer, shell,
  // draft and the live preview. It was a stale copy of partSupportsExactMesh
  // that flashed "pick a solid" at a swept pipe — and at a revolve or a loft.
  assert.doesNotMatch(modeler, /\["box","cyl","ext"\]/, "no second, staler answer to the same question");
  ["quickRoundPart", "quickShellPart", "quickDraftPart"].forEach((name) => {
    const body = modeler.match(new RegExp("function " + name + "\\([^)]*\\)[\\s\\S]*?\\n\\}\\n"))[0];
    assert.match(body, /if \(!partSupportsExactMesh\(p\)\) \{ flash\(/, name + " asks the one predicate");
  });
  const preview = modeler.match(/function exactFinishPreviewPart\(type,state\)[\s\S]*?\n\}\n/)[0];
  assert.match(preview, /if\(!partSupportsExactMesh\(source\)\)return null;/);
});

test("one builder, not two: a cut kernel body rebuilds through the exact path", () => {
  const queue = modeler.match(/function queueKernelBody\(p\)[\s\S]*?\n\}\n/)[0];
  assert.match(queue, /if \(partNeedsExactMesh\(p\)\) \{ queueExactMesh\(p\); return; \}/);
  const exact = modeler.match(/function queueExactMesh\(p\)[\s\S]*?\n\}\n/)[0];
  // the kernel body's own invariants have to hold on this path too
  assert.match(exact, /if \(isKernelBody\(p\)\) \{ delete p\.meshData; delete p\.bounds;/, "no ghost body while it builds or after it fails");
  assert.match(exact, /delete meshData\.normals; delete meshData\.colors;/, "typed buffers never reach JSON.stringify");
  assert.match(exact, /p\.bounds = meshData\.bounds;/);
  const invalidate = modeler.match(/function invalidatePartMeshAfterEdit\(p\)[\s\S]*?\n\}\n/)[0];
  assert.match(invalidate, /if \(isKernelBody\(p\)\) delete p\.bounds;/);
});
