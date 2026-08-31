// Canonical semantic capability registry. UI search contributes discoverability
// metadata through seedCuratedToolMetadata(); executable commands register here
// directly so tool_search.js never owns execution semantics.

export const CAPABILITY_CLASSES = Object.freeze(["ui-tool", "ui-action", "model-command"]);

const capabilityClasses = new Set(CAPABILITY_CLASSES);
const capabilities = new Map();
const commands = new Map();
const curatedCommandLinks = Object.freeze({
  wall: "wall.draw",
  room: "room.create",
  door: "opening.place",
  window: "opening.place",
  passage: "opening.place",
  furniture: "item.place",
});

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function plainObject(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(name + " must be a plain object");
  }
}

function normalizedCodes(codes) {
  if (codes == null) return [];
  if (!Array.isArray(codes)) throw new TypeError("failureCodes must be an array");
  return [...new Set(codes.map((code) => String(code || "").trim()).filter(Boolean))].sort();
}

function normalizeCapability(definition) {
  plainObject(definition, "capability");
  const id = String(definition.id || "").trim();
  if (!id) throw new TypeError("capability.id is required");
  const capability = String(definition.capability || "").trim();
  if (!capabilityClasses.has(capability)) throw new TypeError("invalid capability class: " + capability);
  return Object.freeze({
    ...clone(definition),
    id,
    capability,
    status: definition.status || (capability === "model-command" ? "planned" : "available"),
    failureCodes: normalizedCodes(definition.failureCodes),
    prerequisites: Array.isArray(definition.prerequisites) ? clone(definition.prerequisites) : [],
    effects: Array.isArray(definition.effects) ? clone(definition.effects) : [],
    reversible: typeof definition.reversible === "boolean" ? definition.reversible : null,
    availableWhen: definition.availableWhen || "always",
  });
}

export function defineCapability(definition) {
  const normalized = normalizeCapability(definition);
  const previous = capabilities.get(normalized.id);
  if (previous && previous.capability !== normalized.capability) {
    throw new Error("capability class cannot change for " + normalized.id);
  }
  capabilities.set(normalized.id, normalized);
  return clone(normalized);
}

export function registerCapability(definition) {
  return defineCapability(definition);
}

export function unregisterCapability(id) {
  const key = String(id || "");
  commands.delete(key);
  return capabilities.delete(key);
}

export function getCapability(id) {
  return clone(capabilities.get(String(id || ""))) || null;
}

export function listCapabilities(options = {}) {
  const capability = options.capability;
  if (capability && !capabilityClasses.has(capability)) throw new TypeError("invalid capability class: " + capability);
  return [...capabilities.values()]
    .filter((entry) => !capability || entry.capability === capability)
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(clone);
}

// Dynamic DOM search entries are intentionally excluded. They are observations
// of the current page, not stable semantic capabilities.
export function seedCuratedToolMetadata(entries = []) {
  if (!Array.isArray(entries)) throw new TypeError("curated tool metadata must be an array");
  const seeded = [];
  entries.forEach((entry) => {
    if (!entry || entry.dynamic) return;
    const capability = entry.tool ? "ui-tool" : "ui-action";
    const target = entry.tool
      ? { kind: "tool", id: String(entry.tool) }
      : entry.action
        ? { kind: "action", id: String(entry.action) }
        : entry.reveal
          ? { kind: "reveal", id: String(entry.reveal) }
          : null;
    if (!target) return;
    seeded.push(defineCapability({
      id: String(entry.id),
      capability,
      source: "curated-tool-search",
      target,
      modelCommandId: curatedCommandLinks[entry.id] || "",
      label: clone(entry.label),
      help: clone(entry.help),
      keywords: String(entry.keywords || ""),
      icon: entry.icon || "",
      location: entry.location || "",
      selector: entry.selector || "",
      prerequisites: entry.prerequisites || [],
      effects: entry.effects || [],
      reversible: typeof entry.reversible === "boolean" ? entry.reversible : null,
      availableWhen: entry.availableWhen || "visible in the current planner domain",
    }));
  });
  return seeded;
}

export function registerModelCommand(command, metadata = {}) {
  plainObject(command, "command");
  const id = String(command.id || "").trim();
  if (!id) throw new TypeError("command.id is required");
  ["prepare", "preview", "apply"].forEach((method) => {
    if (typeof command[method] !== "function") throw new TypeError(id + "." + method + " must be a function");
  });
  plainObject(metadata, "command metadata");
  const prior = capabilities.get(id);
  if (prior && prior.capability !== "model-command") throw new Error("capability class cannot change for " + id);
  const definition = defineCapability({
    ...(prior || {}),
    ...clone(metadata),
    failureCodes: metadata.failureCodes == null ? command.failureCodes : metadata.failureCodes,
    id,
    capability: "model-command",
    status: "implemented",
  });
  commands.set(id, command);
  return definition;
}

export function getModelCommand(id) {
  return commands.get(String(id || "")) || null;
}

export function commandFailureCodes() {
  return [...new Set(listCapabilities({ capability: "model-command" })
    .flatMap((entry) => entry.failureCodes || []))].sort();
}

export function validateRegistryConformance(options = {}) {
  const hasDiagnostic = typeof options.hasDiagnostic === "function" ? options.hasDiagnostic : null;
  const issues = [];
  listCapabilities().forEach((entry) => {
    if (!entry.id || !capabilityClasses.has(entry.capability)) issues.push({ id: entry.id || "", code: "INVALID_CAPABILITY" });
    if (entry.capability === "model-command" && entry.status === "implemented" && !commands.has(entry.id)) {
      issues.push({ id: entry.id, code: "MISSING_COMMAND_IMPLEMENTATION" });
    }
    (entry.failureCodes || []).forEach((code) => {
      if (hasDiagnostic && !hasDiagnostic(code)) issues.push({ id: entry.id, code: "MISSING_DIAGNOSTIC", diagnosticCode: code });
    });
  });
  return issues;
}

// Declarations make planned semantic operations discoverable without importing
// their implementations (and therefore without introducing registry cycles).
[
  { id: "opening.place", title: "Place opening", entityKinds: ["opening"], failureCodes: ["AMBIGUOUS_TARGET", "HOST_WALL_NOT_FOUND", "INVALID_HOST_WALL", "INVALID_OPENING_TYPE", "INVALID_OPENING_VALUE"] },
  { id: "wall.draw", title: "Draw wall", entityKinds: ["wall", "node"], failureCodes: ["INVALID_WALL_POINT", "ZERO_LENGTH_WALL", "INVALID_WALL_VALUE", "WALL_MATERIALIZATION_FAILED"] },
  { id: "item.place", title: "Place item", entityKinds: ["item"], failureCodes: ["INVALID_ITEM_TYPE", "ITEM_TYPE_NOT_FOUND", "INVALID_ITEM_POSITION", "INVALID_ITEM_DIMENSIONS", "ITEM_CREATE_FAILED"] },
  { id: "room.create", title: "Create room", entityKinds: ["room", "wall", "node"], failureCodes: ["INVALID_ROOM_BOUNDS", "ROOM_TOO_SMALL", "ROOM_WALL_FAILED"] },
].forEach((entry) => defineCapability({ ...entry, capability: "model-command", status: "planned" }));
