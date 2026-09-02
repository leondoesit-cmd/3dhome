// One tree, two document shapes.
//
// The editor always had a feature tree — it had two of them. Canonical
// parametric-v1 documents got a history tree (numbered steps, rollback,
// dependency highlighting); everything else got a flat parts list with a
// different set of affordances, and a separate BREP list stacked underneath.
// Which one you saw was decided by isCanonicalAuthoring(), a flag that also
// picks the rebuild engine — so the two trees could not be merged by migrating
// documents on load without changing what those documents build.
//
// This module goes the other way: both shapes are *read* into one normalised
// node model and a single renderer draws it. Nothing here mutates a document,
// nothing here touches the DOM, and the mode a document is in is reported
// rather than changed.

import { featureSpec } from "./feature_catalog.js";

export const CANONICAL = "canonical";
export const LEGACY = "legacy";

/* Feature types that leave a solid behind. Used to predict the body set when a
   rebuild has not published a real one yet — sketches, curves and cosmetic
   annotations are not bodies however they are ordered. */
const SOLID_FEATURES = new Set([
  "box", "cylinder", "sphere", "cone", "extrude", "revolve", "sweep", "loft",
  "import", "insert", "assembly", "union", "subtract", "intersect", "boolean",
  "fillet", "chamfer", "shell", "mirror", "pattern", "linearPattern",
  "linearGridPattern", "circularPattern", "hole", "thread", "extrudeCut",
  "cut", "direct", "procedural", "component", "toolbox",
]);

/* Types that only decorate an existing solid. They never start a body, so a
   trailing knurl must not be reported as one. */
const ANNOTATION_FEATURES = new Set(["knurl", "helix", "sketch"]);

const REFERENCE_ICON = {
  plane: "refplane",
  axis: "refaxis",
  origin: "coordsys",
  reference_plane: "refplane",
  reference_axis: "refaxis",
  reference_helix: "helixfeature",
  helix: "helixfeature",
  coordinate_system: "coordsys",
};

export function referenceId(reference) {
  if (!reference) return null;
  if (typeof reference === "string") return reference;
  return reference.id || reference.persistentId || null;
}

/* Every sketch a feature consumes. `references.sketches` is the canonical
   field; `params.sketchId` is what migrated and hand-built features carry, and
   a document can have either or both. */
export function sketchReferenceIds(feature) {
  const ids = [];
  const push = (value) => {
    const id = referenceId(value);
    if (id && !ids.includes(id)) ids.push(id);
  };
  (feature?.references?.sketches || []).forEach(push);
  push(feature?.params?.sketchId);
  return ids;
}

/* Features in the order the document builds them: history order first, then
   any feature the history does not mention (an older file, or one written by a
   command that forgot to record a step). */
export function historyFeatureOrder(def) {
  const features = new Map((def?.features || []).map((feature) => [feature.id, feature]));
  const out = [];
  const seen = new Set();
  (def?.history || []).forEach((entry) => {
    if (entry.kind !== "feature") return;
    const feature = features.get(entry.targetId);
    if (feature && !seen.has(feature.id)) { seen.add(feature.id); out.push(feature); }
  });
  (def?.features || []).forEach((feature) => {
    if (!seen.has(feature.id)) { seen.add(feature.id); out.push(feature); }
  });
  return out;
}

/* Who owns a sketch in the tree.
   A feature consumes a *region* of a sketch, not the whole sketch — extrude and
   revolve both carry profileEntityIds alongside the sketch id — so one sketch
   legitimately feeds several features. Nesting it under every consumer would
   show the same sketch three times; nesting it under an arbitrary one would
   hide the sharing. The rule is SolidWorks': the first consumer in build order
   owns it, and a sketch with more than one consumer stays a top-level node so
   the sharing is visible instead of implied. */
export function sketchOwnership(def) {
  const owners = new Map();
  historyFeatureOrder(def).forEach((feature) => {
    sketchReferenceIds(feature).forEach((sketchId) => {
      let entry = owners.get(sketchId);
      if (!entry) {
        entry = { sketchId, ownerId: feature.id, consumers: [], shared: false };
        owners.set(sketchId, entry);
      }
      if (!entry.consumers.includes(feature.id)) entry.consumers.push(feature.id);
    });
  });
  owners.forEach((entry) => { entry.shared = entry.consumers.length > 1; });
  return owners;
}

/* The bodies a document would leave standing, derived from the feature graph
   alone. This is a fallback: when a rebuild has published a real body set that
   is used instead. A body is a solid-producing feature that no later feature
   consumes — the same rule the kernel's "last shape wins" reduction implies,
   generalised to more than one survivor. */
export function predictedBodies(def) {
  /* A canonical document rolls back by history index, the way a legacy one
     rolls back by part index below. A step at or past the bar is not standing,
     so it is not a body — predicting it listed bodies the rolled-back model
     does not have, and offered the eye and the rename on them. */
  const rolledOut = new Set();
  if (Number.isFinite(def?.rollbackIndex))
    (def.history || []).forEach((entry, index) => {
      if (index >= def.rollbackIndex && entry?.targetId) rolledOut.add(entry.targetId);
    });
  const order = historyFeatureOrder(def).filter((feature) =>
    !feature.suppressed && !rolledOut.has(feature.id)
    && SOLID_FEATURES.has(feature.type) && !ANNOTATION_FEATURES.has(feature.type));
  if (order.length) {
    const consumed = new Set();
    order.forEach((feature) => (feature.inputs || []).forEach((id) => consumed.add(id)));
    return order
      .filter((feature) => !consumed.has(feature.id))
      .map((feature, index) => ({
        id: "body:" + feature.id,
        featureId: feature.id,
        name: feature.name || feature.type,
        index,
        predicted: true,
      }));
  }
  // A legacy document has no feature graph to reduce: its parts are already
  // separate solids that the renderer merges, and a rolled-back or suppressed
  // one is not standing.
  const rollback = Number.isFinite(def?.rollback) ? def.rollback : (def?.parts || []).length;
  return (def?.parts || [])
    .slice(0, Math.max(0, rollback))
    .filter((part) => part && !part.suppressed)
    .map((part, index) => ({
      id: "body:" + (part.id || index),
      featureId: part.id || null,
      name: part.name || part.kind || "Body",
      index,
      predicted: true,
    }));
}

/* Which document shape this is. Reported, never imposed: the caller passes the
   authoringSystem it already resolved so the tree and the rebuild engine can
   never disagree about what a document is. */
export function treeMode(def, authoringSystem) {
  if (authoringSystem) return authoringSystem === "parametric-v1" ? CANONICAL : LEGACY;
  return def?.metadata?.authoringSystem === "parametric-v1" ? CANONICAL : LEGACY;
}

function node(fields) {
  return {
    id: fields.id,
    kind: fields.kind,
    targetId: fields.targetId || null,
    historyId: fields.historyId || null,
    index: Number.isInteger(fields.index) ? fields.index : null,
    name: fields.name || "",
    detail: fields.detail || "",
    technicalDetail: fields.technicalDetail || "",
    icon: fields.icon || "",
    state: fields.state || "",
    suppressed: !!fields.suppressed,
    rolled: !!fields.rolled,
    error: fields.error || null,
    selected: !!fields.selected,
    collapsed: !!fields.collapsed,
    shared: !!fields.shared,
    can: {
      rename: false, suppress: false, rollback: false, remove: false,
      reorder: false, edit: false, select: false, ...(fields.can || {}),
    },
    children: fields.children || [],
    swatch: fields.swatch || null,
  };
}

/* Documents imported from older versions often use storage keys as visible
   names. Keep those keys available as a tooltip, but do not make someone parse
   feature_mte… or a duplicated numeric suffix to understand the tree. */
export function friendlyTreeName(value, fallback = "Item") {
  let name = String(value || "").trim();
  if (!name) return fallback;
  if (/^(?:feature|sketch|part|ref)[_:-][a-z0-9_.:-]+$/i.test(name)) return fallback;
  name = name.replace(/^(.*\b(\d+))\s+\2$/, "$1");
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function collapsedFor(state, id, fallback = false) {
  if (!state) return fallback;
  return Object.prototype.hasOwnProperty.call(state, id) ? !!state[id] : fallback;
}

function referenceNodes(def, options) {
  const collapsed = options.collapsed;
  const rows = [];
  const seen = new Set();
  const push = (reference) => {
    const id = referenceId(reference);
    if (!id || seen.has(id)) return;
    seen.add(id);
    rows.push(node({
      id: "ref:" + id,
      kind: "reference",
      targetId: id,
      name: reference.name || reference.type || id,
      detail: reference.type || "",
      icon: REFERENCE_ICON[reference.type] || "coordsys",
      selected: options.selectedReferenceId === id,
      can: { select: true, rename: true, edit: reference.type === "plane" },
    }));
  };
  (def?.references || []).forEach(push);
  (def?.referenceGeometry || []).forEach(push);
  if (!rows.length) return null;
  return node({
    id: "section:references",
    kind: "section",
    name: options.labels?.references || "Reference geometry",
    icon: "refplane",
    detail: String(rows.length),
    collapsed: collapsedFor(collapsed, "section:references", true),
    children: rows,
  });
}

function bodyNodes(def, options) {
  const source = Array.isArray(options.bodies) && options.bodies.length
    ? options.bodies
    : predictedBodies(def);
  if (!source.length) return null;
  // The published and predicted body sets both already carry a "body:" id.
  // Prefixing again produced "body:body:f1" here while the hidden-set and the
  // draw filter both spoke "body:f1", so hiding a body silently did nothing.
  const rows = source.map((body, index) => node({
    id: body.id || ("body:" + (body.featureId || index)),
    kind: "body",
    targetId: body.featureId || body.id || null,
    name: body.name || "Body " + (index + 1),
    detail: body.predicted ? (options.labels?.derivedBody || "derived") : "",
    icon: "directbox",
    suppressed: options.hiddenBodies?.includes(body.id),
    selected: options.selectedBodyId === body.id,
    can: { select: true, rename: !body.predicted, suppress: true },
  }));
  return node({
    id: "section:bodies",
    kind: "section",
    name: (options.labels?.bodies || "Solid Bodies") + "(" + rows.length + ")",
    icon: "directbox",
    collapsed: collapsedFor(options.collapsed, "section:bodies", true),
    children: rows,
  });
}

function metadataNodes(def, options) {
  const rows = [];
  const material = def?.material || def?.metadata?.material || options.material;
  rows.push(node({
    id: "meta:material",
    kind: "material",
    name: typeof material === "string" ? material : material?.name || (options.labels?.noMaterial || "Material <not specified>"),
    icon: "appearance",
    can: { select: true, edit: true },
  }));
  const parameters = def?.parameters || {};
  const names = Object.keys(parameters);
  if (names.length) {
    rows.push(node({
      id: "meta:equations",
      kind: "equations",
      name: (options.labels?.equations || "Equations") + " (" + names.length + ")",
      icon: "smartdim",
      collapsed: collapsedFor(options.collapsed, "meta:equations", true),
      can: { select: true, edit: true },
      children: names.map((name) => node({
        id: "meta:equation:" + name,
        kind: "equation",
        targetId: name,
        name,
        detail: String(parameters[name]?.expression ?? parameters[name]?.value ?? parameters[name] ?? ""),
        icon: "smartdim",
        can: { select: true, edit: true },
      })),
    }));
  }
  return node({
    id: "section:metadata",
    kind: "section",
    name: options.labels?.metadata || "Document",
    icon: "components",
    collapsed: collapsedFor(options.collapsed, "section:metadata", true),
    children: rows,
  });
}

function sketchDetail(sketch, def) {
  if (!sketch) return "";
  const where = sketch.referenceId || sketch.support?.semantic || sketch.support?.persistentId || sketch.plane || "";
  const status = sketch.status || "";
  const reference = (def?.references || []).concat(def?.referenceGeometry || [])
    .find((item) => referenceId(item) === where);
  let location = reference?.name || reference?.type || where;
  if (/^plane:/i.test(location)) location = location.slice(6) + " plane";
  else if (sketch.support?.persistentId && location === sketch.support.persistentId)
    location = sketch.support.semantic || "Attached face";
  location = friendlyTreeName(location, "Reference");
  const state = status ? String(status).replace(/[-_]+/g, " ") : "";
  return [location, state].filter(Boolean).join(" · ");
}

function sketchNode(sketch, options, extra = {}) {
  return node({
    id: "sketch:" + sketch.id,
    kind: "sketch",
    targetId: sketch.id,
    historyId: extra.historyId || null,
    index: Number.isInteger(extra.index) ? extra.index : null,
    name: friendlyTreeName(sketch.name, "Sketch"),
    detail: extra.detail || sketchDetail(sketch, options.definition),
    technicalDetail: [sketch.id, sketch.support?.persistentId || sketch.referenceId].filter(Boolean).join(" · "),
    icon: "newsketch",
    state: extra.state || "",
    error: extra.error || sketch.diagnostics?.[0]?.message || null,
    suppressed: !!extra.suppressed,
    rolled: !!extra.rolled,
    shared: !!extra.shared,
    selected: (options.selection?.sketches || []).includes(sketch.id),
    can: {
      select: true, rename: true, edit: true,
      suppress: !!extra.historyId, rollback: !!extra.historyId,
      remove: true, reorder: !!extra.historyId,
    },
  });
}

/* ---- canonical adapter: def.history is the tree ---- */
function canonicalHistory(def, options) {
  const sketches = new Map((def?.sketches || []).map((sketch) => [sketch.id, sketch]));
  const features = new Map((def?.features || []).map((feature) => [feature.id, feature]));
  const ownership = sketchOwnership(def);
  const history = def?.history || [];
  const rollbackAt = Number.isInteger(options.rollbackIndex) ? options.rollbackIndex : history.length;
  const status = options.status instanceof Map ? options.status : new Map();
  const nested = new Set();

  // A sketch owned by exactly one feature is drawn inside it, so pass over its
  // own history row. A shared sketch keeps its row — that is the whole point of
  // the ownership rule.
  ownership.forEach((entry) => { if (!entry.shared) nested.add(entry.sketchId); });

  const rows = [];
  history.forEach((entry, index) => {
    const rolled = index >= rollbackAt;
    if (entry.kind === "sketch") {
      if (nested.has(entry.targetId)) return;
      const sketch = sketches.get(entry.targetId);
      if (!sketch) return;
      rows.push(sketchNode(sketch, options, {
        historyId: entry.id, index, rolled, suppressed: entry.suppressed,
        state: status.get(entry.targetId) || entry.status || "",
        shared: !!ownership.get(entry.targetId)?.shared,
        detail: ownership.get(entry.targetId)?.shared
          ? sketchDetail(sketch, def) + " · " + (options.labels?.sharedSketch || "shared by") + " " + ownership.get(entry.targetId).consumers.length
          : sketchDetail(sketch, def),
      }));
      return;
    }
    const feature = features.get(entry.targetId);
    if (!feature) return;
    const spec = featureSpec(feature.type);
    const children = sketchReferenceIds(feature)
      .filter((id) => nested.has(id) && ownership.get(id)?.ownerId === feature.id)
      .map((id) => sketches.get(id))
      .filter(Boolean)
      .map((sketch) => sketchNode(sketch, { ...options, definition: def }, { rolled, detail: sketchDetail(sketch, def) }));
    rows.push(node({
      id: "feature:" + feature.id,
      kind: "feature",
      targetId: feature.id,
      historyId: entry.id,
      index,
      name: friendlyTreeName(feature.name || entry.name, spec?.label || friendlyTreeName(feature.type, "Feature")),
      detail: spec?.label || feature.type,
      technicalDetail: feature.id,
      icon: feature.type,
      state: status.get(feature.id) || entry.status || "",
      suppressed: !!entry.suppressed,
      rolled,
      error: feature.error || feature.diagnostics?.[0]?.message || null,
      selected: (options.selection?.features || []).includes(feature.id),
      collapsed: collapsedFor(options.collapsed, "feature:" + feature.id, false),
      can: { select: true, rename: true, edit: !!spec, suppress: true, rollback: true, remove: true, reorder: true },
      children,
    }));
  });
  return { rows, rollbackAt: Math.min(rollbackAt, rows.length) === rollbackAt ? rollbackAt : rows.length };
}

/* ---- legacy adapter: def.parts is the tree ---- */
function legacyHistory(def, options) {
  const parts = def?.parts || [];
  const rollback = Number.isFinite(def?.rollback)
    ? Math.max(0, Math.min(def.rollback, parts.length))
    : parts.length;
  const rows = parts.map((part, index) => {
    const operations = (part.exactOperations || []).map((operation, opIndex) => node({
      id: "op:" + (part.id || index) + ":" + (operation.id || opIndex),
      kind: "operation",
      targetId: operation.id || null,
      name: operation.name || operation.type,
      detail: operation.amount != null ? String(operation.amount) : "",
      icon: operation.type,
      suppressed: !!operation.suppressed,
      can: { select: true, suppress: true },
    }));
    return node({
      id: "part:" + (part.id || index),
      kind: "feature",
      targetId: part.id || null,
      index,
      name: part.name || part.kind || "Feature",
      detail: part.sketchDriven ? (options.labels?.sketchDriven || "sketch driven") : part.kind || "",
      icon: part.profileError ? "ph-warning" : part.sketchDriven ? "mates" : part.kind || "extrude",
      error: part.profileError ? (options.labels?.profileBroken || "Profile is broken") : null,
      suppressed: !!part.suppressed,
      rolled: index >= rollback,
      selected: options.selectedPartId != null && part.id === options.selectedPartId,
      collapsed: collapsedFor(options.collapsed, "part:" + (part.id || index), false),
      swatch: /^#[0-9a-f]{6}$/i.test(part.color || "") ? part.color : null,
      can: { select: true, rename: true, edit: true, suppress: true, rollback: true, remove: true, reorder: true },
      children: operations,
    });
  });
  return { rows, rollbackAt: rollback };
}

/* Legacy documents keep their sketches in a list of their own — nothing ties a
   legacy part back to the sketch it came from, so there is no ownership to
   resolve and no nesting to do. */
function legacySketchSection(def, options) {
  const sketches = def?.sketches || (def?.sketch ? [def.sketch] : []);
  const meaningful = sketches.filter((sketch) => sketch && (sketch.entities?.length || sketch.support));
  if (!meaningful.length) return null;
  return node({
    id: "section:sketches",
    kind: "section",
    name: options.labels?.sketches || "Sketches",
    icon: "newsketch",
    detail: String(meaningful.length),
    collapsed: collapsedFor(options.collapsed, "section:sketches", false),
    children: meaningful.map((sketch) => sketchNode(sketch, options)),
  });
}

/* Build the whole tree for a document.

   options:
     authoringSystem  the flag the editor already resolved (never derived here)
     rollbackIndex    canonical rollback position; undefined means "at the end"
     status           Map targetId -> "rebuilt"|"failed"|"warning"|"suppressed"
     bodies           real body set from a rebuild; predicted when absent
     selection        { features: [], sketches: [] }
     collapsed        { nodeId: true } collapse state
     folders          [{ id, name, memberIds: [], }]
     labels           translated strings for the section headers                */
export function buildTreeModel(def, options = {}) {
  const mode = treeMode(def, options.authoringSystem);
  const sections = [];
  const metadata = metadataNodes(def, options);
  if (metadata) sections.push(metadata);
  const references = referenceNodes(def, options);
  if (references) sections.push(references);
  const bodies = bodyNodes(def, options);
  if (bodies) sections.push(bodies);
  if (mode === LEGACY) {
    const sketchSection = legacySketchSection(def, options);
    if (sketchSection) sections.push(sketchSection);
  }
  const { rows, rollbackAt } = mode === CANONICAL ? canonicalHistory(def, options) : legacyHistory(def, options);
  const grouped = applyFolders(rows, options.folders, options.collapsed, options.labels);
  // The header counts every step, nested sketches included — otherwise it
  // contradicts the rebuild summary sitting directly above it, which counts the
  // history entries rather than the rows they were drawn as.
  let steps = 0;
  const countSteps = (list) => (list || []).forEach((item) => {
    if (item.kind === "feature" || item.kind === "sketch") steps += 1;
    countSteps(item.children);
  });
  countSteps(rows);
  sections.push(node({
    id: "section:history",
    kind: "section",
    name: options.labels?.history || "Design history",
    icon: "rollbackhere",
    detail: String(steps),
    collapsed: collapsedFor(options.collapsed, "section:history", false),
    children: grouped,
  }));
  return { mode, nodes: sections, rollbackAt, historyCount: rows.length };
}

/* Folders are a presentation grouping over history rows. A folder appears at
   the position of its earliest member and never reorders the build — a folder
   that spanned a gap would imply its members are contiguous when they are not,
   so members outside the run stay where they are and the folder reports how
   many it actually gathered. */
export function applyFolders(rows, folders, collapsed, labels) {
  if (!Array.isArray(folders) || !folders.length) return rows;
  const byTarget = new Map();
  rows.forEach((row) => { if (row.targetId) byTarget.set(row.targetId, row); });
  const claimed = new Set();
  const anchors = new Map();
  folders.forEach((folder) => {
    const members = (folder.memberIds || [])
      .map((id) => byTarget.get(id))
      .filter((row) => row && !claimed.has(row.id));
    if (!members.length) return;
    members.forEach((row) => claimed.add(row.id));
    const anchor = members.reduce((best, row) => (best == null || row.index < best ? row.index : best), null);
    anchors.set(folder.id, {
      anchor,
      node: node({
        id: "folder:" + folder.id,
        kind: "folder",
        targetId: folder.id,
        name: folder.name || labels?.folder || "Folder",
        detail: String(members.length),
        icon: "components",
        collapsed: collapsedFor(collapsed, "folder:" + folder.id, true),
        can: { select: true, rename: true, remove: true },
        children: members,
      }),
    });
  });
  const out = [];
  rows.forEach((row) => {
    if (claimed.has(row.id)) {
      const hit = [...anchors.values()].find((entry) => entry.anchor === row.index && entry.node.children.includes(row));
      if (hit && !out.includes(hit.node)) out.push(hit.node);
      return;
    }
    out.push(row);
  });
  return out;
}

/* Depth-first order of everything currently visible — what arrow-key
   navigation walks, and what a renderer iterates to draw rows. */
export function flattenTree(nodes, depth = 0, out = []) {
  (nodes || []).forEach((item) => {
    out.push({ node: item, depth });
    if (!item.collapsed) flattenTree(item.children, depth + 1, out);
  });
  return out;
}

export function findTreeNode(nodes, id) {
  for (const item of nodes || []) {
    if (item.id === id) return item;
    const hit = findTreeNode(item.children, id);
    if (hit) return hit;
  }
  return null;
}
