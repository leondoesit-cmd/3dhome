import { axisAngleMatrix, mateFrameSupports, mul, rotationFromTo, rotationOf, setRotation, worldFrame } from "../cad_mate_model.js";
import { isSubassembly, resolveComponentPath, standardPlaneEntries } from "./assembly_structure.js";
import { nestedComponentOccurrence } from "./nested_component_edit.js";
import { topologyDescriptorSignature, topologyForFeature } from "./topology.js";
import { compileKernelFeatureTree } from "./kernel_feature_adapter.js";
import { verifiedFinalTopology } from "./exact_topology_cache.js";
import { historyEntryRolled } from "./parametric_document.js";

export function analyticPartTopology(part,featureId) {
  if (part.kind === "box") return topologyForFeature({id:featureId,type:"box"}, {x0:part.x0,x1:part.x1,y0:part.y0,y1:part.y1,z0:part.z0,z1:part.z1});
  if (part.kind === "cyl" && (part.r2 == null || Math.abs(part.r2 - part.r) < 1e-6)) return topologyForFeature({id:featureId,type:"cylinder"}, {x:part.x,y:part.y,z:part.z,r:part.r,h:part.h,axis:part.axis});
  if (part.kind === "sph") return topologyForFeature({id:featureId,type:"sphere"}, {x:part.x,y:part.y,z:part.z,r:part.r});
  if (part.kind === "ext") return topologyForFeature({id:featureId,type:"extrude"}, {axis:part.axis,frame:part.frame,from:part.from,to:part.to,points:part.pts,profileEntityIds:part.profileEntityIds});
  return [];
}

export function contextDocumentTopology(component, doc = component.def, readBodies) {
  if (doc?.exactTopologyCache) {
    const compiled = compileKernelFeatureTree({...doc,parts:[],exactTopologyCache:undefined,verifiedExactTopology:undefined});
    return compiled.ok ? verifiedFinalTopology(doc,compiled.features) : [];
  }
  if (!doc) return component.topology || [];
  if (readBodies) return readBodies(doc);
  const bodies = (doc.parts || []).slice(0, Number.isInteger(doc.rollback) && doc.rollback >= 0 ? doc.rollback : undefined);
  const inactive = new Set((doc.history || []).filter((entry,index)=>entry?.kind==="feature" &&
    (entry.suppressed || historyEntryRolled(doc,index))).map(entry=>entry.targetId));
  return bodies.filter(part => !part.suppressed && !inactive.has(part.featureId)).flatMap(part => part.meshData ? part.meshData.topology || [] :
    analyticPartTopology(part,part.featureId || "feature:part:"+part.id));
}

// Bind to the leaf's local face. A removed occurrence or face must never
// reattach to an identical neighbour, or reuse the descriptor saved at creation.
export function contextPlacement(owner,component,partTopology,entries) {
  const context = component.inContext;
  const path = context.occurrencePath === undefined ? [context.parentId] : context.occurrencePath;
  const source = nestedComponentOccurrence(owner, path);
  let reason;
  if (!source || isSubassembly(source.component)) reason = "Missing or ambiguous context occurrence";
  if (!source && context.occurrencePath === undefined) reason = "Missing context component";
  if (source && (String(path[0]) !== String(context.parentId) ||
      (context.reference?.componentId != null && String(context.reference.componentId) !== String(source.component.id)))) reason = "Invalid context occurrence path";
  if (!reason && source.chain.some(item => item.componentPattern)) reason = "Pattern-generated occurrence cannot drive a context reference";
  if (!reason && source.chain.some(item => item.contextIssue)) reason = "Invalid parent context";
  if (!reason) {
    const leaf = source.component;
    if (!entries.has(leaf)) entries.set(leaf, partTopology(leaf).concat(standardPlaneEntries()));
    const id = context.reference?.persistentId;
    const faces = entries.get(leaf).filter(entry => entry?.persistentId === id && entry.kind === "face");
    const face = faces[0]?.descriptor;
    if (faces.length > 1) reason = "Ambiguous context planar face";
    else if (typeof id !== "string" || face?.surface !== "plane" || !mateFrameSupports("planar",face)) reason = "Missing or invalid context planar face";
    else if ((id.includes(":face:generated:") || /^generated-\d+$/.test(face.semantic)) &&
             topologyDescriptorSignature(context.reference.descriptor || {}) !== topologyDescriptorSignature(face)) reason = "Generated context face changed; verify the reference";
    else {
      const swing = rotationFromTo({x:1,y:0,z:0}, face.normal);
      let rotation = axisAngleMatrix(swing.axis,swing.angle), frame = face;
      for (const item of source.chain.slice().reverse()) {
        rotation = mul(rotationOf(item.transform),rotation);
        frame = worldFrame(frame,item,"component");
      }
      component.transform = {...component.transform,...frame.origin};
      setRotation(component.transform,rotation);
      component.grounded = true;
    }
  }
  return reason;
}

export function contextDiagnostic(component,componentPath,message) {
  component.contextIssue = message;
  return {component:JSON.stringify(componentPath), componentPath, code:"context-reference", message};
}

export function updateAssemblyContexts(assembly, partTopology = contextDocumentTopology) {
  const issues = [], entries = new Map();
  function update(owner, prefix) {
    const done = new Set(), active = new Set();
    function visit(component) {
      if (done.has(component)) return !component.contextIssue;
      if (active.has(component)) return false;
      active.add(component);
      const path = [...prefix,component.id];
      if (isSubassembly(component)) update(component.asm,path);
      if (component.inContext) {
        const context = component.inContext;
        const source = nestedComponentOccurrence(owner,context.occurrencePath ?? [context.parentId]);
        const reason = source && !visit(source.chain[0]) ? "Cyclic or invalid parent context" :
          contextPlacement(owner,component,partTopology,entries);
        if (reason) issues.push(contextDiagnostic(component,path,reason));
        else delete component.contextIssue;
      }
      active.delete(component);
      done.add(component);
      return !component.contextIssue;
    }
    owner.components.forEach(visit);
  }
  if (assembly?.components) update(assembly,[]);
  return {issues,rebindings:[]};
}

// Return the mates that can transmit motion to or from the seeds. Grounded
// bodies and computed contexts are read-only boundaries, not bridges between
// independent mechanisms attached to the same anchor.
export function contextMateNetwork(components,entries,seeds) {
  const links = new Map(), byId = new Map(components.map(body=>[body.id,body]));
  const bodyIds = new Set([...seeds].map(String)), mates = new Set();
  for (const entry of entries) {
    const {mate,legacy} = entry;
    const endpoints = legacy ? [mate.a,mate.b] : [mate.a?.componentId,mate.b?.componentId,mate.c?.componentId];
    const link = {entry,endpoints};
    for (const id of endpoints) if (id!=null) {
      if (!links.has(String(id))) links.set(String(id),[]);
      links.get(String(id)).push(link);
    }
  }
  for (const id of bodyIds) for (const {entry,endpoints} of links.get(id) || []) {
    if (mates.has(entry)) continue;
    mates.add(entry);
    for (const endpoint of endpoints) {
      const body = byId.get(endpoint);
      if (body && !body.grounded && !body.inContext) bodyIds.add(String(body.id));
    }
  }
  return {bodyIds,mates};
}

// Only open rigid subassemblies whose local poses a context actually needs.
// Both the solver and disposable mate trials must visit the same documents.
export function contextSolveDocuments(assembly) {
  const required = new Set();
  function requireFace(owner,ref) {
    if (typeof ref?.persistentId !== "string" || !ref.persistentId.includes("/")) return;
    const top = owner.components.find(item=>item.id===ref.componentId);
    if (!isSubassembly(top)) return;
    const source = resolveComponentPath(top,ref.persistentId);
    for (const item of source?.chain || []) if (isSubassembly(item)) required.add(item.asm);
  }
  // A movable context support can also be positioned by mates at its own
  // level. Follow that mate network up to fixed anchors, including any nested
  // faces those mates read. Other rigid occurrences stay closed.
  function requireDriverFaces(owner,moving) {
    if (!moving.size) return;
    const entries = (owner.mates || []).map(mate=>({mate,legacy:true})).concat(
      (owner.topologyMates || []).filter(mate=>!mate.suppressed).map(mate=>({mate})));
    for (const {mate,legacy} of contextMateNetwork(owner.components,entries,moving).mates) {
      if (!legacy) for (const ref of [mate.a,mate.b,mate.c]) requireFace(owner,ref);
    }
  }
  function scan(owner) {
    let hasContext = false;
    const moving = new Set();
    for (const component of owner.components || []) {
      if (isSubassembly(component) && scan(component.asm)) {
        required.add(component.asm);
        hasContext = true;
      }
      const context = component.inContext;
      if (!context) continue;
      hasContext = true;
      const source = nestedComponentOccurrence(owner,context.occurrencePath ?? [context.parentId]);
      for (const parent of source?.parents || []) required.add(parent.asm);
      const support = source?.chain[0];
      if (support && !support.grounded && !support.inContext) moving.add(support.id);
    }
    requireDriverFaces(owner,moving);
    return hasContext;
  }
  scan(assembly);
  // A mate inside a required document can itself read a face deeper down.
  // Set iteration also visits documents added while following these references.
  for (const owner of required) {
    for (const mate of owner.topologyMates || []) {
      if (mate.suppressed) continue;
      for (const ref of [mate.a,mate.b,mate.c]) requireFace(owner,ref);
    }
  }
  return required;
}

export function trialPoseMapper(assembly) {
  const required = contextSolveDocuments(assembly);
  function copyPose(component) {
    const copy = {...component,transform:structuredClone(component.transform || {})};
    if (required.has(component.asm)) {
      const asm = component.asm;
      copy.asm = {...asm,components:asm.components.map(copyPose),mates:structuredClone(asm.mates || []),
        topologyMates:structuredClone(asm.topologyMates || [])};
    }
    return copy;
  }
  return copyPose;
}

// The proposed mate is already detached from the live document. Install it
// before finding the nested poses the solver can write through its references.
export function createMateTrial(assembly, proposed) {
  const topologyMates = structuredClone(assembly.topologyMates || []);
  if (proposed) {
    const index = topologyMates.findIndex(mate => mate.id === proposed.id);
    if (index < 0) topologyMates.push(proposed);
    else topologyMates[index] = proposed;
  }
  const trial = {...assembly, mates:structuredClone(assembly.mates || []), topologyMates};
  trial.components = (assembly.components || []).map(trialPoseMapper(trial));
  return trial;
}

export function publishTrialPoses(assembly,trial) {
  trial.components.forEach((source,index)=>{
    const target = assembly.components[index];
    target.transform = source.transform;
    if (source.inContext) {
      target.grounded = source.grounded;
      if (source.contextIssue) target.contextIssue = source.contextIssue;
      else delete target.contextIssue;
    }
    if (source.asm && target.asm !== source.asm) {
      publishTrialPoses(target.asm,source.asm);
      source.asm.topologyMates?.forEach((mate,i)=>Object.assign(target.asm.topologyMates[i],mate));
    }
  });
}
