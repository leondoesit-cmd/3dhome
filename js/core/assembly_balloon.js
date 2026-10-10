import {occurrenceBOMKey} from './assembly_drawing_bom.js';
import {meshDataTriangles} from './part_tessellate.js';

export function nativeOccurrenceBalloonTarget(occurrence,parts,item,offset={x:0,y:0,z:0}) {
  const frame=occurrence?.placement;if(!frame||item===undefined)return null;
  const points=[];
  for(const part of parts||[]) {
    const mesh=part.meshData;if(!mesh?.positions?.length)continue;
    const source=meshDataTriangles(mesh);
    for(let i=0;i+8<source.length;i+=9) {
      const triangle=[0,1,2].map(j=>{const at=i+j*3;return {x:Number(source[at]),y:Number(source[at+1]),z:Number(source[at+2])};});
      if(triangle.some(p=>![p.x,p.y,p.z].every(Number.isFinite)))continue;
      const p={x:(triangle[0].x+triangle[1].x+triangle[2].x)/3,y:(triangle[0].y+triangle[1].y+triangle[2].y)/3,z:(triangle[0].z+triangle[1].z+triangle[2].z)/3};
      points.push({x:frame.origin.x+offset.x+frame.x.x*p.x+frame.y.x*p.y+frame.z.x*p.z,
        y:frame.origin.y+offset.y+frame.x.y*p.x+frame.y.y*p.y+frame.z.y*p.z,
        z:frame.origin.z+offset.z+frame.x.z*p.x+frame.y.z*p.y+frame.z.z*p.z});
    }
  }
  if(!points.length||points.some(p=>![p.x,p.y,p.z].every(Number.isFinite)))return null;
  const center={};for(const axis of ['x','y','z']){let low=Infinity,high=-Infinity;for(const p of points){low=Math.min(low,p[axis]);high=Math.max(high,p[axis]);}center[axis]=(low+high)/2;}
  // A real triangle centroid, not a fabricated envelope/silhouette intersection.
  const point=points.reduce((best,p)=>Math.hypot(p.x-center.x,p.y-center.y,p.z-center.z)<Math.hypot(best.x-center.x,best.y-center.y,best.z-center.z)?p:best,points[0]);
  return {key:occurrenceBOMKey(occurrence.path),path:occurrence.path.map(String),item,point,anchorProof:'component-mesh-triangle-centroid'};
}

export function resolveComponentBalloon(note,targets,basis) {
  if(!note?.componentBalloon)return {note,dangling:false};
  const target=(targets||[]).find(t=>t.key===occurrenceBOMKey(note.componentBalloon.path||[]));
  if(target?.item===undefined||!target?.point||![target.point.x,target.point.y,target.point.z].every(Number.isFinite)||!basis?.right||!basis?.up)return {note,dangling:true};
  const dot=v=>v.x*target.point.x+v.y*target.point.y+v.z*target.point.z;
  return {note:{...note,text:String(target.item),leader:{...note.leader,u:dot(basis.right),v:dot(basis.up)}},dangling:false};
}
