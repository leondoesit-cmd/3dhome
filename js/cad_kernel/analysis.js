/* The CAD kernel's face unification, material intersection, overlap and
   connectivity checks, translation and warnings, split out of js/cad_kernel.js.
   It shares the editor's state through live imports from ../cad_kernel.js. */
import { solidPieces, transformBrep } from "../cad_kernel/body_ops.js";
import { shapeHasSolid, shapeVolume } from "../cad_kernel/finish_shell.js";
import { booleanBrep, exceedsExportTolerance } from "../cad_kernel/solids.js";
import { hydrateSerializedBrepTopology } from "../cad_kernel/topology_primitives.js";
import { circularPatternPivot } from "../core/pattern_geometry.js";
import {
  CAD_WORKING_UNIT, DEFAULT_EXPORT_TOLERANCE_CM, browserKernelFactory,
  clearBrepTopology, compiledKernelModule, disposeAll, kernelFilePath,
  kernelInstance, loadCadKernel, opaqueBreps, shapeBounds,
} from "../cad_kernel.js";

/* Coplanar faces welded back into one after a boolean.
 *
 * BRepAlgoAPI_Fuse keeps the argument faces as it found them, so fusing a run
 * of overlapping copies leaves the outside of the result cut into as many
 * panels as there were copies — the material is one solid, but the SEAMS of the
 * bodies that made it are still faces. Picking one to fillet then rounds a
 * third of an edge. Unifying same-domain faces and edges is what makes the
 * fused body indistinguishable from a body that was always one shape, which is
 * the whole promise of "merge". */
export async function unifyBrepFaces(brep) {
  if (!brep?.shape) throw new Error("Unify needs a BREP shape");
  const oc = brep.oc || await loadCadKernel();
  const owned = [];
  try {
    const unifier = new oc.ShapeUpgrade_UnifySameDomain_2(brep.shape, true, true, false); owned.push(unifier);
    unifier.Build();
    return { oc, shape: unifier.Shape(), kind: brep.kind || "solid" };
  } finally { disposeAll(owned); }
}

/* Do these two solids share material? The question a merged pattern asks of
   every neighbouring pair, and the only honest answer comes from the kernel:
   two thin radial blades have overlapping bounding boxes and touch nowhere.
   Common-and-measure rather than fuse-and-count-lumps because it costs one
   boolean and gives a number, not a topology walk. Solids that meet on a plane
   and nowhere else share no volume and are reported apart — "overlap" is the
   rule the option states, and a measure-zero contact is not one. A boolean that
   fails answers "apart": leaving two bodies standing is the recoverable
   mistake, fusing them on a failed test is not. */
// Unlike the pattern convenience predicate, manufacturing scope must propagate
// kernel failures: a failed intersection is unknown, never a proven miss.
export async function brepMaterialIntersection(left,right,tolerance=1e-10){
  if(!left?.shape||!right?.shape)throw new Error("Exact intersection requires two solids");
  let common;
  try{common=await booleanBrep("intersect",left,right);const volume=shapeHasSolid(common.oc,common.shape)?Math.abs(shapeVolume(common.oc,common.shape)):0;return {intersects:volume>tolerance,volume,bounds:volume>tolerance?shapeBounds(common.oc,common.shape,false):null};}
  finally{if(common)disposeBrep(common);}
}

export async function brepsOverlap(left, right, tolerance = 1e-9) {
  if (!left?.shape || !right?.shape) return false;
  let common = null;
  try {
    common = await booleanBrep("intersect", left, right);
    const oc = common.oc;
    if (!shapeHasSolid(oc, common.shape)) return false;
    return Math.abs(shapeVolume(oc, common.shape)) > tolerance;
  } catch { return false; }
  finally { if (common) disposeBrep(common); }
}

/* The connected lumps of a set of solids, as index groups.
 *
 * Overlap is transitive here — A meets B and B meets C makes one body even
 * though A and C never touch — so this is a union-find over the pairs that a
 * cheap bounding-box test says are worth asking the kernel about. Pairs already
 * in the same group are skipped, which is what keeps a heavily overlapping
 * pattern near linear instead of testing all n(n-1)/2 pairs. */
export function boundsMayOverlap(a, b) {
  if (!a || !b) return true;
  return a.x0 <= b.x1 + 1e-6 && a.x1 >= b.x0 - 1e-6 && a.y0 <= b.y1 + 1e-6
    && a.y1 >= b.y0 - 1e-6 && a.z0 <= b.z1 + 1e-6 && a.z1 >= b.z0 - 1e-6;
}

export async function brepConnectedGroups(entries = []) {
  const parent = entries.map((entry, index) => index);
  const find = (index) => { while (parent[index] !== index) { parent[index] = parent[parent[index]]; index = parent[index]; } return index; };
  const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[rb] = ra; };

  for (let i = 0; i < entries.length; i++) for (let j = i + 1; j < entries.length; j++) {
    if (find(i) === find(j)) continue;
    if (!boundsMayOverlap(entries[i].bounds, entries[j].bounds)) continue;
    if (await brepsOverlap(entries[i].brep, entries[j].brep)) union(i, j);
  }
  const groups = new Map();
  entries.forEach((entry, index) => {
    const root = find(index);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(index);
  });
  return [...groups.values()];
}

/* A plain move. transformBrep states one as a frame whose origin is the negated
   delta, which is easy to get backwards at the call site. */
export async function translateBrep(brep, delta = {}) {
  return transformBrep(brep, { origin: {
    x: -(Number(delta.x) || 0), y: -(Number(delta.y) || 0), z: -(Number(delta.z) || 0),
  } });
}

function joinedWarnings(warnings) {
  return [...new Set(warnings.filter(Boolean))].join(" ");
}

export async function compoundBrep(inputs=[]) {
  const valid=inputs.filter((entry)=>entry?.shape);if(!valid.length)throw new Error("Compound needs at least one shape");
  const oc=valid[0].oc || await loadCadKernel(),builder=new oc.TopoDS_Builder(),compound=new oc.TopoDS_Compound();
  try {
    builder.MakeCompound(compound);
    valid.forEach((entry)=>{opaqueBreps.get(entry)?.materialize();builder.Add(compound,entry.shape);});
    const result = {oc,shape:compound,kind:"compound"};
    for (const flag of ["invalid","approximate"]) {
      const warning = joinedWarnings(valid.map(entry=>entry[flag]));
      if (warning) result[flag] = warning;
    }
    return result;
  }
  catch(error){compound.delete?.();throw error;}finally{builder.delete();}
}

export async function linearPatternBrep(source,params={}) {
  if(!source?.shape)throw new Error("Pattern seed is unavailable");const count=Math.max(1,Math.round(Number(params.count)||1)),vector=params.vector || {x:0,y:0,z:0},copies=[source];
  try {
  for(let index=1;index<count;index++)copies.push(await transformBrep(source,{origin:{x:-Number(vector.x||0)*index,y:-Number(vector.y||0)*index,z:-Number(vector.z||0)*index}}));
  return await compoundBrep(copies);
  } finally {copies.slice(1).forEach(disposeBrep);}
}

export async function linearGridPatternBrep(source,params={}) {
  if(!source?.shape)throw new Error("Pattern seed is unavailable");
  const offsets=Array.isArray(params.offsets)?params.offsets.slice(0,127):[],copies=[source];
  try {
    for(const offset of offsets)copies.push(await transformBrep(source,{origin:{x:-Number(offset?.x||0),y:-Number(offset?.y||0),z:-Number(offset?.z||0)}}));
    return await compoundBrep(copies);
  } finally { copies.slice(1).forEach((copy)=>disposeBrep(copy)); }
}

export async function circularPatternBrep(source,params={}) {
  if(!source?.shape)throw new Error("Pattern seed is unavailable");const oc=source.oc || await loadCadKernel(),count=Math.max(1,Math.min(256,Math.round(Number(params.count)||1))),step=(Number(params.angle)||360/count)*Math.PI/180,copies=[source],skipped=new Set((params.skipIndices || []).map((value)=>Math.round(Number(value)))),pivot=circularPatternPivot(params);
  try {
  for(let index=1;index<count;index++){if(skipped.has(index))continue;const origin=new oc.gp_Pnt_3(pivot.x,pivot.y,pivot.z),direction=new oc.gp_Dir_4(params.axis==="x"?1:0,params.axis==="y"||!params.axis?1:0,params.axis==="z"?1:0),axis=new oc.gp_Ax1_2(origin,direction),trsf=new oc.gp_Trsf_1();let maker;try{trsf.SetRotation_1(axis,step*index);maker=new oc.BRepBuilderAPI_Transform_2(source.shape,trsf,true);copies.push({oc,shape:maker.Shape(),kind:"pattern-copy"});}finally{maker?.delete?.();trsf.delete();axis.delete();direction.delete();origin.delete();}}
  return await compoundBrep(copies);
  } finally {copies.slice(1).forEach(disposeBrep);}
}

/* A pattern along a curve. Each copy is one rigid transform — the rotation the
   parallel-transport frame turned through, and the shift that puts the seed on
   its station — so the kernel result carries the same orientation the viewport
   draws rather than the bare offset a grid pattern would reduce it to.
   gp_Trsf::SetValues takes the 3x4 row-major matrix directly; a frame's basis
   is orthonormal by construction, which is what it insists on. */
export async function curvePatternBrep(source, params = {}) {
  if (!source?.shape) throw new Error("Pattern seed is unavailable");
  const oc = source.oc || await loadCadKernel();
  const placements = (Array.isArray(params.placements) ? params.placements : []).slice(0, 127);
  const copies = [source];
  try {
    for (const placement of placements) {
      const m = placement && placement.matrix, t = (placement && placement.translation) || { x: 0, y: 0, z: 0 };
      if (!Array.isArray(m) || m.length !== 9) throw new Error("Curve pattern placement has no transform");
      const trsf = new oc.gp_Trsf_1();
      let maker;
      try {
        trsf.SetValues(
          m[0], m[1], m[2], Number(t.x) || 0,
          m[3], m[4], m[5], Number(t.y) || 0,
          m[6], m[7], m[8], Number(t.z) || 0,
        );
        maker = new oc.BRepBuilderAPI_Transform_2(source.shape, trsf, true);
        copies.push({ oc, shape: maker.Shape(), kind: "pattern-copy" });
      } finally { maker?.delete?.(); trsf.delete(); }
    }
    return await compoundBrep(copies);
  } finally { copies.slice(1).forEach((copy) => disposeBrep(copy)); }
}

export async function mirrorBrep(source, params = {}) {
  if (!source?.shape) throw new Error("Mirror seed is unavailable");
  const oc = source.oc || await loadCadKernel();
  const plane = params.plane?.descriptor || params.plane || {};
  const origin = plane.origin || { x:0, y:0, z:0 };
  const raw = plane.normal || { x:1, y:0, z:0 };
  const length = Math.hypot(Number(raw.x)||0, Number(raw.y)||0, Number(raw.z)||0);
  if (length < 1e-9) throw new Error("Mirror plane has no valid normal");
  const nx=(Number(raw.x)||0)/length, ny=(Number(raw.y)||0)/length, nz=(Number(raw.z)||0)/length;
  const dot=nx*(Number(origin.x)||0)+ny*(Number(origin.y)||0)+nz*(Number(origin.z)||0);
  const trsf=new oc.gp_Trsf_1(); let maker, mirrored;
  try {
    trsf.SetValues(
      1-2*nx*nx, -2*nx*ny, -2*nx*nz, 2*dot*nx,
      -2*ny*nx, 1-2*ny*ny, -2*ny*nz, 2*dot*ny,
      -2*nz*nx, -2*nz*ny, 1-2*nz*nz, 2*dot*nz,
    );
    maker=new oc.BRepBuilderAPI_Transform_2(source.shape,trsf,true);
    mirrored={oc,shape:maker.Shape(),kind:"mirror-copy"};
    if(params.keepOriginal === false){const result=mirrored;mirrored=null;return result;}
    const result=await compoundBrep([source,mirrored]);disposeBrep(mirrored);mirrored=null;return result;
  } finally {
    if (mirrored?.shape) mirrored.shape.delete?.();
    maker?.delete?.(); trsf.delete();
  }
}

export async function serializeBrep(brep, fileName = "shape.brep") {
  const opaque=opaqueBreps.get(brep);
  if(opaque)return new Uint8Array(opaque.bytes);
  if (!brep?.shape) throw new Error("No BREP shape to serialize");
  const oc = brep.oc || await loadCadKernel();
  const progress = new oc.Message_ProgressRange_1(), path = kernelFilePath(fileName, "brep");
  try {
    if (!oc.BRepTools.Write_3(brep.shape, path, progress)) throw new Error("OpenCascade could not serialize the BREP");
    return new Uint8Array(oc.FS.readFile(path));
  } finally {
    try { oc.FS.unlink(path); } catch (_) {}
    progress.delete();
  }
}

export async function deserializeBrep(data, fileName = "shape.brep") {
  return deserializeBrepWithKernel(await loadCadKernel(),data,fileName);
}

function deserializeBrepWithKernel(oc,data,fileName="shape.brep") {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const progress = new oc.Message_ProgressRange_1(), builder = new oc.BRep_Builder();
  const shape = new oc.TopoDS_Shape(), path = kernelFilePath(fileName, "brep");
  try {
    oc.FS.writeFile(path, bytes);
    if (!oc.BRepTools.Read_2(shape, path, builder, progress) || shape.IsNull()) throw new Error("OpenCascade could not restore the BREP");
    return { oc, shape, kind:"persisted-brep", sourceName:fileName };
  } catch (error) {
    shape.delete?.();
    throw error;
  } finally {
    try { oc.FS.unlink(path); } catch (_) {}
    builder.delete(); progress.delete();
  }
}

// Worker BREP stays opaque for display, persistence and measurement. Preserve
// the truthy .shape contract for existing callers; .oc/.subshapes or a native
// shape query materializes it only when an actual geometric operation needs it.
// Restore must await loadCadKernel before publishing this body, so synchronous
// legacy consumers (e.g. face offsets) only deserialize into an existing heap.
export function deferSerializedBrep(data,metadata={},topology=[],options={}) {
  if(!compiledKernelModule || !browserKernelFactory)return null;
  const body={...metadata,topology},state={bytes:data instanceof Uint8Array?data:new Uint8Array(data)};
  const materialize=()=>{
    if(!opaqueBreps.has(body)){
      if(!body.shape)throw new Error('The exact BREP has been disposed');
      return body;
    }
    if(!kernelInstance)throw new Error('deferSerializedBrep.materialize: CAD kernel is not initialized; the worker restore path must await loadCadKernel() before returning a BREP');
    const native=deserializeBrepWithKernel(kernelInstance,state.bytes);
    try{hydrateSerializedBrepTopology(native,body.topology,options);}
    catch(error){disposeBrep(native);throw error;}
    Object.defineProperties(body,{oc:{value:native.oc,writable:true,enumerable:true,configurable:true},subshapes:{value:native.subshapes,writable:true,enumerable:true,configurable:true}});
    body.shape=native.shape;body.topology=native.topology;opaqueBreps.delete(body);
    return body;
  };
  state.materialize=materialize;
  body.shape={IsNull:()=>materialize().shape.IsNull()};
  Object.defineProperties(body,{oc:{get:()=>materialize().oc,enumerable:true,configurable:true},subshapes:{get:()=>materialize().subshapes,enumerable:true,configurable:true}});
  opaqueBreps.set(body,state);
  return body;
}

// Manufacturing exchange defaults to solids. Surface exchange is deliberate:
// callers may set allowSurfaces, but invalid topology is never transferable.
export async function validateBrepForExport(brep, options = {}) {
  if (!brep?.shape || brep.shape.IsNull()) throw new Error("Export requires a nonempty BREP shape");
  const oc = brep.oc || await loadCadKernel();
  const maximumTolerance = Number(options.maxToleranceCm ?? DEFAULT_EXPORT_TOLERANCE_CM);
  if (!Number.isFinite(maximumTolerance) || maximumTolerance <= 0) throw new Error("Export tolerance must be positive and finite");
  const analyzer = new oc.BRepCheck_Analyzer(brep.shape, true, false);
  const tolerance = new oc.ShapeAnalysis_ShapeTolerance();
  const pieces = [];
  try {
    if (!analyzer.IsValid_2()) throw new Error("Export blocked: invalid BREP topology or geometry; repair the body first");
    const actualTolerance = tolerance.Tolerance(brep.shape, 1, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
    if (exceedsExportTolerance(actualTolerance, maximumTolerance)) throw new Error("Export blocked: body tolerance exceeds " + maximumTolerance + " cm (actual " + actualTolerance + " cm)");
    pieces.push(...solidPieces(oc, brep.shape));
    if (!pieces.length && !options.allowSurfaces) throw new Error("Export blocked: no closed solid; use surface exchange for an intentional sheet body");
    for (const piece of pieces) {
      if (!Number.isFinite(piece.volume) || piece.volume <= 0) throw new Error("Export blocked: solid has zero, negative or nonfinite volume");
    }
    // Detect loose faces inside a compound containing otherwise valid solids.
    const loose = new oc.TopExp_Explorer_2(brep.shape, oc.TopAbs_ShapeEnum.TopAbs_FACE, oc.TopAbs_ShapeEnum.TopAbs_SOLID);
    try {
      if (!pieces.length && !loose.More()) throw new Error("Export blocked: no solid or surface geometry");
      if (loose.More() && !options.allowSurfaces) throw new Error("Export blocked: body contains faces outside closed solids");
    }
    finally { loose.delete(); }
    return { valid:true, solidCount:pieces.length, volumeCm3:pieces.reduce((sum,piece)=>sum+piece.volume,0), maxToleranceCm:actualTolerance };
  } finally {
    for (const piece of pieces) piece.shape.delete();
    tolerance.delete(); analyzer.delete();
  }
}

export async function exportStep(brep, fileName = "model.step", options = {}) {
  if (!brep?.shape) throw new Error("No BREP shape to export");
  const oc = brep.oc || await loadCadKernel();
  await validateBrepForExport(brep, options);
  // The first writer registers the STEP resource parameters in this WASM
  // build.  A writer snapshots the cascade/output units at construction, so
  // the real writer must be created only after both values are configured.
  const bootstrapWriter = new oc.STEPControl_Writer_1();
  oc.Interface_Static.SetCVal("xstep.cascade.unit", "CM");
  oc.Interface_Static.SetCVal("write.step.unit", String(options.outputUnit || "CM").toUpperCase());
  bootstrapWriter.delete();
  const writer = new oc.STEPControl_Writer_1(), progress = new oc.Message_ProgressRange_1();
  const path = "/" + fileName.replace(/[^a-z0-9_.-]/gi, "_");
  try {
    const transferred = writer.Transfer(brep.shape, oc.STEPControl_StepModelType.STEPControl_AsIs, true, progress);
    if (transferred.value !== oc.IFSelect_ReturnStatus.IFSelect_RetDone.value) throw new Error("STEP transfer failed");
    if (writer.Write(path).value !== oc.IFSelect_ReturnStatus.IFSelect_RetDone.value) throw new Error("STEP writer failed");
    const bytes = oc.FS.readFile(path);
    return new Uint8Array(bytes);
  } finally {
    try { oc.FS.unlink(path); } catch (_) {}
    writer.delete(); progress.delete();
  }
}

export async function exportIges(brep, fileName = "model.igs", options = {}) {
  if (!brep?.shape) throw new Error("No BREP shape to export");
  await validateBrepForExport(brep, options);
  const oc = brep.oc || await loadCadKernel();
  const bootstrapWriter = new oc.IGESControl_Writer_1();
  oc.Interface_Static.SetCVal("xstep.cascade.unit", "CM");
  bootstrapWriter.delete();
  const writer = new oc.IGESControl_Writer_2("CM", 1);
  const modelHandle=writer.Model(),model=modelHandle.get(),header=model.GlobalSection();
  try { header.SetCascadeUnit(CAD_WORKING_UNIT.millimetersPerUnit);model.SetGlobalSection(header); }
  finally { header.delete();modelHandle.delete(); }
  const progress = new oc.Message_ProgressRange_1();
  const path = "/" + fileName.replace(/[^a-z0-9_.-]/gi, "_");
  try {
    if (!writer.AddShape(brep.shape, progress)) throw new Error("IGES transfer failed");
    writer.ComputeModel();
    if (!writer.Write_2(path, false)) throw new Error("IGES writer failed");
    return new Uint8Array(oc.FS.readFile(path));
  } finally { try { oc.FS.unlink(path); } catch (_) {} writer.delete(); progress.delete(); }
}

export async function importStep(data, fileName = "import.step", options = {}) {
  const oc = await loadCadKernel();
  const path = "/" + fileName.replace(/[^a-z0-9_.-]/gi, "_");
  const reader = new oc.STEPControl_Reader_1(), progress = new oc.Message_ProgressRange_1();
  try {
    oc.FS.writeFile(path, data instanceof Uint8Array ? data : new Uint8Array(data));
    reader.ReadFile(path);
    const systemLengthUnit=Number(options.millimetersPerUnit ?? options.unitsPerMeter) || CAD_WORKING_UNIT.millimetersPerUnit;
    reader.SetSystemLengthUnit(systemLengthUnit);
    reader.TransferRoots(progress);
    return { oc, shape: reader.OneShape(), kind: "imported-step", sourceName: fileName, workingUnit:CAD_WORKING_UNIT.name };
  } finally {
    try { oc.FS.unlink(path); } catch (_) {}
    reader.delete(); progress.delete();
  }
}

export function disposeBrep(brep) {
  if(opaqueBreps.has(brep)){
    opaqueBreps.delete(brep);brep.shape=null;
    Object.defineProperties(brep,{oc:{value:undefined,writable:true,enumerable:true,configurable:true},subshapes:{value:undefined,writable:true,enumerable:true,configurable:true}});
    return;
  }
  clearBrepTopology(brep);
  try { brep?.shape?.delete?.(); } catch (_) {}
}

export { joinedWarnings };
