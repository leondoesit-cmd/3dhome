import { S, fin } from "./state.js";
import { wallGeom } from "./geometry.js";

function uid() {
  return "c-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
function constraints() {
  if (!S.workspace.constraints) S.workspace.constraints = [];
  return S.workspace.constraints;
}

export function addConstraint(type, selection) {
  let c = null;
  if (selection && selection.kind === "wall" && (type === "wallLength" || type === "wallAngle")) {
    const g = wallGeom(selection.ref);
    c = {
      id: uid(), type, wall: selection.ref.id,
      value: type === "wallLength" ? g.L : (g.ang * 180) / Math.PI,
    };
  } else if (selection && selection.kind === "items" && selection.refs.length >= 2) {
    const refs = selection.refs.slice(0, 2);
    c = {
      id: uid(), type,
      items: refs.map((it) => it.id),
      value: type === "itemDistance"
        ? Math.hypot(refs[1].x - refs[0].x, refs[1].z - refs[0].z)
        : null,
    };
  }
  if (c) constraints().push(c);
  return c;
}

export function removeConstraint(id) {
  S.workspace.constraints = constraints().filter((c) => c.id !== id);
}

export function applyConstraints() {
  let changed = 0;
  constraints().forEach((c) => {
    if (c.wall != null) {
      const wall = S.walls.find((w) => w.id === c.wall);
      if (!wall) return;
      const a = S.nodes[wall.a], b = S.nodes[wall.b];
      if (!a || !b) return;
      const g = wallGeom(wall);
      const length = c.type === "wallLength" && fin(c.value) ? c.value : g.L;
      const angle = c.type === "wallAngle" && fin(c.value)
        ? (c.value * Math.PI) / 180
        : g.ang;
      b.x = a.x + Math.cos(angle) * length;
      b.z = a.z + Math.sin(angle) * length;
      changed++;
    } else if (c.items && c.items.length >= 2) {
      const a = S.items.find((it) => it.id === c.items[0]);
      const b = S.items.find((it) => it.id === c.items[1]);
      if (!a || !b) return;
      if (c.type === "alignX") b.x = a.x;
      else if (c.type === "alignZ") b.z = a.z;
      else if (c.type === "itemDistance" && fin(c.value)) {
        const dx = b.x - a.x, dz = b.z - a.z, length = Math.hypot(dx, dz) || 1;
        b.x = a.x + (dx / length) * c.value;
        b.z = a.z + (dz / length) * c.value;
      } else return;
      changed++;
    }
  });
  return changed;
}

export function constraintIssues() {
  const issues = [];
  constraints().forEach((c) => {
    let delta = 0, label = c.type;
    if (c.wall != null) {
      const wall = S.walls.find((w) => w.id === c.wall);
      if (!wall) return issues.push({ severity: "error", message: "Constraint references a missing wall" });
      const g = wallGeom(wall);
      delta = c.type === "wallLength"
        ? Math.abs(g.L - c.value)
        : Math.abs(((g.ang * 180) / Math.PI) - c.value);
    } else {
      const a = S.items.find((it) => it.id === c.items[0]);
      const b = S.items.find((it) => it.id === c.items[1]);
      if (!a || !b) return issues.push({ severity: "error", message: "Constraint references a missing item" });
      if (c.type === "alignX") delta = Math.abs(a.x - b.x);
      else if (c.type === "alignZ") delta = Math.abs(a.z - b.z);
      else delta = Math.abs(Math.hypot(b.x - a.x, b.z - a.z) - c.value);
    }
    if (delta > 1) issues.push({ severity: "warning", message: label + " is out by " + delta.toFixed(1) + " cm" });
  });
  return issues;
}
