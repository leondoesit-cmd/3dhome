import test from "node:test";
import assert from "node:assert/strict";
import {
  DIRECT_COMMAND_TOOLS,
  FEATURE_COMMAND,
  KEY_TOOL,
  KEY_VIEW,
  buildCommandCatalog,
  commandUnavailableReason,
} from "../js/modeler_commands.js";

test("letter keys leave R for revolve and S for the shortcut bar", () => {
  assert.equal(KEY_TOOL.r, undefined);
  assert.equal(KEY_TOOL.s, undefined);
  assert.equal(KEY_TOOL.b, "rect");
  assert.equal(KEY_VIEW["4"], "top");
  assert.equal(FEATURE_COMMAND.revolve, "revolvefeature");
  assert.equal(FEATURE_COMMAND.hole, "holefeature");
  assert.equal(DIRECT_COMMAND_TOOLS.directbox, "rect");
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
