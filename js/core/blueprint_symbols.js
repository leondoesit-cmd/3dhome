export function blueprintSymbols(image,walls=[],textBoxes=[]){
 const broad=symbolsAtThreshold(image,walls,textBoxes,225).map(s=>({...s,id:'B'+s.id,parent:s.parent?'B'+s.parent:undefined}));
 const fine=[...symbolsAtThreshold(image,walls,textBoxes,205).map(s=>({...s,id:'D'+s.id,parent:s.parent?'D'+s.parent:undefined})),...symbolsAtThreshold(image,walls,textBoxes,150).map(s=>({...s,id:'K'+s.id,parent:s.parent?'K'+s.parent:undefined}))];
 const out=[...broad],remap=new Map();
 const intersection=(a,b)=>Math.max(0,Math.min(a.x+a.w/2,b.x+b.w/2)-Math.max(a.x-a.w/2,b.x-b.w/2))*Math.max(0,Math.min(a.y+a.d/2,b.y+b.d/2)-Math.max(a.y-a.d/2,b.y-b.d/2));
 for(const s of fine){
  const duplicate=out.find(q=>intersection(s,q)/(s.w*s.d+q.w*q.d-intersection(s,q))>.88);
  if(duplicate){remap.set(s.id,duplicate.id);continue;}
  const parent=out.filter(q=>q.w*q.d>s.w*s.d*1.4&&intersection(s,q)>s.w*s.d*.9).sort((a,b)=>a.w*a.d-b.w*b.d)[0];
  out.push({...s,parent:s.parent||parent?.id});
 }
 const resolve=id=>{const seen=new Set();while(remap.has(id)&&!seen.has(id)){seen.add(id);id=remap.get(id);}return id;};
 const kept=out.slice(0,96),ids=new Map(kept.map((s,i)=>[s.id,'F'+i]));
 return kept.map(s=>{const parent=ids.get(resolve(s.parent));return {...s,id:ids.get(s.id),...(parent&&parent!==ids.get(s.id)?{parent}:{parent:undefined})};});
}

// Symbol bounds come only from visible image components. The vision model may
// classify these IDs, never supply replacement furniture coordinates.
function symbolsAtThreshold({width,height,data},walls=[],textBoxes=[],threshold=225){
  // Flooded "outside" pixels are ambiguous when even one door/balcony edge
  // leaks. A hull of the connected architecture is a conservative exclusion
  // boundary: it removes detached inset maps without erasing unsealed rooms.
  const points=walls.flatMap(w=>[[w[0],w[1]],[w[2],w[3]]]).sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
  const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
  const lower=[],upper=[];
  for(const p of points){while(lower.length>1&&cross(lower.at(-2),lower.at(-1),p)<=0)lower.pop();lower.push(p);}
  for(const p of [...points].reverse()){while(upper.length>1&&cross(upper.at(-2),upper.at(-1),p)<=0)upper.pop();upper.push(p);}
  const hull=lower.slice(0,-1).concat(upper.slice(0,-1));
  const inHull=(x,y)=>hull.length<3||hull.every((a,i)=>cross(a,hull[(i+1)%hull.length],[x,y])>=-2);
  const left=new Float64Array(height).fill(Infinity),right=new Float64Array(height).fill(-Infinity);
  const top=new Float64Array(width).fill(Infinity),bottom=new Float64Array(width).fill(-Infinity);
  let verticals=0,horizontals=0;
  for(const w of walls){
    if(Math.abs(w[0]-w[2])<Math.abs(w[1]-w[3])){verticals++;for(let y=Math.max(0,Math.ceil(Math.min(w[1],w[3])-2));y<Math.min(height,Math.max(w[1],w[3])+3);y++){left[y]=Math.min(left[y],w[0]);right[y]=Math.max(right[y],w[0]);}}
    else {horizontals++;for(let x=Math.max(0,Math.ceil(Math.min(w[0],w[2])-2));x<Math.min(width,Math.max(w[0],w[2])+3);x++){top[x]=Math.min(top[x],w[1]);bottom[x]=Math.max(bottom[x],w[1]);}}
  }
  const enclosed=(x,y)=>inHull(x,y)&&(verticals<2||horizontals<2||+(left[y]<x)+ +(right[y]>x)+ +(top[x]<y)+ +(bottom[x]>y)>=3);
  const n=width*height,mask=new Uint8Array(n),queue=new Int32Array(n);
  for(let i=0;i<n;i++){
    const r=data[i*4],g=data[i*4+1],b=data[i*4+2],hi=Math.max(r,g,b),lo=Math.min(r,g,b);
    if(data[i*4+3]>127&&enclosed(i%width,Math.floor(i/width))&&(hi<threshold||threshold>150&&hi-lo>30&&hi<235))mask[i]=1;
  }
  // Thin long rules include tile grout, dimension leaders and scan marks.
  const limit=Math.max(30,Math.min(width,height)*.12),rules=new Uint8Array(n);
  for(const vertical of [false,true]){
    const across=vertical?width:height,along=vertical?height:width;
    for(let c=0;c<across;c++){
      let start=-1;
      for(let p=0;p<=along;p++){
        const at=vertical?p*width+c:c*width+p;
        if(p<along&&mask[at]){if(start<0)start=p;continue;}
        if(start>=0&&p-start>=limit)for(let k=start;k<p;k++){
          const q=vertical?k*width+c:c*width+k;
          const sides=vertical?[q-1,q+1]:[q-width,q+width];
          if(sides.every(s=>s>=0&&s<n&&!mask[s]))rules[q]=1;
        }
        start=-1;
      }
    }
  }
  for(let i=0;i<n;i++)if(rules[i])mask[i]=0;
  // Clear the wall core before closing small anti-aliasing gaps.
  for(const w of walls){
    const dx=w[2]-w[0],dy=w[3]-w[1],L=Math.hypot(dx,dy);if(!L)continue;
    for(let s=0;s<=Math.ceil(L);s++)for(let t=-w[4]/2-2;t<=w[4]/2+2;t++){
      const x=Math.round(w[0]+dx*Math.min(s/L,1)-dy/L*t),y=Math.round(w[1]+dy*Math.min(s/L,1)+dx/L*t);
      if(x>=0&&y>=0&&x<width&&y<height)mask[y*width+x]=0;
    }
  }
  const expanded=new Uint8Array(n),closed=new Uint8Array(n);
  for(let y=1;y<height-1;y++)for(let x=1;x<width-1;x++)if(mask[y*width+x])
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)expanded[(y+dy)*width+x+dx]=1;
  for(let y=1;y<height-1;y++)for(let x=1;x<width-1;x++){
    let full=true;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if(!expanded[(y+dy)*width+x+dx])full=false;
    if(full)closed[y*width+x]=1;
  }
  // White sheets and fixture interiors enclosed by an outline belong to the
  // object, rather than being independent pillows or disconnected shading.
  let head=0,tail=0;const outside=new Uint8Array(n);
  const visit=i=>{if(!closed[i]&&!outside[i]){outside[i]=1;queue[tail++]=i;}};
  for(let x=0;x<width;x++){visit(x);visit((height-1)*width+x);}
  for(let y=0;y<height;y++){visit(y*width);visit(y*width+width-1);}
  while(head<tail){const at=queue[head++],x=at%width,y=Math.floor(at/width);
    if(x)visit(at-1);if(x+1<width)visit(at+1);if(y)visit(at-width);if(y+1<height)visit(at+width);
  }
  for(let i=0;i<n;i++)if(!outside[i])closed[i]=1;
  for(const b of textBoxes)for(let y=Math.max(0,Math.floor(b.y0)-2);y<Math.min(height,Math.ceil(b.y1)+2);y++)
    for(let x=Math.max(0,Math.floor(b.x0)-2);x<Math.min(width,Math.ceil(b.x1)+2);x++)closed[y*width+x]=0;
  const symbols=[];
  for(let i=0;i<n;i++){
    if(closed[i]!==1)continue;
    head=0;tail=1;queue[0]=i;closed[i]=2;let x0=width,y0=height,x1=0,y1=0;
    while(head<tail){const at=queue[head++],x=at%width,y=Math.floor(at/width);
      x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
        const nx=x+dx,ny=y+dy,q=ny*width+nx;
        if(nx>=0&&ny>=0&&nx<width&&ny<height&&closed[q]===1){closed[q]=2;queue[tail++]=q;}
      }
    }
    const w=x1-x0+1,d=y1-y0+1;
    if(tail<35||w<9||d<9||w>width*.55||d>height*.55)continue;
    if(!enclosed(Math.floor((x0+x1)/2),Math.floor((y0+y1)/2)))continue;
    let eroded=0;for(let j=0;j<tail;j++){const at=queue[j];if(closed[at-1]&&closed[at+1]&&closed[at-width]&&closed[at+width])eroded++;}
    if(tail/(w*d)<.15&&eroded<tail*.1)continue;
    symbols.push({x:(x0+x1)/2,y:(y0+y1)/2,w,d,area:tail,pixels:Array.from(queue.subarray(0,tail))});
  }
  symbols.sort((a,b)=>b.area-a.area);
  const proposals=[];
  for(const parent of symbols.slice(0,64)){
    const key=proposals.length;proposals.push(parent);
    if(parent.w<30||parent.d<30)continue;
    const x0=Math.round(parent.x-parent.w/2+.5),y0=Math.round(parent.y-parent.d/2+.5),hist=new Map();
    const bin=at=>(data[at*4]>>4)*256+(data[at*4+1]>>4)*16+(data[at*4+2]>>4);
    const px=parent.area/(parent.w*parent.d)<.55?Array.from({length:parent.w*parent.d},(_,i)=>(y0+Math.floor(i/parent.w))*width+x0+i%parent.w):parent.pixels;
    for(const at of px){const k=bin(at);hist.set(k,(hist.get(k)||0)+1);}
    const dominant=[...hist].sort((a,b)=>b[1]-a[1])[0]?.[0];if(dominant===undefined)continue;
    const representative=[0,0,0];let count=0;
    for(const at of px)if(bin(at)===dominant){count++;for(let k=0;k<3;k++)representative[k]+=data[at*4+k];}
    for(let k=0;k<3;k++)representative[k]/=count||1;
    parent.greenSurface=representative[1]>representative[0]+10&&representative[1]>representative[2]+10;
    const chromatic=Math.abs(representative[0]-representative[1])+Math.abs(representative[1]-representative[2])>=12;
    const near=at=>{
      const k=bin(at),r=data[at*4],g=data[at*4+1],b=data[at*4+2];
      return Math.abs((k>>8)-(dominant>>8))+Math.abs((k>>4&15)-(dominant>>4&15))+Math.abs((k&15)-(dominant&15))<=1
        ||chromatic&&Math.abs(r-g-representative[0]+representative[1])+Math.abs(g-b-representative[1]+representative[2])<=10
          &&Math.max(Math.abs(r-representative[0]),Math.abs(g-representative[1]),Math.abs(b-representative[2]))<60;
    };
    if(px.filter(near).length<px.length*.25)continue;
    const local=new Uint8Array(parent.w*parent.d);let cx0=width,cy0=height,cx1=0,cy1=0;
    for(const at of px){const x=at%width,y=Math.floor(at/width);if(near(at)){cx0=Math.min(cx0,x);cy0=Math.min(cy0,y);cx1=Math.max(cx1,x);cy1=Math.max(cy1,y);}else local[(y-y0)*parent.w+x-x0]=1;}
    // Container outlines (rug borders, frame rules) must not reconnect their
    // contents after the dominant surface has been removed.
    for(let y=0;y<parent.d;y++)for(let x=0;x<parent.w;x++)if(x<3||y<3||x>=parent.w-3||y>=parent.d-3)local[y*parent.w+x]=0;
    const children=componentBounds(local,parent.w,parent.d).filter(c=>c.area>=35&&c.w>=9&&c.d>=9&&c.w*c.d<parent.w*parent.d*.8);
    if(children.length<2)continue;
    if((cx1-cx0+1)*(cy1-cy0+1)<parent.w*parent.d*.85)parent.core={x:(cx0+cx1)/2,y:(cy0+cy1)/2,w:cx1-cx0+1,d:cy1-cy0+1};
    for(const c of children.sort((a,b)=>b.area-a.area).slice(0,8))proposals.push({...c,x:c.x+x0,y:c.y+y0,parentKey:key});
  }
  return proposals.slice(0,96).map((s,i)=>{const {pixels,parentKey,...out}=s;return {...out,id:'F'+i,...(parentKey!==undefined?{parent:'F'+parentKey}:{})};});
}

function componentBounds(mask,width,height){
 const out=[],queue=new Int32Array(mask.length);
 for(let i=0;i<mask.length;i++){
  if(mask[i]!==1)continue;let head=0,tail=1,x0=width,y0=height,x1=0,y1=0;queue[0]=i;mask[i]=2;
  while(head<tail){const at=queue[head++],x=at%width,y=Math.floor(at/width);x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);
   for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const nx=x+dx,ny=y+dy,q=ny*width+nx;if(nx>=0&&ny>=0&&nx<width&&ny<height&&mask[q]===1){mask[q]=2;queue[tail++]=q;}}
  }
  out.push({x:(x0+x1)/2,y:(y0+y1)/2,w:x1-x0+1,d:y1-y0+1,area:tail});
 }
 return out;
}
