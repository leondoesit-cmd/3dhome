import { generatedChangePermission } from "./redesign.js";
// Blueprint import modal: upload a floor-plan image, run it through the local
// VLM (blueprint.js), preview the parse, then commit it to the scene via
// buildLayout(). Also owns the failure states (server offline, model missing,
// out-of-memory / truncated JSON → suggest lower-resolution retry).
import { S } from "./state.js";
import { t } from "./i18n.js";
import { pushHistory } from "./history.js";
import { render2D, fitView } from "./plan2d.js";
import { buildLayout } from "./generator.js";
import { flash, refreshTree, fillProps } from "./ui.js";
import { parseBlueprint, parseBlueprintCV, parseBlueprintLocal, parseBlueprintRaster, BP_MODELS, BP_ENGINES, BP_ENDPOINT } from "./blueprint.js";
import { convertCadToWalls } from "./cad_to_walls.js";
import { detectRooms, pointInPoly } from './geometry.js';
import { setBlueprintReference } from './blueprint_trace.js';

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
  var modal = el("div", "bp-modal bp-import-modal");
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', t('bp_title'));
  var opener = document.activeElement;
  var closed = false, jobId = 0, activeParse = null;
  overlay.appendChild(modal);

  var title = el("h3", null, t("bp_title"));
  var drop = el("button", "bp-drop");
  drop.type = 'button';
  drop.appendChild(el("i", "ph ph-blueprint"));
  var dropTxt = el("div", null, t("bp_drop"));
  drop.appendChild(dropTxt);
  var fileIn = el("input");
  fileIn.type = "file";
  fileIn.accept = "image/jpeg,image/png,image/webp";
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
  var widthLbl = el("label", null, t("bp_width", {u:'cm'}));
  var widthIn = el("input");
  widthIn.type = "number";
  widthIn.value = "1000";
  widthIn.min = "300";
  widthIn.max = "4000";
  // Any value: printed dimensions like 807 are not multiples of 10, and a step
  // mismatch made checkValidity() reject them as "out of range".
  widthIn.step = "any";
  widthIn.style.width = "70px";
  widthLbl.appendChild(widthIn);
  row.appendChild(widthLbl);

  var oCustom = el("option", null, "Custom VLM Model");
  oCustom.value = "custom";
  modelSel.appendChild(oCustom);
  
  // Older installations can have a missing custom model saved. Every new
  // import starts with the built-in parser; external engines remain opt-in.
  modelSel.value = 'auto';

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
    widthLbl.style.display = isCV() || ['auto','browser'].includes(modelSel.value) ? "" : "none";
    printedLabel.style.display = modelSel.value === 'auto' ? '' : 'none';
    row2.style.display = ['auto','browser','cv'].includes(modelSel.value) ? 'none' : '';
    customModelIn.style.display = modelSel.value === "custom" ? "" : "none";
  }
  modelSel.onchange = function () { syncEngineUI(); if (lastFile) runParse(); };
  widthIn.min = '100'; widthIn.max = '10000'; widthIn.style.width = '100px';
  widthIn.onchange = function () { if (lastFile) runParse(); };
  var printedLabel=el('label','bp-import-hint');
  var printedIn=el('input');printedIn.type='checkbox';printedIn.checked=true;
  printedLabel.append(printedIn,document.createTextNode(' Use readable printed dimensions for scale (otherwise use plan width)'));
  printedIn.onchange=function(){if(lastFile)runParse();};
  syncEngineUI();

  var status = el("div", "bp-status");
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  var preview = el("canvas", "bp-preview");
  preview.style.display = "none";
  var warnBox = el("div", "bp-warn");
  warnBox.style.display = "none";

  var btnRow = el("div", "bp-btnrow");
  var btnCancel = el("button", null, t("cancel"));
  var btnParse = el("button", "btn-accent", t("bp_parse"));
  btnParse.disabled = true;
  var btnApply = el("button", "btn-accent", t("bp_apply"));
  btnApply.textContent = 'Create 3D plan';
  btnApply.style.display = "none";
  btnRow.appendChild(btnCancel);
  btnRow.appendChild(btnParse);
  btnRow.appendChild(btnApply);

  modal.appendChild(title);
  modal.appendChild(drop);
  modal.appendChild(fileIn);
  var urlDetails = el('details', 'bp-import-url');
  urlDetails.appendChild(el('summary', null, 'Or import an image already hosted with this app'));
  var urlLabel = el('label', null, 'Image URL');
  var urlInput = el('input'); urlInput.type = 'url'; urlInput.placeholder = '/plans/apartment.jpg';
  urlLabel.appendChild(urlInput); urlDetails.appendChild(urlLabel);
  var urlButton = el('button', null, 'Load image'); urlButton.type = 'button'; urlDetails.appendChild(urlButton);
  urlButton.onclick = async function () {
    var requestId = ++jobId;
    lastResult = null; btnApply.style.display = 'none'; preview.style.display = 'none'; btnParse.disabled = true;
    status.textContent = 'Loading image…'; urlButton.disabled = true;
    try {
      var source = new URL(urlInput.value.trim(), location.href);
      if (source.origin !== location.origin || !/^https?:$/.test(source.protocol)) throw new Error('Use an image URL from this app’s site, or choose a local file above.');
      var response = await fetch(source.href);
      if (!response.ok) throw new Error('Image could not be loaded (' + response.status + ').');
      var blob = await response.blob();
      if (closed || requestId !== jobId) return;
      setFile(new File([blob], source.pathname.split('/').pop() || 'plan.jpg', { type: blob.type }));
    } catch (err) { if (!closed && requestId === jobId) { lastFile = null; status.textContent = err.message; } }
    finally { urlButton.disabled = false; }
  };
  modal.appendChild(urlDetails);
  modal.appendChild(row);
  modal.appendChild(row2);
  modal.appendChild(printedLabel);
  var hint = el('p', 'bp-import-hint', 'Automatic analysis reads walls, openings, original room labels, printed dimensions and visible furniture using the local vision engine. Review the draft and warnings; unreadable details remain uncertain. Plan width is the fallback full width in cm. Creating the plan replaces this floor and can be undone.');
  modal.appendChild(hint);
  modal.appendChild(status);
  modal.appendChild(preview);
  modal.appendChild(warnBox);
  modal.appendChild(btnRow);
  document.body.appendChild(overlay);

  function close() {
    closed = true; jobId++;
    activeParse?.abort();
    overlay.remove();
    opener?.focus();
  }
  overlay.onkeydown = function (e) {
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    if (e.key !== 'Tab') return;
    var controls = Array.from(modal.querySelectorAll('button, input, select')).filter(n => !n.disabled && n.getClientRects().length);
    var first = controls[0], last = controls[controls.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };
  drop.focus();
  btnCancel.onclick = close;
  overlay.onclick = function (e) {
    if (e.target === overlay) close();
  };

  function setFile(f) {
    activeParse?.abort();
    widthIn.disabled = false;
    jobId++; lastResult = null; btnApply.style.display = 'none'; preview.style.display = 'none';
    if (!f || !/^image\/(jpeg|png|webp)$/.test(f.type)) {
      lastFile = null; btnParse.disabled = true;
      status.textContent = t("bp_badfile");
      return;
    }
    lastFile = f;
    dropTxt.textContent = f.name + " (" + Math.round(f.size / 1024) + " KB)";
    btnParse.disabled = false;
    status.textContent = "";
    if (['auto','browser'].includes(modelSel.value)) runParse();
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
    if (res.reconstruction) {
      var graph = res.reconstruction;
      graph.items.forEach(function (it) {
        ctx.save(); ctx.translate(ox+it.x*sc,oy+it.z*sc); ctx.rotate(it.rot*Math.PI/180);
        ctx.fillStyle = '#bdc4b4'; ctx.fillRect(-it.w*sc/2,-it.d*sc/2,it.w*sc,it.d*sc); ctx.restore();
      });
      ctx.strokeStyle = '#254659';
      graph.walls.forEach(function (w) {
        var a = graph.nodes[w.a], b = graph.nodes[w.b];
        ctx.lineWidth = Math.max(1,w.thickness*sc); ctx.beginPath();
        ctx.moveTo(ox+a.x*sc,oy+a.z*sc); ctx.lineTo(ox+b.x*sc,oy+b.z*sc); ctx.stroke();
      });
      graph.openings.forEach(function (o) {
        var w = graph.walls.find(w=>w.id===o.wall), a = graph.nodes[w.a], b = graph.nodes[w.b];
        var length = Math.hypot(b.x-a.x,b.z-a.z), ux=(b.x-a.x)/length, uz=(b.z-a.z)/length;
        ctx.strokeStyle = o.type === 'window' ? '#23acdb' : '#efc786'; ctx.lineWidth = Math.max(2,w.thickness*sc);
        ctx.beginPath(); ctx.moveTo(ox+(a.x+ux*(o.s-o.width/2))*sc,oy+(a.z+uz*(o.s-o.width/2))*sc);
        ctx.lineTo(ox+(a.x+ux*(o.s+o.width/2))*sc,oy+(a.z+uz*(o.s+o.width/2))*sc); ctx.stroke();
      });
      preview.style.display = 'block'; return;
    }
    if (res.cad) {
      ctx.strokeStyle = '#166c96'; ctx.lineWidth = 2;
      res.cad.lines.forEach(function (line) {
        ctx.beginPath(); ctx.moveTo(ox + line.a.x * sc, oy + line.a.z * sc);
        ctx.lineTo(ox + line.b.x * sc, oy + line.b.z * sc); ctx.stroke();
      });
      res.cad.doors.forEach(function (o) { ctx.fillStyle = '#c76a10'; ctx.fillRect(ox + o.center.x * sc - 3, oy + o.center.z * sc - 3, 6, 6); });
      res.cad.windows.forEach(function (o) { ctx.fillStyle = '#149dca'; ctx.fillRect(ox + o.center.x * sc - 3, oy + o.center.z * sc - 3, 6, 6); });
      preview.style.display = 'block';
      return;
    }

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
    activeParse?.abort();activeParse=new AbortController();
    var thisJob = ++jobId;
    lastResult = null;
    btnParse.disabled = true;
    btnApply.style.display = "none";
    warnBox.style.display = "none";
    preview.style.display = "none";
    if ((isCV() || ['auto','browser'].includes(modelSel.value)) && !widthIn.checkValidity()) {
      btnParse.disabled = false; status.textContent = 'Enter a plan width between 100 and 10000 cm.'; return;
    }
    var onProgress = function (stage) {
      if (closed || thisJob !== jobId) return;
      status.textContent = (stage === 'ocr' ? 'Reading printed labels and dimensions locally…' : stage === 'vision' ? 'Analyzing the image locally: walls, openings, labels, dimensions and furniture… This can take a few minutes.' : t("bp_stage_" + stage)) +
        (!isCV() && currentMaxDim < 1568 ? " (" + currentMaxDim + "px)" : "");
    };
    var finalModel = modelSel.value === "custom" ? customModelIn.value : modelSel.value;
    var finalEndpoint = endpointIn.value.trim();

    localStorage.setItem("bp_endpoint", finalEndpoint);
    localStorage.setItem("bp_engine_sel", modelSel.value);
    if (modelSel.value === "custom") {
      localStorage.setItem("bp_model", customModelIn.value);
    }

    var job = modelSel.value === 'auto'
      ? parseBlueprintLocal(lastFile, { widthCm: Number(widthIn.value), usePrintedScale:printedIn.checked, signal:activeParse.signal, onProgress: onProgress })
      : modelSel.value === 'browser'
      ? parseBlueprintRaster(lastFile, { widthCm: Number(widthIn.value), onProgress: onProgress })
      : isCV()
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
        if (closed || thisJob !== jobId) return;
        lastResult = res;
        status.textContent = res.recognition ? 'Image analysis complete · '+res.reconstruction.walls.length+' walls · '+res.reconstruction.openings.length+' openings · '+res.reconstruction.rooms.filter(r=>r.name).length+' labels · '+res.reconstruction.items.length+' furniture/fixtures · scale: '+res.recognition.scale : res.cad ? res.floorplan.rooms.length + ' enclosed regions detected · review the draft below' : t("bp_found", { n: res.floorplan.rooms.length });
        widthIn.disabled = !!res.reviewed;
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
        if (closed || thisJob !== jobId) return;
        status.textContent = "";
        showError(err.kind ? err : { kind: "bad-json", message: err.message });
      });
  }
  btnParse.onclick = runParse;

  btnApply.onclick = function () {
    if (!lastResult) return;
    if (!generatedChangePermission(S, "document.import_blueprint").ok) { flash(t("redesign_protected"), "error"); return; }
    if (S.structLocked || S.layers?.structure?.locked || S.walls.some(w => w.locked) || S.items.some(i => i.locked) || S.wallCons?.length || S.roomCons?.length || S.slabOpenings?.length || S.markers?.length || (S.mep?.nodes || []).length || (S.mep?.runs || []).length) {
      status.textContent = 'This floor has protected geometry, constraints or services. Import into a new floor.'; return;
    }
    pushHistory();
    /* Newer/local parsers may return actual wall surface lines and arcs.  Keep
       the established room-box path as a fallback, but prefer analytic CAD
       conversion when supplied so thickness, curves and opening locations are
       not flattened into bounding rectangles. */
    var cad = lastResult.cadEntities || lastResult.cad;
    if (lastResult.reconstruction) {
      var graph = lastResult.reconstruction, offset = S.idc;
      S.nodes = graph.nodes.map(n=>({...n}));
      S.walls = graph.walls.map(w=>({...w,id:w.id+offset}));
      S.openings = graph.openings.map(o=>({...o,id:o.id+offset,wall:o.wall+offset}));
      S.items = graph.items.map(it=>({...it,id:it.id+offset}));
      S.planStyle = 'presentation';
      S.showDims = false; // Explicit recognized dimensions remain as annotations.
      var annotationId = offset+graph.nextId;
      S.annotations = graph.annotations.map(a=>({...a,id:annotationId++}));
      S.idc = annotationId;
      S.roomMeta = {};
      detectRooms().forEach(function (room,i) {
        var label = graph.rooms.find(r=>pointInPoly(r.seed.x,r.seed.z,room.pts));
        S.roomMeta[room.key] = {name:label?.name || 'Room '+(i+1),floor:label?.floor || 'wood',cx:room.cx,cz:room.cz};
      });
      graph.rooms.forEach(function(label){
        if(label.name&&!Object.values(S.roomMeta).some(r=>r.name===label.name))
          S.annotations.push({id:S.idc++,kind:'note',x:label.seed.x,z:label.seed.z,text:label.name});
      });
    } else if (cad && (cad.lines || cad.arcs)) {
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
      S.annotations = [];
      S.roomMeta = {};
      S.idc = converted.nextId;
      detectRooms().forEach(function (room, i) { S.roomMeta[room.key] = { name: 'Room ' + (i + 1), floor: 'wood' }; });
    } else {
      buildLayout(lastResult.layout, true);
    }
    S.sel = null;
    S.workSet = 'structure';
    if (S.layers?.structure) S.layers.structure.vis = 'show';
    window.dispatchEvent(new CustomEvent('layers:changed'));
    S.dirty3D = true;
    if (lastResult.sourceDataUrl) {
      var bounds = lastResult.bounds, size = lastResult.imageSize;
      var cmPerPx = lastResult.layout.w / (bounds.x1 - bounds.x0);
      setBlueprintReference({ version: 1, name: lastFile.name, dataUrl: lastResult.sourceDataUrl, width: size.width, height: size.height, cmPerPx, rotation: 0, originX: -bounds.x0 * cmPerPx, originZ: -bounds.y0 * cmPerPx, ...lastResult.referenceCalibration, opacity: .4, visible: false, sourceType: 'image' });
    }
    render2D();
    fitView();
    refreshTree(); fillProps();
    close();
    window.dispatchEvent(new Event('blueprint:converted'));
    flash(t("bp_applied"));
  };
}
