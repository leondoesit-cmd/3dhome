/* The item inspector's "Kept distances": the selected piece's kept distances
   (js/item_keep_edit.js), each with what it is kept to, its value and an
   Unlock button. Filled from js/ui_props/cons.js fillProps' item branch;
   hidden when the piece keeps none. */
import { fmtLen } from "../display_units.js";
import { distanceText, num as ltrNum } from "../distance_strings.js";
import { keepItem, keepScene } from "../item_keep_scene.js";
import { keepName, removeKeep } from "../item_keep_edit.js";
import { keepStates } from "../item_keep_plan.js";
import { KEEP_BAD, KEEP_OK } from "../keep_paint.js";

function keepsBox() {
  var host = document.getElementById("itemProps");
  if (!host) return null;
  var el = document.getElementById("itemKeeps");
  if (!el) {
    el = document.createElement("div");
    el.id = "itemKeeps";
    el.className = "item-keeps";
    host.append(el);
  }
  return el;
}

export function fillKeeps(it) {
  var el = typeof document !== "undefined" ? keepsBox() : null;
  if (!el) return;
  el.textContent = "";
  var list = it && Array.isArray(it.keep) && it.keep.length ? keepStates(it.keep, keepItem(it), keepScene()) : [];
  el.hidden = !list.length;
  if (!list.length) return;
  var head = document.createElement("div");
  head.className = "item-keeps-head";
  head.textContent = distanceText("kept");
  head.title = distanceText("keptTip");
  el.append(head);
  list.forEach(function (s) {
    var row = document.createElement("div"), what = document.createElement("span"), val = document.createElement("span"), btn = document.createElement("button");
    row.className = "item-keeps-row";
    row.style.setProperty("--keep-col", s.ok ? KEEP_OK : KEEP_BAD);
    what.className = "item-keeps-what";
    what.setAttribute("dir", "auto");
    what.textContent = (s.keep.axis === "y" ? (s.keep.sign > 0 ? "↑ " : "↓ ") : "") + keepName(s.keep);
    val.className = "item-keeps-val";
    val.textContent = ltrNum(fmtLen(s.keep.value, { domain: "furniture" }));
    btn.type = "button";
    btn.className = "item-keeps-unlock";
    btn.title = distanceText("unlock");
    btn.setAttribute("aria-label", distanceText("unlock") + " " + keepName(s.keep));
    var icon = document.createElement("i");
    icon.className = "ph ph-lock-open";
    btn.append(icon);
    btn.onclick = function () { removeKeep(it, s.index); };
    row.append(what, val, btn);
    el.append(row);
  });
}
