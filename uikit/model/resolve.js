/* Document + registry + variant -> the tree the renderer walks.
 *
 * This is where "inherit" stops being null and becomes a real value, and it is
 * the only place that reads the registry. Keeping the lookup here means ops.js
 * stays a pure function of the document, and means a document can be edited,
 * undone and saved on a machine where half the registry does not exist.
 *
 * TWO WAYS TO RETITLE, ON PURPOSE.
 *   node.label          this placement, this button. The Save button on MY
 *                       toolbar is called "Keep".
 *   overrides.text[key] the string itself, everywhere the app shows it,
 *                       per language. Every "Save" in the app is "Keep".
 * They compose in that order — the node wins, because it is the more specific
 * thing the user pointed at.
 *
 * TOMBSTONES. A node whose registry entry has gone (the app dropped a command,
 * or the layout came from another app entirely) is not an error and is never
 * deleted. It resolves with `tombstone` set: customize mode draws a placeholder
 * the user can move or remove deliberately, and normal mode renders nothing at
 * all. A layout must survive its host being upgraded underneath it.
 */

import { isContainer, isKnownType, withDefaults } from "./schema.js";
import { scopeTokens } from "./layout_scope.js";

/* The registry may arrive as an array of entries, a Map, or anything with a
   get(id). Hosts build these three ways and none of them is wrong. */
export function asRegistry(source) {
  if (!source) return { get: () => null, ids: () => [] };
  if (Array.isArray(source)) {
    const map = new Map(source.map((entry) => [entry.id, entry]));
    return { get: (id) => map.get(id) || null, ids: () => [...map.keys()] };
  }
  if (source instanceof Map) {
    return { get: (id) => source.get(id) || null, ids: () => [...source.keys()] };
  }
  if (typeof source.get === "function" && typeof source.ids === "function") return source;
  return { get: (id) => source[id] || null, ids: () => Object.keys(source) };
}

function patchFor(doc, variantName, id) {
  if (!variantName || variantName === "base") return null;
  const variant = doc.variants && doc.variants[variantName];
  return (variant && variant.patch && variant.patch[id]) || null;
}

export function variantRoot(doc, variantName) {
  const variants = doc.variants || {};
  const variant = variants[variantName] || variants.base;
  return (variant && variant.root) || null;
}

/* The user's wording for one string key, in one language. `"*"` is the
   explicit "same everywhere" bucket and only ever loses to an exact match on
   the active language. */
export function resolveText(doc, key, lang) {
  const text = (doc.overrides && doc.overrides.text) || {};
  if (lang && text[lang] && Object.prototype.hasOwnProperty.call(text[lang], key)) return text[lang][key];
  if (text["*"] && Object.prototype.hasOwnProperty.call(text["*"], key)) return text["*"][key];
  return null;
}

function labelFor(node, entry, doc, lang) {
  if (node.label != null) return node.label;
  if (!entry) return null;
  const override = resolveText(doc, entry.textKey || entry.id, lang);
  if (override != null) return override;
  return entry.title == null ? null : entry.title;
}

/* Walks the document from the variant's root. `seen` is belt and braces: a
   normalized document has no cycles, but resolve() also runs against documents
   mid-edit, and a render walk that does not terminate takes the tab with it. */
export function resolve(doc, options) {
  const opts = options || {};
  const registry = asRegistry(opts.registry);
  const variantName = opts.variant || "base";
  const lang = opts.lang || null;
  const edit = !!opts.edit;
  const root = variantRoot(doc, variantName);
  const seen = new Set();
  const tombstones = [];

  function walk(id) {
    if (seen.has(id)) return null;
    seen.add(id);

    const raw = doc.nodes ? doc.nodes[id] : null;
    if (!raw) {
      const stone = { id, type: "item", ref: null, entry: null, tombstone: "unknown-node",
                      label: null, icon: null, hidden: false, children: [] };
      tombstones.push(stone);
      return edit ? stone : null;
    }

    const patch = patchFor(doc, variantName, id);
    const node = withDefaults(patch ? Object.assign({}, raw, patch) : raw);
    const entry = node.ref ? registry.get(node.ref) : null;

    let tombstone = null;
    if (!isKnownType(node.type)) tombstone = "unknown-type";
    else if (node.type === "item" && !entry) tombstone = node.ref ? "no-entry" : "no-ref";
    if (tombstone) tombstones.push({ id, reason: tombstone, ref: node.ref || null });
    if (tombstone && !edit) return null;

    const out = {
      id,
      type: node.type,
      ref: node.ref || null,
      entry,
      tombstone,
      label: labelFor(node, entry, doc, lang),
      /* The user's own name for THIS node, or null. Distinct from `label`,
         which folds in the entry's shipped title and the app-wide text
         override — writing either of those back into the host's element would
         be at best a no-op and at worst a fight with the app. Only a rename
         the user typed against this one node belongs on its element. */
      customLabel: node.label == null ? null : String(node.label),
      icon: node.icon != null ? node.icon : entry ? entry.icon : null,
      customIcon: node.icon == null ? null : String(node.icon),
      hidden: !!node.hidden,
      collapsed: !!node.collapsed,
      slot: node.slot || null,
      orient: node.orient || null,
      flow: node.flow || null,
      size: node.size || null,
      rect: node.rect || null,
      tokens: node.tokens || null,
      /* Containers do not have registry entries, so a host may declare their
         resize/hide guardrails directly in its shipped layout document. */
      constraints: node.constraints || entry?.constraints
        ? { ...entry?.constraints, ...node.constraints } : null,
      escapes: !!(node.escapes || (entry && entry.escapes)),
      children: [],
    };

    if (isContainer(node.type) && Array.isArray(node.children)) {
      for (const child of node.children) {
        const resolved = walk(child);
        if (resolved) out.children.push(resolved);
      }
    }
    return out;
  }

  const tree = root ? walk(root) : null;
  return {
    tree,
    root,
    edit,
    variant: variantName,
    tombstones,
    tokens: scopeTokens(doc, variantName),
  };
}

/* Registry entries no placement uses — the palette's contents. Reads the whole
   `nodes` map rather than the resolved tree, so a placeable parked in a variant
   the user is not currently looking at still counts as used. */
export function unplaced(doc, registrySource) {
  const registry = asRegistry(registrySource);
  const used = new Set();
  for (const id of Object.keys(doc.nodes || {})) {
    const ref = doc.nodes[id] && doc.nodes[id].ref;
    if (ref) used.add(ref);
  }
  return registry.ids().filter((id) => !used.has(id)).map((id) => registry.get(id));
}
