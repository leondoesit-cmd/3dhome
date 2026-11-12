/* MEP run/node drawing, flow arrows and device geometry, split out of
   js/mep.js. It shares the editor's state through live imports from ../mep.js.
   */
import { detectRooms, pointInPoly, wallGeom } from "../geometry.js";
import { t } from "../i18n.js";
import { layerBadge, runMidpoint, smallBadge, warnBadge } from "../mep/clashes.js";
import { nodePos, runLength } from "../mep/topology.js";
import { S, clamp } from "../state.js";
import {
  MEP_LAYER_TAG, MEP_SYS, _mepRot, ceilingY, ensureMEP, layerNodeY,
  mepLayerVisible, mepVisible, nodeKindDef, runColor, runKindDef, runPointY,
} from "../mep.js";

// point + unit tangent at half the polyline length (for the direction arrow)
function runMidTangent(r) {
  var total = runLength(r), half = total / 2, acc = 0;
  for (var i = 1; i < r.pts.length; i++) {
    var a = r.pts[i - 1], b = r.pts[i], segx = b.x - a.x, segz = b.z - a.z, seg = Math.hypot(segx, segz) || 1;
    if (acc + seg >= half) {
      var tt = (half - acc) / seg;
      return { x: a.x + segx * tt, z: a.z + segz * tt, tx: segx / seg, tz: segz / seg };
    }
    acc += seg;
  }
  var a0 = r.pts[0], b0 = r.pts[r.pts.length - 1], L = Math.hypot(b0.x - a0.x, b0.z - a0.z) || 1;
  return { x: (a0.x + b0.x) / 2, z: (a0.z + b0.z) / 2, tx: (b0.x - a0.x) / L, tz: (b0.z - a0.z) / L };
}
function runTangentAt(r, t) {
  var total = runLength(r), want = total * t, acc = 0;
  if (!(total > 0)) return runMidTangent(r);
  for (var i = 1; i < r.pts.length; i++) {
    var a = r.pts[i - 1], b = r.pts[i], segx = b.x - a.x, segz = b.z - a.z, seg = Math.hypot(segx, segz) || 1;
    if (acc + seg >= want || i === r.pts.length - 1) {
      var tt = Math.max(0, Math.min(1, (want - acc) / seg));
      return { x: a.x + segx * tt, z: a.z + segz * tt, tx: segx / seg, tz: segz / seg };
    }
    acc += seg;
  }
  return runMidTangent(r);
}
// filled arrowhead. `at` is 0..1 along the run; the default is the midpoint.
function drawFlowArrow(pc, sx, sz, r, dir, col, at) {
  var mt = at == null ? runMidTangent(r) : runTangentAt(r, at);
  var ux = mt.tx * dir, uz = mt.tz * dir;
  var ang = Math.atan2(uz, ux), size = 5.5;
  pc.save();
  pc.translate(sx(mt.x), sz(mt.z));
  pc.rotate(ang);
  pc.beginPath();
  pc.moveTo(size, 0);
  pc.lineTo(-size * 0.7, size * 0.7);
  pc.lineTo(-size * 0.7, -size * 0.7);
  pc.closePath();
  pc.fillStyle = "#fff";
  pc.strokeStyle = col;
  pc.lineWidth = 1.2;
  pc.fill();
  pc.stroke();
  pc.restore();
}

function drawRun(pc, sx, sz, r, issue, flowInfo, phase) {
  if (r.pts.length < 2) {
    // a single-point run (just started) — nothing to stroke yet
  }
  var col = runColor(r);
  var d = runKindDef(r.sys, r.k) || {};
  var selected = S.sel && S.sel.kind === "mepRun" && S.sel.ref === r;
  var lw = clamp(r.dia * 1.1, r.layer === "floor" ? 3.2 : 1.6, 6);
  var dead = flowInfo && !flowInfo.alive; // routed but not traced to a source
  pc.save();
  pc.lineJoin = "round";
  pc.lineCap = "round";
  if (dead) pc.globalAlpha = 0.4; // dim the "not alive" runs
  // selection halo
  if (selected) {
    pc.beginPath();
    traceRun(pc, sx, sz, r);
    pc.strokeStyle = "rgba(63,107,120,.35)";
    pc.lineWidth = lw + 7;
    pc.setLineDash([]);
    pc.stroke();
  }
  // A bright dashed casing keeps the route legible over both dark tile and
  // light timber while the solid core retains its system colour. The former
  // low-opacity coloured dots disappeared against busy floor textures.
  if (r.layer === "floor") {
    pc.beginPath();
    traceRun(pc, sx, sz, r);
    pc.strokeStyle = "#ffffff";
    pc.globalAlpha = dead ? 0.45 : 0.9;
    pc.lineWidth = lw + 5;
    pc.setLineDash([7, 5]);
    pc.stroke();
    pc.globalAlpha = dead ? 0.4 : 1;
  }
  pc.beginPath();
  traceRun(pc, sx, sz, r);
  pc.strokeStyle = col;
  pc.lineWidth = lw;
  pc.setLineDash((d.dash || []).map(function (v) { return v; }));
  pc.stroke();
  pc.setLineDash([]);
  // vertices
  pc.fillStyle = col;
  r.pts.forEach(function (p) {
    pc.beginPath();
    pc.arc(sx(p.x), sz(p.z), selected ? 3.2 : 2.2, 0, 7);
    pc.fill();
  });
  pc.globalAlpha = 1;
  // Live runs show how the service actually moves. Supply, gravity and return
  // get one arrow and, while motion is allowed, travelling dashes. A vent is
  // air leaving the stack, so it gets the arrow only. Data is a link: two
  // opposing marks, not a stream.
  if (flowInfo && flowInfo.alive) {
    var mode = flowInfo.flow || "supply";
    if (phase != null && mode !== "signal" && mode !== "vent") {
      pc.beginPath();
      traceRun(pc, sx, sz, r);
      pc.strokeStyle = "rgba(255,255,255,0.92)";
      pc.lineWidth = Math.max(1.2, lw * 0.55);
      pc.setLineDash([5, 13]);
      pc.lineDashOffset = flowInfo.dir > 0 ? -phase : phase;
      pc.stroke();
      pc.setLineDash([]);
      pc.lineDashOffset = 0;
    }
    if (mode === "signal") {
      drawFlowArrow(pc, sx, sz, r, 1, col, 0.35);
      drawFlowArrow(pc, sx, sz, r, -1, col, 0.65);
    } else drawFlowArrow(pc, sx, sz, r, flowInfo.dir, col);
  }
  // unsupplied flag (no hub upstream) at the run midpoint
  if (issue === "unsupplied") {
    var mp = runMidpoint(r);
    warnBadge(pc, sx(mp.x), sz(mp.z), "#d97706");
  }
  if (flowInfo && flowInfo.uphill) {
    var slope = runMidTangent(r);
    warnBadge(pc, sx(slope.x - slope.tz * 16), sz(slope.z + slope.tx * 16), "#b45309");
  }
  if (flowInfo && flowInfo.bedroom) {
    var bedPt = runMidpoint(r);
    smallBadge(pc, sx(bedPt.x), sz(bedPt.z), "#a16207", "!");
  }
  // routing-plane tag (ceiling/floor) at the first vertex
  var rtag = MEP_LAYER_TAG[r.layer];
  if (rtag) layerBadge(pc, sx(r.pts[0].x), sz(r.pts[0].z), rtag);
  pc.restore();
}
function traceRun(pc, sx, sz, r) {
  r.pts.forEach(function (p, i) {
    if (i) pc.lineTo(sx(p.x), sz(p.z));
    else pc.moveTo(sx(p.x), sz(p.z));
  });
}

function drawNode(pc, sx, sz, n, issue) {
  var sys = MEP_SYS[n.sys];
  if (!sys) return;
  var def = nodeKindDef(n.sys, n.k) || {};
  var col = sys.color;
  var p = nodePos(n);
  var X = sx(p.x), Y = sz(p.z);
  var selected = S.sel && S.sel.kind === "mepNode" && S.sel.ref === n;
  var R = def.hub ? 9 : 7;
  pc.save();
  if (selected) {
    pc.beginPath();
    pc.arc(X, Y, R + 5, 0, 7);
    pc.fillStyle = "rgba(63,107,120,.30)";
    pc.fill();
  }
  pc.fillStyle = "#fff";
  pc.strokeStyle = col;
  pc.lineWidth = 2.2;
  if (def.hub) {
    roundRect(pc, X - R, Y - R, R * 2, R * 2, 3);
    pc.fill();
    pc.stroke();
  } else {
    pc.beginPath();
    pc.arc(X, Y, R, 0, 7);
    pc.fill();
    pc.stroke();
  }
  // Conventional high-contrast plan symbols. Text remains the fallback for
  // specialist equipment, while the everyday electrical/plumbing devices no
  // longer depend on knowing an internal one-letter code.
  pc.save();
  if (_mepRot) { pc.translate(X, Y); pc.rotate(-_mepRot); pc.translate(-X, -Y); }
  pc.strokeStyle = col; pc.fillStyle = col; pc.lineWidth = 1.8;
  if (n.sys === "power" && n.k === "outlet") {
    pc.beginPath(); pc.arc(X - 2.2, Y, 1.5, 0, 7); pc.moveTo(X + 3.7, Y); pc.arc(X + 2.2, Y, 1.5, 0, 7); pc.stroke();
  } else if (n.sys === "power" && n.k === "switch") {
    pc.beginPath(); pc.arc(X - 2.5, Y + 2, 1.2, 0, 7); pc.moveTo(X - 1.5, Y + 1); pc.lineTo(X + 3.5, Y - 3.5); pc.stroke();
  } else if (n.sys === "power" && n.k === "light") {
    pc.beginPath(); pc.moveTo(X - 4, Y - 4); pc.lineTo(X + 4, Y + 4); pc.moveTo(X + 4, Y - 4); pc.lineTo(X - 4, Y + 4); pc.stroke();
  } else if (n.sys === "drain" && n.k === "floor") {
    pc.strokeRect(X - 3.5, Y - 3.5, 7, 7); pc.beginPath(); pc.moveTo(X - 3, Y); pc.lineTo(X + 3, Y); pc.moveTo(X, Y - 3); pc.lineTo(X, Y + 3); pc.stroke();
  } else {
    pc.font = "700 " + (def.hub ? 10 : 8) + "px system-ui, sans-serif";
    pc.textAlign = "center"; pc.textBaseline = "middle";
    pc.fillText(def.code || "?", X, Y + 0.5);
  }
  pc.restore();
  // connection flag: orphan (touches no run) = red; unsupplied (no hub upstream) = amber
  if (issue) {
    warnBadge(pc, X + R * 0.9, Y - R * 0.9, issue === "orphan" ? "#dc2626" : "#d97706");
  }
  // routing-plane tag (ceiling/floor) at the opposite corner
  var ntag = MEP_LAYER_TAG[n.layer];
  if (ntag) layerBadge(pc, X - R * 0.9, Y - R * 0.9, ntag);
  pc.restore();
}

function drawRoutePreview(pc, sx, sz, label, route) {
  var sys = MEP_SYS[route.sys];
  if (!sys) return;
  pc.save();
  pc.lineJoin = "round";
  pc.lineCap = "round";
  // committed segments
  pc.beginPath();
  route.pts.forEach(function (p, i) {
    if (i) pc.lineTo(sx(p.x), sz(p.z));
    else pc.moveTo(sx(p.x), sz(p.z));
  });
  pc.strokeStyle = sys.color;
  pc.lineWidth = 2.4;
  pc.stroke();
  // vertices
  pc.fillStyle = sys.color;
  route.pts.forEach(function (p) {
    pc.beginPath();
    pc.arc(sx(p.x), sz(p.z), 3, 0, 7);
    pc.fill();
  });
  // rubber-band segment to the resolved cursor, with the CAD readout. In
  // wall-follow mode the band traces the routed path, not the straight line.
  if (route.preview) {
    var last = route.pts[route.pts.length - 1];
    var band = route.previewPath && route.previewPath.length
      ? [last].concat(route.previewPath)
      : [last, { x: route.preview.x, z: route.preview.z }];
    pc.beginPath();
    band.forEach(function (p, i) {
      if (i) pc.lineTo(sx(p.x), sz(p.z));
      else pc.moveTo(sx(p.x), sz(p.z));
    });
    pc.setLineDash([6, 5]);
    pc.strokeStyle = route.previewBlocked ? "#dc2626" : sys.color;
    pc.lineWidth = 2;
    pc.stroke();
    pc.setLineDash([]);
    if (label) {
      var deg = Math.round((route.preview.ang * 180) / Math.PI);
      if (deg < 0) deg += 360;
      var txt = route.previewBlocked
        ? t("mep_routeBlocked")
        : Math.round(route.preview.len) + "cm · " + deg + "°";
      if (route.preview.dAng != null) txt += " · Δ" + route.preview.dAng + "°";
      label(
        (last.x + route.preview.x) / 2,
        (last.z + route.preview.z) / 2,
        txt,
        sys.color,
      );
    }
  }
  pc.restore();
}

function roundRect(pc, x, y, w, h, r) {
  pc.beginPath();
  pc.moveTo(x + r, y);
  pc.arcTo(x + w, y, x + w, y + h, r);
  pc.arcTo(x + w, y + h, x, y + h, r);
  pc.arcTo(x, y + h, x, y, r);
  pc.arcTo(x, y, x + w, y, r);
  pc.closePath();
}

/* ---- 3D building --------------------------------------------------------- */
// Called from rebuild3D(). Adds thin colored tubes for runs (at each system's
// conduit height) and small markers for devices to the dynamic group.
export function buildMEP3D(group, THREE) {
  var m = ensureMEP();
  if (!m.show || !m.show3D) return;
  var matCache = {};
  function matFor(hex, underFloor) {
    var key = hex + (underFloor ? ":under-floor" : "");
    if (!matCache[key]) {
      matCache[key] = underFloor && m.xray.floor
        ? new THREE.MeshBasicMaterial({
          color: hex, transparent: true, opacity: 0.96,
          depthTest: false, depthWrite: false,
        })
        : new THREE.MeshStandardMaterial({
          color: hex, roughness: 0.5, metalness: 0.2,
          emissive: new THREE.Color(hex).multiplyScalar(0.12),
        });
    }
    return matCache[key];
  }
  var exposedDuctMat = new THREE.MeshStandardMaterial({
    color: 0xa8b3ba,
    roughness: 0.34,
    metalness: 0.72,
  });
  var hangerMat = new THREE.MeshStandardMaterial({ color: 0x4b5563, roughness: 0.65, metalness: 0.55 });
  var jointSeen = {};
  // runs → cylinders between consecutive points at the layer's conduit height
  // (rectangular sections for ductwork, which is what `rect` kinds are for)
  m.runs.forEach(function (r) {
    if (!mepVisible(r.sys) || !mepLayerVisible(r.layer)) return;
    var ys = runPointY(r);
    var hex = new THREE.Color(runColor(r)).getHex();
    // A 20 mm supply line is sub-pixel at an apartment-wide camera distance.
    // Give concealed lines a minimum *display* radius in 3D; model diameter
    // and exported design properties remain unchanged.
    var rad = Math.max(r.layer === "floor" ? 2.4 : 0.8, r.dia / 2);
    var kd = runKindDef(r.sys, r.k);
    for (var i = 1; i < r.pts.length; i++) {
      var A = r.pts[i - 1], B = r.pts[i];
      var seg = kd && kd.rect
        ? segBox(THREE, r.exposed ? exposedDuctMat : matFor(hex, r.layer === "floor"), A.x, ys[i - 1], A.z, B.x, ys[i], B.z, r.dia, kd.hRatio || 0.6)
        : segCylinder(THREE, matFor(hex, r.layer === "floor"), A.x, ys[i - 1], A.z, B.x, ys[i], B.z, rad);
      if (seg) {
        // Transparent slab and furniture render before these inspection
        // guides, so an under-floor route cannot disappear into the finish.
        if (r.layer === "floor" && m.xray.floor) seg.renderOrder = 20;
        group.add(seg);
      }
      if (seg && r.exposed && kd && kd.rect) {
        // Visible sheet-metal collars make every bend/join legible, and a slim
        // hanger connects each exposed segment back to the ceiling slab.
        [i - 1, i].forEach(function (vi) {
          var P = r.pts[vi], key = Math.round(P.x) + "_" + Math.round(P.z) + "_" + Math.round(ys[vi]);
          if (jointSeen[key]) return;
          jointSeen[key] = 1;
          var collar = new THREE.Mesh(
            new THREE.BoxGeometry(r.dia + 2, Math.max(6, r.dia * (kd.hRatio || 0.6) + 2), 4),
            matFor(hex),
          );
          collar.position.set(P.x, ys[vi], P.z);
          collar.rotation.y = Math.atan2(B.x - A.x, B.z - A.z);
          group.add(collar);
        });
        var mx = (A.x + B.x) / 2, mz = (A.z + B.z) / 2;
        var top = ys[i - 1] + Math.max(4, r.dia * (kd.hRatio || 0.6) / 2);
        var slab = ceilingY() - 2;
        var hanger = segCylinder(THREE, hangerMat, mx, top, mz, mx, slab, mz, 0.65);
        if (hanger) group.add(hanger);
      }
    }
  });
  // devices → small boxes (hubs bigger) at their layer height
  m.nodes.forEach(function (n) {
    if (!mepVisible(n.sys) || !mepLayerVisible(n.layer)) return;
    var def = nodeKindDef(n.sys, n.k) || {};
    var p = nodePos(n);
    var hex = new THREE.Color(MEP_SYS[n.sys].color).getHex();
    var s = def.hub ? 12 : 7, marker;
    if (n.sys === "power" && n.k === "light") {
      marker = new THREE.Mesh(new THREE.CylinderGeometry(8, 8, 2.5, 20), matFor(hex));
    } else {
      var w = n.sys === "power" && n.k === "outlet" ? 9 : n.sys === "power" && n.k === "switch" ? 7 : s;
      var h = n.sys === "power" && (n.k === "outlet" || n.k === "switch") ? 12 : s;
      marker = new THREE.Mesh(new THREE.BoxGeometry(w, h, Math.max(2.2, s * 0.3)), matFor(hex));
      if (n.wall != null) {
        var host = S.walls.find(function(wall) { return wall.id === n.wall; });
        if (host) { var wg = wallGeom(host); marker.rotation.y = -Math.atan2(wg.uz, wg.ux); }
      }
    }
    var surface = deviceSurfacePosition(n);
    marker.position.set(surface.x, layerNodeY(n), surface.z);
    group.add(marker);
  });
  // vertical risers: connect same-system entities that meet in plan (x,z) but
  // sit on different planes — e.g. a ceiling run dropping to a wall switch, or
  // an under-floor pipe rising into a wall.
  var anchors = [];
  m.nodes.forEach(function (n) {
    if (!mepVisible(n.sys) || !mepLayerVisible(n.layer)) return;
    var p = nodePos(n);
    anchors.push({ x: p.x, z: p.z, y: layerNodeY(n), sys: n.sys });
  });
  m.runs.forEach(function (r) {
    if (!mepVisible(r.sys) || !mepLayerVisible(r.layer)) return;
    var ys = runPointY(r);
    // Every routed vertex is an anchor, not only the two polyline endpoints.
    // Chained socket circuits visit most outlets at interior vertices; limiting
    // risers to the ends made those outlets look physically disconnected in 3D.
    r.pts.forEach(function (p, i) {
      anchors.push({ x: r.pts[i].x, z: r.pts[i].z, y: ys[i], sys: r.sys });
    });
  });
  var riserSeen = {};
  for (var a = 0; a < anchors.length; a++)
    for (var b = a + 1; b < anchors.length; b++) {
      var A2 = anchors[a], B2 = anchors[b];
      if (A2.sys !== B2.sys) continue;
      if (Math.hypot(A2.x - B2.x, A2.z - B2.z) > 12) continue;
      if (Math.abs(A2.y - B2.y) < 3) continue;
      var x = (A2.x + B2.x) / 2, z = (A2.z + B2.z) / 2;
      var key = Math.round(x) + "_" + Math.round(z) + "_" +
        Math.round(Math.min(A2.y, B2.y)) + "_" + Math.round(Math.max(A2.y, B2.y));
      if (riserSeen[key]) continue;
      riserSeen[key] = 1;
      var hex2 = new THREE.Color(MEP_SYS[A2.sys].color).getHex();
      var rr = segCylinder(THREE, matFor(hex2), x, A2.y, z, x, B2.y, z, 1.4);
      if (rr) group.add(rr);
    }
}
// Mount plates on the interior finish instead of burying them at the datum.
export function deviceSurfacePosition(n) {
  var p = nodePos(n), host = S.walls.find(function(w) { return w.id === n.wall; });
  if (!host || n.layer !== "wall") return p;
  var g = wallGeom(host), nx = -g.uz, nz = g.ux;
  var room = detectRooms().find(function(r) { return r.key === n.roomKey; }) ||
    detectRooms().find(function(r) { return pointInPoly(p.x + nx * 20, p.z + nz * 20, r.pts) || pointInPoly(p.x - nx * 20, p.z - nz * 20, r.pts); });
  if (room && !pointInPoly(p.x + nx * 20, p.z + nz * 20, room.pts)) { nx = -nx; nz = -nz; }
  var offset = (host.thickness || 10) / 2 + 1.6;
  return { x: p.x + nx * offset, z: p.z + nz * offset };
}
// a rectangular duct section spanning two 3D points. Width is the run's `dia`
// and height a fraction of it, so a 25cm duct reads as the flat sheet-metal
// box it is; the section stays upright (no roll) because ducts are hung level.
function segBox(THREE, mat, x1, y1, z1, x2, y2, z2, wid, hRatio) {
  var dx = x2 - x1, dy = y2 - y1, dz = z2 - z1;
  var len = Math.hypot(dx, dy, dz);
  if (len < 0.5) return null;
  var h = Math.max(4, wid * hRatio);
  var mesh = new THREE.Mesh(new THREE.BoxGeometry(wid, h, len), mat);
  mesh.position.set((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2);
  // yaw the +Z face along the run; pitch only matters for the rare sloped drop
  mesh.rotation.y = Math.atan2(dx, dz);
  if (Math.abs(dy) > 0.5) mesh.rotation.x = -Math.asin(dy / len);
  return mesh;
}

// a cylinder spanning two 3D points (used for run segments)
function segCylinder(THREE, mat, x1, y1, z1, x2, y2, z2, rad) {
  var dx = x2 - x1, dy = y2 - y1, dz = z2 - z1;
  var len = Math.hypot(dx, dy, dz);
  if (len < 0.5) return null;
  var geom = new THREE.CylinderGeometry(rad, rad, len, 8);
  var mesh = new THREE.Mesh(geom, mat);
  mesh.position.set((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2);
  // align the cylinder's +Y axis with the segment direction
  var up = new THREE.Vector3(0, 1, 0);
  var dir = new THREE.Vector3(dx, dy, dz).normalize();
  mesh.quaternion.setFromUnitVectors(up, dir);
  return mesh;
}

export { drawNode, drawRoutePreview, drawRun };
