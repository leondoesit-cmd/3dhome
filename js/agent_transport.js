import { agentApiKey, validateAgentConfig } from "./agent_config.js";

function trimSlash(value) { return String(value || "").replace(/\/+$/, ""); }
function openAIChatUrl(endpoint) {
  var base = trimSlash(endpoint);
  return /\/(?:v1|openai)$/i.test(base) ? base + "/chat/completions" : base + "/v1/chat/completions";
}
function openAIModelsUrl(endpoint) {
  var base = trimSlash(endpoint);
  return /\/(?:v1|openai)$/i.test(base) ? base + "/models" : base + "/v1/models";
}
function headers(config) {
  var out = { "Content-Type": "application/json" }, key = agentApiKey();
  if (key) out.Authorization = "Bearer " + key;
  return out;
}
function serverHeaders() {
  var out = { "Content-Type": "application/json" }, key = agentApiKey();
  if (key) out["X-ModelForge-Agent-Token"] = key;
  return out;
}
function geminiSchema(schema) {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return schema;
  var union = Array.isArray(schema.anyOf) ? schema.anyOf : null;
  if (union && union.length && union.every(function(entry) {
    return entry && ["string", "number", "integer"].includes(entry.type);
  })) {
    var primitive = { type: "string" };
    if (schema.description) primitive.description = schema.description;
    return primitive;
  }
  var out = {};
  Object.keys(schema).forEach(function(key) {
    if (key === "anyOf" || key === "additionalProperties") return;
    if (key === "properties") {
      var props = {};
      Object.keys(schema.properties || {}).forEach(function(name) {
        props[name] = geminiSchema(schema.properties[name]);
      });
      if (Object.keys(props).length > 0) out.properties = props;
    } else if (key === "items") out.items = geminiSchema(schema.items);
    else out[key] = schema[key];
  });
  return out;
}
function geminiToolDefinitions(tools) {
  return (tools || []).map(function(tool) {
    if (!tool || tool.type !== "function" || !tool.function) return tool;
    return { type: "function", function: Object.assign({}, tool.function, {
      parameters: geminiSchema(tool.function.parameters),
    }) };
  });
}
async function jsonFetch(url, options, fetchImpl) {
  options = options || {};
  var controller = new AbortController(), timedOut = false;
  var timeoutMs = Math.max(10, Math.min(600000, Number(options.timeoutMs) || 180000));
  var timer = setTimeout(function () { timedOut = true; controller.abort(); }, timeoutMs);
  var external = options.signal, abort = function () { controller.abort(); };
  if (external) {
    if (external.aborted) controller.abort();
    else external.addEventListener("abort", abort, { once: true });
  }
  try {
    var response = await fetchImpl(url, Object.assign({}, options, { signal: controller.signal }));
    var data;
    try { data = await response.json(); } catch (_) { data = {}; }
    if (response.status === 504) {
      var upstreamTimeout = new Error("AGENT_REQUEST_TIMEOUT");
      upstreamTimeout.name = "TimeoutError";
      throw upstreamTimeout;
    }
    if (!response.ok) throw providerError(response, data);
    return data;
  } catch (error) {
    if (timedOut && error && error.name === "AbortError") {
      var timeoutError = new Error("AGENT_REQUEST_TIMEOUT");
      timeoutError.name = "TimeoutError";
      throw timeoutError;
    }
    if (error && error.name === "AbortError" && !(external && external.aborted)) {
      if (options.retryUnexpectedAbort !== false) {
        return jsonFetch(url, Object.assign({}, options, { retryUnexpectedAbort: false }), fetchImpl);
      }
      var interrupted = new Error("AGENT_CONNECTION_INTERRUPTED");
      interrupted.name = "ConnectionError";
      throw interrupted;
    }
    throw error;
  } finally {
    clearTimeout(timer);
    if (external) external.removeEventListener("abort", abort);
  }
}

function emitProgress(options, detail) {
  if (options && typeof options.onProgress === "function") options.onProgress(detail);
}

function providerError(response, payload) {
  var message = payload && payload.error && (payload.error.message || payload.error)
    || payload && payload.message || "HTTP " + response.status;
  var error = new Error(String(message));
  error.status = response.status;
  return error;
}

function retryDelay(ms, signal) {
  return new Promise(function(resolve, reject) {
    if (signal && signal.aborted) {
      reject(new DOMException("aborted", "AbortError")); return;
    }
    var timer = setTimeout(done, ms);
    function done() {
      if (signal) signal.removeEventListener("abort", cancel);
      resolve();
    }
    function cancel() {
      clearTimeout(timer);
      if (signal) signal.removeEventListener("abort", cancel);
      reject(new DOMException("aborted", "AbortError"));
    }
    if (signal) signal.addEventListener("abort", cancel, { once: true });
  });
}

function streamMessageChunk(state, chunk, options) {
  if (chunk && chunk.error) {
    state.error = chunk.error;
    return;
  }
  if (chunk && chunk.usage) state.usage = chunk.usage;
  var choice = chunk && chunk.choices && chunk.choices[0], delta = choice && choice.delta || {};
  if (delta.role) state.message.role = delta.role;
  if (typeof delta.content === "string") {
    state.message.content += delta.content;
    state.outputChars += delta.content.length;
  }
  if (typeof delta.reasoning_content === "string") {
    state.message.reasoning_content = (state.message.reasoning_content || "") + delta.reasoning_content;
    state.outputChars += delta.reasoning_content.length;
  }
  (delta.tool_calls || []).forEach(function(part) {
    var index = Number.isInteger(part.index) ? part.index : 0;
    var call = state.toolCalls[index] || { id: "", type: "function", function: { name: "", arguments: "" } };
    if (part.id) call.id += part.id;
    if (part.type) call.type = part.type;
    if (part.function && part.function.name) call.function.name += part.function.name;
    if (part.function && part.function.arguments) {
      call.function.arguments += part.function.arguments;
      state.outputChars += part.function.arguments.length;
    }
    state.toolCalls[index] = call;
  });
  if (!state.firstTokenAt && state.outputChars > 0) state.firstTokenAt = performance.now();
  if (state.firstTokenAt) {
    var seconds = Math.max(0.001, (performance.now() - state.firstTokenAt) / 1000);
    emitProgress(options, { phase: "generating", estimated: true,
      tokensPerSecond: (state.outputChars / 4) / seconds });
  }
}

async function readOpenAIStream(response, options, startedAt) {
  var state = { message: { role: "assistant", content: "" }, toolCalls: [], usage: null,
    outputChars: 0, firstTokenAt: 0, error: null };
  var reader = response.body.getReader(), decoder = new TextDecoder(), buffer = "";
  function consume(line) {
    line = line.trim();
    if (!line.startsWith("data:")) return;
    var data = line.slice(5).trim();
    if (!data || data === "[DONE]") return;
    try { streamMessageChunk(state, JSON.parse(data), options); } catch (_) {}
  }
  while (true) {
    var part = await reader.read();
    if (part.done) break;
    buffer += decoder.decode(part.value, { stream: true });
    var lines = buffer.split(/\r?\n/); buffer = lines.pop() || "";
    lines.forEach(consume);
  }
  buffer += decoder.decode();
  if (buffer) buffer.split(/\r?\n/).forEach(consume);
  if (state.error) {
    var streamError = new Error(String(state.error.message || state.error.code || "GEMINI_STREAM_ERROR"));
    streamError.status = Number(state.error.status || state.error.code) || 400;
    throw streamError;
  }
  if (state.toolCalls.length) state.message.tool_calls = state.toolCalls.filter(Boolean);
  var endedAt = performance.now();
  var inputTokens = Number(state.usage && state.usage.prompt_tokens) || 0;
  var outputTokens = Number(state.usage && state.usage.completion_tokens) || 0;
  var generationMs = state.firstTokenAt ? Math.max(1, endedAt - state.firstTokenAt) : 0;
  return { message: state.message, usage: state.usage, metrics: {
    inputTokens: inputTokens, outputTokens: outputTokens,
    timeToFirstTokenMs: state.firstTokenAt ? state.firstTokenAt - startedAt : null,
    generationMs: generationMs,
    tokensPerSecond: outputTokens && generationMs ? outputTokens / (generationMs / 1000) : null,
  } };
}

async function streamingOpenAIChat(url, request, fetchImpl, options) {
  var controller = new AbortController(), timedOut = false, startedAt = performance.now();
  var timeoutMs = Math.max(10, Math.min(600000, Number(options.timeoutMs) || 180000));
  var timer = setTimeout(function () { timedOut = true; controller.abort(); }, timeoutMs);
  var external = options.signal, abort = function () { controller.abort(); };
  if (external) {
    if (external.aborted) controller.abort();
    else external.addEventListener("abort", abort, { once: true });
  }
  emitProgress(options, { phase: "prompt" });
  try {
    var response = await fetchImpl(url, Object.assign({}, request, { signal: controller.signal }));
    if (response.status === 504) {
      var upstreamTimeout = new Error("AGENT_REQUEST_TIMEOUT");
      upstreamTimeout.name = "TimeoutError";
      throw upstreamTimeout;
    }
    if (!response.ok) {
      var failed, copy = typeof response.clone === "function" ? response.clone() : response;
      try { failed = await copy.json(); } catch (_) {
        try { failed = { message: await response.text() }; } catch (_) { failed = {}; }
      }
      throw providerError(response, failed);
    }
    if (!response.body || typeof response.body.getReader !== "function") {
      var data = await response.json(), message = data.choices && data.choices[0] && data.choices[0].message;
      if (!message) throw new Error("INVALID_AGENT_RESPONSE");
      return { message: message, usage: data.usage || null, metrics: {
        inputTokens: Number(data.usage && data.usage.prompt_tokens) || 0,
        outputTokens: Number(data.usage && data.usage.completion_tokens) || 0,
        timeToFirstTokenMs: null, generationMs: 0, tokensPerSecond: null,
      } };
    }
    return await readOpenAIStream(response, options, startedAt);
  } catch (error) {
    if (timedOut && error && error.name === "AbortError") {
      var timeoutError = new Error("AGENT_REQUEST_TIMEOUT"); timeoutError.name = "TimeoutError"; throw timeoutError;
    }
    if (error && error.name === "AbortError" && !(external && external.aborted)) {
      if (options.retryUnexpectedAbort !== false)
        return streamingOpenAIChat(url, request, fetchImpl, Object.assign({}, options, { retryUnexpectedAbort: false }));
      var interrupted = new Error("AGENT_CONNECTION_INTERRUPTED"); interrupted.name = "ConnectionError"; throw interrupted;
    }
    // Gemini occasionally rejects a request before generation while capacity
    // is being rebalanced. Retry that fast failure once; a late 503 is surfaced
    // immediately so a minute-long request is never silently doubled.
    if (error && error.status === 503 && Number(options.transientRetries) > 0 &&
        performance.now() - startedAt < 10000 && !(external && external.aborted)) {
      emitProgress(options, { phase: "retry", attempt: 2 });
      await retryDelay(650, external);
      return streamingOpenAIChat(url, request, fetchImpl,
        Object.assign({}, options, { transientRetries: Number(options.transientRetries) - 1 }));
    }
    throw error;
  } finally {
    clearTimeout(timer);
    if (external) external.removeEventListener("abort", abort);
  }
}

export async function listAgentModels(config, fetchImpl = fetch) {
  var valid = validateAgentConfig(Object.assign({}, config, { model: config.model || "probe" }));
  if (!valid.ok && valid.reason !== "MODEL_REQUIRED") throw new Error(valid.reason);
  config = valid.config || config;
  if (config.provider === "server") {
    var status = await jsonFetch("/api/agent/status", { headers: serverHeaders() }, fetchImpl);
    return status.models || (status.model ? [status.model] : []);
  }
  if (config.provider === "ollama") {
    var tags = await jsonFetch(trimSlash(config.endpoint) + "/api/tags", {}, fetchImpl);
    return (tags.models || []).map(function (entry) { return entry.name || entry.model; }).filter(Boolean);
  }
  if (config.provider === "gemini" || /generativelanguage\.googleapis\.com/i.test(config.endpoint)) {
    var key = agentApiKey();
    var geminiHeaders = headers(config);
    if (key) geminiHeaders["x-goog-api-key"] = key;
    try {
      var geminiData = await jsonFetch("https://generativelanguage.googleapis.com/v1beta/models", { headers: geminiHeaders }, fetchImpl);
      var list = (geminiData.models || []).map(function (entry) {
        return String(entry.name || entry.id || "").replace(/^models\//, "");
      }).filter(function (id) {
        return /gemini/i.test(id) && !/embedding|aqa|bison/i.test(id);
      });
      if (list.length) return list;
    } catch (_) {}
    return ["gemini-3.7-flash", "gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash", "gemini-2.5-pro", "gemini-1.5-pro"];
  }
  var models = await jsonFetch(openAIModelsUrl(config.endpoint), { headers: headers(config) }, fetchImpl);
  return (models.data || []).map(function (entry) { return entry.id; }).filter(Boolean);
}

export async function sendAgentChat(config, messages, tools, options = {}) {
  var checked = validateAgentConfig(config);
  if (!checked.ok) throw new Error(checked.reason);
  config = checked.config;
  var fetchImpl = options.fetch || fetch, signal = options.signal;
  if (config.provider === "ollama") {
    var ollama = await jsonFetch(trimSlash(config.endpoint) + "/api/chat", {
      method: "POST", headers: { "Content-Type": "application/json" }, signal,
      body: JSON.stringify({ model: config.model, messages: messages, tools: tools, stream: false }),
      timeoutMs: options.timeoutMs,
    }, fetchImpl);
    return { message: ollama.message || { role: "assistant", content: "" } };
  }
  var url = config.provider === "server" ? "/api/agent/chat" : openAIChatUrl(config.endpoint);
  var gemini = config.provider === "gemini" || /generativelanguage\.googleapis\.com/i.test(config.endpoint);
  var cleanModel = String(config.model || "").trim().replace(/^models\//, "");
  if (gemini) tools = geminiToolDefinitions(tools);
  if (gemini) {
    var geminiBody = {
      model: cleanModel, messages: messages,
      tools: tools && tools.length ? tools : undefined,
      tool_choice: tools && tools.length ? (options.toolChoice || "auto") : undefined,
      stream: false, reasoning_effort: "low",
    };
    emitProgress(options, { phase: "prompt" });
    async function completeGemini(retries) {
      var began = performance.now();
      try {
        var completed = await jsonFetch(url, {
          method: "POST", headers: headers(config), signal: signal,
          body: JSON.stringify(geminiBody), timeoutMs: options.timeoutMs,
        }, fetchImpl);
        var completedMessage = completed.choices && completed.choices[0] && completed.choices[0].message;
        if (!completedMessage) throw new Error("INVALID_AGENT_RESPONSE");
        return { message: completedMessage, usage: completed.usage || null, metrics: {
          inputTokens: Number(completed.usage && completed.usage.prompt_tokens) || 0,
          outputTokens: Number(completed.usage && completed.usage.completion_tokens) || 0,
          timeToFirstTokenMs: null, generationMs: Math.max(1, performance.now() - began), tokensPerSecond: null,
        } };
      } catch (error) {
        if (error && error.status === 503 && retries > 0 &&
            performance.now() - began < 10000 && !(signal && signal.aborted)) {
          emitProgress(options, { phase: "retry", attempt: 2 });
          await retryDelay(650, signal);
          return completeGemini(retries - 1);
        }
        if (error && error.status === 503 && /^HTTP 503$/i.test(error.message))
          throw new Error("Gemini is temporarily unavailable (HTTP 503). Please try again shortly.");
        throw error;
      }
    }
    return completeGemini(options.transientRetries == null ? 1 : Number(options.transientRetries));
  }
  if (config.provider === "lmstudio") {
    var reqBody = {
      model: cleanModel, messages: messages,
      tools: tools && tools.length ? tools : undefined,
      tool_choice: tools && tools.length ? (options.toolChoice || "auto") : undefined,
      stream: true,
      reasoning_effort: undefined,
    };
    reqBody.stream_options = { include_usage: true };
    var streamRequest = {
      method: "POST", headers: headers(config),
      body: JSON.stringify(reqBody),
    };
    return streamingOpenAIChat(url, streamRequest, fetchImpl, options);
  }
  var data = await jsonFetch(url, {
    method: "POST", headers: config.provider === "server" ? serverHeaders() : headers(config), signal,
    body: JSON.stringify({ model: cleanModel || undefined, messages: messages, tools: tools,
      tool_choice: options.toolChoice || "auto" }),
    timeoutMs: options.timeoutMs,
  }, fetchImpl);
  var message = data.choices && data.choices[0] && data.choices[0].message;
  if (!message) throw new Error("INVALID_AGENT_RESPONSE");
  return { message: message };
}
