// UI for the MEP infrastructure layer: the left-panel "Infrastructure" section
// (system chips + device/pipe palette + options) and the right-panel inspector
// for a selected device or run. Arming a palette entry switches the plan tool;
// interaction.js drives the actual placing/routing/selecting on the canvas.
import {
  ensureMEP, MEP_SYS, MEP_SYS_ORDER, MEP_NODE_KINDS, MEP_RUN_KINDS, MEP_LAYERS,
  sysLabel, nodeLabel, runLabel, nodeKindDef, runKindDef,
  deleteMEP, runLength, mepVisible, computeMEPStatus, connectMissingMEP,
  allowedLayersFor, defaultLayerFor, layerAllowed, runCrossesOpening,
  routingPolicy, setRoutingPolicy, policyLayerFor, effectiveRunLayers,
} from "./mep.js";
import { autoInfrastructure } from "./mep_auto.js";
import { setTool } from "./interaction.js";
import { render2D } from "./plan2d.js";
import { select } from "./ui_props.js";
import { refreshTree } from "./ui_tree.js";
import { pushHistory } from "./history.js";
import { t, getLang, onLangChange } from "./i18n.js";
import { S } from "./state.js";

// generate a full MEP rough-in from the current rooms + fixtures (replaces MEP)
export function autoGenerateMEP() {
  pushHistory();
  var res = autoInfrastructure();
  var m = ensureMEP();
  m.show = true;
  if (m.runs.some(function (r) { return r.layer === "floor"; })) m.xray.floor = true;
  S.dirty3D = true;
  select(null);
  render2D();
  renderPanel();
  refreshTree();
  return res;
}

var panelEl = null;

export function initMEP() {
  panelEl = document.getElementById("mepPanel");
  if (!panelEl) return;
  renderPanel();
  onLangChange(renderPanel);
}

// arm a palette entry: set the active system + pending placement and switch the
// plan tool. mode 'node' places devices; mode 'run' routes pipes/cables.
function arm(sys, kind, mode) {
  var m = ensureMEP();
  m.active = sys;
  // Every palette choice starts on its trade-appropriate plane (water/waste
  // under-floor, ducts at ceiling, outlets in walls). The user can still pick
  // another enabled plane afterwards.
  var baseLayer = defaultLayerFor(sys, kind, mode);
  setRoutingLayer(m, mode === "run" ? policyLayerFor(sys, kind, baseLayer) : baseLayer);
  m.place = { sys: sys, kind: kind, mode: mode };
  m.route = null;
  setTool(mode === "run" ? "mepRoute" : "mepNode");
  renderPanel();
  render2D();
}

// Selecting a concealed plane also reveals the matching building surface.
// Otherwise "under floor" is technically correct but visually indistinguishable
// from a missing route in the normal 3D camera.
function setRoutingLayer(m, lay) {
  m.layer = lay;
  if (lay === "floor") m.xray.floor = true;
  if (lay === "ceiling") m.xray.ceiling = true;
  S.dirty3D = true;
}

function setActive(sys) {
  var m = ensureMEP();
  m.active = sys;
  m.place = null;
  m.route = null;
  setTool("select");
  renderPanel();
}

export function renderPanel() {
  if (!panelEl) return;
  var m = ensureMEP();
  panelEl.innerHTML = "";

  // auto rough-in button
  var auto = document.createElement("button");
  auto.className = "mep-auto-btn";
  auto.innerHTML = '<i class="ph ph-magic-wand"></i> ' + t("mep_auto");
  auto.title = t("mep_autoHint");
  auto.onclick = function () { autoGenerateMEP(); };
  panelEl.appendChild(auto);

  var netStatus = computeMEPStatus();
  var issueCount = netStatus.deviceIssues;
  var health = document.createElement("div");
  health.className = "mep-health " + (issueCount ? "warn" : "ok");
  var healthText = document.createElement("span");
  healthText.textContent = issueCount
    ? t("mep_disconnectedCount", { n: issueCount })
    : t("mep_allConnected");
  health.appendChild(healthText);
  if (issueCount) {
    var repair = document.createElement("button");
    repair.textContent = t("mep_connectMissing");
    repair.onclick = function () {
      pushHistory();
      var fixed = connectMissingMEP();
      if (ensureMEP().runs.some(function (r) { return r.layer === "floor"; })) ensureMEP().xray.floor = true;
      S.dirty3D = true;
      renderPanel(); render2D(); refreshTree();
      return fixed;
    };
    health.appendChild(repair);
  }
  panelEl.appendChild(health);

  // master visibility toggle
  var master = document.createElement("label");
  master.className = "mep-master";
  var mcb = document.createElement("input");
  mcb.type = "checkbox";
  mcb.checked = m.show;
  mcb.onchange = function () { m.show = mcb.checked; S.dirty3D = true; render2D(); };
  master.appendChild(mcb);
  var msp = document.createElement("span");
  msp.textContent = t("mep_show");
  master.appendChild(msp);
  panelEl.appendChild(master);

  // system chips (click = active; eye = per-system visibility)
  var chips = document.createElement("div");
  chips.className = "mep-chips";
  MEP_SYS_ORDER.forEach(function (sys) {
    var chip = document.createElement("div");
    chip.className = "mep-chip" + (m.active === sys ? " active" : "") + (mepVisible(sys) ? "" : " off");
    chip.style.setProperty("--sys", MEP_SYS[sys].color);
    var dot = document.createElement("span");
    dot.className = "mep-dot";
    chip.appendChild(dot);
    var lbl = document.createElement("span");
    lbl.className = "mep-chip-lbl";
    lbl.textContent = sysLabel(sys);
    chip.appendChild(lbl);
    lbl.onclick = function () { setActive(sys); };
    dot.onclick = function () { setActive(sys); };
    var eye = document.createElement("span");
    eye.className = "mep-eye";
    eye.textContent = m.vis[sys] === false ? "🚫" : "👁";
    eye.title = t("mep_toggleVis");
    eye.onclick = function (ev) {
      ev.stopPropagation();
      m.vis[sys] = m.vis[sys] === false;
      renderPanel();
      render2D();
      S.dirty3D = true;
      render2D();
    };
    chip.appendChild(eye);
    chips.appendChild(chip);
  });
  panelEl.appendChild(chips);

  var guide = document.createElement("div");
  guide.className = "mep-guidance";
  guide.innerHTML = '<div><i class="ph ph-door"></i><span>' + t("mep_ruleDoor") + '</span></div>' +
    '<div><i class="ph ph-stack"></i><span>' + t("mep_ruleLayers") + '</span></div>' +
    '<div><i class="ph ph-wind"></i><span>' + t("mep_ruleHVAC") + '</span></div>';
  panelEl.appendChild(guide);

  // routing plane selector (wall / ceiling / floor)
  var layerTitle = document.createElement("div");
  layerTitle.className = "mep-layer-title";
  layerTitle.textContent = t("mep_layerSelectTitle");
  panelEl.appendChild(layerTitle);
  var lrow = document.createElement("div");
  lrow.className = "mep-layers";
  var armed = m.place && m.place.sys === m.active ? m.place : null;
  var allowed = armed
    ? (armed.mode === "run" ? effectiveRunLayers(armed.sys, armed.kind) : allowedLayersFor(armed.sys, armed.kind, armed.mode))
    : MEP_LAYERS;
  MEP_LAYERS.forEach(function (lay) {
    var b = document.createElement("button");
    b.className = "mep-layer-btn" + (m.layer === lay ? " active" : "");
    b.textContent = t("mep_" + lay);
    b.disabled = allowed.indexOf(lay) < 0;
    b.title = b.disabled ? t("mep_layerUnavailable") : t("mep_layerHint");
    b.onclick = function () { setRoutingLayer(m, lay); renderPanel(); render2D(); };
    lrow.appendChild(b);
  });
  panelEl.appendChild(lrow);
  var layerHelp = document.createElement("div");
  layerHelp.className = "mep-layer-help " + m.layer;
  layerHelp.innerHTML = '<b>' + t("mep_" + m.layer) + '</b><span>' + t("mep_" + m.layer + "Explain") + '</span>';
  panelEl.appendChild(layerHelp);

  // palette for the active system
  var sys = m.active;
  var pal = document.createElement("div");
  pal.className = "mep-palette";

  var dh = document.createElement("div");
  dh.className = "mep-sub";
  dh.textContent = t("mep_devices");
  pal.appendChild(dh);
  var dgrid = document.createElement("div");
  dgrid.className = "mep-grid";
  (MEP_NODE_KINDS[sys] || []).forEach(function (d) {
    dgrid.appendChild(paletteBtn(sys, d.k, "node", d.code, d.hub, nodeLabel(sys, d.k)));
  });
  pal.appendChild(dgrid);

  var rh = document.createElement("div");
  rh.className = "mep-sub";
  rh.textContent = t("mep_runs");
  pal.appendChild(rh);
  var rgrid = document.createElement("div");
  rgrid.className = "mep-grid";
  (MEP_RUN_KINDS[sys] || []).forEach(function (d) {
    rgrid.appendChild(paletteBtn(sys, d.k, "run", "▬", false, runLabel(sys, d.k), d.color || MEP_SYS[sys].color));
  });
  pal.appendChild(rgrid);
  panelEl.appendChild(pal);

  // Per-run routing rules used by automatic/random apartment generation.
  var policyBox = document.createElement("div");
  policyBox.className = "mep-policy";
  var policyHead = document.createElement("div");
  policyHead.className = "mep-policy-head";
  policyHead.innerHTML = '<b>' + t("mep_policyTitle") + '</b><span>' + t("mep_policyHint") + '</span>';
  policyBox.appendChild(policyHead);
  (MEP_RUN_KINDS[sys] || []).forEach(function (d) {
    var p = routingPolicy(sys, d.k);
    var row = document.createElement("div");
    row.className = "mep-policy-row";
    var name = document.createElement("span");
    name.textContent = runLabel(sys, d.k);
    row.appendChild(name);
    var modeSel = document.createElement("select");
    [["auto", "mep_policyAuto"], ["prefer", "mep_policyPrefer"], ["require", "mep_policyRequire"]].forEach(function (o) {
      var op = document.createElement("option"); op.value = o[0]; op.textContent = t(o[1]); op.selected = p.mode === o[0]; modeSel.appendChild(op);
    });
    var layerSel = document.createElement("select");
    allowedLayersFor(sys, d.k, "run").forEach(function (lay) {
      var op = document.createElement("option"); op.value = lay; op.textContent = t("mep_" + lay); op.selected = p.layer === lay; layerSel.appendChild(op);
    });
    function updatePolicy() {
      pushHistory();
      setRoutingPolicy(sys, d.k, modeSel.value, layerSel.value);
      S.dirty3D = true;
      renderPanel(); render2D(); refreshTree();
    }
    modeSel.onchange = updatePolicy;
    layerSel.onchange = updatePolicy;
    row.appendChild(modeSel); row.appendChild(layerSel);
    policyBox.appendChild(row);
  });
  panelEl.appendChild(policyBox);

  // options footer
  var opts = document.createElement("div");
  opts.className = "mep-opts";
  var wr = optCheck(t("mep_wallRoute"), m.wallRoute !== false, function (v) { m.wallRoute = v; render2D(); });
  wr.title = t("mep_wallRouteHint");
  opts.appendChild(wr);
  opts.appendChild(optCheck(t("mep_snap"), m.snapAngle, function (v) { m.snapAngle = v; }));
  opts.appendChild(optCheck(t("mep_animate"), m.animate !== false, function (v) { m.animate = v; render2D(); }));
  opts.appendChild(optCheck(t("mep_3d"), m.show3D, function (v) { m.show3D = v; S.dirty3D = true; render2D(); }));

  var xrayGrp = document.createElement("div");
  xrayGrp.className = "mep-xray-group";
  var xrayLbl = document.createElement("div");
  xrayLbl.className = "mep-xray-title";
  xrayLbl.textContent = t("mep_xray_title");
  xrayGrp.appendChild(xrayLbl);

  var xrayBoxes = document.createElement("div");
  xrayBoxes.className = "mep-xray-boxes";
  xrayBoxes.appendChild(optCheck(t("mep_xray_walls"), !!(m.xray && m.xray.walls), function (v) {
    m.xray.walls = v;
    S.dirty3D = true;
    render2D();
  }));
  xrayBoxes.appendChild(optCheck(t("mep_xray_floor"), !!(m.xray && m.xray.floor), function (v) {
    m.xray.floor = v;
    S.dirty3D = true;
    render2D();
  }));
  xrayBoxes.appendChild(optCheck(t("mep_xray_ceiling"), !!(m.xray && m.xray.ceiling), function (v) {
    m.xray.ceiling = v;
    S.dirty3D = true;
    render2D();
  }));
  xrayGrp.appendChild(xrayBoxes);
  opts.appendChild(xrayGrp);
  panelEl.appendChild(opts);

  var hint = document.createElement("div");
  hint.className = "mep-hint";
  hint.textContent = t("mep_hint");
  panelEl.appendChild(hint);
}

function paletteBtn(sys, k, mode, glyph, hub, label, glyphColor) {
  var m = ensureMEP();
  var armed = m.place && m.place.sys === sys && m.place.kind === k && m.place.mode === mode;
  var b = document.createElement("button");
  b.className = "mep-btn" + (armed ? " armed" : "");
  b.title = label;
  var g = document.createElement("span");
  g.className = "mep-glyph" + (hub ? " hub" : "");
  g.style.background = mode === "run" ? "transparent" : MEP_SYS[sys].color;
  g.style.color = mode === "run" ? (glyphColor || MEP_SYS[sys].color) : "#fff";
  g.textContent = glyph;
  b.appendChild(g);
  var tx = document.createElement("span");
  tx.className = "mep-btn-lbl";
  tx.textContent = label;
  b.appendChild(tx);
  b.onclick = function () { arm(sys, k, mode); };
  return b;
}

function optCheck(label, checked, onChange) {
  var l = document.createElement("label");
  l.className = "mep-opt";
  var cb = document.createElement("input");
  cb.type = "checkbox";
  cb.checked = checked;
  cb.onchange = function () { onChange(cb.checked); render2D(); };
  l.appendChild(cb);
  var s = document.createElement("span");
  s.textContent = label;
  l.appendChild(s);
  return l;
}

/* ---- inspector (right panel) for a selected node/run --------------------- */
export function fillMEP() {
  var host = document.getElementById("mepProps");
  if (!host || !S.sel) return;
  host.innerHTML = "";
  var sel = S.sel;

  var title = document.createElement("div");
  title.id = "selname";
  var isNode = sel.kind === "mepNode";
  var e = sel.ref;
  title.textContent = sysLabel(e.sys) + " · " + (isNode ? nodeLabel(e.sys, e.k) : runLabel(e.sys, e.k));
  host.appendChild(title);

  // connection-status banner (orphan / unsupplied)
  var status = computeMEPStatus();
  var issue = isNode ? status.node[e.id] : status.run[e.id];
  if (issue) {
    var banner = document.createElement("div");
    banner.className = "mep-status " + issue;
    banner.textContent = "⚠ " + t(issue === "orphan" ? "mep_orphan" : "mep_unsupplied");
    host.appendChild(banner);
  }
  if (!isNode && runCrossesOpening(e)) {
    var doorBanner = document.createElement("div");
    doorBanner.className = "mep-status invalid";
    doorBanner.textContent = "⚠ " + t("mep_runDoorConflict");
    host.appendChild(doorBanner);
  }

  // kind switcher (change device type / pipe type in place)
  var kinds = isNode ? MEP_NODE_KINDS[e.sys] : MEP_RUN_KINDS[e.sys];
  var krow = labeledRow(t("mep_type"));
  var ksel = document.createElement("select");
  kinds.forEach(function (d) {
    var o = document.createElement("option");
    o.value = d.k;
    o.textContent = isNode ? nodeLabel(e.sys, d.k) : runLabel(e.sys, d.k);
    if (d.k === e.k) o.selected = true;
    ksel.appendChild(o);
  });
  ksel.onchange = function () {
    pushHistory();
    e.k = ksel.value;
    if (isNode) {
      var nd = nodeKindDef(e.sys, e.k);
      if (nd && nd.elev != null) e.elev = nd.elev;
    } else {
      var rd = runKindDef(e.sys, e.k);
      if (rd) { e.dia = rd.dia; e.color = null; e.exposed = !!rd.exposed; }
    }
    var validLayers = isNode ? allowedLayersFor(e.sys, e.k, "node") : effectiveRunLayers(e.sys, e.k);
    if (validLayers.indexOf(e.layer) < 0)
      e.layer = isNode ? defaultLayerFor(e.sys, e.k, "node") : policyLayerFor(e.sys, e.k, defaultLayerFor(e.sys, e.k, "run"));
    S.dirty3D = true;
    fillMEP();
    render2D();
    renderPanel();
  };
  krow.appendChild(ksel);
  host.appendChild(krow);

  // routing plane (wall / ceiling / floor)
  var lyrow = labeledRow(t("mep_layer"));
  var lysel = document.createElement("select");
  (isNode ? allowedLayersFor(e.sys, e.k, "node") : effectiveRunLayers(e.sys, e.k)).forEach(function (lay) {
    var o = document.createElement("option");
    o.value = lay;
    o.textContent = t("mep_" + lay);
    if (e.layer === lay) o.selected = true;
    lysel.appendChild(o);
  });
  lysel.onchange = function () {
    pushHistory();
    e.layer = lysel.value;
    if (isNode && e.layer !== "wall") { e.wall = null; e.s = null; }
    S.dirty3D = true;
    fillMEP();
    render2D();
  };
  lyrow.appendChild(lysel);
  host.appendChild(lyrow);

  if (isNode) {
    // mounting height
    var hrow = labeledRow(t("mep_elev"));
    var hin = numInput(e.elev, function (v) { pushHistory(); e.elev = v; S.dirty3D = true; render2D(); });
    hrow.appendChild(hin);
    host.appendChild(hrow);
    // free label
    var lrow = labeledRow(t("mep_label"));
    var lin = document.createElement("input");
    lin.type = "text";
    lin.value = e.label || "";
    lin.oninput = function () { e.label = lin.value; };
    lrow.appendChild(lin);
    host.appendChild(lrow);
    // read-only attachment note
    var info = document.createElement("div");
    info.className = "mep-info";
    info.textContent = e.wall != null ? t("mep_onWall") : t("mep_free");
    host.appendChild(info);
  } else {
    // diameter
    var drow = labeledRow(t("mep_dia"));
    var din = numInput(e.dia, function (v) { pushHistory(); e.dia = Math.max(0.5, v); S.dirty3D = true; render2D(); });
    drow.appendChild(din);
    host.appendChild(drow);
    // total length (read-only)
    var lenrow = labeledRow(t("mep_len"));
    var lenv = document.createElement("span");
    lenv.className = "mep-readout";
    lenv.textContent = Math.round(runLength(e)) + " " + t("cm") + " · " + e.pts.length + " " + t("mep_pts");
    lenrow.appendChild(lenv);
    host.appendChild(lenrow);
    // gravity fall — only meaningful on a run that drains rather than pumps
    if (e.sys === "drain" || e.k === "condensate") {
      var frow = labeledRow(t("mep_fall"));
      var fin2 = numInput(e.fall || 0, function (v) {
        pushHistory();
        e.fall = Math.max(0, v);
        S.dirty3D = true;
        render2D();
      });
      frow.appendChild(fin2);
      host.appendChild(frow);
    }
    if (e.sys === "hvac" && (e.k === "duct" || e.k === "branch" || e.k === "flex" || e.k === "refrig")) {
      host.appendChild(optCheck(t("mep_exposed"), e.exposed !== false, function (v) {
        pushHistory(); e.exposed = v; S.dirty3D = true; render2D();
      }));
    }
  }

  // delete
  var del = document.createElement("button");
  del.className = "mep-del-btn";
  del.textContent = t("mep_delete");
  del.onclick = function () {
    pushHistory();
    deleteMEP(sel);
    select(null);
    S.dirty3D = true;
    render2D();
  };
  host.appendChild(del);
}

function labeledRow(label) {
  var row = document.createElement("label");
  row.className = "mep-row";
  var s = document.createElement("span");
  s.textContent = label;
  row.appendChild(s);
  return row;
}
function numInput(val, onChange) {
  var i = document.createElement("input");
  i.type = "number";
  i.inputMode = "numeric";
  i.value = Math.round(val);
  i.onchange = function () {
    var v = parseFloat(i.value);
    if (!isNaN(v)) onChange(v);
  };
  return i;
}
