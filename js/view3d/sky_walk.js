/* The 3D view's backend wake-up, star and sky domes and touch walkthrough
   controls, lifted out of build3D, split out of js/view3d.js. It shares the
   editor's state through live imports from ../view3d.js. */
import { retainShaderCaches } from "../gpu.js";
import { hitObjectAtCenter, isPhysicsEnabled, toggleSlowMo } from "../physics_facade.js";
import { S, clamp } from "../state.js";
import { THREE, TSL } from "../three_lazy.js";
import { applyEnv } from "../view3d/gizmo_env.js";
import { editDown, editMove, editUp, focusAt, navCode } from "../view3d/navigation_edit.js";
import { cP, panPixels, upd, zoomBy } from "../view3d/see_through.js";
import { toggleFreeMove, toggleWalk, toggleWalkView, walkLook } from "../view3d/walk_mode.js";
import {
  SETTLE_FRAMES, applyPlannerQuality, camera, drawingEnabled, drawingHoverAt,
  drawingHoverObj, drawingHoverXY, drawingPrefs, editDrag, envDeferred,
  extTick, gameRendererLock, keys, navFocus, navHover, navKeys,
  pendingOrbitCamera, phi, pitch, plannerCompact, renderer, scene,
  setOrbitCamera, setQualityPreset, set_DEFr, set_envDeferred,
  set_framedInterior, set_navFocus, set_navHover, set_navKeys,
  set_needsRender, set_pendingOrbitCamera, set_phi, set_pitch, set_radius,
  set_settle, set_skyCanvas, set_skyDome, set_skyTex, set_stars, set_tgt,
  set_theta, set_tpDist, set_userMoved, set_walkControls, set_yaw, skyCanvas,
  skyDome, skyTex, stars, theta, touchMove, tpDist, view3dLocals, walk,
  walkControls, walkPos, walkView, yaw,
} from "../view3d.js";

// lifted out of build3D()
function setupSkyAndWalkControls() {
  setQualityPreset((S.workspace && S.workspace.quality) || "auto");
  window.addEventListener("mf-posture", function () {
    if (!plannerCompact()) set_framedInterior(false);
    if (renderer && !gameRendererLock) applyPlannerQuality();
    upd();
  });

  // The backend comes up asynchronously (adapter/device request on WebGPU). The
  // animate loop already skips frames until renderer.initialized flips, so all
  // this has to do is wake it once the backend is live and report which one we
  // actually got — useful when a machine silently lands on the WebGL2 fallback.
  renderer.init().then(function () {
    // the dusk and dawn shadow handoffs re-key every material; keep the
    // other half of the day's shaders instead of rebuilding them each time
    // Room for every shadow set at once (the prewarm builds the ones the
    // hour is not using): ~60 shaders a set on a large flat, each a state, a
    // pipeline and its programs; the default 256 lost one set to the next.
    retainShaderCaches(renderer, 2048);
    // Anything that needed real GPU work during init3D was deferred to here.
    // applyEnv() rebuilds the IBL/PMREM environment, the sky and the sun from
    // current state, so re-running it is the whole catch-up.
    if (envDeferred) {
      set_envDeferred(false);
      try { applyEnv(); } catch (e) { console.error("deferred applyEnv failed:", e); }
    }
    set_needsRender(true);
    set_settle(SETTLE_FRAMES);
    var backend = renderer.backend && renderer.backend.isWebGPUBackend ? "WebGPU" : "WebGL2";
    if (window.console && console.info) console.info("3D backend: " + backend + " (three r" + THREE.REVISION + ")");
    window.dispatchEvent(new CustomEvent("renderBackendReady", { detail: { backend: backend } }));
  }).catch(function (e) {
    console.error("3D backend failed to initialise:", e);
  });

  // star dome, shown only at night (deterministic layout)
  (function () {
    var pos = [],
      R = 6800;
    for (var i = 0; i < 420; i++) {
      var az = (i * 2.399963) % (Math.PI * 2),
        el = 0.06 + (((i * 97) % 100) / 100) * 1.35;
      pos.push(
        R * Math.cos(el) * Math.cos(az),
        R * Math.sin(el),
        R * Math.cos(el) * Math.sin(az),
      );
    }
    // Instanced billboard quads, not THREE.Points: WebGPU only draws 1px point
    // primitives, so a 2.5px Points star field shrank to specks. A
    // PointsNodeMaterial on a MESH runs three's sprite expansion instead, with
    // the same size / sizeAttenuation meaning PointsMaterial had.
    var quad = new THREE.PlaneGeometry(1, 1);
    var sg = new THREE.InstancedBufferGeometry();
    sg.setIndex(quad.index.clone());
    sg.setAttribute("position", quad.attributes.position.clone());
    sg.setAttribute("iPos", new THREE.InstancedBufferAttribute(new Float32Array(pos), 3));
    sg.instanceCount = pos.length / 3;
    quad.dispose();
    var starMat = new THREE.PointsNodeMaterial({
      color: 0xcfdcf2,
      size: 2.5,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      fog: false,
    });
    starMat.positionNode = TSL.attribute("iPos");
    set_stars(new THREE.Mesh(sg, starMat));
    // the quad's own bounds are 1cm at the origin; the dome is 68m out, so
    // neither culling nor a scene raycast may use them
    stars.frustumCulled = false;
    stars.raycast = function () {};
    stars.visible = false;
    stars.renderOrder = -1;
    scene.add(stars);
  })();

  // gradient sky dome (repainted by applyEnv); stars render in front of it
  set_skyCanvas(document.createElement("canvas"));
  skyCanvas.width = 4;
  skyCanvas.height = 256;
  set_skyTex(new THREE.CanvasTexture(skyCanvas));
  set_skyDome(new THREE.Mesh(
    new THREE.SphereGeometry(9000, 24, 12),
    new THREE.MeshBasicMaterial({
      map: skyTex,
      side: THREE.BackSide,
      fog: false,
      depthWrite: false,
    }),
  ));
  skyDome.renderOrder = -2;
  scene.add(skyDome);

  set_tgt(new THREE.Vector3(200, 70, 150));
  if(pendingOrbitCamera){const saved=pendingOrbitCamera;set_pendingOrbitCamera(null);setOrbitCamera(saved);}
  set_radius(620);
  set_theta(0.92);
  set_phi(0.95);
  set_DEFr(620);

  view3dLocals.el = renderer.domElement;
  var down = false, dragPan = false;
  view3dLocals.lx = 0;
  view3dLocals.ly = 0;
  /* Touch-only walkthrough movement. Looking remains on the canvas; the
     left-hand pad supplies forward/back/strafe without stealing that gesture. */
  set_walkControls(document.createElement("div"));
  walkControls.className = "walk-touch-controls";
  walkControls.hidden = true;
  walkControls.innerHTML = '<div class="walk-stick"><span></span></div>';
  view3dLocals.el.parentNode.appendChild(walkControls);
  var walkStick = walkControls.firstElementChild,
    walkKnob = walkStick.firstElementChild,
    stickPointer = null;
  function updateStick(e) {
    var r = walkStick.getBoundingClientRect(),
      radius = r.width * 0.32,
      dx = e.clientX - (r.left + r.width / 2),
      dy = e.clientY - (r.top + r.height / 2),
      len = Math.hypot(dx, dy) || 1,
      scale = Math.min(1, radius / len);
    dx *= scale; dy *= scale;
    walkKnob.style.transform = "translate(" + dx + "px," + dy + "px)";
    touchMove.x = dx / radius;
    touchMove.z = dy / radius;
  }
  function releaseStick(e) {
    if (stickPointer !== e.pointerId) return;
    stickPointer = null;
    touchMove.x = touchMove.z = 0;
    walkKnob.style.transform = "";
  }
  walkStick.addEventListener("pointerdown", function (e) {
    stickPointer = e.pointerId;
    walkStick.setPointerCapture(e.pointerId);
    updateStick(e);
    e.preventDefault();
  });
  walkStick.addEventListener("pointermove", function (e) {
    if (stickPointer === e.pointerId) updateStick(e);
  });
  walkStick.addEventListener("pointerup", releaseStick);
  walkStick.addEventListener("pointercancel", releaseStick);
  view3dLocals.el.addEventListener("mouseenter", function () {
    set_navHover(true);
  });
  view3dLocals.el.addEventListener("pointermove", function (e) {
    if (!drawingEnabled || !drawingPrefs.hover) return;
    // no hover sketch while orbiting, panning or dragging a piece
    drawingHoverAt(down || editDrag || e.buttons ? null : e.clientX, e.clientY);
  });
  view3dLocals.el.addEventListener("mouseleave", function () {
    if (drawingHoverObj || drawingHoverXY) drawingHoverAt(null);
    set_navHover(false);
    if (!navFocus) set_navKeys({});
  });
  // clicking into the 3D view "engages" it: that is the gate for the WASD keys,
  // which are shared with global shortcuts (W = walk mode) elsewhere in the app
  window.addEventListener(
    "mousedown",
    function (e) {
      var on = e.target === view3dLocals.el;
      if (navFocus && !on) set_navKeys({});
      set_navFocus(on);
    },
    true,
  );
  window.addEventListener("blur", function () {
    set_navKeys({});
  });
  view3dLocals.el.addEventListener("mousedown", function (e) {
    // edit mode gets first refusal on a plain left press: it only claims the
    // drag when a piece is actually under the cursor, so empty space and
    // right/middle/Shift still orbit and pan as usual
    if (editDown(e)) {
      down = false;
      dragPan = false;
      return;
    }
    down = true;
    set_userMoved(true);
    // middle button, right button or Shift+left = pan; plain left = orbit
    dragPan = !walk && (e.button === 1 || e.shiftKey);
    if (e.button === 1) e.preventDefault(); // no autoscroll cursor
    view3dLocals.lx = e.clientX;
    view3dLocals.ly = e.clientY;
  });
  // right-drag pans, so suppress the browser menu over the canvas
  view3dLocals.el.addEventListener("contextmenu", function (e) {
    e.preventDefault();
  });
  view3dLocals.el.addEventListener("dblclick", function (e) {
    if (walk || extTick) return;
    set_userMoved(true);
    focusAt(e.clientX, e.clientY);
  });
  window.addEventListener("mouseup", function () {
    editUp();
    down = false;
    dragPan = false;
  });
  window.addEventListener("mousemove", function (e) {
    if (editDrag) {
      editMove(e);
      return;
    }
    if (!down) return;
    if (walk) {
      set_yaw(yaw - ((e.clientX - view3dLocals.lx) * 0.005));
      set_pitch(Math.max(-1.3, Math.min(1.3, pitch - (e.clientY - view3dLocals.ly) * 0.005)));
      view3dLocals.lx = e.clientX;
      view3dLocals.ly = e.clientY;
      walkLook();
      return;
    }
    var dx = e.clientX - view3dLocals.lx,
      dy = e.clientY - view3dLocals.ly;
    view3dLocals.lx = e.clientX;
    view3dLocals.ly = e.clientY;
    // Shift counts mid-drag too, so you can start orbiting and slide over
    if (dragPan || e.shiftKey) {
      panPixels(dx, dy);
      return;
    }
    set_theta(theta - (dx * 0.005));
    set_phi(phi - (dy * 0.005));
    cP();
    upd();
  });
  // map a physical key (layout-independent, so it works with a Hebrew/other
  // keyboard layout too) to a movement direction
  function moveDir(e) {
    switch (e.code) {
      case "KeyW":
      case "ArrowUp":
        return "fwd";
      case "KeyS":
      case "ArrowDown":
        return "back";
      case "KeyD":
      case "ArrowRight":
        return "right";
      case "KeyA":
      case "ArrowLeft":
        return "left";
    }
    return null;
  }
  window.addEventListener("keydown", function (e) {
    const focused=document.activeElement;
    if (!walk || document.documentElement.dataset.plannerViewport==='plan' || focused?.matches('input,textarea,select,[contenteditable="true"]') || document.querySelector('#cad-entry:not([hidden]) input:focus')) return;
    var d = moveDir(e);
    if (d) {
      keys[d] = true;
      e.preventDefault();
    } else if (e.code === "KeyV") {
      var m = toggleWalkView();
      window.dispatchEvent(new CustomEvent("walkview", { detail: m }));
      e.preventDefault();
    } else if (e.code === "KeyG" || e.code === "Keyע") {
      if (isPhysicsEnabled()) {
        hitObjectAtCenter(camera, scene);
      }
      e.preventDefault();
    } else if (e.code === "KeyT" || e.code === "Keyא") {
      if (isPhysicsEnabled()) {
        const slowMo = toggleSlowMo();
        // ui.js owns flash(); view3d can't import it (ui.js imports us), so
        // this rides the same CustomEvent bridge as walkview/freemove above
        window.dispatchEvent(new CustomEvent("slowmo", { detail: slowMo }));
      }
      e.preventDefault();
    } else if (e.code === "KeyF") {
      var toggledDoor = false;
      if (scene && scene.doors && scene.doors.length > 0) {
        var minD = Infinity;
        var nearestDoor = null;
        scene.doors.forEach(function(d) {
          var pos = new THREE.Vector3();
          d.getWorldPosition(pos);
          var dist = Math.hypot(pos.x - walkPos.x, pos.z - walkPos.z);
          if (dist < 150 && dist < minD) {
            minD = dist;
            nearestDoor = d;
          }
        });
        if (nearestDoor) {
          window.dispatchEvent(new CustomEvent('planner-door-toggle',{detail:{opening:nearestDoor.userData.opening,open:!nearestDoor.userData.open}}));
          nearestDoor.userData.open = !nearestDoor.userData.open;
          toggledDoor = true;
        }
      }
      if (!toggledDoor) {
        var fm = toggleFreeMove();
        window.dispatchEvent(new CustomEvent("freemove", { detail: fm }));
      }
      e.preventDefault();
    } else if (e.code === "Escape") toggleWalk(false);
  });
  window.addEventListener("keyup", function (e) {
    var d = moveDir(e);
    if (d) keys[d] = false;
  });
  view3dLocals.el.addEventListener(
    "wheel",
    function (e) {
      e.preventDefault();
      set_userMoved(true);
      if (walk) {
        // in third-person, the wheel pulls the camera in/out; ignore in first-person
        if (walkView === "tpv") {
          set_tpDist(clamp(tpDist * (1 + e.deltaY * 0.0012), 90, 900));
          walkLook();
        }
        return;
      }
      // Ctrl/⌘+wheel is the pinch-zoom gesture on trackpads; treat it as zoom
      // too (never as a page zoom), and zoom toward the cursor either way.
      zoomBy(1 + e.deltaY * 0.0012, e.clientX, e.clientY);
    },
    { passive: false },
  );
  // ---- keyboard navigation (orbit mode) ----
  // Capture phase + stopPropagation: the same keys drive plan-editing shortcuts
  // in ui.js / interaction.js, and while you are navigating the 3D view they
  // must not also nudge the selection or switch tools.
  function navGate(e, code) {
    if (walk || extTick || !camera) return false;
    if (e.ctrlKey || e.metaKey || e.altKey) return false;
    var ae = document.activeElement;
    if (ae && /INPUT|SELECT|TEXTAREA/.test(ae.tagName)) return false;
    if (ae && ae.isContentEditable) return false;
    if (!navHover && !navFocus) return false;
    // WASD only once the view has been clicked into — a bare W over the canvas
    // still means "walk mode" for anyone used to that shortcut
    if (/^Key[WASD]$/.test(e.code)) return navFocus;
    return true;
  }
  window.addEventListener(
    "keydown",
    function (e) {
      var c = navCode(e);
      if (!c || !navGate(e, c)) return;
      navKeys[c] = true;
      navKeys.fast = e.shiftKey;
      set_userMoved(true);
      set_needsRender(true);
      e.preventDefault();
      e.stopPropagation();
    },
    true,
  );
  window.addEventListener(
    "keyup",
    function (e) {
      var c = navCode(e);
      if (!c) return;
      if (navKeys[c]) e.stopPropagation();
      navKeys[c] = false;
      navKeys.fast = e.shiftKey;
    },
    true,
  );
  view3dLocals.tm = 0;
  view3dLocals.ld = 0;
  view3dLocals.cx0 = 0;
  view3dLocals.cy0 = 0;
  view3dLocals.tapT = 0;
  view3dLocals.tapX = 0;
  view3dLocals.tapY = 0;
}

export { setupSkyAndWalkControls };
