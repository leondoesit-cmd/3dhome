import {replayComponentPatterns} from "./assembly_component_pattern.js";
/* NESTED ASSEMBLIES — an assembly used as one component of another.
 *
 * The book builds the FLASHLIGHT out of sub-assemblies (p.379–434): LENS and
 * BULB become LENSANDBULB, that goes into CAPANDLENS with the LENSCAP and the
 * O-RING, and CAPANDLENS goes into FLASHLIGHT. A component could only be a part.
 *
 * A sub-assembly component carries its own document — components and mates —
 * solved once, on its own, and then moved as ONE rigid body by the parent's
 * mates, which is how SOLIDWORKS treats a sub-assembly unless it is made
 * flexible. The parent's mate solver does not have to know any of this. A mate
 * frame is always "a persistent id on a component, in that component's space",
 * so a sub-assembly simply presents the topology of everything inside it,
 * carried into its own space through each child's pose and namespaced by the
 * path of child ids ("<child>/<grandchild>/<face id>"), plus its own Front,
 * Top and Right planes. A face of the BULB inside LENSANDBULB is then just a
 * face of LENSANDBULB, and the solver moves LENSANDBULB.
 *
 * Planes are references too. The book mates the Right Plane of LENSANDBULB to
 * the Right Plane of CAPANDLENS (steps 148–166): every component answers to
 * "plane:front|top|right" at its own origin, and the parent assembly's own
 * planes belong to a virtual grounded component, ASSEMBLY_ORIGIN_ID, that the
 * solver adds when a mate names it.
 */
import { worldFrame } from "../cad_mate_model.js";

export const ASSEMBLY_ORIGIN_ID = "assembly:origin";
export const PATH_SEPARATOR = "/";

/* Tree row IDs are strings, while older saved assembly occurrences use numeric
   IDs. A selected plane row must still resolve the same component and hand its
   original ID type to the mate solver's keyed component map. */
export function lookupAssemblyComponent(assembly, id) {
  return (assembly?.components || []).find((component)=>String(component.id)===String(id)) || null;
}

/* This modeler's planes: Front is X·Y, Top is X·Z, Right is Z·Y. */
const PLANES = [
  { id: "plane:front", name: "Front Plane", normal: { x: 0, y: 0, z: 1 } },
  { id: "plane:top", name: "Top Plane", normal: { x: 0, y: 1, z: 0 } },
  { id: "plane:right", name: "Right Plane", normal: { x: 1, y: 0, z: 0 } },
];

export function standardPlaneEntries() {
  return PLANES.map((plane) => ({
    persistentId: plane.id, kind: "face", name: plane.name, reference: true,
    descriptor: { surface: "plane", origin: { x: 0, y: 0, z: 0 }, normal: { ...plane.normal } },
  }));
}

export function isStandardPlaneId(id) {
  return PLANES.some((plane) => plane.id === id);
}

export function isSubassembly(component) {
  return !!(component && component.kind === "assembly" && component.asm && Array.isArray(component.asm.components));
}

const POINT_KEYS = ["origin", "point", "center", "start", "end", "referenceOrigin"];
const DIRECTION_KEYS = ["normal", "axis", "xDir", "direction"];

/* A descriptor carried from a child's space into its parent's: points through
   the child's whole pose, directions through its rotation only. Everything else
   (surface kind, radius, measures) is unchanged by a rigid move. */
export function descriptorToParent(descriptor, child) {
  if (!descriptor) return descriptor;
  const out = { ...descriptor };
  for (const key of POINT_KEYS) {
    if (!descriptor[key]) continue;
    out[key] = worldFrame({ origin: descriptor[key] }, child, "component").origin;
  }
  if(Array.isArray(descriptor.endpoints)) out.endpoints=descriptor.endpoints.map(point=>worldFrame({origin:point},child,'component').origin);
  if(descriptor.bounds?.min && descriptor.bounds?.max) {
    const corners=[];
    for(const x of [descriptor.bounds.min.x,descriptor.bounds.max.x])for(const y of [descriptor.bounds.min.y,descriptor.bounds.max.y])for(const z of [descriptor.bounds.min.z,descriptor.bounds.max.z])
      corners.push(worldFrame({origin:{x,y,z}},child,'component').origin);
    out.bounds={min:{},max:{}};
    for(const axis of ['x','y','z']){out.bounds.min[axis]=Math.min(...corners.map(p=>p[axis]));out.bounds.max[axis]=Math.max(...corners.map(p=>p[axis]));}
  }
  for (const key of DIRECTION_KEYS) {
    if (!descriptor[key]) continue;
    out[key] = worldFrame({ normal: descriptor[key] }, child, "component").normal;
  }
  return out;
}

/* The topology a component presents to mates, in its own space. `partTopology`
   answers for a part component (the editor knows where its rebuilt topology
   lives); a sub-assembly answers for itself, recursively. */
export function componentTopology(component, partTopology) {
  if (!isSubassembly(component)) return (partTopology(component) || []).concat(standardPlaneEntries());
  const out = standardPlaneEntries();
  for (const child of component.asm.components) {
    for (const entry of componentTopology(child, partTopology)) {
      out.push({
        ...entry,
        persistentId: child.id + PATH_SEPARATOR + entry.persistentId,
        path: [child.id].concat(entry.path || []),
        descriptor: descriptorToParent(entry.descriptor, child),
      });
    }
  }
  return out;
}

/* The grounded frame of the assembly being edited — the owner of its own
   Front, Top and Right planes. */
export function assemblyOriginComponent() {
  return {
    id: ASSEMBLY_ORIGIN_ID, name: "Assembly origin", grounded: true, virtual: true,
    transform: { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 },
    topology: standardPlaneEntries(),
  };
}

/* Every part occurrence under an assembly, with the chain of components that
   leads to it and its pose composed into the top assembly's space. The bill
   of materials, interference and exploded views count and place parts, not
   sub-assemblies. `options.visibleOnly` skips hidden components and whatever
   they contain. */
export function flattenAssembly(assembly, options = {}) {
  replayComponentPatterns(assembly);
  const out = [];
  const walk = (components, path, parents) => {
    for (const component of components || []) {
      if (options.visibleOnly && component.visible === false) continue;
      const chain = parents.concat(component);
      if (isSubassembly(component)) { replayComponentPatterns(component.asm); walk(component.asm.components, path.concat(component.id), chain); }
      else out.push({ component, path: path.concat(component.id), parents, placement: composePlacement(chain) });
    }
  };
  walk(assembly && assembly.components, [], []);
  return out;
}

/* A point and the three axes of a chain of components, outermost first. */
export function composePlacement(chain) {
  let frame = { origin: { x: 0, y: 0, z: 0 }, x: { x: 1, y: 0, z: 0 }, y: { x: 0, y: 1, z: 0 }, z: { x: 0, y: 0, z: 1 } };
  for (let i = chain.length - 1; i >= 0; i--) {
    const component = chain[i];
    const lift = (key) => worldFrame({ normal: frame[key] }, component, "component").normal;
    frame = { origin: worldFrame({ origin: frame.origin }, component, "component").origin, x: lift("x"), y: lift("y"), z: lift("z") };
  }
  return frame;
}

/* Which component a namespaced persistent id lives on, walking the path. */
export function resolveComponentPath(component, persistentId) {
  if (!isSubassembly(component) || !persistentId || !persistentId.includes(PATH_SEPARATOR)) return { component, localId: persistentId, chain: [component] };
  const [head, ...rest] = persistentId.split(PATH_SEPARATOR);
  const child = component.asm.components.find((item) => String(item.id) === head);
  if (!child) return null;
  const inner = resolveComponentPath(child, rest.join(PATH_SEPARATOR));
  return inner && { ...inner, chain: [component].concat(inner.chain) };
}

/* A sub-assembly inserted into a parent: its own document, copied, so the
   parent keeps working if the library record changes or is lost — the same
   choice parts already make with `def`. Its internal mates are solved by the
   caller before it is placed. */
export function subassemblyComponent(record, fields = {}) {
  const asm = structuredClone({ key: record.key, name: record.name, components: record.components || [], mates: record.mates || [], topologyMates: record.topologyMates || [],
    ...(record.componentPatterns?{componentPatterns:record.componentPatterns}:{}),...(record.customProperties?{customProperties:record.customProperties}:{}) });
  return {
    id: fields.id, kind: "assembly", assemblyKey: record.key, name: record.name || record.key,
    description: record.description || "", asm, visible: true, grounded: !!fields.grounded,
    transform: fields.transform || { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 },
  };
}

export function boundsAtPlacement(bounds, placement) {
  if (!bounds || !placement) return null;
  const out = { x0: Infinity, y0: Infinity, z0: Infinity, x1: -Infinity, y1: -Infinity, z1: -Infinity };
  for (const x of [bounds.x0, bounds.x1]) for (const y of [bounds.y0, bounds.y1]) for (const z of [bounds.z0, bounds.z1]) {
    const point = {
      x: placement.origin.x + placement.x.x*x + placement.y.x*y + placement.z.x*z,
      y: placement.origin.y + placement.x.y*x + placement.y.y*y + placement.z.y*z,
      z: placement.origin.z + placement.x.z*x + placement.y.z*y + placement.z.z*z,
    };
    for (const axis of ["x", "y", "z"]) {
      out[axis+"0"] = Math.min(out[axis+"0"], point[axis]);
      out[axis+"1"] = Math.max(out[axis+"1"], point[axis]);
    }
  }
  return out;
}

/* Refresh the embedded document without replacing its occurrence in the
   parent. Parent mates address that occurrence ID, while references into the
   child use the saved child IDs and may rebind during the next solve. */
export function refreshSubassemblyFromRecord(component, record) {
  if (!isSubassembly(component) || !record) return component;
  component.asm = subassemblyComponent(record, { id: component.id }).asm;
  component.assemblyKey = record.key;
  return component;
}

/* An assembly may not contain itself, however deep: inserting CAPANDLENS into
   LENSANDBULB, which CAPANDLENS already contains, would recurse forever. */
export function containsAssembly(record, key) {
  if (!record) return false;
  if (record.key === key) return true;
  return (record.components || []).some((component) => isSubassembly(component) && containsAssembly(component.asm, key));
}
