import test from "node:test";
import assert from "node:assert/strict";
import { DIAGNOSTIC_CODES, hasDiagnosticHelp } from "../js/core/diagnostic_help.js";
import {
  CAPABILITY_CLASSES,
  commandFailureCodes,
  getCapability,
  getModelCommand,
  listCapabilities,
  registerModelCommand,
  seedCuratedToolMetadata,
  unregisterCapability,
  validateRegistryConformance,
} from "../js/core/tool_registry.js";
import {
  CREATABLE_ENTITY_INVENTORY,
  ENTITY_CLASSIFICATIONS,
  EXECUTOR_FAILURE_CODES,
  temporaryCreationExceptions,
  validateEntityInventory,
} from "../js/core/command_conformance.js";
import { TOOL_SEARCH_ENTRIES } from "../js/tool_search.js";
import { openingPlaceCommand } from "../js/commands/opening_place.js";
import { ITEM_PLACE_CODES, itemPlaceCommand } from "../js/commands/item_place.js";
import { WALL_DRAW_CODES, wallDrawCommand } from "../js/commands/wall_draw.js";
import { ROOM_CREATE_CODES, roomCreateCommand } from "../js/commands/room_create.js";
import { plannerCommand, plannerCommandManifest } from "../js/commands/index.js";

registerModelCommand(openingPlaceCommand, {
  title: "Place opening",
  entityKinds: ["opening"],
});
registerModelCommand(itemPlaceCommand, {
  title: "Place item",
  entityKinds: ["item"],
});
registerModelCommand(wallDrawCommand, {
  title: "Draw wall",
  entityKinds: ["wall", "node"],
});
registerModelCommand(roomCreateCommand, {
  title: "Create room",
  entityKinds: ["room", "wall", "node"],
});

test("registry distinguishes curated UI tools/actions from model commands", () => {
  seedCuratedToolMetadata(TOOL_SEARCH_ENTRIES);
  assert.deepEqual(CAPABILITY_CLASSES, ["ui-tool", "ui-action", "model-command"]);
  assert.equal(getCapability("door").capability, "ui-tool");
  assert.deepEqual(getCapability("door").target, { kind: "tool", id: "door" });
  assert.equal(getCapability("door").modelCommandId, "opening.place");
  assert.equal(getCapability("save").capability, "ui-action");
  assert.equal(getCapability("opening.place").capability, "model-command");
  assert.equal(getCapability("opening.place").status, "implemented");
});

test("programmatic clients can enumerate and resolve every initial command", () => {
  assert.deepEqual(plannerCommandManifest().map((entry) => entry.id), [
    "item.place", "opening.place", "room.create", "wall.draw",
  ]);
  assert.equal(plannerCommand("room.create"), roomCreateCommand);
  assert.equal(plannerCommand("missing.command"), null);
});

test("dynamic DOM search observations cannot enter the semantic registry", () => {
  seedCuratedToolMetadata([{ id: "observed", dynamic: true, action: "anything" }]);
  assert.equal(getCapability("observed"), null);
});

test("command registration validates the contract and publishes metadata only", () => {
  const command = {
    id: "test.place",
    failureCodes: ["TEST_FAILURE"],
    prepare() { return { ok: false, reason: "TEST_FAILURE" }; },
    preview() { return { kind: "test" }; },
    apply() { return { created: [], changed: [], effects: {} }; },
  };
  registerModelCommand(command, { title: "Test", entityKinds: ["test"] });
  assert.equal(getModelCommand("test.place"), command, "registry exposes the exact executable contract");
  assert.deepEqual(getCapability("test.place").failureCodes, ["TEST_FAILURE"]);
  assert.ok(commandFailureCodes().includes("TEST_FAILURE"));
  assert.deepEqual(validateRegistryConformance({ hasDiagnostic: (code) => code !== "TEST_FAILURE" }), [
    { id: "test.place", code: "MISSING_DIAGNOSTIC", diagnosticCode: "TEST_FAILURE" },
  ]);
  unregisterCapability("test.place");
});

test("entity inventory is exhaustive, classified, and keeps exceptions visible", () => {
  const required = ["wall", "node", "opening", "item", "room", "marker", "slab-opening", "wall-constraint", "room-constraint", "plan-variable", "mep-node", "mep-run", "floor", "custom-model-definition", "cabinet-preset"];
  assert.deepEqual(ENTITY_CLASSIFICATIONS, ["implemented command", "solver/internal-only", "document-level operation", "explicit temporary exception"]);
  required.forEach((kind) => assert.ok(CREATABLE_ENTITY_INVENTORY.some((entry) => entry.kind === kind), kind));
  assert.deepEqual(validateEntityInventory(CREATABLE_ENTITY_INVENTORY, listCapabilities()), []);
  assert.ok(temporaryCreationExceptions().length > 0, "allow-list remains explicit until migrations land");
});

test("registered command failure codes have diagnostic-help coverage", () => {
  const known = new Set(DIAGNOSTIC_CODES);
  assert.deepEqual(validateRegistryConformance({ hasDiagnostic: (code) => known.has(code) }), []);
  [...EXECUTOR_FAILURE_CODES, ...ITEM_PLACE_CODES, ...WALL_DRAW_CODES, ...ROOM_CREATE_CODES].forEach((code) => {
    assert.equal(hasDiagnosticHelp(code), true, code);
  });
});
