import { S } from "./state.js";
import { openModal, flash, serialize, sceneObject, applyData, select, refreshTree, fillProps } from "./ui.js";
import { render2D, fitView } from "./plan2d.js";
import { pushHistory, beginHistory, commitPending, cancelPending } from "./history.js";
import { markSaved } from "./persist.js";
import { listProjects, saveProject, deleteProject, restoreVersion } from "./project_store.js";
import {
  configureFloorIO,
  ensureFloors,
  addFloor,
  switchFloor,
  removeFloor,
  captureFloor,
  setReferenceFloor,
  alignSelectedWallToReference,
} from "./floors.js";
import { addConstraint, removeConstraint, applyConstraints } from "./constraints.js";
import { validateDesign, validationSummary } from "./validator.js";
import { generateLayouts, applyLayout } from "./layouts.js";
import { downloadText, toSVG, toDXF, toIFC, toScheduleCSV } from "./exports_pro.js";
import { setQualityPreset } from "./view3d.js";
import { wallCons, conSatisfied, removeCon, setConSuppressed, solveWallCons } from "./wall_constraints.js";
import { initCollaboration, addComment, toggleResolved, presentScene, setRole } from "./collaboration.js";
import { NET } from "./net.js";
import { currentPlanRev } from "./plan_sync.js";
import { t } from "./i18n.js";

configureFloorIO({ sceneObject, applyData });

function openProjectData(raw) {
  pushHistory();
  applyData(raw);
  markSaved();
}

let activeTab = "project";
const editable = () => S.workspace.role !== "viewer";
function button(label, fn, cls) {
  const b = document.createElement("button"); b.type = "button"; b.textContent = label;
  if (cls) b.className = cls; b.onclick = fn; return b;
}
function input(value, placeholder, type) {
  const el = document.createElement("input"); el.type = type || "text"; el.value = value ?? ""; el.placeholder = placeholder || ""; return el;
}
function section(title) {
  const box = document.createElement("section"); box.className = "ws-section";
  const h = document.createElement("h4"); h.textContent = title; box.appendChild(h); return box;
}
function row(...children) { const el = document.createElement("div"); el.className = "ws-row"; children.forEach((c) => el.appendChild(c)); return el; }
function refreshScene() { S.dirty3D = true; render2D(); refreshTree(); fillProps(); }

export async function openWorkspace() {
  ensureFloors();
  setRole(S.workspace.role || "owner");
  const dlg = openModal("Project workspace");
  dlg.overlay.classList.add("workspace-overlay");
  dlg.overlay.querySelector(".bp-modal").classList.add("workspace-modal");
  const tabs = row(); tabs.classList.add("ws-tabs");
  const names = { project: "Project", floors: "Floors", validate: "Validate", constraints: "Constraints", layouts: "Alternatives", export: "Export", collaborate: "Collaborate" };
  Object.entries(names).forEach(([id, label]) => tabs.appendChild(button(label, () => { activeTab = id; draw(); })));
  const content = document.createElement("div"); content.className = "ws-content";
  dlg.body.append(tabs, content);
  dlg.actions.appendChild(button("Close", dlg.close));

  async function draw() {
    [...tabs.children].forEach((b, i) => b.classList.toggle("active", Object.keys(names)[i] === activeTab));
    content.replaceChildren();
    if (activeTab === "project") await drawProject();
    else if (activeTab === "floors") drawFloors();
    else if (activeTab === "validate") drawValidation();
    else if (activeTab === "constraints") drawConstraints();
    else if (activeTab === "layouts") drawLayouts();
    else if (activeTab === "export") drawExport();
    else drawCollaboration();
  }

  async function drawProject() {
    const editor = section("Current project");
    const name = input(S.workspace.name, "Project name");
    const note = input("", "Version note (optional)");
    const save = button("Save version", async () => {
      S.workspace.name = name.value.trim().slice(0, 80) || "Home project";
      captureFloor();
      await saveProject(S.workspace.id, S.workspace.name, serialize(), note.value);
      flash("Project version saved", "success"); await draw();
    }, "btn-accent"); save.disabled = !editable();
    editor.append(row(name, note, save)); content.append(editor);
    const performance = section("Rendering performance");
    const quality = document.createElement("select");
    [["auto", "Automatic"], ["performance", "Performance"], ["balanced", "Balanced"], ["quality", "High quality"]].forEach(([v, l]) => { const o = document.createElement("option"); o.value = v; o.textContent = l; o.selected = v === (S.workspace.quality || "auto"); quality.append(o); });
    const effective = document.createElement("span");
    quality.onchange = () => { S.workspace.quality = quality.value; effective.textContent = "Effective: " + setQualityPreset(quality.value); };
    effective.textContent = "Adaptive pixel density, shadows and ambient occlusion";
    performance.append(row(quality, effective)); content.append(performance);
    const saved = section("Saved projects"); content.append(saved);
    try {
      const projects = await listProjects();
      if (!projects.length) saved.append("No saved project versions yet.");
      projects.forEach((project) => {
        const card = document.createElement("div"); card.className = "ws-card";
        const title = document.createElement("strong"); title.textContent = project.name;
        const meta = document.createElement("small"); meta.textContent = new Date(project.updatedAt).toLocaleString() + " · " + (project.versions?.length || 0) + " versions";
        const load = button("Open", () => {
          try {
            openProjectData(project.json);
            dlg.close();
            flash("Project opened", "success");
          } catch (error) {
            flash("Could not open project", "error");
          }
        });
        const del = button("Delete", async () => { if (window.confirm("Delete this saved project and all its versions?")) { await deleteProject(project.id); await draw(); } }, "danger"); del.disabled = !editable();
        card.append(title, meta, row(load, del));
        (project.versions || []).slice().reverse().slice(0, 8).forEach((version) => {
          const v = button("Restore " + new Date(version.at).toLocaleString() + (version.note ? " · " + version.note : ""), async () => {
            try {
              const json = await restoreVersion(project.id, version.id);
              if (!json) {
                flash("Version not found", "error");
                return;
              }
              openProjectData(json);
              dlg.close();
              flash("Version restored", "success");
            } catch (error) {
              flash("Could not restore version", "error");
            }
          }); v.className = "ws-version"; card.append(v);
        });
        saved.append(card);
      });
    } catch (error) { saved.append("Project storage is unavailable: " + error.message); }
  }

  function drawFloors() {
    const box = section("Building levels");
    ensureFloors().forEach((floor) => {
      const label = document.createElement("strong"); label.textContent = floor.name + (floor.id === S.workspace.activeFloor ? " · active" : "");
      const elev = input(floor.elevation, "Elevation", "number"); elev.title = "Elevation in cm";
      elev.onchange = () => { pushHistory(); floor.elevation = Number(elev.value) || 0; };
      const open = button("Open", () => { switchFloor(floor.id); draw(); });
      /* Deleting a storey is the destructive direction, so it is the one that
         most needs the snapshot — and the workspace has been part of one since
         adding a floor became undoable, so the warning was only true because
         this line was missing. */
      const del = button("Delete", () => {
        if (!window.confirm("Delete this floor and everything on it?")) return;
        // begin/commit rather than push: removeFloor refuses to take the last
        // storey, and a snapshot that reverts nothing is its own small bug
        beginHistory();
        if (removeFloor(floor.id)) { commitPending("Delete floor"); draw(); }
        else cancelPending();
      }, "danger");
      open.disabled = floor.id === S.workspace.activeFloor; del.disabled = !editable() || S.workspace.floors.length < 2;
      box.append(row(label, elev, open, del));
    });
    const name = input("", "Floor name"), elevation = input("", "Elevation cm", "number");
    const add = button("Add empty", () => { pushHistory(); addFloor(name.value, elevation.value, false); draw(); });
    const duplicate = button("Duplicate active", () => { pushHistory(); addFloor(name.value || "Copy", elevation.value, true); draw(); });
    add.disabled = duplicate.disabled = !editable(); box.append(row(name, elevation, add, duplicate)); content.append(box);

    const reference = section("Reference floor and wall alignment");
    const referenceSelect = document.createElement("select");
    const none = document.createElement("option");
    none.value = ""; none.textContent = "No reference floor"; referenceSelect.append(none);
    S.workspace.floors.filter((floor) => floor.id !== S.workspace.activeFloor).forEach((floor) => {
      const option = document.createElement("option");
      option.value = floor.id;
      option.textContent = `${floor.name} · ${Number(floor.elevation) || 0} cm`;
      option.selected = floor.id === S.workspace.referenceFloor;
      referenceSelect.append(option);
    });
    const showWrap = document.createElement("label");
    const show = document.createElement("input");
    show.type = "checkbox"; show.checked = !!S.workspace.showReferenceFloor;
    showWrap.append(show, document.createTextNode(" Show reference in plan"));
    referenceSelect.onchange = () => {
      setReferenceFloor(referenceSelect.value, show.checked);
      refreshScene();
      draw();
    };
    show.onchange = () => {
      if (referenceSelect.value) setReferenceFloor(referenceSelect.value, show.checked);
      else S.workspace.showReferenceFloor = false;
      refreshScene();
    };
    reference.append(row(referenceSelect, showWrap));

    const datum = document.createElement("select");
    [
      ["outer", "Outside face"],
      ["mainOutside", "Main layer outside"],
      ["center", "Wall center"],
      ["mainInside", "Main layer inside"],
      ["inner", "Inside face"],
    ].forEach(([value, label]) => {
      const option = document.createElement("option");
      option.value = value; option.textContent = label;
      option.selected = value === (S.workspace.referenceDatum || "center");
      datum.append(option);
    });
    datum.onchange = () => { S.workspace.referenceDatum = datum.value; };
    const align = (direction) => {
      pushHistory();
      const result = alignSelectedWallToReference(S, direction, { datum: datum.value, wallTypes: S.wallTypes });
      if (!result) {
        flash(`No overlapping wall found on the floor ${direction}`, "error");
        return;
      }
      S.workspace.referenceDatum = datum.value;
      captureFloor();
      refreshScene();
      flash(`Wall aligned to ${result.referenceFloor.name}`, "success");
      draw();
    };
    const above = button("Align selected wall ↑ above", () => align("above"), "btn-accent");
    const below = button("Align selected wall ↓ below", () => align("below"), "btn-accent");
    const hasSelectedWall = !!(S.sel && S.sel.kind === "wall" && S.sel.ref);
    const active = S.workspace.floors.find((floor) => floor.id === S.workspace.activeFloor);
    const activeElevation = active ? Number(active.elevation) || 0 : 0;
    above.disabled = !editable() || !hasSelectedWall || !S.workspace.floors.some((floor) => floor.id !== S.workspace.activeFloor && (Number(floor.elevation) || 0) > activeElevation);
    below.disabled = !editable() || !hasSelectedWall || !S.workspace.floors.some((floor) => floor.id !== S.workspace.activeFloor && (Number(floor.elevation) || 0) < activeElevation);
    const alignReference = button("Align selected wall to reference", () => {});
    alignReference.onclick = () => {
      if (!referenceSelect.value) return;
      pushHistory();
      const result = alignSelectedWallToReference(S, { referenceFloor: referenceSelect.value, datum: datum.value, wallTypes: S.wallTypes });
      if (!result) { flash("No overlapping parallel wall found on the reference floor", "error"); return; }
      S.workspace.referenceDatum = datum.value;
      captureFloor(); refreshScene(); flash(`Wall aligned to ${result.referenceFloor.name}`, "success"); draw();
    };
    alignReference.disabled = !editable() || !hasSelectedWall || !referenceSelect.value;
    reference.append(row(datum, above, below, alignReference));
    const help = document.createElement("small");
    help.textContent = "Alignment preserves wall length and uses the closest overlapping parallel wall on the chosen level.";
    reference.append(help);
    content.append(reference);
  }

  function drawValidation() {
    const issues = validateDesign(), sum = validationSummary(issues), box = section("Design checks");
    const summary = document.createElement("p"); summary.textContent = `${sum.error} errors · ${sum.warning} warnings · ${sum.info} notes`;
    box.append(summary);
    if (!issues.length) box.append("No issues found.");
    issues.forEach((issue) => {
      const line = document.createElement("button"); line.className = "ws-issue " + issue.severity; line.textContent = issue.severity.toUpperCase() + " · " + issue.message;
      line.onclick = () => {
        const ref = issue.kind === "wall" ? S.walls.find((w) => w.id === issue.ref) : issue.kind === "item" ? S.items.find((it) => it.id === issue.ref) : null;
        if (ref) { select({ kind: issue.kind, ref }); render2D(); }
      };
      box.append(line);
    }); content.append(box);
  }

  function drawConstraints() {
    const box = section("Unified planner constraints");
    const note = document.createElement("p");
    note.textContent = "Wall dimensions and relations are authored from the main 2D inspector. This page is the project-wide list; item alignment remains available here.";
    box.append(note);
    const kind = document.createElement("select");
    [["alignX", "Align item X"], ["alignZ", "Align item Z"], ["itemDistance", "Item distance"]].forEach(([v, l]) => { const o = document.createElement("option"); o.value = v; o.textContent = l; kind.append(o); });
    const add = button("Constrain selected items", () => { const c = addConstraint(kind.value, S.sel); if (!c) flash("Select at least two items", "error"); draw(); }); add.disabled = !editable();
    box.append(row(kind, add));
    S.workspace.constraints.forEach((c) => {
      const label = document.createElement("span"); label.textContent = c.type;
      const value = input(c.value, "Value", "number"); value.disabled = c.value == null; value.onchange = () => { c.value = Number(value.value); };
      const del = button("Remove", () => { removeConstraint(c.id); draw(); }, "danger"); del.disabled = !editable(); box.append(row(label, value, del));
    });
    wallCons().forEach((c) => {
      const label = document.createElement("span");
      label.textContent = (conSatisfied(c) ? "✓ " : "⚠ ") + c.type;
      const value = input(c.value, "Value", "number"); value.disabled = true;
      const toggle = button(c.off ? "Enable" : "Suppress", () => { pushHistory(); setConSuppressed(c.id, !c.off); solveWallCons(); refreshScene(); draw(); });
      const del = button("Remove", () => { pushHistory(); removeCon(c.id); refreshScene(); draw(); }, "danger");
      box.append(row(label, value, toggle, del));
    });
    const apply = button("Solve all constraints", () => { pushHistory(); const n = applyConstraints(); const r = solveWallCons(); refreshScene(); flash((n + wallCons().length) + " constraints solved · " + r.unresolved + " unresolved", r.unresolved ? "error" : "success"); }, "btn-accent"); apply.disabled = !editable(); box.append(apply); content.append(box);
  }

  function drawLayouts() {
    const box = section("Layout alternatives");
    generateLayouts().forEach((candidate) => {
      const label = document.createElement("strong"); label.textContent = candidate.name;
      const score = document.createElement("span"); score.textContent = "Score " + candidate.score + "/100";
      const apply = button("Apply", () => { pushHistory(); applyLayout(candidate); refreshScene(); fitView(); flash("Alternative applied", "success"); }); apply.disabled = !editable();
      box.append(row(label, score, apply));
    }); content.append(box);
  }

  function drawExport() {
    const box = section("Professional handoff");
    box.append(row(
      button("SVG plan", () => downloadText("home3d-plan.svg", toSVG(), "image/svg+xml")),
      button("DXF plan", () => downloadText("home3d-plan.dxf", toDXF(), "application/dxf")),
      button("IFC model", () => downloadText("home3d-model.ifc", toIFC(), "application/x-step")),
      button("CSV schedules", () => downloadText("home3d-schedules.csv", toScheduleCSV(), "text/csv")),
      button("Print report", () => window.print())
    )); content.append(box);
  }

  function drawCollaboration() {
    const live = section(t("collab_live"));
    const status = document.createElement("p");
    status.className = "ws-note";
    status.textContent = NET.connected ? t("collab_on", { n: currentPlanRev() }) : t("collab_off");
    const blurb = document.createElement("p");
    blurb.className = "ws-note";
    blurb.textContent = t("collab_live_t");
    live.append(status, blurb);
    content.append(live);

    const box = section("Review and presentation");
    const role = document.createElement("select"); ["owner", "editor", "viewer"].forEach((r) => { const o = document.createElement("option"); o.value = r; o.textContent = r; o.selected = r === S.workspace.role; role.append(o); });
    role.onchange = () => { setRole(role.value); draw(); };
    const comment = input("", "Comment on current selection");
    const send = button("Add comment", async () => { await addComment(comment.value, draw); comment.value = ""; draw(); }, "btn-accent"); send.disabled = !editable();
    const present = button(t("collab_present"), async () => { const ok = await presentScene(); flash(ok ? "Presentation shared" : "Connect to the relay to present", ok ? "success" : "error"); });
    box.append(row(role, comment, send, present));
    S.workspace.comments.slice().reverse().forEach((c) => {
      const text = document.createElement("span"); text.textContent = (c.resolved ? "✓ " : "") + c.text;
      const meta = document.createElement("small"); meta.textContent = c.author + " · " + c.target.kind + " · " + new Date(c.at).toLocaleString();
      const resolve = button(c.resolved ? "Reopen" : "Resolve", () => { toggleResolved(c.id); draw(); }); resolve.disabled = !editable();
      box.append(row(text, meta, resolve));
    }); content.append(box);
    initCollaboration(draw).catch(() => {});
  }

  await draw();
}
