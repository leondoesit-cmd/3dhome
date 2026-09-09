/* The draft angle on extrude and extrudeCut.
 *
 * `draftAngle` was declared on both features and read by nothing: the control
 * was in the panel, in the defaults, saved onto the part — and makeBrepExtrusion
 * built the same prism whatever it said. These tests measure the solid, because
 * the only proof that a taper is real is a volume that is no longer w*h*d.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { disposeBrep, loadCadKernel, makeBrepExtrusion } from "../js/cad_kernel.js";
import { featureDefaults } from "../js/core/feature_catalog.js";

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
    try { return { x0: min.X(), y0: min.Y(), z0: min.Z(), x1: max.X(), y1: max.Y(), z1: max.Z() }; }
    finally { min.delete(); max.delete(); }
  } finally { box.delete(); }
};

const faceKinds = async (brep) => {
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

const square = (half) => [{ u: -half, v: -half }, { u: half, v: -half }, { u: half, v: half }, { u: -half, v: half }];
const circle = (radius, count = 48) => Array.from({ length: count }, (_, i) => ({
  u: radius * Math.cos((i / count) * Math.PI * 2), v: radius * Math.sin((i / count) * Math.PI * 2),
}));

// the exact frustum of a square pyramid: bottom 10x10, top (10-2t) square
const frustum = (side, top, height) => (height / 3) * (side * side + top * top + Math.sqrt(side * side * top * top));

test("a drafted extrusion is a frustum, and an undrafted one is still exactly the prism", async () => {
  let plain = null, drafted = null;
  try {
    plain = await makeBrepExtrusion({ axis: "y", from: 0, to: 10, points: square(5) });
    drafted = await makeBrepExtrusion({ axis: "y", from: 0, to: 10, points: square(5), draftAngle: 10 });
    assert.ok(Math.abs(await volume(plain) - 1000) < 1e-6, "the undrafted build is untouched");
    const t = Math.tan((10 * Math.PI) / 180) * 10;
    assert.ok(Math.abs(await volume(drafted) - frustum(10, 10 - 2 * t, 10)) < 1e-3, "each wall leans in by depth*tan(angle)");
    const box = await bounds(drafted);
    assert.ok(Math.abs(box.x1 - 5) < 1e-6, "the sketch plane is the neutral plane: the drawn profile keeps its size");
    assert.ok(Math.abs(box.y1 - 10) < 1e-6, "and the depth is unchanged");
  } finally { [plain, drafted].forEach((entry) => entry && disposeBrep(entry)); }
});

test("draftOutward flares the same taper the other way, and a negative angle is the same thing", async () => {
  let inward = null, outward = null, negative = null;
  const spec = { axis: "y", from: 0, to: 10, points: square(5) };
  try {
    inward = await makeBrepExtrusion({ ...spec, draftAngle: 10 });
    outward = await makeBrepExtrusion({ ...spec, draftAngle: 10, draftOutward: true });
    negative = await makeBrepExtrusion({ ...spec, draftAngle: -10 });
    const t = Math.tan((10 * Math.PI) / 180) * 10;
    assert.ok(await volume(outward) > 1000, "flared: more material than the prism");
    assert.ok(await volume(inward) < 1000, "and the default releases from the tool");
    assert.ok(Math.abs(await volume(outward) - frustum(10, 10 + 2 * t, 10)) < 1e-3);
    assert.ok(Math.abs(await volume(negative) - await volume(outward)) < 1e-6, "a negative angle flares");
    assert.ok(Math.abs((await bounds(outward)).x1 - (5 + t)) < 1e-4, "the far end is the wide one");
  } finally { [inward, outward, negative].forEach((entry) => entry && disposeBrep(entry)); }
});

test("a drafted circular profile is an exact cone, not a faceted one", async () => {
  let drafted = null;
  try {
    drafted = await makeBrepExtrusion({ axis: "y", from: 0, to: 10, points: circle(5), draftAngle: 10 });
    const kinds = await faceKinds(drafted);
    assert.equal(kinds.filter((kind) => kind === "cone").length, 1, "one conical wall");
    assert.equal(kinds.filter((kind) => kind === "plane").length, 2, "and two flat caps");
    const r = 5, top = 5 - Math.tan((10 * Math.PI) / 180) * 10;
    assert.ok(Math.abs(await volume(drafted) - (Math.PI / 3) * 10 * (r * r + r * top + top * top)) < 1e-3);
  } finally { if (drafted) disposeBrep(drafted); }
});

test("the taper follows the run when the extrusion goes the other way", async () => {
  let back = null;
  try {
    back = await makeBrepExtrusion({ axis: "y", from: 0, to: -10, points: square(5), draftAngle: 10 });
    const t = Math.tan((10 * Math.PI) / 180) * 10;
    assert.ok(Math.abs(await volume(back) - frustum(10, 10 - 2 * t, 10)) < 1e-3, "still narrowing away from the sketch plane");
    const box = await bounds(back);
    assert.ok(Math.abs(box.y0 + 10) < 1e-6 && Math.abs(box.y1) < 1e-6);
    assert.ok(Math.abs(box.x1 - 5) < 1e-6, "the wide end is at y=0, where the profile was drawn");
  } finally { if (back) disposeBrep(back); }
});

test("draftBase pins the neutral plane when a cut is stretched past the sketch plane", async () => {
  // What a through-all extrudeCut does: the tool runs from -20 to 20, but the
  // loop was drawn at 0, so the taper has to start there and not at -20.
  let stretched = null;
  try {
    stretched = await makeBrepExtrusion({ axis: "y", from: -20, to: 20, points: square(5), draftAngle: 10, draftBase: 0 });
    const box = await bounds(stretched);
    const t20 = Math.tan((10 * Math.PI) / 180) * 20;
    assert.ok(Math.abs(box.x1 - (5 + t20)) < 1e-3, "widest 20 behind the sketch plane");
    assert.ok(box.x1 > 5, "and the tool is narrower ahead of it");
  } finally { if (stretched) disposeBrep(stretched); }
});

test("the extrude features still declare the draft the kernel now honours", () => {
  ["extrude", "extrudeCut"].forEach((type) => {
    const defaults = featureDefaults(type);
    assert.equal(defaults.draftAngle, 0);
    assert.equal(defaults.draftOutward, false);
  });
});
