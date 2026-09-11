// Edit history, shared by the three editors that each grew their own copy of
// it: the plan (history.js), the CAD modeler (modeler.js) and the cabinet
// designer (ui_cabinet.js). They differ only in WHAT they serialize, how they
// put it back and what the model is made of, so those are callbacks and
// everything else lives here.
//
// This is a TREE, not a list and not a pair of stacks. Every state the model
// has been in is a node; a node's parent is the state it was edited from. The
// state you are looking at is a marker on one of them.
//
//        s0 ──┬── s1(box) ── s2(move) ──┬── s3(hole) ── s4(shell)
//             │                         └── s5(fillet)      ^ marker
//             └── s6(cylinder)
//
// Undo walks to the parent, redo walks back to the child you came from, and
// jump() goes to any node directly — the CAD rollback bar. Rolling back and
// then editing FORKS: the steps you rolled past stay on their own branch
// instead of being destroyed, which is the whole point of a history tree and
// the one thing a linear timeline can never offer. Nothing is lost until the
// cap prunes it, and the cap prunes the oldest abandoned branch first.
//
// The second axis is WHAT each step touched. An editor hands over a scan()
// that reads a snapshot and lists the objects in it — id, parent, label and a
// signature of its contents. Diffing one node's scan against its parent's says
// exactly which objects that step added, changed or deleted, without a single
// call site having to declare it. That is what lets a panel answer "show me
// the history of this cupboard and everything inside it": scope an object,
// keep the steps whose targets fall inside its subtree.
//
//   var H = createHistory({
//     get: function () { return JSON.stringify(model); },
//     set: function (s) { model = JSON.parse(s); redraw(); },
//     key: function (s) { ... },        // optional, for observe()
//     scan: function (s) { ... },       // optional, [{id,parent,kind,label,sig}]
//     subtree: function (id) { ... },   // optional, live children of an object
//     onChange: syncUI,                 // optional
//   });
//   H.push("Add shelf");   // BEFORE mutating
//   H.undo(); H.redo(); H.jump(id);
//
// A snapshot is an opaque string. Interning, pruning or compressing it is the
// caller's business (see the texture pool in history.js) — this module only
// stores and hands back whatever get() produced.
//
// What this still is NOT: a parametric feature list. Nodes are whole-model
// snapshots, so they can be revisited but not re-parameterized — you cannot
// reach into step 2 and change the box's width and have 3 and 4 rebuild on top
// of it. That needs every operation to record its inputs instead of its result.

const DEFAULT_CAP = 60;

export function createHistory(opts) {
  opts = opts || {};
  var get = opts.get,
    set = opts.set,
    keyOf = opts.key || null,
    scanOf = opts.scan || null,
    subtreeOf = opts.subtree || null,
    onChange = opts.onChange || null,
    cap = opts.cap || DEFAULT_CAP;

  /* node = { id, parent, kids[], pick, seq, op, snap, idx, targets, time }
     `pick` is the child undo came out of, so redo returns the way you came.
     `idx` is the scan of `snap` as id -> content hash; `targets` is that index
     diffed against the parent's, i.e. what this step did. */
  var nodes = new Map(),
    seq = 0,
    root = null,
    pos = null,
    /* Everything scan() has ever reported, id -> {label, kind, parent}. A step
       that deleted a sofa still has to be able to say "sofa", and an object's
       children have to stay reachable after the parent outlives them, so this
       accumulates and is never pruned with the nodes. */
    known = new Map(),
    // begin()/commit(): the node is created up front, while the model is still
    // unmutated, and only named (or dropped) when the gesture ends
    provisional = false,
    // observe() bookkeeping: the last state we were shown and its compare key
    lastKey = null,
    lastFull = null,
    // true while set() runs, so an editor whose redraw calls observe() does not
    // record the restore as a fresh edit
    restoring = false;

  function fire() {
    if (onChange) onChange();
  }
  function N(id) {
    return id == null ? null : nodes.get(id) || null;
  }
  function cur() {
    return N(pos);
  }

  /* ---- the object index -------------------------------------------------
     Signatures are hashed rather than kept: the index exists to answer "did
     this object change", and a node holding the full text of every object it
     contains would cost more than the snapshot it was derived from. */
  function hash(s) {
    var h = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return h;
  }
  function indexOf(snapStr) {
    if (!scanOf || snapStr == null) return null;
    var list;
    try {
      list = scanOf(snapStr) || [];
    } catch (err) {
      return null; // a scan that throws costs the step its targets, nothing more
    }
    var m = new Map();
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (!e || e.id == null) continue;
      var id = String(e.id);
      m.set(id, hash(e.sig == null ? "" : String(e.sig)));
      var k = known.get(id);
      if (!k) known.set(id, { label: e.label || id, kind: e.kind || "", parent: e.parent == null ? null : String(e.parent) });
      else {
        if (e.label) k.label = e.label;
        if (e.kind) k.kind = e.kind;
        if (e.parent != null) k.parent = String(e.parent);
      }
    }
    return m;
  }
  function diff(before, after) {
    if (!before || !after) return [];
    var out = [];
    after.forEach(function (v, id) {
      var had = before.get(id);
      if (had === undefined) out.push({ id: id, change: "add" });
      else if (had !== v) out.push({ id: id, change: "edit" });
    });
    before.forEach(function (v, id) {
      if (!after.has(id)) out.push({ id: id, change: "del" });
    });
    return out;
  }
  // pin a node's snapshot down and work out what it did, now that it is settled
  function settle(n, snapStr) {
    if (!n) return;
    n.snap = snapStr;
    n.idx = indexOf(snapStr);
    var p = N(n.parent);
    n.targets = p ? diff(p.idx, n.idx) : [];
  }
  // the live model is node `pos` and may have moved on since it was recorded —
  // read its index fresh rather than trusting the one taken at push time
  function liveTargets() {
    var n = cur();
    if (!n) return [];
    var p = N(n.parent);
    if (!p || !scanOf) return n.targets;
    return diff(p.idx, indexOf(get()));
  }

  /* ---- the tree ---------------------------------------------------------- */
  function add(parentId, snapStr, label) {
    var n = {
      id: seq,
      parent: parentId,
      kids: [],
      pick: null,
      seq: seq++,
      op: label || "",
      snap: snapStr,
      idx: null,
      targets: [],
      time: Date.now(),
    };
    nodes.set(n.id, n);
    var p = N(parentId);
    if (p) {
      p.kids.push(n.id);
      p.pick = n.id;
    }
    return n;
  }
  function startAt(snapStr) {
    nodes.clear();
    known.clear();
    seq = 0;
    // the opening state is left unnamed: no operation produced it, and a panel
    // that knows it is the root already has a better word for it than a dash
    var n = add(null, snapStr, "");
    root = pos = n.id;
    settle(n, snapStr);
  }
  // the live model IS node `pos`; keep that node honest before moving away
  function sync() {
    if (pos != null) settle(cur(), get());
  }
  /* Add a step for an operation about to happen (push) or already done
     (observe). The node it hangs off keeps whatever the model looked like when
     the step began — that is what makes undo land on the right state — and
     siblings created earlier are left alone: this is where the tree forks. */
  function step(label, stateBefore, stateAfter) {
    if (pos == null) startAt(stateBefore);
    else settle(cur(), stateBefore);
    var n = add(pos, stateAfter, label);
    pos = n.id;
    if (stateAfter === stateBefore) {
      // a push() records the state the edit STARTS from; nothing has happened
      // yet, so it inherits the index and earns its targets once it settles
      n.idx = N(n.parent) ? N(n.parent).idx : indexOf(stateAfter);
      n.targets = [];
    } else settle(n, stateAfter);
    trim();
  }
  function detach(n) {
    var p = N(n.parent);
    if (p) {
      p.kids = p.kids.filter(function (k) {
        return k !== n.id;
      });
      if (p.pick === n.id) p.pick = p.kids.length ? p.kids[p.kids.length - 1] : null;
    }
    nodes.delete(n.id);
  }
  function dropSubtree(id) {
    var n = N(id);
    if (!n) return;
    n.kids.slice().forEach(dropSubtree);
    detach(n);
  }
  function spine() {
    var s = new Set(),
      id = pos;
    while (id != null && nodes.has(id)) {
      s.add(id);
      id = N(id).parent;
    }
    return s;
  }
  /* The cap counts nodes, not steps on one branch. What goes first is the
     oldest leaf that is neither where you are nor on the way back to the start
     — i.e. abandoned branches wither from their tips, and the path you are
     actually on is the last thing to be touched. Only when nothing else is
     left does the start of the session get dropped and its child promoted. */
  function trim() {
    if (nodes.size <= cap + 1) return;
    var keep = spine(),
      guard = 0;
    while (nodes.size > cap + 1 && guard++ < 5000) {
      var victim = null;
      nodes.forEach(function (n) {
        if (n.kids.length || keep.has(n.id)) return;
        if (!victim || n.seq < victim.seq) victim = n;
      });
      if (victim) {
        detach(victim);
        continue;
      }
      var r = N(root);
      if (!r || !r.kids.length) return; // the marker is the only node left
      var heir = null;
      r.kids.forEach(function (k) {
        if (keep.has(k)) heir = k;
      });
      if (heir == null) return;
      r.kids.forEach(function (k) {
        if (k !== heir) dropSubtree(k);
      });
      nodes.delete(root);
      N(heir).parent = null;
      root = heir;
    }
  }

  function restore(s) {
    restoring = true;
    var ok;
    try {
      ok = set(s) !== false;
    } catch (err) {
      ok = false;
    } finally {
      restoring = false;
    }
    if (ok && lastFull !== null) reseed();
    return ok;
  }
  function reseed() {
    lastFull = get();
    lastKey = keyOf ? keyOf(lastFull) : lastFull;
  }
  function goto_(id) {
    var n = N(id);
    if (!n || id === pos) return false;
    sync();
    if (!restore(n.snap)) {
      // a corrupt node is dropped rather than retried forever; the model on
      // screen is left alone, which always beats half-applying one. Its
      // children move up to its parent so the branch below it survives.
      var p = N(n.parent);
      n.kids.slice().forEach(function (k) {
        var c = N(k);
        c.parent = p ? p.id : null;
        if (p) p.kids.push(k);
        else root = k;
      });
      n.kids = [];
      detach(n);
      fire();
      return false;
    }
    // remember the way back down, so redo retraces the branch you just left
    var walk = n;
    while (walk && walk.parent != null) {
      var p2 = N(walk.parent);
      if (!p2) break;
      p2.pick = walk.id;
      walk = p2;
    }
    pos = id;
    fire();
    return true;
  }

  /* ---- object scoping ---------------------------------------------------- */
  function scopeSet(id) {
    var out = new Set();
    if (id == null) return out;
    out.add(String(id));
    if (subtreeOf) {
      var live;
      try {
        live = subtreeOf(String(id)) || [];
      } catch (err) {
        live = [];
      }
      live.forEach(function (x) {
        if (x != null) out.add(String(x));
      });
    }
    /* Live children only cover what still exists. A piece deleted three steps
       ago is exactly what you scoped its parent to see, so pull in anything
       whose recorded parent has landed in the set, until it stops growing. */
    for (var pass = 0; pass < 12; pass++) {
      var grew = false;
      known.forEach(function (v, k) {
        if (!out.has(k) && v.parent != null && out.has(v.parent)) {
          out.add(k);
          grew = true;
        }
      });
      if (!grew) break;
    }
    return out;
  }
  function decorate(t) {
    var k = known.get(t.id) || null;
    return {
      id: t.id,
      change: t.change,
      label: (k && k.label) || t.id,
      kind: (k && k.kind) || "",
    };
  }

  var H = {
    /* Record a step for an operation about to happen — call BEFORE mutating.
       `tag` coalesces: consecutive pushes carrying the same tag fold into the
       step already open, so dragging a slider or holding an arrow key is one
       step instead of sixty. Pass a fresh tag (or none) when the gesture ends. */
    push: function (label, tag) {
      if (provisional) provisional = false; // a dangling begin() counts as done
      var now = get();
      var n = cur();
      if (tag && n && n.parent != null && n.op && n.op.tag === tag) {
        // same gesture: the step's starting point is already right, only its
        // result moves on
        settle(n, now);
        fire();
        return this;
      }
      step(tagged(label, tag), now, now);
      fire();
      return this;
    },

    /* Drag pattern: open the step on pointerdown while the model is still
       untouched, name it on pointerup, drop it if the pointer never moved. */
    begin: function (label) {
      if (provisional) return this;
      var now = get();
      step(label || "", now, now);
      provisional = true;
      return this;
    },
    commit: function (label) {
      if (!provisional) return false;
      provisional = false;
      var n = cur();
      if (label && n) n.op = label;
      settle(n, get());
      fire();
      return true;
    },
    cancel: function () {
      if (!provisional) return this;
      provisional = false;
      return this.discard();
    },

    /* Transaction rollback differs from gesture cancel. cancel() is used for
       an untouched provisional gesture and therefore only drops its node;
       abort() is allowed after mutations and first restores the snapshot that
       begin() captured. Keep the node provisional when restore fails so a
       caller cannot accidentally commit or start another edit over a model
       whose rollback did not complete. */
    abort: function () {
      if (!provisional) return false;
      var n = cur();
      if (!n || n.parent == null || !restore(n.snap)) return false;
      provisional = false;
      return this.discard();
    },
    isPending: function () {
      return provisional;
    },

    /* An operation that opened a step and then turned out to be a no-op (a
       fillet that could not be built, a pattern that produced nothing) drops
       its own step rather than leaving a do-nothing entry in the tree. */
    discard: function () {
      var n = cur();
      if (!n || n.parent == null || n.kids.length) return false;
      pos = n.parent;
      detach(n);
      fire();
      return true;
    },

    /* Auto-recording for editors where every change funnels through one redraw
       and sprinkling push() over three dozen handlers is worse: call observe()
       from that redraw and it adds a step whenever the compare key really
       moved. `key` is what lets noise (a door-opening slider, a camera angle)
       change the model without becoming a step of its own. */
    observe: function (label) {
      if (restoring) return false;
      var full = get(),
        k = keyOf ? keyOf(full) : full;
      if (lastKey === null) {
        if (pos == null) startAt(full);
        lastKey = k;
        lastFull = full;
        return false;
      }
      if (k === lastKey) {
        /* Real change, but not one that counts as an edit — fold it into the
           step on screen so undo still lands somewhere sensible. Only the
           snapshot is updated: this runs on every redraw, and the node's index
           is rebuilt anyway the moment it matters (when a step forks off it or
           the marker leaves it). */
        lastFull = full;
        if (pos != null) cur().snap = full;
        return false;
      }
      step(label || "", lastFull, full);
      lastKey = k;
      lastFull = full;
      fire();
      return true;
    },

    undo: function () {
      var n = cur();
      return n && n.parent != null ? goto_(n.parent) : false;
    },
    redo: function () {
      var n = cur();
      if (!n || !n.kids.length) return false;
      return goto_(n.pick != null && nodes.has(n.pick) ? n.pick : n.kids[n.kids.length - 1]);
    },
    /* Roll the model to any node in the tree — the rollback bar, and what a
       click in the history panel does. */
    jump: function (id) {
      return goto_(id);
    },

    canUndo: function () {
      var n = cur();
      return !!(n && n.parent != null);
    },
    canRedo: function () {
      var n = cur();
      return !!(n && n.kids.length);
    },
    undoLabel: function () {
      var n = cur();
      return n && n.parent != null ? plain(n.op) : "";
    },
    redoLabel: function () {
      var n = cur();
      if (!n || !n.kids.length) return "";
      var k = N(n.pick != null && nodes.has(n.pick) ? n.pick : n.kids[n.kids.length - 1]);
      return k ? plain(k.op) : "";
    },

    /* The whole tree, depth-first in creation order, for the history panel:
       [{i, parent, depth, label, root, current, rel, branch, time, targets}]
         rel      past | current | future | other  — future is what redo reaches,
                  other is a branch you left behind
         branch   this node forks; its children are alternative futures
         targets  [{id, label, kind, change}] — what the step actually touched */
    tree: function () {
      var out = [],
        onPath = spine(),
        live = liveTargets(),
        future = new Set();
      (function mark(id) {
        var n = N(id);
        if (!n) return;
        n.kids.forEach(function (k) {
          future.add(k);
          mark(k);
        });
      })(pos);
      (function walk(id, depth) {
        var n = N(id);
        if (!n) return;
        out.push({
          i: n.id,
          parent: n.parent,
          depth: depth,
          label: plain(n.op),
          root: n.parent == null,
          current: n.id === pos,
          rel: n.id === pos ? "current" : onPath.has(n.id) ? "past" : future.has(n.id) ? "future" : "other",
          branch: n.kids.length > 1,
          time: n.time,
          targets: (n.id === pos ? live : n.targets).map(decorate),
        });
        n.kids
          .slice()
          .sort(function (a, b) {
            return N(a).seq - N(b).seq;
          })
          .forEach(function (k) {
            walk(k, depth + 1);
          });
      })(root, 0);
      return out;
    },

    /* Which objects a step touched, and which objects exist at all — a panel
       needs both to draw chips and to offer a scope. */
    targetsOf: function (id) {
      var n = N(id);
      if (!n) return [];
      return (n.id === pos ? liveTargets() : n.targets).map(decorate);
    },
    objects: function () {
      return known;
    },
    labelOf: function (id) {
      var k = known.get(String(id));
      return k ? k.label : "";
    },
    /* An object plus everything under it — live children from the editor,
       plus anything that ever lived there. Feed the result to touches(). */
    scope: function (id) {
      return scopeSet(id);
    },
    touches: function (nodeId, ids) {
      if (!ids || !ids.size) return true;
      var t = this.targetsOf(nodeId);
      for (var i = 0; i < t.length; i++) if (ids.has(t[i].id)) return true;
      return false;
    },

    position: function () {
      return pos;
    },
    length: function () {
      return nodes.size;
    },
    /* How many alternative futures the tree is holding — what the panel counts
       when it says a rollback did not throw the other branch away. */
    branches: function () {
      var n = 0;
      nodes.forEach(function (x) {
        if (x.kids.length > 1) n += x.kids.length - 1;
      });
      return n;
    },

    /* Whether the live model is still the state represented by the current
       marker. Editors use this when they temporarily close a panel: an
       unchanged model may safely resume its tree, while an external edit must
       start a new one rather than offering stale undo states. */
    matchesCurrent: function () {
      var n = cur();
      if (!n) return false;
      var live = get();
      return keyOf ? keyOf(live) === keyOf(n.snap) : live === n.snap;
    },

    saveSession: function () {
      sync();
      return structuredClone({nodes,known,seq,root,pos,provisional,lastKey,lastFull});
    },
    loadSession: function (saved) {
      const copy = structuredClone(saved);
      nodes=copy.nodes; known=copy.known; seq=copy.seq; root=copy.root; pos=copy.pos;
      provisional=copy.provisional; lastKey=copy.lastKey; lastFull=copy.lastFull;
      fire();
    },

    /* Start a new editing session — a different model was loaded, so the old
       tree does not describe it. */
    clear: function () {
      nodes.clear();
      known.clear();
      root = pos = null;
      seq = 0;
      provisional = false;
      lastKey = lastFull = null;
      fire();
      return this;
    },
    /* Record the current state as the session's starting point without making
       it an edit. Use after loading a model. */
    seed: function () {
      startAt(get());
      if (keyOf || lastKey !== null) reseed();
      fire();
      return this;
    },
    isRestoring: function () {
      return restoring;
    },
  };

  return H;
}

/* A step's label is normally a plain string; a coalescing push needs to
   remember its tag too, so those become a String carrying one. Keeping the
   common case a bare string is what lets tree()/labels stay simple. */
function tagged(label, tag) {
  if (!tag) return label || "";
  var s = new String(label || "");
  s.tag = tag;
  return s;
}
function plain(o) {
  return o == null ? "" : String(o);
}
