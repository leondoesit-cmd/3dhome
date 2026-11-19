// Require both a curved swing and its radial leaf before bridging a long gap.
export function blueprintDoorSwing(image,a,b,jamb=0){
 const {width,height,data}=image,dx=b.x-a.x,dy=b.y-a.y,L=Math.hypot(dx,dy);if(L<18)return null;
 const ux=dx/L,uy=dy/L,tones=[];
 for(let j=0;j<20;j++){
  const x=Math.round((a.x+b.x)/2+(j%5-2)*L/4),y=Math.round((a.y+b.y)/2+(Math.floor(j/5)-1.5)*L/3);
  if(x>=0&&y>=0&&x<width&&y<height){const i=(y*width+x)*4;tones.push(Math.max(data[i],data[i+1],data[i+2]));}
 }
 tones.sort((a,b)=>a-b);const threshold=Math.min(220,(tones[Math.floor(tones.length*.8)]||245)-22);
 const tone=(x,y)=>{
  x=Math.round(x);y=Math.round(y);if(x<0||y<0||x>=width||y>=height)return 0;
  const i=(y*width+x)*4;return Math.max(data[i],data[i+1],data[i+2]);
 };
 const ink=(x,y,nx,ny)=>{
  for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){
   const xx=x+dx,yy=y+dy,value=tone(xx,yy);
   // A swing is a narrow ridge against floor on BOTH sides. Filled shadows,
   // wardrobes and nearby wall faces cannot stand in for a curved door line.
   if(value<threshold&&value+10<Math.min(tone(xx+nx*4,yy+ny*4),tone(xx-nx*4,yy-ny*4)))return true;
  }return false;
 };
 const shifts=[0],trims=[0];for(let k=2;k<=jamb;k+=2){shifts.push(-k/2,k);trims.push(k);}
 let best=null;
 for(const end of [-1,1])for(const side of [-1,1])for(const shift of shifts)for(const trim of trims){
  const tx=-end*ux,ty=-end*uy,nx=-uy*side,ny=ux*side;
  const h=end<0?a:b,x=h.x+tx*shift,y=h.y+ty*shift,radius=L-trim;if(radius<18)continue;
  let arc=0,leaf=0;
  for(let j=0;j<16;j++){
   const angle=(10+j*70/15)*Math.PI/180,t=(.15+j*.7/15)*radius;
   const rx=tx*Math.cos(angle)+nx*Math.sin(angle),ry=ty*Math.cos(angle)+ny*Math.sin(angle);
   if(ink(x+radius*rx,y+radius*ry,rx,ry))arc++;
   if(ink(x+nx*t,y+ny*t,tx,ty))leaf++;
  }
  if(arc>=12&&leaf>=12&&(!best||arc+leaf>best.score))best={end,side,score:arc+leaf};
 }
 return best;
}
