import { endConditionHidesDepth, extrusionMapPoint } from "./core/extrude_extent.js";
import { frameNormalize } from "./core/frame.js";
import { segmentProfilePoints } from "./core/profile_curves.js";
import { activeHistoryTargetIds, recordSketchInHistory, createFeatureDefinition } from "./core/parametric_document.js";

const delta = (a,b) => ({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z});
const distance = (a,b) => Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);

// Return the rectangle in sketch coordinates, keeping the frame for folded tools.
export function sheetPlate(part) {
  if (!part || part.holes?.length || part.cuts3d?.length || part.exactOperations?.length || part.exactFillet>0 ||
      part.merges3d?.some(tool => !tool.sheetHinge) || part.draftAngle ||
      part.segments?.some(segment => segment.type !== "line")) return null;
  let map = part, points = part.pts, from = part.from, to = part.to;
  if (part.kind === "box") {
    const span = axis => Math.abs(part[axis+"1"]-part[axis+"0"]);
    const axis = ["y","z","x"].sort((a,b) => span(a)-span(b))[0];
    const u = axis === "x" ? "z" : "x", v = axis === "y" ? "z" : "y";
    points = [[0,0],[1,0],[1,1],[0,1]].map(([i,j]) => ({u:part[u+i],v:part[v+j]}));
    from = part[axis+"0"]; to = part[axis+"1"]; map = {axis};
  } else if (part.kind !== "ext") return null;
  if (points?.length !== 4 || ![from,to,...points.flatMap(p => [p.u,p.v])].every(Number.isFinite)) return null;
  const world = points.map(p => extrusionMapPoint(map,p.u,p.v,Math.min(from,to)));
  const [a,b,c,d] = world, width = distance(b,a), height = distance(d,a), thickness = Math.abs(to-from);
  if (!(thickness > 0 && thickness < Math.min(width,height))) return null;
  const along = frameNormalize(delta(b,a)), across = frameNormalize(delta(d,a));
  if (Math.abs(along.x*across.x+along.y*across.y+along.z*across.z)>1e-7 ||
      distance(delta(c,d),delta(b,a))>1e-7*Math.min(width,height)) return null;
  const up = frameNormalize(delta(extrusionMapPoint(map,points[0].u,points[0].v,Math.max(from,to)),a));
  return {width,height,thickness,along,across,up,corners:world};
}

export function hingeIntervals(span, {count,pitch,width,offset}) {
  if (!Number.isInteger(count) || count<1 || count>256 || ![width,pitch,offset].every(Number.isFinite) ||
      width<=0 || offset<0 || pitch<=0 || (count>1 && width>=pitch) || offset+(count-1)*pitch+width>span+1e-8)
    throw new Error("Tabs must fit along the edge with a gap between instances.");
  return Array.from({length:count},(_,i) => ({start:offset+i*pitch,end:Math.min(span,offset+i*pitch+width)}));
}

// A 270-degree circular hem starts tangent to the leaf. Each record is a
// normal additive prism, with analytic arcs for the exact kernel.
export function hingeTools(plate, spec) {
  const section = hingeSection(plate,spec);
  return hingeIntervals(section.span,spec).map(({start,end}) => ({
    ...structuredClone(section.tool),sheetHinge:true,hingeSpec:{...spec},hingeGauge:plate.thickness,from:start,to:end,
  }));
}

function hingeSection(plate,spec) {
  const {radius,edge,straight} = spec;
  if (!(Number.isFinite(radius) && radius>0)) throw new Error("Enter a positive inside radius.");
  if (!(Number.isFinite(straight) && straight>0)) throw new Error("Enter a positive straight tab length.");
  const horizontal = edge==="top" || edge==="bottom";
  if (!horizontal && edge!=="left" && edge!=="right") throw new Error("Choose a plate edge.");
  const span = horizontal?plate.width:plate.height;
  const corner = {bottom:0,right:1,top:3,left:0}[edge];
  const side = horizontal?plate.across:plate.along, sign = edge==="bottom" || edge==="left"?-1:1;
  const frame = {origin:plate.corners[corner],normal:horizontal?plate.along:plate.across,
    xAxis:{x:sign*side.x,y:sign*side.y,z:sign*side.z},yAxis:plate.up};
  const outer = radius+plate.thickness, center = {u:straight,v:outer};
  const on = (r,a) => ({u:straight+r*Math.sin(a),v:outer-r*Math.cos(a)});
  const arc = (r,a,b) => ({type:"arc",center,radius:r,from:on(r,a),mid:on(r,(a+b)/2),to:on(r,b)});
  const line = (from,to) => ({type:"line",from,to});
  const angle = 1.5*Math.PI;
  const root = {u:0,v:0}, rootTop = {u:0,v:plate.thickness};
  const segments = [line(root,on(outer,0)),arc(outer,0,angle/2),arc(outer,angle/2,angle),
    line(on(outer,angle),on(radius,angle)),arc(radius,angle,angle/2),arc(radius,angle/2,0),
    line(on(radius,0),rootTop),line(rootTop,root)];
  const loop = segmentProfilePoints(segments);
  return {span,tool:{axis:"frame",frame,loop,segments}};
}

function hingeSketch({segments,frame},name,sketchId) {
  const points = segments.map(({from},i) => ({id:sketchId+"p"+i,x:from.u,y:from.v,fixed:true}));
  const center = segments.find(segment => segment.type==="arc").center;
  points.push({id:sketchId+"c",x:center.u,y:center.v,fixed:true});
  const entities = segments.map((segment,i) => {
    const a = points[i].id, b = points[(i+1)%segments.length].id;
    if (segment.type==="line") return {id:sketchId+"e"+i,type:"line",a,b};
    // Sketch arcs always run counterclockwise. Reverse the inner arc's endpoints.
    const ccw = segment.radius === center.v;
    return {id:sketchId+"e"+i,type:"arc",a:ccw?a:b,b:ccw?b:a,c:sketchId+"c"};
  });
  return {id:sketchId,name,frame:structuredClone(frame),frameSpace:"local",plane:"front",offset:0,
    sheetHingeThickness:segments.at(-1).from.v,points,entities,constraints:[]};
}

function profileThickness(sketch) {
  // A saved profile from before live base binding has no stored gauge.
  // Its closing line goes from the top of the sheet back to its bottom.
  const closingLine = sketch.entities?.find(e=>e.type==="line" && e.b===sketch.id+"p0");
  return sketch.sheetHingeThickness ?? sketch.points?.find(p=>p.id===closingLine?.a)?.y;
}

function verifyHingeSketch(sketch,plate,spec) {
  const thickness = profileThickness(sketch);
  if (!(thickness>0)) throw new Error("The rolled hinge profile has been modified.");
  const nominal = hingeSketch(hingeSection({...plate,thickness},spec).tool,sketch.name,sketch.id);
  const matches = nominal.points.every(p => {
    const q = sketch.points.find(item=>item.id===p.id);
    return q && Math.hypot(p.x-q.x,p.y-q.y)<1e-7;
  }) && nominal.entities.every(e => {
    const q = sketch.entities.find(item=>item.id===e.id);
    return q && e.type===q.type && e.a===q.a && e.b===q.b && e.c===q.c && !q.construction;
  });
  if (!matches || sketch.points.length!==nominal.points.length || sketch.entities.length!==nominal.entities.length)
    throw new Error("The rolled hinge profile has been modified. Restore its generated section.");
}

export function projectedHingeTool(part,record) {
  // Subsequent cuts and bosses are separate steps on this same base.
  const plate = sheetPlate({...part,holes:[],cuts3d:[],merges3d:[],exactOperations:[],exactFillet:0});
  if (!plate) throw new Error("Rolled hinge tabs require a rectangular base plate.");
  const {span,tool} = hingeSection(plate,record.hingeSpec);
  if (!(record.from>=0 && record.to>record.from && record.to<=span+1e-8))
    throw new Error("Rolled hinge tab extends beyond the current base edge.");
  if (Math.abs(record.hingeGauge-plate.thickness)<1e-8)
    return {...record,frame:tool.frame};
  return {...record,...tool};
}

export function recordHingeHistory(document, tools, targetId, name, sketchId, baseId=targetId) {
  const sketch = hingeSketch(tools[0],name,sketchId);
  recordSketchInHistory(document,sketch);
  const profileEntityIds = sketch.entities.map(entity => entity.id);
  for (const [i,tool] of tools.entries()) {
    const feature = createFeatureDefinition(document,"extrude",{name:name+" "+(i+1),inputs:[targetId],
      references:{sketches:[sketchId],features:[targetId],profileEntityIds},
      params:{sketchId,profileEntityIds,mergeResult:true,axis:"frame",frame:tool.frame,offset:tool.from,depth:tool.to-tool.from,
        sheetHingeSource:{baseId,spec:tool.hingeSpec}}});
    targetId = feature.id;
    tool.featureId = feature.id;
  }
}

// Resolve from the executed base recipe. Its solved sketch, support plane and
// extent can all differ from the preview that existed when the tabs were added.
export function resolveHingeSection(baseType,params,source,from,to,sketch) {
  let part;
  if (baseType==="box") {
    const {x=0,y=0,z=0,w,h,d} = params;
    part = {kind:"box",x0:x,y0:y,z0:z,x1:x+w,y1:y+h,z1:z+d};
  } else if (baseType==="extrude" && params && !params.regions?.length) {
    part = {...params,kind:"ext",pts:params.points};
  }
  const plate = sheetPlate(part);
  if (!plate) throw new Error("Rolled hinge tabs require a rectangular base plate.");
  const section = hingeSection(plate,source.spec);
  if (!(from>=0 && to>from && to<=section.span+1e-8)) throw new Error("Rolled hinge tab extends beyond the current base edge.");
  // Moving the supporting edge only changes the workplane. Preserve edits to
  // the rolled profile itself. Re-create its coordinates only for a gauge
  // change, where the inner and outer arcs must once again match the stock.
  if (Math.abs(profileThickness(sketch)-plate.thickness)<1e-8)
    return {...sketch,frame:section.tool.frame,sheetHingeThickness:plate.thickness};
  verifyHingeSketch(sketch,plate,source.spec);
  const generated = hingeSketch(section.tool,sketch.name,sketch.id);
  return {...sketch,frame:generated.frame,sheetHingeThickness:plate.thickness,
    points:sketch.points.map(p=>{
      const next = generated.points.find(q=>q.id===p.id);
      return {...p,x:next.x,y:next.y};
    })};
}

// Older documents have the association on the sheet and its merge records.
// Recover it before lowering the feature, without modifying the saved input.
function sheetOwner(document) {
  const id = document.sheetMetal.sourcePartId;
  return id == null ? document.parts?.find(part=>part.kind==="box") : document.parts?.find(part=>part.id===id);
}

export function bindLegacyHingeSources(document) {
  const sheet = document.sheetMetal;
  if (!sheet?.hinge) return;
  const part = sheetOwner(document);
  if (!part?.featureId) return;
  const ids = new Set(part.merges3d?.filter(tool=>tool.sheetHinge).map(tool=>tool.featureId));
  for (const feature of document.features) {
    if (ids.has(feature.id) && !feature.params.sheetHingeSource)
      feature.params.sheetHingeSource = {baseId:part.featureId,spec:{...sheet.hinge}};
  }
}

export function repairSheetOwner(document) {
  const sheet = document?.sheetMetal;
  if (!sheet) return null;
  const owner = sheetOwner(document);
  if (!owner) {
    delete document.sheetMetal;
    return null;
  }
  sheet.sourcePartId = owner.id;
  if (sheet.hinge) for (const tool of owner.merges3d || [])
    if (tool.sheetHinge && !tool.hingeSpec) tool.hingeSpec = {...sheet.hinge};
  return owner;
}

export function sheetWithPlateDimensions(sheet,plate) {
  return {...sheet,base:{...sheet.base,width:plate.width,height:plate.height},thickness:plate.thickness};
}

export function sheetForExport(document) {
  const sheet = document.sheetMetal;
  const stale = () => new Error("The hinge has changed. Restore its base and all rolled tabs before exporting the flat pattern or bend report.");
  const part = sheetOwner(document);
  const plate = sheetPlate(part);
  const records = part?.merges3d?.filter(tool=>tool.sheetHinge) || [];
  if (part?.exactPending) throw new Error("Wait for the sheet to finish rebuilding before exporting.");
  if (!plate || part.suppressed || part.exactError) {
    if (sheet.hinge) throw stale();
    throw new Error("Restore the rectangular sheet stock before exporting.");
  }
  const features = new Map((document.features || []).map(feature=>[feature.id,feature]));
  const baseFeature = features.get(part.featureId);
  // A face-terminated extrusion can even end on a curved face. Its preview
  // interval cannot establish a uniform stock thickness for manufacturing.
  if (part.kind==="ext" && endConditionHidesDepth(baseFeature?.params?.endCondition ?? part.endCondition))
    throw new Error("Flat export requires a fixed-depth base extrusion to determine the sheet thickness.");
  if (!sheet.hinge) return sheetWithPlateDimensions(sheet,plate);
  if (records.length!==sheet.hinge.count) throw stale();
  const horizontal = ["top","bottom"].includes(sheet.hinge.edge);
  const intervals = hingeIntervals(horizontal?plate.width:plate.height,sheet.hinge);
  const active = activeHistoryTargetIds(document);
  const ids = sheet.hingeFeatureIds || records.map(tool=>tool.featureId);
  let target = part.featureId;
  const canonical = ids.some(Boolean) || document.metadata?.authoringSystem==="parametric-v1";
  if (canonical && (!features.has(target) || features.get(target).suppressed || !active.has(target))) throw stale();
  const legacySection = canonical ? null : hingeSection(plate,sheet.hinge).tool;
  const near = (a,b) => Number.isFinite(a) && Math.abs(a-b)<1e-8;
  const matchesSpec = spec => !spec || Object.keys(sheet.hinge).every(key=>spec[key]===sheet.hinge[key]);
  for (const [i,record] of records.entries()) {
    const {start,end} = intervals[i];
    if (record.suppressed || !matchesSpec(record.hingeSpec) || !near(record.from,start) || !near(record.to,end)) throw stale();
    if (!canonical && near(record.hingeGauge,plate.thickness) &&
        JSON.stringify(record.segments)!==JSON.stringify(legacySection.segments)) throw stale();
    if (canonical) {
      const feature = features.get(ids[i]);
      if (record.featureId!==ids[i] || !active.has(ids[i]) || !feature || feature.suppressed ||
          feature.inputs?.[0]!==target || !matchesSpec(feature.params.sheetHingeSource?.spec) ||
          feature.params.mergeResult===false || feature.params.operation==="new-body" ||
          feature.params.endCondition!=="blind" || feature.params.direction==="reverse" || feature.params.symmetric ||
          feature.params.thinFeature || feature.params.draftAngle ||
          !near(feature.params.depth,sheet.hinge.width) || !near(feature.params.offset,start)) throw stale();
      const sketch = document.sketches?.find(s=>s.id===feature.params.sketchId);
      if (!sketch || sketch.suppressed || !active.has(sketch.id)) throw stale();
      if (i===0) verifyHingeSketch(sketch,plate,sheet.hinge);
      target = ids[i];
    }
  }
  return sheetWithPlateDimensions(sheet,plate);
}
