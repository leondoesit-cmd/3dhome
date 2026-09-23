// Drawing edges live outside the model: no picking, export or shadow changes.
// Inject the late-loaded three namespace so this stays off the boot graph.

const EPS = 1; // cm: coordinates closer than this are one station

// A wall endpoint is dimensioned on a side when nothing structural stands
// between it and that side: the ray out of the building crosses no other wall.
// That keeps the exterior corners and steps (as on a drafted sheet) and drops
// interior partitions, which would otherwise crowd the chain.
function seenFrom(p, segments, axis, dir) {
  const u = axis === 'x' ? 'x' : 'z', v = axis === 'x' ? 'z' : 'x';
  for (const s of segments) {
    const ends = [[s.ax, s.az], [s.bx, s.bz]].map(([x, z]) => ({ x, z }));
    if (ends.some(e => Math.abs(e.x - p.x) < EPS && Math.abs(e.z - p.z) < EPS)) continue;
    const lo = Math.min(ends[0][u], ends[1][u]), hi = Math.max(ends[0][u], ends[1][u]);
    if (p[u] < lo - EPS || p[u] > hi + EPS) continue;
    const du = ends[1][u] - ends[0][u];
    const hits = Math.abs(du) < EPS
      ? [ends[0][v], ends[1][v]]
      : [ends[0][v] + (ends[1][v] - ends[0][v]) * (p[u] - ends[0][u]) / du];
    if (hits.some(h => (h - p[v]) * dir > EPS)) return false;
  }
  return true;
}

// Chains for the four sides of the plan, in plan centimetres. Each side has a
// station list (sorted, deduped) and, per station, how far the witness line
// must reach back to the wall it measures.
export function planDimensionChains(segments) {
  const segs = segments.filter(s => [s.ax, s.az, s.bx, s.bz].every(Number.isFinite)
    && Math.hypot(s.bx - s.ax, s.bz - s.az) >= EPS);
  if (!segs.length) return [];
  const pts = segs.flatMap(s => [{ x: s.ax, z: s.az }, { x: s.bx, z: s.bz }]);
  const minX = Math.min(...pts.map(p => p.x)), maxX = Math.max(...pts.map(p => p.x));
  const minZ = Math.min(...pts.map(p => p.z)), maxZ = Math.max(...pts.map(p => p.z));
  const sides = [
    { side: 'top', along: 'x', across: 'z', dir: -1, edge: minZ },
    { side: 'bottom', along: 'x', across: 'z', dir: 1, edge: maxZ },
    { side: 'left', along: 'z', across: 'x', dir: -1, edge: minX },
    { side: 'right', along: 'z', across: 'x', dir: 1, edge: maxX },
  ];
  const out = [];
  for (const sd of sides) {
    if ((sd.along === 'x' ? maxX - minX : maxZ - minZ) < EPS) continue;
    // Ray from the point toward the side: along the axis the chain is NOT on.
    const seen = pts.filter(p => seenFrom(p, segs, sd.along, sd.dir));
    seen.sort((a, b) => a[sd.along] - b[sd.along]);
    const stations = [];
    for (const p of seen) {
      const last = stations[stations.length - 1];
      const reach = p[sd.across];
      if (last && Math.abs(p[sd.along] - last.at) < EPS) {
        // Several points share a station: the witness line stops at the outermost.
        if ((reach - last.from) * sd.dir > 0) last.from = reach;
      } else stations.push({ at: p[sd.along], from: reach });
    }
    if (stations.length < 2) continue;
    out.push({ side: sd.side, along: sd.along, dir: sd.dir, edge: sd.edge, stations });
  }
  return out;
}

export function createPlannerDrawing(THREE) {
  const group = new THREE.Group();
  group.name = "Planner drawing overlay";
  const material = new THREE.LineBasicMaterial({
    color: 0x176b86, transparent: true, opacity: 0.72,
    depthTest: false, depthWrite: false, toneMapped: false,
  });
  const meshes = new Map();
  const geometries = new Map();
  const instanceMatrix = new THREE.Matrix4();
  const worldMatrix = new THREE.Matrix4();
  const point = new THREE.Vector3();
  let chains = [], planKey = '', format = cm => (cm / 100).toFixed(2);

  // Dimension chains follow the walls, not the meshes: pass the visible wall
  // segments (plan cm, y = floor) and a length formatter for the labels.
  function setPlan(segments, formatter) {
    if (formatter) format = formatter;
    const key = segments.map(s => [s.ax, s.az, s.bx, s.bz].map(n => Math.round(n)).join(',')).join(';');
    if (key === planKey) return;
    planKey = key;
    chains = planDimensionChains(segments);
  }

  function sync(roots) {
    const live = new Set(), used = new Set();
    for (const root of roots) {
      if (!root) continue;
      let ancestor = root, visible = true;
      while (ancestor) {
        if (!ancestor.visible) { visible = false; break; }
        ancestor = ancestor.parent;
      }
      if (!visible) continue;
      root.updateWorldMatrix(true, true);
      root.traverseVisible(mesh => {
        if (!mesh.isMesh || mesh.isSkinnedMesh || !mesh.geometry) return;
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        if (!materials.some(m => m && m.visible && (!m.transparent || m.opacity >= 0.5))) return;
        const source = mesh.geometry;
        const revision = `${source.attributes.position?.version}:${source.index?.version}`;
        let geometry = geometries.get(source);
        if (geometry && geometry.userData.sourceRevision !== revision) {
          geometry.dispose();
          geometry = null;
        }
        if (!geometry) {
          // Keep creases and boundaries; suppress triangulation and smooth curves.
          // Furniture uses rounded boxes whose bevel facets turn by less than
          // 25 degrees; the old threshold removed their entire drawing.
          geometry = new THREE.EdgesGeometry(source, 12);
          geometry.userData.sourceRevision = revision;
          geometries.set(source, geometry);
        }
        used.add(source);
        const count = mesh.isInstancedMesh ? mesh.count : 1;
        for (let instance = 0; instance < count; instance++) {
        const key = mesh.isInstancedMesh ? mesh.uuid + ':' + instance : mesh;
        let line = meshes.get(key);
        if (!line) {
          line = new THREE.LineSegments(geometry, material);
          line.matrixAutoUpdate = false;
          line.renderOrder = 1000;
          line.raycast = () => {};
          group.add(line);
          meshes.set(key, line);
        }
        line.geometry = geometry;
        if (mesh.isInstancedMesh) {
          mesh.getMatrixAt(instance, instanceMatrix);
          worldMatrix.multiplyMatrices(mesh.matrixWorld, instanceMatrix);
          line.matrix.copy(worldMatrix);
        } else line.matrix.copy(mesh.matrixWorld);
        line.matrixWorldNeedsUpdate = true;
        line.layers.mask = mesh.layers.mask;
        live.add(key);
        }
      });
    }
    for (const [mesh, line] of meshes) {
      if (!live.has(mesh)) { group.remove(line); meshes.delete(mesh); }
    }
    for (const [source, geometry] of geometries) {
      if (!used.has(source)) { geometry.dispose(); geometries.delete(source); }
    }
  }

  // Screen-space ink avoids the beauty pass's temporal filtering. Both ends
  // still come from the actual world geometry and live camera, including
  // furniture instances, so the drawing follows orbit, zoom and item edits.
  function draw(canvas, camera, width, height, ratio = 1) {
    const w = Math.round(width * ratio), h = Math.round(height * ratio);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    camera.updateMatrixWorld();
    ctx.beginPath();
    for (const line of meshes.values()) {
      const positions = line.geometry.attributes.position;
      for (let i = 0; i + 1 < positions.count; i += 2) {
        point.fromBufferAttribute(positions, i).applyMatrix4(line.matrix).project(camera);
        const ax = point.x, ay = point.y, az = point.z;
        point.fromBufferAttribute(positions, i + 1).applyMatrix4(line.matrix).project(camera);
        if (az < -1 || az > 1 || point.z < -1 || point.z > 1) continue;
        ctx.moveTo((ax + 1) * width / 2, (1 - ay) * height / 2);
        ctx.lineTo((point.x + 1) * width / 2, (1 - point.y) * height / 2);
      }
    }
    ctx.lineJoin = 'round';
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = 'rgba(242,250,255,.55)';
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(18,87,115,.8)';
    ctx.stroke();
    camera_ = camera; view.w = width; view.h = height;
    const key = camera.matrixWorld.elements.concat(camera.projectionMatrix.elements).map(n => n.toFixed(3)).join() + planKey + width + 'x' + height;
    if (key !== occlusionKey) { occlusionKey = key; occlusion.clear(); }
    if (chains.length) render(ctx, planInk(), true, 'rgba(20,24,28,.92)', 1.1, 1);
    drawHover(ctx);
  }

  let camera_ = null;
  const view = { w: 1, h: 1 };
  function project(x, y, z) {
    point.set(x, y, z).project(camera_);
    if (point.z < -1 || point.z > 1) return null;
    return { x: (point.x + 1) * view.w / 2, y: (1 - point.y) * view.h / 2 };
  }

  /* Hidden-line test for the dimension ink. A piece of a dimension is hidden
     when a structural surface stands between the eye and it — the same answer
     the depth buffer would give, asked of the model on the CPU because the
     overlay is a 2D canvas that never sees the beauty pass's depth. Results
     are kept until the camera, the plan or the occluding roots change, so a
     hover redraw or a quiet frame costs nothing. */
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2(), target = new THREE.Vector3();
  let occluders = [], occlusion = new Map(), occlusionKey = '';
  function setOccluders(roots) {
    const next = roots.filter(Boolean);
    if (next.length !== occluders.length || next.some((r, i) => r !== occluders[i])) {
      occluders = next;
      occlusion.clear();
    }
  }
  function opaque(object) {
    for (let o = object; o; o = o.parent) if (!o.visible) return false;
    const mats = Array.isArray(object.material) ? object.material : [object.material];
    return mats.some(m => m && m.visible && (!m.transparent || m.opacity >= 0.5));
  }
  function hidden(x, y, z) {
    if (!occluders.length) return false;
    const key = `${Math.round(x)},${Math.round(y)},${Math.round(z)}`;
    let answer = occlusion.get(key);
    if (answer !== undefined) return answer;
    target.set(x, y, z);
    point.copy(target).project(camera_);
    ndc.set(point.x, point.y);
    raycaster.setFromCamera(ndc, camera_);
    const dist = raycaster.ray.origin.distanceTo(target);
    // A surface within a few cm of the point is the point's own footing.
    raycaster.near = 0; raycaster.far = Math.max(0, dist - 4);
    answer = raycaster.intersectObjects(occluders, true).some(h => opaque(h.object));
    occlusion.set(key, answer);
    return answer;
  }

  const options = { hiddenOpacity: 0.25, hoverOpacity: 0.9 };
  function setOptions(next) {
    for (const k of Object.keys(options)) {
      if (Number.isFinite(next?.[k])) options[k] = Math.min(1, Math.max(0, next[k]));
    }
  }

  // Ink is gathered in world space, then split into visible and hidden runs.
  function ink() { return { lines: [], labels: [] }; }
  function line(out, a, b) { out.lines.push([a, b]); }
  function label(out, a, b, outward, text) { out.labels.push({ a, b, outward, text }); }

  function strokeRuns(ctx, runs, alpha, dashed, color, width) {
    if (!runs.length || alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    if (dashed && ctx.setLineDash) ctx.setLineDash([5, 4]);
    ctx.beginPath();
    for (const [p, q] of runs) { ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); }
    ctx.lineWidth = width + 2;
    ctx.strokeStyle = 'rgba(255,255,255,.75)';
    ctx.stroke();
    ctx.lineWidth = width;
    ctx.strokeStyle = color;
    ctx.stroke();
    ctx.restore();
  }

  function letter(ctx, l, a, b, alpha, color) {
    const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy);
    if (len < 22 || alpha <= 0) return; // too short on screen to letter legibly
    let ang = Math.atan2(dy, dx);
    if (ang > Math.PI / 2) ang -= Math.PI; else if (ang < -Math.PI / 2) ang += Math.PI;
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    // Letter on the outside of the line, away from what it measures.
    let nx = -dy / len, ny = dx / len;
    const out = l.outward && project(...l.outward);
    if (out && (out.x - mx) * nx + (out.y - my) * ny < 0) { nx = -nx; ny = -ny; }
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(mx + nx * 8, my + ny * 8);
    ctx.rotate(ang);
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(255,255,255,.85)';
    ctx.strokeText(l.text, 0, 0);
    ctx.fillStyle = color;
    ctx.fillText(l.text, 0, 0);
    ctx.restore();
  }

  // occlude = false draws everything as visible (the hover sketch sits on top).
  function render(ctx, out, occlude, color, width, alpha) {
    const shown = [], behind = [];
    for (const [a, b] of out.lines) {
      const pa = project(...a), pb = project(...b);
      if (!pa || !pb) continue;
      const pieces = occlude ? Math.min(12, Math.max(1, Math.ceil(Math.hypot(pb.x - pa.x, pb.y - pa.y) / 36))) : 1;
      let prev = pa;
      for (let i = 1; i <= pieces; i++) {
        const t = i / pieces, tm = (i - 0.5) / pieces;
        const q = i === pieces ? pb : { x: pa.x + (pb.x - pa.x) * t, y: pa.y + (pb.y - pa.y) * t };
        const mid = [a[0] + (b[0] - a[0]) * tm, a[1] + (b[1] - a[1]) * tm, a[2] + (b[2] - a[2]) * tm];
        (occlude && hidden(...mid) ? behind : shown).push([prev, q]);
        prev = q;
      }
    }
    strokeRuns(ctx, shown, alpha, false, color, width);
    strokeRuns(ctx, behind, alpha * options.hiddenOpacity, true, color, width);
    ctx.font = '600 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const l of out.labels) {
      const pa = project(...l.a), pb = project(...l.b);
      if (!pa || !pb) continue;
      const mid = [(l.a[0] + l.b[0]) / 2, (l.a[1] + l.b[1]) / 2, (l.a[2] + l.b[2]) / 2];
      const k = occlude && hidden(...mid) ? options.hiddenOpacity : 1;
      letter(ctx, l, pa, pb, alpha * k, color);
    }
  }

  // Drafted like the sheet: an outer overall line, an inner chain of the
  // steps between exterior corners, slash ticks and a label per span.
  function planInk() {
    const out = ink();
    const span = Math.max(...chains.map(c => c.stations[c.stations.length - 1].at - c.stations[0].at));
    const gap = Math.min(Math.max(span * 0.06, 50), 160), gap2 = gap * 1.9;
    const at = (c, along, off) => {
      const across = c.edge + c.dir * off;
      return c.along === 'x' ? [along, 0, across] : [across, 0, along];
    };
    for (const c of chains) {
      const first = c.stations[0].at, last = c.stations[c.stations.length - 1].at;
      const tiers = c.stations.length > 2
        ? [{ off: gap, stops: c.stations.map(s => s.at) }, { off: gap2, stops: [first, last] }]
        : [{ off: gap, stops: [first, last] }];
      const outer = tiers[tiers.length - 1].off;
      for (const st of c.stations) {
        // Witness line: a small gap off the wall, running just past the outer line.
        const reach = (st.from - c.edge) * c.dir; // <= 0: how far inside the edge
        line(out, at(c, st.at, reach + 12), at(c, st.at, outer + 12));
      }
      for (const tier of tiers) {
        for (let i = 0; i < tier.stops.length; i++) {
          line(out, at(c, tier.stops[i] - 9, tier.off - 9), at(c, tier.stops[i] + 9, tier.off + 9));
          if (i === 0) continue;
          const q = at(c, tier.stops[i - 1], tier.off), p = at(c, tier.stops[i], tier.off);
          line(out, q, p);
          label(out, q, p, at(c, (tier.stops[i] + tier.stops[i - 1]) / 2, tier.off + 20),
            format(tier.stops[i] - tier.stops[i - 1]));
        }
      }
    }
    return out;
  }

  /* Hover sketch: the object's own edges plus width, depth and height measured
     in the object's frame, so a rotated sofa or a diagonal wall reads its true
     size rather than its axis-aligned footprint. */
  let hover = null;
  const hoverEdges = new Map();
  const inverse = new THREE.Matrix4(), local = new THREE.Matrix4();
  const box = new THREE.Box3(), part = new THREE.Box3();
  function setHover(object) {
    if (object === (hover && hover.object)) return false;
    for (const geometry of hoverEdges.values()) geometry.dispose();
    hoverEdges.clear();
    hover = null;
    if (!object) return true;
    object.updateWorldMatrix(true, true);
    inverse.copy(object.matrixWorld).invert();
    box.makeEmpty();
    object.traverseVisible(mesh => {
      if (!mesh.isMesh || !mesh.geometry || !opaque(mesh)) return;
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      local.multiplyMatrices(inverse, mesh.matrixWorld);
      box.union(part.copy(mesh.geometry.boundingBox).applyMatrix4(local));
    });
    if (box.isEmpty()) return true;
    // A caller that knows the object's true extent (a wall's run and height)
    // says so; the mesh box is the fallback and still supplies the rest.
    const ext = object.userData && object.userData.drawExtent;
    if (ext) {
      if (Number.isFinite(ext.x0) && Number.isFinite(ext.x1)) { box.min.x = ext.x0; box.max.x = ext.x1; }
      if (Number.isFinite(ext.y0) && Number.isFinite(ext.y1)) { box.min.y = ext.y0; box.max.y = ext.y1; }
    }
    hover = { object, min: box.min.clone(), max: box.max.clone() };
    return true;
  }

  function hoverInk() {
    const { object, min, max } = hover;
    const out = ink(), m = object.matrixWorld;
    const w = (x, y, z) => { point.set(x, y, z).applyMatrix4(m); return [point.x, point.y, point.z]; };
    const cam = camera_.getWorldPosition(new THREE.Vector3()).applyMatrix4(inverse.copy(m).invert());
    const cx = (min.x + max.x) / 2, cz = (min.z + max.z) / 2;
    const zs = cam.z >= cz ? max.z : min.z, zd = cam.z >= cz ? 1 : -1;
    const xs = cam.x >= cx ? max.x : min.x, xd = cam.x >= cx ? 1 : -1;
    const size = Math.max(max.x - min.x, max.z - min.z, max.y - min.y);
    const off = Math.min(Math.max(size * 0.12, 8), 40), tick = Math.min(6, off / 2);
    const worldLen = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    const dim = (a, b, witnessFromA, witnessFromB, outward) => {
      line(out, witnessFromA, a); line(out, witnessFromB, b); line(out, a, b);
      label(out, a, b, outward, format(worldLen(a, b)));
    };
    // Width along the face toward the eye, at the floor.
    const zo = zs + zd * off;
    dim(w(min.x, min.y, zo), w(max.x, min.y, zo), w(min.x, min.y, zs), w(max.x, min.y, zs), w(cx, min.y, zo + zd * off));
    line(out, w(min.x - tick, min.y, zo - tick * zd), w(min.x + tick, min.y, zo + tick * zd));
    line(out, w(max.x - tick, min.y, zo - tick * zd), w(max.x + tick, min.y, zo + tick * zd));
    // Depth along the side toward the eye.
    const xo = xs + xd * off;
    dim(w(xo, min.y, min.z), w(xo, min.y, max.z), w(xs, min.y, min.z), w(xs, min.y, max.z), w(xo + xd * off, min.y, cz));
    line(out, w(xo - tick * xd, min.y, min.z - tick), w(xo + tick * xd, min.y, min.z + tick));
    line(out, w(xo - tick * xd, min.y, max.z - tick), w(xo + tick * xd, min.y, max.z + tick));
    // Height at the corner the other two lines leave free.
    const zh = zs === max.z ? min.z : max.z;
    dim(w(xo, min.y, zh), w(xo, max.y, zh), w(xs, min.y, zh), w(xs, max.y, zh), w(xo + xd * off, (min.y + max.y) / 2, zh));
    return out;
  }

  function drawHover(ctx) {
    const alpha = options.hoverOpacity;
    if (!hover || alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    hover.object.traverseVisible(mesh => {
      if (!mesh.isMesh || !mesh.geometry || !opaque(mesh)) return;
      let edges = hoverEdges.get(mesh.geometry);
      if (!edges) hoverEdges.set(mesh.geometry, edges = new THREE.EdgesGeometry(mesh.geometry, 12));
      const pos = edges.attributes.position;
      for (let i = 0; i + 1 < pos.count; i += 2) {
        point.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld).project(camera_);
        const ax = point.x, ay = point.y, az = point.z;
        point.fromBufferAttribute(pos, i + 1).applyMatrix4(mesh.matrixWorld).project(camera_);
        if (az < -1 || az > 1 || point.z < -1 || point.z > 1) continue;
        ctx.moveTo((ax + 1) * view.w / 2, (1 - ay) * view.h / 2);
        ctx.lineTo((point.x + 1) * view.w / 2, (1 - point.y) * view.h / 2);
      }
    });
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = 'rgba(255,255,255,.7)';
    ctx.stroke();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(214,92,24,.95)';
    ctx.stroke();
    ctx.restore();
    render(ctx, hoverInk(), false, 'rgba(176,64,10,.98)', 1.2, alpha);
  }

  function dispose() {
    chains = []; planKey = '';
    setHover(null);
    occluders = []; occlusion.clear();
    group.removeFromParent();
    group.clear();
    meshes.clear();
    for (const geometry of geometries.values()) geometry.dispose();
    geometries.clear();
    material.dispose();
  }
  return { group, sync, draw, dispose, setPlan, setOccluders, setOptions, setHover,
    get chains() { return chains; }, get hover() { return hover; }, get options() { return { ...options }; } };
}
