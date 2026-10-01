import { circularSweepTableTarget } from "./cad_configurations.js";
import { sketchWorldPoint } from "./core/swept_sources.js";

/* A sheet can show several configurations of one part at once. The live
   viewport only has the active configuration's mesh, so generate this simple
   design-table sweep for each view from its two authored dimensions. This is
   a torus only for a circle path with a circular sweep profile; other parts
   retain their exact active bodies until their own configuration renderer is
   available. All distances here are internal centimetres. */
export function configuredBodiesForView(document, view, activeBodies) {
  const cfg = (document?.configurations || []).find(item => item.id === view?.configurationId);
  const values = cfg?.designTableValues;
  if (document?.designTable?.kind !== "circular-sweep" || !values) return activeBodies;
  const target = circularSweepTableTarget(document);
  if (!target || target.sketch.id !== document.designTable.pathSketchId || target.sweep.id !== document.designTable.sweepFeatureId) return activeBodies;
  const centerPoint = target.sketch.points.find(point => point.id === target.circle.c);
  if (!centerPoint) return activeBodies;
  const pathRadius = Number(values.pathDiameterMm) / 20;
  const tubeRadius = Number(values.profileDiameterMm) / 20;
  if (!(pathRadius > tubeRadius && tubeRadius > 0)) return activeBodies;
  const center = sketchWorldPoint(target.sketch, centerPoint.x, centerPoint.y);
  const uPoint = sketchWorldPoint(target.sketch, centerPoint.x + 1, centerPoint.y);
  const vPoint = sketchWorldPoint(target.sketch, centerPoint.x, centerPoint.y + 1);
  const u = { x: uPoint.x - center.x, y: uPoint.y - center.y, z: uPoint.z - center.z };
  const v = { x: vPoint.x - center.x, y: vPoint.y - center.y, z: vPoint.z - center.z };
  const normal = { x: u.y * v.z - u.z * v.y, y: u.z * v.x - u.x * v.z, z: u.x * v.y - u.y * v.x };
  const point = (a, b) => {
    const along = pathRadius + tubeRadius * Math.cos(b);
    return {
      x: center.x + along * (u.x * Math.cos(a) + v.x * Math.sin(a)) + normal.x * tubeRadius * Math.sin(b),
      y: center.y + along * (u.y * Math.cos(a) + v.y * Math.sin(a)) + normal.y * tubeRadius * Math.sin(b),
      z: center.z + along * (u.z * Math.cos(a) + v.z * Math.sin(a)) + normal.z * tubeRadius * Math.sin(b),
    };
  };
  const positions = [];
  const push = (a, b, c) => positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  const around = 64, section = 20;
  for (let i = 0; i < around; i++) for (let j = 0; j < section; j++) {
    const a = point(2 * Math.PI * i / around, 2 * Math.PI * j / section);
    const b = point(2 * Math.PI * (i + 1) / around, 2 * Math.PI * j / section);
    const c = point(2 * Math.PI * (i + 1) / around, 2 * Math.PI * (j + 1) / section);
    const d = point(2 * Math.PI * i / around, 2 * Math.PI * (j + 1) / section);
    push(a, b, c); push(a, c, d);
  }
  return [{ id: target.sweep.id + ":" + cfg.id, name: cfg.name, positions }];
}
