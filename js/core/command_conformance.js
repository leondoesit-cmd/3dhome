export const ENTITY_CLASSIFICATIONS = Object.freeze([
  "implemented command",
  "solver/internal-only",
  "document-level operation",
  "explicit temporary exception",
]);

export const EXECUTOR_FAILURE_CODES = Object.freeze([
  "INVALID_COMMAND",
  "PREPARE_FAILED",
  "VALIDATION_FAILED",
  "INVALID_PLAN",
  "PREVIEW_FAILED",
  "EMPTY_COMMAND_BATCH",
  "STALE_DOCUMENT",
  "PREVIEW_INVALIDATED",
  "POST_VALIDATION_FAILED",
  "EXECUTION_FAILED",
  "ROLLBACK_FAILED",
]);

// This is deliberately exhaustive and explicit. "explicit temporary exception"
// is the shrinking allow-list: a new creatable kind must be classified here,
// rather than silently bypassing the command layer.
export const CREATABLE_ENTITY_INVENTORY = Object.freeze([
  { kind: "wall", classification: "implemented command", commandId: "wall.draw", source: "command clients; offset/arc gestures and document imports remain explicit boundaries" },
  { kind: "node", classification: "solver/internal-only", source: "wall topology materialization; constraint_engine.js" },
  { kind: "opening", classification: "implemented command", commandId: "opening.place", source: "pointer, elevation, corridor and generator clients; scan import is a document boundary" },
  { kind: "item", classification: "implemented command", commandId: "item.place", source: "item.place and item.duplicate clients; scan import and marker replacement are composite boundaries" },
  { kind: "room", classification: "implemented command", commandId: "room.create", source: "derived wall-loop room creation" },
  { kind: "marker", classification: "explicit temporary exception", source: "markers.js" },
  { kind: "slab-opening", classification: "explicit temporary exception", source: "slab_openings.js, floors.js" },
  { kind: "wall-constraint", classification: "explicit temporary exception", source: "wall_constraints.js" },
  { kind: "room-constraint", classification: "explicit temporary exception", source: "room_params.js" },
  { kind: "plan-variable", classification: "explicit temporary exception", source: "room_params.js" },
  { kind: "mep-node", classification: "explicit temporary exception", source: "mep.js" },
  { kind: "mep-run", classification: "explicit temporary exception", source: "mep.js" },
  { kind: "floor", classification: "document-level operation", source: "floors.js" },
  { kind: "custom-model-definition", classification: "document-level operation", source: "modeler.js, model_catalog.js" },
  { kind: "cabinet-preset", classification: "document-level operation", source: "parametric_cabinet.js" },
  { kind: "project-import", classification: "document-level operation", source: "ui.js GeoJSON/CAD import" },
  { kind: "snapshot-clone-topology", classification: "solver/internal-only", source: "ui.js snapshot/clone loop" },
]);

// Source-level shrinking allow-list. The test suite counts direct pushes and
// rejects both a new file and growth inside an existing boundary. Counts may
// only move down as the remaining gesture/import commands land.
export const DIRECT_CREATION_BOUNDARIES = Object.freeze([
  // interaction.js's six, after the split into js/interaction/
  { file: "js/interaction/wall_edit.js", maxDirectPushes: 4, reason: "wall split/materialization topology service" },
  { file: "js/interaction/mep_tools.js", maxDirectPushes: 1, reason: "offset-wall gesture (commitOffsetWall)" },
  { file: "js/interaction/room_tools.js", maxDirectPushes: 1, reason: "arc-wall gesture (arcWallPoint)" },
  { file: "js/ui_room_scan.js", maxDirectPushes: 4, reason: "scan document merge/import boundary" },
  { file: "js/ui_site.js", maxDirectPushes: 2, reason: "site-footprint document import" },
  { file: "js/ui.js", maxDirectPushes: 1, reason: "temporary topology snapshot restoration" },
  { file: "js/constraint_engine.js", maxDirectPushes: 1, reason: "solver-owned node materialization" },
]);

export function validateEntityInventory(inventory = CREATABLE_ENTITY_INVENTORY, capabilities = []) {
  const issues = [];
  const kinds = new Set();
  const capabilityById = new Map(capabilities.map((entry) => [entry.id, entry]));
  inventory.forEach((entry) => {
    if (!entry || !entry.kind) {
      issues.push({ code: "MISSING_ENTITY_KIND" });
      return;
    }
    if (kinds.has(entry.kind)) issues.push({ code: "DUPLICATE_ENTITY_KIND", kind: entry.kind });
    kinds.add(entry.kind);
    if (!ENTITY_CLASSIFICATIONS.includes(entry.classification)) {
      issues.push({ code: "INVALID_ENTITY_CLASSIFICATION", kind: entry.kind });
    }
    if (entry.classification === "implemented command") {
      const capability = capabilityById.get(entry.commandId);
      if (!entry.commandId) issues.push({ code: "MISSING_ENTITY_COMMAND", kind: entry.kind });
      else if (!capability || capability.capability !== "model-command" || capability.status !== "implemented") {
        issues.push({ code: "UNKNOWN_ENTITY_COMMAND", kind: entry.kind, commandId: entry.commandId });
      }
    }
  });
  return issues;
}

export function temporaryCreationExceptions() {
  return CREATABLE_ENTITY_INVENTORY.filter((entry) => entry.classification === "explicit temporary exception");
}
