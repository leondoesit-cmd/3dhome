// OCCT's small blend patches can be much less accurate than their
// analytic support faces. Refit only that specific failure, preserving the
// original boundary curves and tangency to the cylindrical rounds.
export function repairFilletCornerPatches(oc, source, tolerance = .001) {
  const owned = [], keep = value => (owned.push(value), value);
  const each = (shape, kind, fn) => {
    const explorer = keep(new oc.TopExp_Explorer_2(shape, kind, oc.TopAbs_ShapeEnum.TopAbs_SHAPE));
    for (; explorer.More(); explorer.Next()) fn(keep(explorer.Current()));
  };
  const maxTolerance = shape => keep(new oc.ShapeAnalysis_ShapeTolerance()).Tolerance(shape, 1, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
  const volume = shape => {
    const props = keep(new oc.GProp_GProps_1());
    oc.BRepGProp.VolumeProperties_1(shape, props, true, false, false);
    return props.Mass();
  };
  let accepted = null;
  try {
    if (!(maxTolerance(source) > tolerance)) return null;
    // The fallback must never change the caller's shape if any later check fails.
    const copier = keep(new oc.BRepBuilderAPI_Copy_2(source, true, false));
    const shape = keep(copier.Shape()), faces = [], replacements = [];
    each(shape, oc.TopAbs_ShapeEnum.TopAbs_FACE, item => faces.push(keep(oc.TopoDS.Face_1(item))));
    const edgesOf = face => {
      const edges = [];
      each(face, oc.TopAbs_ShapeEnum.TopAbs_EDGE, item => {
        const edge = keep(oc.TopoDS.Edge_1(item));
        if (!edges.some(other => other.IsSame(edge))) edges.push(edge);
      });
      return edges;
    };
    const faceEdges = faces.map(edgesOf);
    const progress = keep(new oc.Message_ProgressRange_1());
    for (let index = 0; index < faces.length; index++) {
      const face = faces[index], edges = faceEdges[index];
      const surface = keep(new oc.BRepAdaptor_Surface_2(face, true));
      if (surface.GetType() !== oc.GeomAbs_SurfaceType.GeomAbs_BSplineSurface || ![3,4].includes(edges.length) ||
          !edges.every(edge => oc.BRep_Tool.Tolerance_2(edge) > tolerance)) continue;
      const supports = edges.map(edge => faces.find((other, at) => at !== index && faceEdges[at].some(candidate => candidate.IsSame(edge))));
      if (supports.some(face => !face)) return null;
      const kinds = supports.map(face => keep(new oc.BRepAdaptor_Surface_2(face, true)).GetType());
      // Native Boolean restoration can split the planar boundary of the same
      // corner, giving four edges instead of three. Preserve every boundary.
      if (kinds.filter(kind => kind === oc.GeomAbs_SurfaceType.GeomAbs_Plane).length !== edges.length-2 ||
          kinds.filter(kind => kind === oc.GeomAbs_SurfaceType.GeomAbs_Cylinder).length !== 2) continue;
      if (replacements.length >= 8) return null;
      const filling = keep(new oc.BRepOffsetAPI_MakeFilling(3, 30, 3, false, 1e-7, 1e-7, .001, .01, 12, 20));
      edges.forEach((edge, at) => filling.Add_2(edge, supports[at], kinds[at] === oc.GeomAbs_SurfaceType.GeomAbs_Plane ?
        oc.GeomAbs_Shape.GeomAbs_C0 : oc.GeomAbs_Shape.GeomAbs_G1, true));
      filling.Build(progress);
      if (!filling.IsDone() || filling.G0Error_1() > 1e-5 || filling.G1Error_1() > .001) return null;
      replacements.push({ face, replacement: keep(filling.Shape()) });
    }
    if (!replacements.length) return null;
    const sewing = keep(new oc.BRepBuilderAPI_Sewing(1e-5, true, true, true, false));
    faces.forEach(face => sewing.Add(replacements.find(item => item.face.IsSame(face))?.replacement || face));
    sewing.Perform(progress);
    if (sewing.NbFreeEdges() || sewing.NbMultipleEdges()) return null;
    const shell = keep(sewing.SewedShape());
    if (shell.ShapeType() !== oc.TopAbs_ShapeEnum.TopAbs_SHELL) return null;
    const maker = keep(new oc.BRepBuilderAPI_MakeSolid_3(keep(oc.TopoDS.Shell_1(shell))));
    const result = keep(maker.Shape());
    const setter = keep(new oc.ShapeFix_ShapeTolerance()), builder = keep(new oc.BRep_Builder()), fixer = keep(new oc.ShapeFix_Edge());
    // The surfaces have actually been replaced. Recompute geometric errors
    // against them; keeping the old patch's tolerance would conceal the repair.
    setter.SetTolerance(result, 1e-7, oc.TopAbs_ShapeEnum.TopAbs_VERTEX);
    setter.SetTolerance(result, 1e-7, oc.TopAbs_ShapeEnum.TopAbs_EDGE);
    each(result, oc.TopAbs_ShapeEnum.TopAbs_EDGE, item => {
      const edge = keep(oc.TopoDS.Edge_1(item));
      builder.SameParameter(edge, false);
      oc.BRepLib.SameParameter_1(edge, 1e-7);
      fixer.FixVertexTolerance_2(edge);
    });
    const before = volume(source), after = volume(result);
    const valid = keep(new oc.BRepCheck_Analyzer(result, true, false)).IsValid_2();
    if (!valid || !(after > 0) || maxTolerance(result) > tolerance ||
        Math.abs(after - before) > Math.max(1e-4, Math.abs(before) * 1e-4)) return null;
    accepted = result;
    return result;
  } catch {
    return null;
  } finally {
    owned.reverse().forEach(value => { if (value !== accepted) value.delete?.(); });
  }
}
