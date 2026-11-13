/* The stair designer in the item inspector (#i_stair_design), and the bound
   stairwell's row in the slab-void inspector (#sv_bound).

   A designed flight (it.configuration.stair, js/stair_layout.js) is edited
   here: shape, turn side, landing or winders, width, going, risers, rise and
   the runs between turns, with a live read-out against the project's
   jurisdiction (the code check's profile). Its footprint and height are
   OUTPUTS of the design, so the generic W/D/H fields are disabled for it.

   Every edit is one undo step: pushHistory, applyStairConfig, the bound
   voids follow (syncStairVoids), the 3D piece rebuilds, the plan redraws,
   and the panel is rebuilt with the focused field focused again. */
import { fmtLen, parseLen, unitLabel, writeLen } from "../display_units.js";
import { floorAbove, followReferenceFloor, switchFloorAndWait } from "../floors.js";
import { pushHistory } from "../history.js";
import { getLang } from "../i18n.js";
import { render2D } from "../plan2d.js";
import { S, touchItem3D } from "../state.js";
import { codeText } from "../code_check_strings.js";
import { formatCodeValue } from "../code_profiles.js";
import {
  addStairTurn, applyStairConfig, autoStair, fitStair, mirrorStair, normalizeStair, presetOf,
  removeStairRun, setRiserCount, setRunSteps, stairCodeReport, stairLayout, stairPreset,
  stairRiserCount, stairVariantShape,
} from "../stair_layout.js";
import { activeStairCode, findStairsForVoid, riseToFloorAbove } from "../stair_floors.js";
import { stairText as T } from "../stair_strings.js";
import { fillProps, select } from "../ui_props.js";
import { refreshTree } from "../ui_tree.js";
import { flash, syncStairVoids } from "../ui.js";

var LOCK_IDS = ["i_w", "i_d", "i_h"];

function el(tag, cls, text) {
  var n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) { n.textContent = text; n.dir = "auto"; }
  return n;
}

function lockSizeFields(locked) {
  LOCK_IDS.forEach(function (id) {
    var f = document.getElementById(id);
    if (!f) return;
    if (locked) {
      f.disabled = true;
      f.title = T("sizeLocked");
      f.dataset.stairLocked = "1";
    } else if (f.dataset.stairLocked) {
      f.disabled = false;
      f.removeAttribute("title");
      delete f.dataset.stairLocked;
    }
  });
}

/* Write a new design onto the flight as one undo step. */
function commit(it, cfg, rise) {
  if (!cfg) return false;
  pushHistory();
  applyStairConfig(it, cfg, rise != null ? rise : it.h);
  syncStairVoids(it);
  touchItem3D(it, "build");
  S.dirty3D = true;
  render2D();
  fillProps();
  return true;
}

function refit(cfg, it, rise) {
  return cfg.autoSteps ? fitStair(cfg, rise != null ? rise : it.h, activeStairCode().rules) : cfg;
}

function firstQuarter(cfg) {
  return cfg.turns.find(function (t) { return t !== "S"; }) || null;
}

function segmented(options, current, onPick) {
  var row = el("div", "stair-seg");
  options.forEach(function (o) {
    var b = el("button", "stair-seg-btn" + (o.value === current ? " on" : ""), o.label);
    b.type = "button";
    b.dataset.stairKey = o.key || "";
    if (o.disabled) b.disabled = true;
    b.setAttribute("aria-pressed", o.value === current ? "true" : "false");
    b.addEventListener("click", function () { if (o.value !== current) onPick(o.value); });
    row.appendChild(b);
  });
  return row;
}

function lengthField(key, label, cm, onSet) {
  var lab = el("label", "stair-field");
  lab.appendChild(el("span", null, label + " (" + unitLabel("furniture") + ")"));
  var inp = document.createElement("input");
  inp.type = "text";
  inp.inputMode = "decimal";
  inp.autocomplete = "off";
  inp.dataset.stairKey = key;
  writeLen(inp, cm, { domain: "furniture", digits: 1 });
  inp.addEventListener("change", function () {
    var v = parseLen(this.value, "furniture");
    if (!Number.isFinite(v) || v <= 0) { writeLen(inp, cm, { domain: "furniture", digits: 1 }); return; }
    onSet(v);
  });
  inp.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); this.blur(); } });
  lab.appendChild(inp);
  return lab;
}

function intField(key, label, n, min, onSet) {
  var lab = el("label", "stair-field");
  lab.appendChild(el("span", null, label));
  var inp = document.createElement("input");
  inp.type = "number";
  inp.inputMode = "numeric";
  inp.min = String(min);
  inp.step = "1";
  inp.value = String(n);
  inp.dataset.stairKey = key;
  inp.addEventListener("change", function () {
    var v = Math.round(Number(this.value));
    if (!Number.isFinite(v) || v < min) { this.value = String(n); return; }
    onSet(v);
  });
  lab.appendChild(inp);
  return lab;
}

function checkRow(key, label, checked, onSet, title) {
  var lab = el("label", "check-row stair-check");
  var inp = document.createElement("input");
  inp.type = "checkbox";
  inp.checked = !!checked;
  inp.dataset.stairKey = key;
  inp.addEventListener("change", function () { onSet(this.checked); });
  lab.appendChild(inp);
  lab.appendChild(el("span", null, label));
  if (title) lab.title = title;
  return lab;
}

function turnSelect(key, value, onSet) {
  var sel = document.createElement("select");
  sel.className = "stair-turn-sel";
  sel.dataset.stairKey = key;
  [["L", T("turnL")], ["R", T("turnR")], ["S", T("turnS")]].forEach(function (o) {
    var opt = document.createElement("option");
    opt.value = o[0];
    opt.textContent = o[1];
    sel.appendChild(opt);
  });
  sel.value = value;
  sel.addEventListener("change", function () { onSet(this.value); });
  return sel;
}

function codeBlock(it, lay) {
  var code = activeStairCode(), units = code.profile ? code.profile.units : "metric";
  var rows = stairCodeReport(lay, code.rules), box = el("div", "stair-code");
  box.appendChild(el("div", "stair-code-title", T("code", { name: code.name })));
  var names = { stairMaxRiser: "riser", stairMinTread: "goingRow", stairMaxPitch: "pitch", stairStrideMin: "stride", stairStrideMax: "stride" };
  var failing = false;
  rows.forEach(function (r) {
    if (!r.ok) failing = true;
    var line = el("div", "stair-code-row " + (r.ok ? "ok" : "fail"));
    line.appendChild(el("span", "stair-code-mark", r.ok ? "✓" : "✗"));
    line.appendChild(el("span", "stair-code-name", T(names[r.rule] || r.rule) + (r.note ? " (" + T("winderNote") + ")" : "")));
    var unit = r.unit === "angle" ? "angle" : "length";
    line.appendChild(el("span", "stair-code-val",
      formatCodeValue(unit, r.value, units, getLang()) + "  " + (r.kind === "max" ? "≤ " : "≥ ") + formatCodeValue(unit, r.limit, units, getLang())));
    box.appendChild(line);
  });
  var fit = el("button", "stair-fit" + (failing ? " warn" : ""), T("fit"));
  fit.type = "button";
  fit.dataset.stairKey = "fit";
  fit.addEventListener("click", function () {
    commit(it, fitStair(lay.config, it.h, code.rules), it.h);
  });
  box.appendChild(fit);
  box.appendChild(el("div", "stair-code-note t", codeText("disclaimer")));
  return box;
}

function runRows(it, cfg) {
  var box = el("div", "stair-runs");
  box.appendChild(el("div", "stair-sub", T("runs")));
  cfg.runs.forEach(function (n, i) {
    var row = el("div", "stair-run-row");
    row.appendChild(el("span", "stair-run-name", T("run", { n: i + 1 })));
    var inp = document.createElement("input");
    inp.type = "number";
    inp.min = "0";
    inp.step = "1";
    inp.value = String(n);
    inp.dataset.stairKey = "run" + i;
    inp.addEventListener("change", function () {
      var next = setRunSteps(cfg, i, Number(this.value));
      if (!next) {
        this.value = String(n);
        flash(T("run", { n: i + 1 }) + " ✗", "error");
        return;
      }
      if (cfg.autoSteps && next.runs.reduce(function (a, b) { return a + b; }, 0) !== cfg.runs.reduce(function (a, b) { return a + b; }, 0)) next.autoSteps = false;
      commit(it, next, it.h);
    });
    row.appendChild(inp);
    row.appendChild(el("span", "stair-run-unit", T("stepsUnit")));
    if (cfg.runs.length > 1) {
      var x = el("button", "stair-run-x", "×");
      x.type = "button";
      x.title = T("removeRun");
      x.dataset.stairKey = "rm" + i;
      x.addEventListener("click", function () { commit(it, refit(removeStairRun(cfg, i) || cfg, it), it.h); });
      row.appendChild(x);
    }
    box.appendChild(row);
    if (i < cfg.turns.length) {
      var tr = el("div", "stair-turn-row");
      tr.appendChild(turnSelect("turn" + i, cfg.turns[i], function (v) {
        var next = normalizeStair(cfg);
        next.turns[i] = v;
        commit(it, refit(next, it), it.h);
      }));
      box.appendChild(tr);
    }
  });
  var add = el("button", "stair-add", T("addTurn"));
  add.type = "button";
  add.dataset.stairKey = "add";
  add.addEventListener("click", function () { commit(it, refit(addStairTurn(cfg, firstQuarter(cfg) || "R"), it), it.h); });
  box.appendChild(add);
  return box;
}

function build(box, it) {
  var lay = stairLayout(it, stairVariantShape(it.variant)), cfg = lay.config, rise = it.h;
  box.appendChild(el("div", "stair-title", T("title")));
  var shape = presetOf(cfg), quarter = firstQuarter(cfg), N = stairRiserCount(cfg);
  function reshape(kind) {
    var opts = { risers: N, width: cfg.width, going: cfg.going, turn: quarter || "R", turnType: cfg.turnType, autoSteps: cfg.autoSteps, autoRise: cfg.autoRise };
    commit(it, cfg.autoSteps
      ? autoStair({ rise: rise, rules: activeStairCode().rules, preset: kind, width: cfg.width, turn: opts.turn, turnType: cfg.turnType, autoRise: cfg.autoRise })
      : stairPreset(kind, opts), rise);
  }
  box.appendChild(el("div", "stair-sub", T("shape")));
  box.appendChild(segmented([
    { value: "straight", label: T("straight"), key: "shape-straight" },
    { value: "L", label: T("L"), key: "shape-L" },
    { value: "U", label: T("U"), key: "shape-U" },
    { value: "custom", label: T("custom"), key: "shape-custom", disabled: shape !== "custom" },
  ], shape, reshape));
  if (quarter) {
    box.appendChild(el("div", "stair-sub", T("turn")));
    box.appendChild(segmented([
      { value: "L", label: T("left"), key: "side-L" }, { value: "R", label: T("right"), key: "side-R" },
    ], quarter, function () { commit(it, mirrorStair(cfg), rise); }));
    box.appendChild(el("div", "stair-sub", T("turnsAs")));
    box.appendChild(segmented([
      { value: "landing", label: T("landing"), key: "tt-landing" }, { value: "winder", label: T("winder"), key: "tt-winder" },
    ], cfg.turnType, function (v) {
      var next = normalizeStair(cfg);
      next.turnType = v;
      commit(it, next.autoSteps ? refit(next, it) : setRiserCount(next, N), rise);
    }));
  }
  var grid = el("div", "stair-grid");
  grid.appendChild(lengthField("width", T("width"), cfg.width, function (v) {
    var next = normalizeStair(cfg);
    next.width = v;
    commit(it, refit(next, it), rise);
  }));
  grid.appendChild(lengthField("going", T("going"), cfg.going, function (v) {
    var next = normalizeStair(cfg);
    next.going = v;
    next.autoSteps = false;
    commit(it, next, rise);
  }));
  grid.appendChild(intField("risers", T("risers"), N, 2, function (v) {
    var next = setRiserCount(cfg, v);
    next.autoSteps = false;
    commit(it, next, rise);
  }));
  grid.appendChild(lengthField("rise", T("rise"), rise, function (v) {
    var next = normalizeStair(cfg);
    next.autoRise = false;
    commit(it, refit(next, it, v), v);
  }));
  box.appendChild(grid);
  box.appendChild(checkRow("auto", T("auto"), cfg.autoSteps, function (on) {
    var next = normalizeStair(cfg);
    next.autoSteps = on;
    commit(it, refit(next, it), rise);
  }, T("autoT")));
  var above = floorAbove(S.workspace), toAbove = riseToFloorAbove();
  if (above && toAbove) {
    box.appendChild(checkRow("autoRise", T("matchAbove", { name: above.name }), cfg.autoRise, function (on) {
      var next = normalizeStair(cfg);
      next.autoRise = on;
      var r = on ? toAbove : rise;
      commit(it, refit(next, it, r), r);
    }));
  }
  box.appendChild(el("div", "stair-equal t", T("equalNote", { n: lay.risers, r: fmtLen(lay.riser, { domain: "furniture" }) })));
  box.appendChild(runRows(it, cfg));
  box.appendChild(codeBlock(it, lay));
}

/* Fill (or hide) the designer for the selected item. Called from fillProps'
   item branch for every item, so it also re-enables W/D/H for the rest. */
export function fillStairDesign(it) {
  var box = document.getElementById("i_stair_design");
  var designed = !!(it && it.type === "stairs" && stairVariantShape(it.variant) !== "curved" && it.configuration && it.configuration.stair);
  lockSizeFields(designed);
  if (!box) return;
  var focus = document.activeElement, key = focus && box.contains(focus) && focus.dataset ? focus.dataset.stairKey : null;
  box.innerHTML = "";
  if (!it || it.type !== "stairs") { box.hidden = true; return; }
  box.hidden = false;
  if (!designed) {
    box.appendChild(el("div", "stair-title", T("title")));
    if (stairVariantShape(it.variant) === "curved") {
      box.appendChild(el("div", "t", T("curvedNote")));
      return;
    }
    // a flight from before stairs could be designed: one press designs it,
    // keeping its plan, width and rise
    var old = stairLayout(it, stairVariantShape(it.variant)), start = el("button", "stair-fit", T("fit"));
    start.type = "button";
    start.addEventListener("click", function () {
      commit(it, autoStair({
        rise: it.h, rules: activeStairCode().rules, preset: old.shape === "L" || old.shape === "U" ? old.shape : "straight",
        width: old.width || it.w, turn: "R", turnType: "landing",
      }), it.h);
    });
    box.appendChild(start);
    return;
  }
  build(box, it);
  if (key) {
    var again = box.querySelector('[data-stair-key="' + key + '"]');
    if (again && again.focus) again.focus();
  }
}

/* A void bound to a flight: where the flight is, a way to get to it, and
   its own position fields disabled (the flight drives them). */
export function fillBoundVoid(o) {
  var row = document.getElementById("sv_bound");
  var found = o && o.stairsId != null ? findStairsForVoid(o) : null;
  ["sv_x", "sv_z", "sv_w", "sv_d", "sv_rot"].forEach(function (id) {
    var f = document.getElementById(id);
    if (f) f.disabled = !!found;
  });
  if (!row) return;
  row.innerHTML = "";
  row.hidden = !found;
  if (!found) return;
  row.appendChild(el("div", "t", T("voidFollows", { floor: (found.floor && found.floor.name) || "" })));
  var b = el("button", "w-full", T("editStairs"));
  b.type = "button";
  b.addEventListener("click", function () { editStairsOf(o); });
  row.appendChild(b);
}

async function editStairsOf(o) {
  var found = findStairsForVoid(o);
  if (!found) return;
  if (!found.active && found.floor) {
    var floor = await switchFloorAndWait(found.floor.id);
    if (!floor) return;
    followReferenceFloor(S.workspace);
  }
  var it = (S.items || []).find(function (x) { return x.id === o.stairsId; });
  if (!it) return;
  select({ kind: "item", ref: it });
  S.dirty3D = true;
  render2D();
  refreshTree();
  fillProps();
}
