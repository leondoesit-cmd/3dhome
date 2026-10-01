// Cabinet mesh builder — the only cabinet module that talks to Three.js.
// layoutCab / BOM / checks stay in cabinet.js so Node tests can run them
// without a WebGL renderer.
import { THREE } from "./three_lazy.js";
import { S, CAB, TOP, STEEL, DARK, GLASS, WOOD, FABRIC } from "./state.js";
import { box, cyl, sph, applyTextureToMaterial } from "./primitives.js";
import { layoutCab, HW, FINISH } from "./cabinet.js";
import { slabWithHoles } from "./furniture_helpers.js";
import { cabinetRuntimeMeshKey, placeCabinetUnit } from "./core/cabinet_mesh_reuse.js";

const runtimeMeshes = new WeakMap();
let runtimeMeshRevision = 0;
if (typeof window !== "undefined") {
  for (const event of ["catalogUpdated", "customTextureLoaded"]) window.addEventListener(event, () => { runtimeMeshRevision++; });
}

// Reuse only a mesh built from the same complete structural input. Runtime
// thresholds may reveal garments or other parts, so compare the fresh layout
// as well as the item. Unready/custom textures retain the normal rebuild path.
export function updateCabinetRuntimeMesh(group, item) {
  const cached = runtimeMeshes.get(group);
  if (!cached || cached.revision !== runtimeMeshRevision || item.tex || Object.values(item.texParts || {}).some(Boolean)) return false;
  if (group.children.length !== cached.children.length || group.children.some((child, index) => child !== cached.children[index])) return false;
  const layout = layoutCab(item), key = cabinetRuntimeMeshKey(item, layout, S.parametric?.definitions?.[item.definitionId]);
  if (!key || key !== cached.key) return false;
  for (const [index, pivot] of Object.entries(cached.groups)) {
    if (!layout.units[index] || pivot.parent !== group) return false;
  }
  for (const [index, pivot] of Object.entries(cached.groups)) placeCabinetUnit(pivot, layout.units[index], layout.sp.elev || 0);
  return true;
}

/* ========================= 3D ========================= */

const MAT = {
  carcass: { col: CAB, opt: { rough: 0.72 } },
  front: { col: CAB, opt: { rough: 0.5 } },
  doorPanel: { col: CAB, opt: { rough: 0.55 } },
  batten: { col: CAB, opt: { rough: 0.5 } },
  glazing: { col: GLASS, opt: { trans: true, opacity: 0.3, rough: 0.06, metal: 0.1 } },
  back: { col: 0xb5a68b, opt: { rough: 0.85 } },
  top: { col: TOP, opt: { metal: 0.05, rough: 0.35 } },
  handle: null, // resolved from the chosen finish
  rail: { col: 0xc2c8cc, opt: { metal: 0.85, rough: 0.22, seg: 12 } },
  metal: { col: STEEL, opt: { metal: 0.8, rough: 0.32, seg: 12 } },
  dark: { col: DARK, opt: { rough: 0.6 } },
  glass: { col: GLASS, opt: { trans: true, opacity: 0.34, rough: 0.08, metal: 0.1 } },
  // a touch off full metalness, so a mirror still reads as one in previews
  // that have no environment map to reflect
  mirror: { col: 0xdae4e9, opt: { metal: 0.6, rough: 0.08 } },
  // a television screen reads as a screen only if it is darker and flatter than
  // any joinery around it; an appliance is a painted white-goods shell
  screen: { col: 0x101318, opt: { rough: 0.18, metal: 0.15 } },
  appliance: { col: 0xdcdfe2, opt: { rough: 0.34, metal: 0.12 } },
  fabric: { col: FABRIC, opt: { rough: 0.95 } },
  leather: { col: 0x6b4a2f, opt: { rough: 0.6 } },
  led: { col: 0xfff2cf, opt: { emis: 0xfff0c0, emisI: 1.2, rough: 0.4 } },
  garment: { col: WOOD, opt: { rough: 0.92 } },
};
const GARMENT_TONES = [0x6f7a86, 0x8a6a5a, 0x6a7a62, 0x7a6a86, 0x8a8272];

function matOf(p, sp) {
  if (p.mat === "handle") {
    var f = HW.finish[sp.hw.finish] || HW.finish.steel;
    return { col: f.col, opt: { metal: f.metal, rough: f.rough, seg: 12 } };
  }
  /* A chosen finish is a literal colour, so it survives the item's style
     variant; "auto" keeps painting with the shared CAB constant and therefore
     keeps following that variant, exactly like every other model. */
  if (p.mat === "front" || p.mat === "carcass" || p.mat === "doorPanel" || p.mat === "batten") {
    var fin = FINISH[p.mat === "carcass" ? sp.finCarcass : sp.finFront];
    if (fin && fin.col != null) return { col: fin.col, opt: { rough: fin.rough, metal: fin.metal || 0.02 } };
  }
  if (p.mat === "garment") return { col: GARMENT_TONES[p.tone % 5], opt: { rough: 0.92 } };
  if (p.mat === "rail" && sp.hw.rail === "led") return { col: 0xfff3d4, opt: { emis: 0xfff0c0, emisI: 0.9, metal: 0.4, rough: 0.3, seg: 12 } };
  return MAT[p.mat] || MAT.carcass;
}

/* A flat board whose outline is a polygon rather than a rectangle — extruded
   through its thickness and laid down flat. Only corner units need it, and only
   for the boards that follow the diagonal. */
function polyBoard(parent, p, o, dy, m, opt) {
  var shape = new THREE.Shape();
  p.pts.forEach(function (q, i) {
    if (i === 0) shape.moveTo(q.x, -q.z);
    else shape.lineTo(q.x, -q.z);
  });
  shape.closePath();
  var geo = new THREE.ExtrudeGeometry(shape, { depth: Math.abs(p.y1 - p.y0), bevelEnabled: false });
  geo.rotateX(-Math.PI / 2); // the profile is drawn in plan, so stand it up
  geo.translate(-o.x, p.y0 - o.y + dy, -o.z);
  var mat = new THREE.MeshStandardMaterial({
    color: m.col,
    metalness: opt.metal != null ? opt.metal : 0.08,
    roughness: opt.rough != null ? opt.rough : 0.8,
    transparent: !!opt.trans,
    opacity: opt.opacity != null ? opt.opacity : 1,
  });
  applyTextureToMaterial(mat, opt, p.bw, p.y1 - p.y0, p.bd);
  var mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

export function buildCab(g, it) {
  var L = layoutCab(it),
    sp = L.sp,
    groups = {},
    // the layout is drawn in the cabinet's own frame (floor of the carcass at
    // y=0); a wall-hung unit is lifted to its mount height here, so the
    // elevation editor and the cut list never have to know about it
    yo = sp.elev || 0;

  function target(p) {
    if (p.unit == null) return g;
    if (groups[p.unit]) return groups[p.unit];
    var u = L.units[p.unit],
      gr = new THREE.Group();
    placeCabinetUnit(gr, u, yo);
    g.add(gr);
    groups[p.unit] = gr;
    return gr;
  }
  function off(p) {
    // children of a pivoted group are placed relative to the pivot
    if (p.unit == null) return { x: 0, y: 0, z: 0 };
    var u = L.units[p.unit];
    return { x: u.px || 0, y: u.py || 0, z: u.pz || 0 };
  }

  L.parts.forEach(function (p) {
    var m = matOf(p, sp),
      gr = target(p),
      o = off(p),
      opt = Object.assign({}, m.opt);
    // Cabinet part textures are semantic (doors/body/top), not colour based.
    // Resolve them here so explicit finishes still work when a variant changes
    // the underlying colour or when a polygonal corner board is used.
    var pt = it.texParts || {};
    var role = p.role || p.mat || "";
    var partTex = null;
    if (pt.doors && (p.mat === "front" || p.mat === "doorPanel" || p.mat === "batten" ||
      role === "door" || role === "doorPanel" || role === "drawerFront" || role === "batten")) {
      partTex = pt.doors;
    } else if (pt.top && (p.mat === "top" || p.mat === "worktop" || role === "top" || role === "worktop")) {
      partTex = pt.top;
    } else if (pt.body && p.mat !== "handle" && p.mat !== "rail" && p.mat !== "metal" &&
      p.mat !== "glazing" && p.mat !== "glass" && p.mat !== "led") {
      partTex = pt.body;
    }
    if (partTex) {
      opt.tex = partTex;
      if (it.texScale) opt.texScale = it.texScale;
      if (it.texBump != null) opt.texBump = it.texBump;
    }
    // parts of a pivoted unit are placed relative to that pivot, which already
    // carries the mount height; loose parts carry it themselves
    var dy = p.unit == null ? yo : 0;
    if (p.k === "box") {
      if (p.role === "worktop" && p.cutouts?.length) {
        slabWithHoles(gr, p.x0 - o.x, p.x1 - o.x, p.y0 - o.y + dy, p.y1 - o.y + dy, p.z0 - o.z, p.z1 - o.z,
          p.cutouts.map(hole => ({ x0: hole.x0 - o.x, x1: hole.x1 - o.x, z0: hole.z0 - o.z, z1: hole.z1 - o.z })), m.col, opt);
      } else {
        var me = box(gr, p.x0 - o.x, p.x1 - o.x, p.y0 - o.y + dy, p.y1 - o.y + dy, p.z0 - o.z, p.z1 - o.z, m.col, opt);
      }
      if (me && p.tilt) me.rotation.x = p.tilt; // tilted shoe shelves
    } else if (p.k === "poly") {
      // a corner unit's pentagon boards: the only parts here that are not boxes
      polyBoard(gr, p, o, dy, m, opt);
    } else if (p.k === "cyl") {
      if (p.rx != null) opt.rx = p.rx;
      if (p.rz != null) opt.rz = p.rz;
      cyl(gr, p.x - o.x, p.y - o.y + dy, p.z - o.z, p.r, p.hgt, m.col, opt);
    } else if (p.k === "sph") {
      sph(gr, p.x - o.x, p.y - o.y + dy, p.z - o.z, p.r, m.col, opt);
    }
  });
  runtimeMeshes.set(g, { key: cabinetRuntimeMeshKey(it, L, S.parametric?.definitions?.[it.definitionId]), groups, children: g.children.slice(), revision: runtimeMeshRevision });
}
