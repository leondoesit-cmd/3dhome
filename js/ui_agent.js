import { t } from "./i18n.js";
import { escapeHTML } from "./safe.js";
import { loadAgentConfig, saveAgentConfig, validateAgentConfig, setAgentApiKey, agentApiKey, setAgentBridgeToken, agentBridgeToken } from "./agent_config.js";
import { listAgentModels, sendAgentChat } from "./agent_transport.js";
import { runAgentTurn, installAgentBridge } from "./agent_runtime.js";
import { executePlannerProposal } from "./interaction.js";
import { projectAgentContext } from "./agent_context.js";
import { renderAgentPreview, clearAgentPreview } from "./agent_preview.js";
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
function proposalCard(proposal) {
  if (pendingProposalCard) pendingProposalCard.remove();
  if (Array.isArray(proposal.choices) && proposal.choices.length) {
    var choiceCard = el("section", "agent-proposal agent-choice-proposal");
    if (proposal.incomplete) choiceCard.classList.add("agent-proposal-incomplete");
    var choiceTitle = el("strong");
    var choiceActions = el("div", "agent-proposal-actions agent-choice-actions");
    var current = 0, timer = null, engaged = false, letters = ["A", "B", "C", "D"];
    function showChoice(index) {
      current = index % proposal.choices.length;
      var choice = proposal.choices[current];
      renderAgentPreview(choice.preview);
      var label = choice.choiceLabelKey ? t("agent_choice_" + choice.choiceLabelKey.replace(/-/g, "_")) : "";
      choiceTitle.innerHTML = '<i class="ph ph-eye"></i> ' + escapeHTML(
        label ? t("agent_choice_labeled", { option: letters[current], label: label }) : t("agent_choice_preview", {
          option: letters[current], choices: letters.slice(0, proposal.choices.length).join("/")
        })
      );
      choiceActions.querySelectorAll("button[data-choice]").forEach(function(button) {
        button.classList.toggle("btn-accent", Number(button.dataset.choice) === current);
      });
    }
    function stopCarousel() { if (timer) clearInterval(timer); timer = null; }
    function engage() { if (engaged) return; engaged = true; stopCarousel(); }
    proposal.choices.forEach(function(choice, index) {
      var label = choice.choiceLabelKey ? t("agent_choice_" + choice.choiceLabelKey.replace(/-/g, "_")) : letters[index];
      var button = el("button", null, letters[index] + (choice.choiceLabelKey ? " · " + label : ""));
      button.dataset.choice = index;
      button.onclick = function () {
        engage(); clearAgentPreview();
        choiceActions.querySelectorAll("button").forEach(function(entry) { entry.disabled = true; });
        var result = executePlannerProposal(choice);
        recordFeedback(result.ok ? "accepted" : "failed", choice, result);
        pendingProposalCard = null;
        choiceCard.className = "agent-proposal " + (result.ok ? "agent-proposal-applied" : "agent-proposal-failed");
        choiceCard.innerHTML = '<strong><i class="ph ' + (result.ok ? "ph-check-circle" : "ph-warning-circle") + '"></i> ' +
          escapeHTML(result.ok ? t("agent_applied_short") : t("agent_failed") + ": " + (result.reason === "PROTECTED_STRUCTURE" ? t("redesign_protected") : result.reason)) + '</strong>';
      };
      choiceActions.appendChild(button);
    });
    var choiceCancel = el("button", null, t("cancel"));
    var choiceFix = el("button", null, t("agent_fix"));
    choiceCancel.onclick = function () {
      engage(); clearAgentPreview(); recordFeedback("rejected", proposal); pendingProposalCard = null; choiceCard.remove();
    };
    choiceFix.onclick = function () {
      engage(); inputEl.placeholder = t("agent_fix_placeholder"); inputEl.focus();
    };
    choiceActions.append(choiceCancel, choiceFix); choiceCard.append(choiceTitle, choiceActions);
    if (proposal.incomplete) choiceCard.appendChild(el("small", "agent-incomplete-message",
      t("agent_incomplete_choices", { failed: proposal.failures && proposal.failures.length || 1 })));
    if (proposal.truncatedChoices) choiceCard.appendChild(el("small", "agent-choice-overflow",
      t("agent_choice_overflow", { count: proposal.truncatedChoices })));
    if (proposal.warnings && proposal.warnings.includes("CURVED_WALL_HOLD_UNSUPPORTED"))
      choiceCard.appendChild(el("small", "agent-choice-overflow", t("agent_curved_hold_warning")));
    if (proposal.warnings && proposal.warnings.includes("PRESERVED_WALL_HOLD"))
      choiceCard.appendChild(el("small", "agent-choice-overflow", t("agent_preserved_hold_warning")));
    choiceCard.addEventListener("pointerenter", engage);
    choiceCard.addEventListener("focusin", engage);
    choiceCard.addEventListener("keydown", function(event) {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      engage(); event.preventDefault();
      showChoice(current + (event.key === "ArrowRight" ? 1 : proposal.choices.length - 1));
    });
    messagesEl.appendChild(choiceCard); pendingProposalCard = choiceCard;
    showChoice(0);
    timer = setInterval(function () {
      if (!choiceCard.isConnected) return stopCarousel();
      showChoice(current + 1);
    }, 1000);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return;
  }
  renderAgentPreview(proposal.preview);
  var card = el("section", "agent-proposal");
  if (proposal.incomplete) card.classList.add("agent-proposal-incomplete");
  card.innerHTML = '<strong><i class="ph ph-eye"></i> ' + escapeHTML(proposalQuestion(proposal)) + '</strong>';
  var actions = el("div", "agent-proposal-actions");
  var accept = el("button", "btn-accent", t("agent_yes"));
  var reject = el("button", null, t("cancel"));
  var fix = el("button", null, t("agent_fix"));
  actions.append(accept, reject, fix); card.appendChild(actions); messagesEl.appendChild(card);
  if (proposal.warnings && proposal.warnings.includes("CURVED_WALL_HOLD_UNSUPPORTED"))
    card.appendChild(el("small", "agent-choice-overflow", t("agent_curved_hold_warning")));
  if (proposal.warnings && proposal.warnings.includes("PRESERVED_WALL_HOLD"))
    card.appendChild(el("small", "agent-choice-overflow", t("agent_preserved_hold_warning")));
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
      escapeHTML(result.ok ? t("agent_applied_short") : t("agent_failed") + ": " + (result.reason === "PROTECTED_STRUCTURE" ? t("redesign_protected") : result.reason)) + '</strong>';
  };
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
  var message = t("agent_failed") + ": " + String(failure && failure.reason || "PREVIEW_FAILED");
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
  if (!dock) return;
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

export function initAgent() {
  installAgentBridge();
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
}
