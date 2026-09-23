/* A part kind whose solid only the OpenCascade kernel can produce.
 *
 * Every other part kind in the model editor is a recipe the legacy mesh engine
 * can draw by itself: a box, an extrusion, a lathe, a linear loft between two
 * rings. Sweep along a path, loft through N sections, thicken, rib, split — the
 * result of those is a BREP, and nothing but the kernel knows its shape. Before
 * this kind existed those features could create a history row and an exact
 * BREP run (STEP/IGES export saw them) while the viewport drew NOTHING, because
 * `E.def.parts` had no way to hold the answer.
 *
 * A kernel body is NOT a frozen mesh blob. `part.kernel` is the recipe —
 * {type, params} copied from the feature that produced it — and `part.meshData`
 * is a cache of the last tessellation of that recipe. Editing the feature's
 * parameters replaces the recipe and drops the cache, exactly as editing an
 * extrude's depth rewrites part.from/part.to.
 *
 * The kernel is asynchronous, so the mesh arrives after the command returns.
 * The interval is handled the way `queueExactMesh` already handles it: the part
 * carries exactPending/exactError, the inspector shows the ⏳ / ⚠ note those
 * fields drive, and buildPart draws nothing for a part with no mesh. This kind
 * has no analytic fallback to fall back TO — that is the whole reason it
 * exists — so "pending" shows an empty space rather than a stand-in solid that
 * would be a different shape from the answer. A failed build leaves
 * exactError set and no meshData and no bounds: the step fails alone and no
 * ghost body is left behind.
 */

import { disposeBrep, extractBrepTopology, makeBrepLoft, makeBrepSweep, shapeToMeshData, translateBrep } from "../cad_kernel.js";
import { helixSweepPath } from "../cad_helix.js";

export const KERNEL_BODY_KIND = "kernel";

/* Feature types whose result is a kernel-built solid carried by this kind.
   Thicken / rib / split-body / move-body join this list, not a new part kind. */
export const KERNEL_BODY_FEATURES = new Set(["sweep", "loft"]);

export function isKernelBody(part) {
  return !!part && part.kind === KERNEL_BODY_KIND;
}

export function featureBuildsKernelBody(type) {
  return KERNEL_BODY_FEATURES.has(type);
}

function point(value) {
  return { x: Number(value && value.x) || 0, y: Number(value && value.y) || 0, z: Number(value && value.z) || 0 };
}

function points(list) {
  return (Array.isArray(list) ? list : []).map(point);
}

/* The recipe, normalised down to what the kernel actually reads. Anything the
   kernel would ignore is dropped here rather than stored and quietly lost. */
export function kernelBodySpec(type, params) {
  const source = params || {};
  if (type === "sweep") {
    return {
      type: "sweep",
      params: {
        profile: points(source.profile),
        path: points(source.path),
        ...(source.pathSegments?{pathSegments:structuredClone(source.pathSegments)}:{}),
        ...(source.profileSegments?{profileSegments:structuredClone(source.profileSegments)}:{}),
        // spread, not `helix: undefined` — a key set to undefined disappears on
        // JSON.stringify, and the recipe has to compare equal after a save
        ...(source.helix ? { helix: { ...source.helix } } : {}),
        orientation: source.orientation || "follow-path",
        twistAngle: Number(source.twistAngle) || 0,
        scale: Number(source.scale) > 0 ? Number(source.scale) : 1,
        solid: source.solid !== false,
      },
    };
  }
  if (type === "loft") {
    return {
      type: "loft",
      params: {
        sections: (Array.isArray(source.sections) ? source.sections : []).map(points),
        solid: source.solid !== false,
        ruled: !!source.ruled,
        matchProfiles: source.matchProfiles !== false,
        continuity: source.continuity || "position",
        tolerance: Number(source.tolerance) > 0 ? Number(source.tolerance) : 0.001,
      },
    };
  }
  throw new Error("Unsupported kernel body: " + type);
}

/* The kernel call itself. Separate from meshing so a caller that wants the
   solid — STEP export, a later boolean, mass properties — can have it. */
export async function buildKernelBrep(spec, options = {}) {
  if (!spec || !spec.type) throw new Error("Kernel body has no recipe");
  const params = spec.params || {};
  let brep;
  if (spec.type === "sweep") {
    // A sweep along a helix stores the helix, not its samples, so an edited
    // pitch or turn count rebuilds the same way the feature tree rebuilds it.
    // Its spine is the smooth curve, never the samples (see helixSweepPath).
    const spine = params.helix && !params.pathSegments ? helixSweepPath(params.helix)
      : { path: (params.path || []).length >= 2 ? params.path : [] };
    brep = await makeBrepSweep({ ...params, ...spine });
  } else if (spec.type === "loft") {
    brep = await makeBrepLoft(params);
  } else throw new Error("Unsupported kernel body: " + spec.type);
  const origin = options.origin;
  if (origin && (origin.x || origin.y || origin.z)) {
    const moved = await translateBrep(brep, origin);
    disposeBrep(brep);
    brep = moved;
  }
  if (options.ownerFeatureId) extractBrepTopology(brep, { ownerFeatureId: options.ownerFeatureId });
  return brep;
}

export function meshDataBounds(positions) {
  const list = positions || [];
  if (list.length < 9) return null;
  const b = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity, z0: Infinity, z1: -Infinity };
  for (let i = 0; i + 2 < list.length; i += 3) {
    const x = Number(list[i]), y = Number(list[i + 1]), z = Number(list[i + 2]);
    if (x < b.x0) b.x0 = x; if (x > b.x1) b.x1 = x;
    if (y < b.y0) b.y0 = y; if (y > b.y1) b.y1 = y;
    if (z < b.z0) b.z0 = z; if (z > b.z1) b.z1 = z;
  }
  return Number.isFinite(b.x0) ? b : null;
}

/* Build and tessellate in one step, releasing the BREP either way.
 *
 * The normals and vertex colours shapeToMeshData returns are Float32Arrays, and
 * a saved model goes through JSON.stringify — a typed array comes back as
 * {"0":..,"1":..} and renders as nothing. positions is already a plain Array
 * for exactly that reason; rather than convert two more buffers, drop them:
 * buildExactMesh() calls computeVertexNormals() when normals are absent, and a
 * triangle soup gets the correct flat normals from it. */
export async function kernelBodyMeshData(spec, options = {}) {
  const brep = await buildKernelBrep(spec, options);
  try {
    const mesh = await shapeToMeshData(brep, { deflection: 0.28, angle: 0.18 });
    const positions = Array.from(mesh.positions, Number);
    return {
      positions,
      faceRanges: mesh.faceRanges,
      subshapeMap: mesh.subshapeMap,
      topology: JSON.parse(JSON.stringify(brep.topology || [])),
      bounds: meshDataBounds(positions),
      exactBounds: mesh.exactBounds,
    };
  } finally { disposeBrep(brep); }
}

/* A kernel body is placed by an offset applied after the build, because its
   recipe lives in the sketch coordinates the feature was authored in. Moving
   the body moves the offset; the cached mesh and bounds are moved in step by
   the caller so the viewport does not have to wait for a rebuild to redraw. */
export function offsetKernelBody(part, dx, dy, dz) {
  if (!isKernelBody(part)) return part;
  part.origin = part.origin || { x: 0, y: 0, z: 0 };
  part.origin.x += dx; part.origin.y += dy; part.origin.z += dz;
  if (part.bounds) {
    part.bounds.x0 += dx; part.bounds.x1 += dx;
    part.bounds.y0 += dy; part.bounds.y1 += dy;
    part.bounds.z0 += dz; part.bounds.z1 += dz;
  }
  return part;
}

/* Bounds for a body whose mesh has not arrived (or never will). There is no
   honest answer, and inventing a block would put a phantom in defBounds(),
   the camera fit and every snap. Callers treat null as "this body contributes
   nothing yet". */
export function kernelBodyBounds(part) {
  if (!isKernelBody(part)) return null;
  if (part.bounds && Number.isFinite(part.bounds.x0)) return { ...part.bounds };
  return meshDataBounds(part.meshData && part.meshData.positions);
}
