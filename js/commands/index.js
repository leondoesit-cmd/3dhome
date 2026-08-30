// Canonical planner command catalog for programmatic clients (tutor, MCP,
// macros, generators and importers). Runtime state/history/services remain
// caller-owned; this module only publishes stable command contracts.
import { registerModelCommand } from "../core/tool_registry.js";
import { openingPlaceCommand } from "./opening_place.js";
import { wallDrawCommand } from "./wall_draw.js";
import { itemPlaceCommand } from "./item_place.js";
import { roomCreateCommand } from "./room_create.js";

export { openingPlaceCommand, wallDrawCommand, itemPlaceCommand, roomCreateCommand };
export * from "./executor.js";

export const PLANNER_COMMANDS = Object.freeze({
  "opening.place": openingPlaceCommand,
  "wall.draw": wallDrawCommand,
  "item.place": itemPlaceCommand,
  "room.create": roomCreateCommand,
});

[
  [openingPlaceCommand, "Place opening", ["opening"]],
  [wallDrawCommand, "Draw wall", ["wall", "node"]],
  [itemPlaceCommand, "Place item", ["item"]],
  [roomCreateCommand, "Create room", ["room", "wall", "node"]],
].forEach(function (entry) {
  registerModelCommand(entry[0], {
    title: entry[1],
    entityKinds: entry[2],
    failureCodes: entry[0].failureCodes,
  });
});

export function plannerCommand(id) {
  return PLANNER_COMMANDS[String(id || "")] || null;
}

export function plannerCommandManifest() {
  return Object.keys(PLANNER_COMMANDS).sort().map(function (id) {
    var command = PLANNER_COMMANDS[id];
    return { id: id, failureCodes: (command.failureCodes || []).slice() };
  });
}
