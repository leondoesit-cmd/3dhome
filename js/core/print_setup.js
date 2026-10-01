export function prepareNativePrintPositions(positions, setup) {
  if(!setup)return positions;
  const width=Number(setup.bedWidthMm),depth=Number(setup.bedDepthMm),height=Number(setup.bedHeightMm);
  if([width,depth,height].some(v=>!Number.isFinite(v)||v<=0||v>100000))throw new Error('Enter positive print-bed dimensions in millimeters');
  if(!['top','front','right'].includes(setup.basePlane))throw new Error('Choose a print orientation');
  if(!positions || !positions.length || positions.length%3)throw new Error('Print preparation needs mesh vertices');
  const output=new Float64Array(positions.length),lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
  for(let i=0;i<positions.length;i+=3) {
    const x=Number(positions[i]),y=Number(positions[i+1]),z=Number(positions[i+2]);
    const point=setup.basePlane==='front' ? [x,-z,y] : setup.basePlane==='right' ? [-y,x,z] : [x,y,z];
    for(let j=0;j<3;j++){if(!Number.isFinite(point[j]))throw new Error('Print mesh contains nonfinite coordinates');output[i+j]=point[j];lo[j]=Math.min(lo[j],point[j]);hi[j]=Math.max(hi[j],point[j]);}
  }
  const extents=[(hi[0]-lo[0])*10,(hi[2]-lo[2])*10,(hi[1]-lo[1])*10];
  if(extents.some((v,i)=>v>[width,depth,height][i]+0.001))throw new Error('Part exceeds the selected print-bed size in this orientation');
  const shift=[-(lo[0]+hi[0])/2,-lo[1],-(lo[2]+hi[2])/2];
  for(let i=0;i<output.length;i++)output[i]+=shift[i%3];
  return output;
}

export function printSetupExtents(positions,basePlane) {
  const prepared=prepareNativePrintPositions(positions,{basePlane,bedWidthMm:100000,bedDepthMm:100000,bedHeightMm:100000});
  const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
  for(let i=0;i<prepared.length;i++){lo[i%3]=Math.min(lo[i%3],prepared[i]);hi[i%3]=Math.max(hi[i%3],prepared[i]);}
  return {widthMm:(hi[0]-lo[0])*10,depthMm:(hi[2]-lo[2])*10,heightMm:(hi[1]-lo[1])*10};
}
