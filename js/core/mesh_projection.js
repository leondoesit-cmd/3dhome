// Orthographic feature-edge projection for imported/direct triangle meshes.
// The result is intentionally plain data so the sketch canvas, drawing sheet,
// SVG exporter and tests can share it without depending on Three.js.

import { fitCircle3 } from "./topology.js";

const cache = new WeakMap();

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
  if(meshData && typeof meshData==="object")cache.delete(meshData);
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
    const tol = Math.max(0.12, fit.radius * 0.03);
    const worst = points.reduce((max, point) => Math.max(max, distanceToCircle3(point, fit)), 0);
    if (worst <= tol) {
      let length = 0;
      for (let i = 1; i < points.length; i++) length += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y, points[i].z - points[i - 1].z);
      if (chain.closed) length += Math.hypot(points[0].x - points[points.length - 1].x, points[0].y - points[points.length - 1].y, points[0].z - points[points.length - 1].z);
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
