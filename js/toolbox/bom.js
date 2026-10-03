// Bill of materials for toolbox parts. Groups by catalog identity so an
// assembly of twenty M8×30 SHCS is one row, not twenty — and A2 vs 10.9
// stay separate even when the designation text matches.

import { bomIdentity } from "./schema.js";
import { assignedToolboxBody, toolboxAssignedMetadata } from "../core/toolbox_assigned_material.js";

export function toolboxBOMRows(items = []) {
  const map = new Map();
  for (const item of items) {
    const source = item && (item.metadata || item.standardPart || (item.parts && item.parts[0] && item.parts[0].standardPart)) || {};
    const meta = toolboxAssignedMetadata(source, assignedToolboxBody(item?.parts, source));
    const designation = meta.designation || item.callout || item.name || "Unknown";
    const key = bomIdentity(meta) || designation;
    const existing = map.get(key) || {
      key,
      designation,
      name: designation,
      quantity: 0,
      category: meta.category || item.category || "",
      family: meta.family || item.family || item.kind || "",
      standard: meta.standard || "",
      nominalSize: meta.nominalSize || item.size || "",
      material: meta.material || "",
      materialId: meta.materialId || "",
      finish: meta.finish || "",
      propertyClass: meta.propertyClass || "",
      threadClass: meta.threadClass || "",
      catalogKey: meta.catalogKey || "",
      representative: !!meta.representative,
      dimensionsMm: meta.dimensionsMm || {},
    };
    existing.quantity += Number(item.quantity) || 1;
    map.set(key, existing);
  }
  return Array.from(map.values()).map((row, index) => ({ item: index + 1, ...row }));
}

export function toolboxBOMFromParts(parts = []) {
  const items = [];
  const seen = new Set();
  for (const part of parts) {
    const meta = part && (part.standardPart || null);
    const group = part && part.standardGroupId;
    if (group) {
      if (seen.has(group)) continue;
      seen.add(group);
    } else if (!meta) continue;
    const members = group ? parts.filter(member => member.standardGroupId === group) : [part];
    items.push({ metadata: toolboxAssignedMetadata(meta, assignedToolboxBody(members, meta)), callout: part.name, quantity: 1, parts: [part] });
  }
  return toolboxBOMRows(items);
}

export function toolboxBOMCsv(rows) {
  const headers = ["Item", "Qty", "Designation", "Standard", "Size", "Material", "Finish", "Category"];
  const cell = (value) => {
    const text = value == null ? "" : String(value);
    return /[",\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
  };
  const lines = [headers.map(cell).join(",")];
  (rows || []).forEach((row) => {
    lines.push([row.item, row.quantity, row.designation || row.name, row.standard, row.nominalSize, row.material, row.finish, row.category].map(cell).join(","));
  });
  return lines.join("\n");
}

export function collectToolboxItems(assembly) {
  const items = [];
  for (const comp of assembly && assembly.components || []) {
    const meta = comp.standardPart || (comp.def && comp.def.standardPart);
    if (meta) {
      items.push({ metadata: meta, name: comp.name, quantity: 1, parts: comp.def?.parts || comp.parts || [] });
      continue;
    }
    const parts = (comp.def && comp.def.parts) || comp.parts || [];
    const fromParts = toolboxBOMFromParts(parts);
    fromParts.forEach((row) => items.push({ metadata: row, quantity: row.quantity }));
  }
  return toolboxBOMRows(items);
}
