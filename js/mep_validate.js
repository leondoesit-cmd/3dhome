// Pure validation for persisted/generated MEP data. Geometry-specific clash
// checks stay in mep.js; this module checks the explicit topology contract.
export function validateMEPModel(model, items, profile) {
  model = model || {};
  items = Array.isArray(items) ? items : [];
  profile = profile || {};
  var nodes = Array.isArray(model.nodes) ? model.nodes : [];
  var runs = Array.isArray(model.runs) ? model.runs : [];
  var circuits = Array.isArray(model.circuits) ? model.circuits : [];
  var branches = Array.isArray(model.branches) ? model.branches : [];
  var circuitById = new Map(circuits.map(function(c) { return [String(c.id), c]; }));
  var nodeById = new Map(nodes.map(function(n) { return [String(n.id), n]; }));
  var nodeIds = new Set(nodeById.keys());
  var issues = [];
  circuits.forEach(function(c) {
    var panel = nodeById.get(String(c.panelId));
    if (!panel) issues.push({ code: "MISSING_PANEL", entityId: c.id });
    else if (panel.sys !== "power" || panel.k !== "panel")
      issues.push({ code: "INVALID_PANEL", entityId: c.id, targetId: c.panelId });
    (c.deviceIds || []).forEach(function(id) {
      var device = nodeById.get(String(id));
      if (!device) issues.push({ code: "MISSING_CIRCUIT_DEVICE", entityId: c.id, targetId: id });
      else if (device.sys !== "power" || device.k === "panel")
        issues.push({ code: "INVALID_CIRCUIT_DEVICE", entityId: c.id, targetId: id });
    });
    var members = Array.from(new Set((c.deviceIds || []).map(String))).map(function(id) { return nodeById.get(id); }).filter(Boolean);
    var electrical = profile.electrical || {};
    if (Number.isFinite(electrical.maxSocketsPerCircuit) &&
      members.filter(function(n) { return n.sys === "power" && n.k === "outlet"; }).length > electrical.maxSocketsPerCircuit)
      issues.push({ code: "TOO_MANY_CIRCUIT_OUTLETS", entityId: c.id });
    if (Number.isFinite(electrical.maxLightsPerCircuit) &&
      members.filter(function(n) { return n.sys === "power" && n.k === "light"; }).length > electrical.maxLightsPerCircuit)
      issues.push({ code: "TOO_MANY_CIRCUIT_LIGHTS", entityId: c.id });
    if (!c.inferred) {
      var reached = new Set([String(c.panelId)]), changed = true;
      var wires = runs.filter(function(r) { return r.sys === "power" && r.circuitId === c.id && r.explicit && r.pts && r.pts.length >= 2; });
      while (changed) {
        changed = false;
        wires.forEach(function(r) {
          if (!nodeIds.has(String(r.a)) || !nodeIds.has(String(r.b))) return;
          if (reached.has(String(r.a)) && !reached.has(String(r.b))) { reached.add(String(r.b)); changed = true; }
        });
      }
      (c.deviceIds || []).forEach(function(id) {
        if (!reached.has(String(id))) issues.push({ code: "BROKEN_CIRCUIT_PATH", entityId: id, circuitId: c.id });
      });
    }
    if (!c.inferred && (!Number.isFinite(c.estimatedLoadW) || c.estimatedLoadW < 0))
      issues.push({ code: "INVALID_CIRCUIT_LOAD", entityId: c.id });
    var max = profile.electrical && profile.electrical.maxCircuitLoadW;
    if (max && Number(c.estimatedLoadW) > max) issues.push({ code: "CIRCUIT_OVERLOAD", entityId: c.id });
  });
  nodes.forEach(function(n) {
    if (n.sys !== "power" || n.k === "panel") return;
    if (n.sourceId == null) issues.push({ code: "UNSOURCED_ELECTRICAL_DEVICE", entityId: n.id });
    else {
      var source = nodeById.get(String(n.sourceId));
      if (!source || source.sys !== "power" || source.k !== "panel")
        issues.push({ code: "INVALID_ELECTRICAL_SOURCE", entityId: n.id, targetId: n.sourceId });
    }
    if (n.circuitId != null && !circuitById.has(String(n.circuitId)))
      issues.push({ code: "MISSING_DEVICE_CIRCUIT", entityId: n.id, circuitId: n.circuitId });
  });
  items.filter(function(it) {
    return ["ceilingLight", "pendant", "trackLight", "lightStrip"].indexOf(it.type) >= 0;
  }).forEach(function(it) {
    var node = nodes.find(function(n) { return String(n.itemId) === String(it.id); });
    if (!node || node.sys !== "power" || node.k !== "light" || node.circuitId == null)
      issues.push({ code: "UNBOUND_LIGHT_FIXTURE", entityId: it.id });
    else {
      var sw = node.switchId == null ? null : nodeById.get(String(node.switchId));
      if (!sw || sw.sys !== "power" || sw.k !== "switch")
        issues.push({ code: "MISSING_LIGHT_SWITCH", entityId: it.id });
      else {
        var circuit = circuitById.get(String(node.circuitId));
        if (circuit && !(circuit.deviceIds || []).some(function(id) { return String(id) === String(sw.id); }))
          issues.push({ code: "SWITCH_NOT_ON_LIGHT_CIRCUIT", entityId: it.id, circuitId: node.circuitId });
      }
    }
  });
  branches.forEach(function(b) {
    var source = nodeById.get(String(b.sourceId));
    if (!source) issues.push({ code: "MISSING_BRANCH_SOURCE", entityId: b.id, targetId: b.sourceId });
    else if (source.sys !== b.sys)
      issues.push({ code: "INVALID_BRANCH_SOURCE", entityId: b.id, targetId: b.sourceId });
    (b.deviceIds || []).forEach(function(id) {
      var device = nodeById.get(String(id));
      if (!device) issues.push({ code: "MISSING_BRANCH_DEVICE", entityId: b.id, targetId: id });
      else if (device.sys !== b.sys)
        issues.push({ code: "INVALID_BRANCH_DEVICE", entityId: b.id, targetId: id });
    });
  });
  items.filter(function(it) {
    return ["sink", "toilet", "shower", "bathtub", "dishwasher", "washer"].includes(it.type);
  }).forEach(function(it) {
    if (!nodes.some(function(n) { return n.sys === "water" && n.k === "fixture" && String(n.itemId) === String(it.id); }))
      issues.push({ code: "UNBOUND_WET_FIXTURE", entityId: it.id });
  });
  runs.forEach(function(r) {
    if (r.explicit && (r.a == null || r.b == null ||
      !nodeIds.has(String(r.a)) || !nodeIds.has(String(r.b)) ||
      nodeById.get(String(r.a)).sys !== r.sys || nodeById.get(String(r.b)).sys !== r.sys))
      issues.push({ code: "INVALID_RUN_ENDPOINT", entityId: r.id });
    if ((r.k === "waste" || r.k === "condensate") && !(Number(r.fall) > 0))
      issues.push({ code: "INVALID_GRAVITY_FALL", entityId: r.id });
    else if ((r.k === "waste" || r.k === "condensate") && Array.isArray(r.pts) && r.pts.length >= 2) {
      var slope = profile.plumbing && (r.k === "waste" ? profile.plumbing.wasteFall : profile.plumbing.condensateFall);
      if (Number.isFinite(slope) && slope > 0) {
        var length = 0;
        for (var i = 1; i < r.pts.length; i++)
          length += Math.hypot(r.pts[i].x - r.pts[i - 1].x, r.pts[i].z - r.pts[i - 1].z);
        if (Number(r.fall) + 1e-6 < length * slope)
          issues.push({ code: "INSUFFICIENT_GRAVITY_FALL", entityId: r.id });
      }
    }
  });
  return { ok: issues.length === 0, issues: issues, counts: issues.reduce(function(out, issue) {
    out[issue.code] = (out[issue.code] || 0) + 1; return out;
  }, {}) };
}
