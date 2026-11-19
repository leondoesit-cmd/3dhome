/* The title block's fields, edited from the Drawing view's toolbar (js/
   ui_pro_drawing.js): project, address, client, designer, drawing title and
   the revision list. Saved in S.workspace.sheetInfo, so they undo, autosave
   and travel with the project like S.workspace.draftingStandard; read back
   by js/exports_pro.js sheetInfo() for js/drawing_sheet/sheet_frame.js. */
import { S } from "./state.js";
import { pushHistory } from "./history.js";
import { draftText } from "./drafting_strings.js";
import { SHEET_INFO_FIELDS, editSheetInfo } from "./drawing_sheet/sheet_frame.js";

function commit(edit, rerender) {
  pushHistory(draftText("pro_drawing_info"));
  if (!S.workspace) S.workspace = {};
  S.workspace.sheetInfo = editSheetInfo(S.workspace.sheetInfo, edit);
  rerender();
}

export function openSheetInfo(anchor, rerender) {
  const host = anchor && anchor.closest("#view-sheet");
  if (!host) return null;
  const old = host.querySelector(".sheet-info-pop");
  if (old) { old.remove(); return null; }
  const info = (S.workspace && S.workspace.sheetInfo) || {};
  const pop = document.createElement("div");
  pop.className = "sheet-info-pop";
  pop.setAttribute("role", "dialog");
  pop.setAttribute("aria-label", draftText("pro_drawing_info"));
  pop.dir = "auto";
  const heading = document.createElement("h3");
  heading.textContent = draftText("pro_drawing_info");
  pop.appendChild(heading);
  SHEET_INFO_FIELDS.forEach((field) => {
    const label = document.createElement("label");
    const span = document.createElement("span");
    span.textContent = draftText("sheet_tb_" + field);
    const input = document.createElement("input");
    input.type = "text";
    input.dir = "auto";
    input.dataset.field = field;
    input.value = info[field] || "";
    if (field === "project" && !input.value) input.placeholder = (S.workspace && S.workspace.name) || "";
    input.addEventListener("change", () => commit({ field, value: input.value }, rerender));
    label.append(span, input);
    pop.appendChild(label);
  });
  const revRow = document.createElement("div");
  revRow.className = "sheet-info-rev";
  const note = document.createElement("input");
  note.type = "text";
  note.dir = "auto";
  note.placeholder = draftText("pro_drawing_rev_note");
  const add = document.createElement("button");
  add.type = "button";
  add.textContent = draftText("pro_drawing_add_rev");
  add.addEventListener("click", () => { commit({ revision: { note: note.value } }, rerender); note.value = ""; });
  revRow.append(note, add);
  pop.appendChild(revRow);
  host.appendChild(pop);
  const close = (e) => {
    if (e.type === "keydown" ? e.key === "Escape" : !pop.contains(e.target) && e.target !== anchor && !anchor.contains(e.target)) {
      pop.remove();
      document.removeEventListener("pointerdown", close, true);
      document.removeEventListener("keydown", close, true);
    }
  };
  document.addEventListener("pointerdown", close, true);
  document.addEventListener("keydown", close, true);
  pop.querySelector("input").focus();
  return pop;
}
