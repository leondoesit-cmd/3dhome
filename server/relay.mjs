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
//                    {t:'watch', codes:[friendCode...]}
//                    {t:'msg', data, to?}   to = a peer's friend code
//   server → client: {t:'roster', users:[{code,name,room}]}
//                    {t:'joined'|'left', room, code, name}
//                    {t:'msg', from, data}
// The relay never inspects `data` — chat, poses, scene JSON and WebRTC
// signaling all ride through it opaquely.
//
// It exposes two small HTTP APIs: /api/prodsize (public product-dimension
// lookups; the browser cannot read retailer pages itself) and /api/smarthome
// (LAN-only Home Assistant / Hue / Shelly proxy; private IPs, short port list).

import { createServer } from "node:http";
import { createHash, timingSafeEqual } from "node:crypto";
import { readFile, writeFile, stat } from "node:fs/promises";
import { brotliCompress, gzip, constants as ZLIB } from "node:zlib";
import { join, extname, normalize, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { lookupProduct } from "../js/prodsize.js";
import { resolvePublicUrl, safeHttpGet, safeLanRequest, safeStaticFile } from "./security.mjs";

const PORT = parseInt(process.argv[2], 10) || parseInt(process.env.PORT, 10) || 8765;
const ROOT = normalize(join(dirname(fileURLToPath(import.meta.url)), ".."));
const IDENTITIES_FILE =
  process.env.HOME3D_IDENTITIES_FILE || join(ROOT, "server", ".relay-identities.json");
const WS_MAGIC = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
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
const staticCache = new Map();
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
      if (pendingStatic.get(file)?.promise === promise) pendingStatic.delete(file);
      staticCache.set(file, entry);
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
function staticGzip(entry) {
  if (!entry.compressible) return null;
  if (entry.gzip) return entry.gzip;
  if (!entry.gzipping) {
    entry.gzipping = gzipAsync(entry.body).then((buf) => {
      entry.gzip = buf;
      return buf;
    }, (err) => {
      entry.gzipping = null;
      throw err;
    });
  }
  return entry.gzipping;
}

// Friend codes are public handles; this separate token proves ownership of a
// handle across reconnects and relay restarts. The file is never served by the
// static handler (the whole /server tree is private).
let identities = {};
try {
  const saved = JSON.parse(await readFile(IDENTITIES_FILE, "utf8"));
  if (saved && typeof saved === "object" && !Array.isArray(saved)) identities = saved;
} catch (_) {}
let identityTimer = null;
function saveIdentities() {
  if (identityTimer) return;
  identityTimer = setTimeout(async () => {
    identityTimer = null;
    try {
      await writeFile(IDENTITIES_FILE, JSON.stringify(identities), { mode: 0o600 });
    } catch (_) {}
  }, 100);
  identityTimer.unref?.();
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

// ---- product-dimension lookup proxy ----------------------------------------
// GET /api/prodsize?q=<free text>[&w=&d=&h=][&nocache=1]
//   → { query, results:[{w,d,h,conf,host,url,title,sources}], scanned, cached }
// w/d/h are the model's current size: the ranker uses them as a shape hint to
// order unlabeled "140 x 60 x 90" triples and to reject absurd matches.
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const CACHE_FILE = join(ROOT, "server", ".prodsize-cache.json");
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

async function httpGet(url) {
  return safeHttpGet(url, {
    maxBytes: PAGE_CAP,
    timeoutMs: 12000,
    headers: {
      "User-Agent": UA,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "he,en;q=0.9",
    },
  });
}

async function prodsize(u, res) {
  const q = (u.searchParams.get("q") || "").trim().slice(0, 200);
  if (!q) return json(res, 400, { error: "missing q" });
  const num = (k) => {
    const v = parseFloat(u.searchParams.get(k));
    return isFinite(v) && v > 0 ? v : null;
  };
  const hint = { w: num("w"), d: num("d"), h: num("h") };
  const pageUrl = (u.searchParams.get("url") || "").trim();
  // a rejected URL must say so — silently falling back to a web search would
  // look like the pasted link simply had no dimensions on it
  if (pageUrl && !(await resolvePublicUrl(pageUrl)))
    return json(res, 400, { error: "bad url" });
  const lang = u.searchParams.get("lang") === "en" ? "en" : "he";
  const key = q.toLowerCase() + "|" + [hint.w, hint.d, hint.h].join(",") + "|" + pageUrl + "|" + lang;
  const c = await loadCache();
  if (!u.searchParams.get("nocache") && c[key] && Date.now() - c[key].at < CACHE_TTL)
    return json(res, 200, { ...c[key].data, cached: true });
  let out;
  try {
    out = await lookupProduct(q, {
      get: httpGet,
      hint,
      maxPages: 8,
      limit: 8,
      stagger: 700,
      lang,
      url: pageUrl || null,
    });
  } catch (e) {
    return json(res, 502, { error: String(e && e.message ? e.message : e) });
  }
  c[key] = { at: Date.now(), data: out };
  cacheDirty = true;
  flushCache();
  json(res, 200, { ...out, cached: false });
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
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        req.destroy();
        reject(new Error("too large"));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      const raw = Buffer.concat(chunks, size).toString("utf8");
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); }
      catch (err) { reject(err); }
    });
    req.on("error", reject);
  });
}

// POST /api/smarthome  { url, method, headers, body }
// Browser CORS blocks Home Assistant / Hue / Shelly on the LAN. This proxy
// forwards only to private/loopback/.local hubs on a short port allow-list.
async function smarthomeProxy(req, res) {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "content-type",
    });
    return res.end();
  }
  if (req.method !== "POST") return json(res, 405, { error: "POST only" });
  if (req.headers.origin && !allowedOrigin(req)) return json(res, 403, { error: "origin" });
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

// ---- static app ------------------------------------------------------------
const http = createServer(async (req, res) => {
  const u = new URL(req.url || "/", "http://localhost");
  if (u.pathname === "/api/prodsize") return prodsize(u, res);
  if (u.pathname === "/api/smarthome") return smarthomeProxy(req, res);
  if (u.pathname === "/api/ping") return json(res, 200, { ok: true, api: ["prodsize", "smarthome"] });
  try {
    const file = await safeStaticFile(ROOT, u.pathname);
    if (!file) throw 0;
    const st = await stat(file);
    if (!st.isFile()) throw 0;
    const cached = await cachedStatic(file, st);
    const immutable = u.pathname.startsWith("/vendor/");
    if (req.headers["if-none-match"] === cached.etag) {
      res.writeHead(304, { ETag: cached.etag, "Cache-Control": immutable ? "public, max-age=31536000, immutable" : "no-cache" });
      return res.end();
    }
    const accept = String(req.headers["accept-encoding"] || "");
    let encoding = "";
    let payload = cached.body;
    if (cached.br && /\bbr\b/.test(accept)) {
      encoding = "br";
      payload = cached.br;
    } else if (cached.compressible && /\bgzip\b/.test(accept)) {
      encoding = "gzip";
      payload = await staticGzip(cached);
    }
    res.writeHead(200, {
      "Content-Type": MIME[extname(file)] || "application/octet-stream",
      "Cache-Control": immutable ? "public, max-age=31536000, immutable" : "no-cache",
      "ETag": cached.etag,
      "Vary": "Accept-Encoding",
      ...(encoding ? { "Content-Encoding": encoding } : {}),
    });
    res.end(payload);
  } catch (_) {
    res.writeHead(404);
    res.end("not found");
  }
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
function makeParser(onMessage, onClose, sock) {
  let buf = Buffer.alloc(0);
  let fragments = null; // accumulating fragmented message payloads
  return (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    for (;;) {
      if (buf.length < 2) return;
      const fin = (buf[0] & 0x80) !== 0;
      const op = buf[0] & 0x0f;
      const masked = (buf[1] & 0x80) !== 0;
      let len = buf[1] & 0x7f;
      let off = 2;
      if (len === 126) {
        if (buf.length < 4) return;
        len = buf.readUInt16BE(2);
        off = 4;
      } else if (len === 127) {
        if (buf.length < 10) return;
        len = Number(buf.readBigUInt64BE(2));
        off = 10;
      }
      if (len > 32 * 1024 * 1024) return sock.destroy(); // 32MB sanity cap
      const maskOff = off;
      if (masked) off += 4;
      if (buf.length < off + len) return;
      let payload = buf.subarray(off, off + len);
      if (masked) {
        const mask = buf.subarray(maskOff, maskOff + 4);
        payload = Buffer.from(payload);
        for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
      }
      buf = buf.subarray(off + len);
      if (op === 8) return onClose();
      if (op === 9) {
        // ping → pong with same payload
        const pong = Buffer.concat([Buffer.from([0x8a, payload.length]), payload]);
        sock.write(pong);
        continue;
      }
      if (op === 10) continue; // pong
      if (op === 1 || op === 2 || op === 0) {
        if (op !== 0) fragments = [payload];
        else if (fragments) fragments.push(payload);
        if (fin && fragments) {
          const full = Buffer.concat(fragments);
          fragments = null;
          onMessage(full.toString("utf8"));
        }
      }
    }
  };
}

// ---- rooms / clients -------------------------------------------------------
const clients = new Set(); // {sock, code, name, room, watch:Set}

function rosterFor(viewer) {
  return {
    t: "roster",
    users: [...clients]
      .filter(
        (c) =>
          c.code &&
          (c === viewer || c.room === viewer.room || viewer.watch.has(c.code)),
      )
      .map((c) => ({ code: c.code, name: c.name || "", room: c.room || "" })),
  };
}
function sendObj(client, obj) {
  if (client && !client.sock.destroyed)
    client.sock.write(encodeFrame(JSON.stringify(obj)));
}
function broadcastRosters() {
  clients.forEach((c) => {
    if (c.code) sendObj(c, rosterFor(c));
  });
}
function broadcastRoom(room, obj, except) {
  const f = encodeFrame(JSON.stringify(obj));
  clients.forEach((c) => {
    if (c.room === room && c !== except) c.sock.write(f);
  });
}
function toCode(sender, code, obj) {
  const c = [...clients].find((c) => c.code === code);
  if (c && (c.room === sender.room || sender.watch.has(code))) sendObj(c, obj);
}

http.on("upgrade", (req, sock) => {
  const key = req.headers["sec-websocket-key"];
  if (!key || !allowedOrigin(req)) {
    try { sock.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n"); } catch (_) {}
    return;
  }
  sock.write(
    "HTTP/1.1 101 Switching Protocols\r\n" +
      "Upgrade: websocket\r\nConnection: Upgrade\r\n" +
      "Sec-WebSocket-Accept: " + accept(key) + "\r\n\r\n",
  );
  sock.setNoDelay(true);
  const client = { sock, code: null, name: "", room: null, watch: new Set() };
  clients.add(client);

  const drop = () => {
    if (!clients.has(client)) return;
    clients.delete(client);
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

  sock.on(
    "data",
    makeParser(
      (text) => {
        let m;
        try {
          m = JSON.parse(text);
        } catch (_) {
          return;
        }
        if (m.t === "hello") {
          const code = String(m.code || "").toUpperCase();
          const token = String(m.token || "");
          if (!validCode(code) || !validToken(token)) {
            sendObj(client, { t: "error", code: "bad_identity" });
            setTimeout(drop, 25).unref?.();
            return;
          }
          if (identities[code] && !sameToken(identities[code], token)) {
            sendObj(client, { t: "error", code: "identity_in_use" });
            setTimeout(drop, 25).unref?.();
            return;
          }
          if (!identities[code]) {
            identities[code] = token;
            saveIdentities();
          }
          client.code = code;
          client.name = String(m.name || "").slice(0, 24);
          // one connection per code: drop a stale ghost of the same identity
          clients.forEach((c) => {
            if (c !== client && c.code === client.code) {
              try { c.sock.destroy(); } catch (_) {}
              clients.delete(c);
            }
          });
          broadcastRosters();
        } else if (m.t === "join" && client.code) {
          const nextRoom = String(m.room || "").slice(0, 32);
          if (!/^apt:[A-Za-z0-9_-]{1,24}$/.test(nextRoom)) return;
          if (client.room && client.room !== nextRoom)
            broadcastRoom(client.room, {
              t: "left",
              room: client.room,
              code: client.code,
              name: client.name,
            });
          client.room = nextRoom;
          broadcastRoom(
            client.room,
            { t: "joined", room: client.room, code: client.code, name: client.name },
            client,
          );
          broadcastRosters();
        } else if (m.t === "watch" && client.code) {
          client.watch = new Set(
            (Array.isArray(m.codes) ? m.codes : [])
              .map((code) => String(code || "").toUpperCase())
              .filter(validCode)
              .slice(0, 200),
          );
          sendObj(client, rosterFor(client));
        } else if (m.t === "msg" && client.code) {
          const out = { t: "msg", from: client.code, data: m.data };
          if (m.to) toCode(client, String(m.to).toUpperCase(), out);
          else if (client.room) broadcastRoom(client.room, out, client);
        }
      },
      drop,
      sock,
    ),
  );
  sock.on("close", drop);
  sock.on("error", drop);
});

http.listen(PORT, () => {
  console.log(`3dhome relay + app server on http://localhost:${PORT}`);
  console.log(`Friends on your network: http://<your-ip>:${PORT}`);
});
