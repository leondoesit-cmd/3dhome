/* The 3D view's geometry helpers for the garden/site dressing, the dollhouse
   cutaway and shadow-only walls, split out of js/view3d.js. It shares the
   editor's state through live imports from ../view3d.js. */
import { faceShiftAt, straightThroughAt, tJoinStep, wallGeom, wallJoinRole, wallSolidAtNode } from "../geometry.js";
import { legacyTextureUrl, pbrEntryFor, sharedRepeat } from "../pbr_material.js";
import { box } from "../primitives.js";
import { GLASS, HANDLE, MAT_PROPS, S, WALLC, WOOD, clamp } from "../state.js";
import { getTexturePresetBumpUrl } from "../textures.js";
import { THREE } from "../three_lazy.js";
import { mepXray } from "../view3d/walk_mode.js";
import { addWallFraming } from "../view3d/wall_build.js";
import { classifyOpeningCut, clipTrianglesBelowY, cutHeightFor, topFaceTriangles } from "../wall_cut.js";
import { normalizeWall, wallLayerBands, wallThickness } from "../wall_types.js";
import {
  CAP_COLORS, SHADOW_ONLY_LAYER, buildingShadowWalls, isSharedSurface, scene,
  structureRoot, stubBuildH, surfaceMaterial, walk,
} from "../view3d.js";

function houseBounds() {
  var b = null;
  S.walls.forEach(function (w) {
    var a = S.nodes[w.a], c = S.nodes[w.b], h = (w.thickness || 10) / 2;
    if (!a || !c) return;
    [a, c].forEach(function (p) {
      if (!b) b = { minx: p.x, maxx: p.x, minz: p.z, maxz: p.z };
      b.minx = Math.min(b.minx, p.x - h); b.maxx = Math.max(b.maxx, p.x + h);
      b.minz = Math.min(b.minz, p.z - h); b.maxz = Math.max(b.maxz, p.z + h);
    });
  });
  return b;
}

/* ---- dollhouse cutaway (js/wall_cut.js) ----
   The effective wall cut: Infinity unless the cutaway is on. First person and
   the game modes that play inside the model need their full-height walls. */
function cutH() {
  var game = typeof document !== "undefined" && document.body &&
    /(^| )(lava-on|zombies-on|rc-playing)( |$)/.test(document.body.className);
  if (stubBuildH) return stubBuildH; // a near-wall stub is building (stubFor)
  if (buildingShadowWalls) return Infinity;
  return cutHeightFor(S.cutaway, { walk: walk, game: game });
}

function makeShadowOnly(o) {
  o.traverse(function (n) {
    n.layers.set(SHADOW_ONLY_LAYER);
    n.userData = {};
    if (n.isMesh) n.receiveShadow = false;
  });
  return o;
}
/* A shadow-only copy sharing the source's geometry and materials. Built by
   hand rather than with clone(): clone() JSON-copies userData, which on door
   and opening groups holds live objects. */
function shadowCopy(src) {
  var out = src.isMesh ? new THREE.Mesh(src.geometry, src.material) : new THREE.Group();
  out.position.copy(src.position);
  out.quaternion.copy(src.quaternion);
  out.scale.copy(src.scale);
  if (src.isMesh) out.castShadow = src.castShadow;
  src.children.forEach(function (c) {
    if (c.visible !== false) out.add(shadowCopy(c));
  });
  return out;
}

function cutH0() {
  return cutHeightFor(S.cutaway, { walk: false, game: false });
}
function relMatrix(obj, root) {
  var m = new THREE.Matrix4();
  for (var o = obj; o && o !== root; o = o.parent) {
    o.updateMatrix();
    m.premultiply(o.matrix);
  }
  return m;
}
/* Clip every mesh under `root` (door leaves, frames, glass, mullions) to
   y <= yMax in root space. Geometry is re-expressed in root space, clipped,
   and mapped back, so a mesh under a rotated pivot cuts on the level. A mesh
   wholly above is hidden rather than emptied, so its group keeps its tags. */
function clipBelow(root, yMax) {
  var meshes = [];
  root.traverse(function (o) { if (o.isMesh && o.geometry && !o.userData.wallCap) meshes.push(o); });
  meshes.forEach(function (mesh) {
    var src = mesh.geometry, geo = src.index ? src.toNonIndexed() : src;
    var pa = geo.attributes.position;
    if (!pa) return;
    var M = relMatrix(mesh, root), inv = new THREE.Matrix4().copy(M).invert(),
      nM = new THREE.Matrix3().getNormalMatrix(M), nInv = new THREE.Matrix3().getNormalMatrix(inv);
    var v = new THREE.Vector3(), n = new THREE.Vector3(), maxY = -Infinity;
    var pos = new Float32Array(pa.count * 3), na = geo.attributes.normal,
      nrm = na ? new Float32Array(pa.count * 3) : null, ua = geo.attributes.uv;
    for (var i = 0; i < pa.count; i++) {
      v.fromBufferAttribute(pa, i).applyMatrix4(M);
      pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = v.z;
      if (v.y > maxY) maxY = v.y;
      if (nrm) {
        n.fromBufferAttribute(na, i).applyMatrix3(nM).normalize();
        nrm[i * 3] = n.x; nrm[i * 3 + 1] = n.y; nrm[i * 3 + 2] = n.z;
      }
    }
    if (maxY <= yMax + 0.01) {
      if (geo !== src) geo.dispose();
      return;
    }
    var c = clipTrianglesBelowY(pos, nrm, ua ? ua.array : null, yMax);
    if (geo !== src) geo.dispose();
    if (!c.pos.length) {
      mesh.visible = false;
      return;
    }
    for (var j = 0; j < c.pos.length; j += 3) {
      v.set(c.pos[j], c.pos[j + 1], c.pos[j + 2]).applyMatrix4(inv);
      c.pos[j] = v.x; c.pos[j + 1] = v.y; c.pos[j + 2] = v.z;
      if (c.nrm) {
        n.set(c.nrm[j], c.nrm[j + 1], c.nrm[j + 2]).applyMatrix3(nInv).normalize();
        c.nrm[j] = n.x; c.nrm[j + 1] = n.y; c.nrm[j + 2] = n.z;
      }
    }
    var out = new THREE.BufferGeometry();
    out.setAttribute("position", new THREE.Float32BufferAttribute(c.pos, 3));
    if (c.nrm) out.setAttribute("normal", new THREE.Float32BufferAttribute(c.nrm, 3));
    else out.computeVertexNormals();
    if (c.uv) out.setAttribute("uv", new THREE.Float32BufferAttribute(c.uv, 2));
    src.dispose();
    mesh.geometry = out;
  });
}

function addWallCaps(g, yCut) {
  var tri = [];
  g.children.forEach(function (m) {
    if (!m.isMesh || !m.userData.wallLayer || !m.geometry) return;
    var geo = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry,
      M = relMatrix(m, g), pa = geo.attributes.position, v = new THREE.Vector3(),
      pos = new Float32Array(pa.count * 3);
    for (var i = 0; i < pa.count; i++) {
      v.fromBufferAttribute(pa, i).applyMatrix4(M);
      pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = v.z;
    }
    if (geo !== m.geometry) geo.dispose();
    topFaceTriangles(pos, yCut).forEach(function (t) {
      for (var k = 0; k < 9; k++) tri.push(pos[t * 9 + k] + (k % 3 === 1 ? 0.08 : 0));
    });
  });
  if (!tri.length) return;
  var cg = new THREE.BufferGeometry();
  cg.setAttribute("position", new THREE.Float32BufferAttribute(tri, 3));
  cg.computeVertexNormals();
  var cap = (S.cutaway && S.cutaway.cap) === "dark" ? "dark" : "white";
  var mat = new THREE.MeshStandardMaterial({ color: CAP_COLORS[cap], roughness: 0.85, metalness: 0 });
  var mesh = new THREE.Mesh(cg, mat);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.userData.role = "wallCap";
  mesh.userData.wallCap = true;
  g.add(mesh);
}

/* Per-opening frame profile. Every field is optional on the opening object —
   an old scene (or one never touched in the inspector) falls back to the
   dimensions that used to be hard-coded here, so nothing shifts on load.
   jamb/head/sillW are the visible frame widths per direction (cm); depth is
   how far the frame stands proud of the wall (total extra thickness); mull is
   the divider (mullion) thickness with mullV/mullH counts. */
export function frameSpec(o) {
  var isWin = o.type === "window";
  var n = function (v, d) { return v != null && isFinite(v) ? Math.max(0, +v) : d; };
  return {
    jamb: n(o.frJamb, o.type === "door" || isWin ? 3 : 0),
    head: n(o.frHead, o.type === "door" || isWin ? 3 : 0),
    sillW: n(o.frSillW, isWin ? 3 : 0),
    depth: n(o.frDepth, 1.6),
    mull: n(o.frMull, isWin ? 2 : 0),
    mullV: o.frMullV != null ? Math.max(0, Math.round(o.frMullV)) : isWin ? 1 : 0,
    mullH: o.frMullH != null ? Math.max(0, Math.round(o.frMullH)) : 0,
  };
}

function localBox(g, u0, u1, y0, y1, T, color, opt) {
  if (u1 - u0 <= 0.01 || y1 - y0 <= 0.01) return;
  var o = opt ? Object.assign({ sharp: true }, opt) : { sharp: true };
  var m = box(g, u0, u1, y0, y1, -T / 2, T / 2, color, o);
  // Wall segments are masonry regardless of paint color (the color-based
  // material table would classify a painted wall as furniture board).
  if (m && !(o.trans || o.transmission != null)) m.userData.physicsProps = MAT_PROPS.masonry;
  return m;
}

function buildStraightWall(w, col, tex) {
  if (col == null) col = WALLC;
  normalizeWall(w, S);
  var gm = wallGeom(w);
  if (gm.L < 1) return;
  var g = new THREE.Group();
  g.position.set(gm.a.x, 0, gm.a.z);
  g.rotation.y = Math.atan2(-gm.dz, gm.dx);
  g.userData.wall = w;
  g.userData.physicsRole = "static";
  structureRoot.add(g);
  var T = wallThickness(w, S),
    Hfull = w.height,
    // the dollhouse cut, when it is lower than the wall (see cutH)
    H = Math.min(Hfull, cutH()),
    L = gm.L;
  // what the drawing overlay's hover measures: the wall's own run and
  // height, not the mesh box, which carries the mitred corner overlaps
  g.userData.drawExtent = { x0: 0, x1: L, y0: 0, y1: H };

  function getCursor(isStart) {
    // Match joining walls by Node ID (topology) instead of coordinate proximity.
    // This prevents the "vanishing walls" bug where parallel/near walls get incorrectly 
    // truncated by the distance threshold.
    var nodeId = isStart ? w.a : w.b;
    var mt = 0,
      endWalls = [w];
    S.walls.forEach(function (ow) {
      if (ow === w || !wallSolidAtNode(ow, nodeId)) return;
      if (ow.a === nodeId || ow.b === nodeId) {
        mt = Math.max(mt, ow.thickness);
        endWalls.push(ow);
      }
    });
    // free end: nothing joins here, or what does has an opening across the joint
    // and so was never built there (see wallSolidAtNode)
    if (mt === 0) return isStart ? 0 : L;
    var manualJoin = w.join && w.join[isStart ? "a" : "b"];
    if (manualJoin === "through") return isStart ? -mt / 2 - 0.1 : L + mt / 2 + 0.1;
    if (manualJoin === "butt") return isStart ? mt / 2 - 0.1 : L - mt / 2 + 0.1;
    /* Anything running straight back out of this node is one physical straight
       run stored as two walls, not a corner: a wall split by a newly landed
       branch, or simply two walls drawn end to end. There is no mitre for these
       (faceShiftAt says so, and endMitre below then returns null), so the cut
       taken here is the final one and it has to be right on its own — end both
       halves AT the shared node.

       The old rule instead cut this wall back by the NEIGHBOUR's half thickness
       while the neighbour cut back by OURS, which only cancels while the two are
       equally thick. Join a 12 cm wall to a 14 cm one end to end and the run was
       left with a 1 cm slot straight through it; a branch landing on the joint
       opened the same mismatch out into a triangular spike. */
    if (straightThroughAt(nodeId, isStart ? gm.ux : -gm.ux, isStart ? gm.uz : -gm.uz, w))
      return isStart ? 0 : L;
    /* A T-branch must stop at the through-run's NEAR face, not at half the
       neighbour's thickness. After the run is hung on its interior that face
       sits on the shared node, so mt/2 left a one-thickness gap of daylight
       between the branch and the wall it is welded to. */
    if (wallJoinRole(w, nodeId) === "branch") {
      var bx = isStart ? gm.ux : -gm.ux,
        bz = isStart ? gm.uz : -gm.uz,
        bh = T / 2,
        btp = faceShiftAt(nodeId, bx, bz, isStart ? 1 : -1, w, bh),
        btm = faceShiftAt(nodeId, bx, bz, isStart ? -1 : 1, w, bh),
        bNear = Math.min(btp, btm);
      return isStart ? bNear - 0.1 : L - bNear + 0.1;
    }
    // At a corner, pick one deterministic "through" wall to span it (lowest id).
    endWalls.sort(function (a, b) { return a.id - b.id; });
    var throughWall = endWalls[0];
    var isThrough = throughWall.id === w.id;

    // add 0.1 (1mm) overlap to all connections to perfectly seal MSAA rasterization cracks
    if (isStart) return isThrough ? -mt / 2 - 0.1 : mt / 2 - 0.1;
    else return isThrough ? L + mt / 2 + 0.1 : L - mt / 2 + 0.1;
  }

  var startCursor = getCursor(true);
  var endCursor = getCursor(false);
  var stepA = tJoinStep(w, "a"),
    stepB = tJoinStep(w, "b");
  if (stepA) startCursor = Math.min(stepA.tp, stepA.tm) - 0.05;
  if (stepB) endCursor = L - Math.min(stepB.tp, stepB.tm) + 0.05;

  /* ---- mitred ends ----
     getCursor above stops (or spans) the wall at ONE position along its axis,
     which is only ever right at a square corner: at 60 degrees a square cut
     leaves a wedge of daylight on the outside of the joint and a lump on the
     inside. The two faces of the wall want DIFFERENT cut positions, so the end
     of the extrusion is sheared to the same mitre line the plan draws
     (js/geometry.js wallOutline). Local +z is side +1, local x runs a->b. */
  function endMitre(isStart) {
    if (tJoinStep(w, isStart ? "a" : "b")) return null;
    var node = isStart ? w.a : w.b;
    var joined = S.walls.some(function (ow) {
      return ow !== w && (ow.a === node || ow.b === node) && wallSolidAtNode(ow, node);
    });
    if (!joined) return null; // free end: nothing to mitre against
    var dx = isStart ? gm.ux : -gm.ux,
      dz = isStart ? gm.uz : -gm.uz,
      h = T / 2,
      lim = Math.max(0, L - 0.2);
    // how far in from the node the face on side s starts
    function t(s) {
      var v = faceShiftAt(node, dx, dz, isStart ? s : -s, w, h);
      return v > lim ? lim : v < -lim ? -lim : v;
    }
    var tp = t(1),
      tm = t(-1);
    // everything meeting here runs straight on (a split wall, not a corner):
    // there is no mitre, and the ends must keep the overlap getCursor gave them
    if (!tp && !tm) return null;
    var
      // x = mid + k*z, so that x(+T/2) and x(-T/2) land on the two face lines.
      // 0.05 cm past the mitre line each way, so neighbouring walls overlap by
      // a hair instead of showing a rasterisation crack down the joint.
      mid = isStart ? (tp + tm) / 2 - 0.05 : L - (tp + tm) / 2 + 0.05,
      k = ((isStart ? 1 : -1) * (tp - tm)) / T;
    return { mid: mid, k: k };
  }
  var mitA = endMitre(true),
    mitB = endMitre(false);
  /* Move every vertex sitting ON an end face onto the mitre line, leaning it
     with depth. Interior vertices (opening reveals) are untouched — their x is
     nowhere near a cursor. */
  function mitre(geo) {
    if (!mitA && !mitB) return;
    var p = geo.attributes.position;
    for (var i = 0; i < p.count; i++) {
      var x = p.getX(i),
        m = Math.abs(x - startCursor) < 0.01 ? mitA
          : Math.abs(x - endCursor) < 0.01 ? mitB
          : null;
      if (m) p.setX(i, m.mid + m.k * p.getZ(i));
    }
    p.needsUpdate = true;
    geo.computeVertexNormals();
  }

  var skirtC = new THREE.Color(col).multiplyScalar(0.8).getHex(),
    skT = T + 2.6; // baseboard color + thickness (1.3cm proud per face)
  var ops = S.openings
    .filter(function (o) {
      return o.wall === w.id;
    })
    .map(function (o) {
      return {
        /* The opening this was derived from. Everything below is a clamped,
           flattened COPY for the builder, so identity is lost — and selection
           matches on identity (userData.opening === S.sel.ref). Carry the
           original across or a straight wall's doors and windows can never be
           resolved back to the document. */
        src: o,
        // clamp opening to fit within the actual drawn wall segment
        s: clamp(o.s, startCursor + o.width / 2, endCursor - o.width / 2),
        width: o.width,
        height: o.height,
        sill: o.type === "window" ? o.sill : 0,
        type: o.type,
        overlapL: o.overlapL,
        isSliding: !!o.isSliding,
        isDouble: !!o.isDouble,
        leafA: o.leafA,
        leafB: o.leafB,
        mat: o.mat,
        color: o.color,
        slideDir: o.slideDir,
        isPocket: !!o.isPocket,
        swingDir: o.swingDir,
        // frame / mullion profile (see frameSpec) — undefined means "default"
        frJamb: o.frJamb,
        frHead: o.frHead,
        frSillW: o.frSillW,
        frDepth: o.frDepth,
        frMull: o.frMull,
        frMullV: o.frMullV,
        frMullH: o.frMullH,
      };
    })
    .sort(function (a, b) {
      return a.s - b.s;
    });
  // NOTE: this object goes straight into MeshStandardMaterial, so it uses
  // three's own property names — not primitives.js's `rough`/`tex` shorthand.
  // (`tex` is applied further down, after the loader resolves.)
  /* Extruded wall faces are architectural planes, never a smooth organic
     surface. After an oblique mitre, averaged vertex normals reveal the two
     triangulation halves as a large light/dark wedge even though the geometry
     is coplanar. Flat shading keeps each planar face visually straight. */
  var matOpts = { roughness: 0.9, flatShading: true };

  var hasWall = endCursor > startCursor;

  // Openings that span the shape's full height (seamless passages, and any
  // door/passage reaching the ceiling) must SPLIT the wall into separate
  // left/right shapes: a hole covering the outer contour's full vertical
  // extent disconnects it, which the triangulator can't represent — it left
  // stray wall faces and an uncut baseboard band across the opening.
  var wallCuts = [], wallHoles = [], wallSills = [], skirtCuts = [], skirtHoles = [];
  ops.forEach(function (o) {
    var widthOffset = frameSpec(o).jamb;
    var l = Math.max(startCursor, Math.min(endCursor, o.s - o.width / 2 - widthOffset)),
      r = Math.max(startCursor, Math.min(endCursor, o.s + o.width / 2 + widthOffset));
    if (l >= r) return;

    var y0 = o.sill || 0;
    var y1 = y0 + o.height;
    var cutY0 = y0 <= 0 ? -2.5 : y0; // Cut all the way through the base
    if (y1 > H) y1 = H;
    var how = classifyOpeningCut(cutY0, y1, H, -2.5);
    if (how === "cut") wallCuts.push({ l: l, r: r });
    else if (how === "notch") {
      // a window reaching the cut: split the wall, keep the block under it
      wallCuts.push({ l: l, r: r });
      wallSills.push({ l: l, r: r, y1: cutY0 });
    } else if (how === "hole") wallHoles.push({ l: l, r: r, y0: cutY0, y1: y1 });

    // baseboard: any opening reaching the floor removes the skirt entirely
    if (y0 < 7) {
      if (y0 <= 0) skirtCuts.push({ l: l, r: r });
      else skirtHoles.push({ l: l, r: r, y0: y0 });
    }
  });

  // split [start,end] into the sub-segments left over between full cuts
  function splitSegs(start, end, cuts) {
    var segs = [],
      pos = start;
    cuts
      .slice()
      .sort(function (a, b) { return a.l - b.l; })
      .forEach(function (c) {
        if (c.l > pos) segs.push([pos, Math.min(c.l, end)]);
        pos = Math.max(pos, c.r);
      });
    if (pos < end) segs.push([pos, end]);
    return segs.filter(function (s) { return s[1] - s[0] > 0.2; });
  }

  function rectShape(x0, x1, y0, y1) {
    var sh = new THREE.Shape();
    sh.moveTo(x0, y0);
    sh.lineTo(x1, y0);
    sh.lineTo(x1, y1);
    sh.lineTo(x0, y1);
    sh.lineTo(x0, y0);
    return sh;
  }

  function makeWallShapes(x0, x1) {
    if (!(x1 - x0 > 0.2)) return [];
    var sills = wallSills.map(function (sl) {
      var a = Math.max(sl.l, x0), b = Math.min(sl.r, x1);
      return b - a > 0.2 ? rectShape(a, b, -2.5, sl.y1) : null;
    }).filter(Boolean);
    return sills.concat(splitSegs(x0, x1, wallCuts).map(function (sg) {
      var sh = rectShape(sg[0], sg[1], -2.5, H);
      wallHoles.forEach(function (h) {
        var hl = Math.max(h.l, sg[0]),
          hr = Math.min(h.r, sg[1]);
        if (hl >= hr) return;
        var hole = new THREE.Path();
        hole.moveTo(hl, h.y0);
        hole.lineTo(hr, h.y0);
        hole.lineTo(hr, h.y1);
        hole.lineTo(hl, h.y1);
        hole.lineTo(hl, h.y0);
        sh.holes.push(hole);
      });
      return sh;
    }));
  }

  // wall shapes: start at -2.5 so the wall meets the ground plane (y=-2.5)
  // with no visible gap/seam along the exterior base
  var wallShapes = hasWall ? makeWallShapes(startCursor, endCursor) : [];
  var skirtShapes = hasWall
    ? splitSegs(startCursor, endCursor, skirtCuts).map(function (sg) {
        var sh = rectShape(sg[0], sg[1], 0, 7);
        skirtHoles.forEach(function (h) {
          var hl = Math.max(h.l, sg[0]),
            hr = Math.min(h.r, sg[1]);
          if (hl >= hr) return;
          var hole = new THREE.Path();
          hole.moveTo(hl, h.y0);
          hole.lineTo(hr, h.y0);
          hole.lineTo(hr, 7);
          hole.lineTo(hl, 7);
          hole.lineTo(hl, h.y0);
          sh.holes.push(hole);
        });
        return sh;
      })
    : [];

  if (hasWall && wallShapes.length) {
    // X-ray mode: dim, see-through walls so embedded MEP conduits show through
    var xray = mepXray("walls");
    var layerBands = wallLayerBands(w, S);
    function addLayerGeom(band, shapes, z0, z1, applyMitre) {
      var depth = z1 - z0;
      if (!(depth > 0.01) || !shapes || !shapes.length) return;
      if (band.airGap && band.framing) return;
      var geom = new THREE.ExtrudeGeometry(shapes, { depth: depth, bevelEnabled: false });
      geom.translate(0, 0, z0);
      if (applyMitre) mitre(geom);
      var isGeneric = w.wallTypeId === "generic" || layerBands.length === 1 && band.material === "generic-masonry";
      var layerColor = isGeneric ? col : (band.color || col);
      var isGlass = band.role === "glazing" || /glass/i.test(String(band.material || ""));
      var materialProps = Object.assign({ color: layerColor }, matOpts);
      if (isGlass) Object.assign(materialProps, { transparent: true, opacity: 0.34, transmission: 0.72, roughness: 0.12, side: THREE.DoubleSide });
      var mat = new THREE.MeshStandardMaterial(materialProps);
      // A user-applied wall texture remains the visible finish, while an
      // authored assembly without a texture keeps each layer's semantic color.
      // A library material ("mat:<id>") becomes a PBR node material once its
      // bitmaps are in; until then (or offline) its old procedural preset.
      var bandTex = tex;
      var wallPbr = !isGlass && pbrEntryFor(bandTex);
      if (wallPbr) {
        var pbrScale = w.texScale || wallPbr.sizeCm;
        var pbrMat = surfaceMaterial(wallPbr, { repeat: [1 / pbrScale, 1 / pbrScale] });
        if (pbrMat) {
          mat = pbrMat;
          bandTex = null;
        } else bandTex = legacyTextureUrl(wallPbr);
      }
      if (bandTex) {
        if (!S.customTexCache) S.customTexCache = {};
        if (!S.customTexCache[bandTex]) {
          var tx = new THREE.TextureLoader().load(bandTex, function() { S.dirty3D = true; S.repaint3D = true; });
          tx.wrapS = tx.wrapT = THREE.RepeatWrapping;
          tx.colorSpace = THREE.SRGBColorSpace;
          S.customTexCache[bandTex] = tx;
        }
        var scale = w.texScale || 200;
        if (S.customTexCache[bandTex].image) {
          mat.map = sharedRepeat(S.customTexCache[bandTex], 1 / scale, 1 / scale, mat); // one upload per repeat
          mat.color.setHex(0xffffff);
        }
        var bUrl = getTexturePresetBumpUrl(bandTex);
        if (bUrl) {
          if (!S.customBumpCache) S.customBumpCache = {};
          if (!S.customBumpCache[bUrl]) {
            var btx = new THREE.TextureLoader().load(bUrl, function() { S.dirty3D = true; S.repaint3D = true; });
            btx.wrapS = btx.wrapT = THREE.RepeatWrapping;
            S.customBumpCache[bUrl] = btx;
          }
          if (S.customBumpCache[bUrl].image) {
            mat.bumpMap = sharedRepeat(S.customBumpCache[bUrl], 1 / scale, 1 / scale, mat);
            mat.bumpScale = w.texBump != null ? w.texBump : 0.20;
          }
        }
      }
      if (xray) {
        if (isSharedSurface(mat)) mat = mat.clone(); // never change a shared surface
        mat.transparent = true;
        mat.opacity = 0.18;
        mat.depthWrite = false;
      }
      var mesh = new THREE.Mesh(geom, mat);
      mesh.receiveShadow = !xray;
      mesh.castShadow = !xray;
      mesh.userData.wallLayer = { wallId: w.id, layerId: band.id, material: band.material };
      if (!isGlass) mesh.userData.physicsProps = MAT_PROPS.masonry;
      g.add(mesh);
    }
    layerBands.forEach(function (band) {
      var slices;
      if ((stepA || stepB) && band.start < -0.01 && band.end > 0.01) {
        slices = [
          { z0: band.start, z1: 0, side: -1 },
          { z0: 0, z1: band.end, side: 1 },
        ];
      } else if (stepA || stepB) {
        slices = [{ z0: band.start, z1: band.end, side: (band.start + band.end) / 2 >= 0 ? 1 : -1 }];
      } else {
        slices = [{ z0: band.start, z1: band.end, side: 0 }];
      }
      slices.forEach(function (slice) {
        var x0 = startCursor, x1 = endCursor, shapes = wallShapes;
        if (slice.side) {
          if (stepA) x0 = (slice.side > 0 ? stepA.tp : stepA.tm) - 0.05;
          if (stepB) x1 = L - (slice.side > 0 ? stepB.tp : stepB.tm) + 0.05;
          shapes = makeWallShapes(x0, x1);
        }
        addLayerGeom(band, shapes, slice.z0, slice.z1, !slice.side);
      });
    });

    addWallFraming(structureRoot, w, xray);

    if (skirtShapes.length) {
      var skGeom = new THREE.ExtrudeGeometry(skirtShapes, { depth: skT, bevelEnabled: false });
      skGeom.translate(0, 0, -skT / 2);
      mitre(skGeom);
      var skMat = new THREE.MeshStandardMaterial({ color: skirtC, roughness: 0.9, flatShading: true });
      if (xray) { skMat.transparent = true; skMat.opacity = 0.18; skMat.depthWrite = false; }
      var skMesh = new THREE.Mesh(skGeom, skMat);
      skMesh.receiveShadow = !xray;
      skMesh.castShadow = !xray;
      g.add(skMesh);
    }
  }

  // Draw frames for openings
  ops.forEach(function (o) {
    /* Straight walls build an opening's frames, leaf and glazing straight into
       the wall group, with no per-opening holder — unlike the sampled path,
       where addSampledOpening() parents them under a Group carrying
       userData.opening. Selection reads that tag (getSelectionObjects3D, and
       the picker at pickAt), so on a straight wall — the common case — a door
       or window resolved to nothing: clicking one could not frame it and the
       inspector's 3D preview waited forever for geometry that was never going
       to be identified. Tag whatever THIS opening adds, so both paths answer
       the same question the same way without re-parenting anything. */
    var childrenBefore = g.children.length;
    var FR = frameSpec(o);
    var widthOffset = FR.jamb;
    var l = Math.max(startCursor, Math.min(endCursor, o.s - o.width / 2 - widthOffset)),
      r = Math.max(startCursor, Math.min(endCursor, o.s + o.width / 2 + widthOffset));
    if (l >= r) return;
    var fT = T + FR.depth;
    // jamb/head can't eat more than the opening itself
    var jamb = Math.min(FR.jamb, (r - l) / 2 - 1);
    if (!(jamb > 0)) jamb = 0;
    var isSeamless = o.type === "passage" && o.overlapL != null && Math.abs(o.width - o.overlapL) < 2 && Math.abs(o.height - H) < 2 && o.sill <= 1;
    if (o.type === "door") {
      var head = Math.min(FR.head, o.height - 5);
      if (!(head > 0)) head = 0;
      if (jamb > 0) {
        localBox(g, l, l + jamb, 0, o.height, fT, 0xece4d4, { rough: 0.8 });
        localBox(g, r - jamb, r, 0, o.height, fT, 0xece4d4, { rough: 0.8 });
      }
      if (head > 0) localBox(g, l + jamb, r - jamb, o.height - head, o.height, fT, 0xece4d4, { rough: 0.8 });
      if (o.type === "door") {
        var doorPivot = new THREE.Group();
        doorPivot.userData = { isDoor: true, open: false, slideDir: 1, type: "swing", width: o.width, maxOpen: Math.PI / 2 };
        if (o.isSliding || o.isPocket) {
          doorPivot.userData.type = "slide";
          var isPocket = !!o.isPocket;
          var matColor = o.color ? parseInt(o.color.slice(1), 16) : WOOD;
          var panelOpts = { rough: 0.6 };
          if (o.mat === "glass") {
            panelOpts = { trans: true, opacity: 1, transmission: 0.9, metal: 0.1, rough: 0.05, cast: false };
          } else if (o.mat === "frosted") {
            panelOpts = { trans: true, opacity: 1, transmission: 0.8, metal: 0.0, rough: 0.7, cast: false };
          }
          var spaceLeft = (o.s - o.width / 2) - startCursor;
          var spaceRight = endCursor - (o.s + o.width / 2);
          var canLeft = spaceLeft >= o.width - 10;
          var canRight = spaceRight >= o.width - 10;
          var slideDir = 1;
          if (o.slideDir === "-1") slideDir = -1;
          else if (o.slideDir === "1") slideDir = 1;
          else slideDir = canRight ? 1 : (canLeft ? -1 : 1);
          
          doorPivot.userData.slideDir = slideDir;
          var fF = fT / 2;

          if (isPocket) {
            if (o.mat === "glass" || o.mat === "frosted") {
              var frameW = 6;
              // Draw wooden frame for the glass pocket door
              box(doorPivot, l + 1, l + frameW, 1, o.height - 1, -0.75, 0.75, matColor === GLASS ? WOOD : matColor, { rough: 0.6 });
              box(doorPivot, r - frameW, r - 1, 1, o.height - 1, -0.75, 0.75, matColor === GLASS ? WOOD : matColor, { rough: 0.6 });
              box(doorPivot, l + frameW, r - frameW, o.height - frameW, o.height - 1, -0.75, 0.75, matColor === GLASS ? WOOD : matColor, { rough: 0.6 });
              box(doorPivot, l + frameW, r - frameW, 1, frameW, -0.75, 0.75, matColor === GLASS ? WOOD : matColor, { rough: 0.6 });
              // Draw the inner glass panel
              box(doorPivot, l + frameW, r - frameW, frameW, o.height - frameW, -0.2, 0.2, matColor, panelOpts);
            } else {
              box(doorPivot, l + 1, r - 1, 1, o.height - 1, -0.75, 0.75, matColor, panelOpts);
            }
            if (slideDir === 1) {
              box(doorPivot, l + 6, l + 9, o.height * 0.5 - 6, o.height * 0.5 + 6, 0.75, 1.25, HANDLE, { metal: 0.7 });
              box(doorPivot, l + 6, l + 9, o.height * 0.5 - 6, o.height * 0.5 + 6, -1.25, -0.75, HANDLE, { metal: 0.7 });
            } else {
              box(doorPivot, r - 9, r - 6, o.height * 0.5 - 6, o.height * 0.5 + 6, 0.75, 1.25, HANDLE, { metal: 0.7 });
              box(doorPivot, r - 9, r - 6, o.height * 0.5 - 6, o.height * 0.5 + 6, -1.25, -0.75, HANDLE, { metal: 0.7 });
            }
          } else {
            box(doorPivot, l - 1, r + 1, 1, o.height + 1, fF + 0.3, fF + 1.8, matColor, panelOpts);

            var railL = slideDir === 1 ? l - 2 : r - (r - l) * 2 - 2;
            var railR = slideDir === 1 ? l + (r - l) * 2 + 2 : r + 2;
            railL = Math.max(startCursor, railL);
            railR = Math.min(endCursor, railR);
            box(g, railL, railR, o.height + 1, o.height + 4, fF, fF + 2.2, 0x555555, { metal: 0.8, rough: 0.4 });

            if (slideDir === 1) {
              box(doorPivot, l + 6, l + 9, o.height * 0.5 - 10, o.height * 0.5 + 10, fF + 1.8, fF + 3, HANDLE, { metal: 0.7 });
            } else {
              box(doorPivot, r - 9, r - 6, o.height * 0.5 - 10, o.height * 0.5 + 10, fF + 1.8, fF + 3, HANDLE, { metal: 0.7 });
            }
          }
        } else if (o.isDouble) {
          doorPivot.userData.type = "double";
          var pairDir = o.swingDir || "R_IN";
          var pairInward = pairDir.endsWith("IN");
          var pairSign = pairInward ? 1 : -1;
          var pairWidth = r - l - 2 * jamb;
          var leafA = Math.max(1, Math.min(pairWidth - 1, +(o.leafA || pairWidth / 2)));
          var leafB = pairWidth - leafA;
          var pairZ0 = pairInward ? -2 : 0;
          var pairZ1 = pairInward ? 0 : 2;
          var leftLeaf = new THREE.Group();
          leftLeaf.position.set(l + jamb, 0, 0);
          leftLeaf.userData.maxOpen = pairSign * Math.PI / 2;
          box(leftLeaf, 0, leafA, 1, o.height - head, pairZ0, pairZ1, WOOD, { rough: 0.6 });
          box(leftLeaf, leafA - 4, leafA - 1, o.height * 0.5 - 6, o.height * 0.5 + 6, pairZ1, pairZ1 + 0.4, HANDLE, { metal: 0.7, rough: 0.3 });
          var rightLeaf = new THREE.Group();
          rightLeaf.position.set(r - jamb, 0, 0);
          rightLeaf.userData.maxOpen = -pairSign * Math.PI / 2;
          box(rightLeaf, -leafB, 0, 1, o.height - head, pairZ0, pairZ1, WOOD, { rough: 0.6 });
          box(rightLeaf, -leafB + 1, -leafB + 4, o.height * 0.5 - 6, o.height * 0.5 + 6, pairZ1, pairZ1 + 0.4, HANDLE, { metal: 0.7, rough: 0.3 });
          doorPivot.add(leftLeaf, rightLeaf);
          doorPivot.userData.leaves = [leftLeaf, rightLeaf];
        } else {
          var swingDir = o.swingDir || "R_IN";
          var isLeftHinge = swingDir.startsWith("L");
          var isInward = swingDir.endsWith("IN");
          
          var maxRot = Math.PI / 2;
          doorPivot.userData.maxOpen = isLeftHinge 
            ? (isInward ? maxRot : -maxRot)
            : (isInward ? -maxRot : maxRot);

          doorPivot.position.set(isLeftHinge ? l + jamb : r - jamb, 0, 0);
          var dw = r - l - 2 * jamb;
          
          var zP0 = isInward ? -2 : 0;
          var zP1 = isInward ? 0 : 2;

          var hX0 = isLeftHinge ? dw - 4 : -dw + 1;
          var hX1 = isLeftHinge ? dw - 1 : -dw + 4;
          var pX0 = isLeftHinge ? 0 : -dw;
          var pX1 = isLeftHinge ? dw : 0;

          box(doorPivot, pX0, pX1, 1, o.height - head, zP0, zP1, WOOD, { rough: 0.6 });
          // Handles on both sides
          box(doorPivot, hX0, hX1, o.height * 0.5 - 6, o.height * 0.5 + 6, zP0 - 0.4, zP0, HANDLE, { metal: 0.7, rough: 0.3 });
          box(doorPivot, hX0, hX1, o.height * 0.5 - 6, o.height * 0.5 + 6, zP1, zP1 + 0.4, HANDLE, { metal: 0.7, rough: 0.3 });
        }
        doorPivot.userData.opening=o.src;doorPivot.userData.open=o.src?.open===true;
        g.add(doorPivot);
        if (scene && scene.doors) scene.doors.push(doorPivot);
      }
    } else if (o.type === "window") {
      var top = o.sill + o.height;
      var wHead = Math.max(0, Math.min(FR.head, o.height / 2 - 1));
      var wSill = Math.max(0, Math.min(FR.sillW, o.height / 2 - 1));
      if (jamb > 0) {
        localBox(g, l, l + jamb, o.sill, top, fT, 0xf2eee4, { rough: 0.7 });
        localBox(g, r - jamb, r, o.sill, top, fT, 0xf2eee4, { rough: 0.7 });
      }
      if (wSill > 0) localBox(g, l + jamb, r - jamb, o.sill, o.sill + wSill, fT, 0xf2eee4, { rough: 0.7 });
      if (wHead > 0) localBox(g, l + jamb, r - jamb, top - wHead, top, fT, 0xf2eee4, { rough: 0.7 });
      var gl = l + jamb, gr = r - jamb, gy0 = o.sill + wSill, gy1 = top - wHead;
      box(g, gl, gr, gy0, gy1, -1, 1, GLASS, { trans: true, opacity: 0.34, metal: 0.1, rough: 0.05, cast: false });
      // mullions: vertical + horizontal dividers, evenly spaced across the glass
      var mt = FR.mull, md = Math.max(1.2, mt * 0.6);
      if (mt > 0) {
        for (var mi = 1; mi <= FR.mullV; mi++) {
          var mx = gl + ((gr - gl) * mi) / (FR.mullV + 1);
          box(g, mx - mt / 2, mx + mt / 2, gy0, gy1, -md, md, 0xf2eee4, { rough: 0.7 });
        }
        for (var hi = 1; hi <= FR.mullH; hi++) {
          var my = gy0 + ((gy1 - gy0) * hi) / (FR.mullH + 1);
          box(g, gl, gr, my - mt / 2, my + mt / 2, -md, md, 0xf2eee4, { rough: 0.7 });
        }
      }
    }
    // seamless passage: draw nothing — a fully open connection
    for (var ci = childrenBefore; ci < g.children.length; ci++)
      g.children[ci].userData.opening = o.src;
  });
  if (H < Hfull) {
    clipBelow(g, H);
    addWallCaps(g, H);
    g.userData.drawExtent.y1 = H;
  }
}

export {
  addWallCaps, buildStraightWall, clipBelow, cutH, cutH0, houseBounds,
  localBox, makeShadowOnly, shadowCopy,
};
