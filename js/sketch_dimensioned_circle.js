// Uses an ordinary circle and driving diameter, so later dimension edits
// update the same profile consumed by native features.
export function addDimensionedCircle(sketch, {diameter, x = 0, y = 0, fixCenter = true}, id) {
  if (![diameter, x, y].every(Number.isFinite) || diameter <= 0) {
    throw new Error('Circle diameter must be positive and its center must be finite');
  }
  const center = {id:id(), x, y};
  const circle = {id:id(), type:'circle', name:'Circle', c:center.id, r:diameter / 2, construction:false};
  sketch.points.push(center);
  sketch.entities.push(circle);
  sketch.constraints.push(
    {id:id(), type:'diameter', entity:circle.id, value:diameter, driven:false},
    ...(fixCenter ? [{id:id(), type:'fixed', point:center.id, x, y}] : []),
  );
  return [circle];
}
