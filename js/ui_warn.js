/* The constraint engine's message list.
   Every glow on the plan has a row here and every row has a glow: hovering
   either one lights up the other (S.warnHover), picking either one selects it
   (S.warnSel) and brings the offending corner into view. Nothing in this file
   repairs anything — the whole point of the engine is that the user decides
   what to do about a loose joint, and "Ignore" is one of the valid answers. */
import { S } from "./state.js";
import { t, onLangChange } from "./i18n.js";
import { wallById, wallGeom } from "./geometry.js";
import { render2D, centerOn, isOnScreen, warnLabel } from "./plan2d.js";
import {
  jointWarnings, activeWarnings, ignoreWarning, unignoreWarning, clearIgnored,
} from "./constraint_engine.js";
import {
  conIssues, conLabelText, conUnit, conCurrent, conSatisfied, wallCons,
  anchorPos, openingById, openingPos,
} from "./wall_constraints.js";
import { planDof } from "./wall_dof.js";
import { select, flash, squareJoint, squaredMsg } from "./ui.js";
import { pushHistory } from "./history.js";

var listEl = null,
  countEl = null,
  emptyEl = null,
  ignoredWrap = null,
  showIgnored = false,
  lastSig = "";

function els() {
  if (!listEl) {
    listEl = document.getElementById("warnList");
    countEl = document.getElementById("warnCount");
    emptyEl = document.getElementById("warnEmpty");
    ignoredWrap = document.getElementById("warnIgnoredWrap");
  }
  return !!listEl;
}

/* A row describes the geometry it complains about in the terms the user drew
   it in: which walls, how long they are, how far off square the corner is. */
function detailText(wr) {
  var names = wr.walls
    .map(function (id) {
      var w = wallById(id);
      if (!w) return null;
      return t("cw_wallLen", {
        id: id,
        L: Math.round(wallGeom(w).L),
      });
    })
    .filter(Boolean);
  if (wr.kind === "openEnd")
    return names.join("") + (wr.near ? " · " + t("cw_nearWall", { id: wr.near.id }) : "");
  return names.join(" · ");
}

function rowFor(wr) {
  var row = document.createElement("div");
  row.className =
    "warnRow warn-" + wr.kind + (wr.ignored ? " warnOff" : "") +
    (S.warnSel === wr.key ? " sel" : "") +
    (S.warnHover === wr.key ? " hot" : "");
  row.dataset.key = wr.key;
  if (wr.kind === "con") row.dataset.conId = String(wr.con.id);

  var ic = document.createElement("i");
  ic.className =
    "ph " + (wr.kind === "con" ? "ph-ruler"
      : wr.kind === "openEnd" ? "ph-link-break" : "ph-angle");
  row.appendChild(ic);

  var txt = document.createElement("div");
  txt.className = "warnTxt";
  var ttl = document.createElement("b");
  ttl.textContent = wr.kind === "con" ? wr.title : warnLabel(wr);
  var det = document.createElement("span");
  det.textContent = wr.kind === "con" ? wr.detail : detailText(wr);
  txt.appendChild(ttl);
  txt.appendChild(det);
  row.appendChild(txt);

  /* A dimension conflict has no "ignore": the cure is to change, suppress or
     delete the dimension, all of which live in its own inspector. Picking the
     row takes you there. A loose joint is different — the engine deliberately
     lets the user say "yes, I meant that", which is what the eye button is. */
  if (wr.kind === "con") {
    row.onmouseenter = function () {
      S.warnHover = wr.key;
      setConstraintHover(wr.con);
      syncWarnHighlight();
      render2D();
    };
    row.onmouseleave = function () {
      if (S.warnHover === wr.key) S.warnHover = null;
      if (S.conHover === wr.con.id) setConstraintHover(null);
      syncWarnHighlight();
      render2D();
    };
    row.onclick = function () {
      select({ kind: "con", ref: wr.con });
      S.warnSel = wr.key;
      if (wr.x || wr.z) { if (!isOnScreen(wr.x, wr.z)) centerOn(wr.x, wr.z); }
      renderWarnPanel(true);
      render2D();
    };
    return row;
  }

  if (wr.kind === "angle") {
    var btnFix = document.createElement("button");
    btnFix.className = "warnAck warnFix";
    btnFix.title = t("cw_squareJoint");
    btnFix.innerHTML = '<i class="ph ph-corners"></i>';
    btnFix.onclick = function (e) {
      e.stopPropagation();
      pushHistory();
      fixAngleWarning(wr);
    };
    row.appendChild(btnFix);
  }

  var btn = document.createElement("button");
  btn.className = "warnAck";
  btn.title = wr.ignored ? t("cw_restoreOne") : t("cw_ignoreT");
  btn.innerHTML =
    '<i class="ph ' + (wr.ignored ? "ph-eye" : "ph-eye-slash") + '"></i>';
  btn.onclick = function (e) {
    e.stopPropagation();
    // an acknowledgement is an edit to the design, so it is undoable
    pushHistory();
    if (wr.ignored) unignoreWarning(wr.key);
    else {
      ignoreWarning(wr.key);
      if (S.warnSel === wr.key) S.warnSel = null;
      if (S.warnHover === wr.key) S.warnHover = null;
      flash(t("f_warnIgnored"));
    }
    renderWarnPanel(true);
    render2D();
  };
  row.appendChild(btn);

  row.onmouseenter = function () {
    S.warnHover = wr.key;
    syncWarnHighlight();
    render2D();
  };
  row.onmouseleave = function () {
    if (S.warnHover !== wr.key) return;
    S.warnHover = null;
    syncWarnHighlight();
    render2D();
  };
  row.onclick = function () {
    focusWarning(wr);
  };
  return row;
}

export function fixAngleWarning(wr) {
  if (!wr || wr.kind !== "angle" || !wr.walls || wr.walls.length < 2) return;
  var w1 = wallById(wr.walls[0]),
    w2 = wallById(wr.walls[1]);
  if (!w1 || !w2) return;
  var ni = wr.node != null ? wr.node : (w1.a === w2.a || w1.a === w2.b ? w1.a : w1.b);
  var sq = squareJoint(ni, w1, w2);
  if (sq) flash(squaredMsg(sq));
  else flash(t("f_squareBlocked"), "error");
}

/* Picking a message selects what it is about in the plan: the wall, so the
   inspector shows the length and angle being held, and the corner is brought
   into view if it had scrolled off. */
export function focusWarning(wr) {
  var w = wallById(wr.walls[0]);
  if (w) select({ kind: "wall", ref: w }); // select() clears warnSel, so mark after
  S.warnSel = wr.key;
  if (!isOnScreen(wr.x, wr.z)) centerOn(wr.x, wr.z);
  renderWarnPanel(true);
  render2D();
}

/* Hover changes nothing but which row is lit, so it must not rebuild the list —
   a rebuild under the cursor would drop the mouseleave and strand the
   highlight. Toggle the classes on the rows that are already there. */
export function syncWarnHighlight() {
  if (!els()) return;
  var rows = listEl.querySelectorAll(".warnRow");
  for (var i = 0; i < rows.length; i++) {
    var k = rows[i].dataset.key;
    rows[i].classList.toggle("hot", k === S.warnHover);
    rows[i].classList.toggle("sel", k === S.warnSel);
    if (k === S.warnSel && rows[i].scrollIntoView)
      rows[i].scrollIntoView({ block: "nearest" });
  }
}

/* All constraint lists and the canvas share one hover id. Updating CSS
   classes in place avoids rebuilding a list underneath the pointer (which
   would lose mouseleave and strand the highlight). */
export function syncConstraintHighlight() {
  var rows = document.querySelectorAll("[data-con-id]");
  for (var i = 0; i < rows.length; i++)
    rows[i].classList.toggle("hot", rows[i].dataset.conId === String(S.conHover));
}
export function setConstraintHover(c) {
  var id = c && c.id != null ? c.id : null;
  if (S.conHover === id) return false;
  S.conHover = id;
  syncConstraintHighlight();
  return true;
}

/* A violated DIMENSION, rendered as a row in the same list as a loose joint.
   The two used to live in different places — joints here, constraint conflicts
   only as a red glyph on the plan plus a line in whichever wall's inspector
   happened to mention them — so "what is wrong with this drawing?" had two
   answers in two panels and neither one was complete. */
function conRows() {
  return conIssues().map(function (issue) {
    var c = issue.con, unit = conUnit(c),
      pos = conPos(c);
    return {
      key: "con:" + c.id,
      kind: "con",
      con: c,
      walls: [],
      x: pos ? pos.x : 0,
      z: pos ? pos.z : 0,
      title: conLabelText(c, t),
      detail: t("wc_outBy", {
        v: fmtErr(issue.error, unit),
        tol: fmtErr(unit === "deg" ? 0.15 : 0.3, unit),
      }),
      ignored: false,
    };
  });
}
function fmtErr(v, unit) {
  var n = Math.round((Number(v) || 0) * 100) / 100;
  return unit === "deg" ? n + "°" : n + " " + t("cm");
}
/* Somewhere on the plan to scroll to when the row is picked. Any corner the
   constraint touches will do — it is a "show me where" target, not a layout. */
function conPos(c) {
  var anchored = anchorPos(c.a) || anchorPos(c.b) || anchorPos(c.point) || anchorPos(c.joint);
  if (anchored) return { x: anchored.x, z: anchored.z };
  var op = openingPos(openingById(c.opening)) ||
    (c.type === "openAlign" ? openingPos(openingById(c.a)) : null) ||
    (c.openings && c.openings.length ? openingPos(openingById(c.openings[0])) : null);
  if (op) return { x: op.x, z: op.z };
  var w = wallById(c.wall != null ? c.wall : c.ref);
  if (w && S.nodes[w.a]) return { x: S.nodes[w.a].x, z: S.nodes[w.a].z };
  var ws = (c.walls || []).map(wallById).filter(Boolean);
  if (ws.length && S.nodes[ws[0].a]) return { x: S.nodes[ws[0].a].x, z: S.nodes[ws[0].a].z };
  return null;
}

/* The drawing's overall state, in the four words a sketcher uses. Shown above
   the list because it answers a question the row-by-row view cannot: a plan
   with no complaints may still be under-defined, and one that looks right may
   already be over-defined and about to fight the next dimension added. */
function renderDofLine() {
  var host = document.getElementById("warnDof");
  if (!host) return;
  /* Rank is O(residuals · variables²) — cheap on a normal plan, not free on a
     large one, and never worth doing mid-drag. Skipped entirely while a
     gesture is running; the row is refreshed when it lands. */
  if (S.action) return;
  var d = planDof();
  /* The status words are hyphenated ("under-constrained") because that is how
     a sketcher spells them, but a hyphen cannot appear in an i18n key — the
     lookup silently returns the key itself, which is how "dof_under-
     constrained" ended up rendered in the panel. Translate on the underscored
     name, keep the hyphen for the CSS class. */
  host.textContent = t("dof_" + d.status.replace(/-/g, "_"), { n: d.degreesOfFreedom });
  host.className = "warnDof dof-" + d.status;
  host.hidden = !wallCons().length && d.status === "under-constrained";
}

/* Every dimension in the drawing, satisfied or not, suppressed or not.
   Separate from the message list above, which is deliberately only about what
   is WRONG: this one answers "what have I actually stated?", and it is the
   only way to find a dimension whose geometry is off-screen or whose wall you
   are no longer selecting. */
function renderAllCons() {
  var wrap = document.getElementById("conAllWrap"),
    host = document.getElementById("conAllList");
  if (!wrap || !host) return;
  var list = wallCons();
  wrap.hidden = !list.length;
  if (!list.length) {
    host.innerHTML = "";
    return;
  }
  wrap.querySelector("summary").textContent =
    t("wc_allTitle") + " · " + list.length;
  host.innerHTML = "";
  list.forEach(function (c) {
    var row = document.createElement("div");
    row.className = "con-all-row" +
      (c.off ? " con-off" : "") +
      (c.report ? " con-report" : "") +
      (!c.off && !c.report && !conSatisfied(c) ? " con-bad" : "") +
      (S.sel && S.sel.kind === "con" && S.sel.ref && S.sel.ref.id === c.id ? " sel" : "") +
      (S.conHover === c.id ? " hot" : "");
    row.dataset.conId = String(c.id);
    var name = document.createElement("span");
    name.textContent = conLabelText(c, t);
    var val = document.createElement("b");
    /* A relation with no stated value (a pin, a coincidence) measures its own
       DRIFT, so the number is only worth showing when it is non-zero — "0 cm"
       against a pin reads as a dimension of zero rather than as "holding". */
    var unit = conUnit(c), cur = conCurrent(c);
    val.textContent = cur == null ? "—"
      : unit ? fmtErr(cur, unit)
        : conSatisfied(c) ? "✓" : fmtErr(cur, "cm");
    row.appendChild(name);
    row.appendChild(val);
    row.onclick = function () {
      select({ kind: "con", ref: c });
      renderWarnPanel(true);
      render2D();
    };
    row.onmouseenter = function () {
      setConstraintHover(c);
      render2D();
    };
    row.onmouseleave = function () {
      if (S.conHover === c.id) setConstraintHover(null);
      render2D();
    };
    host.appendChild(row);
  });
}

/* Rebuild the list. Cheap to call from every post-edit resync: it compares a
   signature of the visible warnings first and does nothing when they haven't
   changed, which is the normal case while dragging furniture around. */
export function renderWarnPanel(force) {
  if (!els()) return;
  var all = jointWarnings().concat(conRows());
  var sig =
    (showIgnored ? "i" : "-") + S.warnSel + "|" +
    all
      .map(function (w) {
        return w.key + (w.ignored ? "!" : "") + (w.angle ? w.angle.toFixed(1) : "") +
          (w.detail || "");
      })
      .join(";");
  /* The state line is refreshed BEFORE the early return. Adding a satisfied
     dimension produces no row — only violated ones are listed — so the
     signature is unchanged and the list rightly skips its rebuild; but the
     drawing just lost a degree of freedom, and that is exactly what this line
     exists to report. Keeping it behind the guard made it read one edit
     stale, which is worse than not showing it at all. */
  renderDofLine();
  renderAllCons();
  if (!force && sig === lastSig) return;
  lastSig = sig;

  var live = all.filter(function (w) {
    return !w.ignored;
  });
  var off = all.filter(function (w) {
    return w.ignored;
  });

  listEl.innerHTML = "";
  live.forEach(function (wr) {
    listEl.appendChild(rowFor(wr));
  });
  if (showIgnored)
    off.forEach(function (wr) {
      listEl.appendChild(rowFor(wr));
    });

  if (countEl) {
    countEl.textContent = live.length ? String(live.length) : "";
    countEl.classList.toggle("on", live.length > 0);
  }
  if (emptyEl) emptyEl.style.display = live.length ? "none" : "";
  if (ignoredWrap) {
    ignoredWrap.style.display = off.length ? "" : "none";
    var tog = document.getElementById("warnShowIgnored");
    if (tog)
      tog.querySelector("span").textContent = showIgnored
        ? t("cw_hideIgnored", { n: off.length })
        : t("cw_showIgnored", { n: off.length });
  }
}

export function initWarnPanel() {
  if (!els()) return;
  var tog = document.getElementById("warnShowIgnored");
  if (tog)
    tog.addEventListener("click", function () {
      showIgnored = !showIgnored;
      renderWarnPanel(true);
    });
  var restore = document.getElementById("warnRestoreAll");
  if (restore)
    restore.addEventListener("click", function () {
      if (!S.ignoredWarnings || !Object.keys(S.ignoredWarnings).length) return;
      pushHistory();
      clearIgnored();
      renderWarnPanel(true);
      render2D();
      flash(t("f_warnRestored"));
    });
  // the panel's own text is generated here, so it has to be redrawn on a
  // language switch like every other JS-rendered list
  onLangChange(function () {
    renderWarnPanel(true);
  });
  renderWarnPanel(true);
}

/* How many complaints are outstanding — for anything that wants a badge. */
export function warnCount() {
  return activeWarnings().length;
}
