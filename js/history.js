// Undo/redo via JSON snapshots of the model (walls/rooms/openings/furniture/MEP).
// Display/environment settings (time, north, floor, wall color) are intentionally NOT tracked.
//
// The stack machinery lives in edit_history.js and is shared with the CAD
// modeler and the cabinet designer; what stays here is what is specific to the
// plan — which fields make up a snapshot, how one is put back, and the texture
// pool that keeps snapshots small.
import { createHistory } from "./edit_history.js";
import { createHistoryPanel } from "./ui_history.js";
import { S } from "./state.js";
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

const CAP = 80;

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
  // only swap back tokens we actually issued, so an unrelated string that
  // happens to look like one passes through untouched
  if (typeof value === "string" && texById.has(value)) return texById.get(value);
  return value;
}

function snap() {
  var m = S.mep;
  return JSON.stringify({
    spatial: exportSpatialProject(S),
    // acknowledged constraint warnings: "ignore this one" is an edit like any
    // other, so Ctrl+Z brings the glow back
    ignoredWarnings: S.ignoredWarnings || {},
    blueprintTrace: S.blueprintTrace,
    idc: S.idc,
    parametric: exportParametricProject(S),
    // MEP geometry is part of the model, so it belongs in the snapshot. ui_mep
    // always pushes history before mutating; while this was missing, every MEP
    // edit pushed a snapshot identical to the current geometry, so the first
    // Ctrl+Z appeared to do nothing and the second reverted an unrelated older
    // edit. Only nodes/runs are tracked — the view flags (show/xray/layer/vis)
    // are display state, like the environment settings above.
    mep: m ? { nodes: m.nodes, runs: m.runs, routePolicy: m.routePolicy || {} } : null,
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
  if (s.spatial) importSpatialProject(S,s.spatial);
  else { S.nodes=s.nodes || [];S.walls=s.walls || [];S.openings=s.openings || [];S.items=s.items || [];S.markers=s.markers || [];S.slabOpenings=s.slabOpenings || [];S.roomMeta=s.roomMeta || {}; }
  S.ignoredWarnings = s.ignoredWarnings || {};
  S.blueprintTrace = normalizeBlueprintReference(s.blueprintTrace);
  syncBlueprintTraceControls();
  S.warnHover = S.warnSel = null;
  S.conHover = null;
  S.idc = s.idc || 1;
  importParametricProject(S, s.parametric || {});
  rebuildProject(S, FURN);
  var m = ensureMEP();
  m.nodes = (s.mep && s.mep.nodes) || [];
  m.runs = (s.mep && s.mep.runs) || [];
  m.routePolicy = (s.mep && s.mep.routePolicy) || {};
  m.route = null; // an in-progress polyline can't survive a state swap
  m.place = null;
  loadSmart(s.smarthome);
  S.sel = null;
  /* Transient references into the OLD model (the wall under the cursor, the
     piece mid-snap-flash, the drop target) point at objects this swap has just
     replaced — they must not survive into the render below. */
  S.wallProbe = null;
  S.snapFlash = null;
  S.snapFlashKey = null;
  S.hoverItem = null;
  S.stackHost = null;
  S.nodeDrag = null;
  S.dragRoom = null;
  /* Undo can run while the wall tool is continuing from an existing endpoint.
     `drawFrom` is a node index in the model we just replaced, so retaining the
     rubber-band state makes plan2d dereference a missing (or unrelated) node
     on its very next render.  Treat an undo/redo state swap like cancelling
     every other in-progress gesture: the tool may remain armed, but a fresh
     click must establish its start point in the restored model. */
  S.drawing = false;
  S.drawFrom = null;
  S.drawFromSplit = false;
  S.drawWalls = [];
  S.wallPress = null;
  S.previewPt = null;
  S.snapGuides = [];
  S.snapInfo = null;
  S.markerPreview = null;
  S.mepDrag = null;
  S.panStart = null;
  S.segPreview = null;
  S.action = null;
  S.dirty3D = true;
  render2D();
  fillProps();
  // undo/redo restores whole layouts at once — those enclosures are not new
  // discoveries and must not each pop a "name this room?" prompt
  withoutRoomPrompts(refreshTree);
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

/* ---- the panel ----------------------------------------------------------- */
var panel = null;
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
}
// selection changes re-scope the panel, so fillProps() calls this too
export function refreshHistoryPanel() {
  if (panel) panel.refresh();
}

// snapshot the CURRENT state as an undo point (call BEFORE mutating).
// Every model mutation in the app funnels through here or commitPending(), so
// these two are also the autosave triggers — no separate change detection.
// `tag` is optional and collapses a run of pushes carrying the same tag into
// one entry, for edits that fire repeatedly (a dimension typed digit by digit).
export function pushHistory(label, tag) {
  H.push(label, tag);
}
// drag pattern: capture on pointerdown, commit only if a move actually happens
export function beginHistory() {
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
  H.commit(label || (DRAG_LABEL[S.action] ? t(DRAG_LABEL[S.action]) : ""));
}
export function cancelPending() {
  H.cancel();
}

export function undo() {
  H.undo();
}
export function redo() {
  H.redo();
}
export function canUndo() {
  return H.canUndo();
}
export function canRedo() {
  return H.canRedo();
}
