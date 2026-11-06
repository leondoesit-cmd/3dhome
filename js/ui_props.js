import { fillRoomBoundaries } from "./ui_room_boundaries.js";
import { roomMeasurements } from "./room_summary.js";
import { roomClearArea } from "./room_area.js";
import { S, hexStr, TILE } from "./state.js";
import { previewUrlFor } from "./material_library.js";
import { wallById, roomByKey, roomFloor, roomName, wallGeom, itemsInRoom, wallClearLength, wallDimSide, wallSideNormal, jointInfo, nodeDegree } from "./geometry.js";
import { flabel, isLamp, lampColor, variantList, variantOf, vlabel, itemVSpan } from "./furniture.js";
import { t } from "./i18n.js";
import { displayUnit, fmtLen, writeLen, parseLen, unitLabel, fmtAreaM2 } from "./display_units.js";
import { refreshTree } from "./ui_tree.js";
import { fillMEP } from "./ui_mep.js";
import { fillItemSmart } from "./ui_smarthome.js";
import { fillSpecRow } from "./ui_prodsize.js";
import { markerItem, markerLabel, markerInfo } from "./markers.js";
import { ceilingHeight } from "./elevation.js";
import { hostOf, detach as stackDetach } from "./stack.js";
import { releaseHold } from "./item_align.js";
import { renderRoomCons } from "./ui_params.js";
import { pushHistory, refreshHistoryPanel } from "./history.js";
import { render2D } from "./plan2d.js";
import { flash } from "./ui.js";
import { isLocked, jointWarnings, ignoreWarning, unignoreWarning } from "./constraint_engine.js";
import { squarableArm } from "./joint_square.js";
import {
  consForWall, conCurrent, conError, conSatisfied, anchorLabel, removeCon,
  setConValue, flipConDirection, setConSuppressed, setConFaces, solveWallCons,
  angleSectorAtNode, CON_TOL_L, CON_TOL_A, setConReport, repin, conLabelText,
  conUnit, conDrivable, pinnedNodes, wallCons,
} from "./wall_constraints.js";
import { frameSpec } from "./view3d.js";
import { renderWarnPanel, setConstraintHover } from "./ui_warn.js";
import { syncInspectorPreview } from "./inspector_preview.js";
import {
  ensureWallTypes,
  normalizeWall,
  wallPhase,
  wallThickness,
  wallTypeById,
  wallLayers,
  wallLayerBands,
} from "./wall_types.js";
import {
  normalizeWallGeometry,
  normalizeWallKind,
  normalizeWallProfile,
  wallProfileHeight,
  verticalSegments,
} from "./wall_curves.js";
import {
  fillProps, roomMetaFor, selLamp, syncPinBtn,
} from "./ui_props/cons.js";
import {
  fillJoint, refreshMarkerReadout, syncWallEnd, syncWallSide,
} from "./ui_props/wall_sync.js";
import {
  conRow, fillWallElevation, openWallTypes, wallTakeoffRows,
} from "./ui_props/wall_panels.js";
import { wallFaceMaterials, wallFlipSymmetric } from "./ui_props/wall_tabs.js";
export { wallFaceMaterials, wallFlipSymmetric };
export { wallTakeoffRows };
export { fillJoint, refreshMarkerReadout, syncWallEnd, syncWallSide };
export { fillProps, roomMetaFor, selLamp };

function fillWallEndActions(wall) {
  let host = document.getElementById("wallEndActions");
  if (!host) { host = document.createElement("div"); host.id = "wallEndActions"; document.getElementById("w_len").closest(".dim-row").after(host); }
  host.replaceChildren();
  for (const warning of jointWarnings().filter(w => w.kind === "openEnd" && w.walls.includes(wall.id))) {
    const button = document.createElement("button");
    button.textContent = t(warning.ignored ? "cw_restoreFreeEnd" : "cw_markFreeEnd") + " · " + warning.key.split(":").pop().toUpperCase();
    button.onclick = () => { pushHistory(); if(warning.ignored) unignoreWarning(warning.key); else ignoreWarning(warning.key); fillWallEndActions(wall); renderWarnPanel(true); render2D(); };
    host.append(button);
  }
}

function inspectorUnit() {
  return displayUnit();
}

function inspectorLen(cm, options) {
  return fmtLen(cm, options);
}

function writeInspectorLen(id, cm) {
  writeLen(document.getElementById(id), cm);
}

/* The stacking link, in the inspector: which piece this one stands on, and a
   way out of it that does not require dragging (a piece buried under a pile is
   awkward to grab in the plan). Read-only otherwise — the link itself is made
   by dropping, which is the gesture that can also choose WHERE on the host. */
function fillStackRow(it) {
  var row = document.getElementById("i_stack_row");
  if (!row) return;
  row.innerHTML = "";
  var host = hostOf(it);
  if (!host) {
    row.style.display = "none";
    return;
  }
  row.style.display = "flex";
  var icon = document.createElement("i");
  icon.className = "ph ph-stack-simple";
  var name = document.createElement("span");
  name.className = "ps-spec-name";
  name.style.color = "";
  name.textContent = t("stack_lbl") + ": " + flabel(host.type);
  var hgt = document.createElement("span");
  hgt.className = "ps-spec-dims";
  hgt.textContent = fmtLen(it.elev || 0, { domain: "furniture" });
  var off = document.createElement("button");
  off.className = "ps-spec-clear";
  off.innerHTML = '<i class="ph ph-arrow-line-down"></i>';
  off.title = t("stack_detach");
  off.onclick = function () {
    pushHistory();
    stackDetach(it);
    S.dirty3D = true;
    fillProps();
    render2D();
  };
  row.appendChild(icon);
  row.appendChild(name);
  row.appendChild(hgt);
  row.appendChild(off);
}


/* The "held against a wall" link, in the item inspector: which wall, at what
   gap, and the way out of it. Mirrors fillStackRow — the two are the same
   shape of statement about a piece ("this one follows that one"), so they read
   the same way in the panel. */
function fillHoldRow(it) {
  var row = document.getElementById("i_hold_row");
  if (!row) return;
  row.innerHTML = "";
  var w = it.hold && wallById(it.hold.wall);
  if (!w) {
    row.style.display = "none";
    return;
  }
  row.style.display = "flex";
  var icon = document.createElement("i");
  icon.className = "ph ph-magnet";
  var name = document.createElement("span");
  name.className = "ps-spec-name";
  name.textContent = t("it_held", { id: w.id, gap: Math.round(it.hold.gap || 0) });
  var off = document.createElement("button");
  off.className = "ps-spec-clear";
  off.innerHTML = '<i class="ph ph-x"></i>';
  off.title = t("it_release");
  off.onclick = function () {
    pushHistory();
    releaseHold(it);
    S.dirty3D = true;
    fillProps();
    render2D();
  };
  row.appendChild(icon);
  row.appendChild(name);
  row.appendChild(off);
}

var panels = {
  empty: document.getElementById("emptyProps"),
  wall: document.getElementById("wallProps"),
  walls: document.getElementById("wallMultiProps"),
  item: document.getElementById("itemProps"),
  items: document.getElementById("itemsProps"),
  opening: document.getElementById("openProps"),
  room: document.getElementById("roomProps"),
  marker: document.getElementById("markerProps"),
  slabvoid: document.getElementById("slabvoidProps"),
  node: document.getElementById("nodeProps"),
  con: document.getElementById("conProps"),
  mep: document.getElementById("mepProps"),
};

function showPanel(name) {
  for (var k in panels)
    if (panels[k]) panels[k].classList.toggle("on", k === name);
  if (name === "empty") syncNextSteps();
}

/* The empty inspector's "Next step" list kept offering "Draw a room" over a
   finished, furnished flat. Each step goes once it is done; so does the list. */
function syncNextSteps() {
  var box = panels.empty && panels.empty.querySelector(".empty-next");
  if (!box) return;
  var done = {
    hintRect: (S.walls || []).length > 0,
    hintDoor: (S.openings || []).length > 0,
    hintLibrary: (S.items || []).length > 0,
  };
  var left = 0;
  box.querySelectorAll("button[data-act]").forEach(function (b) {
    var hide = !!done[b.dataset.act];
    b.hidden = hide;
    if (!hide) left++;
  });
  box.hidden = !left;
}

/* The wall definition controls are generated from the project catalogue.  A
   project can carry custom definitions, so hard-coding this list in the HTML
   would make imported types impossible to select. */
function fillWallTypeSelect(id, selected) {
  var el = document.getElementById(id);
  if (!el) return;
  ensureWallTypes(S);
  var wanted = String(selected || "generic");
  el.innerHTML = "";
  S.wallTypes.forEach(function (type) {
    var option = document.createElement("option");
    option.value = type.id;
    option.textContent = type.name + " · " + fmtLen(type.thickness, { domain: "details" });
    el.appendChild(option);
  });
  el.value = wanted;
  if (!el.value) el.value = "generic";
}

function datumForControl(value) {
  return {
    exterior: "outer",
    "main-exterior": "mainOutside",
    "main-interior": "mainInside",
    interior: "inner",
  }[value] || (["outer", "mainOutside", "center", "mainInside", "inner"].indexOf(value) !== -1 ? value : "center");
}

function baseProfileEnds(wall, length) {
  var source = wall && wall.profile && !Array.isArray(wall.profile) && Array.isArray(wall.profile.base)
    ? wall.profile.base
    : Array.isArray(wall && wall.baseProfile) ? wall.baseProfile : [];
  if (!source.length) return [0, 0];
  var points = source.map(function (entry) {
    if (Array.isArray(entry)) return { s: Number(entry[0]) || 0, height: Number(entry[1]) || 0 };
    return { s: Number(entry && (entry.s ?? entry.distance)) || 0, height: Number(entry && (entry.height ?? entry.h ?? entry.y)) || 0 };
  }).sort(function (a, b) { return a.s - b.s; });
  function at(s) {
    if (s <= points[0].s) return points[0].height;
    for (var i = 1; i < points.length; i++) {
      if (s > points[i].s) continue;
      var a = points[i - 1], b = points[i], span = b.s - a.s;
      return span > 1e-9 ? a.height + (b.height - a.height) * ((s - a.s) / span) : b.height;
    }
    return points[points.length - 1].height;
  }
  return [at(0), at(length)];
}

export function select(s) {
  // a new selection drops the per-wall "which half do I edit" pick
  if (!s || s.kind !== "wall" || !S.sel || S.sel.ref !== s.ref) {
    S.wallEditEnd = null;
    S.wallHoverHalf = null;
    // ...and the opening the wall panel was dimensioning
    S.wallOpenFocus = null;
  }
  // ...and the picked constraint warning, which was a selection of its own.
  // ui_warn's focusWarning selects FIRST and marks the warning after, so
  // picking a message row is not undone by this.
  S.warnSel = null;
  S.sel = s;
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("planner-selection"));
  // Selection is shared between the plan and 3D panes. Repaint is enough: the
  // 3D scene keeps a lightweight outline helper and does not need a rebuild.
  S.repaint3D = true;
  fillProps();
  // the history panel is scoped to the selection: picking an object is also
  // the gesture that asks "what happened to this one?"
  refreshHistoryPanel();
}

/* The dimension lock, in the wall inspector: what the constraint engine is
   holding for this wall, and the switch that opts it out. A locked wall shows
   the exact length and angle it will be restored to when an edit at one of its
   corners tries to deform it. */
function fillWallLock(w) {
  var state = document.getElementById("w_lockState"),
    btn = document.getElementById("w_lockBtn"),
    lbl = document.getElementById("w_lockLabel");
  if (!state || !btn || !lbl) return;
  var on = isLocked(w);
  btn.classList.toggle("active", on);
  btn.setAttribute("aria-pressed", on ? "true" : "false");
  var ic = btn.querySelector("i");
  if (ic) {
    ic.classList.remove("ph-lock-key", "ph-lock-key-open");
    ic.classList.add(on ? "ph-lock-key" : "ph-lock-key-open");
  }
  lbl.textContent = t(on ? "cw_lockOn" : "cw_lockOff");
  // the header carries the same switch, so the state reads without a tab change
  var quick = document.getElementById("w_lockQuick");
  if (quick) {
    quick.classList.toggle("active", on);
    quick.setAttribute("aria-pressed", on ? "true" : "false");
    quick.title = t(on ? "cw_lockOn" : "cw_lockOff");
    var qi = quick.querySelector("i");
    if (qi) {
      qi.classList.remove("ph-lock-key", "ph-lock-key-open");
      qi.classList.add(on ? "ph-lock-key" : "ph-lock-key-open");
    }
  }
  // quote the FACE length, the same basis as #w_len and the plan label
  state.textContent = on
    ? t("cw_holding", {
        L: inspectorLen(w.lockClearL != null ? w.lockClearL : wallClearLength(w)),
        a: Math.round(
          w.lockAng != null ? w.lockAng : (wallGeom(w).ang * 180) / Math.PI,
        ),
      })
    : t("cw_free");
}

/* ---- the wall's dimensions to OTHER geometry ----------------------------
   One row per constraint: what it measures, the number it is holding (editable
   in place), and how far the drawing currently is from honouring it. A row
   that is out shows the gap rather than quietly correcting it, because a
   constraint the solver could not satisfy is real information — usually two
   dimensions that cannot both be true. */
/* Both the per-wall list and the single-dimension panel name a relation
   through conLabelText(), so the two can never drift into calling the same
   thing by different names — and a new constraint type is named once, where
   it is defined, instead of in every list that renders it. The English
   fallbacks that used to live here were also untranslated. */
function conRowLabel(c) {
  return conLabelText(c, t);
}

function conIsAngular(c) {
  return conUnit(c) === "deg";
}
function conHasValue(c) {
  return conDrivable(c);
}
function conCanFlip(c) {
  if (!c) return false;
  if (["dist", "alignX", "alignZ", "axisDistX", "axisDistZ", "coincident",
    "symmetric", "wallAngle", "angle", "equalAngle"].indexOf(c.type) !== -1)
    return true;
  return c.wall != null && c.ref != null && c.type !== "pointWallDist";
}

function fillWallCons(w) {
  var list = document.getElementById("w_conList"),
    badge = document.getElementById("w_conBadge"),
    hint = document.getElementById("w_conHint");
  if (!list) return;
  list.innerHTML = "";
  var cons = consForWall(w);
  var bad = cons.filter(function (c) {
    return !conSatisfied(c);
  }).length;
  if (badge) {
    badge.hidden = !bad;
    badge.textContent = String(bad);
  }
  if (hint)
    hint.textContent = S.conPick ? t("wc_pick_" + S.conPick.kind) : cons.length ? "" : t("wc_empty");
  var tabBadge = document.getElementById("w_tabBadgeCon");
  if (tabBadge) {
    tabBadge.hidden = !bad;
    tabBadge.textContent = String(bad);
  }
  /* A pick in progress, or a dimension the solver could not honour, is the one
     thing in this panel that has to be looked at now — so it brings its own
     tab forward instead of quietly waiting behind another one. */
  if (S.conPick || bad) wallTab("joints");
  if (!cons.length) return;

  cons.forEach(function (c) {
    list.appendChild(conRow(c));
  });
}

function wallKindLabel(kind) {
  return t({
    normal: "wallKindNormal",
    roomDivider: "wallKindDivider",
    half: "wallKindHalf",
    pony: "wallKindPony",
    railing: "wallKindRailing",
  }[kind] || "wallKindNormal");
}

/* ---- the inspector's five panes ----------------------------------------
   The wall panel answers five different questions and used to stack all of
   them at once. The tab is remembered on S so re-selecting a wall (or a
   rebuild after an edit) lands where the user was working, and any code that
   needs a pane — a constraint pick, an out-of-tolerance dimension — asks for
   it by name rather than opening an accordion. */
var WALL_TABS = ["dims", "assembly", "openings", "joints", "finish"];

export function wallTab(name) {
  if (WALL_TABS.indexOf(name) === -1) name = "dims";
  S.wallTab = name;
  var props = document.getElementById("wallProps");
  if (props) props.dataset.wallTab = name;
  var strip = document.getElementById("w_tabs");
  if (strip)
    strip.querySelectorAll("button[data-wtab]").forEach(function (b) {
      var on = b.dataset.wtab === name;
      b.classList.toggle("active", on);
      b.setAttribute("aria-selected", on ? "true" : "false");
      b.tabIndex = on ? 0 : -1;
    });
  document.querySelectorAll("#wallProps .wi-pane").forEach(function (p) {
    p.classList.toggle("active", p.dataset.wpane === name);
  });
}

var wallTabsBound = false;
function set_wallTabsBound(value) { return wallTabsBound = value; }

/* ---- wall diagrams: cross-section + elevation ---------------------------
   The inspector described the wall only in numbers and selects; these two
   inline SVGs draw what the model already knows — the layered assembly in
   plan section (the same datum-relative bands the 3D builder extrudes) and
   the front elevation with every opening to scale. Both are now the shortest
   way to ask a question of the wall too: hovering a layer reads it out,
   clicking a face in the section moves the thickness datum onto it, and an
   opening in the elevation selects and dimensions itself. Everything they
   draw is re-read from the model, so a diagram can never disagree with it. */

/* bindNum edits mutate the wall without re-running fillProps, so the
   diagrams re-render themselves off any input/change inside the panel
   (rAF-throttled — a thickness keystroke must not cost an SVG rebuild per
   key). The model is already updated by the time this bubble-phase handler
   runs. */
var wallDiagramBound = false;
function set_wallDiagramBound(value) { return wallDiagramBound = value; }

/* A placeholder point picks its piece from the library browser (ui_libpick.js),
   not a <select>: you choose by picture, and the browser reaches every FURN
   entry rather than only what the CATALOG tree files. */

/* The rule for WHICH arm a corner squares by swinging lives in joint_square.js,
   with the placement it feeds and away from the DOM, so it can be tested on
   plain geometry. Re-exported here because the inspector and the plan's action
   handler have always asked this module for it. */
export { squarableArm };
// for js/ui_props/cons.js (live bindings: it sees every reassignment)
export {
  baseProfileEnds, conCanFlip, datumForControl, fillHoldRow, fillStackRow,
  fillWallCons, fillWallEndActions, fillWallLock, fillWallTypeSelect,
  showPanel, writeInspectorLen,
};
// for js/ui_props/wall_panels.js (live bindings: it sees every reassignment)
export {
  conHasValue, conIsAngular, conRowLabel, inspectorLen, set_wallDiagramBound,
  wallDiagramBound,
};
// for js/ui_props/wall_tabs.js (live bindings: it sees every reassignment)
export { set_wallTabsBound, wallKindLabel, wallTabsBound };

