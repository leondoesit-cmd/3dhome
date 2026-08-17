// Topology-aware assembly mate data model. A topology reference stores both a
// persistent feature/topology key and a geometric frame fallback. Regeneration
// first resolves the key; if topology naming changes, the frame signature can
// be used to rebind instead of silently mating the wrong face.

import { createTopologyRegistry, resolveTopologyReference } from "./core/topology.js";

const rad = (d) => d * Math.PI / 180;
const deg = (r) => r * 180 / Math.PI;
const dot = (a,b) => a.x*b.x+a.y*b.y+a.z*b.z;
const cross = (a,b) => ({x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x});
const len = (v) => Math.hypot(v.x,v.y,v.z);
const norm = (v) => { const l=len(v) || 1; return {x:v.x/l,y:v.y/l,z:v.z/l}; };

const identity = () => [[1,0,0],[0,1,0],[0,0,1]];
const mul = (a,b) => a.map((row)=>b[0].map((_,column)=>row[0]*b[0][column]+row[1]*b[1][column]+row[2]*b[2][column]));
const apply = (matrix,vector) => ({
  x:matrix[0][0]*vector.x+matrix[0][1]*vector.y+matrix[0][2]*vector.z,
  y:matrix[1][0]*vector.x+matrix[1][1]*vector.y+matrix[1][2]*vector.z,
  z:matrix[2][0]*vector.x+matrix[2][1]*vector.y+matrix[2][2]*vector.z,
});
const add = (a,b) => ({x:a.x+b.x,y:a.y+b.y,z:a.z+b.z});

// Matches THREE.Euler's XYZ convention, which is also what modeler.js uses
// when it renders component transforms.
function eulerMatrix(transform) {
  const x=rad(Number(transform?.rx)||0), y=rad(Number(transform?.ry)||0), z=rad(Number(transform?.rz)||0);
  const a=Math.cos(x), b=Math.sin(x), c=Math.cos(y), d=Math.sin(y), e=Math.cos(z), f=Math.sin(z);
  return [
    [c*e,-c*f,d],
    [a*f+b*e*d,a*e-b*f*d,-b*c],
    [b*f-a*e*d,b*e+a*f*d,a*c],
  ];
}

function matrixEuler(matrix) {
  const y=Math.asin(Math.max(-1,Math.min(1,matrix[0][2]))), x=Math.abs(matrix[0][2]) < .9999999
    ? Math.atan2(-matrix[1][2],matrix[2][2])
    : Math.atan2(matrix[2][1],matrix[1][1]);
  const z=Math.abs(matrix[0][2]) < .9999999 ? Math.atan2(-matrix[0][1],matrix[0][0]) : 0;
  return {rx:deg(x),ry:deg(y),rz:deg(z)};
}

function axisAngleMatrix(axis, angle) {
  if (Math.abs(angle) < 1e-10) return identity();
  const n=norm(axis), c=Math.cos(angle), s=Math.sin(angle), t=1-c;
  return [
    [t*n.x*n.x+c,t*n.x*n.y-s*n.z,t*n.x*n.z+s*n.y],
    [t*n.x*n.y+s*n.z,t*n.y*n.y+c,t*n.y*n.z-s*n.x],
    [t*n.x*n.z-s*n.y,t*n.y*n.z+s*n.x,t*n.z*n.z+c],
  ];
}

function worldFrame(frame, component, space) {
  if (!frame) return null;
  // Explicit assembly-space frames remain fixed; legacy references without a
  // space marker are migrated by resolvedFrame before reaching this branch.
  if (space !== "component") return structuredClone(frame);
  const transform=component?.transform || {}, rotation=eulerMatrix(transform), translation={
    x:Number(transform.x)||0,y:Number(transform.y)||0,z:Number(transform.z)||0,
  };
  const out={...structuredClone(frame)};
  if (frame.origin) out.origin=add(apply(rotation,frame.origin),translation);
  if (frame.normal) out.normal=norm(apply(rotation,frame.normal));
  if (frame.axis) out.axis=norm(apply(rotation,frame.axis));
  return out;
}

function componentFrame(frame, component) {
  const transform=component?.transform || {}, rotation=eulerMatrix(transform), inverse=[
    [rotation[0][0],rotation[1][0],rotation[2][0]],
    [rotation[0][1],rotation[1][1],rotation[2][1]],
    [rotation[0][2],rotation[1][2],rotation[2][2]],
  ], translation={x:Number(transform.x)||0,y:Number(transform.y)||0,z:Number(transform.z)||0};
  const out={...structuredClone(frame)};
  if (frame.origin) out.origin=apply(inverse,{x:frame.origin.x-translation.x,y:frame.origin.y-translation.y,z:frame.origin.z-translation.z});
  if (frame.normal) out.normal=norm(apply(inverse,frame.normal));
  if (frame.axis) out.axis=norm(apply(inverse,frame.axis));
  return out;
}

function rotateComponentTo(component, from, to) {
  const turn=rotationFromTo(from,to);
  if (Math.abs(turn.angle) < 1e-10) return;
  const next=matrixEuler(mul(axisAngleMatrix(turn.axis,turn.angle),eulerMatrix(component.transform)));
  component.transform.rx=next.rx; component.transform.ry=next.ry; component.transform.rz=next.rz;
}

export function topologyReference(componentId, kind, persistentId, frame) {
  return { componentId, kind, persistentId, frameSpace:"component", frame: structuredClone(frame), descriptor: structuredClone(frame), signature: frameSignature(frame) };
}

export function frameSignature(frame) {
  const q = (v) => Math.round(Number(v || 0) * 1000) / 1000;
  return [frame?.surface || "plane", q(frame?.origin?.x),q(frame?.origin?.y),q(frame?.origin?.z),q(frame?.normal?.x),q(frame?.normal?.y),q(frame?.normal?.z)].join(":");
}

function rotationFromTo(from, to) {
  const a=norm(from), b=norm(to), axis=cross(a,b), s=len(axis), c=Math.max(-1,Math.min(1,dot(a,b)));
  if (s < 1e-8) return { axis:{x:0,y:1,z:0}, angle:c < 0 ? Math.PI : 0 };
  return { axis:norm(axis), angle:Math.atan2(s,c) };
}

// XYZ Euler update suitable for the editor's transform schema. Face mates are
// solved sequentially; grounded components remain immutable.
export function solveTopologyMates(assembly) {
  const byId = new Map((assembly.components || []).map((c)=>[c.id,c]));
  const issues=[], rebindings=[];
  const resolvedFrame = (reference, component, mateId) => {
    const entries = component?.topology || component?.def?.lastRebuild?.topology || [];
    if (!entries.length) {
      // One-time migration for assemblies saved by the old editor, whose
      // fallback frames were captured in assembly coordinates. Converting the
      // snapshot to the component's local frame stops it being added again on
      // every viewport rebuild.
      if (!reference.frameSpace && (reference.frame || reference.descriptor)) {
        reference.frame=componentFrame(reference.frame || reference.descriptor,component);
        reference.descriptor=structuredClone(reference.frame);
        reference.frameSpace="component";
        reference.signature=frameSignature(reference.frame);
      }
      return worldFrame(reference.frame || reference.descriptor || null,component,reference.frameSpace);
    }
    const result = resolveTopologyReference(reference, createTopologyRegistry(entries));
    if (result.status === "missing" || result.status === "ambiguous") {
      issues.push({mate:mateId,code:result.status+"-topology",reference:reference.persistentId});
      return null;
    }
    if (result.status === "rebound") rebindings.push({mate:mateId,from:reference.persistentId,to:result.topology.persistentId});
    const descriptor = result.topology.descriptor || {};
    return worldFrame({ surface: descriptor.surface, origin: descriptor.origin, normal: descriptor.normal, axis: descriptor.axis, measure: descriptor.measure },component,"component");
  };
  for (const mate of assembly.topologyMates || []) {
    if (mate.suppressed) continue;
    const a=byId.get(mate.a.componentId), b=byId.get(mate.b.componentId);
    if (!a || !b) { issues.push({mate:mate.id,code:"missing-component"}); continue; }
    if (b.grounded) { issues.push({mate:mate.id,code:"grounded-target"}); continue; }
    a.transform ||= {x:0,y:0,z:0,rx:0,ry:0,rz:0}; b.transform ||= {x:0,y:0,z:0,rx:0,ry:0,rz:0};
    const fa=resolvedFrame(mate.a,a,mate.id), fb=resolvedFrame(mate.b,b,mate.id);
    if (!fa || !fb) { issues.push({mate:mate.id,code:"unresolved-topology"}); continue; }
    if (mate.type === "coincident" || mate.type === "distance") {
      if (!fa.origin || !fb.origin || !fa.normal || !fb.normal) { issues.push({mate:mate.id,code:"invalid-face-frame"}); continue; }
      const desired = mate.aligned ? fa.normal : {x:-fa.normal.x,y:-fa.normal.y,z:-fa.normal.z};
      rotateComponentTo(b,fb.normal,desired);
      // Rotation changes the moving reference's world origin, so resolve it
      // again before translating. The correction is a delta between current
      // world frames, making repeated rebuilds idempotent.
      const moved=resolvedFrame(mate.b,b,mate.id);
      const offset=mate.type === "distance" ? Number(mate.value||0) : 0;
      b.transform.x += fa.origin.x + fa.normal.x*offset - moved.origin.x;
      b.transform.y += fa.origin.y + fa.normal.y*offset - moved.origin.y;
      b.transform.z += fa.origin.z + fa.normal.z*offset - moved.origin.z;
    } else if (mate.type === "concentric") {
      if (!fa.origin || !fb.origin || !(fa.axis||fa.normal) || !(fb.axis||fb.normal)) { issues.push({mate:mate.id,code:"invalid-axis-frame"}); continue; }
      rotateComponentTo(b,fb.axis||fb.normal,fa.axis||fa.normal);
      const moved=resolvedFrame(mate.b,b,mate.id);
      b.transform.x += fa.origin.x-moved.origin.x; b.transform.y += fa.origin.y-moved.origin.y; b.transform.z += fa.origin.z-moved.origin.z;
    } else if (mate.type === "angle") {
      const current=Math.acos(Math.max(-1,Math.min(1,dot(norm(fa.normal),norm(fb.normal)))));
      b.transform.ry += Number(mate.value||0)-deg(current);
    }
  }
  return {ok:!issues.length,issues,rebindings};
}
