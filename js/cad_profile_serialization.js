// Preserve projected rational and offset curves without refitting samples.
export function serializeProfileCurve(oc, adaptor, local, localDirection) {
 const kind=adaptor.GetType();
 if(kind===oc.GeomAbs_CurveType.GeomAbs_OffsetCurve){
  const h=adaptor.OffsetCurve(),curve=h.get(),basis=curve.BasisCurve(),next=new oc.GeomAdaptor_Curve_2(basis),direction=curve.Direction();
  try{return {kind:'offset',distance:curve.Offset(),direction:localDirection(direction),basis:serializeProfileCurve(oc,next,local,localDirection)};}
  finally{direction.delete();next.delete();basis.delete();h.delete();}
 }
 if(kind===oc.GeomAbs_CurveType.GeomAbs_Ellipse||kind===oc.GeomAbs_CurveType.GeomAbs_Circle){
  const ellipse=kind===oc.GeomAbs_CurveType.GeomAbs_Ellipse,curve=ellipse?adaptor.Ellipse():adaptor.Circle(),position=curve.Position(),origin=position.Location(),x=position.XDirection(),n=position.Direction();
  try{return {kind:ellipse?'ellipse':'circle',center:local(origin),x:localDirection(x),normal:localDirection(n),major:ellipse?curve.MajorRadius():curve.Radius(),minor:ellipse?curve.MinorRadius():curve.Radius()};}
  finally{origin.delete();x.delete();n.delete();position.delete();curve.delete();}
 }
 if(kind===oc.GeomAbs_CurveType.GeomAbs_BSplineCurve){
  const handle=adaptor.BSpline(),spline=handle.get();
  try{
   const poles=[],weights=[],knots=[],multiplicities=[];
   for(let i=1;i<=spline.NbPoles();i++){const p=spline.Pole(i);try{poles.push(local(p));weights.push(spline.Weight(i));}finally{p.delete();}}
   for(let i=1;i<=spline.NbKnots();i++){knots.push(spline.Knot(i));multiplicities.push(spline.Multiplicity(i));}
   return {kind:'nurbs',poles,weights,knots,multiplicities,degree:spline.Degree(),periodic:spline.IsPeriodic()};
  }finally{handle.delete();}
 }
 throw new Error('This projected curve cannot yet be preserved exactly');
}

export function restoreProfileCurve(oc, data, owned, at, direction) {
 const keep=value=>(owned.push(value),value);
 let curve;
 if(data.kind==='offset'){
  const basis=restoreProfileCurve(oc,data.basis,owned,at,direction);
  curve=new oc.Geom_OffsetCurve(basis,data.distance,direction(data.direction),true);
 }else if(data.kind==='ellipse'||data.kind==='circle'){
  const axes=keep(new oc.gp_Ax2_2(at(data.center),direction(data.normal),direction(data.x)));
  if(data.kind==='ellipse')curve=new oc.Geom_Ellipse_1(keep(new oc.gp_Elips_2(axes,data.major,data.minor)));
  else curve=new oc.Geom_Circle_1(keep(new oc.gp_Circ_2(axes,data.major)));
 }else if(data.kind==='nurbs'){
  const poles=keep(new oc.TColgp_Array1OfPnt_2(1,data.poles.length)),weights=keep(new oc.TColStd_Array1OfReal_2(1,data.weights.length));
  const knots=keep(new oc.TColStd_Array1OfReal_2(1,data.knots.length)),mults=keep(new oc.TColStd_Array1OfInteger_2(1,data.multiplicities.length));
  data.poles.forEach((p,i)=>poles.SetValue(i+1,at(p)));data.weights.forEach((w,i)=>weights.SetValue(i+1,w));data.knots.forEach((k,i)=>knots.SetValue(i+1,k));data.multiplicities.forEach((m,i)=>mults.SetValue(i+1,m));
  curve=new oc.Geom_BSplineCurve_2(poles,weights,knots,mults,data.degree,!!data.periodic,true);
 }else throw new Error('Unknown projected curve');
 return keep(new oc.Handle_Geom_Curve_2(curve));
}
