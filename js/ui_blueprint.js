// Blueprint import modal: upload a floor-plan image, run it through the local
// VLM (blueprint.js), preview the parse, then commit it to the scene via
// buildLayout(). Also owns the failure states (server offline, model missing,
// out-of-memory / truncated JSON → suggest lower-resolution retry).
import { S } from "./state.js";
import { t } from "./i18n.js";
import { pushHistory } from "./history.js";
import { render2D, fitView } from "./plan2d.js";
import { buildLayout } from "./generator.js";
import { flash } from "./ui.js";
import { parseBlueprint, parseBlueprintCV, BP_MODELS, BP_ENGINES, BP_ENDPOINT } from "./blueprint.js";
import { convertCadToWalls } from "./cad_to_walls.js";

var lastFile = null;
var lastResult = null;
var currentMaxDim = 1568;

function el(tag, cls, text) {
  var n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text) n.textContent = text;
  return n;
}

export function openBlueprintModal() {
  lastFile = null;
  lastResult = null;
  currentMaxDim = 1568;

  var overlay = el("div", "bp-overlay");
  var modal = el("div", "bp-modal");
  overlay.appendChild(modal);

  var title = el("h3", null, t("bp_title"));
  var drop = el("div", "bp-drop");
  drop.appendChild(el("i", "ph ph-blueprint"));
  var dropTxt = el("div", null, t("bp_drop"));
  drop.appendChild(dropTxt);
  var fileIn = el("input");
  fileIn.type = "file";
  fileIn.accept = "image/jpeg,image/png";
  fileIn.style.display = "none";

  var row = el("div", "bp-row");
  var modelLbl = el("label", null, t("bp_engine"));
  var modelSel = el("select");
  BP_ENGINES.forEach(function (m) {
    var o = el("option", null, m.label);
    o.value = m.id;
    modelSel.appendChild(o);
  });
  modelLbl.appendChild(modelSel);
  row.appendChild(modelLbl);

  // plan width sets the CV parser's pixel scale; VLM engines read dimensions
  // from the drawing's own labels instead
  var widthLbl = el("label", null, t("bp_width"));
  var widthIn = el("input");
  widthIn.type = "number";
  widthIn.value = "1000";
  widthIn.min = "300";
  widthIn.max = "4000";
  widthIn.step = "10";
  widthIn.style.width = "70px";
  widthLbl.appendChild(widthIn);
  row.appendChild(widthLbl);

  var oCustom = el("option", null, "Custom VLM Model");
  oCustom.value = "custom";
  modelSel.appendChild(oCustom);
  
  var savedEngine = localStorage.getItem("bp_engine_sel");
  if (savedEngine) modelSel.value = savedEngine;

  var row2 = el("div", "bp-row");
  row2.style.marginTop = "10px";

  var endpointLbl = el("label", null, "LLM Endpoint");
  var endpointIn = el("input");
  endpointIn.type = "text";
  endpointIn.value = localStorage.getItem("bp_endpoint") || BP_ENDPOINT;
  endpointIn.style.width = "180px";
  endpointLbl.appendChild(endpointIn);
  row2.appendChild(endpointLbl);

  var customModelIn = el("input");
  customModelIn.type = "text";
  customModelIn.value = localStorage.getItem("bp_model") || "";
  customModelIn.style.width = "120px";
  customModelIn.placeholder = "Model ID";
  customModelIn.style.display = "none";
  row2.appendChild(customModelIn);

  function isCV() { return modelSel.value === "cv" || modelSel.value.indexOf("cv+") === 0; }
  function syncEngineUI() { 
    widthLbl.style.display = isCV() ? "" : "none"; 
    customModelIn.style.display = modelSel.value === "custom" ? "" : "none";
  }
  modelSel.onchange = syncEngineUI;
  syncEngineUI();

  var status = el("div", "bp-status");
  var preview = el("canvas", "bp-preview");
  preview.style.display = "none";
  var warnBox = el("div", "bp-warn");
  warnBox.style.display = "none";

  var btnRow = el("div", "bp-btnrow");
  var btnCancel = el("button", null, t("cancel"));
  var btnParse = el("button", "btn-accent", t("bp_parse"));
  btnParse.disabled = true;
  var btnApply = el("button", "btn-accent", t("bp_apply"));
  btnApply.style.display = "none";
  btnRow.appendChild(btnCancel);
  btnRow.appendChild(btnParse);
  btnRow.appendChild(btnApply);

  modal.appendChild(title);
  modal.appendChild(drop);
  modal.appendChild(fileIn);
  modal.appendChild(row);
  modal.appendChild(row2);
  modal.appendChild(status);
  modal.appendChild(preview);
  modal.appendChild(warnBox);
  modal.appendChild(btnRow);
  document.body.appendChild(overlay);

  function close() {
    document.body.removeChild(overlay);
  }
  btnCancel.onclick = close;
  overlay.onclick = function (e) {
    if (e.target === overlay) close();
  };

  function setFile(f) {
    if (!f || !/image\/(jpeg|png)/.test(f.type)) {
      status.textContent = t("bp_badfile");
      return;
    }
    lastFile = f;
    dropTxt.textContent = f.name + " (" + Math.round(f.size / 1024) + " KB)";
    btnParse.disabled = false;
    status.textContent = "";
  }
  drop.onclick = function () { fileIn.click(); };
  fileIn.onchange = function () { setFile(fileIn.files[0]); };
  drop.ondragover = function (e) { e.preventDefault(); drop.classList.add("over"); };
  drop.ondragleave = function () { drop.classList.remove("over"); };
  drop.ondrop = function (e) {
    e.preventDefault();
    drop.classList.remove("over");
    setFile(e.dataTransfer.files[0]);
  };

  // ---- failure UI --------------------------------------------------------
  function showError(err) {
    btnParse.disabled = false;
    btnParse.textContent = t("bp_retry");
    preview.style.display = "none";
    btnApply.style.display = "none";
    warnBox.style.display = "block";
    warnBox.className = "bp-warn bp-error";
    if (err.kind === "offline") {
      warnBox.innerHTML = "";
      warnBox.appendChild(el("div", null, t("bp_offline")));
      var cmd = el("pre", null, "OLLAMA_ORIGINS='*' ollama serve\n# Or start LM Studio / LocalAI on this endpoint");
      warnBox.appendChild(cmd);
    } else if (err.kind === "cv-offline") {
      warnBox.innerHTML = "";
      warnBox.appendChild(el("div", null, t("bp_cv_offline")));
      warnBox.appendChild(el("pre", null, "python3 tools/blueprint_cv.py --serve"));
    } else if (err.kind === "no-model") {
      warnBox.innerHTML = "";
      warnBox.appendChild(el("div", null, t("bp_nomodel")));
      var mname = modelSel.value === "custom" ? customModelIn.value : (modelSel.value.indexOf("cv+") === 0 ? modelSel.value.slice(3) : modelSel.value);
      warnBox.appendChild(el("pre", null, "ollama pull " + mname));
    } else if (err.kind === "oom") {
      // The M2 Pro ran out of unified memory mid-generation (timeout or
      // truncated JSON). Offer a half-resolution auto-retry.
      warnBox.innerHTML = "";
      warnBox.appendChild(el("div", null, t("bp_oom")));
      var half = el("button", "btn-accent", t("bp_retry_lowres"));
      half.onclick = function () {
        currentMaxDim = Math.max(512, Math.round(currentMaxDim / 2));
        runParse();
      };
      warnBox.appendChild(half);
      if (modelSel.value !== BP_MODELS[0].id)
        warnBox.appendChild(el("div", null, t("bp_try12b")));
    } else {
      warnBox.textContent = t("bp_parsefail") + (err.message ? " — " + err.message : "");
    }
  }

  // ---- preview render ----------------------------------------------------
  function drawPreview(res) {
    var lay = res.layout;
    var W = 460, H = 320, pad = 16;
    preview.width = W * devicePixelRatio;
    preview.height = H * devicePixelRatio;
    preview.style.width = W + "px";
    preview.style.height = H + "px";
    var ctx = preview.getContext("2d");
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    ctx.clearRect(0, 0, W, H);
    var sc = Math.min((W - pad * 2) / lay.w, (H - pad * 2) / lay.d);
    var ox = (W - lay.w * sc) / 2, oy = (H - lay.d * sc) / 2;

    // relative wall thickness from the VLM's wall list (exterior vs interior)
    var thick = res.floorplan.walls.filter(function (w) { return w.type === "exterior"; })[0];
    var extPx = Math.max(2, ((thick && thick.thickness) || 20) * sc * 0.5);

    lay.rooms.forEach(function (r) {
      var x = ox + r.x0 * sc, y = oy + r.z0 * sc;
      var rw = (r.x1 - r.x0) * sc, rh = (r.z1 - r.z0) * sc;
      ctx.fillStyle = r.clamped ? "rgba(220,160,60,0.18)" : "rgba(90,140,190,0.12)";
      ctx.fillRect(x, y, rw, rh);
      ctx.strokeStyle = "#5a7a96";
      ctx.lineWidth = extPx;
      ctx.strokeRect(x, y, rw, rh);
      ctx.fillStyle = "#333";
      ctx.font = "600 11px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(r.name, x + rw / 2, y + rh / 2 - 6);
      ctx.font = "10px sans-serif";
      ctx.fillStyle = "#777";
      var lbl = (r.original_label ? r.original_label + " · " : "") +
        Math.round(r.x1 - r.x0) + "×" + Math.round(r.z1 - r.z0);
      ctx.fillText(lbl, x + rw / 2, y + rh / 2 + 8);
    });
    preview.style.display = "block";
  }

  // ---- pipeline ----------------------------------------------------------
  function runParse() {
    if (!lastFile) return;
    btnParse.disabled = true;
    btnApply.style.display = "none";
    warnBox.style.display = "none";
    preview.style.display = "none";
    var onProgress = function (stage) {
      status.textContent = t("bp_stage_" + stage) +
        (!isCV() && currentMaxDim < 1568 ? " (" + currentMaxDim + "px)" : "");
    };
    var finalModel = modelSel.value === "custom" ? customModelIn.value : modelSel.value;
    var finalEndpoint = endpointIn.value.trim();

    localStorage.setItem("bp_endpoint", finalEndpoint);
    localStorage.setItem("bp_engine_sel", modelSel.value);
    if (modelSel.value === "custom") {
      localStorage.setItem("bp_model", customModelIn.value);
    }

    var job = isCV()
      ? parseBlueprintCV(lastFile, {
          widthCm: Number(widthIn.value) || 1000,
          ollamaModel: finalModel.indexOf("cv+") === 0 ? finalModel.slice(3) : null,
          onProgress: onProgress,
        })
      : parseBlueprint(lastFile, {
          model: finalModel,
          endpoint: finalEndpoint,
          maxDim: currentMaxDim,
          onProgress: onProgress,
        });
    job
      .then(function (res) {
        lastResult = res;
        status.textContent = t("bp_found", { n: res.floorplan.rooms.length });
        btnParse.disabled = false;
        btnParse.textContent = t("bp_retry");
        drawPreview(res);
        var warns = res.warnings.slice();
        if (res.repaired) warns.unshift(t("bp_repaired"));
        if (warns.length) {
          warnBox.className = "bp-warn";
          warnBox.style.display = "block";
          warnBox.textContent = warns.join(" · ");
        }
        btnApply.style.display = "";
      })
      .catch(function (err) {
        status.textContent = "";
        showError(err.kind ? err : { kind: "bad-json", message: err.message });
      });
  }
  btnParse.onclick = runParse;

  btnApply.onclick = function () {
    if (!lastResult) return;
    pushHistory();
    /* Newer/local parsers may return actual wall surface lines and arcs.  Keep
       the established room-box path as a fallback, but prefer analytic CAD
       conversion when supplied so thickness, curves and opening locations are
       not flattened into bounding rectangles. */
    var cad = lastResult.cadEntities || lastResult.cad;
    if (cad && (cad.lines || cad.arcs)) {
      var converted = convertCadToWalls(cad, {
        wallTypeByLayer: lastResult.wallTypeByLayer || {},
        singleLineWalls: !!lastResult.singleLineWalls,
        defaultThickness: 10,
        firstId: S.idc,
      });
      S.nodes = converted.nodes;
      S.walls = converted.walls;
      S.openings = converted.openings;
      S.items = [];
      S.roomMeta = {};
      S.idc = converted.nextId;
    } else {
      buildLayout(lastResult.layout, true);
    }
    S.sel = null;
    S.dirty3D = true;
    render2D();
    fitView();
    close();
    flash(t("bp_applied"));
  };
}
