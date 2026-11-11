/* Commands the pro catalog binds as `pro:<name>`: features that already exist
 * in the app but had no command of their own (they lived inside the Workspace
 * dialog or ran only as automatic checks). Each is a thin call into the real
 * implementation. */
import { downloadText, toSVG, toDXF, toIFC, toScheduleCSV, toConstructionSVG } from "./exports_pro.js";
import { printSheetSVG } from "./sheet_print.js";
import { checkSwingConflicts } from "./swing_clearance.js";
import { t } from "./i18n.js";
import { openHistoryPop } from "./history_pop.js";
import { showLeftTab } from "./pro_left.js";
import { S } from "./state.js";
import { detectRooms, wallGeom } from "./geometry.js";
import { activeFloorArea } from "./area_snapshot.js";
import { currentRoomFit } from "./ui_layout_tools.js";
import { floorAbove } from "./floors.js";
import { pushHistory } from "./history.js";
import { render2D } from "./plan2d.js";
import { roofFromWalls } from "./roof.js";
import { attach as stackAttach, wouldCycle as stackWouldCycle, reseat as stackReseat } from "./stack.js";
import { sectionDrawingSVG } from "./section_drawing.js";
import { mkItem } from "./furniture_api.js";
import { makeSpec, defaultPreset, cabRun, STD } from "./cabinet.js";
import { SHEETS, PROFILES } from "./stock.js";
import { refreshTree, updateCost } from "./ui_tree.js";
import { select } from "./ui_props.js";
import { itemPlaceCommand, executeCommand } from "./commands/index.js";
import { togglePartCodes } from "./part_code_labels.js";

function commitCabinetItems(items) {
  for (const item of items) {
    const result = executeCommand(itemPlaceCommand, { type: item.type, x: item.x, z: item.z, rot: item.rot }, {
      domain: "planner", state: S,
      itemCatalog: { [item.type]: { w: item.w, d: item.d, h: item.h } },
      services: { createItem: () => item },
    }, { history: false });
    if (!result.ok) throw new Error(`Could not place cabinet: ${result.reason}`);
  }
}

function proForm(id, title, fields, apply) {
  document.getElementById(id)?.remove();
  const dialog = document.createElement("dialog"); dialog.id = id;
  dialog.className = "pro-dialog";
  const form = document.createElement("form"); form.method = "dialog";
  const heading = document.createElement("h2"); heading.textContent = title; form.appendChild(heading);
  const controls = {};
  for (const field of fields) {
    const row = document.createElement("label"); row.style.cssText = "display:grid;gap:.25rem;margin:.6rem 0"; row.append(field.label);
    const input = document.createElement(field.options ? "select" : "input");
    if (field.options) for (const [value, label] of field.options) { const option = document.createElement("option"); option.value = value; option.textContent = label; input.appendChild(option); }
    else { input.type = field.type || "number"; if (field.min != null) input.min = field.min; if (field.max != null) input.max = field.max; input.step = field.step || "1"; input.required = true; }
    input.value = String(field.value ?? ""); row.appendChild(input); form.appendChild(row); controls[field.key] = input;
  }
  const status = document.createElement("p"); status.setAttribute("role", "status"); form.appendChild(status);
  const submit = document.createElement("button"); submit.type = "submit"; submit.textContent = t("pro_apply"); form.appendChild(submit);
  const cancel = document.createElement("button"); cancel.type = "button"; cancel.textContent = t("cancel"); cancel.onclick = () => dialog.close(); form.appendChild(cancel);
  form.onsubmit = event => { event.preventDefault(); try { const error = apply(Object.fromEntries(Object.entries(controls).map(([key, input]) => [key, input.value]))); if (error) { status.textContent = error; return; } dialog.close(); } catch (error) { status.textContent = error.message; } };
  dialog.appendChild(form); dialog.addEventListener("close", () => dialog.remove(), { once: true }); document.body.appendChild(dialog); dialog.showModal();
}

function openCabRun() {
  const selected = S.sel?.kind === "item" && S.sel.ref?.cab?.fam === "kitchenBase" ? S.sel.ref : null;
  if (selected) {
    const run = cabRun(selected, S.items);
    const group = S.items.filter(item => item.cab && cabRun(item, S.items).key === run.key)
      .sort((a, b) => cabRun(a, S.items).i - cabRun(b, S.items).i);
    const first = group[0], rot = Number(first.rot) || 0, radians = rot * Math.PI / 180;
    const ux = Math.cos(radians), uz = Math.sin(radians);
    const startX = first.x - ux * first.w / 2, startZ = first.z - uz * first.w / 2;
    proForm("proCabRun", "Edit kitchen run", [
      { key: "count", label: "Base units", value: group.length, min: 1, max: 30 },
      { key: "width", label: "Unit width (cm)", value: first.w, min: 30, max: 120 },
      { key: "depth", label: "Unit depth (cm)", value: first.d, min: 35, max: 90 },
      { key: "height", label: "Finished height (cm)", value: first.h, min: 60, max: 120 },
    ], v => {
      if (!group.every(item => S.items.includes(item))) return "The run changed. Select a cabinet again.";
      const count = Number(v.count), width = Number(v.width), depth = Number(v.depth), height = Number(v.height);
      if (![count,width,depth,height].every(Number.isFinite) || count % 1 || count < 1 || count > 30 || width < 30 || width > 120 || depth < 35 || depth > 90 || height < 60 || height > 120) return "Enter valid unit dimensions and a count from 1 to 30.";
      const oldCutouts = first.cab.worktopCutouts || [];
      if (oldCutouts.some(hole => hole.x0 < 3 || hole.x1 > count * width - 3 || hole.z0 < -depth / 2 + 3 || hole.z1 > depth / 2 - 3)) return "The existing worktop cutout would be too close to an edge. Move or remove it before resizing this run.";
      pushHistory();
      const next = Array.from({length:count}, (_, i) => {
        const item = group[i] || mkItem("base", 0, 0, rot);
        const existingCab = item.cab;
        const previousCab = existingCab || first.cab;
        item.x = startX + ux * width * (i + .5); item.z = startZ + uz * width * (i + .5);
        item.rot = rot; item.w = width; item.d = depth; item.h = height;
        item.cab = makeSpec(previousCab.preset || defaultPreset("kitchenBase"), width, height, depth, previousCab);
        item.cab.top = previousCab.top ?? item.cab.top;
        if (existingCab?.productionOverrides) item.cab.productionOverrides = structuredClone(existingCab.productionOverrides);
        item.cab.worktopCutouts = oldCutouts.map(hole => ({...hole}));
        return item;
      });
      S.items = S.items.filter(item => !group.includes(item) || next.includes(item));
      commitCabinetItems(next.filter(item => !S.items.includes(item)));
      select({kind:"item",ref:next[0]}); S.dirty3D = true; render2D(); refreshTree(); updateCost();
    });
    return;
  }
  const wall = S.sel?.kind === "wall" ? S.sel.ref : null;
  if (!wall) { reportDialog("Kitchen run", ["Select a straight wall to place a run, or a kitchen base cabinet to edit its run."]); return; }
  const g = wallGeom(wall);
  if (g.kind === "arc" || g.L < 45) { reportDialog("Kitchen run", ["Choose a straight wall at least 45 cm long."]); return; }
  proForm("proCabRun", "Kitchen run along selected wall", [
    { key: "count", label: "Base units", value: Math.max(1, Math.min(5, Math.floor((g.L - 10) / 60))), min: 1, max: 30 },
    { key: "width", label: "Unit width (cm)", value: 60, min: 30, max: 120 },
    { key: "depth", label: "Unit depth (cm)", value: 60, min: 35, max: 90 },
    { key: "height", label: "Finished height (cm)", value: 90, min: 60, max: 120 },
    { key: "side", label: "Side of wall", value: "left", options: [["left", "Left of wall direction"], ["right", "Right of wall direction"]] },
    { key: "start", label: "Start inset (cm)", value: 5, min: 0, max: Math.ceil(g.L) },
  ], v => {
    if (!S.walls.includes(wall)) return "The selected wall is no longer in the plan.";
    const count = Number(v.count), width = Number(v.width), depth = Number(v.depth), height = Number(v.height), start = Number(v.start);
    if (![count, width, depth, height, start].every(Number.isFinite) || count % 1 || count < 1 || count > 30 || width < 30 || width > 120 || depth < 35 || depth > 90 || height < 60 || height > 120 || start < 0 || start + count * width > g.L - 2) return "The run does not fit on this wall with those dimensions.";
    const side = v.side === "right" ? -1 : 1;
    const rot = Math.atan2(g.uz, g.ux) * 180 / Math.PI + (side < 0 ? 180 : 0);
    const normalX = -g.uz * side, normalZ = g.ux * side;
    const offset = (Number(wall.thickness) || 12) / 2 + depth / 2 + 1;
    const units = Array.from({ length: count }, (_, i) => {
      const along = start + width * (i + .5);
      const item = mkItem("base", g.a.x + g.ux * along + normalX * offset, g.a.z + g.uz * along + normalZ * offset, rot);
      item.w = width; item.d = depth; item.h = height; item.cab = makeSpec(defaultPreset("kitchenBase"), width, height, depth);
      return item;
    });
    pushHistory(); commitCabinetItems(units); select({ kind: "item", ref: units[0] }); S.dirty3D = true; render2D(); refreshTree(); updateCost();
  });
}

function openCabWorktop() {
  const item = S.sel?.kind === "item" && S.sel.ref?.cab ? S.sel.ref : null;
  if (!item) { reportDialog("Worktop", ["Select a cabinet in the run first."]); return; }
  const run = cabRun(item, S.items);
  const group = S.items.filter(candidate => candidate.cab && cabRun(candidate, S.items).key === run.key).sort((a, b) => cabRun(a, S.items).i - cabRun(b, S.items).i);
  const first = group[0], oldCutouts = first.cab.worktopCutouts || [], existing = oldCutouts[0];
  const topSheets = SHEETS.filter(sheet => sheet.use.includes("top"));
  proForm("proCabWorktop", `Worktop across ${group.length} unit${group.length === 1 ? "" : "s"} (${run.span} cm)`, [
    { key: "thickness", label: "Top thickness (cm)", value: item.cab.top || 4, min: 1, max: 10, step: ".1" },
    { key: "stock", label: "Surface material", value: topSheets.some(sheet => sheet.id === item.cab.stock?.top) ? item.cab.stock.top : topSheets[0]?.id, options: topSheets.map(sheet => [sheet.id, sheet.en]) },
    { key: "profile", label: "Front edge profile", value: item.cab.profile || PROFILES[0]?.id, options: PROFILES.map(profile => [profile.id, profile.en]) },
    { key: "cutout", label: "Add or edit cutout", value: existing?.kind || "none", options: [["none", "Remove all cutouts"], ["sink", "Sink"], ["hob", "Hob"]] },
    { key: "offset", label: "Cutout centre from left end (cm)", value: existing ? (existing.x0 + existing.x1) / 2 : Math.round(run.span / 2), min: 0, max: Math.ceil(run.span) },
    { key: "cutwidth", label: "Cutout width (cm)", value: existing ? existing.x1 - existing.x0 : 50, min: 10, max: 150 },
    { key: "cutdepth", label: "Cutout depth (cm)", value: existing ? existing.z1 - existing.z0 : 45, min: 10, max: 85 },
  ], v => {
    if (!group.every(unit => S.items.includes(unit))) return "The run changed. Select a cabinet again.";
    const thickness = Number(v.thickness), centre = Number(v.offset), width = Number(v.cutwidth), depth = Number(v.cutdepth);
    if (!(thickness >= 1 && thickness <= 10) || !topSheets.some(sheet => sheet.id === v.stock) || !PROFILES.some(profile => profile.id === v.profile)) return "Choose a valid thickness, material and edge profile.";
    const cutout = v.cutout === "none" ? [] : oldCutouts.filter(hole => hole.kind !== v.cutout).concat({ kind: v.cutout, x0: centre - width / 2, x1: centre + width / 2, z0: -depth / 2, z1: depth / 2 });
    if (cutout.some(hole => !(hole.x1-hole.x0 >= 10 && hole.z1-hole.z0 >= 10) || hole.x0 < 3 || hole.x1 > run.span - 3 || hole.z0 < -item.d / 2 + 3 || hole.z1 > item.d / 2 - 3)) return "Keep each cutout at least 3 cm from every worktop edge.";
    if (cutout.length > 1 && cutout[0].x0 < cutout[1].x1 + 3 && cutout[1].x0 < cutout[0].x1 + 3 && cutout[0].z0 < cutout[1].z1 + 3 && cutout[1].z0 < cutout[0].z1 + 3) return "Keep at least 3 cm between the two cutouts.";
    pushHistory();
    for (const unit of group) { unit.cab.top = thickness; unit.cab.stock = { ...unit.cab.stock, top: v.stock }; unit.cab.profile = v.profile; unit.cab.worktopCutouts = cutout.map(hole => ({ ...hole })); }
    S.dirty3D = true; render2D(); refreshTree(); updateCost();
  });
}

async function openCabSend() {
  if (!S.items.some(item => item.cab)) { reportDialog("Send to shop", ["Add at least one cabinet before preparing a shop package."]); return; }
  const { openNestForPlan } = await import("./ui_nest.js");
  openNestForPlan();
  const share = document.getElementById("nzProductionPackageShare");
  if (share) {
    for (let section = share.closest("details"); section; section = section.parentElement?.closest("details")) section.open = true;
    share.scrollIntoView({ block: "center" }); share.focus();
  }
  const status = document.getElementById("nzProductionPackageStatus");
  if (status) status.textContent = "Create a current revision snapshot, review the package, then share it with the workshop.";
}

function openAnnotation(kind) {
  document.getElementById("proAnnotation")?.remove();
  const dialog = document.createElement("dialog"); dialog.id = "proAnnotation";
  dialog.className = "pro-dialog";
  const heading = document.createElement("h2"); heading.textContent = ({ dimension: "Free dimension", note: "Plan note", symbol: "Annotation symbol", section: "Building section" })[kind]; dialog.appendChild(heading);
  const help = document.createElement("p"); help.textContent = kind === "dimension" || kind === "section" ? "Pick the start and end points on the plan." : "Pick a position on the plan."; dialog.appendChild(help);
  const textInput = document.createElement("input"); textInput.placeholder = kind === "section" ? "Section label (A)" : "Text"; textInput.value = kind === "section" ? "A" : "";
  if (kind === "note" || kind === "section" || kind === "symbol") dialog.appendChild(textInput);
  const symbolInput = document.createElement("select");
  if (kind === "symbol") {
    for (const [value, label] of [["north", "North arrow"], ["level", "Level mark"], ["mark", "Callout mark"]]) { const option = document.createElement("option"); option.value = value; option.textContent = label; symbolInput.appendChild(option); }
    dialog.appendChild(symbolInput);
  }
  const place = document.createElement("button"); place.type = "button"; place.textContent = "Place on plan";
  place.onclick = async () => {
    if (kind === "note" && !textInput.value.trim()) { textInput.focus(); return; }
    S.annotationDraft = { kind, text: textInput.value.trim().slice(0, 500), symbol: symbolInput.value };
    dialog.close();
    window.__setViewMode?.("plan");
    const { setTool } = await import("./interaction.js"); setTool("annotation");
    if (kind === "section") window.addEventListener("planner-annotation-created", event => {
      const svg = sectionDrawingSVG(S, event.detail.annotation);
      downloadText(`section-${event.detail.annotation.text || "A"}.svg`, svg, "image/svg+xml");
    }, { once: true });
  };
  dialog.appendChild(place);
  const listHeading = document.createElement("h3"); listHeading.textContent = "Placed annotations"; dialog.appendChild(listHeading);
  for (const annotation of (S.annotations || []).filter(a => a.kind === kind)) {
    const row = document.createElement("div"); row.style.cssText = "display:flex;gap:.4rem;align-items:center;margin:.4rem 0";
    const label = document.createElement("span"); label.textContent = `${annotation.text || annotation.symbol || kind} · (${Math.round(annotation.x)}, ${Math.round(annotation.z)})`; row.appendChild(label);
    if (kind === "note" || kind === "symbol" || kind === "section") {
      const edit = document.createElement("button"); edit.type = "button"; edit.textContent = "Edit";
      edit.onclick = () => { const next = prompt("Annotation text", annotation.text || ""); if (next == null) return; pushHistory(); annotation.text = next.slice(0, 500); render2D(); label.textContent = `${annotation.text || annotation.symbol || kind} · (${Math.round(annotation.x)}, ${Math.round(annotation.z)})`; };
      row.appendChild(edit);
    }
    if (kind === "section") { const exportButton = document.createElement("button"); exportButton.type = "button"; exportButton.textContent = "Export SVG"; exportButton.onclick = () => downloadText(`section-${annotation.text || "A"}.svg`, sectionDrawingSVG(S, annotation), "image/svg+xml"); row.appendChild(exportButton); }
    const del = document.createElement("button"); del.type = "button"; del.textContent = "Delete"; del.onclick = () => { pushHistory(); S.annotations = S.annotations.filter(a => a.id !== annotation.id); render2D(); row.remove(); }; row.appendChild(del);
    dialog.appendChild(row);
  }
  const close = document.createElement("button"); close.type = "button"; close.textContent = t("close"); close.onclick = () => dialog.close(); dialog.appendChild(close);
  dialog.addEventListener("close", () => dialog.remove(), { once: true }); document.body.appendChild(dialog); dialog.showModal();
}

function openStack() {
  const item = S.sel?.kind === "item" ? S.sel.ref : null;
  if (!item) { reportDialog("Stack", ["Select the piece to place on top of another piece first."]); return; }
  const hosts = S.items.filter(host => host !== item && !stackWouldCycle(item, host));
  if (!hosts.length) { reportDialog("Stack", ["No suitable host piece is available."]); return; }
  document.getElementById("proStack")?.remove();
  const dialog = document.createElement("dialog"); dialog.id = "proStack"; dialog.className = "pro-dialog";
  const form = document.createElement("form"); form.method = "dialog";
  const heading = document.createElement("h2"); heading.textContent = "Place on top of"; form.appendChild(heading);
  const select = document.createElement("select");
  hosts.forEach((host, index) => { const option = document.createElement("option"); option.value = String(index); option.textContent = `${host.type} · ${host.id}`; select.appendChild(option); });
  form.appendChild(select);
  const apply = document.createElement("button"); apply.type = "submit"; apply.textContent = "Stack"; form.appendChild(apply);
  const cancel = document.createElement("button"); cancel.type = "button"; cancel.textContent = t("cancel"); cancel.onclick = () => dialog.close(); form.appendChild(cancel);
  form.onsubmit = event => {
    event.preventDefault();
    const host = hosts[Number(select.value)];
    if (!host || !S.items.includes(item) || !S.items.includes(host)) return;
    pushHistory(); item.x = host.x; item.z = host.z; stackAttach(item, host); stackReseat(item);
    S.dirty3D = true; render2D(); dialog.close();
  };
  dialog.appendChild(form); dialog.addEventListener("close", () => dialog.remove(), { once: true }); document.body.appendChild(dialog); dialog.showModal();
}

function openRoof() {
  document.getElementById("proRoof")?.remove();
  const dialog = document.createElement("dialog"); dialog.id = "proRoof";
  dialog.className = "pro-dialog";
  const form = document.createElement("form"); form.method = "dialog";
  const heading = document.createElement("h2"); heading.textContent = "Roof from exterior walls"; form.appendChild(heading);
  const values = {};
  for (const [name, label, type, value] of [["type", "Type", "select", S.roof?.type || "gable"], ["pitch", "Pitch (degrees)", "number", S.roof?.pitch ?? 30], ["overhang", "Overhang (cm)", "number", S.roof?.overhang ?? 30]]) {
    const row = document.createElement("label"); row.style.cssText = "display:grid;gap:.25rem;margin:.6rem 0"; row.append(label);
    const input = document.createElement(type); input.name = name;
    if (type === "select") for (const optionValue of ["flat", "gable", "hip"]) { const option = document.createElement("option"); option.value = optionValue; option.textContent = optionValue; input.appendChild(option); }
    else { input.type = "number"; input.min = "0"; input.max = name === "pitch" ? "60" : "300"; input.step = "1"; input.required = true; }
    input.value = value; row.appendChild(input); form.appendChild(row); values[name] = input;
  }
  const apply = document.createElement("button"); apply.type = "submit"; apply.textContent = "Generate roof"; form.appendChild(apply);
  if (S.roof) { const remove = document.createElement("button"); remove.type = "button"; remove.textContent = "Remove roof"; remove.onclick = () => { pushHistory(); S.roof = null; S.dirty3D = true; render2D(); dialog.close(); }; form.appendChild(remove); }
  const cancel = document.createElement("button"); cancel.type = "button"; cancel.textContent = t("cancel"); cancel.onclick = () => dialog.close(); form.appendChild(cancel);
  form.onsubmit = event => {
    event.preventDefault();
    const base = Math.max(270, ...S.walls.map(w => Number(w.h) || 270));
    const roof = roofFromWalls(S.walls, S.nodes, { type: values.type.value, pitch: Number(values.pitch.value), overhang: Number(values.overhang.value), base });
    if (!roof) { reportDialog("Roof", ["Draw an enclosed set of exterior walls before generating a roof."]); return; }
    pushHistory(); S.roof = roof; S.dirty3D = true; render2D(); dialog.close();
  };
  dialog.appendChild(form); dialog.addEventListener("close", () => dialog.remove(), { once: true }); document.body.appendChild(dialog); dialog.showModal();
}

function openStairs() {
  const above = floorAbove();
  if (!above) { reportDialog("Stairs", ["Add an upper floor before placing stairs so the tool can cut its slab."]); return; }
  document.getElementById("proStairs")?.remove();
  const dialog = document.createElement("dialog");
  dialog.id = "proStairs";
  dialog.className = "pro-dialog";
  const form = document.createElement("form"); form.method = "dialog";
  const title = document.createElement("h2"); title.textContent = "Parametric stairs"; form.appendChild(title);
  const inputs = {};
  for (const [key, label, type, value, min] of [
    ["shape", "Plan", "select", "straight", ""], ["width", "Width (cm)", "number", "100", "60"],
    ["depth", "Depth (cm)", "number", "250", "120"], ["steps", "Steps", "number", "14", "2"],
  ]) {
    const row = document.createElement("label"); row.style.cssText = "display:grid;gap:.25rem;margin:.6rem 0";
    row.append(label);
    const input = document.createElement(type); input.name = key;
    if (type === "select") for (const shape of ["straight", "L", "U"]) { const option = document.createElement("option"); option.value = shape; option.textContent = shape; input.appendChild(option); }
    else { input.min = min; input.step = "1"; input.required = true; }
    input.value = value; row.appendChild(input); form.appendChild(row); inputs[key] = input;
  }
  const hint = document.createElement("p"); hint.textContent = `The flight rises to ${above.name} and cuts its slab automatically. Choose a location on the plan after pressing Place.`; form.appendChild(hint);
  const place = document.createElement("button"); place.type = "submit"; place.textContent = "Place"; form.appendChild(place);
  const cancel = document.createElement("button"); cancel.type = "button"; cancel.textContent = t("cancel"); cancel.onclick = () => dialog.close(); form.appendChild(cancel);
  form.onsubmit = async event => {
    event.preventDefault();
    const width = Number(inputs.width.value), depth = Number(inputs.depth.value), steps = Number(inputs.steps.value);
    if (!(width >= 60 && depth >= 120 && steps >= 2 && steps <= 100)) return;
    dialog.close();
    const active = S.workspace.floors.find(f => f.id === S.workspace.activeFloor);
    const rise = Math.max(1, (Number(above.elevation) || 270) - (Number(active?.elevation) || 0));
    const onPlaced = event => {
      const it = event.detail?.item;
      if (it?.type !== "stairs") return;
      window.removeEventListener("planner-item-created", onPlaced);
      pushHistory();
      it.w = width; it.d = depth; it.h = rise;
      it.configuration = { ...(it.configuration || {}), shape: inputs.shape.value, stepCount: steps };
      S.dirty3D = true; render2D();
      window.__runAction?.("slabFromStairs");
    };
    window.addEventListener("planner-item-created", onPlaced);
    const ui = await import("./ui.js");
    ui.addFurnItem("stairs");
  };
  dialog.appendChild(form); dialog.addEventListener("close", () => dialog.remove(), { once: true });
  document.body.appendChild(dialog); dialog.showModal();
}

function reportDialog(title, lines) {
  document.getElementById("proReport")?.remove();
  const dialog = document.createElement("dialog");
  dialog.id = "proReport";
  dialog.className = "pro-dialog";
  const heading = document.createElement("h2");
  heading.textContent = title;
  dialog.appendChild(heading);
  const list = document.createElement("ol");
  for (const line of lines) {
    const row = document.createElement("li");
    row.textContent = line;
    list.appendChild(row);
  }
  dialog.appendChild(list);
  const close = document.createElement("button");
  close.type = "button";
  close.textContent = t("close");
  close.onclick = () => dialog.close();
  dialog.appendChild(close);
  dialog.addEventListener("close", () => dialog.remove(), { once: true });
  document.body.appendChild(dialog);
  dialog.showModal();
}

function areaSummary() {
  const report = activeFloorArea();
  const lines = report.entries.map(entry => {
    const name = S.roomMeta[entry.key]?.name || entry.type || entry.key;
    return `${name}: ${entry.area == null ? "unresolved" : entry.area.toFixed(2) + " m²"}`;
  });
  lines.push(`Indoor: ${report.indoor == null ? "unresolved" : report.indoor.toFixed(2) + " m²"}`);
  lines.push(`Outdoor: ${report.outdoor == null ? "unresolved" : report.outdoor.toFixed(2) + " m²"}`);
  lines.push(`Footprint: ${report.footprint == null ? "unresolved" : report.footprint.toFixed(2) + " m²"}`);
  reportDialog("Area summary", lines);
}

function layoutCheck() {
  const rooms = detectRooms();
  const lines = rooms.flatMap(room => {
    const name = S.roomMeta[room.key]?.name || room.key;
    const issues = currentRoomFit(room.key);
    return issues.length ? issues.map(issue => `${name}: ${issue.kind}${issue.itemId ? " · item " + issue.itemId : ""}`) : [`${name}: no layout issues`];
  });
  reportDialog("Layout check", lines.length ? lines : ["No enclosed rooms to analyze."]);
}

/* Import DXF. The file picker opens here, inside the click (a browser only
   shows a file dialog for a user gesture); the importer and the plan
   recognizer it runs load once a file is chosen. */
function openDxfImport() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".dxf,application/dxf,image/vnd.dxf,image/x-dxf";
  input.addEventListener("change", () => {
    const file = input.files && input.files[0];
    if (file) import("./ui_dxf_import.js").then((m) => m.importDxfFile(file));
  }, { once: true });
  input.click();
}

export const PRO_ACTIONS = {
  dimension: () => openAnnotation("dimension"),
  note: () => openAnnotation("note"),
  symbols: () => openAnnotation("symbol"),
  section: () => openAnnotation("section"),
  stack: openStack,
  roof: openRoof,
  stairs: openStairs,
  dxfImport: openDxfImport,
  cabRun: openCabRun,
  cabWorktop: openCabWorktop,
  cabSend: openCabSend,
  refdim: () => window.__runAction?.("conRefDim"),
  areaSummary,
  layoutCheck,
  codeCheck: () => import("./ui_code_check.js").then((m) => m.openCodeCheck()),
  sheetSvg: () => downloadText("home3d-construction-plan.svg", toConstructionSVG(), "image/svg+xml"),
  sheetPrint: () => printSheetSVG(toConstructionSVG(), t("sheet_floor_plan")),
  planSvg: () => downloadText("home3d-plan.svg", toSVG(), "image/svg+xml"),
  dxf: () => downloadText("home3d-plan.dxf", toDXF(), "application/dxf"),
  ifc: () => downloadText("home3d-model.ifc", toIFC(), "application/x-step"),
  schedules: () => downloadText("home3d-schedules.csv", toScheduleCSV(), "text/csv"),
  /* Door and window swings that hit furniture or other openings. Returns the
     count so the caller can say it; the Warnings panel lists each one. */
  clearances: () => checkSwingConflicts().length,
  // W12, D7, F13 on the plan; returns whether they are now shown
  partCodes: () => togglePartCodes(),
  // the edit history, which the Round-6 header does not show as a dropdown
  // the desktop layout has a History tab in the left panel; elsewhere a popover
  history: () => showLeftTab("history") || openHistoryPop(),
};
