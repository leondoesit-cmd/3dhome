// Exploded Views & Step Animations for Assemblies.

export function createExplodedView(assembly, name = "ExplodedView1") {
  if (!assembly.explodedViews) assembly.explodedViews = [];
  const ev = {
    id: "ev_" + Date.now().toString(36),
    name,
    steps: [],
  };
  assembly.explodedViews.push(ev);
  return ev;
}

export function addExplodeStep(explodedView, componentIds, direction = { x: 0, y: 100, z: 0 }) {
  const step = {
    id: "step_" + Date.now().toString(36),
    components: (componentIds || []).slice(),
    direction: { ...direction },
  };
  explodedView.steps.push(step);
  return step;
}

export function applyExplodedView(assembly, explodedViewId, factor = 1.0) {
  if (!assembly || !assembly.components) return;
  const ev = (assembly.explodedViews || []).find((v) => v.id === explodedViewId);
  if (!ev) return;

  const offsets = new Map();
  for (const step of ev.steps) {
    for (const cid of step.components) {
      const current = offsets.get(cid) || { x: 0, y: 0, z: 0 };
      current.x += step.direction.x * factor;
      current.y += step.direction.y * factor;
      current.z += step.direction.z * factor;
      offsets.set(cid, current);
    }
  }

  for (const comp of assembly.components) {
    const off = offsets.get(comp.id);
    if (off) {
      comp.explodedOffset = off;
    } else {
      comp.explodedOffset = null;
    }
  }
}

