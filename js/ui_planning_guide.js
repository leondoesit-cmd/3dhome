import {corridorToolsSection} from "./ui_corridor_tools.js";
import {currentRoomFit} from "./ui_layout_tools.js";
import {draftToolsSection} from "./ui_draft_tools.js";
import {accessReviewSection} from "./ui_access_review.js";
import {shapeToolsSection} from "./ui_shape_tools.js";
import { activeFloorArea } from "./area_snapshot.js";
import { roomResizeCommand } from "./commands/room_resize.js";
import { roomMeasurements } from "./room_summary.js";
import { captureLock } from "./constraint_engine.js";
import { selectedRoomSection } from "./ui_room_summary.js";
import { roomDetailsCommand } from "./commands/room_details.js";
import { baselineDrawings } from "./ui_baseline_compare.js";
import { redesignCommand } from "./commands/redesign.js";
import { redesignPolicy, compareBaseline, generatedChangePermission, captureProtectedStructure, validateProtectedStructure } from "./redesign.js";
// The project brief lives in the existing sidebar / mobile sheet. Panel state
// is local UI state; every document edit uses the planner's transaction stack.
import { S } from "./state.js";
import { calibrationScale } from "./blueprint_trace.js";
import { t, onLangChange } from "./i18n.js";
import { ROOM_PRESETS } from "./room_presets.js";
import { planningGuide, checklistStatus, PROJECT_INTENTIONS, PROPERTY_TYPES } from "./planning_guide.js";
import { planningGuideCommand } from "./commands/planning_guide.js";
import { executeCommand } from "./commands/executor.js";
import { beginHistoryTransaction, commitHistoryTransaction, abortHistoryTransaction, currentHistoryId, onAfterRestore } from "./history.js";
import { detectRooms } from "./geometry.js";
import { onAfterRender, render2D, frameBounds } from "./plan2d.js";
import { armRoomStamp, disarmRoomStamp, setTool } from "./interaction.js";
import { fillProps, select } from "./ui_props.js";
import { refreshTree, flash, sceneObject } from "./ui.js";
import { withoutRoomPrompts } from "./ui_tree.js";
import { switchFloor } from "./floors.js";
import { displayUnit } from "./display_units.js";
import { loadUnitSettings, saveUnitSettings, detectLocationUnitSystem } from "./unit_settings.js";

let signature = "", scheduled = false, lastSelectedRoom = null;
const expanded = new Set();
try { JSON.parse(localStorage.getItem("home3d_guide_sections") || "[]").forEach((id) => expanded.add(id)); } catch (_) {}

function el(tag, text, cls) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (cls) node.className = cls;
  return node;
}
function button(label, action) {
  const node = el("button", t(label));
  node.type = "button";
  node.dataset.guideAction = label;
  node.addEventListener("click", action);
  return node;
}
function field(label, control) {
  const node = el("label", "", "guide-field");
  control.dataset.guideField = label;
  node.append(el("span", t(label)), control);
  return node;
}
function choices(options, value, onChange) {
  const node = el("select");
  options.forEach(([id, label]) => {
    const option = el("option", t(label));
    option.value = id;
    node.append(option);
  });
  node.value = value;
  node.addEventListener("change", () => onChange(node.value));
  return node;
}
function section(id, label) {
  const node = el("details", "", "guide-section");
  node.dataset.guideSection = id;
  node.open = expanded.has(id);
  node.append(el("summary", t(label)));
  node.addEventListener("toggle", () => {
    if (!node.isConnected) return;
    if (node.open) expanded.add(id); else expanded.delete(id);
    try { localStorage.setItem("home3d_guide_sections", JSON.stringify([...expanded])); } catch (_) {}
  });
  return node;
}
export function editPlanningGuide(params) {
  const result = executeCommand(planningGuideCommand, params, {
    state: S,
    history: { begin: beginHistoryTransaction, commit: commitHistoryTransaction, abort: abortHistoryTransaction, current: currentHistoryId },
    services: { detectRooms },
  }, { label: t("guide_edit") });
  if (!result.ok) flash(t("guide_failed"), "error");
  else {
    withoutRoomPrompts(refreshTree);
    render2D();
    if (params.displayUnit !== undefined) {
      fillProps();
      window.dispatchEvent(new CustomEvent("planner-units"));
    }
  }
  signature = "";
  renderPlanningGuide();
  return result;
}
function chooseTab(tab) {
  document.querySelector('#leftTabs [data-left-tab="' + tab + '"]')?.click();
}
export function openPlanningGuide() {
  if (document.body.classList.contains("compact-nav"))
    window.dispatchEvent(new CustomEvent("planner-guide-open"));
  chooseTab("project");
  renderPlanningGuide();
}
function closeForPlacement() {
  window.dispatchEvent(new CustomEvent("planner-guide-place"));
}
function focusRoom(entry) {
  if (entry.status === "other_floor") {
    switchFloor(entry.floorId);
    const updated = checklistStatus(S, detectRooms()).find((room) => room.id === entry.id);
    if (updated && updated.roomKey) focusRoom(updated);
    signature = "";
    renderPlanningGuide();
    return;
  }
  if (entry.roomKey) {
    disarmRoomStamp();
    setTool("select");
    const room = detectRooms().find((face) => face.key === entry.roomKey);
    select({ kind: "room", ref: entry.roomKey });
    if (room) frameBounds({ minx: Math.min(...room.pts.map((p) => p.x)), maxx: Math.max(...room.pts.map((p) => p.x)),
      minz: Math.min(...room.pts.map((p) => p.z)), maxz: Math.max(...room.pts.map((p) => p.z)) }, 84);
    render2D();
  } else {
    armRoomStamp(entry.type, { checklistId: entry.id });
  }
  closeForPlacement();
}

export function renderPlanningGuide() {
  const host = document.getElementById("planningGuide");
  if (!host || S.action) return;
  const guide = planningGuide(S), faces = detectRooms();
  const entries = checklistStatus(S, faces);
  const areas = activeFloorArea();
  const selected = S.sel?.kind === "room" ? S.sel.ref : null;
  const calibration = S.blueprintTrace?.calibration;
  const calibratedScale = calibration && calibrationScale(calibration.p1, calibration.p2, calibration.distanceCm);
  const referenceStatus = calibratedScale && Math.abs(calibratedScale - S.blueprintTrace.cmPerPx) < 1e-6
    ? "guide_calibrated" : S.blueprintTrace ? "guide_unscaled" : "guide_calibration_hint";
  const next = JSON.stringify([guide, entries, areas, selected, t("guide_title"), referenceStatus, currentHistoryId(), selected ? [[S.roomMeta[selected]?.name,S.roomMeta[selected]?.roomType,S.roomMeta[selected]?.floor,S.roomMeta[selected]?.wall,!!S.roomMeta[selected]?.floorTex], S.nodes, S.walls.map(w => [w.id,w.thickness,w.datum,w.loc,w.dimSide,w.layers,w.layersReversed]), S.openings.map(o => [o.id,o.wall,o.width,o.s])] : null, S.walls.length, expanded.has("redesign") ? (S.workspace.baselines || []).filter(b => expanded.has("compare-" + b.id)).map(b => compareBaseline(b, S)) : null, S.sel?.kind === "wall" ? S.sel.ref.id : null, S.workspace.redesign, (S.workspace.baselines || []).map(b => b.id)]);
  if (next === signature) return;
  // Let the user finish a text edit before responding to unrelated renders.
  if (host.contains(document.activeElement) && document.activeElement.matches("input,select") && signature) return;
  const focused = host.contains(document.activeElement) ? document.activeElement : null;
  const focusEntry = focused?.closest(".guide-room")?.dataset.entryId || "";
  const focusKey = focused?.dataset.guideField || focused?.dataset.guideAction;
  const focusAttr = focused?.dataset.guideField ? "guideField" : "guideAction";
  const scrollTop = host.scrollTop;
  // Native disclosure toggles can be queued behind this render. Read the live
  // state before replacing nodes so an open editor cannot collapse on change.
  host.querySelectorAll("details[data-guide-section]").forEach((node) => {
    if (node.open) expanded.add(node.dataset.guideSection);
    else expanded.delete(node.dataset.guideSection);
  });
  if (selected && selected !== lastSelectedRoom) expanded.add("selected-room");
  lastSelectedRoom = selected;
  signature = next;
  host.replaceChildren();
  host.append(el("h3", t("guide_title")), el("p", t("guide_optional"), "guide-note"));
  host.append(field("guide_intention", choices(PROJECT_INTENTIONS.map((id) => [id, "guide_" + id]), guide.intention,
    (intention) => editPlanningGuide({ action: "settings", intention, enabled: true }))));
  const curSettings = loadUnitSettings();
  const currentChoice = curSettings.preset === 'auto' ? 'auto' :
    curSettings.preset === 'metric_arch' ? 'm' :
    curSettings.preset === 'metric_mm' ? 'mm' :
    curSettings.preset === 'metric_cm' ? 'cm' :
    curSettings.preset === 'imperial' ? 'ft' :
    displayUnit('plan');
  const unitChoices = [
    ['auto', 'unit_preset_auto'],
    ['m', 'guide_unit_m'],
    ['mm', 'guide_unit_mm'],
    ['cm', 'guide_unit_cm'],
    ['ft', 'guide_unit_ft'],
    ['in', 'guide_unit_in'],
  ];
  host.append(field('guide_display_unit', choices(unitChoices.map(([unit, labelKey]) => [unit, labelKey]), currentChoice, unit => {
    const current = loadUnitSettings();
    const emptyOverrides = {
      rooms: { unit: 'auto', digits: 'auto' },
      openings: { unit: 'auto', digits: 'auto' },
      furniture: { unit: 'auto', digits: 'auto' },
      mep: { unit: 'auto', digits: 'auto' },
      details: { unit: 'auto', digits: 'auto' },
      site: { unit: 'auto', digits: 'auto' },
      plan: { unit: 'auto', digits: 'auto' },
      area: { unit: 'auto', digits: 'auto' },
    };
    let effectiveUnit = unit;
    if (unit === 'auto') {
      effectiveUnit = detectLocationUnitSystem().system === 'imperial' ? 'ft' : 'm';
      saveUnitSettings({ ...current, preset: 'auto', overrides: emptyOverrides });
    } else if (unit === 'm') {
      saveUnitSettings({ ...current, preset: 'metric_arch', overrides: emptyOverrides });
    } else if (unit === 'mm') {
      saveUnitSettings({ ...current, preset: 'metric_mm', overrides: emptyOverrides });
    } else if (unit === 'cm') {
      saveUnitSettings({ ...current, preset: 'metric_cm', overrides: emptyOverrides });
    } else if (unit === 'ft') {
      saveUnitSettings({ ...current, preset: 'imperial', overrides: emptyOverrides });
    } else if (unit === 'in') {
      saveUnitSettings({
        ...current,
        preset: 'custom',
        overrides: { ...emptyOverrides, plan: { unit: 'in', digits: 1 }, rooms: { unit: 'in', digits: 1 } },
      });
    }
    editPlanningGuide({ action: 'settings', displayUnit: effectiveUnit });
  })));
  if (guide.intention === "recreate") {
    host.append(button("guide_reference", () => window.__runAction?.("importBlueprintTrace")));
    host.append(el("p", t(referenceStatus), "guide-note"));
  }
  const actions = el("div", "", "guide-actions");
  actions.append(button("guide_add_room", () => { armRoomStamp("bedroom"); closeForPlacement(); }),
    button("guide_furnish", () => chooseTab("library")));
  host.append(actions,shapeToolsSection({el,field,button,choices,section}),draftToolsSection({el,field,button,choices,section},guide));
  host.append(selectedRoomSection(faces.find(r => r.key === selected), {el,field,button,choices,section}, editRoomDetails, resizeSelectedRoom, areas.entries.find(entry => entry.key === selected)));
  const details = section("project", "guide_details");
  details.append(field("guide_property", choices(PROPERTY_TYPES.map((id) => [id, "guide_property_" + id]), guide.details.propertyType,
    (propertyType) => editPlanningGuide({ action: "settings", propertyType }))));
  const area = el("input");
  area.type = "number"; area.min = "0.01"; area.step = "any";
  area.value = guide.details.usableAreaTarget || "";
  area.addEventListener("change", () => {
    if (area.reportValidity()) editPlanningGuide({ action: "settings", usableAreaTarget: area.value ? Number(area.value) : null });
  });
  details.append(field("guide_area_target", area), el("p", t("guide_area_advisory"), "guide-note"));
  const advUnitsBtn = el('button', 'btn-secondary', '');
  advUnitsBtn.type = 'button';
  advUnitsBtn.innerHTML = '<i class="ph ph-sliders-horizontal"></i> ' + t('unit_preset_custom');
  advUnitsBtn.style.cssText = 'font-size:11px; padding:3px 8px; margin:4px 0 8px; cursor:pointer; display:inline-flex; align-items:center; gap:5px;';
  advUnitsBtn.onclick = () => { if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('unit-open-settings')); };
  details.append(advUnitsBtn);
  details.append(el('p',t('guide_unit_scope'),'guide-note'),el('p',t('guide_floor_count').replace('{n}',(S.workspace.floors||[]).length||1),'guide-note'));
  const areaReport = el("div", "", "guide-note");
  areaReport.dataset.guideArea = "floor";
  for (const [key,value] of [["indoor",areas.indoor],["outdoor",areas.outdoor],["unclassified",areas.unclassified],["footprint",areas.footprint],["groups",areas.components.length],["unresolved",areas.unresolved]]) {
    areaReport.append(el("p",t("guide_area_"+key).replace("{n}",value == null ? t("guide_not_measurable") : Number(value.toFixed(2)))));
  }
  if(guide.details.usableAreaTarget){
    const matching=(S.workspace?.floors||[]).length<=1&&areas.measurable;
    areaReport.append(el('p',matching?t('guide_area_difference').replace('{n}',Number((areas.indoor-guide.details.usableAreaTarget).toFixed(2))):t('guide_area_target_unresolved')));
  }
  areaReport.append(el("p",t("guide_area_scope")));
  details.append(areaReport);
  host.append(details,accessReviewSection({el,field,button,choices,section},guide,editPlanningGuide),corridorToolsSection({el,field,button,choices,section}));
  const list = section("rooms", "guide_rooms");
  const placed = entries.filter((room) => room.status === "placed").length;
  list.append(el("p", t("guide_progress").replace("{placed}", placed).replace("{total}", entries.length), "guide-note"));
  if (!entries.length) list.append(el("p", t("guide_empty"), "guide-note"));
  entries.forEach((entry, index) => {
    const row = el("div", "", "guide-room");
    row.dataset.entryId = entry.id;
    const focus = button("guide_" + entry.status, () => focusRoom(entry));
    focus.textContent = (entry.status === "placed" ? "✓ " : "") + (entry.name || t("rp_" + entry.type)) + " · " + t("guide_" + entry.status);
    row.append(focus);
    const edit = section("room-" + entry.id, "guide_edit_room");
    const name = el("input"); name.value = entry.name; name.maxLength = 80;
    name.disabled = entry.status === "other_floor";
    name.addEventListener("change", () => editPlanningGuide({ action: "edit", id: entry.id, name: name.value }));
    const type = choices(ROOM_PRESETS.map((preset) => [preset.id, preset.i18n]), entry.type,
      (type) => editPlanningGuide({ action: "edit", id: entry.id, type }));
    type.disabled = entry.status === "other_floor";
    edit.append(field("guide_name", name), field("guide_type", type));
    for(const key of ['width','depth']){
      const input=el('input');input.type='number';input.min='20';input.max='10000';input.step='any';input.value=entry[key]??'';
      input.disabled=entry.status==='other_floor';
      input.addEventListener('change',()=>{if(input.reportValidity())editPlanningGuide({action:'edit',id:entry.id,[key]:input.value===''?null:Number(input.value)});});
      edit.append(field('draft_fixed_'+key,input));
    }
    const tools = el("div", "", "guide-actions");
    const assign = button("guide_assign", () => editPlanningGuide({ action: "assign", id: entry.id, roomKey: selected }));
    assign.disabled = !selected;
    tools.append(assign);
    if (entry.roomHid) tools.append(button("guide_unassign", () => editPlanningGuide({ action: "unassign", id: entry.id })));
    else tools.append(button(entry.skipped ? "guide_revisit" : "guide_skip", () => editPlanningGuide({ action: "skip", id: entry.id })));
    const up = button("guide_up", () => editPlanningGuide({ action: "move", id: entry.id, direction: -1 }));
    const down = button("guide_down", () => editPlanningGuide({ action: "move", id: entry.id, direction: 1 }));
    up.disabled = index === 0; down.disabled = index === entries.length - 1;
    tools.append(up, down, button("guide_remove", () => editPlanningGuide({ action: "remove", id: entry.id })));
    edit.append(tools); row.append(edit); list.append(row);
  });
  const add = el("div", "", "guide-add");
  const type = choices(ROOM_PRESETS.map((preset) => [preset.id, preset.i18n]), "bedroom", () => {});
  add.append(field("guide_type", type), button("guide_add_wanted", () => {
    expanded.add("rooms");
    editPlanningGuide({ action: "add", id: "wanted-" + crypto.randomUUID(), type: type.value, name: t("rp_" + type.value) });
  }));
  list.append(add); host.append(list);
  host.append(redesignSection());
  if (S.roomStamp?.checklistId) host.append(button("guide_cancel", () => { disarmRoomStamp(); setTool("select"); signature = ""; renderPlanningGuide(); }));
  if (focusKey) {
    const candidates = [...host.querySelectorAll("input,select,button")];
    const target = candidates.find((node) => node.dataset[focusAttr] === focusKey &&
      (node.closest(".guide-room")?.dataset.entryId || "") === focusEntry);
    (target || host.querySelector('[data-guide-action="guide_add_wanted"]'))?.focus({ preventScroll: true });
  }
  host.scrollTop = scrollTop;
  if (S.workspace?.role === "viewer") host.querySelectorAll("input,select,button").forEach((control) => { control.disabled = true; });
}

export function resizeSelectedRoom(params) {
  const protectedBefore=params.generated?captureProtectedStructure(S):null;
  if(params.generated){
    const prepared=roomResizeCommand.prepare(params,{state:S,services:{detectRooms,captureLock}});
    if(!prepared.ok){flash(t('guide_resize_'+prepared.reason),'error');return prepared;}
    const allowed=generatedChangePermission(S,'room.resize_exact',{wallIds:prepared.plan.params.wallIds});
    if(!allowed.ok){flash(t('redesign_protected'),'error');return allowed;}
  }
  const result=executeCommand(roomResizeCommand,params,{
    state:S,services:{detectRooms,captureLock},
    history:{begin:beginHistoryTransaction,commit:commitHistoryTransaction,abort:abortHistoryTransaction,current:currentHistoryId},
  },{label:t("guide_resize_apply"),postValidate:()=>{
    if(params.generated){const protectedResult=validateProtectedStructure(protectedBefore,S);if(!protectedResult.ok)return protectedResult;if(currentRoomFit(params.roomKey).length)return {ok:false,reason:"RESIZE_CONTENTS"};}
    const face=detectRooms().find(r=>r.key===params.roomKey);
    const size=roomMeasurements(S,face)?.interior;
    return size && Math.abs(size.width-params.width)<1e-5 && Math.abs(size.depth-params.depth)<1e-5
      ? {ok:true} : {ok:false,reason:"INVALID_ROOM_SIZE"};
  }});
  if(!result.ok){
    const key="guide_resize_"+result.reason,message=t(key);
    flash(message===key?t("guide_failed"):message,"error");
  }
  else {S.dirty3D=true;withoutRoomPrompts(refreshTree);fillProps();}
  signature="";render2D();renderPlanningGuide();return result;
}

export function editRoomDetails(params) {
  const result = executeCommand(roomDetailsCommand, params, {
    state:S, services:{detectRooms},
    history:{begin:beginHistoryTransaction,commit:commitHistoryTransaction,abort:abortHistoryTransaction,current:currentHistoryId},
  },{label:t("guide_room_details")});
  if(!result.ok)flash(t("guide_failed"),"error");
  else { S.dirty3D=true; withoutRoomPrompts(refreshTree); fillProps(); }
  signature="";render2D();renderPlanningGuide();return result;
}

export function editRedesign(params) {
  const result = executeCommand(redesignCommand, params, {
    state: S,
    history: { begin: beginHistoryTransaction, commit: commitHistoryTransaction, abort: abortHistoryTransaction, current: currentHistoryId },
    services: { sceneObject },
  }, { label: t("redesign_title") });
  if (!result.ok) flash(t("guide_failed"), "error");
  signature = "";
  render2D(); renderPlanningGuide();
  return result;
}
function redesignSection() {
  const node = section("redesign", "redesign_title");
  node.append(el("p", t("redesign_hint"), "guide-note"));
  const name = el("input"); name.maxLength = 100; name.value = t("redesign_baseline");
  const start = button("redesign_start", () => editRedesign({ action: "start", id: "baseline-" + crypto.randomUUID(), name: name.value, createdAt: new Date().toISOString() }));
  start.disabled = !S.walls.length;
  node.append(field("redesign_name", name), start);
  const policy = redesignPolicy(S);
  if (policy) {
    const allowed = new Set(policy.allowedWallIds);
    node.append(el("p", t("redesign_scope_count").replace("{allowed}", S.walls.filter(w => allowed.has(String(w.id))).length).replace("{total}", S.walls.length), "guide-note"));
    node.append(el("p", t("redesign_scope_hint"), "guide-note"));
    const selectedIds = S.sel?.kind === "wall" ? [String(S.sel.ref.id)] : S.sel?.kind === "room" ? String(S.sel.ref).split(",") : [];
    const validIds = selectedIds.filter(id => S.walls.some(w => String(w.id) === id));
    const actions = el("div", "", "guide-actions");
    for (const [label, allow] of [["redesign_allow", true], ["redesign_protect", false]]) {
      const control = button(label, () => editRedesign({ action: "scope", wallIds: validIds, allow }));
      control.disabled = !validIds.length; actions.append(control);
    }
    actions.append(button("redesign_allow_floor", () => editRedesign({ action: "scope", wallIds: S.walls.map(w => w.id), allow: true })),
      button("redesign_protect_floor", () => editRedesign({ action: "scope", wallIds: S.walls.map(w => w.id), allow: false })));
    node.append(actions);
  }
  const baselines = (S.workspace.baselines || []).filter(b => b.floorId === S.workspace.activeFloor);
  for (const baseline of baselines) {
    const comparison = section("compare-" + baseline.id, "redesign_compare");
    comparison.querySelector("summary").textContent = t("redesign_compare") + " · " + baseline.name;
    comparison.append(el("p", t("redesign_readonly"), "guide-note"));
    const report = compareBaseline(baseline, S), table = el("table", "", "redesign-comparison");
    const head = el("tr");
    ["redesign_objects", "redesign_before", "redesign_now", "redesign_changes"].forEach(key => head.append(el("th", t(key))));
    table.append(head);
    for (const kind of ["walls", "openings", "items"]) {
      const row = el("tr"), r = report[kind];
      [t("redesign_" + kind), r.before, r.after, "+" + r.added.length + " / −" + r.removed.length + " / Δ" + r.changed.length].forEach(value => row.append(el("td", String(value))));
      table.append(row);
    }
    comparison.append(baselineDrawings(baseline, S), table); node.append(comparison);
  }
  return node;
}

export function initPlanningGuide() {
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => { scheduled = false; renderPlanningGuide(); });
  };
  onAfterRender(schedule);
  window.addEventListener("planner-analysis-change", () => { signature=""; schedule(); });
  onAfterRestore(() => { signature = ""; schedule(); });
  onLangChange(() => { signature = ""; schedule(); });
  window.addEventListener("planner-selection", schedule);
  window.addEventListener("planner-room-stamp", () => { signature = ""; schedule(); });
  document.getElementById("planningGuide")?.addEventListener("focusout", schedule);
  renderPlanningGuide();
}
