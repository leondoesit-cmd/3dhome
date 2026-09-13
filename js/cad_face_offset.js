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
            const reversed=edge.Orientation_1()===oc.TopAbs_Orientation.TopAbs_REVERSED;
            let a,b,m,circle,center;
            try {
              const first=curve.FirstParameter(),last=curve.LastParameter();
              a=curve.Value(first);b=curve.Value(last);m=curve.Value((first+last)/2);
              let from=local(a),to=local(b);const mid=local(m),kind=curve.GetType();
              if(reversed) { const swap=from; from=to; to=swap; }
              if(kind===oc.GeomAbs_CurveType.GeomAbs_Line) segments.push({type:'line',from,to,reversed});
              else if(kind===oc.GeomAbs_CurveType.GeomAbs_Circle) {
                circle=curve.Circle();center=circle.Location();
                segments.push({type:Math.hypot(from.u-to.u,from.v-to.v)<1e-7?'circle':'arc',from,to,mid,center:local(center),radius:circle.Radius(),reversed});
              } else {
                const direction=d=>({u:d.X()*frame.xAxis.x+d.Y()*frame.xAxis.y+d.Z()*frame.xAxis.z,v:d.X()*frame.yAxis.x+d.Y()*frame.yAxis.y+d.Z()*frame.yAxis.z,w:d.X()*frame.normal.x+d.Y()*frame.normal.y+d.Z()*frame.normal.z});
                const curveData=serializeProfileCurve(oc,curve,local,direction),samples=[];
                for(let i=0;i<=64;i++){const p=curve.Value(first+(last-first)*i/64);try{samples.push(local(p));}finally{p.delete();}}
                if(reversed) samples.reverse();
                const closed=Math.hypot(from.u-to.u,from.v-to.v)<1e-7;
                const segment={type:curveData.kind==='ellipse'&&closed?'ellipse':'kernelCurve',from,to,mid,center:curveData.center,rx:curveData.major,ry:curveData.minor,rot:curveData.x?Math.atan2(curveData.x.v,curveData.x.u):0,curveData,first,last,samples,reversed};
                if(segment.type==='kernelCurve' && closed) segments.push(...splitClosedKernelCurve(segment));
                else segments.push(segment);
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

export function splitClosedKernelCurve(segment) {
  const samples = segment.samples || [];
  const n = samples.length - 1;
  const mid = Math.max(1, Math.floor(samples.length / 2));
  if (samples.length < 4 || n < 1) return [segment];
  // Samples already run from→to. After a reversed OC edge that walk is
  // last→first in the curve's own parameter, so each half's first/last must
  // follow the walk instead of the original forward range.
  const param = (index) => {
    const originIndex = segment.reversed ? n - index : index;
    return segment.first + (segment.last - segment.first) * originIndex / n;
  };
  const half = (i0, i1, slice) => {
    const a = param(i0), b = param(i1);
    return {
      ...segment,
      from: slice[0],
      to: slice[slice.length - 1],
      samples: slice,
      first: Math.min(a, b),
      last: Math.max(a, b),
    };
  };
  return [
    half(0, mid, samples.slice(0, mid + 1)),
    half(mid, n, samples.slice(mid)),
  ];
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
    if(segment.type==='ellipse'){
      entity.type='ellipse';entity.c=point(segment.center || segment.curveData?.center);
      entity.rx=Number(segment.rx || segment.curveData?.major)||0;
      entity.ry=Number(segment.ry || segment.curveData?.minor)||0;
      entity.rot=Number(segment.rot)||0;entity.fixed=true;
    }
    else if(segment.type==='line'||segment.type==='kernelCurve'){entity.type='line';entity.a=point(segment.from);entity.b=point(segment.to);if(segment.type==='kernelCurve'){entity.projectedCurve=structuredClone(segment);entity.name='Linked boundary curve';}}
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
