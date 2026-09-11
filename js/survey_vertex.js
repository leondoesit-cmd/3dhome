import { normalizeSurveyFeatures, validPoint } from './survey.js';

// Detached edits keep raw observations intact and avoid history entries for
// cancelled gestures. A face vertex remains in the face's measured plane.
export function surveyVertexPlane(feature, index) {
  const origin=feature?.points?.[index];
  if(!validPoint(origin))return null;
  let normal={x:0,y:1,z:0};
  if(feature.kind==='face'){
    const a=feature.points[0];
    for(let i=1;i<feature.points.length-1;i++){
      const b=feature.points[i],c=feature.points[i+1];
      const u={x:b.x-a.x,y:b.y-a.y,z:b.z-a.z},v={x:c.x-a.x,y:c.y-a.y,z:c.z-a.z};
      const n={x:u.y*v.z-u.z*v.y,y:u.z*v.x-u.x*v.z,z:u.x*v.y-u.y*v.x},length=Math.hypot(n.x,n.y,n.z);
      if(length>.001){normal={x:n.x/length,y:n.y/length,z:n.z/length};break;}
    }
  }
  return {origin:{...origin},normal};
}
export function previewSurveyVertex(state,id,index,point){
  const feature=state.surveyFeatures?.find(f=>f.id===id);
  const layer=state.layers?.structure;
  if(state.workspace?.role==='viewer'||state.structLocked||layer?.locked||layer?.pickOverride===false||(layer&&layer.vis!=='show'&&layer.pickOverride!==true)||feature?.locked||!validPoint(point)||!feature?.points[index])return null;
  const candidate={...feature,points:feature.points.map((p,i)=>({... (i===index?point:p)}))};
  return normalizeSurveyFeatures([candidate])[0]||null;
}
export function snapSurveyVertex(point,plane,grid){
  if(!(grid>0))return point;
  const q=Object.fromEntries(['x','y','z'].map(k=>[k,Math.round(point[k]/grid)*grid]));
  const distance=['x','y','z'].reduce((sum,k)=>sum+(q[k]-plane.origin[k])*plane.normal[k],0);
  return Object.fromEntries(['x','y','z'].map(k=>[k,q[k]-distance*plane.normal[k]]));
}
