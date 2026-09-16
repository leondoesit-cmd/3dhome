import {splineControls} from "../sketch_spline.js";
/* The sketches a sweep or a loft is driven by, and the plane their points live
   on. A module of its own so both the editor and its tests can ask the same
   question without loading the browser. */
import { framePoint } from "./frame.js";
import { analyzeSketchChains, analyzeSketchProfiles } from "../sketch_profiles.js";
import { sampleHelix } from "../cad_helix.js";
import { helixFromSketch } from "./sketch_helix.js";

function planeAxis(plane) { return plane === "top" ? "y" : plane === "front" ? "z" : "x"; }

function sketchById(def, id) { return ((def && def.sketches) || []).find(function (item) { return item && item.id === id; }) || null; }

/* WHERE A SWEEP PROFILE, A SWEEP PATH AND A LOFT SECTION LIVE.
 *
 * These are stored as 3D world points, unlike an extrude's 2D u/v, so somebody
 * has to say which plane a sketch's u/v sit on. Nobody did: every sweep and
 * loft mapped (u,v) -> (x,y) whatever plane its sketch was on. That is right
 * for a FRONT-plane sketch and silently wrong for the other two — and it is
 * why a sweep along a helix built a zero-volume sheet, the profile lying in
 * the plane its own path ran along.
 *
 * The rule is now the one every other sketch-driven feature already obeys: the
 * sketch's OWN plane, or its local frame — the same mapping cad_kernel applies
 * to an extrusion drawn on the same sketch. That is what makes re-derivation
 * mean anything: move the sketch's plane and the swept body moves with it. */
export function sketchWorldPoint(sketch, u, v) {
  if (sketch && sketch.frameSpace === "local" && sketch.frame) return framePoint(sketch.frame, u, v, 0);
  var axis = planeAxis(sketch && sketch.plane), w = Number(sketch && sketch.offset) || 0;
  if (axis === "x") return { x: w, y: v, z: u };
  if (axis === "z") return { x: u, y: v, z: w };
  return { x: u, y: w, z: v };
}

/* The sketches a sweep or a loft is DRIVEN by, re-read.
 *
 * The profile, path and sections used to be snapshotted into params at
 * creation and never looked at again, so editing the driving sketch left the
 * body behind — a staleness bug you could not see until these bodies started
 * drawing in the viewport. `sketchSources` records what to re-read; a source
 * that no longer resolves returns null and the last good shape is kept, the
 * same answer syncSketchDrivenParts gives an extrusion. */
export function sampleSketchPath(sketch, entityIds) {
  if (!sketch) return null;
  var entities=(sketch.entities || []).filter(function(e){return !e.construction && (!entityIds || !entityIds.length || entityIds.includes(e.id));});
  if (entityIds && entityIds.some(function(id){return !entities.some(function(e){return e.id===id;});})) return null;
  var selected={...sketch,entities:entities}, chains=analyzeSketchChains(selected).chains, profiles=analyzeSketchProfiles(selected).profiles;
  var paths=chains.concat(profiles);
  if(paths.length!==1 || paths[0].entityIds.length!==entities.length)return null;
  var points=paths[0].points.slice();
  if(profiles.length)points.push({...points[0]});
  return points.map(function(q){return sketchWorldPoint(sketch,q.u,q.v);});
}

export function sketchPathSegments(sketch,entityIds){
  if(!sketch)return null;
  const selected={...sketch,entities:(sketch.entities||[]).filter(e=>!e.construction&&(!entityIds?.length||entityIds.includes(e.id)))};
  const paths=analyzeSketchChains(selected).chains.concat(analyzeSketchProfiles(selected).profiles);
  if(paths.length!==1||paths[0].entityIds.length!==selected.entities.length)return null;
  const ordered=paths[0].ordered || (selected.entities.length===1 && selected.entities[0].type==="circle"?[{entity:selected.entities[0],forward:true}]:null);
  if(!ordered)return null;
  const points=new Map(sketch.points.map(p=>[p.id,p])),world=p=>sketchWorldPoint(sketch,p.x,p.y);
  return ordered.flatMap(({entity:e,forward})=>{
    if(e.type==='circle'){const c=points.get(e.c??e.center),r=Number(e.r??e.radius),at=a=>world({x:c.x+r*Math.cos(a),y:c.y+r*Math.sin(a)}),sign=forward?1:-1;return [0,1].map(i=>({type:"arc",from:at(sign*i*Math.PI),mid:at(sign*(i+.5)*Math.PI),to:at(sign*(i+1)*Math.PI)}));}
    if(e.type==='spline'){const c=splineControls(e,points);if(!c)throw new Error('Invalid spline controls');return {type:'bezier',controls:(forward?c:c.slice().reverse()).map(world)};}
    const a=points.get(e.a),b=points.get(e.b);
    if(e.type==='line')return {type:'line',from:world(forward?a:b),to:world(forward?b:a)};
    const c=points.get(e.c??e.center),start=Math.atan2(a.y-c.y,a.x-c.x),end=Math.atan2(b.y-c.y,b.x-c.x),span=(end-start+2*Math.PI)%(2*Math.PI)||2*Math.PI,r=Math.hypot(a.x-c.x,a.y-c.y);
    return {type:'arc',from:world(forward?a:b),to:world(forward?b:a),mid:world({x:c.x+r*Math.cos(start+span/2),y:c.y+r*Math.sin(start+span/2)})};
  });
}

export function circularSweepProfile(sketch, diameter, entityIds) {
  diameter=Number(diameter);if(!(diameter>0))throw new Error("Circular profile diameter must be positive");
  const path=sampleSketchPath(sketch,entityIds),segments=sketchPathSegments(sketch,entityIds);
  if(!path || !segments?.length)throw new Error("Select one connected sweep path");
  const start=segments[0].from,entities=sketch.entities.filter(e=>!e.construction && (!entityIds?.length || entityIds.includes(e.id)));
  const sub=(a,b)=>({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z}),cross=(a,b)=>({x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x}),unit=a=>{const n=Math.hypot(a.x,a.y,a.z);return {x:a.x/n,y:a.y/n,z:a.z/n};};
  let tangent;
  if(entities[0]?.type==="circle"){
    const c=sketch.points.find(p=>p.id===(entities[0].c??entities[0].center)),center=sketchWorldPoint(sketch,c.x,c.y),origin=sketchWorldPoint(sketch,0,0);
    const normal=cross(sub(sketchWorldPoint(sketch,1,0),origin),sub(sketchWorldPoint(sketch,0,1),origin));
    tangent=unit(cross(normal,sub(start,center)));
  }else if(segments[0].type==="line")tangent=unit(sub(segments[0].to,start));
  else throw new Error("Circular profiles currently require a line or circle at the start of the path");
  const u=unit(cross(tangent,Math.abs(tangent.z)<.9?{x:0,y:0,z:1}:{x:0,y:1,z:0})),v=cross(tangent,u),r=diameter/2;
  const at=a=>({x:start.x+r*(u.x*Math.cos(a)+v.x*Math.sin(a)),y:start.y+r*(u.y*Math.cos(a)+v.y*Math.sin(a)),z:start.z+r*(u.z*Math.cos(a)+v.z*Math.sin(a))});
  return {path,pathSegments:segments,profile:[0,Math.PI/2,Math.PI,3*Math.PI/2].map(at),profileSegments:[0,1].map(i=>({type:"arc",from:at(i*Math.PI),mid:at((i+.5)*Math.PI),to:at((i+1)*Math.PI)}))};
}

export function sweepSourceRecord(profileSketch, profileEntityIds, pathSketch) {
  return { kind:"sweep", profile:{sketchId:profileSketch.id, entityIds:(profileEntityIds || []).slice()}, path:{sketchId:pathSketch.id,entityIds:(pathSketch.entities || []).filter(function(e){return !e.construction;}).map(function(e){return e.id;})} };
}

export function loftSourceRecord(sketches, entityIdSets) {
  return { kind:"loft", sections:sketches.map(function (sketch, index) { return {sketchId:sketch.id, entityIds:(entityIdSets[index] || []).slice()}; }) };
}

export function resolveSketchSources(def, sources, resolveProfilePoints) {
  if (!sources) return null;
  if(sources.kind==="circular-sweep")return circularSweepProfile(sketchById(def,sources.path.sketchId),sources.diameter,sources.path.entityIds);
  var loop = function (entry) {
    var sketch = sketchById(def, entry.sketchId);
    if (!sketch) return null;
    var points = (entry.entityIds || []).length ? resolveProfilePoints(sketch, entry.entityIds) : null;
    if (!points) return null;
    return points.map(function (q) { return sketchWorldPoint(sketch, q.u, q.v); });
  };
  if (sources.kind === "loft") {
    var sections = (sources.sections || []).map(loop);
    return sections.length >= 2 && sections.every(Boolean) ? { sections:sections, sectionSegments:(sources.sections || []).map(entry=>sketchPathSegments(sketchById(def,entry.sketchId),entry.entityIds)) } : null;
  }
  var profile = loop(sources.profile);
  if (!profile) return null;
  if (sources.helixId) {
    // The reference record is the selectable/display projection.  Prefer the
    // owning feature so an edited driving circle cannot be masked by a stale
    // creation-time helix snapshot.
    var helix = (def.referenceGeometry || []).find(function (item) { return item && item.id === sources.helixId; });
    if (!helix) return null;
    var featureId=sources.helixFeatureId || helix.featureId;
    var feature=(def.features || []).find(function(item){return item && item.id===featureId && item.type==="helix";});
    if(feature)try{helix={...helix,...helixFromSketch(def,feature.params || {})};}catch(error){return null;}
    return { profile:profile, path:sampleHelix(helix).points };
  }
  var pathSketch = sketchById(def, sources.path && sources.path.sketchId);
  var path=sampleSketchPath(pathSketch,sources.path && sources.path.entityIds);
  return path ? {profile:profile,profileSegments:sketchPathSegments(sketchById(def,sources.profile.sketchId),sources.profile.entityIds),path:path,pathSegments:sketchPathSegments(pathSketch,sources.path && sources.path.entityIds)} : null;
}
