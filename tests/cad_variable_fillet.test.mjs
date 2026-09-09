/* Variable-radius fillet.
 *
 * The existing fillet handed one number to BRepFilletAPI_MakeFillet::Add_2 for
 * the whole selection. Add_3(R1, R2, E) is the overload that takes a radius per
 * END of an edge and interpolates between them, and SetRadius_5/_6 address a
 * contour that has already been added. This is the Add_3 route, chosen because
 * it needs no contour bookkeeping and no Handle_Law_Function.
 *
 * The proof has to be a volume. A fillet that silently fell back to the base
 * radius still builds, still meshes and still looks plausible on a cube; only
 * the mass says whether the law ran. So every assertion here is arithmetic
 * against the exact volume a quarter-round removes from a convex edge:
 *   removed = (1 - PI/4) * INTEGRAL r(s)^2 ds along the edge.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { featureDefaults, featureSpec, validateFeatureDefinition } from "../js/core/feature_catalog.js";
import { regenerateFeatures, releaseRegeneration } from "../js/cad_feature_tree.js";
import { disposeBrep, extractBrepTopology, filletBrep, loadCadKernel, makeBrepPrimitive } from "../js/cad_kernel.js";

const CORNER = 1 - Math.PI / 4;      // the sliver a radius-1 quarter-round takes per unit length

const volume = async (brep) => {
  const oc = await loadCadKernel(), props = new oc.GProp_GProps_1();
  try { oc.BRepGProp.VolumeProperties_1(brep.shape, props, false, false, false); return props.Mass(); }
  finally { props.delete(); }
};

const bounds = async (brep) => {
  const oc = await loadCadKernel(), box = new oc.Bnd_Box_1();
  try {
    oc.BRepBndLib.AddOptimal(brep.shape, box, false, true);
    const min = box.CornerMin(), max = box.CornerMax();
    try { return { x0:min.X(), y0:min.Y(), z0:min.Z(), x1:max.X(), y1:max.Y(), z1:max.Z() }; }
    finally { min.delete(); max.delete(); }
  } finally { box.delete(); }
};

const faceTypes = async (brep) => {
  const oc = await loadCadKernel();
  const names = ["plane", "cylinder", "cone", "sphere", "torus", "bezier", "bspline", "revolution", "extrusion", "offset", "other"];
  const explorer = new oc.TopExp_Explorer_2(brep.shape, oc.TopAbs_ShapeEnum.TopAbs_FACE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
  const found = [];
  try {
    while (explorer.More()) {
      const face = oc.TopoDS.Face_1(explorer.Current()), adaptor = new oc.BRepAdaptor_Surface_2(face, true);
      try { found.push(names[Number(adaptor.GetType()?.value)] || "other"); }
      finally { adaptor.delete(); face.delete(); }
      explorer.Next();
    }
  } finally { explorer.delete(); }
  return found;
};

const cube = async (size = 10) => {
  const brep = await makeBrepPrimitive({ type: "box", x: 0, y: 0, z: 0, w: size, h: size, d: size });
  extractBrepTopology(brep, { ownerFeatureId: "cube" });
  return brep;
};

/* An edge named by where it runs, so the test says which edge it means rather
   than trusting the explorer's order. */
const edgeAt = (brep, origin) => {
  const found = brep.topology.find((entry) => entry.kind === "edge"
    && ["x", "y", "z"].every((axis) => Math.abs((entry.descriptor.origin[axis] || 0) - origin[axis]) < 1e-6));
  assert.ok(found, "the cube has an edge centred at " + JSON.stringify(origin));
  return found.persistentId;
};

// the average of r^2 over a linear law from a to b
const meanSquare = (a, b) => Math.abs(a - b) < 1e-12 ? a * a : (b ** 3 - a ** 3) / (3 * (b - a));

/* --- the catalogue entry, no WASM --------------------------------------- */

test("variable radius extends the one fillet feature rather than adding a second", () => {
  const spec = featureSpec("fillet");
  const defaults = featureDefaults("fillet");
  assert.equal(defaults.variableRadius, false, "a fillet is constant until asked otherwise");
  assert.equal(defaults.endRadius, 1);
  assert.deepEqual(defaults.edgeRadii, [], "and carries an empty override list");
  const fields = spec.editor.groups.flatMap((group) => group.fields).map((field) => field.key);
  assert.ok(fields.includes("variableRadius") && fields.includes("endRadius"), "both are in the form");
  fields.forEach((key) => assert.ok(spec.parameters[key], key + " is a declared parameter"));
  // The per-edge list is edited by the edge collector, not by a form field, and
  // the scalar validator would reject an array outright.
  assert.ok(!spec.parameters.edgeRadii, "edgeRadii is deliberately not a scalar parameter");
});

test("a fillet carrying per-edge radii still validates", () => {
  const issues = validateFeatureDefinition({
    id: "f1", type: "fillet",
    params: { ...featureDefaults("fillet"), variableRadius: true, endRadius: 3, edgeRadii: [{ id: "cube:edge:generated:line:1", radius: 2, endRadius: 4 }] },
    references: { features: ["f0"], topology: [{ kind: "edge", persistentId: "cube:edge:generated:line:1" }] },
  });
  assert.deepEqual(issues.filter((issue) => issue.severity === "error"), []);
});

/* --- the real kernel ----------------------------------------------------- */

test("a constant fillet is still exactly the quarter-round it always was", async () => {
  const brep = await cube(10);
  let filleted = null;
  try {
    filleted = await filletBrep(brep, 2, { edgePersistentIds: [edgeAt(brep, { x: 0, y: 0, z: 5 })] });
    const removed = 1000 - await volume(filleted);
    assert.ok(Math.abs(removed - CORNER * 4 * 10) < 1e-6, "r=2 over a length of 10 removes " + (CORNER * 40) + ", got " + removed);
    assert.equal((await faceTypes(filleted)).filter((kind) => kind === "cylinder").length, 1, "one cylindrical round");
  } finally { disposeBrep(brep); if (filleted) disposeBrep(filleted); }
});

test("a radius law along the edge removes the integral of r squared, not the base radius", async () => {
  const brep = await cube(10);
  let variable = null, small = null, large = null;
  try {
    const edge = edgeAt(brep, { x: 0, y: 0, z: 5 });
    variable = await filletBrep(brep, 1, { edgePersistentIds: [edge], variableRadius: true, endRadius: 3 });
    small = await filletBrep(brep, 1, { edgePersistentIds: [edge] });
    large = await filletBrep(brep, 3, { edgePersistentIds: [edge] });
    const removed = 1000 - await volume(variable);
    const expected = CORNER * meanSquare(1, 3) * 10;
    assert.ok(Math.abs(removed - expected) / expected < 0.02, "1 -> 3 removes about " + expected + ", got " + removed);
    // The cheap bug this catches: a law that never ran gives one of these two.
    assert.ok(removed > 1000 - await volume(small) + 1e-3, "and it is not the start radius everywhere");
    assert.ok(removed < 1000 - await volume(large) - 1e-3, "nor the end radius everywhere");
    // A varying round is no longer a cylinder; the surface type is the shape's
    // own witness that the section really changes along the edge.
    assert.equal((await faceTypes(variable)).filter((kind) => kind === "cylinder").length, 0, "the round is not a cylinder any more");
    const box = await bounds(variable);
    assert.ok(Math.abs(box.x0) < 1e-6 && Math.abs(box.y0) < 1e-6 && Math.abs(box.z1 - 10) < 1e-6, "the cube is not resized");
  } finally { [brep, variable, small, large].forEach((entry) => { if (entry) disposeBrep(entry); }); }
});

test("the law reads the same either way round", async () => {
  const brep = await cube(10);
  let up = null, down = null;
  try {
    const edge = edgeAt(brep, { x: 0, y: 0, z: 5 });
    up = await filletBrep(brep, 1, { edgePersistentIds: [edge], variableRadius: true, endRadius: 3 });
    down = await filletBrep(brep, 3, { edgePersistentIds: [edge], variableRadius: true, endRadius: 1 });
    assert.ok(Math.abs(await volume(up) - await volume(down)) < 1e-3, "reversing the ends removes the same material");
  } finally { [brep, up, down].forEach((entry) => { if (entry) disposeBrep(entry); }); }
});

test("a per-edge override beats the feature radius, and only on its own edge", async () => {
  // Two edges on opposite verticals of the cube, so neither round can reach the
  // other and the volumes stay separable.
  const brep = await cube(10);
  let mixed = null;
  try {
    const near = edgeAt(brep, { x: 0, y: 0, z: 5 }), far = edgeAt(brep, { x: 10, y: 10, z: 5 });
    mixed = await filletBrep(brep, 1, {
      edgePersistentIds: [near, far],
      edgeRadii: [{ id: far, radius: 3 }],
    });
    const removed = 1000 - await volume(mixed);
    const expected = CORNER * 10 * (1 * 1 + 3 * 3);
    assert.ok(Math.abs(removed - expected) < 1e-3, "one edge at 1 and one at 3 removes " + expected + ", got " + removed);
  } finally { disposeBrep(brep); if (mixed) disposeBrep(mixed); }
});

test("an override may itself be a law, and an unresolvable id is ignored rather than applied elsewhere", async () => {
  const brep = await cube(10);
  let mixed = null;
  try {
    const near = edgeAt(brep, { x: 0, y: 0, z: 5 }), far = edgeAt(brep, { x: 10, y: 10, z: 5 });
    mixed = await filletBrep(brep, 1, {
      edgePersistentIds: [near, far],
      variableRadius: true, endRadius: 1,
      edgeRadii: [{ id: far, radius: 1, endRadius: 3 }, { id: "cube:edge:no-such-edge", radius: 4 }],
    });
    const removed = 1000 - await volume(mixed);
    const expected = CORNER * 10 * (1 + meanSquare(1, 3));
    assert.ok(Math.abs(removed - expected) / expected < 0.02, "one constant edge and one 1 -> 3 edge removes about " + expected + ", got " + removed);
  } finally { disposeBrep(brep); if (mixed) disposeBrep(mixed); }
});

/* --- the whole path: catalogue -> rebuild -> kernel ---------------------- */

test("a fillet step in a feature tree carries its law and its overrides to the kernel", async () => {
  const edgeRef = (persistentId) => ({ type: "topology-reference", kind: "edge", persistentId, ownerFeatureId: "b1" });
  const box = { id: "b1", type: "box", name: "Box", inputs: [], references: {}, params: { x:0, y:0, z:0, w:10, h:10, d:10 } };
  const def = { features: [box, {
    id: "f1", type: "fillet", name: "Fillet", inputs: ["b1"],
    params: { ...featureDefaults("fillet"), radius: 1, variableRadius: true, endRadius: 3, edgeRadii: [{ id: "b1:edge:z:right:top", radius: 2, endRadius: 2 }] },
    references: { features: ["b1"], topology: [edgeRef("b1:edge:z:left:bottom"), edgeRef("b1:edge:z:right:top")] },
  }] };
  const run = await regenerateFeatures(def);
  try {
    assert.deepEqual(run.issues, [], "both edges resolve");
    const filleted = run.results.get("f1");
    assert.ok(filleted?.shape, "the fillet produced a body");
    const removed = 1000 - await volume(filleted);
    // one edge under the 1 -> 3 law, one pinned flat at 2 by its own override
    const expected = CORNER * 10 * (meanSquare(1, 3) + 4);
    assert.ok(Math.abs(removed - expected) / expected < 0.02, "expected about " + expected + ", got " + removed);
  } finally { releaseRegeneration(run); }
});

test("a blank end radius leaves the edge constant instead of collapsing it to nothing", async () => {
  const brep = await cube(10);
  let filleted = null;
  try {
    filleted = await filletBrep(brep, 2, {
      edgePersistentIds: [edgeAt(brep, { x: 0, y: 0, z: 5 })],
      variableRadius: true, endRadius: 0, edgeRadii: [{ id: "unused" }],
    });
    const removed = 1000 - await volume(filleted);
    assert.ok(Math.abs(removed - CORNER * 4 * 10) < 1e-6, "it falls back to the feature radius at both ends");
  } finally { disposeBrep(brep); if (filleted) disposeBrep(filleted); }
});
