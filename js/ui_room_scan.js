/* Mobile LiDAR / AR room-scan flow.

   - WebXR devices: aim at each floor/wall corner and capture a measured loop.
   - iPhone/iPad RoomPlan: import a CapturedRoom JSON export. Safari does not
     expose RoomPlan/LiDAR to web pages, so that bridge is explicit in the UI.
 */
import { S } from "./state.js";
import { t } from "./i18n.js";
import { pushHistory } from "./history.js";
import { render2D, fitView } from "./plan2d.js";
import { detectRooms, contentBounds } from "./geometry.js";
import { convertCadToWalls } from "./cad_to_walls.js";
import {
  parseRoomScan, roomScanFromPoints, scanBounds, scaleScan, longestScanEdge,
  offsetScan, insetScan, roomScanArIssue, roomScanArStartIssue,
  appendRoomScanPoint,
} from "./room_scan.js";
import { flash } from "./ui.js";

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
}

function pointToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

function formatCm(value) {
  return value >= 100 ? (value / 100).toFixed(value >= 1000 ? 1 : 2) + " m" : Math.round(value) + " cm";
}

function drawPreview(canvas, result, pickedIndex) {
  const lines = result.cad.lines, bounds = scanBounds(result);
  const W = Math.min(520, Math.max(300, window.innerWidth - 64)), H = 310, pad = 38;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = W * dpr; canvas.height = H * dpr;
  canvas.style.width = W + "px"; canvas.style.height = H + "px";
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  const scale = Math.min((W - pad * 2) / Math.max(1, bounds.width), (H - pad * 2) / Math.max(1, bounds.depth));
  const ox = (W - bounds.width * scale) / 2 - bounds.minX * scale;
  const oz = (H - bounds.depth * scale) / 2 - bounds.minZ * scale;
  const pt = (p) => ({ x: ox + p.x * scale, y: oz + p.z * scale });
  // hit-testing the click that picks the measured wall needs this mapping
  canvas._scanView = { ox, oz, scale };

  ctx.fillStyle = "rgba(79, 70, 229, .08)";
  ctx.beginPath();
  lines.forEach((line, i) => {
    const p = pt(line.a);
    if (!i) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
  });
  ctx.closePath(); ctx.fill();
  lines.forEach((line, i) => {
    const a = pt(line.a), b = pt(line.b), len = Math.hypot(line.b.x - line.a.x, line.b.z - line.a.z);
    const picked = i === pickedIndex;
    ctx.strokeStyle = picked ? "#e11d48" : "#4f46e5";
    ctx.lineWidth = Math.max(picked ? 5 : 3, Math.min(9, line.thickness * scale));
    ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(a.x, a.y, 4, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = picked ? "#e11d48" : "#4f46e5"; ctx.lineWidth = 2; ctx.stroke();
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    ctx.font = "600 11px Inter, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    const label = formatCm(len), tw = ctx.measureText(label).width + 10;
    ctx.fillStyle = picked ? "rgba(255,228,232,.96)" : "rgba(255,255,255,.92)";
    ctx.fillRect(mx - tw / 2, my - 9, tw, 18);
    ctx.fillStyle = picked ? "#9f1239" : "#34314b"; ctx.fillText(label, mx, my);
  });
  result.cad.doors.concat(result.cad.windows).forEach((op) => {
    const p = pt(op.center);
    ctx.fillStyle = op.type === "window" ? "#0ea5e9" : "#f59e0b";
    ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, Math.PI * 2); ctx.fill();
  });
}

function isAppleMobile() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

async function arCapability() {
  const environment = {
    secureContext: window.isSecureContext !== false,
    appleMobile: isAppleMobile(),
    xrApi: !!(navigator.xr && navigator.xr.isSessionSupported),
  };
  let issue = roomScanArIssue(environment);
  if (issue) return { supported: false, issue };
  try {
    environment.sessionSupported = await navigator.xr.isSessionSupported("immersive-ar");
    issue = roomScanArIssue(environment);
    return { supported: !issue, issue };
  } catch (error) {
    return { supported: false, issue: "unsupported" };
  }
}

function capabilityMessage(issue) {
  if (issue === "insecure") return "rs_ar_insecure";
  if (issue === "apple-mobile") return "rs_ar_apple";
  if (issue === "no-webxr") return "rs_ar_no_webxr";
  return "rs_ar_unsupported";
}

function startErrorMessage(error) {
  const issue = roomScanArStartIssue(error);
  if (issue === "permission") return "rs_ar_permission";
  if (issue === "insecure") return "rs_ar_insecure";
  if (issue === "unsupported") return "rs_ar_unsupported";
  return "rs_ar_failed";
}

export function openRoomScanModal() {
  let result = null, xrSession = null, hitSource = null, latestPoint = null, points = [];
  /* Which wall the tape reading belongs to. Defaults to the longest edge, but
     the longest wall is often the one you cannot reach with a tape — so the
     preview lets you pick the one you actually measured. */
  let calIndex = -1;
  // AR corners are tapped on the INSIDE face; RoomPlan fits a plane to the
  // visible face too, so both may need pushing out to a centre-line.
  let faceMode = "centre";
  const overlay = el("div", "bp-overlay roomscan-overlay");
  const modal = el("div", "bp-modal roomscan-modal");
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-labelledby", "roomscan-title");
  overlay.appendChild(modal);

  const head = el("div", "roomscan-head");
  const icon = el("div", "roomscan-head-icon"); icon.innerHTML = '<i class="ph ph-scan"></i>';
  const headCopy = el("div");
  const title = el("h3", null, t("rs_title")); title.id = "roomscan-title";
  headCopy.appendChild(title);
  headCopy.appendChild(el("p", null, t("rs_intro")));
  head.append(icon, headCopy);

  const capability = el("div", "roomscan-capability pending");
  capability.innerHTML = '<i class="ph ph-circle-notch"></i><span>' + t("rs_checking") + "</span>";

  const choices = el("div", "roomscan-choices");
  const arCard = el("button", "roomscan-choice");
  arCard.type = "button"; arCard.disabled = true;
  arCard.innerHTML = '<i class="ph ph-cube-focus"></i><span><strong>' + t("rs_ar_title") + "</strong><small>" + t("rs_ar_desc") + "</small></span>";
  const importCard = el("button", "roomscan-choice");
  importCard.type = "button";
  importCard.innerHTML = '<i class="ph ph-upload-simple"></i><span><strong>' + t("rs_import_title") + "</strong><small>" + t("rs_import_desc") + "</small></span>";
  choices.append(arCard, importCard);

  const help = el("button", "roomscan-help");
  help.type = "button";
  help.innerHTML = '<i class="ph ph-question"></i><span>' + t("rs_tutorial_open") + "</span>";

  const tutorial = el("section", "roomscan-tutorial");
  tutorial.hidden = true;
  tutorial.setAttribute("aria-label", t("rs_tutorial_title"));
  tutorial.innerHTML =
    '<div class="roomscan-tutorial-head"><i class="ph ph-device-mobile-camera"></i><div><strong>' + t("rs_tutorial_title") + "</strong><small>" + t("rs_tutorial_intro") + "</small></div></div>" +
    '<ol class="roomscan-steps">' +
    '<li><span>1</span><div><strong>' + t("rs_tutorial_1_t") + "</strong><small>" + t("rs_tutorial_1_b") + "</small></div></li>" +
    '<li><span>2</span><div><strong>' + t("rs_tutorial_2_t") + "</strong><small>" + t("rs_tutorial_2_b") + "</small></div></li>" +
    '<li><span>3</span><div><strong>' + t("rs_tutorial_3_t") + "</strong><small>" + t("rs_tutorial_3_b") + "</small></div></li>" +
    '<li><span>4</span><div><strong>' + t("rs_tutorial_4_t") + "</strong><small>" + t("rs_tutorial_4_b") + "</small></div></li>" +
    "</ol>" +
    '<div class="roomscan-tutorial-actions"><button type="button" data-tutorial="back">' + t("back") + '</button><button type="button" class="btn-accent" data-tutorial="start" disabled><i class="ph ph-camera"></i><span>' + t("rs_start_camera") + "</span></button></div>";
  const tutorialStart = tutorial.querySelector('[data-tutorial="start"]');

  const iosNote = el("div", "roomscan-note");
  iosNote.innerHTML = '<i class="ph ph-info"></i><span>' + t("rs_ios_note") + "</span>";
  const fileInput = el("input"); fileInput.type = "file"; fileInput.accept = ".json,.roomplan,application/json"; fileInput.hidden = true;
  const status = el("div", "bp-status roomscan-status"); status.setAttribute("role", "status");
  const previewWrap = el("div", "roomscan-preview-wrap"); previewWrap.hidden = true;
  const summary = el("div", "roomscan-summary");
  const preview = el("canvas", "bp-preview roomscan-preview");
  const cal = el("div", "roomscan-cal"); cal.hidden = true;
  cal.innerHTML =
    "<label><span>" + t("rs_laser_len") + '</span><input type="number" min="1" step="0.1" id="rs_laser_cm"></label>' +
    '<small class="roomscan-edge" id="rs_edge_note"></small>' +
    "<small>" + t("rs_laser_hint") + "</small>" +
    "<fieldset><legend>" + t("rs_face") + "</legend>" +
    '<label class="roomscan-mode"><input type="radio" name="rs_face" value="centre" checked><span>' + t("rs_face_centre") + "</span></label>" +
    '<label class="roomscan-mode"><input type="radio" name="rs_face" value="inside"><span>' + t("rs_face_inside") + "</span></label>" +
    "</fieldset>" +
    "<fieldset><legend>" + t("rs_mode") + "</legend>" +
    '<label class="roomscan-mode"><input type="radio" name="rs_mode" value="replace"><span>' + t("rs_replace") + "</span></label>" +
    '<label class="roomscan-mode"><input type="radio" name="rs_mode" value="merge"><span>' + t("rs_merge") + "</span></label>" +
    "</fieldset>";
  previewWrap.append(summary, preview, cal);

  const foot = el("div", "bp-btnrow roomscan-actions");
  const cancel = el("button", null, t("cancel")); cancel.type = "button";
  const apply = el("button", "btn-accent", t("rs_apply")); apply.type = "button"; apply.style.display = "none";
  foot.append(cancel, apply);
  modal.append(head, capability, help, choices, tutorial, iosNote, fileInput, status, previewWrap, foot);
  document.body.appendChild(overlay);

  function showTutorial() {
    choices.hidden = true;
    iosNote.hidden = true;
    tutorial.hidden = false;
    help.hidden = true;
    status.textContent = "";
  }

  function hideTutorial() {
    tutorial.hidden = true;
    choices.hidden = false;
    iosNote.hidden = false;
    help.hidden = false;
  }

  help.onclick = showTutorial;
  tutorial.querySelector('[data-tutorial="back"]').onclick = hideTutorial;

  function close() {
    if (xrSession) xrSession.end().catch(() => {});
    if (overlay.parentElement) overlay.parentElement.removeChild(overlay);
  }
  cancel.onclick = close;
  overlay.addEventListener("click", (event) => { if (event.target === overlay && !xrSession) close(); });

  function edgeAt(index) {
    const lines = (result && result.cad && result.cad.lines) || [];
    const line = lines[index];
    if (!line) return null;
    return { a: line.a, b: line.b, length: Math.hypot(line.b.x - line.a.x, line.b.z - line.a.z) };
  }

  function calEdge() {
    return edgeAt(calIndex) || longestScanEdge(result);
  }

  /* Preview with the tape reading and the chosen face applied, so the numbers
     on screen are the numbers that will be committed. */
  function previewCopy() {
    const copy = JSON.parse(JSON.stringify(result));
    /* Calibrate on the geometry the tape was actually read against — the wall
       FACES — and only then move out to centre-lines. Insetting first makes
       the tape reading cancel the offset instead of correcting the drift. */
    const laser = cal.querySelector("#rs_laser_cm");
    const known = parseFloat(laser && laser.value);
    const line = copy.cad.lines[calIndex];
    if (known > 0.5) scaleScan(copy, known, line ? line.a : null, line ? line.b : null);
    if (faceMode === "inside") insetScan(copy, 1);
    return copy;
  }

  function repaint() {
    try { drawPreview(preview, previewCopy(), calIndex); }
    catch (e) { drawPreview(preview, result, calIndex); }
    const note = cal.querySelector("#rs_edge_note");
    const edge = calEdge();
    if (note) {
      note.textContent = calIndex >= 0 && edge
        ? t("rs_edge_selected", { len: formatCm(edge.length) })
        : t("rs_pick_edge");
    }
  }

  function showResult(next) {
    result = next;
    choices.hidden = true; tutorial.hidden = true; help.hidden = true;
    iosNote.hidden = true; capability.hidden = true;
    previewWrap.hidden = false; apply.style.display = "";
    summary.innerHTML = '<strong>' + next.source + "</strong><span>" +
      t("rs_found", { walls: next.wallCount, openings: next.openingCount }) + "</span>";
    cal.hidden = false;
    // start on the longest edge, which is the best guess, not the only choice
    const longest = longestScanEdge(next);
    calIndex = (next.cad.lines || []).findIndex((l) => longest && l.a === longest.a && l.b === longest.b);
    // AR corners are floor taps on the inside face; an imported scan is not
    faceMode = next.source === "WebXR AR" ? "inside" : "centre";
    const faceInput = cal.querySelector('input[name="rs_face"][value="' + faceMode + '"]');
    if (faceInput) faceInput.checked = true;
    // replacing a furnished plan is destructive, so it is never the default
    const wantMerge = !!(S.walls && S.walls.length);
    const modeInput = cal.querySelector('input[name="rs_mode"][value="' + (wantMerge ? "merge" : "replace") + '"]');
    if (modeInput) modeInput.checked = true;

    const laser = cal.querySelector("#rs_laser_cm");
    try { laser.value = Math.round(longest.length); }
    catch (e) { laser.value = ""; }
    laser.oninput = repaint;
    cal.querySelectorAll('input[name="rs_face"]').forEach((input) => {
      input.onchange = () => {
        faceMode = input.value;
        // the tape reading is a face-to-face measurement, so re-seed it
        const edge = calEdge();
        if (edge) laser.value = Math.round(edge.length);
        repaint();
      };
    });
    preview.style.cursor = "crosshair";
    preview.onclick = (event) => {
      const view = preview._scanView;
      if (!view) return;
      const box = preview.getBoundingClientRect();
      const px = event.clientX - box.left, py = event.clientY - box.top;
      let best = -1, bestD = 18;
      (result.cad.lines || []).forEach((line, i) => {
        const ax = view.ox + line.a.x * view.scale, ay = view.oz + line.a.z * view.scale;
        const bx = view.ox + line.b.x * view.scale, by = view.oz + line.b.z * view.scale;
        const d = pointToSegment(px, py, ax, ay, bx, by);
        if (d < bestD) { bestD = d; best = i; }
      });
      if (best < 0) return;
      calIndex = best;
      const edge = edgeAt(best);
      if (edge) laser.value = Math.round(edge.length);
      repaint();
    };
    repaint();
    status.textContent = t("rs_review");
  }

  importCard.onclick = () => fileInput.click();
  fileInput.onchange = async () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;
    status.textContent = t("rs_reading");
    try { showResult(parseRoomScan(await file.text())); }
    catch (error) { status.textContent = t(error.kind === "no-walls" ? "rs_no_walls" : "rs_bad_file"); }
  };

  async function startAR() {
    const stage = el("div", "roomscan-ar-stage");
    stage.setAttribute("role", "application");
    stage.setAttribute("aria-label", t("rs_ar_live"));
    stage.innerHTML =
      '<canvas class="roomscan-xr-canvas"></canvas>' +
      '<div class="roomscan-ar-top"><div><b>' + t("rs_ar_live") + '</b><span class="roomscan-count">' + t("rs_corners", { n: 0 }) + '</span></div><button type="button" data-xr="help" aria-label="' + t("rs_tutorial_open") + '"><i class="ph ph-question"></i></button></div>' +
      '<div class="roomscan-reticle"><i class="ph ph-crosshair"></i></div>' +
      '<div class="roomscan-ar-hint" role="status">' + t("rs_find_floor") + "</div>" +
      '<div class="roomscan-ar-coach" hidden><strong>' + t("rs_coach_title") + '</strong><ol><li>' + t("rs_coach_1") + '</li><li>' + t("rs_coach_2") + '</li><li>' + t("rs_coach_3") + '</li></ol><button type="button" data-xr="coach-close">' + t("rs_got_it") + "</button></div>" +
      '<div class="roomscan-ar-actions"><button type="button" data-xr="cancel" aria-label="' + t("cancel") + '"><i class="ph ph-x"></i></button>' +
      '<button type="button" data-xr="undo" aria-label="' + t("undo") + '" disabled><i class="ph ph-arrow-counter-clockwise"></i></button>' +
      '<button type="button" class="roomscan-capture" data-xr="capture" disabled><i class="ph ph-plus"></i><span>' + t("rs_add_corner") + "</span></button>" +
      '<button type="button" data-xr="finish" aria-label="' + t("rs_finish") + '" disabled><i class="ph ph-check"></i></button></div>';
    overlay.appendChild(stage);
    const canvas = stage.querySelector("canvas");
    const gl = canvas.getContext("webgl", { xrCompatible: true, alpha: true, antialias: true });
    if (!gl) { stage.remove(); status.textContent = t("rs_ar_failed"); return; }
    try {
      xrSession = await navigator.xr.requestSession("immersive-ar", {
        /* The controls are HTML. Requiring DOM overlay prevents a misleading
           "supported" session that opens the camera but hides every capture
           button on browsers that cannot present DOM inside immersive AR. */
        requiredFeatures: ["hit-test", "dom-overlay"],
        optionalFeatures: ["local-floor"],
        domOverlay: { root: stage },
      });
      if (gl.makeXRCompatible) await gl.makeXRCompatible();
      xrSession.updateRenderState({ baseLayer: new window.XRWebGLLayer(xrSession, gl) });
      const refSpace = await xrSession.requestReferenceSpace("local-floor").catch(() => xrSession.requestReferenceSpace("local"));
      const viewer = await xrSession.requestReferenceSpace("viewer");
      hitSource = await xrSession.requestHitTestSource({ space: viewer });
      const capture = stage.querySelector('[data-xr="capture"]');
      const undo = stage.querySelector('[data-xr="undo"]');
      const finish = stage.querySelector('[data-xr="finish"]');
      const count = stage.querySelector(".roomscan-count");
      const reticle = stage.querySelector(".roomscan-reticle");
      const hint = stage.querySelector(".roomscan-ar-hint");
      const coach = stage.querySelector(".roomscan-ar-coach");
      let hintKey = "";
      let hintHoldUntil = 0;
      const setHint = (key, holdMs = 0) => {
        if (hintKey === key) return;
        hintKey = key;
        hint.textContent = t(key);
        if (holdMs) hintHoldUntil = performance.now() + holdMs;
      };
      stage.querySelector('[data-xr="help"]').onclick = () => { coach.hidden = false; };
      stage.querySelector('[data-xr="coach-close"]').onclick = () => { coach.hidden = true; };
      const frame = (time, xrFrame) => {
        if (!xrSession) return;
        const layer = xrSession.renderState.baseLayer;
        gl.bindFramebuffer(gl.FRAMEBUFFER, layer.framebuffer);
        gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        const hit = xrFrame.getHitTestResults(hitSource)[0];
        const pose = hit && hit.getPose(refSpace);
        latestPoint = pose ? { x: pose.transform.position.x * 100, z: pose.transform.position.z * 100 } : null;
        capture.disabled = !latestPoint;
        reticle.classList.toggle("locked", !!latestPoint);
        if (performance.now() >= hintHoldUntil)
          setHint(latestPoint ? (points.length ? "rs_aim_next" : "rs_surface_ready") : "rs_find_floor");
        xrSession.requestAnimationFrame(frame);
      };
      xrSession.requestAnimationFrame(frame);
      capture.onclick = () => {
        if (!latestPoint) return;
        if (!appendRoomScanPoint(points, latestPoint)) {
          setHint("rs_corner_too_close", 1800);
          if (navigator.vibrate) navigator.vibrate([30, 35, 30]);
          return;
        }
        count.textContent = t("rs_corners", { n: points.length });
        undo.disabled = false;
        finish.disabled = points.length < 3;
        setHint("rs_move_next", 1000);
        if (navigator.vibrate) navigator.vibrate(18);
      };
      undo.onclick = () => {
        if (!points.length) return;
        points.pop();
        count.textContent = t("rs_corners", { n: points.length });
        undo.disabled = points.length === 0;
        finish.disabled = points.length < 3;
        setHint(points.length ? "rs_aim_next" : "rs_surface_ready");
        if (navigator.vibrate) navigator.vibrate(12);
      };
      finish.onclick = async () => {
        try {
          const next = roomScanFromPoints(points);
          await xrSession.end();
          showResult(next);
        } catch (error) {
          setHint("rs_need_three", 1800);
        }
      };
      stage.querySelector('[data-xr="cancel"]').onclick = () => xrSession.end();
      xrSession.addEventListener("end", () => {
        if (hitSource && hitSource.cancel) hitSource.cancel();
        xrSession = null; hitSource = null; latestPoint = null;
        if (stage.parentElement) stage.remove();
      });
    } catch (error) {
      xrSession = null;
      if (stage.parentElement) stage.remove();
      status.textContent = t(startErrorMessage(error));
    }
  }
  arCard.onclick = showTutorial;
  tutorialStart.onclick = startAR;

  apply.onclick = () => {
    if (!result) return;
    const merge = cal.querySelector('input[name="rs_mode"]:checked');
    const addBeside = merge && merge.value === "merge" && S.walls.length;
    /* Replace throws away the furniture, points, voids and room names as well
       as the walls. Undo covers it, but it should never be a surprise. */
    if (!addBeside && (S.walls.length || (S.items && S.items.length))) {
      const counts = {
        walls: S.walls.length,
        items: (S.items || []).length,
      };
      if (!window.confirm(t("rs_replace_confirm", counts))) return;
    }
    let next;
    try { next = previewCopy(); }
    catch (error) {
      status.textContent = t(error && error.kind === "bad-scale" ? "rs_laser_hint" : "rs_no_walls");
      return;
    }
    if (addBeside) {
      const bb = contentBounds();
      const sb = scanBounds(next);
      offsetScan(next, bb.maxx + 120 - sb.minX, bb.minz - sb.minZ);
    }
    /* Each scanned wall carries its own measured height; cad_to_walls keeps it
       and falls back to this only for a line that never had one. */
    const fallbackHeight = next.cad.lines.reduce((sum, line) => sum + (line.height || 270), 0) / next.cad.lines.length;
    const converted = convertCadToWalls(next.cad, {
      singleLineWalls: true, defaultThickness: 10, height: fallbackHeight,
      nodeTolerance: 18, openingTolerance: 45, firstId: S.idc,
    });
    if (converted.walls.length < 3) { status.textContent = t("rs_no_walls"); return; }
    pushHistory();
    if (addBeside) {
      const nodeOff = S.nodes.length;
      converted.nodes.forEach((n) => S.nodes.push(n));
      converted.walls.forEach((w) => { w.a += nodeOff; w.b += nodeOff; S.walls.push(w); });
      converted.openings.forEach((o) => S.openings.push(o));
    } else {
      S.nodes = converted.nodes; S.walls = converted.walls; S.openings = converted.openings;
      S.items = []; S.markers = []; S.slabOpenings = []; S.roomMeta = {};
    }
    S.idc = converted.nextId; S.sel = null;
    detectRooms().forEach((room, i) => {
      if (!S.roomMeta[room.key]) S.roomMeta[room.key] = { name: t("rs_room_name", { n: i + 1 }), floor: "wood" };
    });
    S.dirty3D = true;
    render2D(); fitView(); close(); flash(t(addBeside ? "rs_applied_merge" : "rs_applied"), "success");
  };

  arCapability().then(({ supported, issue }) => {
    if (!overlay.parentElement) return;
    arCard.disabled = !supported;
    tutorialStart.disabled = !supported;
    capability.className = "roomscan-capability " + (supported ? "ready" : "limited");
    capability.innerHTML = '<i class="ph ' + (supported ? "ph-check-circle" : "ph-device-mobile") + '"></i><span>' +
      t(supported ? "rs_ar_ready" : capabilityMessage(issue)) + "</span>";
  });
}
