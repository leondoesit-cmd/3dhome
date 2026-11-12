#!/usr/bin/env node
// 3dhome multiplayer relay — zero-dependency Node server.
//
//   node server/relay.mjs [port]     (default 8765)
//
// If the app is intentionally served from another origin, list it explicitly:
//   HOME3D_ALLOWED_ORIGINS=http://localhost:4599 node server/relay.mjs
//
// Serves the app itself (static files from the repo root) AND speaks
// WebSocket on the same port, so two friends just open http://<host>:8765
// in a browser and are on the same relay automatically.
//
// Protocol (JSON text frames):
//   client → server: {t:'hello', code, name, token}
//                    {t:'join', room}
//                    {t:'admit'|'deny', code}
//                    {t:'watch', codes:[friendCode...]}
//                    {t:'msg', data, to?}   to = a peer's friend code
//   server → client: {t:'roster', users:[{code,name,room}]}
//                    {t:'joined'|'left', room, code, name}
//                    {t:'msg', from, data}
//                    {t:'knock', code, name}
//                    {t:'pending'|'admitted'|'denied', room}
// The relay never inspects `data` — chat, poses, scene JSON and WebRTC
// signaling all ride through it opaquely.
//
// It exposes two small HTTP APIs: /api/prodsize (public product-dimension
// lookups; the browser cannot read retailer pages itself) and /api/smarthome
// (LAN-only Home Assistant / Hue / Shelly proxy; private IPs, short port list).

import { createServer } from "node:http";
import { createServer as createSecureServer } from "node:https";
import { createHash, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
import { readFile, writeFile, stat, open } from "node:fs/promises";
import { brotliCompress, gzip, constants as ZLIB } from "node:zlib";
import { join, extname, normalize, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";
import { lookupProduct } from "../js/prodsize.js";
import {
  createByteLru,
  createRateLimiter,
  etagMatches,
  withAbort,
  lanOnlyRequest,
  localOnlyRequest,
  resolvePublicUrl,
  safeHttpGet,
  safeLanRequest,
  safeStaticFile,
} from "./security.mjs";
import { listModelBackups, readModelBackup, readModelBackupAttachments, validBackupKey, writeModelBackup } from "./model_backup.mjs";
import { createBlueprintVision } from './blueprint_vision.mjs';

const PORT = parseInt(process.argv[2], 10) || parseInt(process.env.PORT, 10) || 8765;
const ROOT = normalize(join(dirname(fileURLToPath(import.meta.url)), ".."));
// Disk copies of saved models (see model_backup.mjs). Dot-folder: never served.
const MODEL_BACKUP_DIR = process.env.HOME3D_MODEL_BACKUP_DIR
  ? resolve(process.env.HOME3D_MODEL_BACKUP_DIR) : join(ROOT, ".model-backups");
const IDENTITIES_FILE =
  process.env.HOME3D_IDENTITIES_FILE || join(ROOT, "server", ".relay-identities.json");
const WS_MAGIC = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const WS_MESSAGE_BYTES = Number(process.env.HOME3D_WS_MAX_MESSAGE_BYTES);
const WS_MAX_MESSAGE_BYTES = Number.isSafeInteger(WS_MESSAGE_BYTES) && WS_MESSAGE_BYTES > 0
  ? WS_MESSAGE_BYTES : 16 * 1024 * 1024;
function envLimit(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}
const WS_MAX_CLIENTS = envLimit("HOME3D_WS_MAX_CLIENTS", 400);
const WS_MAX_CLIENTS_PER_ADDRESS = envLimit("HOME3D_WS_MAX_CLIENTS_PER_ADDRESS", 10);
const WS_HELLO_TIMEOUT_MS = envLimit("HOME3D_WS_HELLO_TIMEOUT_MS", 10000);
const WS_PING_INTERVAL_MS = envLimit("HOME3D_WS_PING_INTERVAL_MS", 30000);
const WS_IDLE_TIMEOUT_MS = envLimit("HOME3D_WS_IDLE_TIMEOUT_MS", 75000);
const WS_WRITABLE_FLOOR = WS_MAX_MESSAGE_BYTES + 14 + 1024 * 1024;
const WS_WRITABLE_REQUESTED = envLimit("HOME3D_WS_MAX_WRITABLE_BYTES", WS_MAX_MESSAGE_BYTES + 8 * 1024 * 1024);
const WS_MAX_WRITABLE_BYTES = Math.max(WS_WRITABLE_FLOOR, WS_WRITABLE_REQUESTED);
if (WS_WRITABLE_REQUESTED < WS_WRITABLE_FLOOR)
  console.warn("[relay] HOME3D_WS_MAX_WRITABLE_BYTES " + WS_WRITABLE_REQUESTED + " raised to " + WS_WRITABLE_FLOOR);
// Rates are tokens per second; bursts allow normal room setup and pose updates.
const WS_MESSAGE_RATE = envLimit("HOME3D_WS_MESSAGE_RATE", 120);
const WS_MESSAGE_BURST = envLimit("HOME3D_WS_MESSAGE_BURST", 240);
const WS_IDENTITY_RATE = envLimit("HOME3D_WS_IDENTITY_RATE", 1 / 3);
const WS_IDENTITY_BURST = envLimit("HOME3D_WS_IDENTITY_BURST", 20);
function takeToken(bucket, rate, burst) {
  const now = performance.now();
  bucket.tokens = Math.min(burst, bucket.tokens + (now - bucket.at) * rate / 1000);
  bucket.at = now;
  if (bucket.tokens < 1) return false;
  bucket.tokens--;
  return true;
}
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".wasm": "application/wasm",
  ".gz": "application/gzip",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json",
  ".md": "text/markdown; charset=utf-8",
};
const STATIC_CACHE_FILE_BYTES = envLimit("HOME3D_STATIC_CACHE_FILE_BYTES", 8 * 1024 * 1024);
const staticCache = createByteLru(envLimit("HOME3D_STATIC_CACHE_BYTES", 64 * 1024 * 1024));
const staticValidators = new Map();
const staticCost = entry => entry.body.length + (entry.br?.length || 0) + (entry.gzip?.length || 0);
function rememberValidator(file, entry) {
  staticValidators.delete(file);
  staticValidators.set(file, { mtime: entry.mtime, size: entry.size, etag: entry.etag, compressible: entry.compressible });
  if (staticValidators.size > 20000) staticValidators.delete(staticValidators.keys().next().value);
}
/* Which content-coding a request gets, and that representation's own strong
   tag: RFC 9110 gives each coding of a resource a different strong validator,
   and one tag for the br, gzip and identity bodies let a 304 confirm a
   representation the client never received. */
function staticEncoding(entry, req) {
  const accept = String(req.headers["accept-encoding"] || "");
  if (entry.compressible && /\bbr\b/.test(accept)) return "br";
  if (entry.compressible && /\bgzip\b/.test(accept)) return "gzip";
  return "";
}
function codedTag(etag, encoding) {
  return encoding ? etag.slice(0, -1) + "-" + encoding + '"' : etag;
}
function weakStaticTag(st) {
  return 'W/"' + st.size.toString(16) + '-' + Math.round(st.mtimeMs * 1000).toString(16) + '"';
}
// One in-flight build per file. Without it, N concurrent first-requests for the
// same uncached file all miss the cache during `await readFile` and then each
// compress the same bytes — 196 module requests on a cold boot is exactly that
// shape. Errors clear the entry so a transient failure is retried, not cached.
const pendingStatic = new Map();
// Brotli quality 5, not the default 11: ~90x cheaper for ~17% more bytes on this
// tree (813 KB -> 955 KB over the seven largest assets), still 16% under gzip.
// Quality 11 belongs in a build step, not on the request thread.
const BR_OPTS = { params: { [ZLIB.BROTLI_PARAM_QUALITY]: 5 } };
const brotliAsync = promisify(brotliCompress);
const gzipAsync = promisify(gzip);

async function buildStatic(file, st) {
  const body = await readFile(file);
  const compressible = /\.(?:html|css|js|mjs|json|svg|txt)$/i.test(file) && body.length > 1024;
  return {
    mtime: st.mtimeMs,
    size: st.size,
    body,
    etag: '"' + createHash("sha256").update(body).digest("base64url").slice(0, 22) + '"',
    compressible,
    // Every browser that reaches this server sends `br`; gzip is computed on
    // the first request that actually needs it (see staticGzip) instead of
    // costing every cold file a second compression pass nobody reads.
    br: compressible ? await brotliAsync(body, BR_OPTS) : null,
    gzip: null,
    gzipping: null,
  };
}

async function cachedStatic(file, st) {
  const prior = staticCache.get(file);
  if (prior && prior.mtime === st.mtimeMs && prior.size === st.size) return prior;
  const inflight = pendingStatic.get(file);
  if (inflight && inflight.mtime === st.mtimeMs && inflight.size === st.size) return inflight.promise;
  const promise = buildStatic(file, st).then(
    (entry) => {
      if (pendingStatic.get(file)?.promise !== promise) return entry;
      pendingStatic.delete(file);
      rememberValidator(file, entry);
      staticCache.set(file, entry, staticCost(entry));
      return entry;
    },
    (err) => {
      if (pendingStatic.get(file)?.promise === promise) pendingStatic.delete(file);
      throw err;
    },
  );
  pendingStatic.set(file, { mtime: st.mtimeMs, size: st.size, promise });
  return promise;
}

// gzip for the rare client that cannot take brotli. Computed once, lazily, and
// shared by concurrent askers through the same promise.
function staticGzip(file, entry) {
  if (!entry.compressible) return null;
  if (entry.gzip) return entry.gzip;
  if (!entry.gzipping) {
    entry.gzipping = gzipAsync(entry.body).then((buf) => {
      entry.gzip = buf;
      if (staticCache.get(file) === entry) staticCache.resize(file, staticCost(entry));
      return buf;
    }, (err) => {
      entry.gzipping = null;
      throw err;
    });
  }
  return entry.gzipping;
}

// Only legacy credentials need disk. New codes certify themselves after a redeploy.
let identities = {};
try {
  const saved = JSON.parse(await readFile(IDENTITIES_FILE, "utf8"));
  if (saved && typeof saved === "object" && !Array.isArray(saved)) identities = saved;
} catch (_) {}
function codeFor(token) {
  const digest = createHash("sha256").update(token, "utf8").digest();
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let bits = 0;
  for (let i = 0; i < 5; i++) bits = bits * 256 + digest[i];
  let code = "";
  for (let shift = 35; shift >= 0; shift -= 5) code += alphabet[Math.floor(bits / 2 ** shift) & 31];
  return code.slice(0, 4) + "-" + code.slice(4);
}
function sameToken(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
function validCode(code) {
  return /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/.test(code);
}
function validToken(token) {
  return typeof token === "string" && /^[A-Za-z0-9_-]{32,128}$/.test(token);
}

const EXTRA_ORIGINS = new Set(
  String(process.env.HOME3D_ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
);
function allowedOrigin(req) {
  const raw = req.headers.origin;
  if (!raw) return false;
  if (EXTRA_ORIGINS.has(raw)) return true;
  try {
    return new URL(raw).host === req.headers.host;
  } catch (_) {
    return false;
  }
}

// HOME3D_PUBLIC=1 (render.yaml) marks an internet-facing deployment: the
// machine-local endpoints answer 404 there, whatever the request claims.
// HOME3D_ALLOWED_HOSTS names extra hostnames this machine is reached by.
const PUBLIC_MODE = process.env.HOME3D_PUBLIC === "1";
const TRUST = {
  publicMode: PUBLIC_MODE,
  allowedHosts: new Set(
    String(process.env.HOME3D_ALLOWED_HOSTS || "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  ),
};
const LOCAL_ROUTES = new Set(["/api/smarthome", "/api/model-backup", "/api/blueprint"]);
// Top-level files and folders the static handler may serve; the rest of the
// checkout (docs, tests, tools, scratch output, node_modules) stays private.
const PUBLIC_PATHS = JSON.parse(await readFile(join(ROOT, "server", "public_paths.json"), "utf8"));
const STATIC_ALLOW = { files: new Set(PUBLIC_PATHS.files), dirs: new Set(PUBLIC_PATHS.dirs) };

// Request and socket catches isolate bad input. Cap logs so a flood cannot fill disk.
let errorLog = { start: 0, count: 0 };
function logServerError(context, err) {
  const now = Date.now();
  if (now - errorLog.start > 60000) errorLog = { start: now, count: 0 };
  if (++errorLog.count > 20) return;
  console.error(`[relay] ${context}:`, err && err.stack ? err.stack : err);
}
process.on("unhandledRejection", (reason) => logServerError("unhandled rejection", reason));
process.on("uncaughtException", (err) => {
  console.error("[relay] uncaught exception:", err && err.stack ? err.stack : err);
  process.exit(1); // Render must restart a process whose state may be corrupt.
});

// ---- product-dimension lookup proxy ----------------------------------------
// GET /api/prodsize?q=<free text>[&w=&d=&h=][&nocache=1]
//   → { query, results:[{w,d,h,conf,host,url,title,sources}], scanned, cached }
// w/d/h are the model's current size: the ranker uses them as a shape hint to
// order unlabeled "140 x 60 x 90" triples and to reject absurd matches.
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const CACHE_FILE = process.env.HOME3D_PRODSIZE_CACHE_FILE || join(ROOT, "server", ".prodsize-cache.json");
const prodsizeLimiter = createRateLimiter({ rate: envLimit("HOME3D_PRODSIZE_RATE", 0.1), burst: envLimit("HOME3D_PRODSIZE_BURST", 6) });
const PRODSIZE_MAX_INFLIGHT = envLimit("HOME3D_PRODSIZE_MAX_INFLIGHT", 8);
const PRODSIZE_DEADLINE_MS = envLimit("HOME3D_PRODSIZE_DEADLINE_MS", 25000);
let prodsizeInflight = 0;
setInterval(() => prodsizeLimiter.sweep(), 60000).unref();
const CACHE_TTL = 30 * 24 * 3600e3;
const PAGE_CAP = 2 * 1024 * 1024; // stop reading a page after 2MB
let cache = null;
let cacheDirty = false;

async function loadCache() {
  if (cache) return cache;
  try {
    cache = JSON.parse(await readFile(CACHE_FILE, "utf8"));
  } catch (_) {
    cache = {};
  }
  return cache;
}
// debounced, best-effort: a failed cache write must never fail a lookup
let flushTimer = null;
function flushCache() {
  if (flushTimer || !cacheDirty) return;
  flushTimer = setTimeout(async () => {
    flushTimer = null;
    cacheDirty = false;
    if (!cache) return;
    const keys = Object.keys(cache);
    // keep the 200 newest entries
    if (keys.length > 200) {
      keys
        .sort((a, b) => cache[a].at - cache[b].at)
        .slice(0, keys.length - 200)
        .forEach((k) => delete cache[k]);
    }
    try {
      await writeFile(CACHE_FILE, JSON.stringify(cache));
    } catch (_) {}
  }, 2000);
  flushTimer.unref?.(); // never hold the process open just to save the cache
}

async function httpGet(url, signal) {
  return safeHttpGet(url, {
    signal,
    deadlineMs: 12000,
    maxBytes: PAGE_CAP,
    timeoutMs: 12000,
    headers: {
      "User-Agent": UA,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "he,en;q=0.9",
    },
  });
}

async function prodsize(req, u, res) {
  const q = (u.searchParams.get("q") || "").trim().slice(0, 200);
  if (!q) return json(res, 400, { error: "missing q" });
  const num = (k) => {
    const v = parseFloat(u.searchParams.get(k));
    return isFinite(v) && v > 0 ? v : null;
  };
  const hint = { w: num("w"), d: num("d"), h: num("h") };
  const pageUrl = (u.searchParams.get("url") || "").trim();
  const lang = u.searchParams.get("lang") === "en" ? "en" : "he";
  const key = q.toLowerCase() + "|" + [hint.w, hint.d, hint.h].join(",") + "|" + pageUrl + "|" + lang;
  const c = await loadCache();
  if (!u.searchParams.get("nocache") && c[key] && Date.now() - c[key].at < CACHE_TTL)
    return json(res, 200, { ...c[key].data, cached: true });
  const token = prodsizeLimiter.take(remoteAddress(req));
  if (!token.ok) {
    res.setHeader("Retry-After", String(Math.ceil(token.retryAfterMs / 1000)));
    return json(res, 429, { error: "rate limit" });
  }
  if (prodsizeInflight >= PRODSIZE_MAX_INFLIGHT) {
    res.setHeader("Retry-After", "5");
    return json(res, 503, { error: "busy" });
  }
  prodsizeInflight++;
  const controller = new AbortController();
  let gone = res.destroyed, hardTimer;
  const closed = () => { if (!res.writableEnded) { gone = true; controller.abort(); } };
  res.on("close", closed);
  if (gone) controller.abort();
  const deadline = setTimeout(() => controller.abort(), PRODSIZE_DEADLINE_MS);
  const hardStop = new Promise(resolveStop => {
    hardTimer = setTimeout(() => { controller.abort(); resolveStop(null); }, PRODSIZE_DEADLINE_MS + 2000);
  });
  try {
    const work = async () => {
      if (controller.signal.aborted) return null;
      // URL validation costs DNS work, so it consumes admission too.
      if (pageUrl && !(await withAbort(resolvePublicUrl(pageUrl), controller.signal))) {
        if (controller.signal.aborted) return null;
        return { badUrl: true };
      }
      return { data: await lookupProduct(q, {
        get: url => httpGet(url, controller.signal), hint, maxPages: 8, limit: 8,
        stagger: 700, lang, url: pageUrl || null,
      }) };
    };
    const result = await Promise.race([work(), hardStop]);
    if (gone) return;
    if (!result) return json(res, 504, { error: "deadline exceeded" });
    if (result.badUrl) return json(res, 400, { error: "bad url" });
    const out = result.data;
    if (!controller.signal.aborted) {
      c[key] = { at: Date.now(), data: out };
      cacheDirty = true;
      flushCache();
    }
    json(res, 200, { ...out, cached: false, ...(controller.signal.aborted ? { partial: true } : {}) });
  } catch (e) {
    if (!gone) json(res, 502, { error: String(e && e.message ? e.message : e) });
  } finally {
    clearTimeout(deadline);
    clearTimeout(hardTimer);
    res.off("close", closed);
    prodsizeInflight--;
  }
}

function json(res, code, obj) {
  const body = Buffer.from(JSON.stringify(obj), "utf8");
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function readJsonBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0, tooLarge = false;
    req.on("data", (chunk) => {
      if (tooLarge) return;
      size += chunk.length;
      if (size > maxBytes) {
        /* Stop buffering and answer; the rest of the body is drained and
           dropped. Destroying the request here reset the connection before
           the handler's 400 could reach the client. */
        tooLarge = true;
        chunks.length = 0;
        reject(new Error("too large"));
        // a body that never ends is cut off once the answer has had time to leave
        setTimeout(() => { if (!req.complete) req.destroy(); }, 2000).unref();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (tooLarge) return;
      const raw = Buffer.concat(chunks, size).toString("utf8");
      if (!raw) return resolve({});
      let value;
      try { value = JSON.parse(raw); }
      catch (err) { return reject(err); }
      // Every endpoint reads fields off the body; null or an array would throw
      // inside the handler instead of answering 400.
      if (!value || typeof value !== "object" || Array.isArray(value))
        return reject(new Error("JSON object required"));
      resolve(value);
    });
    req.on("error", reject);
  });
}

// POST /api/smarthome  { url, method, headers, body }
// Browser CORS blocks Home Assistant / Hue / Shelly on the LAN. This proxy
// forwards only to private/loopback/.local hubs on a short port allow-list.
async function smarthomeProxy(req, res) {
  if (!lanOnlyRequest(req, TRUST)) return json(res, 403, { error: "the smart-home proxy is LAN-only" });
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "content-type",
    });
    return res.end();
  }
  if (req.method !== "POST") return json(res, 405, { error: "POST only" });
  // Browsers always send Origin on a POST; a request without one is not the app.
  if (!allowedOrigin(req)) return json(res, 403, { error: "origin" });
  let payload;
  try {
    payload = await readJsonBody(req, 300 * 1024);
  } catch (err) {
    return json(res, 400, { error: String(err && err.message ? err.message : err) });
  }
  const url = typeof payload.url === "string" ? payload.url.trim() : "";
  if (!url || url.length > 2048) return json(res, 400, { error: "bad url" });
  const method = typeof payload.method === "string" ? payload.method : "GET";
  const out = await safeLanRequest(url, {
    method,
    headers: payload.headers,
    body: payload.body,
  });
  json(res, 200, {
    ok: !!out.ok,
    status: out.status,
    text: typeof out.text === "string" ? out.text.slice(0, 512 * 1024) : "",
    url: out.url,
    error: out.error || undefined,
  });
}

// ---- optional server-managed model ---------------------------------------
// Keeps production API keys out of browser storage. The destination is fixed
// by the server operator, never supplied by a request, so this is not an open
// proxy. Any OpenAI-compatible endpoint can be used.
const AGENT_BASE_URL = String(process.env.HOME3D_AGENT_BASE_URL || "").replace(/\/+$/, "");
const AGENT_MODEL = String(process.env.HOME3D_AGENT_MODEL || "");
const AGENT_API_KEY = String(process.env.HOME3D_AGENT_API_KEY || "");
const AGENT_ACCESS_TOKEN = String(process.env.HOME3D_AGENT_ACCESS_TOKEN || "");
const AGENT_BRIDGE_TOKEN = String(process.env.HOME3D_AGENT_BRIDGE_TOKEN || "");
const AGENT_MAX_TOKENS = Math.max(256, Math.min(16384, Number(process.env.HOME3D_AGENT_MAX_TOKENS) || 4096));
const AGENT_TOOL_NAMES = new Set([
  "get_app_context", "get_project_summary", "query_objects", "search_app_tools",
  "get_history_summary", "get_object_history", "compare_history_nodes", "search_catalog",
  "list_model_commands", "preview_model_command", "preview_item_snap",
]);
const agentRate = new Map();

function sameSecret(a, b) {
  const aa = Buffer.from(String(a || "")), bb = Buffer.from(String(b || ""));
  return aa.length === bb.length && aa.length > 0 && timingSafeEqual(aa, bb);
}
function agentAuthorized(req) {
  if (!AGENT_ACCESS_TOKEN) return localOnlyRequest(req, TRUST);
  return sameSecret(req.headers["x-modelforge-agent-token"], AGENT_ACCESS_TOKEN);
}
/* Keyed like every other limiter (remoteAddress honours HOME3D_TRUST_PROXY):
   the raw socket address is the proxy's, which put every user of a hosted
   relay in one 30-a-minute bucket. Expired windows are swept so the map
   cannot grow without bound. */
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of agentRate) if (now - entry.started >= 60000) agentRate.delete(key);
}, 60000).unref();
function agentWithinRate(req) {
  const now = Date.now(), key = remoteAddress(req) || "unknown";
  const prior = agentRate.get(key), entry = !prior || now - prior.started >= 60000
    ? { started: now, count: 0 } : prior;
  entry.count++;
  agentRate.set(key, entry);
  return entry.count <= 30;
}
async function responseTextLimited(response, limit) {
  if (!response.body || typeof response.body.getReader !== "function") {
    const text = await response.text();
    if (Buffer.byteLength(text) > limit) throw new Error("Agent response too large");
    return text;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const part = await reader.read();
    if (part.done) break;
    total += part.value.byteLength;
    if (total > limit) { await reader.cancel(); throw new Error("Agent response too large"); }
    chunks.push(part.value);
  }
  return Buffer.concat(chunks.map((part) => Buffer.from(part))).toString("utf8");
}

const bridgeQueue = [];
const bridgePending = new Map();
function bridgeAuthorized(req) {
  return !!AGENT_BRIDGE_TOKEN && sameSecret(req.headers["x-modelforge-bridge-token"], AGENT_BRIDGE_TOKEN);
}
async function agentBridgeCall(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "POST only" });
  if (!bridgeAuthorized(req)) return json(res, 401, { error: "bridge authorization" });
  if (!agentWithinRate(req)) return json(res, 429, { error: "bridge rate limit" });
  if (bridgePending.size >= 50) return json(res, 503, { error: "bridge busy" });
  let payload;
  try { payload = await readJsonBody(req, 256 * 1024); }
  catch (error) { return json(res, 400, { error: String(error.message || error) }); }
  const id = String(payload.id || "").slice(0, 100), name = String(payload.name || "");
  if (!id || !AGENT_TOOL_NAMES.has(name)) return json(res, 400, { error: "invalid bridge call" });
  if (bridgePending.has(id)) return json(res, 409, { error: "duplicate bridge call" });
  const request = { id, name, args: payload.args && typeof payload.args === "object" ? payload.args : {} };
  const timer = setTimeout(() => {
    bridgePending.delete(id);
    const index = bridgeQueue.findIndex((entry) => entry.id === id);
    if (index >= 0) bridgeQueue.splice(index, 1);
    json(res, 504, { error: "No active ModelForge browser answered the bridge call" });
  }, 30000);
  bridgePending.set(id, { res, timer });
  bridgeQueue.push(request);
}
function agentBridgePoll(req, res) {
  if (req.method !== "GET") return json(res, 405, { error: "GET only" });
  if (req.headers.origin && !allowedOrigin(req)) return json(res, 403, { error: "origin" });
  if (!bridgeAuthorized(req)) return json(res, 401, { error: "bridge authorization" });
  const request = bridgeQueue.shift();
  if (!request) { res.writeHead(204, { "Cache-Control": "no-store" }); return res.end(); }
  return json(res, 200, request);
}
async function agentBridgeReply(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "POST only" });
  if (req.headers.origin && !allowedOrigin(req)) return json(res, 403, { error: "origin" });
  if (!bridgeAuthorized(req)) return json(res, 401, { error: "bridge authorization" });
  let payload;
  try { payload = await readJsonBody(req, 4 * 1024 * 1024); }
  catch (error) { return json(res, 400, { error: String(error.message || error) }); }
  const id = String(payload.id || ""), pending = bridgePending.get(id);
  if (!pending) return json(res, 404, { error: "bridge call not found" });
  bridgePending.delete(id); clearTimeout(pending.timer);
  json(pending.res, payload.error ? 502 : 200, payload.error ? { error: String(payload.error) } : { result: payload.result });
  return json(res, 200, { ok: true });
}

async function agentStatus(req, res) {
  if (req.headers.origin && !allowedOrigin(req)) return json(res, 403, { error: "origin" });
  if (!agentAuthorized(req)) return json(res, 401, { error: "agent authorization" });
  return json(res, 200, { configured: !!AGENT_BASE_URL && !!AGENT_MODEL, model: AGENT_MODEL || "" });
}

async function agentChat(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "POST only" });
  if (req.headers.origin && !allowedOrigin(req)) return json(res, 403, { error: "origin" });
  if (!agentAuthorized(req)) return json(res, 401, { error: "agent authorization" });
  if (!agentWithinRate(req)) return json(res, 429, { error: "agent rate limit" });
  if (!AGENT_BASE_URL || !AGENT_MODEL) return json(res, 503, { error: "Agent server is not configured" });
  let payload;
  try { payload = await readJsonBody(req, 2 * 1024 * 1024); }
  catch (err) { return json(res, 400, { error: String(err.message || err) }); }
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, 180000);
  const clientGone = () => { if (!res.writableEnded) controller.abort(); };
  req.once("aborted", clientGone);
  res.once("close", clientGone);
  try {
    const endpoint = /\/v1$/i.test(AGENT_BASE_URL)
      ? AGENT_BASE_URL + "/chat/completions" : AGENT_BASE_URL + "/v1/chat/completions";
    const upstream = await fetch(endpoint, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(AGENT_API_KEY ? { Authorization: "Bearer " + AGENT_API_KEY } : {}),
      },
      body: JSON.stringify({
        model: AGENT_MODEL,
        messages: Array.isArray(payload.messages) ? payload.messages : [],
        tools: Array.isArray(payload.tools) ? payload.tools.filter((tool) =>
          tool && tool.function && AGENT_TOOL_NAMES.has(tool.function.name)) : [],
        tool_choice: "auto",
        max_tokens: AGENT_MAX_TOKENS,
      }),
    });
    const text = await responseTextLimited(upstream, 4 * 1024 * 1024);
    let data;
    try { data = JSON.parse(text); } catch (_) { data = { error: text || "Invalid upstream response" }; }
    json(res, upstream.status, data);
  } catch (err) {
    if (!res.destroyed) json(res, timedOut ? 504 : 502, {
      error: timedOut ? "Agent request timed out" : String(err && err.message ? err.message : err),
    });
  } finally {
    clearTimeout(timer);
    req.removeListener("aborted", clientGone);
    res.removeListener("close", clientGone);
  }
}

// ---- model disk backups ------------------------------------------------------
// GET  /api/model-backup            → { models: [meta…] }  newest first
// GET  /api/model-backup?key=<key>  → { model }            the latest record
// POST /api/model-backup  { models: [record…], attachments?: { <key>: [{ reference, payload }] } }
//                         → { results: [{ key, written | error }] }
// Local-only: these read and write this machine's disk, so a remote relay
// client (multiplayer) is refused, and so is a page from another origin or a
// rebinding domain (see localOnlyRequest).
async function modelBackup(req, u, res) {
  if (!localOnlyRequest(req, TRUST)) return json(res, 403, { error: "model backups are local-only" });
  if (req.headers.origin && !allowedOrigin(req)) return json(res, 403, { error: "origin" });
  if (req.method === "GET") {
    const key = u.searchParams.get("key");
    if (key == null) return json(res, 200, { models: await listModelBackups(MODEL_BACKUP_DIR) });
    if (!validBackupKey(key)) return json(res, 400, { error: "invalid model key" });
    const model = await readModelBackup(MODEL_BACKUP_DIR, key);
    if (!model) return json(res, 404, { error: "no backup for that key" });
    return json(res, 200, { model, attachments: await readModelBackupAttachments(MODEL_BACKUP_DIR, key) });
  }
  if (req.method !== "POST") return json(res, 405, { error: "GET or POST only" });
  let payload;
  try { payload = await readJsonBody(req, 96 * 1024 * 1024); }
  catch (error) { return json(res, 400, { error: String(error.message || error) }); }
  const models = Array.isArray(payload.models) ? payload.models : [];
  if (!models.length || models.length > 500) return json(res, 400, { error: "models[] required" });
  const results = [];
  for (const record of models) {
    const attachments = payload.attachments && record && typeof record.key === "string" ? payload.attachments[record.key] : null;
    try { results.push(await writeModelBackup(MODEL_BACKUP_DIR, record, { attachments: Array.isArray(attachments) ? attachments : [] })); }
    catch (error) { results.push({ key: record && typeof record.key === "string" ? record.key : null, error: String(error.message || error) }); }
  }
  return json(res, 200, { results });
}

// ---- static app ------------------------------------------------------------
const tlsCert = process.env.HOME3D_TLS_CERT, tlsKey = process.env.HOME3D_TLS_KEY;
if (!!tlsCert !== !!tlsKey) throw new Error("Set both HOME3D_TLS_CERT and HOME3D_TLS_KEY");
const tlsOptions = tlsCert ? { cert: await readFile(tlsCert), key: await readFile(tlsKey) } : null;
const blueprintVision = createBlueprintVision({root:ROOT,json,readJsonBody,allowedOrigin});
const handleRequest = async (req, res) => {
  const u = new URL(req.url || "/", "http://localhost");
  if (PUBLIC_MODE && LOCAL_ROUTES.has(u.pathname)) return json(res, 404, { error: "not available on this server" });
  if (u.pathname === '/api/blueprint') return (process.env.HOME3D_BLUEPRINT_LAN === "1"
    ? lanOnlyRequest(req, TRUST) : localOnlyRequest(req, TRUST))
    ? blueprintVision(req,res) : json(res, 403, { error: "blueprint vision is machine-local unless LAN is enabled" });
  if (u.pathname === "/api/prodsize") return prodsize(req, u, res);
  if (u.pathname === "/api/smarthome") return smarthomeProxy(req, res);
  if (u.pathname === "/api/agent/status") return agentStatus(req, res);
  if (u.pathname === "/api/agent/chat") return agentChat(req, res);
  if (u.pathname === "/api/agent-bridge/call") return agentBridgeCall(req, res);
  if (u.pathname === "/api/agent-bridge/poll") return agentBridgePoll(req, res);
  if (u.pathname === "/api/agent-bridge/reply") return agentBridgeReply(req, res);
  if (u.pathname === "/api/model-backup") return modelBackup(req, u, res);
  if (u.pathname === "/api/ping")
    return json(res, 200, { ok: true, api: PUBLIC_MODE ? ["prodsize"] : ["prodsize", "smarthome"] });
  try {
    const file = await safeStaticFile(ROOT, u.pathname, { allow: STATIC_ALLOW });
    if (!file) throw 0;
    const st = await stat(file);
    if (!st.isFile()) throw 0;
    const text = /\.(?:html|css|js|mjs|json|svg|txt)$/i.test(file);
    if (!text || st.size > STATIC_CACHE_FILE_BYTES) {
      const initialTag = weakStaticTag(st);
      if (etagMatches(req.headers["if-none-match"], initialTag)) {
        res.writeHead(304, { ETag: initialTag, "Cache-Control": "no-cache", ...(text ? { Vary: "Accept-Encoding" } : {}) });
        return res.end();
      }
      const fh = await open(file, "r");
      try {
        const actual = await fh.stat();
        const headers = { "Content-Type": MIME[extname(file).toLowerCase()] || "application/octet-stream",
          "Content-Length": actual.size, "Cache-Control": "no-cache", ETag: weakStaticTag(actual),
          ...(text ? { Vary: "Accept-Encoding" } : {}) };
        if (etagMatches(req.headers["if-none-match"], headers.ETag)) {
          res.writeHead(304, { ETag: headers.ETag, "Cache-Control": "no-cache", ...(text ? { Vary: "Accept-Encoding" } : {}) });
          return res.end();
        }
        res.writeHead(200, headers);
        if (req.method === "HEAD" || !actual.size) return res.end();
        await pipeline(fh.createReadStream({ start: 0, end: actual.size - 1, autoClose: false }), res);
      } finally { await fh.close(); }
      return;
    }
    const validator = staticValidators.get(file);
    if (validator && validator.mtime === st.mtimeMs && validator.size === st.size) {
      const known = codedTag(validator.etag, staticEncoding(validator, req));
      if (etagMatches(req.headers["if-none-match"], known)) {
        res.writeHead(304, { ETag: known, "Cache-Control": "no-cache", Vary: "Accept-Encoding" });
        return res.end();
      }
    }
    const cached = await cachedStatic(file, st);
    const encoding = staticEncoding(cached, req), tag = codedTag(cached.etag, encoding);
    if (etagMatches(req.headers["if-none-match"], tag)) {
      res.writeHead(304, { ETag: tag, "Cache-Control": "no-cache", Vary: "Accept-Encoding" });
      return res.end();
    }
    const payload = encoding === "br" ? cached.br : encoding === "gzip" ? await staticGzip(file, cached) : cached.body;
    res.writeHead(200, {
      "Content-Type": MIME[extname(file).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-cache",
      "Content-Length": payload.length,
      "ETag": tag,
      "Vary": "Accept-Encoding",
      ...(encoding ? { "Content-Encoding": encoding } : {}),
    });
    res.end(payload);
  } catch (_) {
    if (res.headersSent || res.destroyed) { res.destroy(); return; }
    res.writeHead(404);
    res.end("not found");
  }
};
// Node exits on an unhandled rejection, and nothing else awaits a handler's
// promise, so every request failure ends here as a 500.
const serve = (req, res) => {
  handleRequest(req, res).catch((err) => {
    logServerError(`${req.method} ${String(req.url || "").split("?")[0]}`, err);
    try {
      if (!res.headersSent) json(res, 500, { error: "internal error" });
      else res.destroy();
    } catch (_) {}
  });
};
const http = tlsOptions ? createSecureServer(tlsOptions, serve) : createServer(serve);
// Startup failures (port in use) must end the process too.
http.on("error", (err) => {
  console.error("[relay] server error:", err && err.message ? err.message : err);
  process.exit(1);
});

// ---- WebSocket framing (RFC 6455, server side) -----------------------------
function accept(key) {
  return createHash("sha1").update(key + WS_MAGIC).digest("base64");
}
function encodeFrame(str) {
  const payload = Buffer.from(str, "utf8");
  const n = payload.length;
  let head;
  if (n < 126) head = Buffer.from([0x81, n]);
  else if (n < 65536) {
    head = Buffer.alloc(4);
    head[0] = 0x81;
    head[1] = 126;
    head.writeUInt16BE(n, 2);
  } else {
    head = Buffer.alloc(10);
    head[0] = 0x81;
    head[1] = 127;
    head.writeBigUInt64BE(BigInt(n), 2);
  }
  return Buffer.concat([head, payload]);
}

// Incremental frame parser per connection; handles masked client frames,
// 16/64-bit lengths, continuation fragments, ping and close.
function makeParser(onMessage, onClose, sock, onFrame) {
  let chunks = [], first = 0, pendingBytes = 0;
  // Small header peeks and one payload read avoid recopying a growing frame.
  function peek(size) {
    const head = chunks[first];
    if (head.length >= size) return head.subarray(0, size);
    const out = Buffer.allocUnsafe(size);
    let copied = 0;
    for (let i = first; copied < size; i++) {
      copied += chunks[i].copy(out, copied, 0, Math.min(chunks[i].length, size - copied));
    }
    return out;
  }
  function read(size) {
    const out = peek(size);
    pendingBytes -= size;
    while (size > 0) {
      const head = chunks[first];
      if (size < head.length) {
        chunks[first] = head.subarray(size);
        break;
      }
      size -= head.length;
      chunks[first++] = null;
    }
    if (first === chunks.length) { chunks = []; first = 0; }
    else if (first > 1024 && first > chunks.length / 2) { chunks = chunks.slice(first); first = 0; }
    return out;
  }
  let fragments = null; // accumulating fragmented message payloads
  let fragmentBytes = 0;
  // A frame or message the code cannot handle closes that one socket; it must
  // never surface as an uncaught exception in the 'data' listener.
  return (chunk) => {
    try {
      consume(chunk);
    } catch (err) {
      logServerError("websocket message", err);
      sock.destroy();
    }
  };
  /* The cap bounds what is LEFT after every complete frame has been taken:
     one partial frame (a masked frame needs up to 14 header bytes beyond its
     payload). Checked before draining, a near-max message whose tail shared a
     TCP chunk with the next frame's start disconnected a legitimate client.
     A single socket chunk is small, so buffering it first costs little. */
  function consume(chunk) {
    if (chunk.length) { chunks.push(chunk); pendingBytes += chunk.length; }
    drain();
    if (!sock.destroyed && pendingBytes > WS_MAX_MESSAGE_BYTES + 14) sock.destroy();
  }
  function drain() {
    while (!sock.destroyed) {
      if (pendingBytes < 2) return;
      let buf = peek(Math.min(pendingBytes, 14));
      const fin = (buf[0] & 0x80) !== 0;
      const op = buf[0] & 0x0f;
      const masked = (buf[1] & 0x80) !== 0;
      // RFC 6455 §5.1: a client MUST mask every frame; the server closes on one that is not
      if (!masked) return sock.destroy();
      let len = buf[1] & 0x7f;
      let off = 2;
      if (len === 126) {
        if (pendingBytes < 4) return;
        len = buf.readUInt16BE(2);
        off = 4;
      } else if (len === 127) {
        if (pendingBytes < 10) return;
        len = Number(buf.readBigUInt64BE(2));
        off = 10;
      }
      if (len > 32 * 1024 * 1024) return sock.destroy(); // 32MB sanity cap
      const dataFrame = op === 0 || op === 1 || op === 2;
      const messageBytes = (op === 0 ? fragmentBytes : 0) + len;
      if (dataFrame && messageBytes > WS_MAX_MESSAGE_BYTES) return sock.destroy();
      // RFC 6455 §5.5: control frames carry at most 125 bytes and are never
      // fragmented. A longer ping used to be echoed with its length truncated
      // into one byte — a malformed pong that desynchronised the stream.
      if (op >= 8 && (len > 125 || !fin)) return sock.destroy();
      const maskOff = off;
      if (masked) off += 4;
      if (pendingBytes < off + len) return;
      if (!onFrame()) return sock.destroy();
      buf = read(off + len);
      let payload = buf.subarray(off, off + len);
      if (masked) {
        const mask = buf.subarray(maskOff, maskOff + 4);
        payload = Buffer.from(payload);
        for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
      }
      if (op === 8) return onClose();
      if (op === 9) {
        // ping → pong with same payload
        const pong = Buffer.concat([Buffer.from([0x8a, payload.length]), payload]);
        writeFrame(sock, pong);
        continue;
      }
      if (op === 10) continue; // pong
      if (op === 1 || op === 2 || op === 0) {
        if (op !== 0) fragments = [payload];
        else if (fragments) fragments.push(payload);
        if (fragments) fragmentBytes = messageBytes;
        if (fin && fragments) {
          const full = Buffer.concat(fragments);
          fragments = null;
          fragmentBytes = 0;
          onMessage(full.toString("utf8"));
        }
      }
    }
  }
}

// ---- rooms / clients -------------------------------------------------------
const TRUSTED_PROXY_HOPS = Math.max(0, Math.min(8, parseInt(process.env.HOME3D_TRUST_PROXY || "0", 10) || 0));
const clients = new Set(); // {sock, code, name, room, watch:Set}
const identityBuckets = new Map();

function remoteAddress(req) {
  let address = req.socket.remoteAddress || "";
  // Forwarding headers are untrusted unless deployment explicitly opts in.
  // HOME3D_TRUST_PROXY is the number of proxies in front of the relay ("1" for
  // Render). Each proxy APPENDS the address it saw, so the client's own entry
  // is that many from the right; anything further left is whatever the client
  // chose to send and would let it pick its own rate-limit bucket.
  if (TRUSTED_PROXY_HOPS > 0) {
    const hops = String(req.headers["x-forwarded-for"] || "").split(",").map((s) => s.trim()).filter(Boolean);
    const hop = hops[hops.length - TRUSTED_PROXY_HOPS];
    if (hop && isIP(hop)) address = hop;
  }
  if (isIP(address) === 6) address = new URL(`http://[${address}]/`).hostname.slice(1, -1);
  const mapped = address.match(/^::ffff:([a-f0-9]+):([a-f0-9]+)$/i);
  if (mapped) {
    const hi = parseInt(mapped[1], 16), lo = parseInt(mapped[2], 16);
    address = `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
  }
  return address;
}

function allowIdentity(address) {
  let bucket = identityBuckets.get(address);
  if (!bucket) {
    // A bounded limiter must fail closed rather than evict a throttled address.
    if (identityBuckets.size >= 10000) return false;
    bucket = { tokens: WS_IDENTITY_BURST, at: performance.now() };
    identityBuckets.set(address, bucket);
  }
  return takeToken(bucket, WS_IDENTITY_RATE, WS_IDENTITY_BURST);
}

function writeFrame(sock, frame) {
  if (sock.destroyed) return;
  if (sock.writableLength + frame.length > WS_MAX_WRITABLE_BYTES) return sock.destroy();
  sock.write(frame);
}

setInterval(() => {
  const now = performance.now();
  for (const [address, bucket] of identityBuckets) {
    if (bucket.tokens + (now - bucket.at) * WS_IDENTITY_RATE / 1000 >= WS_IDENTITY_BURST)
      identityBuckets.delete(address);
  }
}, 60000).unref();

function mutualWatch(a, b) {
  return a.watch.has(b.code) && b.watch.has(a.code);
}
function ownerFor(room) {
  return [...clients].find((c) => c.code && room === "apt:" + c.code && !c.sock.destroyed);
}
function enterRoom(client, room) {
  client.pending = null;
  client.room = room;
  sendObj(client, { t: "admitted", room });
  broadcastRoom(room, { t: "joined", room, code: client.code, name: client.name }, client);
}
function rosterFor(viewer) {
  return {
    t: "roster",
    users: [...clients]
      .filter(
        (c) =>
          c.code &&
          // two clients that have not joined a room yet are not in the SAME
          // room: null === null exposed every lobby client to every other
          (c === viewer || ((!viewer.pending || c.room !== viewer.pending) &&
            ((viewer.room && c.room === viewer.room) || mutualWatch(viewer, c)))),
      )
      .map((c) => ({ code: c.code, name: c.name || "", room: c.room || "" })),
  };
}
function sendObj(client, obj) {
  if (client && !client.sock.destroyed)
    writeFrame(client.sock, encodeFrame(JSON.stringify(obj)));
}
function broadcastRosters() {
  clients.forEach((c) => {
    if (c.code) sendObj(c, rosterFor(c));
  });
}
function broadcastRoom(room, obj, except) {
  const f = encodeFrame(JSON.stringify(obj));
  clients.forEach((c) => {
    if (c.room === room && c !== except) writeFrame(c.sock, f);
  });
}
function toCode(sender, code, obj) {
  const c = [...clients].find((c) => c.code === code);
  if (c && ((sender.room && c.room === sender.room) || mutualWatch(sender, c))) sendObj(c, obj);
}

http.on("upgrade", (req, sock, head) => {
  try {
    acceptSocket(req, sock, head);
  } catch (err) {
    logServerError("websocket upgrade", err);
    try { sock.destroy(); } catch (_) {}
  }
});

function acceptSocket(req, sock, head) {
  sock.on("error", () => {}); // a reset mid-handshake is the peer's problem, not a crash
  const key = req.headers["sec-websocket-key"];
  if (!key || !allowedOrigin(req)) {
    try { sock.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n", () => sock.destroy()); } catch (_) {}
    return;
  }
  const address = remoteAddress(req);
  if (clients.size >= WS_MAX_CLIENTS ||
      [...clients].filter((c) => c.address === address).length >= WS_MAX_CLIENTS_PER_ADDRESS) {
    sock.end("HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n", () => sock.destroy());
    return;
  }
  sock.write(
    "HTTP/1.1 101 Switching Protocols\r\n" +
      "Upgrade: websocket\r\nConnection: Upgrade\r\n" +
      "Sec-WebSocket-Accept: " + accept(key) + "\r\n\r\n",
  );
  sock.setNoDelay(true);
  const client = { sock, address, code: null, name: "", room: null, pending: null, watch: new Set(), admitted: new Set() };
  clients.add(client);
  let lastSeen = performance.now();
  const messageBucket = { tokens: WS_MESSAGE_BURST, at: lastSeen };
  const helloTimer = setTimeout(() => { if (!client.code) drop(); }, WS_HELLO_TIMEOUT_MS);
  helloTimer.unref();
  let nextPing = lastSeen + WS_PING_INTERVAL_MS;
  const heartbeat = setInterval(() => {
    const now = performance.now();
    if (now - lastSeen >= WS_IDLE_TIMEOUT_MS || sock.writableLength > WS_MAX_WRITABLE_BYTES) return drop();
    if (now >= nextPing) {
      writeFrame(sock, Buffer.from([0x89, 0]));
      nextPing = now + WS_PING_INTERVAL_MS;
    }
  }, Math.min(WS_PING_INTERVAL_MS, WS_IDLE_TIMEOUT_MS, 1000));
  heartbeat.unref();

  const drop = () => {
    if (!clients.has(client)) return;
    clients.delete(client);
    clearTimeout(helloTimer);
    clearInterval(heartbeat);
    // Admission expires with the owner's connection, even if guests stay online.
    if (client.code) clients.forEach((c) => {
      if (c.room === "apt:" + client.code) {
        c.pending = c.room;
        c.room = null;
        sendObj(c, { t: "pending", room: c.pending });
      }
    });
    if (client.room)
      broadcastRoom(client.room, {
        t: "left",
        room: client.room,
        code: client.code,
        name: client.name,
      });
    broadcastRosters();
    try {
      sock.destroy();
    } catch (_) {}
  };

  const parse = makeParser(
      (text) => {
        let m;
        try {
          m = JSON.parse(text);
        } catch (_) {
          return;
        }
        // Valid JSON is not yet a message: null, arrays and bare values are ignored.
        if (!m || typeof m !== "object" || Array.isArray(m) || typeof m.t !== "string") return;
        if (m.t === "hello") {
          const code = String(m.code || "").toUpperCase();
          const token = String(m.token || "");
          if (!validCode(code) || !validToken(token)) {
            sendObj(client, { t: "error", code: "bad_identity" });
            setTimeout(drop, 25).unref?.();
            return;
          }
          if (client.code && client.code !== code) return drop(); // permissions belong to one identity
          const legacy = Object.hasOwn(identities, code);
          if (legacy ? !sameToken(identities[code], token) : code !== codeFor(token)) {
            sendObj(client, { t: "error", code: "identity_in_use" });
            setTimeout(drop, 25).unref?.();
            return;
          }
          if (!legacy && client.code !== code && !allowIdentity(address)) {
            sendObj(client, { t: "error", code: "identity_rate_limit" });
            setTimeout(drop, 25).unref?.();
            return;
          }
          client.code = code;
          clearTimeout(helloTimer);
          client.name = String(m.name || "").slice(0, 24);
          // one connection per code: drop a stale ghost of the same identity
          clients.forEach((c) => {
            if (c !== client && c.code === client.code) {
              c.drop();
            }
          });
          clients.forEach((c) => {
            if (c.pending === "apt:" + client.code)
              sendObj(client, { t: "knock", code: c.code, name: c.name });
          });
          broadcastRosters();
        } else if (m.t === "join" && client.code) {
          const nextRoom = String(m.room || "").slice(0, 32);
          if (!nextRoom.startsWith("apt:") || !validCode(nextRoom.slice(4))) return;
          if (client.room === nextRoom) {
            sendObj(client, { t: "admitted", room: nextRoom });
            sendObj(client, rosterFor(client));
            return;
          }
          if (client.room && client.room !== nextRoom)
            broadcastRoom(client.room, {
              t: "left",
              room: client.room,
              code: client.code,
              name: client.name,
            });
          client.room = null;
          client.pending = nextRoom;
          const owner = ownerFor(nextRoom);
          if (owner === client || owner?.admitted.has(client.code)) enterRoom(client, nextRoom);
          else {
            sendObj(client, { t: "pending", room: nextRoom });
            sendObj(owner, { t: "knock", code: client.code, name: client.name });
          }
          broadcastRosters();
        } else if ((m.t === "admit" || m.t === "deny") && client.code) {
          const guest = [...clients].find((c) => c.code === String(m.code || "").toUpperCase());
          const room = "apt:" + client.code;
          if (!guest || guest.pending !== room) return;
          if (m.t === "admit") {
            client.admitted.add(guest.code);
            enterRoom(guest, room);
          } else {
            guest.pending = null;
            sendObj(guest, { t: "denied", room });
          }
          broadcastRosters();
        } else if (m.t === "watch" && client.code) {
          client.watch = new Set(
            (Array.isArray(m.codes) ? m.codes : [])
              .map((code) => String(code || "").toUpperCase())
              .filter(validCode)
              .slice(0, 200),
          );
          broadcastRosters(); // mutual visibility changes for both ends
        } else if (m.t === "msg" && client.code) {
          const out = { t: "msg", from: client.code, data: m.data };
          if (m.to) toCode(client, String(m.to).toUpperCase(), out);
          else if (client.room) broadcastRoom(client.room, out, client);
        }
      },
      drop,
      sock,
      () => {
        // Count control and continuation frames too, so they cannot bypass the budget.
        lastSeen = performance.now();
        return takeToken(messageBucket, WS_MESSAGE_RATE, WS_MESSAGE_BURST);
      },
  );
  client.drop = drop;
  sock.on("data", parse);
  sock.on("end", drop); // Upgraded sockets may otherwise keep a half-closed slot.
  sock.on("close", drop);
  sock.on("error", drop);
  if (head.length) parse(head);
}

http.listen(PORT, () => {
  console.log(`3dhome relay + app server on ${tlsOptions ? "https" : "http"}://localhost:${PORT}`);
  console.log(`Friends on your network: ${tlsOptions ? "https" : "http"}://<your-ip>:${PORT}`);
  // Explicitly gated fault injection lets child-process tests verify restart semantics.
  if (process.env.HOME3D_TEST_HOOKS === "1" && process.env.HOME3D_TEST_UNCAUGHT_MS)
    setTimeout(() => { throw new Error("test uncaught exception"); }, envLimit("HOME3D_TEST_UNCAUGHT_MS", 1000));
});
