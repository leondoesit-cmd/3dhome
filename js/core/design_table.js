import { applyConfigurationSuppression } from "../cad_configurations.js";
import { formatDocumentLength, documentLengthUnit } from "./document_length_units.js";
import { parseLength } from "../planning_units.js";
import { dependentTargetIds } from "./parametric_document.js";
import { detachDrivenSketchDimension } from "./cone_silhouette.js";
import { resolveEquations } from "../sketch_equations.js";
import { isHoleWizardSketch } from "./hole_wizard_sketches.js";
import { solveSketch, sketchEntitySizes, collapsedEntityIds } from "../sketch_solver.js";

const byId = (list, id) => list?.find(item => item.id === id);
const keyFor = (...parts) => JSON.stringify(parts);

export function designTableColumns(doc) {
  if (doc.metadata?.authoringSystem !== "parametric-v1" || doc.designTable?.kind === "circular-sweep") return [];
  const columns = [];
  for (const feature of doc.features || []) {
    if (!doc.history?.some(e => e.kind === "feature" && e.targetId === feature.id)) continue;
    const name = feature.name || feature.id;
    const field = ["extrude", "extrudeCut"].includes(feature.type) ? "depth"
      : ["revolve", "revolveCut"].includes(feature.type) ? "angle" : null;
    if (field) columns.push({key:keyFor("feature", feature.id, field), id:feature.id, field,
      label:(field === "depth" ? "Depth" : "Angle") + "@" + name, kind:"feature"});
    columns.push({key:keyFor("suppress", feature.id), id:feature.id, label:"Suppress@" + name, kind:"suppress"});
  }
  for (const sketch of doc.sketches || []) {
    for (const c of sketch.constraints || []) {
      if (c.id == null || c.value == null) continue;
      columns.push({key:keyFor("sketch", sketch.id, c.id), id:sketch.id, constraintId:c.id, field:c.type,
        label:(c.name || c.type + " " + c.id) + "@" + (sketch.name || sketch.id), kind:"sketch"});
    }
  }
  return columns;
}

function sketchIssue(sketch, c) {
  if (!c || !Number.isFinite(c.value)) return "Missing dimension";
  if (isHoleWizardSketch(sketch) || sketch.sheetHingeThickness != null) return "Feature-generated sketch";
  if (c.expr || c.parameter || c.driven || c.suppressed || sketch.suppressed) return "Driven, linked or suppressed";
  const point = id => byId(sketch.points, id);
  const entity = byId(sketch.entities, c.entity);
  const line = e => e?.type === "line" && point(e.a) && point(e.b);
  if (["radius", "diameter"].includes(c.type) && entity &&
      (entity.type === "circle" && point(entity.c) || entity.type === "arc" && point(entity.c) && point(entity.a) && point(entity.b) ||
       entity.type === "ellipse" && point(entity.c))) return null;
  if (c.type === "distance" && !c.patternTranslation &&
      (c.entity != null ? line(entity) : point(c.a) && point(c.b))) return null;
  if (c.type === "angle" && (line(entity) || line(byId(sketch.entities, c.a)) && line(byId(sketch.entities, c.b)))) return null;
  return "Unsupported sketch dimension";
}

export function designTableCell(values, suppressed, column, unit) {
  if (column.kind === "suppress") return {value:(suppressed || []).includes(column.id) ? "Suppress" : "Allow"};
  if (!values) return {reason:"Capture this configuration first"};
  let value;
  if (column.kind === "feature") {
    const params = byId(values.featureParameters, column.id)?.params;
    if (!Number.isFinite(params?.[column.field])) return {reason:"Missing or linked parameter"};
    if (column.field === "depth" && !["blind", "mid-plane"].includes(params.endCondition || "blind")) return {reason:"Depth set by end condition"};
    value = params[column.field];
  } else {
    const sketch = byId(values.sketches, column.id);
    const c = byId(sketch?.constraints, column.constraintId);
    const reason = sketchIssue(sketch, c);
    if (reason || c.type !== column.field) return {reason:reason || "Dimension type changed"};
    value = c.value;
  }
  return {value:column.field === "angle" ? String(value) : formatDocumentLength(value, unit)};
}

function dimensionValue(column, text, unit) {
  if (column.field === "angle") {
    const match = String(text).trim().match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*(?:°|deg)?$/i);
    const value = match ? Number(match[1]) : NaN;
    if (!Number.isFinite(value) || (column.kind === "feature" && (value < 1e-6 || value > 360))) throw new Error("Enter degrees" + (column.kind === "feature" ? " from 0.000001 through 360" : ""));
    return value;
  }
  const value = parseLength(text, unit);
  if (!Number.isFinite(value) || value <= 0 || (column.field === "depth" && value < 1e-6)) throw new Error("Enter a positive length in " + unit + " or with a length suffix");
  return value;
}

// Stage only authored data. A failed cell or sketch solve must never leave
// half of an edited row applied, nor add an undo entry.
function stageRow(doc, values, suppression, edits, unit, sketchRoots = []) {
  const changedSketches = new Set();
  const updatedSketches = new Set();
  const ids = new Set(suppression || []);
  for (const {column, text} of edits) {
    const cell = designTableCell(values, [...ids], column, unit);
    if (cell.reason) throw new Error(column.label + " — " + cell.reason);
    if (column.kind === "suppress") {
      if (text === "Suppress") ids.add(column.id);
      else if (text === "Allow") ids.delete(column.id);
      else throw new Error("Choose Allow or Suppress for " + column.label);
      continue;
    }
    let value;
    try { value = dimensionValue(column, text, unit); }
    catch (error) { throw new Error(column.label + " — " + error.message); }
    if (column.kind === "feature") byId(values.featureParameters, column.id).params[column.field] = value;
    else {
      const sketch = byId(values.sketches, column.id);
      const constraint = byId(sketch.constraints, column.constraintId);
      constraint.value = value;
      detachDrivenSketchDimension(sketch, constraint);
      changedSketches.add(sketch);
    }
  }
  if (changedSketches.size || (values?.sketches && edits.some(({column,text}) => column.kind === "suppress" && text === "Allow"))) {
    const params = new Map(values.featureParameters?.map(f => [f.id,f.params]));
    const sketches = new Map(values.sketches.map(s => [s.id,s]));
    const rowDocument = {...doc, sketches:doc.sketches.map(s => sketches.get(s.id) || s),
      features:doc.features.map(f => params.has(f.id) ? {...f,params:params.get(f.id)} : f)};
    const roots = [...ids, ...sketchRoots];
    const suppressed = new Set([...roots, ...dependentTargetIds(rowDocument, roots)]);
    // Expressions can read named dimensions in other sketches. Resolve the
    // complete row before solving any of its changed geometry.
    const expressions = values.sketches.flatMap(sketch => (sketch.constraints || [])
      .filter(c => c.expr).map(c => ({sketch, c, before:c.value})));
    const {errors} = resolveEquations({sketches:values.sketches, variables:structuredClone(doc.variables || [])}, suppressed);
    if (errors.length) throw new Error(errors[0].name + " — " + errors[0].message);
    for (const {sketch, c, before} of expressions) {
      if (before === c.value) continue;
      updatedSketches.add(sketch);
      if (!c.suppressed && !c.driven) changedSketches.add(sketch);
    }
    for (const sketch of changedSketches) {
      updatedSketches.add(sketch);
      if (suppressed.has(sketch.id)) continue;
      const sizes = sketchEntitySizes(sketch);
      if (!solveSketch(sketch).converged || collapsedEntityIds(sketch, sizes).length) throw new Error("Cannot solve " + (sketch.name || sketch.id) + " with these dimensions");
    }
  }
  return {ids:[...ids], updatedSketches};
}

// Include uncaptured tree toggles in the live update only. A dependent that
// was already off because of its saved parent must still follow that parent.
function liveSuppressionRoots(doc, saved) {
  const expected = new Set([...saved, ...dependentTargetIds(doc, saved)]);
  const explicit = new Set(saved);
  const automatic = new Set(doc.history.filter(e => e.autoSuppressedBy).map(e => e.targetId));
  const features = (doc.features || []).filter(f => f.suppressed &&
    (explicit.has(f.id) || !expected.has(f.id) && !automatic.has(f.id)));
  return [...features, ...(doc.sketches || []).filter(s => s.suppressed && !automatic.has(s.id))].map(target => target.id);
}

export function prepareDesignTable(doc, edits) {
  const columns = new Map(designTableColumns(doc).map(c => [c.key, c]));
  const unit = documentLengthUnit(doc.context?.units?.length);
  const rows = new Map();
  for (const edit of edits) {
    const cfg = byId(doc.configurations, edit.rowId), column = columns.get(edit.key);
    if (!cfg || !column) throw new Error("Configuration or dimension is unavailable");
    if (!rows.has(cfg)) rows.set(cfg, []);
    rows.get(cfg).push({column, text:edit.text});
  }
  const commits = [];
  for (const [cfg, changes] of rows) {
    try {
      const values = structuredClone(cfg.modelValues);
      const savedSketchRoots = (values?.sketches || []).filter(s => s.suppressed).map(s => s.id);
      const {ids} = stageRow(doc, values, cfg.suppressedFeatureIds, changes, unit, savedSketchRoots);
      commits.push(() => {
        if (values) cfg.modelValues = values;
        cfg.suppressedFeatureIds = ids;
      });
      if (doc.activeConfiguration !== cfg.id) continue;
      // Apply the same cells to live geometry without restoring unrelated
      // properties, materials or sketch edits from an older snapshot.
      const live = {sketches:structuredClone(doc.sketches || []), featureParameters:structuredClone(
        (doc.features || []).map(f => ({id:f.id, params:f.params})))};
      const editsSuppression = changes.some(({column}) => column.kind === "suppress");
      const roots = liveSuppressionRoots(doc, [...(cfg.suppressedFeatureIds || []), ...savedSketchRoots]);
      const liveRow = stageRow(doc, live, roots, changes, unit);
      commits.push(() => {
        for (const sketch of liveRow.updatedSketches) doc.sketches[doc.sketches.findIndex(s => s.id === sketch.id)] = sketch;
        for (const {column} of changes) {
          if (column.kind === "feature") byId(doc.features, column.id).params[column.field] = byId(live.featureParameters, column.id).params[column.field];
        }
        if (editsSuppression) applyConfigurationSuppression(doc, liveRow.ids);
      });
    } catch (error) { throw new Error(cfg.name + " — " + error.message); }
  }
  return {activeChanged:[...rows.keys()].some(cfg => cfg.id === doc.activeConfiguration), commit() { for (const apply of commits) apply(); }};
}
