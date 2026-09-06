/* Undo/redo for the layout document.
 *
 * This is a TREE, not a pair of stacks, matching the editor history the rest
 * of this codebase already uses: every state the document has been in is a
 * node, and a node's parent is the state it was edited from.
 *
 *      s0 ──┬── s1(move) ── s2(group) ──┬── s3(rename)
 *           │                           └── s4(resize)   <- marker
 *           └── s5(hide)
 *
 * Undo walks to the parent, redo walks back to the child you came FROM (not
 * merely the newest one), and jump() goes anywhere directly. Editing after an
 * undo FORKS instead of destroying: the steps you rolled past stay on their
 * own branch. That is the whole point of a tree, and the one thing a linear
 * timeline can never offer.
 *
 * A snapshot here is the document OBJECT, not a serialized string. The editors
 * in js/ have to serialize because their models are live mutable graphs; ops.js
 * is pure and never mutates a document it was given, so every state is already
 * an immutable value that can be held by reference. No stringify on every
 * keystroke, no interning pool, and `next === current` stays a valid identity
 * test all the way through the history.
 *
 * The caller pushes states, not inverses. There is no undo() implementation
 * per op and so no op can get its inverse subtly wrong.
 */

const DEFAULT_CAP = 80;

export function createHistory(opts) {
  const options = opts || {};
  const cap = options.cap || DEFAULT_CAP;
  const onChange = typeof options.onChange === "function" ? options.onChange : null;

  let seq = 0;
  const nodes = new Map();
  let marker = null;

  function makeStep(parent, label, tag, doc) {
    const step = {
      id: "h" + ++seq,
      at: seq,
      parent: parent ? parent.id : null,
      children: [],
      label: label || "",
      tag: tag || null,
      doc,
      redo: null, // the child undo last came from
    };
    nodes.set(step.id, step);
    if (parent) parent.children.push(step.id);
    return step;
  }

  function current() {
    return marker ? nodes.get(marker) : null;
  }

  function fire() {
    if (onChange) onChange(api);
  }

  function ancestors(id) {
    const seen = new Set();
    for (let cursor = id; cursor != null; ) {
      seen.add(cursor);
      const node = nodes.get(cursor);
      cursor = node ? node.parent : null;
    }
    return seen;
  }

  /* Over the cap, the oldest node that is neither the marker nor one of its
     ancestors loses its whole subtree — an abandoned branch goes before any
     part of the path you are standing on. When every remaining node IS on that
     path there is nothing safe to drop, so the history is allowed to exceed
     the cap rather than cut the ground out from under the current state. */
  function prune() {
    while (nodes.size > cap) {
      const keep = ancestors(marker);
      let victim = null;
      for (const node of nodes.values()) {
        if (keep.has(node.id)) continue;
        if (!victim || node.at < victim.at) victim = node;
      }
      if (!victim) return;
      const parent = victim.parent ? nodes.get(victim.parent) : null;
      if (parent) {
        const at = parent.children.indexOf(victim.id);
        if (at >= 0) parent.children.splice(at, 1);
        if (parent.redo === victim.id) parent.redo = null;
      }
      const stack = [victim.id];
      while (stack.length) {
        const id = stack.pop();
        const node = nodes.get(id);
        if (!node) continue;
        for (const child of node.children) stack.push(child);
        nodes.delete(id);
      }
    }
  }

  const api = {
    /* The document as of the marker. Always a value the caller may hold. */
    get doc() {
      const node = current();
      return node ? node.doc : null;
    },

    get id() {
      return marker;
    },

    /* Start (or restart) the history at a known document. */
    reset(doc, label) {
      nodes.clear();
      seq = 0;
      marker = makeStep(null, label || "", null, doc).id;
      fire();
      return api;
    },

    /* Record a state the caller already computed.
     *
     * `next === api.doc` is a no-op by design: ops.js returns the same object
     * when an edit changed nothing, so a drag that ends where it started, or a
     * rename to the same string, never lands in the tree.
     *
     * `tag` coalesces. Consecutive applies carrying the same tag fold into the
     * step already open, so dragging a resize handle is one undo step and not
     * sixty. End the gesture by passing a fresh tag, or none. */
    apply(label, next, tag) {
      const node = current();
      if (!node) return api.reset(next, label);
      if (next === node.doc) return api;
      if (tag && node.tag === tag && node.parent != null) {
        node.doc = next;
        if (label) node.label = label;
        fire();
        return api;
      }
      marker = makeStep(node, label, tag, next).id;
      prune();
      fire();
      return api;
    },

    canUndo() {
      const node = current();
      return !!(node && node.parent != null);
    },

    canRedo() {
      const node = current();
      if (!node) return false;
      return !!(node.redo && nodes.has(node.redo)) || node.children.length > 0;
    },

    undo() {
      const node = current();
      if (!node || node.parent == null) return null;
      const parent = nodes.get(node.parent);
      parent.redo = node.id; // remember the branch we came from
      marker = parent.id;
      fire();
      return parent.doc;
    },

    /* Back down the branch we last undid through; failing that, the newest
       child. Anything else silently changes which of two forks the user is on
       without them having asked. */
    redo() {
      const node = current();
      if (!node) return null;
      let target = node.redo && nodes.has(node.redo) ? node.redo : null;
      if (!target && node.children.length) target = node.children[node.children.length - 1];
      if (!target) return null;
      marker = target;
      fire();
      return nodes.get(target).doc;
    },

    jump(id) {
      if (!nodes.has(id)) return null;
      const from = current();
      if (from) {
        // keep redo meaningful when the jump is a straight walk upwards
        for (let cursor = id; cursor != null; ) {
          const node = nodes.get(cursor);
          if (!node) break;
          if (node.children.indexOf(from.id) >= 0) node.redo = from.id;
          cursor = node.parent;
        }
      }
      marker = id;
      fire();
      return nodes.get(id).doc;
    },

    /* The tree as a flat list, newest first, for a history panel. Documents are
       deliberately not included: a panel that renders 80 layout documents by
       accident is a performance bug waiting in a UI thread. */
    steps() {
      return [...nodes.values()]
        .sort((a, b) => b.at - a.at)
        .map((node) => ({
          id: node.id,
          parent: node.parent,
          label: node.label,
          tag: node.tag,
          current: node.id === marker,
        }));
    },

    size() {
      return nodes.size;
    },
  };

  api.reset(options.doc || null, options.label || "");
  return api;
}
