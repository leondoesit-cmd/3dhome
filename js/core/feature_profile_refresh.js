import { analyzeSketchProfiles } from "../sketch_profiles.js";
import { featureAreas, sketchRegions } from "../sketch_regions.js";

// Rebind an existing cut to the region currently enclosed by its own sketch.
// The editor retains the feature id and inputs, so downstream history keeps
// pointing at the same cut. Multiple regions require an explicit contour
// choice and are refused here instead of silently broadening the cut.
export function refreshedCutProfile(feature, sketch) {
  if (feature?.type !== "extrudeCut" || !sketch || feature.params?.sketchId !== sketch.id)
    throw new Error("This cut has no matching source sketch");
  const analysis = analyzeSketchProfiles(sketch, { tolerance:0.05 });
  const areas = featureAreas(analysis, sketchRegions(sketch, { tolerance:0.05 }));
  if (areas.length !== 1)
    throw new Error(areas.length ? "Sketch has multiple contours; select one before rebuilding the cut" : "Sketch has no closed cut contour");
  const area = areas[0];
  const params = { ...feature.params };
  for (const key of ["points", "profileEntityIds", "holeProfileEntityIds", "holes", "regions", "regionProfileEntityIds"])
    delete params[key];
  if (area.entityIds) {
    params.profileEntityIds = [...area.entityIds];
    params.holeProfileEntityIds = (area.holeEntityIds || []).map(ids=>[...ids]);
    params.holes = structuredClone(area.holes || []);
  } else {
    params.points = (area.points || []).map(point=>({ u:point.u, v:point.v }));
  }
  const references = structuredClone(feature.references || {});
  references.sketches = [sketch.id];
  if (area.entityIds) references.profileEntityIds = [...area.entityIds];
  else delete references.profileEntityIds;
  return { params, references, holeCount:(area.holes || []).length };
}
