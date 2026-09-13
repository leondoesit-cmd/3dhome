/* Shared touch-authoring policy for the plan and model sketcher.
   Scene coordinates always stay 1:1 with the finger. Creation tools add a
   visual loupe, but it never moves the point being authored. */

const PLAN_CREATION_TOOLS = new Set([
  "wall", "arcwall", "rect", "slabvoid", "roomDivider",
  "point", "mepNode", "mepRoute",
]);
const PLAN_LENS_TOOLS = new Set(["door", "window", "passage"]);
const MODELER_CREATION_TOOLS = new Set([
  "wall", "poly", "cut", "rev", "rect", "circle", "sph", "cutc",
  "srect", "scirc", "spoly", "sslot", "sell", "sarc", "sspline",
]);

export function planTouchPrecisionKind(tool, placeType) {
  if (placeType) return "lens";
  if (PLAN_CREATION_TOOLS.has(tool)) return "lens";
  if (PLAN_LENS_TOOLS.has(tool)) return "lens";
  return null;
}

export function modelerTouchPrecisionKind(tool, mode) {
  if (mode === "drawing") return tool === "dim" ? "lens" : null;
  return MODELER_CREATION_TOOLS.has(tool) ? "lens" : null;
}

function clamp(value, lo, hi) {
  return Math.max(lo, Math.min(hi, value));
}

export function beginTouchPrecision(event, x, y, bounds, kind) {
  if (!event || event.pointerType !== "touch" || !kind) return null;
  var width = Math.max(1, bounds && bounds.width || 1);
  var height = Math.max(1, bounds && bounds.height || 1);
  var contact = {
    pointerId: event.pointerId,
    kind: kind,
    ox: x,
    oy: y,
    effOx: x,
    effOy: y,
    vectorX: 0,
    vectorY: 0,
    width: width,
    height: height,
  };
  return updateTouchPrecision(contact, x, y);
}

export function updateTouchPrecision(contact, x, y) {
  if (!contact) return null;
  contact.ox = x;
  contact.oy = y;
  contact.effOx = x;
  contact.effOy = y;
  return contact;
}

export function touchPrecisionPoint(contact, x, y) {
  if (!contact) return { x: x, y: y };
  updateTouchPrecision(contact, x, y);
  return { x: contact.effOx, y: contact.effOy };
}

export function formatTouchDistance(value, unitLabel) {
  if (value == null || !isFinite(Number(value)) || Number(value) < 0) return "∞";
  var cm = Number(value);
  if (cm >= 1000) {
    var metres = cm / 100;
    return (metres < 100 ? metres.toFixed(1).replace(/\.0$/, "") : Math.round(metres)) + " m";
  }
  return Math.round(cm) + " " + (unitLabel || "cm");
}

/* Nearest intersections of four screen-space rays with a set of visible line
   segments. Modeler uses this for sketch/part geometry; the result is divided
   by the current pixels-per-centimetre scale so the lens reads in real units. */
export function directionalSegmentDistances(ox, oy, segments, pixelsPerCm, minPixels) {
  var scale = Number(pixelsPerCm);
  if (!(scale > 0) || !isFinite(scale)) scale = 1;
  var threshold = minPixels == null ? 5 : Math.max(0, Number(minPixels) || 0);
  var dirs = {
    up: { x: 0, y: -1 }, down: { x: 0, y: 1 },
    left: { x: -1, y: 0 }, right: { x: 1, y: 0 },
  };
  var out = { up: null, down: null, left: null, right: null };
  Object.keys(dirs).forEach(function (key) {
    var d = dirs[key], best = null;
    (segments || []).forEach(function (segment) {
      if (!segment || !segment.a || !segment.b) return;
      var sx = segment.b.x - segment.a.x, sy = segment.b.y - segment.a.y;
      var den = d.x * sy - d.y * sx;
      if (Math.abs(den) < 1e-7) return;
      var ax = segment.a.x - ox, ay = segment.a.y - oy;
      var travel = (ax * sy - ay * sx) / den;
      var along = (ax * d.y - ay * d.x) / den;
      if (travel <= threshold || along < -1e-6 || along > 1 + 1e-6) return;
      if (best === null || travel < best) best = travel;
    });
    if (best !== null) out[key] = best / scale;
  });
  return out;
}

var lensBuffer = null;

/* Keep the loupe on the side opposite the hand, not merely opposite the half
   of the canvas that happened to be touched.  A right thumb approaches from
   the right and masks that whole side of the contact; left-handed use is the
   exact mirror image.  When the preferred horizontal side is too tight, move
   above/below the finger while retaining a small bias away from the hand. */
export function touchLensCenter(contact, options) {
  options = options || {};
  var W = Number(contact && contact.width) || 0, H = Number(contact && contact.height) || 0;
  var radius = clamp(options.radius || 48, 38, 58);
  var edgePad = options.distances ? 30 : 8;
  var side = options.handedness === "left" ? 1 : -1;
  var minX = radius + edgePad, maxX = W - radius - edgePad;
  var minY = radius + edgePad, maxY = H - radius - edgePad;
  var cx = clamp(contact.ox + side * (radius + 64), minX, maxX);
  var cy = clamp(contact.oy - Math.min(28, radius * .55), minY, maxY);
  if (Math.abs(cx - contact.ox) < radius + 30) {
    var belowRoom = H - contact.oy, aboveRoom = contact.oy;
    var vertical = aboveRoom >= belowRoom ? -1 : 1;
    cx = clamp(contact.ox + side * Math.min(24, radius * .45), minX, maxX);
    cy = clamp(contact.oy + vertical * (radius + 70), minY, maxY);
  }
  return { x:cx, y:cy, radius:radius, side:side };
}

function drawDistanceBadge(ctx, x, y, text, color) {
  ctx.save();
  ctx.direction = "ltr";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "700 10px system-ui, Arial";
  var w = Math.ceil(ctx.measureText(text).width) + 10, h = 18;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x - w / 2, y - h / 2, w, h, 8);
  else ctx.rect(x - w / 2, y - h / 2, w, h);
  ctx.fillStyle = "rgba(20,25,36,.92)";
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = "#fff";
  ctx.fillText(text, x, y + 0.5);
  ctx.restore();
}

function drawDirectionalDistances(ctx, cx, cy, radius, distances, unitLabel, color) {
  if (!distances) return;
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,.72)";
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 3]);
  ctx.beginPath();
  ctx.moveTo(cx, cy - 12); ctx.lineTo(cx, cy - radius + 10);
  ctx.moveTo(cx, cy + 12); ctx.lineTo(cx, cy + radius - 10);
  ctx.moveTo(cx - 12, cy); ctx.lineTo(cx - radius + 10, cy);
  ctx.moveTo(cx + 12, cy); ctx.lineTo(cx + radius - 10, cy);
  ctx.stroke();
  ctx.restore();
  drawDistanceBadge(ctx, cx, cy - radius, "↑ " + formatTouchDistance(distances.up, unitLabel), color);
  drawDistanceBadge(ctx, cx, cy + radius, "↓ " + formatTouchDistance(distances.down, unitLabel), color);
  drawDistanceBadge(ctx, cx - radius, cy, "← " + formatTouchDistance(distances.left, unitLabel), color);
  drawDistanceBadge(ctx, cx + radius, cy, "→ " + formatTouchDistance(distances.right, unitLabel), color);
}

/* Magnify the already-rendered canvas, then add a fixed crosshair. This works
   for both editors and deliberately runs before their contact/measurement HUD
   is painted, so the lens contains geometry rather than a hall of mirrors. */
export function drawTouchPrecisionLens(ctx, canvas, contact, options) {
  if (!ctx || !canvas || !contact || typeof document === "undefined") return;
  options = options || {};
  var W = contact.width, H = contact.height;
  if (W < 80 || H < 80) return;
  var placement = touchLensCenter(contact, options);
  var radius = placement.radius;
  var zoom = clamp(options.zoom || 2.25, 1.5, 4);
  var sourceRadius = radius / zoom;
  var cx = placement.x, cy = placement.y;
  var dprX = canvas.width / Math.max(1, W);
  var dprY = canvas.height / Math.max(1, H);
  var bw = Math.max(1, Math.round(sourceRadius * 2 * dprX));
  var bh = Math.max(1, Math.round(sourceRadius * 2 * dprY));
  if (!lensBuffer) lensBuffer = document.createElement("canvas");
  if (lensBuffer.width !== bw) lensBuffer.width = bw;
  if (lensBuffer.height !== bh) lensBuffer.height = bh;
  var bc = lensBuffer.getContext("2d");
  if (!bc) return;
  bc.clearRect(0, 0, bw, bh);
  try {
    bc.drawImage(
      canvas,
      (contact.effOx - sourceRadius) * dprX,
      (contact.effOy - sourceRadius) * dprY,
      sourceRadius * 2 * dprX,
      sourceRadius * 2 * dprY,
      0, 0, bw, bh,
    );
  } catch (_) {
    return;
  }
  ctx.save();
  var leaderAngle = Math.atan2(cy - contact.oy, cx - contact.ox);
  ctx.strokeStyle = options.color || "#4f46e5";
  ctx.globalAlpha = .58;
  ctx.lineWidth = 1.25;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(contact.ox, contact.oy);
  ctx.lineTo(cx - Math.cos(leaderAngle) * radius, cy - Math.sin(leaderAngle) * radius);
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = options.background || "rgba(248,249,252,.98)";
  ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
  ctx.drawImage(lensBuffer, cx - radius, cy - radius, radius * 2, radius * 2);
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = options.color || "#4f46e5";
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.stroke();
  drawDirectionalDistances(ctx, cx, cy, radius, options.distances, options.unitLabel, options.color || "#4f46e5");
  ctx.strokeStyle = options.crosshair || "#e05a46";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(cx - 10, cy); ctx.lineTo(cx + 10, cy);
  ctx.moveTo(cx, cy - 10); ctx.lineTo(cx, cy + 10);
  ctx.stroke();
  ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}
