/* The two panels the plan-level constraint layers need: named parameters in
   the sidebar, and a room's requirements in the room inspector.

   Kept out of ui_props.js because both are lists that rebuild themselves from
   their own model and neither belongs to the selected-object switch that file
   is organised around — a parameter is global, and a room requirement is
   keyed by a room rather than by a selection. */
import { S } from "./state.js";
import { t } from "./i18n.js";
import { render2D } from "./plan2d.js";
import { detectRooms } from "./geometry.js";
import { pushHistory } from "./history.js";
import { flash } from "./ui.js";
import { solveWallCons } from "./wall_constraints.js";
import {
  planVars, addPlanVar, removePlanVar, setPlanVar, resolvePlanParams,
} from "./plan_params.js";
import {
  consForRoom, addRoomArea, addRoomMinDim, addRoomRect, removeRoomCon,
  setRoomConValue, setRoomConMode, roomConError, roomConSatisfied,
  roomAreaM2, roomMinDim, solveRoomCons,
} from "./room_cons.js";
import { roomClearArea } from "./room_area.js";
import { fmtLen, fmtAreaM2 } from "./display_units.js";

/* ---- parameters --------------------------------------------------------- */

/* Re-resolve, re-render, re-solve. Every edit here can change a dimension the
   plan is built from, so a parameter edit is a geometry edit and goes through
   the same solve as typing the number would have. */
function applyParams() {
  var r = resolvePlanParams();
  solveWallCons();
  S.dirty3D = true;
  render2D();
  renderParams();
  return r;
}

export function renderParams() {
  var host = document.getElementById("pvList"),
    count = document.getElementById("pvCount");
  if (!host) return;
  var vars = planVars(),
    resolved = resolvePlanParams();
  if (count) {
    count.textContent = vars.length ? String(vars.length) : "";
    count.classList.toggle("on", vars.length > 0);
  }
  host.innerHTML = "";
  vars.forEach(function (v) {
    var row = document.createElement("div");
    row.className = "pv-row";

    var name = document.createElement("input");
    name.type = "text";
    name.className = "pv-name";
    name.value = v.name;
    name.title = t("pv_name");
    name.addEventListener("change", function () {
      pushHistory();
      // a refused rename must put the old name back in the box, or the field
      // shows a name the model does not have
      if (!setPlanVar(v.id, name.value, null)) {
        name.value = v.name;
        return flash(t("pv_bad"), "error");
      }
      applyParams();
    });

    var expr = document.createElement("input");
    expr.type = "text";
    expr.className = "pv-expr";
    expr.value = v.expr;
    expr.title = t("pv_expr");
    expr.addEventListener("change", function () {
      pushHistory();
      setPlanVar(v.id, null, expr.value);
      var out = applyParams();
      var bad = out.errors.find(function (e) { return e.id === v.id; });
      if (bad) flash(bad.message, "error");
    });

    /* The resolved number, shown beside the expression. Without it a
       parameter written as `w / 2 + 15` is a thing you have to work out in
       your head every time you look at it. */
    var val = document.createElement("b");
    val.className = "pv-val";
    var got = resolved.named.find(function (q) { return q.id === v.id; });
    var bad = resolved.errors.find(function (e) { return e.id === v.id; });
    val.textContent = bad ? "!" : got && got.value != null
      ? String(Math.round(got.value * 100) / 100) : "?";
    if (bad) {
      val.classList.add("pv-bad");
      val.title = bad.message;
    }

    var del = document.createElement("button");
    del.className = "con-btn con-del";
    del.innerHTML = '<i class="ph ph-x"></i>';
    del.title = t("del");
    del.addEventListener("click", function () {
      pushHistory();
      removePlanVar(v.id);
      applyParams();
    });

    row.appendChild(name);
    row.appendChild(expr);
    row.appendChild(val);
    row.appendChild(del);
    host.appendChild(row);
  });
}

export function addParam() {
  pushHistory();
  // a name that is free on the first try, so the row is usable immediately
  var n = 1, name;
  do { name = "p" + n++; } while (!addPlanVarSafely(name));
  applyParams();
}
function addPlanVarSafely(name) {
  return !!addPlanVar(name, "100");
}

/* ---- room requirements -------------------------------------------------- */

export function renderRoomCons(key) {
  var host = document.getElementById("r_conList"),
    measure = document.getElementById("r_measure"),
    rectBtn = document.getElementById("rc_rect_btn");
  if (!host) return;
  host.innerHTML = "";
  if (!key) return;

  var room = detectRooms().find(function (entry) { return entry.key === key; }),
    clear = room && roomClearArea(S, room),
    area = clear && clear.area != null ? clear.area : roomAreaM2(key), narrow = roomMinDim(key);
  if (measure)
    measure.textContent = t(clear && clear.area != null ? "rc_measure_usable" : "rc_measure_reference", {
      a: area == null ? "?" : fmtAreaM2(area),
      d: narrow == null ? "?" : fmtLen(narrow, { domain: "rooms" }),
    });
  if (rectBtn) rectBtn.disabled = !canSquare(key);

  consForRoom(key).forEach(function (c) {
    var row = document.createElement("div");
    row.className = "con-row" + (roomConSatisfied(c) ? "" : " con-bad");

    var ic = document.createElement("i");
    ic.className = "ph " + (c.type === "roomArea" ? "ph-selection-all"
      : c.type === "roomMinDim" ? "ph-arrows-out-line-horizontal" : "ph-square");
    row.appendChild(ic);

    var name = document.createElement("span");
    name.className = "con-name";
    name.textContent = c.type === "roomRect" ? t("rc_rectLbl")
      : c.type === "roomMinDim" ? t("rc_dimLbl", { v: Math.round(c.value) })
        : t(c.mode === "max" ? "rc_areaMax" : c.mode === "exact" ? "rc_areaEq" : "rc_areaLbl",
          { v: Math.round(c.value * 10) / 10 });
    row.appendChild(name);

    if (c.type !== "roomRect") {
      var inp = document.createElement("input");
      inp.type = "number";
      inp.className = "con-val";
      inp.step = c.type === "roomArea" ? "0.1" : "1";
      inp.value = String(c.value);
      inp.addEventListener("change", function () {
        var v = parseFloat(inp.value);
        if (!isFinite(v)) return;
        pushHistory();
        setRoomConValue(c.id, v);
        renderRoomCons(key);
        render2D();
      });
      row.appendChild(inp);
    }

    if (c.type === "roomArea") {
      var mode = document.createElement("select");
      mode.className = "con-face-select";
      [["min", "≥"], ["exact", "="], ["max", "≤"]].forEach(function (e) {
        var o = document.createElement("option");
        o.value = e[0];
        o.textContent = e[1];
        mode.appendChild(o);
      });
      mode.value = c.mode || "min";
      mode.addEventListener("change", function () {
        pushHistory();
        setRoomConMode(c.id, mode.value);
        renderRoomCons(key);
        render2D();
      });
      row.appendChild(mode);
    }

    // how far short, only when it IS short — a met requirement stays quiet
    var err = roomConError(c);
    if (err != null && !roomConSatisfied(c)) {
      var e = document.createElement("span");
      e.className = "con-err";
      e.textContent = t("rc_short", { v: Math.round(err * 10) / 10 });
      row.appendChild(e);
    }

    var del = document.createElement("button");
    del.className = "con-btn con-del";
    del.innerHTML = '<i class="ph ph-x"></i>';
    del.title = t("del");
    del.addEventListener("click", function () {
      pushHistory();
      removeRoomCon(c.id);
      renderRoomCons(key);
      render2D();
    });
    row.appendChild(del);

    host.appendChild(row);
  });
}

/* Only a four-corner loop can be squared up — see solveRoomRect. detectRooms
   is cached by topology signature, so asking it here is a lookup, not a
   re-derivation. */
function canSquare(key) {
  var r = detectRooms().find(function (q) { return q.key === key; });
  return !!r && r.pts.length === 4;
}

/* The room-panel verbs. Returns true when it handled the action. */
export function runRoomConAction(act, key) {
  if (!key) return false;
  var made = null;
  if (act === "rcArea") {
    pushHistory();
    made = addRoomArea(key, null, "min");
  } else if (act === "rcMinDim") {
    pushHistory();
    made = addRoomMinDim(key, null);
  } else if (act === "rcRect") {
    if (!canSquare(key)) {
      flash(t("rc_needRect"), "error");
      return true;
    }
    pushHistory();
    made = addRoomRect(key);
    if (made) {
      solveRoomCons();
      S.dirty3D = true;
    }
  } else return false;
  if (!made) flash(t("wc_failed"), "error");
  renderRoomCons(key);
  render2D();
  return true;
}
