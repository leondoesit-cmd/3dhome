// CAD Project Bundles & Document Autosave Engine.
import { exportAttachmentRecords, externalizeAttachments, installAttachmentRecords } from "./core/attachment_store.js";

export async function createProjectBundle(def, assemblies = [], drawings = []) {
  const content=await externalizeAttachments({mainModel:def,assemblies,drawings});
  const bundle={
    version: 3,
    createdAt: Date.now(),
    ...content,
    metadata: {
      generator: "ModelForge CAD SolidWorks-Class",
      units: "cm",
      attachmentStorage:"content-addressed",
    },
  };
  bundle.attachments=await exportAttachmentRecords(bundle);
  return bundle;
}

export function exportProjectBundle(bundle) {
  const jsonStr = JSON.stringify(bundle, null, 2);
  const blob = new Blob([jsonStr], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  const name = (bundle.mainModel?.name || "cad_project").replace(/[^a-z0-9_-]+/gi, "_");
  a.download = `${name}.mforge`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function importProjectBundle(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const bundle = JSON.parse(e.target.result);
        await installAttachmentRecords(bundle.attachments || []);
        resolve(bundle);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsText(file);
  });
}
