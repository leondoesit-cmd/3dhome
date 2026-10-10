// Independent paper annotations: millimetres from the sheet's top-left corner.
// These never supply model dimensions, topology or feature inputs.
export const DRAWING_PRIMITIVE_TOOLS = Object.freeze({
  sheetline: 'line', sheetpolyline: 'polyline', sheetrect: 'rectangle', sheetcircle: 'circle', sheetarc:'arc', sheetellipse:'ellipse',
});
const TAU=Math.PI*2;
const positiveAngle=angle=>((angle%TAU)+TAU)%TAU;
export function drawingEllipsePoints({cx,cy,rx,ry,rotation}) {
  const a=rotation*Math.PI/180,c=Math.cos(a),s=Math.sin(a);
  return [{x:cx,y:cy},{x:cx+rx*c,y:cy+rx*s},{x:cx-ry*s,y:cy+ry*c}];
}
export function drawingEllipseGeometry(points,startAngle=0,endAngle=360) {
  if(points.length!==3)throw new Error('An ellipse needs center, major axis and minor radius points');
  const [p,a,b]=points,dx=a.x-p.x,dy=a.y-p.y,rx=Math.hypot(dx,dy),rotation=Math.atan2(dy,dx);
  const ry=Math.abs((b.x-p.x)*Math.sin(rotation)-(b.y-p.y)*Math.cos(rotation));
  if(!Number.isFinite(rx)||!Number.isFinite(ry)||rx<1e-8||ry<1e-8)throw new Error('An ellipse needs two positive semi-axes');
  if(ry>rx+1e-8)throw new Error('The minor semi-axis must not exceed the major semi-axis');
  if(!Number.isFinite(startAngle)||!Number.isFinite(endAngle)||Math.abs(endAngle-startAngle)<1e-8||Math.abs(endAngle-startAngle)>360+1e-8)throw new Error('Ellipse angles need a nonzero sweep of at most 360 degrees');
  return {type:'ellipse',cx:p.x,cy:p.y,rx,ry,rotation,a0:startAngle*Math.PI/180,a1:endAngle*Math.PI/180,anticlockwise:endAngle<startAngle};
}
export function drawingArcGeometry(points) {
  if(points.length!==3)throw new Error('An arc needs start, through and end points');
  const [a,b,c]=points,bx=b.x-a.x,by=b.y-a.y,cx=c.x-a.x,cy=c.y-a.y;
  const cross=bx*cy-by*cx,scale=Math.max(bx*bx+by*by,cx*cx+cy*cy);
  if(!Number.isFinite(cross)||Math.abs(cross)<=1e-10*scale || Math.hypot(cx,cy)<1e-8)throw new Error('Choose three distinct noncollinear arc points');
  const b2=bx*bx+by*by,c2=cx*cx+cy*cy;
  const ux=(b2*cy-c2*by)/(2*cross),uy=(bx*c2-cx*b2)/(2*cross);
  const center={x:a.x+ux,y:a.y+uy},r=Math.hypot(ux,uy);
  if(!Number.isFinite(r)||!Number.isFinite(center.x)||!Number.isFinite(center.y))throw new Error('Enter finite arc geometry');
  const a0=Math.atan2(a.y-center.y,a.x-center.x),end=Math.atan2(c.y-center.y,c.x-center.x),through=Math.atan2(b.y-center.y,b.x-center.x);
  const clockwise=positiveAngle(end-a0),sweep=positiveAngle(through-a0)<=clockwise ? clockwise : clockwise-TAU;
  return {type:'arc',cx:center.x,cy:center.y,r,a0,a1:a0+sweep,anticlockwise:sweep<0};
}
function onArc(item,angle) {
  return (item.anticlockwise ? positiveAngle(item.a0-angle) : positiveAngle(angle-item.a0))<=Math.abs(item.a1-item.a0)+1e-10;
}
export function validateDrawingPrimitive(value, paper) {
  if (!value || !['line','polyline','rectangle','circle','arc','ellipse'].includes(value.type)) throw new Error('Choose a drawing annotation type');
  if (!Array.isArray(value.points) || value.points.some(p=>!p || typeof p.x!=='number' || typeof p.y!=='number')) throw new Error('Enter finite paper coordinates for every point');
  const points=value.points.map(p=>({x:p.x,y:p.y}));
  if (points.length<2 || (['arc','ellipse'].includes(value.type) ? points.length!==3 : value.type!=='polyline' && points.length!==2) || points.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y))) throw new Error('Enter finite paper coordinates for every point');
  if (paper && points.some(p=>p.x<0||p.y<0||p.x>paper.w||p.y>paper.h)) throw new Error('Keep drawing annotations inside the paper');
  if (value.type==='rectangle' && (Math.abs(points[0].x-points[1].x)<1e-8||Math.abs(points[0].y-points[1].y)<1e-8)) throw new Error('A rectangle needs width and height');
  if (points.slice(1).some((p,i)=>Math.hypot(p.x-points[i].x,p.y-points[i].y)<1e-8)) throw new Error('Drawing segments need distinct points');
  if (value.type==='circle' && paper) {
    const [c,p]=points,r=Math.hypot(p.x-c.x,p.y-c.y);
    if(c.x-r<0||c.y-r<0||c.x+r>paper.w||c.y+r>paper.h)throw new Error('Keep the whole circle inside the paper');
  }
  if(value.type==='arc') {
    const arc=drawingArcGeometry(points);
    if(paper && [0,Math.PI/2,Math.PI,Math.PI*1.5].some(angle=>onArc(arc,angle) && (arc.cx+arc.r*Math.cos(angle)<-1e-8||arc.cy+arc.r*Math.sin(angle)<-1e-8||arc.cx+arc.r*Math.cos(angle)>paper.w+1e-8||arc.cy+arc.r*Math.sin(angle)>paper.h+1e-8)))throw new Error('Keep the whole arc inside the paper');
  }
  if(value.type==='ellipse') {
    const e=drawingEllipseGeometry(points,value.startAngle,value.endAngle),c=Math.cos(e.rotation),s=Math.sin(e.rotation);
    const ax=Math.atan2(-e.ry*s,e.rx*c),ay=Math.atan2(e.ry*c,e.rx*s);
    const angles=[e.a0,e.a1,...[ax,ax+Math.PI,ay,ay+Math.PI].filter(a=>onArc(e,a))];
    if(paper && angles.some(a=>{const x=e.cx+e.rx*Math.cos(a)*c-e.ry*Math.sin(a)*s,y=e.cy+e.rx*Math.cos(a)*s+e.ry*Math.sin(a)*c;return x<-1e-8||y<-1e-8||x>paper.w+1e-8||y>paper.h+1e-8;}))throw new Error('Keep the whole ellipse arc inside the paper');
  }
  return {...value,points,style:['outline','hidden','center'].includes(value.style)?value.style:'outline'};
}
export function drawingPrimitiveItems(value) {
  const p=validateDrawingPrimitive(value),common={style:p.style,primitiveId:p.id};
  if(p.type==='circle')return [{...common,type:'circle',cx:p.points[0].x,cy:p.points[0].y,r:Math.hypot(p.points[1].x-p.points[0].x,p.points[1].y-p.points[0].y)}];
  if(p.type==='arc')return [{...common,...drawingArcGeometry(p.points)}];
  if(p.type==='ellipse')return [{...common,...drawingEllipseGeometry(p.points,p.startAngle,p.endAngle)}];
  let points=p.points;
  if(p.type==='rectangle') {const [a,b]=points;points=[a,{x:b.x,y:a.y},b,{x:a.x,y:b.y},a];}
  return points.slice(1).map((b,i)=>({...common,type:'line',x1:points[i].x,y1:points[i].y,x2:b.x,y2:b.y}));
}
export function drawingPrimitiveHit(value, point, reach) {
  return drawingPrimitiveItems(value).some(item=>{
    if(item.type==='ellipse') {
      const c=Math.cos(item.rotation),s=Math.sin(item.rotation),dx=point.x-item.cx,dy=point.y-item.cy;
      const x=c*dx+s*dy,y=-s*dx+c*dy,span=Math.abs(item.a1-item.a0);
      const dist=t=>{const a=item.a0+(item.anticlockwise?-t:t);return Math.hypot(item.rx*Math.cos(a)-x,item.ry*Math.sin(a)-y);};
      let angle=0,best=Infinity;
      for(let i=0;i<=64;i++){const a=i*span/64,d=dist(a);if(d<best){best=d;angle=a;}}
      let lo=Math.max(0,angle-span/64),hi=Math.min(span,angle+span/64);
      for(let i=0;i<40;i++){const a=lo+(hi-lo)/3,b=hi-(hi-lo)/3;if(dist(a)<dist(b))hi=b;else lo=a;}
      return Math.min(dist(0),dist(span),dist((lo+hi)/2))<=reach;
    }
    if(item.type==='circle')return Math.abs(Math.hypot(point.x-item.cx,point.y-item.cy)-item.r)<=reach;
    if(item.type==='arc')return value.points.filter((p,i)=>i!==1).some(p=>Math.hypot(point.x-p.x,point.y-p.y)<=reach) || (onArc(item,Math.atan2(point.y-item.cy,point.x-item.cx)) && Math.abs(Math.hypot(point.x-item.cx,point.y-item.cy)-item.r)<=reach);
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
