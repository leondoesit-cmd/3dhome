// A cylindrical face descriptor locates its centre, while a thread starts at
// its axial boundary. Keep that distinction out of the helical profile math.
export function threadPlacementFromFace(descriptor) {
  const origin={...(descriptor?.origin || {x:0,y:0,z:0})};
  const raw=descriptor?.axis || descriptor?.normal || {x:0,y:1,z:0};
  const size=Math.hypot(raw.x,raw.y,raw.z) || 1;
  const axis={x:raw.x/size,y:raw.y/size,z:raw.z/size};
  const near=Number(descriptor?.along?.min);
  if(Number.isFinite(near)) {
    // Exact kernel bounds include a sub-micron tolerance envelope.
    const start=Math.round(near*1e6)/1e6;
    for(const key of ['x','y','z'])origin[key]+=axis[key]*start;
  }
  return {origin,axis};
}
