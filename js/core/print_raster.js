// Conservative, bounded raster booleans/offsets for concave print regions and
// holes. All coordinates are mm. Quantization is explicit in every slice.
export function printGrid(bounds,step,padding=0,maxCells=300000) {
  if(!Number.isFinite(step)||step<.02||step>1)throw new Error('Slice grid must be 0.02–1 mm');
  const x0=Math.floor((bounds.min[0]-padding)/step)*step,y0=Math.floor((bounds.min[1]-padding)/step)*step;
  const nx=Math.ceil((bounds.max[0]+padding-x0)/step)+2,ny=Math.ceil((bounds.max[1]+padding-y0)/step)+2;
  if(nx*ny>maxCells)throw new Error('Slice grid exceeds cell budget; increase grid resolution spacing');
  return {x0,y0,nx,ny,step,size:nx*ny};
}
export function rasterContours(contours,g) {
  const mask=new Uint8Array(g.size);
  for(let y=0;y<g.ny;y++) {
    const py=g.y0+(y+.5)*g.step,hits=[];
    for(const c of contours)for(let i=0;i<c.points.length;i++) {
      const a=c.points[i],b=c.points[(i+1)%c.points.length];
      if((a[1]>py)!==(b[1]>py))hits.push(a[0]+(py-a[1])*(b[0]-a[0])/(b[1]-a[1]));
    }
    hits.sort((a,b)=>a-b);
    if(hits.length%2)throw new Error('Ambiguous slice contour scanline');
    for(let i=0;i<hits.length;i+=2) {
      const start=Math.max(0,Math.ceil((hits[i]-g.x0)/g.step-.5)),end=Math.min(g.nx,Math.ceil((hits[i+1]-g.x0)/g.step-.5));
      mask.fill(1,y*g.nx+start,y*g.nx+end);
    }
  }
  return mask;
}
export function maskDistance(mask,g) {
  const d=Float32Array.from(mask,v=>v?1e6:0),w=g.nx,h=g.ny;
  const relax=(i,j,c)=>{if(j>=0&&j<d.length)d[i]=Math.min(d[i],d[j]+c);};
  for(let y=0;y<h;y++)for(let x=0;x<w;x++) {
    const i=y*w+x;if(x)relax(i,i-1,1);if(y)relax(i,i-w,1);
    if(x&&y)relax(i,i-w-1,Math.SQRT2);if(x<w-1&&y)relax(i,i-w+1,Math.SQRT2);
  }
  for(let y=h-1;y>=0;y--)for(let x=w-1;x>=0;x--) {
    const i=y*w+x;if(x<w-1)relax(i,i+1,1);if(y<h-1)relax(i,i+w,1);
    if(x<w-1&&y<h-1)relax(i,i+w+1,Math.SQRT2);if(x&&y<h-1)relax(i,i+w-1,Math.SQRT2);
  }
  return d;
}
export function erodeMask(mask,g,mm,distance=maskDistance(mask,g)) {
  // Chamfer paths overestimate Euclidean distance by <=8.3%; divide before
  // adding two cells of clearance for centre sampling and edge contouring.
  return Uint8Array.from(mask,(v,i)=>v&&distance[i]/1.083*g.step>=mm+2*g.step?1:0);
}
export function dilateMask(mask,g,mm) {
  const complement=Uint8Array.from(mask,v=>v?0:1),d=maskDistance(complement,g);
  return Uint8Array.from(mask,(v,i)=>v||d[i]*g.step<=mm+g.step?1:0);
}
export function maskLoops(mask,g) {
  const edges=[],at=new Map(),w=g.nx;
  const add=(a,b)=>{const id=edges.length;edges.push({a,b});const key=a.join(',');if(!at.has(key))at.set(key,[]);at.get(key).push(id);};
  for(let y=0;y<g.ny;y++)for(let x=0;x<w;x++)if(mask[y*w+x]) {
    if(!y||!mask[(y-1)*w+x])add([x,y],[x+1,y]);
    if(x===w-1||!mask[y*w+x+1])add([x+1,y],[x+1,y+1]);
    if(y===g.ny-1||!mask[(y+1)*w+x])add([x+1,y+1],[x,y+1]);
    if(!x||!mask[y*w+x-1])add([x,y+1],[x,y]);
  }
  const used=new Set(),loops=[];
  for(let first=0;first<edges.length;first++) {
    if(used.has(first))continue;
    const points=[];let id=first;
    do {
      if(used.has(id))throw new Error('Raster boundary did not form a simple loop');
      used.add(id);const e=edges[id];points.push(e.a);
      if(e.b[0]===edges[first].a[0]&&e.b[1]===edges[first].a[1])break;
      const next=(at.get(e.b.join(','))||[]).filter(n=>!used.has(n));
      if(!next.length)throw new Error('Open raster perimeter');
      const dx=e.b[0]-e.a[0],dy=e.b[1]-e.a[1];
      next.sort((a,b)=>{
        const turn=n=>{const q=edges[n],qx=q.b[0]-q.a[0],qy=q.b[1]-q.a[1];return Math.atan2(dx*qy-dy*qx,dx*qx+dy*qy);};
        return turn(b)-turn(a);
      });id=next[0];
    }while(id!==first);
    const simplified=points.filter((p,i)=>{
      const a=points[(i+points.length-1)%points.length],b=points[(i+1)%points.length];
      return (p[0]-a[0])*(b[1]-p[1])!==(p[1]-a[1])*(b[0]-p[0]);
    });
    if(simplified.length>=3)loops.push(simplified.map(p=>[g.x0+p[0]*g.step,g.y0+p[1]*g.step]));
  }
  return loops;
}
export function rasterLines(mask,g,spacing,vertical=false) {
  const stride=Math.max(1,Math.round(spacing/g.step)),lines=[];
  const rows=vertical?g.nx:g.ny,columns=vertical?g.ny:g.nx;
  const index=(r,c)=>vertical?c*g.nx+r:r*g.nx+c;
  const point=(r,c)=>vertical?[g.x0+(r+.5)*g.step,g.y0+(c+.5)*g.step]:[g.x0+(c+.5)*g.step,g.y0+(r+.5)*g.step];
  for(let r=0;r<rows;r+=stride)for(let c=0;c<columns;c++)if(mask[index(r,c)]) {
    const start=c;while(c+1<columns&&mask[index(r,c+1)])c++;
    if(c>start)lines.push([point(r,start),point(r,c)]);
  }
  return lines;
}

// Capture the actual deposited capsule envelope, including the conservative
// inset of model walls. A brim based on nominal CAD contours can otherwise
// miss the printed bead by the raster safety margin.
export function depositionFootprint(paths,g) {
  const mask=new Uint8Array(g.size);
  for(const path of paths) {
    const radius=path.widthMm/2;
    if(!Number.isFinite(radius)||radius<=0)throw new Error('Positive deposition width required');
    for(let i=1;i<path.points.length;i++) {
      const a=path.points[i-1],b=path.points[i];
      if([a[0],a[1],b[0],b[1]].some(v=>!Number.isFinite(v)))throw new Error('Finite deposition coordinates required');
      const dx=b[0]-a[0],dy=b[1]-a[1],squared=dx*dx+dy*dy;
      const x0=Math.max(0,Math.floor((Math.min(a[0],b[0])-radius-g.x0)/g.step)),x1=Math.min(g.nx-1,Math.ceil((Math.max(a[0],b[0])+radius-g.x0)/g.step)),y0=Math.max(0,Math.floor((Math.min(a[1],b[1])-radius-g.y0)/g.step)),y1=Math.min(g.ny-1,Math.ceil((Math.max(a[1],b[1])+radius-g.y0)/g.step));
      for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++) {
        const px=g.x0+(x+.5)*g.step,py=g.y0+(y+.5)*g.step,t=squared?Math.max(0,Math.min(1,((px-a[0])*dx+(py-a[1])*dy)/squared)):0;
        if(Math.hypot(px-a[0]-t*dx,py-a[1]-t*dy)<=radius+1e-9)mask[y*g.nx+x]=1;
      }
    }
  }
  return mask;
}

export function brimPathsFromDeposition(paths,g,widthMm) {
  if(!Number.isFinite(widthMm)||widthMm<0||widthMm>10)throw new Error('Invalid brim width');
  const footprint=depositionFootprint(paths,g),loops=[];
  // The book's brim surrounds the base. Fill enclosed deposition gaps only
  // in this adhesion mask, keeping inner holes and infill gaps free of brim.
  const outside=new Uint8Array(g.size),queue=new Int32Array(g.size);let head=0,tail=0;
  const visit=index=>{if(!footprint[index]&&!outside[index]){outside[index]=1;queue[tail++]=index;}};
  for(let x=0;x<g.nx;x++){visit(x);visit((g.ny-1)*g.nx+x);}
  for(let y=0;y<g.ny;y++){visit(y*g.nx);visit(y*g.nx+g.nx-1);}
  while(head<tail){const index=queue[head++],x=index%g.nx,y=Math.floor(index/g.nx);if(x)visit(index-1);if(x+1<g.nx)visit(index+1);if(y)visit(index-g.nx);if(y+1<g.ny)visit(index+g.nx);}
  for(let index=0;index<g.size;index++)if(!outside[index])footprint[index]=1;
  // One-cell spacing keeps the first dilation (which includes a cell margin)
  // connected to ring zero; ordinary line-width spacing can leave an air gap.
  for(let ring=0;ring*g.step<=widthMm+1e-9;ring++)loops.push(...maskLoops(ring?dilateMask(footprint,g,ring*g.step):footprint,g));
  return loops;
}

// Independent exact contour check: a sub-grid slot/hole must never become a
// deposition bridge merely because centre sampling missed that void.
export function depositionClearsContours(points,contours,radius) {
  const edges=contours.flatMap(c=>c.points.map((a,i)=>[a,c.points[(i+1)%c.points.length]]));
  const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
  const distance=(p,a,b)=>{const dx=b[0]-a[0],dy=b[1]-a[1],den=dx*dx+dy*dy,t=den?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/den)):0;return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);};
  for(let i=1;i<points.length;i++) {
    const a=points[i-1],b=points[i];
    for(const [c,d] of edges) {
      if(Math.max(c[0],d[0])+radius<Math.min(a[0],b[0])||Math.min(c[0],d[0])-radius>Math.max(a[0],b[0])||Math.max(c[1],d[1])+radius<Math.min(a[1],b[1])||Math.min(c[1],d[1])-radius>Math.max(a[1],b[1]))continue;
      const intersects=cross(a,b,c)*cross(a,b,d)<=0&&cross(c,d,a)*cross(c,d,b)<=0;
      if(intersects||Math.min(distance(a,c,d),distance(b,c,d),distance(c,a,b),distance(d,a,b))<radius-1e-8)return false;
    }
  }
  return true;
}

function insidePrintMaterial(point,objects) {
  return objects.some(object=>{
    let crossings=0;
    for(const contour of object.contours)for(let i=0,j=contour.points.length-1;i<contour.points.length;j=i++) {
      const a=contour.points[i],b=contour.points[j];
      if((a[1]>point[1])!==(b[1]>point[1])&&point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0])crossings++;
    }
    return crossings%2===1;
  });
}

export function supportClearsContours(points,objects,radius) {
  if(!Number.isFinite(radius)||radius<=0||points.some(point=>point.length!==2||point.some(v=>!Number.isFinite(v))))return false;
  if(!depositionClearsContours(points,objects.flatMap(object=>object.contours),radius))return false;
  for(let i=1;i<points.length;i++)if(insidePrintMaterial(points[i-1].map((v,k)=>(v+points[i][k])/2),objects))return false;
  return true;
}

// Sub-grid material may be absent from the raster mask. Subtract the exact
// contour edge capsules and material interiors from each proposed support
// segment, retaining every remaining interval instead of dropping a whole line.
export function clipSupportPaths(points,objects,radius) {
  if(!Number.isFinite(radius)||radius<=0||points.some(point=>point.length!==2||point.slice(0,2).some(v=>!Number.isFinite(v))))throw new Error('Finite support geometry and positive bead radius required');
  const paths=[];let inputLengthMm=0,retainedLengthMm=0;
  const edges=objects.flatMap(object=>object.contours.flatMap(contour=>contour.points.map((a,i)=>[a,contour.points[(i+1)%contour.points.length]]))),clearance=radius+1e-8;
  for(let i=1;i<points.length;i++) {
    const a=points[i-1],b=points[i],delta=[b[0]-a[0],b[1]-a[1]],length=Math.hypot(...delta),squared=length*length;
    if(!length)continue;inputLengthMm+=length;
    const blocked=[];
    const add=(lo,hi)=>{lo=Math.max(0,lo);hi=Math.min(1,hi);if(hi>lo)blocked.push([lo,hi]);};
    const disk=center=>{
      const offset=[a[0]-center[0],a[1]-center[1]],linear=2*(offset[0]*delta[0]+offset[1]*delta[1]),constant=offset[0]**2+offset[1]**2-clearance**2,disc=linear*linear-4*squared*constant;
      if(disc>=0){const root=Math.sqrt(disc);add((-linear-root)/(2*squared),(-linear+root)/(2*squared));}
    };
    const range=(origin,slope,lo,hi)=>{
      if(Math.abs(slope)<1e-15)return origin>=lo&&origin<=hi?[-Infinity,Infinity]:null;
      const ends=[(lo-origin)/slope,(hi-origin)/slope];return [Math.min(...ends),Math.max(...ends)];
    };
    for(const [c,d]of edges) {
      if(Math.max(c[0],d[0])+clearance<Math.min(a[0],b[0])||Math.min(c[0],d[0])-clearance>Math.max(a[0],b[0])||Math.max(c[1],d[1])+clearance<Math.min(a[1],b[1])||Math.min(c[1],d[1])-clearance>Math.max(a[1],b[1]))continue;
      disk(c);disk(d);
      const edge=[d[0]-c[0],d[1]-c[1]],edgeSquared=edge[0]**2+edge[1]**2;
      if(!edgeSquared)continue;
      const offset=[a[0]-c[0],a[1]-c[1]],along=range(offset[0]*edge[0]+offset[1]*edge[1],delta[0]*edge[0]+delta[1]*edge[1],0,edgeSquared),across=range(offset[0]*edge[1]-offset[1]*edge[0],delta[0]*edge[1]-delta[1]*edge[0],-clearance*Math.sqrt(edgeSquared),clearance*Math.sqrt(edgeSquared));
      if(along&&across)add(Math.max(along[0],across[0]),Math.min(along[1],across[1]));
    }
    blocked.sort((x,y)=>x[0]-y[0]);const union=[];
    for(const interval of blocked){const last=union.at(-1);if(last&&interval[0]<=last[1])last[1]=Math.max(last[1],interval[1]);else union.push(interval.slice());}
    const emit=(lo,hi)=>{
      if((hi-lo)*length<=1e-8)return;
      const midpoint=a.map((v,k)=>v+delta[k]*(lo+hi)/2);
      if(insidePrintMaterial(midpoint,objects))return;
      const path=[lo===0?a.slice():a.map((v,k)=>v+delta[k]*lo),hi===1?b.slice():a.map((v,k)=>v+delta[k]*hi)];
      if(!supportClearsContours(path,objects,radius))throw new Error('Support bead cannot clear exact material contours');
      paths.push(path);retainedLengthMm+=(hi-lo)*length;
    };
    let start=0;for(const [lo,hi]of union){emit(start,lo);start=hi;}emit(start,1);
  }
  return {paths,inputLengthMm,removedLengthMm:Math.max(0,inputLengthMm-retainedLengthMm)};
}
