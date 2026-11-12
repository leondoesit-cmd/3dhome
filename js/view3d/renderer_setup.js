/* The 3D view's WebGPURenderer creation, backend fallback and shadow setup,
   lifted out of build3D, split out of js/view3d.js. It shares the editor's
   state through live imports from ../view3d.js. */
import { LUX, createRenderer } from "../gpu.js";
import { createLightLoop } from "../light_loop.js";
import { UNMASKED, createRoomBounce, roomInspectionFill } from "../room_bounce.js";
import { S } from "../state.js";
import { ADDONS, THREE, TSL } from "../three_lazy.js";
import { setupSkyAndWalkControls } from "../view3d/sky_walk.js";
import { lightLoopWanted } from "../view3d/wall_build.js";
import {
  SHADOW_ONLY_LAYER, aoPass, camera, dyn, envSrcCanvas, envSrcTex,
  gameRendererLock, hemi, lightLoop, pmrem, post, relightHooks, renderer,
  roomBounce, scene, set_aoPass, set_camera, set_dyn, set_envSrcCanvas,
  set_envSrcTex, set_hemi, set_lightLoop, set_pmrem, set_post,
  set_prewarmPass, set_ready3D, set_renderer, set_roomBounce, set_scene,
  set_sun, set_traaPass, set_usePost, set_velUniforms, sun, traaPass,
  velUniforms, walk,
} from "../view3d.js";

// lifted out of build3D()
function setupRendererAndShadows() {
  set_scene(new THREE.Scene());
  scene.background = new THREE.Color(0xeef0f3);
  // WebGPURenderer drives a WebGPU backend where the browser has it and silently
  // falls back to its own WebGL2 backend where it does not (WebKitGTK, older
  // Safari) — same API, same node materials, so there is only one code path to
  // maintain. See gpu.js for the backend policy and the forceWebGL test switch.
  // looked up per call: the bounce (and its room map) is made just below
  set_lightLoop(createLightLoop(THREE, TSL, {
    on: lightLoopWanted(),
    maskRoom: function (l, r) { return roomBounce ? roomBounce.loopMasks.maskRoom(l, r) : UNMASKED; },
    lightOpen: function (m) { return roomBounce ? roomBounce.loopMasks.lightOpen(m) : TSL.float(1); },
    hoist: function () { return roomBounce ? roomBounce.loopMasks.hoist() : []; },
  }));
  set_renderer(createRenderer({
    lighting: lightLoop.lighting,
    canvas: document.getElementById("v3d"),
    // antialias:false is deliberate. MSAA makes the scene pass multisampled while
    // the depth/normal targets GTAO and TRAA read from are single-sampled, and the
    // per-frame depth copy then fails with a sample-count validation error. TRAA
    // is the antialiasing here — it resolves edges temporally instead, which also
    // beats MSAA on the alpha-tested foliage and thin trim in these scenes.
    antialias: false,

  }));
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  // PCF, not PCFSoft: in r185 PCFSoftShadowFilter is a fixed 3×3-texel gather
  // that never reads shadow.radius, so every penumbra this rig sets (the sun
  // widening at dusk, the night practicals) came out as the same hard edge.
  // PCFShadowFilter samples a Vogel disk scaled by shadow.radius, rotated per
  // pixel — the penumbra the radius asks for. Point lights use their own
  // filter, which reads radius either way.
  renderer.shadowMap.type = THREE.PCFShadowMap;
  // Shadows are camera-independent, so there's no reason to re-render the (4K)
  // shadow map every frame while the user just orbits. They update on demand —
  // only when geometry or the sun actually moved (see shadowsDirty) — per light,
  // through syncShadowUpdates: WebGPURenderer has no renderer-wide switch.
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  // Image-based lighting: prefilter the gradient sky into an environment map so
  // every PBR material gets sky-directional ambient + real reflections (kills the flat look).
  set_pmrem(new THREE.PMREMGenerator(renderer));
  pmrem.compileEquirectangularShader();
  set_envSrcCanvas(document.createElement("canvas"));
  envSrcCanvas.width = 128;
  envSrcCanvas.height = 64;
  set_envSrcTex(new THREE.CanvasTexture(envSrcCanvas));
  envSrcTex.mapping = THREE.EquirectangularReflectionMapping;
  // near=10 (not 1): with far=12000 a near of 1 wastes almost all depth
  // precision, z-fighting the 1mm wall-joint overlaps into dashed seams.
  set_camera(new THREE.PerspectiveCamera(45, 1, 10, 50000));
  set_hemi(new THREE.HemisphereLight(0xffffff, 0x9c8d6f, LUX * 0.6));
  scene.add(hemi);
  set_sun(new THREE.DirectionalLight(0xfff3df, LUX * 0.95));
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.camera.near = 1;
  sun.shadow.bias = -0.0005;
  // scene units are centimeters; normalBias must be large enough to clear a
  // shadow texel (~1cm) or walls self-shadow into zigzag acne along edges —
  // the proud baseboard/door-frame trim (0.8–1.3cm) needs extra clearance.
  sun.shadow.normalBias = 3.5;
  sun.shadow.radius = 6; // penumbra width; needs PCFSoftShadowMap to have any effect
  // the sun also sees what the view hides (see shadowRoot); a mask beyond
  // layer 0 stops the shadow camera inheriting the view camera's layers
  sun.shadow.camera.layers.enable(SHADOW_ONLY_LAYER);
  scene.add(sun);
  scene.add(sun.target);
  set_dyn(new THREE.Group());
  scene.add(dyn);
  // on `scene`, not `dyn`: one light for the life of the view (see fitBounceLights).
  // Its plan map also keeps the sky and every unshadowed light out of the
  // rooms they cannot reach (see fitLightMasks); a game grading the house
  // with its own rig holds the masks off.
  set_roomBounce(createRoomBounce(THREE, TSL, {
    masks: function () { return !gameRendererLock && !relightHooks.length; },
    inspection: function () {
      return roomInspectionFill({
        walk, showCeiling: S.showCeiling, covered: !!S.roof && !S.invisibleRoof,
        daylight: S.dayK, physicalMode: gameRendererLock || relightHooks.length > 0,
      });
    },
  }));
  roomBounce.register(renderer);
  roomBounce.confineSky(scene);
  scene.add(roomBounce.light);
  /* From here on there IS a scene, so the has3D()/ready3D guards must open:
     the rest of this function calls applyEnv() and rebuild3D(), which are two
     of them. Everything they need (scene, renderer, camera, dyn) exists. */
  set_ready3D(true);

  // Post-processing: AO gives the contact/corner darkening that makes interiors
  // read as real instead of "floating"; TRAA cleans the edges the raster pass
  // leaves behind. Built as a TSL node graph rather than a pass chain — the
  // scene pass writes colour, normal and velocity into one MRT so AO and AA can
  // share it instead of each re-rendering the scene.
  try {
    set_post(new THREE.RenderPipeline(renderer));
    // samples:0 pins the scene pass to single-sampled. PassNode otherwise
    // inherits renderer.samples, and a multisampled colour target with the
    // single-sampled depth GTAO/TRAA read produces a per-frame WebGPU
    // sample-count validation error on the depth copy.
    var scenePass = TSL.pass(scene, camera, { samples: 0 });
    // three's velocity node keeps the previous CAMERA view matrix in the
    // per-object uniform group, so every camera move dirtied every object's
    // uniform buffer: one upload per mesh per frame, which on the WebGPU
    // backend (a queue.writeBuffer each) was the bulk of an orbit frame. The
    // value is per camera, like the previous projection beside it, so it
    // belongs to the render group: uploaded once per pass, and a static mesh's
    // own buffer stays untouched while the view moves.
    if (TSL.velocity.previousCameraViewMatrix && TSL.renderGroup)
      TSL.velocity.previousCameraViewMatrix.setGroup(TSL.renderGroup);
    /* No per-object velocity in the MRT. With a velocity target bound, three
       refreshes EVERY object's uniforms on every frame (needsVelocity), even
       a static wall, even inside a recorded bundle: ~7 ms of an orbit frame
       on the ~830 meshes of a furnished flat (half the frame). TRAA gets a camera-motion
       velocity instead, rebuilt from depth and last frame's camera — exact
       for everything that stands still, which in a planner is everything but
       the piece being dragged, and TRAA's variance clipping keeps that one
       from smearing. Matrices are the unjittered ones, as three's own
       velocity uses (see syncCameraVelocity). */
    scenePass.setMRT(TSL.mrt({ output: TSL.output }));
    set_prewarmPass(scenePass);
    var colorNode = scenePass.getTextureNode("output");
    var depthNode = scenePass.getTextureNode("depth");
    set_velUniforms({
      curViewProj: TSL.uniform(new THREE.Matrix4()),
      prevViewProj: TSL.uniform(new THREE.Matrix4()),
      projInv: TSL.uniform(new THREE.Matrix4()),
      world: TSL.uniform(new THREE.Matrix4()),
      primed: false,
    });
    var cameraVelocity = TSL.Fn(function () {
      var uvN = TSL.uv();
      var depth = depthNode.load(uvN.mul(depthNode.size())).r;
      var view = TSL.getViewPosition(uvN, depth, velUniforms.projInv);
      var world = velUniforms.world.mul(TSL.vec4(view, 1));
      var cur = velUniforms.curViewProj.mul(world), prev = velUniforms.prevViewProj.mul(world);
      return TSL.vec4(cur.xy.div(cur.w).sub(prev.xy.div(prev.w)), 0, 1);
    })();
    var velocityNode = TSL.convertToTexture(cameraVelocity);

    /* Normals from depth, not from a normal target: the walls are flat-shaded
       and re-cut by the dollhouse, and their vertex normals disagreed with the
       depth GTAO marches through — every wall seen from above read as ~40%
       occluded (dark grey) on open, flat plaster. Depth is the truth GTAO
       measures against anyway, and dropping the normal target saves a
       full-screen write per frame. */
    set_aoPass(ADDONS.ao(depthNode, null, camera));
    // GTAO's radius is in WORLD units, unlike the old SSAO kernelRadius which was
    // in its own screen-ish space. Scene units are centimetres (room ~400–600cm),
    // so contact occlusion wants tens of cm, not the 0.25 metre-scale default.
    aoPass.radius.value = 18;
    aoPass.distanceExponent.value = 1.2;
    aoPass.thickness.value = 12;
    aoPass.distanceFallOff.value = 1;
    aoPass.scale.value = 1.1; // slightly over 1: interiors read better with firm contact shadows
    aoPass.samples.value = 16;

    // AO multiplies the beauty pass, then TRAA resolves the result.
    // GTAO renders into a single-channel RedFormat target, so the occlusion has
    // to be broadcast to rgb before multiplying — multiplying the vec4 directly
    // zeroes green and blue and the whole view comes out red.
    var lit = colorNode.mul(TSL.vec4(TSL.vec3(aoPass.getTextureNode().r), 1));
    set_traaPass(ADDONS.traa(lit, depthNode, velocityNode, camera));
    // ?post=raw|ao|traa (or localStorage home3d_post) bisects the graph when the
    // image comes out wrong — "raw" is the bare scene pass, "ao" adds GTAO.
    var stage = (/[?&]post=(\w+)/.exec(location.search) || [])[1] ||
      (function () { try { return localStorage.getItem("home3d_post"); } catch (e) { return null; } })() ||
      "traa";
    // "vel" shows TRAA's camera velocity (|ndc offset| × 20) for checking reprojection,
    // "aoonly" the ambient occlusion alone
    post.outputNode = stage === "raw" ? colorNode : stage === "ao" ? lit
      : stage === "vel" ? TSL.vec4(velocityNode.sample(TSL.uv()).xy.abs().mul(20), 0, 1)
      : stage === "aoonly" ? TSL.vec4(TSL.vec3(aoPass.getTextureNode().r), 1) : traaPass;
    set_usePost(true);
  } catch (e) {
    console.warn("post-processing unavailable, falling back to direct render:", e);
    set_post(null);
    set_usePost(false);
  }
  setupSkyAndWalkControls();
}

export { setupRendererAndShadows };
