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

function jsonClone(value, seen = new Set()) {
  if (value == null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Non-finite JSON number");
    return value;
  }
  if (typeof value !== "object" || seen.has(value)) throw new TypeError("Value is not plain JSON");
  seen.add(value);
  var out;
  if (Array.isArray(value)) out = value.map(function (entry) { return jsonClone(entry, seen); });
  else {
    var proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) throw new TypeError("Value is not a plain JSON object");
    out = {};
    Object.keys(value).forEach(function (key) {
      if (value[key] === undefined) throw new TypeError("Undefined is not JSON");
      out[key] = jsonClone(value[key], seen);
    });
  }
  seen.delete(value);
  return out;
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
  try { plan = jsonClone(plan); }
  catch (error) { return failure("INVALID_PLAN", { message: error.message }); }
  return {
    ok: true,
    command: command,
    commandId: command.id,
    plan: plan,
    params: jsonClone(params || {}),
    targets: jsonClone(prepared.targets || plan.targets || []),
  };
}

export function previewPrepared(prepared, env) {
  env = normalizeEnvironment(env);
  if (!prepared || !prepared.ok || !commandShape(prepared.command))
    return failure("INVALID_PLAN");
  if (typeof prepared.command.preview !== "function") return { ok: true, preview: null };
  try {
    var preview = jsonClone(prepared.command.preview(prepared.plan, env) || null);
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

function validateModelState(_result, env) {
  var state = env && env.state;
  if (!state || !Array.isArray(state.nodes) || !Array.isArray(state.walls) ||
      !Array.isArray(state.openings) || !Array.isArray(state.items)) return { ok: true };
  var wallIds = new Set(), entityIds = new Set();
  for (var i = 0; i < state.nodes.length; i++) {
    var node = state.nodes[i];
    if (!node || !Number.isFinite(Number(node.x)) || !Number.isFinite(Number(node.z)))
      return { ok: false, reason: "POST_VALIDATION_FAILED" };
  }
  for (i = 0; i < state.walls.length; i++) {
    var wall = state.walls[i], wallId = wall && String(wall.id);
    if (!wall || wallIds.has(wallId) || !state.nodes[wall.a] || !state.nodes[wall.b] || wall.a === wall.b)
      return { ok: false, reason: "POST_VALIDATION_FAILED" };
    wallIds.add(wallId);
    entityIds.add("wall:" + wallId);
  }
  for (i = 0; i < state.openings.length; i++) {
    var opening = state.openings[i], openingKey = opening && "opening:" + opening.id;
    if (!opening || entityIds.has(openingKey) || !wallIds.has(String(opening.wall)) ||
        !Number.isFinite(Number(opening.s))) return { ok: false, reason: "POST_VALIDATION_FAILED" };
    entityIds.add(openingKey);
  }
  for (i = 0; i < state.items.length; i++) {
    var item = state.items[i], itemKey = item && "item:" + item.id;
    if (!item || entityIds.has(itemKey) || !Number.isFinite(Number(item.x)) ||
        !Number.isFinite(Number(item.z))) return { ok: false, reason: "POST_VALIDATION_FAILED" };
    entityIds.add(itemKey);
  }
  return { ok: true };
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

/* Prepared plans can cross a delayed-confirmation, MCP or collaboration
   boundary, so they are data, not authority. Re-run the command normalizer and
   require the supplied normalized params to match before apply. This also
   makes cyclic/non-JSON plans fail with INVALID_PLAN instead of escaping as a
   JSON.stringify/parse exception. */
function validatePrepared(entry, env, currentVersion) {
  if (!entry || !entry.ok || !commandShape(entry.command)) return failure("INVALID_PLAN");
  var plan, params;
  try {
    plan = jsonClone(entry.plan);
    params = jsonClone(entry.params == null ? plan && plan.params || {} : entry.params);
  } catch (error) {
    return failure("INVALID_PLAN", { message: error && error.message || String(error) });
  }
  if (!plan || typeof plan !== "object" || plan.command !== entry.command.id ||
      !plan.params || typeof plan.params !== "object") return failure("INVALID_PLAN");
  /* A genuinely stale plan is compared by refreshStalePrepared below so the
     caller receives PREVIEW_INVALIDATED, the actionable confirmation code. */
  if (plan.expectedVersion != null && currentVersion != null && plan.expectedVersion !== currentVersion)
    return { ok: true, command: entry.command, commandId: entry.command.id,
      plan: plan, params: params, targets: [] };
  var normalized = prepareCommand(entry.command, params, env);
  if (!normalized.ok) return normalized;
  if (!sameJSON(plan.params, normalized.plan.params))
    return failure("INVALID_PLAN", { message: "Prepared params do not match command normalization" });
  return {
    ok: true,
    command: entry.command,
    commandId: entry.command.id,
    plan: plan,
    params: params,
    targets: normalized.targets,
  };
}

export function executePreparedBatch(preparedList, env, options = {}) {
  env = normalizeEnvironment(env);
  var list = Array.isArray(preparedList) ? preparedList.slice() : [];
  if (!list.length) return failure("EMPTY_COMMAND_BATCH");
  var useHistory = options.history !== false;
  var history = env.history || null;
  var currentVersion = historyCurrent(history);
  for (var i = 0; i < list.length; i++) {
    var validated = validatePrepared(list[i], env, currentVersion);
    if (!validated.ok) return Object.assign({ index: i }, validated);
    list[i] = validated;
  }
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
    var validationInput = { results, created, changed, effects };
    var validators = [validateModelState];
    if (env.services && typeof env.services.postValidateCommands === "function")
      validators.push(env.services.postValidateCommands);
    if (typeof options.postValidate === "function") validators.push(options.postValidate);
    for (var validatorIndex = 0; validatorIndex < validators.length; validatorIndex++) {
      var validation = validators[validatorIndex](validationInput, env);
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
          plan: entry.plan, params: entry.params == null ? entry.plan.params || {} : entry.params }
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
