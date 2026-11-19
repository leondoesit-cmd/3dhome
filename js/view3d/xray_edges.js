/* Crease edges on see-through (X-ray) walls. At 0.18 opacity a wall on the
   light studio backdrop all but vanishes, and interior partitions stop
   reading as rooms; a thin line along every crease (EdgesGeometry, faces
   meeting at more than XRAY_EDGE_ANGLE degrees) keeps their shape.

   Called from buildWall (js/view3d/wall_build.js) on each group it built while
   the wall X-ray is on; the lines are children of the meshes they trace, so
   clearGroup / disposeSubtree free their geometry and material with the wall,
   and the reusable-wall key (items_layers.js) already includes the X-ray flag.
   THREE comes in as an argument so Node can test this without the bare
   `three` import (LineBasicMaterial and LineSegments work on WebGPURenderer). */

export const XRAY_EDGE_ANGLE = 30;
export const XRAY_EDGE_COLOR = 0x3c4656;
export const XRAY_EDGE_OPACITY = 0.55;

/* Only the X-ray surfaces themselves: wall_build.js / items_layers.js tag
   theirs userData.wallXray (their opacity is the viewer's Display setting);
   untagged ones (site_cutaway.js) are transparent, nearly clear and not
   writing depth. Glass panes, framing (0.42) and opening frames keep their
   own look. */
export function isXrayMaterial(m) {
  if (m && m.userData && m.userData.wallXray && m.transparent && !m.transmission) return true;
  return !!(m && m.transparent && m.depthWrite === false && m.opacity <= 0.2 && !m.transmission);
}

/** Add crease lines under every X-ray mesh of `root`; returns how many. */
export function addXrayEdges(THREE, root) {
  if (!root || !THREE) return 0;
  var targets = [];
  root.traverse(function (o) {
    if (!o.isMesh || o.isInstancedMesh || !o.geometry || o.userData.xrayEdges) return;
    if (![].concat(o.material).some(isXrayMaterial)) return;
    if (o.children.some(function (c) { return c.userData && c.userData.xrayEdges; })) return;
    targets.push(o);
  });
  targets.forEach(function (mesh) {
    var geo = new THREE.EdgesGeometry(mesh.geometry, XRAY_EDGE_ANGLE);
    var mat = new THREE.LineBasicMaterial({
      color: XRAY_EDGE_COLOR, transparent: true, opacity: XRAY_EDGE_OPACITY, depthWrite: false,
    });
    var lines = new THREE.LineSegments(geo, mat);
    lines.userData.xrayEdges = true;
    lines.userData.physicsRole = "ignore";
    lines.userData.exportSkip = true;
    lines.castShadow = lines.receiveShadow = false;
    lines.renderOrder = 1; // after the translucent faces it outlines
    lines.raycast = function () {}; // picking and hover keep hitting the wall itself
    mesh.add(lines);
  });
  return targets.length;
}
