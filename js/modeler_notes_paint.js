// Data structures and business logic for 3D notes, annotation callouts,
// interactive face/body painting, and freehand markup strokes in ModelForge.

import { createAppearanceOverride, upsertAppearanceOverride } from "./cad_appearances.js";

export const NOTE_CATEGORIES = Object.freeze({
  general: { id: "general", label: "General", labelHe: "כללי", color: "#2563eb", icon: "ph-chat-circle-text" },
  issue: { id: "issue", label: "Issue / Fix", labelHe: "תקלה / תיקון", color: "#dc2626", icon: "ph-warning-circle" },
  tolerance: { id: "tolerance", label: "Tolerance", labelHe: "טולרנס", color: "#d97706", icon: "ph-ruler" },
  spec: { id: "spec", label: "Specification", labelHe: "מפרט", color: "#16a34a", icon: "ph-check-circle" },
  finish: { id: "finish", label: "Finish / Surface", labelHe: "גימור / פני שטח", color: "#9333ea", icon: "ph-paint-brush" },
});

export const CURATED_SWATCHES = Object.freeze([
  { name: "Pure White", color: "#f8fafc", metal: 0.05, rough: 0.3 },
  { name: "Slate Gray", color: "#64748b", metal: 0.2, rough: 0.5 },
  { name: "Matte Black", color: "#1e293b", metal: 0.1, rough: 0.7 },
  { name: "Brushed Aluminum", color: "#8fb8c4", metal: 0.75, rough: 0.3 },
  { name: "Polished Steel", color: "#aeb7c2", metal: 0.85, rough: 0.2 },
  { name: "Brass Gold", color: "#c4a35a", metal: 0.7, rough: 0.25 },
  { name: "Warm Oak", color: "#b45309", metal: 0.0, rough: 0.8 },
  { name: "Dark Walnut", color: "#5c3317", metal: 0.0, rough: 0.75 },
  { name: "Industrial Blue", color: "#2563eb", metal: 0.1, rough: 0.4 },
  { name: "Safety Red", color: "#dc2626", metal: 0.1, rough: 0.4 },
  { name: "Safety Yellow", color: "#eab308", metal: 0.1, rough: 0.4 },
  { name: "Forest Green", color: "#16a34a", metal: 0.1, rough: 0.4 },
]);

export function generateUid(prefix = "item") {
  return prefix + "_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 7);
}

export function createNote(options = {}) {
  const pt = options.point || { x: 0, y: 0, z: 0 };
  const n = options.normal || { x: 0, y: 1, z: 0 };
  const cat = options.category && NOTE_CATEGORIES[options.category] ? options.category : "general";
  const catDef = NOTE_CATEGORIES[cat];
  return {
    id: options.id || generateUid("note"),
    point: {
      x: Number.isFinite(Number(pt.x)) ? Number(pt.x) : 0,
      y: Number.isFinite(Number(pt.y)) ? Number(pt.y) : 0,
      z: Number.isFinite(Number(pt.z)) ? Number(pt.z) : 0,
    },
    normal: {
      x: Number.isFinite(Number(n.x)) ? Number(n.x) : 0,
      y: Number.isFinite(Number(n.y)) ? Number(n.y) : 1,
      z: Number.isFinite(Number(n.z)) ? Number(n.z) : 0,
    },
    text: String(options.text != null ? options.text : "").trim() || "Note",
    category: cat,
    color: options.color || catDef.color,
    offset: {
      x: Number.isFinite(Number(options.offset?.x)) ? Number(options.offset.x) : 40,
      y: Number.isFinite(Number(options.offset?.y)) ? Number(options.offset.y) : -40,
    },
    author: options.author || "User",
    createdAt: options.createdAt || Date.now(),
    targetFaceId: options.targetFaceId || null,
  };
}

export function ensureNotes(def) {
  if (!def) return [];
  if (!Array.isArray(def.notes)) def.notes = [];
  return def.notes;
}

export function ensureMarkups(def) {
  if (!def) return [];
  if (!Array.isArray(def.markups)) def.markups = [];
  return def.markups;
}

export function addNoteToDef(def, note) {
  const notes = ensureNotes(def);
  const normalized = createNote(note);
  notes.push(normalized);
  return normalized;
}

export function updateNoteInDef(def, id, patch = {}) {
  const notes = ensureNotes(def);
  const idx = notes.findIndex((n) => n.id === id);
  if (idx < 0) return null;
  const curr = notes[idx];
  const nextCat = patch.category && NOTE_CATEGORIES[patch.category] ? patch.category : curr.category;
  const catDef = NOTE_CATEGORIES[nextCat];
  notes[idx] = {
    ...curr,
    ...patch,
    category: nextCat,
    color: patch.color || (patch.category ? catDef.color : curr.color),
    offset: patch.offset ? {
      x: Number.isFinite(Number(patch.offset.x)) ? Number(patch.offset.x) : curr.offset.x,
      y: Number.isFinite(Number(patch.offset.y)) ? Number(patch.offset.y) : curr.offset.y,
    } : curr.offset,
  };
  return notes[idx];
}

export function deleteNoteFromDef(def, id) {
  const notes = ensureNotes(def);
  const idx = notes.findIndex((n) => n.id === id);
  if (idx < 0) return false;
  notes.splice(idx, 1);
  return true;
}

export function translateNotes(notes, dx, dy, dz) {
  if (!Array.isArray(notes)) return;
  const x = Number(dx) || 0, y = Number(dy) || 0, z = Number(dz) || 0;
  if (!x && !y && !z) return;
  for (const n of notes) {
    if (n && n.point) {
      if (Number.isFinite(n.point.x)) n.point.x += x;
      if (Number.isFinite(n.point.y)) n.point.y += y;
      if (Number.isFinite(n.point.z)) n.point.z += z;
    }
  }
}

export function applyFacePaint(def, faceRef, spec = {}) {
  if (!def || !faceRef || !faceRef.persistentId) return null;
  def.appearances = Array.isArray(def.appearances) ? def.appearances : [];
  const color = spec.color || "#3b82f6";
  const metal = Number.isFinite(Number(spec.metal)) ? Number(spec.metal) : 0.1;
  const rough = Number.isFinite(Number(spec.rough)) ? Number(spec.rough) : 0.5;
  const name = spec.name || "Custom Paint";
  const override = createAppearanceOverride({
    persistentId: faceRef.persistentId,
    kind: "face",
    material: spec.material || "custom",
    color: color,
    metal: metal,
    rough: rough,
    name: name,
  });
  def.appearances = upsertAppearanceOverride(def.appearances, override);
  return override;
}

export function applyBodyPaint(part, spec = {}) {
  if (!part) return null;
  const color = spec.color || "#3b82f6";
  const metal = Number.isFinite(Number(spec.metal)) ? Number(spec.metal) : 0.1;
  const rough = Number.isFinite(Number(spec.rough)) ? Number(spec.rough) : 0.5;
  const name = spec.name || "Custom Paint";
  part.color = color;
  part.metal = metal;
  part.rough = rough;
  part.materialName = name;
  return part;
}

export function sampleFaceAppearance(def, faceRef, part) {
  if (faceRef && faceRef.persistentId && def && Array.isArray(def.appearances)) {
    const found = def.appearances.find((a) => a.kind === "face" && a.persistentId === faceRef.persistentId);
    if (found) {
      return {
        color: found.color || "#888888",
        metal: Number.isFinite(Number(found.metal)) ? Number(found.metal) : 0.1,
        rough: Number.isFinite(Number(found.rough)) ? Number(found.rough) : 0.5,
        material: found.material || "custom",
        name: found.name || "Face Appearance",
      };
    }
  }
  if (part) {
    return {
      color: part.color || "#999999",
      metal: Number.isFinite(Number(part.metal)) ? Number(part.metal) : 0.1,
      rough: Number.isFinite(Number(part.rough)) ? Number(part.rough) : 0.7,
      material: part.material || part.materialName || "stock",
      name: part.materialName || part.name || "Body Material",
    };
  }
  return { color: "#999999", metal: 0.1, rough: 0.5, material: "custom", name: "Default" };
}

export function clearFacePaint(def, faceRef) {
  if (!def || !faceRef || !faceRef.persistentId || !Array.isArray(def.appearances)) return false;
  const initialLen = def.appearances.length;
  def.appearances = def.appearances.filter((a) => !(a.kind === "face" && a.persistentId === faceRef.persistentId));
  return def.appearances.length < initialLen;
}

export function createMarkupStroke(options = {}) {
  const pts = Array.isArray(options.points) ? options.points.map((p) => ({
    x: Number(p.x) || 0,
    y: Number(p.y) || 0,
    z: Number.isFinite(Number(p.z)) ? Number(p.z) : null,
  })) : [];
  return {
    id: options.id || generateUid("stroke"),
    color: options.color || "#ef4444",
    width: Number.isFinite(Number(options.width)) ? Math.max(1, Number(options.width)) : 3,
    points: pts,
    createdAt: options.createdAt || Date.now(),
  };
}

export function addMarkupToDef(def, stroke) {
  const markups = ensureMarkups(def);
  const normalized = createMarkupStroke(stroke);
  if (normalized.points.length >= 2) {
    markups.push(normalized);
    return normalized;
  }
  return null;
}

export function deleteMarkupFromDef(def, strokeId) {
  const markups = ensureMarkups(def);
  const idx = markups.findIndex((s) => s.id === strokeId);
  if (idx < 0) return false;
  markups.splice(idx, 1);
  return true;
}

export function clearMarkupsFromDef(def) {
  if (!def) return;
  def.markups = [];
}

export function translateMarkups(markups, dx, dy, dz) {
  if (!Array.isArray(markups)) return;
  const x = Number(dx) || 0, y = Number(dy) || 0, z = Number(dz) || 0;
  if (!x && !y && !z) return;
  for (const stroke of markups) {
    if (stroke && Array.isArray(stroke.points)) {
      for (const pt of stroke.points) {
        if (pt && pt.z != null && Number.isFinite(pt.x)) {
          pt.x += x; pt.y += y; pt.z += z;
        }
      }
    }
  }
}
