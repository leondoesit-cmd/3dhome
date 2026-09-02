// Canonical planner command catalog for programmatic clients (tutor, MCP,
// macros, generators and importers). Runtime state/history/services remain
// caller-owned; this module only publishes stable command contracts.
import { registerModelCommand } from "../core/tool_registry.js";
import { openingPlaceCommand } from "./opening_place.js";
import { wallDrawCommand } from "./wall_draw.js";
import { itemPlaceCommand } from "./item_place.js";
import { itemDuplicateCommand } from "./item_duplicate.js";
import { itemMoveCommand } from "./item_move.js";
import { roomCreateCommand } from "./room_create.js";

export { openingPlaceCommand, wallDrawCommand, itemPlaceCommand, itemDuplicateCommand, itemMoveCommand, roomCreateCommand };
export * from "./executor.js";

export const PLANNER_COMMANDS = Object.freeze({
  "opening.place": openingPlaceCommand,
  "wall.draw": wallDrawCommand,
  "item.place": itemPlaceCommand,
  "item.duplicate": itemDuplicateCommand,
  "item.move": itemMoveCommand,
  "room.create": roomCreateCommand,
});

export const PLANNER_COMMAND_PARAMETERS = Object.freeze({
  "opening.place": { required: ["wallId", "type", "s"], properties: { wallId: "existing wall id", type: "door | window | passage", s: "distance along wall in cm", width: "cm (optional)", height: "cm (optional)", sill: "cm (optional)" } },
  "wall.draw": { required: ["from", "to"], properties: { from: "{x,z} cm", to: "{x,z} cm", type: "wall type id (optional)", thickness: "cm (optional)", height: "cm (optional)", loc: "center | face (optional)", dimSide: "-1 | 0 | 1 (optional)" } },
  "item.place": { required: ["type", "x", "z"], properties: { type: "catalog item id", x: "plan x in cm", z: "plan z in cm", rot: "degrees (optional)" } },
  "item.duplicate": { required: ["sourceIds"], properties: { sourceIds: "existing item ids", offsetX: "cm (optional)", offsetZ: "cm (optional)", regroup: "boolean (optional)" } },
  "item.move": { required: ["itemId"], properties: { itemId: "existing item id", x: "destination x in cm", z: "destination z in cm", deltaX: "relative x in cm", deltaZ: "relative z in cm", rot: "degrees (optional)" } },
  "room.create": { required: ["from", "to"], properties: { from: "one rectangle corner {x,z} in cm", to: "opposite corner {x,z} in cm", type: "wall type id (optional)", thickness: "cm (optional)", height: "cm (optional)", name: "room name (optional)", isCorridor: "boolean (optional)" } },
});

const COMMAND_SEMANTICS = Object.freeze({
  "opening.place": { prerequisites: ["existing host wall"], effects: ["create opening", "change host wall"], reversible: true, availableWhen: "workspace role is owner or editor" },
  "wall.draw": { prerequisites: ["two distinct finite plan points"], effects: ["create wall", "create or reuse nodes"], reversible: true, availableWhen: "planner top view and editable workspace" },
  "item.place": { prerequisites: ["catalog item exists"], effects: ["create item"], reversible: true, availableWhen: "editable workspace" },
  "item.duplicate": { prerequisites: ["existing source items"], effects: ["create item copies"], reversible: true, availableWhen: "editable workspace" },
  "item.move": { prerequisites: ["one existing item"], effects: ["move item"], reversible: true, availableWhen: "editable workspace" },
  "room.create": { prerequisites: ["rectangle at least 20 cm per side"], effects: ["create four walls", "derive room"], reversible: true, availableWhen: "planner top view and editable workspace" },
});

[
  [openingPlaceCommand, "Place opening", ["opening"]],
  [wallDrawCommand, "Draw wall", ["wall", "node"]],
  [itemPlaceCommand, "Place item", ["item"]],
  [itemDuplicateCommand, "Duplicate item", ["item"]],
  [itemMoveCommand, "Move item", ["item"]],
  [roomCreateCommand, "Create room", ["room", "wall", "node"]],
].forEach(function (entry) {
  registerModelCommand(entry[0], {
    title: entry[1],
    entityKinds: entry[2],
    failureCodes: entry[0].failureCodes,
    ...COMMAND_SEMANTICS[entry[0].id],
  });
});

export function plannerCommand(id) {
  return PLANNER_COMMANDS[String(id || "")] || null;
}

export function plannerCommandManifest() {
  return Object.keys(PLANNER_COMMANDS).sort().map(function (id) {
    var command = PLANNER_COMMANDS[id];
    return { id: id, parameters: PLANNER_COMMAND_PARAMETERS[id], failureCodes: (command.failureCodes || []).slice(), ...COMMAND_SEMANTICS[id] };
  });
}
