// Small, dependency-injected command transaction coordinator. Keeping the
// live planner history out of this module makes command execution testable in
// Node and lets other domains supply their own transaction adapter later.

function failure(reason, extra = {}) {
  return Object.assign({ ok: false, reason: reason || "COMMAND_FAILED" }, extra);
}

function commandShape(command) {
  return !!command && typeof command.id === "string" &&
    typeof command.prepare === "function" && typeof command.apply === "function";
}

function normalizeEnvironment(env) {
  if (!env || !env.state) throw new Error("Command environment requires state");
  return env;
}

function historyCurrent(history) {
  if (!history) return null;
  if (typeof history.current === "function") return history.current();
  if (typeof history.currentHistoryId === "function") return history.currentHistoryId();
  return history.position && history.position();
}

function historyBegin(history, label) {
  if (!history) throw new Error("Command environment requires history");
  if (typeof history.begin === "function") return history.begin(label || "");
  if (typeof history.beginHistoryTransaction === "function")
    return history.beginHistoryTransaction(label || "");
  throw new Error("History adapter cannot begin a transaction");
}

function historyCommit(history, token, label) {
  if (typeof history.commit === "function") return history.commit(token, label || "");
  if (typeof history.commitHistoryTransaction === "function")
    return history.commitHistoryTransaction(token, label || "");
  throw new Error("History adapter cannot commit a transaction");
}

function historyAbort(history, token) {
  if (typeof history.abort === "function") return history.abort(token);
  if (typeof history.abortHistoryTransaction === "function")
    return history.abortHistoryTransaction(token);
  throw new Error("History adapter cannot abort a transaction");
}

function sameJSON(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function prepareCommand(command, params, env) {
  env = normalizeEnvironment(env);
  if (!commandShape(command)) return failure("INVALID_COMMAND");
  var prepared;
  try {
    prepared = command.prepare(params || {}, env);
  } catch (error) {
    return failure("PREPARE_FAILED", { message: error && error.message || String(error) });
  }
  if (!prepared || prepared.ok === false)
    return failure(prepared && prepared.reason || "VALIDATION_FAILED", prepared || {});
  var plan = prepared.plan || prepared;
  if (!plan || typeof plan !== "object") return failure("INVALID_PLAN");
  return {
    ok: true,
    command: command,
    commandId: command.id,
    plan: plan,
    params: JSON.parse(JSON.stringify(params || {})),
    targets: prepared.targets || plan.targets || [],
  };
}

export function previewPrepared(prepared, env) {
  env = normalizeEnvironment(env);
  if (!prepared || !prepared.ok || !commandShape(prepared.command))
    return failure("INVALID_PLAN");
  if (typeof prepared.command.preview !== "function") return { ok: true, preview: null };
  try {
    var preview = prepared.command.preview(prepared.plan, env) || null;
    JSON.stringify(preview);
    return { ok: true, preview: preview };
  } catch (error) {
    return failure("PREVIEW_FAILED", { message: error && error.message || String(error) });
  }
}

function mergeEffects(into, effects) {
  if (!effects || typeof effects !== "object") return into;
  Object.keys(effects).forEach(function (key) {
    var value = effects[key];
    if (Array.isArray(value)) {
      if (!Array.isArray(into[key])) into[key] = [];
      into[key].push(...value);
    } else if (typeof value === "boolean") into[key] = !!into[key] || value;
    else if (value !== undefined) into[key] = value;
  });
  return into;
}

function refreshStalePrepared(entry, env, currentVersion) {
  var expected = entry.plan && entry.plan.expectedVersion;
  if (expected == null || currentVersion == null || expected === currentVersion) return entry;
  var refreshed = prepareCommand(entry.command, entry.params, env);
  if (!refreshed.ok) return failure(refreshed.reason, { stale: true });
  if (!sameJSON(entry.plan.params, refreshed.plan.params)) {
    return failure("PREVIEW_INVALIDATED", {
      expectedVersion: expected,
      currentVersion: currentVersion,
      previousParams: entry.plan.params,
      currentParams: refreshed.plan.params,
    });
  }
  return refreshed;
}

export function executePreparedBatch(preparedList, env, options = {}) {
  env = normalizeEnvironment(env);
  var list = Array.isArray(preparedList) ? preparedList.slice() : [];
  if (!list.length) return failure("EMPTY_COMMAND_BATCH");
  for (var i = 0; i < list.length; i++) {
    if (!list[i] || !list[i].ok || !commandShape(list[i].command))
      return failure("INVALID_PLAN", { index: i });
  }
  var useHistory = options.history !== false;
  var history = env.history || null;
  var currentVersion = historyCurrent(history);
  if (options.expectedVersion != null && currentVersion != null && options.expectedVersion !== currentVersion)
    return failure("STALE_DOCUMENT", { expectedVersion: options.expectedVersion, currentVersion: currentVersion });
  for (i = 0; i < list.length; i++) {
    var refreshed = refreshStalePrepared(list[i], env, currentVersion);
    if (!refreshed.ok) return Object.assign({ index: i }, refreshed);
    list[i] = refreshed;
  }

  var token = null, created = [], changed = [], results = [], effects = {};
  try {
    if (useHistory) token = historyBegin(history, options.label || "");
    for (i = 0; i < list.length; i++) {
      var entry = list[i];
      var result = entry.command.apply(entry.plan, env);
      if (!result || result.ok === false) {
        var error = new Error(result && result.reason || "COMMAND_FAILED");
        error.commandResult = result || null;
        error.commandIndex = i;
        throw error;
      }
      results.push(result);
      if (Array.isArray(result.created)) created.push(...result.created);
      if (Array.isArray(result.changed)) changed.push(...result.changed);
      mergeEffects(effects, result.effects);
    }
    if (typeof options.postValidate === "function") {
      var validation = options.postValidate({ results, created, changed, effects }, env);
      if (validation === false || validation && validation.ok === false) {
        var validationError = new Error(validation && validation.reason || "POST_VALIDATION_FAILED");
        validationError.commandResult = validation || null;
        throw validationError;
      }
    }
    if (useHistory) historyCommit(history, token, options.label || "");
    var output = {
      ok: true, results: results, created: created, changed: changed,
      effects: effects, historyId: historyCurrent(history),
    };
    var present = env.services && env.services.presentCommandResult;
    if (typeof present === "function") {
      try { present(output, options.presentation || null, env); }
      catch (presentationError) {
        // The document is already committed. A renderer/UI failure must never
        // masquerade as a command rollback or try to abort a closed token.
        output.presentationError = presentationError && presentationError.message || String(presentationError);
      }
    }
    return output;
  } catch (error) {
    if (useHistory && token) {
      try { historyAbort(history, token); }
      catch (abortError) {
        return failure("ROLLBACK_FAILED", {
          index: error.commandIndex,
          message: abortError && abortError.message || String(abortError),
        });
      }
    }
    return failure(error.commandResult && error.commandResult.reason || "EXECUTION_FAILED", {
      index: error.commandIndex,
      message: error && error.message || String(error),
    });
  }
}

export function executePrepared(prepared, env, options) {
  return executePreparedBatch([prepared], env, options);
}

export function executeCommand(command, params, env, options) {
  var prepared = prepareCommand(command, params, env);
  if (!prepared.ok) return prepared;
  return executePrepared(prepared, env, options);
}

export function executeCommandBatch(requests, env, options) {
  var list = Array.isArray(requests) ? requests : [], prepared = [];
  for (var i = 0; i < list.length; i++) {
    var entry = list[i] || {};
    var result = entry.plan
      ? { ok: true, command: entry.command, commandId: entry.command && entry.command.id,
          plan: entry.plan, params: JSON.parse(JSON.stringify(entry.params || entry.plan.params || {})) }
      : prepareCommand(entry.command, entry.params, env);
    if (!result.ok) return Object.assign({ index: i }, result);
    prepared.push(result);
  }
  return executePreparedBatch(prepared, env, options);
}

export function executeTransaction(request, env) {
  request = request || {};
  return executeCommandBatch(request.commands || [], env, {
    expectedVersion: request.expectedVersion,
    label: request.label,
    presentation: request.presentation,
    postValidate: request.postValidate,
    history: request.history,
  });
}
