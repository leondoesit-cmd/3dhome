// Cabinet adapter: the existing semantic cabinet generator remains responsible
// for construction rules, motion, BOM and price; this module publishes that
// result as an ordinary canonical parametric definition.

import {
  STD, makeSpec, normalizeSpec, checkCab,
} from "./cabinet.js";
import { cloneDomain } from "./core/schema.js";
import { ensureParametricProject, rebuildItem } from "./core/project.js";
import { cabinetDefinitionFromItem } from "./core/cabinet_definition.js";
export { cabinetDefinitionFromItem, captureCabinetAdvancedEdits, finalizeCabinetAdvancedDefinition } from "./core/cabinet_definition.js";
import { getLang } from "./i18n.js";

function he(a, b) {
  return getLang() === "en" ? b : a;
}

/* Overall envelope the designer and the planner both honour. Width cannot go
   below one useful bay; depth and height are the carcass ranges the catalogue
   actually builds. */
export const CAB_LIMITS = {
  width: { field: "w", min: STD.minCol, max: 600 },
  depth: { field: "d", min: 20, max: 120 },
  height: { field: "h", min: 30, max: 350 },
};

export function syncCabinetDefinition(state, item, options = {}) {
  const project = ensureParametricProject(state);
  const previous = item.definitionId ? project.definitions[item.definitionId] : null;
  const definition = cabinetDefinitionFromItem(item, previous);
  item.definitionId = definition.id;
  item.parameterOverrides = { width: item.w, depth: item.d, height: item.h };
  item.configuration = cloneDomain(definition.rules.configuration);
  project.definitions[definition.id] = definition;
  rebuildItem(state, item, {});
  if (options.propagate) {
    (state.items || []).forEach((other) => {
      if (other === item || other.definitionId !== definition.id) return;
      var open = other.cab && other.cab.open;
      other.cab = cloneDomain(item.cab);
      other.cab.open = open || 0;
      normalizeSpec(other.cab, other.w, other.h, other.d);
      other.parameterOverrides ||= {};
      other.parameterOverrides.width = other.w;
      other.parameterOverrides.depth = other.d;
      other.parameterOverrides.height = other.h;
      rebuildItem(state, other, {});
    });
  }
  return definition;
}

function configSummary(spec, width) {
  const doors = (spec.cols || []).reduce((sum, column) => {
    if (!column.door || column.door.t === "none") return sum;
    return sum + (column.door.leaves || Math.max(1, Math.ceil((column.w || width) / STD.maxDoor)));
  }, 0);
  return { modules: (spec.cols || []).length, doors, uprights: Math.max(0, (spec.cols || []).length - 1) };
}

function configLabel(summary) {
  return he(
    summary.modules + " מודולים · " + summary.doors + " חזיתות · " + summary.uprights + " מחיצות",
    summary.modules + " modules · " + summary.doors + " fronts · " + summary.uprights + " uprights",
  );
}

function dimensionProbe(item, dimension, value, spec, ceiling) {
  const probe = { ...cloneDomain(item), [CAB_LIMITS[dimension].field]: value, cab: cloneDomain(spec || item.cab) };
  // An accepted layout is a decision, not permission for specOf to replace it.
  probe.cab.auto = false;
  normalizeSpec(probe.cab, probe.w, probe.h, probe.d);
  const issues = checkCab(probe, ceiling).filter((issue) => issue.level !== "info");
  return { probe, issues, valid: !issues.some((issue) => issue.level === "err") };
}

export function requestCabinetDimension(item, dimension, requested, ceilingHeight) {
  const limit = CAB_LIMITS[dimension];
  if (!limit || requested === "" || requested == null || !Number.isFinite(Number(requested))) {
    return { status: "rejected", message: he("מידה לא תקפה", "Invalid cabinet dimension") };
  }
  const raw = Number(requested), value = Math.max(limit.min, Math.min(limit.max, raw));
  const bounded = value !== raw;
  const current = configSummary(item.cab, item.w);
  const dims = { w: item.w, d: item.d, h: item.h, [limit.field]: value };
  const kept = dimensionProbe(item, dimension, value, item.cab, ceilingHeight);
  const recommended = dimensionProbe(item, dimension, value, makeSpec(item.cab.preset, dims.w, dims.h, dims.d, item.cab), ceilingHeight);
  const next = configSummary(recommended.probe.cab, dims.w);
  const configurationChanged = current.modules !== next.modules || current.doors !== next.doors;
  const common = { dimension, value, ceilingHeight };
  if (!bounded && kept.valid && !kept.issues.length && (!configurationChanged || item.cab.auto === false)) {
    return { ...common, status: "applied", spec: kept.probe.cab,
      message: he("הארון עודכן בתוך החלוקה הקיימת", "Cabinet rebuilt within the current configuration") };
  }
  const alternatives = [];
  if (kept.valid) alternatives.push({ ...common, id: bounded ? "clamp" : "keep-layout", spec: kept.probe.cab,
    label: bounded ? he("השתמשו ב-" + value + " ס״מ", "Use " + value + " cm") : he("שמרו על " + current.modules + " מודולים", "Keep current " + current.modules + "-module layout"),
    reason: he("שומר על החלוקה; יש לבדוק את האזהרות", "Preserves the layout; review any warnings"), issues: kept.issues });
  if (recommended.valid && (!kept.valid || configurationChanged)) alternatives.push({ ...common, id: "recommended", spec: recommended.probe.cab,
    label: configLabel(next), reason: he("חלוקה חדשה שעברה בדיקות מבנה", "New layout passes construction checks"), issues: recommended.issues });
  return { ...common, status: "proposal", issues: kept.issues, alternatives,
    message: !alternatives.length ? he("אין חלוקה תקפה במידה הזו. שנו את המידה או את תכולת הארון.", "No valid layout at this size. Change the size or cabinet contents.")
      : bounded ? he("המידה מחוץ לטווח מערכת הארונות", "Requested size is outside the cabinet system range")
      : he("בדקו את החלוקה והאזהרות לפני שינוי המידה", "Review the layout and warnings before resizing") };
}

export function applyCabinetDimension(state, item, result, alternativeId) {
  const choice = result.status === "applied" ? result : (result.alternatives || []).find((candidate) => candidate.id === alternativeId);
  const limit = choice && CAB_LIMITS[choice.dimension];
  if (!limit || !Number.isFinite(choice.value) || choice.value < limit.min || choice.value > limit.max) return null;
  const verified = dimensionProbe(item, choice.dimension, choice.value, choice.spec, result.ceilingHeight);
  if (!verified.valid) return null;
  item[limit.field] = choice.value;
  item.cab = verified.probe.cab;
  // Dimensions belong to the instance. Shared composition still propagates,
  // refitted to each linked cabinet's own envelope, just like normal edits.
  return syncCabinetDefinition(state, item, { propagate: true });
}
