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

test("letter keys leave R for parametric revolve", () => {
  assert.equal(KEY_TOOL.r, undefined);
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
