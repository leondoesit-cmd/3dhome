import { cylinderAxis } from './cylinder_axis.js';
import { framePoint, frameFromPlane } from './frame.js';
import { holeLayoutPoints, holeWizardSolids } from '../cad_hole_wizard.js';

export function holeCutRecords(params, sketch, entityIds) {
  let centres=holeLayoutPoints(params);
  if (!params.layout || params.layout==='sketch') {
    const circles=(sketch?.entities || []).filter(e=>e.type==='circle' && !e.construction && (!entityIds?.length || entityIds.includes(e.id)));
    if (!circles.length) throw new Error('Hole placement requires a circular sketch');
    centres=circles.map(circle=>{
      const point=sketch.points.find(p=>p.id===circle.c);
      if(!point)throw new Error('Hole centre is missing');
      return {u:point.x,v:point.y};
    });
  }
  const axis=sketch?.plane==='front'?'z':sketch?.plane==='side'?'x':'y';
  return holeWizardSolids(params).solids.map(solid=>({kind:'hole',params:{...params,...solid,
    diameter:solid.diameter || solid.diameter1,centres:structuredClone(centres),axis,frame:sketch?.frameSpace==='local'?structuredClone(sketch.frame):undefined,
    support:sketch?.support,from:Number(params.offset)||0,requireIntersection:true}}));
}

export function holePreviewParts(records, bounds) {
  return records.flatMap(record=>holeToolPlacements(record.params,bounds).map(placement=>({
    kind:'cyl',...placement.origin,axis:placement.axis,h:placement.depth,
    r:Number(record.params.diameter || record.params.diameter1)/2,
    ...(record.params.kind==='cone'?{r2:Number(record.params.diameter2)/2}:{})
  })));
}

export function holeToolPlacements(params, bounds) {
  const normal=cylinderAxis(params.frame?.normal || params.axis);
  const sign=params.support&&!params.frame&&Number.isFinite(params.to)&&params.to!==params.from ? -Math.sign(params.to-(Number(params.from)||0)) : (params.direction==='reverse'?-1:1)*(params.support?-1:1);
  const axis={x:normal.x*sign,y:normal.y*sign,z:normal.z*sign};
  const from=Number(params.from)||0;
  const centres=params.centres || holeLayoutPoints(params);
  return centres.map(centre=>{
    let origin;
    if(params.frame)origin=framePoint(params.frame,centre.u,centre.v,from);
    else if(typeof params.axis==='object')origin=framePoint(frameFromPlane(params.worldOrigin || {x:0,y:0,z:0},normal),centre.u,centre.v,from);
    else if(params.axis==='x')origin={x:from,y:centre.v,z:centre.u};
    else if(params.axis==='z')origin={x:centre.u,y:centre.v,z:from};
    else origin={x:centre.u,y:from,z:centre.v};
    let depth=Number(params.depth);
    if(params.endCondition==='through-all'){
      if(!bounds)throw new Error('Through-all hole requires target body bounds');
      let far=-Infinity;
      for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z])far=Math.max(far,(x-origin.x)*axis.x+(y-origin.y)*axis.y+(z-origin.z)*axis.z);
      if(!(far>0))throw new Error('Hole direction points away from its target');
      depth=far+1e-5;
    }
    if(!Number.isFinite(depth)||depth<=0)throw new Error('Hole depth must be positive and finite');
    return {origin,axis,depth};
  });
}
