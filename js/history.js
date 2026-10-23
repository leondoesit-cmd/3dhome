import { createHistoryValuePool } from "./core/history_value_pool.js";
import { mergeBaselineArchives } from "./redesign.js";
// Undo/redo via JSON snapshots of the model (walls/rooms/openings/furniture/MEP).
// Display/environment settings (time, north, floor, wall color) are intentionally NOT tracked.
//
// The stack machinery lives in edit_history.js and is shared with the CAD
// modeler and the cabinet designer; what stays here is what is specific to the
// plan — which fields make up a snapshot, how one is put back, and the texture
// pool that keeps snapshots small.
import { createHistory } from "./edit_history.js";
import { createHistoryPanel } from "./ui_history.js";
import { S, cancelDraftGestures } from "./state.js";
import { render2D } from "./plan2d.js";
import { fillProps, refreshTree } from "./ui.js";
import { withoutRoomPrompts } from "./ui_tree.js";
import { ensureMEP, nodeLabel, runLabel } from "./mep.js";
import { renderPanel as refreshMEPPanel } from "./ui_mep.js";
import { snapshotSmart, loadSmart } from "./smarthome.js";
import { markDirty } from "./persist.js";
import { FURN, flabel } from "./furniture.js";
import { t } from "./i18n.js";
import { roomByKey, roomName, pointInPoly } from "./geometry.js";
import { select } from "./ui_props.js";
import {
  exportParametricProject,
  importParametricProject,
  rebuildProject,
} from "./core/project.js";
import { exportSpatialProject, importSpatialProject } from "./core/spatial_project.js";
import { normalizeBlueprintReference, syncBlueprintTraceControls } from "./blueprint_trace.js";
import { captureFloor } from "./floors.js";

const CAP = 80;
const definitionPool = createHistoryValuePool();

/* ---- texture interning ---------------------------------------------------
   Uploaded wall/floor textures are stored on the model as base64 data URLs
   (wall.tex, roomMeta[k].floorTex). Serializing those into every snapshot made
   each undo entry carry a full copy of every texture in the scene — a 4-wall
   plan with one 29 KB texture already cost ~9 MB across the 80-entry cap, and
   a real apartment scales that by an order of magnitude.
   So snapshots store a short token instead, and the bytes live once in a pool.
   The pool is never evicted: a texture the user removed must still be there if
   they undo back to it. It is bounded by the number of DISTINCT textures
   uploaded in a session, not by the number of edits. */
const TEX_TOKEN = "@tex:";
var texById = new Map(), texKeyFor = new Map(), texSeq = 0;
function texPack(key, value) {
  if(key === "parametric" && value && typeof value === "object") return definitionPool.pack(value);
  if (typeof value !== "string" || value.lastIndexOf("data:", 0) !== 0) return value;
  var k = texKeyFor.get(value);
  if (!k) {
    k = TEX_TOKEN + ++texSeq;
    texKeyFor.set(value, k);
    texById.set(k, value);
  }
  return k;
}
function texUnpack(key, value) {
  if(key === "parametric") return definitionPool.unpack(value);
  // only swap back tokens we actually issued, so an unrelated string that
  // happens to look like one passes through untouched
  if (typeof value === "string" && texById.has(value)) return texById.get(value);
  return value;
}

/* ---- storey interning ----------------------------------------------------
   Floors are model content, not display state, so adding or removing a storey
   has to be as undoable as moving a wall — which means the workspace travels in
   every snapshot. Copying every storey's scene into all 80 of them does not:
   the entry would carry the whole building on each keystroke.

   Two observations make it cheap. The ACTIVE floor's scene is already in the
   entry, as `spatial` — so it is dropped here and re-captured on the way back
   in. And an INACTIVE floor's scene is not touched at all between edits, so it
   can be shared by reference: captureFloor() replaces the active floor's scene
   object, and cross-storey edits must also replace the scene they change.
   Each replacement receives a new token. Same bargain as
   the texture pool above, and bounded the same way — by the number of distinct
   storey scenes in a session, not by the number of edits. */
const baselinePool = new Map(), baselineTokens = new WeakMap();
let baselineSeq = 0, rollingBackBaseline = false;
const FLOOR_TOKEN = "@floor:";
var floorById = new Map(), floorTokenFor = new WeakMap(), floorSeq = 0;
function floorPack(workspace) {
  if (!workspace || !Array.isArray(workspace.floors)) return workspace || null;
  var out = Object.assign({}, workspace);
  if (Array.isArray(workspace.baselines)) {
    let token = baselineTokens.get(workspace.baselines);
    if (!token) { token = "@baseline:" + ++baselineSeq; baselineTokens.set(workspace.baselines, token); baselinePool.set(token, workspace.baselines); }
    out.baselines = token;
  }
  out.floors = workspace.floors.map(function (f) {
    if (!f || typeof f !== "object") return f;
    var copy = Object.assign({}, f);
    if (f.id === workspace.activeFloor) {
      copy.scene = null; // it IS `spatial`; apply() re-captures it
      return copy;
    }
    if (!f.scene || typeof f.scene !== "object") return copy;
    var token = floorTokenFor.get(f.scene);
    if (!token) {
      token = FLOOR_TOKEN + ++floorSeq;
      floorTokenFor.set(f.scene, token);
      floorById.set(token, f.scene);
    }
    copy.scene = token;
    return copy;
  });
  return out;
}
function floorUnpack(workspace) {
  if (!workspace || !Array.isArray(workspace.floors)) return workspace;
  if (baselinePool.has(workspace.baselines)) workspace.baselines = baselinePool.get(workspace.baselines);
  workspace.floors.forEach(function (f) {
    if (!f || typeof f.scene !== "string" || !floorById.has(f.scene)) return;
    /* Hand back a copy: the live model mutates whatever it is given, and the
       pooled scene has to stay exactly as the snapshot that referenced it left
       it. Registering the copy keeps the NEXT snapshot on one token instead of
       pooling the same storey again per undo. */
    var restored = JSON.parse(JSON.stringify(floorById.get(f.scene)));
    floorTokenFor.set(restored, f.scene);
    f.scene = restored;
  });
  return workspace;
}

/* What has to run after a snapshot is put back, registered by the modules that
   own it rather than reached for by name from here. The floor tab strip is the
   case that forced it: planner_chrome.js is its own <script type="module"> in
   index.html, deliberately outside main.js's graph, so this file cannot import
   it — and calling window.__plannerChrome.renderFloorTabs() instead meant a
   rename would silently stop undo from refreshing the storey tabs, with neither
   link_check nor module_check able to see it. A registration is a named import
   in the other direction, which both of them do check. Same shape as
   onAfterSolve (wall_constraints.js) and onAfterRender (plan2d.js). */
var afterRestore = [];
export function onAfterRestore(fn) {
  if (typeof fn === "function") afterRestore.push(fn);
}

function snap() {
  var m = S.mep;
  return JSON.stringify({
    spatial: exportSpatialProject(S),
    workspace: floorPack(S.workspace),
    // acknowledged constraint warnings: "ignore this one" is an edit like any
    // other, so Ctrl+Z brings the glow back
    ignoredWarnings: S.ignoredWarnings || {},
    blueprintTrace: S.blueprintTrace,
    roof: S.roof,
    idc: S.idc,
    parametric: exportParametricProject(S),
    // MEP geometry is part of the model, so it belongs in the snapshot. ui_mep
    // always pushes history before mutating; while this was missing, every MEP
    // edit pushed a snapshot identical to the current geometry, so the first
    // Ctrl+Z appeared to do nothing and the second reverted an unrelated older
    // edit. Only nodes/runs are tracked — the view flags (show/xray/layer/vis)
    // are display state, like the environment settings above.
    mep: m ? { nodes: m.nodes, runs: m.runs, circuits: m.circuits || [], branches: m.branches || [], profile: m.profile, routePolicy: m.routePolicy || {} } : null,
    smarthome: snapshotSmart(),
  }, texPack);
}
function apply(str) {
  var s;
  try {
    s = JSON.parse(str, texUnpack);
  } catch (err) {
    // A corrupt undo entry is rare (quota / mid-write crash) but wiping the
    // live model for it is worse — keep the current scene and drop the entry.
    return false;
  }
  if (!s || typeof s !== "object") return false;
  if (s.workspace && typeof s.workspace === "object") {
    const previous = S.workspace;
    S.workspace = floorUnpack(JSON.parse(JSON.stringify(s.workspace)));
    if (!rollingBackBaseline && previous?.documentKey && previous.documentKey === S.workspace.documentKey)
      S.workspace.baselines = mergeBaselineArchives(previous.baselines, S.workspace.baselines);
  }
  if (s.spatial) importSpatialProject(S,s.spatial);
  else { S.nodes=s.nodes || [];S.walls=s.walls || [];S.openings=s.openings || [];S.items=s.items || [];S.markers=s.markers || [];S.slabOpenings=s.slabOpenings || [];S.annotations=s.annotations || [];S.roomMeta=s.roomMeta || {}; }
  S.ignoredWarnings = s.ignoredWarnings || {};
  S.blueprintTrace = normalizeBlueprintReference(s.blueprintTrace);
  S.roof = s.roof || null;
  syncBlueprintTraceControls();
  S.warnHover = S.warnSel = null;
  S.conHover = null;
  S.idc = s.idc || 1;
  importParametricProject(S, s.parametric || {});
  rebuildProject(S, FURN);
  /* The active storey's scene was left out of the entry (it is `spatial`), so
     put it back from the model that was just restored — anything reading the
     workspace before the next floor switch, an export most of all, must see a
     storey list that is complete. */
  if (S.workspace && Array.isArray(S.workspace.floors)) {
    try { captureFloor(); } catch (err) { /* floor IO not configured yet */ }
  }
  var m = ensureMEP();
  m.nodes = (s.mep && s.mep.nodes) || [];
  m.runs = (s.mep && s.mep.runs) || [];
  m.circuits = (s.mep && s.mep.circuits) || [];
  m.branches = (s.mep && s.mep.branches) || [];
  if (s.mep && s.mep.profile) m.profile = s.mep.profile;
  m.routePolicy = (s.mep && s.mep.routePolicy) || {};
  m.route = null; // an in-progress polyline can't survive a state swap
  m.place = null;
  loadSmart(s.smarthome);
  S.sel = null;
  /* Undo can run while the wall tool is continuing from an existing endpoint,
     and every transient reference in S points into the model this swap has just
     replaced. One list, shared with the floor switch, which replaces the model
     for the same reason — see cancelDraftGestures() in state.js. */
  cancelDraftGestures();
  S.dirty3D = true;
  render2D();
  fillProps();
  // undo/redo restores whole layouts at once — those enclosures are not new
  // discoveries and must not each pop a "name this room?" prompt
  withoutRoomPrompts(refreshTree);
  afterRestore.forEach(function (fn) {
    try { fn(); } catch (err) { /* one bad listener must not eat the undo */ }
  });
  refreshMEPPanel();
  if (typeof window.__renderSmartHome === "function") window.__renderSmartHome();
  return true;
}

/* ---- the object inventory -------------------------------------------------
   What the history TREE needs on top of the snapshots: which objects each step
   touched, and how they nest. Rather than make eighty-odd pushHistory() call
   sites declare that, it is derived — this reads a snapshot and lists what is
   in it with a signature per object, and edit_history diffs one list against
   the previous one. A step that moved a wall names that wall without the code
   that moved it knowing anything about history.

   The parent links are the ones that survive the model changing shape:
     opening -> the wall it is cut into
     device  -> the wall it is mounted on;  pipe/cable -> the device it feeds
     piece   -> the piece it is stacked on, or the point that reserves it
   Rooms deliberately do NOT parent their walls (a wall belongs to two rooms).
   The room's contents are resolved live instead, by subtree() below. */
function flattenSnap(s) {
  if (!s || typeof s !== "object") return s;
  if (!s.spatial) return s;
  return {
    nodes: s.spatial.nodes,
    walls: s.spatial.walls,
    openings: s.spatial.openings,
    items: s.spatial.instances || s.spatial.items,
    markers: s.spatial.markers,
    slabOpenings: s.spatial.slabOpenings,
    roomMeta: s.spatial.rooms || s.spatial.roomMeta,
    mep: s.mep,
  };
}
function scan(str) {
  var s;
  // no texUnpack: a texture stays the short token it was interned as, so a
  // signature costs a few characters instead of a megabyte of base64
  try {
    s = JSON.parse(str);
  } catch (err) {
    return [];
  }
  if (!s || typeof s !== "object") return [];
  s = flattenSnap(s);
  var out = [],
    nodes = s.nodes || [],
    heldBy = {};
  (s.markers || []).forEach(function (m) {
    if (m && m.itemId != null) heldBy[m.itemId] = m.id;
  });
  function pt(i) {
    var n = nodes[i];
    return n ? n.x + "," + n.z : "-";
  }
  (s.walls || []).forEach(function (w) {
    // a wall's corners are part of what the wall IS: dragging a corner is an
    // edit of the walls that meet there, not of an anonymous node index
    out.push({
      id: "wall:" + w.id,
      kind: "wall",
      label: t("wall") + " " + w.id,
      sig: JSON.stringify(w) + "|" + pt(w.a) + "|" + pt(w.b),
    });
  });
  (s.openings || []).forEach(function (o) {
    out.push({
      id: "opening:" + o.id,
      parent: o.wall != null ? "wall:" + o.wall : null,
      kind: "opening",
      label: t(o.type === "door" ? "door" : o.type === "passage" ? "passage" : "window"),
      sig: JSON.stringify(o),
    });
  });
  (s.items || []).forEach(function (it) {
    out.push({
      id: "item:" + it.id,
      parent: it.on != null ? "item:" + it.on : heldBy[it.id] != null ? "marker:" + heldBy[it.id] : null,
      kind: "item",
      label: flabel(it.type),
      sig: JSON.stringify(it),
    });
  });
  (s.markers || []).forEach(function (m, i) {
    out.push({
      id: "marker:" + m.id,
      kind: "marker",
      label: m.name || "P" + (i + 1),
      sig: JSON.stringify(m),
    });
  });
  (s.slabOpenings || []).forEach(function (o) {
    out.push({
      id: "slabvoid:" + o.id,
      kind: "slabvoid",
      label: o.name || "Void",
      sig: JSON.stringify(o),
    });
  });
  var rm = s.roomMeta || {};
  Object.keys(rm).forEach(function (k) {
    var m = rm[k] || {};
    // `hid` is the room's identity across wall edits (see geometry.js); the
    // key itself is a list of bounding walls and changes whenever they do
    out.push({
      id: "room:" + (m.hid || k),
      kind: "room",
      label: m.name || t("room"),
      sig: JSON.stringify(m),
    });
  });
  var mp = s.mep || {};
  (mp.nodes || []).forEach(function (n) {
    out.push({
      id: "mepnode:" + n.id,
      parent: n.wall != null ? "wall:" + n.wall : null,
      kind: "mep",
      label: nodeLabel(n.sys, n.k),
      sig: JSON.stringify(n),
    });
  });
  (mp.runs || []).forEach(function (r) {
    out.push({
      id: "meprun:" + r.id,
      parent: r.a != null ? "mepnode:" + r.a : null,
      kind: "mep",
      label: runLabel(r.sys, r.k),
      sig: JSON.stringify(r),
    });
  });
  return out;
}

/* What "and everything under it" means for a plan object, resolved against the
   CURRENT model. Containment here is geometric — a room holds the pieces
   standing inside it, which no stored link records — so it cannot be read off
   a snapshot; edit_history unions this with the parent links above, which is
   what keeps a piece that was deleted five steps ago inside its room's
   history. */
function subtree(id) {
  var at = id.indexOf(":"),
    kind = id.slice(0, at),
    key = id.slice(at + 1),
    out = [];
  function stack(itemId) {
    S.items.forEach(function (o) {
      if (String(o.on) !== String(itemId)) return;
      out.push("item:" + o.id);
      stack(o.id);
    });
  }
  function onWall(wid) {
    (S.openings || []).forEach(function (o) {
      if (String(o.wall) === String(wid)) out.push("opening:" + o.id);
    });
    var m = S.mep;
    if (m)
      m.nodes.forEach(function (n) {
        if (String(n.wall) !== String(wid)) return;
        out.push("mepnode:" + n.id);
        fromNode(n.id);
      });
  }
  function fromNode(nid) {
    var m = S.mep;
    if (!m) return;
    m.runs.forEach(function (r) {
      if (String(r.a) === String(nid) || String(r.b) === String(nid)) out.push("meprun:" + r.id);
    });
  }
  if (kind === "item") stack(key);
  else if (kind === "wall") onWall(key);
  else if (kind === "mepnode") fromNode(key);
  else if (kind === "marker") {
    var mk = (S.markers || []).find(function (m) {
      return String(m.id) === key;
    });
    if (mk && mk.itemId != null) {
      out.push("item:" + mk.itemId);
      stack(mk.itemId);
    }
  } else if (kind === "room") {
    var rkey = roomKeyOf(key);
    if (!rkey) return out;
    rkey.split(",").forEach(function (wid) {
      out.push("wall:" + wid);
      onWall(wid);
    });
    var r = roomByKey(rkey);
    if (r) {
      S.items.forEach(function (it) {
        if (!pointInPoly(it.x, it.z, r.pts)) return;
        out.push("item:" + it.id);
        stack(it.id);
      });
      (S.markers || []).forEach(function (m) {
        if (pointInPoly(m.x, m.z, r.pts)) out.push("marker:" + m.id);
      });
      (S.slabOpenings || []).forEach(function (o) {
        if (pointInPoly(o.x, o.z, r.pts)) out.push("slabvoid:" + o.id);
      });
    }
  }
  return out;
}

/* A room is identified by its metadata's `hid` when it has metadata, and by
   its wall-list key when it does not (an enclosure nobody has named yet still
   has contents worth scoping to). Both resolve to the key the geometry uses. */
function roomKeyOf(id) {
  var found = null;
  Object.keys(S.roomMeta).forEach(function (k) {
    var m = S.roomMeta[k];
    if (m && (m.hid === id || k === id)) found = k;
  });
  if (found) return found;
  return roomByKey(id) ? id : null;
}

/* The history panel's idea of "the selected object", and the way back: a chip
   on a step selects what it names, which re-scopes the panel to it. One
   selection model, read in both directions. */
function scopeId() {
  var sel = S.sel;
  if (!sel || !sel.ref) return null;
  if (sel.kind === "item") return "item:" + sel.ref.id;
  if (sel.kind === "wall") return "wall:" + sel.ref.id;
  if (sel.kind === "opening") return "opening:" + sel.ref.id;
  if (sel.kind === "marker") return "marker:" + sel.ref.id;
  if (sel.kind === "slabvoid") return "slabvoid:" + sel.ref.id;
  if (sel.kind === "mepNode") return "mepnode:" + sel.ref.id;
  if (sel.kind === "mepRun") return "meprun:" + sel.ref.id;
  if (sel.kind === "room") {
    var m = S.roomMeta[sel.ref];
    return "room:" + ((m && m.hid) || sel.ref);
  }
  return null; // a bare corner is not an object of its own — its walls are
}
/* What to call the scoped object in the panel's filter chip. The history's own
   record only knows objects a scan has seen, and an enclosure that was never
   named has no record at all — so the name comes from the live model, the same
   one the inspector shows. */
function labelFor(id) {
  var at = id.indexOf(":"),
    kind = id.slice(0, at),
    key = id.slice(at + 1);
  if (kind === "room") {
    var rkey = roomKeyOf(key);
    return (rkey && roomName(rkey)) || t("room");
  }
  if (kind === "item") {
    var it = S.items.find(function (o) {
      return String(o.id) === key;
    });
    if (it) return flabel(it.type);
  }
  if (kind === "wall") return t("wall") + " " + key;
  return "";
}

function pick(id) {
  var at = id.indexOf(":"),
    kind = id.slice(0, at),
    key = id.slice(at + 1);
  function byId(list) {
    return (list || []).find(function (o) {
      return String(o.id) === key;
    });
  }
  function as(k, list) {
    var ref = byId(list);
    return ref ? { kind: k, ref: ref } : null;
  }
  var m = S.mep,
    sel = null;
  if (kind === "item") sel = as("item", S.items);
  else if (kind === "wall") sel = as("wall", S.walls);
  else if (kind === "opening") sel = as("opening", S.openings);
  else if (kind === "marker") sel = as("marker", S.markers);
  else if (kind === "slabvoid") sel = as("slabvoid", S.slabOpenings);
  else if (kind === "mepnode") sel = m && as("mepNode", m.nodes);
  else if (kind === "meprun") sel = m && as("mepRun", m.runs);
  else if (kind === "room") {
    Object.keys(S.roomMeta).forEach(function (k) {
      var mm = S.roomMeta[k];
      if (mm && (mm.hid === key || k === key)) sel = { kind: "room", ref: k };
    });
  }
  // an object the step deleted has nothing to select; the panel keeps its
  // scope on it anyway, which is the only way to read its history at all
  if (!sel) return;
  select(sel);
  render2D();
  refreshTree();
  refreshHistoryPanel();
}

const H = createHistory({
  get: snap,
  set: apply,
  cap: CAP,
  scan: scan,
  subtree: subtree,
  onChange: function () {
    markDirty();
    refreshHistoryPanel();
  },
});

/* ---- command transaction boundary --------------------------------------
   Commands may batch several mutations into one undo step. The opaque token
   makes ownership explicit: legacy gesture helpers cannot commit, cancel or
   push over a command transaction, and a stale token cannot close a later
   transaction. These transactions are synchronous by design. */
var transactionSeq = 0,
  activeTransaction = null;

function requireNoCommandTransaction(action) {
  if (activeTransaction) throw new Error("Cannot " + action + " during an active history transaction");
}
function requireTransaction(token) {
  if (!activeTransaction || token !== activeTransaction) throw new Error("Invalid history transaction token");
}

export function beginHistoryTransaction(label) {
  if (activeTransaction || H.isPending()) throw new Error("A history transaction is already active");
  var token = Object.freeze({ id: ++transactionSeq });
  H.begin(label || "");
  if (!H.isPending()) throw new Error("Could not begin history transaction");
  activeTransaction = token;
  return token;
}
export function commitHistoryTransaction(token, label) {
  requireTransaction(token);
  if (!H.commit(label)) throw new Error("Could not commit history transaction");
  activeTransaction = null;
  return true;
}
export function abortHistoryTransaction(token) {
  requireTransaction(token);
  rollingBackBaseline = true;
  try { if (!H.abort()) throw new Error("Could not abort history transaction"); }
  finally { rollingBackBaseline = false; }
  activeTransaction = null;
  return true;
}

/* Read-only projections for commands, tutors and transports. H owns Maps,
   Sets and mutable node records; none of those references cross this module. */
function cloneJSON(value) {
  return JSON.parse(JSON.stringify(value));
}
export function currentHistoryId() {
  return H.position();
}
export function historyTree() {
  return cloneJSON(H.tree());
}
export function historyTargets(id) {
  return cloneJSON(H.targetsOf(id));
}
export function historyObjects() {
  var out = [];
  H.objects().forEach(function (value, id) {
    out.push({
      id: id,
      label: value && value.label ? value.label : "",
      kind: value && value.kind ? value.kind : "",
      parent: value && value.parent != null ? value.parent : null,
    });
  });
  return cloneJSON(out);
}
export function historyScope(id) {
  return Array.from(H.scope(id), String);
}
export function historyTouches(nodeId, objectIds) {
  var ids = new Set((objectIds || []).map(String));
  return H.touches(nodeId, ids);
}

/* ---- the panel ----------------------------------------------------------- */
/* Redrawing the panel is NOT cheap, which is easy to miss because nothing in
   this file appears to snapshot: the tree it draws asks edit_history for the
   current step's targets, liveTargets() re-reads the live model through get(),
   and get() is snap() — a JSON.stringify of the whole project. So every
   refresh costs a full snapshot.
   The panel is mounted into #planHist, which index.html puts inside the
   toolbar's history dropdown; that menu is `display:none` until its trigger is
   clicked, i.e. essentially always. Two of the four snapshots the perf harness
   measured per drag gesture came from here, for a list nobody was looking at:
   one from the fillProps() on pointerdown, one from the onChange the commit
   fires. A refresh asked for while the panel is off screen is therefore
   remembered rather than performed, and paid back the moment it is shown. */
var panel = null,
  panelShown = false,
  panelStale = false;
export function mountHistoryPanel(host) {
  if (!host || panel) return;
  panel = createHistoryPanel(H, {
    head: false, // the sidebar section already has a heading
    showBaseline: true,
    scope: scopeId,
    scopeLabel: labelFor,
    onPick: pick,
  });
  host.appendChild(panel.el);
  watchPanelVisibility();
}
/* Visibility is observed, not polled and not asked of the DOM at refresh time:
   nothing tells history.js that the dropdown opened, and ui.js portals the open
   menu to <body>, so any check anchored on the host would go stale. An
   IntersectionObserver follows the element through that move and reports both
   edges, and the one that matters is the rising one — that is the moment a
   skipped refresh has to be paid back. Where there is no observer the panel is
   treated as permanently visible, which is exactly the old behaviour. */
function watchPanelVisibility() {
  if (typeof IntersectionObserver !== "function") {
    panelShown = true;
    return;
  }
  new IntersectionObserver(function (entries) {
    var e = entries[entries.length - 1];
    if (!e) return;
    panelShown = !!e.isIntersecting;
    if (panelShown && panelStale) {
      panelStale = false;
      panel.refresh();
    }
  }).observe(panel.el);
}
// selection changes re-scope the panel, so fillProps() calls this too
export function refreshHistoryPanel() {
  if (!panel) return;
  if (!panelShown) {
    panelStale = true;
    return;
  }
  panel.refresh();
}

// snapshot the CURRENT state as an undo point (call BEFORE mutating).
// Every model mutation in the app funnels through here or commitPending(), so
// these two are also the autosave triggers — no separate change detection.
// `tag` is optional and collapses a run of pushes carrying the same tag into
// one entry, for edits that fire repeatedly (a dimension typed digit by digit).
export function pushHistory(label, tag) {
  requireNoCommandTransaction("push history");
  H.push(label, tag);
}
// drag pattern: capture on pointerdown, commit only if a move actually happens
export function beginHistory() {
  requireNoCommandTransaction("begin history");
  H.begin();
}
/* Every drag in the plan goes through one commit, and the gesture already
   knows what it is (S.action). Naming the step here is what saves sprinkling a
   label over a dozen pointermove branches — and a drag is the one edit whose
   verb the diff cannot recover: a piece that moved and a piece that was
   resized both read as "the piece changed". */
const DRAG_LABEL = {
  item: "h_move",
  room: "h_moveRoom",
  node: "h_moveCorner",
  opening: "h_moveOpening",
  marker: "h_movePoint",
  markerElev: "h_pointElev",
  itemElev: "h_move",
  openingElev: "h_moveOpening",
  mep: "h_moveMEP",
};
export function commitPending(label) {
  requireNoCommandTransaction("commit pending history");
  H.commit(label || (DRAG_LABEL[S.action] ? t(DRAG_LABEL[S.action]) : ""));
}
export function cancelPending() {
  requireNoCommandTransaction("cancel pending history");
  H.cancel();
}

export function undo() {
  requireNoCommandTransaction("undo");
  var changed = H.undo();
  if (changed && typeof window !== "undefined") window.dispatchEvent(new CustomEvent("plan-undo"));
  return changed;
}
export function redo() {
  requireNoCommandTransaction("redo");
  var changed = H.redo();
  if (changed && typeof window !== "undefined") window.dispatchEvent(new CustomEvent("plan-redo"));
  return changed;
}
export function canUndo() {
  return H.canUndo();
}
export function canRedo() {
  return H.canRedo();
}

// In-memory checkpoints are used for cancelled drags and isolated practice.
export function captureHistorySession(portable=false) {
  requireNoCommandTransaction("capture session");
  const model=snap(),history=H.saveSession();
  return {model,history,...(portable?{pools:{tex:[...texById],floors:[...floorById],baselines:[...baselinePool],texSeq,floorSeq,baselineSeq}}:{})};
}
export function restoreHistorySession(saved) {
  requireNoCommandTransaction("restore session");
  if (!saved) return false;
  if(saved.pools){
    for(const [k,v] of saved.pools.tex){texById.set(k,v);texKeyFor.set(v,k);}
    for(const [k,v] of saved.pools.floors)floorById.set(k,v);
    for(const [k,v] of saved.pools.baselines)baselinePool.set(k,v);
    texSeq=Math.max(texSeq,saved.pools.texSeq);floorSeq=Math.max(floorSeq,saved.pools.floorSeq);baselineSeq=Math.max(baselineSeq,saved.pools.baselineSeq);
  }
  rollingBackBaseline = true;
  try { apply(saved.model); H.loadSession(saved.history); }
  finally { rollingBackBaseline = false; }
  return true;
}
