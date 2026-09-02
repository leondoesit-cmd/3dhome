import test from "node:test";
import assert from "node:assert/strict";
import {
  toolboxFastener, generateToolboxPart, listToolboxPicker, listToolboxLibrary,
  listToolboxCatalog, searchToolbox, preferredLength, TOOLBOX_KINDS, FASTENER_KINDS,
  toolboxFamily, lengthOptionsForSize,
  toolboxBOMRows, toolboxBOMCsv, toolboxLodMesh, validateToolboxSpec, EURO_HINGE,
  DRAWER_SLIDE, ISO4762_SHCS, PVC_D1785,
} from "../js/cad_toolbox.js";
import { auditStandardParts } from "../js/cad_standards.js";
import { generateBOM } from "../js/cad_interference.js";

test("legacy picker still lists SHCS, hex screw, nut and bushing first", () => {
  const picker = listToolboxPicker();
  assert.deepEqual(picker.map((item) => item.kind), FASTENER_KINDS);
  const m8 = picker[0].sizes.find((row) => row.size === "M8");
  assert.equal(m8.lengthMm, preferredLength("M8"));
  assert.equal(preferredLength("M8"), 30);
});

test("library covers fasteners, hardware and piping families from the brief", () => {
  const kinds = new Set(TOOLBOX_KINDS);
  ["shcs", "hex-screw", "hex-bolt", "csink-socket", "button-socket", "pan-screw", "wood-screw",
    "lag-bolt", "set-flat", "set-cone", "set-cup", "hex-nut", "jam-nut", "nyloc-nut", "flange-nut",
    "wing-nut", "acorn-nut", "t-nut", "tslot-nut", "washer-flat", "washer-fender", "washer-lock",
    "nail-wire", "nail-brad", "pin-dowel-wood", "euro-hinge", "butt-hinge", "piano-hinge",
    "drawer-slide", "undermount-slide", "bar-pull", "cabinet-knob", "cam-lock", "corner-brace",
    "pipe-copper", "pipe-pvc", "pipe-pex", "pipe-steel", "elbow-90", "tee-equal", "flange",
    "valve-ball"].forEach((kind) => assert.ok(kinds.has(kind), kind));
  const library = listToolboxLibrary();
  assert.deepEqual(library.map((row) => row.id), ["fastener", "hardware", "piping"]);
  assert.ok(listToolboxCatalog().length === TOOLBOX_KINDS.length);
  assert.ok(searchToolbox("euro").some((row) => row.kind === "euro-hinge"));
});

test("SHCS length picker keeps metric millimetres off imperial UNC sizes", () => {
  const fam = toolboxFamily("shcs");
  const metric = lengthOptionsForSize(fam, "M8");
  const imperial = lengthOptionsForSize(fam, "1/4-20");
  assert.ok(metric.includes(30));
  assert.ok(!metric.includes(25.4));
  assert.ok(imperial.includes(25.4));
  assert.ok(!imperial.includes(30));
});

test("SHCS M2–M24 and imperial sizes exist in the ISO 4762 pack", () => {
  ["M2", "M2.5", "M3", "M8", "M14", "M24", "1/4-20", "3/4-10"].forEach((size) => {
    assert.ok(ISO4762_SHCS[size], size);
    const part = toolboxFastener({ kind: "shcs", size, lengthMm: size.startsWith("M") ? 30 : 25.4 });
    assert.equal(part.metadata.category, "fastener");
    assert.ok(part.matePorts.length >= 2);
    assert.ok(part.parts.length >= 1);
  });
});

test("ISO 4014 partial shank is shorter than the overall length", () => {
  const bolt = generateToolboxPart({ kind: "hex-bolt", size: "M8", lengthMm: 80 });
  const thread = bolt.parts.find((part) => part.standardRole === "thread");
  assert.ok(thread.h * 10 < 80);
  assert.equal(bolt.spec.standard, "ISO 4014:2022");
});

test("nuts, washers and nyloc carry matching ISO heights", () => {
  const nut = toolboxFastener({ kind: "hex-nut", size: "M8" });
  assert.equal(nut.parts[0].kind, "ext");
  assert.equal(Math.round((nut.parts[0].to - nut.parts[0].from) * 10 * 10) / 10, 6.8);
  const jam = generateToolboxPart({ kind: "jam-nut", size: "M8" });
  assert.ok(jam.parts[0].to < nut.parts[0].to);
  const nyloc = generateToolboxPart({ kind: "nyloc-nut", size: "M8" });
  assert.ok(nyloc.parts.some((part) => part.materialId === "nylon"));
  const washer = generateToolboxPart({ kind: "washer-flat", size: "M8" });
  assert.equal(washer.metadata.standard, "ISO 7089:2000");
  assert.equal(washer.metadata.dimensionsMm.odMm, 16);
});

test("euro hinge overlays and 32mm plate pitch are declared", () => {
  const hinge = generateToolboxPart({ kind: "euro-hinge", overlay: "half-overlay", angle: 110 });
  assert.equal(hinge.metadata.dimensionsMm.cupDiaMm, 35);
  assert.equal(hinge.metadata.dimensionsMm.crankMm, EURO_HINGE.overlays["half-overlay"].crankMm);
  assert.equal(hinge.metadata.dimensionsMm.plateHoleSpacingMm, 32);
  assert.equal(hinge.metadata.dimensionsMm.plateSetbackMm, 37);
  const inset = generateToolboxPart({ kind: "euro-hinge", overlay: "inset", angle: 165 });
  assert.equal(inset.metadata.dimensionsMm.crankMm, 18);
  assert.ok(inset.matePorts.some((port) => port.id === "cup"));
});

test("drawer slides use the commercial 50mm length series", () => {
  assert.deepEqual(DRAWER_SLIDE.lengthsMm, [250, 300, 350, 400, 450, 500, 550, 600]);
  const slide = generateToolboxPart({ kind: "drawer-slide", lengthMm: 450 });
  assert.equal(slide.metadata.dimensionsMm.ratingKg, 45);
  assert.equal(slide.parts.length, 3);
});

test("copper, PVC, PEX and steel pipes expose snap ports and wall thickness", () => {
  const copper = generateToolboxPart({ kind: "pipe-copper", size: "22", lengthMm: 1000 });
  assert.equal(copper.metadata.dimensionsMm.odMm, 22);
  assert.equal(copper.metadata.dimensionsMm.wallMm, 0.9);
  assert.equal(copper.matePorts.length, 2);
  const pvc = generateToolboxPart({ kind: "pipe-pvc", size: "DN25-40", lengthMm: 500, lod: 2 });
  assert.equal(pvc.parts[0].kind, "ext");
  assert.ok(pvc.parts[0].holes[0].length >= 8);
  assert.ok(PVC_D1785["DN150-40"]);
  const pex = generateToolboxPart({ kind: "pipe-pex", size: "16x2.0", lengthMm: 2000 });
  assert.equal(pex.metadata.dimensionsMm.wallMm, 2.0);
  const steel = generateToolboxPart({ kind: "pipe-steel", size: "DN50", lengthMm: 1000 });
  assert.equal(steel.metadata.dimensionsMm.odMm, 60.3);
});

test("elbows, tees and PN16 flanges carry routing mate ports", () => {
  const elbow = generateToolboxPart({ kind: "elbow-90", size: "DN25-40", radius: "long-radius", lod: 2 });
  assert.equal(elbow.matePorts.length, 2);
  assert.equal(elbow.parts[0].kind, "rev");
  assert.equal(elbow.parts[0].angle, 90);
  const tee = generateToolboxPart({ kind: "tee-equal", size: "DN25-40" });
  assert.ok(tee.matePorts.some((port) => port.id === "branch"));
  const flange = generateToolboxPart({ kind: "flange", size: "DN50", lod: 2 });
  assert.equal(flange.metadata.dimensionsMm.pcdMm, 125);
  assert.equal(flange.metadata.dimensionsMm.holes, 4);
  assert.ok(flange.parts[0].holes.length >= 5);
});

test("LOD 0 envelopes have fewer bodies than fine SHCS meshes", () => {
  const coarse = toolboxLodMesh(generateToolboxPart({ kind: "shcs", size: "M8", lengthMm: 30, lod: 0 }));
  const fine = toolboxLodMesh(generateToolboxPart({ kind: "shcs", size: "M8", lengthMm: 30, lod: 2 }));
  assert.ok(fine.triangleCount > coarse.triangleCount);
  assert.ok(fine.bodyCount >= coarse.bodyCount);
});

test("BOM groups identical designations and exports CSV", () => {
  const a = generateToolboxPart({ kind: "shcs", size: "M8", lengthMm: 30 });
  const b = generateToolboxPart({ kind: "shcs", size: "M8", lengthMm: 30 });
  const c = generateToolboxPart({ kind: "hex-nut", size: "M8" });
  const rows = toolboxBOMRows([a, b, c]);
  const shcs = rows.find((row) => /4762/.test(row.designation));
  assert.equal(shcs.quantity, 2);
  assert.match(toolboxBOMCsv(rows), /Designation/);
  const assembly = {
    components: [
      { id: "1", name: "Bolt", def: { parts: a.parts } },
      { id: "2", name: "Bolt", def: { parts: b.parts } },
    ],
  };
  const bom = generateBOM(assembly);
  assert.equal(bom[0].quantity, 2);
  assert.ok(bom[0].standard);
});

test("auditor accepts a declared ISO 4762 SHCS and rejects a wrong pitch", () => {
  const shcs = toolboxFastener({ kind: "shcs", size: "M8", lengthMm: 30 });
  const ok = auditStandardParts({ parts: shcs.parts });
  assert.equal(ok.ok, true);
  const bad = validateToolboxSpec({ family: "shcs", standard: "ISO 4762:2018", nominalSize: "M8", pitchMm: 1.5, diameterMm: 8 });
  assert.equal(bad.ok, false);
});

test("imperial SHCS #10-32 and 1/4-20 generate real millimetre diameters", () => {
  const ten = toolboxFastener({ kind: "shcs", size: "#10-32", lengthMm: 25.4 });
  assert.ok(Math.abs(ten.spec.diameterMm - 4.826) < 0.01);
  const quarter = toolboxFastener({ kind: "shcs", size: "1/4-20", lengthMm: 25.4 });
  assert.equal(quarter.spec.diameterMm, 6.35);
  assert.ok(quarter.callout.includes("SHCS"));
});

test("bar pulls follow the 32mm system and knobs have M4 bores", () => {
  const pull = generateToolboxPart({ kind: "bar-pull", size: "128mm" });
  assert.equal(pull.metadata.dimensionsMm.ccMm, 128);
  assert.equal(pull.matePorts.length, 2);
  const knob = generateToolboxPart({ kind: "cabinet-knob", size: "Ø30" });
  assert.equal(knob.metadata.dimensionsMm.boreSize, "M4");
});

test("wood dowels and T-slot nuts keep commercial sizes", () => {
  const dowel = generateToolboxPart({ kind: "pin-dowel-wood", size: "Ø8×40" });
  assert.equal(dowel.metadata.dimensionsMm.diameterMm, 8);
  assert.equal(dowel.metadata.dimensionsMm.lengthMm, 40);
  const tnut = generateToolboxPart({ kind: "tslot-nut", size: "2020-M5" });
  assert.match(tnut.callout, /2020/);
  assert.equal(tnut.spec.diameterMm, 5);
});
