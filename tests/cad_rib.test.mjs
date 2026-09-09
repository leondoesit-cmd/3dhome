/* Rib: a drawn line braced into a web.
 *
 * Three things separate a rib from "extrude a rectangle". The sketch is an OPEN
 * line and the loop is derived from it plus a thickness; the web is TRIMMED to
 * the part it braces so a line drawn past a wall does not shoot into space; and
 * it is FUSED into that part rather than left standing beside it. Each of those
 * is measured here against the real kernel.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { featureDefaults, featureSpec, validateFeatureDefinition } from "../js/core/feature_catalog.js";
import { regenerateFeatures, releaseRegeneration } from "../js/cad_feature_tree.js";
import { FEATURE_COMMAND, buildCommandCatalog } from "../js/modeler_commands.js";
import { ribDraftedLoop, ribLoop, ribOffsets } from "../js/core/rib_profile.js";
import { analyzeSketchChains } from "../js/sketch_profiles.js";
import { disposeBrep, loadCadKernel, makeBrepPrimitive, ribBrep } from "../js/cad_kernel.js";

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

// A 20 x 2 x 20 plate lying on the XZ plane; ribs stand up off its top face.
const plate = () => makeBrepPrimitive({ type: "box", x: 0, y: 0, z: 0, w: 20, h: 2, d: 20 });

const acrossThePlate = { points: [{ u: 2, v: 10 }, { u: 18, v: 10 }], axis: "y", from: 2, side: "both", direction: "forward" };

/* --- the loop the line becomes, no WASM --------------------------------- */

test("an open line becomes a closed loop of the stated thickness", () => {
  const loop = ribLoop([{ u: 0, v: 0 }, { u: 10, v: 0 }], 2, "both");
  assert.deepEqual(loop, [{ u:0, v:1 }, { u:10, v:1 }, { u:10, v:-1 }, { u:0, v:-1 }]);
  // one-sided: the whole thickness on the chosen side, the line itself flush
  assert.deepEqual(ribOffsets(2, "left"), { left: 2, right: 0 });
  assert.deepEqual(ribOffsets(2, "right"), { left: 0, right: 2 });
  assert.deepEqual(ribOffsets(2, "both"), { left: 1, right: 1 });
});

test("a corner is mitred, so the offset walls meet instead of leaving a notch", () => {
  const loop = ribLoop([{ u: 0, v: 0 }, { u: 10, v: 0 }, { u: 10, v: 10 }], 2, "both");
  // the inside corner pulls in by exactly one half-thickness on each axis
  assert.ok(loop.some((q) => Math.abs(q.u - 9) < 1e-9 && Math.abs(q.v - 1) < 1e-9), "inner mitre at (9,1)");
  assert.ok(loop.some((q) => Math.abs(q.u - 11) < 1e-9 && Math.abs(q.v + 1) < 1e-9), "outer mitre at (11,-1)");
  assert.equal(loop.length, 6, "three vertices on each side, no duplicated corner");
});

test("the draft narrows each drafted wall by one tangent, not the web by two", () => {
  const line = [{ u: 0, v: 0 }, { u: 10, v: 0 }];
  const tan = Math.tan((10 * Math.PI) / 180);
  const both = ribDraftedLoop(line, 2, "both", 5, 10);
  assert.ok(Math.abs(both[0].v - (1 - 5 * tan)) < 1e-9, "a symmetric web loses a tangent from each side");
  // flush against something on one side: only the free wall is drafted
  const flush = ribDraftedLoop(line, 2, "left", 5, 10);
  assert.ok(Math.abs(flush[0].v - (2 - 5 * tan)) < 1e-9);
  assert.ok(Math.abs(flush[3].v) < 1e-9, "the flush face does not move");
  assert.throws(() => ribDraftedLoop(line, 2, "both", 20, 30), /closes the web/);
  assert.throws(() => ribLoop([{ u: 0, v: 0 }], 2, "both"), /at least two points/);
  assert.throws(() => ribLoop([{ u: 0, v: 0 }, { u: 1, v: 0 }], 0, "both"), /non-zero thickness/);
});

test("the sketch analyser hands back the open chains it used to discard", () => {
  const sketch = {
    points: [
      { id: "p1", x: 0, y: 0 }, { id: "p2", x: 10, y: 0 }, { id: "p3", x: 10, y: 8 },
      { id: "q1", x: 40, y: 0 }, { id: "q2", x: 50, y: 0 }, { id: "q3", x: 45, y: 9 },
    ],
    entities: [
      { id: "e1", type: "line", a: "p1", b: "p2" },
      { id: "e2", type: "line", a: "p2", b: "p3" },
      // a closed triangle: a profile, not a chain
      { id: "f1", type: "line", a: "q1", b: "q2" },
      { id: "f2", type: "line", a: "q2", b: "q3" },
      { id: "f3", type: "line", a: "q3", b: "q1" },
    ],
  };
  const { chains } = analyzeSketchChains(sketch);
  assert.equal(chains.length, 1, "only the open one");
  assert.deepEqual(chains[0].entityIds, ["e1", "e2"]);
  assert.deepEqual(chains[0].points, [{ u:0, v:0 }, { u:10, v:0 }, { u:10, v:8 }]);
  assert.ok(Math.abs(chains[0].length - 18) < 1e-9);
  // a Y has no single path through it, so it is left out rather than guessed at
  const branched = analyzeSketchChains({
    points: [{ id:"a", x:0, y:0 }, { id:"b", x:5, y:0 }, { id:"c", x:10, y:5 }, { id:"d", x:10, y:-5 }],
    entities: [
      { id:"g1", type:"line", a:"a", b:"b" }, { id:"g2", type:"line", a:"b", b:"c" }, { id:"g3", type:"line", a:"b", b:"d" },
    ],
  });
  assert.deepEqual(branched.chains, []);
});

/* --- the real kernel ----------------------------------------------------- */

test("a blind rib adds exactly the web it describes and fuses it into the part", async () => {
  const body = await plate();
  let ribbed = null;
  try {
    ribbed = await ribBrep(body, { ...acrossThePlate, thickness: 2, extent: "blind", depth: 5 });
    // 16 long x 2 thick x 5 tall, standing on an 800 plate
    assert.ok(Math.abs(await volume(ribbed) - 960) < 1e-3, "the plate gained one web, not two overlapping halves");
    const box = await bounds(ribbed);
    assert.ok(Math.abs(box.y1 - 7) < 1e-6, "the web stands 5 above the 2-thick plate");
    assert.ok(Math.abs(box.x1 - 20) < 1e-6 && Math.abs(box.z1 - 20) < 1e-6, "and nothing spread sideways");
  } finally { disposeBrep(body); if (ribbed) disposeBrep(ribbed); }
});

test("the draft angle tapers the web, and it is draft's own sign convention", async () => {
  const body = await plate();
  let ribbed = null;
  try {
    ribbed = await ribBrep(body, { ...acrossThePlate, thickness: 2, extent: "blind", depth: 5, draftAngle: 10 });
    // trapezoid: full 2 at the plate, 2 - 2*5*tan(10) at the top
    const top = 2 - 2 * 5 * Math.tan((10 * Math.PI) / 180);
    const web = 16 * 5 * (2 + top) / 2;
    assert.ok(Math.abs(await volume(ribbed) - (800 + web)) < 1e-2, "a positive angle narrows the web away from the sketch plane");
    assert.ok(Math.abs((await bounds(ribbed)).y1 - 7) < 1e-6, "the taper does not change how far the web runs");
  } finally { disposeBrep(body); if (ribbed) disposeBrep(ribbed); }
});

test("a line drawn past the part is trimmed back to it, not left hanging in space", async () => {
  const body = await plate();
  let ribbed = null;
  try {
    // the same web, sketched from far off one edge to far off the other
    ribbed = await ribBrep(body, {
      ...acrossThePlate, points: [{ u: -40, v: 10 }, { u: 60, v: 10 }],
      thickness: 2, extent: "blind", depth: 5,
    });
    assert.ok(Math.abs(await volume(ribbed) - 1000) < 1e-2, "the web spans the plate's 20 and stops (2 x 5 x 20)");
    const box = await bounds(ribbed);
    assert.ok(box.x0 > -1e-3 && box.x1 < 20 + 1e-3, "nothing survives outside the part it braces");
  } finally { disposeBrep(body); if (ribbed) disposeBrep(ribbed); }
});

test("the thickness side decides which way the web lies off the line", async () => {
  const body = await plate();
  const built = [];
  try {
    // drawn one unit in from the z=0 edge and four thick, so which side the
    // web falls on decides how much of it the trim keeps
    const near = { ...acrossThePlate, points: [{ u: 2, v: 1 }, { u: 18, v: 1 }], thickness: 4, extent: "blind", depth: 5 };
    const web = async (side) => {
      const built_ = await ribBrep(body, { ...near, side });
      built.push(built_);
      return await volume(built_) - 800;
    };
    // symmetric: v spans -1..3, trimmed to 0..3
    assert.ok(Math.abs(await web("both") - 16 * 3 * 5) < 1e-2, "half each way, and the overhang trimmed off");
    // left of a line running +u is +v: the whole 4 lands on the part
    assert.ok(Math.abs(await web("left") - 16 * 4 * 5) < 1e-2, "all of it on the far side of the line");
    // right is -v, so all but one unit falls off the edge
    assert.ok(Math.abs(await web("right") - 16 * 1 * 5) < 1e-2, "all of it on the near side, and mostly trimmed");
  } finally { disposeBrep(body); built.forEach(disposeBrep); }
});

test("up-to-body runs the web to the far side of the part rather than a typed number", async () => {
  const body = await plate();
  let ribbed = null;
  try {
    // sketched 6 above the plate, running down into it
    ribbed = await ribBrep(body, {
      ...acrossThePlate, from: 8, direction: "reverse", thickness: 2, extent: "up-to-body",
    });
    // from y=8 down to the plate's far side at y=0: 8 of run, 6 of it in air
    assert.ok(Math.abs(await volume(ribbed) - (800 + 16 * 2 * 6)) < 1e-2, "the web reaches the part and merges with it");
    assert.ok(Math.abs((await bounds(ribbed)).y1 - 8) < 1e-6, "and stops at the plane it was drawn on");
  } finally { disposeBrep(body); if (ribbed) disposeBrep(ribbed); }
});

test("a rib that misses the part fails rather than adding a floating fin", async () => {
  const body = await plate();
  try {
    await assert.rejects(
      ribBrep(body, { ...acrossThePlate, points: [{ u: 2, v: 100 }, { u: 18, v: 100 }], thickness: 2, extent: "blind", depth: 5 }),
      /does not cross the body/,
    );
    // running away from the part has nothing to reach
    await assert.rejects(
      ribBrep(body, { ...acrossThePlate, from: 8, direction: "forward", thickness: 2, extent: "up-to-body" }),
      /never reaches it/,
    );
    await assert.rejects(ribBrep(body, { ...acrossThePlate, thickness: 0, extent: "blind", depth: 5 }), /non-zero thickness/);
    await assert.rejects(ribBrep(body, { ...acrossThePlate, points: [{ u: 1, v: 1 }], thickness: 2 }), /at least two points/);
  } finally { disposeBrep(body); }
});

/* --- the catalogue and the whole rebuild path ---------------------------- */

test("rib declares exactly the parameters the kernel reads", () => {
  const spec = featureSpec("rib");
  assert.ok(spec);
  assert.deepEqual(Object.keys(featureDefaults("rib")).sort(),
    ["depth", "direction", "draftAngle", "extent", "side", "thickness"]);
  const fields = spec.editor.groups.flatMap((group) => group.fields).map((field) => field.key);
  assert.deepEqual(fields.slice().sort(), ["depth", "direction", "draftAngle", "extent", "side", "thickness"]);
  fields.forEach((key) => assert.ok(spec.parameters[key], key + " is a declared parameter"));
});

test("rib demands both a sketch and a body", () => {
  const issues = validateFeatureDefinition({ id: "r1", type: "rib", params: featureDefaults("rib"), references: {} });
  const codes = issues.map((issue) => issue.code);
  assert.ok(codes.includes("missing-feature-input") || codes.includes("missing-sketch-input"), JSON.stringify(codes));
});

test("a rib step in a feature tree rebuilds on top of the body before it", async () => {
  const def = { features: [
    { id: "b1", type: "box", name: "Plate", inputs: [], references: {}, params: { x:0, y:0, z:0, w:20, h:2, d:20 } },
    { id: "r1", type: "rib", name: "Rib", inputs: ["b1"], references: { features: ["b1"], sketches: ["s1"] },
      params: { ...featureDefaults("rib"), thickness: 2, extent: "blind", depth: 5, axis: "y", from: 2,
        points: [{ u: 2, v: 10 }, { u: 18, v: 10 }] } },
  ] };
  const run = await regenerateFeatures(def);
  try {
    assert.ok(!run.issues.some((issue) => issue.code === "regeneration-failed"), JSON.stringify(run.issues));
    const ribbed = run.results.get("r1");
    assert.ok(ribbed?.shape);
    assert.ok(Math.abs(await volume(ribbed) - 960) < 1e-2, "the same web the kernel test measured");
  } finally { releaseRegeneration(run); }
});

test("a rib that cannot be built fails alone and leaves no body", async () => {
  const def = { features: [
    { id: "b1", type: "box", name: "Plate", inputs: [], references: {}, params: { x:0, y:0, z:0, w:20, h:2, d:20 } },
    { id: "r1", type: "rib", name: "Rib", inputs: ["b1"], references: { features: ["b1"] },
      params: { ...featureDefaults("rib"), thickness: 2, extent: "blind", depth: 5, axis: "y", from: 2,
        points: [{ u: 2, v: 400 }, { u: 18, v: 400 }] } },
  ] };
  const run = await regenerateFeatures(def);
  try {
    assert.ok(run.issues.some((issue) => issue.code === "regeneration-failed"));
    assert.equal(run.results.has("r1"), false, "no half-built brace is left behind");
  } finally { releaseRegeneration(run); }
});

/* --- the editor wiring --------------------------------------------------- */

const modeler = readFileSync(new URL("../js/modeler.js", import.meta.url), "utf8");
/* Pure part geometry and the exact-kernel part recipe, split out of js/modeler.js. */
const partGeometry = readFileSync(new URL("../js/modeler_part_geometry.js", import.meta.url), "utf8");
/* The editor's [he, en] table lives in js/modeler_strings.js. */
const modelerStrings = readFileSync(new URL("../js/modeler_strings.js", import.meta.url), "utf8");

test("rib reaches the ribbon, the command handler and the apply path", () => {
  assert.equal(FEATURE_COMMAND.rib, "ribfeature");
  const catalog = buildCommandCatalog({ t: (key) => key, editor: { docType: "part", def: { parts: [], sketches: [] } }, activeParts: () => [], closedSketchProfile: () => null });
  const command = catalog.find((entry) => entry.id === "ribfeature");
  assert.ok(command, "the ribbon knows the command");
  assert.equal(command.available(), false, "greyed out with no solid and no sketch");
  assert.match(modeler, /commandButton\("ribfeature", t\("ribOp"\)\)/);
  assert.match(modeler, /else if \(id === "ribfeature"\) openParametricFeature\("rib"\);/);
  assert.match(modeler, /else if\(type==="rib"\)ok=createRibFeature\(params\);/);
  assert.match(partGeometry, /next=await ribBrep\(solid, \{\.\.\.\(operation\.params \|\| \{\}\),thickness:operation\.amount\}\);/);
  assert.match(modeler, /type:"rib",amount:thickness,targets:\[\]/);
  // the open chain is what feeds it — not analyzeSketchProfiles
  assert.match(modeler, /analyzeSketchChains\(sketch,\{selectedIds:/);
  // rib is not a face/edge collector, so it must not join the finish family
  assert.doesNotMatch(modeler, /FACE_DRIVEN_OPERATIONS = new Set\(\[[^\]]*"rib"/);
  assert.doesNotMatch(modeler, /FINISH_FEATURES = \[[^\]]*"rib"/);
  // but editing the feature must still move the recorded operation's amount
  assert.match(modeler, /FINISH_AMOUNT_KEY = \{[^}]*rib:"thickness"/);
});

test("every rib string the form can show exists in both languages", () => {
  const keys = ["ribOp", "ribFail", "ribNeedLine", "cmdNeedOpenLine", "fcFeatRib", "fcGrpWebDefinition",
    "fcFldThicknessSide", "fcOptBothSides", "fcOptLeftOfLine", "fcOptRightOfLine", "fcOptUpToBody"];
  keys.forEach((key) => {
    const match = modelerStrings.match(new RegExp("\\n  " + key + ': \\["([^"]+)", "([^"]+)"\\]'));
    assert.ok(match, key + " has a [he, en] pair in TXT");
    assert.notEqual(match[1], "");
    assert.notEqual(match[2], "");
  });
});
