/* A preset or saved presentation belongs to the screen on which it is used.
   Structure remains shared, as it does for manual edits; presentation and
   theme are isolated. Pin sibling presentations before replacing base. */
import { PATCHABLE, withDefaults } from "./schema.js";

export function scopeTokens(doc, scope = "base") {
  return (scope !== "base" && doc.variants?.[scope]?.tokens) || doc.overrides?.tokens || {};
}

export function presentation(doc, scope = "base") {
  const patch = scope !== "base" ? doc.variants?.[scope]?.patch || {} : {};
  const result = {};
  for (const [id, raw] of Object.entries(doc.nodes || {})) {
    const node = withDefaults({ ...raw, ...patch[id] });
    result[id] = Object.fromEntries(PATCHABLE.map(key => [key, node[key] ?? null]));
  }
  return result;
}

export function applyScopedLayout(current, source, scope = "base", sourceScope = "base") {
  if (scope === "base") {
    const next = JSON.parse(JSON.stringify(source));
    next.variants = { ...next.variants };
    next.overrides = { ...next.overrides, text: JSON.parse(JSON.stringify(current.overrides?.text || {})) };
    for (const name of Object.keys(current.variants || {})) {
      if (name === "base") continue;
      next.variants[name] = { ...current.variants[name], patch: presentation(current, name),
        tokens: { ...scopeTokens(current, name) } };
    }
    return next;
  }
  return { ...current, variants: { ...current.variants, [scope]: {
    ...current.variants?.[scope], root: current.variants?.[scope]?.root || current.variants?.base?.root || current.root || Object.keys(current.nodes || {})[0],
    patch: presentation(source, sourceScope), tokens: { ...scopeTokens(source, sourceScope) },
  } } };
}
