/* The 3D view's animation loop (doors, idle painting, hidden-pane handling) and
   its pointer gestures, lifted out of build3D, split out of js/view3d.js. It
   shares the editor's state through live imports from ../view3d.js. */
import { createSceneRegistry } from "../core/scene_registry.js";
import { HumanFactory } from "../human.js";
import { isPhysicsBusy, syncPhysicsToThree } from "../physics_facade.js";
import { safeDeltaMilliseconds } from "../physics_runtime.js";
import { S, clamp } from "../state.js";
import { applyEnv, buildViewGizmo, updateViewGizmo } from "../view3d/gizmo_env.js";
import { applyItemOps, rebuild3D } from "../view3d/items_layers.js";
import { finishPrewarm, prewarmHolds, schedulePrewarm, startPrewarm } from "../view3d/lighting.js";
import { editMove, editUp, focusAt, navTick } from "../view3d/navigation_edit.js";
import { cP, panPixels, stepSeeFades, upd, zoomBy } from "../view3d/see_through.js";
import { moveWalk, walkLook } from "../view3d/walk_mode.js";
import {
  SETTLE_FRAMES, camera, compileGate, dec_settle, disposeRetired, dyn,
  extTick, firstCompiled, gestureRebuildMs, lastRebuildT, markShadowRegion,
  needsRender, pendingNavigationView, phi, pitch, prepUntilDrawn, prewarmDue,
  prewarmRun, rebuildShadowT, regionShadowT, renderErrLogged, renderScene,
  renderer, restoreNavigationView, retired, scene, seeFading, set_compileGate,
  set_firstCompiled, set_gestureRebuildMs, set_lastRebuildT, set_needsRender,
  set_pendingNavigationView, set_phi, set_pitch, set_prepUntilDrawn,
  set_prewarmDue, set_radius, set_rebuildShadowT, set_regionShadowT,
  set_renderErrLogged, set_settle, set_shadowDirtyBox, set_shadowThrottleT,
  set_shadowsDirty, set_shadowsFromRebuild, set_tgtTween, set_theta,
  set_tpDist, set_usePost, set_viewTween, set_yaw, settle, shadowDirtyBox,
  shadowThrottleT, shadowsDirty, shadowsFromRebuild, syncCameraVelocity,
  syncSelectionOutline, syncShadowUpdates, tgt, tgtTween, theta, tpDist,
  view3dLocals, viewTween, walk, walkView, yaw,
} from "../view3d.js";

// lifted out of build3D()
function wireRenderLoopAndGestures() {
  view3dLocals.el.addEventListener(
    "touchmove",
    function (e) {
      e.preventDefault();
      if (view3dLocals.tm === 3) {
        if (e.touches.length === 1) editMove(e.touches[0]);
        return;
      }
      if (view3dLocals.tm === 1 && e.touches.length === 1) {
        if (walk) {
          set_yaw(yaw - ((e.touches[0].clientX - view3dLocals.lx) * 0.006));
          set_pitch(Math.max(-1.3, Math.min(1.3, pitch - (e.touches[0].clientY - view3dLocals.ly) * 0.006)));
          view3dLocals.lx = e.touches[0].clientX;
          view3dLocals.ly = e.touches[0].clientY;
          walkLook();
        } else {
          set_theta(theta - ((e.touches[0].clientX - view3dLocals.lx) * 0.006));
          set_phi(phi - ((e.touches[0].clientY - view3dLocals.ly) * 0.006));
          view3dLocals.lx = e.touches[0].clientX;
          view3dLocals.ly = e.touches[0].clientY;
          cP();
          upd();
        }
      } else if (view3dLocals.tm === 2 && e.touches.length >= 2) {
        var d = (0, view3dLocals.d2)(e),
          f = view3dLocals.ld / Math.max(d, 1),
          c = (0, view3dLocals.cen)(e),
          mx = c.x - view3dLocals.cx0,
          my = c.y - view3dLocals.cy0;
        view3dLocals.ld = d;
        view3dLocals.cx0 = c.x;
        view3dLocals.cy0 = c.y;
        if (walk) {
          if (walkView === "tpv") {
            set_tpDist(clamp(tpDist * f, 90, 900));
            walkLook();
          }
        } else {
          // two fingers do both at once: spread/squeeze zooms, sliding pans
          if (Math.abs(1 - f) > 0.002) zoomBy(f, c.x, c.y);
          if (Math.hypot(mx, my) > 0.5) panPixels(mx, my);
        }
      }
    },
    { passive: false },
  );
  view3dLocals.el.addEventListener("touchend", function (e) {
    if (view3dLocals.tm === 3) {
      if (e.touches.length === 0) {
        editUp();
        view3dLocals.tm = 0;
      }
      return; // a piece drag is never also a double-tap
    }
    if (e.touches.length === 0) {
      // double-tap (one finger, same spot, under 320ms) focuses that point
      if (view3dLocals.tm === 1 && !walk) {
        var now = performance.now();
        if (now - view3dLocals.tapT < 320 && Math.hypot(view3dLocals.lx - view3dLocals.tapX, view3dLocals.ly - view3dLocals.tapY) < 30) {
          focusAt(view3dLocals.lx, view3dLocals.ly);
          view3dLocals.tapT = 0;
        } else {
          view3dLocals.tapT = now;
          view3dLocals.tapX = view3dLocals.lx;
          view3dLocals.tapY = view3dLocals.ly;
        }
      }
      view3dLocals.tm = 0;
    } else if (e.touches.length === 1) {
      view3dLocals.tm = 1;
      view3dLocals.lx = e.touches[0].clientX;
      view3dLocals.ly = e.touches[0].clientY;
    }
  });

  view3dLocals.el.addEventListener("touchcancel", function () {
    if (view3dLocals.tm === 3) editUp();
    view3dLocals.tm = 0;
  });

  upd();
  applyEnv();
  
  // returns true while any door is still easing toward its target (so the loop
  // keeps painting until it settles, then goes idle)
  function updateDoors() {
    if (!scene || !scene.doors) return false;
    var moving = false;
    scene.doors.forEach(function(d) {
      if (!d.userData) return;
      if (d.userData.type === "swing") {
        var targetRot = d.userData.open ? d.userData.maxOpen : 0;
        var delta = targetRot - d.rotation.y;
        if (Math.abs(delta) > 1e-4) {
          d.rotation.y += delta * 0.1;
          moving = true;
        } else d.rotation.y = targetRot;
      } else if (d.userData.type === "double") {
        (d.userData.leaves || []).forEach(function(leaf) {
          var leafTarget = d.userData.open ? leaf.userData.maxOpen : 0;
          var leafDelta = leafTarget - leaf.rotation.y;
          if (Math.abs(leafDelta) > 1e-4) {
            leaf.rotation.y += leafDelta * 0.1;
            moving = true;
          } else leaf.rotation.y = leafTarget;
        });
      } else if (d.userData.type === "slide") {
        var maxSlide = d.userData.width * 0.9;
        var targetX = d.userData.open ? d.userData.slideDir * maxSlide : 0;
        var dx = targetX - d.position.x;
        if (Math.abs(dx) > 1e-3) {
          d.position.x += dx * 0.1;
          moving = true;
        } else d.position.x = targetX;
      }
    });
    return moving;
  }

  /* returns true if any human is present (they animate continuously, so their
     presence keeps the render loop live)

     People are FURNITURE, so their groups hang under itemsRoot, not directly
     off dyn — dyn.children only ever held itemsRoot itself. This pass used to
     scan dyn.children, matched nobody, and so people stood frozen while
     humansLive stayed false forever. A traverse finds them wherever the item
     reconciler has parented them.

     Throttled to the existing ~30fps cadence. A registry follows subtree
     attachment/removal, so the tick visits only human objects. The sway is
     slow enough that half-rate is invisible,
     and this pass is the one thing in an otherwise idle scene that can pin
     the render loop (and the 4096² shadow map, see the gate below) at display
     rate. Frames in between reuse the last answer so `live` stays stable. */
  var humanFrameT = 0, humansPresent = false;
  var humanRegistry = createSceneRegistry(dyn, function (object) { return !!object.userData.isHuman; });
  function updateHumans(time) {
    if (!dyn) return false;
    if (humanFrameT && time - humanFrameT < 33) return humansPresent;
    humanFrameT = time;
    var any = false;
    humanRegistry.members.forEach(function (c) {
      if (c.userData && c.userData.isHuman) {
        HumanFactory.animateHuman(c, time);
        any = true;
      }
    });
    humansPresent = any;
    return any;
  }

  var lastTime = 0;
  /* A hidden 3D pane (Plan view) is kept current for the next switch, but not
     on every pointer move of a drag: each rebuild there redid and re-keyed the
     whole house, ~180 ms a move on a large flat with nothing on screen to show
     for it. While a gesture is in progress (a button held, or input within
     HIDDEN_EDIT_IDLE_MS) pending rebuilds wait; the first quiet frame after it
     runs them once, so the pane is still ready when it is opened. */
  /* Pressed pointers by id (two fingers are two gestures' worth). A release
     can be missed (it happened outside the window, or focus went elsewhere
     mid-drag), so a move that reports no buttons, a blur and a hidden page
     all forget them: a stuck press must not hold rebuilds forever. */
  /* With the pane visible, a gesture on the 2D plan is followed at ~8 Hz rather
     than on every pointer move: each rebuild there (~80 ms in a large flat) was
     paid inside the plan's own frame, so the plan dragged at ~12 fps. The 3D
     view lags a little during the drag and is exact once it ends. A gesture in
     the 3D view itself is never throttled. */
  var HIDDEN_EDIT_IDLE_MS = 300, VISIBLE_PLAN_DRAG_REBUILD_MS = 120;
  var editInputT = 0, editPointers = new Set(), editOnPlan = false;
  var noteEditInput = function () { editInputT = performance.now(); };
  var releaseAllPointers = function () { if (editPointers.size) { editPointers.clear(); noteEditInput(); } };
  window.addEventListener("pointerdown", function (e) {
    if (!editPointers.size) set_gestureRebuildMs(0); // a new gesture: pace from its own rebuilds
    editPointers.add(e.pointerId);
    editOnPlan = !!(e.target && e.target.closest && e.target.closest("#view-2d"));
    noteEditInput();
  }, { capture: true, passive: true });
  window.addEventListener("pointermove", function (e) {
    if (!editPointers.has(e.pointerId)) return;
    if (e.buttons === 0) editPointers.delete(e.pointerId);
    noteEditInput();
  }, { capture: true, passive: true });
  ["pointerup", "pointercancel"].forEach(function (type) {
    window.addEventListener(type, function (e) { editPointers.delete(e.pointerId); noteEditInput(); }, { capture: true, passive: true });
  });
  window.addEventListener("blur", releaseAllPointers);
  document.addEventListener("visibilitychange", function () { if (document.hidden) releaseAllPointers(); });
  window.addEventListener("keydown", noteEditInput, { capture: true, passive: true });
  var holdHiddenRebuild = function (time) {
    if (!(S.dirty3D || S.items3D.size)) return false;
    if (!editPointers.size && time - editInputT >= HIDDEN_EDIT_IDLE_MS) return false;
    var el = renderer && renderer.domElement;
    if (el && el.getClientRects().length === 0) return true; // display:none up the tree
    /* A slow rebuild stretches the interval: on a ~200-wall plan one takes
       ~600 ms, and at a fixed 120 ms nearly every move paid it. Only this
       gesture's rebuilds count, and only slow ones, so a small plan keeps
       the 120 ms pace. */
    var interval = gestureRebuildMs > 100 ? 3 * gestureRebuildMs : VISIBLE_PLAN_DRAG_REBUILD_MS;
    return editOnPlan && editPointers.size > 0 && time - lastRebuildT < interval;
  };
  /* A hidden pane (display:none up the tree: the Plan view, or a phone that
     stays on the plan, where main.js now brings 3D up in the background) is
     drawn once, and then not until it is shown. That first frame is the
     background warm-up's point: it builds the house's shaders before anyone
     opens 3D. After it, every edit drew the hidden pane seven times over (the
     frame and its settle frames), and people or a door easing at display
     rate, with nothing on screen to show for it. The layout is read only
     when there is something to draw. Showing the pane again asks for a
     frame (and TRAA's settle) from the observer below: whatever changed
     meanwhile, or nothing, the canvas holds a picture from before. */
  var drewOnce = false;
  var paneHidden = function () {
    return drewOnce && renderer.domElement.getClientRects().length === 0;
  };
  if (typeof ResizeObserver === "function") {
    new ResizeObserver(function (entries) {
      var box = entries[entries.length - 1].contentRect;
      if (box.width > 0 && box.height > 0) {
        set_needsRender(true);
        set_settle(SETTLE_FRAMES);
      }
    }).observe(renderer.domElement);
  }
  buildViewGizmo();
  if(pendingNavigationView){const view=pendingNavigationView;set_pendingNavigationView(null);restoreNavigationView(view);}
  (function animate(time) {
    time = time || performance.now();
    var delta = safeDeltaMilliseconds(lastTime ? time - lastTime : 16, 16);
    lastTime = time;
    requestAnimationFrame(animate);
    if (S.repaint3D) {
      // lightweight path: something visual changed (texture load, overlay
      // param) but the model didn't — repaint without rebuilding the scene
      S.repaint3D = false;
      set_needsRender(true);
    }
    // per-item path first: it may escalate to S.dirty3D, and a full rebuild
    // already covers everything it would have done
    // a rebuild or an edit replaces what a shader in flight is built from
    if (prewarmRun && (S.dirty3D || S.items3D.size)) {
      prewarmRun.stop = true;
      if (!finishPrewarm()) return;
    }
    // A held rebuild that lands still ends in rebuild3D's "scene3d:rebuilt",
    // which views mirroring this scene (the inspector preview) refresh from.
    var heldNow = holdHiddenRebuild(time);
    if (S.items3D.size && !S.dirty3D && !heldNow) applyItemOps();
    if (S.dirty3D && !heldNow) {
      S.dirty3D = false;
      try {
        schedulePrewarm(); // ends a run before the scene it draws is replaced
        var rebuildT0 = performance.now();
        rebuild3D();
        applyEnv();
        if (editPointers.size) set_gestureRebuildMs(performance.now() - rebuildT0);
        /* compile() issues GPU work, so it too has to wait for the backend.
           It walks the whole scene in a render context of its own — the frame
           that follows does all of that again — so it only pays when there
           is time before the next rebuild: during a drag it was ~17 ms of
           every frame. */
        var nowT = performance.now();
        if (renderer && scene && camera && !firstCompiled) {
          /* The first build: every shader in the house is new, and the
             frame that draws it builds them all in one task (~1.6 s frozen
             on a large flat). That cannot be split from here: compileAsync
             builds against a render context the post-processed frame never
             uses (three keys every shader on its context, and the scene
             pass renders nested inside the output pass), so waiting for it
             — up to its 6 s timeout, every time — saved ~0.6 s of the
             freeze and kept the view blank for the 6 s. So the freeze is
             shown for what it is instead: "Preparing the 3D view…" goes up
             now, paints on this frame, and the frame after it draws; it
             comes down once that draw is done. */
          set_firstCompiled(true);
          set_compileGate(true);
          var prep = document.getElementById("v3dPrep");
          if (prep) prep.style.display = "block";
          var open = function () {
            if (!compileGate) return;
            set_compileGate(false); set_needsRender(true); set_settle(SETTLE_FRAMES);
            set_prepUntilDrawn(!!prep);
          };
          requestAnimationFrame(open); // after this loop's own next frame
          setTimeout(open, 250); // a hidden tab runs no frames
        }
        set_lastRebuildT(nowT);
      } catch (err) {
        if (window.console && console.error)
          console.error("rebuild3D failed:", err);
      }
    }
    // CAD view-gizmo camera tween (eased snap to a standard view)
    if (viewTween) {
      viewTween.t += delta;
      var vk = Math.min(1, viewTween.t / viewTween.dur);
      var ve = vk < 0.5 ? 2 * vk * vk : 1 - Math.pow(-2 * vk + 2, 2) / 2;
      set_theta(viewTween.th0 + (viewTween.th1 - viewTween.th0) * ve);
      set_phi(viewTween.ph0 + (viewTween.ph1 - viewTween.ph0) * ve);
      cP();
      upd();
      if (vk >= 1) set_viewTween(null);
    }
    // eased target move (double-click / double-tap focus)
    if (tgtTween) {
      var tt = tgtTween;
      tt.t += delta;
      var tk = Math.min(1, tt.t / tt.dur),
        te = 1 - Math.pow(1 - tk, 3);
      tgt.set(
        tt.x0 + (tt.x1 - tt.x0) * te,
        tt.y0 + (tt.y1 - tt.y0) * te,
        tt.z0 + (tt.z1 - tt.z0) * te,
      );
      set_radius(tt.r0 + (tt.r1 - tt.r0) * te);
      upd();
      if (tk >= 1) set_tgtTween(null);
    }
    // held navigation keys (pan / rise / zoom) — needs a live frame while down
    if (!walk) navTick(delta);
    syncPhysicsToThree(delta);
    if (walk) moveWalk(delta / 1000);
    var extLive = false;
    if (extTick) {
      try {
        extLive = !!extTick(delta, time);
      } catch (err) {
        if (window.console && console.error)
          console.error("external tick failed:", err);
      }
    }
    // Collect live animations. Each of these mutates the scene, so any of them
    // being active means we must paint this frame (and the next).
    var doorsMoving = updateDoors();
    if (seeFading.size) {
      stepSeeFades(delta);
      set_needsRender(true);
    }
    var humansLive = updateHumans(time);
    var physicsLive = isPhysicsBusy();
    // Nothing can be painted until the WebGPU/WebGL2 backend has finished its
    // async init; keep the loop alive and pick up on the frame after it lands.
    if (!renderer || !renderer.initialized) return;
    if (compileGate) return; // the first draw waits a frame for #v3dPrep (see the rebuild above)
    var live = doorsMoving || humansLive || physicsLive || extLive;
    // nothing to draw on screen (see paneHidden); the idle shadow-set prewarm
    // below may still run meanwhile
    if ((needsRender || live || settle > 0) && paneHidden()) {
      set_needsRender(false);
      set_settle(0);
      live = false;
    }
    if (prewarmRun) {
      if (live) prewarmRun.stop = true;
      if (prewarmHolds()) return;
    } else if (prewarmDue && time >= prewarmDue) {
      if (needsRender || live || settle > 0) set_prewarmDue(time + 1000);
      else startPrewarm();
    }
    if (needsRender || live || settle > 0) {
      // Live animation keeps TRAA's history fed on its own; `settle` only has to
      // cover the frames after motion stops.
      if (needsRender || live) set_settle(SETTLE_FRAMES);
      else dec_settle();
      set_needsRender(false);
      // Refresh the sun shadow map only when geometry/light actually changed.
      // Physics and human motion move shadow-casters too, so keep it live then.
      // extLive (Night Shift tick) is true every frame but the indoor scene is
      // mostly static — throttle shadow passes to ~5 Hz to avoid hammering the
      // GPU with a 4096² depth re-render 60 times a second.
      var shadowPass = false, shadowBox = shadowDirtyBox, shadowHold = false;
      set_shadowDirtyBox(null);
      if (extLive) {
        // The external modes' own lights (Night Shift's flashlight) move with
        // the player every frame; their shadows stay live, see syncShadowUpdates.
        shadowPass = true;
      } else if (shadowsDirty && shadowsFromRebuild && !physicsLive && !doorsMoving &&
          time - rebuildShadowT < 100) {
        shadowHold = true;
        /* Rebuild after rebuild (a wall or opening being dragged): every map
           redrawn on each one was a third of the frame. They follow at
           ~10 Hz; the dirt is kept, so the frame after the last rebuild still
           gets its full redraw. */
        set_needsRender(true);
      } else if (shadowsDirty || physicsLive || doorsMoving) {
        shadowPass = true;
        if (shadowsFromRebuild) set_rebuildShadowT(time);
        set_shadowsDirty(false);
        set_shadowsFromRebuild(false);
        set_shadowThrottleT(time);
      } else if (humansLive) {
        // People move slowly and are small in frame, so re-rendering a 4096²
        // depth map for their sway on every frame is the most expensive thing
        // in an otherwise static room. Cap it at ~5 Hz. Geometry and physics
        // keep the immediate path above.
        if (!shadowThrottleT || time - shadowThrottleT > 200) {
          shadowPass = true;
          set_shadowThrottleT(time);
        }
      }
      /* A drag moves its piece every pointer event, and redrawing the maps
         that reach it (the sun's 4096², a room's six-face cube, the windows)
         on each one was most of a drag frame. They follow at ~10 Hz while it
         moves; the region is kept, and keeps the loop awake, until the
         redraw where the piece came to rest has landed. */
      if (shadowBox && !shadowPass && time - regionShadowT < 100) {
        markShadowRegion(shadowBox, true);
        shadowBox = null;
      } else if (shadowBox) set_regionShadowT(time);
      syncCameraVelocity();
      syncShadowUpdates(shadowPass, shadowBox, shadowHold);
      syncSelectionOutline();
      try {
        renderScene();
        if (prepUntilDrawn) {
          set_prepUntilDrawn(false);
          var prepEl = document.getElementById("v3dPrep");
          if (prepEl) prepEl.style.display = "none";
        }
        if (retired.length) disposeRetired();
      } catch (e) {
        // Never silently swallow this: a broken post-processing graph paints
        // pure black and an empty catch makes it look like nothing ran at all.
        // Log once, then drop to a direct render so the view stays usable.
        if (!renderErrLogged) {
          set_renderErrLogged(true);
          if (window.console && console.error) console.error("renderScene failed, falling back to direct render:", e);
        }
        set_usePost(false);
        try { renderer.render(scene, camera); } catch (e2) {}
      }
      drewOnce = true;
      updateViewGizmo(); // keep the orientation triad in sync with the camera
    }
  })();
}

export { wireRenderLoopAndGestures };
