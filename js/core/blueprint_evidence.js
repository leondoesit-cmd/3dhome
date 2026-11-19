// Pixel evidence for source-independent wall protection.
export function blueprintEvidence(image,walls=[]){
  const {width,height}=image,size=width*height,blocked=new Uint8Array(size),queue=new Int32Array(size);
  function paintLine(mask,w,radius,value){
    const dx=w[2]-w[0],dy=w[3]-w[1],length=Math.hypot(dx,dy);if(!length)return;
    const nx=-dy/length,ny=dx/length;
    for(let s=0;s<=Math.ceil(length);s++)for(let t=-radius;t<=radius;t++){
      const x=Math.round(w[0]+dx*Math.min(s/length,1)+nx*t+1e-6),y=Math.round(w[1]+dy*Math.min(s/length,1)+ny*t+1e-6);
      if(x>=0&&y>=0&&x<width&&y<height)mask[y*width+x]=value;
    }
  }
  for(const w of walls)paintLine(blocked,w,Math.max(2,w[4]/2),1);
  let head=0,tail=0;
  const visit=i=>{if(!blocked[i]){blocked[i]=2;queue[tail++]=i;}};
  for(let x=0;x<width;x++){visit(x);visit((height-1)*width+x);}
  for(let y=0;y<height;y++){visit(y*width);visit(y*width+width-1);}
  while(head<tail){const i=queue[head++],x=i%width,y=Math.floor(i/width);
    if(x)visit(i-1);if(x+1<width)visit(i+1);if(y)visit(i-width);if(y+1<height)visit(i+width);
  }
  const outside=(x,y)=>x<0||y<0||x>=width||y>=height||blocked[Math.floor(y)*width+Math.floor(x)]===2;
  const thicknesses=walls.filter(w=>Math.hypot(w[2]-w[0],w[3]-w[1])>Math.min(width,height)*.2).map(w=>w[4]).sort((a,b)=>a-b);
  const typical=thicknesses[Math.floor(thicknesses.length/2)]||4;
  const protectedWalls=[];
  walls.forEach((w,index)=>{
    const dx=w[2]-w[0],dy=w[3]-w[1],length=Math.hypot(dx,dy);if(!length)return;
    let exposed=0;
    for(let k=1;k<20;k++){
      const x=w[0]+dx*k/20,y=w[1]+dy*k/20,offset=w[4]/2+4,nx=-dy/length*offset,ny=dx/length*offset;
      if(outside(x+nx,y+ny)!==outside(x-nx,y-ny))exposed++;
    }
    if(exposed>=4||length>=Math.min(width,height)*.3||length>=Math.min(width,height)*.2&&w[4]>=typical*.7)protectedWalls.push(index);
  });
  // Only protect a sealed footprint. A leaking outline makes exposure
  // ambiguous and must not turn every interior stroke into a protected wall.
  let enclosed=0;
  for(let i=0;i<size;i++)if(blocked[i]===0)enclosed++;
  return {protectedWalls:enclosed>size*.02?protectedWalls:[],sealed:enclosed>size*.02,regions:blocked};
}
