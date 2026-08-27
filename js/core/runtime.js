// Lightweight runtime projection.  Games and physics consume these boxes and
// interaction records; no sketch solve or CAD kernel work happens per frame.

function rotatePoint(x, z, angle) {
  const c = Math.cos(angle), s = Math.sin(angle);
  return { x: x * c - z * s, z: x * s + z * c };
}

export function createRuntimeRepresentation(instance, rebuild, definition) {
  const bounds = rebuild.bounds;
  const x = Number(instance.x ?? instance.transform?.position?.x) || 0;
  const y = Number(instance.elev ?? instance.transform?.position?.y) || 0;
  const z = Number(instance.z ?? instance.transform?.position?.z) || 0;
  const rotation = -(Number(instance.rot) || 0) * Math.PI / 180;
  const corners = [
    rotatePoint(bounds.min.x, bounds.min.z, rotation), rotatePoint(bounds.min.x, bounds.max.z, rotation),
    rotatePoint(bounds.max.x, bounds.min.z, rotation), rotatePoint(bounds.max.x, bounds.max.z, rotation),
  ];
  const collision = {
    x0: x + Math.min(...corners.map((point) => point.x)),
    x1: x + Math.max(...corners.map((point) => point.x)),
    z0: z + Math.min(...corners.map((point) => point.z)),
    z1: z + Math.max(...corners.map((point) => point.z)),
    y0: y + bounds.min.y,
    y1: y + bounds.max.y,
    item: instance,
    source: "parametric-runtime",
  };
  return {
    instanceId: instance.id,
    definitionId: definition.id,
    definitionRevision: definition.revision,
    signature: rebuild.signature,
    collision: [collision],
    navigation: { obstacles: [collision], walkable: definition.metadata?.walkable || [] },
    snaps: definition.metadata?.snaps || [
      { type: "center", x, y, z },
      { type: "back", x, y, z: collision.z0 },
    ],
    interactions: definition.metadata?.interactions || [],
    lod: definition.metadata?.lod || { normal: rebuild.signature, preview: rebuild.signature },
    metadata: {
      kind: definition.kind, authoringMode: definition.authoringMode,
      source: definition.metadata?.source,
      importFormat: definition.metadata?.import?.format,
      workingUnit: definition.metadata?.import?.workingUnit || "cm",
      hasExactSource: !!definition.metadata?.import?.exactSource,
      hierarchy: definition.metadata?.import?.hierarchy || definition.metadata?.hierarchy || [],
    },
  };
}

export function runtimeCollisionRects(state, options = {}) {
  const pad = Number(options.pad) || 0;
  const runtime = state?.parametric?.runtime || {};
  // Only pieces that are still in the plan. rebuildProject() prunes this map,
  // but anything that replaces the model without re-deriving it leaves records
  // behind — and a stale record here becomes solid, invisible geometry in
  // every game mode that builds its collision from this.
  const live = new Set((state?.items || []).map((item) => String(item?.id)));
  const out = [];
  Object.keys(runtime).forEach((id) => {
    if (!live.has(String(id))) return;
    (runtime[id]?.collision || []).forEach((box) => out.push({
      ...box,
      x0: box.x0 - pad, x1: box.x1 + pad,
      z0: box.z0 - pad, z1: box.z1 + pad,
    }));
  });
  return out;
}

export function hasRuntimeRepresentation(state, item) {
  return !!(item && state?.parametric?.runtime?.[item.id]);
}

export function refreshRuntimePlacement(state, item) {
  const project = state?.parametric;
  const derived = item && project?.derived?.[item.id];
  const definition = derived && project?.definitions?.[derived.definitionId];
  if (!derived || !definition) return null;
  const runtime = createRuntimeRepresentation(item, {
    bounds: derived.bounds,
    signature: derived.signature,
  }, definition);
  project.runtime[item.id] = runtime;
  return runtime;
}

export function refreshRuntimePlacements(state) {
  (state?.items || []).forEach((item) => refreshRuntimePlacement(state, item));
  return state?.parametric?.runtime || {};
}
