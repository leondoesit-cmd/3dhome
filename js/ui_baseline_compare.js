// Read-only drawings share one frame, including curved wall centre-lines.
import { baselineScene } from './redesign.js';
import { wallCurveGeom, pointAtWall } from './wall_curves.js';
import { t } from './i18n.js';

export function baselineDrawings(baseline, state) {
  const models = [baselineScene(baseline.scene), baselineScene(state)];
  const drawings = models.map(model => model.walls.flatMap(wall => {
    const geometry = wallCurveGeom(wall, model.nodes);
    if (!geometry) return [];
    const steps = geometry.kind === 'line' ? 1 : 48;
    const points = Array.from({length: steps + 1}, (_, i) => pointAtWall(wall, geometry.length * i / steps, model.nodes));
    return [{points, thickness: Number(wall.thickness) || 10}];
  }));
  const all = drawings.flatMap(drawing => drawing.flatMap(wall => wall.points));
  const host = document.createElement('div'); host.className = 'redesign-drawings';
  if (!all.length) return host;
  const minx = Math.min(...all.map(p => p.x)), minz = Math.min(...all.map(p => p.z));
  const width = Math.max(1, Math.max(...all.map(p => p.x)) - minx);
  const height = Math.max(1, Math.max(...all.map(p => p.z)) - minz);
  const pad = Math.max(width, height) * 0.08 + Math.max(...drawings.flat().map(w => w.thickness));
  drawings.forEach((drawing, i) => {
    const figure = document.createElement('figure'), caption = document.createElement('figcaption');
    caption.textContent = t(i ? 'redesign_now' : 'redesign_before');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', [minx-pad, minz-pad, width+pad*2, height+pad*2].join(' '));
    svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', caption.textContent + ' · ' + baseline.name);
    drawing.forEach(wall => {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
      path.setAttribute('points', wall.points.map(p => p.x+','+p.z).join(' '));
      path.setAttribute('fill', 'none'); path.setAttribute('stroke', 'currentColor');
      path.setAttribute('stroke-width', String(wall.thickness));
      svg.append(path);
    });
    figure.append(caption, svg); host.append(figure);
  });
  return host;
}
