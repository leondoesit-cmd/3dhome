/* The plan view's wall paths and presentation walls, openings, wall probes and
   angle guides, nodes and warnings, split out of js/plan2d.js. It shares the
   editor's state through live imports from ../plan2d.js. */
import { activeWarnings } from "../constraint_engine.js";
import { isElevation } from "../elevation.js";
import { referenceFloorScene } from "../floors.js";
import { detectRooms, hiddenSets, roomFloor, roomHidden, roomsTopologyKey, wallBandOutline, wallById, wallGeom, wallOutline, wallPointAt, wallTangentAt } from "../geometry.js";
import { t } from "../i18n.js";
import { itemCorners } from "../measure.js";
import { floorImageFor, floorImageSource } from "../plan_material_fill.js";
import { patternFill } from "../plan_patterns.js";
import { isPresentation, planStyle, planTheme } from "../plan_style.js";
import { sx, sz } from "../plan_view.js";
import { label } from "../plan2d/constraints.js";
import { warnLabel } from "../plan2d/items.js";
import { eraseHover } from "../plan2d/overlays.js";
import { floorMeanColor, floorPaintCanvas, groundPaintCanvas } from "../primitives.js";
import { FILL2D, S, TILE, clamp } from "../state.js";
import { openingHasSwingConflict } from "../swing_clearance.js";
import { userLayerKey } from "../user_layers.js";
import { curvedWallOutline, normalizeWallKind } from "../wall_curves.js";
import { normalizeWall } from "../wall_types.js";
import {
  LAWN_MARGIN, PAVE_CM, WARN_COL, angleGuideAnimOn, angleGuideLastFrame,
  chromeOn, pc, plan, proxied, render2D, requestRenderHUD, roomLayer,
  set_angleGuideAnimOn, set_angleGuideLastFrame, set_roomLayer,
  set_snapFlashT, snapFlashT, warnPhase,
} from "../plan2d.js";

/* ---- presentation walls ----
   One dark mass with a soft drop shadow, the way a marketing plan draws the
   structure: every visible wall's outline goes into one path and is filled
   once, so the shadow does not stack darker where two walls overlap at a
   corner. Openings are CLIPPED out rather than painted over afterwards, so the
   floor (and the lawn, at an outside door) shows through them — the technical
   style's knockout rectangle is a flat colour that would sit on top of a
   textured floor like a sticker. Canvas shadows ignore the transform, so the
   light stays in the same screen corner however the plan is rotated. */
function wallPath(w) {
  var path = new Path2D(),
    out = wallOutline(w);
  if (!out || out.length < 3) return path;
  out.forEach(function (p, i) {
    if (i) path.lineTo(sx(p.x), sz(p.z)); else path.moveTo(sx(p.x), sz(p.z));
  });
  path.closePath();
  return path;
}
function openingRectPts(o) {
  var w = wallById(o.wall);
  if (!w) return null;
  var gm = wallGeom(w),
    s0 = clamp(o.s, o.width / 2, gm.L - o.width / 2),
    c = wallPointAt(w, s0), tg = wallTangentAt(w, s0);
  if (!c || !tg) return null;
  var hw = o.width / 2, ht = (w.thickness || 0) / 2 + 1, nx = -tg.z, nz = tg.x;
  return [
    { x: c.x - tg.x * hw - nx * ht, z: c.z - tg.z * hw - nz * ht },
    { x: c.x + tg.x * hw - nx * ht, z: c.z + tg.z * hw - nz * ht },
    { x: c.x + tg.x * hw + nx * ht, z: c.z + tg.z * hw + nz * ht },
    { x: c.x - tg.x * hw + nx * ht, z: c.z - tg.z * hw + nz * ht },
  ];
}
function clipOutsideOpenings(walls) {
  var ids = {};
  walls.forEach(function (w) { ids[w.id] = true; });
  var clip = new Path2D(), any = false;
  clip.rect(-1e5, -1e5, 2e5, 2e5);
  S.openings.forEach(function (o) {
    if (!ids[o.wall]) return;
    var pts = openingRectPts(o);
    if (!pts) return;
    any = true;
    pts.forEach(function (p, i) {
      if (i) clip.lineTo(sx(p.x), sz(p.z)); else clip.moveTo(sx(p.x), sz(p.z));
    });
    clip.closePath();
  });
  if (any) pc.clip(clip, "evenodd");
}
function canvasDpr() {
  return plan && S.CW ? plan.width / S.CW : 1;
}
function drawPresentationWalls(walls) {
  var list = walls.filter(function (w) {
    if (!w || !S.nodes[w.a] || !S.nodes[w.b]) return false;
    var ph = w.phase || "new";
    return normalizeWallKind(w) !== "roomDivider" && ph !== "demolition" && ph !== "demolish";
  });
  if (!list.length) return;
  var th = planTheme(), dpr = canvasDpr(), mass = new Path2D();
  list.forEach(function (w) {
    normalizeWall(w, S);
    mass.addPath(wallPath(w));
  });
  pc.save();
  clipOutsideOpenings(list);
  pc.shadowColor = th.wallShadow;
  pc.shadowBlur = 9 * dpr;
  pc.shadowOffsetX = 3.5 * dpr;
  pc.shadowOffsetY = 3.5 * dpr;
  pc.fillStyle = th.wallFill;
  pc.fill(mass, "nonzero");
  pc.shadowColor = "transparent";
  pc.strokeStyle = th.wallStroke;
  pc.lineWidth = 0.8;
  pc.stroke(mass);
  pc.restore();
}

function traceWallCentre(w) {
  var g = wallGeom(w), steps = g.kind === "arc" ? Math.max(12, Math.ceil(g.L / 25)) : 1;
  pc.beginPath();
  for (var i = 0; i <= steps; i++) {
    var p = wallPointAt(w, g.L * i / steps);
    if (!p) continue;
    if (i) pc.lineTo(sx(p.x), sz(p.z)); else pc.moveTo(sx(p.x), sz(p.z));
  }
}

function wallBandPolygon(w, from, to) {
  var g = wallGeom(w),
    h = (w.thickness || 0) / 2;
  if (g.kind !== "arc" && Math.abs(from + h) < 0.05 && Math.abs(to - h) < 0.05) {
    var outline = wallOutline(w);
    if (outline && outline.length >= 4) return outline;
  }
  if (g.kind !== "arc") {
    var band = wallBandOutline(w, from, to);
    if (band) return [band.a0, band.b0, band.b1, band.a1];
  }
  var steps = g.kind === "arc" ? Math.max(12, Math.ceil(g.L / 20)) : 1,
    a = [], b = [];
  for (var i = 0; i <= steps; i++) {
    var s = g.L * i / steps, p = wallPointAt(w, s), tng = wallTangentAt(w, s);
    if (!p || !tng) continue;
    var nx = -tng.z, nz = tng.x;
    a.push({ x: p.x + nx * from, z: p.z + nz * from });
    b.push({ x: p.x + nx * to, z: p.z + nz * to });
  }
  return a.concat(b.reverse());
}

/* A floor image finished loading: drop the cached room layer and repaint. */
function presentationImageReady() {
  roomLayer.key = "";
  render2D();
}
function paintRooms(ctx, rooms, dpr) {
  var pres = isPresentation(),
    view = { OX: S.OX, OY: S.OY, SC: S.SC, dpr: dpr || 1 };
  if (pres) paintPresentationSite(ctx, rooms, view);
  rooms.forEach(function (r) {
    ctx.beginPath();
    r.pts.forEach(function (p, i) {
      var X = sx(p.x),
        Y = sz(p.z);
      if (i) ctx.lineTo(X, Y);
      else ctx.moveTo(X, Y);
    });
    ctx.closePath();
    if (roomHidden(r.key)) {
      ctx.fillStyle = "rgba(150,146,138,.10)";
      ctx.fill();
      ctx.strokeStyle = "#9a9289";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    } else if (pres) {
      var ft = roomFloor(r.key) || "wood";
      var rm = S.roomMeta[r.key];
      // a custom finish (library material or uploaded image) is what the room
      // looks like — the floor type underneath is only its fallback
      var img = rm && floorImageFor(rm.floorTex, rm.floorScale);
      ctx.fillStyle = img
        ? patternFill(ctx, "img:" + img.url, function (level) {
            return floorImageSource(img.url, level, presentationImageReady);
          }, floorMeanColor(ft), img.tileCm, view)
        : patternFill(ctx, ft, function (level) {
            return floorPaintCanvas(ft, level);
          }, floorMeanColor(ft), TILE[ft] || 200, view);
      ctx.fill();
    } else {
      ctx.fillStyle = FILL2D[roomFloor(r.key)] || "#efe7d6";
      ctx.fill();
    }
  });
}

function paintPresentationSite(ctx, rooms, view) {
  if (!rooms.length) return;
  if (S.site && S.site.enabled && S.site.show2D) return;
  var x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  rooms.forEach(function (r) {
    r.pts.forEach(function (p) {
      if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x;
      if (p.z < z0) z0 = p.z; if (p.z > z1) z1 = p.z;
    });
  });
  if (!isFinite(x0)) return;
  var th = planTheme();
  ctx.save();
  ctx.fillStyle = patternFill(ctx, "__lawn", function (level) {
    return groundPaintCanvas(level);
  }, th.lawn, 260, view);
  var lx = sx(x0 - LAWN_MARGIN), lz = sz(z0 - LAWN_MARGIN),
    lw = (x1 - x0 + 2 * LAWN_MARGIN) * S.SC, lh = (z1 - z0 + 2 * LAWN_MARGIN) * S.SC;
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") ctx.roundRect(lx, lz, lw, lh, 120 * S.SC);
  else ctx.rect(lx, lz, lw, lh);
  ctx.fill();
  // soft edge between lawn and paving
  ctx.beginPath();
  rooms.forEach(function (r) {
    r.pts.forEach(function (p, i) {
      if (i) ctx.lineTo(sx(p.x), sz(p.z)); else ctx.moveTo(sx(p.x), sz(p.z));
    });
    ctx.closePath();
  });
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(70,60,45,.22)";
  ctx.lineWidth = 2 * PAVE_CM * S.SC + 3;
  ctx.stroke();
  ctx.strokeStyle = patternFill(ctx, "pavers", function (level) {
    return floorPaintCanvas("pavers", level);
  }, floorMeanColor("pavers"), TILE.pavers || 180, view);
  ctx.lineWidth = 2 * PAVE_CM * S.SC;
  ctx.stroke();
  ctx.restore();
}
/* The room fills are cached as a whole bitmap keyed on topology + transform.
   The selected room's dashed outline used to be part of that bitmap and part of
   that key, so clicking a room re-painted every room in the plan; it is HUD
   chrome now, and the key no longer mentions the selection. */
function drawCachedRooms() {
  var rooms = detectRooms();
  var pixelW = plan ? plan.width : S.CW, pixelH = plan ? plan.height : S.CH;
  var key =
    roomsTopologyKey() +
    "|" +
    S.OX +
    "," +
    S.OY +
    "," +
    S.SC +
    "," +
    S.CW +
    "," +
    S.CH +
    "|" +
    rooms
      .map(function (r) {
        var ft = S.roomMeta[r.key] && S.roomMeta[r.key].floorTex;
        // data URLs run to megabytes: their length and tail identify them
        var ftKey = ft ? ft.length + ":" + ft.slice(-24) + ":" + (S.roomMeta[r.key].floorScale || "") : "";
        return r.key + (roomHidden(r.key) ? "h" : "") + (roomFloor(r.key) || "") + ftKey;
      })
      .concat("ul=" + userLayerKey()) // hiddenSets() also answers for user layers
      .join(";") +
    "|" + planStyle() + "|" + (pixelW / (S.CW || 1)) +
    (S.site && S.site.enabled && S.site.show2D ? "|site" : "");
  if (
    roomLayer.key === key &&
    roomLayer.canvas &&
    roomLayer.canvas.width === pixelW &&
    roomLayer.canvas.height === pixelH
  ) {
    pc.drawImage(roomLayer.canvas, 0, 0, S.CW, S.CH);
    return { rooms: roomLayer.rooms, hid: roomLayer.hid };
  }
  var hid = hiddenSets(rooms);
  if (typeof document === "undefined") {
    paintRooms(pc, rooms, 1);
    return { rooms: rooms, hid: hid };
  }
  var c = roomLayer.canvas || document.createElement("canvas");
  if (c.width !== pixelW) c.width = Math.max(1, pixelW);
  if (c.height !== pixelH) c.height = Math.max(1, pixelH);
  var ctx = c.getContext("2d");
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.setTransform(pixelW / S.CW, 0, 0, pixelH / S.CH, 0, 0);
  paintRooms(ctx, rooms, pixelW / (S.CW || 1));
  set_roomLayer({ key: key, canvas: c, rooms: rooms, hid: hid });
  pc.drawImage(c, 0, 0, S.CW, S.CH);
  return { rooms: rooms, hid: hid };
}

function drawReferenceFloor() {
  var scene = referenceFloorScene(S.workspace);
  if (!scene) return;
  var spatial = scene.spatial || scene,
    nodes = spatial.nodes || [], walls = spatial.walls || [];
  pc.save();
  pc.globalAlpha = .42;
  pc.strokeStyle = "#6b67a8";
  pc.fillStyle = "rgba(107,103,168,.10)";
  pc.setLineDash([7, 5]);
  walls.forEach(function (w) {
    var poly = curvedWallOutline(w, w.thickness || 10, nodes, 20);
    if (!poly.length) return;
    pc.beginPath();
    poly.forEach(function (p, i) { if (i) pc.lineTo(sx(p.x), sz(p.z)); else pc.moveTo(sx(p.x), sz(p.z)); });
    pc.closePath(); pc.fill(); pc.stroke();
  });
  pc.restore();
}

function drawSnapFlash() {
  var f = S.snapFlash;
  if (!f) return;
  var left = f.until - Date.now();
  if (left <= 0) {
    S.snapFlash = null;
    return;
  }
  var it = null;
  for (var i = 0; i < S.items.length; i++)
    if (S.items[i].id === f.id) { it = S.items[i]; break; }
  if (!it) return;
  var pts = itemCorners(it);
  pc.save();
  pc.globalAlpha = Math.max(0, Math.min(1, left / 300));
  pc.strokeStyle = "#e0813a";
  pc.fillStyle = "rgba(224,129,58,.22)";
  pc.lineWidth = 2.4;
  pc.beginPath();
  pts.forEach(function (p, k) {
    if (k) pc.lineTo(sx(p.x), sz(p.z));
    else pc.moveTo(sx(p.x), sz(p.z));
  });
  pc.closePath();
  pc.fill();
  pc.stroke();
  pc.restore();
  // keep the fade going without owning an animation loop
  if (!snapFlashT)
    set_snapFlashT(setTimeout(function () {
      set_snapFlashT(0);
      requestRenderHUD();
    }, 60));
}

function angleGuideShouldAnimate() {
  var gd = S.wallAngleGuide;
  return (
    !!gd &&
    gd.snapped &&
    !isElevation() &&
    plan.offsetParent !== null &&
    // held mid-drag, or still inside the post-release confirmation
    (S.action === "wall" || gd.until > Date.now())
  );
}
function angleGuideAnimStep(time) {
  if (!angleGuideShouldAnimate()) {
    set_angleGuideAnimOn(false);
    set_angleGuideLastFrame(0);
    // Final frame: drops the guide and clears its ticks. Only needed while one
    // is still on the canvas — an interaction that dropped it already repainted.
    if (S.wallAngleGuide) requestRenderHUD();
    return;
  }
  if (!angleGuideLastFrame || time - angleGuideLastFrame >= 45) {
    set_angleGuideLastFrame(time);
    requestRenderHUD();
  }
  requestAnimationFrame(angleGuideAnimStep);
}
function ensureAngleGuideAnim() {
  if (!angleGuideAnimOn && angleGuideShouldAnimate()) {
    set_angleGuideAnimOn(true);
    requestAnimationFrame(angleGuideAnimStep);
  }
}
function drawWallAngleGuide() {
  var gd = S.wallAngleGuide;
  if (!gd || !gd.wall || !gd.pair) return;
  /* The guide is a reference INTO the document. If its wall has gone (deleted,
     undone, or a whole new plan loaded under it) there is nothing left to
     confirm, and drawing on the stale reference would put a badge on a wall the
     user cannot see. */
  if (S.walls.indexOf(gd.wall) === -1) {
    S.wallAngleGuide = null;
    return;
  }
  var lingering = S.action !== "wall" && gd.snapped && gd.until > Date.now();
  if (S.action !== "wall" && !lingering) {
    S.wallAngleGuide = null;
    return;
  }
  var w = gd.wall,
    a = S.nodes[w.a],
    b = S.nodes[w.b],
    pa = S.nodes[gd.pair.a.other],
    pb = S.nodes[gd.pair.b.other];
  if (!a || !b || !pa || !pb) return;
  var pulse = gd.snapped ? 0.72 + 0.28 * Math.sin(Date.now() / 85) : 0.72,
    color = gd.snapped ? "224,129,58" : "63,107,120",
    radius = 25;

  function shortArc(p, q1, q2, angleValue) {
    var s = Math.atan2(q1.z - p.z, q1.x - p.x),
      e = Math.atan2(q2.z - p.z, q2.x - p.x),
      d = e - s;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    var X = sx(p.x),
      Y = sz(p.z);
    pc.beginPath();
    pc.arc(X, Y, radius, s, s + d, d < 0);
    pc.stroke();
    var mid = s + d / 2,
      lx = p.x + (Math.cos(mid) * (radius + 13)) / S.SC,
      lz = p.z + (Math.sin(mid) * (radius + 13)) / S.SC;
    label(lx, lz, Math.round(angleValue) + "°", "rgb(" + color + ")");
    if (gd.snapped) {
      // identical double witness ticks on both arcs are the CAD convention for
      // equality; their pulse is the small animation confirming the catch.
      [-2.5, 2.5].forEach(function (off) {
        var rr = radius + off,
          tx = X + Math.cos(mid) * rr,
          ty = Y + Math.sin(mid) * rr,
          nx = Math.cos(mid),
          ny = Math.sin(mid);
        pc.beginPath();
        pc.moveTo(tx - nx * 3.5, ty - ny * 3.5);
        pc.lineTo(tx + nx * 3.5, ty + ny * 3.5);
        pc.stroke();
      });
    }
  }

  pc.save();
  pc.strokeStyle = "rgba(" + color + "," + pulse + ")";
  pc.fillStyle = "rgba(" + color + "," + pulse + ")";
  pc.lineWidth = gd.snapped ? 2.4 : 1.5;
  pc.setLineDash(gd.snapped ? [] : [5, 4]);
  shortArc(a, b, pa, gd.angleA);
  shortArc(b, a, pb, gd.angleB);
  pc.setLineDash([]);

  var mx = (a.x + b.x) / 2,
    mz = (a.z + b.z) / 2;
  if (!gd.snapped) {
    var dl = Math.hypot(gd.correctionX, gd.correctionZ);
    if (dl > 0.001) {
      var ux = gd.correctionX / dl,
        uz = gd.correctionZ / dl,
        X = sx(mx),
        Y = sz(mz),
        ex = X + ux * 22,
        ey = Y + uz * 22;
      pc.beginPath();
      pc.moveTo(X, Y);
      pc.lineTo(ex, ey);
      pc.lineTo(ex - ux * 7 - uz * 4, ey - uz * 7 + ux * 4);
      pc.moveTo(ex, ey);
      pc.lineTo(ex - ux * 7 + uz * 4, ey - uz * 7 - ux * 4);
      pc.stroke();
    }
  }
  pc.restore();
  var wg = wallGeom(w),
    gnx = -wg.uz,
    gnz = wg.ux,
    neighbourMidX = (pa.x + pb.x) / 2,
    neighbourMidZ = (pa.z + pb.z) / 2,
    openSide =
      (neighbourMidX - mx) * gnx + (neighbourMidZ - mz) * gnz > 0 ? -1 : 1,
    badgeOff = (42 * openSide) / S.SC;
  // In split view a wall can sit less than 42 px from the canvas edge. Keep
  // the confirmation visible by using the other face when the open side would
  // be clipped (the larger offset still clears the wall's own dimension).
  var badgeX = mx + gnx * badgeOff,
    badgeZ = mz + gnz * badgeOff,
    badgePx = sx(badgeX),
    badgePy = sz(badgeZ);
  if (badgePx < 24 || badgePx > S.CW - 24 || badgePy < 18 || badgePy > S.CH - 18) {
    badgeOff *= -1;
    badgeX = mx + gnx * badgeOff;
    badgeZ = mz + gnz * badgeOff;
  }
  label(
    badgeX,
    badgeZ,
    gd.snapped
      ? t("snap_symmetry", { a: Math.round(gd.angleA) })
      : t("snap_symmetry_move", { d: Math.max(1, Math.round(Math.abs(gd.angleA - gd.angleB))) }),
    "rgb(" + color + ")",
    gd.snapped,
  );
}

/* Where the cursor sits along the wall it is over, as the pair of distances a
   tape measure would give: start→here and here→end (interior, so the two add up
   to the wall's own label). Drawn for hovering, for dragging a piece and for
   drawing the next wall, because that is exactly when the question comes up. */
function drawWallProbe() {
  var wp = S.wallProbe;
  if (!wp || !wp.wall || S.walls.indexOf(wp.wall) === -1) return;
  var w = wp.wall,
    gm = wallGeom(w);
  var X = sx(wp.x),
    Y = sz(wp.z),
    // the tick across the wall, a little proud of it on both faces
    ext = (w.thickness / 2 + 5) * S.SC,
    nx = -gm.uz * ext,
    nz = gm.ux * ext;
  pc.save();
  pc.strokeStyle = "#e0813a";
  pc.lineWidth = 1.4;
  pc.setLineDash([4, 3]);
  pc.beginPath();
  pc.moveTo(X + nx, Y + nz);
  pc.lineTo(X - nx, Y - nz);
  pc.stroke();
  pc.setLineDash([]);
  pc.restore();
  // each number sits on its own half, offset off the wall so it never covers it
  var off = 16 / (S.SC || 1);
  label(
    (gm.a.x + wp.x) / 2 - gm.uz * off,
    (gm.a.z + wp.z) / 2 + gm.ux * off,
    Math.round(wp.fromA) + "",
    "#b35f19",
  );
  label(
    (wp.x + gm.b.x) / 2 - gm.uz * off,
    (wp.z + gm.b.z) / 2 + gm.ux * off,
    Math.round(wp.toB) + "",
    "#b35f19",
  );
}
function drawOpening(o) {
  var w = wallById(o.wall);
  if (!w) return;
  var gm = wallGeom(w);
  var s = clamp(o.s, o.width / 2, gm.L - o.width / 2);
  var centre = wallPointAt(w, s), tangent = wallTangentAt(w, s);
  if (!centre || !tangent) return;
  var cx = centre.x, cz = centre.z;
  var isSel = (S.sel && S.sel.kind === "opening" && S.sel.ref === o) ||
    eraseHover("opening", o);
  pc.save();
  pc.translate(sx(cx), sz(cz));
  pc.rotate(Math.atan2(tangent.z, tangent.x));
  var hw = (o.width / 2) * S.SC,
    ht = (w.thickness / 2 + 1) * S.SC;
  if (isPresentation()) {
    /* The wall is already open here (clipOutsideOpenings); a door gets a
       pale stone threshold and a window a white sill under its glass. */
    var pth = planTheme(), wt = (w.thickness / 2) * S.SC;
    pc.fillStyle = o.type === "door" ? pth.threshold : pth.sill;
    pc.fillRect(-hw, -wt, hw * 2, wt * 2);
  } else {
    pc.fillStyle = "#efe7d6";
    pc.fillRect(-hw, -ht, hw * 2, ht * 2);
  }
  if (o.type === "door") {
    if (o.isSliding || o.isPocket) {
      var isPocket = !!o.isPocket;
      var py = isPocket ? 0 : 2; // pocket inside wall (0), sliding outside (2)
      
      var spaceLeft = s - o.width / 2;
      var spaceRight = gm.L - (s + o.width / 2);
      var canLeft = spaceLeft >= o.width - 10;
      var canRight = spaceRight >= o.width - 10;
      var slideDir = 1;
      if (o.slideDir === "-1") slideDir = -1;
      else if (o.slideDir === "1") slideDir = 1;
      else slideDir = canRight ? 1 : (canLeft ? -1 : 1);
      
      var spaceError = (slideDir === 1 && !canRight) || (slideDir === -1 && !canLeft);

      pc.fillStyle = "#fff";
      pc.fillRect(-hw, isPocket ? -2 : 0, hw * 2, 4);
      pc.strokeStyle = isSel ? "#3f6b78" : "#5b7a86";
      pc.lineWidth = 1.5;
      pc.strokeRect(-hw, isPocket ? -2 : 0, hw * 2, 4);

      pc.beginPath();
      if (slideDir === 1) {
        pc.moveTo(-hw, py);
        pc.lineTo(hw + Math.min(hw * 2, spaceRight * S.SC), py);
      } else {
        pc.moveTo(hw, py);
        pc.lineTo(-hw - Math.min(hw * 2, spaceLeft * S.SC), py);
      }
      pc.strokeStyle = spaceError ? "red" : (isSel ? "#3f6b78" : "#999");
      pc.lineWidth = 2;
      if (isPocket) pc.setLineDash([4, 4]);
      pc.stroke();
      if (isPocket) pc.setLineDash([]);

      var ax = Math.min(hw * 1.5, hw + Math.max(0, (slideDir === 1 ? spaceRight : spaceLeft) * S.SC - 5));
      pc.beginPath();
      if (slideDir === 1) {
        pc.moveTo(ax, py - 4);
        pc.lineTo(ax + 5, py);
        pc.lineTo(ax, py + 4);
      } else {
        pc.moveTo(-ax, py - 4);
        pc.lineTo(-ax - 5, py);
        pc.lineTo(-ax, py + 4);
      }
      pc.strokeStyle = spaceError ? "red" : (isSel ? "#3f6b78" : "#5b7a86");
      pc.lineWidth = 1.5;
      pc.stroke();

      if (spaceError) {
        pc.fillStyle = "red";
        pc.font = "bold 14px Arial";
        pc.textAlign = "center";
        pc.fillText("!", 0, -10);
      }
    } else if (o.isDouble) {
      var pairInward = String(o.swingDir || "R_IN").slice(-2) === "IN",
        pairSide = pairInward ? -1 : 1,
        leftLeaf = Math.max(1, Math.min(o.width - 1, Number(o.leafA) || o.width / 2)) * S.SC,
        rightLeaf = hw * 2 - leftLeaf,
        pairConflict = openingHasSwingConflict(o);
      pc.strokeStyle = pairConflict ? "#c0392b" : (isSel ? "#3f6b78" : isPresentation() ? "#4a443c" : "#5b7a86");
      pc.lineWidth = isSel ? 3 : 2;
      [[-hw, leftLeaf, 1], [hw, rightLeaf, -1]].forEach(function (leaf) {
        pc.beginPath(); pc.moveTo(leaf[0], 0); pc.lineTo(leaf[0], pairSide * leaf[1]); pc.stroke();
        pc.beginPath();
        var closed = leaf[2] > 0 ? 0 : Math.PI, opened = pairSide > 0 ? Math.PI / 2 : -Math.PI / 2;
        pc.arc(leaf[0], 0, leaf[1], closed, opened, (leaf[2] > 0) === pairInward); pc.stroke();
      });
    } else {
      // Reflect chosen swing: hinge side (L/R) + opening face (IN/OUT).
      var swingDir = o.swingDir || "R_IN";
      var isLeftHinge = swingDir.charAt(0) === "L";
      var isInward = swingDir.slice(-2) === "IN";
      var hx = isLeftHinge ? -hw : hw; // hinge jamb
      var leafDir = isLeftHinge ? 1 : -1; // toward the far jamb along the wall
      var sy = isInward ? -1 : 1; // wall face the leaf sweeps toward
      var dw = hw * 2; // door leaf length
      var swingConflict = openingHasSwingConflict(o);
      pc.strokeStyle = swingConflict ? "#c0392b" : (isSel ? "#3f6b78" : isPresentation() ? "#4a443c" : "#5b7a86");
      pc.lineWidth = isSel ? 3 : 2;
      // Open leaf: perpendicular into the room, on the swing face.
      pc.beginPath();
      pc.moveTo(hx, 0);
      pc.lineTo(hx, sy * dw);
      pc.stroke();
      // Swing arc from closed (along wall) to open (perpendicular).
      var aClosed = leafDir > 0 ? 0 : Math.PI;
      var aOpen = sy > 0 ? Math.PI / 2 : -Math.PI / 2;
      pc.beginPath();
      pc.arc(hx, 0, dw, aClosed, aOpen, isLeftHinge === isInward);
      pc.stroke();
      if (swingConflict) {
        pc.fillStyle = "#c0392b";
        pc.font = "bold 13px Arial";
        pc.textAlign = "center";
        pc.fillText("!", 0, -10);
      }
    }
  } else if (o.type === "passage") {
    pc.strokeStyle = isSel ? "#3f6b78" : "#8a7f68";
    pc.lineWidth = isSel ? 3 : 2.2;
    pc.beginPath();
    pc.moveTo(-hw, -ht);
    pc.lineTo(-hw, ht);
    pc.moveTo(hw, -ht);
    pc.lineTo(hw, ht);
    pc.stroke();
  } else {
    pc.fillStyle = isSel ? "#bcdcea" : "#cfe3ec";
    pc.fillRect(-hw, -ht * 0.5, hw * 2, ht);
    pc.strokeStyle = isSel ? "#3f6b78" : "#7aa3b3";
    pc.lineWidth = isSel ? 3 : 1.6;
    pc.strokeRect(-hw, -ht * 0.5, hw * 2, ht);
    pc.beginPath();
    pc.moveTo(-hw, 0);
    pc.lineTo(hw, 0);
    pc.stroke();
  }
  pc.restore();
}
function drawSegPreview(w, seg) {
  var gm = wallGeom(w),
    hw = Math.max(5, seg.width) / 2,
    s = Math.max(hw, Math.min(gm.L - hw, seg.s));
  pc.save();
  pc.lineCap = "butt";
  pc.strokeStyle = "rgba(70,150,90,.85)";
  pc.lineWidth = Math.max(w.thickness * S.SC, 4);
  pc.setLineDash([7, 5]);
  pc.beginPath();
  var steps = gm.kind === "arc" ? Math.max(6, Math.ceil(seg.width / 15)) : 1;
  for (var i = 0; i <= steps; i++) {
    var p = wallPointAt(w, s - hw + seg.width * i / steps);
    if (!p) continue;
    if (i) pc.lineTo(sx(p.x), sz(p.z)); else pc.moveTo(sx(p.x), sz(p.z));
  }
  pc.stroke();
  pc.setLineDash([]);
  pc.restore();
}
/* `chromeOnly` is the HUD pass asking for the highlighted corners alone: the
   selected dots and the grips on the selected wall, drawn over the plain dots
   the model pass already laid down. A corner the drag proxy has lifted counts
   as highlighted too, which is what keeps a dragged corner moving while the
   model canvas holds still. */
function drawNodes(hid, chromeOnly) {
  // corners of hidden-away walls go with them (usedNodes() spans every wall)
  var u = {};
  S.walls.forEach(function (w) {
    if (hid.walls[w.id]) return;
    if (!chromeOnly && proxied("wall", w)) return;
    u[w.a] = 1;
    u[w.b] = 1;
  });
  for (var k in u) {
    var n = S.nodes[k];
    if (!n || !isFinite(n.x) || !isFinite(n.z)) continue;
    var isSel = chromeOn && S.sel && (
        (S.sel.kind === "node" && S.sel.ref === +k) ||
        (S.sel.kind === "nodes" && S.sel.refs.indexOf(+k) !== -1)
      );
    if (chromeOnly && !isSel && !proxied("node", +k)) continue;
    if (!chromeOnly && proxied("node", +k)) continue;
    pc.beginPath();
    pc.arc(sx(n.x), sz(n.z), isSel ? 6 : 4.2, 0, 7);
    pc.fillStyle = isSel ? "#3f6b78" : "#fff";
    pc.fill();
    pc.lineWidth = 1.6;
    pc.strokeStyle = isSel ? "#2c5560" : "#7a7060";
    pc.stroke();
  }
  /* Grips on the ends of the SELECTED wall. Dragging one resizes that wall
     only — the walls sharing the corner hold their locked dimensions and let go
     of the joint (js/constraint_engine.js) — while dragging a bare corner still
     moves the whole junction. The two gestures land on the same pixel, so the
     grip is the only thing that tells them apart. */
  if (chromeOn && S.sel && S.sel.kind === "wall" && !hid.walls[S.sel.ref.id]) {
    var sw = S.sel.ref;
    [S.nodes[sw.a], S.nodes[sw.b]].forEach(function (n) {
      if (!n) return;
      var X = sx(n.x),
        Z = sz(n.z),
        h = 5;
      pc.beginPath();
      pc.rect(X - h, Z - h, h * 2, h * 2);
      pc.fillStyle = "#fff";
      pc.fill();
      pc.lineWidth = 2;
      pc.strokeStyle = "#3f6b78";
      pc.stroke();
    });
  }
}

function drawWarnGlow() {
  var list = activeWarnings();
  if (!list.length) return;
  var pulse = 0.5 + 0.5 * Math.sin(warnPhase * 2.2); // 0..1
  pc.save();
  list.forEach(function (wr) {
    var hot = S.warnHover === wr.key || S.warnSel === wr.key;
    var c = WARN_COL[wr.kind] || WARN_COL.angle,
      rgb = c[0] + "," + c[1] + "," + c[2];
    var X = sx(wr.x),
      Z = sz(wr.z);
    var base = hot ? 15 : 11,
      r = base + pulse * (hot ? 5 : 3);
    // the halo itself
    var grd = pc.createRadialGradient(X, Z, 1, X, Z, r * 1.9);
    grd.addColorStop(0, "rgba(" + rgb + "," + (hot ? 0.55 : 0.34) + ")");
    grd.addColorStop(1, "rgba(" + rgb + ",0)");
    pc.beginPath();
    pc.arc(X, Z, r * 1.9, 0, 7);
    pc.fillStyle = grd;
    pc.fill();
    // a crisp ring so it reads as a marker, not a smudge
    pc.beginPath();
    pc.arc(X, Z, r, 0, 7);
    pc.strokeStyle = "rgba(" + rgb + "," + (hot ? 1 : 0.85) + ")";
    pc.lineWidth = hot ? 2.4 : 1.6;
    pc.stroke();
    if (wr.kind === "openEnd") {
      // an open end gets a cross: nothing lands here
      var q = r * 0.42;
      pc.beginPath();
      pc.moveTo(X - q, Z - q);
      pc.lineTo(X + q, Z + q);
      pc.moveTo(X + q, Z - q);
      pc.lineTo(X - q, Z + q);
      pc.stroke();
    }
    if (!hot) return;
    // trace the walls this warning is about
    pc.lineWidth = 3;
    pc.strokeStyle = "rgba(" + rgb + ",.9)";
    pc.setLineDash([9, 6]);
    wr.walls.forEach(function (id) {
      var w = wallById(id);
      if (!w) return;
      traceWallCentre(w);
      pc.stroke();
    });
    pc.setLineDash([]);
  });
  pc.restore();
  // the hovered/picked warning names itself, above every halo
  var hotW = null;
  list.forEach(function (wr) {
    if (S.warnHover === wr.key || S.warnSel === wr.key) hotW = wr;
  });
  if (hotW)
    label(
      hotW.x,
      hotW.z - 26 / S.SC,
      warnLabel(hotW),
      hotW.kind === "openEnd" ? "#c92b2b" : "#a86c05",
      true,
    );
}

export {
  canvasDpr, clipOutsideOpenings, drawCachedRooms, drawNodes, drawOpening,
  drawPresentationWalls, drawReferenceFloor, drawSegPreview, drawSnapFlash,
  drawWallAngleGuide, drawWallProbe, drawWarnGlow, ensureAngleGuideAnim,
  traceWallCentre, wallBandPolygon, wallPath,
};
