/* The CAD kernel's finish-edge selection, chamfers, shells and thickening,
   split out of js/cad_kernel.js. It shares the editor's state through live
   imports from ../cad_kernel.js. */
import { compoundBrep, disposeBrep, joinedWarnings, validateBrepForExport } from "../cad_kernel/analysis.js";
import { placeBrep, shellWithPlanarThicknesses, solidPieces } from "../cad_kernel/body_ops.js";
import { booleanBrep, booleanVolumePlausible, buildBoolean, exceedsExportTolerance, makeBrepCone, makeBrepRevolve, selectedBrepSubshapes, shapeIsValid, shapeMaxTolerance, shapeSolidCount } from "../cad_kernel/solids.js";
import { extractBrepTopology, makeBrepPrimitive, resolveBrepSubshape, solidContainsPoint } from "../cad_kernel/topology_primitives.js";
import { shellFaceThicknesses } from "../core/planar_shell_overrides.js";
import { shellMeridian } from "../core/shell_meridian.js";
import {
  DEFAULT_EXPORT_TOLERANCE_CM, JUNCTION_FUZZY_CM, JUNCTION_SCALE, disposeAll,
  edgeDescriptor, faceDescriptor, loadCadKernel, normalizedVector, pointOf,
  shapeBounds,
} from "../cad_kernel.js";

function edgeOnAnyFace(oc, edge, faces) {
  for (const face of faces || []) {
    const explorer = new oc.TopExp_Explorer_2(
      face,
      oc.TopAbs_ShapeEnum.TopAbs_EDGE,
      oc.TopAbs_ShapeEnum.TopAbs_SHAPE,
    );
    try {
      while (explorer.More()) {
        const faceEdge = oc.TopoDS.Edge_1(explorer.Current());
        const matches = faceEdge.IsSame(edge);
        faceEdge.delete?.();
        if (matches) return true;
        explorer.Next();
      }
    } finally { explorer.delete(); }
  }
  return false;
}

/* Fillet/chamfer accept an explicit edge list, or a face (every bounding
   edge). Empty edge ids used to mean "the whole body"; a face pick must not
   fall through to that, or selecting a lid would chamfer every rib. */
function finishEdgeSelection(brep, options = {}) {
  const edgeIds = options.edgePersistentIds || options.edges || [];
  const faceIds = options.facePersistentIds || options.faces || [];
  return {
    edgeIds,
    faces: selectedBrepSubshapes(brep, "face", faceIds),
    restrict: options.propagation === "feature" ? false : !!(edgeIds.length || faceIds.length),
  };
}

function edgeIsFinishTarget(brep, edge, selection) {
  if (!selection?.restrict) return true;
  if (selection.edgeIds && selection.edgeIds.length && brep.subshapes) {
    for (const persistentId of selection.edgeIds) {
      const candidate = resolveBrepSubshape(brep, persistentId, "edge");
      if (candidate?.IsSame(edge)) return true;
    }
  }
  return !!(selection.faces && selection.faces.length && edgeOnAnyFace(brep.oc, edge, selection.faces));
}

// Chamfers, like fillets, consume persistent edge references rather than
// explorer positions.  This keeps the operation stable when an upstream edit
// changes OpenCascade's internal traversal order.
// The rolling chamfer can fail when a concave bevel consumes the complete
// cylinder wall. Only this closed circular floor/open-wall limit is rebuilt.
async function limitingConcaveCircularChamfer(brep, edge, distance, options) {
  const mode=options.mode || 'equal-distance';
  if(mode!=='equal-distance' && !(mode==='distance-angle' && Math.abs(Number(options.angle)-45)<1e-10))return null;
  const oc=brep.oc,entries=[];
  for(const entry of brep.subshapes?.values() || []){
    if(!entries.some(prior=>prior.kind===entry.kind && prior.shape.IsSame(entry.shape)))entries.push(entry);
  }
  const selected=entries.find(e=>e.kind==='edge' && e.shape.IsSame(edge)),circle=selected?.descriptor;
  if(circle?.curve!=='circle' || !(circle.radius>distance))return null;
  const adjacent=entries.filter(e=>e.kind==='face' && edgeOnAnyFace(oc,edge,[e.shape]));
  if(adjacent.length!==2)return null;
  const floor=adjacent.find(e=>e.descriptor.surface==='plane'),wall=adjacent.find(e=>e.descriptor.surface==='cylinder');
  if(!floor || !wall)return null;
  const cylinder=wall.descriptor,axis=cylinder.axis,base=cylinder.referenceOrigin,range=cylinder.axisRange,origin=circle.origin;
  if(!axis || !base || !range || Math.abs(cylinder.radius-circle.radius)>1e-8)return null;
  const dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
  const relative=p=>({x:p.x-origin.x,y:p.y-origin.y,z:p.z-origin.z});
  const height=Math.abs(range[1]-range[0]);
  if(Math.abs(height-distance)>1e-8 || Math.abs(Math.abs(dot(floor.descriptor.normal,axis))-1)>1e-8)return null;
  const station=dot({x:origin.x-base.x,y:origin.y-base.y,z:origin.z-base.z},axis);
  const nearStart=Math.abs(station-range[0])<1e-8,nearEnd=Math.abs(station-range[1])<1e-8;
  if(!nearStart && !nearEnd)return null;
  if(Math.abs(cylinder.measure-2*Math.PI*circle.radius*height)>1e-7)return null;
  const pull={x:axis.x*(nearStart?1:-1),y:axis.y*(nearStart?1:-1),z:axis.z*(nearStart?1:-1)};
  const borders=entries.filter(e=>e.kind==='edge' && edgeOnAnyFace(oc,e.shape,[floor.shape]));
  if(!borders.length || borders.some(e=>{
    const d=e.descriptor;
    return d.curve!=='circle' || Math.hypot(...Object.values(relative(d.origin)))>1e-8
      || (Math.abs(d.radius-circle.radius)>1e-8 && d.radius>circle.radius-distance+1e-8);
  }))return null;
  const radial=normalizedVector(Math.abs(pull.x)<.8?{x:0,y:pull.z,z:-pull.y}:{x:-pull.z,y:0,z:pull.x});
  const transverse={x:pull.y*radial.z-pull.z*radial.y,y:pull.z*radial.x-pull.x*radial.z,z:pull.x*radial.y-pull.y*radial.x};
  const at=(r,t,a=0)=>({x:origin.x+pull.x*t+r*(radial.x*Math.cos(a)+transverse.x*Math.sin(a)),y:origin.y+pull.y*t+r*(radial.y*Math.cos(a)+transverse.y*Math.sin(a)),z:origin.z+pull.z*t+r*(radial.z*Math.cos(a)+transverse.z*Math.sin(a))});
  const epsilon=Math.min(distance/20,1e-3),radius=circle.radius;
  for(const angle of [0,Math.PI/2,Math.PI,3*Math.PI/2]){
    if(solidContainsPoint(oc,brep.shape,at(radius-epsilon,epsilon,angle))
      || !solidContainsPoint(oc,brep.shape,at(radius+epsilon,epsilon,angle))
      || !solidContainsPoint(oc,brep.shape,at(radius-epsilon,-epsilon,angle))
      || solidContainsPoint(oc,brep.shape,at(radius-epsilon,height+epsilon,angle)))return null;
  }
  let outer,inner,wedge,result;
  try{
    outer=await makeBrepPrimitive({type:'cylinder',...origin,axis:pull,r:radius,h:height});
    inner=await makeBrepCone({origin,axis:pull,r1:radius-distance,r2:radius,h:height});
    wedge=await booleanBrep('subtract',outer,inner);
    result=await booleanBrep('union',brep,wedge);
    const gain=shapeVolume(oc,result.shape)-shapeVolume(oc,brep.shape),expected=Math.PI*height*(radius*distance-distance*distance/3);
    if(!shapeIsValid(oc,result.shape) || Math.abs(gain-expected)>1e-7 || await shapeSolidCount(result)!==await shapeSolidCount(brep)){disposeBrep(result);return null;}
    return {...result,operation:'chamfer'};
  }finally{if(outer)disposeBrep(outer);if(inner)disposeBrep(inner);if(wedge)disposeBrep(wedge);}
}

export async function chamferBrep(brep, distance, options = {}) {
  if (!brep?.shape) throw new Error("Chamfer needs a BREP shape");
  const oc = brep.oc || await loadCadKernel();
  if(options.mode && options.mode!=="equal-distance" && !brep.subshapes?.size)extractBrepTopology(brep);
  const maker = new oc.BRepFilletAPI_MakeChamfer(brep.shape);
  const progress = new oc.Message_ProgressRange_1();
  const finish = finishEdgeSelection(brep, options);
  const explorer = new oc.TopExp_Explorer_2(
    brep.shape,
    oc.TopAbs_ShapeEnum.TopAbs_EDGE,
    oc.TopAbs_ShapeEnum.TopAbs_SHAPE,
  );
  const seenEdges = [];
  let added = 0;
  const mode = options.mode || "equal-distance";
  const firstDistance = Math.max(1e-6, Number(distance) || 0);
  const suppliedSecond = options.secondDistance;
  const secondDistance = Math.max(1e-6, suppliedSecond == null || suppliedSecond === "" || !Number.isFinite(Number(suppliedSecond)) ? firstDistance : Number(suppliedSecond));
  const angleRadians = Math.max(1e-9, Math.min(Math.PI / 2 - 1e-9, Number(options.angle) * Math.PI / 180));

  // The asymmetric OCCT overloads need a face to identify the side on which
  // Distance 1 is measured. Topology ids give us a deterministic side; flip
  // selects the other face instead of numerically swapping user parameters.
  const referenceFaceFor = (edge) => {
    const adjacent = [];
    const faces = Array.from(brep.subshapes || [])
      .filter(([, entry]) => entry.kind === "face")
      .sort(([left], [right]) => String(left).localeCompare(String(right)));
    for (const [persistentId, entry] of faces) {
      const faceExplorer = new oc.TopExp_Explorer_2(
        entry.shape,
        oc.TopAbs_ShapeEnum.TopAbs_EDGE,
        oc.TopAbs_ShapeEnum.TopAbs_SHAPE,
      );
      try {
        while (faceExplorer.More()) {
          const faceEdge = oc.TopoDS.Edge_1(faceExplorer.Current());
          const matches = faceEdge.IsSame(edge);
          faceEdge.delete?.();
          if (matches) { adjacent.push({ persistentId, shape: entry.shape }); break; }
          faceExplorer.Next();
        }
      } finally { faceExplorer.delete(); }
    }
    if (!adjacent.length) throw new Error("Chamfer could not resolve an adjacent reference face");
    return adjacent[options.flip && adjacent.length > 1 ? adjacent.length - 1 : 0].shape;
  };
  try {
    while (explorer.More()) {
      const edge = oc.TopoDS.Edge_1(explorer.Current());
      if (seenEdges.some((candidate) => candidate.IsSame(edge))) {
        edge.delete?.(); explorer.Next(); continue;
      }
      seenEdges.push(edge);
      const chosen = edgeIsFinishTarget(brep, edge, finish);
      if (chosen && (!options.filter || options.filter(added, explorer.Current()))) {
        if (mode === "two-distance") {
          maker.Add_3(firstDistance, secondDistance, edge, referenceFaceFor(edge));
        } else if (mode === "distance-angle") {
          if (!Number.isFinite(angleRadians)) throw new Error("Chamfer angle must be a number in degrees");
          maker.AddDA(firstDistance, angleRadians, edge, referenceFaceFor(edge));
        } else {
          maker.Add_2(firstDistance, edge);
        }
        added++;
      }
      explorer.Next();
    }
    if (!added) throw new Error("Chamfer has no resolved edges");
    maker.Build(progress);
    if (maker.HasErrors?.() || !maker.IsDone?.()) {
      if(added===1 && finish.restrict && !options.filter){
        const selected=seenEdges.find(edge=>edgeIsFinishTarget(brep,edge,finish));
        const repaired=selected && await limitingConcaveCircularChamfer(brep,selected,firstDistance,options);
        if(repaired)return repaired;
      }
      throw new Error("OpenCascade chamfer failed");
    }
    return { oc, shape: maker.Shape(), kind: "solid", operation: "chamfer" };
  } finally {
    disposeAll(seenEdges);
    explorer.delete(); progress.delete(); maker.delete();
  }
}

// Remove the selected faces and offset the remaining skin inward.  A shell is
// intentionally face-driven: silently choosing an arbitrary opening would make
// rebuild intent depend on topology enumeration order.
export async function shellBrep(brep, thickness, options = {}) {
  if (!brep?.shape) throw new Error("Shell needs a BREP shape");
  const overrides = shellFaceThicknesses(options.faceThicknesses, thickness, options.direction);
  const oc = brep.oc || await loadCadKernel(), types = oc.TopAbs_ShapeEnum;
  if (options.direction !== "outside" && [types.TopAbs_COMPOUND, types.TopAbs_COMPSOLID].includes(brep.shape.ShapeType())) {
    // Stop at solids, so only geometry outside them can disqualify the compound.
    for (const type of [types.TopAbs_SHELL, types.TopAbs_FACE, types.TopAbs_WIRE, types.TopAbs_EDGE, types.TopAbs_VERTEX]) {
      const loose = new oc.TopExp_Explorer_2(brep.shape, type, types.TopAbs_SOLID);
      try { if (loose.More()) throw new Error("Shell needs closed solid members; the body contains geometry outside a solid"); }
      finally { loose.delete(); }
    }
    if (await shapeSolidCount(brep) > 1) return shellSolidMembers(brep, thickness, options, overrides);
  }
  if (overrides.length) return shellWithPlanarThicknesses(brep, thickness, options, overrides);
  const faceIds = options.facePersistentIds || options.faces || [];
  const selected = selectedBrepSubshapes(brep, "face", faceIds);
  if (!selected.length) throw new Error("Shell needs at least one resolved face to remove");
  /* Every attempt works on a deep copy. OpenCascade's join offset edits its
     input's tolerances in place (HOUSING's body went from 1e-7 to 1e-3), and
     booleans share untouched faces with their operands, so shelling the
     caller's body directly loosened the features before the shell and every
     later attempt. */
  const copier = new oc.BRepBuilderAPI_Copy_2(brep.shape, true, false);
  const source = { ...brep, shape: copier.Shape() };
  const faces = selected.map((face) => {
    const copied = oc.TopoDS.Face_1(copier.ModifiedShape(face));
    // ModifiedShape returns an unoriented face handle for some cuts. Preserve
    // the picked face's outward direction or the offset may hollow the wrong
    // side while still producing a formally valid solid.
    copied.Orientation_2(face.Orientation_1());
    return copied;
  });
  copier.delete();
  brep = source;

  const closingFaces = new oc.TopTools_ListOfShape_1();
  const maker = new oc.BRepOffsetAPI_MakeThickSolid();
  const progress = new oc.Message_ProgressRange_1();
  try {
    faces.forEach((face) => closingFaces.Append_1(face));
    maker.MakeThickSolidByJoin(
      brep.shape,
      closingFaces,
      (options.direction === "outside" ? 1 : -1) * Math.max(1e-6, Number(thickness) || 0),
      Math.max(1e-7, Number(options.tolerance) || 1e-4),
      oc.BRepOffset_Mode.BRepOffset_Skin,
      false,
      false,
      options.join === "intersection" ? oc.GeomAbs_JoinType.GeomAbs_Intersection : oc.GeomAbs_JoinType.GeomAbs_Arc,
      false,
      progress,
    );
    if (maker.HasErrors?.() || !maker.IsDone?.()) return await shellFallbacks(brep, faces, thickness, options);
    const shelled = maker.Shape();
    /* OpenCascade's join offset can return a solid that fails its own check —
       HOUSING Shell1 on the loft/battery body has one inner cylinder face that
       stops 0.59 mm short of the loft. Every boolean after it then misbehaves.
       Try the exact rotational construction, then the exact junction shell, then a marked approximation;
       otherwise keep the result but say so, so the rebuild reports it instead
       of passing it on silently. */
    /* A join offset can be topologically valid while leaving the removed
       face's interior solid. HOUSING's reversed Front cap did exactly that:
       it reported a successful shell but kept material down its centreline.
       Probe well inside a broad planar opening, beyond the requested wall. */
    const openingStillSolid = options.direction !== "outside" && faces.some((face) => {
      const descriptor = faceDescriptor(oc, face);
      const wall = Math.max(1e-6, Number(thickness) || 0);
      if (descriptor.surface !== "plane" || descriptor.measure < 100 * wall * wall) return false;
      const probe = {
        x: descriptor.origin.x - descriptor.normal.x * 2 * wall,
        y: descriptor.origin.y - descriptor.normal.y * 2 * wall,
        z: descriptor.origin.z - descriptor.normal.z * 2 * wall,
      };
      return solidContainsPoint(oc, brep.shape, probe) && solidContainsPoint(oc, shelled, probe);
    });
    if (!shapeIsValid(oc, shelled) || openingStillSolid) {
      try {
        const repaired = await shellFallbacks(brep, faces, thickness, options);
        shelled.delete?.();
        return repaired;
      } catch (error) {
        if (openingStillSolid) {
          shelled.delete?.();
          throw new Error("Shell left material behind the selected opening: " + (error?.message || error));
        }
        return { oc, shape: shelled, kind: "solid", operation: "shell", invalid: "Shell produced an invalid solid (OpenCascade offset); features after it may fail" };
      }
    }
    return { oc, shape: shelled, kind: "solid", operation: "shell" };
  } finally {
    closingFaces.delete(); progress.delete(); maker.delete();
  }
}

// A merged history feature can contain several native solids. In particular a
// countertop and a bowl sharing only the elliptical rim cannot fuse into one
// manifold solid. Offset each selected face's owner and carry its siblings
// through verbatim, including when their faces lie in the same plane.
async function shellSolidMembers(brep, thickness, options, overrides) {
  const oc = brep.oc, openings = options.facePersistentIds || options.faces || [];
  if (!openings.length) throw new Error("Shell needs at least one resolved face to remove");
  const pieces = solidPieces(oc, brep.shape), replacements = [];
  try {
    const owners = new Map();
    const ids = new Set([...openings, ...overrides.map(row => row.facePersistentId)]);
    const faces = [...ids].map(id => [id, resolveBrepSubshape(brep, id, "face")]);
    for (const piece of pieces) {
      const explorer = new oc.TopExp_Explorer_2(piece.shape, oc.TopAbs_ShapeEnum.TopAbs_FACE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
      try {
        for (; explorer.More(); explorer.Next()) {
          const face = explorer.Current();
          try {
            for (const [id, selected] of faces) {
              if (!selected?.IsSame(face)) continue;
              if (owners.has(id) && owners.get(id) !== piece) throw new Error("Shell face belongs to several native solids");
              owners.set(id, piece);
            }
          } finally { face.delete(); }
        }
      } finally { explorer.delete(); }
    }
    if (owners.size !== ids.size) throw new Error("Shell face could not be resolved on a native solid");
    const members = [];
    for (const piece of pieces) {
      const selected = openings.filter(id => owners.get(id) === piece);
      const walls = overrides.filter(row => owners.get(row.facePersistentId) === piece);
      if (!selected.length) {
        if (walls.length) throw new Error("Shell wall thickness requires an opening on the same native solid");
        members.push({oc, shape:piece.shape});
        continue;
      }
      const member = {oc, shape:piece.shape, subshapes:brep.subshapes};
      const replacement = await shellBrep(member, thickness, {...options, facePersistentIds:selected, faceThicknesses:walls});
      replacements.push(replacement);
      members.push(replacement);
    }
    // The input warning belongs to the whole compound. Extracting a solid
    // cannot tell us which member introduced it.
    return await compoundShellMembers(members, brep.approximate, brep.invalid);
  } finally {
    replacements.forEach(disposeBrep);
    pieces.forEach(piece => piece.shape.delete());
  }
}

export async function compoundShellMembers(members, upstreamApproximation, upstreamInvalid) {
  const result = await compoundBrep(members);
  result.operation = "shell";
  if (upstreamInvalid) result.invalid = joinedWarnings([upstreamInvalid, result.invalid]);
  if (upstreamApproximation) result.approximate = joinedWarnings([upstreamApproximation, result.approximate]);
  // Extracted sibling solids carry native tolerances but no per-member warning.
  const nativeTolerance = shapeMaxTolerance(result.oc, result.shape);
  const reportedTolerance = members.reduce((max, body) => Math.max(max, body.looseTolerance ?? 0), 0);
  const looseTolerance = exceedsExportTolerance(nativeTolerance, DEFAULT_EXPORT_TOLERANCE_CM)
    ? Math.max(nativeTolerance, reportedTolerance) : reportedTolerance;
  if (looseTolerance > 0) result.looseTolerance = looseTolerance;
  return result;
}

// OpenCascade's surface offset can fail on a recessed conical shell. For an
// entirely coaxial line meridian, offset that exact section and revolve it.
async function rotationalShell(brep,removed,thickness,options){
 const oc=brep.oc,owned=[],rings=[],skin=[];let axis,origin;
 const close=(a,b)=>Math.hypot(a.u-b.u,a.v-b.v)<1e-6;
 const dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
 try{
  const explorer=new oc.TopExp_Explorer_2(brep.shape,oc.TopAbs_ShapeEnum.TopAbs_FACE,oc.TopAbs_ShapeEnum.TopAbs_SHAPE);owned.push(explorer);
  while(explorer.More()){
   const face=oc.TopoDS.Face_1(explorer.Current());owned.push(face);const descriptor=faceDescriptor(oc,face),discard=removed.some(f=>f.IsSame(face));
   if(!['plane','cone','cylinder'].includes(descriptor.surface))throw new Error('Shell offset failed on this surface');
   const edges=new oc.TopExp_Explorer_2(face,oc.TopAbs_ShapeEnum.TopAbs_EDGE,oc.TopAbs_ShapeEnum.TopAbs_SHAPE);owned.push(edges);const points=[];
   while(edges.More()){
    const edge=oc.TopoDS.Edge_1(edges.Current());owned.push(edge);const d=edgeDescriptor(oc,edge);
    if(d.curve==='circle'){
     if(!axis){axis={...d.axis};const key=['x','y','z'].sort((a,b)=>Math.abs(axis[b])-Math.abs(axis[a]))[0];if(axis[key]<0)axis={x:-axis.x,y:-axis.y,z:-axis.z};origin=d.origin;}
     const delta={x:d.origin.x-origin.x,y:d.origin.y-origin.y,z:d.origin.z-origin.z},v=dot(delta,axis);
     if(Math.abs(Math.abs(dot(d.axis,axis))-1)>1e-6 || Math.hypot(delta.x-axis.x*v,delta.y-axis.y*v,delta.z-axis.z*v)>1e-6)throw new Error('Shell surfaces are not coaxial');
     const p={u:d.radius,v};if(!points.some(q=>close(p,q)))points.push(p);
    }else if(d.curve!=='line')throw new Error('Shell meridian is not linear');
    edges.Next();
   }
   if(discard){if(descriptor.surface!=='plane'||points.length!==1)throw new Error('Shell requires two disk openings');rings.push(points[0]);}
   else {if(points.length!==2)throw new Error('Shell meridian is not a single open chain');skin.push(points);}
   explorer.Next();
  }
  if(rings.length!==2)throw new Error('Shell requires two disk openings');
  let points=[rings[0]],remaining=skin.slice();
  while(remaining.length){const index=remaining.findIndex(pair=>pair.some(p=>close(p,points.at(-1))));if(index<0)throw new Error('Shell meridian is disconnected');const pair=remaining.splice(index,1)[0];points.push(close(pair[0],points.at(-1))?pair[1]:pair[0]);}
  if(!close(points.at(-1),rings[1]))throw new Error('Shell openings do not bound the meridian');
  const polygon=points.concat([{u:0,v:points.at(-1).v},{u:0,v:points[0].v}]);let area=0;polygon.forEach((a,i)=>{const b=polygon[(i+1)%polygon.length];area+=a.u*b.v-b.u*a.v;});if(area<0)points.reverse();
  const segments=shellMeridian(points,(options.direction==='outside'?-1:1)*thickness,options.join || 'round');
  const local=await makeBrepRevolve({points:segments.map(s=>s.from),segments,axis:'y',angle:360,radialProfile:true});
  try{
   const seed=Math.abs(axis.y)<.9?{x:0,y:1,z:0}:{x:1,y:0,z:0},x=normalizedVector({x:seed.y*axis.z-seed.z*axis.y,y:seed.z*axis.x-seed.x*axis.z,z:seed.x*axis.y-seed.y*axis.x}),z={x:x.y*axis.z-x.z*axis.y,y:x.z*axis.x-x.x*axis.z,z:x.x*axis.y-x.y*axis.x};
   const result=await placeBrep(local,{matrix:[x.x,axis.x,z.x,x.y,axis.y,z.y,x.z,axis.z,z.z],translation:origin});
   try{await validateBrepForExport(result);return result;}catch(error){disposeBrep(result);throw error;}
  }finally{disposeBrep(local);}
 }finally{disposeAll(owned);}
}

async function shellFallbacks(brep, faces, thickness, options) {
  try { return await rotationalShell(brep, faces, thickness, options); }
  catch (error) {
    if (options.direction === "outside") throw error;
    let exactError;
    try { return await shellByJunctionBisectors(brep, faces, thickness, options); }
    catch (junctionError) { exactError = junctionError; }
    /* The sampled-section cavity is not a true offset (its inside walls are
       lofted polygons), so it is only a last resort and says so. */
    try {
      const approximate = await shellByOffsetSections(brep, faces, thickness, options);
      approximate.approximate = "Shell used a sampled-section approximation because the exact shell failed (" + (exactError?.message || exactError) + ")";
      return approximate;
    } catch { throw exactError || error; }
  }
}

/* Boss-Loft1's faces meet at creases of up to 2° that fade to tangent at both
   ends. The join offset leaves those seams as loose as the gap between the two
   offset boundaries (thickness × crease, 0.0075 cm), which blocks export. Each
   loose seam between two curved faces is recomputed as the true intersection of
   the two offset surfaces — Newton on both tangent planes and the plane across
   the seam, the midpoint where the surfaces are tangent — refitted, given fresh
   pcurves and vertices, and its tolerance measured again. Works in place on a
   shape the caller owns; `scale` is the model-to-shape factor. */
function tightenOffsetSeams(oc, shape, scale) {
  const owned = [], keep = (value) => { owned.push(value); return value; };
  const each = (s, type, fn) => { const ex = new oc.TopExp_Explorer_2(s, type, oc.TopAbs_ShapeEnum.TopAbs_SHAPE); try { for (; ex.More(); ex.Next()) fn(ex.Current()); } finally { ex.delete(); } };
  const TIGHT = 1e-7 * scale, LOOSE = 1e-5 * scale, SAMPLES = 40;
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const det3 = (m) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  try {
    const faces = []; each(shape, oc.TopAbs_ShapeEnum.TopAbs_FACE, (fs) => faces.push(oc.TopoDS.Face_1(fs)));
    const curved = (face) => keep(new oc.BRepAdaptor_Surface_2(face, true)).GetType() !== oc.GeomAbs_SurfaceType.GeomAbs_Plane;
    const facesOf = (edge) => faces.filter((face) => { let hit = false; each(face, oc.TopAbs_ShapeEnum.TopAbs_EDGE, (x) => { if (x.IsSame(edge)) hit = true; }); return hit; });
    const project = (p, surface) => {
      const pr = keep(new oc.GeomAPI_ProjectPointOnSurf_2(keep(new oc.gp_Pnt_3(p[0], p[1], p[2])), surface, oc.Extrema_ExtAlgo.Extrema_ExtAlgo_Grad));
      if (!pr.NbPoints()) return null;
      const U = { current: 0 }, V = { current: 0 }; pr.LowerDistanceParameters(U, V);
      const q = pr.NearestPoint(), at = keep(new oc.gp_Pnt_1()), du = keep(new oc.gp_Vec_1()), dv = keep(new oc.gp_Vec_1());
      surface.get().D1(U.current, V.current, at, du, dv);
      const n = keep(du.Crossed(dv)); n.Normalize();
      return { q: [q.X(), q.Y(), q.Z()], n: [n.X(), n.Y(), n.Z()] };
    };
    const onBoth = (start, along, s1, s2) => {
      let x = start;
      for (let iteration = 0; iteration < 12; iteration++) {
        const a = project(x, s1), b = project(x, s2);
        if (!a || !b) return null;
        const mid = [(a.q[0] + b.q[0]) / 2, (a.q[1] + b.q[1]) / 2, (a.q[2] + b.q[2]) / 2];
        const cross = Math.hypot(a.n[1] * b.n[2] - a.n[2] * b.n[1], a.n[2] * b.n[0] - a.n[0] * b.n[2], a.n[0] * b.n[1] - a.n[1] * b.n[0]);
        let next = mid;
        if (cross > 1e-4) {
          const m = [a.n, b.n, along], rhs = [dot(a.n, a.q), dot(b.n, b.q), dot(along, start)], d = det3(m);
          if (Math.abs(d) > 1e-12) next = [0, 1, 2].map((k) => det3(m.map((row, i) => row.map((value, j) => (j === k ? rhs[i] : value)))) / d);
        }
        const moved = Math.hypot(next[0] - x[0], next[1] - x[1], next[2] - x[2]);
        x = next;
        if (moved < TIGHT * 1e-2) break;
      }
      return x;
    };
    const builder = keep(new oc.BRep_Builder()), setter = keep(new oc.ShapeFix_ShapeTolerance());
    const seams = [], vertices = [];
    each(shape, oc.TopAbs_ShapeEnum.TopAbs_EDGE, (es) => {
      const edge = oc.TopoDS.Edge_1(es);
      if (oc.BRep_Tool.Tolerance_2(edge) <= LOOSE || seams.some((x) => x.IsSame(edge))) return;
      const adjacent = facesOf(edge);
      if (adjacent.length !== 2 || !adjacent.every(curved)) return;
      const curve = keep(new oc.BRepAdaptor_Curve_2(edge)), t0 = curve.FirstParameter(), t1 = curve.LastParameter();
      const s1 = keep(oc.BRep_Tool.Surface_2(adjacent[0])), s2 = keep(oc.BRep_Tool.Surface_2(adjacent[1]));
      const points = [];
      for (let i = 0; i <= SAMPLES; i++) {
        const t = t0 + (t1 - t0) * i / SAMPLES, p = keep(curve.Value(t)), d = keep(curve.DN(t, 1)), length = Math.hypot(d.X(), d.Y(), d.Z());
        if (length < 1e-12) return;
        const x = onBoth([p.X(), p.Y(), p.Z()], [d.X() / length, d.Y() / length, d.Z() / length], s1, s2);
        if (!x) return;
        points.push(x);
      }
      const array = keep(new oc.TColgp_Array1OfPnt_2(1, points.length));
      points.forEach((p, i) => array.SetValue(i + 1, keep(new oc.gp_Pnt_3(p[0], p[1], p[2]))));
      const fit = keep(new oc.GeomAPI_PointsToBSpline_2(array, 3, 8, oc.GeomAbs_Shape.GeomAbs_C2, TIGHT));
      if (!fit.IsDone()) return;
      const fitted = keep(new oc.Handle_Geom_Curve_2(fit.Curve().get())), f0 = fitted.get().FirstParameter(), f1 = fitted.get().LastParameter();
      builder.UpdateEdge_1(edge, fitted, TIGHT);
      builder.Range_1(edge, f0, f1, false);
      for (const face of adjacent) builder.UpdateEdge_3(edge, keep(oc.GeomProjLib.Curve2d_2(fitted, f0, f1, keep(oc.BRep_Tool.Surface_2(face)), TIGHT)), face, TIGHT);
      each(edge, oc.TopAbs_ShapeEnum.TopAbs_VERTEX, (vs) => {
        const vertex = oc.TopoDS.Vertex_1(vs), q = oc.BRep_Tool.Pnt(vertex);
        const end = [points[0], points[points.length - 1]].reduce((best, p) => (Math.hypot(p[0] - q.X(), p[1] - q.Y(), p[2] - q.Z()) < Math.hypot(best[0] - q.X(), best[1] - q.Y(), best[2] - q.Z()) ? p : best));
        q.delete();
        builder.UpdateVertex_1(vertex, keep(new oc.gp_Pnt_3(end[0], end[1], end[2])), TIGHT);
        vertices.push(vertex);
      });
      setter.SetTolerance(edge, TIGHT, oc.TopAbs_ShapeEnum.TopAbs_EDGE);
      builder.SameParameter(edge, false);
      oc.BRepLib.SameParameter_1(edge, TIGHT);
      seams.push(edge);
    });
    for (const vertex of vertices) setter.SetTolerance(vertex, TIGHT, oc.TopAbs_ShapeEnum.TopAbs_VERTEX);
    if (seams.length) oc.BRepLib.UpdateTolerances_1(shape, false);
    return seams.length;
  } finally {
    disposeAll(owned);
  }
}

async function shellByJunctionBisectors(brep, removed, thickness, options = {}) {
  if (options.direction === "outside") throw new Error("A junction shell hollows inward only");
  const oc = brep.oc, F = JUNCTION_SCALE, owned = [], breps = [];
  const T = Math.max(1e-6, Number(thickness) || 0) * F;
  const keep = (value) => { owned.push(value); return value; };
  const track = (value) => { if (value) breps.push(value); return value; };
  const each = (shape, type, fn) => { const ex = new oc.TopExp_Explorer_2(shape, type, oc.TopAbs_ShapeEnum.TopAbs_SHAPE); try { for (; ex.More(); ex.Next()) fn(ex.Current()); } finally { ex.delete(); } };
  const faceEdges = (face) => { const out = []; each(face, oc.TopAbs_ShapeEnum.TopAbs_EDGE, (e) => out.push(oc.TopoDS.Edge_1(e))); return out; };
  const point = (v) => keep(new oc.gp_Pnt_3(v[0], v[1], v[2]));
  const add = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
  const volumeOf = (shape) => shapeVolume(oc, shape);
  const transformed = (shape, trsf) => { const t = keep(new oc.BRepBuilderAPI_Transform_2(shape, trsf, true)); return t.Shape(); };
  const bigPlane = (z) => keep(new oc.BRepBuilderAPI_MakeFace_9(keep(new oc.gp_Pln_3(point([0, 0, z]), keep(new oc.gp_Dir_4(0, 0, 1)))), -1e4, 1e4, -1e4, 1e4)).Face();
  const isAxisPlane = (face) => { const a = keep(new oc.BRepAdaptor_Surface_2(face, true)); return a.GetType() === oc.GeomAbs_SurfaceType.GeomAbs_Plane && Math.abs(Math.abs(a.Plane().Axis().Direction().Z()) - 1) < 1e-9; };
  const planeZ = (face) => { const g = keep(new oc.GProp_GProps_1()); oc.BRepGProp.SurfaceProperties_1(face, g, false, false); return g.CentreOfMass().Z(); };
  const centroid = (shape) => { const g = keep(new oc.GProp_GProps_1()); oc.BRepGProp.VolumeProperties_1(shape, g, false, false, false); return pointOf(g.CentreOfMass()); };
  const fuzzyFuse = (a, b) => {
    const f = keep(new oc.BRepAlgoAPI_Fuse_1()), l = keep(new oc.TopTools_ListOfShape_1()), t = keep(new oc.TopTools_ListOfShape_1());
    l.Append_1(a); t.Append_1(b); f.SetArguments(l); f.SetTools(t); f.SetNonDestructive(true); f.SetFuzzyValue(JUNCTION_FUZZY_CM * F);
    f.Build(keep(new oc.Message_ProgressRange_1()));
    if (f.HasErrors()) throw new Error("A junction shell could not fuse its cavity");
    const shape = f.Shape(), va = Math.abs(volumeOf(a)), vb = Math.abs(volumeOf(b)), vs = Math.abs(volumeOf(shape));
    if (!booleanVolumePlausible("union", va, vb, vs)) throw new Error("A junction shell cavity fuse lost material");
    return shape;
  };
  const maxTolerance = (shape) => { const analysis = keep(new oc.ShapeAnalysis_ShapeTolerance()); return analysis.Tolerance(shape, 1, oc.TopAbs_ShapeEnum.TopAbs_SHAPE); };
  /* The two sides of a junction meet along curves that are sometimes tangent:
     a plain union then leaves a loose vertex, and a fuzzy fuse closes it.
     Elsewhere the fuzzy fuse itself loosens a seam vertex that the plain union
     keeps tight. Each union is done both ways and the tighter valid result is
     kept, so neither is chosen blind. */
  const tightUnion = async (label, a, b) => {
    const candidates = [];
    /* These cavity pieces already meet on their bisector surfaces. The generic
       union helper's loose-overlap repair (a union after an extra subtraction)
       intersects those coincident spline surfaces again and can run for many
       minutes. Here the plain/fuzzy comparison is the repair, so build the
       plain union once and keep the same material, validity and tolerance gates. */
    try {
      const plain = track({ oc, shape: buildBoolean(oc, "union", a, b), kind: "solid" });
      if (!booleanVolumePlausible("union", Math.abs(volumeOf(a)), Math.abs(volumeOf(b)), Math.abs(volumeOf(plain.shape)))) throw new Error("A junction shell cavity fuse lost material");
      if (shapeIsValid(oc, plain.shape)) candidates.push({ how: "plain", shape: plain.shape, tolerance: maxTolerance(plain.shape) });
    } catch (_) {}
    const plainTight = candidates.length && candidates[0].tolerance <= 2.5e-4 * F;
    if (!plainTight) { try { const fuzzy = fuzzyFuse(a, b); if (shapeIsValid(oc, fuzzy)) candidates.push({ how: "fuzzy", shape: fuzzy, tolerance: maxTolerance(fuzzy) }); } catch (_) {} }
    if (!candidates.length) throw new Error("A junction shell could not join its cavity pieces");
    candidates.sort((x, y) => x.tolerance - y.tolerance);
    return candidates[0].shape;
  };
  try {
    // 1. local frame: the openings face +z, everything 100x larger
    const opening = faceDescriptor(oc, removed[0]);
    if (opening.surface !== "plane") throw new Error("A junction shell needs a planar opening");
    let axis = normalizedVector(opening.normal);
    if (removed.some((face) => { const d = faceDescriptor(oc, face); return d.surface !== "plane" || Math.abs(Math.abs(d.normal.x * axis.x + d.normal.y * axis.y + d.normal.z * axis.z) - 1) > 1e-9; }))
      throw new Error("A junction shell needs its openings in parallel planes");
    // point the axis out of the body through the opening
    {
      const c = centroid(brep.shape), o = opening.origin;
      if ((o.x - c.x) * axis.x + (o.y - c.y) * axis.y + (o.z - c.z) * axis.z < 0) axis = { x: -axis.x, y: -axis.y, z: -axis.z };
    }
    /* Keep the body's own orientation when its axis is already +z: a spun frame
       moved HOUSING's tangent crease point onto the cylinder's parametric seam
       and loosened it to 5.7 um. World X (or Y) flattened onto the plane
       across the axis gives the identity there. */
    const seed = Math.abs(axis.x) < 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
    const along = seed.x * axis.x + seed.y * axis.y + seed.z * axis.z;
    const xDir = normalizedVector({ x: seed.x - along * axis.x, y: seed.y - along * axis.y, z: seed.z - along * axis.z });
    const localAx3 = keep(new oc.gp_Ax3_3(point([0, 0, 0]), keep(new oc.gp_Dir_4(axis.x, axis.y, axis.z)), keep(new oc.gp_Dir_4(xDir.x, xDir.y, xDir.z))));
    const toLocal = keep(new oc.gp_Trsf_1()); toLocal.SetTransformation_2(localAx3);
    const scaleUp = keep(new oc.gp_Trsf_1()); scaleUp.SetScale(point([0, 0, 0]), F);
    const bodyL = transformed(transformed(brep.shape, toLocal), scaleUp);
    const bounds = shapeBounds(oc, bodyL, false);
    if (!bounds) throw new Error("A junction shell needs a measurable body");
    const zOpen = Math.max(...removed.map((face) => { const p = keep(new oc.BRepAdaptor_Surface_2(oc.TopoDS.Face_1(transformed(transformed(face, toLocal), scaleUp)), true)); return p.Plane().Location().Z(); }));
    const margin = 1e-6 * (bounds.max.z - bounds.min.z) + 1e-7;
    if (Math.abs(zOpen - bounds.max.z) > 1e-4 * F) throw new Error("A junction shell needs its opening at the end of the body");

    // 2. junctions: closed planar edge loops across the axis that no planar face covers
    const bodyFaces = []; each(bodyL, oc.TopAbs_ShapeEnum.TopAbs_FACE, (fs) => bodyFaces.push(oc.TopoDS.Face_1(fs)));
    const capZ = bodyFaces.filter(isAxisPlane).map(planeZ);
    const junctions = [];
    each(bodyL, oc.TopAbs_ShapeEnum.TopAbs_EDGE, (es) => {
      const edge = oc.TopoDS.Edge_1(es), c = keep(new oc.BRepAdaptor_Curve_2(edge)), t0 = c.FirstParameter(), t1 = c.LastParameter();
      const zs = [0, 0.25, 0.5, 0.75, 1].map((k) => c.Value(t0 + (t1 - t0) * k).Z());
      if (!zs.every((z) => Math.abs(z - zs[0]) < 1e-6 * F)) return;
      const z = zs[0];
      if (z <= bounds.min.z + margin || z >= bounds.max.z - margin || capZ.some((cz) => Math.abs(cz - z) < 1e-6 * F)) return;
      if (!junctions.some((j) => Math.abs(j - z) < 1e-6 * F)) junctions.push(z);
    });
    junctions.sort((a, b) => a - b);
    if (!junctions.length) throw new Error("A junction shell found no feature junction");

    // 3. slices, each merged back to its feature's own faces
    const splitter = keep(new oc.BRepAlgoAPI_Splitter_1()), args = keep(new oc.TopTools_ListOfShape_1()), tools = keep(new oc.TopTools_ListOfShape_1());
    args.Append_1(bodyL); junctions.forEach((z) => tools.Append_1(bigPlane(z)));
    // non-destructive: a splitter otherwise raises tolerances on the shapes it is given
    splitter.SetArguments(args); splitter.SetTools(tools); splitter.SetNonDestructive(true); splitter.Build(keep(new oc.Message_ProgressRange_1()));
    if (splitter.HasErrors()) throw new Error("A junction shell could not slice the body");
    const levels = [bounds.min.z, ...junctions, bounds.max.z];
    const slices = [];
    each(splitter.Shape(), oc.TopAbs_ShapeEnum.TopAbs_SOLID, (ss) => {
      const unify = keep(new oc.ShapeUpgrade_UnifySameDomain_2(ss, true, true, false)); unify.Build();
      const shape = unify.Shape(), cz = centroid(shape).z;
      const index = levels.findIndex((z, i) => i < levels.length - 1 && cz > z && cz < levels[i + 1]);
      slices.push({ shape, index, lo: levels[index], hi: levels[index + 1] });
    });
    slices.sort((a, b) => a.index - b.index);
    if (slices.length !== junctions.length + 1 || slices.some((s, i) => s.index !== i)) throw new Error("A junction shell sliced the body into unexpected pieces");

    const offsetCavity = async (solid, openZ) => {
      const open = keep(new oc.TopTools_ListOfShape_1()); let count = 0;
      each(solid, oc.TopAbs_ShapeEnum.TopAbs_FACE, (fs) => { const face = oc.TopoDS.Face_1(fs); if (isAxisPlane(face) && openZ.some((z) => Math.abs(planeZ(face) - z) < 1e-4 * F)) { open.Append_1(face); count++; } });
      if (!count) throw new Error("A junction shell piece has no open face");
      for (const join of [oc.GeomAbs_JoinType.GeomAbs_Intersection, oc.GeomAbs_JoinType.GeomAbs_Arc]) {
        const maker = keep(new oc.BRepOffsetAPI_MakeThickSolid());
        try { maker.MakeThickSolidByJoin(solid, open, -T, 1e-6, oc.BRepOffset_Mode.BRepOffset_Skin, false, false, join, false, keep(new oc.Message_ProgressRange_1())); }
        catch { continue; }
        if (maker.HasErrors?.() || !maker.IsDone?.()) continue;
        let wall = keep(maker.Shape());
        if (!shapeIsValid(oc, wall)) continue;
        // near-tangent seams: keep the recomputed wall only if it is valid and really tighter
        if (shapeMaxTolerance(oc, wall) > 1e-3) {
          const tight = keep(new oc.BRepBuilderAPI_Copy_2(wall, true, false)).Shape();
          if (tightenOffsetSeams(oc, tight, F) && shapeIsValid(oc, tight) && shapeMaxTolerance(oc, tight) < shapeMaxTolerance(oc, wall)) wall = tight;
        }
        const cavity = track(await booleanBrep("subtract", { oc, shape: solid, kind: "solid" }, { oc, shape: wall, kind: "solid" }));
        return cavity.shape;
      }
      throw new Error("A junction shell piece could not be offset");
    };

    // 4. bisector surface of each junction crease
    const normalInfo = (edge, face, t) => {
      const pc = keep(new oc.BRepAdaptor_Curve2d_2(edge, face)), uv = pc.Value(t), a = keep(new oc.BRepAdaptor_Surface_2(face, true));
      const p0 = keep(new oc.gp_Pnt_1()), du = keep(new oc.gp_Vec_1()), dv = keep(new oc.gp_Vec_1()); a.D1(uv.X(), uv.Y(), p0, du, dv);
      const n = keep(du.Crossed(dv)); n.Normalize(); if (face.Orientation_1() === oc.TopAbs_Orientation.TopAbs_REVERSED) n.Reverse();
      return { n: [n.X(), n.Y(), n.Z()], q: [p0.X(), p0.Y(), p0.Z()] };
    };
    const curveEdge = (pts) => {
      const arr = keep(new oc.TColgp_Array1OfPnt_2(1, pts.length)); pts.forEach((p, i) => arr.SetValue(i + 1, point(p)));
      const fit = keep(new oc.GeomAPI_PointsToBSpline_2(arr, 3, 8, oc.GeomAbs_Shape.GeomAbs_C2, 1e-6));
      if (!fit.IsDone()) throw new Error("A junction shell could not fit its bisector");
      return keep(new oc.BRepBuilderAPI_MakeEdge_24(keep(new oc.Handle_Geom_Curve_2(fit.Curve().get())))).Edge();
    };
    const REACH = 1.5 * T, OUT = 0.2 * T, N = 24;
    const bisectors = junctions.map((zc) => {
      const crease = [];
      each(bodyL, oc.TopAbs_ShapeEnum.TopAbs_EDGE, (es) => {
        const edge = oc.TopoDS.Edge_1(es), c = keep(new oc.BRepAdaptor_Curve_2(edge)), t0 = c.FirstParameter(), t1 = c.LastParameter();
        if (![0, 0.5, 1].every((k) => Math.abs(c.Value(t0 + (t1 - t0) * k).Z() - zc) < 1e-6 * F)) return;
        const adj = bodyFaces.filter((f) => faceEdges(f).some((x) => x.IsSame(edge)));
        if (adj.length !== 2 || crease.some((e) => e.edge.IsSame(edge))) return;
        crease.push({ edge, adj, t0, t1 });
      });
      if (!crease.length) throw new Error("A junction shell found no crease at a junction");
      /* Sample positions come from the edge's own 3D curve and its ends are
         its vertices, so neighbouring bands meet exactly. Positions evaluated
         through a face's 2D curve were up to 75 um off on HOUSING's real loft,
         the bands failed to sew shut, and the split kept the wrong side. */
      const ends = [];
      let maxUp = 0, maxDown = 0;
      for (const e of crease) {
        const curve3d = keep(new oc.BRepAdaptor_Curve_2(e.edge));
        const vertices = []; each(e.edge, oc.TopAbs_ShapeEnum.TopAbs_VERTEX, (vs) => vertices.push(oc.TopoDS.Vertex_1(vs)));
        const at = (t) => pointOf(curve3d.Value(t));
        const nearestVertex = (p) => vertices.reduce((best, v) => { const q = pointOf(oc.BRep_Tool.Pnt(v)); const d = Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z); return !best || d < best.d ? { v, q, d } : best; }, null);
        e.samples = [];
        for (let i = 0; i <= N; i++) {
          const t = e.t0 + (e.t1 - e.t0) * i / N, A = normalInfo(e.edge, e.adj[0], t), B = normalInfo(e.edge, e.adj[1], t);
          const s = add(A.n, B.n), len = Math.hypot(...s);
          if (len < 1e-9) throw new Error("A junction crease folds back on itself");
          const u = s.map((v) => -v / len);
          let q = at(t);
          if (i === 0 || i === N) {
            const hit = nearestVertex(q);
            q = hit.q;
            let group = ends.find((g) => g.vertex.IsSame(hit.v));
            if (!group) { group = { vertex: hit.v, directions: [] }; ends.push(group); }
            group.directions.push(u);
            e.samples.push({ q: [q.x, q.y, q.z], u, group });
          } else e.samples.push({ q: [q.x, q.y, q.z], u });
        }
      }
      for (const e of crease) for (const i of [0, N]) {
        const sum = e.samples[i].group.directions.reduce((acc, u) => add(acc, u), [0, 0, 0]), len = Math.hypot(...sum);
        e.samples[i].u = sum.map((v) => v / len);
      }
      /* Where the crease is tangent its bisector lies flat in the junction
         plane and would run along the cavity edges there, which leaves loose
         vertices (5.7 um on HOUSING). Both offsets coincide at a tangent
         crease, so tilting the split a little is exact to first order: at a
         2 degree tilt over a 2 degree crease the corner moves about t·Δ·θ
         (1.6 um) along the split and the wall by far less. The tilt goes the
         way the junction leans. */
      const MIN_TILT = Math.sin((2 * Math.PI) / 180);
      let lean = 0;
      for (const e of crease) for (const sm of e.samples) lean += sm.u[2];
      const side = lean >= 0 ? 1 : -1;
      for (const e of crease) for (const sm of e.samples) {
        if (sm.u[2] * side >= MIN_TILT) continue;
        const flat = Math.hypot(sm.u[0], sm.u[1]);
        if (flat < 1e-12) continue;
        const scale = Math.sqrt(1 - MIN_TILT * MIN_TILT) / flat;
        sm.u = [sm.u[0] * scale, sm.u[1] * scale, side * MIN_TILT];
      }
      const sew = keep(new oc.BRepBuilderAPI_Sewing(1e-4, true, true, true, false)), rim = keep(new oc.BRepBuilderAPI_MakeWire_1()), floors = keep(new oc.TopTools_ListOfShape_1());
      for (const e of crease) {
        e.samples.forEach((sm) => { maxUp = Math.max(maxUp, sm.u[2]); maxDown = Math.max(maxDown, -sm.u[2]); });
        const outer = curveEdge(e.samples.map((sm) => add(sm.q, sm.u, -OUT)));
        const inner = curveEdge(e.samples.map((sm) => add(sm.q, sm.u, REACH)));
        const floor = curveEdge(e.samples.map((sm) => { const p = add(sm.q, sm.u, REACH); return [p[0], p[1], zc]; }));
        sew.Add(keep(oc.BRepFill.Face(outer, inner))); sew.Add(keep(oc.BRepFill.Face(inner, floor)));
        floors.Append_1(floor);
      }
      /* Crease edges come in whatever order the explorer lists them, and one
         edge at a time MakeWire rejects an edge that does not touch the wire so
         far, along with everything chained after it, while still reporting
         done. Given all the edges at once it orders them itself. */
      rim.Add_3(floors);
      if (!rim.IsDone() || !oc.BRep_Tool.IsClosed_1(rim.Wire())) throw new Error("A junction bisector does not close");
      const disc = keep(new oc.BRepBuilderAPI_MakeFace_15(rim.Wire(), true));
      if (!disc.IsDone()) throw new Error("A junction bisector does not close");
      sew.Add(disc.Face());
      sew.Perform(keep(new oc.Message_ProgressRange_1()));
      // closed except its outer rim, one edge per crease edge; anything more is a gap the split would leak through
      if (sew.NbFreeEdges() !== crease.length) throw new Error("A junction bisector did not close (" + sew.NbFreeEdges() + " open edges for " + crease.length + " crease edges)");
      return { zc, surface: sew.SewedShape(), up: REACH * maxUp, down: REACH * maxDown };
    });

    // 5. a band of a slice's side faces continued past a junction, offset on its own
    const bandCavity = async (slice, zc, fromZ, towardZ) => {
      const lateral = [];
      const infos = [];
      each(slice.shape, oc.TopAbs_ShapeEnum.TopAbs_FACE, (fs) => {
        const face = oc.TopoDS.Face_1(fs);
        if (isAxisPlane(face)) return;
        const a = keep(new oc.BRepAdaptor_Surface_2(face, true));
        const u0 = a.FirstUParameter(), u1 = a.LastUParameter(), v0 = a.FirstVParameter(), v1 = a.LastVParameter();
        const zAt = (u, v) => a.Value(u, v).Z();
        const um = (u0 + u1) / 2, vm = (v0 + v1) / 2;
        const alongV = Math.abs(zAt(um, v1) - zAt(um, v0)) >= Math.abs(zAt(u1, vm) - zAt(u0, vm));
        const endAtMin = alongV ? Math.abs(zAt(um, v0) - zc) < 1e-4 * F : Math.abs(zAt(u0, vm) - zc) < 1e-4 * F;
        const endAtMax = alongV ? Math.abs(zAt(um, v1) - zc) < 1e-4 * F : Math.abs(zAt(u1, vm) - zc) < 1e-4 * F;
        if (!endAtMin && !endAtMax) return;
        infos.push({ face, a, u0, u1, v0, v1, alongV, endAtMin, endAtMax, type: a.GetType() });
      });
      if (!infos.length) throw new Error("A junction band has no side faces");
      const height = Math.abs(towardZ - zc);
      // B-spline faces are extended by one shared parameter amount so neighbours keep their seams
      const splines = infos.filter((x) => x.type === oc.GeomAbs_SurfaceType.GeomAbs_BSplineSurface);
      let shared = 0;
      for (const x of splines) {
        let slowest = Infinity;
        for (let i = 0; i <= 10; i++) {
          const s = i / 10;
          const zNear = x.alongV ? x.a.Value(x.u0 + (x.u1 - x.u0) * s, x.endAtMin ? x.v0 : x.v1).Z() : x.a.Value(x.endAtMin ? x.u0 : x.u1, x.v0 + (x.v1 - x.v0) * s).Z();
          const zFar = x.alongV ? x.a.Value(x.u0 + (x.u1 - x.u0) * s, x.endAtMin ? x.v1 : x.v0).Z() : x.a.Value(x.endAtMin ? x.u1 : x.u0, x.v0 + (x.v1 - x.v0) * s).Z();
          slowest = Math.min(slowest, Math.abs(zNear - zFar));
        }
        shared = Math.max(shared, 2 * height / slowest * 1.5);
      }
      for (const x of infos) {
        if (x.type === oc.GeomAbs_SurfaceType.GeomAbs_BSplineSurface) {
          const conv = keep(new oc.GeomConvert_BSplineSurfaceToBezierSurface_2(x.a.BSpline(), x.u0, x.u1, x.v0, x.v1, 1e-9));
          if (conv.NbUPatches() !== 1 || conv.NbVPatches() !== 1) throw new Error("A junction band face is not a single patch");
          const bz = conv.Patch(1, 1).get();
          if (x.alongV) bz.Segment(0, 1, x.endAtMin ? -shared : 0, x.endAtMax ? 1 + shared : 1);
          else bz.Segment(x.endAtMin ? -shared : 0, x.endAtMax ? 1 + shared : 1, 0, 1);
          const face = keep(new oc.BRepBuilderAPI_MakeFace_14(keep(new oc.Handle_Geom_Surface_2(bz)), 0, 1, 0, 1, 1e-5)).Face();
          face.Orientation_2(x.face.Orientation_1());
          lateral.push(face);
        } else if ([oc.GeomAbs_SurfaceType.GeomAbs_Plane, oc.GeomAbs_SurfaceType.GeomAbs_Cylinder, oc.GeomAbs_SurfaceType.GeomAbs_Cone].includes(x.type)) {
          const extended = keep(new oc.TopoDS_Face());
          oc.BRepLib.ExtendFace(x.face, 2 * height, x.alongV ? false : x.endAtMin, x.alongV ? false : x.endAtMax, x.alongV ? x.endAtMin : false, x.alongV ? x.endAtMax : false, extended);
          lateral.push(extended);
        } else throw new Error("A junction band cannot extend this surface");
      }
      const maker = keep(new oc.BOPAlgo_MakerVolume_1());
      maker.SetIntersect(true); maker.SetAvoidInternalShapes(true); maker.SetNonDestructive(true); maker.SetFuzzyValue(1e-5);
      lateral.forEach((f) => maker.AddArgument(f)); maker.AddArgument(bigPlane(fromZ)); maker.AddArgument(bigPlane(towardZ));
      maker.Perform(keep(new oc.Message_ProgressRange_1()));
      const c = centroid(slice.shape), probe = point([c.x, c.y, (fromZ + towardZ) / 2]), cls = keep(new oc.BRepClass3d_SolidClassifier_1());
      let band = null;
      each(maker.Shape(), oc.TopAbs_ShapeEnum.TopAbs_SOLID, (sh) => { cls.Load(sh); cls.Perform(probe, 1e-5); if (cls.State().value === oc.TopAbs_State.TopAbs_IN.value) band = oc.TopoDS.Solid_1(sh); });
      if (!band) throw new Error("A junction band did not close");
      return offsetCavity(band, [fromZ, towardZ]);
    };

    // 6. each slice's cavity, continued where a bisector leans into its neighbour, then cut to its own side
    const kept = [];
    const bandPad = 0.06 * T;
    for (const slice of slices) {
      const below = slice.index > 0 ? bisectors[slice.index - 1] : null, above = slice.index < slices.length - 1 ? bisectors[slice.index] : null;
      const openZ = [];
      if (below) openZ.push(slice.lo);
      if (above) openZ.push(slice.hi);
      if (Math.abs(slice.hi - zOpen) < 1e-4 * F) openZ.push(zOpen);
      let cavity = await offsetCavity(slice.shape, openZ);
      // A bisector that rises past a junction puts part of the upper slice's
      // space on the lower slice's side, so the lower slice's offset has to
      // continue up to it; one that dips does the same for the upper slice.
      if (above && above.up > 1e-9) cavity = await tightUnion(`slice ${slice.index} + band above`, cavity, await bandCavity(slice, above.zc, above.zc, above.zc + above.up + bandPad));
      if (below && below.down > 1e-9) cavity = await tightUnion(`slice ${slice.index} + band below`, cavity, await bandCavity(slice, below.zc, below.zc, below.zc - below.down - bandPad));
      const cut = keep(new oc.BRepAlgoAPI_Splitter_1()), cargs = keep(new oc.TopTools_ListOfShape_1()), ctools = keep(new oc.TopTools_ListOfShape_1());
      cargs.Append_1(cavity); [below, above].filter(Boolean).forEach((b) => ctools.Append_1(b.surface));
      // non-destructive, so a bisector shared by two slices is not loosened by the first cut before the second
      cut.SetArguments(cargs); cut.SetTools(ctools); cut.SetFuzzyValue(1e-5); cut.SetNonDestructive(true); cut.Build(keep(new oc.Message_ProgressRange_1()));
      if (cut.HasErrors()) throw new Error("A junction shell could not split a slice cavity");
      let largest = null, largestVolume = 0;
      each(cut.Shape(), oc.TopAbs_ShapeEnum.TopAbs_SOLID, (sh) => { const v = volumeOf(sh); if (v > largestVolume) { largestVolume = v; largest = oc.TopoDS.Solid_1(sh); } });
      if (!largest) throw new Error("A junction shell slice cavity vanished");
      kept.push(largest);
    }

    // 7. one cavity, out of the body, back to the caller's frame and size
    // join from the opening end down, one junction at a time
    let cavity = kept[kept.length - 1];
    for (let i = kept.length - 2; i >= 0; i--) cavity = await tightUnion(`joined down to slice ${i}`, cavity, kept[i]);
    const shelledL = track(await booleanBrep("subtract", { oc, shape: bodyL, kind: "solid" }, { oc, shape: cavity, kind: "solid" }));
    const back = keep(new oc.gp_Trsf_1()); back.SetScale(point([0, 0, 0]), 1 / F);
    const fromLocal = keep(toLocal.Inverted());
    const shape = transformed(transformed(shelledL.shape, back), fromLocal);
    const result = { oc, shape, kind: "solid", operation: "shell" };
    const before = shapeBounds(oc, brep.shape, false), after = shapeBounds(oc, shape, false);
    const grown = !before || !after || ["x", "y", "z"].some((k) => after.min[k] < before.min[k] - 1e-4 || after.max[k] > before.max[k] + 1e-4);
    if (grown || !shapeIsValid(oc, shape) || !(volumeOf(shape) > 1e-9)) throw new Error("A junction shell produced an invalid solid");
    let solids = 0; each(shape, oc.TopAbs_ShapeEnum.TopAbs_SOLID, () => solids++);
    if (solids !== 1) throw new Error("A junction shell produced " + solids + " solids");
    /* The export gate is not applied here. On HOUSING's real Boss-Loft1 the
       offset of its nearly tangent seams is exact in position but carries
       0.008 cm edge tolerances where the seams meet the caps; rejecting that
       fell back to the sampled-section cavity, which came out at 330.8 cm³
       instead of 156.35. The exact shell is kept and its looseness reported,
       and exporting still checks the tolerance. */
    const looseness = shapeMaxTolerance(oc, shape);
    if (looseness > 1e-3) result.looseTolerance = looseness;
    return result;
  } finally {
    breps.forEach((b) => { try { disposeBrep(b); } catch (_) {} });
    disposeAll(owned);
  }
}


/* Planchard HOUSING Shell1 exact cavity construction.
   The loft (sloping inward ~26.1°) and battery extrusion (drafted 1°) meet at a
   concave seam at z = -3.302. Slicing both at z = -3.302 forces two offset loops with
   a 0.29 mm width mismatch into the same plane, creating an artificial coplanar shelf
   with degenerate corners. Extending the battery cavity 1 mm upward into the loft
   submerges its top cap completely inside the loft cavity; the volumetric boolean
   fuse then naturally resolves the true 3D surface-surface intersection miter curve
   with zero defects and exact 0.254 cm wall thickness. */
/* Join-offset of a G0 crease (cylinder meeting a loft) trims the inner wall
   short of the seam and leaves an invalid solid. Hollow instead by offsetting
   every planar section ⟂ the opening axis along the WALL normal — in-plane by
   t/cos(α) so the perpendicular thickness is t even on a sloped loft — lofting
   those wires, and subtracting the cavity. Caps that are not openings are
   shifted inward by the wall so they stay closed. */
async function shellByOffsetSections(brep, removed, thickness, options) {
  const oc = brep.oc, size = Math.max(1e-6, Number(thickness) || 0), owned = [];
  const along = (point, axis, origin) =>
    (point.x - origin.x) * axis.x + (point.y - origin.y) * axis.y + (point.z - origin.z) * axis.z;
  const sampleEdge = (edge, count) => {
    const curve = new oc.BRepAdaptor_Curve_2(edge), points = [];
    try {
      const first = curve.FirstParameter(), last = curve.LastParameter();
      for (let i = 0; i < count; i++) {
        const point = curve.Value(first + (last - first) * i / count); owned.push(point);
        points.push(pointOf(point));
      }
    } finally { curve.delete(); }
    return points;
  };
  const faceNormalAt = (face, point) => {
    const adaptor = new oc.BRepAdaptor_Surface_2(face, true);
    const p = new oc.gp_Pnt_1(), du = new oc.gp_Vec_1(), dv = new oc.gp_Vec_1();
    try {
      const u0 = adaptor.FirstUParameter(), u1 = adaptor.LastUParameter();
      const v0 = adaptor.FirstVParameter(), v1 = adaptor.LastVParameter();
      let best = 1e9, u = u0, v = v0;
      for (let i = 0; i <= 8; i++) for (let j = 0; j <= 8; j++) {
        const uu = u0 + (u1 - u0) * i / 8, vv = v0 + (v1 - v0) * j / 8;
        adaptor.D0(uu, vv, p);
        const d = Math.hypot(p.X() - point.x, p.Y() - point.y, p.Z() - point.z);
        if (d < best) { best = d; u = uu; v = vv; }
      }
      [0.05, 0.01].forEach((step) => {
        [[step, 0], [-step, 0], [0, step], [0, -step], [step, step], [-step, step], [step, -step], [-step, -step]].forEach(([duu, dvv]) => {
          const uu = Math.min(u1, Math.max(u0, u + duu * (u1 - u0)));
          const vv = Math.min(v1, Math.max(v0, v + dvv * (v1 - v0)));
          adaptor.D0(uu, vv, p);
          const d = Math.hypot(p.X() - point.x, p.Y() - point.y, p.Z() - point.z);
          if (d < best) { best = d; u = uu; v = vv; }
        });
      });
      adaptor.D1(u, v, p, du, dv);
      let nx = du.Y() * dv.Z() - du.Z() * dv.Y(), ny = du.Z() * dv.X() - du.X() * dv.Z(), nz = du.X() * dv.Y() - du.Y() * dv.X();
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len; ny /= len; nz /= len;
      if (face.Orientation_1() === oc.TopAbs_Orientation.TopAbs_REVERSED) { nx = -nx; ny = -ny; nz = -nz; }
      return { normal: { x: nx, y: ny, z: nz }, dist: best };
    } finally { adaptor.delete(); p.delete(); du.delete(); dv.delete(); }
  };
  const inPlaneOffset = (point, normal, plane, distance) => {
    const alongPlane = normal.x * plane.x + normal.y * plane.y + normal.z * plane.z;
    const ix = normal.x - plane.x * alongPlane, iy = normal.y - plane.y * alongPlane, iz = normal.z - plane.z * alongPlane;
    const mag = Math.hypot(ix, iy, iz);
    if (mag < 1e-6) return point;
    const delta = distance / mag;
    return { x: point.x - ix / mag * delta, y: point.y - iy / mag * delta, z: point.z - iz / mag * delta };
  };
  const polygonWire = (points) => {
    const polygon = new oc.BRepBuilderAPI_MakePolygon_1(); owned.push(polygon);
    points.forEach((point) => {
      const p = new oc.gp_Pnt_3(point.x, point.y, point.z); owned.push(p);
      polygon.Add_1(p);
    });
    polygon.Close();
    if (!polygon.IsDone()) return null;
    const wire = polygon.Wire(); owned.push(wire);
    return wire;
  };
  const offsetGroup = (edges, walls, axis, origin) => {
    const points = [];
    edges.forEach((edge) => {
      sampleEdge(edge, 8).forEach((point) => {
        let best = null;
        walls.forEach((face) => {
          const hit = faceNormalAt(face, point);
          if (!best || hit.dist < best.dist) best = hit;
        });
        if (!best || best.dist > 0.2) return;
        points.push(inPlaneOffset(point, best.normal, axis, size));
      });
    });
    if (points.length < 3) return null;
    const seed = Math.abs(axis.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
    const xAxis = normalizedVector({ x: seed.y * axis.z - seed.z * axis.y, y: seed.z * axis.x - seed.x * axis.z, z: seed.x * axis.y - seed.y * axis.x });
    const yAxis = { x: axis.y * xAxis.z - axis.z * xAxis.y, y: axis.z * xAxis.x - axis.x * xAxis.z, z: axis.x * xAxis.y - axis.y * xAxis.x };
    const ordered = points.slice().sort((a, b) => {
      const au = (a.x - origin.x) * xAxis.x + (a.y - origin.y) * xAxis.y + (a.z - origin.z) * xAxis.z;
      const av = (a.x - origin.x) * yAxis.x + (a.y - origin.y) * yAxis.y + (a.z - origin.z) * yAxis.z;
      const bu = (b.x - origin.x) * xAxis.x + (b.y - origin.y) * xAxis.y + (b.z - origin.z) * xAxis.z;
      const bv = (b.x - origin.x) * yAxis.x + (b.y - origin.y) * yAxis.y + (b.z - origin.z) * yAxis.z;
      return Math.atan2(av, au) - Math.atan2(bv, bu);
    });
    const resampled = [];
    for (let i = 0; i < 36; i++) {
      const target = -Math.PI + 2 * Math.PI * i / 36;
      let best = ordered[0], bestDelta = 1e9;
      ordered.forEach((point) => {
        const u = (point.x - origin.x) * xAxis.x + (point.y - origin.y) * xAxis.y + (point.z - origin.z) * xAxis.z;
        const v = (point.x - origin.x) * yAxis.x + (point.y - origin.y) * yAxis.y + (point.z - origin.z) * yAxis.z;
        let delta = Math.atan2(v, u) - target;
        while (delta > Math.PI) delta -= 2 * Math.PI;
        while (delta < -Math.PI) delta += 2 * Math.PI;
        if (Math.abs(delta) < bestDelta) { bestDelta = Math.abs(delta); best = point; }
      });
      resampled.push(best);
    }
    return polygonWire(resampled);
  };
  try {
    const opening = faceDescriptor(oc, removed[0]);
    if (opening.surface !== "plane") throw new Error("Shell section fallback needs a planar opening");
    const axis = normalizedVector(opening.normal);
    const origin = opening.origin;
    if (removed.some((face) => Math.abs(Math.abs(
      (faceDescriptor(oc, face).normal.x || 0) * axis.x
      + (faceDescriptor(oc, face).normal.y || 0) * axis.y
      + (faceDescriptor(oc, face).normal.z || 0) * axis.z
    ) - 1) > 1e-3)) throw new Error("Shell openings are not parallel");
    const openingCoords = removed.map((face) => along(faceDescriptor(oc, face).origin, axis, origin));
    const centreProps = new oc.GProp_GProps_1(); owned.push(centreProps);
    oc.BRepGProp.VolumeProperties_1(brep.shape, centreProps, false, false, false);
    const mass = centreProps.CentreOfMass(); owned.push(mass);
    const centre = pointOf(mass);
    const capCoords = [];
    const faceExplorer = new oc.TopExp_Explorer_2(brep.shape, oc.TopAbs_ShapeEnum.TopAbs_FACE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE); owned.push(faceExplorer);
    const bodyFaces = [];
    while (faceExplorer.More()) {
      const face = oc.TopoDS.Face_1(faceExplorer.Current()); owned.push(face);
      const descriptor = faceDescriptor(oc, face);
      bodyFaces.push({ face, descriptor });
      if (descriptor.surface === "plane" && Math.abs((descriptor.normal.x || 0) * axis.x + (descriptor.normal.y || 0) * axis.y + (descriptor.normal.z || 0) * axis.z) > 0.9) {
        const coord = along(descriptor.origin, axis, origin);
        if (!openingCoords.some((value) => Math.abs(value - coord) < 1e-4)
          && !removed.some((openingFace) => openingFace.IsSame(face))) capCoords.push(coord);
      }
      faceExplorer.Next();
    }
    const edgeExplorer = new oc.TopExp_Explorer_2(brep.shape, oc.TopAbs_ShapeEnum.TopAbs_EDGE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE); owned.push(edgeExplorer);
    const groups = new Map();
    while (edgeExplorer.More()) {
      const edge = oc.TopoDS.Edge_1(edgeExplorer.Current()); owned.push(edge);
      const adaptor = new oc.BRepAdaptor_Curve_2(edge); owned.push(adaptor);
      const samples = [];
      for (let i = 0; i < 5; i++) {
        const parameter = adaptor.FirstParameter() + (adaptor.LastParameter() - adaptor.FirstParameter()) * i / 4;
        const point = adaptor.Value(parameter); owned.push(point);
        samples.push(along(pointOf(point), axis, origin));
      }
      if (samples.every((value) => Math.abs(value - samples[0]) < 1e-4)) {
        const key = samples[0].toFixed(5);
        if (!groups.has(key)) groups.set(key, { coord: +key, edges: [] });
        const group = groups.get(key);
        if (!group.edges.some((other) => other.IsSame(edge))) group.edges.push(edge);
      }
      edgeExplorer.Next();
    }
    const sorted = [...groups.values()].sort((a, b) => a.coord - b.coord);
    if (sorted.length < 2) throw new Error("Shell section fallback needs two planar loops");
    const spanIsSmooth = (a, b) => {
      const lo = Math.min(a, b), hi = Math.max(a, b);
      return bodyFaces.some(({ descriptor }) => {
        if (descriptor.surface !== "bspline" && descriptor.surface !== "bezier") return false;
        const bounds = descriptor.bounds;
        if (!bounds) return false;
        const ends = [along(bounds.min, axis, origin), along(bounds.max, axis, origin)];
        return Math.min(...ends) < hi - 1e-4 && Math.max(...ends) > lo + 1e-4;
      });
    };
    const offsetFaceUniform = (edges) => {
      const maker = new oc.BRepBuilderAPI_MakeWire_1(); owned.push(maker);
      edges.forEach((edge) => maker.Add_1(edge));
      if (!maker.IsDone()) return null;
      const wire = maker.Wire(); owned.push(wire);
      const faceMaker = new oc.BRepBuilderAPI_MakeFace_15(wire, true); owned.push(faceMaker);
      if (!faceMaker.IsDone()) return null;
      const face = faceMaker.Face(); owned.push(face);
      const props = new oc.GProp_GProps_1(); owned.push(props);
      oc.BRepGProp.SurfaceProperties_1(face, props, true, false);
      const area = Math.abs(props.Mass());
      for (const sign of [-1, 1]) {
        const offsetter = new oc.BRepOffsetAPI_MakeOffset_2(face, oc.GeomAbs_JoinType.GeomAbs_Arc, false); owned.push(offsetter);
        try { offsetter.Perform(sign * size, 0); } catch { continue; }
        if (!offsetter.IsDone()) continue;
        const shape = offsetter.Shape(); owned.push(shape);
        let offsetWire = null;
        if (shape.ShapeType().value === oc.TopAbs_ShapeEnum.TopAbs_WIRE.value) offsetWire = oc.TopoDS.Wire_1(shape);
        else {
          const explorer = new oc.TopExp_Explorer_2(shape, oc.TopAbs_ShapeEnum.TopAbs_WIRE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
          try { if (explorer.More()) offsetWire = oc.TopoDS.Wire_1(explorer.Current()); } finally { explorer.delete(); }
        }
        if (!offsetWire) continue;
        owned.push(offsetWire);
        const checkMaker = new oc.BRepBuilderAPI_MakeFace_15(offsetWire, true); owned.push(checkMaker);
        if (!checkMaker.IsDone()) continue;
        const checkFace = checkMaker.Face(); owned.push(checkFace);
        const checkProps = new oc.GProp_GProps_1(); owned.push(checkProps);
        oc.BRepGProp.SurfaceProperties_1(checkFace, checkProps, true, false);
        if (Math.abs(checkProps.Mass()) < area - 1e-9) return offsetWire;
      }
      return null;
    };
    const shiftCap = (wire, coord) => {
      if (!capCoords.some((value) => Math.abs(value - coord) < 1e-4)
        || openingCoords.some((value) => Math.abs(value - coord) < 1e-4)) return wire;
      const inward = along(centre, axis, origin) - coord;
      const shift = (inward >= 0 ? 1 : -1) * size;
      const trsf = new oc.gp_Trsf_1(), vector = new oc.gp_Vec_4(axis.x * shift, axis.y * shift, axis.z * shift); owned.push(trsf, vector);
      trsf.SetTranslation_1(vector);
      const moved = new oc.BRepBuilderAPI_Transform_2(wire, trsf, true); owned.push(moved);
      const placed = oc.TopoDS.Wire_1(moved.Shape()); owned.push(placed);
      return placed;
    };
    const pieces = [];
    for (let i = 0; i < sorted.length - 1; i++) {
      const lo = Math.min(sorted[i].coord, sorted[i + 1].coord), hi = Math.max(sorted[i].coord, sorted[i + 1].coord);
      const walls = bodyFaces.filter(({ descriptor }) => {
        if (descriptor.surface === "plane" && Math.abs((descriptor.normal.x || 0) * axis.x + (descriptor.normal.y || 0) * axis.y + (descriptor.normal.z || 0) * axis.z) > 0.9) return false;
        const bounds = descriptor.bounds;
        if (!bounds) return true;
        const ends = [along(bounds.min, axis, origin), along(bounds.max, axis, origin)];
        return Math.min(...ends) < hi - 1e-4 && Math.max(...ends) > lo + 1e-4;
      }).map((entry) => entry.face);
      const smooth = spanIsSmooth(sorted[i].coord, sorted[i + 1].coord);
      const offset = (edges) => smooth ? offsetGroup(edges, walls, axis, origin) : offsetFaceUniform(edges);
      const wireA = shiftCap(offset(sorted[i].edges), sorted[i].coord);
      const wireB = shiftCap(offset(sorted[i + 1].edges), sorted[i + 1].coord);
      if (!wireA || !wireB) throw new Error("Shell section offset failed");
      const maker = new oc.BRepOffsetAPI_ThruSections(true, !smooth, 1e-6); owned.push(maker);
      maker.AddWire(wireA);
      maker.AddWire(wireB);
      maker.CheckCompatibility(true);
      const progress = new oc.Message_ProgressRange_1(); owned.push(progress);
      maker.Build(progress);
      if (!maker.IsDone()) throw new Error("Shell section loft failed");
      const shape = maker.Shape();
      pieces.push({ oc, shape: shapeVolume(oc, shape) < 0 ? shape.Reversed() : shape, kind: "solid" });
    }
    let inner = pieces[0];
    for (let i = 1; i < pieces.length; i++) {
      const fused = await booleanBrep("union", inner, pieces[i]);
      if (inner !== pieces[0]) disposeBrep(inner);
      inner = fused;
    }
    try {
      const result = await booleanBrep("subtract", brep, inner);
      if (!shapeIsValid(oc, result.shape) || !(shapeVolume(oc, result.shape) > 1e-9)) {
        disposeBrep(result);
        throw new Error("Shell section cavity is invalid");
      }
      const before = shapeBounds(oc, brep.shape, false), after = shapeBounds(oc, result.shape, false);
      const grown = !before || !after || after.min.x < before.min.x - 1e-4 || after.max.x > before.max.x + 1e-4
        || after.min.y < before.min.y - 1e-4 || after.max.y > before.max.y + 1e-4
        || after.min.z < before.min.z - 1e-4 || after.max.z > before.max.z + 1e-4;
      if (grown) { disposeBrep(result); throw new Error("Shell section cavity grew the body"); }
      const limiter = new oc.ShapeFix_ShapeTolerance();
      try { limiter.LimitTolerance(result.shape, 1e-7, 1e-3, oc.TopAbs_ShapeEnum.TopAbs_SHAPE); }
      finally { limiter.delete(); }
      result.operation = "shell";
      return result;
    } finally {
      disposeBrep(inner);
      pieces.forEach((piece) => { if (piece !== inner) disposeBrep(piece); });
    }
  } finally { disposeAll(owned); }
}

function shapeHasSolid(oc, shape) {
  const explorer = new oc.TopExp_Explorer_2(shape, oc.TopAbs_ShapeEnum.TopAbs_SOLID, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
  try { return explorer.More(); } finally { explorer.delete(); }
}

function shapeVolume(oc, shape) {
  const props = new oc.GProp_GProps_1();
  try { oc.BRepGProp.VolumeProperties_1(shape, props, false, false, false); return props.Mass(); }
  finally { props.delete(); }
}

/* Thicken: give a surface a thickness.
 *
 * The selected faces are offset into a slab of their own. On a surface body —
 * a sweep or a loft built with "Create solid" off, which has no volume at all —
 * that slab IS the answer, which is the classic surface-to-solid. On a solid it
 * is a boss standing on the chosen faces, so the slab is fused back in; leaving
 * it loose would silently replace the body it was grown from.
 *
 * MakeThickSolidBySimple is the offset used rather than the join variant: a
 * face is a single sheet with nothing to intersect against, and the join
 * variant returns a corner-rounded shell of the wrong volume for one. It has
 * one trap — a POSITIVE offset comes back inside out (negative volume) while a
 * negative one does not — so the orientation is read off the volume and fixed
 * rather than assumed from the sign. */
export async function thickenBrep(brep, thickness, options = {}) {
  if (!brep?.shape) throw new Error("Thicken needs a BREP shape");
  const oc = brep.oc || await loadCadKernel();
  const faces = selectedBrepSubshapes(brep, "face", options.facePersistentIds || options.faces || []);
  if (!faces.length) throw new Error("Thicken has no resolved faces");
  const size = Math.abs(Number(thickness) || 0);
  if (!(size > 1e-6)) throw new Error("Thicken needs a non-zero thickness");
  const offset = (options.direction === "inside" ? -1 : 1) * size;
  const owned = [];
  let slab = null;
  try {
    let source = faces[0];
    if (faces.length > 1) {
      // Separate sheets offset separately would overlap at every shared edge;
      // sewn first, they are one surface and the offset is one wall.
      const sewing = new oc.BRepBuilderAPI_Sewing(1e-6, true, true, true, false); owned.push(sewing);
      const sewProgress = new oc.Message_ProgressRange_1(); owned.push(sewProgress);
      faces.forEach((face) => sewing.Add(face));
      sewing.Perform(sewProgress);
      source = sewing.SewedShape();
    }
    const maker = new oc.BRepOffsetAPI_MakeThickSolid(); owned.push(maker);
    const progress = new oc.Message_ProgressRange_1(); owned.push(progress);
    maker.MakeThickSolidBySimple(source, offset);
    maker.Build(progress);
    if (maker.HasErrors?.() || !maker.IsDone?.()) throw new Error("OpenCascade thicken failed");
    let shape = maker.Shape();
    const volume = shapeVolume(oc, shape);
    if (!Number.isFinite(volume) || Math.abs(volume) < 1e-9) throw new Error("Thicken produced an empty solid");
    if (volume < 0) shape = shape.Reversed();
    slab = { oc, shape, kind: "solid", operation: "thicken" };
    if (!shapeHasSolid(oc, brep.shape)) return slab;   // a surface has nothing to fuse into
    const fused = await booleanBrep("union", brep, slab);
    disposeBrep(slab); slab = null;
    fused.operation = "thicken";
    return fused;
  } catch (error) {
    if (slab) disposeBrep(slab);
    throw error;
  } finally { disposeAll(owned); }
}

export {
  edgeIsFinishTarget, edgeOnAnyFace, finishEdgeSelection, shapeHasSolid,
  shapeVolume,
};
