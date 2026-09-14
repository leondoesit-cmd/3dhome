import {frameFromPlane} from './frame.js';
import {edgeEndpoints} from './topology_selection.js';

const VERTEX_TOL = 1e-4;

function vertexPoint(value) {
  if (!value) return null;
  const d = value.descriptor || value;
  const p = d.point || (Number.isFinite(Number(value.x)) ? value : null);
  if (!p || ![p.x, p.y, p.z].every((n) => Number.isFinite(Number(n)))) return null;
  return { x: Number(p.x) || 0, y: Number(p.y) || 0, z: Number(p.z) || 0 };
}

function sharedEndpoint(edgeA, edgeB) {
  const endsA = edgeEndpoints(edgeA), endsB = edgeEndpoints(edgeB);
  for (const a of endsA) for (const b of endsB) {
    if (Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) <= VERTEX_TOL) return { x: a.x, y: a.y, z: a.z };
  }
  return null;
}

export function isThroughVertexPlane(plane) {
  return plane?.refType === "through-vertex-parallel" || !!(plane?.throughVertex || plane?.throughEdges?.length);
}

/* LongRibPlane: the shared end of two model edges, else the stored vertex. */
export function throughVertexPoint(plane, resolveRef) {
  const edges = plane?.throughEdges || [];
  if (edges.length >= 2) {
    const a = resolveRef?.(edges[0]) || edges[0];
    const b = resolveRef?.(edges[1]) || edges[1];
    const shared = sharedEndpoint(a, b);
    if (shared) return shared;
  }
  const raw = plane?.throughVertex;
  return vertexPoint(resolveRef?.(raw) || raw) || vertexPoint(raw);
}

export function throughVertexBinding(vertex, entries) {
  const point = vertexPoint(vertex);
  if (!point) return null;
  const edges = (entries || []).filter((entry) => {
    if (entry?.kind !== "edge") return false;
    return edgeEndpoints(entry).some((end) => Math.hypot(end.x - point.x, end.y - point.y, end.z - point.z) <= 1e-3);
  }).slice(0, 2);
  return {
    throughVertex: { ...vertex, descriptor: { ...(vertex.descriptor || {}), point } },
    throughEdges: edges.map((edge) => ({
      ownerFeatureId: edge.ownerFeatureId,
      persistentId: edge.persistentId,
      kind: "edge",
      semantic: edge.semantic,
      descriptor: edge.descriptor,
    })),
  };
}

function placeOffsetPlane(plane, parent, resolveRef) {
  const n = parent.normal || { x: 0, y: 1, z: 0 };
  const length = Math.hypot(n.x, n.y, n.z);
  if (!(length > 0)) throw new Error("Invalid reference plane offset or normal");
  const normal = { x: n.x / length, y: n.y / length, z: n.z / length };
  const origin = parent.origin || { x: 0, y: 0, z: 0 };
  let offset;
  if (isThroughVertexPlane(plane)) {
    const point = throughVertexPoint(plane, resolveRef);
    if (!point) throw new Error("Reference plane vertex is unavailable");
    offset = normal.x * (point.x - origin.x) + normal.y * (point.y - origin.y) + normal.z * (point.z - origin.z);
  } else {
    offset = Number(plane.offset || 0);
    if (!Number.isFinite(offset)) throw new Error("Invalid reference plane offset or normal");
  }
  return {
    normal,
    origin: {
      x: origin.x + normal.x * offset,
      y: origin.y + normal.y * offset,
      z: origin.z + normal.z * offset,
    },
    offset,
  };
}

// Resolve parent planes before their children, then move attached sketch frames.
// No document changes are made until the whole plane graph is valid.
export function resolveOffsetPlanes(document, resolveRef){
 const planes=new Map((document.references || []).filter(r=>r.type==='plane').map(r=>[r.id,r]));
 /* A plane's reference entry and its reference-geometry twin can drift apart.
    HOUSING's BatteryLoftPlane reference lost its offset while the geometry
    still held 1.300 in, so this resolver read 0, placed the plane ON its face,
    and Boss-Loft1 lofted two coplanar sections into nothing. An offset plane
    with no finite offset takes it back from its twin instead of collapsing. */
 for(const plane of planes.values()){
  if(isThroughVertexPlane(plane) || !(plane.support || plane.baseReferenceId) || Number.isFinite(Number(plane.offset)) && plane.offset!=null)continue;
  const twin=(document.referenceGeometry || []).find(r=>r.id===plane.id);
  if(twin && Number.isFinite(Number(twin.offset)) && twin.offset!=null)plane.offset=Number(twin.offset);
 }
 const resolved=new Map(),visiting=new Set();
 function visit(id){
  if(resolved.has(id))return resolved.get(id);
  const plane=planes.get(id);if(!plane)throw new Error('Missing parent plane: '+id);
  if(visiting.has(id))throw new Error('Reference planes cannot depend on each other in a cycle');
  visiting.add(id);
  let result={...plane};
  if(plane.baseReferenceId || plane.support){
   const parent=plane.support?plane.support.descriptor:visit(plane.baseReferenceId);
   Object.assign(result, placeOffsetPlane(plane, parent, resolveRef));
  }
  visiting.delete(id);resolved.set(id,result);return result;
 }
 try{for(const id of planes.keys())visit(id);}catch(error){return {ok:false,issues:[{severity:'error',code:'reference-plane-dependency',message:error.message}]};}
 for(const [id,result] of resolved){Object.assign(planes.get(id),result);const geometry=(document.referenceGeometry || []).find(r=>r.id===id);if(geometry)Object.assign(geometry,{origin:result.origin,normal:result.normal,offset:result.offset,baseReferenceId:result.baseReferenceId,name:result.name,refType:result.refType,throughVertex:result.throughVertex,throughEdges:result.throughEdges});}
 for(const sketch of document.sketches || []){
  const plane=resolved.get(sketch.referenceId);if((!plane?.baseReferenceId&&!plane?.support) || sketch.support)continue;
  sketch.frame=frameFromPlane(plane.origin,plane.normal,sketch.frame?.xAxis);sketch.frameSpace='local';
 }
 return {ok:true,issues:[]};
}

// Resolve the face-supported ancestry for the sketch currently being rebuilt.
// Later history faces need not exist yet.
export function resolveOffsetSketch(sketch,references,resolveFace){
 const planes=new Map((references || []).map(r=>[r.id,r])),visiting=new Set();
 function visit(id){
  const plane=planes.get(id);if(!plane)throw new Error('Missing parent plane: '+id);
  if(visiting.has(id))throw new Error('Reference plane dependency cycle');visiting.add(id);
  let base=plane;
  if(plane.support){const face=resolveFace(plane.support);if(!face||face.descriptor?.surface!=='plane')throw new Error('Reference plane support face is unavailable');base={origin:face.descriptor.origin,normal:face.descriptor.normal};}
  else if(plane.baseReferenceId)base=visit(plane.baseReferenceId);
  if(!plane.support && !plane.baseReferenceId){
   visiting.delete(id);
   return {normal:plane.normal,origin:plane.origin||{x:0,y:0,z:0}};
  }
  const placed=placeOffsetPlane(plane, base, resolveFace);
  visiting.delete(id);return placed;
 }
 const plane=planes.get(sketch.referenceId);if(!plane || (!plane.support&&!plane.baseReferenceId) || sketch.support)return sketch;
 const result=visit(plane.id);return {...sketch,frame:frameFromPlane(result.origin,result.normal,sketch.frame?.xAxis),frameSpace:'local'};
}
export function offsetPlaneOwners(referenceId,references,seen=new Set()){
 if(seen.has(referenceId))return [];seen.add(referenceId);
 const plane=(references || []).find(r=>r.id===referenceId);if(!plane)return [];
 const owners=[
  ...(plane.support?.ownerFeatureId?[plane.support.ownerFeatureId]:[]),
  ...(plane.throughVertex?.ownerFeatureId?[plane.throughVertex.ownerFeatureId]:[]),
  ...((plane.throughEdges||[]).map(edge=>edge?.ownerFeatureId).filter(Boolean)),
  ...(plane.baseReferenceId?offsetPlaneOwners(plane.baseReferenceId,references,seen):[]),
 ];
 return [...new Set(owners)];
}
