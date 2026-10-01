import test from "node:test";
import assert from "node:assert/strict";
import {
  generateToolboxPart, toolboxFamily, TOOLBOX_KINDS, toolboxBOMFromParts, toolboxBOMRows,
  validateToolboxSpec, lookupSize, PVC_D1785, toolboxLodMesh, toolboxEnvelope, lengthOptionsForSize,
} from "../js/cad_toolbox.js";
import { TSLOT_NUT } from "../js/toolbox/fastener_tables.js";
import { auditStandardParts } from "../js/cad_standards.js";
import { generateBOM } from "../js/cad_interference.js";

function firstSize(kind) {
  const fam = toolboxFamily(kind);
  if (kind === "tee-reducing") return { key: "DN25-40", size: "DN25", branchKey: "DN15-40" };
  if (kind === "flange") return { key: "DN50", size: "DN50", series: "PN16" };
  if (kind === "euro-hinge") return { key: "full-overlay", size: "full-overlay", overlay: "full-overlay" };
  const row = fam.sizes[Math.min(2, fam.sizes.length - 1)] || fam.sizes[0];
  return { key: row.key || row.size, size: row.size, series: row.series };
}

test("picker keys distinguish PVC schedules and T-slot profiles", () => {
  const sch40 = generateToolboxPart({ kind: "pipe-pvc", sizeKey: "DN25-40", size: "DN25", lengthMm: 500 });
  const sch80 = generateToolboxPart({ kind: "pipe-pvc", sizeKey: "DN25-80", size: "DN25", lengthMm: 500 });
  assert.equal(sch40.ok, true);
  assert.equal(sch80.ok, true);
  assert.equal(sch40.metadata.dimensionsMm.wallMm, PVC_D1785["DN25-40"].wallMm);
  assert.equal(sch80.metadata.dimensionsMm.wallMm, PVC_D1785["DN25-80"].wallMm);
  assert.notEqual(sch40.metadata.dimensionsMm.wallMm, sch80.metadata.dimensionsMm.wallMm);
  const t2020 = generateToolboxPart({ kind: "tslot-nut", size: "2020-M5" });
  const t3030 = generateToolboxPart({ kind: "tslot-nut", size: "3030-M5" });
  assert.equal(t2020.metadata.dimensionsMm.profile, "2020");
  assert.equal(t3030.metadata.dimensionsMm.profile, "3030");
  assert.equal(lookupSize(TSLOT_NUT, "M5"), null);
  assert.equal(generateToolboxPart({ kind: "tslot-nut", size: "M5" }).ok, false);
  assert.equal(generateToolboxPart({ kind: "pipe-pvc", size: "DN25" }).ok, false);
});

test("unresolved sizes and unknown families fail closed", () => {
  assert.equal(generateToolboxPart({ kind: "shcs", size: "M99" }).ok, false);
  assert.equal(generateToolboxPart({ kind: "not-a-part", size: "M8" }).ok, false);
  assert.equal(generateToolboxPart({ kind: "flange", size: "3", series: "PN16" }).ok, false);
  assert.equal(generateToolboxPart({ kind: "flange", size: "DN80", series: "CL150" }).ok, false);
  const pn = generateToolboxPart({ kind: "flange", size: "DN80", series: "PN16" });
  assert.equal(pn.ok, true);
  assert.equal(pn.metadata.dimensionsMm.odMm, 200);
  const cl = generateToolboxPart({ kind: "flange", size: "3", series: "CL150" });
  assert.equal(cl.ok, true);
  assert.match(cl.metadata.standard, /B16.5/);
});

test("reducing tee is a distinct family with a smaller branch", () => {
  const tee = generateToolboxPart({ kind: "tee-reducing", size: "DN25-40", branchKey: "DN15-40" });
  assert.equal(tee.ok, true);
  assert.equal(tee.family, "tee-reducing");
  assert.equal(tee.metadata.family, "tee-reducing");
  assert.ok(tee.metadata.dimensionsMm.branchOdMm < tee.metadata.dimensionsMm.odMm);
  assert.equal(tee.matePorts.find((port) => port.id === "branch").diameterMm, PVC_D1785["DN15-40"].odMm);
  assert.match(tee.metadata.designation, /reducing/i);
  const equal = generateToolboxPart({ kind: "tee-equal", size: "DN25-40" });
  assert.equal(equal.family, "tee-equal");
  assert.equal(generateToolboxPart({ kind: "tee-reducing", size: "DN25-40", branchKey: "DN50-40" }).ok, false);
});

test("repeated insertions keep unique group ids and count in the BOM", () => {
  const a = generateToolboxPart({ kind: "shcs", size: "M8", lengthMm: 30 });
  const b = generateToolboxPart({ kind: "shcs", size: "M8", lengthMm: 30 });
  assert.notEqual(a.groupId, b.groupId);
  assert.equal(a.catalogKey, b.catalogKey);
  const fromParts = toolboxBOMFromParts(a.parts.concat(b.parts));
  const shcs = fromParts.find((row) => /4762/.test(row.designation));
  assert.equal(shcs.quantity, 2);
  const stainless = generateToolboxPart({ kind: "shcs", size: "M8", lengthMm: 30, material: "a2-70", finish: "raw" });
  const mixed = toolboxBOMRows([a, stainless]);
  assert.equal(mixed.length, 2);
  const assembly = {
    components: [
      { id: "1", name: "A", def: { parts: a.parts } },
      { id: "2", name: "B", def: { parts: stainless.parts } },
    ],
  };
  const bom = generateBOM(assembly);
  assert.equal(bom.length, 2);
});

test("instance ids remain unique across fresh module sessions", async () => {
  const firstModule = await import("../js/toolbox/generate.js?toolbox-session=first");
  const secondModule = await import("../js/toolbox/generate.js?toolbox-session=second");
  const first = firstModule.generateToolboxPart({ kind: "shcs", size: "M8", lengthMm: 30 });
  const second = secondModule.generateToolboxPart({ kind: "shcs", size: "M8", lengthMm: 30 });
  assert.notEqual(first.groupId, second.groupId);
});

test("fastener designation and metadata follow the selected material class", () => {
  const stainless = generateToolboxPart({ kind: "shcs", size: "M8", lengthMm: 30, material: "a2-70", finish: "raw" });
  assert.match(stainless.metadata.designation, /A2-70/);
  assert.doesNotMatch(stainless.metadata.designation, /8\.8/);
  assert.equal(stainless.metadata.propertyClass, "A2-70");
  const highStrength = generateToolboxPart({ kind: "hex-screw", size: "M8", lengthMm: 30, material: "steel-10.9-black" });
  assert.match(highStrength.metadata.designation, /10\.9/);
  assert.equal(highStrength.metadata.propertyClass, "10.9");
});

test("LOD overrides regenerate geometry and revolved parts have envelopes", () => {
  const fine = generateToolboxPart({ kind: "shcs", size: "M8", lengthMm: 30, lod: 2 });
  const overridden = toolboxLodMesh(fine, 0);
  const coarse = toolboxLodMesh(generateToolboxPart({ kind: "shcs", size: "M8", lengthMm: 30, lod: 0 }));
  assert.equal(overridden.lod, 0);
  assert.equal(overridden.triangleCount, coarse.triangleCount);
  assert.ok(overridden.triangleCount < toolboxLodMesh(fine).triangleCount);
  const elbow = generateToolboxPart({ kind: "elbow-90", size: "DN25-40", lod: 2 });
  const envelope = toolboxEnvelope(elbow);
  assert.ok(envelope);
  Object.values(envelope).forEach((value) => assert.ok(Number.isFinite(value)));
  assert.ok(envelope.x1 > envelope.x0);
  assert.ok(envelope.z1 > envelope.z0);
  const defaultPipe = generateToolboxPart({ kind: "pipe-pvc", lod: 2 });
  assert.ok(toolboxLodMesh(defaultPipe, 0).triangleCount > 0);
});

test("validator requires a complete declaration and the installed edition", () => {
  assert.equal(validateToolboxSpec({ family: "shcs", nominalSize: "M8" }).ok, false);
  assert.equal(validateToolboxSpec({ family: "shcs", standard: "Invented 12:1999", nominalSize: "M8", diameterMm: 8, pitchMm: 1.25, headDiaMm: 13, headHeightMm: 8, acrossFlatsMm: 6 }).ok, false);
  const wrongHead = validateToolboxSpec({
    family: "shcs", standard: "ISO 4762:2018", nominalSize: "M8",
    diameterMm: 8, pitchMm: 1.25, headDiaMm: 99, headHeightMm: 8, acrossFlatsMm: 6,
  });
  assert.equal(wrongHead.ok, false);
  assert.ok(wrongHead.issues.some((row) => row.code === "dimension-mismatch"));
  const ok = validateToolboxSpec({
    family: "shcs", standard: "ISO 4762:2018", sizeKey: "M8", nominalSize: "M8",
    diameterMm: 8, pitchMm: 1.25, headDiaMm: 13, headHeightMm: 8, acrossFlatsMm: 6,
  });
  assert.equal(ok.ok, true);
});

test("every toolbox family audits as compliant or explicitly not-audited/representative", () => {
  const failures = [];
  TOOLBOX_KINDS.forEach((kind) => {
    const pick = firstSize(kind);
    const generated = generateToolboxPart({
      kind,
      size: pick.key,
      sizeKey: pick.key,
      lengthMm: 30,
      overlay: pick.overlay,
      series: pick.series,
      branchKey: pick.branchKey,
      lod: 2,
    });
    if (!generated.ok) {
      failures.push(kind + " generate: " + generated.message);
      return;
    }
    const audit = auditStandardParts({ parts: generated.parts });
    if (!audit.ok) failures.push(kind + " audit: " + JSON.stringify(audit.blocking));
    const statuses = new Set(audit.results.map((row) => row.status));
    statuses.forEach((status) => {
      if (status !== "compliant" && status !== "not-audited" && status !== "representative") {
        failures.push(kind + " status " + status);
      }
    });
  });
  assert.deepEqual(failures, []);
});

test("hex-screw insertion is modeled so ISO 4017 geometry audit passes once per group", () => {
  const hex = generateToolboxPart({ kind: "hex-screw", size: "M8", lengthMm: 30 });
  assert.equal(hex.parts.find((part) => part.standardRole === "thread").threadGeometry.mode, "modeled");
  const audit = auditStandardParts({ parts: hex.parts });
  assert.equal(audit.ok, true, JSON.stringify(audit.blocking));
  assert.equal(audit.checked, 1);
});

test("catalog labels expose schedule and extrusion profile", () => {
  const pvc = toolboxFamily("pipe-pvc").sizes.find((row) => row.key === "DN25-80");
  assert.match(pvc.label, /Sch 80/);
  const slot = toolboxFamily("tslot-nut").sizes.find((row) => row.key === "3030-M6");
  assert.match(slot.label, /3030/);
  const flange = toolboxFamily("flange");
  assert.ok(flange.sizesBySeries.PN16.every((row) => row.series === "PN16"));
  assert.ok(flange.sizesBySeries.CL150.every((row) => row.series === "CL150"));
});

test("sourceOptions keeps lod so a rebuild stays a tube and a socket", () => {
  const shcs = generateToolboxPart({ kind: "shcs", size: "M8", lengthMm: 30, lod: 2 });
  assert.equal(shcs.sourceOptions.lod, 2);
  assert.equal(generateToolboxPart(shcs.sourceOptions).parts.length, shcs.parts.length);
  const pipe = generateToolboxPart({ kind: "pipe-pvc", sizeKey: "DN25-40", lengthMm: 500, lod: 2 });
  assert.equal(pipe.parts[0].kind, "ext");
  assert.ok(pipe.parts[0].holes && pipe.parts[0].holes.length);
  const rebuilt = generateToolboxPart(pipe.sourceOptions);
  assert.equal(rebuilt.parts[0].kind, "ext");
  assert.ok(rebuilt.parts[0].holes && rebuilt.parts[0].holes.length);
});

test("bushing overrides declare the geometry they generate", () => {
  const custom = generateToolboxPart({ kind: "bushing", size: "M8", innerMm: 20, outerMm: 30, lengthMm: 40 });
  assert.equal(custom.ok, true);
  assert.equal(custom.metadata.dimensionsMm.innerMm, 20);
  assert.equal(custom.metadata.dimensionsMm.outerMm, 30);
  assert.equal(custom.metadata.dimensionsMm.lengthMm, 40);
  assert.equal(custom.parts[0].to * 10, 40);
  assert.equal(validateToolboxSpec(custom.metadata).ok, false);
});

test("nail length override is honoured", () => {
  const nail = generateToolboxPart({ kind: "nail-wire", size: "2.5x50", lengthMm: 100 });
  assert.equal(nail.lengthMm, 100);
  assert.equal(nail.metadata.dimensionsMm.lengthMm, 100);
});

test("imperial hex screws and sockets get imperial length lists", () => {
  ["hex-screw", "hex-bolt", "csink-socket"].forEach((kind) => {
    const fam = toolboxFamily(kind);
    const metric = lengthOptionsForSize(fam, "M8");
    const imperial = lengthOptionsForSize(fam, "1/4-20");
    assert.ok(metric.includes(30), kind);
    assert.ok(!metric.includes(25.4), kind);
    assert.ok(imperial.includes(25.4), kind);
    assert.ok(!imperial.includes(30), kind);
  });
});

test("hardware dimensions keep height, depth, dome and cam height", () => {
  const flush = generateToolboxPart({ kind: "flush-pull", size: "90x45" });
  assert.equal(flush.metadata.dimensionsMm.depthMm, 12);
  const knob = generateToolboxPart({ kind: "cabinet-knob", size: "round-30" });
  assert.equal(knob.metadata.dimensionsMm.heightMm, 25);
  const edge = generateToolboxPart({ kind: "edge-pull", size: "80" });
  assert.equal(edge.metadata.dimensionsMm.heightMm, 40);
  const acorn = generateToolboxPart({ kind: "acorn-nut", size: "M8" });
  assert.ok(acorn.metadata.dimensionsMm.domeHMm);
  const cam = generateToolboxPart({ kind: "cam-lock", size: "minifix" });
  assert.ok(cam.metadata.dimensionsMm.camHMm);
});

test("flange audit uses the installed PN16 / CL150 pack", () => {
  const flange = generateToolboxPart({ kind: "flange", size: "DN50", series: "PN16", lod: 2 });
  const audit = auditStandardParts({ parts: flange.parts });
  assert.equal(audit.ok, true, JSON.stringify(audit.blocking));
  assert.equal(audit.results[0].status, "compliant");
});

test("pipe fittings are representative placeholders and not certified", () => {
  const coupling = generateToolboxPart({ kind: "coupling", size: "DN25-40" });
  assert.equal(coupling.metadata.representative, true);
  const audit = validateToolboxSpec(coupling.metadata);
  assert.equal(audit.ok, true);
  assert.equal(audit.status, "not-audited");
  assert.ok(audit.issues.every((row) => row.severity !== "error"));
});

test("reducing tee defaults to the next smaller branch", () => {
  const tee = generateToolboxPart({ kind: "tee-reducing", size: "DN25-40" });
  assert.equal(tee.ok, true);
  assert.ok(tee.metadata.dimensionsMm.branchOdMm < tee.metadata.dimensionsMm.odMm);
});

test("undermount drawer side changes runner width", () => {
  const slim = generateToolboxPart({ kind: "undermount-slide", lengthMm: 450, drawerSideMm: 16 });
  const thick = generateToolboxPart({ kind: "undermount-slide", lengthMm: 450, drawerSideMm: 19 });
  const width = (part) => Math.abs(part.x1 - part.x0);
  assert.notEqual(width(slim.parts[0]), width(thick.parts[0]));
  assert.equal(slim.metadata.dimensionsMm.drawerSide, 16);
  assert.equal(thick.metadata.dimensionsMm.drawerSide, 19);
});
