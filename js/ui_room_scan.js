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
  offsetScan, insetScan, squareScan, scanSelfIntersects, scanArea,
  scanOrthoAngle, hitPoseIsFloor, hitIsRaised,
  roomScanArIssue, roomScanArStartIssue, appendRoomScanPoint,
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
  // recognized furniture, drawn in its own footprint and facing
  (result.cad.objects || []).forEach((o) => {
    const p = pt(o.center);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate((o.rot || 0) * Math.PI / 180);
    const w = Math.max(4, o.w * scale), d = Math.max(4, o.d * scale);
    ctx.fillStyle = "rgba(16,185,129,.22)";
    ctx.strokeStyle = "#059669";
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.rect(-w / 2, -d / 2, w, d); ctx.fill(); ctx.stroke();
    ctx.restore();
  });
}

/* navigator.vibrate does not exist on iOS and plenty of Android tablets have
   no vibration motor, so on those devices the only sign a corner registered
   was a number changing in a corner of the screen nobody is looking at while
   aiming a phone at a skirting board. */
function scanTones() {
  let ctx = null;
  const play = (freq, ms, peak) => {
    try {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return;
      if (!ctx) ctx = new Ctor();
      if (ctx.state === "suspended") ctx.resume();
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      const now = ctx.currentTime;
      osc.type = "sine";
      osc.frequency.value = freq;
      // a square-edged start on a sine is an audible click, so ramp both ends
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(peak, now + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + ms / 1000);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(now); osc.stop(now + ms / 1000 + 0.02);
    } catch (e) { /* audio is a nicety; it must never break a capture */ }
  };
  return {
    corner: () => play(880, 90, 0.13),
    close: () => { play(880, 90, 0.13); setTimeout(() => play(1320, 160, 0.13), 95); },
    reject: () => play(220, 170, 0.1),
    stop: () => { try { if (ctx) ctx.close(); } catch (e) {} ctx = null; },
  };
}

/* Draw the loop captured so far straight into the camera view.  Without it the
   only feedback during a scan is a corner counter: the user cannot see which
   corners landed where, whether one drifted, or how far round the room they
   are, and mistakes only surface once the plan is built.  Deliberately tiny —
   points and lines, no depth buffer — so a driver that refuses the program can
   be dropped without taking the capture loop with it. */
function anchorRenderer(gl) {
  const compile = (type, src) => {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src); gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) || "shader");
    return sh;
  };
  const program = gl.createProgram();
  gl.attachShader(program, compile(gl.VERTEX_SHADER,
    "attribute vec3 aPos;uniform mat4 uProj;uniform mat4 uView;uniform float uSize;" +
    "void main(){gl_Position=uProj*uView*vec4(aPos,1.0);gl_PointSize=uSize;}"));
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER,
    "precision mediump float;uniform vec4 uColor;" +
    // round off the square GL point so a corner marker reads as a dot
    "void main(){vec2 d=gl_PointCoord-vec2(0.5);if(dot(d,d)>0.25)discard;gl_FragColor=uColor;}"));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || "link");
  const buffer = gl.createBuffer();
  const loc = {
    pos: gl.getAttribLocation(program, "aPos"),
    proj: gl.getUniformLocation(program, "uProj"),
    view: gl.getUniformLocation(program, "uView"),
    size: gl.getUniformLocation(program, "uSize"),
    color: gl.getUniformLocation(program, "uColor"),
  };
  const draw = function (view, anchors, live) {
    if (!anchors.length) return;
    const strip = [];
    anchors.forEach((p) => strip.push(p.x, p.y, p.z));
    const edges = [];
    for (let i = 1; i < anchors.length; i++)
      edges.push(anchors[i - 1].x, anchors[i - 1].y, anchors[i - 1].z, anchors[i].x, anchors[i].y, anchors[i].z);
    // the closing edge is a preview of what Finish would produce
    if (anchors.length > 2)
      edges.push(anchors[anchors.length - 1].x, anchors[anchors.length - 1].y, anchors[anchors.length - 1].z,
        anchors[0].x, anchors[0].y, anchors[0].z);
    const rubber = live
      ? [anchors[anchors.length - 1].x, anchors[anchors.length - 1].y, anchors[anchors.length - 1].z, live.x, live.y, live.z]
      : [];
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.enableVertexAttribArray(loc.pos);
    gl.vertexAttribPointer(loc.pos, 3, gl.FLOAT, false, 0, 0);
    gl.uniformMatrix4fv(loc.proj, false, view.projectionMatrix);
    gl.uniformMatrix4fv(loc.view, false, view.transform.inverse.matrix);
    // markers must stay visible against the camera feed, not be occluded by it
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    const send = (data, mode, color, size) => {
      if (!data.length) return;
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.DYNAMIC_DRAW);
      gl.uniform4fv(loc.color, color);
      gl.uniform1f(loc.size, size);
      gl.drawArrays(mode, 0, data.length / 3);
    };
    send(rubber, gl.LINES, [1, 1, 1, 0.45], 1);
    send(edges, gl.LINES, [0.31, 0.27, 0.9, 0.95], 1);
    send(strip, gl.POINTS, [0.29, 0.87, 0.5, 1], 15);
    // the first corner is the one you have to come back to; call it out
    send(strip.slice(0, 3), gl.POINTS, [1, 0.78, 0.15, 1], 19);
  };
  /* Each AR attempt builds its own canvas, context and program. The canvas is
     dropped on exit, but a browser only keeps so many live WebGL contexts and
     collects them when it feels like it, so scan-cancel-rescan could quietly
     spend the budget. Give the driver everything back explicitly. */
  draw.dispose = () => {
    try {
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      const lose = gl.getExtension && gl.getExtension("WEBGL_lose_context");
      if (lose) lose.loseContext();
    } catch (e) { /* the context may already be gone; nothing left to release */ }
  };
  return draw;
}

/* A phone held at a wall shows almost nothing of the room. The map is the only
   place the user can see the shape they are tracing while they trace it. */
function drawArMap(canvas, points, live, closing, viewer) {
  const size = 118, pad = 14;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  // assigning width/height reallocates the backing store even when the value
  // is unchanged, so at 20 Hz this was a new bitmap twenty times a second
  if (canvas.width !== size * dpr) { canvas.width = size * dpr; canvas.height = size * dpr; }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, size, size);
  const all = points.slice();
  if (live) all.push(live);
  // the user must stay on their own map, however far they have walked
  if (viewer) all.push(viewer);
  if (!all.length) return;
  const xs = all.map((p) => p.x), zs = all.map((p) => p.z);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minZ = Math.min(...zs), maxZ = Math.max(...zs);
  const span = Math.max(60, maxX - minX, maxZ - minZ);
  const k = (size - pad * 2) / span;
  const at = (p) => ({
    x: pad + (p.x - (minX + maxX) / 2) * k + (size - pad * 2) / 2,
    y: pad + (p.z - (minZ + maxZ) / 2) * k + (size - pad * 2) / 2,
  });
  if (points.length > 1) {
    ctx.beginPath();
    points.forEach((p, i) => { const q = at(p); if (!i) ctx.moveTo(q.x, q.y); else ctx.lineTo(q.x, q.y); });
    if (points.length > 2) { ctx.closePath(); ctx.fillStyle = "rgba(99,102,241,.22)"; ctx.fill(); }
    ctx.strokeStyle = "#818cf8"; ctx.lineWidth = 2; ctx.lineJoin = "round"; ctx.stroke();
  }
  if (live && points.length) {
    const a = at(points[points.length - 1]), b = at(live);
    ctx.setLineDash([4, 3]); ctx.strokeStyle = "rgba(255,255,255,.75)"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(b.x, b.y, 3, 0, Math.PI * 2); ctx.fill();
  }
  points.forEach((p, i) => {
    const q = at(p);
    // the first corner doubles as the target that closes the room
    ctx.fillStyle = i === 0 ? (closing ? "#4ade80" : "#fbbf24") : "#e0e7ff";
    ctx.beginPath(); ctx.arc(q.x, q.y, i === 0 ? 4.5 : 3, 0, Math.PI * 2); ctx.fill();
  });
  /* Which way am I facing, and where am I relative to where I started? In a
     large or L-shaped room that is the thing you lose first. */
  if (viewer) {
    const q = at(viewer), spread = 0.5, reach = 15;
    ctx.fillStyle = "rgba(96,165,250,.35)";
    ctx.beginPath();
    ctx.moveTo(q.x, q.y);
    ctx.arc(q.x, q.y, reach, viewer.heading - spread, viewer.heading + spread);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#60a5fa";
    ctx.beginPath(); ctx.arc(q.x, q.y, 3.5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,.9)"; ctx.lineWidth = 1.2; ctx.stroke();
  }
}

/* The camera looks down its own -Z, so its heading in the plan is that axis
   rotated by the pose and flattened. */
function viewerHeading(orientation) {
  if (!orientation) return 0;
  const { x, y, z, w } = orientation;
  const fx = -2 * (x * z + w * y);
  const fz = -(1 - 2 * (x * x + y * y));
  return Math.atan2(fz, fx);
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
  // the same corners in metres with their measured floor height, kept only so
  // the in-camera markers can be drawn where they were actually placed
  let anchors = [];
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
  const warnings = el("div", "roomscan-warnings"); warnings.hidden = true;
  const cal = el("div", "roomscan-cal"); cal.hidden = true;
  cal.innerHTML =
    "<label><span>" + t("rs_laser_len") + '</span><input type="number" min="1" step="0.1" id="rs_laser_cm"></label>' +
    '<small class="roomscan-edge" id="rs_edge_note"></small>' +
    "<small>" + t("rs_laser_hint") + "</small>" +
    '<label class="roomscan-mode roomscan-square"><input type="checkbox" id="rs_square"><span>' + t("rs_square") + "</span></label>" +
    "<small>" + t("rs_square_hint") + "</small>" +
    '<label class="roomscan-mode roomscan-furniture" hidden><input type="checkbox" id="rs_furniture" checked><span>' + t("rs_furniture") + "</span></label>" +
    '<small class="roomscan-furniture-hint" hidden>' + t("rs_furniture_hint") + "</small>" +
    "<fieldset><legend>" + t("rs_face") + "</legend>" +
    '<label class="roomscan-mode"><input type="radio" name="rs_face" value="centre" checked><span>' + t("rs_face_centre") + "</span></label>" +
    '<label class="roomscan-mode"><input type="radio" name="rs_face" value="inside"><span>' + t("rs_face_inside") + "</span></label>" +
    "</fieldset>" +
    "<fieldset><legend>" + t("rs_mode") + "</legend>" +
    '<label class="roomscan-mode"><input type="radio" name="rs_mode" value="replace"><span>' + t("rs_replace") + "</span></label>" +
    '<label class="roomscan-mode"><input type="radio" name="rs_mode" value="merge"><span>' + t("rs_merge") + "</span></label>" +
    "</fieldset>";
  previewWrap.append(summary, preview, warnings, cal);

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
    document.removeEventListener("keydown", onKey, true);
    if (xrSession) xrSession.end().catch(() => {});
    if (overlay.parentElement) overlay.parentElement.removeChild(overlay);
  }
  cancel.onclick = close;
  overlay.addEventListener("click", (event) => { if (event.target === overlay && !xrSession) close(); });
  /* Document-level, matching the other overlays: the modal has no focused
     control until the user tabs into one, so a listener on the overlay itself
     would only work some of the time. In AR the session owns Escape — ending
     the modal there would strand the stage on screen. */
  function onKey(event) {
    if (event.key !== "Escape" || xrSession) return;
    if (!overlay.parentElement) return document.removeEventListener("keydown", onKey, true);
    event.stopPropagation();
    close();
  }
  document.addEventListener("keydown", onKey, true);

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
    /* Square before the face offset: the offset re-cuts corners against the
       edge directions, so straightening them afterwards would undo it. */
    const square = cal.querySelector("#rs_square");
    if (square && square.checked) squareScan(copy);
    if (faceMode === "inside") insetScan(copy, 1);
    return copy;
  }

  /* The scan knows when it is unreliable — crossed walls, low-confidence
     surfaces, empty records — and staying quiet about it just moves the
     discovery to after the plan has replaced the user's work. */
  function showWarnings(shown) {
    const notes = [];
    if (scanSelfIntersects(shown)) notes.push(["ph-warning-octagon", t("rs_warn_cross")]);
    if (result.lowConfidenceCount)
      notes.push(["ph-warning", t("rs_warn_confidence", { n: result.lowConfidenceCount })]);
    if (result.droppedCount)
      notes.push(["ph-info", t("rs_warn_dropped", { n: result.droppedCount })]);
    if (shown.squaredCount) notes.push(["ph-check-square", t("rs_squared", { n: shown.squaredCount })]);
    warnings.hidden = !notes.length;
    warnings.innerHTML = notes
      .map(([icon, text]) => '<div><i class="ph ' + icon + '"></i><span>' + text + "</span></div>")
      .join("");
  }

  function renderSummary(shown) {
    const bounds = scanBounds(shown);
    const area = scanArea(shown) / 10000;
    summary.innerHTML = "<strong>" + shown.source + "</strong><span>" +
      t("rs_found", { walls: shown.wallCount, openings: shown.openingCount }) +
      (shown.objectCount ? " · " + t("rs_objects", { n: shown.objectCount }) : "") + "</span>" +
      '<span class="roomscan-area">' + t("rs_area", {
        area: area.toFixed(area < 10 ? 2 : 1),
        w: (bounds.width / 100).toFixed(2),
        d: (bounds.depth / 100).toFixed(2),
      }) + "</span>";
  }

  function repaint() {
    let shown = result;
    try { shown = previewCopy(); } catch (e) { shown = result; }
    drawPreview(preview, shown, calIndex);
    renderSummary(shown);
    showWarnings(shown);
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
    renderSummary(next);
    cal.hidden = false;
    // start on the longest edge, which is the best guess, not the only choice
    const longest = longestScanEdge(next);
    calIndex = (next.cad.lines || []).findIndex((l) => longest && l.a === longest.a && l.b === longest.b);
    // AR corners are floor taps on the inside face; an imported scan is not
    faceMode = next.source === "WebXR AR" ? "inside" : "centre";
    /* Hand-tapped corners are always a degree or two out, so squaring is the
       right default there. RoomPlan already fits planes and regularizes them,
       so an import is left exactly as measured unless the user asks. */
    const square = cal.querySelector("#rs_square");
    if (square) square.checked = next.source === "WebXR AR";
    // only an import can carry furniture, so the choice only appears with some
    const hasObjects = !!next.objectCount;
    cal.querySelector(".roomscan-furniture").hidden = !hasObjects;
    cal.querySelector(".roomscan-furniture-hint").hidden = !hasObjects;
    const faceInput = cal.querySelector('input[name="rs_face"][value="' + faceMode + '"]');
    if (faceInput) faceInput.checked = true;
    // replacing a furnished plan is destructive, so it is never the default
    const wantMerge = !!(S.walls && S.walls.length);
    const modeInput = cal.querySelector('input[name="rs_mode"][value="' + (wantMerge ? "merge" : "replace") + '"]');
    if (modeInput) modeInput.checked = true;

    const laser = cal.querySelector("#rs_laser_cm");
    /* A placeholder, not a value. Seeding the measured length meant Apply
       always rescaled the plan by whatever the rounding threw away, on a scan
       nobody had actually put a tape to — and re-seeding it on every face or
       edge change silently discarded a reading the user had typed. */
    laser.value = "";
    try { laser.placeholder = Math.round(longest.length); }
    catch (e) { laser.placeholder = ""; }
    laser.oninput = repaint;
    if (square) square.onchange = repaint;
    cal.querySelectorAll('input[name="rs_face"]').forEach((input) => {
      input.onchange = () => {
        faceMode = input.value;
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
      // the reading belongs to the wall it was taken on, so a new pick clears
      // it; the placeholder shows what this wall currently measures
      const edge = edgeAt(best);
      laser.value = "";
      if (edge) laser.placeholder = Math.round(edge.length);
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
    const text = await file.text();
    /* RoomPlan apps export USDZ by default and it is a zip, so it arrives as
       mojibake and lands on "that file could not be read" — which tells the
       user nothing about what to pick instead. */
    if (/\.usdz$/i.test(file.name) || text.slice(0, 2) === "PK") {
      status.textContent = t("rs_usdz");
      fileInput.value = "";
      return;
    }
    try { showResult(parseRoomScan(text)); }
    catch (error) { status.textContent = t(error.kind === "no-walls" ? "rs_no_walls" : "rs_bad_file"); }
    // otherwise re-picking the file the user just fixed fires no change event
    finally { fileInput.value = ""; }
  };

  async function startAR() {
    /* Cancelling AR and starting again used to resume the abandoned trace:
       `points` outlived the session while the on-screen counter was rebuilt at
       zero, so the next scan silently inherited the previous room's corners. */
    points = [];
    anchors = [];
    latestPoint = null;
    const stage = el("div", "roomscan-ar-stage");
    stage.setAttribute("role", "application");
    stage.setAttribute("aria-label", t("rs_ar_live"));
    stage.innerHTML =
      '<canvas class="roomscan-xr-canvas"></canvas>' +
      /* Reaching the button at the bottom edge one-handed tilts the phone at
         the exact moment the corner is committed. Every later sibling still
         takes its own taps, so the controls keep working. */
      '<div class="roomscan-ar-tap" data-xr="tap"></div>' +
      '<div class="roomscan-ar-top"><div><b>' + t("rs_ar_live") + '</b><span class="roomscan-count">' + t("rs_corners", { n: 0 }) + '</span></div><button type="button" data-xr="help" aria-label="' + t("rs_tutorial_open") + '"><i class="ph ph-question"></i></button></div>' +
      '<div class="roomscan-reticle"><i class="ph ph-crosshair"></i></div>' +
      '<canvas class="roomscan-ar-map" width="118" height="118" role="img" aria-label="' + t("rs_map_label") + '"></canvas>' +
      '<div class="roomscan-ar-live" hidden></div>' +
      '<div class="roomscan-ar-angle" hidden></div>' +
      '<div class="roomscan-ar-hint" role="status">' + t("rs_find_floor") + "</div>" +
      '<div class="roomscan-ar-coach" hidden><strong>' + t("rs_coach_title") + '</strong><ol><li>' + t("rs_coach_1") + '</li><li>' + t("rs_coach_2") + '</li><li>' + t("rs_coach_3") + '</li><li>' + t("rs_coach_4") + '</li></ol><button type="button" data-xr="coach-close">' + t("rs_got_it") + "</button></div>" +
      '<div class="roomscan-ar-actions"><button type="button" data-xr="cancel" aria-label="' + t("cancel") + '"><i class="ph ph-x"></i></button>' +
      '<button type="button" data-xr="undo" aria-label="' + t("undo") + '" disabled><i class="ph ph-arrow-counter-clockwise"></i></button>' +
      '<button type="button" class="roomscan-capture" data-xr="capture" disabled><i class="ph ph-plus"></i><span>' + t("rs_add_corner") + "</span></button>" +
      '<button type="button" data-xr="finish" aria-label="' + t("rs_finish") + '" disabled><i class="ph ph-check"></i></button></div>';
    overlay.appendChild(stage);
    const canvas = stage.querySelector("canvas");
    const gl = canvas.getContext("webgl", { xrCompatible: true, alpha: true, antialias: true });
    if (!gl) { stage.remove(); status.textContent = t("rs_ar_failed"); return; }
    let teardown = null;
    /* Hand the context back explicitly rather than waiting for the canvas to
       be collected: a browser keeps only a handful of live WebGL contexts, and
       a user retrying a failing start burns one each time. */
    const releaseGL = () => {
      try {
        if (teardown) teardown();
        const lose = gl.getExtension && gl.getExtension("WEBGL_lose_context");
        if (lose) lose.loseContext();
      } catch (e) { /* already gone; nothing left to release */ }
      teardown = null;
    };
    /* Runs on every exit path, including one the user never sees: idempotent
       because it is reachable from the session's own end event and from the
       failure path that has to force that end. */
    const onSessionEnd = () => {
      if (hitSource && hitSource.cancel) hitSource.cancel();
      xrSession = null; hitSource = null; latestPoint = null;
      releaseGL();
      if (stage.parentElement) stage.remove();
    };
    try {
      xrSession = await navigator.xr.requestSession("immersive-ar", {
        /* The controls are HTML. Requiring DOM overlay prevents a misleading
           "supported" session that opens the camera but hides every capture
           button on browsers that cannot present DOM inside immersive AR. */
        requiredFeatures: ["hit-test", "dom-overlay"],
        optionalFeatures: ["local-floor"],
        domOverlay: { root: stage },
      });
      /* Everything below here can still reject, and a session with no end
         handler is one that nothing is left holding: the catch used to null
         the handle without ending it, so a failed start left the camera on
         and the AR view presenting with its controls torn off. */
      xrSession.addEventListener("end", onSessionEnd);
      if (gl.makeXRCompatible) await gl.makeXRCompatible();
      xrSession.updateRenderState({ baseLayer: new window.XRWebGLLayer(xrSession, gl) });
      /* local-floor puts y=0 on the real floor, which is what makes a height
         test meaningful. The "local" fallback puts it wherever the device
         happened to start, so heights there are only good relative to the
         lowest hit we have actually seen. */
      let floorY = 0, floorKnown = true;
      const refSpace = await xrSession.requestReferenceSpace("local-floor")
        .catch(() => { floorKnown = false; return xrSession.requestReferenceSpace("local"); });
      const viewer = await xrSession.requestReferenceSpace("viewer");
      hitSource = await xrSession.requestHitTestSource({ space: viewer });
      const capture = stage.querySelector('[data-xr="capture"]');
      const undo = stage.querySelector('[data-xr="undo"]');
      const finish = stage.querySelector('[data-xr="finish"]');
      const count = stage.querySelector(".roomscan-count");
      const reticle = stage.querySelector(".roomscan-reticle");
      const hint = stage.querySelector(".roomscan-ar-hint");
      const coach = stage.querySelector(".roomscan-ar-coach");
      const map = stage.querySelector(".roomscan-ar-map");
      const live = stage.querySelector(".roomscan-ar-live");
      const captureLabel = capture.querySelector("span");
      const captureIcon = capture.querySelector("i");
      const angleEl = stage.querySelector(".roomscan-ar-angle");
      const tones = scanTones();
      let viewerAt = null, onFloor = true, raised = false;
      let anchorDraw = null;
      try { anchorDraw = anchorRenderer(gl); }
      // a driver that will not take the program still gets the map and the
      // numbers; losing the in-camera markers must not lose the capture
      catch (e) { anchorDraw = null; }
      /* "Close the room" only appears once you are back where you started and
         have enough corners for a room, so the same button never means both
         "add another corner here" and "finish". */
      /* A fixed radius turns into a trap in a small room or at a short jog:
         stand within it after three corners and the only thing the button can
         do is close a triangle. Never claim more than half the shortest wall
         already captured. */
      const closeRadius = () => {
        let shortest = Infinity;
        for (let i = 1; i < points.length; i++)
          shortest = Math.min(shortest, Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z));
        return Math.max(12, Math.min(45, shortest / 2));
      };
      let closing = false;
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
      let mapAt = 0, liveText = "", countText = "", angleText = "";
      const refresh = (now) => {
        const countNext = t("rs_corners", { n: points.length });
        if (countNext !== countText) count.textContent = countText = countNext;
        undo.disabled = !points.length;
        finish.disabled = points.length < 3;
        const last = points[points.length - 1];
        const reach = latestPoint && last
          ? Math.hypot(latestPoint.x - last.x, latestPoint.z - last.z) : 0;
        const home = latestPoint && points.length > 2
          ? Math.hypot(latestPoint.x - points[0].x, latestPoint.z - points[0].z) : Infinity;
        closing = home <= closeRadius();
        capture.classList.toggle("closing", closing);
        captureLabel.textContent = t(closing ? "rs_close_loop" : "rs_add_corner");
        captureIcon.className = closing ? "ph ph-check" : "ph ph-plus";
        /* A tape reading after the fact cannot tell you a corner drifted, but
           watching the edge length while you aim can. */
        live.hidden = !(latestPoint && last);
        const liveNext = live.hidden ? "" : t("rs_live_edge", { len: formatCm(reach) });
        if (liveNext !== liveText) live.textContent = liveText = liveNext;
        /* Telling the user the room came out crooked in the review panel is
           too late. The angle this corner WOULD make is knowable while they
           are still standing there, so show it and flag a true right angle. */
        const turn = scanOrthoAngle(points[points.length - 2], last, latestPoint);
        angleEl.hidden = turn == null;
        if (turn != null) {
          const square = Math.abs(turn - 90) <= 4;
          const angleNext = square ? t("rs_ortho") : t("rs_angle", { deg: Math.round(turn) });
          if (angleNext !== angleText) angleEl.textContent = angleText = angleNext;
          angleEl.classList.toggle("square", square);
        }
        // the map only has to keep up with a walking phone, not with the display
        if (!(now < mapAt + 50)) { mapAt = now || 0; drawArMap(map, points, latestPoint, closing, viewerAt); }
      };
      const frame = (time, xrFrame) => {
        if (!xrSession) return;
        const layer = xrSession.renderState.baseLayer;
        gl.bindFramebuffer(gl.FRAMEBUFFER, layer.framebuffer);
        gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        const hit = xrFrame.getHitTestResults(hitSource)[0];
        const pose = hit && hit.getPose(refSpace);
        const at = pose && pose.transform.position;
        // a hit-test pose is oriented to the surface, so a skirting board, a
        // chair leg or a wall is otherwise indistinguishable from the floor
        if (at) {
          if (!floorKnown) floorY = Math.min(floorY, at.y * 100);
          else floorY = 0;
        }
        const level = !pose || hitPoseIsFloor(pose.transform.orientation);
        // a raised horizontal plane is furniture: high confidence, worth blocking
        raised = !!at && level && hitIsRaised(at.y * 100, floorY);
        onFloor = level && !raised;
        // centimetres on every axis: a vector that mixed cm and metres was one
        // careless read away from a wrong floor height
        latestPoint = at ? { x: at.x * 100, y: at.y * 100, z: at.z * 100 } : null;
        capture.disabled = !latestPoint || raised;
        reticle.classList.toggle("locked", !!latestPoint && onFloor);
        reticle.classList.toggle("offfloor", !!latestPoint && !onFloor);
        const viewerPose = xrFrame.getViewerPose(refSpace);
        if (viewerPose) {
          const vp = viewerPose.transform.position;
          viewerAt = { x: vp.x * 100, z: vp.z * 100, heading: viewerHeading(viewerPose.transform.orientation) };
        }
        if (viewerPose && anchorDraw) viewerPose.views.forEach((view) => {
          const vp = layer.getViewport(view);
          if (!vp) return;
          gl.viewport(vp.x, vp.y, vp.width, vp.height);
          try { anchorDraw(view, anchors, at ? { x: at.x, y: at.y, z: at.z } : null); }
          catch (e) { anchorDraw = null; }
        });
        refresh(time);
        if (performance.now() >= hintHoldUntil)
          setHint(!latestPoint ? "rs_find_floor" : raised ? "rs_raised" : !onFloor ? "rs_not_floor"
            : closing ? "rs_close_hint" : points.length ? "rs_aim_next" : "rs_surface_ready");
        xrSession.requestAnimationFrame(frame);
      };
      xrSession.requestAnimationFrame(frame);
      const done = async () => {
        let next;
        try { next = roomScanFromPoints(points); }
        catch (error) { return setHint("rs_need_three", 1800); }
        await xrSession.end();
        showResult(next);
      };
      stage.querySelector('[data-xr="tap"]').onclick = () => {
        // a tap that only meant to dismiss the coaching card is not a corner
        if (!coach.hidden || capture.disabled) return;
        capture.onclick();
      };
      capture.onclick = () => {
        if (!latestPoint) return;
        // aiming back at the first corner means "that is the room", not
        // "put another corner on top of the one I started from"
        if (closing) { tones.close(); return done(); }
        const at = latestPoint;
        if (!appendRoomScanPoint(points, at)) {
          setHint("rs_corner_too_close", 1800);
          tones.reject();
          if (navigator.vibrate) navigator.vibrate([30, 35, 30]);
          return;
        }
        // the renderer works in WebXR's metres
        anchors.push({ x: at.x / 100, y: at.y / 100, z: at.z / 100 });
        setHint("rs_move_next", 1000);
        mapAt = 0; refresh();
        tones.corner();
        if (navigator.vibrate) navigator.vibrate(18);
      };
      undo.onclick = () => {
        if (!points.length) return;
        points.pop();
        anchors.pop();
        setHint(points.length ? "rs_aim_next" : "rs_surface_ready");
        mapAt = 0; refresh();
        if (navigator.vibrate) navigator.vibrate(12);
      };
      finish.onclick = done;
      stage.querySelector('[data-xr="cancel"]').onclick = () => xrSession.end();
      teardown = () => {
        if (anchorDraw && anchorDraw.dispose) anchorDraw.dispose();
        anchorDraw = null;
        tones.stop();
      };
    } catch (error) {
      // end() first: until it resolves the camera is still live
      const opened = xrSession;
      xrSession = null;
      if (opened) opened.end().catch(() => {});
      onSessionEnd();
      status.textContent = t(startErrorMessage(error));
      // a start that failed on capability will fail the same way next time
      if (roomScanArStartIssue(error) === "unsupported") {
        arCard.disabled = true;
        tutorialStart.disabled = true;
      }
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
    /* After the replace branch has cleared S.items, never before it. Each
       piece is an ordinary editable item from here on — the scan seeds the
       plan, it does not own it. */
    const wantFurniture = cal.querySelector("#rs_furniture");
    if (wantFurniture && wantFurniture.checked) {
      (next.cad.objects || []).forEach((o) => {
        S.items.push({
          id: S.idc++, type: o.type, x: o.center.x, z: o.center.z,
          w: o.w, d: o.d, h: o.h, rot: o.rot,
        });
      });
    }
    detectRooms().forEach((room, i) => {
      if (!S.roomMeta[room.key]) S.roomMeta[room.key] = { name: t("rs_room_name", { n: i + 1 }), floor: "wood" };
    });
    S.dirty3D = true;
    render2D(); fitView(); close();
    flash(t(addBeside ? "rs_applied_merge" : "rs_applied"), "success");
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
