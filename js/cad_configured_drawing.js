import { extrusionGeometry, loftGeometry } from "./core/profile_mesh_geometry.js";
import { circularSweepTableTarget } from "./cad_configurations.js";
import { assemblyHasExplodedOffsets, explodeLines, explodedOccurrenceOffset } from "./cad_exploded_view.js";
import { nativeOccurrenceBalloonTarget } from "./core/assembly_balloon.js";
import { occurrenceBOMKey } from "./core/assembly_drawing_bom.js";
import { flattenAssembly } from "./core/assembly_structure.js";
import { readLibrarySource } from "./core/model_library_store.js";
import { meshDataTriangles, tessellatePart } from "./core/part_tessellate.js";
import { BoxGeometry, CylinderGeometry, Matrix4, Quaternion, SphereGeometry, Vector3 } from "../vendor/three/three.core.js";
import { curveSegments } from "./sketch_profiles.js";
import { applyRigidMatrix, composeRigidTransforms, partPatternRotations, patternRotationTransform } from "./core/pattern_geometry.js";
import { historyEntryRolled } from "./core/parametric_document.js";
import { sketchWorldPoint } from "./core/swept_sources.js";

const savedComponentDef = (component) => Array.isArray(component.def?.parts)
  ? component.def : readLibrarySource({ kind: "part", key: component.modelKey });
function visibleParts(def) {
  const parts = def?.parts || [];
  const limit = Number.isFinite(def?.rollback) && def.rollback >= 0 ? def.rollback : parts.length;
  return parts.slice(0, limit).filter(part => {
    if (!part || part.suppressed) return false;
    if (def.rollbackIndex == null) return true;
    const index = (def.history || []).findIndex(entry => entry?.kind === "feature" && entry.targetId === part.featureId);
    return index < 0 || !historyEntryRolled(def, index);
  });
}

export function placeDrawingBody(body, matrix, origin, worldPositions) {
  const point = (x, y, z) => ({
    x: matrix[0]*x + matrix[1]*y + matrix[2]*z + origin.x,
    y: matrix[3]*x + matrix[4]*y + matrix[5]*z + origin.y,
    z: matrix[6]*x + matrix[7]*y + matrix[8]*z + origin.z,
  });
  const positionsOf = vertices => {
    const out = new Array(vertices.length);
    for (let i = 0; i < out.length; i += 3) {
      const p = point(vertices[i], vertices[i+1], vertices[i+2]);
      out[i] = p.x; out[i+1] = p.y; out[i+2] = p.z;
    }
    return out;
  };
  const result = { ...body, positions: worldPositions ?? positionsOf(body.positions) };
  if (body.sectionRibs) result.sectionRibs = body.sectionRibs.map(rib => ({
    ...rib, normal: applyRigidMatrix(matrix, rib.normal), positions: positionsOf(rib.positions),
  }));
  // A rotated AABB gives exact extrema only when the axes still coincide.
  delete result.exactBounds;
  const bounds = body.localExactBounds?.bounds ?? body.exactBounds;
  if (!bounds) return result;
  const placement = {matrix, translation:origin};
  const transform = body.localExactBounds ? composeRigidTransforms(placement,body.localExactBounds.transform) : placement;
  if ([0,1,2].every(row => transform.matrix.slice(row*3,row*3+3).filter(n => Math.abs(n)>1e-9).length === 1)) {
    delete result.localExactBounds;
    const { min, max } = bounds;
    const corners = [];
    for (const x of [min.x,max.x]) for (const y of [min.y,max.y]) for (const z of [min.z,max.z]) {
      const p = applyRigidMatrix(transform.matrix,{x,y,z});
      corners.push({x:p.x+transform.translation.x,y:p.y+transform.translation.y,z:p.z+transform.translation.z});
    }
    result.exactBounds = { min: {}, max: {} };
    for (const axis of ['x','y','z']) {
      const values = corners.map(p => p[axis]);
      result.exactBounds.min[axis] = Math.min(...values);
      result.exactBounds.max[axis] = Math.max(...values);
    }
  } else {
    // Keep the kernel bounds in their original frame. A later occurrence
    // rotation can bring those axes back into alignment with the sheet.
    result.localExactBounds = {bounds, transform};
  }
  return result;
}

// buildPart draws these three solids with centered Float32 attributes. Keep
// the center (and the cylinder's orientation) in the mesh transform until
// the occurrence and pattern transforms have been composed.
function viewportPrimitive(part) {
  let geometry;
  const rotation = new Quaternion();
  const center = new Vector3(part.x, part.y, part.z);
  if (part.kind === "box") {
    const size = axis => Math.abs(part[axis+"1"] - part[axis+"0"]) || 0.1;
    geometry = new BoxGeometry(size("x"), size("y"), size("z"));
    center.set((part.x0+part.x1)/2, (part.y0+part.y1)/2, (part.z0+part.z1)/2);
  } else if (part.kind === "cyl") {
    const topRadius = part.r2 ?? part.r;
    const segments = curveSegments(Math.max(part.r,topRadius), Math.PI*2, 24, 96);
    geometry = new CylinderGeometry(topRadius, part.r, part.h, segments);
    const up = new Vector3(0,1,0);
    const axis = part.axis ? new Vector3().copy(part.axis).normalize() : up;
    center.addScaledVector(axis,part.h/2);
    rotation.setFromUnitVectors(up,axis);
  } else if (part.kind === "sph") {
    geometry = new SphereGeometry(part.r,16,12);
  } else return null;
  const m = new Matrix4().makeRotationFromQuaternion(rotation).elements;
  return {
    body:{id:part.id, name:part.name, positions:meshDataTriangles({
      positions:geometry.attributes.position.array, indices:geometry.index.array,
    })},
    transform:{matrix:[m[0],m[4],m[8],m[1],m[5],m[9],m[2],m[6],m[10]], translation:center},
  };
}

export function partSourceBodies(def, parts = visibleParts(def), fallback, {viewportPrecision = false, placement} = {}) {
  return parts.flatMap(part => {
    const nativeMesh = part.exactPending ? null : part.meshData;
    const primitive = viewportPrecision && !nativeMesh && viewportPrimitive(part);
    let body;
    if (!nativeMesh && (part.kind === "loft" || (viewportPrecision && part.kind === "ext"))) {
      const geometry = part.kind === "loft" ? loftGeometry(part) : extrusionGeometry(part);
      if (geometry) body = {id:part.id, name:part.name, positions:meshDataTriangles({
        positions:geometry.attributes.position.array, indices:geometry.index?.array,
      })};
    } else if (viewportPrecision && nativeMesh && !(nativeMesh.positions?.length >= 9)) {
      return [];
    } else {
      body = primitive?.body ?? tessellatePart(part);
    }
    if (!body) return fallback ? fallback(part) : [];
    // The host assembly sheet reads native mesh vertices from a Float32
    // position attribute before applying pattern and occurrence transforms.
    if (viewportPrecision && (nativeMesh?.positions?.length || part.kind === "rev")) {
      body.positions = Float32Array.from(body.positions);
    }
    if (part.meshData?.exactBounds && !part.exactPending) body.exactBounds = part.meshData.exactBounds;
    const rotations = partPatternRotations(part);
    let transform = placement;
    if (rotations.length) transform = composeRigidTransforms(transform,patternRotationTransform(rotations));
    if (primitive) transform = composeRigidTransforms(transform,primitive.transform);
    return [transform ? placeDrawingBody(body,transform.matrix,transform.translation) : body];
  });
}

/* A view whose source is a saved assembly draws every visible occurrence at
   its saved, mated pose. The pose is the assembly's own frame chain
   (sub-assemblies composed), the same one its mates are solved in. Legacy
   library views use the assembled pose until a presentation is selected. */
export function assemblySourceBodies(assembly, { bodiesOf = partSourceBodies, viewportPrecision = false, componentDef = savedComponentDef, includeOffsets = false, lines, balloonTargets, itemByPath } = {}) {
  const bodies = [], centers = new Map();
  const collectCenters = lines && assemblyHasExplodedOffsets(assembly);
  for (const occurrence of flattenAssembly(assembly, { visibleOnly: true })) {
    const def = componentDef(occurrence.component);
    if (!def) throw new Error("Missing assembly component: " + (occurrence.component.name || occurrence.path.join("/")));
    const { origin, x, y, z } = occurrence.placement;
    const matrix = [x.x,y.x,z.x, x.y,y.y,z.y, x.z,y.z,z.z];
    const offset = includeOffsets ? explodedOccurrenceOffset(occurrence) : {x:0,y:0,z:0};
    if (balloonTargets) {
      const item = itemByPath.get(occurrenceBOMKey(occurrence.path));
      const target = nativeOccurrenceBalloonTarget(occurrence,visibleParts(def),item,offset);
      if (target) balloonTargets.push(target);
    }
    const position = {x:origin.x+offset.x, y:origin.y+offset.y, z:origin.z+offset.z};
    const placedBodies = viewportPrecision
      ? partSourceBodies(def,undefined,undefined,{viewportPrecision, placement:{matrix,translation:position}})
      : bodiesOf(def).map(body => placeDrawingBody(body,matrix,position));
    for (const placed of placedBodies) {
      bodies.push({ ...placed, id: occurrence.path.join("/") + ":" + placed.id });
      if (collectCenters) {
        const low = [Infinity,Infinity,Infinity], high = [-Infinity,-Infinity,-Infinity];
        for (let i = 0; i < placed.positions.length; i += 3) {
          for (let axis = 0; axis < 3; axis++) {
            low[axis] = Math.min(low[axis],placed.positions[i+axis]);
            high[axis] = Math.max(high[axis],placed.positions[i+axis]);
          }
        }
        const delta = [offset.x,offset.y,offset.z];
        // A step can move a whole subassembly. Its path starts at the
        // assembled center of all visible descendant meshes.
        for (let depth = 1; depth <= occurrence.path.length; depth++) {
          const key = occurrence.path.slice(0,depth).join('/');
          const bounds = centers.get(key) || {min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};
          for (let axis=0; axis<3; axis++) {
            bounds.min[axis] = Math.min(bounds.min[axis],low[axis]-delta[axis]);
            bounds.max[axis] = Math.max(bounds.max[axis],high[axis]-delta[axis]);
          }
          centers.set(key,bounds);
        }
      }
    }
  }
  if (lines) lines.push(...explodeLines(assembly, (component,target) => {
    const b = centers.get(target.key);
    if (b) return {x:(b.min[0]+b.max[0])/2,y:(b.min[1]+b.max[1])/2,z:(b.min[2]+b.max[2])/2};
  }));
  return bodies;
}

/* A sheet can show several configurations of one part at once. The live
   viewport only has the active configuration's mesh, so generate this simple
   design-table sweep for each view from its two authored dimensions. This is
   a torus only for a circle path with a circular sweep profile; other parts
   retain their exact active bodies until their own configuration renderer is
   available. All distances here are internal centimetres. */
export function configuredBodiesForView(document, view, activeBodies) {
  const cfg = (document?.configurations || []).find(item => item.id === view?.configurationId);
  const values = cfg?.designTableValues;
  if (document?.designTable?.kind !== "circular-sweep" || !values) return activeBodies;
  const target = circularSweepTableTarget(document);
  if (!target || target.sketch.id !== document.designTable.pathSketchId || target.sweep.id !== document.designTable.sweepFeatureId) return activeBodies;
  const centerPoint = target.sketch.points.find(point => point.id === target.circle.c);
  if (!centerPoint) return activeBodies;
  const pathRadius = Number(values.pathDiameterMm) / 20;
  const tubeRadius = Number(values.profileDiameterMm) / 20;
  if (!(pathRadius > tubeRadius && tubeRadius > 0)) return activeBodies;
  const center = sketchWorldPoint(target.sketch, centerPoint.x, centerPoint.y);
  const uPoint = sketchWorldPoint(target.sketch, centerPoint.x + 1, centerPoint.y);
  const vPoint = sketchWorldPoint(target.sketch, centerPoint.x, centerPoint.y + 1);
  const u = { x: uPoint.x - center.x, y: uPoint.y - center.y, z: uPoint.z - center.z };
  const v = { x: vPoint.x - center.x, y: vPoint.y - center.y, z: vPoint.z - center.z };
  const normal = { x: u.y * v.z - u.z * v.y, y: u.z * v.x - u.x * v.z, z: u.x * v.y - u.y * v.x };
  const point = (a, b) => {
    const along = pathRadius + tubeRadius * Math.cos(b);
    return {
      x: center.x + along * (u.x * Math.cos(a) + v.x * Math.sin(a)) + normal.x * tubeRadius * Math.sin(b),
      y: center.y + along * (u.y * Math.cos(a) + v.y * Math.sin(a)) + normal.y * tubeRadius * Math.sin(b),
      z: center.z + along * (u.z * Math.cos(a) + v.z * Math.sin(a)) + normal.z * tubeRadius * Math.sin(b),
    };
  };
  const positions = [];
  const push = (a, b, c) => positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  const around = 64, section = 20;
  for (let i = 0; i < around; i++) for (let j = 0; j < section; j++) {
    const a = point(2 * Math.PI * i / around, 2 * Math.PI * j / section);
    const b = point(2 * Math.PI * (i + 1) / around, 2 * Math.PI * j / section);
    const c = point(2 * Math.PI * (i + 1) / around, 2 * Math.PI * (j + 1) / section);
    const d = point(2 * Math.PI * i / around, 2 * Math.PI * (j + 1) / section);
    push(a, b, c); push(a, c, d);
  }
  return [{ id: target.sweep.id + ":" + cfg.id, name: cfg.name, positions }];
}
