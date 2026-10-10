import {isOrthoView,viewBasis} from './hidden_line.js';
import {edgeLiesOnFace} from './topology.js';

const dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
const cross=(a,b)=>({x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x});
const unit=p=>{const length=Math.hypot(p?.x,p?.y,p?.z);if(!Number.isFinite(length)||length<1e-9)throw new Error('Auxiliary reference direction is invalid');return {x:p.x/length,y:p.y/length,z:p.z/length};};

export function auxiliaryParentAllowed(parent) {
  return !!parent && isOrthoView(parent.dir) && !['section','detail','cropSketch','brokenOut','breakView','auxiliary','exploded','alternatePosition'].some(key=>parent[key]);
}

export function auxiliaryFaceCandidates(parent,edgeId,index) {
  if(!auxiliaryParentAllowed(parent))throw new Error('Auxiliary needs an unmodified principal parent');
  const edge=index?.get(edgeId),d=edge?.descriptor;
  if(edge?.kind!=='edge'||d?.curve!=='line'||d.endpoints?.length!==2)throw new Error('Auxiliary needs a named straight edge with native endpoints');
  const direction=unit({x:d.endpoints[1].x-d.endpoints[0].x,y:d.endpoints[1].y-d.endpoints[0].y,z:d.endpoints[1].z-d.endpoints[0].z});
  const parentBasis=viewBasis(parent.dir);
  if(Math.abs(dot(direction,parentBasis.forward))>1e-6)throw new Error('Auxiliary edge must lie in the parent image plane');
  if(Math.abs(dot(direction,parentBasis.right))<1e-6||Math.abs(dot(direction,parentBasis.up))<1e-6)throw new Error('Choose an inclined edge');
  return [...index.values()].filter(face=>{
    if(face.kind!=='face'||face.descriptor?.surface!=='plane'||!edgeLiesOnFace(edge,face))return false;
    if(edge.partId&&face.partId&&edge.partId!==face.partId)return false;
    try {
      const normal=unit(face.descriptor.normal);
      return Math.abs(dot(normal,parentBasis.forward))<1e-6 && Math.abs(dot(normal,direction))<1e-6;
    } catch {return false;}
  });
}

export function resolveAuxiliaryBasis(view,document,index) {
  const reference=view?.auxiliary,parent=document.views?.find(p=>p.id===reference?.from);
  if(!reference||parent?.id===view.id)throw new Error('Auxiliary parent reference is invalid');
  const candidates=auxiliaryFaceCandidates(parent,reference.edgeReference?.pid,index);
  const face=candidates.find(f=>f.persistentId===reference.faceReference?.pid);
  if(!face)throw new Error('Auxiliary planar face reference is missing or no longer qualifies');
  const normal=unit(face.descriptor.normal),forward=reference.flip?{x:-normal.x,y:-normal.y,z:-normal.z}:normal;
  const right=viewBasis(parent.dir).forward,up=cross(forward,right);
  return viewBasis({forward,up});
}
