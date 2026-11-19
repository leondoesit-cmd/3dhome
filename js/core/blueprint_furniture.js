// Refine vision proposals against connected visible symbols. No catalogue
// furnishing rules or image-specific layouts: geometry must exist in pixels.
export function refineBlueprintFurniture(result,image){
  // This refiner repairs free-coordinate vision guesses. Pixel-component
  // proposals are already measured; expanding them can absorb a neighbouring
  // wardrobe, rug or desk and undo the symbol separation.
  const measured=result.recognition?.symbolGeometry==='measured';
  const graph=result.reconstruction,cal=result.referenceCalibration;
  if(!graph?.items?.length||!cal?.cmPerPx)return result;
  const {width,height,data}=image,scale=cal.cmPerPx;
  const mask=new Uint8Array(width*height),queue=new Int32Array(width*height);
  for(let i=0;i<mask.length;i++){
    const r=data[i*4],g=data[i*4+1],b=data[i*4+2],hi=Math.max(r,g,b),lo=Math.min(r,g,b);
    if(hi<150||(hi-lo>35&&hi<225))mask[i]=1;
  }
  const pixel=p=>({x:(p.x-cal.originX)/scale,y:(p.z-cal.originZ)/scale});
  for(const wall of graph.walls){
    const a=pixel(graph.nodes[wall.a]),b=pixel(graph.nodes[wall.b]),length=Math.hypot(b.x-a.x,b.y-a.y);
    const nx=-(b.y-a.y)/(length||1),ny=(b.x-a.x)/(length||1),radius=wall.thickness/scale/2+3;
    for(let s=0;s<=length;s++)for(let t=-radius;t<=radius;t++){
      const x=Math.round(a.x+(b.x-a.x)*s/length+nx*t),y=Math.round(a.y+(b.y-a.y)*s/length+ny*t);
      if(x>=0&&y>=0&&x<width&&y<height)mask[y*width+x]=0;
    }
  }
  const components=[];
  for(let i=0;i<mask.length;i++){
    if(mask[i]!==1)continue;
    let head=0,tail=1,x0=width,y0=height,x1=0,y1=0;queue[0]=i;mask[i]=2;
    while(head<tail){
      const at=queue[head++],x=at%width,y=Math.floor(at/width);
      x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);
      for(const next of [x?at-1:-1,x<width-1?at+1:-1,y?at-width:-1,y<height-1?at+width:-1])
        if(next>=0&&mask[next]===1){mask[next]=2;queue[tail++]=next;}
    }
    const w=x1-x0+1,d=y1-y0+1;
    if(tail<70||w<15||d<15||w>width*.6||d>height*.6)continue;
    let ring=0;
    for(let j=0;j<tail;j++){
      const at=queue[j],x=at%width,y=Math.floor(at/width);
      const radius=Math.hypot((x-(x0+x1)/2)/(w/2),(y-(y0+y1)/2)/(d/2));
      if(radius>=.84&&radius<=1.1)ring++;
    }
    components.push({x:(x0+x1)/2,y:(y0+y1)/2,w,d,ring:ring/tail,used:false});
  }
  const matches=[];
  for(const it of graph.items){
    if(['plant','rug','upper'].includes(it.type))continue;
    const at=pixel(it),quarter=Math.round(it.rot/90)%2,ew=(quarter?it.d:it.w)/scale,ed=(quarter?it.w:it.d)/scale;
    let best=null;
    for(const c of components){
      const maxRatio=measured?1.2:it.type==='sofa'?2.5:1.8,minRatio=measured ? .8 : .45;
      if(c.used||c.w/ew<minRatio||c.w/ew>maxRatio||c.d/ed<minRatio||c.d/ed>maxRatio)continue;
      if(it.type==='sofa'&&(c.ring>.8||ew>ed*1.5&&c.w<c.d*1.5||ed>ew*1.5&&c.d<c.w*1.5))continue;
      if(it.type==='chair'&&(c.w/ew<.75||c.w/ew>1.4||c.d/ed<.75||c.d/ed>1.4))continue;
      const distance=Math.hypot(c.x-at.x,c.y-at.y)/Math.max(ew,ed);
      if(distance>(measured ? .15 : it.type==='chair'?2:1))continue;
      const score=distance+.3*Math.abs(Math.log(c.w/ew))+.3*Math.abs(Math.log(c.d/ed));
      if(!best||score<best.score)best={c,score};
    }
    if(!best||best.score>(it.type==='chair'?2.2:1.2))continue;
    const c=best.c;c.used=true;
    if(!measured)Object.assign(it,{x:c.x*scale+cal.originX,z:c.y*scale+cal.originZ,
      w:(quarter?c.d:c.w)*scale,d:(quarter?c.w:c.d)*scale});
    matches.push({it,c});
  }
  let repeated=0;
  const chairs=matches.filter(m=>m.it.type==='chair'),tables=matches.filter(m=>['table','roundTable'].includes(m.it.type));
  for(const c of components){
    if(c.used||!tables.length)continue;
    const prototype=chairs.find(m=>Math.abs(c.w/m.c.w-1)<.2&&Math.abs(c.d/m.c.d-1)<.2);
    const table=tables.find(m=>Math.hypot(c.x-m.c.x,c.y-m.c.y)<Math.hypot(m.c.w,m.c.d)+Math.max(c.w,c.d));
    // A repeated set of small rectangular symbols immediately surrounding a
    // detected table also supplies its own prototype when vision missed every
    // chair. Require at least two matching contours, not empty floor space.
    const repeatedShape=table&&c.w>=20&&c.d>=20&&c.w<table.c.w*.48&&c.d<table.c.d*.65
      &&c.ring<.85&&components.filter(q=>Math.abs(q.w/c.w-1)<.15&&Math.abs(q.d/c.d-1)<.15
        &&Math.hypot(q.x-table.c.x,q.y-table.c.y)<Math.hypot(table.c.w,table.c.d)).length>=2;
    if((!prototype&&!repeatedShape)||!table)continue;
    const dx=c.x-table.c.x,dy=c.y-table.c.y;
    const rot=Math.abs(dx)/table.c.w>Math.abs(dy)/table.c.d?(dx<0?270:90):(dy<0?0:180);
    graph.items.push({id:graph.nextId++,type:'chair',x:c.x*scale+cal.originX,z:c.y*scale+cal.originZ,
      w:c.w*scale,d:c.d*scale,h:85,rot,estimated:true,source:'matched-image-symbol'});
    c.used=true;repeated++;
  }
  let round=0;
  // A square symbol in a repeated dining-chair set is stronger evidence than
  // a tiny crop's TV guess. Require three independently observed matching
  // chairs around the same table; elongated real TVs cannot satisfy this.
  for(const m of matches.filter(m=>m.it.type==='tv')){
    if(Math.max(m.c.w,m.c.d)/Math.min(m.c.w,m.c.d)>1.7)continue;
    const table=tables.find(t=>Math.hypot(m.c.x-t.c.x,m.c.y-t.c.y)<Math.hypot(t.c.w,t.c.d)+Math.max(m.c.w,m.c.d));
    if(!table)continue;
    const peers=graph.items.filter(it=>it.type==='chair').filter(it=>{
      const at=pixel(it),q=Math.round(it.rot/90)%2,w=(q?it.d:it.w)/scale,d=(q?it.w:it.d)/scale;
      return Math.abs(w/m.c.w-1)<.2&&Math.abs(d/m.c.d-1)<.2&&Math.hypot(at.x-table.c.x,at.y-table.c.y)<Math.hypot(table.c.w,table.c.d)+Math.max(w,d);
    });
    if(peers.length>=3){m.it.type='chair';m.it.h=85;m.it.source='matched-image-symbol';}
  }
  // Once an actual repeated chair set is visible, unmatched chair proposals
  // are duplicates/unsupported guesses rather than additional seats.
  const observedChairIds=new Set(matches.filter(m=>m.it.type==='chair').map(m=>m.it.id));
  for(const it of graph.items)if(it.type==='chair'&&it.source==='matched-image-symbol')observedChairIds.add(it.id);
  let unsupported=0;
  if(observedChairIds.size>=2)graph.items=graph.items.filter(it=>{
    const at=pixel(it),nearTable=tables.some(m=>Math.hypot(at.x-m.c.x,at.y-m.c.y)<Math.hypot(m.c.w,m.c.d)+Math.max(it.w,it.d)/scale);
    const keep=it.type!=='chair'||observedChairIds.has(it.id)||!nearTable;if(!keep)unsupported++;return keep;
  });
  for(const it of graph.items.filter(it=>it.type==='chair'&&observedChairIds.has(it.id))){
    const c=pixel(it),table=tables.find(m=>Math.hypot(c.x-m.c.x,c.y-m.c.y)<Math.hypot(m.c.w,m.c.d)+Math.max(it.w,it.d)/scale);
    if(!table)continue;
    const dx=c.x-table.c.x,dy=c.y-table.c.y;
    it.rot=Math.abs(dx)/table.c.w>Math.abs(dy)/table.c.d?(dx<0?270:90):(dy<0?0:180);
  }
  for(const sofa of matches.filter(m=>m.it.type==='sofa')){
    const angle=sofa.it.rot*Math.PI/180,fx=-Math.sin(angle),fy=Math.cos(angle);
    const c=components.filter(c=>!c.used&&c.ring>.9&&Math.abs(c.w/c.d-1)<.1&&c.w>=25&&c.w<sofa.c.w*.65)
      .filter(c=>{const dx=c.x-sofa.c.x,dy=c.y-sofa.c.y;return dx*fx+dy*fy>sofa.c.d*.5&&Math.hypot(dx,dy)<sofa.c.w*1.2;})
      .sort((a,b)=>Math.hypot(a.x-sofa.c.x,a.y-sofa.c.y)-Math.hypot(b.x-sofa.c.x,b.y-sofa.c.y))[0];
    if(!c)continue;
    graph.items.push({id:graph.nextId++,type:'roundTable',x:c.x*scale+cal.originX,z:c.y*scale+cal.originZ,w:c.w*scale,d:c.d*scale,h:42,rot:0,estimated:true,source:'matched-image-symbol'});
    c.used=true;round++;
  }
  if(repeated+round)result.warnings.push((repeated+round)+' additional furniture symbols were matched in the image; verify their types and placement.');
  if(unsupported)result.warnings.push(unsupported+' chair guesses without matching visible symbols were discarded.');
  result.recognition.furnitureRefined=matches.length;
  result.recognition.additionalSymbols=repeated+round;
  return result;
}
