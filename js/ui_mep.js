// UI for the MEP infrastructure layer: the left-panel "Infrastructure" section
// (system chips + device/pipe palette + options) and the right-panel inspector
// for a selected device or run. Arming a palette entry switches the plan tool;
// interaction.js drives the actual placing/routing/selecting on the canvas.
import {
  ensureMEP, MEP_SYS, MEP_SYS_ORDER, MEP_NODE_KINDS, MEP_RUN_KINDS, MEP_LAYERS,
  sysLabel, nodeLabel, runLabel,
  deleteMEP, runLength, mepVisible, getMEPState, connectMissingMEP, onMEPChange,
  allowedLayersFor, defaultLayerFor, runCrossesOpening,
  routingPolicy, setRoutingPolicy, policyLayerFor, effectiveRunLayers,
  setNodeKind, setRunKind, setMEPLayer, decideAutoGenerate,
} from "./mep.js";
import { autoInfrastructure } from "./mep_auto.js";
import { setTool } from "./interaction.js";
import { render2D } from "./plan2d.js";
import { select } from "./ui_props.js";
import { refreshTree } from "./ui_tree.js";
import { pushHistory } from "./history.js";
import { t, getLang, onLangChange } from "./i18n.js";
import { fmtLen, parseLen } from "./display_units.js";
import { detectRooms } from "./geometry.js";
import { S } from "./state.js";

function notify(msg, kind) {
  import("./ui.js").then(function (ui) { ui.flash(msg, kind); });
}

// generate a full MEP rough-in from the current rooms + fixtures (replaces MEP)
export function autoGenerateMEP() {
  var m = ensureMEP();
  var decision = decideAutoGenerate(
    detectRooms().length,
    m.nodes.length + m.runs.length,
    function () { return window.confirm(t("mep_autoReplace")); },
  );
  if (decision === "need-room") {
    notify(t("mep_autoNeedRoom"), "error");
    return { ok: false, reason: "need-room" };
  }
  if (decision === "cancelled") return { ok: false, reason: "cancelled" };
  pushHistory();
  var res = autoInfrastructure();
  m = ensureMEP();
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
var mepPanelSubscribed = false;
// The health line stays in the document across panel rebuilds. Recreating a
// live region makes a screen reader repeat "all connected" on every toggle.
var healthEl = null;
var healthTextEl = null;
var healthIconEl = null;
var healthRepairEl = null;
var clashEl = null;
var clashTextEl = null;

function ensureHealth() {
  if (healthEl && healthEl.isConnected) return;
  healthEl = document.createElement("div");
  healthEl.className = "mep-health ok";
  healthEl.setAttribute("role", "status");
  healthEl.setAttribute("aria-live", "polite");
  var copy = document.createElement("span");
  copy.className = "mep-health-copy";
  healthIconEl = document.createElement("i");
  healthIconEl.setAttribute("aria-hidden", "true");
  copy.appendChild(healthIconEl);
  healthTextEl = document.createElement("span");
  healthTextEl.setAttribute("data-mep-health-text", "");
  copy.appendChild(healthTextEl);
  healthEl.appendChild(copy);
  healthRepairEl = null;
  panelEl.appendChild(healthEl);
}

function syncHealth() {
  var issueCount = getMEPState().status.deviceIssues;
  var text = issueCount
    ? t("mep_disconnectedCount", { n: issueCount })
    : t("mep_allConnected");
  healthEl.classList.toggle("warn", !!issueCount);
  healthEl.classList.toggle("ok", !issueCount);
  var icon = issueCount ? "ph ph-warning" : "ph ph-check-circle";
  if (healthIconEl.className !== icon) healthIconEl.className = icon;
  if (healthTextEl.textContent !== text) healthTextEl.textContent = text;
  if (issueCount) {
    var label = t("mep_connectMissing");
    if (!healthRepairEl) {
      healthRepairEl = document.createElement("button");
      healthRepairEl.type = "button";
      healthRepairEl.onclick = function () {
        pushHistory();
        connectMissingMEP();
        if (ensureMEP().runs.some(function (r) { return r.layer === "floor"; })) ensureMEP().xray.floor = true;
        S.dirty3D = true;
        render2D();
        refreshTree();
      };
      healthEl.appendChild(healthRepairEl);
    }
    if (healthRepairEl.textContent !== label) healthRepairEl.textContent = label;
  } else if (healthRepairEl) {
    healthRepairEl.remove();
    healthRepairEl = null;
  }
}

function ensureClash() {
  if (clashEl && clashEl.isConnected) return;
  clashEl = document.createElement("div");
  clashEl.className = "mep-clashes";
  clashEl.setAttribute("role", "status");
  clashEl.setAttribute("aria-live", "polite");
  clashEl.hidden = true;
  var icon = document.createElement("i");
  icon.className = "ph ph-intersect";
  icon.setAttribute("aria-hidden", "true");
  clashEl.appendChild(icon);
  clashTextEl = document.createElement("span");
  clashTextEl.setAttribute("data-mep-clash-text", "");
  clashEl.appendChild(clashTextEl);
  if (healthEl && healthEl.parentNode === panelEl) healthEl.insertAdjacentElement("afterend", clashEl);
  else panelEl.appendChild(clashEl);
}

function syncClashes() {
  var n = (getMEPState().clashes || []).length;
  var text = n ? t("mep_clashCount", { n: n }) : "";
  if (!n) {
    if (!clashEl.hidden) clashEl.hidden = true;
    if (clashTextEl.textContent !== "") clashTextEl.textContent = "";
    return;
  }
  if (clashEl.hidden) clashEl.hidden = false;
  if (clashTextEl.textContent !== text) clashTextEl.textContent = text;
}

export function initMEP() {
  panelEl = document.getElementById("mepPanel");
  if (!panelEl) return;
  renderPanel();
  onLangChange(renderPanel);
  // Canvas delete, tree delete and auto-route all mutate the model without
  // going through this panel. One coalesced callback keeps the health line
  // in step with them.
  if (!mepPanelSubscribed) {
    mepPanelSubscribed = true;
    onMEPChange(function () { if (panelEl) renderPanel(); });
  }
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
  ensureHealth();
  ensureClash();
  Array.from(panelEl.children).forEach(function (el) {
    if (el !== healthEl && el !== clashEl) el.remove();
  });
  var m = ensureMEP();

  // auto rough-in button
  var auto = document.createElement("button");
  auto.type = "button";
  auto.className = "mep-auto-btn";
  var autoIcon = document.createElement("i");
  autoIcon.className = "ph ph-magic-wand";
  autoIcon.setAttribute("aria-hidden", "true");
  auto.appendChild(autoIcon);
  auto.appendChild(document.createTextNode(t("mep_auto")));
  auto.title = t("mep_autoHint");
  auto.onclick = function () { autoGenerateMEP(); };
  panelEl.insertBefore(auto, healthEl);
  if (clashEl.previousElementSibling !== healthEl) healthEl.insertAdjacentElement("afterend", clashEl);
  syncHealth();
  syncClashes();

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
  chips.setAttribute("role", "group");
  chips.setAttribute("aria-label", t("mep_systems"));
  MEP_SYS_ORDER.forEach(function (sys) {
    var hidden = m.vis[sys] === false;
    var name = sysLabel(sys);
    var chip = document.createElement("div");
    chip.className = "mep-chip" + (m.active === sys ? " active" : "") + (hidden ? " is-hidden" : "");
    chip.style.setProperty("--sys", MEP_SYS[sys].color);
    var main = document.createElement("button");
    main.type = "button";
    main.className = "mep-chip-main";
    main.setAttribute("aria-pressed", m.active === sys ? "true" : "false");
    main.setAttribute("aria-label", t("mep_selectSystem", { name: name }));
    var dot = document.createElement("span");
    dot.className = "mep-dot";
    dot.setAttribute("aria-hidden", "true");
    main.appendChild(dot);
    var lbl = document.createElement("span");
    lbl.className = "mep-chip-lbl";
    lbl.textContent = name;
    main.appendChild(lbl);
    main.onclick = function () { setActive(sys); };
    chip.appendChild(main);
    var eye = document.createElement("button");
    eye.type = "button";
    eye.className = "mep-eye";
    eye.setAttribute("aria-pressed", hidden ? "false" : "true");
    eye.setAttribute("aria-label", t(hidden ? "mep_showSystem" : "mep_hideSystem", { name: name }));
    eye.title = t("mep_toggleVis");
    var eyeIcon = document.createElement("i");
    eyeIcon.className = hidden ? "ph ph-eye-slash" : "ph ph-eye";
    eyeIcon.setAttribute("aria-hidden", "true");
    eye.appendChild(eyeIcon);
    eye.onclick = function () {
      m.vis[sys] = hidden;
      S.dirty3D = true;
      renderPanel();
      render2D();
    };
    chip.appendChild(eye);
    chips.appendChild(chip);
  });
  panelEl.appendChild(chips);

  var guide = document.createElement("div");
  guide.className = "mep-guidance";
  [
    ["ph-door", "mep_ruleDoor"],
    ["ph-stack", "mep_ruleLayers"],
    ["ph-wind", "mep_ruleHVAC"],
  ].forEach(function (row) {
    var line = document.createElement("div");
    var icon = document.createElement("i");
    icon.className = "ph " + row[0];
    icon.setAttribute("aria-hidden", "true");
    var text = document.createElement("span");
    text.textContent = t(row[1]);
    line.appendChild(icon);
    line.appendChild(text);
    guide.appendChild(line);
  });
  panelEl.appendChild(guide);

  // routing plane selector (wall / ceiling / floor)
  var layerTitle = document.createElement("div");
  layerTitle.className = "mep-layer-title";
  layerTitle.textContent = t("mep_layerSelectTitle");
  panelEl.appendChild(layerTitle);
  var lrow = document.createElement("div");
  lrow.className = "mep-layers";
  lrow.setAttribute("role", "group");
  lrow.setAttribute("aria-label", t("mep_layerSelectTitle"));
  var armed = m.place && m.place.sys === m.active ? m.place : null;
  var allowed = armed
    ? (armed.mode === "run" ? effectiveRunLayers(armed.sys, armed.kind) : allowedLayersFor(armed.sys, armed.kind, armed.mode))
    : MEP_LAYERS;
  MEP_LAYERS.forEach(function (lay) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "mep-layer-btn" + (m.layer === lay ? " active" : "");
    b.textContent = t("mep_" + lay);
    b.disabled = allowed.indexOf(lay) < 0;
    b.setAttribute("aria-pressed", m.layer === lay ? "true" : "false");
    b.title = b.disabled ? t("mep_layerUnavailable") : t("mep_layerHint");
    if (b.disabled) b.setAttribute("aria-label", t("mep_" + lay) + ". " + t("mep_layerUnavailable"));
    b.onclick = function () { setRoutingLayer(m, lay); renderPanel(); render2D(); };
    lrow.appendChild(b);
  });
  panelEl.appendChild(lrow);
  var layerHelp = document.createElement("div");
  layerHelp.className = "mep-layer-help " + m.layer;
  var layerHelpName = document.createElement("b");
  layerHelpName.textContent = t("mep_" + m.layer);
  var layerHelpText = document.createElement("span");
  layerHelpText.textContent = t("mep_" + m.layer + "Explain");
  layerHelp.appendChild(layerHelpName);
  layerHelp.appendChild(layerHelpText);
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
    name.title = runLabel(sys, d.k);
    row.appendChild(name);
    var modeSel = document.createElement("select");
    modeSel.setAttribute("aria-label", runLabel(sys, d.k) + " - " + t("mep_policyTitle"));
    [["auto", "mep_policyAuto"], ["prefer", "mep_policyPrefer"], ["require", "mep_policyRequire"]].forEach(function (o) {
      var op = document.createElement("option"); op.value = o[0]; op.textContent = t(o[1]); op.selected = p.mode === o[0]; modeSel.appendChild(op);
    });
    var layerSel = document.createElement("select");
    layerSel.setAttribute("aria-label", runLabel(sys, d.k) + " - " + t("mep_layer"));
    allowedLayersFor(sys, d.k, "run").forEach(function (lay) {
      var op = document.createElement("option"); op.value = lay; op.textContent = t("mep_" + lay); op.selected = p.layer === lay; layerSel.appendChild(op);
    });
    function updatePolicy() {
      pushHistory();
      setRoutingPolicy(sys, d.k, modeSel.value, layerSel.value);
      S.dirty3D = true;
      render2D();
      refreshTree();
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
  var wr = optCheck(t("mep_wallRoute"), m.wallRoute !== false, function (v) { m.wallRoute = v; });
  wr.title = t("mep_wallRouteHint");
  opts.appendChild(wr);
  opts.appendChild(optCheck(t("mep_snap"), m.snapAngle, function (v) { m.snapAngle = v; }));
  opts.appendChild(optCheck(t("mep_animate"), m.animate !== false, function (v) { m.animate = v; }));
  opts.appendChild(optCheck(t("mep_3d"), m.show3D, function (v) { m.show3D = v; S.dirty3D = true; }));

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
  }));
  xrayBoxes.appendChild(optCheck(t("mep_xray_floor"), !!(m.xray && m.xray.floor), function (v) {
    m.xray.floor = v;
    S.dirty3D = true;
  }));
  xrayBoxes.appendChild(optCheck(t("mep_xray_ceiling"), !!(m.xray && m.xray.ceiling), function (v) {
    m.xray.ceiling = v;
    S.dirty3D = true;
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
  b.type = "button";
  b.className = "mep-btn" + (armed ? " armed" : "");
  b.title = label;
  b.setAttribute("aria-pressed", armed ? "true" : "false");
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
  var status = getMEPState().status;
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
  if (!isNode && getMEPState().flow[e.id] && getMEPState().flow[e.id].uphill) {
    var slopeBanner = document.createElement("div");
    slopeBanner.className = "mep-status invalid";
    slopeBanner.textContent = "⚠ " + t("mep_uphill");
    host.appendChild(slopeBanner);
  }
  if (!isNode && getMEPState().flow[e.id] && getMEPState().flow[e.id].bedroom) {
    var bedBanner = document.createElement("div");
    bedBanner.className = "mep-status invalid";
    bedBanner.textContent = "⚠ " + t("mep_gasBedroom");
    host.appendChild(bedBanner);
  }
  if (!isNode && e.policyViolation) {
    var policyBanner = document.createElement("div");
    policyBanner.className = "mep-status invalid";
    policyBanner.textContent = "⚠ " + t("mep_policyBlocked");
    host.appendChild(policyBanner);
  }
  if (!isNode) {
    var hits = (getMEPState().clashes || []).filter(function (c) { return c.a === e.id || c.b === e.id; });
    if (hits.length) {
      var otherSys = hits[0].a === e.id ? hits[0].sysB : hits[0].sysA;
      var otherK = hits[0].a === e.id ? hits[0].kB : hits[0].kA;
      var clashBanner = document.createElement("div");
      clashBanner.className = "mep-status clash";
      var clashName = sysLabel(otherSys) + " · " + runLabel(otherSys, otherK);
      clashBanner.textContent = t("mep_clashWith", { name: clashName }) + (hits.length > 1 ? " (" + hits.length + ")" : "");
      host.appendChild(clashBanner);
    }
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
    if (isNode) setNodeKind(e, ksel.value);
    else setRunKind(e, ksel.value);
    S.dirty3D = true;
    fillMEP();
    render2D();
    refreshTree();
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
    setMEPLayer(e, lysel.value);
    S.dirty3D = true;
    fillMEP();
    render2D();
    refreshTree();
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
    lin.maxLength = 80;
    lin.autocomplete = "off";
    lin.spellcheck = false;
    lin.value = e.label || "";
    var labelArmed = false;
    lin.oninput = function () {
      if (!labelArmed) { pushHistory(); labelArmed = true; }
      e.label = lin.value;
      render2D();
    };
    lin.onchange = function () { refreshTree(); };
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
    lenv.textContent = fmtLen(runLength(e)) + " · " + e.pts.length + " " + t("mep_pts");
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
        pushHistory(); e.exposed = v; S.dirty3D = true;
      }));
    }
  }

  // delete
  var del = document.createElement("button");
  del.type = "button";
  del.className = "mep-del-btn";
  del.textContent = t("mep_delete");
  del.onclick = function () {
    pushHistory();
    deleteMEP(sel);
    select(null);
    S.dirty3D = true;
    render2D();
    refreshTree();
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
  i.type = "text";
  i.inputMode = "decimal";
  i.autocomplete = "off";
  i.value = fmtLen(val, { suffix: false });
  i.onchange = function () {
    var v = parseLen(i.value);
    if (Number.isFinite(v)) onChange(v);
    else i.value = fmtLen(val, { suffix: false });
  };
  return i;
}
