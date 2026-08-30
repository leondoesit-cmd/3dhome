/* The parts of the custom-model surface that do NOT need the editor.
 *
 * js/modeler.js is 830 KB of CAD editor that most sessions never open, but it
 * used to be on the eager boot graph purely because four small functions lived
 * inside it — and because its module body ends with a top-level
 * `await initializeModelLibrary()` that blocks the whole graph on an IndexedDB
 * read before main.js can run.
 *
 * Two of those four only ever touch FURN, CATALOG and the DOM, so they live
 * here instead: boot and the save/load paths import this 2 KB module, and the
 * editor is fetched on demand (see js/modeler_launch.js). registerCustomModel()
 * stays in modeler.js — it needs the part→geometry builder, which is the bulk
 * of the file and cannot be meaningfully separated from it.
 */
import { FURN, CATALOG } from "./furniture.js";

/* The custom definitions a scene actually uses, so an exported project is
   self-contained. With the editor unloaded FURN simply holds no customs and
   this correctly returns []. */
export function usedCustomModels(items) {
  var out = [], seen = {};
  (items || []).forEach(function (it) {
    var f = FURN[it.type];
    if (f && f.custom && !seen[it.type]) { seen[it.type] = 1; out.push(f.custom); }
  });
  return out;
}

export function refreshCatalogSelect() {
  // keep the CATALOG "custom" category (grid UI) in sync with registered models
  var cat = (CATALOG || []).find(function (c) { return c.id === "custom"; });
  if (cat && cat.sub && cat.sub[0]) {
    var items = cat.sub[0].items;
    items.length = 0;
    for (var kk in FURN) if (FURN[kk].custom) items.push(kk);
  }
  var sel = document.getElementById("furnsel");
  if (sel) {
    var cur = sel.value;
    sel.innerHTML = "";
    for (var k in FURN) {
      var o = document.createElement("option");
      o.value = k;
      o.textContent = FURN[k].custom ? "★ " + FURN[k].label : (FURN[k].label || k);
      sel.appendChild(o);
    }
    if (cur && FURN[cur]) sel.value = cur;
  }
  window.dispatchEvent(new Event('catalogUpdated'));
}
