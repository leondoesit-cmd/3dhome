/* Drawing sheet arrowheads, hatching, dimension text, measuring and
   dimension/note resolution, split out of js/cad_sheet.js. It shares the
   editor's state through live imports from ../cad_sheet.js. */
import { layoutViews } from "../cad_sheet/layout.js";
import { axisCentrelines, centreMark, detailMarker, noteItems, sectionMarker } from "../cad_sheet/markers.js";
import { bomTableItems, layoutBomTable, titleBlockItems, zoneMarks } from "../cad_sheet/title.js";
import { resolveComponentBalloon } from "../core/assembly_balloon.js";
import { layoutBalloonCenters } from "../core/balloon_layout.js";
import { resolveDimensionTolerance } from "../core/dimension_tolerance.js";
import { alignedSectionMarkerItems } from "../core/drawing_aligned_section.js";
import { alternatePositionItems } from "../core/drawing_alternate_position.js";
import { breakBoundaryItems, clipBreakEdges } from "../core/drawing_break.js";
import { coneDraftAngle } from "../core/drawing_cone_angle.js";
import { clipCropEdges } from "../core/drawing_crop.js";
import { drawingImageItem } from "../core/drawing_image.js";
import { drawingPrimitiveItems } from "../core/drawing_primitives.js";
import { derivedParentId, effectiveViewSource, sameDrawingSource, viewSourceOwner } from "../core/drawing_view_source.js";
import { circleCropArcs, cropProjection, isOrthoView, projectionBounds, viewBasis } from "../core/hidden_line.js";
import { analyzeSectionBoundaries } from "../core/section_boundaries.js";
import { sectionHatchCaption, sectionHatchSegments } from "../core/section_hatch.js";
import { excludeRibHatch } from "../core/section_rib_hatch.js";
import {
  ARROW_LENGTH, ARROW_WIDTH, LINE_STYLES, MAX_CROSS_EDGES, TEXT_SIZES,
  UNIT_DECIMALS, UNIT_FACTORS, boundsRefs, byCoordinate, circle, clamp,
  defaultViewLabel, line, nearProjected, num, paperPerModel, poly,
  projectToView, rect, scaleLabel, scaleValue, sheetFrame, text,
  titleBlockBox, trimNumber,
} from "../cad_sheet.js";

function arrowHead(x, y, dx, dy, scale = 1) {
  const length = Math.hypot(dx, dy) || 1;
  const ux = dx / length, uy = dy / length, px = -uy, py = ux;
  const tail = { x: x - ux * ARROW_LENGTH * scale, y: y - uy * ARROW_LENGTH * scale };
  return poly([
    { x, y },
    { x: tail.x + px * ARROW_WIDTH * scale, y: tail.y + py * ARROW_WIDTH * scale },
    { x: tail.x - px * ARROW_WIDTH * scale, y: tail.y - py * ARROW_WIDTH * scale },
  ], "fill", { fill: LINE_STYLES.dim.color, closed: true });
}

/* Scanline hatch of the loops a section plane carved, at 45° and even-odd so
   an inner boss inside a cut wall stays unhatched the way it must. */
export function hatchLoops(loops, options = {}) {
  const spacing = options.spacing || 2.5, angle = (options.angle ?? 45) * Math.PI / 180;
  const segments = [];
  const edges = [];
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const loop of loops) {
    for (let i = 0; i < loop.length; i++) {
      const a = loop[i], b = loop[(i + 1) % loop.length];
      edges.push({ a, b });
      x0 = Math.min(x0, a.x); x1 = Math.max(x1, a.x);
      y0 = Math.min(y0, a.y); y1 = Math.max(y1, a.y);
    }
  }
  if (!edges.length || !Number.isFinite(x0)) return segments;
  const dir = { x: Math.cos(angle), y: Math.sin(angle) };
  const normal = { x: -dir.y, y: dir.x };
  const corners = [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x0, y: y1 }, { x: x1, y: y1 }];
  const offsets = corners.map((point) => point.x * normal.x + point.y * normal.y);
  const phase = Number.isFinite(options.offset) ? options.offset : 0;
  const start = Math.ceil((Math.min(...offsets) - phase) / spacing) * spacing + phase;
  const end = Math.max(...offsets);
  const along = corners.map((point) => point.x * dir.x + point.y * dir.y);
  const tMin = Math.min(...along) - spacing, tMax = Math.max(...along) + spacing;
  for (let offset = start; offset <= end; offset += spacing) {
    const base = { x: normal.x * offset, y: normal.y * offset };
    const hits = [];
    for (const edge of edges) {
      const da = (edge.a.x * normal.x + edge.a.y * normal.y) - offset;
      const db = (edge.b.x * normal.x + edge.b.y * normal.y) - offset;
      // Half-open crossings count a shared vertex once; tangencies cancel.
      if ((da > 0) === (db > 0)) continue;
      if (Math.abs(da - db) < 1e-9) continue;
      const t = da / (da - db);
      const point = { x: edge.a.x + (edge.b.x - edge.a.x) * t, y: edge.a.y + (edge.b.y - edge.a.y) * t };
      hits.push(point.x * dir.x + point.y * dir.y);
    }
    if (hits.length < 2) continue;
    hits.sort((a, b) => a - b);
    for (let i = 0; i + 1 < hits.length; i += 2) {
      const a = clamp(hits[i], tMin, tMax), b = clamp(hits[i + 1], tMin, tMax);
      if (b - a < 0.2) continue;
      segments.push({
        x1: base.x + dir.x * a, y1: base.y + dir.y * a,
        x2: base.x + dir.x * b, y2: base.y + dir.y * b,
      });
    }
  }
  return segments;
}

/* Chain the loose segments a section plane produced into closed loops. The cut
   arrives as unordered chords — one per triangle it sliced — and a hatch needs
   boundaries. */
export function chainLoops(segments, tolerance) {
  return analyzeSectionBoundaries(segments, tolerance).loops;
}

export function formatLength(modelValue, doc) {
  const units = doc?.units || "mm";
  const factor = UNIT_FACTORS[units] || 10;
  const decimals = Number.isInteger(doc?.precision) ? clamp(doc.precision,0,8) : UNIT_DECIMALS[units] ?? 1;
  const value = num(modelValue) * factor;
  const rounded = Math.abs(value) < .5 * 10 ** -decimals ? 0 : value;
  const digits=rounded.toFixed(decimals);
  const fixed = (doc?.trailingZeros ?? Number.isInteger(doc?.precision)) || !digits.includes(".") ? digits : digits.replace(/\.?0+$/, "");
  return fixed || "0";
}

/* A dimension's own tolerance is SPECIFIC: it overrides the title block's
   general note (meta.tolerance, printed once above the block) for this one
   dimension, which is why it prints on the dimension itself and the general
   one never is. It also survives an overridden value — a draughtsman who
   writes "2×⌀5" over the measured number has not withdrawn the fit beside
   it. */
export function dimensionText(dim, doc) {
  if(dim.reference)return "("+dimensionText({...dim,reference:false},doc)+")";
  if(Number.isInteger(dim.quantity) && dim.quantity>1)return dim.quantity+"X "+dimensionText({...dim,quantity:1},doc);
  const suffix = dim.tolerance ? " " + dim.tolerance : "";
  // <> keeps the measured value live inside custom text, e.g. Ø<> for a
  // bolt-circle span. Literal overrides remain literal for existing sheets.
  if (dim.text) {
    const text = String(dim.text);
    const measured = text.includes("<>") ? dimensionText({...dim,text:"",tolerance:""},doc) : "";
    return text.replaceAll("<>", measured) + suffix;
  }
  const value = formatLength(dim.measure, Number.isInteger(dim.precision)&&dim.precision>=0&&dim.precision<=8 ? {...doc,precision:dim.precision} : doc);
  const prefix = dim.type === "diameter" ? "⌀" : dim.type === "radius" ? "R" : "";
  if (dim.type === "angle") {
    const precision=Number.isInteger(dim.anglePrecision)?dim.anglePrecision:doc?.anglePrecision;
    return (Number.isInteger(precision)&&precision>=0&&precision<=8?num(dim.measure).toFixed(precision):trimNumber(Math.round(num(dim.measure)*10)/10))+"°"+suffix;
  }
  const secondary = UNIT_FACTORS[doc?.secondaryUnits] && doc.secondaryUnits !== doc.units
    ? " [" + formatLength(dim.measure, {units:doc.secondaryUnits,precision:doc.secondaryPrecision ?? 2,trailingZeros:true}) + "]" : "";
  return prefix + value + secondary + suffix;
}

/* The measured value of a dimension, from the points it holds. Stored
   references are in the view's own model coordinates, so a view that moves or
   rescales carries its dimensions with it and they still read true.
   Call it on the copy resolveDim returns, not on the stored record: the stored
   points are where the dimension WAS placed, which after a rebuild is history. */
export function measureDim(dim) {
  const [a, b] = dim.refs || [];
  if (dim.type === "radius" || dim.type === "diameter") {
    const radius = num(dim.radius);
    return dim.type === "diameter" ? radius * 2 : radius;
  }
  if (!a || !b) return 0;
  if (dim.type === "horizontal") return Math.abs(b.u - a.u);
  if (dim.type === "vertical") return Math.abs(b.v - a.v);
  if (dim.type === "angle") {
    const c = dim.refs[2];
    if (!c) return 0;
    const angle = (p, q) => Math.atan2(q.v - p.v, q.u - p.u);
    let delta = (angle(b, c) - angle(b, a)) * 180 / Math.PI;
    while (delta <= -180) delta += 360;
    while (delta > 180) delta -= 360;
    return Math.abs(delta);
  }
  return Math.hypot(b.u - a.u, b.v - a.v);
}

export function createTopologyIndex(source) {
  const index = new Map();
  const walk = (item) => {
    if (!item) return;
    if (Array.isArray(item)) { item.forEach(walk); return; }
    if (Array.isArray(item.topology)) { item.topology.forEach(walk); return; }
    if (item.persistentId && !index.has(item.persistentId)) index.set(item.persistentId, item);
  };
  walk(source);
  return index;
}

/* Kernel edges carry their endpoints; analytic ones (a box rib, an extrusion
   side) carry a centre, a tangent and a length, which is the same two points. */
function edgeEndpoints(descriptor) {
  const stored = descriptor?.endpoints;
  if (Array.isArray(stored) && stored.length >= 2) return stored.slice(0, 2).sort(byCoordinate);
  const origin = descriptor?.origin, axis = descriptor?.axis, measure = num(descriptor?.measure);
  if (!origin || !axis || !(measure > 0) || descriptor.curve === "circle") return null;
  const length = Math.hypot(axis.x, axis.y, axis.z);
  if (!(length > 1e-9)) return null;
  const half = measure / (2 * length);
  return [
    { x: origin.x - axis.x * half, y: origin.y - axis.y * half, z: origin.z - axis.z * half },
    { x: origin.x + axis.x * half, y: origin.y + axis.y * half, z: origin.z + axis.z * half },
  ].sort(byCoordinate);
}

/* One named straight edge as a segment in the view's own frame, or null when
   it is a circle, unnamed, or projects to a point (an edge seen end-on). */
function edgeSegmentInView(entry, basis) {
  if (!entry || entry.kind !== "edge") return null;
  const ends = edgeEndpoints(entry.descriptor || {});
  if (!ends) return null;
  const p = projectToView(ends[0], basis), q = projectToView(ends[1], basis);
  if (!p || !q) return null;
  return Math.hypot(q.u - p.u, q.v - p.v) > 1e-9 ? { p, q } : null;
}

/* Where two segments cross, or null when they are parallel or when the meeting
   point is off the end of either. Off-the-end is deliberately NOT returned: the
   point the user snapped to was two lines crossing, and lines that no longer
   cross have not moved that point, they have destroyed it. */
export function segmentIntersection(a, b, slack = 1e-9) {
  const rx = a.q.u - a.p.u, ry = a.q.v - a.p.v;
  const sx = b.q.u - b.p.u, sy = b.q.v - b.p.v;
  const denominator = rx * sy - ry * sx;
  const scale = Math.hypot(rx, ry) * Math.hypot(sx, sy);
  if (!(Math.abs(denominator) > 1e-12 * Math.max(scale, 1e-6))) return null;
  const t = ((b.p.u - a.p.u) * sy - (b.p.v - a.p.v) * sx) / denominator;
  const u = ((b.p.u - a.p.u) * ry - (b.p.v - a.p.v) * rx) / denominator;
  if (t < -slack || t > 1 + slack || u < -slack || u > 1 + slack) return null;
  return { u: a.p.u + rx * t, v: a.p.v + ry * t };
}

/* An intersection is a DERIVED anchor: two parents, not one. The ref names both
   ids and the point is recomputed by crossing the two named edges in the view's
   own frame on every build, so it follows the model exactly as a single-parent
   ref does — and it dangles the moment EITHER parent is gone, because half a
   parentage is not a reference. */
function crossAnchor(ref, index, basis) {
  const a = edgeSegmentInView(index.get(ref.pid), basis);
  const b = edgeSegmentInView(index.get(ref.pid2), basis);
  if (!a || !b) return null;
  return segmentIntersection(a, b, 1e-6);
}

export function topologyCrossings(index, basis) {
  const out = [];
  if (!index || !basis) return out;
  const ids = Array.from(index.keys()).sort();
  const segments = [];
  for (const pid of ids) {
    const segment = edgeSegmentInView(index.get(pid), basis);
    if (segment) segments.push({ pid, segment });
    if (segments.length >= MAX_CROSS_EDGES) break;
  }
  for (let i = 0; i < segments.length; i++) {
    for (let j = i + 1; j < segments.length; j++) {
      const point = segmentIntersection(segments[i].segment, segments[j].segment);
      if (!point) continue;
      /* Two edges that merely meet at a shared corner are not an intersection:
         that point already has a one-parent name of its own ("a" or "b"), and
         offering it twice would let the same corner bind two different ways. */
      const ends = [segments[i].segment.p, segments[i].segment.q, segments[j].segment.p, segments[j].segment.q];
      if (ends.some((end) => Math.hypot(end.u - point.u, end.v - point.v) < 1e-7)) continue;
      out.push({ pid: segments[i].pid, pid2: segments[j].pid, kind: "cross", at: "x", u: point.u, v: point.v });
    }
  }
  return out;
}

/* Where one ref sits in the view NOW, or null if its id is gone. */
export function resolveDimAnchor(ref, index, basis) {
  if (!ref?.pid || !index || !basis) return null;
  if (ref.kind === "cross") return ref.pid2 ? crossAnchor(ref, index, basis) : null;
  const entry = index.get(ref.pid);
  if (!entry || (ref.kind && entry.kind !== ref.kind)) return null;
  const descriptor = entry.descriptor || {};
  const at = ref.at || "mid";
  /* Model Items may dimension the distance between a feature's persistent
     start/end faces. Their plane origins move with the feature depth. Keep
     face picks out of the interactive snap set, but resolve explicit refs. */
  if (entry.kind === "face") return at === "centre" ? projectToView(descriptor.origin || descriptor.center, basis) : null;
  if (at === "a" || at === "b") {
    const ends = edgeEndpoints(descriptor);
    return ends ? projectToView(ends[at === "a" ? 0 : 1], basis) : null;
  }
  const centre = projectToView(descriptor.origin || descriptor.center, basis);
  if (!centre) return null;
  if (at === "mid" || at === "centre") return centre;
  const radius = num(descriptor.radius);
  if (!(radius > 0)) return null;
  if (at !== "qu+" && at !== "qu-" && at !== "qv+" && at !== "qv-") return null;
  const origin = descriptor.origin || descriptor.center;
  const axis = descriptor.axis;
  const axisLen = axis ? Math.hypot(num(axis.x), num(axis.y), num(axis.z)) : 0;
  if (origin && axisLen > 1e-9) return circleQuadrant(origin, axis, axisLen, radius, basis, at);
  if (at === "qu+") return { u: centre.u + radius, v: centre.v };
  if (at === "qu-") return { u: centre.u - radius, v: centre.v };
  if (at === "qv+") return { u: centre.u, v: centre.v + radius };
  if (at === "qv-") return { u: centre.u, v: centre.v - radius };
  return null;
}

/* A quadrant of a tilted circle is the extremum of the projected ellipse,
   not the view-plane offset of the full radius. Edge-on, that extremum
   collapses and the anchor is omitted. */
function circleQuadrant(origin, axis, axisLen, radius, basis, at) {
  const ax = { x: axis.x / axisLen, y: axis.y / axisLen, z: axis.z / axisLen };
  const view = at === "qu+" || at === "qu-" ? basis.right : basis.up;
  const along = view.x * ax.x + view.y * ax.y + view.z * ax.z;
  const plane = { x: view.x - ax.x * along, y: view.y - ax.y * along, z: view.z - ax.z * along };
  const planeLen = Math.hypot(plane.x, plane.y, plane.z);
  if (planeLen < 1e-8) return null;
  const sign = at === "qu+" || at === "qv+" ? 1 : -1;
  const scale = sign * radius / planeLen;
  return projectToView({
    x: origin.x + plane.x * scale,
    y: origin.y + plane.y * scale,
    z: origin.z + plane.z * scale,
  }, basis);
}

/* One dimension as the sheet should read it right now.
 *
 * @returns {dim, dangling, missing} — `dim` is a COPY with reprojected refs;
 *          the document is never rewritten, so a legacy sheet stays legacy.
 *
 * A ref with no `pid` is a legacy point: it measures exactly as it always has,
 * frozen, with no complaint. Only a ref that names an id and cannot find it is
 * dangling. With no topology source at all (an exporter handed only triangles)
 * nothing is flagged — absent information is not a lost reference. */
export function edgeAngleRefs(points) {
  if (!points || points.length !== 4) return null;
  const [a,b,c,d]=points, x=b.u-a.u,y=b.v-a.v,p=d.u-c.u,q=d.v-c.v;
  const det=x*q-y*p;
  if (Math.abs(det)<1e-10*Math.max(1,Math.hypot(x,y)*Math.hypot(p,q))) return null;
  const t=((c.u-a.u)*q-(c.v-a.v)*p)/det;
  const vertex={u:a.u+t*x,v:a.v+t*y};
  const far=(m,n)=>Math.hypot(m.u-vertex.u,m.v-vertex.v)>Math.hypot(n.u-vertex.u,n.v-vertex.v)?m:n;
  return [far(a,b),vertex,far(c,d)];
}

export function projectedDimensionBinding(dim, source, projection) {
  const near = nearProjected;
  // A two-edge angle may have a virtual vertex outside both picked segments.
  // For a host assembly, verify the four picked endpoints themselves.
  const refs = !source && dim.type === 'angle' && dim.edgeRefs?.length === 4 ? dim.edgeRefs : dim.refs;
  const anchors = (refs || []).map(ref => {
    const matches = [];
    const at = (u, v) => near(ref.u, u) && near(ref.v, v);
    for (const { a, b } of [...(projection?.visible || []), ...(projection?.hidden || [])]) {
      if (!dim.radius && (at(a.u,a.v) || at(b.u,b.v) || at((a.u+b.u)/2,(a.v+b.v)/2))) {
        matches.push(JSON.stringify([[a.u,a.v],[b.u,b.v]].sort()));
      }
    }
    for (const c of projection?.circles || []) {
      if (dim.radius && !near(c.radius,dim.radius)) continue;
      if (at(c.u,c.v) || at(c.u+c.radius,c.v) || at(c.u-c.radius,c.v) || at(c.u,c.v+c.radius) || at(c.u,c.v-c.radius)) {
        matches.push(JSON.stringify([c.u,c.v,c.radius]));
      }
    }
    return matches.sort();
  });
  return { source, anchors };
}

// Stored witnesses are JSON strings. Compare segments in either direction,
// and match the incident geometry as a multiset (including duplicates).
function sameProjectedWitness(left,right) {
  if (left === right) return true;
  try {
    const a = JSON.parse(left), b = JSON.parse(right);
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    if (a.length === 3) return a.every((n,i) => nearProjected(n,b[i]));
    const point = (p,q) => Array.isArray(p) && Array.isArray(q) && p.length === 2 && q.length === 2
      && nearProjected(p[0],q[0]) && nearProjected(p[1],q[1]);
    return a.length === 2 && ((point(a[0],b[0]) && point(a[1],b[1])) || (point(a[0],b[1]) && point(a[1],b[0])));
  } catch { return false; }
}

function sameWitnessSet(current,saved) {
  if (!current.length || !Array.isArray(saved) || saved.length !== current.length) return false;
  if (current.every((entry,i) => entry === saved[i])) return true;
  const remaining = saved.slice();
  return current.every(entry => {
    const index = remaining.findIndex(old => sameProjectedWitness(entry,old));
    if (index < 0) return false;
    remaining.splice(index,1);
    return true;
  });
}

// A null source identifies the sheet owner, including its assembly poses.
function sameProjectedBinding(dim, source, projection) {
  const saved = dim.sourceBinding;
  if (!saved || !sameDrawingSource(saved.source, source) || !projection?.bounds) return false;
  const { anchors } = projectedDimensionBinding(dim, source, projection);
  return anchors.length > 0 && saved.anchors?.length === anchors.length
    && anchors.every((matches,i) => sameWitnessSet(matches,saved.anchors[i]));
}

export function resolveDim(dim, index, basis, projection, model) {
  const result = { dim, dangling: false, missing: [] };
  if (!dim) return result;
  if(dim.type==='angle' && dim.coneAngle) {
    const binding=dim.coneAngle,face=index?.get(binding.faceId);
    const owned=face?.persistentId?.startsWith(binding.featureId+':');
    const resolved=owned && !projection?.nonlinearProjection ? coneDraftAngle(face,basis,binding.side) : null;
    const source=model ? (model.features || []).find(f=>f.id===binding.featureId) : null;
    const current=!model || source && !source.suppressed && source.type==='extrude'
      && resolved && Math.abs(Math.abs(Number(source.params?.draftAngle))-resolved.degrees)<1e-5;
    if(resolved && current)result.dim={...dim,refs:resolved.refs};
    else {result.dangling=true;result.missing=[binding.faceId];}
    return result;
  }
  if (dim.type === "angle" && dim.edgeRefs?.length === 4) {
    const points=dim.edgeRefs.map(ref=>resolveDimAnchor(ref,index,basis));
    const refs=points.every(Boolean)?edgeAngleRefs(points):null;
    if(refs) result.dim={...dim,refs};
    else {result.dangling=!!index;result.missing=dim.edgeRefs.filter((ref,i)=>!points[i]).map(ref=>ref.pid);}
    return result;
  }
  if (dim.auto === "extent") {
    const bounds = projection ? projection.sourceBounds || projectionBounds(projection) : null;
    if (!bounds) { result.dangling = true; return result; }
    result.dim = Object.assign({}, dim, { refs: boundsRefs(dim.type, bounds) });
    return result;
  }
  const refs = dim.refs || [];
  if (!refs.some((ref) => ref?.pid)) return result;
  const next = refs.map((ref) => {
    if (!ref?.pid) return ref;
    const at = resolveDimAnchor(ref, index, basis);
    if (at) return Object.assign({}, ref, at);
    if (index) {
      result.dangling = true;
      /* An intersection reports the parent that is actually gone, not just the
         first of the two it names — the panel lists these ids verbatim. */
      const parents = ref.kind === "cross" ? [ref.pid, ref.pid2] : [ref.pid];
      const lost = parents.filter((pid) => pid && !index.has(pid));
      result.missing.push(...(lost.length ? lost : [ref.pid]));
    }
    return ref;                                     // drawn where it last was
  });
  const patch = { refs: next };
  if (dim.type === "radius" || dim.type === "diameter") {
    const entry = refs[0]?.pid ? index?.get(refs[0].pid) : null;
    const radius = num(entry?.descriptor?.radius);
    if (radius > 0) patch.radius = radius;
  }
  result.dim = Object.assign({}, dim, patch);
  return result;
}

/* Every named point of the model, in one view's coordinates — what a pick is
   matched against so a new dimension is BOUND rather than merely placed.
   Ordered by id so two anchors that coincide always bind the same way. */
export function topologyAnchors(index, basis) {
  const out = [];
  if (!index || !basis) return out;
  const ids = Array.from(index.keys()).sort();
  for (const pid of ids) {
    const entry = index.get(pid);
    if (entry?.kind !== "edge") continue;             // faces have no drawable snap
    const descriptor = entry.descriptor || {};
    const circle = descriptor.curve === "circle" && num(descriptor.radius) > 0;
    const wanted = circle ? ["centre", "qu+", "qu-", "qv+", "qv-"] : ["a", "b", "mid"];
    for (const at of wanted) {
      const point = resolveDimAnchor({ pid, kind: "edge", at }, index, basis);
      if (point) out.push({ pid, kind: "edge", at, u: point.u, v: point.v, radius: num(descriptor.radius) });
    }
  }
  return out;
}

/* A callout note names a FEATURE, not a sentence. Its text is re-read from
   that feature on every build — a leader that still says M6 after the wizard
   was changed to M8 is the same lie as a dimension frozen at its placed value
   — and its leader binds to topology like any dimension reference, so it
   follows the hole rather than pointing at where the hole used to be.
   A plain typed note carries neither and is never touched. */
export function resolveNote(note, callouts, index, basis, doc, properties) {
  const result = { note, dangling: false, missing: [] };
  if (!note) return result;
  const patch = {};
  if(note.modelLink?.kind === "property") {
    const key=note.modelLink.key,value=properties?.[key];
    if(value!==undefined && value!==null && String(value)!=="")patch.text=(note.text ? note.text+" " : "")+String(value);
    else {result.dangling=true;result.missing.push("property:"+key);}
  }
  if (note.modelLink?.kind === "extrudeDepth") {
    const id=note.modelLink.featureId;
    const startFace=index?.get(id+":face:start")?.descriptor;
    const start=startFace?.origin;
    const end=index?.get(id+":face:end")?.descriptor?.origin;
    if(start && end) {
      const dx=end.x-start.x,dy=end.y-start.y,dz=end.z-start.z,normal=startFace.normal;
      const normalLength=normal && Math.hypot(normal.x,normal.y,normal.z);
      const depth=normalLength>0 ? Math.abs((dx*normal.x+dy*normal.y+dz*normal.z)/normalLength) : Math.hypot(dx,dy,dz);
      patch.text=String(note.text || "MATERIAL THICKNESS")+" "+dimensionText({measure:depth},doc);
    } else {result.dangling=true;result.missing.push(id);}
  }
  if (note.feature && callouts) {
    const text = typeof callouts.get === "function" ? callouts.get(note.feature) : callouts[note.feature];
    if (text) patch.text = text;
    else { result.dangling = true; result.missing.push(note.feature); }
  }
  const leader = note.leader;
  if (leader?.pid) {
    const at = resolveDimAnchor(leader, index, basis);
    if (at) {
      patch.leader = Object.assign({}, leader, at);
      const descriptor = index?.get(leader.pid)?.descriptor;
      const axis = descriptor?.axis, forward = basis?.forward;
      const alignment = axis && forward ? Math.abs(axis.x * forward.x + axis.y * forward.y + axis.z * forward.z) / Math.hypot(axis.x, axis.y, axis.z) : 0;
      if (note.feature && leader.at === "centre" && descriptor?.radius > 0 && alignment > 1 - 1e-6) {
        patch.leader.rimRadius = descriptor.radius;
      }
    }
    else if (index) { result.dangling = true; result.missing.push(leader.pid); }
  }
  if (Object.keys(patch).length) result.note = Object.assign({}, note, patch);
  return result;
}

/* Everything on the sheet that lost its reference, for the UI to list: a
   dimension that can no longer measure, and a callout whose hole is gone. */
export function sheetDimIssues(scene) {
  const out = [];
  for (const [id, entry] of scene?.dims || []) {
    if (entry.dangling) out.push({ kind: "dim", id, viewId: entry.dim.viewId, missing: entry.missing.slice() });
  }
  for (const [id, entry] of scene?.notes || []) {
    if (entry.dangling) out.push({ kind: "note", id, viewId: entry.note.leader?.viewId || null, missing: entry.missing.slice() });
  }
  return out;
}

/* One dimension, in sheet millimetres, as the items that draw it: extension
   lines, the dimension line, two arrowheads and the value. */
function dimensionItems(dim, place, doc, options = {}) {
  const items = [];
  const style = options.selected ? "highlight"
    : options.dangling ? "dimLost" : dim.reference ? "dimRef" : "dim";
  const toSheet = place.toSheet;
  const offset = num(dim.offset, 10);
  /* A dangling value is the LAST one that was true, and it is bracketed and
     flagged so nobody reads it as a measurement of what is on the paper. */
  const label = options.dangling
    ? "⚠ (" + dimensionText(Object.assign({}, dim, { measure: measureDim(dim), text: "" }), doc) + ")"
    : dimensionText(Object.assign({}, dim, { measure: measureDim(dim) }), doc);
  const size = TEXT_SIZES.dim;
  if (dim.type === "radius" || dim.type === "diameter") {
    const centre = toSheet(dim.refs?.[0] || { u: 0, v: 0 });
    const radius = num(dim.radius) * paperPerModel(place.scale);
    const angle = num(dim.angle, -Math.PI / 4);
    const edge = { x: centre.x + Math.cos(angle) * radius, y: centre.y + Math.sin(angle) * radius };
    const tip = { x: centre.x + Math.cos(angle) * (radius + offset), y: centre.y + Math.sin(angle) * (radius + offset) };
    items.push(line(edge.x, edge.y, tip.x, tip.y, style));
    items.push(arrowHead(edge.x, edge.y, edge.x - tip.x, edge.y - tip.y));
    const flip = Math.cos(angle) < 0;
    items.push(line(tip.x, tip.y, tip.x + (flip ? -6 : 6), tip.y, style));
    items.push(text(tip.x + (flip ? -7 : 7), tip.y - 0.8, label, {
      size, anchor: flip ? "end" : "start", color: LINE_STYLES[style].color, box: true,
    }));
    return items;
  }
  const a = toSheet(dim.refs?.[0] || { u: 0, v: 0 });
  const b = toSheet(dim.refs?.[1] || { u: 0, v: 0 });
  if (dim.type === "angle") {
    const vertex = toSheet(dim.refs?.[1] || { u: 0, v: 0 });
    const arm = (point) => Math.atan2(point.y - vertex.y, point.x - vertex.x);
    const first = arm(toSheet(dim.refs[0])), second = arm(toSheet(dim.refs[2]));
    const radius = Math.max(offset, 8);
    if(dim.coneAngle) {
      for(const [index,angle] of [first,second].entries())items.push(line(vertex.x,vertex.y,
        vertex.x+Math.cos(angle)*(radius+4),vertex.y+Math.sin(angle)*(radius+4),index===1?'center':'thin'));
    }
    let a0=Math.min(first,second), a1=Math.max(first,second);
    if(a1-a0>Math.PI){a0=Math.max(first,second);a1=Math.min(first,second)+2*Math.PI;}
    items.push({ type: "arc", cx: vertex.x, cy: vertex.y, r: radius, a0, a1, style });
    items.push(arrowHead(vertex.x+Math.cos(a0)*radius,vertex.y+Math.sin(a0)*radius,Math.sin(a0),-Math.cos(a0)));
    items.push(arrowHead(vertex.x+Math.cos(a1)*radius,vertex.y+Math.sin(a1)*radius,-Math.sin(a1),Math.cos(a1)));
    const mid = (a0 + a1) / 2;
    items.push(text(vertex.x + Math.cos(mid) * (radius + 3), vertex.y + Math.sin(mid) * (radius + 3), label, {
      size, anchor: "middle", color: LINE_STYLES[style].color, box: true,
    }));
    return items;
  }
  let p1 = a, p2 = b, normal;
  /* The offset is signed from the midpoint of the two references, so dragging a
     dimension through the geometry puts it on the other side instead of
     stopping dead at the model — the same rule for all three placements. */
  if (dim.type === "horizontal") {
    const y = (a.y + b.y) / 2 - offset;
    p1 = { x: a.x, y }; p2 = { x: b.x, y };
    normal = { x: 0, y: Math.sign(-offset) || -1 };
  } else if (dim.type === "vertical") {
    const x = (a.x + b.x) / 2 + offset;
    p1 = { x, y: a.y }; p2 = { x, y: b.y };
    normal = { x: Math.sign(offset) || 1, y: 0 };
  } else {
    const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy) || 1;
    normal = { x: -dy / length, y: dx / length };
    p1 = { x: a.x + normal.x * offset, y: a.y + normal.y * offset };
    p2 = { x: b.x + normal.x * offset, y: b.y + normal.y * offset };
  }
  const gap = 1.2, overshoot = 2;
  const extend = (from, to) => {
    const dx = to.x - from.x, dy = to.y - from.y, length = Math.hypot(dx, dy);
    if (length < gap * 2) return null;
    const ux = dx / length, uy = dy / length;
    return line(from.x + ux * gap, from.y + uy * gap, to.x + ux * overshoot, to.y + uy * overshoot, style);
  };
  const e1 = extend(a, p1), e2 = extend(b, p2);
  if (e1) items.push(e1);
  if (e2) items.push(e2);
  items.push(line(p1.x, p1.y, p2.x, p2.y, style));
  const span = Math.hypot(p2.x - p1.x, p2.y - p1.y);
  if (span > ARROW_LENGTH * 2.4) {
    items.push(arrowHead(p1.x, p1.y, p1.x - p2.x, p1.y - p2.y));
    items.push(arrowHead(p2.x, p2.y, p2.x - p1.x, p2.y - p1.y));
  } else {
    /* Too tight for arrows inside: draw them outside pointing in, the way a
       narrow slot is dimensioned. */
    const ux = (p2.x - p1.x) / (span || 1), uy = (p2.y - p1.y) / (span || 1);
    items.push(arrowHead(p1.x, p1.y, ux, uy));
    items.push(arrowHead(p2.x, p2.y, -ux, -uy));
    items.push(line(p1.x - ux * 5, p1.y - uy * 5, p1.x, p1.y, style));
    items.push(line(p2.x + ux * 5, p2.y + uy * 5, p2.x, p2.y, style));
  }
  const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
  const along = Math.atan2(p2.y - p1.y, p2.x - p1.x);
  const upright = Math.abs(along) > Math.PI / 2 ? along + Math.PI : along;
  items.push(text(mid.x + normal.x * 1.6, mid.y + normal.y * 1.6, label, {
    size, anchor: "middle", rotate: upright * 180 / Math.PI, color: LINE_STYLES[style].color, box: true,
    baseline: -Math.sin(upright)*normal.x+Math.cos(upright)*normal.y>0 ? "top" : "bottom",
  }));
  return items;
}

/* @param doc       the sheet document (see createSheetDoc)
 * @param provider  { projection(view) -> hidden_line projection,
 *                    topology, callouts (featureId -> live callout text),
 *                    meta, bom }
 * @returns { paper, items, views, scale } — millimetres, ready to paint.
 */
// Only the retained arc reserves caption space, never its cropped-away circle.
function arcLowerBound(item) {
  const tau=Math.PI*2,turn=a=>(a%tau+tau)%tau;
  const start=item.anticlockwise?item.a1:item.a0,end=item.anticlockwise?item.a0:item.a1;
  const span=turn(end-start),toBottom=turn(Math.PI/2-start);
  const reachesBottom=Math.abs(end-start)>=tau-1e-10 || toBottom<=span+1e-10;
  return item.cy+item.r*(reachesBottom?1:Math.max(Math.sin(item.a0),Math.sin(item.a1)));
}

function exactArcStroke(segment, topologyIndex, basis, toSheet, k, style, viewId) {
  if (!topologyIndex || !basis) return null;
  const project = p => ({u:p.x*basis.right.x+p.y*basis.right.y+p.z*basis.right.z,v:p.x*basis.up.x+p.y*basis.up.y+p.z*basis.up.z});
  const turn = a => (a + Math.PI * 4) % (Math.PI * 2);
  for (const entry of topologyIndex.values()) {
    const d = entry.descriptor || {}, r = Number(d.radius);
    if (entry.kind !== "edge" || d.curve !== "circle" || !d.arcMidpoint || !d.origin || !d.axis || d.endpoints?.length !== 2 || !(r > 0)) continue;
    if (Math.abs(d.axis.x*basis.forward.x+d.axis.y*basis.forward.y+d.axis.z*basis.forward.z) < .999999) continue;
    const centre = project(d.origin), tolerance = Math.max(1e-7, r * 1e-5);
    if ([segment.a,segment.b].some(p => Math.abs(Math.hypot(p.u-centre.u,p.v-centre.v)-r) > tolerance)) continue;
    const angle = p => Math.atan2(p.v-centre.v,p.u-centre.u);
    let a0 = angle(segment.a), sweep = turn(angle(segment.b)-a0);
    if (sweep > Math.PI) { a0 = angle(segment.b); sweep = Math.PI*2-sweep; }
    if (!(sweep > 1e-9 && sweep < Math.PI/2)) continue;
    const start = angle(project(d.endpoints[0])), span = turn(angle(project(d.endpoints[1]))-start);
    const positive = turn(angle(project(d.arcMidpoint))-start) <= span;
    const middle = turn(a0+sweep/2-start);
    if (positive ? middle > span+1e-6 : middle < span-1e-6) continue;
    const screen = toSheet(centre);
    return {type:"arc",cx:screen.x,cy:screen.y,r:r*k,a0:-(a0+sweep),a1:-a0,style,viewId};
  }
  return null;
}

/* Actual assembled/exploded world endpoints share the view's geometry mapper.
   Presentation lines carry no geometry or mate changes. */
export function explodeLeaderItems(place, leaders) {
  if(place.projection?.nonlinearProjection)return [];
  const basis = place.projection?.basis || viewBasis(place.view.dir);
  const valid = point => point && [point.x,point.y,point.z].every(Number.isFinite);
  const items=[];
  for (const leader of leaders || []) {
    if (!valid(leader.from) || !valid(leader.to)) continue;
    const from=place.toSheet(projectToView(leader.from,basis));
    const to=place.toSheet(projectToView(leader.to,basis));
    if (!from || !to || Math.hypot(to.x-from.x,to.y-from.y)<1e-7) continue;
    items.push(line(from.x,from.y,to.x,to.y,"center",{
      viewId:place.id,explodeLeader:true,componentId:leader.id,
    }));
  }
  return items;
}

export function buildSheetScene(doc, provider, options = {}) {
  const bomLayout = provider?.bom?.length ? layoutBomTable(doc, provider.bom) : null;
  if (bomLayout) doc = { ...doc, bomRowCount: provider.bom.length, bomHeight: bomLayout.height };
  const items = [], diagnostics = [];
  const frame = sheetFrame(doc), paper = frame.paper;
  /* null, not an empty index: "no topology was offered" and "this id is gone"
     must not look the same to a bound dimension. */
  const rawTopology = typeof provider?.topology === "function" ? provider.topology() : provider?.topology;
  const topologyIndex = rawTopology ? createTopologyIndex(rawTopology) : null;
  /* The topology offered is the owning document's. A view drawn from another
     saved model has none of those faces, so a reference bound there is
     reported missing (and comes back if the view returns to this document)
     instead of snapping onto unrelated geometry. */
  const foreignIndex = new Map();
  const projections = new Map();
  const lacksHostGeometry = view => projections.get(view.id)?.parentError || provider?.foreignSource?.(view);
  const indexFor = view => lacksHostGeometry(view) ? foreignIndex : topologyIndex;
  const extents = new Map();
  for (const view of doc.views) {
    const projection = provider?.projection ? provider.projection(view) : null;
    projections.set(view.id, projection);
    if(projection?.breakError)diagnostics.push({code:'invalid-break-view',viewId:view.id,message:projection.breakError});
    if(projection?.alternatePositionError)diagnostics.push({code:'invalid-alternate-position',viewId:view.id,message:projection.alternatePositionError});
    let bounds = projection ? projection.displayBounds || projectionBounds(projection) : null;
    if(bounds && projection.breakCentre) {
      const {axis,value}=projection.breakCentre,r=Math.max(Math.abs(bounds[axis+'0']-value),Math.abs(bounds[axis+'1']-value));
      // Symmetric layout envelope around a shared physical datum; actual projected
      // bounds remain untouched for measurement, clipping and exports.
      bounds={...bounds,[axis+'0']:value-r,[axis+'1']:value+r};
    }
    if(bounds && projection.presentationCentre) {
      const c=projection.presentationCentre,ru=Math.max(Math.abs(bounds.u0-c.u),Math.abs(bounds.u1-c.u)),rv=Math.max(Math.abs(bounds.v0-c.v),Math.abs(bounds.v1-c.v));
      bounds={u0:c.u-ru,u1:c.u+ru,v0:c.v-rv,v1:c.v+rv};
    }
    extents.set(view.id, bounds
      ? { w: Math.max(bounds.u1 - bounds.u0, 0.1), h: Math.max(bounds.v1 - bounds.v0, 0.1), bounds }
      : { w: 10, h: 10, bounds: null });
  }
  const layout = layoutViews(doc, extents);
  const explodedView = doc.views.find(view => /^iso/.test(view.dir || "") && projections.get(view.id) && !viewSourceOwner(doc,view)?.assemblyState && !lacksHostGeometry(view));
  const placements = [], labels = [];

  if (options.paper !== false) {
    items.push(rect(0, 0, paper.w, paper.h, "paper", { fill: "#ffffff" }));
    items.push(rect(frame.x0, frame.y0, frame.w, frame.h, "border"));
    if (doc.showZones !== false) items.push(...zoneMarks(frame));
  }

  for (const view of doc.views) {
    const place = layout.placements.get(view.id);
    const projection = projections.get(view.id);
    const extent = extents.get(view.id);
    const scale = place.scale;
    const k = paperPerModel(scale);
    const centre = extent.bounds
      ? { u: (extent.bounds.u0 + extent.bounds.u1) / 2, v: (extent.bounds.v0 + extent.bounds.v1) / 2 }
      : { u: 0, v: 0 };
    const toSheet = (point) => {
      const mapped=projection?.breakMap ? projection.breakMap.forward(point) : point;
      return mapped ? {x:place.x+(mapped.u-centre.u)*k,y:place.y-(mapped.v-centre.v)*k} : null;
    };
    const frameBox = {
      x: place.x - place.w / 2, y: place.y - place.h / 2, w: place.w, h: place.h,
    };
    const record = {
      id: view.id, view, x: place.x, y: place.y, w: place.w, h: place.h, scale, k,
      centre, align: place.align, toSheet, box: frameBox, projection,
      toModel: (point) => {
        const mapped={u:centre.u+(point.x-place.x)/k,v:centre.v-(point.y-place.y)/k};
        return projection?.breakMap ? projection.breakMap.inverse(mapped) : mapped;
      },
    };
    placements.push(record);
    const sourceIssue = projection?.parentError || provider?.sourceIssue?.(view);
    if (sourceIssue && !projection?.alignedSectionError) {
      diagnostics.push({ code: "view-source-unavailable", severity: "error", viewId: view.id, message: sourceIssue });
      items.push(text(record.box.x, record.box.y - 3, sourceIssue, { size: 2.5, viewId: view.id }));
    }
    if(projection?.alignedSectionError) {
      diagnostics.push({code:'invalid-aligned-section',severity:'error',viewId:view.id,message:projection.alignedSectionError});
      items.push(text(record.box.x,record.box.y-3,'Aligned Section unavailable',{size:2.5,viewId:view.id}));
      continue;
    }
    if (!projection) {
      if(view.auxiliary) {
        diagnostics.push({code:'auxiliary-reference-unavailable',severity:'error',viewId:view.id});
        items.push(text(record.box.x,record.box.y-3,'Auxiliary reference unavailable',{size:2.5,viewId:view.id}));
      }
      continue;
    }
    if(view.auxiliary && indexFor(view)) {
      const parent=placements.find(p=>p.id===view.auxiliary.from);
      if(parent) {
        const refs=['a','b'].map(at=>resolveDimAnchor({pid:view.auxiliary.edgeReference.pid,kind:'edge',at},indexFor(view),parent.projection?.basis));
        if(refs.every(Boolean)) {
          const centre=parent.toSheet({u:(refs[0].u+refs[1].u)/2,v:(refs[0].v+refs[1].v)/2});
          const forward=projection.basis.forward,pb=parent.projection.basis;
          // forward points toward the viewer; the sight arrow points back toward the face.
          const dx=-(forward.x*pb.right.x+forward.y*pb.right.y+forward.z*pb.right.z),dy=forward.x*pb.up.x+forward.y*pb.up.y+forward.z*pb.up.z;
          items.push(line(centre.x-dx*10,centre.y-dy*10,centre.x-dx*2,centre.y-dy*2,'cutline',{viewId:parent.id,auxiliarySight:true}));
          items.push(arrowHead(centre.x-dx*2,centre.y-dy*2,dx,dy));
          items.push(text(centre.x-dx*13,centre.y-dy*13,'AUX',{size:TEXT_SIZES.view,anchor:'middle',viewId:parent.id}));
        }
      }
    }

    /* A pictorial is there to be recognised, not measured: dashed lines behind
       an isometric read as noise, so one is only ever shown on request. */
    const shaded=["shaded","shadedEdges"].includes(view.displayStyle);
    const drawEdges=view.displayStyle!=="shaded";
    const showHidden = !shaded && (view.hidden !== null && view.hidden !== undefined ? !!view.hidden
      : (isOrthoView(view.dir) || view.section) && doc.showHidden !== false);
    const showCenters = view.centers === null ? doc.showCenters !== false : !!view.centers;

    if(shaded)for(const surface of projection.surfaces || []) {
      const pts=surface.points.map(toSheet),previous=items[items.length-1];
      // Fill adjacent same-tone facets as one path. Its shared internal edges
      // are not antialiased against paper (which otherwise creates white seams).
      if(previous?.shaded && previous.viewId===view.id && previous.fill===surface.fill) {
        previous.paths.push(pts);previous.pts.push(...pts);
      } else items.push({type:"poly",closed:true,pts:pts.slice(),paths:[pts],fill:surface.fill,viewId:view.id,shaded:true});
    }

    for(const region of projection.sectionRegions || []) {
      const loops=region.loops.map(loop=>loop.map(toSheet));
      for(const segment of sectionHatchSegments(loops,view.hatchPattern,hatchLoops))items.push(line(segment.x1,segment.y1,segment.x2,segment.y2,'hatch',{viewId:view.id,alignedSectionLeg:region.leg}));
    }
    if ((projection.cropSourceCuts || projection.cuts)?.length) {
      // This weld joins numerical copies of a shared mesh vertex, not nearby
      // geometric details. A display-scale tolerance can collapse small bores.
      // Seated components can share cut edges. Only edges of the same body
      // belong to one manifold check and one even-odd material region.
      const cutsByBody = new Map();
      for (const cut of projection.cropSourceCuts || projection.cuts) {
        if (!cutsByBody.has(cut.bodyIndex)) cutsByBody.set(cut.bodyIndex, []);
        cutsByBody.get(cut.bodyIndex).push(cut);
      }
      const tolerance = Math.max(1e-7, (extent.w + extent.h) * 1e-7);
      const boundaries = Array.from(cutsByBody.values(), cuts => analyzeSectionBoundaries(cuts, tolerance));
      for (const boundary of boundaries) diagnostics.push(...boundary.issues.map(issue => ({...issue,viewId:view.id})));
      const valid = boundaries.every(boundary => boundary.ok);
      if (!valid) items.push(text(record.box.x, record.box.y - 3, "Section boundary needs repair — hatching omitted", {size:2.5,anchor:"start",viewId:view.id}));
      const regions = valid ? boundaries.map(boundary => boundary.loops.map(loop => loop.map(toSheet))) : [];
      const cropBoundary=(projection.sectionClipBoundary || projection.cropBoundary)?.map(p=>{const s=toSheet(p);return {u:s.x,v:s.y};});
      const emitClipped=(a,b,style)=>{
        let edges=[{a:{u:a.x,v:a.y},b:{u:b.x,v:b.y}}];
        if(cropBoundary)edges=clipCropEdges(edges,cropBoundary);
        for(const boundary of projection.circularClipBoundaries || (projection.crop?[projection.crop]:[])) {const c=toSheet(boundary);edges=cropProjection({visible:edges},{u:c.x,v:c.y,radius:boundary.radius*k}).visible;}
        for(const edge of edges) items.push(line(edge.a.u,edge.a.v,edge.b.u,edge.b.v,style,{viewId:view.id}));
      };
      const ribMasks=(projection.ribHatchMasks || []).map(mask=>mask.loops.map(loop=>loop.map(toSheet)));
      for(const message of projection.ribHatchIssues || []) {
        diagnostics.push({code:'rib-hatch-exclusion-unavailable',severity:'warning',viewId:view.id,message});
        items.push(text(record.box.x,record.box.y-6,message,{size:2.5,anchor:'start',viewId:view.id}));
      }
      for (const loops of regions) for (const segment of sectionHatchSegments(loops,projection.sectionHatchPattern || view.hatchPattern,hatchLoops)) {
        for(const kept of excludeRibHatch(segment,ribMasks))emitClipped({x:kept.x1,y:kept.y1},{x:kept.x2,y:kept.y2},"hatch");
      }
      for(const mask of ribMasks)for(const loop of mask)for(let i=0;i<loop.length;i++)emitClipped(loop[i],loop[(i+1)%loop.length],"section");
      for (const loops of regions) for (const loop of loops) {
        for (let i = 0; i < loop.length; i++) {
          const a = loop[i], b = loop[(i + 1) % loop.length];
          emitClipped(a,b,"section");
        }
      }
    }
    for (const segment of drawEdges ? projection.visible || [] : []) {
      const a = toSheet(segment.a), b = toSheet(segment.b);
      items.push((!projection.breakMap && !projection.nonlinearProjection && exactArcStroke(segment, indexFor(view), projection.basis, toSheet, k, "outline", view.id)) || line(a.x, a.y, b.x, b.y, projection.nonlinearProjection?'section':'outline', { viewId: view.id }));
    }
    if (showHidden) {
      for (const segment of projection.hidden || []) {
        const a = toSheet(segment.a), b = toSheet(segment.b);
        items.push((!projection.breakMap && exactArcStroke(segment, indexFor(view), projection.basis, toSheet, k, "hidden", view.id)) || line(a.x, a.y, b.x, b.y, "hidden", { viewId: view.id }));
      }
    }
    const appendCenterItems=marks=>{
      for(const mark of marks) {
        if(projection.circularClipBoundaries?.length && mark.type==='line') {
          let edges=[{a:record.toModel({x:mark.x1,y:mark.y1}),b:record.toModel({x:mark.x2,y:mark.y2})}];
          for(const boundary of projection.circularClipBoundaries)edges=cropProjection({visible:edges},boundary).visible;
          if(projection.cropBoundary)edges=clipCropEdges(edges,projection.cropBoundary);
          for(const edge of edges){const a=toSheet(edge.a),b=toSheet(edge.b);items.push({...mark,x1:a.x,y1:a.y,x2:b.x,y2:b.y});}
          continue;
        }
        if(projection.breakMap && mark.type==='line') {
          const map=projection.breakMap,other=map.axis==='u'?'v':'u';
          const p=toSheet({[map.axis]:map.from,[other]:0}),q=toSheet({[map.axis]:map.to,[other]:0});
          const boundaries=map.axis==='u'?[p.x,q.x]:[p.y,q.y];
          const paperMap={axis:map.axis,from:Math.min(...boundaries),to:Math.max(...boundaries),
            retained:point=>point[map.axis]<=Math.min(...boundaries)||point[map.axis]>=Math.max(...boundaries)};
          for(const edge of clipBreakEdges([{a:{u:mark.x1,v:mark.y1},b:{u:mark.x2,v:mark.y2}}],paperMap)) {
            items.push({...mark,x1:edge.a.u,y1:edge.a.v,x2:edge.b.u,y2:edge.b.v});
          }
          continue;
        }
        if(!projection.cropBoundary || mark.type!=='line') {items.push(mark);continue;}
        const edges=clipCropEdges([{a:record.toModel({x:mark.x1,y:mark.y1}),b:record.toModel({x:mark.x2,y:mark.y2})}],projection.cropBoundary);
        for(const edge of edges) {const a=toSheet(edge.a),b=toSheet(edge.b);items.push({...mark,x1:a.x,y1:a.y,x2:b.x,y2:b.y});}
      }
    };
    for (const round of projection.circles || []) {
      if (drawEdges && (round.drawn === "visible" || (round.drawn === "hidden" && showHidden))) {
        const centrePoint = toSheet(round);
        const style=round.drawn === "hidden" ? "hidden" : "outline";
        const arcs=circleCropArcs(round,projection.circularClipBoundaries);
        for(const arc of arcs) {
          if(arc.a1-arc.a0>=Math.PI*2-1e-10)items.push(circle(centrePoint.x,centrePoint.y,round.radius*k,style,{viewId:view.id}));
          else items.push({type:'arc',cx:centrePoint.x,cy:centrePoint.y,r:round.radius*k,a0:-arc.a1,a1:-arc.a0,style,viewId:view.id});
        }
      }
      if (showCenters && round.visible && round.kind === "round") appendCenterItems(centreMark(round, toSheet, k, view.id));
    }
    if (showCenters) appendCenterItems(axisCentrelines(projection.circles || [], toSheet, k, view.id, showHidden));
    items.push(...breakBoundaryItems(record));
    items.push(...alternatePositionItems(record));
    if(projection.alternatePositionError)items.push(text(record.box.x,record.box.y-3,'Alternate Position unavailable: '+projection.alternatePositionError,{size:2.5,viewId:view.id}));
    {
      const explicit = viewSourceOwner(doc,view)?.id === view.id ? provider?.explodeLinesForView?.(view) : undefined;
      const explodeLeaders = explicit ?? (lacksHostGeometry(view) ? [] : (provider?.explodeLines || []).filter(leader =>
        leader.viewId ? leader.viewId === view.id : view.id === explodedView?.id));
      items.push(...explodeLeaderItems(record,explodeLeaders));
    }
    /* A detail is bounded by the bubble it was called out with — the reader has
       to see that the geometry stops because the callout does. */
    if (projection.crop) {
      const centrePoint = toSheet(projection.crop);
      items.push(circle(centrePoint.x, centrePoint.y, projection.crop.radius * k, "detail", { viewId: view.id }));
    }
    if(projection.brokenOutBoundary) {
      const boundary=projection.brokenOutBoundary;
      const segments=projection.brokenOutBoundarySegments || boundary.map((a,i)=>({a,b:boundary[(i+1)%boundary.length]}));
      for(const segment of segments) {const a=toSheet(segment.a),b=toSheet(segment.b);items.push(line(a.x,a.y,b.x,b.y,"section",{viewId:view.id,brokenOutBoundary:true}));}
    }
    if (view.labelled !== false) {
      const suffix = scaleValue(record.scale) !== scaleValue(layout.sheetScale)
        ? "  (" + scaleLabel(view.scale || record.scale) + ")" : "";
      const label = view.label || defaultViewLabel(view.dir);
      labels.push({ record, patternCaption: sectionHatchCaption(view), caption: (view.configurationName ? label.replace(/(?: copy)+$/, "") : label) + (view.configurationName ? " · " + view.configurationName : "") + suffix });
    }
  }

  /* Section and detail markers live on the PARENT view — the reader has to be
     told where the cut was taken, not just shown the result. */
  for (const view of doc.views) {
    if(view.alignedSection && !placements.find(p=>p.id===view.id)?.projection?.alignedSectionError)items.push(...alignedSectionMarkerItems(view,placements));
    if (view.section && !projections.get(view.id)?.parentError) items.push(...sectionMarker({ ...view, parent: derivedParentId(view) }, placements, doc));
    if (view.detail && (view.parent || view.detail.from)) items.push(...detailMarker({...view,parent:view.parent || view.detail.from}, placements));
  }

  const byId = new Map(placements.map((place) => [place.id, place]));
  const dims = new Map();
  for (const dim of doc.dims || []) {
    const place = byId.get(dim.viewId);
    if (!place) continue;
    if(place.projection?.nonlinearProjection && (dim.refs || []).some(ref=>ref.pid)) {
      diagnostics.push({code:'aligned-section-reference-unavailable',severity:'error',viewId:place.id,dimId:dim.id});continue;
    }
    const basis = place.projection?.basis || viewBasis(place.view.dir);
    const resolved = resolveDim(dim, indexFor(place.view), basis, place.projection, provider?.model);
    const source = effectiveViewSource(doc, place.view);
    if (place.projection?.parentError || (dim.auto !== "extent" && (source || dim.sourceBinding)
        && !sameProjectedBinding(dim, source, place.projection))) {
      resolved.dangling = true;
      resolved.missing.push("view-source");
    }
    resolved.dim = resolveDimensionTolerance(resolved.dim, provider?.model, doc);
    dims.set(dim.id, resolved);
    if(place.projection?.breakMap && (resolved.dim.refs || []).some(p=>!place.toSheet(p))) {
      diagnostics.push({code:'break-hidden-dimension-anchor',viewId:place.id,dimId:dim.id});continue;
    }
    const measured = Object.assign({}, resolved.dim, { measure: measureDim(resolved.dim) });
    for (const item of dimensionItems(measured, place, doc, {
      selected: options.selectedDim === dim.id, dangling: resolved.dangling,
    })) {
      items.push(Object.assign(item, { dimId: dim.id, viewId: dim.viewId }));
    }
  }
  const notes = new Map();
  const automaticBalloonPositions = new Map();
  const balloonsFor = (place) => place && lacksHostGeometry(place.view) ? [] : provider?.componentBalloonsForView?.(place?.view) ?? provider?.componentBalloons;
  for (const place of placements) {
    const targets = (doc.notes || []).filter(note => note.balloon && note.autoBalloon && note.leader?.viewId === place.id)
      .map(note=>resolveComponentBalloon(note,balloonsFor(place),place.projection?.basis)).filter(r=>!r.dangling)
      .map(({note}) => ({ id: note.id, text:note.text, point: place.toSheet(note.leader) })).filter(target=>target.point);
    if (!targets.length) continue;
    const title = titleBlockBox(doc);
    const obstacles = [{ x0: title.x-4, y0: title.y-4, x1: title.x+title.w+4, y1: title.y+title.h+4 }];
    if (bomLayout) obstacles.push({ x0: bomLayout.x, y0: bomLayout.y, x1: bomLayout.x+bomLayout.width, y1: bomLayout.y+bomLayout.height });
    const model = { x0: place.box.x, y0: place.box.y, x1: place.box.x+place.box.w, y1: place.box.y+place.box.h };
    // Leave room for the view caption that follows the lowest annotation.
    const paperBounds = { x0: frame.x0+6, y0: frame.y0+6, x1: frame.x1-6, y1: frame.y1-18-Math.max(title.h,Number(doc.notesBandHeight)||0) };
    for (const [id, point] of layoutBalloonCenters(targets, model, paperBounds, obstacles)) automaticBalloonPositions.set(id, point);
  }
  for (const note of doc.notes || []) {
    const place = note.leader ? byId.get(note.leader.viewId) : null;
    if(place?.projection?.nonlinearProjection && note.leader?.pid) {
      diagnostics.push({code:'aligned-section-reference-unavailable',severity:'error',viewId:place.id,noteId:note.id});continue;
    }
    const basis = place ? (place.projection?.basis || viewBasis(place.view.dir)) : null;
    const bound=resolveComponentBalloon(note,balloonsFor(place),basis);
    if(bound.dangling){notes.set(note.id,{note,dangling:true,missing:['component-occurrence']});diagnostics.push({code:'missing-component-balloon',severity:'error',noteId:note.id,viewId:place?.id});continue;}
    const foreign = place && lacksHostGeometry(place.view);
    const resolved = resolveNote(bound.note, foreign ? foreignIndex : provider?.callouts, place ? indexFor(place.view) : topologyIndex, basis, doc, foreign ? null : provider?.properties);
    if(place?.projection?.breakMap && !place.toSheet(resolved.note.leader)) {
      notes.set(note.id,resolved);diagnostics.push({code:'break-hidden-note-anchor',viewId:place.id,noteId:note.id});continue;
    }
    const automaticPosition = automaticBalloonPositions.get(note.id);
    if (automaticPosition && place) {
      const target = place.toSheet(resolved.note.leader);
      resolved.note = { ...resolved.note, dx: automaticPosition.x-target.x, dy: automaticPosition.y-target.y };
    }
    notes.set(note.id, resolved);
    items.push(...noteItems(resolved.note, byId, doc, { dangling: resolved.dangling }));
  }
  for (const primitive of doc.primitives || []) {
    // A malformed imported annotation cannot break otherwise healthy CAD views.
    try { items.push(...drawingPrimitiveItems(primitive)); }
    catch { diagnostics.push({code:'invalid-drawing-annotation',primitiveId:primitive?.id}); }
  }

  /* View captions go on LAST, below whatever that view ended up carrying: a
     label parked at the outline's edge lands inside the overall dimension the
     same view is dimensioned with. */
  for (const label of labels) {
    let bottom = label.record.box.y + label.record.box.h;
    for (const item of items) {
      if (item.viewId !== label.record.id) continue;
      const low = item.type === "line" ? Math.max(item.y1, item.y2)
        : item.type === "text" ? item.y + item.size
          : item.type === "arc" ? arcLowerBound(item)
            : item.type === "circle" ? item.cy + item.r
            : item.type === "poly" ? Math.max(...item.pts.map((point) => point.y)) : -Infinity;
      if (Number.isFinite(low) && low > bottom && (item.balloon || low < label.record.box.y + label.record.box.h + 60)) bottom = low;
    }
    items.push(text(label.record.x, bottom + 7, label.caption, {
      size: TEXT_SIZES.view, anchor: "middle", weight: "bold", viewLabel: label.record.id,
    }));
    if(label.patternCaption)items.push(text(label.record.x,bottom+10.8,label.patternCaption,{
      size:2.5,anchor:"middle",weight:"bold",viewLabel:label.record.id,hatchPatternLabel:true,
    }));
  }

  if (options.paper !== false) {
    items.push(...titleBlockItems(doc, provider, layout.sheetScale));
    if (bomLayout) items.push(...bomTableItems(bomLayout));
  }
  for(const image of doc.images||[]) {
    try {items.push(drawingImageItem(image,paper));}
    catch(error){diagnostics.push({code:'invalid-drawing-image',severity:'error',imageId:image?.id,message:error.message});}
  }
  return {
    diagnostics,
    paper, frame, items, views: placements, scale: layout.sheetScale,
    projections, primaryId: layout.primaryId, dims, notes, topologyIndex,
  };
}

export { arrowHead };
