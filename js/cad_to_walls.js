/* Convert normalized CAD primitives into the planner's architectural wall
   graph.  Parsing DWG/DXF is deliberately outside this module: importers only
   need to supply centimetre line/arc/opening records, keeping the conversion
   deterministic and testable (and equally usable by blueprint recognition). */

const EPS = 1e-6;
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const finitePoint = (p) => p && Number.isFinite(+p.x) && Number.isFinite(+p.z);

function lineGeom(line) {
  const a = line.a || { x: line.x1, z: line.z1 };
  const b = line.b || { x: line.x2, z: line.z2 };
  if (!finitePoint(a) || !finitePoint(b)) return null;
  const dx = +b.x - +a.x, dz = +b.z - +a.z, L = Math.hypot(dx, dz);
  if (L < EPS) return null;
  return { a: { x: +a.x, z: +a.z }, b: { x: +b.x, z: +b.z }, dx, dz, L, ux: dx / L, uz: dz / L };
}

function parallelPair(a, b, options) {
  const ga = lineGeom(a), gb = lineGeom(b);
  if (!ga || !gb) return null;
  const dot = Math.abs(ga.ux * gb.ux + ga.uz * gb.uz);
  if (dot < Math.cos(((options.angleToleranceDeg || 2) * Math.PI) / 180)) return null;
  const nx = -ga.uz, nz = ga.ux;
  const signed = (gb.a.x - ga.a.x) * nx + (gb.a.z - ga.a.z) * nz;
  const width = Math.abs(signed);
  if (width < (options.minWidth || 4) || width > (options.maxWidth || 60)) return null;
  const project = (p) => (p.x - ga.a.x) * ga.ux + (p.z - ga.a.z) * ga.uz;
  const q0 = project(gb.a), q1 = project(gb.b);
  const lo = Math.max(0, Math.min(q0, q1)), hi = Math.min(ga.L, Math.max(q0, q1));
  if (hi - lo < (options.minLength || 20)) return null;
  const side = signed >= 0 ? 1 : -1;
  return {
    a: { x: ga.a.x + ga.ux * lo + nx * signed / 2, z: ga.a.z + ga.uz * lo + nz * signed / 2 },
    b: { x: ga.a.x + ga.ux * hi + nx * signed / 2, z: ga.a.z + ga.uz * hi + nz * signed / 2 },
    thickness: width,
    flip: side < 0,
    score: hi - lo,
  };
}

function projectSegment(p, a, b) {
  const dx = b.x - a.x, dz = b.z - a.z, ll = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / ll));
  const x = a.x + dx * t, z = a.z + dz * t;
  return { t, x, z, d: Math.hypot(p.x - x, p.z - z), s: Math.sqrt(ll) * t };
}

function splitAtJunctions(segments, tol = 1.5) {
  let changed = true, passes = 0;
  while (changed && passes++ < 20) {
    changed = false;
    for (let i = 0; i < segments.length; i++) {
      const s = segments[i];
      for (let j = 0; j < segments.length; j++) {
        if (i === j) continue;
        const other = segments[j];
        const pts = [other.a, other.b];
        for (const pt of pts) {
          const proj = projectSegment(pt, s.a, s.b);
          if (proj.d <= tol && proj.t > 0.01 && proj.t < 0.99) {
            const splitPt = { x: proj.x, z: proj.z };
            const s1 = { ...s, b: splitPt };
            const s2 = { ...s, a: splitPt };
            segments.splice(i, 1, s1, s2);
            changed = true;
            break;
          }
        }
        if (changed) break;
      }
      if (changed) break;
    }
  }
  return segments;
}

export function convertCadToWalls(source = {}, options = {}) {
  const lines = (source.lines || []).filter(lineGeom);
  const consumed = new Set(), segments = [];
  for (let i = 0; i < lines.length; i++) {
    if (consumed.has(i)) continue;
    let best = null;
    for (let j = i + 1; j < lines.length; j++) {
      if (consumed.has(j)) continue;
      if (lines[i].layer && lines[j].layer && lines[i].layer !== lines[j].layer) continue;
      const pair = parallelPair(lines[i], lines[j], options);
      if (pair && (!best || pair.score > best.pair.score)) best = { j, pair };
    }
    if (best) {
      consumed.add(i); consumed.add(best.j);
      segments.push({ ...best.pair, layer: lines[i].layer || "walls" });
    }
  }
  // A layer can explicitly contain wall centre lines; keep otherwise-unpaired
  // records only when requested, avoiding accidental conversion of dimensions.
  if (options.singleLineWalls) {
    lines.forEach((line, i) => {
      if (consumed.has(i)) return;
      const g = lineGeom(line);
      if (!g) return;
      // a measured source (a room scan) knows each wall's own height; keep it
      // rather than flattening the storey to one average
      segments.push({
        a: g.a, b: g.b,
        thickness: +(line.thickness || options.defaultThickness || 10),
        height: Number(line.height) > 0 ? +line.height : null,
        layer: line.layer || "walls",
      });
    });
  }

  const nodeTol = options.nodeTolerance || 1;
  splitAtJunctions(segments, Math.max(1.5, nodeTol));

  const nodes = [], walls = [], openings = [], rejectedOpenings = [];
  const node = (p) => {
    let found = nodes.findIndex((n) => dist(n, p) <= nodeTol);
    if (found < 0) { found = nodes.length; nodes.push({ x: p.x, z: p.z }); }
    return found;
  };
  let id = Number(options.firstId) || 1;
  segments.forEach((s) => {
    const map = options.wallTypeByLayer || {};
    walls.push({
      id: id++, a: node(s.a), b: node(s.b), thickness: s.thickness,
      height: Number(s.height) > 0 ? +s.height : +(options.height || 270),
      wallTypeId: map[s.layer] || options.wallTypeId || "generic",
      kind: s.kind || "normal", datum: options.datum || "center", flip: !!s.flip,
      phase: options.phase || "existing", sourceLayer: s.layer,
    });
  });

  const openingRecords = [
    ...(source.doors || []).map((o) => ({ ...o, type: o.type || "door" })),
    ...(source.windows || []).map((o) => ({ ...o, type: o.type || "window" })),
  ];
  openingRecords.forEach((o) => {
    const p = o.center || { x: o.x, z: o.z };
    if (!finitePoint(p)) return;
    let best = null;
    walls.forEach((w) => {
      const hit = projectSegment(p, nodes[w.a], nodes[w.b]);
      if (!best || hit.d < best.hit.d) best = { w, hit };
    });
    if (!best || best.hit.d > (options.openingTolerance || Math.max(30, best.w.thickness))) return;
    const width = +(o.width || (o.type === "window" ? 120 : 90));
    if(!Number.isFinite(width)||width<=0||width>dist(nodes[best.w.a],nodes[best.w.b])){rejectedOpenings.push({id:o.id,type:o.type,reason:"opening-wider-than-wall",wall:best.w.id});return;}
    openings.push({
      id: id++, type: o.type, wall: best.w.id,
      s: Math.max(width / 2, Math.min(best.hit.s, dist(nodes[best.w.a], nodes[best.w.b]) - width / 2)),
      width, height: +(o.height || (o.type === "window" ? 120 : 205)),
      sill: +(o.sill != null ? o.sill : o.type === "window" ? 90 : 0),
    });
  });

  // CAD arcs are already centre lines. They retain the normal planner endpoints
  // and add analytic geometry for the curved wall renderer.
  (source.arcs || []).forEach((arc) => {
    const c = arc.center || { x: arc.cx != null ? arc.cx : arc.x, z: arc.cz != null ? arc.cz : arc.z };
    const r = +arc.radius, a0 = +arc.startAngle, a1 = +arc.endAngle;
    if (!finitePoint(c) || !(r > 0) || !Number.isFinite(a0) || !Number.isFinite(a1)) return;
    const p0 = { x: +c.x + Math.cos(a0) * r, z: +c.z + Math.sin(a0) * r };
    const p1 = { x: +c.x + Math.cos(a1) * r, z: +c.z + Math.sin(a1) * r };
    walls.push({
      id: id++, a: node(p0), b: node(p1), thickness: +(arc.thickness || options.defaultThickness || 10),
      height: +(options.height || 270), wallTypeId: (options.wallTypeByLayer || {})[arc.layer] || options.wallTypeId || "generic",
      kind: arc.kind || "normal", datum: options.datum || "center", phase: options.phase || "existing",
      geometry: { type: "arc", center: { x: +c.x, z: +c.z }, radius: r, startAngle: a0, endAngle: a1, clockwise: !!arc.clockwise },
      sourceLayer: arc.layer || "walls",
    });
  });
  return { nodes, walls, openings, nextId: id, diagnostics: { rejectedOpenings, pairedLines: consumed.size, unpairedLines: lines.length - consumed.size } };
}
