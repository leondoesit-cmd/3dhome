// Authoring capability is a property of the canonical definition, not of the
// screen which happened to create it.  Keep this inference conservative: a
// triangle body with dimensions is still direct geometry, while reconstructed
// analytic features are hybrid until their original design intent is known.

export const AUTHORING_MODES = new Set(["fully-parametric", "hybrid", "direct-only"]);

const DIRECT_FEATURES = new Set(["direct", "import"]);
/* Part kinds rebuilt from their own recipe. Exact regeneration caches its
   triangles on them as meshData; that cache is not direct geometry, and
   counting it labelled a two-feature extrude "hybrid" after its first save. */
const RECIPE_PART_KINDS = new Set(["ext", "rev", "loft", "box", "cyl", "sph", "kernel"]);
const EDITABLE_FEATURES = new Set([
  "box", "cylinder", "sphere", "extrude", "cut", "revolve", "sweep", "loft",
  "fillet", "chamfer", "shell", "mirror", "linearPattern", "circularPattern",
  "pattern", "union", "subtract", "intersect", "component", "assembly", "toolbox",
]);

export function inferAuthoringMode(source = {}) {
  if (AUTHORING_MODES.has(source.authoringMode)) return source.authoringMode;
  const features = Array.isArray(source.features) ? source.features : [];
  const parts = Array.isArray(source.parts) ? source.parts : [];
  const sketches = Array.isArray(source.sketches) ? source.sketches : [];
  const hasDirect = features.some((feature) => DIRECT_FEATURES.has(feature?.type)) ||
    parts.some((part) => part?.kind === "direct" || part?.kind === "mesh" || (!!part?.meshData && !RECIPE_PART_KINDS.has(part?.kind)));
  const hasEditable = features.some((feature) => EDITABLE_FEATURES.has(feature?.type));
  const imported = !!(source.metadata?.import || source.metadata?.imports?.length || source.importedStep);

  if (hasDirect) return hasEditable ? "hybrid" : "direct-only";
  if (imported && hasEditable) return "hybrid";
  if (hasEditable || sketches.length) return "fully-parametric";
  if (parts.length) return "hybrid";
  return "direct-only";
}

