import { safeId, semanticCabinetParts, cabinetLayoutParts } from "./cabinet_parts.js";
// Semantic cabinet definition generation, shared by the planner and CAD rebuild.
import { STD, checkCab, layoutCab, cutList, hardwareList, cabPrice, cabQuote, normalizeSpec, presetById, famLabel, presetLabel } from "../cabinet.js";
import { createDefinition, createParameter, mainReferences, cloneDomain } from "./schema.js";
import { cabinetPartFeatureHistory, captureCabinetAdvancedDelta, mergeCabinetAdvanced, cabinetAdvancedManufacturing } from "./cabinet_advanced.js";

export function captureCabinetAdvancedEdits(definition,item) {
  const baseline = cabinetDefinitionFromItem(cloneDomain(item));
  const authored = cloneDomain(definition);
  // Canonical feature forms edit intent; project analytic changes back to the
  // semantic delta even when the preview cache has not been refreshed yet.
  for (const feature of authored.features || []) {
    const original = baseline.features.find((candidate) => candidate.id === feature.id);
    if (!original || JSON.stringify(feature.params) === JSON.stringify(original.params)) continue;
    const part = authored.parts.find((candidate) => candidate.featureId === feature.id);
    if (!part) continue;
    const p = feature.params || {};
    if (feature.type === "box" && [p.x,p.y,p.z,p.w,p.h,p.d].every(Number.isFinite)) Object.assign(part, { x0:p.x, x1:p.x+p.w, y0:p.y, y1:p.y+p.h, z0:p.z, z1:p.z+p.d });
    if (feature.type === "cylinder" && [p.x,p.y,p.z,p.r,p.h].every(Number.isFinite)) Object.assign(part, { x:p.x,y:p.y,z:p.z,r:p.r,h:p.h,axis:cloneDomain(p.axis) });
    if (feature.type === "sphere" && [p.x,p.y,p.z,p.r].every(Number.isFinite)) Object.assign(part, { x:p.x,y:p.y,z:p.z,r:p.r });
  }
  const edits = captureCabinetAdvancedDelta(authored, baseline.parts, baseline.sketches);
  edits.authoredFeatures = (authored.features || []).filter((feature) => {
    const original = baseline.features.find((candidate) => candidate.id === feature.id);
    if (!original) return true;
    if (["box", "cylinder", "sphere"].includes(feature.type)) return false;
    return JSON.stringify(feature.params) !== JSON.stringify(original.params) || JSON.stringify(feature.references) !== JSON.stringify(original.references);
  }).map(cloneDomain);
  edits.history = cloneDomain(authored.history);
  if (edits.authoredFeatures.length) edits.requiresManufacturingReview = true;
  return edits;
}

export function finalizeCabinetAdvancedDefinition(definition,item) {
  const source=cloneDomain(definition);
  source.metadata ||= {};
  const dims = source.metadata.generatedParameters || {};
  const editedItem = { ...item, w: dims.width ?? item.w, d: dims.depth ?? item.d, h: dims.height ?? item.h, cab: cloneDomain(source.metadata.cabSpec || item.cab) };
  source.metadata.advancedEdits=captureCabinetAdvancedEdits(source,editedItem);
  const rebuilt=cabinetDefinitionFromItem(editedItem,source);
  for (const key of Object.keys(rebuilt.parameters)) if (source.parameters?.[key]) rebuilt.parameters[key] = { ...cloneDomain(source.parameters[key]), value: rebuilt.parameters[key].value };
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
      points.push({ id: px, x, y: layout.yb, fixed: true }, { id: py, x, y: layout.yt, fixed: true });
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
  const layout = layoutCab(item, null, { semanticOnly: true });
  item.cab.dim = { w: item.w, h: item.h, d: item.d };
  const advancedEdits=cloneDomain(previous?.metadata?.advancedEdits);
  const parts = mergeCabinetAdvanced(semanticCabinetParts(layout),advancedEdits,"Part");
  let sketches = [cabinetSketch(item,layout)];
  let partFeatures = parts.flatMap((part) => cabinetPartFeatureHistory(part).features);
  for (const feature of partFeatures) {
    if (feature.type === "extrude") {
      const params = feature.params, id = "sketch:" + feature.id;
      if (!params.sketchId) {
        const points = (params.points || []).map((point, index) => ({ id: id + ":p" + index, x: point.u, y: point.v }));
        sketches.push({ id, name: feature.name + " profile", referenceId: params.axis === "z" ? "plane:front" : params.axis === "x" ? "plane:right" : "plane:top",
          plane: params.axis === "z" ? "front" : params.axis === "x" ? "side" : "top", offset: 0,
          ...(params.frame ? { frame: cloneDomain(params.frame), frameSpace: "local" } : {}), points,
          entities: points.map((point, index) => ({ id: id + ":e" + index, type: "line", a: point.id, b: points[(index + 1) % points.length].id })), constraints: [] });
        params.sketchId = id;
      }
      feature.references = { sketches: [params.sketchId] };
      params.depth = Math.abs(params.to - params.from); params.offset = params.from;
      params.direction = params.to < params.from ? "reverse" : "forward"; params.endCondition = "blind";
    }
    if (["subtract", "union", "intersect"].includes(feature.type)) {
      feature.params.operation = feature.type; feature.type = "boolean";
      feature.references = { features: feature.inputs.slice() };
    }
  }
  sketches = mergeCabinetAdvanced(sketches, advancedEdits, "Sketch");
  for (const authored of advancedEdits?.authoredFeatures || []) {
    const index = partFeatures.findIndex((feature) => feature.id === authored.id);
    if (index >= 0) partFeatures[index] = cloneDomain(authored);
    else partFeatures.push(cloneDomain(authored));
  }
  const actualOverrides = Object.fromEntries(parts.filter((part) => advancedEdits?.partOverrides?.[part.id]).map((part) => [part.id, part]));
  const advancedManufacturing = cabinetAdvancedManufacturing({ ...advancedEdits, partOverrides: actualOverrides });
  const manufacturingLayout = { ...layout, parts: cabinetLayoutParts(parts) };
  const incompleteManufacturing = manufacturingLayout.parts.some((part) => part.manufacturingIncomplete) || parts.some((part) => (part.holes || []).length || (part.cuts3d || []).length || (part.exactOperations || []).length);
  const spec = item.cab;
  const preset = presetById(spec.preset);
  const presetName = preset ? presetLabel(preset) : spec.preset === "blank" ? "Custom layout" : String(spec.preset || "Custom layout");
  const id = item.definitionId && String(item.definitionId).startsWith("cabinet:")
    ? item.definitionId : "cabinet:" + item.id;
  const definition = createDefinition({
    ...cloneDomain(previous),
    id,
    key: previous?.key || "cm_cabinet_" + safeId(item.id).slice(0, 40),
    name: previous?.name || famLabel(spec.fam) + " · " + presetName,
    kind: "cabinet",
    authoringMode: advancedEdits && (Object.keys(advancedEdits.partOverrides || {}).length || (advancedEdits.addedParts || []).length || (advancedEdits.removedPartIds || []).length) ? "hybrid" : "fully-parametric",
    references: mainReferences(),
    parameters: {
      width: createParameter("width", item.w, { label: "Overall width", exposure: "planner", min: STD.minCol, max: 600 }),
      depth: createParameter("depth", item.d, { label: "Overall depth", exposure: "planner", min: 20, max: 120 }),
      height: createParameter("height", item.h, { label: "Overall height", exposure: "planner", min: 30, max: 350 }),
      panelThickness: createParameter("panelThickness", spec.panel, { label: "Side/top/bottom panel", exposure: "technical", min: 0.8, max: 4, fixed: false }),
      shelfThickness: createParameter("shelfThickness", spec.shelf || spec.panel, { label: "Shelf thickness", exposure: "technical", min: 0.8, max: 4 }),
      backThickness: createParameter("backThickness", spec.back, { label: "Back thickness", exposure: "technical", min: 0, max: 3 }),
      plinthHeight: createParameter("plinthHeight", spec.plinth, { label: "Plinth height", exposure: "technical", min: 0, max: 30 }),
      frontGap: createParameter("frontGap", spec.gap, { label: "Front clearance", exposure: "technical", min: 0, max: 2 }),
    },
    sketches,
    features: partFeatures,
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
      ...cloneDomain(previous?.metadata),
      authoringSystem: "parametric-v1", adapter: "cabinet", source: "cabinet-designer", cabSpec: cloneDomain(spec), advancedEdits,
      interactions: interactions(layout), bom: cutList(item, manufacturingLayout), hardware: hardwareList(item, manufacturingLayout),
      quote: cabQuote(item, manufacturingLayout), price: cabPrice(item, manufacturingLayout), manufacturingReviewRequired:!!advancedEdits?.requiresManufacturingReview || !advancedManufacturing.complete || incompleteManufacturing,
      advancedManufacturing,
    },
    revision: (previous?.revision || 0) + 1,
  });
  if (advancedEdits?.history) definition.history = cloneDomain(advancedEdits.history);
  definition.w = item.w; definition.d = item.d; definition.h = item.h;
  definition.price = definition.metadata.price;
  definition.metadata.generatedParameters = Object.fromEntries(Object.entries(definition.parameters).map(([key, parameter]) => [key, parameter.value]));
  return { ...cloneDomain(previous), ...definition };
}


// Resolve the semantic rule before the ordinary CAD feature graph is evaluated.
// This returns a new document: invalid requests never partially mutate a model.
export function materializeCabinetDefinition(definition, parameters) {
  if (definition?.metadata?.adapter !== "cabinet" || !definition.metadata.cabSpec) return definition;
  const spec = definition.metadata.cabSpec;
  const baseline = definition.metadata.generatedParameters || {
    width: spec.dim?.w || definition.w, depth: spec.dim?.d || definition.d, height: spec.dim?.h || definition.h,
    panelThickness: spec.panel, shelfThickness: spec.shelf || spec.panel, backThickness: spec.back,
    plinthHeight: spec.plinth, frontGap: spec.gap,
  };
  if (Object.keys(baseline).every((key) => parameters[key] == null || Math.abs(parameters[key] - baseline[key]) < 1e-8)) return definition;
  if (Object.keys(baseline).some((key) => parameters[key] != null && !Number.isFinite(parameters[key]))) return definition;
  const oldItem = { id: definition.id, definitionId: definition.id, type: "cabsys", w: baseline.width, d: baseline.depth, h: baseline.height, cab: cloneDomain(spec) };
  const source = cloneDomain(definition);
  source.metadata.advancedEdits = captureCabinetAdvancedEdits(source, oldItem);
  const item = { ...oldItem, w: parameters.width, d: parameters.depth, h: parameters.height, cab: cloneDomain(spec) };
  const fields = { panelThickness: "panel", shelfThickness: "shelf", backThickness: "back", plinthHeight: "plinth", frontGap: "gap" };
  for (const [parameter, field] of Object.entries(fields)) if (parameters[parameter] != null) item.cab[field] = parameters[parameter];
  item.cab.auto = false;
  normalizeSpec(item.cab, item.w, item.h, item.d);
  const rebuilt = cabinetDefinitionFromItem(item, source);
  // Preserve user parameter expressions and the identity of the document.
  rebuilt.parameters = cloneDomain(definition.parameters);
  rebuilt.metadata.generatedParameters = { ...baseline, ...parameters };
  rebuilt.revision = definition.revision;
  rebuilt.metadata.parameterIssues = checkCab(item).filter((issue) => issue.level === "err").map((issue) => ({ severity: "error", code: "cabinet-construction", message: issue.msg }));
  return { ...cloneDomain(definition), ...rebuilt, history: cloneDomain(definition.history) };
}
