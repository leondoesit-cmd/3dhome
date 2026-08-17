// Photo mode: progressive path-traced rendering of the current 3D view in a worker pool.
// Keeps the live camera framing by default and renders up to 1440p with an
// edge-aware A-trous denoiser guided by first-hit albedo/normal buffers.
import { has3D, extractPTScene } from "./view3d.js";
import { t } from "./i18n.js";

var RES = {
  360: { h: 360, label: "p_qdraft" },
  720: { h: 720, label: "p_qnormal" },
  1080: { h: 1080, label: "p_qhigh" },
  1440: { h: 1440, label: "p_qultra" },
};
var DN_EVERY = 20; // run the denoiser every N passes (and once at completion)
var DN_REF = 30; // spp at which denoise runs at full strength; it fades above this so converged frames stay sharp
var RAW_MS = 350; // min interval between raw full repaints while rendering

var overlay = null,
  canvas = null,
  ctx = null,
  img = null,
  qSel = null,
  aspectSel = null,
  progEl = null,
  dnEl = null,
  dnVal = null,
  sppEl = null,
  sppVal = null,
  exEl = null,
  exVal = null,
  hintEl = null,
  renderBtn = null;
var workers = [],
  running = false,
  W = 0,
  H = 0,
  exposure = 1,
  targetSpp = 0,
  startT = 0,
  bandPass = {},
  doneCount = 0;
var hdr = null,
  alb = null,
  nrm = null,
  lastDN = 0,
  dnBusy = false,
  rawLast = 0;

function el(tag, attrs, txt) {
  var e = document.createElement(tag);
  for (var k in attrs) e.setAttribute(k, attrs[k]);
  if (txt) e.textContent = txt;
  return e;
}

function buildOverlay() {
  overlay = el("div", { id: "photoOverlay" });
  var bar = el("div", { id: "photoBar" });
  bar.appendChild(el("b", {}, t("p_title")));
  var lab = el("label", {}, t("p_res"));
  qSel = el("select", { id: "photoQ" });
  for (var k in RES) {
    var o = el("option", { value: k }, t(RES[k].label));
    if (k === "1080") o.selected = true;
    qSel.appendChild(o);
  }
  lab.appendChild(qSel);
  bar.appendChild(lab);
  var alab = el("label", {}, t("p_aspect"));
  aspectSel = el("select", { id: "photoAspect" });
  [
    ["view", "p_aspectView"],
    ["1.7777777778", "p_aspectWide"],
    ["1.3333333333", "p_aspectClassic"],
    ["1", "p_aspectSquare"],
  ].forEach(function (entry) {
    aspectSel.appendChild(el("option", { value: entry[0] }, t(entry[1])));
  });
  alab.appendChild(aspectSel);
  bar.appendChild(alab);
  var slab = el("label", {}, t("p_sppl"));
  sppEl = el("input", {
    type: "range",
    id: "photoSpp",
    min: "20",
    max: "600",
    step: "20",
    value: "120",
  });
  sppVal = el("span", { id: "photoSppVal" }, "120");
  slab.appendChild(sppEl);
  slab.appendChild(sppVal);
  bar.appendChild(slab);
  var dlab = el("label", {}, t("p_denoise"));
  dnEl = el("input", {
    type: "range",
    id: "photoDN",
    min: "0",
    max: "100",
    step: "10",
    value: "40",
  });
  dnVal = el("span", { id: "photoDNVal" }, "40%");
  dlab.appendChild(dnEl);
  dlab.appendChild(dnVal);
  bar.appendChild(dlab);
  var xlab = el("label", {}, t("p_bright"));
  exEl = el("input", {
    type: "range",
    id: "photoEx",
    min: "20",
    max: "250",
    step: "5",
    value: "100",
  });
  exVal = el("span", { id: "photoExVal" }, "100%");
  xlab.appendChild(exEl);
  xlab.appendChild(exVal);
  bar.appendChild(xlab);
  progEl = el("span", { id: "photoProg" }, "");
  bar.appendChild(progEl);
  var bR = el("button", { id: "photoRender" }, t("p_render")),
    bS = el("button", {}, t("p_savePng")),
    bC = el("button", {}, t("p_close"));
  renderBtn = bR;
  bar.appendChild(bR);
  bar.appendChild(bS);
  bar.appendChild(bC);
  overlay.appendChild(bar);
  var wrap = el("div", { id: "photoCanvasWrap" });
  canvas = el("canvas", { id: "photoCanvas" });
  wrap.appendChild(canvas);
  hintEl = el("div", { id: "photoHint" }, t("p_hint"));
  wrap.appendChild(hintEl);
  overlay.appendChild(wrap);
  document.getElementById("view-3d").appendChild(overlay);
  // Settings are chosen up front: nothing renders until Render is pressed, and
  // changing a setting mid-render only takes effect on the next Render.
  sppEl.addEventListener("input", function () {
    sppVal.textContent = this.value;
  });
  exEl.addEventListener("input", function () {
    exVal.textContent = this.value + "%";
    paintAll(false); // brightness is a tone-map knob: re-tone, never re-trace
  });
  dnEl.addEventListener("input", function () {
    dnVal.textContent = this.value + "%";
  });
  dnEl.addEventListener("change", function () {
    paintAll(true); // re-tone the current frame with the new denoise amount
  });
  bR.addEventListener("click", start);
  bC.addEventListener("click", closePhotoMode);
  bS.addEventListener("click", function () {
    var a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = "home-photo.png";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  });
}

function stopWorkers() {
  workers.forEach(function (w) {
    try {
      w.postMessage({ type: "stop" });
    } catch (e) {}
    try {
      w.terminate();
    } catch (e) {}
  });
  workers = [];
  running = false;
}

/* user brightness multiplier over the scene exposure, 0.2..2.5 */
function brightness() {
  return exEl ? (parseInt(exEl.value, 10) || 100) / 100 : 1;
}

function aces(x) {
  x *= exposure * brightness();
  var r = (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14);
  return r < 0 ? 0 : r > 1 ? 1 : r;
}

/* tone map a row range from the given HDR buffer into the canvas */
function paintRows(src, y0, y1) {
  var G = 1 / 2.2;
  for (var y = y0; y < y1; y++) {
    var si = y * W * 3,
      di = y * W * 4;
    for (var x = 0; x < W; x++) {
      img.data[di] = (255 * Math.pow(aces(src[si]), G)) | 0;
      img.data[di + 1] = (255 * Math.pow(aces(src[si + 1]), G)) | 0;
      img.data[di + 2] = (255 * Math.pow(aces(src[si + 2]), G)) | 0;
      img.data[di + 3] = 255;
      si += 3;
      di += 4;
    }
  }
  ctx.putImageData(img, 0, 0, 0, y0, W, y1 - y0);
}

/* edge-aware A-trous filter over the full HDR buffer, guided by albedo + normal */
function denoise() {
  var n = W * H * 3,
    a = new Float32Array(hdr),
    b = new Float32Array(n);
  var KW = [1, 2, 1, 2, 4, 2, 1, 2, 1],
    steps = [1, 2, 4],
    s,
    y,
    x;
  for (s = 0; s < steps.length; s++) {
    var st = steps[s];
    for (y = 0; y < H; y++) {
      for (x = 0; x < W; x++) {
        var ci = (y * W + x) * 3;
        var n0x = nrm[ci],
          n0y = nrm[ci + 1],
          n0z = nrm[ci + 2];
        var sky0 = n0x * n0x + n0y * n0y + n0z * n0z < 0.5;
        var a0 = alb[ci],
          a1 = alb[ci + 1],
          a2 = alb[ci + 2];
        var c0 = a[ci],
          c1 = a[ci + 1],
          c2 = a[ci + 2];
        var sw = 0,
          sr = 0,
          sg = 0,
          sb = 0;
        for (var dy = -1; dy <= 1; dy++) {
          var yy = y + dy * st;
          if (yy < 0 || yy >= H) continue;
          for (var dx = -1; dx <= 1; dx++) {
            var xx = x + dx * st;
            if (xx < 0 || xx >= W) continue;
            var qi = (yy * W + xx) * 3;
            var w = KW[(dy + 1) * 3 + dx + 1];
            var qnx = nrm[qi],
              qny = nrm[qi + 1],
              qnz = nrm[qi + 2];
            var skyq = qnx * qnx + qny * qny + qnz * qnz < 0.5;
            if (sky0 !== skyq) {
              continue;
            } // hard edge between sky and geometry
            if (!sky0) {
              var nd = n0x * qnx + n0y * qny + n0z * qnz;
              if (nd < 0) nd = 0;
              nd *= nd;
              nd *= nd;
              nd *= nd;
              nd *= nd; // nd^16
              w *= nd;
            }
            var da =
              Math.abs(alb[qi] - a0) +
              Math.abs(alb[qi + 1] - a1) +
              Math.abs(alb[qi + 2] - a2);
            w *= Math.exp(-da * 9);
            var dc =
              Math.abs(a[qi] - c0) +
              Math.abs(a[qi + 1] - c1) +
              Math.abs(a[qi + 2] - c2);
            w *= Math.exp(-dc * 0.9);
            sw += w;
            sr += a[qi] * w;
            sg += a[qi + 1] * w;
            sb += a[qi + 2] * w;
          }
        }
        if (sw > 0) {
          b[ci] = sr / sw;
          b[ci + 1] = sg / sw;
          b[ci + 2] = sb / sw;
        } else {
          b[ci] = c0;
          b[ci + 1] = c1;
          b[ci + 2] = c2;
        }
      }
    }
    var t = a;
    a = b;
    b = t;
  }
  return a;
}

function minPass() {
  var m = 1e9;
  for (var k in bandPass) if (bandPass[k] < m) m = bandPass[k];
  return m === 1e9 ? 0 : m;
}

/* user-selected denoise strength, 0..1 */
function dnStrength() {
  return dnEl ? (parseInt(dnEl.value, 10) || 0) / 100 : 0;
}

/* how strongly to blend the denoised result over the raw HDR: the slider scaled
   by convergence, so denoise fades as samples accumulate (converged = sharp) */
function dnAmount() {
  var s = dnStrength();
  if (s <= 0) return 0;
  var mp = minPass();
  if (mp < 1) mp = 1;
  var conv = DN_REF / mp; // 1 at low spp, ->0 as the frame converges
  if (conv > 1) conv = 1;
  return s * conv;
}

function progressText() {
  var mp = minPass(),
    secs = ((performance.now() - startT) / 1000).toFixed(0);
  return running
    ? t("p_samples", { mp: mp, spp: targetSpp, s: secs })
    : t("p_done", { spp: targetSpp, s: secs });
}

/* full repaint; when denoiseWanted and the checkbox is on, run the filter (async so the UI can update) */
function paintAll(denoiseWanted) {
  if (!hdr) return;
  var amt = denoiseWanted ? dnAmount() : 0;
  if (amt > 0 && !dnBusy) {
    dnBusy = true;
    var keep = progEl.textContent;
    progEl.textContent = t("p_denoising", { keep: keep });
    setTimeout(function () {
      try {
        var f = denoise();
        if (amt < 1) {
          // blend back toward the raw image so hard-won detail survives
          var nn = W * H * 3;
          for (var i = 0; i < nn; i++) f[i] = hdr[i] + amt * (f[i] - hdr[i]);
        }
        paintRows(f, 0, H);
      } finally {
        dnBusy = false;
        progEl.textContent = progressText();
      }
    }, 16);
  } else {
    paintRows(hdr, 0, H);
    progEl.textContent = progressText();
  }
}

function start() {
  stopWorkers();
  var scene = extractPTScene();
  if (!scene) {
    progEl.textContent = t("f_no3d");
    return;
  }
  if (hintEl) hintEl.style.display = "none";
  canvas.style.display = "";
  if (renderBtn) renderBtn.textContent = t("p_restart");
  exposure = scene.exposure || 1;
  var q = RES[qSel.value] || RES["1080"];
  var aspect = parseFloat(aspectSel.value);
  if (!(aspect > 0)) aspect = scene.camera.aspect || 16 / 9;
  // Bad or stale layout values should never create an enormous canvas. This
  // still covers portrait through ultrawide viewports without changing framing.
  aspect = Math.max(0.4, Math.min(3, aspect));
  H = q.h;
  W = Math.max(1, Math.round(H * aspect));
  canvas.width = W;
  canvas.height = H;
  ctx = canvas.getContext("2d");
  img = ctx.createImageData(W, H);
  for (var i = 3; i < img.data.length; i += 4) img.data[i] = 255;
  ctx.putImageData(img, 0, 0);
  hdr = new Float32Array(W * H * 3);
  alb = new Float32Array(W * H * 3);
  nrm = new Float32Array(W * H * 3);
  targetSpp = parseInt(sppEl.value, 10) || 120;
  bandPass = {};
  doneCount = 0;
  lastDN = 0;
  dnBusy = false;
  rawLast = 0;
  startT = performance.now();
  running = true;
  progEl.textContent = t("p_prep");
  // one worker per available core; interleaved rows -> naturally load-balanced across cores
  var n = Math.max(2, Math.min(16, (navigator.hardwareConcurrency || 4) - 1));
  n = Math.min(n, H);
  function scatter(dst, src, y0, step, nRows) {
    for (var k = 0; k < nRows; k++)
      dst.set(
        src.subarray(k * W * 3, (k + 1) * W * 3),
        (y0 + k * step) * W * 3,
      );
  }
  for (var w = 0; w < n; w++) {
    var wk = new Worker("js/pt-worker.js");
    wk.onmessage = function (e) {
      var d = e.data;
      if (d.type === "pass") {
        scatter(
          hdr,
          new Float32Array(d.buf.buffer || d.buf),
          d.y0,
          d.step,
          d.nRows,
        );
        bandPass[d.y0] = d.pass;
        var mp = minPass();
        // rows are interleaved, so raw updates repaint the whole frame (throttled);
        // once denoising kicks in, the canvas only updates via denoised repaints
        if (dnStrength() === 0 || lastDN === 0) {
          var now = performance.now();
          if (now - rawLast > RAW_MS) {
            rawLast = now;
            paintRows(hdr, 0, H);
          }
        }
        progEl.textContent = progressText();
        if (dnStrength() > 0 && mp - lastDN >= DN_EVERY) {
          lastDN = mp;
          paintAll(true);
        }
      } else if (d.type === "aux") {
        scatter(
          alb,
          new Float32Array(d.alb.buffer || d.alb),
          d.y0,
          d.step,
          d.nRows,
        );
        scatter(
          nrm,
          new Float32Array(d.nrm.buffer || d.nrm),
          d.y0,
          d.step,
          d.nRows,
        );
      } else if (d.type === "done") {
        doneCount++;
        if (doneCount >= workers.length) {
          running = false;
          lastDN = targetSpp;
          paintAll(true);
        }
      } else if (d.type === "error") {
        progEl.textContent = t("p_errRender", { msg: d.message });
        running = false;
      }
    };
    wk.onerror = function (err) {
      progEl.textContent = t("p_errWorker", { msg: err.message || "" });
      running = false;
    };
    var nRows = Math.floor((H - 1 - w) / n) + 1;
    wk.postMessage({
      type: "start",
      scene: scene,
      W: W,
      H: H,
      y0: w,
      step: n,
      nRows: nRows,
      seed: 1234 + w * 7919,
      maxSpp: targetSpp,
    });
    workers.push(wk);
  }
}

export function openPhotoMode() {
  if (!has3D) return false;
  if (!overlay) buildOverlay();
  overlay.classList.add("on");
  // Open on the settings screen — path tracing is expensive, so the user picks
  // resolution / samples / brightness first and presses Render.
  stopWorkers();
  hdr = null;
  canvas.style.display = "none"; // no blank black frame on the settings screen
  if (hintEl) hintEl.style.display = "";
  if (renderBtn) renderBtn.textContent = t("p_render");
  progEl.textContent = t("p_ready");
  return true;
}
export function closePhotoMode() {
  stopWorkers();
  if (overlay) overlay.classList.remove("on");
}
export function isPhotoOpen() {
  return !!(overlay && overlay.classList.contains("on"));
}
