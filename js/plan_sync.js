import { requestSurveyPhotos, handleSurveyPhoto, forgetSurveyPhotoPeer } from './survey_photo_sync.js';
import { normalizeSurvey, normalizeSurveyFeatures } from "./survey.js";
import { normalizeNavigationProfile } from "./navigation_profile.js";
import { normalizeBaselines, normalizeRedesign, mergeBaselineArchives } from "./redesign.js";
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

import { normalizePlanningGuide } from "./planning_guide.js";
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
  isSliding: 1, isPocket: 1, isDouble: 1, leafA: 1, leafB: 1, slideDir: 1, type: 1,
};

/* Rebuild a value from scratch, dropping any `__proto__` key at every level.
   JSON.parse creates it as a real own property, so a nested wall layer or an
   arc's geometry could carry one in and swap a prototype on assignment. */
function plainCopy(value) {
  if (Array.isArray(value)) return value.map(plainCopy);
  if (!value || typeof value !== "object") return value;
  var out = {};
  Object.keys(value).forEach(function (k) {
    if (k === "__proto__") return;
    out[k] = plainCopy(value[k]);
  });
  return out;
}

/* The fields a wall is allowed to arrive with: the list splitWallAt carries
   onto a new half, the two that describe its own shape, and the DIMENSION
   LOCKS.

   The locks are the reason this list is written out rather than copied
   wholesale, and the reason it is worth checking against a real plan. They are
   what makes a wall hold the length somebody typed (js/constraint_engine.js);
   a peer whose walls arrive without them gets geometry that looks identical
   and comes apart the first time anything is solved, because every wall has
   quietly forgotten what it was holding. */
const WALL_FIELDS = [
  "thickness", "height", "tex", "wallTypeId", "layers", "layersReversed", "datum",
  "kind", "phase", "upperWallTypeId", "splitHeight", "profile", "railing", "join",
  "layerOverrides", "dimSide", "loc", "geometry", "curve", "bulge", "radius", "cornerTreatment",
  "clearL", "lock", "lockL", "lockClearL", "lockAng",
];

function sanitizeWall(w) {
  if (!w || w.id == null) return null;
  if (!Number.isInteger(w.a) || !Number.isInteger(w.b) || w.a < 0 || w.b < 0) return null;
  var out = { id: w.id, a: w.a, b: w.b };
  WALL_FIELDS.forEach(function (k) {
    if (w[k] !== undefined) out[k] = plainCopy(w[k]);
  });
  return out;
}

function sanitizeOpening(o) {
  if (!o || o.id == null || o.wall == null || !Number.isFinite(Number(o.s))) return null;
  var out = { id: o.id, wall: o.wall, s: Number(o.s) };
  Object.keys(OPENING_FIELDS).forEach(function (k) {
    if (o[k] !== undefined) out[k] = plainCopy(o[k]);
  });
  return out;
}

const ROOM_META_FIELDS = {
  name: 1, floor: 1, wall: 1, floorTex: 1, floorScale: 1, floorBump: 1, locked: 1, hidden: 1, noRoom: 1, isCorridor: 1,
  layoutPreferences: 1, relationships: 1, shape: 1, roomType: 1, preset: 1, cx: 1, cz: 1, hid: 1, autoOpenings: 1, tex: 1, ceilTex: 1,
};

function sanitizeRoomMeta(meta) {
  var out = {};
  Object.keys(meta).forEach(function (key) {
    if (key === "__proto__") return;
    var entry = meta[key];
    if (!entry || typeof entry !== "object") return;
    var copy = {};
    Object.keys(ROOM_META_FIELDS).forEach(function (k) {
      if (entry[k] !== undefined) copy[k] = plainCopy(entry[k]);
    });
    out[key] = copy;
  });
  return out;
}

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
  return import("./ui.js").then(function (ui) { return ui.sceneObject(true); });
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
      // Document metadata travels with the snapshot; access and display preferences stay local.
      const incoming = scene.workspace ? { ...scene, workspace: { ...scene.workspace, role: S.workspace?.role || "editor", quality: S.workspace?.quality || "auto" } } : scene;
      return ui.applyData(incoming);
    }).finally(function () {
      applyingRemote = false;
      // the adopted scene is the baseline, for the same reason as applyIncoming
      lastStructure = structureSignature();
      lastRedesign = redesignSignature();
    });
  });
}

export function applyPlanOp(op, state) {
  var st = state || S;
  if (!op || typeof op !== "object") return false;
  var applied = applyPlanOpTo(op, st);
  /* Whatever an op just did to the LIVE plan is the new baseline.
   *
     Without this the render that follows an incoming op sees a structure that
     differs from the last one this peer sent, concludes it is a local edit,
     and posts the whole thing back where it came from — a wasted round trip
     per edit, in both directions, for ever.

     It belongs here rather than in the transport wrapper because the wrapper
     can be bypassed: anything holding a reference to applyPlanOp can change
     the live plan, and the invariant is about the plan, not about who asked. */
  if (applied && st === S) { lastStructure = structureSignature(); lastRedesign = redesignSignature(); }
  return applied;
}

function applyPlanOpTo(op, st) {
  if (op.type === "redesignSet") {
    if (!st.workspace || typeof op.documentKey !== "string" || !op.documentKey) return false;
    // Adopt document identity through a scene/structure snapshot first.
    if (st.workspace.documentKey && st.workspace.documentKey !== op.documentKey) return false;
    const incoming = normalizeBaselines(op.baselines);
    st.workspace.documentKey = op.documentKey;
    st.workspace.baselines = mergeBaselineArchives(st.workspace.baselines, incoming);
    st.workspace.redesign = normalizeRedesign(op.redesign, st.workspace.baselines);
    return true;
  }
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
  /* Structure, as an absolute set: the corners, the walls, the openings and
     the room metadata, wholesale.
   *
     Everything else in this protocol addresses an entity by a stable id. Walls
     cannot: they hold their corners as INDICES into st.nodes, so a corner's
     identity is its position in an append-only array. That works only while
     every peer's array is the same array, and nothing kept it that way — the
     nodeMove op below carries a length and refuses when it disagrees, which
     was an honest guard over a real hole rather than a fix for it. The moment
     anybody drew a wall, stamped a room or erased a partition, the two plans
     diverged and stayed diverged until somebody triggered a full resync.

     Sending the structure entire is what makes index identity survive: after
     this op both peers hold the same arrays in the same order by construction,
     so every id and every index means the same thing again. It is the same
     absolute-set discipline as the rest of the protocol, and it is strictly
     cheaper than the full-scene resync it replaces — that one carries the
     furniture, the finishes and the site as well.

     Nothing here is copied by reference. The transport is JSON.parse, which
     makes `__proto__` a real own key, and assigning a wall wholesale would run
     Object.prototype's setter; see the note on OPENING_FIELDS. */
  if (op.type === "structSet") {
    if (!Array.isArray(op.nodes) || !Array.isArray(op.walls)) return false;
    if (st.workspace && typeof op.documentKey === "string" && op.documentKey && st.workspace.documentKey !== op.documentKey) {
      st.workspace.documentKey = op.documentKey; st.workspace.baselines = Object.freeze([]); st.workspace.redesign = {};
    }
    st.nodes = op.nodes.map(function (n) {
      if (!n || !Number.isFinite(Number(n.x)) || !Number.isFinite(Number(n.z))) return null;
      var node = { x: Number(n.x), z: Number(n.z) };
      /* `vid` is the corner's STABLE identity, and the only thing a dimension
         anchor resolves through (js/wall_constraints.js). An index says where
         a corner is in the array; a vid says which corner it is. Dropping it
         would hand the peer a plan whose every constraint quietly stopped
         resolving — the geometry would look right and the dimensions would
         not hold. */
      if (typeof n.vid === "string") node.vid = n.vid;
      return node;
    });
    st.walls = op.walls.map(sanitizeWall).filter(function (w) {
      return w && st.nodes[w.a] && st.nodes[w.b] && w.a !== w.b;
    });
    var liveWalls = {};
    st.walls.forEach(function (w) { liveWalls[w.id] = 1; });
    st.openings = (Array.isArray(op.openings) ? op.openings : [])
      .map(sanitizeOpening)
      .filter(function (o) { return o && liveWalls[o.wall]; });
    if (op.roomMeta && typeof op.roomMeta === "object") st.roomMeta = sanitizeRoomMeta(op.roomMeta);
    if (op.survey && st.workspace) st.workspace.survey=normalizeSurvey(op.survey);
    if (op.navigationProfile && st.workspace) st.workspace.navigationProfile=normalizeNavigationProfile(op.navigationProfile);
    if (op.surveyFeatures) st.surveyFeatures=normalizeSurveyFeatures(op.surveyFeatures);
    if (op.guidance && st.workspace) st.workspace.guidance = normalizePlanningGuide(op.guidance);
    /* Dimensions are not carried by this op, so the ones already here have to
       be checked against the walls that just arrived. A constraint anchored to
       a wall this structure does not contain cannot be solved and cannot be
       drawn; keeping it would put a permanent unresolvable warning on the
       peer's plan for a wall they can no longer see. */
    if (Array.isArray(st.wallCons) && st.wallCons.length) {
      st.wallCons = st.wallCons.filter(function (c) {
        return !c || ["wall", "ref"].every(function (k) {
          return c[k] == null || liveWalls[c[k]];
        }) && ["a", "b"].every(function (k) {
          return !c[k] || c[k].wall == null || liveWalls[c[k].wall];
        });
      });
    }
    /* Never backwards: a peer that has already handed out an id locally must
       not be told to hand it out again. */
    if (Number.isFinite(op.idc)) st.idc = Math.max(Number(st.idc) || 1, op.idc);
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
  if(d.k?.startsWith('survey_photo_')){handleSurveyPhoto(d,from,S.workspace?.survey,projectId(),sendData).catch(()=>{});return;}

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
    applyScene(d.scene).then(function (applied) { if (applied) {paint();requestSurveyPhotos(S.workspace?.survey,from,projectId(),sendData).catch(()=>{});} });
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
    requestSurveyPhotos(S.workspace?.survey,from,projectId(),sendData).catch(()=>{});
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
      requestSurveyPhotos(S.workspace?.survey,from,projectId(),sendData).catch(()=>{});
      if (Number.isFinite(next)) planRev = next;
      paint();
    } else {
      requestResync();
    }
  }
}

function forgetPeer(code) {
  if (code && cursors[code]) delete cursors[code];
  if(code)forgetSurveyPhotoPeer(code);
}

export function initPlanSync() {
  if (listening) return;
  listening = true;
  let photoPeerIndex=0,photoRetryBusy=false;
  setInterval(async()=>{
    if(photoRetryBusy||!NET.connected||!S.workspace?.survey?.photos?.length)return;
    const peers=Object.keys(NET.peers);if(!peers.length)return;
    photoRetryBusy=true;
    try{await requestSurveyPhotos(S.workspace.survey,peers[photoPeerIndex++%peers.length],projectId(),sendData);}catch{/* Retry after connectivity or storage recovers. */}
    finally{photoRetryBusy=false;}
  },15000);
  on("data", onData);
  /* Imported lazily, and only here: plan2d pulls in most of the planner, and
     this module is loaded by anything that touches a plan op. */
  import("./plan2d.js").then(function (p) { p.onAfterRender(syncStructureIfChanged); });
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

/* ---- keeping the structure in step --------------------------------------

   ONE HOOK, NOT A CALL AT EVERY EDIT. Walls are created, split, welded,
   de-duplicated and erased from a dozen places — the wall tool, the room
   stamp, a room drop, an edge resize, the eraser, the bite, the apartment
   generator, the blueprint importer, a scan merge — and a broadcast bolted to
   each of them is a list that is wrong the day somebody adds the thirteenth.
   Instead the plan says what it looks like after every render, and a change in
   that answer is the trigger. Nothing can edit the structure without the plan
   redrawing, so nothing can slip past.

   The signature covers geometry AND topology, because a room drag moves four
   corners without touching a single wall. It deliberately runs only when a
   gesture has ENDED: mid-drag the finer-grained nodeMove op already carries
   the live corner, and re-sending the whole structure sixty times a second to
   describe one wall sliding would be indefensible. */
var lastStructure = "", lastRedesign = "";
function redesignSignature() {
  const w = S.workspace || {};
  return JSON.stringify([w.documentKey, (w.baselines || []).map(b => b.id), w.redesign]);
}
export function redesignPlanOp() {
  const w = S.workspace || {};
  return { type: "redesignSet", documentKey: w.documentKey, baselines: w.baselines || [], redesign: w.redesign || {} };
}

function structureSignature() {
  var out = (S.nodes || []).length + ":" + (S.walls || []).length + ":";
  (S.nodes || []).forEach(function (n) {
    out += n ? Math.round(n.x) + "," + Math.round(n.z) + ";" : "-;";
  });
  (S.walls || []).forEach(function (w) {
    out += w.id + ">" + w.a + "-" + w.b + ";";
  });
  (S.openings || []).forEach(function (o) {
    out += o.id + "@" + o.wall + ":" + Math.round(o.s) + "," + Math.round(o.width) + ";";
  });
  // Track semantic edits without serializing floor/wall texture data on every
  // pointer render. The full sanitized metadata travels only when we send.
  out += JSON.stringify(Object.keys(S.roomMeta || {}).sort().map(function (key) {
    var meta = S.roomMeta[key] || {};
    return [key, meta.name, meta.roomType, meta.preset, meta.hid, meta.floor, meta.wall, !!meta.floorTex, meta.floorScale, meta.floorBump, meta.layoutPreferences, meta.shape, meta.relationships];
  }));
  out += JSON.stringify([S.workspace && S.workspace.guidance || null, S.workspace && S.workspace.documentKey,S.workspace?.survey,S.workspace?.navigationProfile,S.surveyFeatures]);
  return out;
}

export function structurePlanOp() {
  return {
    type: "structSet",
    documentKey: S.workspace && S.workspace.documentKey,
    nodes: (S.nodes || []).map(function (n) {
      if (!n) return null;
      var out = { x: n.x, z: n.z };
      if (typeof n.vid === "string") out.vid = n.vid;
      return out;
    }),
    walls: (S.walls || []).map(sanitizeWall).filter(Boolean),
    openings: (S.openings || []).map(sanitizeOpening).filter(Boolean),
    roomMeta: sanitizeRoomMeta(S.roomMeta || {}),
    guidance: normalizePlanningGuide(S.workspace && S.workspace.guidance),
    survey:normalizeSurvey(S.workspace?.survey),navigationProfile:normalizeNavigationProfile(S.workspace?.navigationProfile),surveyFeatures:normalizeSurveyFeatures(S.surveyFeatures),
    idc: Number(S.idc) || 1,
  };
}

/* Called after every plan render. Cheap and silent unless something actually
   changed AND there is somebody to tell. */
export function syncStructureIfChanged() {
  if (applyingRemote) return false;
  if (!NET.connected) {
    // stay current while alone, so joining a room later does not look like an
    // edit that never happened
    lastStructure = structureSignature();
    lastRedesign = redesignSignature();
    return false;
  }
  if (S.action) return false; // mid-gesture; the release will render again
  const redesignNow = redesignSignature();
  const redesignChanged = redesignNow !== lastRedesign;
  var now = structureSignature();
  const structureChanged = now !== lastStructure;
  if (structureChanged) { lastStructure = now; broadcastPlanOp(structurePlanOp()); }
  // Adopt a new document identity before sending its archive and permissions.
  if (redesignChanged) { lastRedesign = redesignNow; broadcastPlanOp(redesignPlanOp()); }
  return structureChanged || redesignChanged;
}

export function pruneCursors(maxAge) {
  var now = Date.now(), age = maxAge || 4000;
  Object.keys(cursors).forEach(function (code) {
    if (now - cursors[code].at > age) delete cursors[code];
  });
}
