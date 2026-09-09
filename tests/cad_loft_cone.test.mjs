/* A loft between two coaxial circles has to BE a cone.
 *
 * BRepOffsetAPI_ThruSections interpolates the two rational circles' poles
 * linearly, so the wall it builds is not the cone through the same two rims:
 * a 2 -> 4 radius loft over height 10 measured 287.52 against the cone's
 * 293.22, a 2% error on a shape the user drew exactly. `ruled: true` rules
 * between the same poles and does not help. These tests measure the volume,
 * because that difference is the whole point.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { disposeBrep, loadCadKernel, makeBrepCone, makeBrepLoft } from "../js/cad_kernel.js";

const volume = async (brep) => {
  const oc = await loadCadKernel(), props = new oc.GProp_GProps_1();
  try { oc.BRepGProp.VolumeProperties_1(brep.shape, props, false, false, false); return props.Mass(); }
  finally { props.delete(); }
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

// a ring on the XZ plane at height y, the plane a modeler "top" sketch uses
const ring = (radius, y, count = 48) => Array.from({ length: count }, (_, i) => ({
  x: radius * Math.cos((i / count) * Math.PI * 2), y, z: radius * Math.sin((i / count) * Math.PI * 2),
}));
const frustum = (r1, r2, h) => (Math.PI / 3) * h * (r1 * r1 + r1 * r2 + r2 * r2);

test("a loft between two coaxial circles is the exact cone through them", async () => {
  let loft = null;
  try {
    loft = await makeBrepLoft({ sections: [ring(2, 0), ring(4, 10)], solid: true });
    const measured = await volume(loft);
    assert.ok(Math.abs(measured - frustum(2, 4, 10)) < 1e-6, "got " + measured + ", want " + frustum(2, 4, 10));
    assert.ok(Math.abs(measured - 287.52) > 1, "and not the 287.52 ThruSections used to build");
    const kinds = await faceKinds(loft);
    assert.equal(kinds.filter((kind) => kind === "cone").length, 1, "one conical wall");
    assert.equal(kinds.filter((kind) => kind === "plane").length, 2, "and two flat caps");
  } finally { if (loft) disposeBrep(loft); }
});

test("the shortcut holds on a tilted axis and reads the sections' own order", async () => {
  // the same cone lying along +X, and then built the other way up
  const along = (radius, x, count = 48) => Array.from({ length: count }, (_, i) => ({
    x, y: radius * Math.cos((i / count) * Math.PI * 2), z: radius * Math.sin((i / count) * Math.PI * 2),
  }));
  let sideways = null, inverted = null;
  try {
    sideways = await makeBrepLoft({ sections: [along(2, 0), along(4, 10)], solid: true });
    inverted = await makeBrepLoft({ sections: [ring(4, 10), ring(2, 0)], solid: true });
    assert.ok(Math.abs(await volume(sideways) - frustum(2, 4, 10)) < 1e-6);
    assert.ok(Math.abs(await volume(inverted) - frustum(2, 4, 10)) < 1e-6, "the narrow end may be either section");
  } finally { [sideways, inverted].forEach((entry) => entry && disposeBrep(entry)); }
});

test("equal radii give a cylinder, because a cone of zero semi-angle is not a surface", async () => {
  let tube = null;
  try {
    tube = await makeBrepLoft({ sections: [ring(3, 0), ring(3, 10)], solid: true });
    assert.ok(Math.abs(await volume(tube) - Math.PI * 9 * 10) < 1e-6);
    assert.equal((await faceKinds(tube)).filter((kind) => kind === "cylinder").length, 1);
  } finally { if (tube) disposeBrep(tube); }
});

test("everything else is still ThruSections' job", async () => {
  const square = (half, y) => [{ x: -half, y, z: -half }, { x: half, y, z: -half }, { x: half, y, z: half }, { x: -half, y, z: half }];
  const offsetRing = (radius, y, dx) => ring(radius, y).map((q) => ({ ...q, x: q.x + dx }));
  const hexagon = (radius, y) => Array.from({ length: 6 }, (_, i) => ({
    x: radius * Math.cos((i / 6) * Math.PI * 2), y, z: radius * Math.sin((i / 6) * Math.PI * 2),
  }));
  let boxy = null, offAxis = null, threeUp = null, faceted = null;
  try {
    boxy = await makeBrepLoft({ sections: [square(2, 0), square(4, 10)], solid: true });
    assert.ok(Math.abs(await volume(boxy) - (10 / 3) * (16 + 64 + Math.sqrt(16 * 64))) < 1e-3, "a square frustum is untouched");

    // circles whose centres do not lie on the rims' own normal are not coaxial
    offAxis = await makeBrepLoft({ sections: [ring(2, 0), offsetRing(4, 10, 6)], solid: true });
    assert.equal((await faceKinds(offAxis)).filter((kind) => kind === "cone").length, 0);

    threeUp = await makeBrepLoft({ sections: [ring(2, 0), ring(4, 5), ring(2, 10)], solid: true });
    assert.equal((await faceKinds(threeUp)).filter((kind) => kind === "cone").length, 0, "three sections is a loft, not a cone");

    // a hexagon inscribed in a circle has a constant radius and one plane: the
    // perimeter check is the only thing that tells it from the circle
    faceted = await makeBrepLoft({ sections: [hexagon(2, 0), hexagon(4, 10)], solid: true, ruled: true });
    assert.equal((await faceKinds(faceted)).filter((kind) => kind === "cone").length, 0);
    assert.ok(Math.abs(await volume(faceted) - 1.5 * Math.sqrt(3) * (10 / 3) * (4 + 16 + 8)) < 1e-3, "and it is the hexagonal frustum");
  } finally { [boxy, offAxis, threeUp, faceted].forEach((entry) => entry && disposeBrep(entry)); }
});

test("the standalone Cone feature builds a cone, which it never did", async () => {
  // Found while wiring the loft shortcut: makeBrepCone called MakeCone_2, whose
  // signature is (R1, R2, H, angle) and takes no axes at all. It was handed a
  // gp_Ax2 as its first radius and returned a shape of no volume.
  let cone = null, frustumBody = null;
  try {
    cone = await makeBrepCone({ r1: 4, r2: 0, h: 9 });
    assert.ok(Math.abs(await volume(cone) - (Math.PI / 3) * 9 * 16) < 1e-4, "a full cone (an apex clamped off 1e-7 wide), got " + await volume(cone));
    frustumBody = await makeBrepCone({ r1: 4, r2: 2, h: 9, origin: { x: 0, y: 0, z: 0 }, axis: { x: 0, y: 0, z: 1 } });
    assert.ok(Math.abs(await volume(frustumBody) - frustum(4, 2, 9)) < 1e-6);
    assert.equal((await faceKinds(frustumBody)).filter((kind) => kind === "cone").length, 1);
  } finally { [cone, frustumBody].forEach((entry) => entry && disposeBrep(entry)); }
});

test("typed circle sections take the same shortcut, which is the case that mattered", async () => {
  // A rim drawn exactly still got the interpolated wall, because the typed
  // segments took the wire path. Its plane is the step between sections, so
  // coaxiality holds by construction rather than by measurement.
  const typed = (radius, y) => ({ points: ring(radius, y), segments: [{ type: "circle", center: { x: 0, y, z: 0 }, radius }] });
  let exact = null;
  try {
    exact = await makeBrepLoft({ sections: [typed(2, 0), typed(4, 10)], solid: true });
    assert.ok(Math.abs(await volume(exact) - frustum(2, 4, 10)) < 1e-6);
    assert.equal((await faceKinds(exact)).filter((kind) => kind === "cone").length, 1);
  } finally { if (exact) disposeBrep(exact); }
});

test("a typed section that is not a lone circle is left to ThruSections", async () => {
  const oval = (rx, ry, y) => ({
    points: Array.from({ length: 48 }, (_, i) => {
      const a = (i / 48) * Math.PI * 2;
      return { x: rx * Math.cos(a), y, z: ry * Math.sin(a) };
    }),
    segments: [{ type: "ellipse", center: { x: 0, y, z: 0 }, rx, ry, rotation: 0 }],
  });
  let mixed = null;
  try {
    mixed = await makeBrepLoft({ sections: [oval(2, 1, 0), oval(4, 2, 10)], solid: true });
    assert.equal((await faceKinds(mixed)).filter((kind) => kind === "cone").length, 0, "an ellipse is not a circle");
  } finally { if (mixed) disposeBrep(mixed); }
});
