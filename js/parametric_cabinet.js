// Cabinet adapter: the existing semantic cabinet generator remains responsible
// for construction rules, motion, BOM and price; this module publishes that
// result as an ordinary canonical parametric definition.

import {
  STD, layoutCab, cutList, hardwareList, cabPrice, cabQuote, makeSpec,
  normalizeSpec, presetById, checkCab, famLabel, presetLabel,
} from "./cabinet.js";
import { createDefinition, createParameter, mainReferences, cloneDomain } from "./core/schema.js";
import { ensureParametricProject, rebuildItem } from "./core/project.js";
import { cabinetPartFeatureHistory, captureCabinetAdvancedDelta, mergeCabinetAdvanced } from "./core/cabinet_advanced.js";
import { cabinetAdvancedManufacturing } from "./core/cabinet_advanced.js";
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

function safeId(value) {
  return String(value == null ? "part" : value).replace(/[^A-Za-z0-9:_-]/g, "_");
}

function layoutPartToEditor(part, stableId) {
  const common = {
    id: stableId,
    featureId: "feature:" + stableId,
    name: part.role || part.mat || "Cabinet part",
    color: part.mat === "front" || part.mat === "doorPanel" ? "#d0b48c" : part.mat === "metal" ? "#8c9298" : "#e2ded4",
    metal: part.mat === "metal" || part.mat === "handle" || part.mat === "rail" ? 0.75 : 0.04,
    rough: part.mat === "metal" || part.mat === "handle" || part.mat === "rail" ? 0.3 : 0.72,
    role: part.role,
    materialRole: part.mat,
    cabinetUnit: part.unit,
    source: cloneDomain(part),
  };
  if (part.k === "box") return { ...common, kind: "box", x0: part.x0, x1: part.x1, y0: part.y0, y1: part.y1, z0: part.z0, z1: part.z1 };
  if (part.k === "cyl") return { ...common, kind: "cyl", x: part.x, y: part.y, z: part.z, r: part.r, h: part.hgt, rx: part.rx, rz: part.rz };
  if (part.k === "sph") return { ...common, kind: "sph", x: part.x, y: part.y, z: part.z, r: part.r };
  if (part.k === "poly" && Array.isArray(part.pts)) {
    return { ...common, kind: "ext", axis: "y", from: part.y0, to: part.y1, pts: part.pts.map((point) => ({ u: point.x, v: point.z })) };
  }
  return null;
}

function semanticCabinetParts(layout) {
  const occurrences = new Map();
  return layout.parts.map((part) => {
    const role = safeId(part.role || part.mat || part.k);
    const unit = part.unit == null ? "fixed" : "unit_" + safeId(part.unit);
    const family = role + ":" + unit;
    const occurrence = (occurrences.get(family) || 0) + 1;
    occurrences.set(family, occurrence);
    return layoutPartToEditor(part, "cabpart:" + family + ":" + occurrence);
  }).filter(Boolean);
}

export function captureCabinetAdvancedEdits(definition,item) {
  const baseParts=semanticCabinetParts(layoutCab(item)), baseSketches=[cabinetSketch(item,layoutCab(item))];
  return captureCabinetAdvancedDelta(definition,baseParts,baseSketches);
}

export function finalizeCabinetAdvancedDefinition(definition,item) {
  const source=cloneDomain(definition);
  source.metadata ||= {};
  source.metadata.advancedEdits=captureCabinetAdvancedEdits(source,item);
  const rebuilt=cabinetDefinitionFromItem(item,source);
  rebuilt.authoringMode=source.metadata.advancedEdits.requiresManufacturingReview ? "hybrid" : source.authoringMode;
  return rebuilt;
}

function cabinetSketch(item, layout) {
  const w = item.w, h = item.h, hw = w / 2;
  const points = [
    { id: "cab:p0", x: -hw, y: 0, fixed: true }, { id: "cab:p1", x: hw, y: 0 },
    { id: "cab:p2", x: hw, y: h }, { id: "cab:p3", x: -hw, y: h },
  ];
  const entities = [
    { id: "cab:e0", type: "line", a: "cab:p0", b: "cab:p1" }, { id: "cab:e1", type: "line", a: "cab:p1", b: "cab:p2" },
    { id: "cab:e2", type: "line", a: "cab:p2", b: "cab:p3" }, { id: "cab:e3", type: "line", a: "cab:p3", b: "cab:p0" },
  ];
  const constraints = [
    { id: "cab:c0", type: "horizontal", entity: "cab:e0" }, { id: "cab:c1", type: "vertical", entity: "cab:e1" },
    { id: "cab:c2", type: "horizontal", entity: "cab:e2" }, { id: "cab:c3", type: "vertical", entity: "cab:e3" },
    { id: "cab:width", type: "distance", entity: "cab:e0", name: "CabinetWidth", value: w, parameter: "width" },
    { id: "cab:height", type: "distance", entity: "cab:e1", name: "CabinetHeight", value: h, parameter: "height" },
  ];
  let x = -hw + layout.t;
  layout.cols.forEach((column, index) => {
    if (index) {
      const px = "cab:divider:" + index + ":0", py = "cab:divider:" + index + ":1", edge = "cab:divider:" + index;
      points.push({ id: px, x, y: layout.yb }, { id: py, x, y: layout.yt });
      entities.push({ id: edge, type: "line", a: px, b: py, construction: true });
      constraints.push({ id: edge + ":vertical", type: "vertical", entity: edge });
    }
    x += column.w + layout.t;
  });
  return { id: "sketch:cabinet-front", name: "Cabinet front layout", referenceId: "plane:front", plane: "front", offset: item.d / 2, points, entities, constraints };
}

function interactions(layout) {
  return (layout.units || []).map((unit, index) => ({
    id: "cabinet-motion:" + index,
    type: unit.rot ? "rotate" : "translate",
    channel: unit.kind || unit.t || (unit.rot ? "door" : "drawer"),
    unit: index,
    axis: unit.rot || (unit.tx ? "x" : unit.ty ? "y" : "z"),
    range: [0, 1],
  }));
}

export function cabinetDefinitionFromItem(item, previous) {
  const layout = layoutCab(item);
  const advancedEdits=cloneDomain(previous?.metadata?.advancedEdits);
  const advancedManufacturing=cabinetAdvancedManufacturing(advancedEdits);
  const parts = mergeCabinetAdvanced(semanticCabinetParts(layout),advancedEdits,"Part");
  const sketches=mergeCabinetAdvanced([cabinetSketch(item,layout)],advancedEdits,"Sketch");
  const featureRuns=parts.map(cabinetPartFeatureHistory), partFeatures=featureRuns.flatMap((run)=>run.features), partOutputs=featureRuns.map((run)=>run.outputId);
  const spec = item.cab;
  const preset = presetById(spec.preset);
  const presetName = preset ? presetLabel(preset) : spec.preset === "blank" ? "Custom layout" : String(spec.preset || "Custom layout");
  const id = item.definitionId && String(item.definitionId).startsWith("cabinet:")
    ? item.definitionId : "cabinet:" + item.id;
  return createDefinition({
    id,
    key: previous?.key || "cm_cabinet_" + safeId(item.id).slice(0, 40),
    name: previous?.name || famLabel(spec.fam) + " · " + presetName,
    kind: "cabinet",
    authoringMode: "fully-parametric",
    references: mainReferences(),
    parameters: {
      width: createParameter("width", item.w, { label: "Overall width", exposure: "planner", min: STD.minCol, max: 600 }),
      depth: createParameter("depth", item.d, { label: "Overall depth", exposure: "planner", min: 20, max: 120 }),
      height: createParameter("height", item.h, { label: "Overall height", exposure: "planner", min: 30, max: 350 }),
      panelThickness: createParameter("panelThickness", spec.panel, { label: "Side/top/bottom panel", exposure: "technical", min: 0.8, max: 4, fixed: false }),
      shelfThickness: createParameter("shelfThickness", spec.shelf || spec.panel, { label: "Shelf thickness", exposure: "technical", min: 0.8, max: 4 }),
      backThickness: createParameter("backThickness", spec.back, { label: "Back thickness", exposure: "technical", min: 0.3, max: 3 }),
      plinthHeight: createParameter("plinthHeight", spec.plinth, { label: "Plinth height", exposure: "technical", min: 0, max: 30 }),
      frontGap: createParameter("frontGap", spec.gap, { label: "Front clearance", exposure: "technical", min: 0, max: 2 }),
    },
    sketches,
    features: [
      ...sketches.map((sketch)=>({id:sketch.id==="sketch:cabinet-front"?"feature:cabinet-front-sketch":"feature:"+sketch.id,type:"sketch",name:sketch.name || "Cabinet sketch",params:{sketchId:sketch.id},inputs:[]})),
      ...partFeatures,
      { id: "feature:cabinet-assembly", type: "assembly", name: "Cabinet assembly", params: { componentFeatures: partOutputs }, inputs: partOutputs },
    ],
    parts,
    rules: {
      family: "cabinet",
      dimensions: {
        width: { min: STD.minCol, max: 600, continuous: true }, depth: { min: 20, max: 120, continuous: true }, height: { min: 30, max: 350, continuous: true },
      },
      module: { parameter: "moduleCount", dimension: "width", minSpan: STD.minCol, maxSpan: STD.maxSpan, minCount: 1, maxCount: 12, noun: "modules" },
      invariants: { panelThickness: spec.panel, backThickness: spec.back, maxShelfSpan: STD.maxSpan, maxDoorWidth: STD.maxDoor, maxSingleBox: STD.maxBox },
      configuration: { moduleCount: spec.cols.length, doorCount: layout.cols.reduce((sum, column) => sum + (column.doorLeaves || 0), 0) },
    },
    metadata: {
      adapter: "cabinet", source: "cabinet-designer", cabSpec: cloneDomain(spec), advancedEdits,
      interactions: interactions(layout), bom: cutList(item), hardware: hardwareList(item),
      quote: cabQuote(item), price: cabPrice(item), manufacturingReviewRequired:!!advancedEdits?.requiresManufacturingReview,
      advancedManufacturing,
    },
    revision: (previous?.revision || 0) + 1,
  });
}

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

export function requestCabinetDimension(item, dimension, requested, ceilingHeight) {
  const limit = CAB_LIMITS[dimension];
  const field = limit && limit.field;
  if (!field || !Number.isFinite(Number(requested))) {
    return { status: "rejected", message: he("מידה לא תקפה", "Invalid cabinet dimension") };
  }
  const value = Number(requested);
  if (value < limit.min || value > limit.max) {
    const bounded = Math.max(limit.min, Math.min(limit.max, value));
    return {
      status: "proposal",
      message: he("המידה מחוץ לטווח מערכת הארונות", "Requested size is outside the cabinet system range"),
      alternatives: [{
        id: "clamp", dimension, value: bounded, spec: null,
        label: he("השתמשו ב-" + bounded + " ס״מ", "Use " + bounded + " cm"),
        reason: he("גבולות המערכת: " + limit.min + "–" + limit.max + " ס״מ", "System range: " + limit.min + "–" + limit.max + " cm"),
      }],
    };
  }
  const current = configSummary(item.cab, item.w);
  const dims = { w: item.w, d: item.d, h: item.h, [field]: value };
  const recommended = makeSpec(item.cab.preset, dims.w, dims.h, dims.d, item.cab);
  const next = configSummary(recommended, dims.w);
  const probe = { ...cloneDomain(item), ...dims, cab: cloneDomain(item.cab) };
  normalizeSpec(probe.cab, probe.w, probe.h, probe.d);
  const issues = checkCab(probe, ceilingHeight).filter((issue) => issue.level === "err" || issue.level === "warn");
  const configurationChanged = current.modules !== next.modules || current.doors !== next.doors || current.uprights !== next.uprights;
  if (!configurationChanged && !issues.length) {
    return {
      status: "applied", dimension, value, spec: probe.cab,
      message: he("הארון עודכן בתוך החלוקה הקיימת", "Cabinet rebuilt within the current configuration"),
    };
  }
  const alternatives = [{
    id: "recommended", dimension, value, spec: recommended,
    label: configLabel(next),
    reason: he("שומר על מפתחי מדפים ורוחבי דלת בגבולות הספרייה", "Keeps panel spans and door widths within the cabinet library limits"),
  }];
  if (!issues.length) alternatives.push({
    id: "keep-layout", dimension, value, spec: probe.cab,
    label: he("שמרו על " + current.modules + " מודולים", "Keep current " + current.modules + "-module layout"),
    reason: he("החלוקה הנוכחית עדיין תקפה, אבל אינה החלוקה המומלצת", "Current layout remains valid, but is not the recommended module distribution"),
  });
  return {
    status: "proposal", dimension, value,
    message: configurationChanged
      ? he("המידה הזו דורשת חלוקה אחרת של הארון", "This size needs a different cabinet configuration")
      : he("הבנייה הנוכחית דורשת בדיקה במידה הזו", "The current construction needs review at this size"),
    issues, alternatives,
  };
}

export function applyCabinetDimension(state, item, result, alternativeId) {
  const choice = result.status === "applied" ? result : (result.alternatives || []).find((candidate) => candidate.id === alternativeId);
  if (!choice) return null;
  const field = (CAB_LIMITS[choice.dimension] || {}).field;
  if (!field) return null;
  item[field] = choice.value;
  if (choice.spec) item.cab = cloneDomain(choice.spec);
  const definition = syncCabinetDefinition(state, item);
  (state.items || []).forEach((other) => {
    if (other === item || other.definitionId !== definition.id) return;
    other.cab = cloneDomain(item.cab);
    other[field] = choice.value;
    other.parameterOverrides ||= {};
    other.parameterOverrides[choice.dimension] = choice.value;
    rebuildItem(state, other, {});
  });
  return definition;
}
