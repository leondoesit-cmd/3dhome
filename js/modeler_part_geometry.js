import { cylinderAxis } from "./core/cylinder_axis.js";
import { revolveBounds, revolveRecipe } from "./core/revolve_geometry.js";
import { tessellatePart } from "./core/part_tessellate.js";
import { toolFeatureRecipe, toolRangeForAxis, translateToolRecord } from "./core/tool_recipe.js";
import { cylinderBounds } from "./core/cylinder_axis.js";
/* Part geometry for the model editor: bounds, moves, pattern placement and the
   exact-kernel recipe a single part is rebuilt from.

   Like js/modeler_mesh_geometry.js this is pure — it takes a part (or a whole
   definition) and answers geometry or a new part.  It never reads or writes the
   editor state object E and never touches the DOM, which is why it can live
   outside js/modeler.js while js/modeler.js keeps every caller. */
import { THREE } from "./three_lazy.js";
import { uid, fin } from "./state.js";
import { normalizePose } from "./cad_mate_model.js";
import { isKernelBody, kernelBodyBounds, buildKernelBrep, offsetKernelBody } from "./core/kernel_body.js";
import { framePoint } from "./core/frame.js";
import { applyRigidMatrix, circularPatternPivot, invertRigidTransform, patternRotationTransform, rotatedPatternBounds } from "./core/pattern_geometry.js";
import { cutFootprint as cutScopeFootprint, profileLoopIsSeparateHole } from "./core/cut_scope.js";
import { createTopologyRegistry, resolveFinishTargetIds, topologyForFeature } from "./core/topology.js";
import { clearMeshProjectionCache } from "./core/mesh_projection.js";
import { pointInPoly } from "./modeler_finish_preview.js";
import { clearTopologyCache, hexNum, holeLoop, smoothTessellationNormals } from "./modeler_mesh_geometry.js";
import {
  booleanBrep, brepMaterialIntersection, chamferBrep, disposeBrep, domeBrep, draftBrep, extractBrepTopology, filletBrep,
  makeBrepCone, makeBrepExtrusion, makeBrepHoleTool, makeBrepLoft, makeBrepPrimitive, makeBrepRevolve, makeBrepSweep,
  moveBodyBrep, placeBrep, ribBrep, shellBrep, splitBrep, thickenBrep, translateBrep, unifyBrepFaces,
} from "./cad_kernel.js";

export function cloneData(value) {
  if(value == null)return value;
  return typeof structuredClone==="function" ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

/* One contract, shared with the solver: `transform.q` is the orientation and
   rx/ry/rz mirror it. Everything below reads the mirror — the bounds box, the
   render group, the pose cache key, the inspector — so it has to be derived
   here rather than merely defaulted, or a component that arrived carrying only
   a quaternion would draw at identity. */
export function normalizeTransform(component) {
  if (!component.transform) component.transform = {};
  return normalizePose(component.transform);
}

// bbox over all parts
export function basePartBounds(p) {
  /* A kernel body has no analytic shape to measure: its bounds come from the
     tessellation the kernel returned. Until that arrives — or after a build
     failed — it has none, and an empty box keeps it out of defBounds(), the
     camera fit and every snap instead of parking a phantom at the origin. */
  if (isKernelBody(p)) return kernelBodyBounds(p) || { x0: 0, x1: 0, y0: 0, y1: 0, z0: 0, z1: 0 };
  if ((p.kind === "direct" || p.kind === "mesh") && p.bounds) return { ...p.bounds };
  if ((p.kind === "direct" || p.kind === "mesh" || (p.merges3d || []).some(function(merge){return !merge.suppressed;})) && p.meshData) {
    var mp=p.meshData.positions || [], mb={x0:Infinity,x1:-Infinity,y0:Infinity,y1:-Infinity,z0:Infinity,z1:-Infinity};
    for (var mbi=0;mbi+2<mp.length;mbi+=3) {
      if (![mp[mbi],mp[mbi+1],mp[mbi+2]].every(Number.isFinite)) continue;
      mb.x0=Math.min(mb.x0,mp[mbi]);mb.x1=Math.max(mb.x1,mp[mbi]);
      mb.y0=Math.min(mb.y0,mp[mbi+1]);mb.y1=Math.max(mb.y1,mp[mbi+1]);
      mb.z0=Math.min(mb.z0,mp[mbi+2]);mb.z1=Math.max(mb.z1,mp[mbi+2]);
    }
    if (isFinite(mb.x0)) return mb;
  }
  if (p.kind === "direct" || p.kind === "mesh") return {x0:0,x1:0,y0:0,y1:0,z0:0,z1:0};
  if (p.kind === "box") return { x0: Math.min(p.x0, p.x1), x1: Math.max(p.x0, p.x1), y0: Math.min(p.y0, p.y1), y1: Math.max(p.y0, p.y1), z0: Math.min(p.z0, p.z1), z1: Math.max(p.z0, p.z1) };
  if (p.kind === "cyl") return cylinderBounds(p);
  if (p.kind === "cyl") { var R = Math.max(p.r, p.r2 != null ? p.r2 : p.r); return { x0: p.x - R, x1: p.x + R, y0: p.y, y1: p.y + p.h, z0: p.z - R, z1: p.z + R }; }
  if (p.kind === "sph") return { x0: p.x - p.r, x1: p.x + p.r, y0: p.y - p.r, y1: p.y + p.r, z0: p.z - p.r, z1: p.z + p.r };
  if (p.kind === "rev") return revolveBounds(p);
  if (p.kind === "loft") {
    var lu0 = 1e9, lu1 = -1e9, lv0 = 1e9, lv1 = -1e9;
    (p.pts0 || []).concat(p.pts1 || []).forEach(function (q) { lu0 = Math.min(lu0, q.u); lu1 = Math.max(lu1, q.u); lv0 = Math.min(lv0, q.v); lv1 = Math.max(lv1, q.v); });
    var llo = Math.min(p.from, p.to), lhi = Math.max(p.from, p.to);
    if (p.axis === "y") return { x0: lu0, x1: lu1, z0: lv0, z1: lv1, y0: llo, y1: lhi };
    if (p.axis === "z") return { x0: lu0, x1: lu1, y0: lv0, y1: lv1, z0: llo, z1: lhi };
    return { z0: lu0, z1: lu1, y0: lv0, y1: lv1, x0: llo, x1: lhi };
  }
  // Unknown or incomplete profiles have no geometry to measure.
  if (!Array.isArray(p.pts) || !p.pts.length) return {x0:0,x1:0,y0:0,y1:0,z0:0,z1:0};
  // ext
  if (p.frame) {
    var framed=(p.pts || []).flatMap(function(q){return [framePoint(p.frame,q.u,q.v,p.from),framePoint(p.frame,q.u,q.v,p.to)];});
    if (framed.length) return {
      x0:Math.min.apply(null,framed.map(function(q){return q.x;})),x1:Math.max.apply(null,framed.map(function(q){return q.x;})),
      y0:Math.min.apply(null,framed.map(function(q){return q.y;})),y1:Math.max.apply(null,framed.map(function(q){return q.y;})),
      z0:Math.min.apply(null,framed.map(function(q){return q.z;})),z1:Math.max.apply(null,framed.map(function(q){return q.z;})),
    };
  }
  var u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9;
  p.pts.forEach(function (q) { u0 = Math.min(u0, q.u); u1 = Math.max(u1, q.u); v0 = Math.min(v0, q.v); v1 = Math.max(v1, q.v); });
  var lo = Math.min(p.from, p.to), hi = Math.max(p.from, p.to);
  if (p.axis === "y") return { x0: u0, x1: u1, z0: v0, z1: v1, y0: lo, y1: hi };
  if (p.axis === "z") return { x0: u0, x1: u1, y0: v0, y1: v1, z0: lo, z1: hi };
  return { z0: u0, z1: u1, y0: v0, y1: v1, x0: lo, x1: hi };
}

export function partBounds(p) {
  return rotatedPatternBounds(basePartBounds(p), partPatternRotations(p));
}

/* Which bodies the exact kernel can rebuild from their own definition — and so
   which ones a 3D cut can be applied to at all. A sphere or an imported mesh
   has no profile to rebuild from: a cut through one has to be refused out loud
   rather than dropped on the floor, which is what "it cut the box but not the
   shape on top of it" was. */
export function partSupportsExactMesh(p) {
  if (!p) return false;
  /* A kernel body carries its recipe, and exactBrepForPart() starts from
     buildKernelBrep(p.kernel) — so a swept pipe can be cut, filleted,
     chamfered, shelled and drafted like any other solid. Without the recipe
     there is nothing to rebuild from and the refusal stands. */
  if (isKernelBody(p)) return !!(p.kernel && p.kernel.type);
  if (p.kind === "box" || p.kind === "ext") return true;
  if (p.kind === "cyl") return fin(p.r) && fin(p.h);
  if (p.kind === "loft") return (p.pts0 || []).length >= 3 && (p.pts1 || []).length === (p.pts0 || []).length;
  // The shared radial recipe now includes start angle and end caps.
  if (p.kind === "rev") return (p.pts || []).length >= 3 && Number(p.angle ?? 360)>0 && Number(p.angle ?? 360)<=360;
  return false;
}

export function partNeedsExactMesh(p) {
  if (!p) return false;
  // Revolved mesh groups do not identify the exact caps and curved faces.
  // Expose kernel topology before downstream face-based features are selected.
  if (p.kind === "rev") return true;
  /* A drafted extrusion is not a prism, and the lightweight preview can only
     draw prisms — so a non-zero draft angle is what makes the kernel the only
     honest renderer of this body. */
  if (p.kind === "ext" && Math.abs(Number(p.draftAngle) || 0) > 1e-9) return true;
  if (fin(p.exactFillet) && p.exactFillet > 0) return true;
  if ((p.exactOperations || []).some(function (operation) { return !operation.suppressed; })) return true;
  if ((p.cuts3d || []).some(function (cut) { return !cut.suppressed; })) return true;
  if ((p.merges3d || []).some(function (entry) { return !entry.suppressed; })) return true;
  return false;
}

/* Older documents could encode a rim-breaking slot as a profile `hole`.
   Analytic extrusion topology necessarily keeps the outer wire intact in that
   representation, which made the already removed segment light up and become
   a fillet target. Upgrade those records in place to boolean cuts before any
   topology is exposed. Enclosed, non-overlapping holes stay lightweight. */
export function migrateBoundaryChangingProfileCuts(part) {
  if (!part || part.kind !== "ext" || !(part.holes || []).length || !(part.pts || []).length) return false;
  var retained = [], acceptedLoops = [], moved = [], bounds = null;
  (part.holes || []).forEach(function (entry) {
    var loop = holeLoop(entry, true);
    if (entry && !Array.isArray(entry) && entry.suppressed) { retained.push(entry); return; }
    if (profileLoopIsSeparateHole(loop, part.pts, acceptedLoops)) {
      retained.push(entry);
      acceptedLoops.push(loop);
      return;
    }
    if (loop.length < 3) { retained.push(entry); return; }
    bounds = bounds || partBounds(part);
    var range = cutRangeForAxis(bounds, part.axis);
    moved.push({
      axis:part.axis,
      ...(part.frame ? {frame:cloneData(part.frame)} : {}),
      from:range.from,
      to:range.to,
      loop:cloneData(loop),
      featureId:entry && !Array.isArray(entry) ? entry.featureId : undefined,
    });
  });
  if (!moved.length) return false;
  part.holes = retained;
  part.cuts3d = (part.cuts3d || []).concat(moved);
  delete part.meshData;
  part.exactPending = false;
  part.exactError = null;
  return true;
}

export function resetClonedPartIdentity(part) {
  var oldPartId = part.id, oldFeatureId = part.featureId || (oldPartId && "feature:part:" + oldPartId);
  part.id = uid();
  part.featureId = "feature:part:" + part.id;
  var remap = function (value) {
    return typeof value === "string" && oldFeatureId && value.indexOf(oldFeatureId) === 0
      ? part.featureId + value.slice(oldFeatureId.length)
      : value;
  };
  (part.exactFilletTargets || []).forEach(function (reference) {
    reference.ownerFeatureId = remap(reference.ownerFeatureId);
    reference.persistentId = remap(reference.persistentId);
  });
  part.exactFilletEdges = (part.exactFilletEdges || []).map(remap);
  (part.exactOperations || []).forEach(function (operation) {
    operation.id = remap(operation.id) || part.featureId + ":" + operation.type + ":" + uid();
    (operation.targets || []).forEach(function (reference) {
      reference.ownerFeatureId = remap(reference.ownerFeatureId);
      reference.persistentId = remap(reference.persistentId);
    });
  });
  if (part.meshData && Array.isArray(part.meshData.topology)) {
    part.meshData.topology.forEach(function (entry) {
      entry.ownerFeatureId = remap(entry.ownerFeatureId);
      entry.persistentId = remap(entry.persistentId);
    });
    (part.meshData.faceRanges || []).forEach(function (entry) { entry.persistentId = remap(entry.persistentId); });
    clearTopologyCache(part);
  }
  delete part.exactBuildToken;
  part.exactPending = false;
  return part;
}

export function translateDescriptor(descriptor,dx,dy,dz) {
  if (!descriptor || typeof descriptor!=="object") return;
  [descriptor.origin,descriptor.center,descriptor.arcMidpoint].forEach(function(point){if(point){point.x+=dx;point.y+=dy;point.z+=dz;}});
  (descriptor.endpoints || []).forEach(function(point){point.x+=dx;point.y+=dy;point.z+=dz;});
  if (descriptor.bounds) [descriptor.bounds.min,descriptor.bounds.max].forEach(function(point){if(point){point.x+=dx;point.y+=dy;point.z+=dz;}});
}

export function translateTopologyReferences(value,dx,dy,dz) {
  if (!value || typeof value!=="object") return;
  if (value.type==="topology-reference") {translateDescriptor(value.descriptor,dx,dy,dz);return;}
  if (Array.isArray(value)) value.forEach(function(item){translateTopologyReferences(item,dx,dy,dz);});
  else Object.keys(value).forEach(function(key){translateTopologyReferences(value[key],dx,dy,dz);});
}

export function movePart(p, dx, dy, dz) {
  if (p.kind === "box") { p.x0 += dx; p.x1 += dx; p.y0 += dy; p.y1 += dy; p.z0 += dz; p.z1 += dz; }
  else if (p.kind === "cyl" || p.kind === "sph") { p.x += dx; p.y += dy; p.z += dz; }
  else if (p.kind === "rev") {
    p.x += dx; p.z += dz;
    p.pts.forEach(function (q) { q.v += dy; }); // profile v is absolute height
  }
  else if (p.kind === "loft") {
    var lu, lv, lw;
    if (p.axis === "y") { lu = dx; lv = dz; lw = dy; }
    else if (p.axis === "z") { lu = dx; lv = dy; lw = dz; }
    else { lu = dz; lv = dy; lw = dx; }
    [p.pts0, p.pts1].forEach(function (lp) { lp.forEach(function (q) { q.u += lu; q.v += lv; }); });
    p.from += lw; p.to += lw;
  }
  // A kernel body carries its placement as an offset applied after the build,
  // so a later rebuild lands where the body was dragged to. The cached mesh and
  // bounds move with it below, so the viewport redraws without a rebuild.
  else if (isKernelBody(p)) offsetKernelBody(p, dx, dy, dz);
  else if (p.kind === "direct" || p.kind === "mesh") {
    if (p.bounds) {p.bounds.x0+=dx;p.bounds.x1+=dx;p.bounds.y0+=dy;p.bounds.y1+=dy;p.bounds.z0+=dz;p.bounds.z1+=dz;}
  }
  else if (p.frame) {
    p.frame.origin.x += dx; p.frame.origin.y += dy; p.frame.origin.z += dz;
  }
  else {
    var du, dv, dw;
    if (p.axis === "y") { du = dx; dv = dz; dw = dy; }
    else if (p.axis === "z") { du = dx; dv = dy; dw = dz; }
    else { du = dz; dv = dy; dw = dx; }
    [p.pts].concat((p.holes || []).map(function (hl) { return holeLoop(hl, true); })).forEach(function (lp) {
      lp.forEach(function (q) { q.u += du; q.v += dv; });
    });
    if (p.sketch && p.sketch.kind === "wall" && p.axis === "y") {
      p.sketch.a.u += du; p.sketch.a.v += dv;
      p.sketch.b.u += du; p.sketch.b.v += dv;
    }
    p.from += dw; p.to += dw;
  }
  (p.cuts3d || []).concat(p.merges3d || []).forEach(function (cut) {
    translateToolRecord(cut,dx,dy,dz);
  });
  /* A fused pattern instance is placed by a rigid transform, not by a loop in
     the host's profile plane, so it travels in the shift. The shift is carried
     back through the host's OWN pattern turn first, because the placement is
     expressed in the host's frame (see fusePatternInstances): the render puts
     the host's turn around the fused body, so a world dx has to arrive here as
     the dx the turn will map onto it. An unturned host leaves this the plain
     addition it has always been. */
  var placedMerges = (p.merges3d || []).filter(function (merge) { return merge.kind === "placed"; });
  if (placedMerges.length) {
    var intoHost = invertRigidTransform(patternRotationTransform(partPatternRotations(p)));
    var shift = applyRigidMatrix(intoHost.matrix, {x:dx, y:dy, z:dz});
    placedMerges.forEach(function (merge) {
      (merge.placements || []).forEach(function (placement) {
        placement.translation = placement.translation || {x:0,y:0,z:0};
        placement.translation.x += shift.x; placement.translation.y += shift.y; placement.translation.z += shift.z;
      });
    });
  }
  if (p.meshData && (Array.isArray(p.meshData.positions) || ArrayBuffer.isView(p.meshData.positions))) {
    if(p.meshData.exactBounds && !isKernelBody(p)) [p.meshData.exactBounds.min,p.meshData.exactBounds.max].forEach(function(point){point.x+=dx;point.y+=dy;point.z+=dz;});
    for (var mi=0;mi<p.meshData.positions.length;mi+=3) {
      p.meshData.positions[mi]+=dx;
      p.meshData.positions[mi+1]+=dy;
      p.meshData.positions[mi+2]+=dz;
    }
    clearMeshProjectionCache(p.meshData);
    clearTopologyCache(p);
    (p.meshData.topology || []).forEach(function (entry) {
      var descriptor = entry && entry.descriptor;
      if (!descriptor) return;
      [descriptor.origin, descriptor.center, descriptor.arcMidpoint].forEach(function (point) {
        if (!point) return;
        point.x += dx; point.y += dy; point.z += dz;
      });
      (descriptor.endpoints || []).forEach(function (point) { point.x += dx; point.y += dy; point.z += dz; });
      if (descriptor.bounds) {
        [descriptor.bounds.min, descriptor.bounds.max].forEach(function (point) {
          if (!point) return;
          point.x += dx; point.y += dy; point.z += dz;
        });
      }
    });
  }
}

export function loopCentroid(pts) {
  var u = 0, v = 0;
  pts.forEach(function (q) { u += q.u; v += q.v; });
  return { u: u / pts.length, v: v / pts.length };
}

// Convert a box part to the equivalent extrude along `ax` (so it can take holes / rotate).
export function boxToExt(p, ax) {
  var q = { id: p.id, featureId:p.featureId, kind: "ext", axis: ax, name: p.name || "box", color: p.color, metal: p.metal, rough: p.rough, opacity: p.opacity, tex: p.tex, holes: [] };
  function rectPts(u0, u1, v0, v1) { return [{ u: u0, v: v0 }, { u: u1, v: v0 }, { u: u1, v: v1 }, { u: u0, v: v1 }]; }
  if (ax === "y") { q.pts = rectPts(p.x0, p.x1, p.z0, p.z1); q.from = p.y0; q.to = p.y1; }
  else if (ax === "z") { q.pts = rectPts(p.x0, p.x1, p.y0, p.y1); q.from = p.z0; q.to = p.z1; }
  else { q.pts = rectPts(p.z0, p.z1, p.y0, p.y1); q.from = p.x0; q.to = p.x1; }
  return q;
}

export function cutRangeForAxis(bounds, axis) {
  return toolRangeForAxis(bounds,axis);
}

/* Operations whose selection is faces, not edges. Fillet and chamfer widen a
   face pick into that face's edges; shell and draft act on the face itself. */
export var FACE_DRIVEN_OPERATIONS = new Set(["shell", "dome", "draft", "thicken"]);

/* Projection bodies keep cuts, merges and finish operations in separate
   compatibility arrays.  Replaying those arrays by category changes history:
   Fillet -> Cut used to become Cut -> Fillet, so a pocket copied from the
   filleted face was displayed with square corners.  Canonical feature ids
   carry their creation timestamp and sequence; use that when the projection
   record has not yet been given an explicit history index. */
function projectionStepOrder(record) {
  if (Number.isFinite(Number(record && record.historyIndex))) return {historyIndex:Number(record.historyIndex)};
  var id=String(record && (record.featureId || record.id) || "");
  var match=/^feature_([0-9a-z]+)_([0-9a-z]+)$/i.exec(id);
  if (!match) return null;
  var time=parseInt(match[1],36),sequence=parseInt(match[2],36);
  return Number.isFinite(time) && Number.isFinite(sequence) ? {time:time,sequence:sequence} : null;
}

export function orderedProjectionSteps(cuts, merges, operations) {
  var serial=0,steps=[];
  (cuts || []).forEach(function(record){steps.push({kind:"cut",record:record,legacy:serial++});});
  (merges || []).forEach(function(record){steps.push({kind:"merge",record:record,legacy:serial++});});
  (operations || []).forEach(function(record){steps.push({kind:"operation",record:record,legacy:serial++});});
  steps.forEach(function(step){step.order=projectionStepOrder(step.record);});
  if(steps.every(function(step){return step.order && step.order.historyIndex!=null;})){
    steps.sort(function(a,b){return a.order.historyIndex-b.order.historyIndex || a.legacy-b.legacy;});
  }else if(steps.every(function(step){return step.order && (step.order.time!=null || step.order.historyIndex<0);})){
    steps.sort(function(a,b){
      if(a.order.historyIndex<0 || b.order.historyIndex<0)return (a.order.historyIndex<0?-1:1)-(b.order.historyIndex<0?-1:1) || a.legacy-b.legacy;
      return a.order.time-b.order.time || a.order.sequence-b.order.sequence || a.legacy-b.legacy;
    });
  }
  return steps;
}

/* A recorded tool is a solid, and which solid is a property of the record, not
   of the caller. Revolve Cut and Sweep Cut record the same profile the additive
   feature would have used, so the tool they remove is built by the very same
   kernel maker — there is one revolve and one sweep in this file. A MERGED
   feature records exactly the same shape and is fused instead of subtracted, so
   both lists are built here. */
export async function toolSolidBrep(cut, bodyBounds, target) {
  var recipe=toolFeatureRecipe(cut,bodyBounds);
  if(!recipe)throw new Error("Unsupported tool kind: " + cut.kind);
  if(recipe.type==="holeTool")return makeBrepHoleTool(recipe.params,target);
  if(recipe.type==="placedBody")return placedBodyBrep(cut);
  if(recipe.type==="loft")return makeBrepLoft(recipe.params);
  if(recipe.type==="revolve")return makeBrepRevolve(recipe.params);
  if(recipe.type==="sweep")return makeBrepSweep(recipe.params);
  return makeBrepExtrusion(recipe.params);
}

/* A body that is another body's shape, put down somewhere else.
 *
 * A merged pattern is N of these: the seed part is rebuilt once and each fused
 * instance is that solid under the one rigid transform its placement amounts
 * to, all unioned into a single connected lump. The seed is rebuilt through
 * exactBrepForPart rather than from a stripped-down recipe so a copy carries
 * the holes, 3D cuts and finish operations the seed carries — a patterned
 * bored plate fuses as a bored plate.
 *
 * One builder, two callers: the viewport's merge loop below, and the
 * `placedBody` row rebuildFeatureTreeFromDocument writes into the exact feature
 * tree. They cannot disagree about the shape because there is only one. */
export async function placedBodyBrep(spec) {
  const source = spec && (spec.part || spec.body);
  if (!source) throw new Error("A placed body needs the body it is a copy of");
  const placements = Array.isArray(spec.placements) && spec.placements.length
    ? spec.placements : [{ matrix: spec.matrix, translation: spec.translation }];
  let base = null, solid = null;
  try {
    base = await exactBrepForPart(source);
    for (const placement of placements) {
      const copy = await placeBrep(base, placement || {});
      if (!solid) { solid = copy; continue; }
      const fused = await booleanBrep("union", solid, copy);
      disposeBrep(solid); disposeBrep(copy);
      solid = fused;
    }
    if (placements.length > 1) {
      const welded = await unifyBrepFaces(solid);
      disposeBrep(solid);
      solid = welded;
    }
    const result = solid;
    solid = null;
    return result;
  } finally {
    if (base) disposeBrep(base);
    if (solid) disposeBrep(solid);
  }
}

/* What a merged pattern stores as the shape its instances are copies of: the
   seed's definition with its identity and its cached tessellation removed. The
   mesh goes because it is a cache of a shape the recipe rebuilds — and because
   its normals and colours are Float32Arrays, which JSON.stringify turns into
   {"0":..} objects on the way into a saved model. Holes, 3D cuts, finish
   operations and any EARLIER merges stay: they are part of the shape being
   copied. The caller snapshots before this pattern's own fusions land, so a
   merged pattern never records itself as its own source. */
export function patternMergeSource(seed) {
  const source = cloneData(seed) || {};
  ["id", "featureId", "meshData", "derivedFeatureId", "sourceFeatureId", "patternIndex",
    "patternGridIndex", "patternRotations", "patternRotation", "previewOnly", "exactPending",
    "exactError", "exactBuildToken"].forEach((key) => { delete source[key]; });
  return source;
}

export async function exactBrepForPart(p) {
  if (!partSupportsExactMesh(p)) throw new Error("This body has no profile the exact kernel can rebuild");
  var ownerFeatureId = p.featureId || "feature:part:" + p.id, solid, expectedTopology;
  /* Everything the kernel builds is made about the origin and moved into place,
     because a revolve turns around the world axis wherever the body sits. */
  var moveTo = async function (shape, delta) {
    if (!delta || (!delta.x && !delta.y && !delta.z)) return shape;
    var moved = await translateBrep(shape, delta);
    disposeBrep(shape);
    return moved;
  };
  if (isKernelBody(p)) {
    /* The recipe is the starting shape. Everything below — profile holes, 3D
       cuts, fillet/chamfer/shell/draft — then applies to it unchanged, which is
       what makes "fillet the swept pipe" work at all. */
    solid=await buildKernelBrep(p.kernel,{origin:p.origin});
  } else if (p.kind==="box") {
    var boxParams={x:Math.min(p.x0,p.x1),y:Math.min(p.y0,p.y1),z:Math.min(p.z0,p.z1),w:Math.abs(p.x1-p.x0),h:Math.abs(p.y1-p.y0),d:Math.abs(p.z1-p.z0)};
    solid=await makeBrepPrimitive({type:"box",...boxParams});
    expectedTopology=topologyForFeature({id:ownerFeatureId,type:"box"},boxParams);
  } else if (p.kind==="cyl" && (p.r2==null || Math.abs(p.r2-p.r)<1e-6)) {
    var cylParams={x:p.x,y:p.y,z:p.z,r:p.r,h:p.h,axis:p.axis};
    solid=await makeBrepPrimitive({type:"cylinder",...cylParams});
    expectedTopology=topologyForFeature({id:ownerFeatureId,type:"cylinder"},cylParams);
  } else if (p.kind==="cyl") {
    solid=await makeBrepCone({r1:Math.abs(p.r),r2:Math.abs(p.r2),h:p.h,axis:p.axis,origin:{x:p.x||0,y:p.y||0,z:p.z||0}});
  } else if (p.kind==="rev") {
    solid=await makeBrepRevolve(revolveRecipe(p));
  } else if (p.kind==="loft") {
    var section=function(points,w){return points.map(function(q){var xyz=loftXYZ(p.axis,q.u,q.v,w);return {x:xyz[0],y:xyz[1],z:xyz[2]};});};
    solid=await makeBrepLoft({sections:[section(p.pts0,p.from),section(p.pts1,p.to)],solid:true,ruled:true});
  } else {
    solid=await makeBrepExtrusion({axis:p.axis,frame:p.frame,from:p.from,to:p.to,points:p.pts,draftAngle:Number(p.draftAngle)||0,draftOutward:!!p.draftOutward});
    expectedTopology=topologyForFeature({id:ownerFeatureId,type:"extrude"},{axis:p.axis,frame:p.frame,from:p.from,to:p.to,points:p.pts,profileEntityIds:p.profileEntityIds});
  }
  var b = partBounds(p), cuts = [];
  (p.holes || []).forEach(function (entry) {
    var loop = holeLoop(entry);
    if (loop.length >= 3) cuts.push({axis:p.axis,frame:p.frame,from:p.from,to:p.to,loop:loop,historyIndex:-1});
  });
  (p.cuts3d || []).forEach(function (cut) { if (!cut.suppressed) cuts.push(cut); });
  var merges = (p.merges3d || []).filter(function (entry) { return !entry.suppressed; });
  var operations = Array.isArray(p.exactOperations) && p.exactOperations.length ? p.exactOperations.filter(function(operation){return !operation.suppressed;}) : [];
  if (!operations.length && fin(p.exactFillet) && p.exactFillet > 0) operations.push({
    id:ownerFeatureId + ":fillet", type:"fillet", amount:p.exactFillet,
    targets:cloneData(p.exactFilletTargets || []), persistentIds:(p.exactFilletEdges || []).slice(),
  });
  extractBrepTopology(solid, { ownerFeatureId:ownerFeatureId, expectedTopology:expectedTopology });
  try {
    var steps=orderedProjectionSteps(cuts,merges,operations),operationNumber=0;
    for (var si=0;si<steps.length;si++) {
      var step=steps[si],record=step.record,next;
      if(step.kind==="cut"){
        var cutter=null;
        try{cutter=await toolSolidBrep(record,b,solid);next = await booleanBrep("subtract", solid, cutter);}
        finally{if(cutter)disposeBrep(cutter);}
        disposeBrep(solid);solid=next;
        extractBrepTopology(solid,{ownerFeatureId:record.featureId || ownerFeatureId});
        continue;
      }
      if(step.kind==="merge"){
        var addition=await toolSolidBrep(record,b),fused;
        try{fused = await booleanBrep("union", solid, addition);}
        finally{disposeBrep(addition);}
        disposeBrep(solid);solid=fused;
        /* A union leaves a same-domain seam; remove it at the history step so
           later face and edge references see the body the viewport displays. */
        var welded=await unifyBrepFaces(solid);disposeBrep(solid);solid=welded;
        extractBrepTopology(solid,{ownerFeatureId:record.featureId || ownerFeatureId});
        continue;
      }
      var operation=record,priorTopology=cloneData(solid.topology || []);
      operationNumber++;
      var opId=operation.id || ownerFeatureId + ":" + operation.type + ":" + operationNumber;
      var opParams={targets:cloneData(operation.targets || [])};
      var registry=createTopologyRegistry(solid.topology || []);
      var persistentIds=resolveFinishTargetIds(operation.targets, registry, FACE_DRIVEN_OPERATIONS.has(operation.type)?"face":"edge");
      if (!persistentIds.length) persistentIds=(operation.persistentIds || []).slice();
      var facePersistentIds=FACE_DRIVEN_OPERATIONS.has(operation.type)?[]:resolveFinishTargetIds(operation.targets, registry, "face");
      if (operation.type==="fillet") {
        opParams={...opParams,...cloneData(operation.params || {}),radius:operation.amount};
        next=await filletBrep(solid, operation.amount, {...(operation.params || {}),edgePersistentIds:persistentIds,facePersistentIds:facePersistentIds});
      } else if (operation.type==="chamfer") {
        opParams={...opParams,...cloneData(operation.params || {}),distance:operation.amount};
        next=await chamferBrep(solid, operation.amount, {...(operation.params || {}),edgePersistentIds:persistentIds,facePersistentIds:facePersistentIds});
      } else if (operation.type==="shell") {
        opParams.thickness=operation.amount;
        next=await shellBrep(solid, operation.amount, {facePersistentIds:persistentIds,direction:operation.params && operation.params.direction,tolerance:operation.params && operation.params.tolerance,join:operation.params && operation.params.join});
      } else if (operation.type==="splitBody") {
        opParams={...opParams,...cloneData(operation.params || {})};
        next=await splitBrep(solid, operation.params || {});
      } else if (operation.type==="moveBody") {
        opParams={...opParams,...cloneData(operation.params || {})};
        next=await moveBodyBrep(solid, operation.params || {});
        opParams.placement=next.placement;
      } else if (operation.type==="rib") {
        opParams={...opParams,...cloneData(operation.params || {}),thickness:operation.amount};
        next=await ribBrep(solid, {...(operation.params || {}),thickness:operation.amount});
      } else if (operation.type==="thicken") {
        opParams={...opParams,...cloneData(operation.params || {}),thickness:operation.amount};
        next=await thickenBrep(solid, operation.amount, {facePersistentIds:persistentIds,direction:operation.params && operation.params.direction});
      } else if (operation.type==="dome") {
        opParams={...opParams,...cloneData(operation.params || {}),height:operation.amount};
        next=await domeBrep(solid,operation.amount,{facePersistentIds:persistentIds});
      } else if (operation.type==="draft") {
        opParams={...opParams,...cloneData(operation.params || {}),angle:operation.amount};
        /* The picked neutral face rebinds against this solid like the targets do,
           and never counts as a face to draft. */
        var neutralRef=operation.params && operation.params.neutralFace,neutralFaceId=neutralRef?(resolveFinishTargetIds([neutralRef], registry, "face")[0] || null):null;
        if(neutralRef && !neutralFaceId)throw new Error("Draft neutral plane face is unavailable");
        next=await draftBrep(solid, operation.amount, {...(operation.params || {}),neutralFaceId:neutralFaceId,facePersistentIds:persistentIds.filter(function(id){return id!==neutralFaceId;})});
      } else throw new Error("Unsupported exact operation: " + operation.type);
      var expectedAfter=topologyForFeature({id:opId,type:operation.type},opParams,[{topology:priorTopology}]);
      disposeBrep(solid); solid=next;
      extractBrepTopology(solid,{ownerFeatureId:opId,expectedTopology:expectedAfter});
    }
  } catch (error) {
    disposeBrep(solid);
    throw error;
  }
  return solid;
}

/* How far a sweep or a loft reaches, read off its RECIPE rather than off the
   solid — the solid does not exist until the kernel has run, and the merge
   decision has to be made before the body is either created or not. A sweep is
   its section carried by the path's own travel; a loft is the hull of its
   sections. Both are close, not exact: a curving sweep turns its section and a
   smoothed loft can bulge a little past the sections it joins. It is used for
   one question — does this touch that body — and never as the body's bounds. */
export function kernelRecipeBounds(type, params) {
  var box = function (points) {
    var list = (points || []).filter(Boolean);
    if (!list.length) return null;
    var read = function (q, key, alt) { return Number(q[key] != null ? q[key] : q[alt]) || 0; };
    return {
      x0:Math.min.apply(null,list.map(function(q){return read(q,"x","u");})), x1:Math.max.apply(null,list.map(function(q){return read(q,"x","u");})),
      y0:Math.min.apply(null,list.map(function(q){return read(q,"y","v");})), y1:Math.max.apply(null,list.map(function(q){return read(q,"y","v");})),
      z0:Math.min.apply(null,list.map(function(q){return read(q,"z","w");})), z1:Math.max.apply(null,list.map(function(q){return read(q,"z","w");})),
    };
  };
  if (type === "loft") {
    var all = [];
    (params.sections || []).forEach(function (section) { all = all.concat(section || []); });
    return box(all);
  }
  var profile = box(params.profile), path = params.path || [];
  if (!profile || path.length < 2) return profile;
  var start = path[0], travel = box(path.map(function (q) { return {x:(Number(q.x)||0)-(Number(start.x)||0), y:(Number(q.y)||0)-(Number(start.y)||0), z:(Number(q.z)||0)-(Number(start.z)||0)}; }));
  return {
    x0:profile.x0+travel.x0, x1:profile.x1+travel.x1,
    y0:profile.y0+travel.y0, y1:profile.y1+travel.y1,
    z0:profile.z0+travel.z0, z1:profile.z1+travel.z1,
  };
}

// Through-cut: punch `loop` as a hole into every part under it in the current view.
// Cuts on the extrusion axis remain lightweight profile holes. Orthogonal cuts
// become OpenCascade booleans, so the same body can be bored from several faces
// just like the workflow in a full CAD modeller.
export function footprintHasPoint(footprint, q) {
  if (!footprint || !q) return false;
  if (footprint.type === "poly") return pointInPoly(q, footprint.pts);
  if (footprint.type === "circle") return Math.hypot(q.u - footprint.u, q.v - footprint.v) <= footprint.r;
  if (!fin(footprint.u0) || !fin(footprint.v0)) return false;
  return q.u >= Math.min(footprint.u0,footprint.u1) && q.u <= Math.max(footprint.u0,footprint.u1)
    && q.v >= Math.min(footprint.v0,footprint.v1) && q.v <= Math.max(footprint.v0,footprint.v1);
}

export function footprintPoint(footprint) {
  if (!footprint) return null;
  if (footprint.type === "poly") return footprint.pts && footprint.pts.length ? loopCentroid(footprint.pts) : null;
  if (footprint.type === "circle") return { u:footprint.u, v:footprint.v };
  if (!fin(footprint.u0) || !fin(footprint.v0)) return null;
  return { u:(footprint.u0 + footprint.u1) / 2, v:(footprint.v0 + footprint.v1) / 2 };
}

/* Which bodies a cut passes through, measured in the cut's own space — see
   core/cut_scope.js for why that space is the cut's and not the viewport's. */
export function cutFootprint(part, frame, axisName) {
  return cutScopeFootprint(part, partBounds(part), frame, axisName, function (hole) { return holeLoop(hole); });
}

/* ---- revolve (lathe) & loft solids ---- */
export function stdMat(p) {
  return new THREE.MeshStandardMaterial({
    color: hexNum(p.color),
    metalness: fin(p.metal) ? p.metal : 0.08,
    roughness: fin(p.rough) ? p.rough : 0.8,
    transparent: fin(p.opacity) && p.opacity < 1,
    opacity: fin(p.opacity) ? p.opacity : 1,
    side: THREE.DoubleSide,
  });
}

export function revMaxR(p) {
  var R = 0;
  p.pts.forEach(function (q) { R = Math.max(R, Math.abs(q.u)); });
  return R;
}

export function buildRev(parent, p) {
  if (!p.pts || p.pts.length < 2) return null;
  var data=tessellatePart({...p,meshData:null});
  if(!data)return null;
  var g=new THREE.BufferGeometry();
  g.setAttribute("position",new THREE.Float32BufferAttribute(data.positions,3));
  g.computeVertexNormals();smoothTessellationNormals(g);
  var me = new THREE.Mesh(g, stdMat(p));
  me.castShadow = true;
  me.receiveShadow = true;
  parent.add(me);
  return me;
}

// map sketch-plane (u,v) + axis coordinate w into model xyz, per extrude axis convention
export function loftXYZ(axis, u, v, w) {
  if (axis === "y") return [u, w, v];
  if (axis === "z") return [u, v, w];
  return [w, v, u];
}

export function buildLoft(parent, p) {
  var n = (p.pts0 || []).length;
  if (n < 3 || !p.pts1 || p.pts1.length !== n) return null;
  var pos = [], idx = [], i;
  for (i = 0; i < n; i++) pos.push.apply(pos, loftXYZ(p.axis, p.pts0[i].u, p.pts0[i].v, p.from));
  for (i = 0; i < n; i++) pos.push.apply(pos, loftXYZ(p.axis, p.pts1[i].u, p.pts1[i].v, p.to));
  for (i = 0; i < n; i++) { // side walls
    var a = i, b = (i + 1) % n;
    idx.push(a, b, n + b, a, n + b, n + a);
  }
  try { // end caps
    [p.pts0, p.pts1].forEach(function (ring, ri) {
      var tris = THREE.ShapeUtils.triangulateShape(ring.map(function (q) { return new THREE.Vector2(q.u, q.v); }), []);
      tris.forEach(function (tr) { idx.push(ri * n + tr[0], ri * n + tr[1], ri * n + tr[2]); });
    });
  } catch (e) {}
  var g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  var me = new THREE.Mesh(g, stdMat(p));
  me.castShadow = true;
  me.receiveShadow = true;
  parent.add(me);
  return me;
}

export function partPatternRotations(p) {
  var rotations=Array.isArray(p && p.patternRotations) ? p.patternRotations.slice() : [];
  if(p && p.patternRotation)rotations.push(p.patternRotation);
  return rotations.filter(function(rotation){return rotation && ["x","y","z"].includes(rotation.axis) && Number.isFinite(Number(rotation.angle));}).map(function(rotation){return {axis:rotation.axis,angle:Number(rotation.angle),pivot:rotation.pivot ? {x:Number(rotation.pivot.x)||0,y:Number(rotation.pivot.y)||0,z:Number(rotation.pivot.z)||0}:undefined};});
}

/* The same turn as ONE rigid transform: what buildPart nests as groups around
   the whole rendered body, and what the exact tree's `transformBody` row applies
   outside the holes, the merges and the finish operations. Both sides ask here
   so the viewport and STEP/IGES cannot answer differently. */
export function partPatternTransform(p) {
  return patternRotationTransform(partPatternRotations(p));
}

// Circular pattern copies keep an explicit model-space transform. Applying it
// to a render group supports every part kind and all three axes, including
// imported meshes and boxes that previously stayed coincident with the seed.
export function rotatePatternPart(p, axis, angle, radialDistance, pivot) {
  if(!p)return null;
  p.patternRotations=partPatternRotations(p);
  var normalizedAxis=["x","y","z"].includes(axis)?axis:"y";
  p.patternRotations.push({axis:normalizedAxis,angle:Number(angle)||0,pivot:circularPatternPivot({axis:normalizedAxis,radialDistance:radialDistance,pivot})});
  delete p.patternRotation;
  return p;
}

export function rotPartY(p, ang) { return rotatePatternPart(p,"y",ang); }

/* Move one pattern copy into place. Curve instances translate to the station
   and then turn about it — the pivot the placement carries — which is why the
   rotations go on after movePart rather than before it. */
export function placePatternCopy(copy, params, placement, circularStep) {
  if(!copy || !placement)return copy;
  if(params && params.mode==="circular")return rotatePatternPart(copy,params.axis,circularStep*placement.circularIndex,params.radialDistance,params.pivot??params.origin);
  movePart(copy,placement.x,placement.y,placement.z);
  if((placement.rotations || []).length){
    copy.patternRotations=partPatternRotations(copy).concat(cloneData(placement.rotations));
    delete copy.patternRotation;
  }
  return copy;
}

/* Projection meshes are triangle soup. Reflection flips orientation, so swap
   vertices 1 and 2 in every triangle, including their normals and colors. */
function reflectProjectionMesh(part,axis) {
  var data=part.meshData, component={x:0,y:1,z:2}[axis];
  if(data.exactBounds){var oldMin=data.exactBounds.min[axis];data.exactBounds.min[axis]=-data.exactBounds.max[axis];data.exactBounds.max[axis]=-oldMin;}
  [data.positions,data.normals].forEach(function(values){
    if(!values)return;
    for(var i=component;i<values.length;i+=3)values[i]=-values[i];
  });
  if(data.indices){for(var i=0;i+2<data.indices.length;i+=3){var index=data.indices[i+1];data.indices[i+1]=data.indices[i+2];data.indices[i+2]=index;}}
  (data.indices ? [] : [data.positions,data.normals,data.colors]).forEach(function(values){
    if(!values)return;
    for(var i=0;i+8<values.length;i+=9)for(var j=0;j<3;j++){
      var value=values[i+3+j];values[i+3+j]=values[i+6+j];values[i+6+j]=value;
    }
  });
  if(part.bounds){var low=part.bounds[axis+"0"];part.bounds[axis+"0"]=-part.bounds[axis+"1"];part.bounds[axis+"1"]=-low;}
  (data.topology || []).forEach(function(entry){
    var d=entry.descriptor;if(!d)return;
    [d.origin,d.center,d.arcMidpoint,d.normal,d.axis].concat(d.endpoints || []).forEach(function(v){if(v)v[axis]=-v[axis];});
    if(d.bounds){var low=d.bounds.min[axis];d.bounds.min[axis]=-d.bounds.max[axis];d.bounds.max[axis]=-low;}
  });
  clearMeshProjectionCache(data);clearTopologyCache(part);
}

export function mirrorProjectionPart(q,planeId) {
  /* Mirroring works by negating coordinates in the part's own definition, and
     a kernel body's definition is a recipe in the sketch coordinates it was
     authored in — there is nothing here to negate. The generic branch below
     would have found no loops and returned a copy sitting exactly on top of the
     original, which is the quiet wrong answer. Refuse instead; the caller says
     so out loud, the way a cut through an unrebuildable body already does. */
  if(isKernelBody(q))return null;
  var mirrorAxis=planeId==="plane:top"?"y":planeId==="plane:front"?"z":"x";
  // Compound and finish recipes need reflection of placements and references.
  if((q.cuts3d || []).length || (q.merges3d || []).length || (q.patternRotations || []).length || q.patternRotation || (q.exactOperations || []).length || q.exactFillet)return null;
  if(q.frame){
    [q.frame.origin,q.frame.xAxis,q.frame.yAxis,q.frame.normal].forEach(function(v){v[mirrorAxis]=-v[mirrorAxis];});
    // Reflection reverses handedness. Negating normal AND local depth keeps
    // the frame right-handed while placing every point at its reflection.
    ["x","y","z"].forEach(function(axis){q.frame.normal[axis]=-q.frame.normal[axis];});
    q.from=-q.from;q.to=-q.to;
    // The mirrored copy has its own placement, not the seed's face attachment.
    delete q.support;delete q.supportBaseOffset;delete q.supportDepth;
    delete q.profileEntityIds;delete q.sketchId;
    if(q.meshData)reflectProjectionMesh(q,mirrorAxis);
    return q;
  }
  if(q.kind==="direct" || q.kind==="mesh"){
    if(!q.meshData || !q.meshData.positions || q.meshData.positions.length<9)return null;
    if(!q.mirrorImportSeed)q.mirrorImportSeed={bounds:basePartBounds(q),topology:cloneData(q.meshData.topology || [])};
    q.mirrorImportAxes=(q.mirrorImportAxes || []).concat(mirrorAxis);
    reflectProjectionMesh(q,mirrorAxis);
    return q;
  }
  if(q.meshData)reflectProjectionMesh(q,mirrorAxis);
  if(q.kind==="cyl"){
    const axis=cylinderAxis(q.axis);
    q[mirrorAxis]=-Number(q[mirrorAxis] || 0);
    if(Math.abs(axis[mirrorAxis])>1e-9){
      // Reflect the directed axis, preserving which end owns each cone radius.
      axis[mirrorAxis]=-axis[mirrorAxis];q.axis=axis;
    }
    return q;
  }
  var plane=planeId || "plane:right",loops=function(part){return part.kind==="loft"?[part.pts0,part.pts1]:[part.pts].concat((part.holes || []).map(function (hl) { return holeLoop(hl, true); }));};
  if(plane==="plane:top"){
    if(q.kind==="box"){var y0=q.y0;q.y0=-q.y1;q.y1=-y0;}
    else if(q.kind==="cyl"){q.y=-q.y-q.h;}else if(q.kind==="sph")q.y=-q.y;else if(q.kind==="rev"){q.pts.forEach(function(v){v.v=-v.v;});q.pts.reverse();}
    else if(q.axis==="y"){var fy=q.from;q.from=-q.to;q.to=-fy;}else loops(q).forEach(function(loop){(loop || []).forEach(function(v){v.v=-v.v;});loop && loop.reverse();});
  } else if(plane==="plane:front"){
    if(q.kind==="box"){var z0=q.z0;q.z0=-q.z1;q.z1=-z0;}else if(q.kind==="cyl"||q.kind==="sph"||q.kind==="rev")q.z=-q.z;
    else if(q.axis==="z"){var fz=q.from;q.from=-q.to;q.to=-fz;}else loops(q).forEach(function(loop){(loop || []).forEach(function(v){if(q.axis==="x")v.u=-v.u;else v.v=-v.v;});loop && loop.reverse();});
  } else {
    if(q.kind==="box"){var x0=q.x0;q.x0=-q.x1;q.x1=-x0;}else if(q.kind==="cyl"||q.kind==="sph"||q.kind==="rev")q.x=-q.x;
    else if(q.axis==="x"){var fx=q.from;q.from=-q.to;q.to=-fx;}else loops(q).forEach(function(loop){(loop || []).forEach(function(v){v.u=-v.u;});loop && loop.reverse();});
  }
  return q;
}

// Narrow-phase cut scope. No document mutation and no sampled geometry verdict.
export async function exactCutIntersection(part,cut,sourceBrep=null){
  let target,tool;
  try{target=sourceBrep || await exactBrepForPart(part);tool=await toolSolidBrep(cut,partBounds(part),target);return await brepMaterialIntersection(target,tool);}
  finally{if(tool)disposeBrep(tool);if(target && !sourceBrep)disposeBrep(target);}
}
