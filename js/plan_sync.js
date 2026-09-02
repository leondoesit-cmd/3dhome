/* Live shared plan over the existing WebSocket relay.

   The relay is a dumb room broadcast (server/relay.mjs), so ordering has to be
   imposed here. THE HOST IS THE ONLY SEQUENCER: it owns `planRev`, and it is
   the only peer that stamps one. A guest applies its edit locally (every op is
   an absolute set, so re-applying the host's echo is a no-op) and sends it as
   a REQUEST; the host applies it, stamps the next revision and rebroadcasts.

   Before this, every peer incremented its own counter and broadcast a stamped
   op. Two people editing at once both reached rev N, each saw the other's N
   while already at N, both failed the `next === planRev + 1` check, both asked
   for a resync, and the host answered each with a full applyData that wiped
   local selection and any in-flight edit. Two cursors is the case this is for,
   so it had to be the case that worked.

   Remote ops apply WITHOUT pushing the local undo stack: Ctrl+Z stays "what
   I did", not "what the other person did". */

import { S } from "./state.js";
import { NET, on, sendData, isHome, peerName } from "./net.js";

export const cursors = {}; // peerCode -> {x, z, name, at}

var planRev = 0;
var listening = false;
var applyingRemote = false;
var lastHello = 0;

/* Fields a peer is allowed to set on an opening. The transport is
   JSON.parse (js/net.js), which creates `__proto__` as a real own enumerable
   key, and `o[k] = v` then runs the Object.prototype setter and swaps the
   opening's prototype. Copying whatever arrives is never worth it. */
const OPENING_FIELDS = {
  s: 1, width: 1, height: 1, sill: 1, swingDir: 1,
  isSliding: 1, isPocket: 1, slideDir: 1, type: 1,
};

export function isApplyingRemote() {
  return applyingRemote;
}

export function currentPlanRev() {
  return planRev;
}

export function resetPlanRev(n) {
  planRev = Number(n) || 0;
}

function projectId() {
  return (S.workspace && S.workspace.id) || null;
}

/* A friend can be sitting in a completely different project. Applying their
   scene over yours because you share a relay room is data loss, not sync. */
function sameProject(d) {
  var mine = projectId(), theirs = d && d.projectId;
  if (!mine || !theirs) return true;
  return mine === theirs;
}

function sceneGetter() {
  return import("./ui.js").then(function (ui) { return ui.sceneObject(false); });
}

function applyScene(scene) {
  return import("./ui.js").then(function (ui) {
    /* The guard has to span the WHOLE apply: applyData is asynchronous when it
       must fetch the model builder first, and dropping the flag at the end of
       this tick would let the tail of that apply echo back as a local edit. */
    /* Set the flag INSIDE the chain: applyData throws synchronously on a
       malformed payload ("Invalid scene data"), and that throw would escape
       before Promise.resolve() existed to attach the finally — leaving
       applyingRemote stuck true, which silently stops every local edit from
       reaching peers for the rest of the session. */
    return Promise.resolve().then(function () {
      applyingRemote = true;
      return ui.applyData(scene);
    }).finally(function () {
      applyingRemote = false;
    });
  });
}

export function applyPlanOp(op, state) {
  var st = state || S;
  if (!op || typeof op !== "object") return false;
  if (op.type === "itemMove") {
    var it = (st.items || []).find(function (x) { return x.id === op.id; });
    if (!it) return false;
    if (Number.isFinite(op.x)) it.x = op.x;
    if (Number.isFinite(op.z)) it.z = op.z;
    if (Number.isFinite(op.rot)) it.rot = op.rot;
    if (Object.prototype.hasOwnProperty.call(op, "elev")) {
      if (Number.isFinite(op.elev)) it.elev = op.elev;
      else delete it.elev;
    }
    if (Object.prototype.hasOwnProperty.call(op, "on")) {
      if (op.on != null) it.on = op.on;
      else delete it.on;
    }
    if (Object.prototype.hasOwnProperty.call(op, "hold")) {
      if (op.hold != null) it.hold = JSON.parse(JSON.stringify(op.hold));
      else delete it.hold;
    }
    if (Object.prototype.hasOwnProperty.call(op, "rotUser")) {
      if (op.rotUser != null) it.rotUser = op.rotUser;
      else delete it.rotUser;
    }
    return true;
  }
  if (op.type === "openingSet") {
    var o = (st.openings || []).find(function (x) { return x.id === op.id; });
    if (!o || !op.fields || typeof op.fields !== "object") return false;
    var touched = false;
    Object.keys(op.fields).forEach(function (k) {
      if (!Object.prototype.hasOwnProperty.call(OPENING_FIELDS, k)) return;
      o[k] = op.fields[k];
      touched = true;
    });
    return touched;
  }
  if (op.type === "slabMove") {
    var v = (st.slabOpenings || []).find(function (x) { return x.id === op.id; });
    if (!v) return false;
    if (Number.isFinite(op.x)) v.x = op.x;
    if (Number.isFinite(op.z)) v.z = op.z;
    if (Number.isFinite(op.rot)) v.rot = op.rot;
    return true;
  }
  if (op.type === "slabAdd") {
    if (!op.opening || op.opening.id == null) return false;
    if (!st.slabOpenings) st.slabOpenings = [];
    if (st.slabOpenings.some(function (x) { return x.id === op.opening.id; })) return true;
    st.slabOpenings.push(JSON.parse(JSON.stringify(op.opening)));
    return true;
  }
  if (op.type === "slabRemove") {
    st.slabOpenings = (st.slabOpenings || []).filter(function (x) { return x.id !== op.id; });
    return true;
  }
  if (op.type === "nodeMove") {
    /* Nodes are addressed by array index (walls store a/b as indices), and no
       op syncs wall creation — so the moment one peer draws a wall the arrays
       diverge and an index means two different corners. Carry the length and
       refuse the op when it does not match; the caller resyncs instead. */
    var nodes = st.nodes || [];
    if (Number.isFinite(op.n) && op.n !== nodes.length) return false;
    var n = nodes[op.index];
    if (!n) return false;
    if (Number.isFinite(op.x)) n.x = op.x;
    if (Number.isFinite(op.z)) n.z = op.z;
    return true;
  }
  return false;
}

export function itemMovePlanOp(item) {
  if (!item || item.id == null) return null;
  return { type: "itemMove", id: item.id, x: item.x, z: item.z, rot: item.rot,
    elev: item.elev == null ? null : item.elev,
    on: item.on == null ? null : item.on,
    hold: item.hold == null ? null : JSON.parse(JSON.stringify(item.hold)),
    rotUser: item.rotUser == null ? null : item.rotUser };
}

/* Expand selected roots to their complete carried stacks. A child selected
   alongside its parent is emitted once, and nested riders are included for
   both single-item and multi-select 2D/3D gestures. */
export function itemMovePlanOps(roots, items) {
  var byParent = new Map(), seen = new Set(), out = [];
  (items || []).forEach(function(item) {
    if (!item || item.on == null) return;
    var key = String(item.on);
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(item);
  });
  function add(item) {
    if (!item || seen.has(String(item.id))) return;
    seen.add(String(item.id));
    var op = itemMovePlanOp(item);
    if (op) out.push(op);
    (byParent.get(String(item.id)) || []).forEach(add);
  }
  (roots || []).forEach(add);
  return out;
}

function paint() {
  S.dirty3D = true;
  import("./plan2d.js").then(function (p) { p.render2D(); });
}

function requestResync() {
  var now = Date.now();
  if (now - lastHello < 1500) return; // a resync storm is worse than a stale plan
  lastHello = now;
  sendData({ k: "plan_hello", projectId: projectId() });
}

function applyIncoming(op) {
  applyingRemote = true;
  try { return applyPlanOp(op, S); }
  finally { applyingRemote = false; }
}

function onData(ev) {
  var from = ev.from, d = ev.data;
  if (!d || typeof d !== "object") return;
  if (!sameProject(d)) return;

  if (d.k === "plan_cursor") {
    if (from === NET.code) return;
    cursors[from] = { x: d.x, z: d.z, name: peerName(from), at: Date.now() };
    import("./plan2d.js").then(function (p) { p.render2D(); });
    return;
  }

  if (d.k === "plan_hello") {
    if (!isHome()) return;
    sceneGetter().then(function (scene) {
      sendData({ k: "plan_sync", projectId: projectId(), rev: planRev, scene: scene }, from);
    });
    return;
  }

  if (d.k === "plan_sync") {
    if (!d.scene || isHome()) return; // the host never adopts someone else's scene
    planRev = Number(d.rev) || 0;
    applyScene(d.scene).then(function (applied) { if (applied) paint(); });
    return;
  }

  /* A guest's edit. Only the host acts on it: apply, stamp, rebroadcast. */
  if (d.k === "plan_op_req") {
    if (!isHome() || !d.op) return;
    if (!applyIncoming(d.op)) {
      // the host could not apply it, so the guest is out of date — resync them
      sceneGetter().then(function (scene) {
        sendData({ k: "plan_sync", projectId: projectId(), rev: planRev, scene: scene }, from);
      });
      return;
    }
    planRev += 1;
    sendData({ k: "plan_op", projectId: projectId(), rev: planRev, op: d.op });
    paint();
    return;
  }

  /* A sequenced op from the host. Includes the echo of a guest's own request,
     which is harmless: every op is an absolute set. */
  if (d.k === "plan_op") {
    if (isHome() || !d.op) return;
    var next = Number(d.rev);
    if (Number.isFinite(next) && next !== planRev + 1) {
      requestResync();
      return;
    }
    if (applyIncoming(d.op)) {
      if (Number.isFinite(next)) planRev = next;
      paint();
    } else {
      requestResync();
    }
  }
}

function forgetPeer(code) {
  if (code && cursors[code]) delete cursors[code];
}

export function initPlanSync() {
  if (listening) return;
  listening = true;
  on("data", onData);
  on("peer-join", function () {
    if (!isHome()) requestResync();
  });
  // a cursor that never prunes is a ghost collaborator on the plan
  on("peer-leave", function (ev) { forgetPeer(ev && (ev.code || ev.from)); });
}

var lastCursor = 0;
export function sendPlanCursor(x, z) {
  var now = Date.now();
  if (now - lastCursor < 80) return;
  lastCursor = now;
  sendData({ k: "plan_cursor", projectId: projectId(), x: x, z: z });
}

/* The local edit already happened. The host stamps and broadcasts it; a guest
   asks the host to. */
export function broadcastPlanOp(op) {
  if (applyingRemote || !op) return;
  // Diagnostic/test seam: this records an accepted local operation request
  // before the transport gate; it does not mean a network packet was sent.
  if (typeof window !== "undefined" && typeof window.dispatchEvent === "function")
    window.dispatchEvent(new CustomEvent("planner-plan-op-requested", { detail: op }));
  if (!NET.connected) return;
  if (isHome()) {
    planRev += 1;
    sendData({ k: "plan_op", projectId: projectId(), rev: planRev, op: op });
  } else {
    sendData({ k: "plan_op_req", projectId: projectId(), op: op });
  }
}

export function pruneCursors(maxAge) {
  var now = Date.now(), age = maxAge || 4000;
  Object.keys(cursors).forEach(function (code) {
    if (now - cursors[code].at > age) delete cursors[code];
  });
}
