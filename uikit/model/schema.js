/* The layout document — the one thing uikit owns and the host persists.
 *
 * A document is a FLAT map of nodes plus a set of variants, each of which
 * selects a root and sparsely patches nodes for one breakpoint. Flat rather
 * than nested for three reasons: an id is addressable without a tree walk, an
 * op touches O(1) nodes instead of rewriting a spine, and a diff of two saved
 * documents is readable by a human.
 *
 * WHAT A MISSING FIELD MEANS. `label: null` and `icon: null` are not "blank",
 * they are "inherit from the registry". That one rule is what makes "reset
 * this node" a key delete, and what keeps a saved layout working when the app
 * renames a command in the next release: the user pinned the POSITION, not the
 * wording. A string is an override and only ever comes from the user.
 *
 * WHY NOTHING IS REBUILT FROM A WHITELIST. Every function here copies the node
 * it was handed and fills in what is missing. A key this build has never heard
 * of survives the round trip, so a document authored by a newer version loads,
 * saves and reloads through an older one without losing the fields the older
 * one cannot show. Same invariant as the FeatureManager tree: unknown is not
 * the same as invalid, and only the schema that wrote a field may drop it.
 *
 * FLOAT IS NOT position:fixed. A floating panel is a node in the `overlay`
 * slot with an absolute rect measured against that slot. Fixed positioning
 * would escape the host's stacking and scroll contexts, which in a host like
 * 3dhome means floating over a modal it should sit under. The overlay slot is
 * one element the host places once, and the host's z-index rules keep working.
 */

export const DOC_VERSION = 1;

/* A container holds children. A leaf never does — asking for its children is
   a bug in the caller, not an empty list. */
export const CONTAINER_TYPES = Object.freeze(["dock", "bar", "group", "stack", "float"]);
export const LEAF_TYPES = Object.freeze(["item", "separator"]);

const CONTAINERS = new Set(CONTAINER_TYPES);
const LEAVES = new Set(LEAF_TYPES);

export function isContainer(type) {
  return CONTAINERS.has(type);
}
export function isLeaf(type) {
  return LEAVES.has(type);
}
export function isKnownType(type) {
  return CONTAINERS.has(type) || LEAVES.has(type);
}

/* Fields a variant may patch. Everything here is PRESENTATIONAL: it changes
   how a node looks or where it sits, never what the tree is made of.
   Structure — parentage and child order — is deliberately absent, and ops.js
   refuses a structural edit outside `base`. One tree, many presentations, is a
   thing a person can reason about; a different tree per breakpoint is four
   layouts to keep in sync by hand, which is the situation this module exists
   to end. */
export const PATCHABLE = Object.freeze([
  "hidden", "size", "rect", "slot", "label", "icon", "collapsed", "orient", "flow", "tokens",
]);

const PATCHABLE_SET = new Set(PATCHABLE);
export function isPatchable(field) {
  return PATCHABLE_SET.has(field);
}

/* Presentational defaults, applied only where the node is silent. `null` is a
   real value here and means "inherit"; it is never a stand-in for "missing". */
const COMMON_DEFAULTS = Object.freeze({
  label: null,
  icon: null,
  hidden: false,
  size: null,
  tokens: null,
});

/* Anything that holds children can be collapsed and can be given a slot — a
   sidebar folding away is the same gesture as a toolbar group folding away,
   and a user who can do it to one will try it on the other. Keeping these here
   rather than on `group` alone is also what makes "set collapsed to false on a
   bar" a no-op instead of a write of a field the type never declared. */
const CONTAINER_DEFAULTS = Object.freeze({
  children: [],
  collapsed: false,
  slot: null,
});

const TYPE_DEFAULTS = Object.freeze({
  dock: {},
  bar: { orient: "row" },
  group: { orient: "row" },
  stack: { orient: "col", flow: "col" },
  float: { slot: "overlay", rect: null },
  item: { ref: null },
  separator: {},
});

export function defaultsFor(type) {
  const out = Object.assign({}, COMMON_DEFAULTS);
  if (isContainer(type)) Object.assign(out, CONTAINER_DEFAULTS);
  return Object.assign(out, TYPE_DEFAULTS[type] || {});
}

/* Fill in what a node does not say, keep everything it does — including keys
   this build does not understand. */
export function withDefaults(node) {
  if (!node || typeof node !== "object") return null;
  const filled = Object.assign({}, defaultsFor(node.type), node);
  if (isContainer(node.type) && !Array.isArray(filled.children)) filled.children = [];
  return filled;
}

export function makeNode(type, props) {
  return withDefaults(Object.assign({ type }, props || {}));
}

export function emptyDoc(rootId) {
  const root = rootId || "n:root";
  return {
    v: DOC_VERSION,
    variants: { base: { root, patch: {} } },
    nodes: { [root]: makeNode("dock", {}) },
    overrides: { text: {}, tokens: {} },
  };
}

/* ---- versioning --------------------------------------------------------- */

/* A document with no `v` is version 0: something a prototype wrote before the
   field existed. It is a real shape, not a corrupt one, so it migrates rather
   than being rejected — the ladder has to be exercised by something from the
   first release or it will be wrong the first time it is needed. */
export function docVersion(doc) {
  const v = doc && doc.v;
  return Number.isInteger(v) && v >= 0 ? v : 0;
}

const MIGRATIONS = {
  // 0 -> 1: `nodes` was the whole document and the root was implicit.
  0(doc) {
    const nodes = doc && doc.nodes && typeof doc.nodes === "object" ? doc.nodes : {};
    const root = (doc && doc.root) || Object.keys(nodes)[0] || "n:root";
    const out = Object.assign({}, doc, {
      v: 1,
      nodes,
      variants: doc && doc.variants ? doc.variants : { base: { root, patch: {} } },
      overrides: doc && doc.overrides ? doc.overrides : { text: {}, tokens: {} },
    });
    delete out.root;
    return out;
  },
};

export function needsMigration(doc) {
  return docVersion(doc) < DOC_VERSION;
}

/* Walks the ladder one step at a time. A document from a FUTURE version is
   returned untouched: this build cannot know what changed, and guessing would
   destroy the very fields the newer build is relying on. Callers that care can
   compare docVersion() against DOC_VERSION and refuse to save. */
export function migrate(doc) {
  let out = doc;
  let v = docVersion(out);
  while (v < DOC_VERSION) {
    const step = MIGRATIONS[v];
    if (!step) break;
    out = step(out);
    const next = docVersion(out);
    if (next <= v) break; // a migration that does not advance would spin
    v = next;
  }
  return out;
}
