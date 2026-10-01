import test from "node:test";
import assert from "node:assert/strict";
import {
  DIRECT_COMMAND_TOOLS,
  FEATURE_COMMAND,
  KEY_TOOL,
  KEY_VIEW,
  bomCsv,
  bomTableRows,
  buildCommandCatalog,
  commandUnavailableReason,
} from "../js/modeler_commands.js";
import { generateBOM } from "../js/cad_interference.js";

test("letter keys leave R for revolve and S for the shortcut bar", () => {
  assert.equal(KEY_TOOL.r, undefined);
  assert.equal(KEY_TOOL.s, undefined);
  assert.equal(KEY_TOOL.b, "rect");
  assert.equal(KEY_VIEW["4"], "top");
  assert.equal(FEATURE_COMMAND.revolve, "revolvefeature");
  assert.equal(FEATURE_COMMAND.hole, "holefeature");
  assert.equal(DIRECT_COMMAND_TOOLS.directbox, "rect");
});

test("the centre-start-end arc is discoverable as Centerpoint Arc", () => {
  const catalog = buildCommandCatalog({
    t: (key) => key,
    editor: { docType: "part", def: { parts: [] } },
    closedSketchProfile: () => null,
    activeParts: () => [],
  });
  const arc = catalog.find((command) => command.id === "sarc");
  assert.equal(arc.label, "centerpointArc");
  assert.equal(arc.shortcut, "A");
  assert.match(arc.terms, /centerpoint.*start end/);
  assert.equal(!!arc.available(), true);
});

test("the catalog exposes hole and direct tools with availability reasons", () => {
  const editor = { docType: "part", def: { parts: [] }, kernelBusy: false, assembly: null };
  const catalog = buildCommandCatalog({
    t: (key) => key,
    editor,
    closedSketchProfile: () => null,
    activeParts: () => [],
  });
  const hole = catalog.find((command) => command.id === "holefeature");
  const revolve = catalog.find((command) => command.id === "revolvefeature");
  const box = catalog.find((command) => command.id === "directbox");
  assert.ok(hole);
  assert.equal(revolve.shortcut, "R");
  assert.equal(box.group, "grpDirect");
  assert.equal(commandUnavailableReason("holefeature", catalog, "fallback"), "cmdNeedSolid");
  editor.def.parts = [{ id: "solid" }];
  const withSolid = buildCommandCatalog({
    t: (key) => key,
    editor,
    closedSketchProfile: () => null,
    activeParts: () => editor.def.parts,
  });
  assert.equal(commandUnavailableReason("holefeature", withSolid, "fallback"), "");
});

test("finish sketch is a catalog command only while a sketch is open", () => {
  const editor = { docType: "part", def: { parts: [] }, kernelBusy: false, assembly: null, authoring: { phase: "model" } };
  const catalog = buildCommandCatalog({
    t: (key) => key,
    editor,
    closedSketchProfile: () => ({ points: [] }),
    activeParts: () => [],
  });
  assert.equal(commandUnavailableReason("finishsketch", catalog, "fallback"), "cmdNeedOpenSketch");
  editor.authoring.phase = "sketch";
  const open = buildCommandCatalog({
    t: (key) => key,
    editor,
    closedSketchProfile: () => ({ points: [] }),
    activeParts: () => [],
  });
  assert.equal(commandUnavailableReason("finishsketch", open, "fallback"), "");
});

/* cad_drawings.js has always known how to balloon an assembly sheet; the
   command gate was what kept assemblies from ever reaching it. */
test("the drawing command is offered on an assembly that has components", () => {
  const editor = { docType: "assembly", def: { parts: [] }, assembly: { components: [] } };
  const catalog = () => buildCommandCatalog({
    t: (key) => key, editor, closedSketchProfile: () => null, activeParts: () => [],
  });
  const empty = catalog().find((command) => command.id === "drawing");
  assert.equal(!!empty.available(), false, "an empty assembly has nothing to draw");
  assert.equal(empty.reason(), "cmdNeedOneComponent");
  editor.assembly.components = [{ id: "c1" }];
  assert.equal(!!catalog().find((command) => command.id === "drawing").available(), true);
  editor.docType = "part";
  assert.equal(!!catalog().find((command) => command.id === "drawing").available(), true, "part drawings still work");
});

/* 40 of the 68 commands shipped with no `available()` at all, so an assembly
   document rendered the whole Sketch tab live over a hidden 2D canvas. */
const SKETCH_COMMANDS = [
  "wall", "srect", "scirc", "sarc", "sslot", "spoly", "sell", "dim", "trim",
  "extend", "sketchfillet", "offset", "constr", "mirror", "pattern", "circpattern", "project", "newsketch",
];
const FINISH_FEATURES = [
  "revolvefeature", "sweepfeature", "loftfeature", "filletfeature", "chamferfeature",
  "shellfeature", "patternfeature", "mirrorfeature", "booleanfeature",
];

function catalogFor(editor, options) {
  const opts = options || {};
  return buildCommandCatalog({
    t: (key) => key,
    editor,
    closedSketchProfile: () => opts.profile || null,
    activeParts: () => (editor.def && editor.def.parts) || [],
    canonicalAuthoring: () => editor.def && editor.def.metadata
      && editor.def.metadata.authoringSystem === "parametric-v1",
  });
}

test("an assembly document greys every sketch command and every finish feature", () => {
  const editor = { docType: "assembly", def: { parts: [], sketches: [] }, assembly: { components: [] } };
  const catalog = catalogFor(editor);
  SKETCH_COMMANDS.forEach((id) => {
    assert.equal(commandUnavailableReason(id, catalog, "fallback"), "cmdNeedPartDoc", id + " needs a part");
  });
  FINISH_FEATURES.forEach((id) => {
    assert.equal(commandUnavailableReason(id, catalog, "fallback"), "cmdNeedPartDoc", id + " needs a part");
  });
  ["directbox", "directcyl", "directsph", "directpoly", "directrev"].forEach((id) => {
    assert.equal(commandUnavailableReason(id, catalog, "fallback"), "cmdNeedPartDoc", id + " needs a part");
  });
});

test("a blank part greys the finish features that need geometry", () => {
  const editor = { docType: "part", def: { parts: [], sketches: [] }, assembly: null };
  const catalog = catalogFor(editor);
  ["filletfeature", "chamferfeature", "shellfeature", "patternfeature", "mirrorfeature"].forEach((id) => {
    assert.equal(commandUnavailableReason(id, catalog, "fallback"), "cmdNeedSolid", id + " needs a solid");
  });
  assert.equal(commandUnavailableReason("booleanfeature", catalog, "fallback"), "cmdNeedTwoBodies");
  assert.equal(commandUnavailableReason("revolvefeature", catalog, "fallback"), "cmdNeedClosedSketch");
  assert.equal(commandUnavailableReason("sweepfeature", catalog, "fallback"), "cmdNeedTwoSketches");
  assert.equal(commandUnavailableReason("loftfeature", catalog, "fallback"), "cmdNeedTwoSketches");
  SKETCH_COMMANDS.forEach((id) => {
    assert.equal(commandUnavailableReason(id, catalog, "fallback"), "", id + " is a part-document tool");
  });
});

test("one solid ungreys fillet but a Boolean still wants two bodies", () => {
  const editor = { docType: "part", def: { parts: [{ id: "a" }], sketches: [] }, assembly: null };
  const one = catalogFor(editor);
  assert.equal(commandUnavailableReason("filletfeature", one, "fallback"), "");
  assert.equal(commandUnavailableReason("shellfeature", one, "fallback"), "");
  assert.equal(commandUnavailableReason("booleanfeature", one, "fallback"), "cmdNeedTwoBodies");
  editor.def.parts.push({ id: "b" });
  assert.equal(commandUnavailableReason("booleanfeature", catalogFor(editor), "fallback"), "");
});

/* Fillet and chamfer pick their own edges in the PropertyManager, so a solid
   — not a live edge selection — is the whole precondition. */
test("fillet needs no pre-existing edge selection", () => {
  const editor = { docType: "part", def: { parts: [{ id: "a" }], sketches: [] }, assembly: null, sel: [] };
  const catalog = catalogFor(editor);
  assert.equal(catalog.find((command) => command.id === "filletfeature").available(), true);
  assert.equal(catalog.find((command) => command.id === "chamferfeature").available(), true);
});

test("circular sweep opens with one sketch and loft still requires two", () => {
  const editor = { docType: "part", def: { parts: [], sketches: [{ id: "s1" }] }, assembly: null };
  assert.equal(commandUnavailableReason("sweepfeature", catalogFor(editor), "fallback"), "");
  assert.equal(commandUnavailableReason("loftfeature", catalogFor(editor), "fallback"), "cmdNeedTwoSketches");
  editor.def.sketches.push({ id: "s2" });
  const two = catalogFor(editor);
  assert.equal(commandUnavailableReason("sweepfeature", two, "fallback"), "");
  assert.equal(commandUnavailableReason("loftfeature", two, "fallback"), "");
});

test("revolve waits for a closed profile", () => {
  const editor = { docType: "part", def: { parts: [], sketches: [] }, assembly: null };
  const closed = catalogFor(editor, { profile: { points: [] } });
  assert.equal(commandUnavailableReason("revolvefeature", closed, "fallback"), "");
});

/* setTool rewrites rect/circle and hard-refuses sphere/polygon/revolve in a
   parametric-v1 document, so all five Direct primitives are traps there. */
test("a parametric-v1 part greys the Direct primitives a legacy part still offers", () => {
  const legacy = { docType: "part", def: { parts: [], sketches: [] }, assembly: null };
  const legacyCatalog = catalogFor(legacy);
  const canonical = {
    docType: "part",
    def: { parts: [], sketches: [], metadata: { authoringSystem: "parametric-v1" } },
    assembly: null,
  };
  const canonicalCatalog = catalogFor(canonical);
  ["directbox", "directcyl", "directsph", "directpoly", "directrev"].forEach((id) => {
    assert.equal(commandUnavailableReason(id, legacyCatalog, "fallback"), "", id + " works on a legacy part");
    assert.equal(commandUnavailableReason(id, canonicalCatalog, "fallback"), "needSketchThenFeature", id + " is a trap in parametric-v1");
  });
});

/* The helper is optional so a caller that omits it still builds a sane catalog. */
test("a catalog built without canonicalAuthoring keeps the Direct primitives live", () => {
  const catalog = buildCommandCatalog({
    t: (key) => key,
    editor: { docType: "part", def: { parts: [], sketches: [] }, assembly: null },
    closedSketchProfile: () => null,
    activeParts: () => [],
  });
  assert.equal(commandUnavailableReason("directbox", catalog, "fallback"), "");
});

test("section cuts a part with solids or an assembly with components", () => {
  const blank = { docType: "part", def: { parts: [], sketches: [] }, assembly: null };
  assert.equal(commandUnavailableReason("section", catalogFor(blank), "fallback"), "cmdNeedSolid");
  blank.def.parts.push({ id: "a" });
  assert.equal(commandUnavailableReason("section", catalogFor(blank), "fallback"), "");
  const asm = { docType: "assembly", def: { parts: [], sketches: [] }, assembly: { components: [] } };
  assert.equal(commandUnavailableReason("section", catalogFor(asm), "fallback"), "cmdNeedOneComponent");
  asm.assembly.components.push({ id: "c1" });
  assert.equal(commandUnavailableReason("section", catalogFor(asm), "fallback"), "");
});

/* Fit and the bundle I/O work in any document; the document-switch commands
   are supposed to reach across from either side. */
test("navigation and bundle commands stay ungated", () => {
  const editor = { docType: "assembly", def: { parts: [], sketches: [] }, assembly: { components: [] } };
  const catalog = catalogFor(editor);
  ["fit", "bundle", "bundlein", "assembly", "components", "mates", "partdoc"].forEach((id) => {
    assert.equal(catalog.find((command) => command.id === id).available, undefined, id + " must not be gated");
  });
});

/* E.tool === "select" is load-bearing for assembly component picking and the
   grab cursor in the 3D viewport, so select stays live in both documents. */
test("select stays available in an assembly", () => {
  const editor = { docType: "assembly", def: { parts: [], sketches: [] }, assembly: { components: [] } };
  assert.equal(catalogFor(editor).find((command) => command.id === "select").available, undefined);
});

test("the BOM table numbers its rows and picks up a material from either the instance or its model", () => {
  const assembly = {
    components: [
      { id: "1", modelKey: "leg", name: "Leg", material: "Oak" },
      { id: "2", modelKey: "leg", name: "Leg", material: "Oak" },
      { id: "3", modelKey: "top", name: "Top", def: { material: "Steel" } },
      { id: "4", name: "Shim" },
    ],
  };
  const rows = bomTableRows(generateBOM(assembly), assembly.components);
  assert.deepEqual(rows.map((row) => [row.item, row.quantity, row.name, row.material]), [
    [1, 2, "Leg", "Oak"],
    [2, 1, "Top", "Steel"],
    [3, 1, "Shim", ""],
  ]);
});

test("the BOM CSV drops the material column when nothing carries one, and quotes what it must", () => {
  const rows = [
    { item: 1, quantity: 2, name: 'Bracket, "left"', material: "Steel" },
    { item: 2, quantity: 1, name: "Pin", material: "" },
  ];
  const headers = ["Item", "Qty", "Name", "Material"];
  assert.equal(bomCsv(rows, headers, true),
    'Item,Qty,Name,Material\n1,2,"Bracket, ""left""",Steel\n2,1,Pin,');
  assert.equal(bomCsv(rows, headers, false),
    'Item,Qty,Name\n1,2,"Bracket, ""left"""\n2,1,Pin');
});

test("Measure is gated like Section: a solid in a part, a component in an assembly", () => {
  const editor = { docType: "part", def: { parts: [] }, kernelBusy: false, assembly: null };
  const build = (activeParts) => buildCommandCatalog({
    t: (key) => key, editor, closedSketchProfile: () => null, activeParts,
  }).find((command) => command.id === "measure");
  const empty = build(() => []);
  assert.equal(empty.group, "cmdEvaluate");
  assert.equal(empty.available(), false);
  assert.equal(empty.reason(), "cmdNeedSolid");
  assert.equal(build(() => [{ id: "solid" }]).available(), true);

  editor.docType = "assembly";
  editor.assembly = { components: [] };
  assert.equal(build(() => []).available(), false);
  assert.equal(build(() => []).reason(), "cmdNeedOneComponent");
  editor.assembly.components = [{ id: "c" }];
  assert.equal(build(() => []).available(), true);
});
