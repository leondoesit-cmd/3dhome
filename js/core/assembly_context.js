import { apply, axisAngleMatrix, createFrameResolver, mul, rotationFromTo, rotationOf, setRotation } from "../cad_mate_model.js";

// A virtual part is authored in its own coordinates. Its Right plane is the
// selected parent face: geometry stays editable and the occurrence follows
// that face when the parent changes, rather than baking assembly coordinates.
export function updateAssemblyContexts(assembly) {
  const components = assembly?.components || [], byId = new Map(components.map(c => [c.id, c]));
  const visited = new Set(), visiting = new Set(), issues = [];
  const sink = { issues: [], rebindings: [] }, resolve = createFrameResolver(sink);
  const visit = component => {
    if (visited.has(component.id)) return !component.contextIssue;
    const context = component.inContext;
    if (!context) { visited.add(component.id); return true; }
    if (visiting.has(component.id)) { component.contextIssue = "Cyclic context reference"; return false; }
    visiting.add(component.id);
    const parent = byId.get(context.parentId);
    let reason = !parent ? "Missing context component" : !visit(parent) ? "Invalid parent context" : null;
    const frame = !reason && resolve(context.reference, parent, "context:" + component.id, true);
    if (!reason && (!frame || frame.surface !== "plane" || !frame.origin || !frame.normal)) reason = "Missing context planar face";
    if (!reason) {
      const rotation = rotationOf(parent.transform);
      const swing = rotationFromTo(apply(rotation, {x:1,y:0,z:0}), frame.normal);
      const placed = mul(axisAngleMatrix(swing.axis, swing.angle), rotation);
      component.transform = { ...component.transform, ...frame.origin };
      setRotation(component.transform, placed);
      component.grounded = true;
      delete component.contextIssue;
    } else { component.contextIssue = reason; issues.push({component:component.id, code:"context-reference", message:reason}); }
    visiting.delete(component.id); visited.add(component.id);
    return !reason;
  };
  components.forEach(visit);
  return {issues, rebindings:sink.rebindings};
}
