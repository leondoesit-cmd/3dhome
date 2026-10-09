// Canvas-local space clear of visible top/bottom HUD rectangles. This changes
// only a 2D camera fit, never sketch coordinates or model geometry.
export function sketchFitViewport(canvas, topOverlays=[], bottomOverlays=[]) {
  const width=canvas.width,height=canvas.height;
  const intersects=rect=>rect && rect.right>rect.left && rect.bottom>rect.top && rect.right>canvas.left && rect.left<canvas.left+width && rect.bottom>canvas.top && rect.top<canvas.top+height;
  let top=0,bottom=height;
  for(const rect of topOverlays)if(intersects(rect))top=Math.max(top,Math.min(height,rect.bottom-canvas.top));
  for(const rect of bottomOverlays)if(intersects(rect))bottom=Math.min(bottom,Math.max(0,rect.top-canvas.top));
  top=Math.min(top,Math.max(0,height-1));bottom=Math.max(top+1,bottom);
  return {x:0,y:top,w:width,h:bottom-top};
}
