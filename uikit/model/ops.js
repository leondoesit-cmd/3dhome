/* Every edit the user can make, as a pure function of the document.
 *
 * (doc, args) -> doc. No DOM, no registry, no clock, no storage. That is what
 * lets the whole edit surface be tested without a browser, and what lets undo
 * be a snapshot of the argument rather than a hand-written inverse for each op.
 *
 * AN OP THAT CHANGES NOTHING RETURNS THE SAME OBJECT. Callers rely on this:
 * `if (next === doc) return;` is how a drag that ends where it started avoids
 * pushing a history step, and how the renderer skips a patch. It means every
 * op has to check before it copies, which is a small price for not filling the
 * undo tree with steps that do nothing.
 *
 * STRUCTURE IS SHARED BY EVERY VARIANT; PRESENTATION IS NOT. A variant may
 * patch how a node looks and where it sits (schema.PATCHABLE) but never what
 * the tree is made of, and the structural ops here refuse to run outside
 * `base`. One tree with four presentations is something a person can hold in
 * their head; four trees is four layouts to keep in sync by hand, which is the
 * problem this module exists to end.
 */

import { PATCHABLE, defaultsFor, emptyDoc, isContainer, isPatchable, makeNode } from "./schema.js";
import { parentIndex } from "./validate.js";

const BASE = "base";

function structuralGuard(variant, op) {
  if (variant && variant !== BASE) {
    throw new Error(
      "uikit: " + op + " is structural and may only be applied to the base variant (got " +
        variant + "). Move the node in base; use a variant patch for slot, size or visibility."
    );
  }
}

function cloneNodes(doc) {
  return Object.assign({}, doc.nodes);
}

/* Replace one node. `mutate` receives a shallow copy and either returns a node
   or mutates the copy; returning the copy unchanged still produces a new doc,
   so callers decide "did anything change" before calling in. */
function withNode(doc, id, mutate) {
  const current = doc.nodes[id];
  if (!current) return doc;
  const next = Object.assign({}, current);
  const result = mutate(next) || next;
  const nodes = cloneNodes(doc);
  nodes[id] = result;
  return Object.assign({}, doc, { nodes });
}

function variantOf(doc, name) {
  return (doc.variants && doc.variants[name]) || null;
}

/* Read a presentational field the way the renderer will: the variant's patch
   first, then the node, then the type's default.
 *
 * The default step is what makes the no-op contract true. A node that has
 * never been hidden has no `hidden` key at all, and comparing that `undefined`
 * against the `false` the caller passed would report a change on every pass —
 * filling the undo tree with steps that alter nothing and repainting the DOM
 * for them. What the renderer sees is the default, so that is what a write has
 * to be measured against. */
export function readField(doc, id, field, variant) {
  const name = variant || BASE;
  if (name !== BASE) {
    const v = variantOf(doc, name);
    const patch = v && v.patch && v.patch[id];
    if (patch && Object.prototype.hasOwnProperty.call(patch, field)) return patch[field];
  }
  const node = doc.nodes[id];
  if (!node) return undefined;
  if (Object.prototype.hasOwnProperty.call(node, field)) return node[field];
  return defaultsFor(node.type)[field];
}

/* Write a presentational field into the node (base) or into the variant's
   sparse patch (anything else). A patch entry only ever holds the fields the
   user actually changed at that breakpoint; everything else falls through. */
function setField(doc, id, field, value, variant) {
  if (!doc.nodes[id]) return doc;
  if (!isPatchable(field)) throw new Error("uikit: " + field + " is not a patchable field");
  const name = variant || BASE;
  if (readField(doc, id, field, name) === value) return doc;

  if (name === BASE) return withNode(doc, id, (node) => { node[field] = value; });

  const v = variantOf(doc, name);
  if (!v) throw new Error("uikit: no such variant: " + name);
  const patch = Object.assign({}, v.patch || {});
  patch[id] = Object.assign({}, patch[id], { [field]: value });
  const variants = Object.assign({}, doc.variants, { [name]: Object.assign({}, v, { patch }) });
  return Object.assign({}, doc, { variants });
}

function childrenOf(doc, id) {
  const node = doc.nodes[id];
  return node && Array.isArray(node.children) ? node.children : [];
}

function clampIndex(index, length) {
  if (!Number.isFinite(index) || index < 0) return length;
  return Math.min(Math.floor(index), length);
}

/* ---- structure ----------------------------------------------------------- */

/* Put `id` under `parent` at `index`. The index is read AFTER the node has
   left its old parent, which is the only reading that makes a within-parent
   drag behave the way the drop indicator promised. */
export function move(doc, args) {
  const { id, parent, index, variant } = args || {};
  structuralGuard(variant, "move");
  const node = doc.nodes[id];
  const target = doc.nodes[parent];
  if (!node || !target || !isContainer(target.type)) return doc;
  if (id === parent) return doc;

  // Refuse to drop a container inside its own subtree; that is the one drag
  // that would detach the whole branch from the root.
  const parents = parentIndex(doc);
  for (let up = parent; up != null; up = parents.get(up)) {
    if (up === id) return doc;
  }

  const from = parents.get(id) || null;
  const was = from ? childrenOf(doc, from).indexOf(id) : -1;
  const nodes = cloneNodes(doc);
  if (from) {
    const kids = childrenOf(doc, from).slice();
    if (was >= 0) kids.splice(was, 1);
    nodes[from] = Object.assign({}, nodes[from], { children: kids });
  }
  const targetKids = (from === parent ? nodes[parent].children : childrenOf(doc, parent)).slice();
  const to = clampIndex(index, targetKids.length);
  /* Within one parent the node is already gone from the list, so "did this
     move" is the old index against the new one — not a lookup that can only
     ever return -1. */
  if (from === parent && was === to) return doc;
  targetKids.splice(to, 0, id);
  nodes[parent] = Object.assign({}, nodes[parent], { children: targetKids });
  return Object.assign({}, doc, { nodes });
}

export function reorder(doc, args) {
  const { id, index, variant } = args || {};
  structuralGuard(variant, "reorder");
  const parent = parentIndex(doc).get(id);
  if (!parent) return doc;
  return move(doc, { id, parent, index, variant });
}

/* Insert a node the document has never seen — the palette dropping an unused
   placeable onto a bar. An id that already exists is a caller bug, not a
   merge: it would silently rewrite whatever is there. */
export function insert(doc, args) {
  const { id, node, parent, index, variant } = args || {};
  structuralGuard(variant, "insert");
  if (!id || doc.nodes[id]) return doc;
  const target = doc.nodes[parent];
  if (!target || !isContainer(target.type)) return doc;
  const nodes = cloneNodes(doc);
  nodes[id] = node && node.type ? node : makeNode("item", { ref: id });
  const kids = childrenOf(doc, parent).slice();
  kids.splice(clampIndex(index, kids.length), 0, id);
  nodes[parent] = Object.assign({}, nodes[parent], { children: kids });
  return Object.assign({}, doc, { nodes });
}

/* Wrap siblings in a new container. Only siblings: a group spanning two
   parents has no single place to live, and picking one for the user silently
   moves nodes they did not ask to move. The group lands where the first
   selected child was, so the toolbar does not visibly reshuffle. */
export function group(doc, args) {
  const { ids, id, label, type, variant, ref, constraints, orient } = args || {};
  structuralGuard(variant, "group");
  const members = Array.isArray(ids) ? ids.filter((m) => doc.nodes[m]) : [];
  if (members.length < 2 || !id || doc.nodes[id]) return doc;

  const parents = parentIndex(doc);
  const parent = parents.get(members[0]);
  if (!parent) return doc;
  for (const member of members) if (parents.get(member) !== parent) return doc;

  const kids = childrenOf(doc, parent).slice();
  const order = members.slice().sort((a, b) => kids.indexOf(a) - kids.indexOf(b));
  const at = kids.indexOf(order[0]);
  const remaining = kids.filter((kid) => members.indexOf(kid) < 0);
  const insertAt = Math.min(at, remaining.length);

  const nodes = cloneNodes(doc);
  const props = { label: label == null ? null : label, children: order };
  if (ref) props.ref = ref;
  if (constraints) props.constraints = constraints;
  if (orient) props.orient = orient;
  nodes[id] = makeNode(type || "group", props);
  remaining.splice(insertAt, 0, id);
  nodes[parent] = Object.assign({}, nodes[parent], { children: remaining });
  return Object.assign({}, doc, { nodes });
}

/* Dissolve a container, splicing its children back in its place so nothing
   jumps. The container itself is the one node this module deletes: the user
   just asked for it to stop existing, and undo restores it whole. */
export function ungroup(doc, args) {
  const { id, variant } = args || {};
  structuralGuard(variant, "ungroup");
  const node = doc.nodes[id];
  if (!node || !isContainer(node.type)) return doc;
  const parent = parentIndex(doc).get(id);
  if (!parent) return doc;

  const kids = childrenOf(doc, parent).slice();
  const at = kids.indexOf(id);
  if (at < 0) return doc;
  kids.splice(at, 1, ...childrenOf(doc, id));

  const nodes = cloneNodes(doc);
  nodes[parent] = Object.assign({}, nodes[parent], { children: kids });
  delete nodes[id];

  /* A variant patch for a node that no longer exists would be resurrected by
     an undo of something unrelated. Drop the patches with the node. */
  let variants = doc.variants;
  for (const name of Object.keys(variants)) {
    const v = variants[name];
    if (!v.patch || !v.patch[id]) continue;
    const patch = Object.assign({}, v.patch);
    delete patch[id];
    if (variants === doc.variants) variants = Object.assign({}, doc.variants);
    variants[name] = Object.assign({}, v, { patch });
  }
  return Object.assign({}, doc, { nodes, variants });
}

/* ---- presentation -------------------------------------------------------- */

export function clampSize(size, min, max) {
  if (!size) return size;
  const out = {};
  for (const axis of ["w", "h"]) {
    if (size[axis] == null) continue;
    let value = Number(size[axis]);
    if (!Number.isFinite(value)) continue;
    const lo = min && min[axis] != null ? Number(min[axis]) : null;
    const hi = max && max[axis] != null ? Number(max[axis]) : null;
    if (lo != null && value < lo) value = lo;
    if (hi != null && value > hi) value = hi;
    out[axis] = value;
  }
  return Object.keys(out).length ? out : null;
}

/* `min`/`max` come from the registry entry's constraints, passed in by the
   caller: ops never reads the registry, so a panel's floor travels with the
   call rather than being re-derived here. */
export function resize(doc, args) {
  const { id, size, min, max, variant } = args || {};
  const clamped = clampSize(size, min, max);
  const current = readField(doc, id, "size", variant);
  if (sameSize(current, clamped)) return doc;
  return setField(doc, id, "size", clamped, variant);
}

function sameSize(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.w === b.w && a.h === b.h;
}

export function setRect(doc, args) {
  const { id, rect, variant } = args || {};
  const current = readField(doc, id, "rect", variant);
  if (current && rect && current.x === rect.x && current.y === rect.y &&
      current.w === rect.w && current.h === rect.h) return doc;
  return setField(doc, id, "rect", rect || null, variant);
}

export function hide(doc, args) {
  const { id, hidden, variant } = args || {};
  return setField(doc, id, "hidden", !!hidden, variant);
}

/* `null` restores the registry's own wording. That is the difference between
   "the user cleared this label" and "the user never touched it", and it is why
   an empty string is stored as an empty string rather than folded to null. */
export function retitle(doc, args) {
  const { id, label, variant } = args || {};
  return setField(doc, id, "label", label == null ? null : String(label), variant);
}

export function reicon(doc, args) {
  const { id, icon, variant } = args || {};
  return setField(doc, id, "icon", icon == null ? null : String(icon), variant);
}

export function setSlot(doc, args) {
  const { id, slot, variant } = args || {};
  return setField(doc, id, "slot", slot == null ? null : String(slot), variant);
}

export function collapse(doc, args) {
  const { id, collapsed, variant } = args || {};
  return setField(doc, id, "collapsed", !!collapsed, variant);
}

export function setOrient(doc, args) {
  const { id, orient, variant } = args || {};
  return setField(doc, id, "orient", orient, variant);
}

/* How a container's children TILE against each other, as distinct from the
   orientation of what is inside each of them. The plan dock is what needs both
   at once: a zone can lay its panels out side by side while each panel's own
   contents run as a column. */
export function setFlow(doc, args) {
  const { id, flow, variant } = args || {};
  return setField(doc, id, "flow", flow, variant);
}

/* A token is a CSS custom property this module is allowed to write. `id: null`
   sets it document-wide. Values are stored verbatim and are the caller's
   business to validate — runtime/tokens.js is the only place that decides what
   is safe to hand to the DOM. */
export function setToken(doc, args) {
  const { id, name, value, variant } = args || {};
  if (!name) return doc;
  if (id) {
    const tokens = readField(doc, id, "tokens", variant) || null;
    if (tokens && tokens[name] === value) return doc;
    const next = Object.assign({}, tokens);
    if (value == null) delete next[name];
    else next[name] = value;
    return setField(doc, id, "tokens", Object.keys(next).length ? next : null, variant);
  }
  if (variant && variant !== "base") {
    const screen = doc.variants[variant];
    if (!screen) return doc;
    const tokens = { ...(screen.tokens || doc.overrides.tokens || {}) };
    if (value == null) delete tokens[name];
    else tokens[name] = value;
    return { ...doc, variants: { ...doc.variants, [variant]: { ...screen, tokens } } };
  }
  const current = doc.overrides.tokens || {};
  if (current[name] === value) return doc;
  const tokens = Object.assign({}, current);
  if (value == null) delete tokens[name];
  else tokens[name] = value;
  return Object.assign({}, doc, {
    overrides: Object.assign({}, doc.overrides, { tokens }),
  });
}

/* Text overrides are keyed by LANGUAGE first. A host that renames a button
   while the UI is in Hebrew must not blank the English string it never showed
   the user; `"*"` is the explicit "same wording everywhere" bucket. */
export function setText(doc, args) {
  const { key, lang, value } = args || {};
  if (!key) return doc;
  const bucket = lang || "*";
  const text = doc.overrides.text || {};
  const current = text[bucket] || {};
  if (current[key] === value) return doc;
  if (value == null && !Object.prototype.hasOwnProperty.call(current, key)) return doc;
  const nextBucket = Object.assign({}, current);
  if (value == null) delete nextBucket[key];
  else nextBucket[key] = String(value);
  const nextText = Object.assign({}, text);
  if (Object.keys(nextBucket).length) nextText[bucket] = nextBucket;
  else delete nextText[bucket];
  return Object.assign({}, doc, {
    overrides: Object.assign({}, doc.overrides, { text: nextText }),
  });
}

/* ---- reset --------------------------------------------------------------- */

/* Reset is a key DELETE, not a write of the default value. Deleting restores
   "inherit from the registry"; writing today's default would freeze it, and
   the node would stop following the app the next time the app changed. */
/* One parameter, put back the way it shipped.
 *
 * resetNode below clears everything a node carries at once, which is the right
 * thing for "start this item over" and the wrong thing for "I only meant to
 * undo the colour". An item has several independent edits on it and undoing
 * one should not undo the rest, so this is resetNode narrowed to a single key
 * — same two cases, base and variant patch, same emptied-patch cleanup. */
export function resetField(doc, args) {
  const { id, field, variant } = args || {};
  if (!isPatchable(field)) throw new Error("uikit: " + field + " is not a patchable field");
  const name = variant || BASE;
  if (name !== BASE) {
    const v = variantOf(doc, name);
    const entry = v && v.patch && v.patch[id];
    if (!entry || !Object.prototype.hasOwnProperty.call(entry, field)) return doc;
    const next = Object.assign({}, entry);
    delete next[field];
    const patch = Object.assign({}, v.patch);
    if (Object.keys(next).length) patch[id] = next;
    else delete patch[id];
    const variants = Object.assign({}, doc.variants, { [name]: Object.assign({}, v, { patch }) });
    return Object.assign({}, doc, { variants });
  }
  const node = doc.nodes[id];
  if (!node || !Object.prototype.hasOwnProperty.call(node, field)) return doc;
  return withNode(doc, id, (next) => { delete next[field]; });
}

/* Where the item started, which is not a field and cannot be cleared like one:
   a node's place is its parent's child list, so putting it back means finding
   that parent in the shipped layout and moving it there. Structural, so base
   only — move() enforces that itself rather than trusting this to remember. */
export function resetPosition(doc, args) {
  const { id, defaults, variant } = args || {};
  if (!defaults || !defaults.nodes || !doc.nodes[id]) return doc;
  let parent = null;
  let index = -1;
  for (const key of Object.keys(defaults.nodes)) {
    const kids = defaults.nodes[key] && defaults.nodes[key].children;
    if (!Array.isArray(kids)) continue;
    const at = kids.indexOf(id);
    if (at >= 0) { parent = key; index = at; break; }
  }
  if (parent == null || !doc.nodes[parent]) return doc;
  return move(doc, { id, parent, index, variant });
}

/* One string's wording, in one language, back to what the app ships. Keyed by
   i18n key rather than by node, because that is the reach the edit had: this
   is the undo for "rename app text in this language", and it is deliberately a
   separate control from the per-node reset above. */
export function resetText(doc, args) {
  const { key, lang } = args || {};
  const text = (doc.overrides && doc.overrides.text) || null;
  if (!key || !text) return doc;
  const bucket = lang || "*";
  if (!text[bucket] || !Object.prototype.hasOwnProperty.call(text[bucket], key)) return doc;
  const next = Object.assign({}, text[bucket]);
  delete next[key];
  const all = Object.assign({}, text);
  if (Object.keys(next).length) all[bucket] = next;
  else delete all[bucket];
  return Object.assign({}, doc, {
    overrides: Object.assign({}, doc.overrides, { text: all }),
  });
}

export function resetNode(doc, args) {
  const { id, variant } = args || {};
  const name = variant || BASE;
  if (name !== BASE) {
    const v = variantOf(doc, name);
    if (!v || !v.patch || !v.patch[id]) return doc;
    const patch = Object.assign({}, v.patch);
    delete patch[id];
    const variants = Object.assign({}, doc.variants, { [name]: Object.assign({}, v, { patch }) });
    return Object.assign({}, doc, { variants });
  }
  const node = doc.nodes[id];
  if (!node) return doc;
  const touched = PATCHABLE.filter((field) => Object.prototype.hasOwnProperty.call(node, field));
  if (!touched.length) return doc;
  return withNode(doc, id, (next) => {
    for (const field of touched) delete next[field];
  });
}

/* Drop every presentation override for one responsive variant while leaving
   the shared/base layout alone. Base is the document itself rather than a
   sparse patch, so resetting it is intentionally a different, explicit
   operation (`resetAll`). */
export function resetVariant(doc, args) {
  const name = (args && args.variant) || BASE;
  if (name === BASE) return doc;
  const variant = variantOf(doc, name);
  if (!variant || (!Object.keys(variant.patch || {}).length && !variant.tokens)) return doc;
  const variants = Object.assign({}, doc.variants, {
    [name]: Object.assign({}, variant, { patch: {}, tokens: null }),
  });
  return Object.assign({}, doc, { variants });
}

/* `defaults` is the layout the host shipped. Without one this returns an empty
   document rather than guessing, because "reset" that invents a layout nobody
   designed is worse than an obviously blank one. */
export function resetAll(doc, args) {
  const defaults = args && args.defaults;
  if (!defaults) return emptyDoc(doc && doc.variants && doc.variants.base && doc.variants.base.root);
  return JSON.parse(JSON.stringify(defaults));
}
