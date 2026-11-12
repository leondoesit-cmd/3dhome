/* The CAD kernel's body operations: split, move, ribs, drafts, domes,
   planar-thickness shells and mesh export, split out of js/cad_kernel.js. It
   shares the editor's state through live imports from ../cad_kernel.js. */
import { compoundBrep, disposeBrep, translateBrep } from "../cad_kernel/analysis.js";
import { shapeHasSolid, shapeVolume, shellBrep } from "../cad_kernel/finish_shell.js";
import { booleanBrep, buildBoolean, makeBrepExtrusion, makeBrepLoft, makeBrepRevolve, selectedBrepSubshapes, shapeIsValid } from "../cad_kernel/solids.js";
import { enlargeFaceForSplit, isOnOrIn, rayHitsBrepFace, resolveBrepSubshape, solidContainsPoint } from "../cad_kernel/topology_primitives.js";
import { framePoint } from "../core/frame.js";
import { shellSupportingPlane } from "../core/planar_shell_overrides.js";
import { ribDraftedLoop, ribGrowthVector, ribLoop, ribOffsets, ribWebLoop } from "../core/rib_profile.js";
import {
  disposeAll, edgeDescriptor, faceDescriptor, loadCadKernel, normalizedVector,
  pointOf, shapeBounds,
} from "../cad_kernel.js";

function solidPieces(oc, shape) {
  const explorer = new oc.TopExp_Explorer_2(shape, oc.TopAbs_ShapeEnum.TopAbs_SOLID, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
  const pieces = [];
  try {
    while (explorer.More()) {
      const solid = oc.TopoDS.Solid_1(explorer.Current());
      const props = new oc.GProp_GProps_1();
      try {
        oc.BRepGProp.VolumeProperties_1(solid, props, false, false, false);
        const centre = props.CentreOfMass();
        try { pieces.push({ shape: solid, volume: props.Mass(), centre: pointOf(centre) }); }
        finally { centre.delete(); }
      } finally { props.delete(); }
      explorer.Next();
    }
  } finally { explorer.delete(); }
  return pieces;
}

/* Split a solid in two along a plane.
 *
 * BRepAlgoAPI_Splitter, not a pair of boolean cuts: the splitter cuts once and
 * hands back both pieces already sharing the new face, so the two halves meet
 * exactly instead of each carrying its own rounding of the same plane.
 *
 * Which half survives is stated, not inferred, because both are real answers:
 * "positive" is the side the plane's normal points at, "negative" the other,
 * and "both" is the compound the splitter itself returns — a document that
 * wants two independently selectable bodies asks for the two sides separately,
 * which is what the model editor's Split command does. */
export async function splitBrep(brep, options = {}) {
  if (!brep?.shape) throw new Error("Split needs a BREP shape");
  const oc = brep.oc || await loadCadKernel();
  const axis = options.axis === "x" ? "x" : options.axis === "z" ? "z" : "y";
  const at = Number(options.offset) || 0;
  const bounds = shapeBounds(oc, brep.shape);
  if (!bounds) throw new Error("Split body has no measurable bounds");
  /* A plane flush with a face is not a cut, and Bnd_Box overshoots by about a
     ten-millionth, so the guard needs a margin scaled to the body rather than
     an absolute epsilon — otherwise "split at 0" quietly returns the whole
     body as if it had been parted. */
  const margin = Math.max(1e-6, 1e-6 * (bounds.max[axis] - bounds.min[axis]));
  if (at <= bounds.min[axis] + margin || at >= bounds.max[axis] - margin)
    throw new Error("The split plane misses the body it is meant to cut");
  const keep = options.keep === "negative" ? "negative" : options.keep === "both" ? "both" : "positive";
  // a plane face wider than the body in every direction, so the cut is complete
  const reach = Math.hypot(bounds.max.x - bounds.min.x, bounds.max.y - bounds.min.y, bounds.max.z - bounds.min.z) + 1;
  const centre = {
    x: (bounds.min.x + bounds.max.x) / 2, y: (bounds.min.y + bounds.max.y) / 2, z: (bounds.min.z + bounds.max.z) / 2,
  };
  centre[axis] = at;
  const owned = [];
  try {
    const point = new oc.gp_Pnt_3(centre.x, centre.y, centre.z); owned.push(point);
    const normal = new oc.gp_Dir_4(axis === "x" ? 1 : 0, axis === "y" ? 1 : 0, axis === "z" ? 1 : 0); owned.push(normal);
    const plane = new oc.gp_Pln_3(point, normal); owned.push(plane);
    const faceMaker = new oc.BRepBuilderAPI_MakeFace_9(plane, -reach, reach, -reach, reach); owned.push(faceMaker);
    const splitter = new oc.BRepAlgoAPI_Splitter_1(); owned.push(splitter);
    const args = new oc.TopTools_ListOfShape_1(), tools = new oc.TopTools_ListOfShape_1(); owned.push(args, tools);
    args.Append_1(brep.shape); tools.Append_1(faceMaker.Face());
    splitter.SetArguments(args); splitter.SetTools(tools);
    const progress = new oc.Message_ProgressRange_1(); owned.push(progress);
    splitter.Build(progress);
    if (splitter.HasErrors?.()) throw new Error("OpenCascade split failed");
    const result = splitter.Shape();
    if (keep === "both") return { oc, shape: result, kind: "compound", operation: "split" };
    const pieces = solidPieces(oc, result);
    const wanted = pieces.filter((piece) => (keep === "positive" ? piece.centre[axis] > at : piece.centre[axis] < at));
    pieces.filter((piece) => !wanted.includes(piece)).forEach((piece) => piece.shape.delete?.());
    if (!wanted.length) throw new Error("The split left nothing on the side that was asked for");
    if (wanted.length === 1) return { oc, shape: wanted[0].shape, kind: "solid", operation: "split" };
    // a concave body can leave several lumps on one side; they are one result
    const joined = await compoundBrep(wanted.map((piece) => ({ oc, shape: piece.shape })));
    joined.operation = "split";
    return joined;
  } finally { disposeAll(owned); }
}

/* Move or copy a whole body.
 *
 * The rotation turns about the body's own centre of mass rather than the world
 * origin, because a body sitting a metre out would otherwise be flung across
 * the document by a five-degree turn. Rotation is applied first and the
 * translation after it, so the numbers in the form mean what they read: turn it
 * this much, then shift it this far.
 *
 * `copy` returns the original AND the moved body as a compound — not a fuse,
 * because two bodies that happen to touch are still two bodies. */
export async function moveBodyBrep(brep, options = {}) {
  if (!brep?.shape) throw new Error("Move body needs a BREP shape");
  const oc = brep.oc || await loadCadKernel();
  const dx = Number(options.dx) || 0, dy = Number(options.dy) || 0, dz = Number(options.dz) || 0;
  const angle = ((Number(options.angle) || 0) * Math.PI) / 180;
  if (!dx && !dy && !dz && !angle) throw new Error("Move body has nothing to move: no offset and no rotation");
  const axis = options.axis === "x" ? "x" : options.axis === "z" ? "z" : "y";
  const owned = [];
  let moved = null;
  try {
    const rotation = new oc.gp_Trsf_1(); owned.push(rotation);
    if (angle) {
      const props = new oc.GProp_GProps_1(); owned.push(props);
      oc.BRepGProp.VolumeProperties_1(brep.shape, props, false, false, false);
      const mass = props.CentreOfMass(); owned.push(mass);
      const pivot = new oc.gp_Pnt_3(mass.X(), mass.Y(), mass.Z()); owned.push(pivot);
      const direction = new oc.gp_Dir_4(axis === "x" ? 1 : 0, axis === "y" ? 1 : 0, axis === "z" ? 1 : 0); owned.push(direction);
      const line = new oc.gp_Ax1_2(pivot, direction); owned.push(line);
      rotation.SetRotation_1(line, angle);
    }
    const shift = new oc.gp_Trsf_1(); owned.push(shift);
    const vector = new oc.gp_Vec_4(dx, dy, dz); owned.push(vector);
    shift.SetTranslation_1(vector);
    const combined = shift.Multiplied(rotation); owned.push(combined);
    const maker = new oc.BRepBuilderAPI_Transform_2(brep.shape, combined, true); owned.push(maker);
    const placement={matrix:Array.from({length:9},(_,i)=>combined.Value(Math.floor(i/3)+1,i%3+1)),translation:{x:combined.Value(1,4),y:combined.Value(2,4),z:combined.Value(3,4)}};
    moved = { oc, shape: maker.Shape(), kind: brep.kind || "solid", operation: "moveBody",placement };
    if (!options.copy) return moved;
    const both = await compoundBrep([{ oc, shape: brep.shape }, moved]);
    both.operation = "moveBody";both.placement=placement;
    disposeBrep(moved);moved = null;
    return both;
  } finally { if (options.copy && moved) disposeBrep(moved); disposeAll(owned); }
}

/* Rib: a drawn line braced into a web.
 *
 * The sketch is a LINE, so the loop is made here rather than picked: ribLoop
 * offsets the polyline to both sides (js/core/rib_profile.js) and the result is
 * carried out of the sketch plane. A draft angle makes it a loft between the
 * full-thickness section at the plane and the narrowed one at the far end,
 * which is exactly the taper draftBrep would tilt the side walls to — and it
 * needs no face selection, because the rib's own walls do not exist yet.
 *
 * Two things then make it a rib rather than a free-standing fin. The web is
 * TRIMMED to the extent of the body it braces, so a line drawn past the wall it
 * ends at does not shoot out into space; and it is FUSED into that body, so the
 * brace and the part are one solid the way a moulded rib is.
 *
 * "up-to-body" runs the web across the body's whole extent along the pull and
 * lets the trim decide where it stops. "blind" runs a stated depth instead. */
export async function ribBrep(brep, params = {}) {
  if (!brep?.shape) throw new Error("Rib needs a body to brace");
  const oc = brep.oc || await loadCadKernel();
  const line = params.points || params.line || [];
  if ((line || []).length < 2) throw new Error("Rib needs an open sketch line of at least two points");
  const thickness = Math.abs(Number(params.thickness) || 0);
  if (!(thickness > 1e-6)) throw new Error("Rib needs a non-zero thickness");
  const bounds = shapeBounds(oc, brep.shape);
  if (!bounds) throw new Error("Rib body has no measurable bounds");
  if(params.orientation === "parallel")return parallelRibBrep(brep,params,line,thickness,oc);

  const frame = params.frame || null;
  const axisName = params.axis === "x" ? "x" : params.axis === "z" ? "z" : "y";
  const normal = frame ? frame.normal : { x: axisName === "x" ? 1 : 0, y: axisName === "y" ? 1 : 0, z: axisName === "z" ? 1 : 0 };
  const sign = params.direction === "reverse" ? -1 : 1;
  const base = Number(params.from) || 0;
  // How far the body reaches from the sketch plane along the pull, so
  // "up to the body" is a measured distance rather than a guess.
  const corners = [];
  for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z])
    corners.push((x * normal.x + y * normal.y + z * normal.z) * sign);
  const span = Math.max(...corners) - base * sign;
  const depth = params.extent === "blind"
    ? Math.abs(Number(params.depth) || 0)
    : span;
  if (!(depth > 1e-6)) throw new Error("The rib runs away from the body it braces, so it never reaches it");

  const near = ribLoop(line, thickness, params.side);
  const draftAngle = (Number(params.draftAngle) || 0)*(params.draftOutward?-1:1);
  const far = draftAngle ? ribDraftedLoop(line, thickness, params.side, depth, draftAngle) : near;
  const place = (loop, w) => loop.map((q) => (frame ? framePoint(frame, q.u, q.v, w) : mapSketchPoint(axisName, q.u, q.v, w)));

  /* The trim is LATERAL only. Clipping to the body's box outright would delete
     every rib that stands proud of the part — which is most of them — so the
     clip is the body's footprint SEEN FROM the sketch plane, run the length of
     the web. A line drawn past the wall it ends at is cut back to the part; a
     web standing up off a plate is left alone. */
  const flat = [];
  for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z])
    flat.push(sketchCoordinates({ x, y, z }, frame, axisName));
  const pad = Math.max(1e-3, thickness);
  const rect = {
    u0: Math.min(...flat.map((q) => q.u)), u1: Math.max(...flat.map((q) => q.u)),
    v0: Math.min(...flat.map((q) => q.v)), v1: Math.max(...flat.map((q) => q.v)),
  };

  let web = null, trimmed = null, clip = null;
  try {
    web = draftAngle
      ? await makeBrepLoft({ sections: [place(near, base), place(far, base + sign * depth)], solid: true, ruled: true })
      : await makeBrepExtrusion({ axis: axisName, frame, from: base, to: base + sign * depth, points: near });
    clip = await makeBrepExtrusion({
      axis: axisName, frame,
      from: Math.min(base, base + sign * depth) - pad, to: Math.max(base, base + sign * depth) + pad,
      points: [{ u: rect.u0, v: rect.v0 }, { u: rect.u1, v: rect.v0 }, { u: rect.u1, v: rect.v1 }, { u: rect.u0, v: rect.v1 }],
    });
    trimmed = await booleanBrep("intersect", web, clip);
    if (!shapeHasSolid(oc, trimmed.shape)) throw new Error("The rib line does not cross the body it braces");
    const fused = await booleanBrep("union", brep, trimmed);
    fused.operation = "rib";
    return fused;
  } finally {
    if (web) disposeBrep(web);
    if (clip) disposeBrep(clip);
    if (trimmed) disposeBrep(trimmed);
  }
}

/* Grow an open profile in its own plane, then give the resulting web thickness
   across that plane. The stopping plane comes from exact first-hit body faces,
   never the body's bounding box. A curved first-hit surface trims an oversize
   web with the exact face; only pieces connected to the outside profile remain. */
async function parallelRibBrep(brep,params,line,thickness,oc) {
  if(params.extent === "blind")throw new Error("Parallel-to-sketch Rib requires Up to the body");
  const frame=params.frame || null;
  const axis=params.axis === "x" ? "x" : params.axis === "z" ? "z" : "y";
  const base=Number(params.from)||0,growth=ribGrowthVector(params.growthDirection,line);
  const place=(q,w)=>frame ? framePoint(frame,q.u,q.v,w) : mapSketchPoint(axis,q.u,q.v,w);
  const origin=place({u:0,v:0},0),uPoint=place({u:1,v:0},0),vPoint=place({u:0,v:1},0);
  const uAxis={x:uPoint.x-origin.x,y:uPoint.y-origin.y,z:uPoint.z-origin.z};
  const vAxis={x:vPoint.x-origin.x,y:vPoint.y-origin.y,z:vPoint.z-origin.z};
  const worldGrowth={x:uAxis.x*growth.u+vAxis.x*growth.v,y:uAxis.y*growth.u+vAxis.y*growth.v,z:uAxis.z*growth.u+vAxis.z*growth.v};
  const offsets=ribOffsets(thickness,params.side),from=base-offsets.right,to=base+offsets.left;
  const sketchNormal=frame?.normal || {x:axis==='x'?1:0,y:axis==='y'?1:0,z:axis==='z'?1:0};
  const neutralCoordinate=Math.min(...line.map(q=>q.u*growth.u+q.v*growth.v));
  const neutralOrigin=place({u:growth.u*neutralCoordinate,v:growth.v*neutralCoordinate},base);
  const taper=async shape=>{
    if(!Number(params.draftAngle))return shape;
    try{return await draftParallelRibWeb(shape,params,sketchNormal,worldGrowth,neutralOrigin);}
    finally{disposeBrep(shape);}
  };
  const faces=[],explorer=new oc.TopExp_Explorer_2(brep.shape,oc.TopAbs_ShapeEnum.TopAbs_FACE,oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
  let web=null,fused=null;const extras=[];
  try{
    while(explorer.More()){faces.push(oc.TopoDS.Face_1(explorer.Current()));explorer.Next();}
    if(params.profileExtension === "natural"){
      line=extendNaturalRibEnds(brep,line,faces,place,from,to,sketchNormal);
    }
    const samples=[];
    for(let i=0;i<line.length-1;i++)for(const fraction of [0,.25,.5,.75,1])samples.push({u:line[i].u+(line[i+1].u-line[i].u)*fraction,v:line[i].v+(line[i+1].v-line[i].v)*fraction});
    let stop=null,stopFace=null,single=true;const contacts=[];
    for(const w of [from,(from+to)/2,to])for(const q of samples){
      const point=place(q,w);
      if(solidContainsPoint(oc,brep.shape,point,1e-6))continue;
      let hit=null,hitFace=null;
      for(const face of faces){const distance=rayHitsBrepFace(oc,point,worldGrowth,face,-1e-7);if(distance!=null && (hit==null || distance<hit)){hit=distance;hitFace=face;}}
      if(!hitFace)throw new Error("The rib profile does not reach the body in the chosen in-plane direction at sketch ("+q.u.toFixed(6)+", "+q.v.toFixed(6)+") and thickness offset "+w.toFixed(6));
      const descriptor=faceDescriptor(oc,hitFace);
      contacts.push({q,w,hit});
      if(!stop){stop=descriptor;stopFace=hitFace;}
      else if(stop.surface!=="plane" || descriptor.surface!=="plane"){
        if(!stopFace.IsSame(hitFace))single=false;
      }
      else{
        const dot=stop.normal.x*descriptor.normal.x+stop.normal.y*descriptor.normal.y+stop.normal.z*descriptor.normal.z;
        const offset=(descriptor.origin.x-stop.origin.x)*stop.normal.x+(descriptor.origin.y-stop.origin.y)*stop.normal.y+(descriptor.origin.z-stop.origin.z)*stop.normal.z;
        if(Math.abs(Math.abs(dot)-1)>1e-6 || Math.abs(offset)>1e-5)single=false;
      }
    }
    if(!stop)throw new Error("The rib profile is already inside the body and adds no web");
    /* A profile that meets several surfaces (HOUSING Rib2: its line meets the
       wall, its arc the loft and the boss) grows an oversize slab and takes only
       what the body leaves free that is connected to the profile. Nothing
       guesses a floor: whatever first surfaces the growth meets bound the web,
       and the pieces beyond the walls are disconnected from the profile. */
    if(!single){
      const bounds=shapeBounds(oc,brep.shape),reach=Math.hypot(bounds.max.x-bounds.min.x,bounds.max.y-bounds.min.y,bounds.max.z-bounds.min.z)+Math.max(thickness,1);
      const projected=line.map(q=>q.u*growth.u+q.v*growth.v),coordinate=Math.max(...projected)+reach;
      const loop=ribWebLoop(line,growth,{u:growth.u*coordinate,v:growth.v*coordinate,normal:growth});
      const slab=await taper(await makeBrepExtrusion({axis,frame,from,to,points:loop}));extras.push(slab);
      const free=await booleanBrep("subtract",slab,brep);extras.push(free);
      const seeds=contacts.map(contact=>place({u:contact.q.u+growth.u*Math.min(contact.hit/2,1e-3),v:contact.q.v+growth.v*Math.min(contact.hit/2,1e-3)},contact.w));
      const kept=solidPieces(oc,free.shape).filter(piece=>seeds.some(seed=>solidContainsPoint(oc,piece.shape,seed,1e-6)));
      if(!kept.length)throw new Error("The rib profile does not reach the body in the chosen in-plane direction");
      fused=brep;
      for(const piece of kept){
        const part={oc,shape:piece.shape,kind:"solid"};
        const next=await booleanBrep("union",fused,part);
        if(fused!==brep)disposeBrep(fused);
        fused=next;
      }
      if(shapeVolume(oc,fused.shape)<=shapeVolume(oc,brep.shape)+1e-8)throw new Error("The rib profile adds no material to the body");
      fused.operation="rib";
      const result=fused;fused=null;return result;
    }
    if(stop.surface!=="plane"){
      const run=Math.max(...contacts.map(contact=>contact.hit))+Math.max(thickness,1e-3);
      const projected=line.map(q=>q.u*growth.u+q.v*growth.v),coordinate=Math.max(...projected)+run;
      const loop=ribWebLoop(line,growth,{u:growth.u*coordinate,v:growth.v*coordinate,normal:growth});
      web=await taper(await makeBrepExtrusion({axis,frame,from,to,points:loop}));
      const trimmed=trimParallelRibToFace(oc,web.shape,stopFace,contacts.map(contact=>place({u:contact.q.u+growth.u*Math.min(contact.hit/2,1e-3),v:contact.q.v+growth.v*Math.min(contact.hit/2,1e-3)},contact.w)));
      disposeBrep(web);web={oc,shape:trimmed,kind:"solid"};
    }else{
    const section=w=>{
      const localOrigin=place({u:0,v:0},w),n=stop.normal;
      const normal={u:n.x*uAxis.x+n.y*uAxis.y+n.z*uAxis.z,v:n.x*vAxis.x+n.y*vAxis.y+n.z*vAxis.z};
      const rhs=n.x*(stop.origin.x-localOrigin.x)+n.y*(stop.origin.y-localOrigin.y)+n.z*(stop.origin.z-localOrigin.z);
      const length2=normal.u*normal.u+normal.v*normal.v;
      return ribWebLoop(line,growth,{u:normal.u*rhs/length2,v:normal.v*rhs/length2,normal});
    };
    const near=section(from),far=section(to);
    const identical=near.length===far.length && near.every((q,i)=>Math.hypot(q.u-far[i].u,q.v-far[i].v)<1e-8);
    web=identical ? await makeBrepExtrusion({axis,frame,from,to,points:near})
      : await makeBrepLoft({sections:[near.map(q=>place(q,from)),far.map(q=>place(q,to))],solid:true,ruled:true});
    }
    if(stop.surface==="plane")web=await taper(web);
    fused=await booleanBrep("union",brep,web);
    if(shapeVolume(oc,fused.shape)<=shapeVolume(oc,brep.shape)+1e-8)throw new Error("The rib profile adds no material to the body");
    fused.operation="rib";
    const result=fused;fused=null;return result;
  }finally{explorer.delete();faces.forEach(face=>face.delete());if(web)disposeBrep(web);if(fused && fused!==brep)disposeBrep(fused);extras.forEach(item=>disposeBrep(item));}
}

// Continue only the two open end tangents. Body intersections, rather than
// sketch length or a centerline hit, determine the contact across the wall.
function extendNaturalRibEnds(brep,line,faces,place,from,to,normal){
  const oc=brep.oc,extended=line.map(q=>({...q}));
  const widthInside=q=>{
    const start=place(q,from),p=new oc.gp_Pnt_3(start.x,start.y,start.z);
    const d=new oc.gp_Dir_4(normal.x,normal.y,normal.z),ray=new oc.gp_Lin_3(p,d);
    const inter=new oc.BRepIntCurveSurface_Inter(),stations=[0,to-from];
    try{
      inter.Init_2(brep.shape,ray,1e-7);
      while(inter.More()){
        const w=inter.W();
        if(isOnOrIn(oc,inter.State()) && w>0 && w<to-from)stations.push(w);
        inter.Next();
      }
      stations.sort((a,b)=>a-b);
      const checks=[0,to-from];
      for(let i=1;i<stations.length;i++)checks.push((stations[i-1]+stations[i])/2);
      return checks.every(w=>solidContainsPoint(oc,brep.shape,{x:start.x+normal.x*w,y:start.y+normal.y*w,z:start.z+normal.z*w},1e-6));
    }finally{inter.delete();ray.delete();d.delete();p.delete();}
  };
  for(const [index,neighbor] of [[0,1],[line.length-1,line.length-2]]){
    const q=line[index],other=line[neighbor],length=Math.hypot(q.u-other.u,q.v-other.v);
    if(!(length>1e-8))throw new Error("Natural Rib has a degenerate end tangent");
    if(widthInside(q))continue;
    const tangent={u:(q.u-other.u)/length,v:(q.v-other.v)/length};
    const a=place(q,0),b=place({u:q.u+tangent.u,v:q.v+tangent.v},0);
    const direction={x:b.x-a.x,y:b.y-a.y,z:b.z-a.z};
    let distance=0;
    for(let i=0;i<=32;i++){
      const point=place(q,from+(to-from)*i/32);
      if(solidContainsPoint(oc,brep.shape,point,1e-6))continue;
      let hit=null;
      for(const face of faces){
        const value=rayHitsBrepFace(oc,point,direction,face,-1e-7);
        if(value!=null && (hit==null || value<hit))hit=value;
      }
      if(hit==null)throw new Error("Natural Rib end tangent does not reach the body across its full thickness");
      distance=Math.max(distance,hit);
    }
    // Preserve the measured boundary station. Native width classification
    // includes boundary contact and checks every interval, not just samples.
    const end={u:q.u+tangent.u*distance,v:q.v+tangent.v*distance};
    if(!widthInside(end))throw new Error("Natural Rib end cannot make continuous full-thickness contact");
    extended[index]=end;
  }
  return extended;
}

// Tilt only thickness walls about the outer profile plane perpendicular to
// growth. The body's exact stopping faces still trim the drafted web.
async function draftParallelRibWeb(web,params,normal,growth,origin){
  const oc=web.oc,owned=[],faces=[];
  const explorer=new oc.TopExp_Explorer_2(web.shape,oc.TopAbs_ShapeEnum.TopAbs_FACE,oc.TopAbs_ShapeEnum.TopAbs_SHAPE);owned.push(explorer);
  try{
    while(explorer.More()){
      const face=oc.TopoDS.Face_1(explorer.Current());owned.push(face);
      const descriptor=faceDescriptor(oc,face),n=descriptor.normal;
      const atBase=descriptor.origin && Math.abs((descriptor.origin.x-origin.x)*normal.x+(descriptor.origin.y-origin.y)*normal.y+(descriptor.origin.z-origin.z)*normal.z)<1e-7;
      if(descriptor.surface==='plane' && n && Math.abs(n.x*normal.x+n.y*normal.y+n.z*normal.z)>1-1e-7 && !(params.side!=='both' && atBase))faces.push(face);
      explorer.Next();
    }
    if(!faces.length)throw new Error('Rib draft has no planar thickness walls');
    const point=new oc.gp_Pnt_3(origin.x,origin.y,origin.z),direction=new oc.gp_Dir_4(growth.x,growth.y,growth.z);owned.push(point,direction);
    const plane=new oc.gp_Pln_3(point,direction),maker=new oc.BRepOffsetAPI_DraftAngle_2(web.shape),progress=new oc.Message_ProgressRange_1();owned.push(plane,maker,progress);
    const angle=Number(params.draftAngle)*Math.PI/180*(params.draftOutward?-1:1);
    faces.forEach(face=>maker.Add(face,direction,angle,plane,true));
    if(!maker.AddDone())throw new Error('Rib draft cannot tilt its thickness walls');
    maker.Build(progress);if(!maker.IsDone?.())throw new Error('Rib draft failed');
    return {oc,shape:maker.Shape(),kind:'solid',operation:'rib-draft'};
  }finally{disposeAll(owned);}
}

async function shellWithPlanarThicknesses(brep, thickness, options, overrides) {
  const oc = brep.oc || await loadCadKernel(), owned = [], bodies = [];
  const keep = (v) => { owned.push(v); return v; };
  const track = (v) => { bodies.push(v); return v; };
  const openingIds = options.facePersistentIds || options.faces || [];
  const openings = selectedBrepSubshapes(brep, "face", openingIds);
  if (!openings.length) throw new Error("Shell needs at least one resolved face to remove");
  const vertices = [], ex = new oc.TopExp_Explorer_2(brep.shape, oc.TopAbs_ShapeEnum.TopAbs_VERTEX, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
  try {
    for (; ex.More(); ex.Next()) {
      const current=ex.Current(),vertex=oc.TopoDS.Vertex_1(current),point=oc.BRep_Tool.Pnt(vertex);
      try { vertices.push(pointOf(point)); } finally { point.delete();vertex.delete();current.delete(); }
    }
  }
  finally { ex.delete(); }
  const walls = overrides.map((row) => {
    const faces = selectedBrepSubshapes(brep, "face", [row.facePersistentId]);
    if (faces.length !== 1) throw new Error("Shell thickness face could not be resolved uniquely");
    if (openings.some((face) => face.IsSame(faces[0]))) throw new Error("Shell opening cannot also have a wall thickness");
    return { ...row, face:faces[0], plane: shellSupportingPlane(faceDescriptor(oc, faces[0]), vertices, row.thickness) };
  });
  if(walls.some((wall,index)=>walls.slice(0,index).some(previous=>previous.face.IsSame(wall.face)))) throw new Error("Shell thickness needs unique retained faces");
  try {
    const bounds=shapeBounds(oc,brep.shape),reach=4*Math.max(1,Math.hypot(bounds.max.x-bounds.min.x,bounds.max.y-bounds.min.y,bounds.max.z-bounds.min.z),...overrides.map(row=>row.thickness));
    const clip = (cavity, planeDefinition) => {
      const { origin: p, normal: n } = planeDefinition;
      const plane = keep(new oc.gp_Pln_3(keep(new oc.gp_Pnt_3(p.x,p.y,p.z)), keep(new oc.gp_Dir_4(n.x,n.y,n.z))));
      const face = keep(new oc.BRepBuilderAPI_MakeFace_9(plane,-reach,reach,-reach,reach));
      const inside = keep(new oc.gp_Pnt_3(p.x-n.x,p.y-n.y,p.z-n.z));
      const half = keep(new oc.BRepPrimAPI_MakeHalfSpace_1(keep(face.Face()), inside));
      // Keep the common bounded by its cavity operand. Infinite-halfspace mass
      // is deliberately never used by the generic boolean volume guard.
      const clipped = track({ oc, shape: buildBoolean(oc,"intersect",cavity.shape,keep(half.Solid())), kind: "solid" });
      if (!shapeHasSolid(oc, clipped.shape) || !shapeIsValid(oc, clipped.shape)) throw new Error("Shell face thickness consumes the cavity");
      const before = Math.abs(shapeVolume(oc,cavity.shape)), after = Math.abs(shapeVolume(oc,clipped.shape));
      if (!(after > 1e-9 && after <= before + Math.max(1,before)*1e-7)) throw new Error("Shell face thickness produced an invalid cavity extent");
      return clipped;
    };
    // Vertex tests alone cannot certify a supporting plane on a body with
    // curved faces. A native common with the original halfspace must preserve
    // its volume before that selected wall may constrain the cavity.
    const sourceVolume=Math.abs(shapeVolume(oc,brep.shape));
    for(const wall of walls) {
      const {origin:p,normal:n}=wall.plane;
      const supported=clip(brep,{normal:n,origin:{x:p.x+n.x*wall.thickness,y:p.y+n.y*wall.thickness,z:p.z+n.z*wall.thickness}});
      if(Math.abs(Math.abs(shapeVolume(oc,supported.shape))-sourceVolume)>Math.max(1,sourceVolume)*1e-7) throw new Error("Variable Shell thickness requires a supporting exterior plane");
    }
    let cavity;
    try {
      const uniform = track(await shellBrep(brep, thickness, { ...options, faceThicknesses: [] }));
      if (uniform.invalid || uniform.approximate) throw new Error("Variable Shell requires an exact valid uniform cavity");
      cavity = track(await booleanBrep("subtract", brep, uniform));
      if (!shapeHasSolid(oc, cavity.shape) || !shapeIsValid(oc, cavity.shape)) throw new Error("Variable Shell has no valid uniform cavity");
      for (const wall of walls) if (wall.thickness !== Number(thickness)) cavity = clip(cavity,wall.plane);
    } catch (offsetError) {
      // Exact alternative for bodies whose retained faces are all supporting
      // planes. Intersect with the ORIGINAL body first: removed concave faces
      // stay open and the existing nonconvex void can never be filled.
      // Non-supporting or curved retained faces must use a true native offset.
      const planes = [], explorer = new oc.TopExp_Explorer_2(brep.shape,oc.TopAbs_ShapeEnum.TopAbs_FACE,oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
      try {
        for(;explorer.More();explorer.Next()) {
          const current=explorer.Current(),face=oc.TopoDS.Face_1(current);
          try {
            if(openings.some(opening=>opening.IsSame(face))) continue;
            const wall=walls.find(row=>row.face.IsSame(face));
            planes.push(wall?.plane || shellSupportingPlane(faceDescriptor(oc,face),vertices,Number(thickness)));
          } finally {face.delete();current.delete();}
        }
      } catch (error) { throw new Error(`${offsetError.message}; exact planar Shell unavailable: ${error.message}`); }
      finally { explorer.delete(); }
      if(!planes.length) throw new Error("Shell has no retained supporting walls");
      cavity=brep;
      for(const plane of planes) cavity=clip(cavity,plane);
    }
    const result = await booleanBrep("subtract",brep,cavity);
    if (!shapeHasSolid(oc,result.shape) || !shapeIsValid(oc,result.shape)) {
      disposeBrep(result); throw new Error("Variable Shell produced an invalid wall solid");
    }
    result.operation = "shell";
    result.faceThicknesses = overrides.map((row) => ({ ...row }));
    return result;
  } finally { bodies.forEach(disposeBrep); disposeAll(owned); }
}

function trimParallelRibToFace(oc,shape,face,seeds) {
  const owned=[];let pieces=[],keep=[];
  try{
    const bounds=shapeBounds(oc,shape),reach=Math.hypot(bounds.max.x-bounds.min.x,bounds.max.y-bounds.min.y,bounds.max.z-bounds.min.z)+1;
    const cutter=enlargeFaceForSplit(oc,owned,face,reach);if(cutter!==face)owned.push(cutter);
    const splitter=new oc.BRepAlgoAPI_Splitter_1(),args=new oc.TopTools_ListOfShape_1(),tools=new oc.TopTools_ListOfShape_1(),progress=new oc.Message_ProgressRange_1();owned.push(splitter,args,tools,progress);
    args.Append_1(shape);tools.Append_1(cutter);splitter.SetArguments(args);splitter.SetTools(tools);splitter.SetNonDestructive?.(true);splitter.Build(progress);
    if(splitter.HasErrors?.())throw new Error("Parallel Rib cannot trim the web to its curved stopping surface");
    pieces=solidPieces(oc,splitter.Shape());
    if(pieces.length<2)throw new Error("Parallel Rib curved stopping surface did not divide the web");
    keep=pieces.filter(piece=>seeds.some(seed=>solidContainsPoint(oc,piece.shape,seed,1e-6)));
    if(keep.length!==1)throw new Error("Parallel Rib curved stop leaves ambiguous disconnected webs; split the profile into separate ribs");
    const result=keep[0].shape;keep=[];pieces=pieces.filter(piece=>piece.shape!==result);return result;
  }finally{pieces.forEach(piece=>piece.shape.delete?.());disposeAll(owned);}
}

/* The (u,v) a world point has on the rib's sketch plane — the inverse of the
   mapping the profile is placed through, so the trim rectangle is measured in
   the same coordinates the line was drawn in. */
function sketchCoordinates(point, frame, axisName) {
  if (frame) {
    const d = { x: point.x - (frame.origin?.x || 0), y: point.y - (frame.origin?.y || 0), z: point.z - (frame.origin?.z || 0) };
    return {
      u: d.x * frame.xAxis.x + d.y * frame.xAxis.y + d.z * frame.xAxis.z,
      v: d.x * frame.yAxis.x + d.y * frame.yAxis.y + d.z * frame.yAxis.z,
    };
  }
  if (axisName === "z") return { u: point.x, v: point.y };
  if (axisName === "x") return { u: point.z, v: point.y };
  return { u: point.x, v: point.z };
}

function mapSketchPoint(axisName, u, v, w) {
  if (axisName === "z") return { x: u, y: v, z: w };
  if (axisName === "x") return { x: w, y: v, z: u };
  return { x: u, y: w, z: v };
}

/* Draft as a feature of its own, not a sub-parameter of an extrusion.
   OCCT tilts each selected face about the line where it meets the neutral
   plane, so that plane is a real input rather than something inferred: the same
   faces at the same angle give a different solid depending on which end of the
   pull direction keeps its size. The neutral plane is perpendicular to the pull
   direction and sits at one extreme of the body along it (`neutral`), which is
   where a parting line actually falls, plus an explicit offset. */
// A circular planar face defines the base of an exact spherical cap.
export async function domeBrep(brep, height, options = {}) {
  if (!brep?.shape) throw new Error("Dome needs a solid body");
  height=Number(height);
  if (!(height>0) || !Number.isFinite(height)) throw new Error("Dome height must be positive");
  const oc=brep.oc || await loadCadKernel();
  const faces=selectedBrepSubshapes(brep,"face",options.facePersistentIds || []);
  if(faces.length!==1)throw new Error("Select one circular planar face for Dome");
  const descriptor=faceDescriptor(oc,faces[0]);
  if(descriptor.surface!=="plane")throw new Error("Dome requires a circular planar face");
  const edges=[],samples=[], explorer=new oc.TopExp_Explorer_2(faces[0],oc.TopAbs_ShapeEnum.TopAbs_EDGE,oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
  try{while(explorer.More()){const edge=oc.TopoDS.Edge_1(explorer.Current());try{edges.push(edgeDescriptor(oc,edge));const curve=new oc.BRepAdaptor_Curve_2(edge);try{const first=curve.FirstParameter(),last=curve.LastParameter();for(let i=0;i<=32;i++){const point=curve.Value(first+(last-first)*i/32);try{samples.push(pointOf(point));}finally{point.delete();}}}finally{curve.delete();}}finally{edge.delete();}explorer.Next();}}finally{explorer.delete();}
  const edge=edges[0];let radius=edge?.radius,center=edge?.origin;
  // Loft interpolation may represent a circular rim with rational splines.
  // Require the entire boundary, area and perimeter to agree with a disk.
  if(edges.length && edges.every(e=>e.curve==="bspline" || e.curve==="circle") && edges.some(e=>e.curve!=="circle")){
    center=descriptor.origin;radius=Math.sqrt(descriptor.measure/Math.PI);
    const tolerance=Math.max(1e-7,radius*1e-6),perimeter=edges.reduce((sum,e)=>sum+e.measure,0);
    if(samples.some(p=>Math.abs(Math.hypot(p.x-center.x,p.y-center.y,p.z-center.z)-radius)>tolerance) || Math.abs(perimeter-2*Math.PI*radius)>tolerance*10)throw new Error("Dome requires a full circular face without holes");
    for(const e of edges){e.curve="circle";e.radius=radius;e.origin=center;}
  }
  if(!edge || edges.some(e=>e.curve!=="circle" || Math.abs(e.radius-radius)>1e-6 || Math.hypot(e.origin.x-center.x,e.origin.y-center.y,e.origin.z-center.z)>1e-6) || Math.abs(descriptor.measure-Math.PI*radius*radius)>Math.max(1e-7,descriptor.measure*1e-5))throw new Error("Dome requires a full circular face without holes");
  const sphereRadius=(radius*radius+height*height)/(2*height),axisPoint={u:0,v:0},rim={u:radius,v:0},tip={u:0,v:height};
  const midpointAngle=(Math.atan2(sphereRadius-height,radius)+Math.PI/2)/2;
  const segments=[{type:"line",from:axisPoint,to:rim},{type:"arc",from:rim,to:tip,mid:{u:sphereRadius*Math.cos(midpointAngle),v:height-sphereRadius+sphereRadius*Math.sin(midpointAngle)},center:{u:0,v:height-sphereRadius},radius:sphereRadius,clockwise:false},{type:"line",from:tip,to:axisPoint}];
  const n=descriptor.normal,seed=Math.abs(n.y)<.9?{x:0,y:1,z:0}:{x:1,y:0,z:0};
  const x=normalizedVector({x:seed.y*n.z-seed.z*n.y,y:seed.z*n.x-seed.x*n.z,z:seed.x*n.y-seed.y*n.x});
  const z={x:x.y*n.z-x.z*n.y,y:x.z*n.x-x.x*n.z,z:x.x*n.y-x.y*n.x};
  let cap,placed;
  try{
    cap=await makeBrepRevolve({points:[axisPoint,rim,tip],segments,axis:"y",angle:360,radialProfile:true});
    placed=await placeBrep(cap,{matrix:[x.x,n.x,z.x,x.y,n.y,z.y,x.z,n.z,z.z],translation:center});
    return await booleanBrep("union",brep,placed);
  }finally{if(placed)disposeBrep(placed);if(cap)disposeBrep(cap);}
}

export async function draftBrep(brep, angleDegrees, options = {}) {
  if (!brep?.shape) throw new Error("Draft needs a BREP shape");
  const oc = brep.oc || await loadCadKernel();
  if(Number(angleDegrees)===0)return translateBrep(brep,{x:0,y:0,z:0});
  const faces = selectedBrepSubshapes(brep, "face", options.facePersistentIds || options.faces || []);
  if (!faces.length) throw new Error("Draft has no resolved faces");
  const angle = ((Number(angleDegrees) || 0) * Math.PI) / 180;
  if (!Number.isFinite(angle) || Math.abs(angle) < 1e-9) throw new Error("Draft angle must be non-zero");
  const axis = options.pullAxis === "x" ? "x" : options.pullAxis === "z" ? "z" : "y";
  const sign = options.pullDirection === "reverse" ? -1 : 1;
  const bounds = shapeBounds(oc, brep.shape);
  if (!bounds) throw new Error("Draft body has no measurable bounds");
  const owned = [];
  try {
    let plane, pull;
    if (options.neutralFaceId) {
      /* SOLIDWORKS' Neutral Plane box: a picked planar face is the plane the
         drafted faces pivot on and keep their size at, and its outward normal is
         the direction of pull (Reverse flips the pull, not the pivot). */
      const neutral = resolveBrepSubshape(brep, options.neutralFaceId, "face");
      if (!neutral) throw new Error("Draft neutral plane face is unavailable");
      const neutralFace = oc.TopoDS.Face_1(neutral);
      if (faces.some((face) => face.IsSame(neutralFace))) throw new Error("Draft neutral face cannot also be drafted");
      const adaptor = new oc.BRepAdaptor_Surface_2(neutralFace, true); owned.push(adaptor);
      if (adaptor.GetType() !== oc.GeomAbs_SurfaceType.GeomAbs_Plane) throw new Error("Draft neutral plane must be a planar face");
      plane = adaptor.Plane(); owned.push(plane);
      const axisDir = plane.Axis().Direction(); owned.push(axisDir);
      const outward = neutralFace.Orientation_1() === oc.TopAbs_Orientation.TopAbs_REVERSED ? -sign : sign;
      pull = new oc.gp_Dir_4(axisDir.X() * outward, axisDir.Y() * outward, axisDir.Z() * outward); owned.push(pull);
    } else {
      const at = (options.neutral === "start" ? bounds.min[axis] : bounds.max[axis]) + (Number(options.neutralOffset) || 0);
      const centre = {
        x: (bounds.min.x + bounds.max.x) / 2,
        y: (bounds.min.y + bounds.max.y) / 2,
        z: (bounds.min.z + bounds.max.z) / 2,
      };
      centre[axis] = at;
      const point = new oc.gp_Pnt_3(centre.x, centre.y, centre.z); owned.push(point);
      const normal = new oc.gp_Dir_4(axis === "x" ? 1 : 0, axis === "y" ? 1 : 0, axis === "z" ? 1 : 0); owned.push(normal);
      plane = new oc.gp_Pln_3(point, normal); owned.push(plane);
      pull = new oc.gp_Dir_4(axis === "x" ? sign : 0, axis === "y" ? sign : 0, axis === "z" ? sign : 0); owned.push(pull);
    }
    const maker = new oc.BRepOffsetAPI_DraftAngle_2(brep.shape); owned.push(maker);
    const progress = new oc.Message_ProgressRange_1(); owned.push(progress);
    // A face square to the pull direction has no line to tilt about. OCCT
    // records that in AddDone() rather than throwing, so it is read back here
    // instead of building a shape that silently ignored the selection.
    faces.forEach((face) => maker.Add(face, pull, angle, plane, true));
    if (!maker.AddDone()) throw new Error("Draft cannot tilt one of the selected faces about this neutral plane");
    maker.Build(progress);
    if (!maker.IsDone?.()) throw new Error("OpenCascade draft failed");
    return { oc, shape: maker.Shape(), kind: "solid", operation: "draft" };
  } finally { disposeAll(owned); }
}

// Convert any BREP (including booleans and fillets) to serialisable triangle
// data for Three.js.  Keeping plain arrays on the document means the exact
// result survives save/load without retaining WASM handles.
export async function shapeToMeshData(brep, options = {}) {
  if (!brep?.shape) throw new Error("Meshing needs a BREP shape");
  // The worker already meshed this unchanged exact body. A coarser requested
  // display can use that result; finer manufacturing meshes still rebuild.
  if(brep.workerMeshData && (Number(options.deflection)||.35)>=.24 && (Number(options.angle)||.22)>=.16)return structuredClone(brep.workerMeshData);
  const oc = brep.oc || await loadCadKernel();
  const deflection = Math.max(0.02, Number(options.deflection) || 0.35);
  const mesher = new oc.BRepMesh_IncrementalMesh_2(
    brep.shape,
    deflection,
    false,
    Math.max(0.08, Number(options.angle) || 0.22),
    true,
  );
  const explorer = new oc.TopExp_Explorer_2(
    brep.shape,
    oc.TopAbs_ShapeEnum.TopAbs_FACE,
    oc.TopAbs_ShapeEnum.TopAbs_SHAPE,
  );
  const positions = [];
  const faceRanges = [];
  try {
    while (explorer.More()) {
      const face = oc.TopoDS.Face_1(explorer.Current());
      const location = new oc.TopLoc_Location_1();
      const purpose = oc.Poly_MeshPurpose?.Poly_MeshPurpose_NONE ?? 0;
      const handle = oc.BRep_Tool.Triangulation(face, location, purpose);
      if (handle && !handle.IsNull?.()) {
        const triangulation = handle.get();
        const transform = location.Transformation();
        const reversed = face.Orientation_1() === oc.TopAbs_Orientation.TopAbs_REVERSED;
        const triangleStart = positions.length / 9;
        const nbNodes = triangulation.NbNodes();
        const nodes = new Float64Array(nbNodes * 3);
        for (let n = 1; n <= nbNodes; n++) {
          const point = triangulation.Node(n);
          point.Transform(transform);
          const idx = (n - 1) * 3;
          nodes[idx] = point.X();
          nodes[idx + 1] = point.Y();
          nodes[idx + 2] = point.Z();
          point.delete?.();
        }
        const nbTriangles = triangulation.NbTriangles();
        for (let i = 1; i <= nbTriangles; i++) {
          const triangle = triangulation.Triangle(i);
          const i1 = triangle.Value(1), i2 = triangle.Value(2), i3 = triangle.Value(3);
          const ids = reversed ? [i1, i3, i2] : [i1, i2, i3];
          for (const id of ids) {
            const idx = (id - 1) * 3;
            positions.push(nodes[idx], nodes[idx + 1], nodes[idx + 2]);
          }
          triangle.delete?.();
        }
        transform.delete?.();
        handle.delete?.();
        let topologyId = null;
        if (brep.subshapes) {
          for (const [persistentId, entry] of brep.subshapes) {
            if (entry.kind === "face" && entry.shape.IsSame(face)) { topologyId = persistentId; break; }
          }
        }
        faceRanges.push({ persistentId: topologyId, triangleStart, triangleCount: positions.length / 9 - triangleStart });
      }
      location.delete(); face.delete(); explorer.Next();
    }
  } finally {
    explorer.delete(); mesher.delete();
  }
  if (!positions.length) throw new Error("OpenCascade returned an empty mesh");
  /* `positions` stays a plain Array on purpose. Making it a Float32Array would
     save the push boxing, but meshData rides into localStorage through
     saveLib() -> JSON.stringify, and a typed array serialises as {"0":..,"1":..}
     — a saved model would come back with no usable geometry. Several readers
     also still gate on Array.isArray(meshData.positions). The batching win here
     is the per-face node cache above (~6x fewer WASM boundary crossings);
     converting the container is not worth corrupting the library for. */
  const normals = new Float32Array(positions.length);
  const colors = new Float32Array(positions.length);
  for (let t = 0; t < positions.length / 9; t++) {
    const i0 = t * 9;
    const ax = positions[i0], ay = positions[i0 + 1], az = positions[i0 + 2];
    const bx = positions[i0 + 3], by = positions[i0 + 4], bz = positions[i0 + 5];
    const cx = positions[i0 + 6], cy = positions[i0 + 7], cz = positions[i0 + 8];
    const abx = bx - ax, aby = by - ay, abz = bz - az;
    const acx = cx - ax, acy = cy - ay, acz = cz - az;
    let nx = aby * acz - abz * acy;
    let ny = abz * acx - abx * acz;
    let nz = abx * acy - aby * acx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;
    normals[i0] = nx; normals[i0 + 1] = ny; normals[i0 + 2] = nz;
    normals[i0 + 3] = nx; normals[i0 + 4] = ny; normals[i0 + 5] = nz;
    normals[i0 + 6] = nx; normals[i0 + 7] = ny; normals[i0 + 8] = nz;
    colors[i0] = 1; colors[i0 + 1] = 1; colors[i0 + 2] = 1;
    colors[i0 + 3] = 1; colors[i0 + 4] = 1; colors[i0 + 5] = 1;
    colors[i0 + 6] = 1; colors[i0 + 7] = 1; colors[i0 + 8] = 1;
  }
  const subshapeMap = Object.create(null);
  for (const range of faceRanges) {
    if (range.persistentId) {
      if (!subshapeMap[range.persistentId]) subshapeMap[range.persistentId] = [];
      for (let t = range.triangleStart; t < range.triangleStart + range.triangleCount; t++) {
        subshapeMap[range.persistentId].push(t);
      }
    }
  }
  return { positions, normals, colors, faceRanges, subshapeMap, exactBounds: shapeBounds(oc, brep.shape, false),
    ...(brep.sectionRibs ? {sectionRibs:structuredClone(brep.sectionRibs)} : {}),
    ...(brep.sectionRibIssue ? {sectionRibIssue:brep.sectionRibIssue} : {}) };
}

export async function transformBrep(brep, transform = {}) {
  if (!brep?.shape) throw new Error("BREP transform needs a shape");
  const oc = brep.oc || await loadCadKernel();
  const origin = transform.origin || { x:0, y:0, z:0 };
  const xAxis = transform.xAxis || { x:1, y:0, z:0 };
  const yAxis = transform.yAxis || { x:0, y:1, z:0 };
  const zAxis = transform.zAxis || { x:0, y:0, z:1 };
  const scale = Number.isFinite(transform.scale) && transform.scale > 0 ? transform.scale : 1;
  const translation = (axis) => -scale * (origin.x * axis.x + origin.y * axis.y + origin.z * axis.z);
  const trsf = new oc.gp_Trsf_1();
  let maker;
  try {
    trsf.SetValues(
      scale*xAxis.x, scale*xAxis.y, scale*xAxis.z, translation(xAxis),
      scale*yAxis.x, scale*yAxis.y, scale*yAxis.z, translation(yAxis),
      scale*zAxis.x, scale*zAxis.y, scale*zAxis.z, translation(zAxis),
    );
    maker = new oc.BRepBuilderAPI_Transform_2(brep.shape, trsf, true);
    return { oc, shape:maker.Shape(), kind:brep.kind || "transformed", sourceName:brep.sourceName };
  } finally {
    maker?.delete?.(); trsf.delete();
  }
}

/* A copy of `source` put down by one rigid transform: the row-major 3x3
   rotation and the shift that follows it, v -> M.v + t. It is the shape every
   pattern placement already speaks — curvePatternPlacements() computes exactly
   this pair, and a linear offset is the identity matrix with the offset as t —
   so a merged pattern does not need a second notion of "where the copy went".
   gp_Trsf::SetValues takes the 3x4 directly and insists the basis be
   orthonormal, which a rotation is by construction. */
export async function placeBrep(source, placement = {}) {
  if (!source?.shape) throw new Error("Placement needs a BREP shape");
  const oc = source.oc || await loadCadKernel();
  const m = Array.isArray(placement.matrix) && placement.matrix.length === 9 ? placement.matrix.map(Number) : [1, 0, 0, 0, 1, 0, 0, 0, 1];
  const t = placement.translation || { x: 0, y: 0, z: 0 };
  const owned = [];
  try {
    const trsf = new oc.gp_Trsf_1(); owned.push(trsf);
    trsf.SetValues(
      m[0], m[1], m[2], Number(t.x) || 0,
      m[3], m[4], m[5], Number(t.y) || 0,
      m[6], m[7], m[8], Number(t.z) || 0,
    );
    const maker = new oc.BRepBuilderAPI_Transform_2(source.shape, trsf, true); owned.push(maker);
    return { oc, shape: maker.Shape(), kind: source.kind || "solid" };
  } finally { disposeAll(owned); }
}

// Bounds of the placed solid, rather than a rotated local bounding box. Curved
// solids can retain smaller extents than the eight corners of their local box.
export async function placedBrepBounds(source, placement = {}) {
  const placed=await placeBrep(source,placement);
  try{return shapeBounds(placed.oc,placed.shape,false);}
  finally{disposeBrep(placed);}
}

export { shellWithPlanarThicknesses, solidPieces };
