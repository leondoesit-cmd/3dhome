import { analyzeSketchProfiles } from "../sketch_profiles.js";
import { featureAreas, sketchRegions } from "../sketch_regions.js";

// Rebind a solid extrusion to the region enclosed by its own sketch.
// The editor retains the feature id and inputs, so downstream history keeps
// pointing at the same feature. Multiple regions require an explicit contour
// choice and are refused here instead of silently broadening the feature.
export function refreshedExtrudeProfile(feature, sketch) {
  if (!["extrude","extrudeCut"].includes(feature?.type) || !sketch || feature.params?.sketchId !== sketch.id)
    throw new Error("This extrusion has no matching source sketch");
  if(feature.params.thinFeature)throw new Error("Thin extrusion uses open-chain selection; refresh its Thin paths instead");
  const analysis = analyzeSketchProfiles(sketch, { tolerance:0.05 });
  const areas = featureAreas(analysis, sketchRegions(sketch, { tolerance:0.05 }));
  if (areas.length !== 1)
    throw new Error(areas.length ? "Sketch has multiple contours; select one before rebuilding the extrusion" : "Sketch has no closed extrusion contour");
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

export function refreshedCutProfile(feature, sketch) {
  if(feature?.type!=="extrudeCut")throw new Error("This cut has no matching source sketch");
  return refreshedExtrudeProfile(feature,sketch);
}
