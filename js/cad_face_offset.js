import {serializeProfileCurve} from './cad_profile_serialization.js';
import { extractBrepTopology } from './cad_kernel.js';
import { createTopologyRegistry, resolveTopologyReference } from './core/topology.js';
import { frameProjectPoint } from './core/frame.js';

// Extract analytic edges from a planar face offset. Curves we cannot represent
// as editable sketch entities fail explicitly rather than becoming polygons.
export function offsetFaceBoundary(brep, reference, frame, distance = 0) {
  if (!Number.isFinite(distance)) throw new Error('Offset must be a finite length');
  if (!brep.subshapes?.size) extractBrepTopology(brep);
  let entry = brep.subshapes.get(reference.persistentId);
  if (!entry) {
    const resolved = resolveTopologyReference(reference, createTopologyRegistry(brep.topology || []));
    if (!resolved.topology || ['missing','ambiguous'].includes(resolved.status)) throw new Error('The selected face could not be resolved');
    entry = brep.subshapes.get(resolved.topology.persistentId);
  }
  if (entry?.kind !== 'face' || entry.descriptor.surface !== 'plane') throw new Error('Select one planar face');
  const oc = brep.oc;
  let maker, shape;
  const loops = [];
  const local = p => {
    const q = frameProjectPoint(frame,{x:p.X(),y:p.Y(),z:p.Z()});
    if (Math.abs(q.w)>1e-5) throw new Error('The face must lie on the active sketch plane');
    return {u:q.u,v:q.v};
  };
  try {
    if (distance) {
      maker = new oc.BRepOffsetAPI_MakeOffset_2(entry.shape,oc.GeomAbs_JoinType.GeomAbs_Arc,false);
      maker.Perform(distance,0);
      if (!maker.IsDone()) throw new Error('This offset collapses or intersects the face boundary');
      shape = maker.Shape();
    } else shape = entry.shape;
    const wires = new oc.TopExp_Explorer_2(shape,oc.TopAbs_ShapeEnum.TopAbs_WIRE,oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
    try {
      while(wires.More()) {
        const wire = oc.TopoDS.Wire_1(wires.Current());
        const edges = new oc.BRepTools_WireExplorer_2(wire), segments=[];
        try {
          while(edges.More()) {
            const edge=edges.Current(), curve=new oc.BRepAdaptor_Curve_2(edge);
            let a,b,m,circle,center;
            try {
              const first=curve.FirstParameter(),last=curve.LastParameter();
              a=curve.Value(first);b=curve.Value(last);m=curve.Value((first+last)/2);
              const from=local(a),to=local(b),mid=local(m),kind=curve.GetType();
              if(kind===oc.GeomAbs_CurveType.GeomAbs_Line) segments.push({type:'line',from,to});
              else if(kind===oc.GeomAbs_CurveType.GeomAbs_Circle) {
                circle=curve.Circle();center=circle.Location();
                segments.push({type:Math.hypot(from.u-to.u,from.v-to.v)<1e-7?'circle':'arc',from,to,mid,center:local(center),radius:circle.Radius()});
              } else {
                const direction=d=>({u:d.X()*frame.xAxis.x+d.Y()*frame.xAxis.y+d.Z()*frame.xAxis.z,v:d.X()*frame.yAxis.x+d.Y()*frame.yAxis.y+d.Z()*frame.yAxis.z,w:d.X()*frame.normal.x+d.Y()*frame.normal.y+d.Z()*frame.normal.z});
                const curveData=serializeProfileCurve(oc,curve,local,direction),samples=[];
                for(let i=0;i<=64;i++){const p=curve.Value(first+(last-first)*i/64);try{samples.push(local(p));}finally{p.delete();}}
                segments.push({type:'kernelCurve',from,to,curveData,first,last,samples});
              }
            } finally { center?.delete();circle?.delete();a?.delete();b?.delete();m?.delete();curve.delete();edge.delete(); }
            edges.Next();
          }
        } finally { edges.delete();wire.delete(); }
        if(segments.length)loops.push(segments);
        wires.Next();
      }
    } finally { wires.delete(); }
    if(!loops.length)throw new Error('This offset leaves no closed boundary');
    return loops;
  } finally { if(distance)shape?.delete();maker?.delete(); }
}

export function appendBoundarySketch(sketch, loops, id) {
  const points=[],entities=[];
  const point = q => {
    let p=points.find(p=>Math.hypot(p.x-q.u,p.y-q.v)<1e-7);
    if(!p){p={id:id(),x:q.u,y:q.v,fixed:true};points.push(p);}
    return p.id;
  };
  for(const segments of loops)for(const segment of segments){
    const entity={id:id(),type:segment.type,name:'Face boundary',construction:false};
    if(segment.type==='line'||segment.type==='kernelCurve'){entity.type='line';entity.a=point(segment.from);entity.b=point(segment.to);if(segment.type==='kernelCurve'){entity.projectedCurve=structuredClone(segment);entity.name='Linked boundary curve';}}
    else if(segment.type==='circle'){entity.c=point(segment.center);entity.r=segment.radius;entity.fixed=true;}
    else if(segment.type==='arc'){
      const angle=q=>Math.atan2(q.v-segment.center.v,q.u-segment.center.u);
      const span=(angle(segment.to)-angle(segment.from)+Math.PI*2)%(Math.PI*2);
      const middle=(angle(segment.mid)-angle(segment.from)+Math.PI*2)%(Math.PI*2);
      entity.a=point(middle<span?segment.from:segment.to);
      entity.b=point(middle<span?segment.to:segment.from);
      entity.c=point(segment.center);
    } else throw new Error('Unsupported boundary curve');
    entities.push(entity);
  }
  sketch.points.push(...points);sketch.entities.push(...entities);
  return entities;
}
