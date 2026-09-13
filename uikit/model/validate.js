/* Guarding a document that came from disk, another build, or a bad drag.
 *
 * THE RULE THIS FILE EXISTS TO ENFORCE: repair only what is structurally
 * IMPOSSIBLE, and preserve everything else. A node of a type this build has
 * never heard of is kept. A key this build does not read is kept. A child id
 * pointing at a node that is not in the document is kept, because a dangling
 * reference is information — resolve() turns it into a tombstone the user can
 * see and decide about, and silently deleting it is how a layout quietly loses
 * the panel someone spent ten minutes placing.
 *
 * What genuinely cannot be rendered, and so is repaired: a node that is its
 * own child, a node claimed by two parents, and a cycle. Each of those makes
 * the render walk non-terminating or ambiguous; nothing else here does.
 *
 * Nothing throws. This function's inputs are user data and other people's
 * files, and a validator that throws on those just moves the crash.
 *
 * Repairs are deterministic for a given document: the parent scan runs in
 * `nodes` key order, which is insertion order, so "the first container to
 * claim a child keeps it" always names the same container.
 */

import { DOC_VERSION, docVersion, emptyDoc, isContainer, isLeaf, isKnownType, migrate } from "./schema.js";

function problem(list, code, id, detail) {
  list.push(detail === undefined ? { code, id } : { code, id, detail });
}

function detach(nodes, parentId, childId) {
  const parent = nodes[parentId];
  if (!parent || !Array.isArray(parent.children)) return;
  const at = parent.children.indexOf(childId);
  if (at >= 0) parent.children.splice(at, 1);
}

/* One parent per node. A second claim is dropped from the later container
   rather than the earlier one, so the document reads the way it was written. */
function buildParents(nodes, problems) {
  const parent = new Map();
  for (const id of Object.keys(nodes)) {
    const node = nodes[id];
    if (!node || !isContainer(node.type)) continue;
    if (!Array.isArray(node.children)) {
      if (node.children !== undefined) problem(problems, "bad-children", id);
      node.children = [];
      continue;
    }
    const kept = [];
    for (const child of node.children) {
      if (typeof child !== "string" || !child) {
        problem(problems, "bad-child-id", id);
        continue;
      }
      if (child === id) {
        problem(problems, "self-child", id);
        continue;
      }
      if (parent.has(child)) {
        problem(problems, "duplicate-parent", child, "kept under " + parent.get(child));
        continue;
      }
      parent.set(child, id);
      kept.push(child);
    }
    node.children = kept;
  }
  return parent;
}

/* A cycle is a set of nodes whose walk upwards never reaches a root. One edge
   is cut to open it — the lowest id in the loop, so the choice is stable
   across runs and across machines rather than depending on where the walk
   happened to start. */
function breakCycles(nodes, parent, problems) {
  const state = new Map(); // id -> 0 while on the current path, 1 when settled
  for (const id of Object.keys(nodes)) {
    const path = [];
    let cursor = id;
    while (cursor != null && !state.has(cursor)) {
      state.set(cursor, 0);
      path.push(cursor);
      cursor = parent.get(cursor) || null;
    }
    if (cursor != null && state.get(cursor) === 0) {
      const loop = path.slice(path.indexOf(cursor));
      const victim = loop.slice().sort()[0];
      const held = parent.get(victim);
      detach(nodes, held, victim);
      parent.delete(victim);
      problem(problems, "cycle", victim, loop.join(" -> "));
    }
    for (const seen of path) state.set(seen, 1);
  }
}

function normalizeVariants(doc, problems) {
  const variants = doc.variants && typeof doc.variants === "object" && !Array.isArray(doc.variants) ? doc.variants : {};
  const names = Object.keys(variants);
  if (!variants.base || typeof variants.base !== "object" || Array.isArray(variants.base)) {
    /* Every variant is an overlay on base, so a document without one has no
       floor to fall through to. Promote the first variant rather than invent
       an empty root that would render nothing. */
    const donor = names.length ? variants[names[0]] : null;
    variants.base = {
      root: (donor && donor.root) || Object.keys(doc.nodes)[0] || "n:root",
      patch: {},
    };
    problem(problems, "missing-base-variant", null, names[0] || "none");
  }
  for (const name of Object.keys(variants)) {
    const variant = variants[name];
    if (!variant || typeof variant !== "object" || Array.isArray(variant)) {
      variants[name] = { root: variants.base.root, patch: {} };
      problem(problems, "bad-variant", name);
      continue;
    }
    if (!variant.patch || typeof variant.patch !== "object" || Array.isArray(variant.patch)) variant.patch = {};
    if (typeof variant.root !== "string" || !variant.root) variant.root = variants.base.root;
  }
  doc.variants = variants;
  return doc;
}

/* Structural repair, plus a report. The returned document is a fresh deep copy:
   callers hand us other people's objects and must not see them mutated. */
export function normalizeDoc(raw) {
  const problems = [];
  if (!raw || typeof raw !== "object") {
    problem(problems, "no-document", null);
    return { doc: emptyDoc(), problems };
  }

  let doc;
  try {
    doc = JSON.parse(JSON.stringify(raw));
  } catch (_) {
    problem(problems, "not-serializable", null);
    return { doc: emptyDoc(), problems };
  }

  const version = docVersion(doc);
  if (version > DOC_VERSION) {
    /* From the future. Repair the structure so it renders, but say so: the
       caller decides whether saving it back is safe, because this build would
       write it as if the fields it cannot see were never there. */
    problem(problems, "future-version", null, version + " > " + DOC_VERSION);
  } else if (version < DOC_VERSION) {
    doc = migrate(doc);
  }

  if (!doc.nodes || typeof doc.nodes !== "object" || Array.isArray(doc.nodes)) {
    problem(problems, "bad-nodes", null);
    doc.nodes = {};
  }
  if (!doc.overrides || typeof doc.overrides !== "object") doc.overrides = {};
  if (!doc.overrides.text || typeof doc.overrides.text !== "object") doc.overrides.text = {};
  if (!doc.overrides.tokens || typeof doc.overrides.tokens !== "object") doc.overrides.tokens = {};

  for (const id of Object.keys(doc.nodes)) {
    const node = doc.nodes[id];
    if (!node || typeof node !== "object" || Array.isArray(node)) {
      problem(problems, "bad-node", id);
      delete doc.nodes[id];
      continue;
    }
    if (typeof node.type !== "string" || !node.type) {
      problem(problems, "typeless-node", id);
      node.type = "item";
      continue;
    }
    /* Kept, not corrected. resolve() renders it as a tombstone; a future build
       that knows the type reads its own document back intact. */
    if (!isKnownType(node.type)) problem(problems, "unknown-type", id, node.type);
    /* `children` on a leaf is a mistake, but it is the caller's data and the
       render path never reads it, so it is reported and left alone. */
    if (isLeaf(node.type) && Array.isArray(node.children) && node.children.length) {
      problem(problems, "leaf-with-children", id);
    }
  }

  const parents = buildParents(doc.nodes, problems);
  breakCycles(doc.nodes, parents, problems);
  normalizeVariants(doc, problems);

  for (const name of Object.keys(doc.variants)) {
    const root = doc.variants[name].root;
    if (!doc.nodes[root]) problem(problems, "dangling-root", root, "variant " + name);
  }
  for (const id of Object.keys(doc.nodes)) {
    const node = doc.nodes[id];
    if (!isContainer(node.type) || !Array.isArray(node.children)) continue;
    for (const child of node.children) {
      if (!doc.nodes[child]) problem(problems, "dangling-child", child, "under " + id);
    }
  }

  return { doc, problems };
}

/* The parent index the editor needs constantly. Built from a normalized
   document, so every node has at most one parent by construction. */
export function parentIndex(doc) {
  const parent = new Map();
  if (!doc || !doc.nodes || typeof doc.nodes !== "object" || Array.isArray(doc.nodes)) return parent;
  for (const id of Object.keys(doc.nodes)) {
    const node = doc.nodes[id];
    if (!node || !isContainer(node.type) || !Array.isArray(node.children)) continue;
    for (const child of node.children) if (!parent.has(child)) parent.set(child, id);
  }
  return parent;
}
