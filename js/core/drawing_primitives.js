// Independent paper annotations: millimetres from the sheet's top-left corner.
// These never supply model dimensions, topology or feature inputs.
export const DRAWING_PRIMITIVE_TOOLS = Object.freeze({
  sheetline: 'line', sheetpolyline: 'polyline', sheetrect: 'rectangle', sheetcircle: 'circle',
});
export function validateDrawingPrimitive(value, paper) {
  if (!value || !['line','polyline','rectangle','circle'].includes(value.type)) throw new Error('Choose a drawing annotation type');
  if (!Array.isArray(value.points) || value.points.some(p=>!p || typeof p.x!=='number' || typeof p.y!=='number')) throw new Error('Enter finite paper coordinates for every point');
  const points=value.points.map(p=>({x:p.x,y:p.y}));
  if (points.length<2 || (value.type!=='polyline' && points.length!==2) || points.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y))) throw new Error('Enter finite paper coordinates for every point');
  if (paper && points.some(p=>p.x<0||p.y<0||p.x>paper.w||p.y>paper.h)) throw new Error('Keep drawing annotations inside the paper');
  if (value.type==='rectangle' && (Math.abs(points[0].x-points[1].x)<1e-8||Math.abs(points[0].y-points[1].y)<1e-8)) throw new Error('A rectangle needs width and height');
  if (points.slice(1).some((p,i)=>Math.hypot(p.x-points[i].x,p.y-points[i].y)<1e-8)) throw new Error('Drawing segments need distinct points');
  if (value.type==='circle' && paper) {
    const [c,p]=points,r=Math.hypot(p.x-c.x,p.y-c.y);
    if(c.x-r<0||c.y-r<0||c.x+r>paper.w||c.y+r>paper.h)throw new Error('Keep the whole circle inside the paper');
  }
  return {...value,points,style:['outline','hidden','center'].includes(value.style)?value.style:'outline'};
}
export function drawingPrimitiveItems(value) {
  const p=validateDrawingPrimitive(value),common={style:p.style,primitiveId:p.id};
  if(p.type==='circle')return [{...common,type:'circle',cx:p.points[0].x,cy:p.points[0].y,r:Math.hypot(p.points[1].x-p.points[0].x,p.points[1].y-p.points[0].y)}];
  let points=p.points;
  if(p.type==='rectangle') {const [a,b]=points;points=[a,{x:b.x,y:a.y},b,{x:a.x,y:b.y},a];}
  return points.slice(1).map((b,i)=>({...common,type:'line',x1:points[i].x,y1:points[i].y,x2:b.x,y2:b.y}));
}
export function drawingPrimitiveHit(value, point, reach) {
  return drawingPrimitiveItems(value).some(item=>{
    if(item.type==='circle')return Math.abs(Math.hypot(point.x-item.cx,point.y-item.cy)-item.r)<=reach;
    const dx=item.x2-item.x1,dy=item.y2-item.y1,q=Math.max(0,Math.min(1,((point.x-item.x1)*dx+(point.y-item.y1)*dy)/(dx*dx+dy*dy)));
    return Math.hypot(point.x-item.x1-q*dx,point.y-item.y1-q*dy)<=reach;
  });
}
export function snapDrawingPrimitivePoint(point, primitives, reach, previous, orthogonal=false, free=false) {
  let p={...point};
  if(!free){let best=reach;for(const primitive of primitives || [])for(const at of primitive.points || []){const distance=Math.hypot(p.x-at.x,p.y-at.y);if(distance<best){best=distance;p={...at};}}
    if(best===reach)p={x:Math.round(p.x),y:Math.round(p.y)};
  }
  if(previous && orthogonal){if(Math.abs(p.x-previous.x)>=Math.abs(p.y-previous.y))p.y=previous.y;else p.x=previous.x;}
  return p;
}
