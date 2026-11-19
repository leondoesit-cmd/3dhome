/* "Copy walls from the floor below": the walls (and only the walls — no
   openings, no furniture) of another storey's stored scene, appended to the
   live storey. Pure: the caller hands in the target's arrays and an id source,
   and wraps the call in one undo step.

   Walls reference nodes by INDEX (wall.a / wall.b index scene.nodes), so the
   nodes a copied wall uses are appended once each and the indices remapped.
   Each wall gets a fresh id from `nextId`; a wall type the target lacks comes
   along with it, so a copied wall keeps its build-up. */

function sceneList(scene, flatKey, spatialKey) {
  if (!scene || typeof scene !== "object") return [];
  if (Array.isArray(scene[flatKey])) return scene[flatKey];
  const sp = scene.spatial;
  return sp && Array.isArray(sp[spatialKey || flatKey]) ? sp[spatialKey || flatKey] : [];
}

const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

// fields a wall may reference across a scene that cannot survive the copy:
// constraints and joins point at walls of the source storey by id
const DROP = new Set(["id", "a", "b", "cons", "constraints"]);

/**
 * @param {object} source  stored scene ({nodes,walls,wallTypes} or {spatial:{...}})
 * @param {{nodes:Array, walls:Array, wallTypes?:Array}} target live arrays, mutated
 * @param {() => any} nextId  a fresh wall id per call
 * @returns {{walls:number, nodes:number, wallTypes:number}}
 */
export function copyStoreyWalls(source, target, nextId) {
  const out = { walls: 0, nodes: 0, wallTypes: 0 };
  if (!target || !Array.isArray(target.nodes) || !Array.isArray(target.walls) || typeof nextId !== "function") return out;
  const nodes = sceneList(source, "nodes");
  const walls = sceneList(source, "walls");
  const types = sceneList(source, "wallTypes");
  const remap = new Map();
  const nodeFor = (index) => {
    if (remap.has(index)) return remap.get(index);
    const n = nodes[index];
    if (!n || !Number.isFinite(n.x) || !Number.isFinite(n.z)) return -1;
    const copy = clone(n);
    delete copy.id;
    const at = target.nodes.push(copy) - 1;
    remap.set(index, at);
    out.nodes++;
    return at;
  };
  const neededTypes = new Set();
  walls.forEach((w) => {
    if (!w || w.a === w.b) return;
    const na = nodes[w.a], nb = nodes[w.b];
    if (!na || !nb || !Number.isFinite(na.x) || !Number.isFinite(na.z) || !Number.isFinite(nb.x) || !Number.isFinite(nb.z)) return;
    const copy = { id: nextId(), a: nodeFor(w.a), b: nodeFor(w.b) };
    Object.keys(w).forEach((key) => {
      if (!DROP.has(key) && w[key] !== undefined) copy[key] = clone(w[key]);
    });
    target.walls.push(copy);
    out.walls++;
    if (w.wallTypeId != null) neededTypes.add(w.wallTypeId);
    if (w.upperWallTypeId != null) neededTypes.add(w.upperWallTypeId);
  });
  if (Array.isArray(target.wallTypes) && neededTypes.size) {
    const have = new Set(target.wallTypes.map((type) => type && type.id));
    types.forEach((type) => {
      if (!type || !neededTypes.has(type.id) || have.has(type.id)) return;
      target.wallTypes.push(clone(type));
      have.add(type.id);
      out.wallTypes++;
    });
  }
  return out;
}

export function sceneWallCount(scene) {
  return sceneList(scene, "walls").length;
}
