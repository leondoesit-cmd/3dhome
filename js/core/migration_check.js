import { revolveRecipe, revolveBounds } from "./revolve_geometry.js";
// Can this legacy document become a canonical one — and did it survive?
//
// Converting a legacy document to parametric-v1 is not a display change:
// isCanonicalAuthoring() also picks the rebuild engine, so a conversion swaps
// the kernel under a model the user already trusts. The failure mode is quiet —
// a fillet resolving against a different edge leaves a part that still looks
// like a part — so keeping the original as a backup is not enough on its own.
// A backup you never learn to open is not a safety net.
//
// So conversion is gated twice, and only ever offered, never applied on load:
//
//   coverage  every converted feature must be one the editor can actually
//             open. A tree full of rows whose editor will not launch is worse
//             than the legacy tree, which at least only shows what it can do.
//   geometry  both engines run on a snapshot and their results are compared.
//             A mismatch leaves the document legacy.
//
// The coverage check used to be the one that bit: the canonical catalogue had
// no primitive features at all, so a legacy document built from boxes,
// cylinders and spheres — which is most of them — had nowhere to go and was
// refused outright, and two rebuild engines had to be maintained forever.
// FEATURE_CATALOG now carries box/cylinder/cone/sphere, so those documents map
// as straightforwardly as the sketch-driven ones (extrude, revolve, loft), and
// the geometry comparison below is left as the thing that actually decides.

import { featureSpec, isPrimitiveFeatureType } from "./feature_catalog.js";
import { stableStringify } from "./dependency_graph.js";
import { cloneDomain, domainId, mainReferences } from "./schema.js";
import { normalizeHistory } from "./parametric_document.js";

export const MIGRATION_EQUIVALENCE_VERSION = 3;

/* Legacy part kind -> canonical feature type. A kind that is absent here has no
   canonical equivalent and blocks the whole document.

   Mapping a kind is necessary, not sufficient. The verdict still comes from the
   two engines: the legacy one builds from the `features` list the editor
   projects out of the render parts (rebuildFeatureTreeFromDocument, in
   js/modeler.js). That projection long had no sphere case and no
   tapered-cylinder case, so a document containing either measured differently
   on the two sides and was refused with nothing actually wrong with it. Both
   branches now exist, and the comparison is back to catching real drift. */
export const PART_KIND_FEATURES = Object.freeze({
  box: "box",
  cyl: "cylinder",
  sph: "sphere",
  ext: "extrude",
  rev: "revolve",
  loft: "loft",
});

/* Legacy part kinds we know about but deliberately refuse. Naming them lets the
   report say *why* rather than "unknown kind". */
export const UNCONVERTIBLE_PART_KINDS = Object.freeze({
  direct: "Direct-modelled geometry has no feature history to rebuild from",
  mesh: "An imported mesh has no exact profile to rebuild from",
});

/* Which canonical feature a legacy part becomes.
   Only one kind is ambiguous: a legacy "cyl" carries an optional second radius,
   and a cylinder with two different radii is a frustum. Calling that a cylinder
   would convert a tapered leg into a straight one and the geometry comparison
   would — correctly — refuse the whole document, so it becomes a cone. */
export function partFeatureType(part) {
  const kind = part?.kind || "";
  if (kind === "cyl" && Number.isFinite(Number(part.r2)) && Math.abs(Number(part.r2) - Number(part.r)) > 1e-9) return "cone";
  return PART_KIND_FEATURES[kind] || null;
}

const number = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);

/* A primitive's parameters, read straight off the legacy part. The names are
   the catalogue's, which are also the ones core/topology.js names faces from
   and the ones js/modeler.js already writes for box and cylinder features. */
export function primitiveFeatureParams(type, part) {
  if (type === "box") {
    const x0 = Math.min(number(part.x0), number(part.x1)), y0 = Math.min(number(part.y0), number(part.y1)), z0 = Math.min(number(part.z0), number(part.z1));
    return { x:x0, y:y0, z:z0, w:Math.abs(number(part.x1) - number(part.x0)), h:Math.abs(number(part.y1) - number(part.y0)), d:Math.abs(number(part.z1) - number(part.z0)) };
  }
  if (type === "sphere") return { x:number(part.x), y:number(part.y), z:number(part.z), r:number(part.r) };
  const base = { x:number(part.x), y:number(part.y), z:number(part.z), h:number(part.h) };
  /* A cone's base radius is `r1`, not `r`: that is the name the exact kernel's
     makeBrepCone reads first. Neither carries an axis — a legacy primitive is
     always built up the Y axis, and both the topology namer and the kernel
     default an absent axis to exactly that. */
  return type === "cone"
    ? { ...base, r1:number(part.r), r2:number(part.r2) }
    : { ...base, r:number(part.r) };
}

/* A primitive with no size is not a shape. It converts arithmetically, draws
   nothing, and would sail through a bounds comparison of two empty models — so
   it is named as a blocker rather than silently migrated. */
function degeneratePrimitive(type, params) {
  if (type === "box") return !(params.w > 0 && params.h > 0 && params.d > 0);
  if (type === "sphere") return !(params.r > 0);
  if (type === "cone") return !(params.h !== 0 && (params.r1 > 0 || params.r2 > 0));
  return !(params.r > 0 && params.h !== 0);
}

function issue(severity, code, message, extra = {}) {
  return { severity, code, message, ...extra };
}

/* Every feature the tree will show must be one openFeatureEditor can open —
   featureSpec() is what it looks up, and it returns early when there is no
   spec, leaving a row that swallows double-clicks. */
export function featureEditability(features) {
  const uneditable = (features || [])
    .filter((feature) => !featureSpec(feature.type))
    .map((feature) => ({ id: feature.id, type: feature.type, name: feature.name || feature.type }));
  return { ok: !uneditable.length, uneditable };
}

/* What a legacy document would become, and everything standing in the way.
   Reports before it converts, so a caller can explain the refusal. */
export function analyzeLegacyMigration(def) {
  const parts = def?.parts || [];
  const blockers = [];
  const convertible = [];
  parts.forEach((part, index) => {
    const kind = part?.kind || "";
    const mapped = partFeatureType(part);
    if (mapped) { convertible.push({ part, index, type: mapped }); return; }
    blockers.push(issue("error", "unconvertible-part-kind",
      (part?.name || kind || "Feature " + (index + 1)) + ": " +
      (UNCONVERTIBLE_PART_KINDS[kind] || "No canonical feature matches this part kind"),
      { partId: part?.id || null, kind, index }));
  });
  if (!parts.length) blockers.push(issue("error", "empty-document", "The document has no features to convert"));
  // A sketch-driven part that lost its profile cannot be rebuilt from a sketch,
  // which is the only thing the canonical engine knows how to do with it.
  convertible.forEach(({ part, index, type }) => {
    /* Primitives are placed by numbers, so the profile requirement is only
       asked of the kinds that are actually rebuilt from one. What replaces it
       for a primitive is a size check. */
    if (isPrimitiveFeatureType(type)) {
      if (degeneratePrimitive(type, primitiveFeatureParams(type, part))) blockers.push(issue("error", "degenerate-primitive",
        (part.name || "Feature " + (index + 1)) + " has no measurable size to convert",
        { partId: part.id || null, index, type }));
    } else {
      const hasProfile = (part.profileEntityIds || []).length || (part.pts || []).length >= 3 || (part.pts0 || []).length >= 3;
      if (!hasProfile) blockers.push(issue("error", "profile-missing",
        (part.name || "Feature " + (index + 1)) + " has no profile to rebuild from",
        { partId: part.id || null, index }));
    }
    const unsupportedModifiers = [];
    if ((part.exactOperations || []).some((operation) => !operation.suppressed)) unsupportedModifiers.push("finish operations");
    if ((part.cuts3d || []).some((cut) => !cut.suppressed)) unsupportedModifiers.push("3D cuts");
    if ((part.merges3d || []).some((entry) => !entry.suppressed)) unsupportedModifiers.push("merged bodies");
    if ((part.patternRotations || []).length || part.patternRotation) unsupportedModifiers.push("pattern transforms");
    if (unsupportedModifiers.length) blockers.push(issue("error", "unsupported-legacy-modifier",
      (part.name || "Feature " + (index + 1)) + " uses " + unsupportedModifiers.join(", ") + " that cannot be represented by the converted feature",
      { partId: part.id || null, index, modifiers: unsupportedModifiers }));
    if (part.kind === "rev") {
      const axis = part.axis || "y", angle = Number(part.angle == null ? 360 : part.angle);
      if (!["x","y","z"].includes(axis) || !Number.isFinite(angle) || angle<=0 || angle>360)
        blockers.push(issue("error", "unsupported-revolve-placement",
          (part.name || "Feature " + (index + 1)) + " has an invalid revolve axis or angle",
          { partId: part.id || null, index, axis, angle }));
    }
    if (part.kind === "loft" && (!Array.isArray(part.pts1) || part.pts1.length < 3))
      blockers.push(issue("error", "loft-section-missing",
        (part.name || "Feature " + (index + 1)) + " is missing its second loft section",
        { partId: part.id || null, index }));
  });
  const featureTypes = [...new Set(convertible.map((entry) => entry.type))];
  const coverage = featureEditability(featureTypes.map((type) => ({ id: type, type })));
  coverage.uneditable.forEach((entry) => blockers.push(issue("error", "uneditable-feature",
    "Converted " + entry.type + " features would have no editor", { type: entry.type })));
  return {
    ok: !blockers.length,
    convertible: convertible.length,
    total: parts.length,
    blockers,
  };
}

function profilePoints(part) {
  if (Array.isArray(part.pts) && part.pts.length >= 3) return cloneDomain(part.pts);
  if (Array.isArray(part.points) && part.points.length >= 3) return cloneDomain(part.points);
  return null;
}

function loftPoint(axis, point, span) {
  const u = Number(point?.u ?? point?.x) || 0, v = Number(point?.v ?? point?.y) || 0, w = Number(span) || 0;
  if (axis === "x") return { x:w, y:v, z:u };
  if (axis === "z") return { x:u, y:v, z:w };
  return { x:u, y:w, z:v };
}

/* Build the trial canonical document. The source is never touched: the caller
   compares this against the original and throws it away on a mismatch. */
export function convertLegacyDocument(def) {
  const analysis = analyzeLegacyMigration(def);
  if (!analysis.ok) return { ok: false, document: null, analysis };
  const converted = cloneDomain(def);
  // Generated sketches and revolution axes must have persistent references,
  // including when an older document stored only its origin.
  converted.references = Array.isArray(converted.references) ? converted.references : [];
  for (const reference of mainReferences()) {
    if (!converted.references.some(existing => existing.id === reference.id)) converted.references.push(reference);
  }
  converted.features = [];
  converted.history = [];
  converted.metadata = { ...(converted.metadata || {}), authoringSystem: "parametric-v1", migratedFrom: "legacy-adapter" };
  (def.parts || []).forEach((part, index) => {
    const type = partFeatureType(part);
    if (!type) return;
    const id = part.featureId || ("feature:" + (part.id || domainId("part")) + ":" + index);
    const points = profilePoints(part);
    const params = { ...cloneDomain(part.params || {}) };
    if (isPrimitiveFeatureType(type)) {
      Object.assign(params, primitiveFeatureParams(type, part));
    } else if (type === "extrude") {
      const from = Number(part.from) || 0, to = Number(part.to) || 0;
      params.depth = Math.abs(to - from) || Number(part.depth) || 1;
      params.direction = to >= from ? "forward" : "reverse";
      params.endCondition = params.endCondition || "blind";
      params.operation = params.operation || "add";
      if (part.axis) params.axis = part.axis;
      if (part.frame) params.frame = cloneDomain(part.frame);
      if ((part.holes || []).length) params.holes = cloneDomain(part.holes);
    } else if (type === "revolve") {
      Object.assign(params,revolveRecipe(part));
    } else if (type === "loft") {
      params.sections = [
        (part.pts0 || []).map((point) => loftPoint(part.axis || "y", point, part.from)),
        (part.pts1 || []).map((point) => loftPoint(part.axis || "y", point, part.to)),
      ];
      params.solid = true;
      params.ruled = part.ruled !== false;
    }
    if (points && type!=="revolve") params.points = points;
    if (part.sketchId) params.sketchId = part.sketchId;
    if ((part.profileEntityIds || []).length) params.profileEntityIds = cloneDomain(part.profileEntityIds);
    const feature = {
      id,
      name: part.name || type,
      type,
      params,
      inputs: [],
      references: {
        sketches: part.sketchId ? [part.sketchId] : [],
        features: [],
        topology: [],
        references: [],
        ...(part.profileEntityIds ? { profileEntityIds: cloneDomain(part.profileEntityIds) } : {}),
      },
      suppressed: !!part.suppressed,
    };
    if(type==="revolve") {
      feature.references.references=["axis:"+params.axis];
      if(!feature.references.sketches.length) {
        const sketchId="sketch:migrated:"+id;
        const points=params.points.map((p,i)=>({id:sketchId+":p"+i,x:p.u,y:p.v}));
        const entities=points.map((p,i)=>({id:sketchId+":e"+i,type:"line",a:p.id,b:points[(i+1)%points.length].id}));
        converted.sketches=converted.sketches || [];
        converted.sketches.push({id:sketchId,name:feature.name+" profile",plane:"front",points,entities,constraints:[]});
        feature.references.sketches=[sketchId];params.sketchId=sketchId;
        params.profileEntityIds=entities.map(e=>e.id);feature.references.profileEntityIds=params.profileEntityIds.slice();
      }
    }
    converted.features.push(feature);
    converted.history.push({
      id: "history:feature:" + id,
      kind: "feature",
      targetId: id,
      name: feature.name,
      suppressed: feature.suppressed,
      status: "pending",
    });
  });
  normalizeHistory(converted, converted.history);
  if (Number.isFinite(def.rollback)) {
    const partRollback = Math.max(0, Math.min(def.rollback, converted.features.length));
    if (!partRollback) converted.rollbackIndex = 0;
    else {
      const lastFeatureId = converted.features[partRollback - 1]?.id;
      const lastFeatureIndex = converted.history.findIndex((entry) => entry.kind === "feature" && entry.targetId === lastFeatureId);
      converted.rollbackIndex = lastFeatureIndex < 0 ? converted.history.length : lastFeatureIndex + 1;
    }
  }
  return { ok: true, document: converted, analysis };
}

/* Keep one source of truth active and the complete pre-conversion document as
   an immutable recovery snapshot. The helpers are pure so save/reload and
   restoration can be verified without reaching into editor state. */
export function retainLegacySource(convertedDocument, legacyDocument, options = {}) {
  const migrated = cloneDomain(convertedDocument);
  const source = cloneDomain(legacyDocument);
  delete source.legacySource;
  delete source.migration;
  migrated.legacySource = source;
  migrated.migration = {
    version: options.version || MIGRATION_EQUIVALENCE_VERSION,
    migratedAt: options.migratedAt || Date.now(),
    from: "legacy-adapter",
    verification: cloneDomain(options.verification) || null,
  };
  return migrated;
}

export function restoreLegacyDocument(migratedDocument) {
  if (!migratedDocument?.legacySource) return null;
  const restored = cloneDomain(migratedDocument.legacySource);
  restored.metadata ||= {};
  restored.metadata.authoringSystem = "legacy-adapter";
  delete restored.legacySource;
  delete restored.migration;
  return restored;
}

function rounded(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 1e6) / 1e6 : 0;
}

function point2(point) {
  return { u:rounded(point?.u ?? point?.x), v:rounded(point?.v ?? point?.y) };
}

function point3(point) {
  return { x:rounded(point?.x ?? point?.u), y:rounded(point?.y ?? point?.v), z:rounded(point?.z ?? point?.w) };
}

function frameShape(frame) {
  if (!frame) return null;
  return {
    origin: point3(frame.origin), xAxis: point3(frame.xAxis),
    yAxis: point3(frame.yAxis), normal: point3(frame.normal),
  };
}

function holeShapes(holes) {
  return (holes || []).map((hole) => Array.isArray(hole) ? hole : hole?.points || hole?.loop || [])
    .filter((loop) => loop.length >= 3).map((loop) => loop.map(point2));
}

/* One descriptor shape per primitive, written once and produced from both
   sides. The fingerprint compares these literally, so the two builders must
   agree on field names and rounding — which is the point: a converted cylinder
   that quietly lost its taper, moved its base, or changed axis stops matching
   here rather than in the viewport. */
function primitiveDescriptor(type, source) {
  if (type === "box") return {
    type:"box", x:rounded(source.x), y:rounded(source.y), z:rounded(source.z),
    w:rounded(source.w), h:rounded(source.h), d:rounded(source.d),
  };
  if (type === "sphere") return { type:"sphere", x:rounded(source.x), y:rounded(source.y), z:rounded(source.z), r:rounded(source.r) };
  const base = { type, x:rounded(source.x), y:rounded(source.y), z:rounded(source.z), h:rounded(source.h) };
  return type === "cone"
    ? { ...base, r1:rounded(source.r1), r2:rounded(source.r2) }
    : { ...base, r:rounded(source.r) };
}

function legacyDescriptors(def) {
  const parts = def?.parts || [];
  const rollback = Number.isFinite(def?.rollback) ? Math.max(0, Math.min(def.rollback, parts.length)) : parts.length;
  return parts.slice(0, rollback).filter((part) => part && !part.suppressed).map((part) => {
    const primitive = partFeatureType(part);
    if (primitive && isPrimitiveFeatureType(primitive))
      return primitiveDescriptor(primitive, primitiveFeatureParams(primitive, part));
    if (part.kind === "ext") return {
      type:"extrude", axis:part.axis || "y", frame:frameShape(part.frame),
      from:rounded(part.from), to:rounded(part.to), points:(part.pts || []).map(point2), holes:holeShapes(part.holes),
    };
    if (part.kind === "rev") return revolveDescriptor(revolveRecipe(part));
    if (part.kind === "loft") return {
      type:"loft", sections:[
        (part.pts0 || []).map((point) => point3(loftPoint(part.axis || "y", point, part.from))),
        (part.pts1 || []).map((point) => point3(loftPoint(part.axis || "y", point, part.to))),
      ],
    };
    return { type:part.kind || "unknown" };
  });
}

function revolveDescriptor(params) {
  return {type:"revolve",axis:params.axis || "y",angle:rounded(params.angle ?? 360),
    radialProfile:!!params.radialProfile, direction:params.direction || "forward",symmetric:!!params.symmetric,
    x:rounded(params.x || 0),y:rounded(params.y || 0),z:rounded(params.z || 0),
    points:(params.points || params.pts || []).map(point2)};
}

function canonicalDescriptors(run) {
  const results = run?.core?.resultList || run?.resultList || [];
  return results.filter((result) => result && result.kind !== "sketch" && ["box", "cylinder", "cone", "sphere", "extrude", "revolve", "loft"].includes(result.type)).map((result) => {
    const params = result.params || {};
    if (isPrimitiveFeatureType(result.type)) return primitiveDescriptor(result.type, params);
    if (result.type === "extrude") return {
      type:"extrude", axis:params.axis || "y", frame:frameShape(params.frame),
      from:rounded(params.from), to:rounded(params.to), points:(params.points || params.pts || []).map(point2), holes:holeShapes(params.holes),
    };
    if (result.type === "revolve") return revolveDescriptor(params);
    return { type:"loft", sections:(params.sections || []).map((section) => section.map(point3)) };
  });
}

function loopMoments(points) {
  let twiceArea = 0, cu = 0, cv = 0;
  for (let index = 0, previous = points.length - 1; index < points.length; previous = index++) {
    const a = points[previous], b = points[index], cross = a.u * b.v - b.u * a.v;
    twiceArea += cross; cu += (a.u + b.u) * cross; cv += (a.v + b.v) * cross;
  }
  const signedArea = twiceArea / 2;
  if (Math.abs(signedArea) < 1e-9) return { area:0, u:0, v:0 };
  return { area:Math.abs(signedArea), u:cu / (6 * signedArea), v:cv / (6 * signedArea) };
}

function sectionArea(points) {
  let nx = 0, ny = 0, nz = 0;
  for (let index = 0, previous = points.length - 1; index < points.length; previous = index++) {
    const a = points[previous], b = points[index];
    nx += (a.y - b.y) * (a.z + b.z);
    ny += (a.z - b.z) * (a.x + b.x);
    nz += (a.x - b.x) * (a.y + b.y);
  }
  return Math.hypot(nx, ny, nz) / 2;
}

function sectionCentroid(points) {
  const count = Math.max(1, points.length);
  return points.reduce((sum, point) => ({ x:sum.x + point.x / count, y:sum.y + point.y / count, z:sum.z + point.z / count }), {x:0,y:0,z:0});
}

function descriptorVolume(descriptor) {
  if (descriptor.type === "box") return Math.abs(descriptor.w * descriptor.h * descriptor.d);
  if (descriptor.type === "sphere") return (4 / 3) * Math.PI * Math.pow(Math.abs(descriptor.r), 3);
  if (descriptor.type === "cylinder") return Math.PI * descriptor.r * descriptor.r * Math.abs(descriptor.h);
  // Conical frustum: the cylinder formula is the r2 === r case of this one.
  if (descriptor.type === "cone") {
    const r1 = Math.abs(descriptor.r1), r2 = Math.abs(descriptor.r2);
    return (Math.PI * Math.abs(descriptor.h) * (r1 * r1 + r1 * r2 + r2 * r2)) / 3;
  }
  if (descriptor.type === "extrude") {
    const outer = loopMoments(descriptor.points), holes = descriptor.holes.reduce((sum, loop) => sum + loopMoments(loop).area, 0);
    return Math.max(0, outer.area - holes) * Math.abs(descriptor.to - descriptor.from);
  }
  if (descriptor.type === "revolve") {
    const profile = loopMoments(descriptor.points);
    return profile.area * 2 * Math.PI * Math.abs(profile.u) * Math.min(1, Math.abs(descriptor.angle) / 360);
  }
  if (descriptor.type === "loft" && descriptor.sections.length >= 2) {
    const first = descriptor.sections[0], last = descriptor.sections[descriptor.sections.length - 1];
    if (!first.length || first.length !== last.length) return NaN;
    const middle = first.map((point, index) => ({ x:(point.x + last[index].x) / 2, y:(point.y + last[index].y) / 2, z:(point.z + last[index].z) / 2 }));
    const a = sectionArea(first), b = sectionArea(last), m = sectionArea(middle), ca = sectionCentroid(first), cb = sectionCentroid(last);
    const height = Math.hypot(cb.x - ca.x, cb.y - ca.y, cb.z - ca.z);
    return height * (a + 4 * m + b) / 6;
  }
  return NaN;
}

function worldExtrudePoint(descriptor, point, span) {
  if (descriptor.frame) {
    const { origin, xAxis, yAxis, normal } = descriptor.frame;
    return { x:origin.x + xAxis.x*point.u + yAxis.x*point.v + normal.x*span, y:origin.y + xAxis.y*point.u + yAxis.y*point.v + normal.y*span, z:origin.z + xAxis.z*point.u + yAxis.z*point.v + normal.z*span };
  }
  if (descriptor.axis === "x") return {x:span,y:point.v,z:point.u};
  if (descriptor.axis === "z") return {x:point.u,y:point.v,z:span};
  return {x:point.u,y:span,z:point.v};
}

function descriptorPoints(descriptor) {
  if (descriptor.type === "box") return [
    { x:descriptor.x, y:descriptor.y, z:descriptor.z },
    { x:descriptor.x + descriptor.w, y:descriptor.y + descriptor.h, z:descriptor.z + descriptor.d },
  ];
  if (descriptor.type === "sphere") {
    const r = Math.abs(descriptor.r);
    return [{ x:descriptor.x - r, y:descriptor.y - r, z:descriptor.z - r }, { x:descriptor.x + r, y:descriptor.y + r, z:descriptor.z + r }];
  }
  if (descriptor.type === "cylinder" || descriptor.type === "cone") {
    // Always about the Y axis; see primitiveFeatureParams.
    const radius = Math.max(Math.abs(descriptor.r ?? descriptor.r1), Math.abs(descriptor.r2 ?? descriptor.r ?? descriptor.r1));
    const lo = Math.min(0, descriptor.h), hi = Math.max(0, descriptor.h);
    return [
      { x:descriptor.x - radius, y:descriptor.y + lo, z:descriptor.z - radius },
      { x:descriptor.x + radius, y:descriptor.y + hi, z:descriptor.z + radius }];
  }
  if (descriptor.type === "extrude") return descriptor.points.flatMap((point) => [worldExtrudePoint(descriptor, point, descriptor.from), worldExtrudePoint(descriptor, point, descriptor.to)]);
  if (descriptor.type === "revolve") {
    const b=revolveBounds({...descriptor,pts:descriptor.points});
    return [{x:b.x0,y:b.y0,z:b.z0},{x:b.x1,y:b.y1,z:b.z1}];
  }
  if (descriptor.type === "loft") return descriptor.sections.flat();
  return [];
}

function descriptorBounds(descriptors) {
  const points = descriptors.flatMap(descriptorPoints);
  if (!points.length) return null;
  return {
    min:{x:Math.min(...points.map((point) => point.x)),y:Math.min(...points.map((point) => point.y)),z:Math.min(...points.map((point) => point.z))},
    max:{x:Math.max(...points.map((point) => point.x)),y:Math.max(...points.map((point) => point.y)),z:Math.max(...points.map((point) => point.z))},
  };
}

export function migrationGeometrySummary(source, mode = "legacy") {
  const descriptors = mode === "legacy" ? legacyDescriptors(source) : canonicalDescriptors(source);
  const volumes = descriptors.map(descriptorVolume), measurable = volumes.every(Number.isFinite);
  return {
    version:MIGRATION_EQUIVALENCE_VERSION,
    bodyCount:descriptors.length,
    bounds:descriptorBounds(descriptors),
    volume:measurable ? volumes.reduce((sum, volume) => sum + volume, 0) : null,
    fingerprint:stableStringify(descriptors),
  };
}

function boundsSpan(bounds) {
  if (!bounds?.min || !bounds?.max) return null;
  return {
    x: Number(bounds.max.x) - Number(bounds.min.x),
    y: Number(bounds.max.y) - Number(bounds.min.y),
    z: Number(bounds.max.z) - Number(bounds.min.z),
    min: bounds.min,
    max: bounds.max,
  };
}

/* Do two rebuilds agree about the geometry? Bounds are the cheap gate — they
   catch a feature that silently dropped out, an extrude that reversed, a
   pattern that lost instances. `tolerance` is absolute in document length
   units, because a relative test on a span of zero is meaningless. */
export function boundsMatch(a, b, tolerance = 1e-4) {
  const left = boundsSpan(a), right = boundsSpan(b);
  if (!left || !right) return { ok: false, reason: "missing-bounds" };
  const deltas = ["x", "y", "z"].flatMap((axis) => [
    Math.abs(Number(left.min[axis]) - Number(right.min[axis])),
    Math.abs(Number(left.max[axis]) - Number(right.max[axis])),
  ]);
  const worst = Math.max(...deltas);
  return { ok: worst <= tolerance, worst, tolerance, reason: worst <= tolerance ? "" : "bounds-differ" };
}

/* The full verdict. `legacyRun` and `canonicalRun` are rebuild outputs; both
   engines already build from a clone, so running them side by side cannot
   disturb the live document. */
export function evaluateMigration(input = {}) {
  const { analysis, legacyDocument, legacyRun, canonicalRun, tolerance = 1e-4 } = input;
  const reasons = [];
  if (analysis && !analysis.ok) reasons.push(...analysis.blockers);
  if (legacyRun && legacyRun.ok === false) reasons.push(issue("error", "legacy-rebuild-failed", "The document does not rebuild as it is; migrate only from a healthy model"));
  if (canonicalRun && canonicalRun.ok === false) reasons.push(issue("error", "canonical-rebuild-failed", "The converted document does not rebuild"));
  if (canonicalRun?.document) {
    const coverage = featureEditability(canonicalRun.document.features);
    coverage.uneditable.forEach((entry) => reasons.push(issue("error", "uneditable-feature",
      entry.name + " would have no editor after conversion", { type: entry.type })));
  }
  if (legacyRun && canonicalRun) {
    const legacyBounds = legacyRun.bounds || legacyRun.core?.bounds;
    const canonicalBounds = canonicalRun.bounds || canonicalRun.core?.bounds;
    const match = boundsMatch(legacyBounds, canonicalBounds, tolerance);
    if (!match.ok) reasons.push(issue("error", "geometry-differs",
      match.reason === "missing-bounds"
        ? "One of the two rebuilds produced no geometry to compare"
        : "The converted model measures " + match.worst.toFixed(4) + " different from the original",
      { worst: match.worst, tolerance }));
  }
  let geometry = null;
  if (legacyDocument && canonicalRun) {
    const legacy = migrationGeometrySummary(legacyDocument, "legacy");
    const canonical = migrationGeometrySummary(canonicalRun, "canonical");
    geometry = { legacy, canonical };
    if (legacy.bodyCount !== canonical.bodyCount) reasons.push(issue("error", "body-count-differs",
      "The converted model has " + canonical.bodyCount + " bodies; the original has " + legacy.bodyCount,
      { legacy:legacy.bodyCount, canonical:canonical.bodyCount }));
    const analyticBounds = boundsMatch(legacy.bounds, canonical.bounds, tolerance);
    if (!analyticBounds.ok) reasons.push(issue("error", "analytic-bounds-differ",
      analyticBounds.reason === "missing-bounds"
        ? "The effective geometry of one model has no measurable bounds"
        : "The converted effective geometry measures " + analyticBounds.worst.toFixed(4) + " different from the original",
      { worst:analyticBounds.worst, tolerance }));
    if (legacy.volume == null || canonical.volume == null) reasons.push(issue("error", "volume-unavailable",
      "The migration could not measure both models' volumes"));
    else {
      const volumeTolerance = Math.max(tolerance, Math.max(1, Math.abs(legacy.volume), Math.abs(canonical.volume)) * 1e-6);
      const delta = Math.abs(legacy.volume - canonical.volume);
      if (delta > volumeTolerance) reasons.push(issue("error", "volume-differs",
        "The converted model's volume differs from the original by " + delta.toFixed(4),
        { legacy:legacy.volume, canonical:canonical.volume, delta, tolerance:volumeTolerance }));
    }
    if (legacy.fingerprint !== canonical.fingerprint) reasons.push(issue("error", "geometry-fingerprint-differs",
      "The converted feature geometry does not have the same effective definition as the original"));
  }
  return { ok: !reasons.some((entry) => entry.severity === "error"), reasons, geometry };
}
