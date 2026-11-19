/* The 3D backdrop (Site / Studio) and Soft light controls beside the sun
   hour slider. The look itself is js/view3d/backdrop.js; the choice is stored
   on the document's workspace so a project opens the way it was presented. */
import { S } from "../state.js";
import { markDirty } from "../persist.js";
import { applyEnv, applySite } from "../view3d.js";
import { backdropMode, softLightOn } from "../view3d/backdrop.js";

function ws() {
  if (!S.workspace) S.workspace = {};
  return S.workspace;
}

// put the two controls back on the document's values (file load, new plan)
export function syncBackdropUI() {
  var sel = document.getElementById("backdropsel"), soft = document.getElementById("cb_softlight");
  if (sel) sel.value = backdropMode(S.workspace);
  if (soft) soft.checked = softLightOn(S.workspace);
}

export function wireBackdropControls() {
  var sel = document.getElementById("backdropsel"), soft = document.getElementById("cb_softlight");
  if (sel)
    sel.addEventListener("change", function () {
      ws().backdrop = this.value === "studio" ? "studio" : "site";
      applyEnv(); // runs applySite() too: grass, sky dome and studio floor
      applySite();
      markDirty();
    });
  if (soft)
    soft.addEventListener("change", function () {
      ws().softLight = !!this.checked;
      applyEnv();
      markDirty();
    });
  syncBackdropUI();
}
