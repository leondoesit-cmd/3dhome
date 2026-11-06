/* The planner's wall-color and light controls, history and tool wiring, display
   controls and point inspector, lifted out of initUI, split out of
   js/ui/init_ui.js. It shares the editor's state through live imports from
   ./init_ui.js. */
import { captureClear, captureLock } from "../constraint_engine.js";
import { fmtLen, parseLen } from "../display_units.js";
import { beginHistory, cancelPending, commitPending, pushHistory } from "../history.js";
import { onLangChange, t } from "../i18n.js";
import { setTool } from "../interaction.js";
import { moveMarker, setMarkerSurface } from "../markers.js";
import { broadcastPlanOp } from "../plan_sync.js";
import { render2D } from "../plan2d.js";
import { pushDevice } from "../smarthome_connect.js";
import { syncSmartFromLamp } from "../smarthome.js";
import { S, fin, touchItem3D } from "../state.js";
import { fillProps, refreshMarkerReadout, roomMetaFor, selLamp } from "../ui_props.js";
import { refreshTree } from "../ui_tree.js";
import { renderWarnPanel } from "../ui_warn.js";
import { addFurnItem, bindLength, bindNum, compass, flash, fmtHour, setCutaway, setPlanStyle, syncCutawayUI, syncPlanStyleUI, syncRotStepUI } from "../ui.js";
import { applyEnv } from "../view3d.js";
import { conUnit, setConReport, setConSuppressed, setConValue, solveWallCons } from "../wall_constraints.js";
import { activeWallPresetId, isWallDrawTool, setWallDrawFrom, setWallDrawPreset } from "../wall_draw.js";

// lifted out of initUI()
function wireWallColorAndLights() {
  document.getElementById("r_wall").addEventListener("input", function () {
    var m = roomMetaFor();
    if (!m) return;
    commitPending();
    m.wall = parseInt(this.value.slice(1), 16);
    S.dirty3D = true;
  });

  // global wall color
  document.getElementById("wallcol").addEventListener("input", function () {
    commitPending();
    S.wallColor = parseInt(this.value.slice(1), 16);
    S.dirty3D = true;
  });

  // per-fixture light controls
  document.getElementById("l_on").addEventListener("change", function () {
    var it = selLamp();
    if (!it) return;
    pushHistory();
    it.lightOn = this.checked;
    syncSmartFromLamp(it);
    touchItem3D(it, "build");
    pushDevice(it, { on: this.checked });
  });
  document.getElementById("l_int").addEventListener("input", function () {
    var it = selLamp();
    if (!it) return;
    commitPending();
    it.lightI = parseFloat(this.value);
    syncSmartFromLamp(it);
    document.getElementById("l_intval").textContent =
      Math.round(it.lightI * 100) + "%";
    touchItem3D(it, "build");
    pushDevice(it, { brightness: it.smart ? it.smart.brightness : Math.round(it.lightI * 100) });
  });
  document.getElementById("l_col").addEventListener("input", function () {
    var it = selLamp();
    if (!it) return;
    commitPending();
    it.lightColor = parseInt(this.value.slice(1), 16);
    syncSmartFromLamp(it);
    touchItem3D(it, "build");
    pushDevice(it, { color: this.value });
  });
  
  document.getElementById("l_type").addEventListener("change", function () {
    var it = selLamp();
    if (!it) return;
    pushHistory();
    it.spot = this.value === "spot";
    fillProps();
    touchItem3D(it, "build");
  });
  document.getElementById("l_cone").addEventListener("input", function () {
    var it = selLamp();
    if (!it) return;
    commitPending();
    it.cone = parseFloat(this.value);
    touchItem3D(it, "build");
  });
  document.getElementById("l_pitch").addEventListener("input", function () {
    var it = selLamp();
    if (!it) return;
    commitPending();
    it.pitch = parseFloat(this.value);
    touchItem3D(it, "build");
  });
  
  document.getElementById("o_type_sel").addEventListener("change", function () {
    if (!S.sel || S.sel.kind !== "opening") return;
    pushHistory();
    S.sel.ref.isSliding = this.value === "sliding";
    S.sel.ref.isPocket = this.value === "pocket";
    S.sel.ref.isDouble = this.value === "double";
    if (S.sel.ref.isDouble) {
      S.sel.ref.leafA = Number(S.sel.ref.leafA) || S.sel.ref.width / 2;
      S.sel.ref.leafB = S.sel.ref.width - S.sel.ref.leafA;
    }
    fillProps();
    S.dirty3D = true;
    render2D();
  });
  document.getElementById("o_mat").addEventListener("change", function () {
    if (!S.sel || S.sel.kind !== "opening") return;
    pushHistory();
    S.sel.ref.mat = this.value;
    fillProps();
    S.dirty3D = true;
  });
  document.getElementById("o_col").addEventListener("input", function () {
    if (!S.sel || S.sel.kind !== "opening") return;
    commitPending();
    S.sel.ref.color = this.value;
    S.dirty3D = true;
  });
  document.getElementById("o_swing_dir").addEventListener("change", function () {
    if (!S.sel || S.sel.kind !== "opening") return;
    pushHistory();
    S.sel.ref.swingDir = this.value;
    fillProps();
    S.dirty3D = true;
    render2D();
  });
  document.querySelectorAll("#o_swing_grid [data-swing]").forEach(function (button) {
    button.addEventListener("click", function () {
      if (!S.sel || S.sel.kind !== "opening") return;
      pushHistory();
      S.sel.ref.swingDir = button.dataset.swing;
      fillProps();
      S.dirty3D = true;
      render2D();
    });
  });
  function setDoorLeaf(which, value) {
    if (!S.sel || S.sel.kind !== "opening" || !S.sel.ref.isDouble) return;
    var o = S.sel.ref, minLeaf = Math.min(20, o.width / 2);
    value = Math.max(minLeaf, Math.min(o.width - minLeaf, value));
    o.leafA = which === "a" ? value : o.width - value;
    o.leafB = o.width - o.leafA;
    return which === "a" ? o.leafA : o.leafB;
  }
  bindLength("o_leaf_a", function (v) { return setDoorLeaf("a", v); });
  bindLength("o_leaf_b", function (v) { return setDoorLeaf("b", v); });
  document.getElementById("o_slide_dir").addEventListener("change", function () {
    if (!S.sel || S.sel.kind !== "opening") return;
    pushHistory();
    S.sel.ref.slideDir = this.value;
    S.dirty3D = true;
    render2D();
  });

  var texInput = document.getElementById("texInput");
  return { texInput };
}

// lifted out of initUI()
function wireHistoryAndTools() {
  // history: snapshot before a continuous edit (commit on first change, cancel if untouched)
  [
    "w_len",
    "w_ang",
    "w_th",
    "w_h",
    "w_split_h",
    "w_bulge",
    "w_top_a",
    "w_top_b",
    "w_base_a",
    "w_base_b",
    "i_w",
    "i_d",
    "i_h",
    "i_rot",
    "i_rot_range",
    "o_w",
    "o_h",
    "o_sill",
    "o_leaf_a",
    "o_leaf_b",
    "o_fr_jamb",
    "o_fr_head",
    "o_fr_sillw",
    "o_fr_depth",
    "o_fr_mull",
    "o_fr_mullv",
    "o_fr_mullh",
    "r_name",
    "r_wall",
    "mk_x",
    "mk_y",
    "mk_z",
    "mk_name",
    "mk_req",
    "mk_note",
    "sv_x",
    "sv_z",
    "sv_w",
    "sv_d",
    "sv_rot",
    "sv_name",
    "nd_x",
    "nd_z",
    "l_int",
    "l_col",
    "l_cone",
    "l_pitch",
    "o_col",
  ].forEach(function (id) {
    var el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("focus", beginHistory);
    el.addEventListener("blur", cancelPending);
  });

  // manual "open segment" controls (live preview while a wall is selected)
  function updSeg() {
    if (!S.sel || S.sel.kind !== "wall") {
      S.segPreview = null;
      return;
    }
    var pos = parseFloat(document.getElementById("ow_pos").value) || 0,
      w = parseLen(document.getElementById("ow_w").value) || 0,
      h = parseLen(document.getElementById("ow_h").value) || 0;
    document.getElementById("ow_posval").textContent = fmtLen(pos);
    S.segPreview = { s: pos, width: w, height: h };
    render2D();
  }
  document.getElementById("ow_pos").addEventListener("input", updSeg);
  document.getElementById("ow_w").addEventListener("input", updSeg);
  document.getElementById("ow_h").addEventListener("input", updSeg);

  // tools
  document.querySelectorAll(".tool").forEach(function (b) {
    // the toolbar also holds toggles (the structure lock) that share the .tool
    // chrome but are actions, not tools — those go through runAction instead
    if (!b.getAttribute("data-tool")) return;
    b.addEventListener("click", function () {
      setTool(b.getAttribute("data-tool"));
    });
  });

  function applyToolNames(on) {
    var bar = document.getElementById("plan-toolbar");
    var btn = document.getElementById("toolNamesToggle");
    if (bar) bar.classList.toggle("show-titles", !!on);
    if (btn) {
      btn.classList.toggle("active", !!on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    }
    window.dispatchEvent(new Event("resize"));
  }
  function toggleToolNames() {
    var bar = document.getElementById("plan-toolbar");
    var on = bar ? !bar.classList.contains("show-titles") : true;
    applyToolNames(on);
    try { localStorage.setItem("mf_tool_titles", on ? "1" : "0"); } catch (_) {}
  }
  function initToolNames() {
    var on = true;
    try { on = localStorage.getItem("mf_tool_titles") !== "0"; } catch (_) {}
    applyToolNames(on);
  }
  window.__toggleToolNames = toggleToolNames;
  initToolNames();

  /* Keep the command strip scrollable, with navigation outside its viewport.
     Sticky buttons inside a scrolling toolbar covered real commands. */
  function initToolScroll() {
    var bar = document.getElementById('plan-toolbar');
    var names = document.getElementById('toolNamesToggle');
    if (!bar || !names || bar.querySelector('.tool-scroll')) return;
    var strip = document.createElement('div');
    strip.className = 'tool-command-strip';
    Array.from(bar.childNodes).forEach(function (node) {
      if (node !== names) strip.appendChild(node);
    });
    bar.insertBefore(strip, names);
    function arrow(kind, icon, key) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'tool-scroll tool-scroll-' + kind;
      b.setAttribute('aria-label', t(key));
      b.title = t(key);
      var glyph = document.createElement('i');
      glyph.className = 'ph ph-' + icon;
      glyph.setAttribute('aria-hidden', 'true');
      b.appendChild(glyph);
      return b;
    }
    var prev = arrow('prev', 'caret-left', 'tool_scroll_prev');
    var next = arrow('next', 'caret-right', 'tool_scroll_next');
    bar.insertBefore(prev, strip);
    bar.insertBefore(next, names);
    var lastWidth = 0, lastHost = '';
    function revealSelected() {
      var selected = bar.querySelector('button.tool.active[data-tool]');
      if (!selected) return;
      var outer = strip.getBoundingClientRect(), inner = selected.getBoundingClientRect();
      if (inner.left < outer.left || inner.right > outer.right) {
        selected.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'instant' });
      }
    }
    function sync() {
      var overflow = bar.dataset.axis === 'h' && strip.scrollWidth > strip.clientWidth + 3;
      prev.hidden = next.hidden = !overflow;
      var host = bar.closest('#view-2d') ? '2d' : '3d';
      if (strip.clientWidth !== lastWidth || host !== lastHost) {
        lastWidth = strip.clientWidth; lastHost = host;
        requestAnimationFrame(revealSelected);
      }
      if (!overflow) return;
      var dir = getComputedStyle(strip).direction === 'rtl' ? -1 : 1;
      var progress = Math.max(0, strip.scrollLeft * dir);
      var max = strip.scrollWidth - strip.clientWidth;
      prev.disabled = progress <= 2;
      next.disabled = progress >= max - 2;
    }
    prev.addEventListener('click', function () {
      var dir = getComputedStyle(strip).direction === 'rtl' ? -1 : 1;
      strip.scrollBy({ left: -dir * Math.max(160, strip.clientWidth * .62), behavior: 'smooth' });
    });
    next.addEventListener('click', function () {
      var dir = getComputedStyle(strip).direction === 'rtl' ? -1 : 1;
      strip.scrollBy({ left: dir * Math.max(160, strip.clientWidth * .62), behavior: 'smooth' });
    });
    strip.addEventListener('scroll', sync, { passive: true });
    window.addEventListener('planner-tool', function () { requestAnimationFrame(revealSelected); });
    window.addEventListener('planner-viewport', function () { requestAnimationFrame(revealSelected); });
    window.addEventListener('resize', function () { requestAnimationFrame(sync); });
    if (window.ResizeObserver) {
      var observer = new ResizeObserver(sync);
      observer.observe(bar);
      observer.observe(strip);
    }
    onLangChange(function () {
      prev.setAttribute('aria-label', t('tool_scroll_prev'));
      prev.title = t('tool_scroll_prev');
      next.setAttribute('aria-label', t('tool_scroll_next'));
      next.title = t('tool_scroll_next');
      requestAnimationFrame(sync);
    });
    requestAnimationFrame(sync);
  }
  initToolScroll();

  function syncWallDrawPalette() {
    var pal = document.getElementById("plan-wall-palette");
    if (!pal) return;
    var wasHidden = pal.hidden;
    pal.hidden = !isWallDrawTool(S.tool);
    // A newly chosen wall tool opens its choices. Once placement begins the
    // palette compacts to one reveal button so it no longer covers the draw.
    if (wasHidden && !pal.hidden) pal.classList.remove("auto-collapsed");
    var collapse = document.getElementById("wallPaletteToggle");
    if (collapse) {
      var expanded = !pal.classList.contains("auto-collapsed");
      collapse.setAttribute("aria-expanded", expanded ? "true" : "false");
      collapse.title = t(expanded ? "wd_collapse" : "wd_expand");
      collapse.setAttribute("aria-label", collapse.title);
      var ci = collapse.querySelector("i");
      if (ci) ci.className = expanded ? "ph ph-caret-left" : "ph ph-sliders-horizontal";
    }
    // These are icon-only toggles whose meaning lives in a `title` tooltip —
    // which touch devices and screen readers never surface. State the choice
    // through aria-pressed and carry the tooltip over as the accessible name.
    var preset = activeWallPresetId();
    pal.querySelectorAll("[data-wall-preset]").forEach(function (b) {
      var on = b.getAttribute("data-wall-preset") === preset;
      b.classList.toggle("active", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
      if (!b.getAttribute("aria-label") && b.title) b.setAttribute("aria-label", b.title);
    });
    var from = (S.wallDrawDefaults && S.wallDrawDefaults.from) || "center";
    pal.querySelectorAll("[data-wall-from]").forEach(function (b) {
      var on = b.getAttribute("data-wall-from") === from;
      b.classList.toggle("active", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    });
    pal.querySelectorAll(".wd-choice-select").forEach(function (select) {
      select.querySelectorAll("option").forEach(function (option) {
        option.textContent = t(option.dataset.labelKey);
      });
      select.value = select.dataset.choice === "preset" ? preset : from;
      select.setAttribute("aria-label", t(select.dataset.choice === "preset" ? "wd_types" : "wd_from"));
    });
  }
  var pal = document.getElementById("plan-wall-palette");
  if (pal) {
    // Desktop ribbon uses named choices; touch layouts keep the visual buttons.
    [[".wd-types", "data-wall-preset", "preset"], [".wd-loc", "data-wall-from", "from"]].forEach(function (spec) {
      var group = pal.querySelector(spec[0]);
      if (!group) return;
      var select = document.createElement("select");
      select.className = "wd-choice-select";
      select.dataset.choice = spec[2];
      group.querySelectorAll("button").forEach(function (button) {
        var option = document.createElement("option");
        option.value = button.getAttribute(spec[1]);
        option.dataset.labelKey = button.dataset.i18nTitle || button.dataset.i18nAria;
        select.appendChild(option);
      });
      group.after(select);
      select.addEventListener("change", function () {
        if (spec[2] === "preset") setWallDrawPreset(select.value);
        else setWallDrawFrom(select.value);
        syncWallDrawPalette();
        render2D();
      });
    });
    pal.addEventListener("click", function (e) {
      var collapseBtn = e.target.closest("#wallPaletteToggle");
      if (collapseBtn) {
        pal.classList.toggle("auto-collapsed");
        syncWallDrawPalette();
        return;
      }
      var presetBtn = e.target.closest("[data-wall-preset]");
      if (presetBtn) {
        setWallDrawPreset(presetBtn.getAttribute("data-wall-preset"));
        if (!isWallDrawTool(S.tool)) setTool("wall");
        syncWallDrawPalette();
        render2D();
        return;
      }
      var fromBtn = e.target.closest("[data-wall-from]");
      if (fromBtn) {
        setWallDrawFrom(fromBtn.getAttribute("data-wall-from"));
        syncWallDrawPalette();
        render2D();
      }
    });
  }
  window.addEventListener("planner-tool", syncWallDrawPalette);
  window.addEventListener("planner-draw-defaults", syncWallDrawPalette);
  window.addEventListener("planner-draw-start", function () {
    if (pal && !pal.hidden && !pal.closest('.pt-zone[data-zone="top"]')) {
      pal.classList.add("auto-collapsed");
      syncWallDrawPalette();
    }
  });
  onLangChange(syncWallDrawPalette);
  syncWallDrawPalette();
  return { toggleToolNames };
}

// lifted out of initUI()
function wireDisplayAndPointInspector() {
  // display controls
  document.querySelectorAll("[data-plan-style]").forEach(function (b) {
    b.addEventListener("click", function () {
      setPlanStyle(b.getAttribute("data-plan-style"));
    });
  });
  syncPlanStyleUI();
  var cbCut = document.getElementById("cb_cutaway");
  if (cbCut)
    cbCut.addEventListener("change", function () {
      setCutaway({ on: this.checked });
    });
  var cutHIn = document.getElementById("cutawayH");
  if (cutHIn)
    cutHIn.addEventListener("input", function () {
      setCutaway({ height: Number(this.value) });
    });
  document.querySelectorAll("[data-cut-cap]").forEach(function (b) {
    b.addEventListener("click", function () {
      setCutaway({ cap: b.getAttribute("data-cut-cap") });
    });
  });
  syncCutawayUI();
  document.getElementById("cb_dims").addEventListener("change", function () {
    S.showDims = this.checked;
    render2D();
  });
  /* Interior vs centreline dimensions. Switching INTO interior mode re-reads
     every wall's current inside span as its intent, so nothing jumps the moment
     the box is ticked — the geometry only moves on the next edit. */
  var cbInterior = document.getElementById("cb_interior");
  if (cbInterior)
    cbInterior.addEventListener("change", function () {
      S.interiorDims = this.checked;
      if (S.interiorDims) S.walls.forEach(captureClear);
      render2D();
      fillProps();
    });
  document.querySelectorAll(".snap-toggle").forEach(function (cb) {
    cb.addEventListener("change", function () {
      S.snapObj = this.checked;
      document.querySelectorAll(".snap-toggle").forEach(function (other) {
        other.checked = S.snapObj;
      });
    });
  });
  /* Automatic facing (js/item_orient.js). Same shape as the snap toggle it
     sits next to, because it is the same kind of promise: the editor may help
     while you drag, and this is the switch that stops it. */
  document.querySelectorAll(".face-toggle").forEach(function (cb) {
    cb.checked = S.autoFace !== false;
    cb.addEventListener("change", function () {
      S.autoFace = this.checked;
      document.querySelectorAll(".face-toggle").forEach(function (other) {
        other.checked = S.autoFace;
      });
    });
  });
  syncRotStepUI();
  document.getElementById("cb_invisible_roof").addEventListener("change", function () {
    S.invisibleRoof = this.checked;
    S.dirty3D = true;
    window.dispatchEvent(new Event("planner-navigation-restored"));
  });
  document.getElementById("cb_ceil").addEventListener("change", function () {
    S.showCeiling = this.checked;
    S.dirty3D = true;
  });
  document.getElementById("floorsel").addEventListener("change", function () {
    S.floorTex = this.value;
    S.dirty3D = true;
    render2D();
  });

  // environment (sun updates live, no full rebuild)
  document.getElementById("hour").addEventListener("input", function () {
    S.hour = parseFloat(this.value);
    document.getElementById("hourval").textContent = fmtHour(S.hour);
    applyEnv();
  });
  document.getElementById("north").addEventListener("input", function () {
    S.northAngle = parseFloat(this.value);
    document.getElementById("northval").textContent = compass(S.northAngle);
    applyEnv();
    render2D();
  });

  // placeholder-point inspector: position (carries the object standing on it)
  // and a free-text name for the plan label
  bindLength("mk_x", function (v) {
    if (!S.sel || S.sel.kind !== "marker") return;
    moveMarker(S.sel.ref, v, S.sel.ref.y, S.sel.ref.z);
    refreshMarkerReadout();
  });
  bindLength("mk_y", function (v) {
    if (!S.sel || S.sel.kind !== "marker") return;
    moveMarker(S.sel.ref, S.sel.ref.x, Math.max(0, v), S.sel.ref.z);
    refreshMarkerReadout();
  });
  bindLength("mk_z", function (v) {
    if (!S.sel || S.sel.kind !== "marker") return;
    moveMarker(S.sel.ref, S.sel.ref.x, S.sel.ref.y, v);
    refreshMarkerReadout();
  });
  var mkSurf = document.getElementById("mk_surface");
  if (mkSurf)
    mkSurf.addEventListener("change", function () {
      if (!S.sel || S.sel.kind !== "marker") return;
      pushHistory();
      setMarkerSurface(S.sel.ref, this.value);
      S.dirty3D = true;
      refreshMarkerReadout();
      refreshTree();
      render2D();
    });
  /* The selected dimension's own value. `change` rather than `input`, unlike
     the geometry fields: every keystroke here re-solves the whole constraint
     set and moves corners, so typing "240" would drag the plan to 2 cm and
     then to 24 cm on the way. */
  document.getElementById("con_value").addEventListener("change", function () {
    if (!S.sel || S.sel.kind !== "con") return;
    var unit = conUnit(S.sel.ref);
    var v = unit === "deg" ? parseFloat(this.value) : parseLen(this.value, "plan");
    if (!Number.isFinite(v)) return;
    pushHistory();
    setConValue(S.sel.ref.id, v);
    var r = solveWallCons();
    if (r.unresolved) flash(t("wc_unresolved", { n: r.unresolved }), "error");
    fillProps();
    refreshTree();
    renderWarnPanel(true);
  });

  /* Report and suppress are the two ways to stop a dimension driving, and they
     are different: a suppressed dimension is switched off, a reference one is
     still measured and still shown — it simply has no say in where the
     geometry goes. */
  document.getElementById("con_report").addEventListener("change", function () {
    if (!S.sel || S.sel.kind !== "con") return;
    pushHistory();
    setConReport(S.sel.ref.id, this.checked);
    solveWallCons();
    S.dirty3D = true;
    fillProps(); render2D(); renderWarnPanel(true);
  });
  document.getElementById("con_off").addEventListener("change", function () {
    if (!S.sel || S.sel.kind !== "con") return;
    pushHistory();
    setConSuppressed(S.sel.ref.id, this.checked);
    solveWallCons();
    S.dirty3D = true;
    fillProps(); render2D(); renderWarnPanel(true);
  });

  /* Typing a corner's coordinates moves the junction itself, so every wall
     meeting it follows — the keyboard equivalent of dragging the bare corner,
     including the re-capture of what those walls now measure. */
  function moveJoint(x, z) {
    if (!S.sel || S.sel.kind !== "node") return;
    var n = S.nodes[S.sel.ref];
    if (!n) return;
    commitPending();
    if (fin(x)) n.x = x;
    if (fin(z)) n.z = z;
    solveWallCons();
    S.walls.forEach(function (w) {
      if (w.a !== S.sel.ref && w.b !== S.sel.ref) return;
      captureLock(w);
      captureClear(w);
    });
    S.dirty3D = true;
    fillProps();
  }
  bindLength("nd_x", function (v) {
    moveJoint(v, null);
  });
  bindLength("nd_z", function (v) {
    moveJoint(null, v);
  });

  /* The point's brief: how much clear space this spot is supposed to keep, and
     a free-text note about what it is for. Neither moves anything — they change
     what the readouts (and the plan's hover card) say about the spot, which is
     the whole job of a placeholder. An empty required-clearance field means
     "no requirement", so it is cleared rather than parsed as 0. */
  var mkReq = document.getElementById("mk_req");
  if (mkReq)
    mkReq.addEventListener("input", function () {
      if (!S.sel || S.sel.kind !== "marker") return;
      commitPending();
      var v = parseLen(this.value);
      S.sel.ref.req = this.value === "" || !Number.isFinite(v) ? null : Math.max(0, v);
      refreshMarkerReadout();
      render2D();
    });
  var mkNote = document.getElementById("mk_note");
  if (mkNote)
    mkNote.addEventListener("input", function () {
      if (!S.sel || S.sel.kind !== "marker") return;
      commitPending();
      S.sel.ref.note = this.value.slice(0, 80);
      render2D();
    });
  var mkName = document.getElementById("mk_name");
  if (mkName)
    mkName.addEventListener("input", function () {
      if (!S.sel || S.sel.kind !== "marker") return;
      commitPending();
      S.sel.ref.name = this.value.slice(0, 24);
      refreshMarkerReadout();
      refreshTree();
      render2D();
    });

  bindLength("sv_x", function (v) {
    if (!S.sel || S.sel.kind !== "slabvoid") return;
    S.sel.ref.x = v;
    broadcastPlanOp({ type: "slabMove", id: S.sel.ref.id, x: S.sel.ref.x, z: S.sel.ref.z, rot: S.sel.ref.rot });
  });
  bindLength("sv_z", function (v) {
    if (!S.sel || S.sel.kind !== "slabvoid") return;
    S.sel.ref.z = v;
    broadcastPlanOp({ type: "slabMove", id: S.sel.ref.id, x: S.sel.ref.x, z: S.sel.ref.z, rot: S.sel.ref.rot });
  });
  bindLength("sv_w", function (v) {
    if (!S.sel || S.sel.kind !== "slabvoid") return;
    S.sel.ref.w = Math.max(40, v);
    return S.sel.ref.w;
  });
  bindLength("sv_d", function (v) {
    if (!S.sel || S.sel.kind !== "slabvoid") return;
    S.sel.ref.d = Math.max(40, v);
    return S.sel.ref.d;
  });
  bindNum("sv_rot", function (v) {
    if (!S.sel || S.sel.kind !== "slabvoid") return;
    S.sel.ref.rot = ((v % 360) + 360) % 360;
    broadcastPlanOp({ type: "slabMove", id: S.sel.ref.id, x: S.sel.ref.x, z: S.sel.ref.z, rot: S.sel.ref.rot });
    return S.sel.ref.rot;
  });
  var svName = document.getElementById("sv_name");
  if (svName)
    svName.addEventListener("input", function () {
      if (!S.sel || S.sel.kind !== "slabvoid") return;
      commitPending();
      S.sel.ref.name = this.value.slice(0, 32);
      document.getElementById("selname_sv").textContent = S.sel.ref.name || t("sv_title");
      refreshTree();
      render2D();
    });

  var addfurnBtn = document.getElementById("addfurn");
  if (addfurnBtn) {
    addfurnBtn.addEventListener("click", function () {
      var type = document.getElementById("furnsel").value;
      addFurnItem(type);
    });
  }
}

export {
  wireDisplayAndPointInspector, wireHistoryAndTools, wireWallColorAndLights,
};
