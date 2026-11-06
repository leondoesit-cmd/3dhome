/* The 3D view's sampled wall geometry (breaks, corners, prisms, layer
   materials), wall building, item placement and window lights, split out of
   js/view3d.js. It shares the editor's state through live imports from
   ../view3d.js. */
import { FURN, buildItem as buildFurn, elevOffset, itemVSpan, lampColor } from "../furniture.js";
import { tJoinStep, wallBandOutline, wallGeom, wallPointAt, wallSolidAtNode, wallSolidTop, wallTangentAt } from "../geometry.js";
import { legacyIntensity } from "../gpu.js";
import { GLASS, MAT_PROPS, S, WALLC, WOOD, clamp, fin } from "../state.js";
import { THREE } from "../three_lazy.js";
import { addWallCaps, buildStraightWall, clipBelow, cutH, frameSpec, localBox } from "../view3d/site_cutaway.js";
import { HALF_WALL_HEIGHT, normalizeWallKind, normalizeWallProfile, verticalSegments, wallProfileHeight } from "../wall_curves.js";
import { wallFraming } from "../wall_framing.js";
import { normalizeWall, wallLayerBands, wallThickness, wallTypeById } from "../wall_types.js";
import {
  drawnShadows, itemsRoot, mepXray, scene, spareLights, structureRoot,
  tagItemPhysicsRole,
} from "../view3d.js";

/* Curves and vertically-special walls cannot be represented by the old single
   straight extrusion.  Build them as short, watertight prisms along arc length.
   Breakpoints are inserted at opening jambs and editable profile controls, so
   openings stay exact and a sloped top does not become a coarse staircase. */
function sampledWallBreaks(w, gm) {
  var values = [0, gm.L];
  var maxStep = gm.kind === "arc" ? Math.max(8, Math.min(30, gm.curve.radius * Math.PI / 24)) : 80;
  var count = Math.max(1, Math.ceil(gm.L / maxStep));
  for (var i = 1; i < count; i++) values.push((gm.L * i) / count);
  normalizeWallProfile(w).forEach(function (p) { values.push(clamp(p.s, 0, gm.L)); });
  S.openings.forEach(function (o) {
    if (o.wall !== w.id) return;
    values.push(clamp(o.s - o.width / 2, 0, gm.L));
    values.push(clamp(o.s + o.width / 2, 0, gm.L));
  });
  values.sort(function (a, b) { return a - b; });
  return values.filter(function (v, i) { return !i || v - values[i - 1] > 0.01; });
}

function sampledEndCorners(w, s, offset0, offset1, atHeight) {
  var gm = wallGeom(w);
  var nearA = s <= 0.01, nearB = gm && s >= gm.L - 0.01;
  if (gm && gm.kind === "line" && (nearA || nearB)) {
    var step = tJoinStep(w, nearA ? "a" : "b", atHeight);
    if (step) {
      var shift = (offset0 + offset1) / 2 >= -0.01 ? step.tp : step.tm;
      var node = nearA ? (S.nodes[w.a] || gm.a) : (S.nodes[w.b] || gm.b);
      var along = nearA ? 1 : -1,
        ux = gm.ux * along,
        uz = gm.uz * along,
        nx = -gm.uz,
        nz = gm.ux;
      function pt(off) {
        return [node.x + ux * shift + nx * off, node.z + uz * shift + nz * off];
      }
      return [pt(offset0), pt(offset1)];
    }
    var band = wallBandOutline(w, offset0, offset1, atHeight);
    if (band) {
      return nearA
        ? [[band.a0.x, band.a0.z], [band.a1.x, band.a1.z]]
        : [[band.b0.x, band.b0.z], [band.b1.x, band.b1.z]];
    }
  }
  var p = wallPointAt(w, s), t = wallTangentAt(w, s);
  if (!p || !t) return null;
  var nx = -t.uz, nz = t.ux;
  return [
    [p.x + nx * offset0, p.z + nz * offset0],
    [p.x + nx * offset1, p.z + nz * offset1],
  ];
}

function sampledPrismGeometry(w, s0, s1, offset0, offset1, bottom0, bottom1, top0, top1) {
  top0 = Math.max(bottom0, top0);
  top1 = Math.max(bottom1, top1);
  if (s1 - s0 <= 0.001 || (top0 - bottom0 <= 0.001 && top1 - bottom1 <= 0.001)) return null;
  var atHeight = Math.min(bottom0, bottom1);
  var c0 = sampledEndCorners(w, s0, offset0, offset1, atHeight);
  var c1 = sampledEndCorners(w, s1, offset0, offset1, atHeight);
  if (!c0 || !c1) return null;
  var footprint = [c0[0], c0[1], c1[0], c1[1]];
  var pos = [];
  footprint.forEach(function (p, i) { pos.push(p[0], i < 2 ? bottom0 : bottom1, p[1]); });
  footprint.forEach(function (p, i) { pos.push(p[0], i < 2 ? top0 : top1, p[1]); });
  var geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex([
    0, 2, 3, 0, 3, 1,
    4, 5, 7, 4, 7, 6,
    0, 4, 6, 0, 6, 2,
    1, 3, 7, 1, 7, 5,
    0, 1, 5, 0, 5, 4,
    2, 6, 7, 2, 7, 3,
  ]);
  geo.computeVertexNormals();
  return geo;
}

function sampledLayerMaterial(w, band, fallbackColor, xray) {
  var isGeneric = w.wallTypeId === "generic" || band.material === "generic-masonry";
  var color = isGeneric ? fallbackColor : (band.color || fallbackColor);
  var isGlass = band.role === "glazing" || /glass/i.test(String(band.material || ""));
  var opts = { color: color, roughness: isGlass ? 0.12 : 0.9, metalness: 0, flatShading: true };
  if (isGlass) Object.assign(opts, { transparent: true, opacity: 0.34, transmission: 0.72, side: THREE.DoubleSide });
  if (w.phase === "demolition" || w.phase === "demolish") Object.assign(opts, { color: 0xc66b62, transparent: true, opacity: 0.55 });
  if (xray) Object.assign(opts, { transparent: true, opacity: 0.18, depthWrite: false });
  return new THREE.MeshStandardMaterial(opts);
}

function openingAtSample(w, s) {
  for (var i = 0; i < S.openings.length; i++) {
    var o = S.openings[i];
    if (String(o.wall) === String(w.id) && s > o.s - o.width / 2 + 0.001 && s < o.s + o.width / 2 - 0.001) return o;
  }
  return null;
}

function addSampledSolid(group, w, gm, vertical, col, xray) {
  var typedWall = Object.assign({}, w);
  if (vertical.wallTypeId && vertical.wallTypeId !== w.wallTypeId) {
    typedWall.wallTypeId = vertical.wallTypeId;
    delete typedWall.layers;
  }
  normalizeWall(typedWall, S);
  var bands = wallLayerBands(typedWall, S);
  var breaks = sampledWallBreaks(w, gm);
  bands.forEach(function (band) {
    if (band.airGap && band.framing) return;
    var mat = sampledLayerMaterial(typedWall, band, col, xray);
    for (var i = 0; i + 1 < breaks.length; i++) {
      var s0 = breaks[i], s1 = breaks[i + 1], mid = (s0 + s1) / 2;
      var profile0 = wallProfileHeight(w, s0, w.height);
      var profile1 = wallProfileHeight(w, s1, w.height);
      var lo0 = vertical.bottom, lo1 = vertical.bottom;
      var hi0 = Math.min(vertical.top, profile0), hi1 = Math.min(vertical.top, profile1);
      if (hi0 <= lo0 && hi1 <= lo1) continue;
      var opening = openingAtSample(w, mid);
      var ranges;
      if (!opening) ranges = [{ b0: lo0, b1: lo1, t0: hi0, t1: hi1 }];
      else {
        var oy0 = opening.type === "window" ? Math.max(0, opening.sill || 0) : 0;
        var oy1 = oy0 + Math.max(0, opening.height || 0);
        ranges = [
          { b0: lo0, b1: lo1, t0: Math.min(hi0, oy0), t1: Math.min(hi1, oy0) },
          { b0: Math.max(lo0, oy1), b1: Math.max(lo1, oy1), t0: hi0, t1: hi1 },
        ];
      }
      ranges.forEach(function (range) {
        var slices = [{ o0: band.start, o1: band.end }];
        if (band.start < -0.01 && band.end > 0.01 &&
            (tJoinStep(w, "a", range.b0) || tJoinStep(w, "b", range.b0))) {
          slices = [{ o0: band.start, o1: 0 }, { o0: 0, o1: band.end }];
        }
        slices.forEach(function (slice) {
          var geo = sampledPrismGeometry(w, s0, s1, slice.o0, slice.o1, range.b0, range.b1, range.t0, range.t1);
          if (!geo) return;
          var mesh = new THREE.Mesh(geo, mat);
          mesh.castShadow = !xray;
          mesh.receiveShadow = !xray;
          mesh.userData.wallLayer = { wallId: w.id, layerId: band.id, material: band.material, role: vertical.role };
          if (!(band.role === "glazing" || /glass/i.test(String(band.material || "")))) mesh.userData.physicsProps = MAT_PROPS.masonry;
          group.add(mesh);
        });
      });
    }
  });
}

function framingColor(material) {
  return /steel|metal|galv/i.test(String(material || "")) ? 0x9aa6ad : 0xb98252;
}

/* Physical framing view generated from the same take-off used by schedules.
   It normally sits inside finish layers; glass, section cuts and MEP x-ray
   expose the real studs/tracks instead of a solid placeholder cavity. */
function addWallFraming(parent, w, xray) {
  var framing = wallFraming(S, w);
  if (!framing.members.length) return;
  var bands = wallLayerBands(w, S), byLayer = {};
  bands.forEach(function (band) { byLayer[band.id] = band; });
  var root = new THREE.Group(); root.userData.wallFraming = w.id; parent.add(root);
  framing.members.forEach(function (member) {
    var band = byLayer[member.layerId] || { center: 0 }, color = framingColor(member.material),
      material = new THREE.MeshStandardMaterial({ color: color, roughness: .72, metalness: /steel|metal|galv/i.test(String(member.material || "")) ? .45 : 0,
        transparent: !!xray, opacity: xray ? .42 : 1, depthWrite: !xray });
    if (member.point && Number.isFinite(member.s) && !Number.isFinite(member.start)) {
      var stud = new THREE.Mesh(new THREE.BoxGeometry(member.width, member.length, member.depth), material);
      var tx = member.tangent.x, tz = member.tangent.z, nx = -tz, nz = tx;
      stud.position.set(member.point.x + nx * band.center, member.bottom + member.length / 2, member.point.z + nz * band.center);
      stud.rotation.y = -Math.atan2(tz, tx); stud.castShadow = !xray; root.add(stud); return;
    }
    if (!Number.isFinite(member.start) || !Number.isFinite(member.end)) return;
    var run = member.end - member.start, count = Math.max(1, Math.ceil(run / 40));
    for (var i = 0; i < count; i++) {
      var s0 = member.start + run * i / count, s1 = member.start + run * (i + 1) / count,
        p0 = wallPointAt(w, s0), p1 = wallPointAt(w, s1), dx = p1.x - p0.x, dz = p1.z - p0.z,
        length = Math.hypot(dx, dz), mx = (p0.x + p1.x) / 2, mz = (p0.z + p1.z) / 2,
        tangent = wallTangentAt(w, (s0 + s1) / 2), fnx = -tangent.z, fnz = tangent.x;
      if (!(length > .01)) continue;
      var plate = new THREE.Mesh(new THREE.BoxGeometry(length + .3, member.width, member.depth), material);
      plate.position.set(mx + fnx * band.center, member.bottom + member.width / 2, mz + fnz * band.center);
      plate.rotation.y = -Math.atan2(dz, dx); plate.castShadow = !xray; root.add(plate);
    }
  });
}

function addRailSegment(group, a, b, y, height, depth, color, xray) {
  var dx = b.x - a.x, dz = b.z - a.z, length = Math.hypot(dx, dz);
  if (length < 0.01) return;
  var mat = new THREE.MeshStandardMaterial({ color: color, roughness: 0.58, metalness: 0.12, transparent: xray, opacity: xray ? 0.18 : 1, depthWrite: !xray });
  var mesh = new THREE.Mesh(new THREE.BoxGeometry(length + 0.5, height, depth), mat);
  mesh.position.set((a.x + b.x) / 2, y, (a.z + b.z) / 2);
  mesh.rotation.y = -Math.atan2(dz, dx);
  mesh.castShadow = !xray;
  mesh.receiveShadow = !xray;
  group.add(mesh);
}

function addSampledRailing(group, w, gm, vertical, col, xray) {
  var top = vertical.top, bottom = vertical.bottom;
  var spacing = Math.max(20, Number(w.railing && w.railing.spacing) || Number(w.postSpacing) || 100);
  var railT = Math.max(2, Math.min(8, Number(w.railing && w.railing.railThickness) || 5));
  var depth = Math.max(3, Math.min(wallThickness(w, S), Number(w.railing && w.railing.depth) || 6));
  var steps = Math.max(1, Math.ceil(gm.L / Math.min(spacing, 45)));
  var pts = [];
  for (var i = 0; i <= steps; i++) pts.push(wallPointAt(w, gm.L * i / steps));
  [top - railT / 2, bottom + (top - bottom) * 0.48].forEach(function (y) {
    for (var j = 0; j + 1 < pts.length; j++) addRailSegment(group, pts[j], pts[j + 1], y, railT, depth, col, xray);
  });
  var posts = Math.max(1, Math.ceil(gm.L / spacing));
  for (var p = 0; p <= posts; p++) {
    var point = wallPointAt(w, gm.L * p / posts);
    var mat = new THREE.MeshStandardMaterial({ color: col, roughness: 0.58, metalness: 0.12, transparent: xray, opacity: xray ? 0.18 : 1, depthWrite: !xray });
    var post = new THREE.Mesh(new THREE.BoxGeometry(railT, top - bottom, depth), mat);
    post.position.set(point.x, (bottom + top) / 2, point.z);
    post.castShadow = !xray;
    group.add(post);
  }
}

function addSampledOpening(group, w, o) {
  if (o.type === "passage") return;
  var gm = wallGeom(w), s = clamp(o.s, o.width / 2, gm.L - o.width / 2);
  var point = wallPointAt(w, s), tangent = wallTangentAt(w, s);
  if (!point || !tangent) return;
  var holder = new THREE.Group();
  holder.position.set(point.x, 0, point.z);
  holder.rotation.y = -Math.atan2(tangent.uz, tangent.ux);
  holder.userData.opening = o;
  group.add(holder);
  var half = o.width / 2, T = wallThickness(w, S), FR = frameSpec(o);
  var y0 = o.type === "window" ? o.sill || 0 : 0;
  var top = Math.min(y0 + o.height, wallProfileHeight(w, s, w.height));
  if (top - y0 <= 1) return;
  var jamb = Math.min(FR.jamb, half - 1);
  if (jamb > 0) {
    localBox(holder, -half, -half + jamb, y0, top, T + FR.depth, 0xeee9df, { rough: 0.75 });
    localBox(holder, half - jamb, half, y0, top, T + FR.depth, 0xeee9df, { rough: 0.75 });
  }
  if (FR.head > 0) localBox(holder, -half + jamb, half - jamb, Math.max(y0, top - FR.head), top, T + FR.depth, 0xeee9df, { rough: 0.75 });
  if (o.type === "window") {
    var sill = Math.min(FR.sillW, (top - y0) / 2);
    if (sill > 0) localBox(holder, -half + jamb, half - jamb, y0, y0 + sill, T + FR.depth, 0xeee9df, { rough: 0.75 });
    localBox(holder, -half + jamb, half - jamb, y0 + sill, top - Math.min(FR.head, (top - y0) / 2), 2, GLASS, { trans: true, opacity: 0.34, transmission: 0.9, rough: 0.05, cast: false });
  } else if (o.type === "door") {
    var pivot = new THREE.Group();
    var left = String(o.swingDir || "R_IN").startsWith("L");
    pivot.userData = { opening:o, isDoor: true, open: o.open===true, type: o.isDouble ? "double" : "swing", width: o.width, maxOpen: left ? Math.PI / 2 : -Math.PI / 2 };
    if (o.isDouble) {
      var usable = o.width - 2 * jamb;
      var aWidth = Math.max(1, Math.min(usable - 1, +(o.leafA || usable / 2)));
      var bWidth = usable - aWidth;
      var inward = String(o.swingDir || "R_IN").endsWith("IN");
      var sign = inward ? 1 : -1;
      var lp = new THREE.Group(), rp = new THREE.Group();
      lp.position.x = -half + jamb;
      rp.position.x = half - jamb;
      lp.userData.maxOpen = sign * Math.PI / 2;
      rp.userData.maxOpen = -sign * Math.PI / 2;
      localBox(lp, 0, aWidth, 1, Math.max(2, top - FR.head), 2, o.color ? parseInt(o.color.slice(1), 16) : WOOD, { rough: 0.6 });
      localBox(rp, -bWidth, 0, 1, Math.max(2, top - FR.head), 2, o.color ? parseInt(o.color.slice(1), 16) : WOOD, { rough: 0.6 });
      pivot.add(lp, rp);
      pivot.userData.leaves = [lp, rp];
    } else {
      pivot.position.x = left ? -half + jamb : half - jamb;
      localBox(pivot, left ? 0 : -o.width + 2 * jamb, left ? o.width - 2 * jamb : 0, 1, Math.max(2, top - FR.head), 2, o.color ? parseInt(o.color.slice(1), 16) : WOOD, { rough: 0.6 });
    }
    holder.add(pivot);
    if (scene && scene.doors) scene.doors.push(pivot);
  }
}

function neighborJoinHeights(w) {
  var cuts = [];
  [w.a, w.b].forEach(function (nodeId) {
    S.walls.forEach(function (ow) {
      if (ow === w || (ow.a !== nodeId && ow.b !== nodeId)) return;
      if (!wallSolidAtNode(ow, nodeId)) return;
      var top = wallSolidTop(ow);
      if (top > 0.5) cuts.push(top);
    });
  });
  return cuts;
}

function hasHeightMismatchedJoin(w) {
  var my = wallSolidTop(w);
  return neighborJoinHeights(w).some(function (h) { return Math.abs(h - my) > 1; });
}

function splitVerticalForJoins(w, segments) {
  var cuts = neighborJoinHeights(w);
  if (!cuts.length) return segments;
  var out = [];
  segments.forEach(function (seg) {
    var ys = [seg.bottom, seg.top];
    cuts.forEach(function (c) {
      if (c > seg.bottom + 0.5 && c < seg.top - 0.5) ys.push(c);
    });
    ys.sort(function (a, b) { return a - b; });
    var last = ys[0];
    for (var i = 1; i < ys.length; i++) {
      if (ys[i] - last < 0.5) continue;
      out.push(Object.assign({}, seg, { bottom: last, top: ys[i] }));
      last = ys[i];
    }
  });
  return out.length ? out : segments;
}

function buildSampledWall(w, col) {
  normalizeWall(w, S);
  var gm = wallGeom(w), kind = normalizeWallKind(w);
  if (!gm || gm.L < 1 || kind === "roomDivider") return;
  var group = new THREE.Group();
  group.userData.wall = w;
  group.userData.physicsRole = "static";
  structureRoot.add(group);
  var renderWall = Object.assign({}, w);
  var Hc = cutH(), cutting = Hc < renderWall.height;
  if (cutting) renderWall.height = Hc;
  if (kind === "half" && renderWall.halfHeight == null && renderWall.capHeight == null) renderWall.halfHeight = Math.min(renderWall.height, HALF_WALL_HEIGHT);
  if (kind === "railing" && renderWall.railingHeight == null && renderWall.railHeight == null) renderWall.railingHeight = Math.min(renderWall.height, 100);
  var segments = splitVerticalForJoins(renderWall, verticalSegments(renderWall, function (id) { return wallTypeById(S, id); }));
  var xray = mepXray("walls");
  segments.forEach(function (vertical) {
    if (vertical.solid) addSampledSolid(group, renderWall, gm, vertical, col, xray);
    else addSampledRailing(group, renderWall, gm, vertical, col, xray);
  });
  addWallFraming(group, renderWall, xray);
  S.openings.filter(function (o) { return String(o.wall) === String(w.id); }).forEach(function (o) { addSampledOpening(group, renderWall, o); });
  if (cutting) {
    clipBelow(group, Hc);
    addWallCaps(group, Hc); // curved and profiled walls get their cut tops too
  }
}

function buildWall(w, col, tex) {
  normalizeWall(w, S);
  var kind = normalizeWallKind(w), gm = wallGeom(w);
  if (kind === "roomDivider") return;
  if (gm.kind === "line" && kind === "normal" && normalizeWallProfile(w).length === 0 && !hasHeightMismatchedJoin(w))
    return buildStraightWall(w, col, tex);
  return buildSampledWall(w, col == null ? WALLC : col);
}

/* Where a piece SITS, as opposed to what it looks like. Split out of buildItem
   so a drag can re-place an existing group instead of regenerating it.
   elevOffset re-hangs a piece whose `elev` was set (a placeholder point on a
   wall or ceiling does exactly that); it is 0 for everything else. */
function placeItem(g, it) {
  // undo/redo swaps in fresh item objects with the same ids and the same
  // signature, so a reused group must be re-pointed at the live one — rc.js and
  // modeler.js both read back through userData.item.
  g.userData.item = it;
  g.position.set(it.x, elevOffset(it), it.z);
  g.rotation.y = (-it.rot * Math.PI) / 180;
  /* Ceiling fittings would float in the sky over a cut house, and wall-hung
     pieces (art, mirrors, upper cabinets, a hood) would stick up out of the
     cut wall they hang on: both hide while the cutaway is on. Anything that
     stands on the floor stays whole, however tall — a wardrobe rising past
     the cut is how a dollhouse render shows it. */
  var hc = cutH(), hideForCut = false;
  if (isFinite(hc)) {
    var vs = null;
    try { vs = itemVSpan(it); } catch (e) { vs = null; }
    hideForCut = !!(vs && (vs.lo >= hc - 1 || (vs.lo > 60 && vs.hi > hc + 2)));
  }
  // only ever undo a hide this rule made; other code owns other hides
  if (hideForCut) {
    g.visible = false;
    g.userData.cutHid = true;
  } else if (g.userData.cutHid) {
    g.visible = true;
    g.userData.cutHid = false;
  }
}

/* On by default; ?lightLoop=0 or localStorage home3d_lightLoop=0 puts every
   light back in three's own per-light code (a kill switch, and the page
   tests/planner_light_loop_fidelity.browser.mjs compares against) */
function lightLoopWanted() {
  var q = typeof location !== "undefined" && /[?&]lightLoop=?([01]?)/.exec(location.search);
  if (q) return q[1] !== "0";
  try { return localStorage.getItem("home3d_lightLoop") !== "0"; } catch (e) { return true; }
}

function takeLight(type, color, intensity, distance, decay, angle, penumbra) {
  var spare = spareLights[type], l;
  if (spare.length) {
    spare.sort(function (a, b) { return a.id - b.id; });
    l = spare.shift();
  } else l = type === "SpotLight" ? new THREE.SpotLight() : new THREE.PointLight();
  l.color.set(color);
  l.intensity = intensity;
  l.distance = distance;
  l.decay = decay;
  if (l.isSpotLight) {
    l.angle = angle;
    l.penumbra = penumbra;
    l.target = new THREE.Object3D();
  }
  l.position.set(0, 0, 0);
  l.visible = true;
  l.castShadow = false; // fitPracticalLights sets the shadow up again if it casts
  l.userData = { pooledLight: true };
  return l;
}

function releaseLight(l) {
  if (l.parent) l.parent.remove(l);
  drawnShadows.delete(l.shadow); // a reused caster draws its new surroundings
  spareLights[l.isSpotLight ? "SpotLight" : "PointLight"].push(l);
}

function releaseItemLights(g) {
  var lights = [];
  g.traverse(function (o) { if (o.isLight && o.userData.pooledLight) lights.push(o); });
  lights.forEach(releaseLight);
}

function buildItem(it) {
  var f = FURN[it.type];
  if (!f) return null;
  var g = new THREE.Group();
  placeItem(g, it);
  itemsRoot.add(g);
  buildFurn(g, it);
  tagItemPhysicsRole(g, it);
  if (f.lamp) {
    var L = f.lamp,
      on = it.lightOn !== false,
      col = lampColor(it),
      mul = it.lightI != null ? it.lightI : 1;
    g.userData.lampOff = !on;
    g.traverse(function (o) {
      if (
        o.isMesh &&
        o.material &&
        o.material.userData &&
        o.material.userData.glow
      ) {
        o.material.emissive.setHex(col);
        o.material.emissiveIntensity = on ? 0.4 + 1.4 * S.artK : 0;
      }
    });
    if (on) {
      var ly = typeof L.y === "function" ? L.y(it) : L.y;
      if (fin(ly)) {
        // Physical candela for a centimetre-scale scene, calibrated against this
        // lamp's OWN throw — see gpu.js. Without the conversion a lamp's
        // inverse-square falloff divides by ~62500 and it lights nothing at all.
        var base = legacyIntensity(L.intensity * mul, L.dist || 500);
        var pl;
        if (it.spot) {
          pl = takeLight(
            "SpotLight",
            col,
            base * (0.45 + 1.9 * S.artK),
            L.dist || 500,
            2,
            ((it.cone != null ? it.cone : 45) * Math.PI) / 180,
            0.5
          );
          var pitch = (it.pitch != null ? it.pitch : 0) * Math.PI / 180;
          var tObj = new THREE.Object3D();
          tObj.position.set(0, ly - 100 * Math.cos(pitch), 100 * Math.sin(pitch));
          g.add(tObj);
          pl.target = tObj;
        } else {
          pl = takeLight("PointLight", col, base * (0.45 + 1.9 * S.artK), L.dist || 500, 2);
        }
        pl.position.set(0, ly, 0);
        pl.userData.baseI = base;
        g.add(pl);
      }
    }
  }
  return g;
}

export {
  addWallFraming, buildItem, buildWall, hasHeightMismatchedJoin,
  lightLoopWanted, placeItem, releaseItemLights, releaseLight, takeLight,
};
