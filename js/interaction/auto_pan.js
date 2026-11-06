/* The plan view's edge auto-pan while dragging, lifted out of initInteraction,
   split out of js/interaction.js. It shares the editor's state through live
   imports from ../interaction.js. */
import { canWeld, enforceLocks, snapshotNodes } from "../constraint_engine.js";
import { wallGeom, wallProject } from "../geometry.js";
import { weldNodes } from "../interaction/layout_drag.js";
import { apActive, apAxis } from "../interaction/pointer_down.js";
import { splitWallAt } from "../interaction/wall_edit.js";
import { render2D } from "../plan2d.js";
import { planRotRad } from "../planner_input.js";
import { S, clamp, fin } from "../state.js";
import { solveWallCons } from "../wall_constraints.js";
import { interactionLocals } from "../interaction.js";

function apStep(now) {
  interactionLocals.apRAF = 0;
  if (!interactionLocals.apPtr || !apActive() || !(S.CW > 0 && S.CH > 0)) return;
  var dpx = apAxis(interactionLocals.apPtr.x, S.CW),
    dpy = apAxis(interactionLocals.apPtr.y, S.CH);
  if (!dpx && !dpy) return;
  // ease in over AP_RAMP ms so a momentary brush past the edge nudges the
  // view instead of throwing it, and scale by real elapsed time so the speed
  // doesn't depend on the frame rate
  var ramp = 0.25 + 0.75 * clamp((now - interactionLocals.apT0) / interactionLocals.AP_RAMP, 0, 1);
  var dt = clamp((now - interactionLocals.apLast) / 16.7, 0.5, 2);
  interactionLocals.apLast = now;
  dpx *= ramp * dt;
  dpy *= ramp * dt;
  // the shift is in screen space; the stored offset lives in the base frame
  var pa = -planRotRad();
  S.OX -= dpx * Math.cos(pa) - dpy * Math.sin(pa);
  S.OY -= dpx * Math.sin(pa) + dpy * Math.cos(pa);
  // replay the pointer so the drag/preview follows the scrolled view
  (0, interactionLocals.planMove)({ offsetX: interactionLocals.apPtr.x, offsetY: interactionLocals.apPtr.y, pointerType: "mouse" });
  render2D();
  interactionLocals.apRAF = requestAnimationFrame(apStep);
}
function autoPanFrom(e) {
  interactionLocals.apPtr = { x: e.offsetX, y: e.offsetY };
  if (!interactionLocals.apRAF && apActive() && (apAxis(interactionLocals.apPtr.x, S.CW) || apAxis(interactionLocals.apPtr.y, S.CH))) {
    // each time the cursor re-enters the band the ramp starts over
    interactionLocals.apT0 = interactionLocals.apLast = performance.now();
    interactionLocals.apRAF = requestAnimationFrame(apStep);
  }
}
function stopAutoPan() {
  if (interactionLocals.apRAF) cancelAnimationFrame(interactionLocals.apRAF);
  interactionLocals.apRAF = 0;
  interactionLocals.apPtr = null;
}

  /* The constraint pass that runs sixty times a second, as opposed to the one
     that runs when a gesture lands. Two differences, both deliberate:

       - it solves only the constraints reachable from the corners being
         dragged. Re-relaxing every dimension in the drawing on every mouse
         move is work whose result is thrown away a sixteenth of a second
         later, and on a large plan it is what makes a drag feel heavy.
       - Alt suppresses it entirely (S.conOverride), so a corner can be pulled
         somewhere a dimension forbids without first dismantling the dimension.
         The full solve at endAction still runs, so letting go snaps the plan
         back to what it says — the override is for the gesture, not a way to
         quietly leave the drawing contradicting itself. */
function dragSolve(nodes) {
  if (S.conOverride) return { passes: 0, moved: 0, unresolved: 0 };
  return solveWallCons({
    nodes: (nodes || []).filter(function (n) { return n != null; }),
  });
}

  /* Finish a corner that was dragged onto a wall: split the host where the
     corner has come to rest and merge the two into one shared joint. Called
     once, from the end of the gesture — see the note in the drag handler about
     why doing it per frame tore the host wall to pieces. Returns whichever
     corner index survives, which is the one the drag now owns. */
function landNodeOnWall(ni, host, active) {
  var n = S.nodes[ni];
  if (!host || !n || host.a === ni || host.b === ni) return ni;
  var g = wallGeom(host),
    pr = wallProject(host, n.x, n.z);
  if (!pr || !fin(pr.s) || pr.s <= 1 || pr.s >= g.L - 1) return ni;
  var before = snapshotNodes(),
    mid = splitWallAt(host, pr.s);
  S.nodes[ni].x = S.nodes[mid].x;
  S.nodes[ni].z = S.nodes[mid].z;
  S.jointsReleased += enforceLocks(before, active);
  (0, interactionLocals.dragSolve)([ni, mid]);
  if (!canWeld(mid, ni, active)) return ni;
  weldNodes(mid, ni);
  return mid;
}

export { autoPanFrom, dragSolve, landNodeOnWall, stopAutoPan };
