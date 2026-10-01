import { createFeatureDefinition, createSketchDefinition } from "./parametric_document.js";
import { pruneAbandonedSketches } from "../sketch_solver.js";

// Toolbox outlines are authored by a visible generator, but still need a
// persistent base feature before a bore, finish, or mate can depend on them.
export function registerGeneratedExtrusion(document, part) {
  if (part.kind !== "ext" || !Array.isArray(part.pts) || part.pts.length < 3) throw new Error("Generated extrusion needs a closed outline");
  const depth = Math.abs(Number(part.to) - Number(part.from));
  if (!(depth > 0)) throw new Error("Generated extrusion needs positive depth");
  const points=part.pts.map((point,i)=>({id:"generated:"+part.id+":p"+i,x:point.u,y:point.v,fixed:true}));
  const entities=points.map((point,i)=>({id:"generated:"+part.id+":e"+i,type:"line",a:point.id,b:points[(i+1)%points.length].id}));
  // Generated outlines use fixed coordinates, as converted edges do. A dense
  // Fix equation for every sample would build a quadratic rank matrix despite
  // there being no free design coordinates in the generated curve.
  const sketch=createSketchDefinition(document,{referenceId:"plane:top",name:part.name+" outline",points,entities});
  sketch.plane="top";sketch.offset=Number(part.from)||0;
  // Samples already share endpoint identities. Manual sketch healing distance
  // would collapse adjacent samples of the rack-generated involute.
  sketch.profileTolerance=1e-6;
  const feature = createFeatureDefinition(document, "extrude", {
    name: part.name,
    references:{sketches:[sketch.id]},
    params: {axis:part.axis || "y", from:part.from, to:part.to, depth, points:part.pts, holes:part.holes || [], profileEntityIds:entities.map(entity=>entity.id), sketchId:sketch.id, operation:"new-body", mergeResult:false},
  });
  part.featureId = feature.id;
  part.sketchId=sketch.id;part.profileEntityIds=entities.map(entity=>entity.id);part.sketchDriven=true;
  document.activeSketch=sketch.id;
  pruneAbandonedSketches(document);
  return feature;
}
