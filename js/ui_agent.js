import { t } from "./i18n.js";
import { escapeHTML } from "./safe.js";
import { loadAgentConfig, saveAgentConfig, validateAgentConfig, setAgentApiKey, agentApiKey, setAgentBridgeToken, agentBridgeToken } from "./agent_config.js";
import { listAgentModels, sendAgentChat } from "./agent_transport.js";
import { runAgentTurn, installAgentBridge } from "./agent_runtime.js";
import { executePlannerProposal, setTool } from "./interaction.js";
import { projectAgentContext, livePlacementScene } from "./agent_context.js";
import { renderAgentCandidates, clearAgentPreview } from "./agent_preview.js";
import { groundCandidates, checksLevel } from "./agent_grounding.js";
import { partCode } from "./part_codes.js";
import { S } from "./state.js";
import { FURN } from "./furniture_models.js";
import { flabel } from "./furniture_meta.js";
import { roomName } from "./geometry.js";
import { swingPolysForOpening } from "./swing_clearance.js";
import { undo, currentHistoryId } from "./history.js";
import { select } from "./ui_props.js";
import { sx, sz, rotatePx, unrotatePx, planRotRad } from "./plan_view.js";
import { render2D } from "./plan2d.js";
import { tutorAttention } from "./tutor/attention_tracker.js";
import { spotlightPlannerTarget } from "./planner_tutorial.js";
import { resetTutorProgress } from "./tutor/progress.js";

let dock, messagesEl, inputEl, sendBtn, statusEl, cancelBtn, inspectorPre, progressEl;
let conversation = [], busy = false, activeRequest = null, requestSeq = 0;
let pendingProposalCard = null;
let progressState = null, progressTimer = null;
const CONVERSATION_KEY = "modelforge_agent_conversation_v1";
const FEEDBACK_KEY = "modelforge_tutor_feedback_v1";

function el(tag, cls, text) {
  var node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
}
function persistConversation() {
  try {
    if (loadAgentConfig().persistConversation) localStorage.setItem(CONVERSATION_KEY, JSON.stringify(conversation.slice(-40)));
    else localStorage.removeItem(CONVERSATION_KEY);
  } catch (_) {}
}
function restoreConversation() {
  if (!loadAgentConfig().persistConversation) return [];
  try {
    var value = JSON.parse(localStorage.getItem(CONVERSATION_KEY) || "[]");
    return Array.isArray(value) ? value.slice(-40) : [];
  } catch (_) { return []; }
}
function recordFeedback(outcome, proposal, result) {
  tutorAttention.record(outcome === "accepted" ? "PROPOSAL_ACCEPTED" : outcome === "failed" ? "COMMAND_FAILED" : "PROPOSAL_REJECTED", { commandId: proposal.commandId, reason: result && result.reason || null });
  try {
    var list = JSON.parse(localStorage.getItem(FEEDBACK_KEY) || "[]");
    if (!Array.isArray(list)) list = [];
    list.push({ at: Date.now(), outcome: outcome, commandId: proposal.commandId, reason: result && result.reason || null });
    localStorage.setItem(FEEDBACK_KEY, JSON.stringify(list.slice(-200)));
  } catch (_) {}
}
function line(role, text) {
  var row = el("div", "agent-line agent-" + role);
  row.innerHTML = '<span class="agent-avatar"><i class="ph ' + (role === "user" ? "ph-person" : "ph-robot") + '"></i></span><div>' + escapeHTML(text).replace(/\n/g, "<br>") + "</div>";
  messagesEl.appendChild(row);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return row;
}
function setBusy(value, label) {
  busy = value;
  if (sendBtn) sendBtn.disabled = value;
  if (cancelBtn) cancelBtn.hidden = !value;
  if (statusEl) statusEl.textContent = label || (value ? t("agent_thinking") : t("agent_ready"));
}
function renderAgentProgress() {
  if (!progressEl || !progressState) return;
  var phase = progressState.phase || "prompt", label;
  if (phase === "generating") label = t("agent_progress_generating");
  else if (phase === "retry") label = t("agent_progress_retry");
  else if (phase === "tool") label = t("agent_progress_tool", {
    current: progressState.current || 1, total: progressState.total || 1, name: progressState.name || "tool",
  });
  else if (phase === "preview") label = t("agent_progress_preview");
  else if (phase === "complete") label = t("agent_progress_complete");
  else label = t("agent_progress_prompt");
  var stats = [];
  if (phase !== "complete") stats.push(t("agent_progress_elapsed", {
    seconds: ((performance.now() - progressState.beganAt) / 1000).toFixed(1),
  }));
  if (Number.isFinite(progressState.tokensPerSecond) && progressState.tokensPerSecond > 0)
    stats.push(t("agent_progress_tps", { rate: progressState.tokensPerSecond.toFixed(1),
      approximate: progressState.estimated ? "~" : "" }));
  if (phase === "complete" && (progressState.inputTokens || progressState.outputTokens))
    stats.push(t("agent_progress_tokens", { input: progressState.inputTokens || 0,
      output: progressState.outputTokens || 0 }));
  if (phase === "complete" && Number.isFinite(progressState.timeToFirstTokenMs))
    stats.push(t("agent_progress_ttft", { seconds: (progressState.timeToFirstTokenMs / 1000).toFixed(2) }));
  progressEl.hidden = false;
  progressEl.dataset.phase = phase;
  progressEl.querySelector(".agent-progress-label").textContent = label;
  progressEl.querySelector(".agent-progress-stats").textContent = stats.join(" · ");
}
function beginAgentProgress() {
  if (progressTimer) clearInterval(progressTimer);
  progressState = { phase: "prompt", beganAt: performance.now() };
  renderAgentProgress();
  progressTimer = setInterval(renderAgentProgress, 200);
}
function updateAgentProgress(detail) {
  if (!progressState) beginAgentProgress();
  progressState = Object.assign({}, progressState, detail || {});
  if (progressState.phase === "complete" && progressTimer) {
    clearInterval(progressTimer); progressTimer = null;
  }
  renderAgentProgress();
}
function clearAgentProgress() {
  if (progressTimer) clearInterval(progressTimer);
  progressTimer = null; progressState = null;
  if (progressEl) progressEl.hidden = true;
}

function proposalQuestion(proposal) {
  var preview = proposal && proposal.preview || {};
  if (proposal.incomplete) return t("agent_incomplete_preview", {
    count: proposal.commands && proposal.commands.length || 1,
    failed: proposal.failures && proposal.failures.length || 1,
  });
  if (proposal.commandId === "batch")
    return t("agent_batch_preview", { count: proposal.commands && proposal.commands.length || 0 });
  if (proposal.commandId === "item.move") {
    var name = String(preview.type || "item").replace(/([a-z])([A-Z])/g, "$1 $2");
    return t("agent_move_preview", { name: name.charAt(0).toUpperCase() + name.slice(1) });
  }
  return t("agent_apply_preview");
}

/* ---- grounding: name what the AI picked, check it, compare candidates ---- */

/* The live plan as js/agent_grounding.js reads it: the placement snapshot the
   AI's own resolver uses, plus the names, room names and door swings a person
   would recognise the result by. */
function liveGroundingScene() {
  var scene = livePlacementScene();
  var types = {}, named = {};
  Object.keys(FURN).forEach(function (type) { types[type] = flabel(type); });
  (S.items || []).forEach(function (it) { if (it && it.name) named[String(it.id)] = it.name; });
  scene.names = { types: types, items: named };
  scene.roomNames = {};
  (scene.rooms || []).forEach(function (room) { scene.roomNames[room.key] = roomName(room.key); });
  scene.swings = [];
  (S.openings || []).forEach(function (o) {
    if (o && o.type === "door") swingPolysForOpening(o).forEach(function (sw) {
      scene.swings.push({ openingId: o.id, poly: sw.poly, band: sw.band });
    });
  });
  return scene;
}
/* Candidates are compared on the plan, so they must be in view — and not under
   the helper, which floats over the plan's end side. Pans (zooming out only if
   they cannot fit) so every part lands in the uncovered area; a set that is
   already visible leaves the user's view alone. */
function frameCandidates(candidates) {
  var pts = [];
  candidates.forEach(function (cand) {
    cand.parts.forEach(function (part) {
      var r = part.footprint ? Math.max(part.footprint.w, part.footprint.d) / 2 : 20;
      pts.push({ x: part.at.x - r, z: part.at.z - r }, { x: part.at.x + r, z: part.at.z + r });
      var from = part.footprint && part.footprint.source;
      if (part.action === "move" && from && isFinite(from.x)) pts.push({ x: from.x, z: from.z });
    });
  });
  var plan = document.getElementById("plan");
  if (!pts.length || !plan || !(S.SC > 0) || !(S.CW > 0) || !(S.CH > 0)) return;
  var pr = plan.getBoundingClientRect(), dr = dock && dock.classList.contains("on") ? dock.getBoundingClientRect() : null;
  var left = 0, right = S.CW, m = 40;
  if (dr && dr.left < pr.right && dr.right > pr.left && dr.top < pr.bottom && dr.bottom > pr.top) {
    if (dr.left - pr.left > pr.width / 3) right = Math.max(160, dr.left - pr.left);
    else left = Math.min(S.CW - 160, dr.right - pr.left);
  }
  var shown = pts.every(function (p) {
    var q = rotatePx(sx(p.x), sz(p.z));
    return q.x > left + m && q.x < right - m && q.y > m && q.y < S.CH - m;
  });
  if (shown) return;
  var minx = Infinity, maxx = -Infinity, minz = Infinity, maxz = -Infinity;
  pts.forEach(function (p) { minx = Math.min(minx, p.x); maxx = Math.max(maxx, p.x); minz = Math.min(minz, p.z); maxz = Math.max(maxz, p.z); });
  var turned = Math.abs(Math.sin(planRotRad())) > 0.5;
  var spanX = (turned ? maxz - minz : maxx - minx) * S.SC, spanY = (turned ? maxx - minx : maxz - minz) * S.SC;
  var need = Math.max(spanX / Math.max(1, right - left - 2 * m), spanY / Math.max(1, S.CH - 2 * m));
  if (need > 1) S.SC = S.SC / need;
  var target = unrotatePx((left + right) / 2, S.CH / 2);
  S.OX = target.x - (minx + maxx) / 2 * S.SC;
  S.OY = target.y - (minz + maxz) / 2 * S.SC;
  render2D();
}
/* Why the plan refused: the reasons a person can act on get words, the rest
   stay as their code so a bug report still names them. */
function failureText(reason) {
  if (reason === "PROTECTED_STRUCTURE") return t("redesign_protected");
  var key = "ag_why_" + reason, text = t(key);
  return text && text !== key ? text : String(reason || "PREVIEW_FAILED");
}
function metres(cm) { return (Number(cm) / 100).toFixed(2) + " m"; }
function partText(part) {
  var who = part.name + (part.id != null ? " " + partCode("item", part.id) : "");
  var text = part.action === "move" ? t("ag_move", { name: who })
    : part.action === "copy" ? t("ag_copy", { name: who })
    : part.kind === "wall" ? t("ag_new_wall", { len: metres(part.length) })
    : part.kind === "door" ? t("ag_new_door", { wall: partCode("wall", part.hostWallId) })
    : part.kind === "window" ? t("ag_new_window", { wall: partCode("wall", part.hostWallId) })
    : part.kind === "opening" ? t("ag_new_opening", { wall: partCode("wall", part.hostWallId) })
    : part.kind === "room" ? t("ag_new_room", { area: part.area.toFixed(1) })
    : t("ag_new", { name: part.name });
  return part.room ? t("ag_in_room", { part: text, room: part.room }) : text;
}
/* The plan tag stays short: letter, name and id; the card carries the rest. */
function tagText(part) {
  var who = part.kind === "item" ? part.name + (part.id != null ? " " + partCode("item", part.id) : "")
    : part.kind === "wall" ? t("ag_new_wall", { len: metres(part.length) })
    : part.kind === "room" ? t("ag_new_room", { area: part.area.toFixed(1) })
    : part.kind === "door" ? t("ag_new_door", { wall: partCode("wall", part.hostWallId) })
    : part.kind === "window" ? t("ag_new_window", { wall: partCode("wall", part.hostWallId) })
    : t("ag_new_opening", { wall: partCode("wall", part.hostWallId) });
  return (part.letter ? part.letter + " · " : "") + who;
}
function checkText(check) {
  if (check.code === "overlap") return t("ag_chk_overlap", { with: check.with }) + (check.more ? t("ag_chk_more", { n: check.more }) : "");
  if (check.code === "room") return check.room ? t("ag_chk_room", { room: check.room }) : t("ag_chk_roomAny");
  if (check.code === "wallLength" || check.code === "wallShort") return t("ag_chk_" + check.code, { len: metres(check.length) });
  if (check.code === "roomArea" || check.code === "roomSmall") return t("ag_chk_" + check.code, { area: Number(check.area).toFixed(1) });
  return t("ag_chk_" + check.code, { wall: check.wall, door: check.door });
}
/* No checks means nothing was checked — say nothing rather than "all clear". */
function checksSummary(checks) {
  if (!checks.length) return "";
  var warn = checks.filter(function (c) { return c.level === "warn"; }).length;
  return warn ? t("ag_to_review", { n: warn }) : t("ag_all_clear");
}
function candidateTags(candidate, tone) {
  return candidate.parts.map(function (part) {
    return { at: part.at, text: tagText(part), tone: checksLevel(candidate.checks) === "warn" ? "warn" : tone };
  });
}
function groundingList(candidate) {
  var box = el("div", "agent-ground");
  var parts = el("ul", "agent-parts");
  parts.setAttribute("aria-label", t("ag_parts"));
  candidate.parts.forEach(function (part) {
    var li = el("li");
    li.innerHTML = (part.letter ? '<b class="agent-letter">' + escapeHTML(part.letter) + "</b>" : '<i class="ph ph-crosshair" aria-hidden="true"></i>') +
      "<span></span>";
    li.querySelector("span").textContent = partText(part);
    parts.appendChild(li);
  });
  var checks = el("ul", "agent-checks");
  checks.setAttribute("aria-label", t("ag_checks"));
  checks.title = t("ag_advice");
  // Warnings first: they are what the user has to judge.
  candidate.checks.slice().sort(function (a, b) { return (a.level === "warn" ? 0 : 1) - (b.level === "warn" ? 0 : 1); }).forEach(function (check) {
    var li = el("li", "agent-check-" + check.level);
    li.innerHTML = '<i class="ph ' + (check.level === "warn" ? "ph-warning" : "ph-check") + '" aria-hidden="true"></i><span></span>';
    li.querySelector("span").textContent = checkText(check) + (candidate.parts.length > 1 && check.name ? " · " + check.name : "");
    checks.appendChild(li);
  });
  if (candidate.parts.length) box.appendChild(parts);
  if (candidate.checks.length) box.appendChild(checks);
  return box;
}

/* After Apply: Undo while the AI's step is still the latest, and a way to
   correct it by hand — select exactly what it created or changed. */
function appliedCard(card, result) {
  card.className = "agent-proposal " + (result.ok ? "agent-proposal-applied" : "agent-proposal-failed");
  card.innerHTML = '<strong><i class="ph ' + (result.ok ? "ph-check-circle" : "ph-warning-circle") + '"></i> ' +
    escapeHTML(result.ok ? t("agent_applied_short") : t("agent_failed") + ": " + failureText(result.reason)) + "</strong>";
  if (!result.ok) return;
  var actions = el("div", "agent-proposal-actions");
  var undoBtn = el("button", null, t("ag_undo"));
  var adjust = el("button", null, t("ag_adjust"));
  adjust.title = t("ag_adjust_tip");
  undoBtn.onclick = function () {
    if (result.historyId == null || currentHistoryId() !== result.historyId) {
      undoBtn.disabled = true;
      undoBtn.title = t("ag_undo_later");
      card.appendChild(el("small", "agent-choice-overflow", t("ag_undo_later")));
      return;
    }
    undo();
    card.className = "agent-proposal agent-proposal-undone";
    card.innerHTML = '<strong><i class="ph ph-arrow-u-up-left"></i> ' + escapeHTML(t("ag_undone")) + "</strong>";
  };
  adjust.onclick = function () {
    var touched = (result.created || []).concat(result.changed || []).filter(function (entry) { return entry && entry.kind !== "node"; });
    var ref = null, kind = null;
    for (var i = 0; i < touched.length && !ref; i++) {
      var entry = touched[i];
      kind = entry.kind;
      ref = kind === "item" ? (S.items || []).find(function (it) { return String(it.id) === String(entry.id); })
        : kind === "wall" ? (S.walls || []).find(function (w) { return String(w.id) === String(entry.id); })
        : kind === "opening" ? (S.openings || []).find(function (o) { return String(o.id) === String(entry.id); }) : null;
    }
    if (window.__setViewMode) window.__setViewMode("plan");
    setTool("select");
    if (ref) select({ kind: kind, ref: ref });
    closeAgent();
  };
  actions.append(undoBtn, adjust);
  card.appendChild(actions);
}
/* Until three.js has loaded, every item reads as floor-standing (a ceiling light
   "overlaps" the sofa under it). The app says when real heights are known;
   a card still waiting for its answer is grounded again then. */
function regroundWhenHeightsKnown(card, proposal, update) {
  function again() {
    window.removeEventListener("vspan:ready", again);
    if (!card.isConnected || pendingProposalCard !== card) return;
    update(groundCandidates(proposal, liveGroundingScene()));
  }
  window.addEventListener("vspan:ready", again);
}
function applyProposal(card, proposal) {
  clearAgentPreview();
  card.querySelectorAll("button").forEach(function (entry) { entry.disabled = true; });
  var result = executePlannerProposal(proposal, { ai: true });
  recordFeedback(result.ok ? "accepted" : "failed", proposal, result);
  pendingProposalCard = null;
  appliedCard(card, result);
  return result;
}
function cardNotes(card, proposal) {
  if (proposal.truncatedChoices) card.appendChild(el("small", "agent-choice-overflow",
    t("agent_choice_overflow", { count: proposal.truncatedChoices })));
  if (proposal.warnings && proposal.warnings.includes("CURVED_WALL_HOLD_UNSUPPORTED"))
    card.appendChild(el("small", "agent-choice-overflow", t("agent_curved_hold_warning")));
  if (proposal.warnings && proposal.warnings.includes("PRESERVED_WALL_HOLD"))
    card.appendChild(el("small", "agent-choice-overflow", t("agent_preserved_hold_warning")));
}

function proposalCard(proposal) {
  if (pendingProposalCard) pendingProposalCard.remove();
  var scene = liveGroundingScene();
  var candidates = groundCandidates(proposal, scene);
  frameCandidates(candidates);
  if (Array.isArray(proposal.choices) && proposal.choices.length) {
    /* Every candidate is on the plan at once, lettered, so they can be
       compared side by side. A letter focuses its candidate — ghost, tags and
       checks — and Apply takes the focused one: nothing applies on a glance. */
    var choiceCard = el("section", "agent-proposal agent-choice-proposal");
    if (proposal.incomplete) choiceCard.classList.add("agent-proposal-incomplete");
    var choiceTitle = el("strong");
    var letters = candidates.map(function (c) { return c.letter; });
    var pick = el("div", "agent-cands");
    pick.setAttribute("role", "radiogroup");
    var detail = el("div", "agent-cand-detail");
    var current = 0;
    var applyBtn = el("button", "btn-accent");
    function showChoice(index) {
      current = (index + candidates.length) % candidates.length;
      var cand = candidates[current], choice = cand.proposal;
      renderAgentCandidates(candidates.map(function (c, i) {
        return { spec: c.proposal.preview, tags: candidateTags(c, i === current ? "focus" : "dim") };
      }), current);
      var label = choice.choiceLabelKey ? t("agent_choice_" + choice.choiceLabelKey.replace(/-/g, "_")) : "";
      choiceTitle.innerHTML = '<i class="ph ph-eye"></i> ' + escapeHTML(
        label ? t("agent_choice_labeled", { option: cand.letter, label: label }) : t("agent_choice_preview", {
          option: cand.letter, choices: letters.join("/"),
        })
      );
      pick.querySelectorAll("button[data-choice]").forEach(function (button) {
        var on = Number(button.dataset.choice) === current;
        button.classList.toggle("on", on);
        button.setAttribute("aria-checked", on ? "true" : "false");
        button.tabIndex = on ? 0 : -1;
      });
      detail.replaceChildren(groundingList(cand));
      applyBtn.textContent = t("ag_apply_option", { option: cand.letter });
    }
    candidates.forEach(function (cand, index) {
      var choice = cand.proposal;
      var label = choice.choiceLabelKey ? t("agent_choice_" + choice.choiceLabelKey.replace(/-/g, "_")) : "";
      var button = el("button", "agent-cand agent-cand-" + checksLevel(cand.checks));
      button.type = "button";
      button.setAttribute("role", "radio");
      button.dataset.choice = index;
      button.innerHTML = '<b class="agent-letter"></b><span class="agent-cand-name"></span><small></small>';
      button.querySelector("b").textContent = cand.letter;
      button.querySelector(".agent-cand-name").textContent = label || cand.parts.map(partText).join(", ");
      button.querySelector("small").textContent = checksSummary(cand.checks);
      button.onclick = function () { showChoice(index); };
      button.ondblclick = function () { applyProposal(choiceCard, choice); };
      pick.appendChild(button);
    });
    applyBtn.onclick = function () { applyProposal(choiceCard, candidates[current].proposal); };
    regroundWhenHeightsKnown(choiceCard, proposal, function (fresh) {
      candidates = fresh;
      pick.querySelectorAll("button[data-choice]").forEach(function (button, i) {
        button.className = "agent-cand agent-cand-" + checksLevel(candidates[i].checks);
        button.querySelector("small").textContent = checksSummary(candidates[i].checks);
      });
      showChoice(current);
    });
    var choiceActions = el("div", "agent-proposal-actions agent-choice-actions");
    var choiceCancel = el("button", null, t("cancel"));
    var choiceFix = el("button", null, t("agent_fix"));
    choiceCancel.onclick = function () {
      clearAgentPreview(); recordFeedback("rejected", proposal); pendingProposalCard = null; choiceCard.remove();
    };
    choiceFix.onclick = function () { inputEl.placeholder = t("agent_fix_placeholder"); inputEl.focus(); };
    choiceActions.append(applyBtn, choiceCancel, choiceFix);
    var hint = el("small", "agent-cand-hint", t("ag_pick", { choices: letters.join("/") }));
    choiceCard.append(choiceTitle, hint, pick, detail, choiceActions);
    if (proposal.incomplete) choiceCard.appendChild(el("small", "agent-incomplete-message",
      t("agent_incomplete_choices", { failed: proposal.failures && proposal.failures.length || 1 })));
    cardNotes(choiceCard, proposal);
    choiceCard.addEventListener("keydown", function (event) {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      showChoice(current + (event.key === "ArrowRight" ? 1 : -1));
      var focused = pick.querySelector("button.on");
      if (focused) focused.focus();
    });
    messagesEl.appendChild(choiceCard); pendingProposalCard = choiceCard;
    showChoice(0);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return;
  }
  var only = candidates[0];
  renderAgentCandidates([{ spec: proposal.preview, tags: candidateTags(only, "focus") }], 0);
  var card = el("section", "agent-proposal");
  if (proposal.incomplete) card.classList.add("agent-proposal-incomplete");
  card.innerHTML = '<strong><i class="ph ph-eye"></i> ' + escapeHTML(proposalQuestion(proposal)) + '</strong>';
  var ground = groundingList(only);
  card.appendChild(ground);
  regroundWhenHeightsKnown(card, proposal, function (fresh) {
    only = fresh[0];
    var next = groundingList(only);
    ground.replaceWith(next);
    ground = next;
    renderAgentCandidates([{ spec: proposal.preview, tags: candidateTags(only, "focus") }], 0);
  });
  var actions = el("div", "agent-proposal-actions");
  var accept = el("button", "btn-accent", t("agent_yes"));
  var reject = el("button", null, t("cancel"));
  var fix = el("button", null, t("agent_fix"));
  actions.append(accept, reject, fix); card.appendChild(actions); messagesEl.appendChild(card);
  cardNotes(card, proposal);
  pendingProposalCard = card;
  reject.onclick = function () {
    pendingProposalCard = null;
    clearAgentPreview(); recordFeedback("rejected", proposal);
    card.remove();
  };
  fix.onclick = function () {
    inputEl.placeholder = t("agent_fix_placeholder");
    inputEl.focus();
  };
  accept.onclick = function () { applyProposal(card, proposal); };
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function renderDecision(decision) {
  var answer = decision && (decision.question || decision.message) || t("agent_no_answer");
  line("assistant", answer);
  if (decision && Array.isArray(decision.options) && decision.options.length) {
    var choices = el("div", "agent-question-options");
    decision.options.forEach(function (option, index) {
      var button = el("button", null, String.fromCharCode(65 + index) + " · " + option);
      button.onclick = function () {
        var prerequisite = decision.evidence && decision.evidence.some(function (entry) { return entry.type === "failed-prerequisite"; });
        if (prerequisite && option === decision.options[0]) {
          spotlightPlannerTarget("#plan", 6000);
          line("assistant", t("agent_valid_walls_hint"));
          return;
        }
        inputEl.value = option; inputEl.focus();
      };
      choices.appendChild(button);
    });
    messagesEl.appendChild(choices);
  }
  return answer;
}

function renderLocalFailure(question, actions) {
  line("assistant", question);
  var choices = el("div", "agent-question-options");
  actions.forEach(function (action, index) {
    var button = el("button", null, String.fromCharCode(65 + index) + " · " + action.label);
    button.onclick = function () { action.select(choices); };
    choices.appendChild(button);
  });
  messagesEl.appendChild(choices);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return question;
}

function renderProposalFailure(failure) {
  if (failure && failure.reason === "JOINT_PLACEMENT_CONFLICT") {
    var question = t("agent_joint_conflict");
    return renderLocalFailure(question, [
      { label: t("agent_joint_conflict_one"), select: function () {
        inputEl.value = t("agent_joint_conflict_one"); inputEl.focus();
      } },
      { label: t("agent_joint_conflict_alternatives"), select: function () {
        inputEl.value = t("agent_joint_conflict_alternatives"); inputEl.focus();
      } },
      { label: t("cancel"), select: function (choices) { choices.remove(); } },
    ]);
  }
  var message = t("agent_failed") + ": " + failureText(failure && failure.reason || "PREVIEW_FAILED");
  line("assistant", message);
  return message;
}

async function chatAgentConfig() {
  var config = loadAgentConfig();
  if (config.provider !== "lmstudio" || config.model) return config;
  var models = await listAgentModels(config);
  if (!models.length) throw new Error("MODEL_REQUIRED");
  return saveAgentConfig(Object.assign({}, config, { model: models[0] }));
}

async function sendCurrent() {
  var text = inputEl.value.trim();
  if (!text || busy) return;
  inputEl.value = "";
  inputEl.placeholder = t("agent_placeholder");
  if (pendingProposalCard) {
    pendingProposalCard.remove(); pendingProposalCard = null; clearAgentPreview();
  }
  line("user", text);
  conversation.push({ role: "user", content: text });
  persistConversation();
  setBusy(true); beginAgentProgress();
  var id = ++requestSeq, controller = new AbortController();
  activeRequest = { id: id, controller: controller };
  try {
    var config = await chatAgentConfig();
    if (!activeRequest || activeRequest.id !== id) return;
    var result = await runAgentTurn(config, conversation, {
      signal: controller.signal, onProgress: updateAgentProgress,
    });
    if (!activeRequest || activeRequest.id !== id) return;
    var answer = result.proposal ? "Preview pending confirmation: " + result.proposal.commandId
      : result.proposalFailure ? renderProposalFailure(result.proposalFailure)
        : renderDecision(result.decision);
    conversation.push({ role: "assistant", content: answer });
    persistConversation();
    if (result.proposal) proposalCard(result.proposal);
    setBusy(false, t("agent_ready"));
  } catch (error) {
    if (!activeRequest || activeRequest.id !== id) return;
    if (error && error.name === "AbortError") line("assistant", t("agent_cancelled"));
    else if (error && error.name === "TimeoutError") line("assistant", t("agent_timeout"));
    else if (error && error.name === "ConnectionError") line("assistant", t("agent_interrupted"));
    else
    line("assistant", t("agent_failed") + ": " + (error.message || error));
    clearAgentProgress();
    setBusy(false, t("agent_disconnected"));
  } finally { if (activeRequest && activeRequest.id === id) activeRequest = null; }
}

export function openAgent() {
  if (!dock) initAgent(false);
  dock.classList.add("on");
  var launch = document.getElementById("agentBtn"); if (launch) launch.classList.remove("needs-attention");
  inputEl.focus();
}
export function closeAgent() { if (dock) dock.classList.remove("on"); }
/* Send a request typed or spoken somewhere else (the ribbon's Ask box) through
   the same path as the dock's own input, so it gets the same context, preview
   and confirmation. */
export function askAgent(text) {
  if (!dock || !text || !String(text).trim()) return false;
  openAgent();
  inputEl.value = String(text).trim();
  sendCurrent();
  return true;
}
export function toggleAgent() { dock && dock.classList.contains("on") ? closeAgent() : openAgent(); }

export function buildAgentSettingsPane() {
  var config = loadAgentConfig(), root = el("div", "agent-settings");
  root.innerHTML = '<div class="agent-settings-intro"><i class="ph ph-robot"></i><div><strong>' + escapeHTML(t("agent_settings_title")) + '</strong><p>' + escapeHTML(t("agent_settings_intro")) + '</p></div></div>';
  var form = el("div", "agent-settings-form");
  var connection = el("section", "agent-connection-card");
  connection.appendChild(el("strong", "agent-settings-section-title", t("agent_connection_title")));
  var connectionHint = el("p", "agent-settings-section-hint", t("agent_connection_hint"));
  connection.appendChild(connectionHint); form.appendChild(connection);
  function field(label, control, host = connection) {
    var wrap = el("label", "agent-field"); wrap.append(el("span", null, label), control); host.appendChild(wrap); return wrap;
  }
  var provider = document.createElement("select");
  [["ollama", t("agent_provider_local")], ["lmstudio", t("agent_provider_lmstudio")], ["gemini", t("agent_provider_gemini")], ["server", t("agent_provider_server")], ["openai", t("agent_provider_custom")]].forEach(function (pair) { var o = el("option", null, pair[1]); o.value = pair[0]; provider.appendChild(o); });
  provider.value = config.provider; provider.dataset.role = "provider"; field(t("agent_provider"), provider);
  var modelWrap = el("div", "agent-model-picker");
  var model = el("input"); model.value = config.model; model.placeholder = t("agent_model_placeholder");
  model.dataset.role = "model"; model.setAttribute("list", "agentModelSuggestions");
  var modelSuggestions = document.createElement("datalist"); modelSuggestions.id = "agentModelSuggestions";
  var discover = el("button", null, t("agent_discover_models")); discover.type = "button";
  modelWrap.append(model, discover, modelSuggestions); field(t("agent_model"), modelWrap);
  var modelNote = el("small", "agent-model-note", t("agent_model_safety")); connection.appendChild(modelNote);

  var advanced = el("details", "agent-settings-advanced");
  advanced.appendChild(el("summary", null, t("agent_advanced")));
  var advancedBody = el("div", "agent-settings-advanced-body"); advanced.appendChild(advancedBody); form.appendChild(advanced);
  var endpoint = el("input"); endpoint.value = config.endpoint; endpoint.placeholder = "http://localhost:11434";
  endpoint.dataset.role = "endpoint"; var endpointField = field(t("agent_endpoint"), endpoint, advancedBody);
  var key = el("input"); key.type = "password"; key.value = agentApiKey(); key.autocomplete = "off";
  key.dataset.role = "api-key"; var keyField = field(t("agent_api_key"), key, advancedBody);
  var bridgeKey = el("input"); bridgeKey.type = "password"; bridgeKey.value = agentBridgeToken(); bridgeKey.autocomplete = "off";
  bridgeKey.dataset.role = "bridge-key"; field(t("agent_bridge_token"), bridgeKey, advancedBody);
  var checks = el("div", "agent-context-checks");
  [["fullContext", t("agent_full_context")], ["includeEntities", t("agent_ctx_entities")], ["includeHistory", t("agent_ctx_history")], ["includeTutorial", t("agent_ctx_tutorial")],
    ["includeAttention", t("agent_ctx_attention")], ["proactiveTutor", t("agent_proactive")], ["persistConversation", t("agent_persist_chat")],
    ["externalBridge", t("agent_external_bridge")]].forEach(function (pair) {
    var label = el("label"), input = el("input"); input.type = "checkbox"; input.checked = config[pair[0]]; input.dataset.key = pair[0]; label.append(input, document.createTextNode(pair[1])); checks.appendChild(label);
  });
  advancedBody.appendChild(checks);
  var dataActions = el("div", "agent-data-actions");
  var exportData = el("button", null, t("agent_export_tutor_data"));
  var resetData = el("button", null, t("agent_reset_tutor_data"));
  dataActions.append(exportData, resetData); advancedBody.appendChild(dataActions);
  var actions = el("div", "agent-settings-actions"), test = el("button", null, t("agent_test")), save = el("button", "btn-accent", t("save")), result = el("span", "agent-test-result");
  actions.append(test, save, result); form.appendChild(actions); root.appendChild(form);
  function read() {
    var next = { provider: provider.value, endpoint: endpoint.value, model: model.value };
    checks.querySelectorAll("input").forEach(function (input) { next[input.dataset.key] = input.checked; });
    return next;
  }
  function syncProvider() {
    endpoint.disabled = provider.value === "server";
    keyField.hidden = provider.value === "lmstudio" || provider.value === "ollama" || provider.value === "server";
    connectionHint.textContent = t("agent_provider_hint_" + provider.value);
    if (provider.value === "lmstudio") {
      endpoint.placeholder = "http://localhost:1234/v1";
    } else if (provider.value === "gemini") {
      endpoint.placeholder = "https://generativelanguage.googleapis.com/v1beta/openai";
    } else if (provider.value === "ollama") {
      endpoint.placeholder = "http://localhost:11434";
    } else if (provider.value === "openai") {
      endpoint.placeholder = "https://api.openai.com/v1";
    }
  }
  var providerDrafts = {};
  providerDrafts[config.provider] = { endpoint: config.endpoint, model: config.model };
  var previousProvider = provider.value;
  var providerDefaults = {
    lmstudio: { endpoint: "http://localhost:1234/v1", model: "" },
    ollama: { endpoint: "http://localhost:11434", model: "" },
    gemini: { endpoint: "https://generativelanguage.googleapis.com/v1beta/openai", model: "gemini-3.7-flash" },
    openai: { endpoint: "https://api.openai.com/v1", model: "" },
    server: { endpoint: "", model: "" },
  };
  provider.onchange = function() {
    providerDrafts[previousProvider] = { endpoint: endpoint.value, model: model.value };
    previousProvider = provider.value;
    var draft = providerDrafts[provider.value] || providerDefaults[provider.value];
    endpoint.value = draft.endpoint; model.value = draft.model;
    syncProvider();
  };
  syncProvider();
  key.oninput = function () { setAgentApiKey(key.value); };
  bridgeKey.oninput = function () { setAgentBridgeToken(bridgeKey.value); };
  function showModels(models) {
    modelSuggestions.innerHTML = "";
    models.forEach(function(id) { var option = document.createElement("option"); option.value = id; modelSuggestions.appendChild(option); });
    return models;
  }
  discover.onclick = async function() {
    discover.disabled = true; result.dataset.status = "testing"; result.textContent = t("agent_discovering_models");
    try {
      setAgentApiKey(key.value);
      var models = showModels(await listAgentModels(read()));
      result.dataset.status = "ready";
      result.textContent = t("agent_models_found", { count: models.length });
      model.focus();
    } catch (error) {
      result.dataset.status = "error"; result.textContent = t("agent_failed") + ": " + (error.message || error);
    }
    discover.disabled = false;
  };
  exportData.onclick = function () {
    var feedback = [];
    try { feedback = JSON.parse(localStorage.getItem(FEEDBACK_KEY) || "[]"); } catch (_) {}
    var payload = { exportedAt: new Date().toISOString(), context: projectAgentContext({ entityLimit: 80, historyLimit: 40 }), feedback: feedback };
    var url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
    var anchor = document.createElement("a"); anchor.href = url; anchor.download = "modelforge-tutor-data.json"; anchor.click();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  };
  resetData.onclick = function () {
    if (!confirm(t("agent_reset_tutor_confirm"))) return;
    resetTutorProgress(); tutorAttention.clear();
    try { localStorage.removeItem(FEEDBACK_KEY); localStorage.removeItem(CONVERSATION_KEY); } catch (_) {}
    conversation = []; result.textContent = t("agent_tutor_data_reset");
  };
  save.onclick = function () {
    var checked = validateAgentConfig(read());
    if (!checked.ok) { result.dataset.status = "error"; result.textContent = t("agent_failed") + ": " + checked.reason; return; }
    saveAgentConfig(read()); setAgentApiKey(key.value); setAgentBridgeToken(bridgeKey.value); persistConversation();
    result.dataset.status = "saved"; result.textContent = t("agent_saved_model", { model: model.value.trim() });
  };
  test.onclick = async function () {
    test.disabled = true; result.dataset.status = "testing"; result.textContent = t("agent_testing");
    try {
      setAgentApiKey(key.value);
      if (model.value.startsWith("models/")) model.value = model.value.replace(/^models\//, "");
      var models = await listAgentModels(read());
      if (provider.value !== "server" && !model.value.trim()) throw new Error("MODEL_REQUIRED");
      if (models.length && !models.includes(model.value.trim())) throw new Error("SELECTED_MODEL_NOT_AVAILABLE");
      if (provider.value === "gemini") await sendAgentChat(read(), [
        { role: "user", content: "Call the connection probe." },
      ], [{ type: "function", function: { name: "agent_connection_probe",
        description: "Verify that chat and function calling are operational.",
        parameters: { type: "object" } } }], {
        toolChoice: "required", timeoutMs: 30000, transientRetries: 0,
      });
      saveAgentConfig(read());
      setAgentBridgeToken(bridgeKey.value);
      persistConversation();
      result.dataset.status = "connected";
      result.textContent = t("agent_connected_model", { model: model.value.trim() || t("agent_provider_server") });
    } catch (error) { result.dataset.status = "error"; result.textContent = t("agent_failed") + ": " + (error.message || error); }
    test.disabled = false;
  };
  return root;
}

export function initAgent(installBridge = true) {
  if (dock) return;
  if (installBridge) installAgentBridge();
  dock = el("aside", "agent-dock"); dock.id = "agent-dock";
  dock.innerHTML = '<header><div><i class="ph ph-robot"></i><strong>' + escapeHTML(t("agent_title")) + '</strong><span id="agentStatus">' + escapeHTML(t("agent_ready")) + '</span></div><button id="agentCancel" hidden title="' + escapeHTML(t("agent_cancel")) + '"><i class="ph ph-stop-circle"></i></button><button id="agentSettings" title="' + escapeHTML(t("settings_title")) + '"><i class="ph ph-gear"></i></button><button id="agentClear" title="' + escapeHTML(t("agent_clear")) + '"><i class="ph ph-trash"></i></button><button id="agentClose" title="' + escapeHTML(t("close")) + '"><i class="ph ph-x"></i></button></header><div id="agentProgress" class="agent-progress" role="status" aria-live="polite" hidden><span class="agent-progress-track"><span></span></span><span class="agent-progress-label"></span><span class="agent-progress-stats"></span></div><div id="agentMessages"></div><details class="agent-context-inspector"><summary><i class="ph ph-code"></i> ' + escapeHTML(t("agent_context_inspector")) + '</summary><pre></pre></details><div class="agent-input-row"><textarea id="agentInput" rows="2" placeholder="' + escapeHTML(t("agent_placeholder")) + '"></textarea><button id="agentSend" class="btn-accent"><i class="ph ph-paper-plane-right"></i></button></div>';
  document.body.appendChild(dock);
  messagesEl = dock.querySelector("#agentMessages"); inputEl = dock.querySelector("#agentInput"); sendBtn = dock.querySelector("#agentSend"); statusEl = dock.querySelector("#agentStatus"); cancelBtn = dock.querySelector("#agentCancel"); inspectorPre = dock.querySelector(".agent-context-inspector pre"); progressEl = dock.querySelector("#agentProgress");
  dock.querySelector("#agentClose").onclick = closeAgent;
  dock.querySelector("#agentSettings").onclick = function () {
    window.dispatchEvent(new CustomEvent("agent-open-settings"));
  };
  dock.querySelector("#agentClear").onclick = function () {
    if (activeRequest) activeRequest.controller.abort();
    activeRequest = null; requestSeq++; conversation = []; messagesEl.innerHTML = ""; clearAgentPreview(); clearAgentProgress();
    try { localStorage.removeItem(CONVERSATION_KEY); } catch (_) {}
    setBusy(false);
  };
  cancelBtn.onclick = function () {
    if (activeRequest) activeRequest.controller.abort();
    activeRequest = null; requestSeq++; clearAgentProgress(); setBusy(false, t("agent_ready")); line("assistant", t("agent_cancelled"));
  };
  sendBtn.onclick = sendCurrent;
  inputEl.onkeydown = function (event) { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); sendCurrent(); } event.stopPropagation(); };
  var launch = document.getElementById("agentBtn"); if (launch) launch.onclick = toggleAgent;
  conversation = restoreConversation();
  if (conversation.length) conversation.forEach(function (entry) { line(entry.role === "user" ? "user" : "assistant", entry.content); });
  var inspector = dock.querySelector(".agent-context-inspector");
  function refreshInspector() {
    if (inspector.open) inspectorPre.textContent = JSON.stringify(projectAgentContext({ entityLimit: 80, historyLimit: 30 }), null, 2);
  }
  inspector.ontoggle = refreshInspector;
  setInterval(refreshInspector, 1000);
  window.addEventListener("agent-tutor-intervention", function (event) {
    var decision = event.detail || {};
    renderDecision(decision);
    if (launch && !dock.classList.contains("on")) launch.classList.add("needs-attention");
  });
  window.addEventListener("agent-external-proposal", function (event) {
    openAgent();
    proposalCard(event.detail);
  });
  window.dispatchEvent(new Event('agent-panel-ready'));
}
