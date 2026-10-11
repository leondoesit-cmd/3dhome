// Minimum target distance containing the AABB's bounding sphere in both
// viewport axes. Perspective uses the sphere silhouette, including near depth.
export function editorBoundsFitDistance(bounds,width,height,fov=45,orthographic=false,zoom=1,padding=24) {
  if(!bounds)return 0;
  const radius=Math.hypot(bounds.x1-bounds.x0,bounds.y1-bounds.y0,bounds.z1-bounds.z0)/2;
  if(!Number.isFinite(radius)||radius<=0)return 0;
  width=Number(width);height=Number(height);
  if(!(width>0&&height>0))return 0; // hidden/unsettled canvas keeps caller fallback
  const xFraction=Math.max(.1,1-2*padding/width),yFraction=Math.max(.1,1-2*padding/height);
  const tangent=Math.tan(fov*Math.PI/360)/Math.max(1e-6,Number(zoom)||1)*Math.min(yFraction,width/height*xFraction);
  return orthographic?radius/tangent:radius*Math.sqrt(1+tangent*tangent)/tangent;
}
