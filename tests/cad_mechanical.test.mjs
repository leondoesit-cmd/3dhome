import test from "node:test";
import assert from "node:assert/strict";
import { createHelix, helixLength, helixPoint, sampleHelix, documentHelixOverlays, sweepUsesHelixPath } from "../js/cad_helix.js";
import { cosmeticThread, modeledThreadSolid, threadCallout, threadDesignation, validateThreadFeature, documentThreadOverlays } from "../js/cad_thread.js";
import { knurlBandMesh, knurlCallout, knurlGrooveHelices, validateKnurl } from "../js/cad_knurl.js";
import { holeCallout, holeLayoutPoints, holeWizardSolids, holeWizardThread, normalizeHoleWizard } from "../js/cad_hole_wizard.js";
import { classifyFit, evaluateFit, fitCallout, shaftTolerance } from "../js/cad_fits.js";
import { insertBody, STOCK_MATERIALS, applyAppearanceOverrides, createAppearanceOverride, upsertAppearanceOverride } from "../js/cad_appearances.js";
import { toolboxFastener, listToolboxPicker, preferredLength } from "../js/cad_toolbox.js";
import { captureConfiguration, ensureConfigurations, setActiveConfiguration } from "../js/cad_configurations.js";
import { collectHoleCallouts, createDrawingSvg } from "../js/cad_drawings.js";
import { solveTopologyMates, topologyReference } from "../js/cad_mates.js";
import { angleBetween, eulerMatrix, mateResidual, mateResidualVector } from "../js/cad_mate_model.js";
import { createFeatureDefinition, createPartDocument, createSketchDefinition } from "../js/core/parametric_document.js";
import { compileKernelFeatureTree } from "../js/core/kernel_feature_adapter.js";
import { createReferencePlane, createHelix as refHelix } from "../js/cad_reference_geometry.js";
import { inferSmartMate } from "../js/modeler_smartmates.js";

test("a right-hand helix advances along +Y as the angle increases", () => {
  const spec = { origin: { x: 0, y: 0, z: 0 }, axis: { x: 0, y: 1, z: 0 }, radius: 1, pitch: 0.2, turns: 2, handedness: "rh" };
  const start = helixPoint(spec, 0), mid = helixPoint(spec, 0.5), end = helixPoint(spec, 1);
  assert.equal(start.y, 0);
  assert.ok(Math.abs(mid.y - 0.2) < 1e-9);
  assert.ok(Math.abs(end.y - 0.4) < 1e-9);
  assert.ok(helixLength(spec) > 0.4);
  const sampled = sampleHelix(spec);
  assert.ok(sampled.points.length > 8);
  assert.equal(createHelix(spec).type, "reference_helix");
  assert.equal(refHelix(spec).type, "reference_helix");
  assert.equal(createReferencePlane().type, "reference_plane");
});

test("ISO metric cosmetic threads carry a callout and a helical overlay", () => {
  const spec = { diameterMm: 8, pitchMm: 1.25, lengthMm: 12.5, side: "external", mode: "cosmetic" };
  assert.equal(validateThreadFeature(spec).ok, true);
  assert.equal(threadDesignation(8, 1.25, { omitCoarsePitch: true }), "M8");
  const cosmetic = cosmeticThread(spec);
  assert.equal(cosmetic.kind, "cosmetic-thread");
  assert.ok(cosmetic.overlay.length > 8);
  assert.match(threadCallout(spec), /M8/);
  const modeled = modeledThreadSolid({ ...spec, mode: "modeled", side: "internal" });
  assert.equal(modeled.operation, "subtract");
  assert.ok(modeled.profile.length >= 3);
  assert.ok(modeled.path.length > 8);
});

test("diamond knurls emit two helical groove families and a displaced band mesh", () => {
  const spec = { type: "diamond", pitchMm: 1, diameterMm: 30, lengthMm: 12, helixAngle: 30 };
  assert.equal(validateKnurl(spec).ok, true);
  const grooves = knurlGrooveHelices(spec);
  assert.equal(grooves.filter((g) => g.family === "left").length, grooves.filter((g) => g.family === "right").length);
  assert.ok(grooves.length >= 6);
  const mesh = knurlBandMesh(spec);
  assert.ok(mesh.positions.length > 100);
  assert.equal(knurlCallout(spec), "RGE 1");
  assert.equal(validateKnurl({ type: "straight", pitchMm: 0.8, diameterMm: 20, lengthMm: 10 }).ok, true);
});

test("hole wizard stacks counterbore, countersink, tap-drill and callouts", () => {
  const cbore = holeWizardSolids({ holeType: "counterbore", standardSize: "M6", endCondition: "through-all", depth: 2 });
  assert.equal(cbore.solids.length, 2);
  assert.equal(cbore.solids[0].role, "bore");
  assert.equal(cbore.solids[1].role, "counterbore");
  assert.ok(cbore.solids[1].diameter > cbore.solids[0].diameter);
  const tap = holeWizardSolids({ holeType: "tapped", standardSize: "M8", endCondition: "blind", depthMm: 16 });
  assert.ok(tap.solids[0].diameter < 0.8);
  const thread = holeWizardThread({ holeType: "tapped", standardSize: "M8", depthMm: 16 });
  assert.equal(thread.spec.side, "internal");
  assert.match(holeCallout({ holeType: "counterbore", standardSize: "M6", diameterMm: 7, cboreDiameterMm: 11, cboreDepthMm: 6.6, endCondition: "through-all" }), /Ø7/);
  const csink = holeWizardSolids({ holeType: "countersink", standardSize: "M5", countersink: true });
  assert.ok(csink.solids.some((s) => s.kind === "cone"));
  const layout = holeLayoutPoints({ layout: "linear", countX: 2, countY: 2, spacingX: 4, spacingY: 4 });
  assert.equal(layout.length, 4);
  const circle = holeLayoutPoints({ layout: "circular", count: 4, radius: 3 });
  assert.equal(circle.length, 4);
});

test("ISO 286 H7/g6 is clearance, H7/h6 is locational clearance, H7/p6 is interference", () => {
  const slide = evaluateFit(20, "H7/g6");
  assert.equal(slide.kind, "clearance");
  assert.ok(slide.minClearanceMm > 0);
  const locational = evaluateFit(20, "H7/h6");
  assert.equal(locational.kind, "clearance");
  assert.equal(locational.minClearanceMm, 0);
  const shaftP = shaftTolerance(20, "p", 6);
  assert.equal(shaftP.ei, 22);
  assert.equal(shaftP.es, 35);
  assert.equal(classifyFit(20, "H7/p6"), "interference");
  assert.ok(evaluateFit(20, "H7/p6").maxClearanceMm < 0);
  assert.equal(classifyFit(20, "H7/s6"), "interference");
  assert.equal(classifyFit(20, "H7/k6"), "transition");
  assert.match(fitCallout(8, "H7/h6"), /Ø8/);
  assert.throws(() => evaluateFit(150, "H7/g6"), /120/);
});

test("toolbox SHCS, hex screw, nut and brass bushing carry ISO declarations", () => {
  const shcs = toolboxFastener({ kind: "shcs", size: "M8", lengthMm: 30 });
  assert.equal(shcs.parts.length, 2);
  assert.equal(shcs.spec.standard, "ISO 4762:2018");
  assert.equal(shcs.parts[0].threadGeometry.profile, "ISO-metric-60");
  const hex = toolboxFastener({ kind: "hex-screw", size: "M8", lengthMm: 30 });
  assert.equal(hex.spec.standard, "ISO 4017:2022");
  const nut = toolboxFastener({ kind: "hex-nut", size: "M8" });
  assert.equal(nut.parts[0].kind, "ext");
  const bush = toolboxFastener({ kind: "bushing", size: "M8" });
  assert.equal(bush.parts[0].materialName, "Brass");
  assert.ok(bush.parts[0].holes[0].length > 8);
  const insert = insertBody({ innerMm: 8, outerMm: 12, lengthMm: 10, material: "brass" });
  assert.equal(insert.manufacturingRole, "insert");
  assert.equal(STOCK_MATERIALS.brass.color, "#c4a35a");
});

test("configurations capture parameter overrides without forking history", () => {
  const document = { features: [{ id: "f1", suppressed: false }], parameterOverrides: { height: 10 } };
  ensureConfigurations(document);
  assert.equal(document.configurations[0].parameterOverrides.height, 10);
  document.features[0].suppressed = true;
  document.parameterOverrides = { height: 20 };
  const cfg = captureConfiguration(document, { name: "Tall" });
  assert.equal(cfg.parameterOverrides.height, 20);
  assert.deepEqual(cfg.suppressedFeatureIds, ["f1"]);
  setActiveConfiguration(document, "cfg_default");
  assert.equal(document.activeConfiguration, "cfg_default");
  assert.equal(document.parameterOverrides.height, 10);
  assert.equal(document.features[0].suppressed, false);
  setActiveConfiguration(document, cfg.id);
  assert.equal(document.features[0].suppressed, true);
  assert.equal(document.parameterOverrides.height, 20);
});

test("drawings add section views, hole callouts and a title block", () => {
  const def = {
    name: "Flange",
    parts: [{ kind: "box", x0: 0, x1: 20, y0: 0, y1: 5, z0: 0, z1: 10 }],
    features: [{ id: "h1", type: "hole", params: { holeType: "counterbore", standardSize: "M6", diameterMm: 7, endCondition: "through-all" } }],
  };
  const svg = createDrawingSvg(def, { section: true, holeCallouts: true, balloons: true, number: "A-100", revision: "B" });
  assert.match(svg, /FRONT/);
  assert.match(svg, /SECTION A-A/);
  assert.match(svg, /Flange/);
  assert.match(svg, /Rev B/);
  assert.equal(collectHoleCallouts(def).length, 1);
});

test("a screw mate follows pitch: one turn advances one pitch along the axis", () => {
  const axisA = { surface: "cylinder", origin: { x: 0, y: 0, z: 0 }, axis: { x: 0, y: 1, z: 0 }, radius: 1 };
  const axisB = { surface: "cylinder", origin: { x: 0, y: 0, z: 0 }, axis: { x: 0, y: 1, z: 0 }, radius: 1 };
  const assembly = {
    components: [
      { id: "base", grounded: true, transform: { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 } },
      { id: "cap", transform: { x: 4, y: 0, z: 0, rx: 0, ry: 0, rz: 0 } },
    ],
    topologyMates: [{
      id: "m", type: "screw", pitch: 0.2, turns: 2, handedness: "rh",
      a: topologyReference("base", "axis", "aa", axisA),
      b: topologyReference("cap", "axis", "ab", axisB),
    }],
  };
  const result = solveTopologyMates(assembly);
  assert.equal(result.ok, true);
  assert.ok(Math.abs(assembly.components[1].transform.y - 0.4) < 1e-8);
  assert.ok(Math.abs(assembly.components[1].transform.x) < 1e-8);
});

test("limit mates clamp distance and tangent mates separate cylinder axes by the sum of radii", () => {
  const faceA = { surface: "plane", origin: { x: 5, y: 0, z: 0 }, normal: { x: 1, y: 0, z: 0 } };
  const faceB = { surface: "plane", origin: { x: 0, y: 0, z: 0 }, normal: { x: -1, y: 0, z: 0 } };
  const limited = {
    components: [
      { id: "a", grounded: true, transform: { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 } },
      { id: "b", transform: { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 } },
    ],
    topologyMates: [{ id: "lim", type: "limit", value: 10, min: 1, max: 3, a: topologyReference("a", "face", "fa", faceA), b: topologyReference("b", "face", "fb", faceB) }],
  };
  solveTopologyMates(limited);
  assert.equal(limited.components[1].transform.x, 8);
  const cylA = { surface: "cylinder", origin: { x: 0, y: 0, z: 0 }, axis: { x: 0, y: 1, z: 0 }, radius: 2 };
  const cylB = { surface: "cylinder", origin: { x: 0, y: 0, z: 0 }, axis: { x: 0, y: 1, z: 0 }, radius: 1 };
  const tangent = {
    components: [
      { id: "a", grounded: true, transform: { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 } },
      { id: "b", transform: { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 } },
    ],
    topologyMates: [{ id: "tan", type: "tangent", a: topologyReference("a", "face", "ca", cylA), b: topologyReference("b", "face", "cb", cylB) }],
  };
  solveTopologyMates(tangent);
  const dx = tangent.components[1].transform.x, dz = tangent.components[1].transform.z;
  assert.ok(Math.abs(Math.hypot(dx, dz) - 3) < 1e-6);
});

test("kernel compilation lowers a counterbore into sequential subtract tools", () => {
  const document = createPartDocument({ id: "part:cbore" });
  const sketch = createSketchDefinition(document, {
    id: "sketch:pad", name: "Pad", referenceId: "plane:top",
    points: [{ id: "a", x: 0, y: 0, fixed: true }, { id: "b", x: 20, y: 0, fixed: true }, { id: "c", x: 20, y: 20, fixed: true }, { id: "d", x: 0, y: 20, fixed: true }],
    entities: [
      { id: "e0", type: "line", a: "a", b: "b" }, { id: "e1", type: "line", a: "b", b: "c" },
      { id: "e2", type: "line", a: "c", b: "d" }, { id: "e3", type: "line", a: "d", b: "a" },
    ],
  });
  const base = createFeatureDefinition(document, "extrude", {
    id: "feature:block",
    references: { sketches: [sketch.id], features: [], topology: [], references: [] },
    params: { depth: 10, profileEntityIds: ["e0", "e1", "e2", "e3"] },
  });
  const bore = createSketchDefinition(document, {
    id: "sketch:bore", name: "Bore", referenceId: "plane:top",
    points: [{ id: "hc", x: 10, y: 10, fixed: true }],
    entities: [{ id: "circle", type: "circle", c: "hc", r: 0.35, fixed: true }],
  });
  createFeatureDefinition(document, "hole", {
    id: "feature:cbore",
    inputs: [base.id],
    references: { sketches: [bore.id], features: [base.id], topology: [], references: [] },
    params: { holeType: "counterbore", standardSize: "M6", diameter: 0.7, endCondition: "through-all", profileEntityIds: ["circle"] },
  });
  const compiled = compileKernelFeatureTree(document);
  assert.equal(compiled.ok, true);
  assert.ok(compiled.features.some((feature) => feature.id === "feature:cbore:tool:bore"));
  assert.ok(compiled.features.some((feature) => feature.id === "feature:cbore:tool:counterbore"));
  assert.ok(compiled.features.filter((feature) => feature.type === "subtract").length >= 2);
});

test("SmartMates infer a screw mate when both cylinders carry thread metadata", () => {
  const a = { componentId: "cap", kind: "face", descriptor: { surface: "cylinder" }, threadGeometry: { pitch: 0.15 } };
  const b = { componentId: "base", kind: "face", descriptor: { surface: "cylinder" }, threadGeometry: { pitch: 0.15 } };
  const mate = inferSmartMate(a, b);
  assert.equal(mate.type, "screw");
  assert.equal(inferSmartMate({ componentId: "a", kind: "face", descriptor: { surface: "plane" } }, { componentId: "b", kind: "face", descriptor: { surface: "plane" } }).type, "coincident");
});

test("an explicit hole diameter is not overwritten by the size table", () => {
  const hole = normalizeHoleWizard({ holeType: "simple", standardSize: "M6", diameter: 4, endCondition: "through-all" });
  assert.equal(hole.diameter, 4);
});

test("helix and cosmetic-thread overlays are sampled for the viewport", () => {
  const helix = createHelix({ radius: 1, pitch: 0.2, turns: 2, height: 0.4 });
  const overlays = documentHelixOverlays({ referenceGeometry: [helix] });
  assert.equal(overlays.length, 1);
  assert.ok(overlays[0].points.length > 8);
  const part = { id: "cap", cosmeticThread: cosmeticThread({ diameterMm: 8, pitchMm: 1.25, lengthMm: 12.5 }) };
  const threads = documentThreadOverlays({ parts: [part] });
  assert.equal(threads.length, 1);
  assert.ok(threads[0].points.length > 8);
});

test("toolbox picker lists ISO kinds with a preferred length per size", () => {
  const picker = listToolboxPicker();
  assert.deepEqual(picker.map((item) => item.kind), ["shcs", "hex-screw", "hex-nut", "bushing"]);
  const m8 = picker[0].sizes.find((row) => row.size === "M8");
  assert.equal(m8.lengthMm, preferredLength("M8"));
  assert.equal(preferredLength("M8"), 30);
});

test("a helix is a sweep path only when it is the selected path and the profile is the only sketch", () => {
  assert.equal(sweepUsesHelixPath(1, { id: "helix_1" }), true);
  assert.equal(sweepUsesHelixPath(2, { id: "helix_1" }), false);
  assert.equal(sweepUsesHelixPath(1, null), false);
});

test("face appearance overrides do not recolor the body, and stock clicks replace rather than stack", () => {
  const part = { id: "housing", color: "#111111", metal: 0.1, rough: 0.7 };
  const face = createAppearanceOverride({ persistentId: "housing:face:top", kind: "face", material: "brass" });
  assert.equal(applyAppearanceOverrides([part], [face])[0].color, "#111111");
  const body = createAppearanceOverride({ persistentId: "housing", kind: "body", material: "brass" });
  assert.equal(applyAppearanceOverrides([part], [body])[0].color, STOCK_MATERIALS.brass.color);
  const once = upsertAppearanceOverride([], face);
  const twice = upsertAppearanceOverride(once, createAppearanceOverride({ persistentId: face.persistentId, kind: "face", material: "steel" }));
  assert.equal(twice.length, 1);
  assert.equal(twice[0].material, "steel");
  assert.equal(twice[0].id, once[0].id);
});

/* Angle mates were fully modelled — a residual, a Jacobian and an explicit
   0°/180° cusp — and had no button anywhere. These pin the behaviour the
   button now depends on: the stored `value` is degrees, and the endpoints
   still collapse to parallel and anti-parallel. */
test("an angle mate turns the moving component to the degrees it stores", () => {
  const turnedNormal = (degrees) => {
    const faceA = { surface: "plane", origin: { x: 0, y: 0, z: 0 }, normal: { x: 1, y: 0, z: 0 } };
    const faceB = { surface: "plane", origin: { x: 0, y: 0, z: 0 }, normal: { x: 1, y: 0, z: 0 } };
    const assembly = {
      components: [
        { id: "a", grounded: true, transform: { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 } },
        { id: "b", transform: { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 } },
      ],
      topologyMates: [{
        id: "ang", type: "angle", value: degrees,
        a: topologyReference("a", "face", "fa", faceA),
        b: topologyReference("b", "face", "fb", faceB),
      }],
    };
    const result = solveTopologyMates(assembly);
    assert.equal(result.ok, true, `angle ${degrees} should solve`);
    const m = eulerMatrix(assembly.components[1].transform);
    return { x: m[0][0], y: m[1][0], z: m[2][0] };
  };
  assert.ok(Math.abs(angleBetween(turnedNormal(30), { x: 1, y: 0, z: 0 }) - Math.PI / 6) < 1e-4);
  assert.ok(Math.abs(angleBetween(turnedNormal(90), { x: 1, y: 0, z: 0 }) - Math.PI / 2) < 1e-4);
  // The two cusps: a 0° angle mate is parallel, a 180° one is anti-parallel.
  assert.ok(angleBetween(turnedNormal(0), { x: 1, y: 0, z: 0 }) < 1e-4);
  assert.ok(Math.abs(angleBetween(turnedNormal(180), { x: 1, y: 0, z: 0 }) - Math.PI) < 1e-4);
});

test("an angle mate reports its residual in the same degrees it was asked for", () => {
  const fixed = { surface: "plane", origin: { x: 0, y: 0, z: 0 }, normal: { x: 1, y: 0, z: 0 } };
  const turned = { surface: "plane", origin: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 1, z: 0 } };
  const held = mateResidual({ type: "angle", value: 90 }, fixed, turned);
  assert.ok(held.angular < 1e-9);
  const off = mateResidual({ type: "angle", value: 30 }, fixed, turned);
  assert.ok(Math.abs(off.angular - Math.PI / 3) < 1e-9);
  // An interior angle is one scalar row; the cusp needs three direction rows.
  assert.equal(mateResidualVector({ type: "angle", value: 30 }, fixed, turned).length, 1);
  assert.equal(mateResidualVector({ type: "angle", value: 0 }, fixed, turned).length, 3);
});
