import { analyzeSketchProfiles } from '../sketch_profiles.js';
import { resolveProfilePoints } from '../sketch_solver.js';
import { sketchProfileSegments } from './profile_curves.js';

// Replacing the geometry of a consumed sketch gives the new entities new IDs.
// Rebind only when the owning feature has lost an entity and there is exactly
// one closed replacement loop which no other feature on that sketch owns.
// Choosing among multiple loops here would silently change design intent.
export function rebindReplacedSketchProfiles(document, sketchId = null) {
  const repairs = [];
  const sketches = new Map((document.sketches || []).map(sketch => [sketch.id, sketch]));
  const features = document.features || [];
  for (const feature of features) {
    const params = feature.params || {};
    const ids = params.profileEntityIds;
    if (!Array.isArray(ids) || !ids.length || !params.sketchId) continue;
    if (sketchId && params.sketchId !== sketchId) continue;
    // Multi-region profiles and inner loops need an explicit profile picker.
    if (params.regionProfileEntityIds?.length || params.holeProfileEntityIds?.length) continue;
    const sketch = sketches.get(params.sketchId);
    if (!sketch) continue;
    const live = new Set((sketch.entities || []).map(entity => entity.id));
    if (ids.every(id => live.has(id)) || resolveProfilePoints(sketch, ids)) continue;
    const claimed = new Set();
    for (const other of features) {
      if (other === feature || other.params?.sketchId !== sketch.id) continue;
      for (const id of other.params?.profileEntityIds || []) if (live.has(id)) claimed.add(id);
      for (const group of other.params?.holeProfileEntityIds || [])
        for (const id of group || []) if (live.has(id)) claimed.add(id);
      for (const group of other.params?.regionProfileEntityIds || [])
        for (const id of group || []) if (live.has(id)) claimed.add(id);
    }
    const candidates = analyzeSketchProfiles(sketch, { tolerance:0.05 }).profiles
      .filter(profile => profile.entityIds.every(id => !claimed.has(id)));
    if (candidates.length !== 1) continue;
    const profile = candidates[0];
    if (!resolveProfilePoints(sketch, profile.entityIds)) continue;
    const before = [...ids];
    params.profileEntityIds = [...profile.entityIds];
    if (feature.references?.profileEntityIds) feature.references.profileEntityIds = [...profile.entityIds];
    for (const part of document.parts || []) {
      if (part.featureId === feature.id && part.sketchId === sketch.id && part.profileEntityIds?.length) {
        part.profileEntityIds = [...profile.entityIds];
        part.pts = structuredClone(profile.points);
        part.profileError = false;
        delete part.meshData;
      }
      for (const cut of part.cuts3d || []) {
        if (cut.featureId !== feature.id) continue;
        cut.loop = structuredClone(profile.points);
        const segments = sketchProfileSegments(sketch, profile.entityIds);
        if (segments) cut.segments = segments;
        else delete cut.segments;
        delete part.meshData;
      }
    }
    repairs.push({ featureId:feature.id, sketchId:sketch.id, oldEntityIds:before, newEntityIds:[...profile.entityIds] });
  }
  return repairs;
}
