import { measureDim, resolveDimAnchor } from "../cad_sheet.js";
import { framePoint } from "./frame.js";

const close = (a, b) => Math.abs(a - b) < 1e-4;
const ref = (entry, at = "centre") => ({ pid: entry.persistentId, kind: entry.kind, at });
const number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;

function placedRef(entry, at, view, index) {
  const point = resolveDimAnchor(ref(entry, at), index, view.projection?.basis);
  return point ? { ...ref(entry, at), ...point } : null;
}

function findProfileEdge(index, entityId, featureId = null) {
  const suffix = `:edge:profile:${entityId}:start`;
  const entries = [...index.values()].filter(entry => entry.kind === "edge"
    && entry.persistentId?.endsWith(suffix)
    && (!featureId || entry.persistentId.startsWith(`${featureId}:`)
      || entry.persistentId.includes(`${featureId}:tool:`)));
  return entries.sort((a, b) => a.persistentId.localeCompare(b.persistentId))[0] || null;
}

function findCircleEdge(index, entity, sketch, feature) {
  const named = findProfileEdge(index, entity.id, feature.id);
  if (named) return named;
  /* Inner loops of an annular extrusion currently have generated kernel
     names. Bind only a unique final rim matching this feature, radius and
     start-plane centre; another equal-size hole is not an interchangeable
     reference. The resulting drawing still carries its persistent edge ID. */
  const centre = (sketch.points || []).find(point => String(point.id) === String(entity.c));
  if (!centre || feature.type !== "extrude") return null;
  const params = feature.params || {}, u = number(centre.x), v = number(centre.y);
  const w = number(params.from ?? sketch.offset), axis = params.axis
    || (sketch.plane === "front" ? "z" : sketch.plane === "side" ? "x" : "y");
  const origin = sketch.frame ? framePoint(sketch.frame,u,v,w)
    : axis === "x" ? {x:w,y:v,z:u} : axis === "z" ? {x:u,y:v,z:w} : {x:u,y:w,z:v};
  const candidates = [...index.values()].filter(entry => entry.kind === "edge"
    && entry.persistentId?.startsWith(`${feature.id}:`)
    && entry.descriptor?.curve === "circle"
    && close(number(entry.descriptor.radius),number(entity.r))
    && entry.descriptor.origin
    && Math.hypot(entry.descriptor.origin.x-origin.x,entry.descriptor.origin.y-origin.y,
      entry.descriptor.origin.z-origin.z) < 1e-4);
  return candidates.length === 1 ? candidates[0] : null;
}

function sketchRoundEntity(entity, sketch) {
  if (!entity || !["circle","arc"].includes(entity.type)) return null;
  if (entity.type === "circle") return entity;
  const centre = (sketch.points || []).find(point => String(point.id) === String(entity.c));
  const endpoint = (sketch.points || []).find(point => String(point.id) === String(entity.a));
  return centre && endpoint ? {...entity,r:Math.hypot(endpoint.x-centre.x,endpoint.y-centre.y)} : null;
}

function viewFor(scene, dir) {
  return scene.views.find(view => view.view?.dir === dir && view.projection?.basis) || null;
}

function faceOnView(edge, views) {
  const axis = edge?.descriptor?.axis;
  if (!axis) return null;
  return views.find(view => {
    const forward = view?.projection?.basis?.forward;
    return forward && Math.abs(axis.x*forward.x + axis.y*forward.y + axis.z*forward.z) > .9;
  }) || null;
}

function roundLeaderAngle(edge, view) {
  const midpoint=edge?.descriptor?.arcMidpoint,origin=edge?.descriptor?.origin,basis=view?.projection?.basis;
  if(!midpoint || !origin || !basis)return -Math.PI/4;
  const dx=midpoint.x-origin.x,dy=midpoint.y-origin.y,dz=midpoint.z-origin.z;
  return Math.atan2(-(dx*basis.up.x+dy*basis.up.y+dz*basis.up.z),dx*basis.right.x+dy*basis.right.y+dz*basis.right.z);
}

function seen(doc, planned, candidate) {
  const prior = (doc.dims || []).concat(planned);
  if (prior.some(dim => dim.modelItem === candidate.modelItem)) return true;
  /* A manual terminal callout already tells the reader the same size. Keep
     Insert Model Items repeatable, and avoid a second equal-diameter label. */
  if (["diameter", "radius"].includes(candidate.type))
    return prior.some(dim => dim.type === candidate.type && close(number(dim.radius), number(candidate.radius))
      && (!(dim.refs || []).some(ref=>ref.pid) || (dim.refs || []).some(ref=>(candidate.refs || []).some(next=>next.pid===ref.pid))));
  return prior.some(dim => dim.type === candidate.type && close(measureDim(dim), measureDim(candidate))
    && dim.viewId === candidate.viewId);
}

/** Plan only dimensions that can bind to named final-model topology. */
export function planModelItems(def, doc, scene) {
  const index = scene?.topologyIndex;
  if (!index?.size) return [];
  const planned = [];
  const push = candidate => { if (candidate && !seen(doc, planned, candidate)) planned.push(candidate); };
  const front = viewFor(scene, "front"), top = viewFor(scene, "top"), right = viewFor(scene, "right");
  const features = (def.features || []).filter(feature => !feature.suppressed);

  /* Extrude length, measured between the feature's start and end planes. A
     later fillet can shorten the visible corner; the design depth does not. */
  for (const feature of features.filter(item => item.type === "extrude" && item.params?.operation !== "subtract")) {
    const start = index.get(`${feature.id}:face:start`), end = index.get(`${feature.id}:face:end`);
    if (!start || !end) continue;
    for (const view of [front, right, top].filter(Boolean)) {
      const a = placedRef(start, "centre", view, index), b = placedRef(end, "centre", view, index);
      if (!a || !b) continue;
      const du = Math.abs(b.u - a.u), dv = Math.abs(b.v - a.v);
      if (Math.max(du, dv) < 1e-4 || Math.min(du, dv) > Math.max(du, dv) * .02) continue;
      const type = dv > du ? "vertical" : "horizontal";
      push({ type, viewId:view.id, refs:[a,b], offset:type === "vertical" ? -22 : -14,
        modelItem:`feature:${feature.id}:depth` });
      break;
    }
  }

  for (const sketch of def.sketches || []) {
    const sketchFeatures = features.filter(item => item.params?.sketchId === sketch.id);
    if (!sketchFeatures.length) continue;
    const entities = new Map((sketch.entities || []).map(entity => [String(entity.id), entity]));
    const circlesByPoint = new Map((sketch.entities || []).filter(entity => entity.type === "circle")
      .map(entity => [String(entity.c), entity]));
    for (const constraint of (sketch.constraints || []).filter(item => !item.driven)) {
      const key = `sketch:${sketch.id}:constraint:${constraint.id}`;
      // A sketch may supply multiple independently consumed profile regions.
      // Bind an entity dimension to its consuming feature, not the first boss.
      const dimensionEntity=entities.get(String(constraint.entity));
      const consumedIds=dimensionEntity?.type==='line' && dimensionEntity.construction
        ? (sketch.entities || []).filter(entity=>entity.type==='arc' && [dimensionEntity.a,dimensionEntity.b].some(id=>String(id)===String(entity.c))).map(entity=>entity.id)
        : [constraint.entity];
      const feature = constraint.entity == null ? sketchFeatures[0] : sketchFeatures.find(item => {
        const ids = item.params?.profileEntityIds;
        const holes = item.params?.holeProfileEntityIds || [];
        return Array.isArray(ids) && ids.concat(holes.flat()).some(id => consumedIds.some(sourceId=>String(id)===String(sourceId)));
      }) || sketchFeatures.find(item => !Array.isArray(item.params?.profileEntityIds));
      if(!feature)continue;
      if (constraint.type === "diameter" || constraint.type === "radius") {
        const entity = entities.get(String(constraint.entity));
        const round = sketchRoundEntity(entity, sketch);
        const edge = round ? findCircleEdge(index, round, sketch, feature) : null;
        /* A circle must be called out in an end view. On a shaft sketched on
           Front, the Top projection is its side and a diameter leader there
           points at the wrong silhouette even though its value is correct. */
        const view = faceOnView(edge, [top, front, right].filter(Boolean));
        const centre = edge && view ? placedRef(edge, "centre", view, index) : null;
        if (centre && close(number(edge.descriptor?.radius) * (constraint.type === "diameter" ? 2 : 1), number(constraint.value)))
          push({type:constraint.type,viewId:view.id,refs:[centre],radius:number(edge.descriptor.radius),
            offset:9,angle:roundLeaderAngle(edge,view),modelItem:key});
      } else if (constraint.type === "distance" && constraint.a != null && constraint.b != null) {
        const first = circlesByPoint.get(String(constraint.a)), second = circlesByPoint.get(String(constraint.b));
        const edgeA = first && findProfileEdge(index, first.id), edgeB = second && findProfileEdge(index, second.id);
        const view = top || front || right;
        const a = edgeA && view ? placedRef(edgeA, "centre", view, index) : null;
        const b = edgeB && view ? placedRef(edgeB, "centre", view, index) : null;
        if (a && b && close(Math.hypot(b.u-a.u,b.v-a.v),number(constraint.value)))
          push({type:"aligned",viewId:view.id,refs:[a,b],offset:13,modelItem:key});
      } else if (constraint.type === "distance" && constraint.entity != null) {
        const entity = entities.get(String(constraint.entity));
        if (entity?.construction && entity.type === "line") {
          // A slot's construction centreline does not survive as a solid edge.
          // Its design length binds to the two resulting cap centres instead.
          const caps = [entity.a,entity.b].map(pointId =>
            (sketch.entities || []).find(item => item.type === "arc" && String(item.c) === String(pointId)));
          const edges = caps.map(cap => { const round=sketchRoundEntity(cap,sketch); return round && findCircleEdge(index,round,sketch,feature); });
          const view=faceOnView(edges[0],[front,top,right].filter(Boolean));
          const anchors=edges.map(edge => edge && view && placedRef(edge,"centre",view,index));
          const [a,b]=anchors;
          if(a && b && close(Math.hypot(b.u-a.u,b.v-a.v),number(constraint.value)))
            push({type:"aligned",viewId:view.id,refs:[a,b],offset:-16,modelItem:key});
          continue;
        }
        const edge = entity?.type === "line" ? findProfileEdge(index, entity.id, feature.id) : null;
        const view = top || front || right;
        const a = edge && view ? placedRef(edge, "a", view, index) : null;
        const b = edge && view ? placedRef(edge, "b", view, index) : null;
        if (!a || !b) continue;
        const type = Math.abs(b.u-a.u) >= Math.abs(b.v-a.v) ? "horizontal" : "vertical";
        if (close(type === "horizontal" ? Math.abs(b.u-a.u) : Math.abs(b.v-a.v),number(constraint.value)))
          push({type,viewId:view.id,refs:[a,b],offset:type === "horizontal" ? -12 : 12,modelItem:key});
      }
    }
  }

  /* Fillet radii stay tied to their resulting circular edge, so editing a
     feature radius updates both the arc and its drawing value. */
  for (const feature of features.filter(item => item.type === "fillet" && number(item.params?.radius) > 0)) {
    const radius = number(feature.params.radius);
    const candidates = [...index.values()].filter(entry => entry.kind === "edge"
      && entry.persistentId?.startsWith(`${feature.id}:`)
      && entry.descriptor?.curve === "circle"
      && close(number(entry.descriptor.radius), radius));
    for (const view of [top, front, right].filter(Boolean)) {
      const basis = view.projection.basis;
      const edge = candidates.find(entry => {
        const axis = entry.descriptor?.axis;
        return axis && Math.abs(axis.x*basis.forward.x+axis.y*basis.forward.y+axis.z*basis.forward.z) > .9;
      });
      const centre = edge && placedRef(edge, "centre", view, index);
      if (!centre) continue;
      push({type:"radius",viewId:view.id,refs:[centre],radius,offset:9,
        angle:-Math.PI/4,modelItem:`feature:${feature.id}:radius`});
      break;
    }
  }
  return planned;
}
