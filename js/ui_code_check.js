/* Building-code check dialog (pro ribbon → Check → Code check). The
   jurisdiction is a project setting, S.workspace.codeProfile, so it travels
   with the drawing and through undo like the rest of the workspace. */
import { S } from "./state.js";
import { getLang, t } from "./i18n.js";
import { roomPreset } from "./room_presets.js";
import { codeProfile, codeProfileIds, defaultCodeProfileId, formatCodeValue, localized } from "./code_profiles.js";
import { checkCode } from "./code_check.js";
import { planForCodeCheck } from "./code_check_plan.js";
import { codeText } from "./code_check_strings.js";
import { pushHistory } from "./history.js";

export function currentCodeProfileId(state = S) {
  const id = state.workspace && state.workspace.codeProfile;
  return codeProfile(id) ? id : defaultCodeProfileId(getLang());
}

function el(tag, text, cls) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  node.dir = "auto";
  return node;
}

function roomLabel(room) {
  if (!room) return codeText("apartment");
  if (room.name) return room.name;
  const preset = room.type && roomPreset(room.type);
  if (!preset) return room.key;
  const label = t(preset.i18n);
  return label === preset.i18n ? preset.name : label;
}

/* One finding as a line: where · what · actual vs required · clause, with
   the honesty flags last. */
export function findingLine(finding, profile, rooms) {
  const room = finding.roomKey ? rooms.find((r) => r.key === finding.roomKey) : null;
  const units = profile.units;
  const where = roomLabel(room);
  let what;
  if (finding.rule === "safeRoomRequired") what = codeText("safeRoomRequired");
  else if (finding.rule === "escapeMinArea" && finding.severity === "info") what = codeText("escapeOk");
  else {
    const actual = formatCodeValue(finding.kind, finding.actual, units, getLang());
    const required = formatCodeValue(finding.kind, finding.required, units, getLang());
    const label = codeText(finding.rule) + (finding.detail ? ` ${finding.detail}` : "");
    what = `${label}: ${actual} (${codeText("required")} ${/Max/.test(finding.rule) ? "≤" : "≥"} ${required})`;
  }
  const condition = finding.conditional && finding.condition && `${codeText("conditional")} ${localized(finding.condition, getLang())}`;
  const flags = [!finding.verified && codeText("unverified"), finding.conflicting && codeText("conflicting"), condition].filter(Boolean);
  const cited = localized(finding.clause, getLang());
  const clause = cited ? ` · ${cited}` : "";
  return `${where} — ${what}${clause}${flags.length ? " [" + flags.join(", ") + "]" : ""}`;
}

export function openCodeCheck() {
  document.getElementById("codeCheckDialog")?.remove();
  const dialog = document.createElement("dialog");
  dialog.id = "codeCheckDialog";
  dialog.className = "pro-dialog";
  dialog.appendChild(el("h2", codeText("title")));

  const pickRow = el("label", codeText("jurisdiction") + " ");
  const select = document.createElement("select");
  select.id = "codeCheckProfile";
  // one group per country, in profile order
  const groups = new Map();
  codeProfileIds().forEach((id) => {
    const profile = codeProfile(id);
    if (!groups.has(profile.country)) {
      const group = document.createElement("optgroup");
      group.label = codeText("country_" + profile.country);
      groups.set(profile.country, group);
      select.appendChild(group);
    }
    const option = document.createElement("option");
    option.value = id;
    option.textContent = localized(profile.name, getLang());
    groups.get(profile.country).appendChild(option);
  });
  select.value = currentCodeProfileId();
  pickRow.appendChild(select);
  dialog.appendChild(pickRow);

  const body = el("div", null, "code-check-body");
  dialog.appendChild(body);

  const render = () => {
    body.textContent = "";
    const plan = planForCodeCheck(S);
    const result = checkCode(plan, select.value);
    const profile = result.profile;
    const lang = getLang();
    body.appendChild(el("p", `${codeText("edition")}: ${localized(profile.edition, lang)}`));
    if (profile.note) body.appendChild(el("p", localized(profile.note, lang)));
    body.appendChild(el("p", codeText("disclaimer"), "code-check-disclaimer"));
    if (!plan.rooms.length) body.appendChild(el("p", codeText("noRooms")));
    const untyped = plan.rooms.filter((r) => !r.type).length;
    if (untyped) body.appendChild(el("p", codeText("untyped", { n: untyped })));
    const order = { error: 0, warn: 1, info: 2 };
    const findings = result.findings.slice().sort((a, b) => order[a.severity] - order[b.severity]);
    if (plan.rooms.length && !findings.some((f) => f.severity !== "info")) body.appendChild(el("p", codeText("none")));
    if (findings.length) {
      const list = el("ol");
      findings.forEach((f) => {
        const row = el("li", null, "code-check-" + f.severity);
        row.appendChild(el("strong", codeText(f.severity) + ": "));
        row.appendChild(document.createTextNode(findingLine(f, profile, plan.rooms)));
        list.appendChild(row);
      });
      body.appendChild(list);
    }
    body.appendChild(el("p", codeText("assumptions"), "code-check-note"));
    if (profile.sources.length) {
      const sources = el("details");
      sources.appendChild(el("summary", codeText("sources")));
      profile.sources.forEach((url) => {
        const link = document.createElement("a");
        link.href = url; link.target = "_blank"; link.rel = "noopener noreferrer";
        link.textContent = decodeURIComponent(url).slice(0, 90);
        const line = el("div"); line.appendChild(link); sources.appendChild(line);
      });
      body.appendChild(sources);
    }
  };
  select.addEventListener("change", () => {
    // The jurisdiction is part of the project, not a view preference: an
    // undoable edit, which also queues the autosave.
    pushHistory(codeText("jurisdiction"));
    S.workspace.codeProfile = select.value;
    render();
  });

  const close = el("button", codeText("close"));
  close.type = "button";
  close.onclick = () => dialog.close();
  render();
  dialog.appendChild(close);
  dialog.addEventListener("close", () => dialog.remove(), { once: true });
  document.body.appendChild(dialog);
  dialog.showModal();
}
