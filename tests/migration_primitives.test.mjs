/* Legacy documents are mostly primitives.

   Before this pass FEATURE_CATALOG had no box, cylinder or sphere at all, so
   the migration's coverage gate refused every document built from them — which
   is most of them — and both rebuild engines had to be kept alive forever.
   These tests hold the three halves of the fix together: the catalogue specs
   the editor and the gate read, the legacy-part mapping, and the two-engine
   geometry comparison that is still the thing that actually decides.

   A legacy document carries `parts` (render geometry) and a mirrored `features`
   list projected from them, exactly as the editor's own
   rebuildFeatureTreeFromDocument() writes it; that mirror is what lets the
   legacy engine measure the same model the canonical one is asked to. */
import { modelerSource } from "./helpers/modeler_source.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  FEATURE_CATALOG, PRIMITIVE_FEATURE_TYPES, featureDefaults, featureSpec,
  isPrimitiveFeatureType, validateFeatureDefinition,
} from "../js/core/feature_catalog.js";
import {
  analyzeLegacyMigration, convertLegacyDocument, evaluateMigration,
  featureEditability, migrationGeometrySummary, partFeatureType, primitiveFeatureParams,
} from "../js/core/migration_check.js";
import { rebuildDefinition } from "../js/core/rebuild.js";
import { mainReferences } from "../js/core/schema.js";
import { rebuildParametricDocument } from "../js/core/parametric_rebuild.js";
import { regenerateFeatures, releaseRegeneration } from "../js/cad_feature_tree.js";
import { loadCadKernel } from "../js/cad_kernel.js";

/* ---- the catalogue ---- */

test("every primitive has a complete, self-consistent catalogue spec", () => {
  assert.deepEqual(PRIMITIVE_FEATURE_TYPES, ["box", "cylinder", "cone", "sphere"]);
  PRIMITIVE_FEATURE_TYPES.forEach((type) => {
    const spec = featureSpec(type);
    assert.ok(spec, type + " has no catalogue entry");
    assert.ok(spec.label, type + " has no English label");
    assert.ok(spec.icon, type + " has no icon");
    // Placed by numbers: no sketch, no topology, no upstream body.
    assert.deepEqual(spec.selection, {}, type + " must not demand a selection");
    const parameters = Object.keys(spec.parameters);
    assert.deepEqual(Object.keys(spec.defaults).sort(), parameters.slice().sort(),
      type + " defaults and parameters describe different features");
    const fields = spec.editor.groups.flatMap((group) => group.fields.map((field) => field.key));
    assert.deepEqual(fields.slice().sort(), parameters.slice().sort(),
      type + " has an editor field with no parameter behind it (or a parameter with no field)");
    assert.ok(isPrimitiveFeatureType(type));
  });
  assert.equal(isPrimitiveFeatureType("extrude"), false);
});

test("a primitive built from its own defaults validates with no selection at all", () => {
  PRIMITIVE_FEATURE_TYPES.forEach((type) => {
    const issues = validateFeatureDefinition({
      id: "f:" + type, type, params: featureDefaults(type),
      references: { sketches: [], features: [], topology: [], references: [] },
    });
    assert.deepEqual(issues, [], type + " does not validate from its own defaults");
  });
});

/* The kernel reads a cone's base radius as r1 and a cylinder's axis as a
   VECTOR. A cone spelled `r` would have built a needle, and a cylinder offering
   the string "x" would have handed gp_Dir a null direction. */
test("primitive parameter names are the ones the rest of the codebase writes", () => {
  assert.deepEqual(Object.keys(FEATURE_CATALOG.box.parameters), ["x", "y", "z", "w", "h", "d"]);
  assert.deepEqual(Object.keys(FEATURE_CATALOG.cylinder.parameters), ["x", "y", "z", "r", "h"]);
  assert.deepEqual(Object.keys(FEATURE_CATALOG.sphere.parameters), ["x", "y", "z", "r"]);
  assert.deepEqual(Object.keys(FEATURE_CATALOG.cone.parameters), ["x", "y", "z", "r1", "r2", "h"]);
});

/* ---- coverage ---- */

const primitiveParts = () => [
  { id: "p1", name: "Base", kind: "box", x0: 0, x1: 10, y0: 0, y1: 4, z0: 0, z1: 6 },
  { id: "p2", name: "Post", kind: "cyl", x: 2, y: 4, z: 3, r: 2, h: 8 },
  { id: "p3", name: "Knob", kind: "sph", x: 2, y: 12, z: 3, r: 1.5 },
];

const primitiveDoc = () => ({
  metadata: { authoringSystem: "legacy-adapter" },
  parts: primitiveParts(),
  rollback: null,
});

test("a legacy box / cylinder / sphere document now passes the coverage gate", () => {
  const analysis = analyzeLegacyMigration(primitiveDoc());
  assert.equal(analysis.ok, true, JSON.stringify(analysis.blockers));
  assert.equal(analysis.convertible, 3);
  const conversion = convertLegacyDocument(primitiveDoc());
  assert.equal(conversion.ok, true);
  assert.deepEqual(conversion.document.features.map((feature) => feature.type), ["box", "cylinder", "sphere"]);
  // Corner + size, not the legacy min/max pair: the shape the kernel, the
  // topology namer and the cabinet adapter already agree on.
  assert.deepEqual(conversion.document.features[0].params, { x: 0, y: 0, z: 0, w: 10, h: 4, d: 6 });
  assert.deepEqual(conversion.document.features[1].params, { x: 2, y: 4, z: 3, r: 2, h: 8 });
  assert.deepEqual(conversion.document.features[2].params, { x: 2, y: 12, z: 3, r: 1.5 });
  // Every converted feature is editable — that is what the gate asks.
  assert.equal(featureEditability(conversion.document.features).ok, true);
  // The source is never touched by the trial conversion.
  assert.equal(primitiveDoc().features, undefined);
});

test("a tapered legacy cylinder converts to a cone, not to a straight cylinder", () => {
  const tapered = { id: "p", name: "Leg", kind: "cyl", x: 0, y: 0, z: 0, r: 3, r2: 1, h: 10 };
  assert.equal(partFeatureType(tapered), "cone");
  assert.deepEqual(primitiveFeatureParams("cone", tapered), { x: 0, y: 0, z: 0, h: 10, r1: 3, r2: 1 });
  // A second radius equal to the first is still a cylinder.
  assert.equal(partFeatureType({ ...tapered, r2: 3 }), "cylinder");
});

test("things the converted feature could not represent are still refused", () => {
  const blocked = (mutate) => {
    const doc = primitiveDoc();
    mutate(doc);
    const analysis = analyzeLegacyMigration(doc);
    assert.equal(analysis.ok, false);
    assert.equal(convertLegacyDocument(doc).ok, false);
    return analysis.blockers.map((blocker) => blocker.code);
  };
  assert.ok(blocked((doc) => { doc.parts[0].exactOperations = [{ id: "f", type: "fillet", amount: 1 }]; })
    .includes("unsupported-legacy-modifier"));
  assert.ok(blocked((doc) => { doc.parts[1].cuts3d = [{ axis: "x", loop: [] }]; })
    .includes("unsupported-legacy-modifier"));
  assert.ok(blocked((doc) => { doc.parts[2].patternRotations = [{ angle: 90 }]; })
    .includes("unsupported-legacy-modifier"));
  // Direct and mesh bodies have no recipe at all, and say so by name.
  assert.ok(blocked((doc) => { doc.parts.push({ id: "p4", kind: "direct", name: "Scan" }); })
    .includes("unconvertible-part-kind"));
  // A primitive with no size converts arithmetically and draws nothing.
  assert.ok(blocked((doc) => { doc.parts[0].y1 = 0; }).includes("degenerate-primitive"));
  assert.ok(blocked((doc) => { doc.parts[2].r = 0; }).includes("degenerate-primitive"));
});

/* ---- the two-engine comparison, which is what actually decides ---- */

/* The legacy engine builds from `features`; the editor projects that mirror
   from the render parts (rebuildFeatureTreeFromDocument). Mirroring it here is
   what makes this an end-to-end comparison of two engines rather than of one
   engine and a fixture.

   The projection had two holes — no sphere case and no tapered-cylinder case —
   so those parts left a render body and no feature, the legacy engine measured
   a smaller model than the canonical one, and the comparison refused a document
   with nothing actually wrong with it. Both cases now exist in the editor and
   are mirrored here. `mirrorSphere: false` keeps a document with that hole so
   the refusal itself stays under test: an unverifiable conversion must still be
   refused rather than averaged away. */
function legacyPrimitiveDocument(options = {}) {
  const parts = primitiveParts()
    .filter((part) => part.kind !== "sph" || options.sphere !== false)
    .concat(options.taper ? [{ id: "p4", name: "Leg", kind: "cyl", x: 8, y: 4, z: 3, r: 2, r2: 1, h: 6, featureId: "feature:part:p4" }] : [])
    .map((part) => ({ ...part, featureId: "feature:part:" + part.id }));
  const mirrored = {
    box: (part) => ({ type: "box", params: { x: 0, y: 0, z: 0, w: 10, h: 4, d: 6 } }),
    cyl: (part) => ({ type: "cylinder", params: { x: part.x, y: part.y, z: part.z, r: part.r, h: part.h } }),
    // the editor's own two branches, mirrored: a tapered cyl is a cone
    sph: (part) => ({ type: "sphere", params: { x: part.x, y: part.y, z: part.z, r: part.r } }),
  };
  const project = (part) => (part.kind === "cyl" && part.r2 != null && Math.abs(part.r2 - part.r) > 1e-6
    ? { type: "cone", params: { x: part.x, y: part.y, z: part.z, r1: part.r, r2: part.r2, h: part.h } }
    : mirrored[part.kind] && mirrored[part.kind](part));
  return {
    id: "legacy:primitives",
    key: "legacy_primitives",
    metadata: { authoringSystem: "legacy-adapter" },
    references: mainReferences(),
    parameters: {},
    sketches: [],
    parts,
    features: parts.flatMap((part) => {
      const projection = project(part);
      if (!projection || (part.kind === "sph" && options.mirrorSphere === false)) return [];
      return [{ id: part.featureId, name: part.name, inputs: [], ...projection }];
    }),
    rollback: null,
  };
}

test("a converted primitive document rebuilds to the same geometry as the legacy engine", () => {
  const source = legacyPrimitiveDocument({ sphere: false });
  // The mirrored feature list is legacy scaffolding, not authored history; the
  // conversion reads the parts.
  const conversion = convertLegacyDocument(source);
  assert.equal(conversion.ok, true, JSON.stringify(conversion.analysis.blockers));
  const legacyRun = rebuildDefinition(structuredClone(source));
  const canonicalRun = rebuildParametricDocument(conversion.document);
  assert.equal(legacyRun.ok, true, JSON.stringify(legacyRun.issues));
  assert.equal(canonicalRun.ok, true, JSON.stringify(canonicalRun.issues));
  // Both engines measure the box and the cylinder the same way, and neither
  // falls back to the crude width/depth/height envelope.
  assert.deepEqual(canonicalRun.core.bounds, legacyRun.bounds);
  assert.deepEqual(canonicalRun.core.bounds.min, { x: 0, y: 0, z: 0 });
  assert.deepEqual(canonicalRun.core.bounds.max, { x: 10, y: 12, z: 6 });
  const legacySummary = migrationGeometrySummary(source, "legacy");
  const canonicalSummary = migrationGeometrySummary(canonicalRun, "canonical");
  assert.equal(legacySummary.bodyCount, 2);
  assert.equal(canonicalSummary.bodyCount, 2);
  assert.equal(legacySummary.fingerprint, canonicalSummary.fingerprint);
  const boxVolume = 10 * 4 * 6, postVolume = Math.PI * 4 * 8;
  assert.ok(Math.abs(legacySummary.volume - (boxVolume + postVolume)) < 1e-9,
    "the analytic volume is not the sum of the two primitives");
  assert.ok(Math.abs(legacySummary.volume - canonicalSummary.volume) < 1e-9);
});

test("a sphere is measured identically once both engines can see it", () => {
  const source = legacyPrimitiveDocument();
  const conversion = convertLegacyDocument(source);
  const legacyRun = rebuildDefinition(structuredClone(source));
  const canonicalRun = rebuildParametricDocument(conversion.document);
  const verdict = evaluateMigration({
    analysis: conversion.analysis, legacyDocument: source, legacyRun, canonicalRun,
  });
  assert.equal(verdict.ok, true, JSON.stringify(verdict.reasons));
  assert.deepEqual(legacyRun.bounds.max, { x: 10, y: 13.5, z: 6 });
});

/* A body one engine cannot see must refuse the conversion, not average it
   away: an unverifiable conversion stays unconverted. This was the state of
   every legacy sphere until the editor's projection grew a sphere case. */
test("a body the legacy engine cannot measure refuses the conversion", () => {
  const source = legacyPrimitiveDocument({ mirrorSphere: false });
  const conversion = convertLegacyDocument(source);
  assert.equal(conversion.ok, true, JSON.stringify(conversion.analysis.blockers));
  const verdict = evaluateMigration({
    analysis: conversion.analysis,
    legacyDocument: source,
    legacyRun: rebuildDefinition(structuredClone(source)),
    canonicalRun: rebuildParametricDocument(conversion.document),
  });
  assert.equal(verdict.ok, false);
  assert.ok(verdict.reasons.some((reason) => reason.code === "geometry-differs"));
});

test("the comparison still catches a converted primitive that drifted", () => {
  const source = legacyPrimitiveDocument({ mirrorSphere: false });
  const conversion = convertLegacyDocument(source);
  const canonicalRun = rebuildParametricDocument(conversion.document);
  // Same outer bounds, smaller solid: the post loses a millimetre of radius.
  const post = canonicalRun.core.resultList.find((result) => result.type === "cylinder");
  post.params.r = 1.9;
  const verdict = evaluateMigration({ legacyDocument: source, canonicalRun });
  assert.equal(verdict.ok, false);
  assert.ok(verdict.reasons.some((reason) => reason.code === "volume-differs"));
  assert.ok(verdict.reasons.some((reason) => reason.code === "geometry-fingerprint-differs"));
  // And a body that vanished entirely is caught by the cheap gate too.
  const dropped = rebuildParametricDocument(conversion.document);
  dropped.core.resultList = dropped.core.resultList.filter((result) => result.type !== "sphere");
  const missing = evaluateMigration({ legacyDocument: source, canonicalRun: dropped });
  assert.equal(missing.ok, false);
  assert.ok(missing.reasons.some((reason) => reason.code === "body-count-differs"));
  assert.ok(missing.reasons.some((reason) => reason.code === "analytic-bounds-differ"));
});

test("a healthy converted primitive document passes every gate together", () => {
  const source = legacyPrimitiveDocument({ sphere: false });
  const conversion = convertLegacyDocument(source);
  const legacyRun = rebuildDefinition(structuredClone(source));
  const canonicalRun = rebuildParametricDocument(conversion.document);
  const verdict = evaluateMigration({
    analysis: conversion.analysis,
    legacyDocument: source,
    legacyRun,
    canonicalRun,
  });
  assert.equal(verdict.ok, true, JSON.stringify(verdict.reasons));
});

/* The second hole in the projection: a legacy "cyl" with a second radius is a
   frustum, partFeatureType has always called it a cone, and the editor emitted
   nothing at all for it — so the legacy engine measured a document missing a
   body and the comparison refused a conversion that was in fact correct. */
test("a tapered legacy cylinder is now measured by both engines and passes", () => {
  const source = legacyPrimitiveDocument({ taper: true });
  const conversion = convertLegacyDocument(source);
  assert.equal(conversion.ok, true, JSON.stringify(conversion.analysis.blockers));
  assert.deepEqual(conversion.document.features.map((feature) => feature.type), ["box", "cylinder", "sphere", "cone"]);
  const legacyRun = rebuildDefinition(structuredClone(source));
  const canonicalRun = rebuildParametricDocument(conversion.document);
  assert.equal(legacyRun.ok, true, JSON.stringify(legacyRun.issues));
  const verdict = evaluateMigration({ analysis: conversion.analysis, legacyDocument: source, legacyRun, canonicalRun });
  assert.equal(verdict.ok, true, JSON.stringify(verdict.reasons));
  const summary = migrationGeometrySummary(source, "legacy");
  assert.equal(summary.bodyCount, 4, "the taper is a body on both sides, not a missing one");
  // r=2 -> r2=1 over h=6: the frustum, not the 2-radius cylinder it would be
  // if the projection had reused the plain cylinder branch
  const frustum = (Math.PI / 3) * 6 * (4 + 2 + 1);
  assert.ok(Math.abs(summary.volume - (10 * 4 * 6 + Math.PI * 4 * 8 + (4 / 3) * Math.PI * 1.5 ** 3 + frustum)) < 1e-9,
    "got " + summary.volume);
});

test("the editor's projection has the two branches the gate depends on", () => {
  const modeler = modelerSource();
  assert.match(modeler, /\} else if \(part\.kind === "cyl"\) \{/);
  assert.match(modeler, /type:"cone", name:part\.name \|\| "Cone", params:\{x:part\.x,y:part\.y,z:part\.z,r1:part\.r,r2:part\.r2,h:part\.h\}/);
  assert.match(modeler, /\} else if \(part\.kind === "sph"\) \{/);
  assert.match(modeler, /type:"sphere", name:part\.name \|\| "Sphere", params:\{x:part\.x,y:part\.y,z:part\.z,r:part\.r\}/);
});

/* Emitting these two features is only honest if the EXACT engine can build
   them: a feature the kernel cannot make would trade a silently missing body
   for a failing rebuild. The cone was already there; the sphere was not. */
test("the exact kernel builds the sphere and the cone the projection now emits", async () => {
  const run = await regenerateFeatures({
    featureVersion: 1,
    features: [
      { id: "knob", type: "sphere", name: "Knob", params: { x: 0, y: 0, z: 0, r: 1.5 }, inputs: [], references: [] },
      { id: "leg", type: "cone", name: "Leg", params: { x: 20, y: 0, z: 0, r1: 2, r2: 1, h: 6 }, inputs: [], references: [] },
      { id: "both", type: "union", name: "Union", params: {}, inputs: ["knob", "leg"] },
    ],
  });
  try {
    assert.ok(run.ok, JSON.stringify(run.issues));
    const oc = await loadCadKernel(), props = new oc.GProp_GProps_1();
    try {
      oc.BRepGProp.VolumeProperties_1(run.finalShape.shape, props, false, false, false);
      const want = (4 / 3) * Math.PI * 1.5 ** 3 + (Math.PI / 3) * 6 * (4 + 2 + 1);
      assert.ok(Math.abs(props.Mass() - want) < 1e-6, "got " + props.Mass() + ", want " + want);
    } finally { props.delete(); }
  } finally { releaseRegeneration(run); }
});
