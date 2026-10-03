// CAD Project Bundles & Document Autosave Engine.
import { exportAttachmentRecords, externalizeAttachments, installAttachmentRecords } from "./core/attachment_store.js";
import {compactAssemblyTopologySnapshots,compactDocumentTopologySnapshots} from './core/project_topology_budget.js';
import {inferAuthoringMode} from './core/authoring_mode.js';

export async function createProjectBundle(def, assemblies = [], drawings = [], options = {}) {
  const activeAssembly=options.activeAssembly;
  const included=Array.isArray(assemblies) ? assemblies.slice() : [];
  if (activeAssembly?.key) {
    const at=included.findIndex((item)=>item.key===activeAssembly.key);
    if (at<0) included.push(activeAssembly); else included[at]=activeAssembly;
  }
  // Authored history can outgrow the empty document's cached direct-only mode.
  // Refresh capability metadata in the exported snapshot, preserving explicit
  // classifications on imports/catalog definitions and the live document.
  const mainModel=compactDocumentTopologySnapshots(def);
  const currentModel=mainModel?.metadata?.authoringSystem==="parametric-v1"
    ? {...mainModel,authoringMode:inferAuthoringMode({...mainModel,authoringMode:null})} : mainModel;
  const content=await externalizeAttachments({mainModel:currentModel,assemblies:included.map(assembly=>compactAssemblyTopologySnapshots(assembly)),drawings});
  const bundle={
    version: 3,
    createdAt: Date.now(),
    ...content,
    metadata: {
      generator: "ModelForge CAD SolidWorks-Class",
      units: def?.context?.units?.length || "mm",
      attachmentStorage:"content-addressed",
      activeDocument:activeAssembly?.key
        ? {type:"assembly",key:activeAssembly.key}
        : {type:"part",key:def?.key || null},
    },
  };
  bundle.attachments=await exportAttachmentRecords(bundle);
  return bundle;
}

/* Older assembly exports carried their assembly but labelled the inactive,
   empty part as the main model. Recover that unambiguous one-assembly case;
   authored sketch-only and solid parts retain their own document on import. */
export function activeProjectDocument(bundle) {
  const assemblies=Array.isArray(bundle?.assemblies) ? bundle.assemblies : [];
  const marked=bundle?.metadata?.activeDocument;
  if (marked?.type==="assembly") {
    const assembly=assemblies.find((item)=>item.key===marked.key);
    if (assembly) return {type:"assembly",assembly};
  }
  const model=bundle?.mainModel;
  const emptyPart=model && !model.parts?.length && !model.features?.length
    && !model.history?.length && !(model.sketches || []).some((sketch)=>(sketch.entities || []).length);
  if (!marked && emptyPart && assemblies.length===1) return {type:"assembly",assembly:assemblies[0]};
  return {type:"part",model};
}

export function exportProjectBundle(bundle) {
  // Mesh and topology arrays dominate CAD projects. Indenting every numeric
  // entry multiplies download size and temporarily doubles renderer memory.
  const jsonStr = JSON.stringify(bundle);
  const blob = new Blob([jsonStr], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  const active=activeProjectDocument(bundle);
  const name = (active.type==="assembly" ? active.assembly?.name : bundle.mainModel?.name || "cad_project")
    || "cad_project";
  a.download = `${name.replace(/[^a-z0-9_-]+/gi, "_")}.mforge`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function importProjectBundle(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        resolve(await importProjectBundleText(e.target.result));
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

export async function importProjectBundleText(text) {
  const bundle=JSON.parse(text);
  if(!bundle || !bundle.mainModel || !Array.isArray(bundle.mainModel.parts))throw new Error("Bundle has no main model");
  await installAttachmentRecords(bundle.attachments || []);
  return bundle;
}
