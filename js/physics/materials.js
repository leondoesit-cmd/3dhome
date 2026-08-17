import { ctx } from "./registry.js";
import { MATERIAL_PROFILES } from "./math.js";

export function materialTypeFor(mesh) {
  let type = mesh?.userData?.physicsProps?.type;
  if (!MATERIAL_PROFILES[type] && mesh?.traverse) {
    mesh.traverse(node => {
      const candidate = node?.userData?.physicsProps?.type;
      if (!MATERIAL_PROFILES[type] && MATERIAL_PROFILES[candidate]) type = candidate;
    });
  }
  return MATERIAL_PROFILES[type] ? type : "standard";
}

export function installMaterials() {
  const materialByType = new Map();
  Object.keys(MATERIAL_PROFILES).forEach(type => {
    const profile = MATERIAL_PROFILES[type];
    materialByType.set(type, {
      name: type,
      friction: profile.friction,
      restitution: profile.restitution,
    });
  });
  ctx.materialByType = materialByType;
  ctx.physicsMaterial = materialByType.get("standard");
  ctx.debrisMaterial = { name: "debris", friction: 0.45, restitution: 0.04 };
}
