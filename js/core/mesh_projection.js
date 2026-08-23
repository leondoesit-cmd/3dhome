// Orthographic feature-edge projection for imported/direct triangle meshes.
// The result is intentionally plain data so the sketch canvas, drawing sheet,
// SVG exporter and tests can share it without depending on Three.js.

import { fitCircle3 } from "./topology.js";

const cache = new WeakMap();
const faceCache = new WeakMap();

const vectorForView = (view) => view === "top" ? {x:0,y:1,z:0}
  : view === "front" ? {x:0,y:0,z:1} : {x:1,y:0,z:0};

const pointForView = (point, view) => view === "top" ? {u:point.x,v:point.z}
  : view === "front" ? {u:point.x,v:point.y} : {u:point.z,v:point.y};

const dot = (a,b) => a.x*b.x+a.y*b.y+a.z*b.z;

function normalOf(a,b,c) {
  const ab={x:b.x-a.x,y:b.y-a.y,z:b.z-a.z},ac={x:c.x-a.x,y:c.y-a.y,z:c.z-a.z};
  const normal={x:ab.y*ac.z-ab.z*ac.y,y:ab.z*ac.x-ab.x*ac.z,z:ab.x*ac.y-ab.y*ac.x};
  const size=Math.hypot(normal.x,normal.y,normal.z);
  return size>1e-12 ? {x:normal.x/size,y:normal.y/size,z:normal.z/size} : null;
}

function meshSpan(positions) {
  let minX=Infinity,minY=Infinity,minZ=Infinity,maxX=-Infinity,maxY=-Infinity,maxZ=-Infinity;
  for(let index=0;index+2<positions.length;index+=3){
    const x=Number(positions[index]),y=Number(positions[index+1]),z=Number(positions[index+2]);
    if(![x,y,z].every(Number.isFinite))continue;
    minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);minZ=Math.min(minZ,z);maxZ=Math.max(maxZ,z);
  }
  return Number.isFinite(minX) ? Math.max(maxX-minX,maxY-minY,maxZ-minZ,1) : 1;
}

function meshEdges(meshData, weld) {
  const positions=meshData?.positions || [], span=meshSpan(positions);
  const tolerance=Number.isFinite(weld) && weld>0 ? weld : span*1e-6;
  const edges=new Map();
  const keyOf=(point)=>Math.round(point.x/tolerance)+":"+Math.round(point.y/tolerance)+":"+Math.round(point.z/tolerance);
  const add=(a,b,normal)=>{
    const ka=keyOf(a),kb=keyOf(b);if(ka===kb)return;
    const key=ka<kb?ka+"|"+kb:kb+"|"+ka,edge=edges.get(key);
    if(edge)edge.normals.push(normal);else edges.set(key,{a:{...a},b:{...b},normals:[normal]});
  };
  for(let index=0;index+8<positions.length;index+=9){
    const a={x:Number(positions[index]),y:Number(positions[index+1]),z:Number(positions[index+2])};
    const b={x:Number(positions[index+3]),y:Number(positions[index+4]),z:Number(positions[index+5])};
    const c={x:Number(positions[index+6]),y:Number(positions[index+7]),z:Number(positions[index+8])};
    if(![a.x,a.y,a.z,b.x,b.y,b.z,c.x,c.y,c.z].every(Number.isFinite))continue;
    const normal=normalOf(a,b,c);if(!normal)continue;
    add(a,b,normal);add(b,c,normal);add(c,a,normal);
  }
  return Array.from(edges.values());
}

export function clearMeshProjectionCache(meshData) {
  if(meshData && typeof meshData==="object"){
    cache.delete(meshData);
    faceCache.delete(meshData);
  }
}

export function projectMeshEdges(meshData, view="top", options={}) {
  if(!meshData?.positions?.length)return {type:"segments",segments:[],bounds:null};
  view=["top","front","side","right"].includes(view)?view:"top";if(view==="side")view="right";
  let views=cache.get(meshData);if(!views){views=new Map();cache.set(meshData,views);}
  const creaseCos=Number.isFinite(options.creaseCos)?Number(options.creaseCos):Math.cos(Math.PI/12);
  const cacheKey=view+":"+creaseCos;
  if(views.has(cacheKey))return views.get(cacheKey);
  const towardCamera=vectorForView(view),epsilon=1e-5,segments=[];
  for(const edge of meshEdges(meshData)){
    const facing=edge.normals.map((normal)=>dot(normal,towardCamera)),front=Math.max(...facing),back=Math.min(...facing);
    let visible=false;
    if(edge.normals.length===1)visible=front>epsilon;
    else if(front>epsilon && back<=epsilon)visible=true; // silhouette or face boundary
    else if(front>epsilon){
      for(let a=0;a<edge.normals.length&&!visible;a++)for(let b=a+1;b<edge.normals.length;b++)if(dot(edge.normals[a],edge.normals[b])<creaseCos){visible=true;break;}
    }
    if(!visible)continue;
    const a=pointForView(edge.a,view),b=pointForView(edge.b,view);
    if(Math.hypot(b.u-a.u,b.v-a.v)>epsilon)segments.push({a,b});
  }
  let bounds=null;
  if(segments.length){
    const points=segments.flatMap((segment)=>[segment.a,segment.b]);
    bounds={u0:Math.min(...points.map((point)=>point.u)),u1:Math.max(...points.map((point)=>point.u)),v0:Math.min(...points.map((point)=>point.v)),v1:Math.max(...points.map((point)=>point.v))};
  }
  const result={type:"segments",segments,bounds};views.set(cacheKey,result);return result;
}

function pointKey(point, tolerance) {
  return Math.round(point.x / tolerance) + ":" + Math.round(point.y / tolerance) + ":" + Math.round(point.z / tolerance);
}

function distanceToCircle3(point, circle) {
  const origin = circle.origin || {}, axis = circle.axis || { x: 0, y: 1, z: 0 };
  const radius = Number(circle.radius) || 0;
  const nx = axis.x || 0, ny = axis.y || 0, nz = axis.z || 0, len = Math.hypot(nx, ny, nz) || 1;
  const ax = nx / len, ay = ny / len, az = nz / len;
  const dx = (point.x || 0) - (origin.x || 0), dy = (point.y || 0) - (origin.y || 0), dz = (point.z || 0) - (origin.z || 0);
  const along = dx * ax + dy * ay + dz * az;
  const rx = dx - ax * along, ry = dy - ay * along, rz = dz - az * along;
  return Math.hypot(along, Math.abs(Math.hypot(rx, ry, rz) - radius));
}

function chainFeatureSegments(segments, tolerance) {
  const at = new Map();
  const add = (key, index, end) => {
    if (!at.has(key)) at.set(key, []);
    at.get(key).push({ index, end });
  };
  segments.forEach((segment, index) => {
    add(pointKey(segment.a, tolerance), index, 0);
    add(pointKey(segment.b, tolerance), index, 1);
  });
  const pointAt = (segment, end) => end === 0 ? segment.a : segment.b;
  const dir = (from, to) => ({ x: to.x - from.x, y: to.y - from.y, z: to.z - from.z });
  const turn = (a, b) => {
    const la = Math.hypot(a.x, a.y, a.z) || 1, lb = Math.hypot(b.x, b.y, b.z) || 1;
    return Math.acos(Math.max(-1, Math.min(1, (a.x * b.x + a.y * b.y + a.z * b.z) / (la * lb))));
  };
  const MAX_TURN = 40 * Math.PI / 180;
  const used = new Set(), chains = [];
  segments.forEach((start, startIndex) => {
    if (used.has(startIndex)) return;
    used.add(startIndex);
    const points = [start.a, start.b];
    let head = pointKey(start.a, tolerance), tail = pointKey(start.b, tolerance), grew = true;
    while (grew) {
      grew = false;
      for (const side of [{ key: tail, atEnd: true }, { key: head, atEnd: false }]) {
        const candidates = (at.get(side.key) || []).filter((item) => !used.has(item.index));
        if (!candidates.length) continue;
        const tip = side.atEnd ? points[points.length - 1] : points[0];
        const prev = side.atEnd ? points[points.length - 2] : points[1];
        const incoming = side.atEnd ? dir(prev, tip) : dir(points[1], points[0]);
        let best = null, bestTurn = Infinity;
        candidates.forEach((item) => {
          const other = pointAt(segments[item.index], 1 - item.end);
          const ang = turn(incoming, dir(tip, other));
          if (ang < bestTurn) { bestTurn = ang; best = { item, other }; }
        });
        if (!best || bestTurn > MAX_TURN) continue;
        used.add(best.item.index);
        if (side.atEnd) { points.push(best.other); tail = pointKey(best.other, tolerance); }
        else { points.unshift(best.other); head = pointKey(best.other, tolerance); }
        grew = true;
        break;
      }
    }
    let closed = head === tail && points.length >= 4;
    const chord = Math.hypot(points[0].x - points[points.length - 1].x, points[0].y - points[points.length - 1].y, points[0].z - points[points.length - 1].z);
    const span = points.slice(1).reduce((sum, point, index) => sum + Math.hypot(point.x - points[index].x, point.y - points[index].y, point.z - points[index].z), 0);
    if (!closed && points.length >= 6 && chord <= Math.max(tolerance * 4, span * 0.08)) closed = true;
    if (closed && pointKey(points[0], tolerance) === pointKey(points[points.length - 1], tolerance) && points.length > 2) points.pop();
    chains.push({ points, closed });
  });
  return chains;
}

function classifyFeatureChain(chain) {
  const points = chain.points || [];
  const fit = points.length >= 5 ? fitCircle3(points) : null;
  if (fit) {
    /* A rounded rectangle fits a circle well enough for a loose residual test,
       and then draws as a giant ring floating off the body. Demand a tight
       residual AND an arc length that matches the fitted radius. */
    const tol = Math.max(1e-3, fit.radius * 0.012);
    const worst = points.reduce((max, point) => Math.max(max, distanceToCircle3(point, fit)), 0);
    let length = 0;
    for (let i = 1; i < points.length; i++) length += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y, points[i].z - points[i - 1].z);
    if (chain.closed) length += Math.hypot(points[0].x - points[points.length - 1].x, points[0].y - points[points.length - 1].y, points[0].z - points[points.length - 1].z);
    const sweep = length / (fit.radius || 1);
    /* A wild fit puts the ring far outside the points it came from: a real
       circle never has a radius bigger than the span of its own chain. */
    let spanX = 0, spanY = 0, spanZ = 0;
    for (const axis of ["x", "y", "z"]) {
      const values = points.map((point) => Number(point[axis]) || 0);
      const size = Math.max(...values) - Math.min(...values);
      if (axis === "x") spanX = size; else if (axis === "y") spanY = size; else spanZ = size;
    }
    const chainSpan = Math.hypot(spanX, spanY, spanZ);
    if (fit.radius > chainSpan) return { curve: points.length === 2 ? "line" : "polyline", points, closed: !!chain.closed };
    const arcOk = chain.closed
      ? Math.abs(length - 2 * Math.PI * fit.radius) <= 2 * Math.PI * fit.radius * 0.06
      : sweep <= 2 * Math.PI * 1.02;
    if (worst <= tol && arcOk) {
      return {
        curve: "circle",
        origin: fit.origin,
        axis: fit.axis,
        radius: fit.radius,
        points,
        closed: !!chain.closed,
        measure: chain.closed ? 2 * Math.PI * fit.radius : length,
      };
    }
  }
  return { curve: points.length === 2 ? "line" : "polyline", points, closed: !!chain.closed };
}

/* Crease and boundary edges of a triangle soup, chained into the CAD edges a
   modeller actually wants: one circle per hole rim, one line per box rib.
   Tessellation chords never leave this function as separate picks. */
export function meshFeatureEdges(meshData, options = {}) {
  if (!meshData?.positions?.length) return { circles: [], polylines: [] };
  const span = meshSpan(meshData.positions);
  const weld = Number.isFinite(options.weld) && options.weld > 0 ? options.weld : Math.max(1e-4, span * 1e-4);
  const creaseCos = Number.isFinite(options.creaseCos) ? Number(options.creaseCos) : Math.cos(Math.PI / 6);
  const segments = [];
  meshEdges(meshData, weld).forEach((edge) => {
    let sharp = edge.normals.length === 1;
    if (!sharp) {
      for (let a = 0; a < edge.normals.length && !sharp; a++) {
        for (let b = a + 1; b < edge.normals.length; b++) {
          if (dot(edge.normals[a], edge.normals[b]) < creaseCos) { sharp = true; break; }
        }
      }
    }
    if (sharp) segments.push({ a: edge.a, b: edge.b });
  });
  const classified = chainFeatureSegments(segments, weld).map(classifyFeatureChain);
  return {
    circles: classified.filter((entry) => entry.curve === "circle"),
    polylines: classified.filter((entry) => entry.curve !== "circle"),
  };
}

function pointOfTriangle(positions, triangle, corner) {
  const index = triangle * 9 + corner * 3;
  return { x: Number(positions[index]) || 0, y: Number(positions[index + 1]) || 0, z: Number(positions[index + 2]) || 0 };
}

function triangleArea(a, b, c) {
  const ab = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z }, ac = { x: c.x - a.x, y: c.y - a.y, z: c.z - a.z };
  const n = { x: ab.y * ac.z - ab.z * ac.y, y: ab.z * ac.x - ab.x * ac.z, z: ab.x * ac.y - ab.y * ac.x };
  return Math.hypot(n.x, n.y, n.z) * 0.5;
}

function solve4(matrix, rhs) {
  const m = matrix.map((row, i) => row.concat(rhs[i]));
  for (let col = 0; col < 4; col++) {
    let best = col;
    for (let row = col + 1; row < 4; row++) if (Math.abs(m[row][col]) > Math.abs(m[best][col])) best = row;
    const swap = m[col]; m[col] = m[best]; m[best] = swap;
    if (Math.abs(m[col][col]) < 1e-12) return null;
    for (let row = col + 1; row < 4; row++) {
      const factor = m[row][col] / m[col][col];
      for (let k = col; k < 5; k++) m[row][k] -= factor * m[col][k];
    }
  }
  const x = [0, 0, 0, 0];
  for (let i = 3; i >= 0; i--) {
    let sum = m[i][4];
    for (let k = i + 1; k < 4; k++) sum -= m[i][k] * x[k];
    if (Math.abs(m[i][i]) < 1e-12) return null;
    x[i] = sum / m[i][i];
  }
  return x;
}

function fitSphereFromPoints(points) {
  if (!points || points.length < 6) return null;
  const ata = [[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]], atb = [0,0,0,0];
  const step = Math.max(1, Math.floor(points.length / 80));
  for (let i = 0; i < points.length; i += step) {
    const p = points[i], row = [2 * p.x, 2 * p.y, 2 * p.z, 1], b = p.x * p.x + p.y * p.y + p.z * p.z;
    for (let r = 0; r < 4; r++) {
      atb[r] += row[r] * b;
      for (let c = 0; c < 4; c++) ata[r][c] += row[r] * row[c];
    }
  }
  const solved = solve4(ata, atb);
  if (!solved) return null;
  const center = { x: solved[0], y: solved[1], z: solved[2] };
  const radius = Math.sqrt(Math.max(0, solved[3] + center.x * center.x + center.y * center.y + center.z * center.z));
  if (!(radius > 1e-6)) return null;
  let worst = 0;
  for (let i = 0; i < points.length; i += step) {
    const p = points[i];
    worst = Math.max(worst, Math.abs(Math.hypot(p.x - center.x, p.y - center.y, p.z - center.z) - radius));
  }
  return worst <= Math.max(0.15, radius * 0.03) ? { center, radius } : null;
}

function axisFromNormals(normals) {
  if (!normals || normals.length < 2) return null;
  let ax = 0, ay = 0, az = 0, votes = 0;
  const limit = Math.min(normals.length, 24);
  for (let i = 0; i < limit; i++) {
    for (let j = i + 1; j < Math.min(i + 8, normals.length); j++) {
      const a = normals[i], b = normals[j];
      const cx = a.y * b.z - a.z * b.y, cy = a.z * b.x - a.x * b.z, cz = a.x * b.y - a.y * b.x;
      const len = Math.hypot(cx, cy, cz);
      if (len < 0.08) continue;
      if (votes && ax * cx + ay * cy + az * cz < 0) { ax -= cx / len; ay -= cy / len; az -= cz / len; }
      else { ax += cx / len; ay += cy / len; az += cz / len; }
      votes++;
    }
    if (votes > 24) break;
  }
  const size = Math.hypot(ax, ay, az);
  return votes && size > 1e-6 ? { x: ax / size, y: ay / size, z: az / size } : null;
}

function fitCylinderFromPoints(points, normals) {
  const axis = axisFromNormals(normals);
  if (!axis || !points || points.length < 6) return null;
  const seed = Math.abs(axis.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
  const ux = axis.y * seed.z - axis.z * seed.y, uy = axis.z * seed.x - axis.x * seed.z, uz = axis.x * seed.y - axis.y * seed.x;
  const uLen = Math.hypot(ux, uy, uz) || 1;
  const u = { x: ux / uLen, y: uy / uLen, z: uz / uLen };
  const v = { x: axis.y * u.z - axis.z * u.y, y: axis.z * u.x - axis.x * u.z, z: axis.x * u.y - axis.y * u.x };
  const step = Math.max(1, Math.floor(points.length / 80));
  const loop = [];
  for (let i = 0; i < points.length; i += step) {
    const p = points[i];
    loop.push({ u: p.x * u.x + p.y * u.y + p.z * u.z, v: p.x * v.x + p.y * v.y + p.z * v.z });
  }
  if (loop.length < 6) return null;
  let su = 0, sv = 0, suu = 0, svv = 0, suv = 0, suz = 0, svz = 0, sz = 0;
  loop.forEach(({ u: pu, v: pv }) => {
    const z = pu * pu + pv * pv;
    su += pu; sv += pv; suu += pu * pu; svv += pv * pv; suv += pu * pv; suz += pu * z; svz += pv * z; sz += z;
  });
  const n = loop.length;
  const a = [[suu, suv, su], [suv, svv, sv], [su, sv, n]], b = [suz, svz, sz];
  const det = a[0][0]*(a[1][1]*a[2][2]-a[1][2]*a[2][1]) - a[0][1]*(a[1][0]*a[2][2]-a[1][2]*a[2][0]) + a[0][2]*(a[1][0]*a[2][1]-a[1][1]*a[2][0]);
  if (!Number.isFinite(det) || Math.abs(det) < 1e-9) return null;
  const solve = (column) => {
    const m = a.map((row, i) => row.map((value, j) => (j === column ? b[i] : value)));
    return (m[0][0]*(m[1][1]*m[2][2]-m[1][2]*m[2][1]) - m[0][1]*(m[1][0]*m[2][2]-m[1][2]*m[2][0]) + m[0][2]*(m[1][0]*m[2][1]-m[1][1]*m[2][0])) / det;
  };
  const cu = solve(0) / 2, cv = solve(1) / 2, ck = solve(2);
  const squared = ck + cu * cu + cv * cv;
  if (!Number.isFinite(squared) || squared <= 1e-9) return null;
  const radius = Math.sqrt(squared);
  const origin = { x: u.x * cu + v.x * cv, y: u.y * cu + v.y * cv, z: u.z * cu + v.z * cv };
  let worst = 0, alongAxis = 0;
  for (let i = 0; i < points.length; i += step) {
    const p = points[i];
    const dx = p.x - origin.x, dy = p.y - origin.y, dz = p.z - origin.z;
    const along = dx * axis.x + dy * axis.y + dz * axis.z;
    alongAxis += Math.abs(along);
    const rx = dx - axis.x * along, ry = dy - axis.y * along, rz = dz - axis.z * along;
    worst = Math.max(worst, Math.abs(Math.hypot(rx, ry, rz) - radius));
  }
  if (worst > Math.max(0.2, radius * 0.04)) return null;
  let upright = 0;
  normals.forEach((normal) => { if (Math.abs(dot(normal, axis)) < 0.25) upright++; });
  if (upright < normals.length * 0.75) return null;
  return { origin, axis, radius };
}

function classifySmoothFace(triangles, positions, triData) {
  const points = [], normals = [];
  let area = 0, cx = 0, cy = 0, cz = 0;
  triangles.forEach((t) => {
    const tri = triData[t];
    if (!tri) return;
    const a = pointOfTriangle(positions, t, 0), b = pointOfTriangle(positions, t, 1), c = pointOfTriangle(positions, t, 2);
    points.push(a, b, c);
    normals.push(tri.normal);
    const patch = triangleArea(a, b, c);
    area += patch;
    cx += (a.x + b.x + c.x) * patch / 3;
    cy += (a.y + b.y + c.y) * patch / 3;
    cz += (a.z + b.z + c.z) * patch / 3;
  });
  const origin = area > 1e-12 ? { x: cx / area, y: cy / area, z: cz / area } : (points[0] || { x: 0, y: 0, z: 0 });
  if (!normals.length) return { surface: "other", origin, measure: area };
  let nx = 0, ny = 0, nz = 0;
  normals.forEach((n) => { nx += n.x; ny += n.y; nz += n.z; });
  const nLen = Math.hypot(nx, ny, nz) || 1;
  const mean = { x: nx / nLen, y: ny / nLen, z: nz / nLen };
  const planar = normals.every((n) => Math.abs(dot(n, mean)) >= 0.96);
  if (planar) return { surface: "plane", origin, normal: mean, measure: area };
  /* A finite cylinder's rim points also sit on a sphere, so the wall has to be
     recognised as a cylinder before that fit steals it. Sphere normals do not
     all stand off one axis. */
  const cylinder = fitCylinderFromPoints(points, normals);
  if (cylinder) return { surface: "cylinder", origin: cylinder.origin, axis: cylinder.axis, radius: cylinder.radius, measure: area };
  const sphere = fitSphereFromPoints(points);
  if (sphere) return { surface: "sphere", origin: sphere.center, center: sphere.center, radius: sphere.radius, measure: area };
  return { surface: "other", origin, measure: area };
}

/* Tessellated CAD faces reach the picker as many triangles. Grouping across
   edges that are not real creases is what lets a cylinder wall, a sphere, or a
   fillet highlight and pick as one face instead of the facet under the cursor. */
export function meshSmoothFaces(meshData, options = {}) {
  if (!meshData?.positions?.length) return { faces: [], faceOfTriangle: new Int32Array(0) };
  const custom = Number.isFinite(options.weld) || Number.isFinite(options.creaseCos);
  if (!custom && faceCache.has(meshData)) return faceCache.get(meshData);
  const positions = meshData.positions;
  const triangleCount = Math.floor(positions.length / 9);
  const span = meshSpan(positions);
  const weld = Number.isFinite(options.weld) && options.weld > 0 ? options.weld : Math.max(1e-4, span * 1e-4);
  const creaseCos = Number.isFinite(options.creaseCos) ? Number(options.creaseCos) : Math.cos(Math.PI / 6);
  const keyOf = (p) => Math.round(p.x / weld) + ":" + Math.round(p.y / weld) + ":" + Math.round(p.z / weld);
  const triData = new Array(triangleCount);
  const edgeMap = new Map();
  for (let t = 0; t < triangleCount; t++) {
    const a = pointOfTriangle(positions, t, 0), b = pointOfTriangle(positions, t, 1), c = pointOfTriangle(positions, t, 2);
    const normal = normalOf(a, b, c);
    if (!normal) { triData[t] = null; continue; }
    triData[t] = { normal };
    const keys = [keyOf(a), keyOf(b), keyOf(c)];
    for (let e = 0; e < 3; e++) {
      const ka = keys[e], kb = keys[(e + 1) % 3];
      if (ka === kb) continue;
      const key = ka < kb ? ka + "|" + kb : kb + "|" + ka;
      const members = edgeMap.get(key);
      if (members) members.push(t); else edgeMap.set(key, [t]);
    }
  }
  const parent = new Int32Array(triangleCount);
  for (let i = 0; i < triangleCount; i++) parent[i] = i;
  const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  edgeMap.forEach((members) => {
    if (members.length < 2) return;
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        const ta = triData[members[i]], tb = triData[members[j]];
        if (!ta || !tb) continue;
        if (dot(ta.normal, tb.normal) >= creaseCos) {
          const a = find(members[i]), b = find(members[j]);
          if (a !== b) parent[a] = b;
        }
      }
    }
  });
  const groups = new Map();
  for (let t = 0; t < triangleCount; t++) {
    if (!triData[t]) continue;
    const root = find(t);
    const list = groups.get(root);
    if (list) list.push(t); else groups.set(root, [t]);
  }
  const faces = [];
  const faceOfTriangle = new Int32Array(triangleCount).fill(-1);
  groups.forEach((triangles) => {
    const index = faces.length;
    triangles.forEach((t) => { faceOfTriangle[t] = index; });
    faces.push({ triangles, descriptor: classifySmoothFace(triangles, positions, triData) });
  });
  const result = { faces, faceOfTriangle };
  if (!custom) faceCache.set(meshData, result);
  return result;
}
