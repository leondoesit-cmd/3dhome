// Manual blueprint tracing workflow: rasterize an image/PDF locally, calibrate
// its scale from two picked points, then leave it under the normal wall tool.
import { S } from "./state.js";
import { t } from "./i18n.js";
import { flash } from "./ui.js";
import {
  calibrationScale,
  makeBlueprintReference,
  rasterizeBlueprint,
  setBlueprintReference,
} from "./blueprint_trace.js";

function el(tag, cls, text) {
  var node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
}

function closeOverlay(overlay) {
  if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
}

export function openBlueprintTraceModal() {
  var file = null;
  var raster = null;
  var points = [];

  var overlay = el("div", "bp-overlay");
  var modal = el("div", "bp-modal bp-trace-modal");
  overlay.appendChild(modal);

  var head = el("div", "bp-trace-head");
  var headText = el("div");
  headText.appendChild(el("h3", null, t("bp_trace_title")));
  headText.appendChild(el("p", null, t("bp_trace_intro")));
  head.appendChild(headText);
  var close = el("button", "bp-icon-btn");
  close.type = "button";
  close.title = t("cancel");
  close.innerHTML = '<i class="ph ph-x"></i>';
  head.appendChild(close);
  modal.appendChild(head);

  var drop = el("div", "bp-drop bp-trace-drop");
  drop.innerHTML = '<i class="ph ph-file-arrow-up"></i><div></div>';
  drop.querySelector("div").textContent = t("bp_trace_drop");
  modal.appendChild(drop);
  var fileInput = el("input");
  fileInput.type = "file";
  fileInput.accept = "image/png,image/jpeg,image/webp,application/pdf,.pdf";
  fileInput.hidden = true;
  modal.appendChild(fileInput);

  var pageRow = el("label", "bp-trace-page");
  pageRow.appendChild(el("span", null, t("bp_trace_page")));
  var pageInput = el("input");
  pageInput.type = "number";
  pageInput.min = "1";
  pageInput.value = "1";
  pageRow.appendChild(pageInput);
  pageRow.hidden = true;
  modal.appendChild(pageRow);

  var stage = el("div", "bp-cal-stage");
  var canvas = el("canvas", "bp-cal-canvas");
  stage.appendChild(canvas);
  var empty = el("div", "bp-cal-empty");
  empty.innerHTML = '<i class="ph ph-cursor-click"></i><span></span>';
  empty.querySelector("span").textContent = t("bp_trace_empty");
  stage.appendChild(empty);
  modal.appendChild(stage);

  var calibration = el("div", "bp-cal-panel");
  var instruction = el("div", "bp-cal-instruction");
  instruction.innerHTML = '<span class="bp-step">1</span><span></span>';
  calibration.appendChild(instruction);
  var fields = el("div", "bp-cal-fields");
  var distanceLabel = el("label");
  distanceLabel.appendChild(el("span", null, t("bp_trace_distance")));
  var distance = el("input");
  distance.type = "number";
  distance.min = "0.01";
  distance.step = "0.01";
  distance.value = "4";
  distanceLabel.appendChild(distance);
  distanceLabel.appendChild(el("span", null, t("bp_trace_meters")));
  fields.appendChild(distanceLabel);
  var straightenLabel = el("label", "bp-cal-check");
  var straighten = el("input");
  straighten.type = "checkbox";
  straighten.checked = true;
  straightenLabel.appendChild(straighten);
  straightenLabel.appendChild(el("span", null, t("bp_trace_straighten")));
  fields.appendChild(straightenLabel);
  var resetPoints = el("button", "bp-link-btn", t("bp_trace_pick_again"));
  resetPoints.type = "button";
  fields.appendChild(resetPoints);
  calibration.appendChild(fields);
  var scaleReadout = el("div", "bp-scale-readout");
  calibration.appendChild(scaleReadout);
  modal.appendChild(calibration);

  var footer = el("div", "bp-btnrow");
  var cancel = el("button", null, t("cancel"));
  var start = el("button", "btn-accent");
  start.innerHTML = '<i class="ph ph-wall"></i><span></span>';
  start.querySelector("span").textContent = t("bp_trace_start");
  start.disabled = true;
  footer.appendChild(cancel);
  footer.appendChild(start);
  modal.appendChild(footer);
  document.body.appendChild(overlay);

  function updateInstruction() {
    var step = instruction.querySelector(".bp-step");
    var text = instruction.querySelector("span:last-child");
    if (!raster) {
      step.textContent = "1";
      text.textContent = t("bp_trace_upload_step");
    } else if (points.length === 0) {
      step.textContent = "2";
      text.textContent = t("bp_trace_click_first");
    } else if (points.length === 1) {
      step.textContent = "2";
      text.textContent = t("bp_trace_click_second");
    } else {
      step.textContent = "3";
      text.textContent = t("bp_trace_enter_distance");
    }
    var cm = Number(distance.value) * 100;
    var scale = points.length === 2 ? calibrationScale(points[0], points[1], cm) : null;
    start.disabled = !raster || !scale;
    scaleReadout.textContent = scale
      ? t("bp_trace_scale", { px: scale.toFixed(3), w: Math.round(raster.width * scale), h: Math.round(raster.height * scale) })
      : "";
  }

  function paint() {
    empty.hidden = !!raster;
    canvas.hidden = !raster;
    if (!raster) {
      updateInstruction();
      return;
    }
    canvas.width = raster.width;
    canvas.height = raster.height;
    var ctx = canvas.getContext("2d");
    var img = new Image();
    img.onload = function () {
      ctx.drawImage(img, 0, 0, raster.width, raster.height);
      if (!points.length) return;
      ctx.save();
      ctx.lineWidth = Math.max(2, raster.width / 650);
      ctx.strokeStyle = "#e15a46";
      ctx.fillStyle = "rgba(225,90,70,.22)";
      if (points.length === 2) {
        ctx.setLineDash([12, 8]);
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        ctx.lineTo(points[1].x, points[1].y);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      points.forEach(function (p, i) {
        var r = Math.max(8, raster.width / 120);
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#e15a46";
        ctx.font = "700 " + Math.max(14, raster.width / 70) + "px sans-serif";
        ctx.fillText(String(i + 1), p.x + r + 4, p.y - r - 2);
      });
      ctx.restore();
    };
    img.src = raster.dataUrl;
    updateInstruction();
  }

  async function readFile(nextFile, page) {
    if (!nextFile) return;
    file = nextFile;
    points = [];
    start.disabled = true;
    empty.hidden = false;
    canvas.hidden = true;
    empty.querySelector("span").textContent = t("bp_trace_loading");
    try {
      raster = await rasterizeBlueprint(file, { page: page || 1 });
      drop.querySelector("div").textContent = file.name;
      pageInput.max = String(raster.pageCount || 1);
      pageInput.value = String(raster.page || 1);
      pageRow.hidden = !(raster.pageCount > 1);
      paint();
    } catch (err) {
      raster = null;
      empty.hidden = false;
      empty.querySelector("span").textContent = err && err.message ? err.message : t("bp_trace_decode");
      updateInstruction();
    }
  }

  function useExisting() {
    var ref = S.blueprintTrace;
    if (!ref || !ref.dataUrl) return;
    raster = {
      dataUrl: ref.dataUrl,
      width: ref.width,
      height: ref.height,
      sourceType: ref.sourceType,
      page: ref.page || 1,
      pageCount: 1,
    };
    file = { name: ref.name || t("bp_trace_sheet") };
    drop.querySelector("div").textContent = file.name;
    if (ref.calibration) {
      points = [ref.calibration.p1, ref.calibration.p2];
      distance.value = String((ref.calibration.distanceCm || 400) / 100);
      straighten.checked = Math.abs(ref.rotation || 0) > 1e-6;
    }
    paint();
  }

  drop.addEventListener("click", function () { fileInput.click(); });
  fileInput.addEventListener("change", function () { readFile(fileInput.files[0], 1); });
  drop.addEventListener("dragover", function (e) { e.preventDefault(); drop.classList.add("over"); });
  drop.addEventListener("dragleave", function () { drop.classList.remove("over"); });
  drop.addEventListener("drop", function (e) {
    e.preventDefault();
    drop.classList.remove("over");
    readFile(e.dataTransfer.files[0], 1);
  });
  pageInput.addEventListener("change", function () {
    if (file && file.arrayBuffer) readFile(file, Number(pageInput.value) || 1);
  });
  canvas.addEventListener("click", function (e) {
    if (!raster) return;
    var rect = canvas.getBoundingClientRect();
    var p = {
      x: (e.clientX - rect.left) * raster.width / rect.width,
      y: (e.clientY - rect.top) * raster.height / rect.height,
    };
    if (points.length >= 2) points = [];
    points.push(p);
    paint();
  });
  distance.addEventListener("input", updateInstruction);
  straighten.addEventListener("change", updateInstruction);
  resetPoints.addEventListener("click", function () { points = []; paint(); });
  [close, cancel].forEach(function (button) {
    button.addEventListener("click", function () { closeOverlay(overlay); });
  });
  overlay.addEventListener("click", function (e) {
    if (e.target === overlay) closeOverlay(overlay);
  });
  start.addEventListener("click", function () {
    if (!raster || points.length !== 2) return;
    try {
      var ref = makeBlueprintReference(
        raster,
        points[0],
        points[1],
        Number(distance.value) * 100,
        straighten.checked,
        file && file.name,
      );
      setBlueprintReference(ref);
      closeOverlay(overlay);
      window.dispatchEvent(new CustomEvent("blueprint:trace-walls"));
      flash(t("bp_trace_ready"), "success");
    } catch (err) {
      scaleReadout.textContent = err.message || t("bp_trace_cal_error");
    }
  });

  useExisting();
  updateInstruction();
}
