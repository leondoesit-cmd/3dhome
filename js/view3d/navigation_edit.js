/* The 3D view's focus, 3D edit mode, edit-target picking and edit drags, split
   out of js/view3d.js. It shares the editor's state through live imports from
   ../view3d.js. */
import { layerOf, layerRank } from "../layers.js";
import { S, clamp, fin } from "../state.js";
import { THREE } from "../three_lazy.js";
import { itemUserUnpickable } from "../user_layers.js";
import { pickableRoots } from "../view3d/items_layers.js";
import { cR, clampTarget, cutAway, navBasis, pointerGround, pointerRay, pxScale, upd, updateSeeThrough } from "../view3d/see_through.js";
import {
  camera, dyn, editDrag, editMod, extTick, itemsRoot, mepRoot, navFwd, navHit,
  navKeys, navPlane, navRight, radius, ready3D, renderer, set_editDrag,
  set_editMod, set_navHit, set_navPlane, set_needsRender, set_radius,
  set_tgtTween, set_userMoved, structureRoot, tgt, walk,
} from "../view3d.js";

/* double-click: ease the target onto whatever is under the cursor, so the next
   orbit spins around that object rather than around the room's center.

   This is FRAMING, not selection, and it deliberately keeps rank 1. The work
   set says what you are editing; it has no opinion about where you want to
   stand. Refusing to orbit around a wall you can plainly see, because you
   happen to be furnishing, would read as the camera being broken rather than
   as a layer being respected — and there is no consolation prize here the way
   there is for a pick, because the fallback is the flat ground plane and the
   view would just sink to the floor. Rank Infinity is another matter: ghosted
   and hidden geometry is not there to be double-clicked, so pickableRoots
   leaves it out and the ground fallback takes over.

   The ground plane and the per-window lights hang off `dyn` outside all three
   roots, so they are added back explicitly — framing on bare floor is exactly
   what a double-click into empty space should do. */
function focusAt(cx, cy) {
  if (!dyn) return;
  var roots = dyn.children.filter(function (c) {
    return c !== structureRoot && c !== itemsRoot && c !== mepRoot;
  });
  var ray = pointerRay(cx, cy),
    hits = ray
      .intersectObjects(roots.concat(pickableRoots(0), pickableRoots(1)), true)
      .filter(function (h) {
        return h.object.type !== "Sprite" && !cutAway(h.object);
      });
  var p = hits.length ? hits[0].point : pointerGround(cx, cy);
  if (!p) return;
  set_tgtTween({
    t: 0,
    dur: 320,
    x0: tgt.x, y0: tgt.y, z0: tgt.z,
    x1: p.x, y1: clamp(p.y, 0, 1400), z1: p.z,
    r0: radius,
    r1: clamp(Math.min(radius, Math.max(220, radius * 0.6)), 180, 4000),
  });
  set_userMoved(true);
  set_needsRender(true);
}

export function isEdit3D() {
  return !!S.edit3D;
}
export function toggleEdit3D(on) {
  if (!ready3D) return false;
  S.edit3D = on == null ? !S.edit3D : !!on;
  if (S.edit3D) {
    if (!editMod)
      import("../interaction.js").then(function (m) {
        set_editMod(m);
      });
  } else set_editDrag(null);
  updateSeeThrough(); // hide/restore the near-side walls for the new mode
  if (renderer) renderer.domElement.style.cursor = S.edit3D ? "move" : "";
  return S.edit3D;
}
/* What a picked mesh belongs to. Furniture groups carry userData.item, opening
   holders carry userData.opening and wall groups carry userData.wall; a pick can
   land on any descendant of one, so walk up to the first tagged ancestor.
   The wall itself is NOT draggable — its geometry only ever gets in the way of
   the piece behind it — so a hit that resolves to bare wall is reported as such
   and skipped, letting the ray carry on to whatever stands behind the wall.

   Two more things get the same treatment, and for the same reason — returning
   null lets the caller's loop walk on to the next hit instead of stopping on
   something it cannot act on:

   - a rank-Infinity item or opening. Its root is already left out of the
     raycast (pickableRoots), so this is belt and braces rather than the only
     guard; it keeps targetOf honest on its own terms, for the day a second
     caller hands it a mesh from somewhere else.
   - a LOCKED opening. The lock is per-object, not per-layer, so no root-level
     filter can see it; and a pinned window that merely refused to move would
     shadow the sideboard standing in front of it. */
function targetOf(obj) {
  for (var o = obj; o; o = o.parent) {
    if (!o.userData) continue;
    if (o.userData.item)
      return layerRank("furniture") === Infinity || itemUserUnpickable(o.userData.item)
        ? null
        : { kind: "item", ref: o.userData.item };
    if (o.userData.opening) {
      if (layerRank("structure") === Infinity || o.userData.opening.locked) return null;
      return { kind: "opening", ref: o.userData.opening };
    }
    if (o.userData.wall) return { kind: "wall", ref: o.userData.wall };
  }
  return null;
}
/* Everything the 3D edit mode can grab: pieces and openings, never walls, and
   never gated on whether the thing is the FIRST surface under the cursor — the
   ray keeps going past walls, so a sofa behind a wall drags from any angle.

   Two passes, not one, and this is the 3D half of the TV-against-the-wall bug.
   The rank-0 layers are tested alone first, so a piece of furniture wins the
   pick outright over a wall that is nearer the camera; only when every focused
   layer misses does the rank-1 pass run. Depth order still decides WITHIN a
   pass, which is why each pass is its own distance-sorted raycast rather than
   one call whose results get re-sorted afterwards.

   The rank of the winning pass rides along on the result: a rank-1 hit is a
   legitimate answer to "what is under the cursor" but must never start a drag
   (see editDown), mirroring the 2D rule. */
function pickEditTarget(cx, cy) {
  if (!dyn) return null;
  var ray = pointerRay(cx, cy);
  for (var rank = 0; rank <= 1; rank++) {
    var roots = pickableRoots(rank);
    if (!roots.length) continue;
    var hits = ray.intersectObjects(roots, true);
    for (var i = 0; i < hits.length; i++) {
      var h = hits[i];
      if (h.object.type === "Sprite" || cutAway(h.object)) continue;
      var t = targetOf(h.object);
      if (!t || t.kind === "wall") continue;
      return { kind: t.kind, ref: t.ref, point: h.point, rank: rank };
    }
  }
  return null;
}
// world cm per screen pixel at a given distance — the scale an Alt-drag needs
// so the piece tracks the cursor instead of shooting off. pxScale() is the
// same formula at the orbit target's distance; rescale it to the grab point.
function pxScaleAt(dist) {
  return pxScale() * (dist / Math.max(1, radius));
}
// where the pointer ray meets a horizontal plane at height y
function rayAtHeight(cx, cy, y) {
  var ray = pointerRay(cx, cy);
  if (!navPlane) set_navPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0));
  navPlane.constant = -y;
  if (!navHit) set_navHit(new THREE.Vector3());
  var p = ray.ray.intersectPlane(navPlane, navHit);
  return p && isFinite(p.x) && isFinite(p.z) ? { x: p.x, z: p.z } : null;
}
// mousedown in edit mode: returns true when a piece was grabbed (and the
// orbit must therefore stay out of this drag)
function editDown(e) {
  if (!S.edit3D || walk || extTick || e.button !== 0 || e.shiftKey) return false;
  var hit = pickEditTarget(e.clientX, e.clientY);
  if (!hit || !editMod) return false;
  /* A rank-1 hit is off the work set: it answered "what is under the cursor"
     and is allowed to, but it must not start a gesture. Declining here rather
     than in pickEditTarget is what lets the orbit have the press instead —
     dragging the camera is the more useful thing to do with a click on
     something you are not currently editing. The event is the same one the 2D
     hit chain fires so a single piece of UI can explain both refusals. */
  if (hit.rank !== 0) {
    /* Select it anyway. Refusing the DRAG is the rule; refusing to say what
       was clicked is not, and 2D has always filled the inspector from a
       rank-1 hit. Without this the 3D pane goes dead for anything structural
       under the boot work set — the click does nothing a user can see. */
    if (editMod && editMod.select3DTarget)
      editMod.select3DTarget({ kind: hit.kind, ref: hit.ref });
    window.dispatchEvent(
      /* Same detail shape the 2D chain emits (js/interaction.js blockedDrag),
         so one pill can read both: `sel` is the selection that was refused,
         `layer` its layer id, `reason` the gate that failed — here always
         "rank", since editDown only reaches this branch for a non-zero rank.
         `where` is the extra field 3D adds, so the UI can place the pill in
         the right pane. */
      new CustomEvent("layers:blocked-drag", {
        detail: {
          sel: { kind: hit.kind, ref: hit.ref },
          layer: layerOf(hit.kind),
          reason: "rank",
          where: "3d",
        },
      }),
    );
    return false;
  }
  // grab on the horizontal plane through the point actually clicked, so the
  // thing does not jump when you grab it by its top
  var gy = hit.point.y,
    g = rayAtHeight(e.clientX, e.clientY, gy);
  if (!g) return false;
  if (hit.kind === "opening") {
    if (!editMod.begin3DOpeningDrag || !editMod.begin3DOpeningDrag(hit.ref)) return false;
    var s0 = editMod.opening3DPos(hit.ref, g.x, g.z);
    if (s0 == null) return false;
    set_editDrag({ kind: "opening", ref: hit.ref, gy: gy, offS: hit.ref.s - s0 });
    set_needsRender(true);
    return true;
  }
  var it = hit.ref;
  if (!editMod.begin3DItemDrag(it)) return false;
  set_editDrag({
    kind: "item",
    it: it,
    gy: gy,
    off: { x: it.x - g.x, z: it.z - g.z },
    // Alt = raise/lower instead of slide, decided per drag at pointer-down
    vert: !!e.altKey,
    y0: e.clientY,
    elev0: fin(it.elev) ? it.elev : 0,
    scale: pxScaleAt(hit.point.distanceTo(camera.position)),
  });
  set_needsRender(true);
  return true;
}
function editMove(e) {
  if (!editDrag) return;
  var d = editDrag;
  if (d.kind === "opening") {
    var p = rayAtHeight(e.clientX, e.clientY, d.gy);
    if (!p) return;
    editMod.drag3DOpeningTo(d.ref, p.x, p.z, d.offS);
    set_needsRender(true);
    return;
  }
  if (d.vert) {
    editMod.drag3DItemElev(d.it, d.elev0 + (d.y0 - e.clientY) * d.scale);
  } else {
    var g = rayAtHeight(e.clientX, e.clientY, d.gy);
    if (!g) return;
    editMod.drag3DItemTo(d.it, g.x + d.off.x, g.z + d.off.z);
  }
  set_needsRender(true);
}
function editUp() {
  if (!editDrag) return;
  var wasOpening = editDrag.kind === "opening";
  set_editDrag(null);
  if (editMod) {
    if (wasOpening) editMod.end3DOpeningDrag();
    else editMod.end3DItemDrag();
  }
  set_needsRender(true);
}

// map a physical key to a navigation action (layout independent, so it works
// on a Hebrew keyboard too)
function navCode(e) {
  switch (e.code) {
    case "ArrowUp": return "fwd";
    case "ArrowDown": return "back";
    case "ArrowLeft": return "left";
    case "ArrowRight": return "right";
    case "KeyW": return "fwd";
    case "KeyS": return "back";
    case "KeyA": return "left";
    case "KeyD": return "right";
    case "KeyE": case "PageUp": return "up";
    case "KeyQ": case "PageDown": return "down";
    case "Equal": case "NumpadAdd": return "in";
    case "Minus": case "NumpadSubtract": return "out";
  }
  return null;
}
// per-frame keyboard movement. Speed scales with the zoom level, so the view
// crawls when you are inside a cupboard and sweeps when you are above the plot.
function navTick(dt) {
  var f = navKeys.fwd ? 1 : 0,
    b = navKeys.back ? 1 : 0,
    l = navKeys.left ? 1 : 0,
    r = navKeys.right ? 1 : 0,
    u = navKeys.up ? 1 : 0,
    d = navKeys.down ? 1 : 0,
    zi = navKeys.in ? 1 : 0,
    zo = navKeys.out ? 1 : 0;
  if (!(f || b || l || r || u || d || zi || zo)) return false;
  var s = radius * 0.9 * (navKeys.fast ? 2.4 : 1) * Math.min(dt, 64) / 1000;
  if (f || b || l || r) {
    navBasis();
    // move along the ground, not along the tilted view axis — otherwise
    // "forward" dives into the floor
    var fx = navFwd.x, fz = navFwd.z, fl = Math.hypot(fx, fz) || 1;
    tgt.x += ((fx / fl) * (f - b) + navRight.x * (r - l)) * s;
    tgt.z += ((fz / fl) * (f - b) + navRight.z * (r - l)) * s;
  }
  if (u || d) tgt.y += (u - d) * s * 0.6;
  if (zi || zo) {
    set_radius(radius * (1 + (zo - zi) * 0.9 * (Math.min(dt, 64) / 1000)));
    cR();
  }
  clampTarget();
  set_tgtTween(null);
  upd();
  return true;
}

export {
  editDown, editMove, editUp, focusAt, navCode, navTick, rayAtHeight,
  targetOf,
};
