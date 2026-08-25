import { S, hexStr, TILE } from "./state.js";
import { wallById, roomByKey, roomFloor, roomName, wallGeom, itemsInRoom, wallClearLength, wallDimSide, wallSideNormal, jointInfo, nodeDegree } from "./geometry.js";
import { flabel, isLamp, lampColor, variantList, variantOf, vlabel, itemVSpan } from "./furniture.js";
import { t } from "./i18n.js";
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
import { isLocked } from "./constraint_engine.js";
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
  hgt.textContent = Math.round(it.elev || 0) + " " + t("cm");
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
    option.textContent = type.name + " · " + Math.round(type.thickness * 10) / 10 + " " + t("cm");
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
  if (ic) ic.className = on ? "ph ph-lock-key" : "ph ph-lock-key-open";
  lbl.textContent = t(on ? "cw_lockOn" : "cw_lockOff");
  // the header carries the same switch, so the state reads without a tab change
  var quick = document.getElementById("w_lockQuick");
  if (quick) {
    quick.classList.toggle("active", on);
    quick.setAttribute("aria-pressed", on ? "true" : "false");
    quick.title = t(on ? "cw_lockOn" : "cw_lockOff");
    var qi = quick.querySelector("i");
    if (qi) qi.className = on ? "ph ph-lock-key" : "ph ph-lock-key-open";
  }
  // quote the FACE length, the same basis as #w_len and the plan label
  state.textContent = on
    ? t("cw_holding", {
        L: Math.round(
          w.lockClearL != null ? w.lockClearL : wallClearLength(w),
        ),
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
function bindWallTabs() {
  if (wallTabsBound) return;
  var strip = document.getElementById("w_tabs");
  if (!strip) return;
  wallTabsBound = true;
  strip.setAttribute("aria-orientation", "horizontal");
  var tabs = Array.from(strip.querySelectorAll("button[data-wtab]"));
  tabs.forEach(function (tab) {
    var name = tab.dataset.wtab;
    var pane = document.querySelector('#wallProps .wi-pane[data-wpane="' + name + '"]');
    tab.id = tab.id || "w_tab_" + name;
    if (pane) {
      pane.id = pane.id || "w_pane_" + name;
      tab.setAttribute("aria-controls", pane.id);
      pane.setAttribute("aria-labelledby", tab.id);
    }
  });
  strip.addEventListener("click", function (e) {
    var b = e.target.closest("button[data-wtab]");
    if (b) wallTab(b.dataset.wtab);
  });
  strip.addEventListener("keydown", function (e) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
    var current = e.target.closest("button[data-wtab]");
    var index = tabs.indexOf(current);
    if (index < 0) return;
    e.preventDefault();
    if (e.key === "Home") index = 0;
    else if (e.key === "End") index = tabs.length - 1;
    else {
      var rtl = getComputedStyle(strip).direction === "rtl";
      var forward = e.key === "ArrowRight" ? !rtl : rtl;
      index = (index + (forward ? 1 : -1) + tabs.length) % tabs.length;
    }
    tabs[index].focus();
    wallTab(tabs[index].dataset.wtab);
  });
}

function phaseKey(phase) {
  return phase === "new" ? "wallPhaseNew" : phase === "demolition" ? "wallPhaseDemolish" : "wallPhaseExisting";
}

/* The solid height of the wall, taken the way the schedule takes it: the
   vertical segments a type actually builds, not the nominal storey height. A
   railing or a half wall is shorter than w.height and its area must say so. */
function wallSolidHeight(w) {
  var segs = verticalSegments(w, function (id) { return wallTypeById(S, id); });
  var h = segs.reduce(function (sum, sg) {
    return sum + (sg.solid === false ? 0 : Math.max(0, sg.top - sg.bottom));
  }, 0);
  return h > 0 ? h : Math.max(0, Number(w.height) || 0);
}

function wallOpeningsOf(w) {
  return (S.openings || []).filter(function (o) {
    return o.wall === w.id;
  }).sort(function (a, b) {
    return (a.s || 0) - (b.s || 0);
  });
}

function wallOpeningArea(w, L, H) {
  return wallOpeningsOf(w).reduce(function (sum, o) {
    var width = Math.max(0, Math.min(L, Number(o.width) || 0));
    var sill = Math.max(0, Number(o.sill) || 0);
    var top = Math.min(H, sill + Math.max(0, Number(o.height) || 0));
    return sum + width * Math.max(0, top - Math.min(H, sill));
  }, 0);
}

function m2(v) {
  return (Math.round(v / 100) / 100).toFixed(2) + " " + t("sqm");
}

function meters(cm) {
  return (Math.round(cm) / 100).toFixed(2) + " " + t("m");
}

/* The architectural summary line, as chips: the three dimensions plus the one
   number that is always asked for next and never shown — the surface actually
   left to build, plaster and paint once the openings are cut out. */
function fillWallStats(w) {
  var host = document.getElementById("w_stats");
  if (!host) return;
  var L = Math.max(0, wallClearLength(w)),
    Lraw = Math.max(0, wallGeom(w).L),
    H = wallSolidHeight(w),
    T = wallThickness(w, S),
    nOpen = wallOpeningsOf(w).length,
    net = Math.max(0, L * H - wallOpeningArea(w, L, H));
  var chips = [
    { k: t("len"), v: meters(L), sub: Math.abs(Lraw - L) > 0.6 ? t("wi_axis", { v: meters(Lraw) }) : "" },
    { k: t("height"), v: meters(H), sub: "" },
    { k: t("th"), v: Math.round(T * 10) / 10 + " " + t("cm"), sub: "" },
    { k: t("wi_netArea"), v: m2(net), sub: nOpen ? t(nOpen === 1 ? "wi_netOf1" : "wi_netOf", { n: nOpen }) : "" },
  ];
  host.innerHTML = "";
  chips.forEach(function (c) {
    var el = document.createElement("div");
    el.className = "wi-chip";
    el.title = c.k + ": " + c.v;
    var v = document.createElement("span");
    v.className = "wi-chip-v";
    v.textContent = c.v;
    var k = document.createElement("span");
    k.className = "wi-chip-k";
    k.textContent = c.k;
    el.appendChild(v);
    el.appendChild(k);
    if (c.sub) {
      var s = document.createElement("span");
      s.className = "wi-chip-sub";
      s.textContent = c.sub;
      el.appendChild(s);
    }
    host.appendChild(el);
  });
}

/* Flipping the assembly mirrors the layer stack. On a wall whose stack reads
   the same in both directions — a single layer, or a symmetric sandwich — there
   is nothing to mirror, and the button used to accept the click and change
   nothing at all. Ask first, and say so in the panel. */
export function wallFlipSymmetric(w) {
  var layers = wallLayers(w, S);
  if (layers.length < 2) return true;
  return layers.every(function (layer, i) {
    var other = layers[layers.length - 1 - i];
    return (
      layer.material === other.material &&
      Math.abs(layer.thickness - other.thickness) < 0.01 &&
      (layer.color || "") === (other.color || "")
    );
  });
}

/* The two faces the flip swaps, named — the assembly's outermost and innermost
   materials. Also what the finish swatches show. */
export function wallFaceMaterials(w) {
  var layers = wallLayers(w, S);
  if (!layers.length) return { out: "", in: "" };
  return {
    out: matLabel(layers[0].material),
    in: matLabel(layers[layers.length - 1].material),
  };
}

function fillWallFlip(w) {
  var symmetric = wallFlipSymmetric(w);
  var faces = wallFaceMaterials(w);
  var why = symmetric
    ? t("wallReverseNA")
    : t("wallReverseWhat", { out: faces.out, in: faces.in });
  [document.getElementById("w_reverse"), document.getElementById("w_flipQuick")].forEach(function (btn) {
    if (!btn) return;
    btn.disabled = symmetric;
    btn.title = why;
  });
  var hint = document.getElementById("w_reverseHint");
  if (hint) {
    hint.hidden = false;
    hint.textContent = why;
  }
}

function fillWallHead(w) {
  var name = document.getElementById("selname");
  var meta = document.getElementById("w_meta");
  if (name) name.textContent = t("wallId", { id: w.id });
  var phase = wallPhase(w);
  var pill = document.getElementById("w_phasePill");
  if (pill) {
    pill.textContent = t(phaseKey(phase));
    pill.className = "wi-phase ph-" + phase;
  }
  var flip = document.getElementById("w_flipQuick");
  if (flip) {
    flip.classList.toggle("active", !!w.layersReversed);
    flip.setAttribute("aria-pressed", w.layersReversed ? "true" : "false");
  }
  if (!meta) return;
  var type = wallTypeById(S, w.wallTypeId);
  var bits = [];
  if (type && type.name) bits.push(type.name);
  var kind = normalizeWallKind(w);
  if (kind && kind !== "normal") bits.push(wallKindLabel(kind));
  var layers = wallLayers(w, S);
  if (layers.length > 1) bits.push(t("wi_layers", { n: layers.length }));
  meta.textContent = bits.join(" · ");
}

function openingTypeKey(type) {
  return type === "door" ? "door" : type === "window" ? "window" : "passage";
}

/* An opening can be looked at without leaving the wall. Selecting one swaps
   the whole inspector for the opening's own panel, which is right when it is
   being edited and wrong when the question is "where does this window sit on
   this wall" — so the elevation and the cards focus first and select second
   (the pencil, or a double-click on the drawing). */
function openingFocused(o) {
  return (
    S.wallOpenFocus === o.id ||
    (S.sel && S.sel.kind === "opening" && S.sel.ref === o)
  );
}

function focusOpening(w, o) {
  S.wallOpenFocus = S.wallOpenFocus === o.id ? null : o.id;
  fillWallOpenings(w);
  fillWallElevation(w);
}

/* One opening, as a card: what it is, how big, and where it sits measured from
   BOTH corners — "1.10 m from A" alone is useless when the question is whether
   it clears the corner at the other end. The card is the selection gesture;
   the two tools are the ones a list like this is reached for. */
function fillWallOpenings(w) {
  var list = document.getElementById("w_openList");
  var empty = document.getElementById("w_openEmpty");
  if (!list) return;
  list.innerHTML = "";
  var L = Math.max(1, wallClearLength(w));
  var ops = wallOpeningsOf(w);
  if (empty) empty.hidden = ops.length > 0;
  var counts = { door: 0, window: 0, passage: 0 };
  ops.forEach(function (o) {
    counts[openingTypeKey(o.type)]++;
  });
  [["w_cntDoor", counts.door], ["w_cntWin", counts.window], ["w_cntPass", counts.passage]].forEach(function (pair) {
    var el = document.getElementById(pair[0]);
    if (!el) return;
    el.hidden = !pair[1];
    el.textContent = String(pair[1]);
  });
  var tabBadge = document.getElementById("w_tabBadgeOpen");
  if (tabBadge) {
    tabBadge.hidden = !ops.length;
    tabBadge.textContent = String(ops.length);
  }

  ops.forEach(function (o) {
    var card = document.createElement("div");
    card.className = "w-open-card" + (openingFocused(o) ? " sel" : "");
    var fromA = Math.max(0, (o.s || 0) - o.width / 2),
      fromB = Math.max(0, L - ((o.s || 0) + o.width / 2));

    var ico = document.createElement("span");
    ico.className = "ico";
    ico.innerHTML = '<i class="ph ' +
      (o.type === "door" ? "ph-door" : o.type === "window" ? "ph-square" : "ph-door-open") + '"></i>';

    var nm = document.createElement("span");
    nm.className = "nm";
    nm.textContent = t(openingTypeKey(o.type)) + " · " + Math.round(o.width) + "×" + Math.round(o.height) + " " + t("cm");

    var sub = document.createElement("span");
    sub.className = "sub";
    sub.textContent = "A " + Math.round(fromA) + " · B " + Math.round(fromB) +
      (o.sill ? " · " + t("sill") + " " + Math.round(o.sill) : "");

    var tools = document.createElement("span");
    tools.className = "tools";
    var edit = document.createElement("button");
    edit.type = "button";
    edit.title = t("wi_editOpening");
    edit.innerHTML = '<i class="ph ph-pencil-simple"></i>';
    edit.addEventListener("click", function (e) {
      e.stopPropagation();
      select({ kind: "opening", ref: o });
      render2D();
    });

    var del = document.createElement("button");
    del.type = "button";
    del.className = "del";
    del.title = t("del");
    del.innerHTML = '<i class="ph ph-trash"></i>';
    del.addEventListener("click", function (e) {
      e.stopPropagation();
      /* deleteSel owns the constraint pruning an opening drags with it, so the
         card borrows it rather than filtering S.openings by hand — and hands
         the wall back, because deleting one of its openings is not a reason to
         lose the wall you were editing. */
      var wall = w;
      select({ kind: "opening", ref: o });
      import("./interaction.js").then(function (m) {
        m.deleteSel();
        select({ kind: "wall", ref: wall });
        wallTab("openings");
        render2D();
      });
    });
    tools.appendChild(edit);
    tools.appendChild(del);

    card.appendChild(ico);
    card.appendChild(nm);
    card.appendChild(sub);
    card.appendChild(tools);
    card.title = t("wi_openFocusHint");
    card.addEventListener("click", function () {
      focusOpening(w, o);
    });
    list.appendChild(card);
  });
}

/* ---- wall diagrams: cross-section + elevation ---------------------------
   The inspector described the wall only in numbers and selects; these two
   inline SVGs draw what the model already knows — the layered assembly in
   plan section (the same datum-relative bands the 3D builder extrudes) and
   the front elevation with every opening to scale. Both are now the shortest
   way to ask a question of the wall too: hovering a layer reads it out,
   clicking a face in the section moves the thickness datum onto it, and an
   opening in the elevation selects and dimensions itself. Everything they
   draw is re-read from the model, so a diagram can never disagree with it. */

function fmtCm(v) {
  return Math.round(v * 10) / 10 + " " + t("cm");
}

/* Layer materials are authored as slugs ("concrete-block"). Translate the ones
   worth naming and prettify the rest rather than showing the slug. */
function matLabel(material) {
  var key = "mat_" + String(material || "").replace(/-/g, "_");
  var s = t(key);
  if (s && s !== key) return s;
  return String(material || "")
    .replace(/[-_]+/g, " ")
    .replace(/^./, function (c) { return c.toUpperCase(); });
}

function sectionReadout(html) {
  var el = document.getElementById("w_secRead");
  if (el) el.innerHTML = html;
}

function sectionSummary(w, bands) {
  var T = bands.reduce(function (s, b) { return s + Math.max(0, b.end - b.start); }, 0);
  var r = bands.reduce(function (s, b) { return s + (Number(b.rValue) || 0); }, 0);
  return '<b>' + t(bands.length === 1 ? "wi_assemblyOne" : "wi_assemblyTotal", { n: bands.length }) + "</b>" +
    (r > 0 ? '<span>· R ' + (Math.round(r * 100) / 100) + "</span>" : "") +
    '<span class="num">' + fmtCm(T) + "</span>";
}

/* The five faces a wall's thickness can be measured from, in the coordinates
   the section is drawn in. Clicking one is the same edit as the dropdown —
   picking it on the drawing is just the gesture that does not require knowing
   what "main layer exterior" is called. */
function datumFaces(bands) {
  var main = bands.filter(function (b) { return b.main; })[0] || bands[0];
  var tMin = bands[0].start,
    tMax = bands[bands.length - 1].end;
  /* Priority order, not drawing order: on a single-layer wall the outer face
     and the main layer's outer face are the same line, and the useful name for
     it is the plain face. Dedupe first, then sort into the order they are
     actually stacked. */
  var out = [
    { y: tMin, datum: "exterior", key: "wallDatumOuter" },
    { y: tMax, datum: "interior", key: "wallDatumInner" },
    { y: (tMin + tMax) / 2, datum: "center", key: "wallDatumCenter" },
    { y: main.start, datum: "main-exterior", key: "wallDatumMainOutside" },
    { y: main.end, datum: "main-interior", key: "wallDatumMainInside" },
  ];
  return out
    .filter(function (f, i) {
      return out.findIndex(function (g) { return Math.abs(g.y - f.y) < 0.05; }) === i;
    })
    .sort(function (a, b) { return a.y - b.y; });
}

function fillWallSection(w) {
  var host = document.getElementById("w_section");
  if (!host) return;
  var bands = wallLayerBands(w, S);
  if (!bands.length) {
    host.innerHTML = "";
    sectionReadout("");
    return;
  }
  var tMin = Infinity,
    tMax = -Infinity;
  bands.forEach(function (b) {
    tMin = Math.min(tMin, b.start);
    tMax = Math.max(tMax, b.end);
  });
  var T = Math.max(0.1, tMax - tMin),
    padY = Math.max(2, T * 0.18),
    W = 100;
  var parts = [
    '<defs><pattern id="wSecHatch" width="3.2" height="3.2" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">' +
      '<line x1="0" y1="0" x2="0" y2="3.2" class="w-sec-hatch-line"/>' +
      "</pattern></defs>",
  ];
  bands.forEach(function (b, i) {
    var bw = b.end - b.start;
    if (bw <= 0.01) return;
    var tip = matLabel(b.material) + " · " + fmtCm(bw);
    parts.push(
      '<rect class="w-sec-layer" data-band="' + i + '" x="0" y="' + b.start + '" width="' + W + '" height="' + bw + '" fill="' + (b.color || "#c8c5bb") + '">' +
        "<title>" + tip + "</title></rect>",
    );
    if (b.airGap && b.framing)
      parts.push(
        '<rect class="w-sec-layer" data-band="' + i + '" x="0" y="' + b.start + '" width="' + W + '" height="' + bw + '" fill="url(#wSecHatch)"><title>' + tip + "</title></rect>",
      );
    if (b.main)
      parts.push(
        '<rect class="w-sec-main" x="0.5" y="' + (b.start + 0.5) + '" width="' + (W - 1) + '" height="' + Math.max(0.3, bw - 1) + '"/>',
      );
    if (bw / T > 0.14)
      parts.push('<text class="w-sec-num" x="' + W / 2 + '" y="' + (b.start + bw / 2) + '">' + Math.round(bw * 10) / 10 + "</text>");
  });
  // assembly centreline, then the datum face this wall's snapping hangs on
  var mid = (tMin + tMax) / 2;
  if (Math.abs(mid) > 0.05)
    parts.push('<line class="w-sec-center" x1="-4" y1="' + mid + '" x2="' + (W + 4) + '" y2="' + mid + '"/>');
  parts.push('<line class="w-sec-datum" x1="-4" y1="0" x2="' + (W + 4) + '" y2="0"/>');
  parts.push('<path class="w-sec-datum" d="M ' + (W + 4) + ' 0 l 3 -1.8 l 0 3.6 z"/>');
  // the faces the datum can move to, as click targets over the whole width
  datumFaces(bands).forEach(function (f) {
    parts.push(
      '<g class="w-sec-face" data-datum="' + f.datum + '" data-face="' + f.key + '">' +
        "<title>" + t("wi_setDatum", { face: t(f.key) }) + "</title>" +
        '<rect class="w-sec-dim" x="-4" y="' + (f.y - Math.min(1.2, T * 0.09)) + '" width="' + (W + 8) + '" height="' + 2 * Math.min(1.2, T * 0.09) + '"/>' +
        '<line class="w-sec-dim-line" x1="-4" y1="' + f.y + '" x2="' + (W + 4) + '" y2="' + f.y + '"/>' +
        "</g>",
    );
  });
  parts.push('<text class="w-sec-total" x="' + W / 2 + '" y="' + (tMax + padY * 0.9 + 4) + '">' + fmtCm(T) + "</text>");
  host.innerHTML =
    '<svg viewBox="-4 ' + (tMin - padY) + " " + (W + 8) + " " + (T + padY * 2 + 6) + '" preserveAspectRatio="xMidYMid meet">' +
    parts.join("") +
    "</svg>";
  sectionReadout(sectionSummary(w, bands));

  host.querySelectorAll("[data-band]").forEach(function (el) {
    el.addEventListener("mouseenter", function () {
      var b = bands[+el.getAttribute("data-band")];
      if (!b) return;
      host.querySelectorAll('[data-band="' + el.getAttribute("data-band") + '"]').forEach(function (x) {
        x.classList.add("hot");
      });
      sectionReadout(
        '<span class="sw" style="background:' + (b.color || "#c8c5bb") + '"></span>' +
          "<b>" + matLabel(b.material) + "</b>" +
          (b.role ? "<span>· " + matLabel(b.role) + "</span>" : "") +
          '<span class="num">' + fmtCm(b.end - b.start) + "</span>",
      );
    });
    el.addEventListener("mouseleave", function () {
      host.querySelectorAll(".hot").forEach(function (x) { x.classList.remove("hot"); });
      sectionReadout(sectionSummary(w, bands));
    });
  });
  host.querySelectorAll("[data-datum]").forEach(function (el) {
    el.addEventListener("mouseenter", function () {
      sectionReadout("<b>" + t(el.getAttribute("data-face")) + "</b><span>· " + t("wi_clickDatum") + "</span>");
    });
    el.addEventListener("click", function () {
      if (!S.sel || S.sel.kind !== "wall") return;
      pushHistory();
      S.sel.ref.datum = el.getAttribute("data-datum");
      S.dirty3D = true;
      fillProps();
      render2D();
    });
  });
  // the assembly itself is one gesture away from the drawing of it.
  // Property assignment, not addEventListener: this runs on every re-render.
  host.ondblclick = openWallTypes;
}

function openWallTypes() {
  var btn = document.querySelector('#wallProps [data-act="wallTypeEditor"]');
  if (btn) btn.click();
}

function fillWallElevation(w) {
  var host = document.getElementById("w_elev");
  if (!host) return;
  var L = Math.max(1, wallClearLength(w)),
    H = Math.max(1, Number(w.height) || 260);
  var kind = normalizeWallKind(w),
    segs = verticalSegments(w, function (id) { return wallTypeById(S, id); }),
    prof = normalizeWallProfile(w);
  /* Text inside the elevation is sized in wall centimetres, so a tall wall in a
     narrow panel would render its dimensions at two or three pixels. Work out
     the scale the drawing will settle at — width-bound or height-capped — and
     size the labels back up to a readable number of screen pixels, then place
     them knowing how tall they will be. */
  var availW = Math.max(80, (host.clientWidth || 240) - 14),
    vbW = L + 28,
    vbH = H + 34,
    scale = 1,
    FS = 10,
    TFS = 9;
  // label height feeds back into the box height, which feeds back into the
  // scale — two passes is enough to settle it
  for (var pass = 0; pass < 2; pass++) {
    scale = Math.min(availW / vbW, 150 / vbH);
    // ...but a very long wall in a narrow panel would need labels taller than
    // the wall itself, so legibility gives way rather than squash the drawing
    FS = Math.min(9.5 / scale, H * 0.18);
    TFS = FS * 0.95;
    vbH = H + 24 + FS * 2.9;
  }
  function Y(v) {
    return H - v;
  }
  var parts = ['<line class="w-elev-ground" x1="-8" y1="' + H + '" x2="' + (L + 8) + '" y2="' + H + '"/>'];
  if (kind === "roomDivider" || !segs.length) {
    parts.push('<rect class="w-elev-divider" x="0" y="0" width="' + L + '" height="' + H + '"/>');
  } else {
    segs.forEach(function (sg) {
      if (sg.role === "railing") {
        var n = Math.max(2, Math.round(L / 28)),
          i;
        for (i = 0; i <= n; i++) {
          var bx = (L * i) / n;
          parts.push('<line class="w-elev-rail" x1="' + bx + '" y1="' + Y(sg.top) + '" x2="' + bx + '" y2="' + Y(sg.bottom) + '"/>');
        }
        parts.push('<line class="w-elev-railtop" x1="0" y1="' + Y(sg.top) + '" x2="' + L + '" y2="' + Y(sg.top) + '"/>');
      } else if (prof.length && kind === "normal" && sg === segs[segs.length - 1]) {
        var pts = ["0," + Y(sg.bottom)],
          N = 20,
          i2;
        for (i2 = 0; i2 <= N; i2++) {
          var sx = (L * i2) / N;
          pts.push(sx + "," + Y(Math.max(sg.bottom, wallProfileHeight(w, sx, H))));
        }
        pts.push(L + "," + Y(sg.bottom));
        parts.push('<polygon class="w-elev-solid" points="' + pts.join(" ") + '"/>');
      } else {
        parts.push(
          '<rect class="w-elev-solid w-elev-' + sg.role + '" x="0" y="' + Y(sg.top) + '" width="' + L + '" height="' + (sg.top - sg.bottom) + '"/>',
        );
      }
      if (sg.role === "upper")
        parts.push('<line class="w-elev-split" x1="0" y1="' + Y(sg.bottom) + '" x2="' + L + '" y2="' + Y(sg.bottom) + '"/>');
    });
  }
  var ops = (S.openings || []).filter(function (o) {
    return o.wall === w.id;
  });
  var tags = [];
  ops.forEach(function (o) {
    var ox = Math.max(0, Math.min(L, o.s)) - o.width / 2,
      oy = Y((o.sill || 0) + o.height);
    var sel = openingFocused(o);
    var label =
      t(openingTypeKey(o.type)) + " " + Math.round(o.width) + "×" + Math.round(o.height) + " · " + Math.round(o.s) + " " + t("cm") +
      " · " + t("wi_openDblHint");
    parts.push(
      '<g class="w-open-hit w-open-' + (o.type === "door" ? "d" : o.type === "window" ? "w" : "p") + (sel ? " sel" : "") + '" data-oid="' + o.id + '">' +
        "<title>" + label + "</title>" +
        '<rect x="' + ox + '" y="' + oy + '" width="' + o.width + '" height="' + o.height + '"/>' +
        (o.type === "window"
          ? '<line x1="' + ox + '" y1="' + (oy + o.height / 2) + '" x2="' + (ox + o.width) + '" y2="' + (oy + o.height / 2) + '"/>'
          : o.type === "door"
            ? '<line x1="' + ox + '" y1="' + oy + '" x2="' + (ox + o.width) + '" y2="' + (oy + o.height) + '"/>'
            : "") +
        "</g>",
    );
    /* The selected opening carries its own dimensions: width, height, and the
       clear distance to BOTH corners — the two numbers that decide whether it
       can stay where it is. Drawn after every opening so the tags of the one
       being edited are never covered by a neighbour. */
    if (!sel) return;
    var right = ox + o.width,
      // above the head when there is room for the label, inside it when not
      tagY = oy > TFS * 1.4 ? oy - TFS * 0.4 : oy + TFS * 1.2;
    tags.push(
      '<line class="w-elev-tick" x1="0" y1="' + (H + 5) + '" x2="0" y2="' + Y(0) + '"/>' +
        '<line class="w-elev-tick" x1="' + ox + '" y1="' + oy + '" x2="' + ox + '" y2="' + (H + 5) + '"/>' +
        '<line class="w-elev-tick" x1="' + right + '" y1="' + oy + '" x2="' + right + '" y2="' + (H + 5) + '"/>' +
        '<text class="w-elev-tag" x="' + (ox + o.width / 2) + '" y="' + tagY + '">' + Math.round(o.width) + " × " + Math.round(o.height) + "</text>" +
        '<text class="w-elev-tag" x="' + ox / 2 + '" y="' + (H + 4 + TFS) + '">A ' + Math.round(Math.max(0, ox)) + "</text>" +
        '<text class="w-elev-tag" x="' + ((right + L) / 2) + '" y="' + (H + 4 + TFS) + '">B ' + Math.round(Math.max(0, L - right)) + "</text>",
    );
  });
  parts = parts.concat(tags);
  var dimY = H + 8 + FS * (tags.length ? 1.9 : 0.9);
  parts.push('<text class="w-elev-dim" x="' + L / 2 + '" y="' + dimY + '">' + Math.round(L) + "</text>");
  parts.push(
    '<text class="w-elev-dim" transform="translate(' + -FS * 0.7 + " " + H / 2 + ') rotate(-90)" text-anchor="middle">' + Math.round(H) + "</text>",
  );
  host.innerHTML =
    '<svg style="--elev-fs:' + FS + "px;--elev-tag-fs:" + TFS + "px;--elev-sw:" + 1 / scale +
    'px" viewBox="' + -(FS + 6) + " -8 " + (vbW + FS) + " " + (dimY + FS + 8) + '" preserveAspectRatio="xMidYMid meet">' +
    parts.join("") + "</svg>";
  host.querySelectorAll("[data-oid]").forEach(function (el) {
    function opening() {
      return (S.openings || []).find(function (x) {
        return String(x.id) === el.getAttribute("data-oid");
      });
    }
    el.addEventListener("click", function () {
      var o = opening();
      if (o) focusOpening(w, o);
    });
    el.addEventListener("dblclick", function (e) {
      e.stopPropagation();
      var o = opening();
      if (!o) return;
      select({ kind: "opening", ref: o });
      render2D();
    });
  });
}

/* ---- end joins, as a segmented picker -----------------------------------
   Three ways two walls can meet, drawn rather than named: the select that used
   to hold them read as a fourth dropdown in a panel that already had several,
   and the choice is small enough to be one row. */
function fillWallJoins(w) {
  ["a", "b"].forEach(function (end) {
    var box = document.getElementById("w_join_" + end);
    if (!box) return;
    var mode = (w.join && w.join[end]) || "auto";
    box.querySelectorAll("button[data-join]").forEach(function (b) {
      b.classList.toggle("active", b.dataset.join === mode);
      b.setAttribute("aria-pressed", b.dataset.join === mode ? "true" : "false");
    });
  });
}

/* ---- finishes and per-wall take-off -------------------------------------
   The two faces of the wall as the assembly actually builds them, plus the
   custom texture if one has been dropped on it; then the quantities that come
   off THIS wall, which the project-wide schedule could only give as a total. */
function fillWallFinish(w) {
  var host = document.getElementById("w_swatches");
  var clear = document.getElementById("w_clearTex");
  if (clear) clear.hidden = !w.tex;
  if (!host) return;
  host.innerHTML = "";
  var bands = wallLayerBands(w, S);
  var faces = [];
  if (bands.length) {
    faces.push({ label: t("wi_faceOut"), band: bands[0] });
    if (bands.length > 1) faces.push({ label: t("wi_faceIn"), band: bands[bands.length - 1] });
  }
  faces.forEach(function (f) {
    var el = document.createElement("div");
    el.className = "wi-sw";
    var chip = document.createElement("span");
    chip.className = "wi-sw-chip";
    chip.style.background = f.band.color || "#c8c5bb";
    var txt = document.createElement("span");
    txt.className = "wi-sw-txt";
    txt.innerHTML = "<b></b><span></span>";
    txt.querySelector("b").textContent = f.label;
    txt.querySelector("span").textContent = matLabel(f.band.material) + " · " + fmtCm(f.band.end - f.band.start);
    el.appendChild(chip);
    el.appendChild(txt);
    el.title = f.label + ": " + matLabel(f.band.material);
    host.appendChild(el);
  });
  if (w.tex) {
    var el2 = document.createElement("div");
    el2.className = "wi-sw";
    var chip2 = document.createElement("span");
    chip2.className = "wi-sw-chip";
    chip2.style.backgroundImage = 'url("' + w.tex + '")';
    var txt2 = document.createElement("span");
    txt2.className = "wi-sw-txt";
    txt2.innerHTML = "<b></b><span></span>";
    txt2.querySelector("b").textContent = t("wi_customTex");
    txt2.querySelector("span").textContent = t("wi_texOverride");
    el2.appendChild(chip2);
    el2.appendChild(txt2);
    host.appendChild(el2);
  }
}

/* Quantities for the selected wall alone: net surface per face-finish, and the
   volume of every layer the assembly builds. Same arithmetic the project
   schedule uses, scoped to one wall so it can be read while the wall is being
   designed rather than exported and searched for. */
export function wallTakeoffRows(w) {
  var L = Math.max(0, wallClearLength(w)),
    H = wallSolidHeight(w),
    gross = L * H,
    openings = wallOpeningArea(w, L, H),
    net = Math.max(0, gross - openings);
  var rows = [
    { k: t("wi_toGross"), s: "", v: m2(gross) },
    { k: t("wi_toOpenings"), s: wallOpeningsOf(w).length ? String(wallOpeningsOf(w).length) : "", v: "−" + m2(openings) },
    { k: t("wi_toNet"), s: "", v: m2(net) },
  ];
  if (normalizeWallKind(w) === "roomDivider") return [{ k: t("wallKindDivider"), s: "", v: "—" }];
  wallLayers(w, S).forEach(function (layer) {
    var vol = (net * layer.thickness) / 1000000;
    rows.push({
      k: matLabel(layer.material),
      s: matLabel(layer.role || "") + " · " + fmtCm(layer.thickness),
      v: (Math.round(vol * 1000) / 1000).toFixed(3) + " " + t("cbm"),
    });
  });
  return rows;
}

function fillWallTakeoff(w) {
  var host = document.getElementById("w_takeoff");
  if (!host) return;
  host.innerHTML = "";
  var rows = wallTakeoffRows(w);
  if (!rows.length) {
    host.innerHTML = '<span class="wi-to-empty">—</span>';
    return;
  }
  rows.forEach(function (r) {
    var el = document.createElement("div");
    el.className = "wi-to-row";
    var k = document.createElement("span");
    k.className = "k";
    k.textContent = r.k;
    el.appendChild(k);
    if (r.s) {
      var s = document.createElement("span");
      s.className = "s";
      s.textContent = r.s;
      el.appendChild(s);
    }
    var v = document.createElement("span");
    v.className = "v";
    v.textContent = r.v;
    el.appendChild(v);
    host.appendChild(el);
  });
}

function fillWallDiagrams(w) {
  fillWallSection(w);
  fillWallElevation(w);
  fillWallStats(w);
  bindWallDiagramPanel();
}

/* bindNum edits mutate the wall without re-running fillProps, so the
   diagrams re-render themselves off any input/change inside the panel
   (rAF-throttled — a thickness keystroke must not cost an SVG rebuild per
   key). The model is already updated by the time this bubble-phase handler
   runs. */
var wallDiagramBound = false;
function bindWallDiagramPanel() {
  if (wallDiagramBound) return;
  var panel = document.getElementById("wallProps");
  if (!panel) return;
  wallDiagramBound = true;
  var raf = 0;
  function again() {
    if (raf) return;
    raf = requestAnimationFrame(function () {
      raf = 0;
      if (!S.sel || S.sel.kind !== "wall") return;
      /* Everything downstream of a number in this panel: the drawings, the
         chips, and the take-off all read the same wall, so none of them may
         lag a keystroke behind the others. */
      fillWallDiagrams(S.sel.ref);
      fillWallHead(S.sel.ref);
      fillWallTakeoff(S.sel.ref);
      fillWallFinish(S.sel.ref);
    });
  }
  panel.addEventListener("input", again);
  panel.addEventListener("change", again);
}

/* One dimension, as a row: what it measures, the number it holds (editable in
   place), how far out it is, and the verbs that change it. Extracted from
   fillWallCons so the OPENING inspector renders its position dimensions with
   exactly the same row — two hand-written row builders would have drifted the
   first time one of them learned a new control. */
function conRow(c) {
  {
    var row = document.createElement("div");
    row.className = "con-row" + (conSatisfied(c) ? "" : " con-bad") +
      (c.off ? " con-off" : "") + (S.conHover === c.id ? " hot" : "");
    row.dataset.conId = String(c.id);
    row.addEventListener("mouseenter", function () {
      setConstraintHover(c);
      render2D();
    });
    row.addEventListener("mouseleave", function () {
      if (S.conHover === c.id) setConstraintHover(null);
      render2D();
    });

    var ic = document.createElement("i");
    ic.className =
      "ph " +
      (c.type === "dist" || c.type === "pointWallDist" || c.type === "axisDistX" || c.type === "axisDistZ"
        ? "ph-ruler"
        : conIsAngular(c)
          ? "ph-angle"
          : "ph-arrows-out-line-vertical");
    row.appendChild(ic);

    var name = document.createElement("span");
    name.className = "con-name";
    name.textContent = conRowLabel(c);
    name.title = name.textContent;
    row.appendChild(name);

    if (conHasValue(c)) {
      var inp = document.createElement("input");
      inp.type = "number";
      inp.className = "con-val";
      inp.value = String(Math.round(c.value * 10) / 10);
      inp.title = t(c.type === "angle" ? "cad_ang" : "cad_len");
      inp.disabled = !!c.off;
      inp.addEventListener("change", function () {
        var v = parseFloat(inp.value);
        if (!isFinite(v)) return;
        pushHistory();
        setConValue(c.id, v);
        var result = solveWallCons();
        S.dirty3D = true;
        render2D();
        fillProps();
        refreshTree();
        renderWarnPanel(true);
        if (result.unresolved) flash(t("wc_unresolved", { n: result.unresolved }), "error");
      });
      row.appendChild(inp);
      var unit = document.createElement("span");
      unit.className = "con-unit";
      unit.textContent = c.type === "angle" ? "°" : t("cm");
      row.appendChild(unit);
    }

    // how far out, only when it IS out — a satisfied row stays quiet
    var err = conError(c);
    if (err != null && !conSatisfied(c)) {
      var e = document.createElement("span");
      e.className = "con-err";
      e.textContent = "Δ" + (Math.round(err * 10) / 10);
      e.title = t("wc_outBy", {
        v: Math.round(err * 10) / 10,
        tol: conIsAngular(c) ? CON_TOL_A : CON_TOL_L,
      });
      row.appendChild(e);
    }

    // which side stays put — available on every asymmetric relation
    if (conCanFlip(c)) {
      var fl = document.createElement("button");
      fl.className = "con-btn";
      fl.innerHTML = '<i class="ph ph-arrows-left-right"></i>';
      fl.title = c.a && c.b
        ? t("wc_flip", { a: anchorLabel(c.hold === "b" ? c.b : c.a) })
        : "Swap reference and driven geometry";
      fl.addEventListener("click", function () {
        pushHistory();
        if (!flipConDirection(c.id)) return flash(t("wc_flipFail"), "error");
        var result = solveWallCons();
        S.dirty3D = true;
        render2D();
        fillProps();
        renderWarnPanel(true);
        if (result.unresolved) flash(t("wc_unresolved", { n: result.unresolved }), "error");
      });
      row.appendChild(fl);
    }

    var off = document.createElement("button");
    off.className = "con-btn";
    off.innerHTML = '<i class="ph ' + (c.off ? "ph-play" : "ph-pause") + '"></i>';
    off.title = c.off ? "Enable relation" : "Suppress relation";
    off.addEventListener("click", function () {
      pushHistory();
      setConSuppressed(c.id, !c.off);
      var result = !c.off ? solveWallCons() : { unresolved: 0 };
      S.dirty3D = true;
      render2D(); fillProps(); renderWarnPanel(true);
      if (result.unresolved) flash(t("wc_unresolved", { n: result.unresolved }), "error");
    });
    row.appendChild(off);

    if (c.type === "offset") {
      ["wallFace", "refFace"].forEach(function (key) {
        var face = document.createElement("select");
        face.className = "con-face-select";
        [[0, "Axis"], [-1, "Face −"], [1, "Face +"]].forEach(function (entry) {
          var opt = document.createElement("option");
          opt.value = entry[0]; opt.textContent = entry[1]; face.appendChild(opt);
        });
        face.value = String(c[key] || 0);
        face.title = key === "wallFace" ? "Driven wall measurement face" : "Reference wall measurement face";
        face.addEventListener("change", function () {
          pushHistory();
          setConFaces(c.id,
            key === "wallFace" ? Number(face.value) : c.wallFace,
            key === "refFace" ? Number(face.value) : c.refFace);
          var result = solveWallCons();
          render2D(); fillProps(); renderWarnPanel(true);
          if (result.unresolved) flash(t("wc_unresolved", { n: result.unresolved }), "error");
        });
        row.appendChild(face);
      });
    }
    if (c.type === "pointWallDist") {
      var refFace = document.createElement("select");
      refFace.className = "con-face-select";
      [[0, "Axis"], [-1, "Face −"], [1, "Face +"]].forEach(function (entry) {
        var opt = document.createElement("option"); opt.value = entry[0]; opt.textContent = entry[1]; refFace.appendChild(opt);
      });
      refFace.value = String(c.refFace || 0);
      refFace.title = "Reference wall measurement face";
      refFace.addEventListener("change", function () {
        pushHistory(); setConFaces(c.id, 0, Number(refFace.value));
        var result = solveWallCons();
        render2D(); fillProps(); renderWarnPanel(true);
        if (result.unresolved) flash(t("wc_unresolved", { n: result.unresolved }), "error");
      });
      row.appendChild(refFace);
    }

    var del = document.createElement("button");
    del.className = "con-btn con-del";
    del.innerHTML = '<i class="ph ph-x"></i>';
    del.title = t("del");
    del.addEventListener("click", function () {
      pushHistory();
      removeCon(c.id);
      render2D();
      fillProps();
      renderWarnPanel(true);
    });
    row.appendChild(del);

    return row;
  }
}

/* Mirror S.wallEditEnd onto the segmented picker. Called on selection and again
   whenever a half is picked by clicking it in the plan. */
export function syncWallEnd() {
  var box = document.getElementById("w_end");
  if (!box) return;
  var cur = S.wallEditEnd || "";
  Array.prototype.forEach.call(box.querySelectorAll("button"), function (b) {
    b.classList.toggle("active", b.dataset.end === cur);
  });
}

/* Which FACE the wall's length is measured along. The two side buttons are
   named by where that face actually IS on screen for THIS wall — "top/bottom"
   for a wall running across the plan, "left/right" for one running down it —
   because "side +1 of the a→b direction" is not a thing anyone can picture,
   and the drawing direction is invisible once the wall is drawn. */
export function syncWallSide(w) {
  var box = document.getElementById("w_side");
  if (!box || !w) return;
  var g = wallGeom(w),
    n = wallSideNormal(g),
    horiz = Math.abs(g.ux) >= Math.abs(g.uz);
  function nameFor(sign) {
    var x = n.x * sign,
      z = n.z * sign;
    return horiz ? t(z > 0 ? "side_down" : "side_up") : t(x > 0 ? "side_right" : "side_left");
  }
  var pos = document.getElementById("w_sidePos"),
    neg = document.getElementById("w_sideNeg");
  if (pos) pos.textContent = nameFor(1);
  if (neg) neg.textContent = nameFor(-1);
  // an explicit choice highlights itself; "auto" highlights auto AND shows
  // which face it resolved to, so the number on the plan is never a mystery
  var explicit = w.dimSide === 1 || w.dimSide === -1 || w.dimSide === 0,
    cur = explicit ? String(w.dimSide) : "",
    resolved = String(wallDimSide(w));
  Array.prototype.forEach.call(box.querySelectorAll("button"), function (b) {
    var v = b.dataset.side;
    b.classList.toggle("active", v === cur);
    b.classList.toggle("resolved", !explicit && v === resolved);
  });
  syncWallLoc(w);
}
/* Which line of the wall the MODEL stores. "The measured face" is only
   offerable once that face exists, so it is disabled on a centreline dimension
   and on a curved wall (an offset changes an arc's radius, it cannot translate
   it). "Whole run" hangs every collinear member on that same face; a 90°
   branch sharing the T-node stays welded. Thickness edits of a run do this
   automatically so the interior stays flush. */
function syncWallLoc(w) {
  var box = document.getElementById("w_loc"),
    row = document.getElementById("w_locRow");
  if (!box || !row || !w) return;
  var curved = wallGeom(w).kind === "arc",
    centreline = wallDimSide(w) === 0,
    on = w.loc === "face";
  row.classList.toggle("dim", curved || centreline);
  Array.prototype.forEach.call(box.querySelectorAll("button"), function (b) {
    var v = b.dataset.loc;
    b.classList.toggle("active", v === (on ? "face" : "center"));
    b.disabled = (curved || centreline) && v !== "center";
  });
}

// style/finish picker for the selected piece — hidden for models with no variants
function fillVariants(it) {
  var box = document.getElementById("i_variant_box"),
    sel = document.getElementById("i_variant");
  if (!box || !sel) return;
  var vs = variantList(it.type);
  if (!vs) {
    box.style.display = "none";
    return;
  }
  box.style.display = "";
  sel.innerHTML = "";
  vs.forEach(function (v) {
    var o = document.createElement("option");
    o.value = v.id;
    o.textContent = vlabel(v);
    sel.appendChild(o);
  });
  var cur = variantOf(it);
  sel.value = cur ? cur.id : vs[0].id;
}

/* A placeholder point picks its piece from the library browser (ui_libpick.js),
   not a <select>: you choose by picture, and the browser reaches every FURN
   entry rather than only what the CATALOG tree files. */

/* Where the point sits, as plain rows: the room it falls in, the wall it is
   mounted on (or simply the nearest one), the closest other piece, and — when
   something stands here — that piece's real size and how high it ends up. Every
   line is derived on read (markerInfo), and a line with nothing to say is left
   out entirely rather than printed as a dash. */
function fillMarkerInfo(info) {
  var box = document.getElementById("mk_info");
  if (!box) return;
  box.innerHTML = "";
  function row(icon, lbl, val) {
    if (val == null || val === "") return;
    var d = document.createElement("div");
    d.className = "mk-info-row";
    d.innerHTML = '<i class="ph ph-' + icon + '"></i>';
    var a = document.createElement("span");
    a.className = "mk-info-lbl";
    a.textContent = lbl;
    var b = document.createElement("b");
    b.textContent = val;
    d.appendChild(a);
    d.appendChild(b);
    box.appendChild(d);
  }
  var cm = " " + t("cm");
  row("polygon", t("room"), info.room ? info.roomName || t("room") : t("mk_outside"));
  if (info.wall)
    row(
      "wall",
      t("mk_sf_wall"),
      "#" + info.wall.id + (info.wallIsMount ? " · " + Math.round(info.wallDist) + cm : ""),
    );
  else if (info.wallDist != null)
    row("wall", t("mk_nearWall"), Math.round(info.wallDist) + cm);
  if (info.near)
    row("cube", t("mk_nearObj"), flabel(info.near.item.type) + " · " + Math.round(info.near.dist) + cm);
  var h = info.held;
  if (h) {
    row(
      "ruler",
      t("mk_size"),
      Math.round(h.w) + "×" + Math.round(h.d) + "×" + Math.round(h.h) + cm,
    );
    // where the piece actually ends up in the room's height, which is the whole
    // question a wall or ceiling point is asked
    var sp = itemVSpan(h);
    row("arrows-vertical", t("mk_span"), Math.round(sp.lo) + " → " + Math.round(sp.hi) + cm);
  }
}

/* Everything on the point panel EXCEPT the text inputs. Kept separate so a
   coordinate typed into mk_x/mk_z can refresh the clearances live without
   fillProps writing a rounded value back into the field being typed in. */
export function refreshMarkerReadout() {
  if (!S.sel || S.sel.kind !== "marker") return;
  var m = S.sel.ref,
    info = markerInfo(m, ceilingHeight()),
    held = info.held;
  // the same clearances the plan and the elevations draw: from the point while
  // it is free, and from its object's outer edges once something stands there
  var dm = info.dm;
  ["n", "s", "e", "w"].forEach(function (k) {
    document.getElementById("mk_d_" + k).textContent =
      dm[k] == null ? "—" : Math.round(dm[k]);
    // a side that falls short of the point's own required clearance is called
    // out here rather than silently printed — the number alone reads fine
    document
      .getElementById("mk_c_" + k)
      .classList.toggle("warn", info.tight.indexOf(k) !== -1);
  });
  var tightEl = document.getElementById("mk_tight");
  tightEl.style.display = info.tight.length ? "" : "none";
  tightEl.textContent = info.tight.length
    ? t("mk_tight", {
        req: Math.round(m.req),
        sides: info.tight
          .map(function (k) {
            return t("mk_dir_" + k);
          })
          .join(", "),
      })
    : "";
  document.getElementById("mk_d_up").textContent = Math.round(info.y);
  document.getElementById("mk_d_ceil").textContent =
    info.toCeil == null ? "—" : Math.round(info.toCeil);
  fillMarkerInfo(info);
  document.getElementById("mk_surface").value = m.surface || "floor";
  document.getElementById("selname_mk").textContent = markerLabel(m);
  document.getElementById("mk_holds").textContent = held
    ? t("mk_holds", { name: flabel(held.type) })
    : t("mk_free");
  document.getElementById("mk_place_lbl").textContent = t(held ? "mk_swap" : "mk_place");
  document.getElementById("mk_go_btn").disabled = !held;
  document.getElementById("mk_release_btn").disabled = !held;
}

function fillMarker(m) {
  showPanel("marker");
  document.getElementById("mk_name").value = m.name || "";
  document.getElementById("mk_x").value = Math.round(m.x);
  document.getElementById("mk_y").value = Math.round(m.y || 0);
  document.getElementById("mk_z").value = Math.round(m.z);
  document.getElementById("mk_req").value = m.req != null ? Math.round(m.req) : "";
  document.getElementById("mk_note").value = m.note || "";
  refreshMarkerReadout();
}

function fillSlabVoid(o) {
  showPanel("slabvoid");
  document.getElementById("selname_sv").textContent = o.name || t("sv_title");
  document.getElementById("sv_name").value = o.name || "";
  document.getElementById("sv_x").value = Math.round(o.x);
  document.getElementById("sv_z").value = Math.round(o.z);
  document.getElementById("sv_w").value = Math.round(o.w);
  document.getElementById("sv_d").value = Math.round(o.d);
  document.getElementById("sv_rot").value = Math.round(o.rot || 0);
}

/* The corner inspector. A joint had no panel at all — selecting one showed
   whatever the last selection left on screen — yet it is the one thing in the
   plan whose numbers you cannot read off the drawing: which walls actually meet
   here (as opposed to merely crossing), and at what angles. Each arm row picks
   its wall, so the corner is also a way to get at the walls around it. */
export function fillJoint(ni) {
  showPanel("node");
  var info = jointInfo(ni);
  if (!info) return;
  document.getElementById("nd_x").value = Math.round(info.x);
  document.getElementById("nd_z").value = Math.round(info.z);
  document.getElementById("selname_nd").textContent =
    t("nd_title") + (info.open ? " · " + t("nd_open") : "");
  document.getElementById("nd_state").textContent = t("nd_walls", {
    n: info.arms.length,
  });
  var box = document.getElementById("nd_arms");
  box.innerHTML = "";
  var cm = " " + t("cm");
  info.arms.forEach(function (arm) {
    var row = document.createElement("div");
    row.className = "mk-info-row nd-arm";
    row.innerHTML = '<i class="ph ph-wall"></i>';
    var nm = document.createElement("span");
    nm.className = "mk-info-lbl";
    nm.textContent = t("wall") + " " + arm.wall.id;
    var v = document.createElement("b");
    v.textContent = Math.round(arm.len) + cm + " · " + Math.round(arm.ang) + "°";
    row.appendChild(nm);
    row.appendChild(v);
    row.onclick = function () {
      select({ kind: "wall", ref: arm.wall });
      render2D();
    };
    box.appendChild(row);
  });
  /* The angle BETWEEN the arms is the number the corner exists to answer, so a
     corner that is neither square nor a straight run says so in red — the same
     complaint the warning list makes, at the place you are looking. */
  info.gaps.forEach(function (g) {
    var row = document.createElement("div");
    row.className = "mk-info-row";
    row.innerHTML = '<i class="ph ph-angle"></i>';
    var nm = document.createElement("span");
    nm.className = "mk-info-lbl";
    nm.textContent = t("wall") + " " + g.a.id + " ↔ " + g.b.id;
    var v = document.createElement("b");
    var deg = Math.round(g.deg * 10) / 10;
    v.textContent = deg + "°";
    var square = Math.abs(deg - 90) < 0.5 || Math.abs(deg - 270) < 0.5,
      straight = Math.abs(deg - 180) < 0.5;
    if (!square && !straight) row.classList.add("warn");
    row.appendChild(nm);
    row.appendChild(v);
    box.appendChild(row);
  });
  document.getElementById("nd_square_btn").disabled = !squarableArm(info);
  var setAngle = document.getElementById("nd_set_angle_btn");
  if (setAngle) setAngle.disabled = !angleSectorAtNode(ni);
  var pairTools = document.getElementById("nd_pair_tools");
  if (pairTools) pairTools.hidden = true;
  syncPinBtn([ni]);
}

/* The palette for a multi-corner selection. The selection is no longer capped
   at two, so this has to say WHICH verbs the current count supports rather
   than assume a pair: pinning wants any number, the pair relations want
   exactly two, and a button that silently does nothing is worse than a
   disabled one. */
function fillJointPair(nodes) {
  showPanel("node");
  var pair = nodes.length === 2;
  var pairTools = document.getElementById("nd_pair_tools");
  if (pairTools) pairTools.hidden = false;
  ["ndJoin", "ndDistance", "ndAlignX", "ndAlignZ", "ndDistanceX", "ndDistanceZ",
    "ndCoincident", "ndSymmetric", "ndSymmetricPerp"].forEach(function (act) {
    var b = document.querySelector('[data-act="' + act + '"]');
    if (b) b.disabled = !pair;
  });
  document.getElementById("selname_nd").textContent =
    pair ? t("nd_pair_title") : t("nd_multi_title", { n: nodes.length });
  document.getElementById("nd_state").textContent = nodes.map(function (ni, i) {
    var n = S.nodes[ni];
    return (i + 1) + ". V" + (ni + 1) + "  X " + Math.round(n.x) + " · Z " + Math.round(n.z);
  }).join("   ");
  document.getElementById("nd_x").value = "";
  document.getElementById("nd_z").value = "";
  var arms = document.getElementById("nd_arms");
  arms.innerHTML = "";
  nodes.forEach(function (ni, i) {
    var info = jointInfo(ni), row = document.createElement("div");
    row.className = "mk-info-row";
    if (!S.nodePairAngles) S.nodePairAngles = {};
    var sector = angleSectorAtNode(ni);
    row.innerHTML = '<i class="ph ph-map-pin"></i><span class="mk-info-lbl">' +
      (i + 1) + ". " + t("nd_title") + '</span><b>' +
      (sector && info.gaps.length ? Math.round(info.gaps[0].deg * 10) / 10 + "°" : info.arms.length + " " + t("wall")) +
      "</b>";
    arms.appendChild(row);
    if (info.gaps && info.gaps.length > 1) {
      var choose = document.createElement("select");
      choose.className = "con-face-select";
      info.gaps.forEach(function (gap) {
        var opt = document.createElement("option");
        opt.value = gap.a.id + ":" + gap.b.id;
        opt.textContent = "W" + gap.a.id + " ↔ W" + gap.b.id + " · " + Math.round(gap.deg * 10) / 10 + "°";
        choose.appendChild(opt);
      });
      var saved = S.nodePairAngles[ni];
      if (saved) choose.value = saved.w1 + ":" + saved.w2;
      if (!choose.value) choose.selectedIndex = 0;
      function storeSector() {
        var ids = choose.value.split(":").map(Number);
        S.nodePairAngles[ni] = { joint: ni, w1: ids[0], w2: ids[1] };
      }
      storeSector();
      choose.addEventListener("change", function () { storeSector(); fillJointPair(nodes); });
      arms.appendChild(choose);
      sector = S.nodePairAngles[ni];
    }
  });
  var equal = document.getElementById("nd_equal_angle"),
    compare = document.getElementById("nd_compare_angle");
  function picked(ni) { return S.nodePairAngles && S.nodePairAngles[ni] || angleSectorAtNode(ni); }
  var canAngle = pair && !!picked(nodes[0]) && !!picked(nodes[1]);
  if (equal) equal.disabled = !canAngle;
  if (compare) compare.disabled = !canAngle;
  document.getElementById("nd_square_btn").disabled = true;
  var setAngle = document.getElementById("nd_set_angle_btn");
  if (setAngle) setAngle.disabled = true;
  syncPinBtn(nodes);
}

/* The pin button is a toggle, so it has to say which way it will go. */
function syncPinBtn(nodes) {
  var btn = document.getElementById("nd_pin_btn");
  if (!btn) return;
  var pins = pinnedNodes(),
    allPinned = nodes.length > 0 && nodes.every(function (ni) { return pins[ni]; });
  btn.classList.toggle("active", allPinned);
  var lbl = btn.querySelector("span");
  if (lbl) lbl.textContent = t(allPinned ? "nd_unpin" : "nd_pin");
}

/* The inspector for ONE dimension, reached by clicking its label on the plan.
   Everything a constraint can be asked is here: what it currently measures
   against what it states, which side it holds, whether it drives at all, and
   the two ways to stop it (suppress, delete). */
function fillCon(c) {
  showPanel("con");
  document.getElementById("selname_con").textContent = conLabelText(c, t);

  var unit = conUnit(c),
    cur = conCurrent(c),
    err = conError(c),
    tol = unit === "deg" ? CON_TOL_A : CON_TOL_L,
    state = document.getElementById("con_state");

  /* Say what it MEASURES, always — including for the pure relations that have
     no value to type. "Parallel: out by 3.2°" is actionable; a red glyph and
     nothing else is not. */
  var txt = cur == null ? t("wc_failed")
    : c.report ? t("wc_reportReads", { v: fmtVal(cur, unit) })
      : conSatisfied(c) ? t("wc_ok", { v: fmtVal(cur, unit) })
        : t("wc_outBy", { v: fmtVal(err, unit), tol: fmtVal(tol, unit) });
  state.textContent = txt;
  state.classList.toggle("con-bad", !c.report && !conSatisfied(c));

  var row = document.getElementById("con_value_row"),
    input = document.getElementById("con_value");
  var typeable = conDrivable(c);
  row.hidden = !typeable;
  if (typeable) {
    input.value = Math.round((Number(c.value) || 0) * 10) / 10;
    document.getElementById("con_value_lbl").textContent =
      unit === "deg" ? t("cad_ang") : t("cm");
  }
  document.getElementById("con_report").checked = !!c.report;
  document.getElementById("con_off").checked = !!c.off;
  // a pin has nothing to swap and everything else has nothing to re-pin
  var flipBtn = document.querySelector('#conProps [data-act="conFlip"]');
  if (flipBtn) flipBtn.disabled = !conCanFlip(c);
  document.getElementById("con_repin_btn").hidden = c.type !== "fixed";
}
function fmtVal(v, unit) {
  if (v == null) return "?";
  var n = Math.round(v * 10) / 10;
  return unit === "deg" ? n + "°" : unit === "cm" ? n + " " + t("cm") : String(n);
}

/* The position dimensions on one opening, listed the same way a wall's are.
   Reuses conRow() so a dimension looks and behaves identically wherever it is
   shown — the value is editable in place, and the delete is in the same spot. */
function fillOpeningCons(o) {
  var host = document.getElementById("o_conList"),
    hint = document.getElementById("o_con_hint");
  if (!host) return;
  host.innerHTML = "";
  var list = wallCons().filter(function (c) {
    if (c.type === "openCentre" || c.type === "openDist") return c.opening === o.id;
    if (c.type === "openAlign") return c.a === o.id || c.b === o.id;
    if (c.type === "openSpacing") return (c.openings || []).indexOf(o.id) !== -1;
    return false;
  });
  if (hint)
    hint.textContent = S.conPick && S.conPick.kind === "openAlign"
      ? t("wc_pick_openAlign")
      : list.length ? "" : t("wc_empty");
  var spacingBtn = document.getElementById("op_spacing_btn");
  if (spacingBtn)
    spacingBtn.disabled =
      (S.openings || []).filter(function (q) { return q.wall === o.wall; }).length < 3;
  list.forEach(function (c) {
    host.appendChild(conRow(c));
  });
}

function fillWallMulti(walls) {
  showPanel("walls");
  document.getElementById("wm_state").textContent = walls.map(function (w, i) {
    return (i + 1) + ". W" + w.id + " · " + Math.round(wallGeom(w).L) + " " + t("cm");
  }).join("   ");
  ["wmParallel", "wmPerpendicular", "wmCollinear", "wmEqualLength", "wmOffset"].forEach(function (act) {
    var b = document.querySelector('[data-act="' + act + '"]');
    if (b) b.disabled = walls.length !== 2;
  });
  var spacing = document.getElementById("wm_equal_spacing");
  if (spacing) spacing.disabled = walls.length < 3;
  var fillet = document.getElementById("wm_fillet");
  if (fillet) fillet.disabled = walls.length !== 2;
  var chamfer = document.getElementById("wm_chamfer");
  if (chamfer) chamfer.disabled = walls.length !== 2;
}

/* The rule for WHICH arm a corner squares by swinging lives in joint_square.js,
   with the placement it feeds and away from the DOM, so it can be tested on
   plain geometry. Re-exported here because the inspector and the plan's action
   handler have always asked this module for it. */
export { squarableArm };

export function fillProps() {
  document.getElementById("lightProps").classList.remove("on");
  var shCtl = document.getElementById("smartItemControls");
  if (shCtl) { shCtl.style.display = "none"; shCtl.innerHTML = ""; }
  S.segPreview = null;
  syncInspectorPreview();
  if (!S.sel) {
    showPanel("empty");
    return;
  }
  if (S.sel.kind === "marker") {
    fillMarker(S.sel.ref);
    refreshTree();
    return;
  }
  if (S.sel.kind === "slabvoid") {
    fillSlabVoid(S.sel.ref);
    refreshTree();
    return;
  }
  if (S.sel.kind === "node") {
    fillJoint(S.sel.ref);
    return;
  }
  if (S.sel.kind === "nodes") {
    fillJointPair(S.sel.refs);
    return;
  }
  if (S.sel.kind === "con") {
    fillCon(S.sel.ref);
    return;
  }
  if (S.sel.kind === "walls") {
    fillWallMulti(S.sel.refs);
    return;
  }
  if (S.sel.kind === "items") {
    showPanel("items");
    return;
  }
  if (S.sel.kind === "mepNode" || S.sel.kind === "mepRun") {
    showPanel("mep");
    fillMEP();
    return;
  }
  if (S.sel.kind === "wall") {
    var w = S.sel.ref, gm = wallGeom(w);
    normalizeWall(w, S);
    showPanel("wall");
    document.getElementById("w_len").value = Math.round(wallClearLength(w));
    document.getElementById("w_ang").value = Math.round((Math.atan2(gm.dz, gm.dx) * 180) / Math.PI);
    document.getElementById("w_th").value = Math.round(wallThickness(w, S) * 10) / 10;
    document.getElementById("w_h").value = Math.round(w.height);
    fillWallHead(w);

    fillWallTypeSelect("w_type", w.wallTypeId);
    fillWallTypeSelect("w_upper_type", w.upperWallTypeId || w.wallTypeId);
    var kind = normalizeWallKind(w);
    var kindEl = document.getElementById("w_kind");
    if (kindEl) kindEl.value = kind;
    var phaseEl = document.getElementById("w_phase");
    if (phaseEl) phaseEl.value = wallPhase(w);
    var datumEl = document.getElementById("w_datum");
    if (datumEl) datumEl.value = datumForControl(w.datum);
    ["a", "b"].forEach(function (end) {
      var joinEl = document.getElementById("w_join_" + end);
      if (joinEl) joinEl.value = w.join && w.join[end] || "auto";
    });
    var reverse = document.getElementById("w_reverse");
    if (reverse) {
      reverse.classList.toggle("active", !!w.layersReversed);
      reverse.setAttribute("aria-pressed", w.layersReversed ? "true" : "false");
    }
    var pony = document.getElementById("w_pony_options");
    if (pony) pony.hidden = kind !== "pony";
    var split = document.getElementById("w_split_h");
    if (split) split.value = Math.round(Number(w.splitHeight) || Math.min(w.height, 110));

    var curve = normalizeWallGeometry(w, S.nodes);
    var bulge = document.getElementById("w_bulge");
    if (bulge) bulge.value = curve && curve.kind === "arc" ? Math.round(curve.bulge * 10000) / 10000 : 0;
    var cornerEditor = document.getElementById("w_corner_editor");
    if (cornerEditor) cornerEditor.hidden = !w.cornerTreatment;
    if (w.cornerTreatment) {
      var cornerType = document.getElementById("w_corner_type");
      var cornerValue = document.getElementById("w_corner_value");
      if (cornerType) cornerType.value = w.cornerTreatment.type || "fillet";
      if (cornerValue) cornerValue.value = Math.round((Number(w.cornerTreatment.value) || 0) * 100) / 100;
    }
    var topControls = normalizeWallProfile(w);
    var topA = topControls.length ? wallProfileHeight(w, 0, w.height) : w.height;
    var topB = topControls.length ? wallProfileHeight(w, gm.L, w.height) : w.height;
    var bases = baseProfileEnds(w, gm.L);
    document.getElementById("w_top_a").value = Math.round(topA * 10) / 10;
    document.getElementById("w_top_b").value = Math.round(topB * 10) / 10;
    document.getElementById("w_base_a").value = Math.round(bases[0] * 10) / 10;
    document.getElementById("w_base_b").value = Math.round(bases[1] * 10) / 10;
    syncWallEnd();
    syncWallSide(w);
    fillWallLock(w);
    fillWallFlip(w);
    fillWallJoins(w);
    bindWallTabs();
    wallTab(S.wallTab || "dims");
    fillWallCons(w);
    fillWallOpenings(w);
    fillWallFinish(w);
    fillWallTakeoff(w);
    fillWallDiagrams(w);

    var sqBtn = document.getElementById("w_square_btn");
    if (sqBtn) {
      var rawAng = (Math.atan2(gm.dz, gm.dx) * 180) / Math.PI;
      var normA = ((rawAng % 90) + 90) % 90;
      var offDeg = normA > 45 ? 90 - normA : normA;
      sqBtn.hidden = offDeg <= 0.05;
      sqBtn.title = t("cw_squareWall");
    }


    var Ls = Math.max(1, Math.round(gm.L)),
      ow = Math.min(100, Math.round(gm.L * 0.6)),
      oh = Math.round(w.height),
      op = Math.round(gm.L / 2);
    var posEl = document.getElementById("ow_pos");
    posEl.max = Ls;
    posEl.value = op;
    document.getElementById("ow_posval").textContent = op + " " + t("cm");
    document.getElementById("ow_w").value = ow;
    document.getElementById("ow_h").value = oh;
    S.segPreview = { s: op, width: ow, height: oh };
  } else if (S.sel.kind === "item") {
    var it = S.sel.ref;
    showPanel("item");
    document.getElementById("i_w").value = Math.round(it.w);
    document.getElementById("i_d").value = Math.round(it.d);
    document.getElementById("i_h").value = Math.round(it.h);
    document.getElementById("i_rot").value = Math.round(it.rot);
    document.getElementById("i_rot_range").value = Math.round(it.rot);
    document.getElementById("selname2").textContent = flabel(it.type) + (it.locked ? " 🔒" : "");
    fillVariants(it);
    fillSpecRow(it); // linked real-world product, when one was matched
    fillStackRow(it); // the piece it stands on, when it stands on one
    fillHoldRow(it); // and the wall it is held against, when it is held
    fillItemSmart(it);
    var slabRow = document.getElementById("i_slabvoid_row");
    if (slabRow) slabRow.hidden = it.type !== "stairs";
    document.getElementById("lockItemSpan").textContent = it.locked ? t("lockItemOn") : t("lockItem");
    document.getElementById("lockItemBtn").querySelector("i").className = it.locked ? "ph ph-lock-key" : "ph ph-lock-key-open";
    if (isLamp(it)) {
      document.getElementById("lightProps").classList.add("on");
      document.getElementById("l_on").checked = it.lightOn !== false;
      var mul = it.lightI != null ? it.lightI : 1;
      document.getElementById("l_int").value = mul;
      document.getElementById("l_intval").textContent = Math.round(mul * 100) + "%";
      document.getElementById("l_col").value = hexStr(lampColor(it));
      
      document.getElementById("lightSpotProps").style.display = "flex";
      var lTypeSel = document.getElementById("l_type");
      if (it.spot) {
        lTypeSel.value = "spot";
        document.getElementById("l_cone").value = it.cone != null ? it.cone : 45;
        document.getElementById("l_pitch").value = it.pitch != null ? it.pitch : 0;
        document.getElementById("l_cone_l").style.display = "flex";
        document.getElementById("l_pitch_l").style.display = "flex";
      } else {
        lTypeSel.value = "omni";
        document.getElementById("l_cone_l").style.display = "none";
        document.getElementById("l_pitch_l").style.display = "none";
      }
    }
  } else if (S.sel.kind === "opening") {
    var o = S.sel.ref;
    showPanel("opening");
    document.getElementById("o_w").value = Math.round(o.width);
    document.getElementById("o_h").value = Math.round(o.height);
    document.getElementById("o_sill").value = Math.round(o.sill);
    document.getElementById("o_sill_l").style.display = o.type === "window" ? "flex" : "none";
    fillOpeningCons(o);
      
    if (o.type === "door") {
      document.getElementById("doorSpecific").style.display = "flex";
      document.getElementById("o_type_sel").value = o.isPocket ? "pocket" : (o.isSliding ? "sliding" : "standard");
      if (o.isSliding || o.isPocket) {
        document.getElementById("o_mat").value = o.mat || "wood";
        document.getElementById("o_col").value = o.color || "#ffffff";
        document.getElementById("o_slide_dir").value = o.slideDir || "auto";
        document.getElementById("o_mat_l").style.display = "flex";
        document.getElementById("o_col_l").style.display = "flex";
        document.getElementById("o_dir_l").style.display = "flex";
        document.getElementById("o_swing_dir_l").style.display = "none";
        
        var w = S.walls.find(function(wa) { return wa.ops && wa.ops.indexOf(o) !== -1; });
        if (w) {
          var gm = wallGeom(w);
          var s = Math.max(o.width / 2, Math.min(gm.L - o.width / 2, o.s));
          var spaceLeft = s - o.width / 2;
          var spaceRight = gm.L - (s + o.width / 2);
          
          var canLeft = spaceLeft >= o.width - 10;
          var canRight = spaceRight >= o.width - 10;
          
          var optRight = document.querySelector('#o_slide_dir option[value="1"]');
          var optLeft = document.querySelector('#o_slide_dir option[value="-1"]');
          
          if (!canRight) {
            optRight.disabled = true;
            optRight.textContent = t("d_right") + " (" + t("no_space") + ")";
          } else {
            optRight.disabled = false;
            optRight.textContent = t("d_right");
          }
          
          if (!canLeft) {
            optLeft.disabled = true;
            optLeft.textContent = t("d_left") + " (" + t("no_space") + ")";
          } else {
            optLeft.disabled = false;
            optLeft.textContent = t("d_left");
          }
          
          if (!canRight && !canLeft) {
             document.getElementById("o_slide_warn").style.display = "block";
             document.getElementById("o_slide_dir").disabled = true;
          } else {
             document.getElementById("o_slide_warn").style.display = "none";
             document.getElementById("o_slide_dir").disabled = false;
             var currentVal = document.getElementById("o_slide_dir").value;
             if ((currentVal === "1" && !canRight) || (currentVal === "-1" && !canLeft)) {
                document.getElementById("o_slide_dir").value = "auto";
                o.slideDir = "auto";
             }
          }
        }
      } else {
        document.getElementById("o_mat_l").style.display = "none";
        document.getElementById("o_col_l").style.display = "none";
        document.getElementById("o_dir_l").style.display = "none";
        document.getElementById("o_slide_warn").style.display = "none";
        document.getElementById("o_swing_dir_l").style.display = "flex";
        document.getElementById("o_swing_dir").value = o.swingDir || "R_IN";
      }
    } else {
      document.getElementById("doorSpecific").style.display = "none";
    }
    // frame / mullion profile — doors and windows only (a passage has no frame)
    var frBox = document.getElementById("o_frame_box");
    if (o.type === "door" || o.type === "window") {
      var FR = frameSpec(o);
      frBox.style.display = "flex";
      document.getElementById("o_fr_jamb").value = FR.jamb;
      document.getElementById("o_fr_head").value = FR.head;
      document.getElementById("o_fr_sillw").value = FR.sillW;
      document.getElementById("o_fr_depth").value = FR.depth;
      document.getElementById("o_fr_mull").value = FR.mull;
      document.getElementById("o_fr_mullv").value = FR.mullV;
      document.getElementById("o_fr_mullh").value = FR.mullH;
      var isWin = o.type === "window";
      document.getElementById("o_fr_sill_l").style.display = isWin ? "flex" : "none";
      document.getElementById("o_fr_mull_l").style.display = isWin ? "flex" : "none";
      document.getElementById("o_fr_mullv_l").style.display = isWin ? "flex" : "none";
      document.getElementById("o_fr_mullh_row").style.display = isWin ? "flex" : "none";
    } else {
      frBox.style.display = "none";
    }

    if (o.type === "passage" && o.overlapL != null) {
      document.getElementById("o_margins_box").style.display = "flex";
      var currentLeft = Math.round((o.s - o.width/2) - (o.overlapCenter - o.overlapL/2));
      var currentRight = Math.round((o.overlapCenter + o.overlapL/2) - (o.s + o.width/2));
      document.getElementById("o_m_l").value = currentLeft;
      document.getElementById("o_m_r").value = currentRight;
      document.getElementById("o_m_b").value = Math.round(o.sill);
      var wWall = S.walls.find(function(wa) { return wa.id === o.wall; });
      var topM = wWall ? Math.round(wWall.height - o.sill - o.height) : 0;
      document.getElementById("o_m_t").value = topM;
      
      var isSeamless = Math.abs(o.width - o.overlapL) < 2 && Math.abs(topM) < 2 && o.sill <= 1;
      document.getElementById("o_seamless_btn").style.display = isSeamless ? "none" : "block";
      document.getElementById("o_floor_match").style.display = "block";
    } else {
      document.getElementById("o_margins_box").style.display = "none";
      document.getElementById("o_seamless_btn").style.display = "none";
      document.getElementById("o_floor_match").style.display = "none";
    }

    document.getElementById("selname3").textContent = o.type === "door" ? t("door") : o.type === "passage" ? t("passage") : t("window");
  } else if (S.sel.kind === "room") {
    var r = roomByKey(S.sel.ref);
    if (!r) {
      showPanel("empty");
      S.sel = null;
      return;
    }
    showPanel("room");
    var roomTitle = document.getElementById("selname4");
    if (roomTitle) roomTitle.textContent = roomName(r.key) || t("room");
    renderRoomCons(r.key);
    document.getElementById("r_name").value = roomName(r.key);
    document.getElementById("r_floor").value = roomFloor(r.key);
    var tScale = S.roomMeta[r.key] && S.roomMeta[r.key].floorScale;
    var rf = roomFloor(r.key);
    document.getElementById("r_floor_scale").value = tScale || (S.roomMeta[r.key] && S.roomMeta[r.key].floorTex ? 200 : (TILE[rf] || 240));
    document.getElementById("r_floor_scale_box").style.display = "block";
    var tBump = S.roomMeta[r.key] && S.roomMeta[r.key].floorBump;
    var bumpVal = tBump != null ? tBump : 0.20;
    var bumpEl = document.getElementById("r_floor_bump");
    if (bumpEl) {
      bumpEl.value = Math.round(bumpVal * 100);
      var bumpValSpan = document.getElementById("r_floor_bump_val");
      if (bumpValSpan) bumpValSpan.textContent = Math.round(bumpVal * 100) + "%";
      var bumpBox = document.getElementById("r_floor_bump_box");
      if (bumpBox) bumpBox.style.display = "block";
    }
    document.getElementById("r_area").textContent = (r.area / 10000).toFixed(2) + " " + t("sqm");
    document.getElementById("r_wall").value = hexStr(
      S.roomMeta[r.key] && S.roomMeta[r.key].wall != null ? S.roomMeta[r.key].wall : S.wallColor
    );
    document.getElementById("lockRoomSpan").textContent = S.roomMeta[r.key] && S.roomMeta[r.key].locked ? t("lockRoomOn") : t("lockRoom");
    document.getElementById("lockRoomBtn").querySelector("i").className = S.roomMeta[r.key] && S.roomMeta[r.key].locked ? "ph ph-lock-key" : "ph ph-lock-key-open";

    var warnEl = document.getElementById("r_warn");
    if (warnEl) {
      if (roomFloor(r.key) === "balcony") {
        var inR = itemsInRoom(r);
        var weight = 0;
        var hWeights = {
          nft_pipe_75: 15, nft_pipe_110: 30, nft_pipe_160: 60, nft_square_12x12: 30,
          dwc_bucket: 28, rdwc_header: 50, ebb_flow_tray: 450,
          tower_commercial: 45, tower_diy_pvc: 35, water_reservoir_60l: 60, water_chiller: 15
        };
        inR.forEach(function(it) {
          if (hWeights[it.type]) weight += hWeights[it.type];
        });
        var sqm = r.area / 10000;
        var maxW = sqm * 150;
        if (weight > maxW) {
          warnEl.style.display = "block";
          var isEn = document.documentElement.lang === "en";
          if (isEn) {
            warnEl.innerHTML = "<br>⚠ Overweight Warning!<br>Hydro Systems: " + Math.round(weight) + " kg<br>Balcony Limit: " + Math.round(maxW) + " kg";
          } else {
            warnEl.innerHTML = "<br>⚠ חריגת משקל למרפסת!<br>עומס מערכות: " + Math.round(weight) + " ק\"ג<br>מותר: " + Math.round(maxW) + " ק\"ג";
          }
        } else {
          warnEl.style.display = "none";
        }
      } else {
        warnEl.style.display = "none";
      }
    }

    var autoOpenUI = document.getElementById("corridorAutoOpenProps");
    if (autoOpenUI) {
      if (S.roomMeta[r.key] && S.roomMeta[r.key].autoOpenings && S.roomMeta[r.key].autoOpenings.length > 0) {
        autoOpenUI.style.display = "block";
      } else {
        autoOpenUI.style.display = "none";
      }
    }

  } else {
    showPanel("empty");
  }
  refreshTree();
}

export function roomMetaFor() {
  if (!S.sel || S.sel.kind !== "room") return null;
  return (S.roomMeta[S.sel.ref] = S.roomMeta[S.sel.ref] || {});
}

export function selLamp() {
  return S.sel && S.sel.kind === "item" && isLamp(S.sel.ref) ? S.sel.ref : null;
}
