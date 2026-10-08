// Ordinary solver geometry: the construction circle drives every corner.
export function addDimensionedPolygon(sketch, {sides = 6, diameter, x = 0, y = 0, rotation = 0, fixCenter = true, fixRotation = true}, id) {
  if (!Number.isInteger(sides) || sides < 3 || sides > 24 ||
      ![diameter, x, y, rotation].every(Number.isFinite) || diameter <= 0) {
    throw new Error('Polygon needs 3–24 integer sides, a positive diameter, and finite center and rotation');
  }
  const normalizedRotation = ((rotation % 360) + 360) % 360;
  const angle = normalizedRotation * Math.PI / 180;
  const rim = Array.from({length:sides}, (_, i) => ({x:x + diameter / 2 * Math.cos(angle + i * 2 * Math.PI / sides), y:y + diameter / 2 * Math.sin(angle + i * 2 * Math.PI / sides)}));
  if (rim.some(point => !Number.isFinite(point.x) || !Number.isFinite(point.y))) {
    throw new Error('Polygon coordinates exceed the finite modeling range');
  }
  const center = {id:id(), x, y};
  const circle = {id:id(), type:'circle', name:sides + '-gon guide', c:center.id, r:diameter / 2, construction:true};
  const points = rim.map(point => ({id:id(), ...point}));
  const lines = points.map((point, i) => ({id:id(), type:'line', name:'Polygon side', a:point.id, b:points[(i + 1) % sides].id, construction:false}));
  const constraints = [
    {id:id(), type:'diameter', entity:circle.id, value:diameter, driven:false},
    ...points.map(point => ({id:id(), type:'pointOnCircle', point:point.id, entity:circle.id})),
    ...lines.slice(0, -1).map((line, i) => ({id:id(), type:'equal', a:line.id, b:lines[i + 1].id})),
    ...(fixCenter ? [{id:id(), type:'fixed', point:center.id, x, y}] : []),
    ...(fixRotation ? [{id:id(), type:'angle', entity:lines[0].id, value:(normalizedRotation + 90 + 180 / sides + 180) % 360 - 180, driven:false}] : []),
  ];
  sketch.points.push(center, ...points);
  sketch.entities.push(circle, ...lines);
  sketch.constraints.push(...constraints);
  return lines;
}
