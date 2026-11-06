/* The 3D view's orientation gizmo, sky and environment maps, relight hooks,
   site and street-view cube, and resizing, split out of js/view3d.js. It shares
   the editor's state through live imports from ../view3d.js. */
import { contentBounds } from "../geometry.js";
import { LUX } from "../gpu.js";
import { SITE, llToLocalCm } from "../site.js";
import { prefilterInto, skyPixels } from "../sky_model.js";
import { S, clamp } from "../state.js";
import { THREE, TSL } from "../three_lazy.js";
import { fitBounceLights, fitPracticalLights } from "../view3d/lighting.js";
import { frameView } from "../view3d/see_through.js";
import { mepXray } from "../view3d/walk_mode.js";
import {
  AXIS_DEFS, GZ, SETTLE_FRAMES, SV_BLDG_DIST, SV_CAM_H, SV_RADIUS, camera,
  dyn, envRT, envSrcCanvas, envSrcTex, gizmoAxes, gizmoEl, groundPlaneRef,
  gzCompass, gzTmpM, gzTmpV, hdrSkyTex, hemi, lastEnvKey, lastSkyKey,
  lastViewHeight, lastViewRatio, lastViewWidth, phi, pmrem, prewarmRun,
  ready3D, relightHooks, renderer, scene, set_envDeferred, set_envPT,
  set_envRT, set_framedInterior, set_gizmoAxes, set_gizmoEl, set_gzCompass,
  set_gzTmpM, set_gzTmpV, set_hdrSkyTex, set_lastEnvKey, set_lastSkyKey,
  set_lastViewHeight, set_lastViewRatio, set_lastViewWidth, set_needsRender,
  set_settle, set_shadowsDirty, set_siteAerialMesh, set_siteAerialTex,
  set_siteGroup, set_svBox, set_userMoved, set_viewTween, siteAerialMesh,
  siteAerialTex, siteDressRef, siteGroup, skyCanvas, skyDome, skyTex, stars,
  sun, svBox, theta, walk,
} from "../view3d.js";

function buildViewGizmo() {
  var host = document.getElementById("view-3d");
  if (!host || gizmoEl) return;
  var NS = "http://www.w3.org/2000/svg";
  set_gizmoEl(document.createElement("div"));
  gizmoEl.className = "view-gizmo";
  gizmoEl.setAttribute("data-i18n-title", "gizmoHint");
  gizmoEl.title = "Click an axis to snap the view";
  var svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 " + GZ.size + " " + GZ.size);

  var compass = document.createElementNS(NS, "g");
  compass.setAttribute("class", "gz-compass");
  compass.setAttribute("title", "North (click to face North)");

  var ring = document.createElementNS(NS, "circle");
  ring.setAttribute("cx", GZ.cx); ring.setAttribute("cy", GZ.cy); ring.setAttribute("r", 35.5);
  ring.setAttribute("class", "gz-compass-ring");
  compass.appendChild(ring);

  var nPoly = document.createElementNS(NS, "polygon");
  nPoly.setAttribute("points", "42,1.5 38.5,6.5 45.5,6.5");
  nPoly.setAttribute("fill", "#e0564f");
  compass.appendChild(nPoly);

  var nCirc = document.createElementNS(NS, "circle");
  nCirc.setAttribute("cx", 42); nCirc.setAttribute("cy", 8.5); nCirc.setAttribute("r", 5);
  nCirc.setAttribute("fill", "#c0563b"); nCirc.setAttribute("stroke", "#ffffff"); nCirc.setAttribute("stroke-width", 1);
  compass.appendChild(nCirc);

  var nTxt = document.createElementNS(NS, "text");
  nTxt.setAttribute("x", 42); nTxt.setAttribute("y", 8.5); nTxt.setAttribute("dy", 2.6);
  nTxt.setAttribute("text-anchor", "middle");
  nTxt.setAttribute("class", "gz-lbl gz-north-lbl");
  nTxt.textContent = "N";
  compass.appendChild(nTxt);

  var sTick = document.createElementNS(NS, "line");
  sTick.setAttribute("x1", 42); sTick.setAttribute("y1", 74.5); sTick.setAttribute("x2", 42); sTick.setAttribute("y2", 78);
  sTick.setAttribute("class", "gz-compass-tick s-tick");
  compass.appendChild(sTick);
  var eTick = document.createElementNS(NS, "line");
  eTick.setAttribute("x1", 74.5); eTick.setAttribute("y1", 42); eTick.setAttribute("x2", 78); eTick.setAttribute("y2", 42);
  eTick.setAttribute("class", "gz-compass-tick");
  compass.appendChild(eTick);
  var wTick = document.createElementNS(NS, "line");
  wTick.setAttribute("x1", 6); wTick.setAttribute("y1", 42); wTick.setAttribute("x2", 9.5); wTick.setAttribute("y2", 42);
  wTick.setAttribute("class", "gz-compass-tick");
  compass.appendChild(wTick);

  compass.addEventListener("click", function (e) {
    e.stopPropagation();
    setStandardView("-z");
  });
  svg.appendChild(compass);
  set_gzCompass(compass);

  AXIS_DEFS.forEach(function (a) {
    if (a.pos) {
      var ln = document.createElementNS(NS, "line");
      ln.setAttribute("x1", GZ.cx); ln.setAttribute("y1", GZ.cy);
      ln.setAttribute("stroke", a.col); ln.setAttribute("stroke-width", 2);
      a.line = ln; svg.appendChild(ln);
    }
  });
  var home = document.createElementNS(NS, "circle");
  home.setAttribute("cx", GZ.cx); home.setAttribute("cy", GZ.cy); home.setAttribute("r", 3.2);
  home.setAttribute("class", "gz-home");
  home.addEventListener("click", function (e) { e.stopPropagation(); frameView(); });
  svg.appendChild(home);
  AXIS_DEFS.forEach(function (a) {
    var g = document.createElementNS(NS, "g");
    g.setAttribute("class", "gz-nub");
    var c = document.createElementNS(NS, "circle");
    c.setAttribute("r", a.pos ? 6.5 : 5);
    a.circle = c; g.appendChild(c);
    if (a.label) {
      var tx = document.createElementNS(NS, "text");
      tx.setAttribute("text-anchor", "middle"); tx.setAttribute("dy", "3.0");
      tx.setAttribute("class", "gz-lbl"); tx.textContent = a.label;
      a.text = tx; g.appendChild(tx);
    }
    g.addEventListener("click", function (e) { e.stopPropagation(); setStandardView(a.key); });
    a.g = g; a.svg = svg;
    svg.appendChild(g);
  });

  gizmoEl.appendChild(svg);
  host.appendChild(gizmoEl);
  set_gzTmpV(new THREE.Vector3());
  set_gzTmpM(new THREE.Matrix4());
  set_gizmoAxes(AXIS_DEFS);
  updateViewGizmo();
}
function updateViewGizmo() {
  if (!gizmoEl || !camera) return;
  gizmoEl.style.display = walk ? "none" : "block"; // hide in walk mode
  if (walk) return;
  camera.updateMatrixWorld();
  gzTmpM.copy(camera.matrixWorld).invert();
  gizmoAxes.forEach(function (a) {
    var v = gzTmpV.set(a.dir[0], a.dir[1], a.dir[2]).transformDirection(gzTmpM);
    a._x = GZ.cx + v.x * GZ.R;
    a._y = GZ.cy - v.y * GZ.R;
    a._depth = v.z; // view space: +z points toward the viewer → front nubs bigger
    a.circle.setAttribute("cx", a._x);
    a.circle.setAttribute("cy", a._y);
    a.circle.setAttribute("r", a.pos ? Math.max(4.2, 6.5 + a._depth * 1.8) : Math.max(3.5, 5 + a._depth * 1.2));
    a.circle.setAttribute("fill", a.pos ? a.col : "#fff");
    a.circle.setAttribute("stroke", a.col);
    a.circle.setAttribute("stroke-width", a.pos ? 0 : 1.4);
    a.circle.setAttribute("opacity", (0.5 + 0.5 * (a._depth * 0.5 + 0.5)).toFixed(2));
    if (a.text) { a.text.setAttribute("x", a._x); a.text.setAttribute("y", a._y); }
    if (a.line) { a.line.setAttribute("x2", a._x); a.line.setAttribute("y2", a._y); }
  });
  if (gzCompass) {
    var deg = ((Math.PI / 2 - theta) * 180 / Math.PI) + (S.northAngle || 0);
    gzCompass.setAttribute("transform", "rotate(" + deg.toFixed(2) + " 42 42)");
  }
  // painter's order: append nearer nubs last so they sit on top
  gizmoAxes.slice().sort(function (p, q) { return p._depth - q._depth; })
    .forEach(function (a) { if (a.svg && a.g) a.svg.appendChild(a.g); });
}
function viewAngles(key, curTheta) {
  var H = Math.PI / 2;
  if (key === "+x") return { theta: 0, phi: H };
  if (key === "-x") return { theta: Math.PI, phi: H };
  if (key === "+z") return { theta: H, phi: H };
  if (key === "-z") return { theta: -H, phi: H };
  if (key === "+y") return { theta: curTheta, phi: 0.12 };
  if (key === "-y") return { theta: curTheta, phi: H };
  return { theta: curTheta, phi: phi };
}
function setStandardView(key) {
  set_framedInterior(false);
  var a = viewAngles(key, theta);
  var d = a.theta - theta;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  set_viewTween({
    t: 0, dur: 380,
    th0: theta, ph0: phi,
    th1: theta + d, ph1: clamp(a.phi, 0.12, Math.PI / 2),
  });
  set_userMoved(true);
  set_needsRender(true);
}

function lerpC(a, b, t) {
  return new THREE.Color(a).lerp(new THREE.Color(b), clamp(t, 0, 1));
}

/* The environment as a half-float procedural sky (js/sky_model.js): linear
   radiance with the sun's glow and disc above 1, so glossy surfaces show a
   real highlight and the prefiltered fill is brighter on the sun's side.
   Returns null (and the caller paints the old gradient) if the backend
   cannot take the texture. */
function hdrSkyTexture(zenC, horC, groundHex, sunDir, sunCol, day) {
  try {
    if (!THREE.DataUtils || !THREE.HalfFloatType) return null;
    var W = 256, H = 128, g = new THREE.Color("#" + groundHex);
    var p = {
      // an ambient FILL, not a second sun: the direct light is the sun lamp
      zenith: [zenC.r * 0.55, zenC.g * 0.55, zenC.b * 0.55],
      horizon: [horC.r * 0.6, horC.g * 0.6, horC.b * 0.6],
      ground: [g.r * 0.9, g.g * 1.0, g.b * 0.8],
      sunColor: [sunCol.r, sunCol.g, sunCol.b],
      sunI: 30 * day,
      glowI: 0.9 * day,
    };
    var f = skyPixels(W, H, [sunDir.x, sunDir.y, sunDir.z], p);
    // one texture for the session, refilled in place: a new one per hour
    // was a fresh GPU allocation for a picture of the same size and format
    var tex = hdrSkyTex;
    if (!tex) {
      tex = new THREE.DataTexture(new Uint16Array(f.length), W, H, THREE.RGBAFormat, THREE.HalfFloatType);
      tex.mapping = THREE.EquirectangularReflectionMapping;
      tex.colorSpace = THREE.LinearSRGBColorSpace;
      tex.minFilter = tex.magFilter = THREE.LinearFilter;
      tex.generateMipmaps = false;
    }
    var half = tex.image.data;
    for (var i = 0; i < f.length; i++) half[i] = THREE.DataUtils.toHalfFloat(f[i]);
    tex.needsUpdate = true;
    set_hdrSkyTex(tex);
    return tex;
  } catch (e) {
    return null;
  }
}
function updateEnvMap(zenC, horC, groundHex, sunDir, sunCol, day) {
  if (!pmrem || !envSrcCanvas) return;
  // PMREM prefiltering is real GPU work and throws outright on a renderer whose
  // backend has not come up yet — which is the state applyEnv() runs in during
  // init3D, since the WebGPU/WebGL2 backend initialises asynchronously. Skip and
  // let the init handler re-run applyEnv() once the backend is live.
  if (!renderer || !renderer.initialized) {
    set_envDeferred(true);
    return;
  }
  var key = zenC.getHexString() + horC.getHexString() + groundHex +
    (sunDir ? "|" + [sunDir.x, sunDir.y, sunDir.z].map(function (v) { return Math.round(v * 50); }).join(",") : "");
  /* The cache is about not re-prefiltering the same sky, NOT about whether the
     scene is still using it: a game mode that nulls scene.environment for its
     own grade got the daylight sky back on exit but no image-based fill at
     all, because the key had not changed and this returned before the
     assignment. Re-hanging a texture we already have is free. */
  if (key === lastEnvKey && envRT) {
    scene.environment = envRT.texture;
    return;
  }
  set_lastEnvKey(key);
  var hdr = sunDir ? hdrSkyTexture(zenC, horC, groundHex, sunDir, sunCol || new THREE.Color(0xffffff), day || 0) : null;
  if (hdr) {
    var hrt = null;
    try { hrt = prefilterSky(hdr); } catch (e) { hrt = null; }
    if (hrt) return;
  }
  var ex = envSrcCanvas.getContext("2d"),
    H = envSrcCanvas.height,
    grd = ex.createLinearGradient(0, 0, 0, H);
  // scale sky colors down: the env map is an ambient *fill*, not a second sun,
  // so a lit gradient would flood the room and flatten it.
  var z = zenC.clone().multiplyScalar(0.62),
    h = horC.clone().multiplyScalar(0.62);
  grd.addColorStop(0.0, "#" + z.getHexString());
  grd.addColorStop(0.5, "#" + h.getHexString());
  grd.addColorStop(0.52, "#" + groundHex);
  grd.addColorStop(1.0, "#" + groundHex);
  ex.fillStyle = grd;
  ex.fillRect(0, 0, envSrcCanvas.width, H);
  envSrcTex.needsUpdate = true;
  prefilterSky(envSrcTex);
}
/* Prefilter `src` into the environment the scene already holds (see
   prefilterInto): same target, new pixels. A new target per sky re-keyed
   every lit material (~640 ms per time-of-day step on a large flat), and a
   target disposed while a bind group still holds it fails the next submit. */
function prefilterSky(src) {
  var rt = prefilterInto(pmrem, src, envRT);
  if (rt !== envRT) {
    if (envRT) envRT.dispose();
    set_envRT(rt);
  }
  scene.environment = rt.texture;
  return rt;
}

export function applyEnv() {
  if (!ready3D) return;
  // a shader being built reads the lights: change them once it is done
  if (prewarmRun) {
    prewarmRun.stop = true;
    prewarmRun.envPending = true;
    return;
  }
  // the sun/lighting is about to move — the shadow map (and the frame) is stale
  set_shadowsDirty(true);
  set_needsRender(true);
  var bb = contentBounds(),
    cx = bb.cx,
    cz = bb.cz,
    R = Math.max(Math.hypot(bb.w, bb.d), 300);
  var sr = 6,
    ss = 18,
    on = S.hour > sr && S.hour < ss,
    E,
    Ap;
  if (on) {
    var t = (S.hour - sr) / (ss - sr);
    E = Math.sin(t * Math.PI) * 1.02;
    Ap = ((S.northAngle + 90 + t * 180) * Math.PI) / 180;
  } else {
    E = -0.25;
    Ap = ((S.northAngle + (S.hour <= sr ? 80 : 280)) * Math.PI) / 180;
  }
  var ce = Math.cos(E),
    se = Math.sin(E);
  var dx = ce * Math.sin(Ap),
    dy = Math.max(se, 0.04),
    dz = -ce * Math.cos(Ap),
    D = R * 1.7 + 450;
  sun.position.set(cx + dx * D, dy * D, cz + dz * D);
  sun.target.position.set(cx, 0, cz);
  var s = R * 0.85 + 220;
  sun.shadow.camera.left = -s;
  sun.shadow.camera.right = s;
  sun.shadow.camera.top = s;
  sun.shadow.camera.bottom = -s;
  sun.shadow.camera.far = D * 2.4;
  if (sun.shadow.camera.updateProjectionMatrix)
    sun.shadow.camera.updateProjectionMatrix();
  var dk = on ? clamp(se / 0.85, 0, 1) : 0;
  S.dayK = dk;
  var lowK = on ? 1 - clamp(E / 0.7, 0, 1) : 1;
  // LUX: physical lights divide irradiance by PI, so every pre-r185 intensity
  // literal in this rig is PI too dim as written. See gpu.js.
  // The sun is the key light and the sky is fill. With the sky map at full
  // strength the two came out nearly equal, so interiors read flat and white
  // walls clipped; a stronger, warmer sun over a dimmer sky gives shadows
  // that actually model the rooms. The penumbra widens as the sun drops.
  sun.intensity = LUX * (on ? 0.45 + 1.4 * dk : 0);
  sun.color.copy(lerpC(0xfff1db, 0xff7a36, lowK));
  sun.shadow.radius = 3 + 6 * lowK;
  // a sun below the horizon still cost a 4096² pass and a texture in every shader
  sun.castShadow = on;
  /* Light in the order nature has it: the sun's patch through a window is
     several times brighter than the diffuse sky light around it, which is
     brighter than the bounce that fills the rest of the room. The window
     sky light used to put twice the sun's illuminance on the floor beside the
     glass, so a sun patch vanished into it. */
  scene.environmentIntensity = on ? 0.53 + 0.21 * lowK : 0.55;
  hemi.intensity = LUX * (0.02 + 0.05 * dk); // env map now supplies most sky ambient
  // gradient sky: zenith->horizon colors, shared with the path tracer via envPT
  var zen = on ? lerpC(0x5f93c8, 0xb46a4a, lowK) : new THREE.Color(0x070b14);
  var hor = on ? lerpC(0xd8e6f2, 0xf0a35c, lowK) : new THREE.Color(0x182233);
  set_envPT({
    zenith: [zen.r, zen.g, zen.b],
    horizon: [hor.r, hor.g, hor.b],
    ground: [0.3, 0.34, 0.24],
    night: on ? 0 : 1,
  });
  var skyGround = hor.clone().multiplyScalar(0.75).getHexString();
  var skyKey = zen.getHexString() + hor.getHexString() + skyGround;
  if (skyCanvas && skyKey !== lastSkyKey) {
    set_lastSkyKey(skyKey);
    var sx = skyCanvas.getContext("2d"),
      grd = sx.createLinearGradient(0, 0, 0, skyCanvas.height);
    grd.addColorStop(0, "#" + zen.getHexString()); // canvas top = zenith
    grd.addColorStop(0.62, "#" + hor.getHexString()); // horizon band
    grd.addColorStop(1, "#" + skyGround); // below horizon, slightly darker
    sx.fillStyle = grd;
    sx.fillRect(0, 0, skyCanvas.width, skyCanvas.height);
    skyTex.needsUpdate = true;
  }
  var bg = on ? lerpC(0xbfd6ec, 0xe8975a, lowK) : new THREE.Color(0x0d1320);
  scene.background = bg;
  if (!scene.fog) scene.fog = new THREE.Fog(hor.getHex(), 2600, 9500);
  else scene.fog.color.copy(hor);
  if (stars) stars.visible = !on;
  // refresh image-based lighting to match the new sky (ground tone darkens at night)
  updateEnvMap(zen, hor, on ? "3a3d30" : "0a0d14",
    new THREE.Vector3(dx, dy, dz).normalize(), sun.color, on ? dk : 0);
  // a dollhouse view keeps its ceilings and full-height walls as shadow
  // casters (see shadowRoot), so its rooms are lit like rooms seen from inside
  renderer.toneMappingExposure = on ? 1.28 : 0.95;
  S.artK = on ? 0.12 + 0.55 * (1 - dk) : 1.0;
  dyn.traverse(function (o) {
    if ((o.isPointLight || o.isSpotLight) && o.userData.baseI != null) {
      o.intensity = o.userData.win
        ? o.userData.baseI * 0.6 * dk
        : o.userData.baseI * (0.45 + 1.9 * S.artK);
    }
    if (
      o.isMesh &&
      o.material &&
      o.material.userData &&
      o.material.userData.glow
    ) {
      var off = o.parent && o.parent.userData && o.parent.userData.lampOff;
      o.material.emissiveIntensity = off ? 0 : 0.4 + 1.4 * S.artK;
    }
  });
  fitPracticalLights(); // night practicals take over the shadows from the sun
  fitBounceLights(); // and the light they let in fills each room
  applySite(); // keep the site skybox/sky-dome visibility in sync with day/night
  runRelightHooks();
}

export function onRelight(fn) {
  if (typeof fn !== "function") return function () {};
  relightHooks.push(fn);
  return function () {
    var i = relightHooks.indexOf(fn);
    if (i >= 0) relightHooks.splice(i, 1);
  };
}

function runRelightHooks() {
  for (var i = 0; i < relightHooks.length; i++) {
    try {
      relightHooks[i]();
    } catch (e) {
      /* a mode that fails to re-grade must not take the planner's own
         lighting pass down with it */
    }
  }
}

// Position + toggle the real-world site overlay (aerial ground + street-view
// skybox). Cheap and idempotent — safe to call after any scene/site change.
export function applySite() {
  if (!ready3D) return;
  var st = S.site || {};
  var showSV = st.enabled && st.streetView && svBox;
  // apartment floor within the real building: drop the surroundings (skybox +
  // aerial ground) so window views come from the right height. 300cm/floor.
  var floorCm = Math.max(0, st.floor || 0) * 300;

  // ---- aerial ground plane (scaled to real-world meters) ----
  // Also shown in street-view mode: the pano skybox is a background at
  // infinity, so the satellite imagery supplies the actual ground under the
  // model, Google-Earth style.
  var showAerial = st.enabled && st.show3D && SITE.aerial && SITE.aerial.canvas;
  if (showAerial) {
    var bb = contentBounds();
    if (!siteGroup) {
      set_siteGroup(new THREE.Group());
      set_siteAerialMesh(new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshStandardMaterial({
          roughness: 0.95,
          metalness: 0,
          transparent: true,
          polygonOffset: true,
          polygonOffsetFactor: -1,
          polygonOffsetUnits: -1,
        }),
      ));
      siteAerialMesh.rotation.x = -Math.PI / 2; // lie flat; texture-north -> -Z
      siteAerialMesh.receiveShadow = true;
      siteGroup.add(siteAerialMesh);
      scene.add(siteGroup);
    }
    // (re)build the texture only when the underlying canvas changes
    if (!siteAerialTex || siteAerialTex.image !== SITE.aerial.canvas) {
      if (siteAerialTex) siteAerialTex.dispose();
      set_siteAerialTex(new THREE.CanvasTexture(SITE.aerial.canvas));
      siteAerialMesh.material.map = siteAerialTex;
      siteAerialMesh.material.needsUpdate = true;
    }
    siteAerialMesh.scale.set(SITE.aerial.wcm, SITE.aerial.hcm, 1);
    siteAerialMesh.material.opacity = st.opacity != null ? st.opacity : 0.85;
    siteGroup.position.set(bb.cx + (st.offX || 0), -2.4 - floorCm, bb.cz + (st.offZ || 0));
    siteGroup.rotation.y = ((st.groundRot || 0) * Math.PI) / 180;
    // Satellite imagery is another ground surface above the service plane.
    // Keep it out of the way during under-floor inspection as well.
    siteGroup.visible = !mepXray("floor");
  } else if (siteGroup) {
    siteGroup.visible = false;
  }
  // ---- street-view pano dome ----
  var showSV = st.enabled && st.streetView && svBox;
  if (svBox) {
    svBox.visible = !!showSV;
    if (showSV) {
      var bb2 = contentBounds();
      var cx = bb2.cx + (st.offX || 0);
      var cz = bb2.cz + (st.offZ || 0);
      var pX = 0,
        pZ = 0;
      var rad = ((st.groundRot || 0) * Math.PI) / 180;
      if (svBox.userData.panoLat && svBox.userData.panoLon && st.lat && st.lon) {
        var po = llToLocalCm(svBox.userData.panoLat, svBox.userData.panoLon, st.lat, st.lon);
        var cos = Math.cos(rad),
          sin = Math.sin(rad);
        pX = po.x * cos + po.z * sin;
        pZ = -po.x * sin + po.z * cos;
      }
      // Anchor the backdrop sphere at the car's real location so the pano
      // lines up with the model's compass orientation. On an upper floor, drop
      // the sphere center below the camera (scaled by SV_BLDG_DIST) so the
      // camera sits above the pano's equator and looks down at the street at a
      // believable angle — no projection, so nothing smears at any height.
      svBox.position.set(
        cx + pX,
        SV_CAM_H - floorCm * (SV_RADIUS / SV_BLDG_DIST),
        cz + pZ,
      );
      svBox.rotation.y = rad;
    }
  }

  // Hide the green ground plane in Street View mode (only room + SV ground)
  // and when the apartment is on an upper floor with the aerial lowered —
  // otherwise the procedural ground at y=0 hides the real surroundings below.
  if (groundPlaneRef) {
    groundPlaneRef.visible = !showSV && !mepXray("floor") && !(showAerial && floorCm > 0);
    if (siteDressRef) siteDressRef.visible = groundPlaneRef.visible && !showAerial;
  }

  if (skyDome) skyDome.visible = !showSV;
  // repaint only — NEVER set S.dirty3D here: rebuild3D() and applyEnv() both
  // call applySite(), so flagging a rebuild from inside it made every edit
  // kick off an infinite full-rebuild loop (rebuild → applySite → dirty3D →
  // rebuild next frame, at frame rate, leaking GPU memory each pass).
  set_needsRender(true);
}

// Build/replace the street-view skybox from 6 cube-face <img>s (or null to
// clear). Face keys: px,nx,py,ny,pz,nz. Called by the UI after fetch.
export function setStreetViewCube(faces) {
  if (!ready3D) return;
  if (svBox) {
    scene.remove(svBox);
    svBox.geometry.dispose();
    [].concat(svBox.material || []).forEach(function (m) {
      if (m.map) m.map.dispose();
      if (m.userData.sky) m.userData.sky.dispose();
      m.dispose();
    });
    set_svBox(null);
  }
  if (!faces) {
    applySite();
    return;
  }
  // Clean photographic backdrop: the 6 Street View cube faces wrap a plain
  // inside-out sphere around the scene — a pure skybox, NOT projected onto a
  // ground plane. A single street-level pano has no real pixels for far/
  // overhead ground, so flattening its lower half onto a plane stretches a
  // thin band of horizon pixels across the whole floor (the "smeared ground"
  // streaks, unavoidable from one pano). Keeping it as a backdrop sphere means
  // every direction samples the photo at its true angle — buildings, trees and
  // sky read correctly and nothing ever smears, at any floor. The room sits
  // inside; the ground directly below is the pano's own nadir (road under the
  // capture car), which is fine as a distant floor and never stretches.
  var blank = null;
  function faceImg(k) {
    if (faces[k]) return faces[k];
    if (!blank) {
      blank = document.createElement("canvas");
      blank.width = blank.height = 4;
      var bx = blank.getContext("2d");
      bx.fillStyle = "#8a94a0";
      bx.fillRect(0, 0, 4, 4);
    }
    return blank;
  }
  var cubeTex = new THREE.CubeTexture(
    ["px", "nx", "py", "ny", "pz", "nz"].map(faceImg),
  );
  // photographs are sRGB: untagged, the node pipeline reads them as linear and
  // its output transform lifts every mid-tone (0.5 shows as ~0.74)
  cubeTex.colorSpace = THREE.SRGBColorSpace;
  cubeTex.needsUpdate = true;
  // Plain sphere at SV_RADIUS — no per-vertex ground projection. The camera
  // orbits a small room near the center, so parallax against a sphere this
  // large reads as "at infinity".
  var geo = new THREE.SphereGeometry(SV_RADIUS, 64, 32);
  // A node material: the node builder rejects a raw ShaderMaterial and swaps
  // in a blank default, which is what this dome drew until it was ported.
  var mat = new THREE.MeshBasicNodeMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    // The pano is a finished photo — ACES washes it out. (Honoured on the
    // direct render path; the post pipeline tone-maps the whole frame.)
    toneMapped: false,
  });
  // Sample direction is the per-fragment object-space direction from the
  // sphere center — exact for every fragment. The cube-texture node applies
  // the -x flip itself for a plain CubeTexture: the same BackSide (inside-out)
  // mirroring fix the GLSL version did by hand.
  mat.colorNode = TSL.cubeTexture(cubeTex, TSL.positionLocal.normalize());
  mat.userData.sky = cubeTex;
  set_svBox(new THREE.Mesh(geo, mat));
  if (faces._panoLat && faces._panoLon) {
    svBox.userData = { panoLat: faces._panoLat, panoLon: faces._panoLon };
  }
  svBox.renderOrder = -2; // early in the opaque pass; geometry covers it
  svBox.frustumCulled = false; // the camera usually sits inside it
  scene.add(svBox);
  applySite();
}

export function setSize(w, h) {
  if (!ready3D || w === 0 || h === 0) return;
  var ratio = renderer.getPixelRatio();
  // ResizeObserver can repeat the same size while chrome settles. Keep the
  // existing render targets and temporal history until size or DPR changes.
  if (w === lastViewWidth && h === lastViewHeight && ratio === lastViewRatio) return;
  set_lastViewWidth(w); set_lastViewHeight(h); set_lastViewRatio(ratio);
  set_needsRender(true);
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.fov = 45;
  camera.updateProjectionMatrix();
  // The node graph tracks the renderer's own size — no per-pass resize needed,
  // unlike the old EffectComposer which had to be sized pass by pass.
  set_settle(SETTLE_FRAMES); // a resize invalidates TRAA's history
}

export { buildViewGizmo, updateViewGizmo };
