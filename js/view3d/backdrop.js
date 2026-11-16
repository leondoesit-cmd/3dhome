/* The 3D view's backdrop and light softness: "site" (the grass ground, the sky
   dome and the time-of-day sky, the default) or "studio" (a plain neutral
   cyclorama: no grass, no sky, a light grey floor that still catches the sun's
   shadows), and a "soft light" switch that lowers the sun key and the exposure
   and widens the shadow edge, for interiors whose floor reads too bright.

   Both live on the document's workspace (S.workspace.backdrop,
   S.workspace.softLight), so a project opens the way it was presented.
   backdropLook() is pure (no THREE at module level) so Node tests the numbers;
   applyEnv()/applySite() in ./gizmo_env.js apply them. */

export var BACKDROPS = ["site", "studio"];

export function backdropMode(workspace) {
  return workspace && workspace.backdrop === "studio" ? "studio" : "site";
}
export function softLightOn(workspace) {
  return !!(workspace && workspace.softLight);
}

/* What the backdrop and softness change, given whether the sun is up.
   Scales multiply the site rig's own values, so "site" without soft light is
   exactly 1 everywhere and the default look is untouched. Colours are hex
   numbers; null means "keep the site rig's colour". */
export function backdropLook(mode, soft, day) {
  var studio = mode === "studio";
  var look = {
    studio: studio,
    sky: !studio, // the gradient sky dome
    grass: !studio, // the procedural ground plane and its dressing
    studioFloor: studio,
    background: null,
    zenith: null,
    horizon: null,
    envGround: null, // hex string for the IBL's lower half
    ptGround: null, // [r,g,b] for the path tracer's ground
    sunScale: 1,
    envScale: 1,
    exposureScale: 1,
    shadowSoften: 0, // added to the sun shadow radius
  };
  if (studio) {
    // a neutral, slightly warm grey room: even fill from every side, no
    // green bounce from grass and no blue cast from a sky
    look.background = day ? 0xe7e5e0 : 0x2b2c2f;
    look.zenith = day ? 0xd4d5d7 : 0x1d1e21;
    look.horizon = day ? 0xebe9e4 : 0x2b2c2f;
    look.envGround = day ? "8e8a83" : "1a1a1c";
    look.ptGround = day ? [0.55, 0.54, 0.52] : [0.1, 0.1, 0.11];
    look.sunScale = 0.8;
    look.envScale = 1.15;
    look.shadowSoften = 2;
  }
  if (soft) {
    look.sunScale *= 0.62;
    look.envScale *= 1.12;
    look.exposureScale = 0.88;
    look.shadowSoften += 5;
  }
  return look;
}

/* The studio floor: one large light-grey disc just under the ground plane,
   which receives the sun's shadows so the model still sits on something.
   Built on first use, kept hidden in "site". */
var floorMesh = null;
export function studioFloor(THREE, scene, visible) {
  if (!floorMesh && visible) {
    floorMesh = new THREE.Mesh(
      new THREE.CircleGeometry(6000, 64),
      new THREE.MeshStandardMaterial({ color: 0xd9d6d0, roughness: 0.95, metalness: 0 }),
    );
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.y = -0.6;
    floorMesh.receiveShadow = true;
    floorMesh.name = "studioFloor";
    floorMesh.userData.noPick = true;
    floorMesh.raycast = function () {};
    scene.add(floorMesh);
  }
  if (floorMesh) floorMesh.visible = !!visible;
  return floorMesh;
}
