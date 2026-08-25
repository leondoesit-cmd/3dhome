/* CAD heads-up layer for the 2D plan: the status bar along the bottom edge and
   the typed length/angle entry that turns the wall tool into a precision
   instrument.

   The bar answers the three questions a drafting tool must never make you
   guess: where is the cursor, what am I about to draw, and which snap just
   moved my point. The three aid chips are the off switches for the snapping —
   without them a precise-but-unaligned point simply is not drawable.

   Its own module rather than more markup in index.html because the whole
   thing is generated: the chips come from one TOGGLES table that also fixes
   their key bindings, so a new aid is one entry, not four edits. */
import { S, fin } from "./state.js";
import { plan, wx, wz, render2D, segBearing, onAfterRender } from "./plan2d.js";
import { wallPointPolar } from "./interaction.js";
import { wallClearLength, pendingCuts, roomName } from "./geometry.js";
import { flabel } from "./furniture_meta.js";
import { t } from "./i18n.js";
import { previousRunAngle, resolveWallDrawDefaults, previewMetrics, touchDrawing } from "./wall_draw.js";

var bar = null,
  elCoord = null,
  elMain = null,
  elName = null,
  elDetail = null,
  elProps = null,
  elSnap = null,
  entry = null,
  inLen = null,
  inAng = null,
  inOff = null,
  labOff = null,
  targetSelect = null,
  tune = null,
  tuneRange = null;

// last cursor position in world cm, for the coordinate readout
var curX = null,
  curZ = null;

var TOGGLES = [
  { key: "osnap", label: "cad_osnap", kbd: "F3" },
  { key: "ortho", label: "cad_ortho", kbd: "F8" },
  { key: "gsnap", label: "cad_grid", kbd: "F9" },
];
/* The six drafting snaps. Most are performed by snapPoint(); wall symmetry is
   performed by the whole-wall drag because it needs both endpoints at once.
   They used to hide behind the
   single OSNAP chip, which meant the only cure for one snap being too grabby
   was to lose all of them — the usual reason a wall ends up drawn by hand and
   then nudged. Each one is listed with the kind key that gates it. */
var KINDS = [
  { key: "corner", label: "snapk_corner" },
  { key: "marker", label: "snapk_marker" },
  { key: "midpoint", label: "snapk_midpoint" },
  { key: "onwall", label: "snapk_onwall" },
  { key: "item", label: "snapk_item" },
  { key: "perpendicular", label: "snapk_perpendicular" },
  { key: "intersection", label: "snapk_intersection" },
  { key: "extension", label: "snapk_extension" },
  { key: "bisector", label: "snapk_bisector" },
  { key: "inc", label: "snapk_inc" },
  { key: "walldir", label: "snapk_walldir" },
  { key: "align", label: "snapk_align" },
  { key: "symmetry", label: "snapk_symmetry" },
];
var PREFS = "home3d_cadaids";

/* Shift + letter forces one snap kind for the next click. Letters chosen to
   match the words, not the internal keys: E for endpoint, M for midpoint,
   I for intersection, P for perpendicular, R for reference point, F for
   furniture, N for "on" a wall (nearest, as every CAD calls it). */
var SNAP_HOTKEY = {
  e: "corner",
  r: "marker",
  m: "midpoint",
  i: "intersection",
  p: "perpendicular",
  f: "item",
  n: "onwall",
  x: "extension",
};

/* Typing in a field must never be read as a drafting shortcut. */
function isTypingField(el) {
  if (!el) return false;
  var tag = (el.tagName || "").toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || el.isContentEditable;
}

var SNAP_LABEL = {
  corner: "snap_corner",
  marker: "snap_marker",
  midpoint: "snap_midpoint",
  itemCorner: "snap_item",
  wall: "snap_wall",
  jamb: "snap_jamb",
  openingBlocked: "snap_opening_blocked",
  // the override chips are named by their PREFERENCE key, which differs from
  // the candidate kind for the two that read better in the user's words
  onwall: "snap_wall",
  item: "snap_item",
  perpendicular: "snap_perpendicular",
  intersection: "snap_intersection",
  extension: "snap_extension",
  bisector: "snap_bisector",
  angle: "snap_angle",
  ortho: "snap_ortho",
  align: "snap_align",
  grid: "snap_grid",
  free: "snap_free",
  close: "snap_close",
  hit: "snap_hit",
};

export function initCadHud() {
  var host = document.getElementById("view-2d");
  if (!host || bar) return;
  restorePrefs();

  bar = document.createElement("div");
  bar.id = "cad-status";
  bar.innerHTML =
    '<span class="cad-coord" id="cadCoord"></span>' +
    '<span class="cad-main" id="cadMain"><strong id="cadName"></strong><span id="cadDetail"></span></span>' +
    '<button type="button" class="cad-selection-props" id="cadSelectionProps" hidden>' +
    '<i class="ph ph-sliders-horizontal"></i><span></span></button>' +
    '<span class="cad-snap" id="cadSnap"></span>' +
    '<label class="cad-target"><span id="cadTargetLabel"></span><select id="cadTarget">' +
    '<option value="nearest"></option><option value="object"></option>' +
    '<option value="wall"></option><option value="manual"></option></select></label>' +
    '<span class="cad-toggles" id="cadToggles"></span>' +
    '<button type="button" class="cad-chip cad-tune-btn" id="cadTuneBtn">' +
    '<i class="ph ph-sliders-horizontal"></i><span class="t"></span></button>';
  host.appendChild(bar);
  elCoord = bar.querySelector("#cadCoord");
  elMain = bar.querySelector("#cadMain");
  elName = bar.querySelector("#cadName");
  elDetail = bar.querySelector("#cadDetail");
  elProps = bar.querySelector("#cadSelectionProps");
  elSnap = bar.querySelector("#cadSnap");
  elProps.addEventListener("click", function (e) {
    e.preventDefault();
    e.stopPropagation();
    var props = document.querySelector('#mobile-nav [data-mnav="props"]');
    if (props) props.click();
  });
  targetSelect = bar.querySelector("#cadTarget");
  targetSelect.value = S.measureTarget || "nearest";
  targetSelect.addEventListener("change", function () {
    S.measureTarget = targetSelect.value;
    if (S.measureTarget !== "manual") S.measureWalls = [];
    render2D();
  });

  var tw = bar.querySelector("#cadToggles");
  TOGGLES.forEach(function (tg) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "cad-chip";
    b.dataset.aid = tg.key;
    b.innerHTML = '<span class="t"></span><kbd>' + tg.kbd + "</kbd>";
    b.addEventListener("click", function () {
      toggleAid(tg.key);
    });
    tw.appendChild(b);
  });

  entry = document.createElement("div");
  entry.id = "cad-entry";
  entry.hidden = true;
  entry.innerHTML =
    '<label><span class="cad-e-lab"></span>' +
    '<input id="cadLen" type="text" inputmode="decimal" autocomplete="off"></label>' +
    '<label><span class="cad-e-lab"></span>' +
    '<input id="cadAng" type="text" inputmode="decimal" autocomplete="off"></label>' +
    '<label id="cadOffLab"><span class="cad-e-lab"></span>' +
    '<input id="cadOff" type="text" inputmode="decimal" autocomplete="off"></label>' +
    '<span class="cad-e-hint"></span>';
  host.appendChild(entry);
  inLen = entry.querySelector("#cadLen");
  inAng = entry.querySelector("#cadAng");
  inOff = entry.querySelector("#cadOff");
  labOff = entry.querySelector("#cadOffLab");
  [inLen, inAng, inOff].forEach(function (inp) {
    inp.addEventListener("input", previewFromEntry);
    inp.addEventListener("keydown", entryKey);
  });

  /* The bar tracks the pointer itself instead of piggy-backing on S.hoverPt:
     that field is only filled while the select tool is idle, and a coordinate
     readout that goes blank the moment you pick up a tool is worse than none. */
  plan.addEventListener(
    "pointermove",
    function (e) {
      // wx/wz are plan-frame; in an elevation they would report a plausible
      // but meaningless pair, which is worse than reporting nothing
      if (S.viewAxis && S.viewAxis !== "top") {
        curX = curZ = null;
      } else {
        curX = wx(e.offsetX, e.offsetY);
        curZ = wz(e.offsetX, e.offsetY);
      }
      updateCadHud();
    },
    { passive: true },
  );
  plan.addEventListener("pointerleave", function () {
    curX = curZ = null;
    updateCadHud();
  });
  // and once per painted frame, so the bar and the rubber-band label can never
  // disagree (interaction's own pointermove is throttled)
  onAfterRender(updateCadHud);
  window.addEventListener("planner-selection", updateCadHud);

  window.addEventListener("keydown", function (e) {
    var k = e.key;
    if (k === "F3" || k === "F8" || k === "F9") {
      e.preventDefault();
      toggleAid(k === "F3" ? "osnap" : k === "F8" ? "ortho" : "gsnap");
      return;
    }
    /* Tab steps to the next-ranked snap under the cursor. The ranking in
       snapPoint() is right far more often than not, but "far more often" is
       not "always", and the cure for one wrong latch must not be a settings
       popover that then stays wrong for every click afterwards. Ignored while
       the typed length/angle entry owns Tab. */
    if (k === "Tab" && !S.numEntry && !isTypingField(e.target)) {
      if (!S.snapAlts || S.snapAlts.length < 2) return;
      e.preventDefault();
      S.snapCycle = (Number(S.snapCycle) || 0) + 1;
      render2D();
      return;
    }
    /* Shift+key forces a single snap kind for the next click only — the
       one-point override every drafting package has. */
    if (e.shiftKey && !isTypingField(e.target)) {
      var only = SNAP_HOTKEY[k.toLowerCase()];
      if (!only) return;
      e.preventDefault();
      S.snapOnly = S.snapOnly === only ? null : only;
      render2D();
    }
  });

  buildTune(host);

  applyLangLabels();
  updateCadHud();
}

/* ---- snap tuning popover ------------------------------------------------
   Deliberately a popover and not six more chips in the bar: the bar has to
   stay readable at phone width, and these are settings you reach for once and
   then forget, unlike the three aids that get toggled mid-draw. */
function buildTune(host) {
  tune = document.createElement("div");
  tune.id = "cad-tune";
  tune.hidden = true;
  var html =
    '<div class="cad-tune-h"><span class="cad-tune-t"></span>' +
    '<button type="button" class="cad-tune-x" id="cadTuneX">&times;</button></div>' +
    '<label class="cad-tune-str"><span class="cad-tune-lab"></span>' +
    '<input id="cadTuneRange" type="range" min="0.25" max="2" step="0.05">' +
    '<b id="cadTuneVal"></b></label>' +
    '<div class="cad-tune-hint"></div><div class="cad-tune-kinds">';
  KINDS.forEach(function (kd) {
    html +=
      '<label class="cad-tune-k"><input type="checkbox" data-kind="' +
      kd.key +
      '"><span></span></label>';
  });
  html +=
    '</div><button type="button" class="cad-tune-reset" id="cadTuneReset"></button>';
  tune.innerHTML = html;
  host.appendChild(tune);
  tuneRange = tune.querySelector("#cadTuneRange");

  tuneRange.addEventListener("input", function () {
    S.snapStrength = parseFloat(tuneRange.value);
    savePrefs();
    syncTune();
    render2D();
  });
  tune.querySelectorAll("[data-kind]").forEach(function (cb) {
    cb.addEventListener("change", function () {
      if (!S.snapKinds) S.snapKinds = {};
      S.snapKinds[cb.dataset.kind] = cb.checked;
      savePrefs();
      syncTune();
      render2D();
    });
  });
  tune.querySelector("#cadTuneReset").addEventListener("click", function () {
    S.snapStrength = 1;
    S.snapKinds = {
      corner: true,
      midpoint: true,
      onwall: true,
      perpendicular: true,
      intersection: true,
      extension: true,
      bisector: true,
      inc: true,
      walldir: true,
      align: true,
      symmetry: true,
    };
    savePrefs();
    syncTune();
    render2D();
  });
  tune.querySelector("#cadTuneX").addEventListener("click", function () {
    tune.hidden = true;
  });
  bar.querySelector("#cadTuneBtn").addEventListener("click", function (e) {
    e.stopPropagation();
    tune.hidden = !tune.hidden;
    if (!tune.hidden) syncTune();
  });
  // clicking anywhere else closes it — a settings panel left open over the
  // plan is one more thing covering the drawing
  document.addEventListener("pointerdown", function (e) {
    if (!tune || tune.hidden) return;
    if (tune.contains(e.target) || e.target.closest("#cadTuneBtn")) return;
    tune.hidden = true;
  });
}

// mirror S into the popover's controls (and the chip's own on/off look)
function syncTune() {
  if (!tune) return;
  var mul = fin(S.snapStrength) ? S.snapStrength : 1;
  tuneRange.value = String(mul);
  tune.querySelector("#cadTuneVal").textContent = Math.round(mul * 100) + "%";
  var off = 0;
  tune.querySelectorAll("[data-kind]").forEach(function (cb) {
    var on = !S.snapKinds || S.snapKinds[cb.dataset.kind] !== false;
    cb.checked = on;
    if (!on) off++;
  });
  var btn = bar.querySelector("#cadTuneBtn");
  // the chip reports at a glance that snapping is no longer at its defaults,
  // so a plan that "won't snap" is never a mystery
  var tuned = off > 0 || Math.abs(mul - 1) > 0.001;
  btn.classList.toggle("tuned", tuned);
  btn.querySelector(".t").textContent = tuned ? Math.round(mul * 100) + "%" : "";
}

/* ---- drafting aids ---- */
function restorePrefs() {
  try {
    var p = JSON.parse(localStorage.getItem(PREFS) || "null");
    if (p && typeof p === "object")
      TOGGLES.forEach(function (tg) {
        if (typeof p[tg.key] === "boolean") S[tg.key] = p[tg.key];
      });
    if (p && fin(p.snapStrength)) S.snapStrength = p.snapStrength;
    if (p && p.snapKinds && typeof p.snapKinds === "object")
      KINDS.forEach(function (kd) {
        if (typeof p.snapKinds[kd.key] === "boolean")
          S.snapKinds[kd.key] = p.snapKinds[kd.key];
      });
  } catch (err) {
    /* corrupt prefs are not worth a broken editor — defaults stand */
  }
}
function savePrefs() {
  try {
    var p = {};
    TOGGLES.forEach(function (tg) {
      p[tg.key] = !!S[tg.key];
    });
    p.snapStrength = fin(S.snapStrength) ? S.snapStrength : 1;
    p.snapKinds = {};
    KINDS.forEach(function (kd) {
      p.snapKinds[kd.key] = !S.snapKinds || S.snapKinds[kd.key] !== false;
    });
    localStorage.setItem(PREFS, JSON.stringify(p));
  } catch (err) {}
}
export function toggleAid(key) {
  S[key] = !S[key];
  savePrefs();
  updateCadHud();
  render2D();
}

/* ---- readout ---- */
function fmt(v) {
  return (v < 0 ? "−" : "") + Math.abs(Math.round(v));
}
// last written strings — this runs once per rendered frame during a drag, and
// a needless textContent write there costs a layout on every one of them
var lastCoord = null,
  lastMain = null,
  lastSnap = null,
  lastAids = null;

function setText(el, s, prev) {
  if (s === prev) return prev;
  el.textContent = s;
  return s;
}

export function updateCadHud() {
  if (!bar) return;
  var unit = t("cm");
  lastCoord = setText(
    elCoord,
    curX == null || !fin(curX)
      ? "—"
      : "X " + fmt(curX) + "   Y " + fmt(-curZ) + "  " + unit,
    lastCoord,
  );

  // middle: what the current gesture is about to produce
  var main = "", selectionName = "", selectionDetail = "";
  /* A finger reads the length off the card that rides the draw point; printing
     it up here too put the same three numbers on screen twice. */
  if (touchDrawing()) main = "";
  else if (S.tool === "wall" && S.drawing && S.drawFrom != null && S.previewPt) {
    var a = S.nodes[S.drawFrom];
    if (a) {
      // interior span, matching the rubber-band label in the plan
      var len = Math.round(
        Math.max(
          0,
          Math.hypot(S.previewPt.x - a.x, S.previewPt.z - a.z) -
            (S.interiorDims !== false ? pendingCuts(S.drawFrom, S.previewPt) : 0),
        ),
      );
      var metrics = previewMetrics(S.drawFrom, S.previewPt);
      var turn = metrics && metrics.hasPrev
        ? ((metrics.turn * 180) / Math.PI)
        : segBearing(a, S.previewPt);
      var turnTxt = metrics && metrics.hasPrev
        ? t("cad_turn") + " " + (turn > 0 ? "+" : "") + Math.round(turn) + "°"
        : "∠ " + Math.round(turn) + "°";
      main = t("cad_len") + " " + len + " " + unit + "   " + turnTxt;
      if (metrics && metrics.parallel)
        main += "   " + t("cad_off") + " " + Math.round(metrics.parallel.abs) + " " + unit;
    }
  } else if (S.tool === "walloffset") {
    var od = S.offsetDraft;
    main = t("hint_tool_offset") + (od ? " · " + Math.round(od.dist) + " " + unit : "");
  } else if (S.tool === "wall") {
    main = t("cad_wall_ready");
  } else if (S.tool === "rect") {
    main = t("hint_tool_rect");
  } else if (S.tool === "slabvoid") {
    main = t("hint_tool_slabvoid");
  } else if (S.sel && S.sel.kind === "slabvoid" && S.sel.ref) {
    selectionName = S.sel.ref.name || t("sv_title");
    selectionDetail = Math.round(S.sel.ref.w) + " × " + Math.round(S.sel.ref.d) + " " + unit;
  } else if (S.sel && S.sel.kind === "wall") {
    selectionName = t("wallId", { id: S.sel.ref.id });
    selectionDetail = Math.round(wallLen(S.sel.ref)) + " " + unit;
  } else if (S.sel && S.sel.kind === "item" && S.sel.ref) {
    selectionName = S.sel.ref.name || flabel(S.sel.ref.type);
    selectionDetail = Math.round(S.sel.ref.w) + " × " + Math.round(S.sel.ref.d) + " " + unit;
  } else if (S.sel && S.sel.kind === "opening" && S.sel.ref) {
    selectionName = S.sel.ref.name || t(S.sel.ref.type === "door" ? "door" : S.sel.ref.type === "passage" ? "passage" : "window");
    selectionDetail = Math.round(S.sel.ref.w || S.sel.ref.width || 0) + " × " +
      Math.round(S.sel.ref.h || S.sel.ref.height || 0) + " " + unit;
  } else if (S.sel && S.sel.kind === "room") {
    selectionName = roomName(S.sel.ref) || t("room");
  } else if (S.sel && S.sel.kind === "marker" && S.sel.ref) {
    selectionName = S.sel.ref.name || t("mk_points");
  } else if (S.sel && S.sel.kind === "node") {
    selectionName = t("nd_title");
  } else if (S.sel && S.sel.kind === "items") {
    selectionName = t("cad_nsel", { n: S.sel.refs.length });
  }
  main = selectionName ? selectionName + (selectionDetail ? " · " + selectionDetail : "") : main;
  lastMain = setText(elName, selectionName || main, lastMain);
  setText(elDetail, selectionName ? selectionDetail : "", null);
  elMain.classList.toggle("is-selection", !!selectionName);
  elProps.hidden = !selectionName;
  if (selectionName) {
    var propsLabel = t("m_a_props");
    elProps.querySelector("span").textContent = propsLabel;
    elProps.setAttribute("aria-label", propsLabel + ": " + selectionName);
  }
  /* On a phone this bar is reduced to the instruction alone (css: the chips it
     used to carry moved into the mobile shell's contextual row). An empty
     instruction there would leave a blank band across the top of the plan, so
     say nothing by being nothing. */
  bar.classList.toggle("cad-quiet", !main);

  var si = S.snapInfo,
    live = S.tool === "wall" || S.tool === "arcwall" || S.tool === "rect" ||
      S.tool === "slabvoid" ||
      S.tool === "walloffset" || S.tool === "point" || S.action === "node" || S.action === "marker";
  var snapTxt = si && live
    ? (S.action === "node" && si.type === "corner" ? t("snap_join") : t(SNAP_LABEL[si.type] || "snap_grid"))
    : "";
  /* Say what else is under the cursor, and say when a kind has been forced.
     A ranked snap that picks the wrong candidate is only fixable if the user
     can see there WAS another candidate — otherwise the pick reads as the
     editor being wrong rather than as one of several readings. */
  if (snapTxt && S.snapOnly) snapTxt = t("snap_only", { k: t(SNAP_LABEL[S.snapOnly] || S.snapOnly) });
  else if (snapTxt && si && si.alts > 1) snapTxt += " · " + t("snap_alts", { n: si.alts });
  lastSnap = setText(elSnap, snapTxt, lastSnap);
  elSnap.classList.toggle(
    "on",
    !!(si && live && ["corner", "marker", "midpoint", "wall", "itemCorner", "perpendicular",
      "intersection", "extension", "bisector", "close", "hit", "jamb"].indexOf(si.type) !== -1),
  );

  var aids = TOGGLES.map(function (tg) {
    return S[tg.key] ? 1 : 0;
  }).join("");
  if (aids !== lastAids) {
    lastAids = aids;
    TOGGLES.forEach(function (tg) {
      var b = bar.querySelector('[data-aid="' + tg.key + '"]');
      if (!b) return;
      b.classList.toggle("on", !!S[tg.key]);
      b.setAttribute("aria-pressed", S[tg.key] ? "true" : "false");
    });
  }
}

function wallLen(w) {
  var a = S.nodes[w.a],
    b = S.nodes[w.b];
  if (!a || !b) return 0;
  return S.interiorDims !== false
    ? wallClearLength(w)
    : Math.hypot(b.x - a.x, b.z - a.z);
}

// re-label after a language switch (main.js onLangChange). Every memoised
// string is invalidated here, or the bar would keep the old language's text.
export function applyLangLabels() {
  if (!bar) return;
  TOGGLES.forEach(function (tg) {
    var b = bar.querySelector('[data-aid="' + tg.key + '"]');
    if (!b) return;
    b.querySelector(".t").textContent = t(tg.label);
    b.title = t(tg.label) + " · " + tg.kbd;
  });
  var tb = bar.querySelector("#cadTuneBtn");
  if (tb) tb.title = t("cad_tune");
  if (tune) {
    tune.querySelector(".cad-tune-t").textContent = t("cad_tune");
    tune.querySelector(".cad-tune-lab").textContent = t("cad_tune_str");
    tune.querySelector(".cad-tune-hint").textContent = t("cad_tune_hint");
    tune.querySelector(".cad-tune-reset").textContent = t("cad_tune_reset");
    KINDS.forEach(function (kd) {
      var cb = tune.querySelector('[data-kind="' + kd.key + '"]');
      if (cb) cb.nextElementSibling.textContent = t(kd.label);
    });
    syncTune();
  }
  bar.querySelector("#cadTargetLabel").textContent = t("cad_measure_to");
  var opts = targetSelect.options;
  opts[0].textContent = t("cad_target_nearest");
  opts[1].textContent = t("cad_target_object");
  opts[2].textContent = t("cad_target_wall");
  opts[3].textContent = t("cad_target_manual");
  targetSelect.title = t("cad_target_hint");
  var labs = entry.querySelectorAll(".cad-e-lab");
  labs[0].textContent = t("cad_len") + " (" + t("cm") + ")";
  labs[1].textContent = t("cad_ang") + " (°)";
  if (labs[2]) labs[2].textContent = t("cad_off") + " (" + t("cm") + ")";
  entry.querySelector(".cad-e-hint").textContent = t("cad_entry_hint");
  lastCoord = lastMain = lastSnap = lastAids = null;
  updateCadHud();
}

/* ---- typed precision entry ----------------------------------------------
   The point of the whole module. A plan editor that can only draw where the
   mouse happens to land is a sketching toy; typing "360 Tab 90 Enter" is how
   an actual room gets built. Opening on the first digit keeps it invisible
   until wanted, and because the field takes focus the plan's own 1-6 tool
   shortcuts stop firing on their own (interaction.js bails on INPUT). */
export function openEntry(seed) {
  if (!entry) return false;
  if (S.tool === "walloffset") {
    entry.hidden = false;
    inLen.parentElement.hidden = true;
    inAng.parentElement.hidden = true;
    if (labOff) labOff.hidden = false;
    inOff.value = seed || String(Math.round((S.offsetDraft && S.offsetDraft.dist) || resolveWallDrawDefaults().offsetDist));
    positionEntry();
    inOff.focus();
    inOff.setSelectionRange(0, inOff.value.length);
    return true;
  }
  if (!S.drawing || S.drawFrom == null) return false;
  var a = S.nodes[S.drawFrom];
  if (!a) return false;
  entry.hidden = false;
  inLen.parentElement.hidden = false;
  inAng.parentElement.hidden = false;
  var metrics = S.previewPt ? previewMetrics(S.drawFrom, S.previewPt) : null;
  if (labOff) labOff.hidden = !(metrics && metrics.parallel);
  var angLab = inAng.previousElementSibling;
  if (angLab) angLab.textContent = (metrics && metrics.hasPrev ? t("cad_turn") : t("cad_ang")) + " (°)";
  if (metrics && metrics.hasPrev)
    inAng.value = String(Math.round((metrics.turn * 180) / Math.PI));
  else
    inAng.value = S.previewPt ? String(segBearing(a, S.previewPt)) : "0";
  inLen.value = seed || "";
  inOff.value = metrics && metrics.parallel ? String(Math.round(metrics.parallel.abs)) : "";
  positionEntry();
  inLen.focus();
  inLen.setSelectionRange(inLen.value.length, inLen.value.length);
  return true;
}

export function closeEntry() {
  if (!entry || entry.hidden) return;
  entry.hidden = true;
  inLen.value = inAng.value = "";
  if (inOff) inOff.value = "";
  var focus = document.activeElement;
  if (focus === inLen || focus === inAng || focus === inOff)
    focus.blur();
}

export function entryOpen() {
  return !!entry && !entry.hidden;
}

function positionEntry() {
  /* Pinned just above the status bar rather than following the cursor: a panel
     that chases the pointer sits under the hand mid-type and jitters with the
     rubber band. The inline offset clears the floating tool pill, which is
     vertically centred and reaches this low on a short pane. */
  entry.style.insetInlineStart = "80px";
  entry.style.bottom = "40px";
}

function absAngleFromEntry() {
  var A = parseFloat(inAng.value);
  if (!fin(A)) A = 0;
  var prev = previousRunAngle();
  if (fin(prev) && S.drawWalls && S.drawWalls.length)
    return (prev * 180) / Math.PI + A;
  return A;
}

function previewFromEntry() {
  if (S.tool === "walloffset") {
    var off = parseFloat(inOff.value);
    if (fin(off) && off > 0) {
      S.wallDrawDefaults = Object.assign({}, S.wallDrawDefaults || {}, { offsetDist: off });
      if (S.offsetDraft) S.offsetDraft.dist = off;
      render2D();
    }
    return;
  }
  if (!S.drawing || S.drawFrom == null) return;
  var a = S.nodes[S.drawFrom];
  var L = parseFloat(inLen.value),
    A = absAngleFromEntry();
  if (!a || !fin(L) || L <= 0) return;
  var r = (A * Math.PI) / 180;
  var run = L + (S.interiorDims !== false ? pendingCuts(S.drawFrom, null) : 0);
  S.previewPt = { x: a.x + Math.cos(r) * run, z: a.z + Math.sin(r) * run };
  S.snapInfo = { type: "free", x: S.previewPt.x, z: S.previewPt.z };
  render2D();
}

function entryKey(e) {
  if (e.key === "Enter") {
    e.preventDefault();
    if (S.tool === "walloffset") {
      var off = parseFloat(inOff.value);
      if (fin(off) && off > 0) {
        S.wallDrawDefaults = Object.assign({}, S.wallDrawDefaults || {}, { offsetDist: off });
        if (S.offsetDraft) S.offsetDraft.dist = off;
      }
      closeEntry();
      render2D();
      return;
    }
    var L = parseFloat(inLen.value),
      A = absAngleFromEntry();
    if (!fin(L) || L <= 0) return;
    closeEntry();
    wallPointPolar(L, A);
    return;
  }
  if (e.key === "Escape") {
    e.preventDefault();
    closeEntry();
    render2D();
    return;
  }
  if (e.key === "Tab") {
    e.preventDefault();
    var fields = [inLen, inAng];
    if (labOff && !labOff.hidden) fields.push(inOff);
    fields = fields.filter(function (f) { return f && !f.parentElement.hidden; });
    var idx = fields.indexOf(e.target);
    var next = e.shiftKey
      ? fields[(idx - 1 + fields.length) % fields.length]
      : fields[(idx + 1) % fields.length];
    if (next) {
      next.focus();
      next.setSelectionRange(0, next.value.length);
    }
  }
  e.stopPropagation();
}

/* Called first from interaction.js's keydown so a digit reaches the entry
   instead of the 1-6 tool shortcuts. Returns true when the key was consumed. */
export function hudKeydown(e) {
  if (e.ctrlKey || e.metaKey || e.altKey) return false;
  if (entryOpen()) return false; // the inputs handle their own keys
  if (!(S.tool === "wall" && S.drawing) && S.tool !== "walloffset") return false;
  if (/^[0-9]$/.test(e.key) || e.key === ".") {
    e.preventDefault();
    return openEntry(e.key);
  }
  return false;
}

// the wall chain ended (Esc, right-click, tool change) -> no stale entry
export function onDrawEnded() {
  closeEntry();
  updateCadHud();
}
