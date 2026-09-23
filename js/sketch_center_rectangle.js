// A center rectangle uses ordinary solver entities, so resizing preserves
// symmetry and downstream profiles can consume its four perimeter lines.
// The center is pinned only on request: a pinned center leaves the rectangle
// fully defined, and a drag then fights the pin instead of moving the shape.
export function addCenterRectangle(sketch, { width, height, x = 0, y = 0, fixCenter = false }, id) {
  if (![width, height, x, y].every(Number.isFinite) || width <= 0 || height <= 0) {
    throw new Error("Rectangle dimensions must be positive finite lengths");
  }
  const corners = [[-1,-1],[1,-1],[1,1],[-1,1]].map(([u,v]) => ({
    id:id(), x:x + u * width / 2, y:y + v * height / 2,
  }));
  const center = {id:id(), x, y};
  const lines = corners.map((point, i) => ({
    id:id(), type:"line", name:"Line", a:point.id, b:corners[(i+1)%4].id, construction:false,
  }));
  const diagonal = {id:id(), type:"line", name:"Center rectangle diagonal", a:corners[0].id, b:corners[2].id, construction:true};
  sketch.points.push(...corners, center);
  sketch.entities.push(...lines, diagonal);
  sketch.constraints.push(
    ...lines.map((line,i) => ({id:id(), type:i%2 ? "vertical" : "horizontal", entity:line.id})),
    ...(fixCenter ? [{id:id(), type:"fixed", point:center.id, x, y}] : []),
    {id:id(), type:"midpoint", point:center.id, entity:diagonal.id},
    {id:id(), type:"distance", entity:lines[0].id, value:width, driven:false},
    {id:id(), type:"distance", entity:lines[1].id, value:height, driven:false},
  );
  return lines;
}
