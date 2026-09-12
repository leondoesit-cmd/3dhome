/* The kernel-body part kind: the recipe, the real WASM build behind it, and
   every parts-walking site in the model editor that has to know about it.

   The bug this kind fixes: additive Sweep and Loft created a feature row and
   nothing else. `E.def.parts` only held mesh-buildable kinds, so a solid the
   OpenCascade kernel computes had nowhere to live and the viewport stayed
   empty. Half of these tests exercise the kernel for real; the other half pin
   the modeler's walk sites at the source, which is how this file is tested
   elsewhere (js/modeler.js is a browser module).
*/
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  KERNEL_BODY_KIND,
  buildKernelBrep,
  isKernelBody,
  kernelBodyBounds,
  kernelBodyMeshData,
  kernelBodySpec,
  meshDataBounds,
  offsetKernelBody,
} from "../js/core/kernel_body.js";
import { disposeBrep, loadCadKernel } from "../js/cad_kernel.js";
import { featureDefaults, featureSpec } from "../js/core/feature_catalog.js";
import { createDefinition, migrateDefinition } from "../js/core/schema.js";
import { computeMassProperties } from "../js/cad_interference.js";

const modeler = await readFile(new URL("../js/modeler.js", import.meta.url), "utf8");
/* Pure part geometry and the exact-kernel part recipe, split out of js/modeler.js. */
const partGeometry = await readFile(new URL("../js/modeler_part_geometry.js", import.meta.url), "utf8");
/* The editor's [he, en] table lives in js/modeler_strings.js. */
const modelerStrings = await readFile(new URL("../js/modeler_strings.js", import.meta.url), "utf8");
const interference = await readFile(new URL("../js/cad_interference.js", import.meta.url), "utf8");

const brepVolume = async (brep) => {
  const oc = await loadCadKernel(), props = new oc.GProp_GProps_1();
  try { oc.BRepGProp.VolumeProperties_1(brep.shape, props, false, false, false); return props.Mass(); }
  finally { props.delete(); }
};

const square = (half, z = 0) => [
  { x: -half, y: -half, z }, { x: half, y: -half, z }, { x: half, y: half, z }, { x: -half, y: half, z },
];

const sweepSpec = (overrides = {}) => kernelBodySpec("sweep", {
  ...featureDefaults("sweep"),
  profile: square(1),
  path: [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 20 }],
  ...overrides,
});

const loftSpec = (overrides = {}) => kernelBodySpec("loft", {
  ...featureDefaults("loft"),
  sections: [square(4, 0), square(2, 10)],
  ...overrides,
});

/* --- the recipe, no WASM ------------------------------------------------- */

test("the recipe keeps only what the kernel reads", () => {
  const spec = sweepSpec({ nonsense: 7, twistAngle: 45 });
  assert.equal(spec.type, "sweep");
  assert.equal(spec.params.twistAngle, 45);
  assert.ok(!("nonsense" in spec.params), "a parameter the kernel ignores is not stored as if it mattered");
  assert.equal(spec.params.profile.length, 4);
  assert.throws(() => kernelBodySpec("thicken", {}), /Unsupported kernel body/);
});

test("a kernel body is placed by an offset, and moving it moves the cached bounds too", () => {
  const part = { kind: KERNEL_BODY_KIND, bounds: { x0: 0, x1: 2, y0: 0, y1: 2, z0: 0, z1: 2 } };
  assert.ok(isKernelBody(part));
  offsetKernelBody(part, 5, -1, 0);
  assert.deepEqual(part.origin, { x: 5, y: -1, z: 0 });
  assert.deepEqual(kernelBodyBounds(part), { x0: 5, x1: 7, y0: -1, y1: 1, z0: 0, z1: 2 });
  // a body whose mesh has not arrived contributes no bounds rather than a block
  assert.equal(kernelBodyBounds({ kind: KERNEL_BODY_KIND }), null);
  assert.equal(meshDataBounds([]), null);
});

/* --- and the kernel really builds them ---------------------------------- */

test("a swept feature yields a real solid with the volume the path implies", async () => {
  const brep = await buildKernelBrep(sweepSpec());
  try {
    assert.ok(brep.shape, "the sweep produced a shape");
    // 2x2 section carried 20 along +Z
    assert.ok(Math.abs(await brepVolume(brep) - 80) < 1.5, "the swept volume is the section times the path length");
  } finally { disposeBrep(brep); }
});

test("a lofted feature yields a real solid, and its parameters change the answer", async () => {
  const brep = await buildKernelBrep(loftSpec({ ruled: true }));
  try {
    // prismatoid: h/6 * (A0 + 4*Am + A1) = 10/6 * (64 + 4*36 + 16) = 373.33
    assert.ok(Math.abs(await brepVolume(brep) - 373.33) < 2, "the lofted volume follows the section sizes");
  } finally { disposeBrep(brep); }
});

test("a parameter edit rebuilds the body to a different shape", async () => {
  const straight = await buildKernelBrep(sweepSpec());
  const tapered = await buildKernelBrep(sweepSpec({ scale: 2 }));
  try {
    const a = await brepVolume(straight), b = await brepVolume(tapered);
    assert.ok(b > a * 1.5, "an end scale of 2 makes a visibly bigger solid (" + a + " -> " + b + ")");
  } finally { disposeBrep(straight); disposeBrep(tapered); }
});

test("the tessellation is JSON-safe and carries usable bounds", async () => {
  const mesh = await kernelBodyMeshData(sweepSpec(), { ownerFeatureId: "feature:sweep" });
  assert.ok(Array.isArray(mesh.positions), "positions is a plain Array, not a typed one");
  assert.ok(mesh.positions.length >= 9);
  assert.ok(!mesh.normals && !mesh.colors, "typed normal/colour buffers are not stored — JSON would destroy them");
  const round = JSON.parse(JSON.stringify(mesh));
  assert.deepEqual(round.bounds, mesh.bounds, "the mesh survives a save/load round trip unchanged");
  assert.ok(Math.abs(mesh.bounds.z1 - mesh.bounds.z0 - 20) < 0.1, "the bounds span the swept path");
  assert.ok((mesh.topology || []).length, "face topology comes with it, so faces stay selectable");
});

test("the offset lands the built body where the part sits", async () => {
  const brep = await buildKernelBrep(sweepSpec(), { origin: { x: 100, y: 0, z: 0 } });
  try {
    const oc = await loadCadKernel(), box = new oc.Bnd_Box_1();
    try {
      oc.BRepBndLib.AddOptimal(brep.shape, box, false, true);
      const min = box.CornerMin();
      try { assert.ok(Math.abs(min.X() - 99) < 0.2, "the whole solid moved with the part"); }
      finally { min.delete(); }
    } finally { box.delete(); }
  } finally { disposeBrep(brep); }
});

test("a kernel failure throws rather than returning an empty body", async () => {
  // one section is not a loft; the kernel says so and no half-built part exists
  await assert.rejects(() => kernelBodyMeshData(kernelBodySpec("loft", { sections: [square(4, 0)] })), /at least two profiles/);
  await assert.rejects(() => kernelBodyMeshData(kernelBodySpec("sweep", { profile: square(1), path: [] })), /profile and path|no length/);
});

test("loft continuity reaches the kernel and changes the surface", async () => {
  // three offset sections: a smoothed loft bulges past the ruled one through
  // the middle, so a difference here is proof SetContinuity was applied at all
  const sections = [square(4, 0), square(2, 10), square(4, 20)];
  const ruled = await buildKernelBrep(loftSpec({ sections, ruled: true }));
  const smooth = await buildKernelBrep(loftSpec({ sections, ruled: false, continuity: "curvature" }));
  try {
    const a = await brepVolume(ruled), b = await brepVolume(smooth);
    assert.ok(Math.abs(a - b) > 1, "the two continuities are not the same solid (" + a + " vs " + b + ")");
  } finally { disposeBrep(ruled); disposeBrep(smooth); }
});

test("a kernel body survives a save/load round trip and is then weighed correctly", async () => {
  const mesh = await kernelBodyMeshData(sweepSpec());
  const part = {
    id: "p1", featureId: "feature:sweep", kind: KERNEL_BODY_KIND, name: "Sweep1",
    kernel: sweepSpec(), origin: { x: 0, y: 0, z: 0 }, meshData: mesh, bounds: mesh.bounds,
  };
  const saved = migrateDefinition(createDefinition({ id: "d", name: "d", parts: [part] }));
  // the whole way out to storage and back, which is where an unlisted field dies
  const loaded = migrateDefinition(JSON.parse(JSON.stringify(saved)));
  const back = loaded.parts[0];
  assert.equal(back.kind, KERNEL_BODY_KIND);
  assert.deepEqual(back.kernel, part.kernel, "the recipe survives, so the body can still be rebuilt");
  assert.deepEqual(back.origin, part.origin);
  assert.ok(Array.isArray(back.meshData.positions) && back.meshData.positions.length >= 9, "and so does the mesh");
  assert.deepEqual(kernelBodyBounds(back), mesh.bounds);

  const mass = computeMassProperties(loaded, { density: 1 });
  assert.ok(Math.abs(mass.volumeCm3 - 80) < 2, "the BOM measures the real swept volume, not a bounding block");
  assert.equal(mass.unmeasured, 0);
  // and a body whose kernel build has not landed is reported as unmeasured
  const pending = computeMassProperties({ parts: [{ ...part, meshData: undefined, bounds: undefined }] }, {});
  assert.equal(pending.volumeCm3, 0);
  assert.equal(pending.unmeasured, 1, "no invented block for a body that has no shape yet");
});

/* --- the walk sites in the model editor ---------------------------------- */

test("every parts-walking site in the editor handles the kernel kind", () => {
  const walkers = [
    // bbox: the known failure mode is an unhandled kind dying in here
    ["basePartBounds", /function basePartBounds\(p\)[\s\S]*?\n\}/, partGeometry, "js/modeler_part_geometry.js"],
    ["movePart", /function movePart\(p, dx, dy, dz\)[\s\S]*?\n\}/, partGeometry, "js/modeler_part_geometry.js"],
    ["partUV", /function partUV\(p\)[\s\S]*?\n\}/, modeler, "js/modeler.js"],
    ["partSupportsExactMesh", /function partSupportsExactMesh\(p\)[\s\S]*?\n\}/, partGeometry, "js/modeler_part_geometry.js"],
  ];
  for (const [name, pattern, source, where] of walkers) {
    const body = source.match(pattern);
    assert.ok(body, name + " is still in " + where);
    assert.ok(/isKernelBody|KERNEL_BODY_KIND/.test(body[0]), name + " says what it does with a kernel body");
  }
  // snapTargets took a poly footprint's points without checking there were any;
  // a mesh-projected footprint has segments instead and used to throw here
  const snap = modeler.match(/function snapTargets\(excludePart\)[\s\S]*?\n\}/)[0];
  assert.match(snap, /f\.type === "poly"/, "snapTargets only reads loop points from a footprint that has them");
  // the mass/BOM path measures a kernel body from its mesh, and refuses to
  // guess a block for one whose mesh has not arrived
  assert.match(interference, /kind === "kernel"/);
});

test("a kernel body is refused by mirror rather than duplicated in place", () => {
  const mirror = partGeometry.match(/function mirrorProjectionPart\(q,planeId\)[\s\S]*?\n\}\n/)[0];
  assert.match(partGeometry, /if\(isKernelBody\(q\)\)return null;/, "there is nothing in a recipe to negate");
  assert.match(modeler, /if\(!q\)\{H\.discard\(\);flash\(t\("kernelBodyNoMirror"\)\);return false;\}/, "and the refusal is said out loud");
  // every new user-visible string is a [he, en] pair in the editor's own table
  assert.match(modelerStrings, /kernelBodyNoMirror: \["[^"]+", "[^"]+"\]/);
  assert.match(modelerStrings, /kernelBodyFailed: \["[^{]*\{error\}[^"]*", "[^{]*\{error\}[^"]*"\]/);
});

test("a legacy parts-to-features rebuild re-emits the recipe instead of dropping the body", () => {
  const rebuild = modeler.match(/function rebuildFeatureTreeFromDocument\(target\)[\s\S]*?\n\}\n/)[0];
  assert.match(rebuild, /isKernelBody\(part\) && part\.kernel/);
  assert.match(rebuild, /type:part\.kernel\.type/, "the exact BREP tree still sees a sweep or a loft");
});

test("sweep and loft push a body instead of only a history row", () => {
  const create = modeler.match(/function createMultiSketchFeature\(type, values\)[\s\S]*?\n\}\n/)[0];
  assert.match(create, /addKernelBodyPart/, "the additive branch adds a part");
  // and the subtractive twin still lands on the target's cut list
  assert.match(create, /cutTarget\.cuts3d\.push\(\{kind:"sweep"/);
});

test("editing a sweep or loft feature rebuilds its body", () => {
  const sync = modeler.match(/function syncProjectionFromFeature\(feature\)[\s\S]*?\n\}\n/)[0];
  assert.match(sync, /featureBuildsKernelBody\(feature\.type\)/);
  assert.match(sync, /scheduleKernelBody/, "live edits debounce the kernel so a dragged parameter does not start OpenCascade on every frame");
});

test("a dragged kernel-body parameter is debounced", () => {
  const schedule = modeler.match(/function scheduleKernelBody\(p\)[\s\S]*?\n\}\n/)[0];
  assert.match(schedule, /140/);
  assert.match(schedule, /queueKernelBody\(p\)/);
});

test("a failed kernel build leaves no ghost body", () => {
  const queue = modeler.match(/function queueKernelBody\(p\)[\s\S]*?\n\}\n/)[0];
  assert.match(queue, /delete p\.meshData/, "the stale mesh goes before the rebuild starts");
  assert.match(queue, /delete p\.bounds/, "and so do the bounds, so nothing draws or snaps to a body that failed");
  assert.match(queue, /p\.exactError = /, "the failure is reported on the step that failed");
  assert.match(queue, /refreshChangedPart\(p\)/, "blanking one kernel body must not dispose every other GPU mesh");
  assert.doesNotMatch(queue, /updatePreview\(\)/);
});

test("the loft editor offers no control the kernel ignores", () => {
  const fields = featureSpec("loft").editor.groups.flatMap((group) => group.fields || []).map((field) => field.key);
  assert.ok(!fields.includes("closed"), "BRepOffsetAPI_ThruSections cannot close a loft back onto its first section");
  assert.ok(fields.includes("continuity"), "continuity is offered, and SetContinuity is what receives it");
});
