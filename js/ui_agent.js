import { t } from "./i18n.js";
import { escapeHTML } from "./safe.js";
import { loadAgentConfig, saveAgentConfig, setAgentApiKey, agentApiKey, setAgentBridgeToken, agentBridgeToken } from "./agent_config.js";
import { listAgentModels } from "./agent_transport.js";
import { runAgentTurn, installAgentBridge } from "./agent_runtime.js";
import { executePlannerProposal } from "./interaction.js";
import { projectAgentContext } from "./agent_context.js";
import { renderAgentPreview, clearAgentPreview } from "./agent_preview.js";
import { tutorAttention } from "./tutor/attention_tracker.js";
import { spotlightPlannerTarget } from "./planner_tutorial.js";
import { resetTutorProgress } from "./tutor/progress.js";

let dock, messagesEl, inputEl, sendBtn, statusEl, cancelBtn, inspectorPre;
let conversation = [], busy = false, activeRequest = null, requestSeq = 0;
let pendingProposalCard = null;
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

function proposalQuestion(proposal) {
  var preview = proposal && proposal.preview || {};
  if (proposal.commandId === "batch")
    return t("agent_batch_preview", { count: proposal.commands && proposal.commands.length || 0 });
  if (proposal.commandId === "item.move") {
    var name = String(preview.type || "item").replace(/([a-z])([A-Z])/g, "$1 $2");
    return t("agent_move_preview", { name: name.charAt(0).toUpperCase() + name.slice(1) });
  }
  return t("agent_apply_preview");
}
function proposalCard(proposal) {
  if (pendingProposalCard) pendingProposalCard.remove();
  renderAgentPreview(proposal.preview);
  var card = el("section", "agent-proposal");
  card.innerHTML = '<strong><i class="ph ph-eye"></i> ' + escapeHTML(proposalQuestion(proposal)) + '</strong>';
  var actions = el("div", "agent-proposal-actions");
  var accept = el("button", "btn-accent", t("agent_yes"));
  var reject = el("button", null, t("cancel"));
  var fix = el("button", null, t("agent_fix"));
  actions.append(accept, reject, fix); card.appendChild(actions); messagesEl.appendChild(card);
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
  accept.onclick = function () {
    accept.disabled = reject.disabled = fix.disabled = true;
    clearAgentPreview();
    var result = executePlannerProposal(proposal);
    recordFeedback(result.ok ? "accepted" : "failed", proposal, result);
    pendingProposalCard = null;
    card.classList.add(result.ok ? "agent-proposal-applied" : "agent-proposal-failed");
    card.innerHTML = '<strong><i class="ph ' + (result.ok ? "ph-check-circle" : "ph-warning-circle") + '"></i> ' +
      escapeHTML(result.ok ? t("agent_applied_short") : t("agent_failed") + ": " + result.reason) + '</strong>';
  };
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function renderDecision(decision) {
  var answer = decision && (decision.question || decision.message) || t("agent_no_answer");
  line("assistant", answer);
  if (decision && Array.isArray(decision.options) && decision.options.length) {
    var choices = el("div", "agent-question-options");
    decision.options.forEach(function (option) {
      var button = el("button", null, option);
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
  setBusy(true);
  var id = ++requestSeq, controller = new AbortController();
  activeRequest = { id: id, controller: controller };
  try {
    var result = await runAgentTurn(loadAgentConfig(), conversation, { signal: controller.signal });
    if (!activeRequest || activeRequest.id !== id) return;
    var answer = result.proposal ? "Preview pending confirmation: " + result.proposal.commandId
      : renderDecision(result.decision);
    conversation.push({ role: "assistant", content: answer });
    persistConversation();
    if (result.proposal) proposalCard(result.proposal);
    setBusy(false, t("agent_ready"));
  } catch (error) {
    if (!activeRequest || activeRequest.id !== id) return;
    if (error && error.name === "AbortError") line("assistant", t("agent_cancelled"));
    else
    line("assistant", t("agent_failed") + ": " + (error.message || error));
    setBusy(false, t("agent_disconnected"));
  } finally { if (activeRequest && activeRequest.id === id) activeRequest = null; }
}

export function openAgent() {
  if (!dock) return;
  dock.classList.add("on");
  var launch = document.getElementById("agentBtn"); if (launch) launch.classList.remove("needs-attention");
  inputEl.focus();
}
export function closeAgent() { if (dock) dock.classList.remove("on"); }
export function toggleAgent() { dock && dock.classList.contains("on") ? closeAgent() : openAgent(); }

export function buildAgentSettingsPane() {
  var config = loadAgentConfig(), root = el("div", "agent-settings");
  root.innerHTML = '<div class="agent-settings-intro"><i class="ph ph-robot"></i><div><strong>' + escapeHTML(t("agent_settings_title")) + '</strong><p>' + escapeHTML(t("agent_settings_intro")) + '</p></div></div>';
  var form = el("div", "agent-settings-form");
  function field(label, control) { var wrap = el("label", "agent-field"); wrap.append(el("span", null, label), control); form.appendChild(wrap); return control; }
  var provider = document.createElement("select");
  [["ollama", t("agent_provider_local")], ["server", t("agent_provider_server")], ["openai", t("agent_provider_custom")]].forEach(function (pair) { var o = el("option", null, pair[1]); o.value = pair[0]; provider.appendChild(o); });
  provider.value = config.provider; field(t("agent_provider"), provider);
  var endpoint = el("input"); endpoint.value = config.endpoint; endpoint.placeholder = "http://localhost:11434"; field(t("agent_endpoint"), endpoint);
  var model = el("input"); model.value = config.model; model.placeholder = "qwen3:8b"; field(t("agent_model"), model);
  var key = el("input"); key.type = "password"; key.value = agentApiKey(); key.autocomplete = "off"; field(t("agent_api_key"), key);
  var bridgeKey = el("input"); bridgeKey.type = "password"; bridgeKey.value = agentBridgeToken(); bridgeKey.autocomplete = "off"; field(t("agent_bridge_token"), bridgeKey);
  var checks = el("div", "agent-context-checks");
  [["fullContext", t("agent_full_context")], ["includeEntities", t("agent_ctx_entities")], ["includeHistory", t("agent_ctx_history")], ["includeTutorial", t("agent_ctx_tutorial")],
    ["includeAttention", t("agent_ctx_attention")], ["proactiveTutor", t("agent_proactive")], ["persistConversation", t("agent_persist_chat")],
    ["externalBridge", t("agent_external_bridge")]].forEach(function (pair) {
    var label = el("label"), input = el("input"); input.type = "checkbox"; input.checked = config[pair[0]]; input.dataset.key = pair[0]; label.append(input, document.createTextNode(pair[1])); checks.appendChild(label);
  });
  form.appendChild(checks);
  var dataActions = el("div", "agent-data-actions");
  var exportData = el("button", null, t("agent_export_tutor_data"));
  var resetData = el("button", null, t("agent_reset_tutor_data"));
  dataActions.append(exportData, resetData); form.appendChild(dataActions);
  var actions = el("div", "agent-settings-actions"), test = el("button", null, t("agent_test")), save = el("button", "btn-accent", t("save")), result = el("span", "agent-test-result");
  actions.append(test, save, result); form.appendChild(actions); root.appendChild(form);
  function read() {
    var next = { provider: provider.value, endpoint: endpoint.value, model: model.value };
    checks.querySelectorAll("input").forEach(function (input) { next[input.dataset.key] = input.checked; });
    return next;
  }
  function syncProvider() { endpoint.disabled = provider.value === "server"; }
  provider.onchange = syncProvider; syncProvider();
  key.oninput = function () { setAgentApiKey(key.value); };
  bridgeKey.oninput = function () { setAgentBridgeToken(bridgeKey.value); };
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
  save.onclick = function () { saveAgentConfig(read()); setAgentApiKey(key.value); setAgentBridgeToken(bridgeKey.value); persistConversation(); result.textContent = t("agent_saved"); };
  test.onclick = async function () {
    test.disabled = true; result.textContent = t("agent_testing");
    try {
      setAgentApiKey(key.value);
      var models = await listAgentModels(read());
      if (!model.value && models[0]) model.value = models[0];
      result.textContent = t("agent_connected") + (models.length ? " · " + models.slice(0, 3).join(", ") : "");
    } catch (error) { result.textContent = t("agent_failed") + ": " + (error.message || error); }
    test.disabled = false;
  };
  return root;
}

export function initAgent() {
  installAgentBridge();
  dock = el("aside", "agent-dock"); dock.id = "agent-dock";
  dock.innerHTML = '<header><div><i class="ph ph-robot"></i><strong>' + escapeHTML(t("agent_title")) + '</strong><span id="agentStatus">' + escapeHTML(t("agent_ready")) + '</span></div><button id="agentCancel" hidden title="' + escapeHTML(t("agent_cancel")) + '"><i class="ph ph-stop-circle"></i></button><button id="agentClear" title="' + escapeHTML(t("agent_clear")) + '"><i class="ph ph-trash"></i></button><button id="agentClose" title="' + escapeHTML(t("close")) + '"><i class="ph ph-x"></i></button></header><div id="agentMessages"></div><details class="agent-context-inspector"><summary><i class="ph ph-code"></i> ' + escapeHTML(t("agent_context_inspector")) + '</summary><pre></pre></details><div class="agent-input-row"><textarea id="agentInput" rows="2" placeholder="' + escapeHTML(t("agent_placeholder")) + '"></textarea><button id="agentSend" class="btn-accent"><i class="ph ph-paper-plane-right"></i></button></div>';
  document.body.appendChild(dock);
  messagesEl = dock.querySelector("#agentMessages"); inputEl = dock.querySelector("#agentInput"); sendBtn = dock.querySelector("#agentSend"); statusEl = dock.querySelector("#agentStatus"); cancelBtn = dock.querySelector("#agentCancel"); inspectorPre = dock.querySelector(".agent-context-inspector pre");
  dock.querySelector("#agentClose").onclick = closeAgent;
  dock.querySelector("#agentClear").onclick = function () {
    if (activeRequest) activeRequest.controller.abort();
    activeRequest = null; requestSeq++; conversation = []; messagesEl.innerHTML = ""; clearAgentPreview();
    try { localStorage.removeItem(CONVERSATION_KEY); } catch (_) {}
    setBusy(false);
  };
  cancelBtn.onclick = function () {
    if (activeRequest) activeRequest.controller.abort();
    activeRequest = null; requestSeq++; setBusy(false, t("agent_ready")); line("assistant", t("agent_cancelled"));
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
}
