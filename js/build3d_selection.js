/* The 3D pane's selection bar (FURNITURE_PLACEMENT_PLAN.md 4d): with one
   piece selected and no tool armed, js/build3d_ui.js's strip carries the work
   controls around it — Rotate 90°, Flip, [On wall], Duplicate, Delete,
   Design — and a note that a drag moves it. The planner's own actions do the
   work (js/ui/run_action.js runAction); only Flip is local (a half turn of a
   free piece, one undo step). Which buttons show is pure
   (js/build3d_input.js selectionBar).

   SLOT — "On wall": the button for the planner action `itemOnWall`
   (js/ui/selection_actions.js, added with Stage 3) is built here already and
   stays hidden until that action's name is in RUN_SELECTION_ACTIONS; it then
   shows pressed while the piece's hold says onWall.

   With the cabinet designer docked beside the room (body.cab-docked) the
   pane keeps its full size under the designer, so the strip and the hint chip
   are re-centred over the part of the pane left uncovered (--b3d-cx /
   --b3d-bottom set on the pane while docked). */
import { S } from "./state.js";
import { onLangChange } from "./i18n.js";
import { fitText } from "./fit_cabinet_strings.js";
import { wallPlaneText } from "./wall_plane_strings.js";
import { pushHistory } from "./history.js";
import { render2D } from "./plan2d.js";
import { requestRender } from "./view3d.js";
import { fillProps, turnItem } from "./ui.js";

export const ON_WALL_ACTION = "itemOnWall";
const SEL_BUTTONS = [
  // [key, icon, planner action (null: local), label key, tooltip key]
  ["rotate", "ph-arrow-clockwise", "rotSel90", "rotate", "rotateTip"],
  ["flip", "ph-arrows-left-right", null, "flip", "flipTip"],
  ["onWall", "ph-frame-corners", ON_WALL_ACTION, "onWall", "onWallTip"], // the On wall slot
  ["dup", "ph-copy", "dupSel", "dup", "dup"],
  ["del", "ph-trash", "deleteSel", "del", "del"],
];
const selButtons = {};
let selNote = null, onWallReady = false, selPane = null;

export function selectionOnWallReady() { return onWallReady; }

function flipSelected() {
  const it = S.sel && S.sel.kind === "item" ? S.sel.ref : null;
  if (!it || it.locked || it.hold || it.fit) return;
  pushHistory();
  turnItem(it, (((it.rot || 0) + 180) % 360 + 360) % 360);
  S.dirty3D = true;
  fillProps();
  render2D();
  requestRender();
}
function runSel(act) {
  if (!act) { flipSelected(); return; }
  import("./ui/run_action.js").then((m) => m.runAction(act)).then(() => { render2D(); requestRender(); });
}

/** Build the buttons into `strip`, before `before` (the Design button).
 *  makeButton(cls, icon) and label(b, text, title) are build3d_ui.js's. */
export function initSelectionBar(strip, before, makeButton, label, onChange) {
  for (const [key, icon, act, text, tip] of SEL_BUTTONS) {
    const b = makeButton("b3d-sel b3d-sel-" + key, icon);
    b.hidden = true;
    b.onclick = () => runSel(act);
    b.addEventListener("pointerdown", (e) => e.stopPropagation());
    b.dataset.text = text;
    b.dataset.tip = tip;
    selButtons[key] = b;
    strip.insertBefore(b, before);
  }
  selNote = document.createElement("span");
  selNote.className = "b3d-sel-note";
  selNote.hidden = true;
  strip.append(selNote);
  const relabel = () => {
    for (const b of Object.values(selButtons)) label(b, fitText(b.dataset.text), fitText(b.dataset.tip));
    selNote.textContent = fitText("dragNote");
  };
  relabel();
  onLangChange(relabel);
  // the On wall slot fills once its action exists
  import("./ui/selection_actions.js").then((m) => {
    onWallReady = !!(m.RUN_SELECTION_ACTIONS && m.RUN_SELECTION_ACTIONS.has(ON_WALL_ACTION));
    if (onWallReady && onChange) onChange();
  }).catch(() => {});
  selPane = strip.parentElement;
  if (typeof MutationObserver !== "undefined")
    new MutationObserver(placeBesideDesigner).observe(document.body, { attributes: true, attributeFilter: ["class"] });
  window.addEventListener("resize", placeBesideDesigner);
}

/** Show the buttons `bar` (js/build3d_input.js selectionBar) asks for. */
export function syncSelectionBar(bar) {
  for (const [key] of SEL_BUTTONS) {
    const b = selButtons[key];
    if (!b) continue;
    const on = !!(bar && bar[key]);
    if (b.hidden === on) b.hidden = !on;
  }
  const ow = selButtons.onWall;
  if (ow) {
    // a type that always hangs: pressed, disabled, and says why
    const fixed = !!(bar && bar.onWallFixed), tip = fixed ? wallPlaneText("alwaysOnWall") : fitText(ow.dataset.tip);
    ow.setAttribute("aria-pressed", String(!!(bar && bar.onWallOn)));
    if (ow.disabled !== fixed) ow.disabled = fixed;
    if (ow.title !== tip) ow.title = tip;
  }
  if (selNote && selNote.hidden === !!(bar && bar.note)) selNote.hidden = !(bar && bar.note);
}

/* The docked designer covers one side of the pane (js/ui_cabinet_dock.js). */
function placeBesideDesigner() {
  const pane = selPane, cab = document.getElementById("cabdes");
  if (!pane) return;
  if (!document.body.classList.contains("cab-docked") || !cab) {
    pane.style.removeProperty("--b3d-cx");
    pane.style.removeProperty("--b3d-bottom");
    return;
  }
  const a = pane.getBoundingClientRect(), c = cab.getBoundingClientRect();
  if (!a.width || !c.width) return;
  if (cab.dataset.dock === "right") {
    const right = Math.min(a.right, c.left);
    pane.style.setProperty("--b3d-cx", Math.max(0, Math.round((right - a.left) / 2)) + "px");
    pane.style.removeProperty("--b3d-bottom");
  } else {
    // the designer covers the pane's foot: the stack stands on its top edge
    pane.style.removeProperty("--b3d-cx");
    pane.style.setProperty("--b3d-bottom", Math.max(0, Math.round(a.bottom - c.top)) + 12 + "px");
  }
}
