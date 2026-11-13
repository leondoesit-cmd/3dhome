/* Professional drawing dialog (pro ribbon → Drawings → Professional drawing):
   the construction sheet drawn to the project's regional drafting standard
   (js/drafting_standards.js), previewed live, then printed or downloaded.

   The standard is a project setting, S.workspace.draftingStandard (absent =
   automatic: follows the code-check jurisdiction), saved and undone with the
   rest of the workspace like S.workspace.codeProfile. Paper and scale are
   per-print choices and stay in the dialog. */
import { S } from "./state.js";
import { getLang, t } from "./i18n.js";
import { draftingStandard, draftingStandardIds, IMPERIAL_SCALE_LABELS } from "./drafting_standards.js";
import { draftText } from "./drafting_strings.js";
import { toConstructionSVG, currentDraftingStandard, downloadText } from "./exports_pro.js";
import { printSheetSVG, PAPER_SIZES } from "./sheet_print.js";
import { pushHistory } from "./history.js";

const AUTO = "auto";

function el(tag, text, cls) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  node.dir = "auto";
  return node;
}

function option(value, text) {
  const o = document.createElement("option");
  o.value = value;
  o.textContent = text;
  return o;
}

export function standardName(std, lang) {
  return (std && std.name && (std.name[lang] || std.name.en)) || "";
}

/* Scales offered for a standard: its own first, then coarser ones for a plan
   too big for them. US scales print as 1/4" = 1'-0". */
export function scaleChoices(std) {
  if (std.imperial) return [48, 96, 192].map((d) => ({ denom: d, label: IMPERIAL_SCALE_LABELS[d] }));
  const list = [...new Set(std.scales.concat([100, 200]))].sort((a, b) => a - b);
  return list.map((d) => ({ denom: d, label: "1:" + d }));
}

/* What the dialog would print, from its three choices. */
export function sheetFor(choice) {
  const opts = { standard: choice.standard };
  if (choice.paper && choice.paper !== AUTO) opts.paper = choice.paper;
  if (choice.scale && choice.scale !== AUTO) opts.scale = Number(choice.scale);
  return toConstructionSVG(opts);
}

export function openProDrawing() {
  document.getElementById("proDrawingDialog")?.remove();
  const lang = getLang();
  const dialog = document.createElement("dialog");
  dialog.id = "proDrawingDialog";
  dialog.className = "pro-dialog pro-drawing-dialog";
  dialog.appendChild(el("h2", draftText("pro_drawing_title")));

  const controls = el("div", null, "pro-drawing-controls");
  const stdSelect = document.createElement("select");
  stdSelect.id = "proDrawingStandard";
  // the standard for a pick: the same resolver the sheet actions use, so the
  // generic ISO profile still takes the project's detected drafting unit
  const resolve = (id) => currentDraftingStandard({ workspace: { ...(S.workspace || {}), draftingStandard: id === AUTO ? undefined : id } });
  const auto = resolve(AUTO);
  stdSelect.appendChild(option(AUTO, draftText("pro_drawing_auto", { name: standardName(auto, lang) })));
  draftingStandardIds().forEach((id) => stdSelect.appendChild(option(id, standardName(draftingStandard(id), lang))));
  const saved = S.workspace && S.workspace.draftingStandard;
  stdSelect.value = saved && draftingStandard(saved) ? saved : AUTO;

  const paperSelect = document.createElement("select");
  paperSelect.id = "proDrawingPaper";
  const scaleSelect = document.createElement("select");
  scaleSelect.id = "proDrawingScale";

  const label = (text, control) => { const l = el("label", text + " "); l.appendChild(control); return l; };
  controls.append(label(draftText("pro_drawing_standard"), stdSelect), label(draftText("pro_drawing_paper"), paperSelect), label(draftText("pro_drawing_scale"), scaleSelect));
  dialog.appendChild(controls);

  const preview = el("div", null, "pro-drawing-preview");
  preview.setAttribute("role", "img");
  preview.setAttribute("aria-label", draftText("pro_drawing_title"));
  dialog.appendChild(preview);
  const info = el("p", null, "pro-drawing-note");
  dialog.appendChild(info);
  const sources = el("details", null, "pro-drawing-sources");
  dialog.appendChild(sources);

  const standard = () => resolve(stdSelect.value);
  const fillChoices = () => {
    const std = standard();
    paperSelect.textContent = "";
    paperSelect.appendChild(option(AUTO, draftText("pro_drawing_best_fit")));
    std.papers.filter((p) => PAPER_SIZES[p]).forEach((p) => paperSelect.appendChild(option(p, p.replace(/^Arch/, "Arch "))));
    scaleSelect.textContent = "";
    scaleSelect.appendChild(option(AUTO, draftText("pro_drawing_best_fit")));
    scaleChoices(std).forEach((s) => scaleSelect.appendChild(option(String(s.denom), s.label)));
  };
  let svg = "";
  const render = () => {
    const std = standard();
    svg = sheetFor({ standard: std, paper: paperSelect.value, scale: scaleSelect.value });
    // our own markup: every text it carries went through the sheet's escaping
    preview.innerHTML = svg;
    info.textContent = draftText("pro_drawing_unverified");
    sources.textContent = "";
    sources.appendChild(el("summary", draftText("pro_drawing_sources")));
    std.sources.forEach((url) => {
      const link = document.createElement("a");
      link.href = url; link.target = "_blank"; link.rel = "noopener noreferrer";
      let text = url;
      try { text = decodeURIComponent(url); } catch (e) { text = url; }
      link.textContent = text.slice(0, 90);
      const line = el("div"); line.appendChild(link); sources.appendChild(line);
    });
    dialog.dataset.standard = std.id;
  };
  stdSelect.addEventListener("change", () => {
    // the standard belongs to the project: an undoable edit that also autosaves
    pushHistory(draftText("pro_drawing_standard"));
    if (stdSelect.value === AUTO) delete S.workspace.draftingStandard;
    else S.workspace.draftingStandard = stdSelect.value;
    fillChoices();
    render();
  });
  paperSelect.addEventListener("change", render);
  scaleSelect.addEventListener("change", render);

  const actions = el("div", null, "pro-drawing-actions");
  const button = (text, fn, primary) => {
    const b = el("button", text);
    b.type = primary ? "submit" : "button";
    b.addEventListener("click", (ev) => { ev.preventDefault(); fn(); });
    return b;
  };
  actions.append(
    button(draftText("pro_drawing_print"), () => printSheetSVG(svg, t("sheet_floor_plan")), true),
    button(draftText("pro_drawing_download"), () => downloadText("home3d-drawing-" + standard().id + ".svg", svg, "image/svg+xml")),
    button(draftText("pro_drawing_close"), () => dialog.close()),
  );
  dialog.appendChild(actions);

  fillChoices();
  render();
  dialog.addEventListener("close", () => dialog.remove(), { once: true });
  document.body.appendChild(dialog);
  dialog.showModal();
  return dialog;
}
