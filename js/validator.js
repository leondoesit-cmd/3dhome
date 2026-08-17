import { S, fin } from "./state.js";
import { wallGeom, detectRooms } from "./geometry.js";
import { constraintIssues } from "./constraints.js";
import { layerAllowed, runCrossesOpening, routingPolicy } from "./mep.js";

function rotatedBounds(it) {
  const a = (it.rot || 0) * Math.PI / 180;
  const ex = Math.abs(Math.cos(a)) * it.w / 2 + Math.abs(Math.sin(a)) * it.d / 2;
  const ez = Math.abs(Math.sin(a)) * it.w / 2 + Math.abs(Math.cos(a)) * it.d / 2;
  return { minx: it.x - ex, maxx: it.x + ex, minz: it.z - ez, maxz: it.z + ez };
}

function overlap(a, b, margin) {
  return Math.min(a.maxx, b.maxx) - Math.max(a.minx, b.minx) > margin &&
    Math.min(a.maxz, b.maxz) - Math.max(a.minz, b.minz) > margin;
}

export function validateDesign() {
  const issues = [];
  const bounds = S.items.map(rotatedBounds);
  for (let i = 0; i < S.items.length; i++) {
    const a = S.items[i];
    if (![a.x, a.z, a.w, a.d, a.h].every(fin) || a.w <= 0 || a.d <= 0 || a.h <= 0)
      issues.push({ severity: "error", kind: "item", ref: a.id, message: "An item has invalid dimensions or position." });
    for (let j = i + 1; j < S.items.length; j++) {
      const b = S.items[j];
      if (overlap(bounds[i], bounds[j], 2))
        issues.push({ severity: "warning", kind: "items", refs: [a.id, b.id], message: "Furniture overlaps by more than 2 cm." });
    }
  }

  S.walls.forEach((wall) => {
    const g = wallGeom(wall);
    if (g.L < 20) issues.push({ severity: "error", kind: "wall", ref: wall.id, message: "Wall is shorter than 20 cm." });
    const openings = S.openings.filter((o) => o.wall === wall.id).sort((a, b) => a.s - b.s);
    openings.forEach((o, i) => {
      if (!fin(o.s) || !fin(o.width) || o.width < 30 || o.s - o.width / 2 < 0 || o.s + o.width / 2 > g.L)
        issues.push({ severity: "error", kind: "opening", ref: o.id, message: "Opening falls outside its wall or is too narrow." });
      if (i && openings[i - 1].s + openings[i - 1].width / 2 + 5 > o.s - o.width / 2)
        issues.push({ severity: "error", kind: "opening", ref: o.id, message: "Openings overlap or have less than 5 cm structure between them." });
    });
  });

  detectRooms().forEach((room) => {
    const xs = room.pts.map((p) => p.x), zs = room.pts.map((p) => p.z);
    const width = Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs));
    if (width < 90) issues.push({ severity: "warning", kind: "room", ref: room.key, message: "Room/corridor clear width is below 90 cm." });
  });

  const mep = S.mep || { nodes: [], runs: [] };
  const nodeIds = new Set(mep.nodes.map((n) => n.id));
  mep.nodes.forEach((node) => {
    if (!layerAllowed(node.sys, node.k, "node", node.layer))
      issues.push({ severity: "error", kind: "mepNode", ref: node.id, message: "MEP device is assigned to an unsuitable routing plane." });
  });
  mep.runs.forEach((run) => {
    if (!Array.isArray(run.pts) || run.pts.length < 2)
      issues.push({ severity: "error", kind: "mepRun", ref: run.id, message: "MEP run has fewer than two points." });
    if ((run.a && !nodeIds.has(run.a)) || (run.b && !nodeIds.has(run.b)))
      issues.push({ severity: "error", kind: "mepRun", ref: run.id, message: "MEP run references a missing endpoint." });
    if (!run.a || !run.b)
      issues.push({ severity: "info", kind: "mepRun", ref: run.id, message: "MEP run has an unconnected endpoint." });
    if (!layerAllowed(run.sys, run.k, "run", run.layer))
      issues.push({ severity: "error", kind: "mepRun", ref: run.id, message: "MEP run is assigned to an unsuitable routing plane." });
    if (runCrossesOpening(run))
      issues.push({ severity: "error", kind: "mepRun", ref: run.id, message: "A wall-plane MEP run crosses a door or passage." });
    const policy = routingPolicy(run.sys, run.k);
    if (policy.mode === "require" && run.layer !== policy.layer)
      issues.push({ severity: "error", kind: "mepRun", ref: run.id, message: "MEP run does not satisfy its required routing plane." });
    if ((run.k === "waste" || run.k === "condensate") && !(run.fall > 0))
      issues.push({ severity: "warning", kind: "mepRun", ref: run.id, message: "Gravity drainage run has no fall." });
  });

  return issues.concat(constraintIssues());
}

export function validationSummary(issues) {
  return (issues || []).reduce((out, issue) => {
    out[issue.severity] = (out[issue.severity] || 0) + 1;
    return out;
  }, { error: 0, warning: 0, info: 0 });
}
