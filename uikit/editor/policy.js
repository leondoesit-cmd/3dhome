/* What a container will accept.
 *
 * Two kinds of rule live in a layout editor, and only one of them belongs in
 * this module.
 *
 * GENERIC rules follow from the node vocabulary uikit itself defines: a
 * command belongs in something that lays widgets out in a line, a panel
 * belongs in something that stacks, nothing at all belongs in a leaf. Those
 * are facts about the schema and they are written below.
 *
 * SPECIFIC rules follow from a host's own markup and CSS — that #topbar is a
 * three-track grid whose children are fixed, or that a sidebar must never
 * receive a toolbar button. Those are facts about an application, and this
 * module must not know them. An earlier version hardcoded `n:topbar`,
 * `n:left`, `n:right` and the `act:` / `panel:` id prefixes here, which put
 * one application's vocabulary inside the portable module — invisible to
 * tools/link_check.mjs, because strings are not imports. It also fired on the
 * wrong app: uikit/demo declares a toolbar with `slot: "topbar"`, matched the
 * hardcoded rule by string collision, and lost the ability to hold a command.
 *
 * So a host says what its own containers accept, declaratively, on the node:
 *
 *   "n:topbar": { accepts: ["panel:tb-start", "panel:tb-center", "panel:tb-end"] }
 *   "n:left":   { accepts: ["panel"] }
 *   "n:frozen": { accepts: "none" }
 *
 * An entry in that list matches either a KIND or an exact node id, so a
 * container whose children are fixed by the host's CSS can name them without
 * inventing a kind for them. `"*"` accepts anything. The declaration lives on
 * the node, so it is part of the layout document, travels through export and
 * import, and is as inspectable as everything else.
 */

import { asRegistry } from "../model/resolve.js";

/* The registry may arrive as an array, a Map or an object with get()/ids() —
   asRegistry() is what normalises those. Reaching for `.get` directly, as an
   earlier version did, silently skipped the lookup for every host that passes
   a plain array, and fell back to guessing a kind from the id. */
export function kindOf(nodeOrEntry, registrySource) {
  if (!nodeOrEntry) return null;
  if (nodeOrEntry.kind) return nodeOrEntry.kind;
  if (nodeOrEntry.entry && nodeOrEntry.entry.kind) return nodeOrEntry.entry.kind;

  const ref = nodeOrEntry.ref || nodeOrEntry.id;
  if (ref && registrySource) {
    const entry = asRegistry(registrySource).get(ref);
    if (entry && entry.kind) return entry.kind;
  }
  /* A container has no registry entry; its node type IS its kind. */
  return nodeOrEntry.type || "item";
}

function idOf(nodeOrEntry) {
  return (nodeOrEntry && (nodeOrEntry.id || nodeOrEntry.ref)) || null;
}

function declaredPolicy(container) {
  if (!container) return undefined;
  const declared = container.constraints && container.constraints.accepts;
  return declared === undefined ? container.accepts : declared;
}

export function containerAccepts(container, nodeOrEntry, registry) {
  if (!container || !container.children || container.hidden) return false;

  const kind = kindOf(nodeOrEntry, registry);

  /* The host's own word, and it is final in both directions. */
  const policy = declaredPolicy(container);
  if (policy === "none" || policy === false) return false;
  if (Array.isArray(policy)) {
    return policy.includes("*") || policy.includes(kind) || policy.includes(idOf(nodeOrEntry));
  }

  /* Generic rules, from the schema alone. */
  if (kind === "command") {
    // a line of widgets: a toolbar or a group inside one
    return container.type === "bar" || container.type === "group";
  }
  if (kind === "separator") {
    return container.type === "bar" || container.type === "group";
  }
  if (kind === "menu") {
    return container.type === "bar" || container.type === "group";
  }
  if (kind === "panel") {
    // panels stack; dropping one into a command bar makes a toolbar of panels
    return container.type === "stack" || container.type === "dock" || container.type === "group";
  }
  // containers and anything the host has not classified
  return container.type === "stack" || container.type === "dock" || container.type === "group";
}
