// Security helpers shared by the relay and its regression tests.
// Kept dependency-free so the bundled server remains a single-command tool.
import { lookup as dnsLookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import { realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

const REDIRECTS = new Set([301, 302, 303, 307, 308]);

function normalizeAddress(address) {
  const a = String(address || "").toLowerCase().split("%")[0];
  return isIP(a) === 6 ? new URL(`http://[${a}]`).hostname.slice(1, -1) : a;
}

function ipv4Parts(address) {
  if (isIP(address) !== 4) return null;
  const p = address.split(".").map(Number);
  return p.length === 4 && p.every((n) => n >= 0 && n <= 255) ? p : null;
}

// IPv4 buried in an IPv6 address: dotted or hex, mapped (::ffff:) or compatible (::).
function embeddedIPv4(address) {
  const a = normalizeAddress(address);
  const dotted = a.match(/^(?:::ffff:|::)(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) return dotted[1];
  const hex = a.match(/^(?:::ffff:|::)([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (!hex) return null;
  const hi = parseInt(hex[1], 16), lo = parseInt(hex[2], 16);
  return `${(hi >> 8) & 255}.${hi & 255}.${(lo >> 8) & 255}.${lo & 255}`;
}

export function isPublicAddress(address) {
  address = normalizeAddress(address);
  const v4 = ipv4Parts(address) || ipv4Parts(embeddedIPv4(address) || "");
  if (v4) {
    const [a, b] = v4;
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 0) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }

  if (isIP(address) !== 6) return false;
  const a = address.toLowerCase().split("%")[0];
  if (a === "::" || a === "::1") return false;
  if (a.startsWith("fc") || a.startsWith("fd")) return false; // unique-local
  if (/^fe[89ab]/.test(a)) return false; // link-local
  if (a.startsWith("ff")) return false; // multicast
  return true;
}

function parseHttpUrl(raw) {
  let url;
  try {
    url = raw instanceof URL ? new URL(raw.href) : new URL(raw);
  } catch (_) {
    return null;
  }
  if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password)
    return null;
  return url;
}

export async function resolvePublicUrl(raw, lookupFn = dnsLookup) {
  const url = parseHttpUrl(raw);
  if (!url) return null;
  const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local")
  )
    return null;

  let addresses;
  if (isIP(hostname)) addresses = [{ address: hostname, family: isIP(hostname) }];
  else {
    try {
      addresses = await lookupFn(hostname, { all: true, verbatim: true });
    } catch (_) {
      return null;
    }
  }
  if (!addresses.length || addresses.some((entry) => !isPublicAddress(entry.address))) return null;
  return { url, addresses };
}

// Exported so deadline and abort behaviour can be tested against loopback only.
export function requestPinned(target, address, options = {}) {
  if (options.signal?.aborted) return Promise.resolve({ ok: false, error: options.signal.reason || new Error("aborted") });
  const maxBytes = options.maxBytes || 2 * 1024 * 1024;
  const request = target.url.protocol === "https:" ? httpsRequest : httpRequest;
  const port = target.url.port || (target.url.protocol === "https:" ? 443 : 80);
  const hostHeader = target.url.port
    ? target.url.hostname + ":" + target.url.port
    : target.url.hostname;
  const method = String(options.method || "GET").toUpperCase();
  const body = options.body == null ? null : Buffer.from(String(options.body), "utf8");
  const headers = { ...options.headers, Host: hostHeader };
  if (body && headers["Content-Length"] == null && headers["content-length"] == null) {
    headers["Content-Length"] = String(body.length);
  }
  return new Promise((resolveRequest) => {
    let req, timer;
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", abort);
      resolveRequest(value);
    };
    const abort = () => req.destroy(options.signal?.reason instanceof Error ? options.signal.reason : new Error("aborted"));
    try {
      req = request(
        {
          protocol: target.url.protocol,
          hostname: address.address,
          family: address.family,
          port,
          path: target.url.pathname + target.url.search,
          method,
          servername: target.url.hostname.replace(/^\[|\]$/g, ""),
          headers,
        },
        (res) => {
          const chunks = [];
          let size = 0;
          res.on("data", (chunk) => {
            if (size >= maxBytes) return;
            const room = maxBytes - size;
            const piece = chunk.length > room ? chunk.subarray(0, room) : chunk;
            chunks.push(piece);
            size += piece.length;
            if (size >= maxBytes) res.destroy();
          });
          res.on("end", () =>
            finish({
              ok: true,
              status: res.statusCode || 0,
              headers: res.headers,
              body: Buffer.concat(chunks, size).toString("utf8"),
            }),
          );
          // Reaching the byte cap intentionally destroys the response stream.
          res.on("close", () => {
            if (size >= maxBytes)
              finish({
                ok: true,
                status: res.statusCode || 0,
                headers: res.headers,
                body: Buffer.concat(chunks, size).toString("utf8"),
              });
            else finish({ ok: false, error: new Error("response closed before end") });
          });
          res.on("error", (error) => finish({ ok: false, error }));
        },
      );
    } catch (error) {
      // request() throws synchronously on an invalid header (a CR/LF in a
      // value). Report a failed request: a rejection here would escape the
      // relay's async request handler and terminate the process.
      finish({ ok: false, error });
      return;
    }
    options.signal?.addEventListener("abort", abort, { once: true });
    if (options.signal?.aborted) abort();
    if (options.deadlineMs > 0) timer = setTimeout(() => req.destroy(new Error("deadline exceeded")), options.deadlineMs);
    req.setTimeout(options.timeoutMs || 12000, () => req.destroy(new Error("timeout")));
    req.on("error", (error) => finish({ ok: false, error }));
    try {
      if (body && method !== "GET" && method !== "HEAD") req.write(body);
      req.end();
    } catch (error) {
      req.destroy();
      finish({ ok: false, error });
    }
  });
}

export async function safeHttpGet(raw, options = {}) {
  const cfg = {
    signal: options.signal,
    deadlineMs: options.deadlineMs,
    lookup: options.lookup || dnsLookup,
    maxBytes: options.maxBytes || 2 * 1024 * 1024,
    maxRedirects: options.maxRedirects == null ? 5 : options.maxRedirects,
    timeoutMs: options.timeoutMs || 12000,
    headers: options.headers || {},
  };
  let current = raw;
  for (let redirects = 0; redirects <= cfg.maxRedirects; redirects++) {
    if (cfg.signal?.aborted) return { ok: false, error: cfg.signal.reason };
    const target = await withAbort(resolvePublicUrl(current, cfg.lookup), cfg.signal);
    if (cfg.signal?.aborted) return { ok: false, error: cfg.signal.reason };
    if (!target) return { ok: false, status: 400, text: "", url: String(current) };

    let response = null;
    for (const address of target.addresses) {
      if (cfg.signal?.aborted) break;
      response = await requestPinned(target, address, cfg);
      if (response.ok) break;
    }
    if (!response || !response.ok)
      return {
        ok: false,
        status: 0,
        text: "",
        url: target.url.href,
        error: String(response && response.error ? response.error : "request failed"),
      };

    if (REDIRECTS.has(response.status) && response.headers.location) {
      if (redirects === cfg.maxRedirects)
        return { ok: false, status: 508, text: "", url: target.url.href };
      current = new URL(response.headers.location, target.url).href;
      continue;
    }

    const contentType = String(response.headers["content-type"] || "");
    if (
      response.status >= 200 &&
      response.status < 300 &&
      !/text\/html|application\/xhtml|text\/plain|json/i.test(contentType)
    )
      return { ok: false, status: 415, text: "", url: target.url.href };
    return {
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      text: response.body,
      url: target.url.href,
    };
  }
  return { ok: false, status: 508, text: "", url: String(current) };
}

function outside(root, candidate) {
  const rel = relative(root, candidate);
  return rel === ".." || rel.startsWith(".." + sep) || isAbsolute(rel);
}

// The server tree and every dot-entry (.git, .local, .model-backups, the relay's
// identity file) are private. Case-insensitive: Windows serves /Server/ as /server/.
function privatePath(parts) {
  return parts[0].toLowerCase() === "server" || parts.some((part) => part.startsWith("."));
}

// options.allow = { files: Set, dirs: Set } of top-level names that may be served
// (server/public_paths.json); anything else at the root stays private.
export async function safeStaticFile(root, requestPath, options = {}) {
  const rootReal = await realpath(root);
  let decoded;
  try {
    decoded = decodeURIComponent(requestPath);
  } catch (_) {
    return null;
  }
  if (decoded.includes("\0")) return null;
  if (decoded === "/") decoded = "/index.html";
  const lexical = resolve(rootReal, "." + (decoded.startsWith("/") ? decoded : "/" + decoded));
  if (outside(rootReal, lexical)) return null;

  // "~<digit>" is how a Windows 8.3 short name aliases a long one (GIT~1 is .git).
  const parts = relative(rootReal, lexical).split(sep);
  if (privatePath(parts) || parts.some((part) => /~\d/.test(part))) return null;

  let fileReal;
  try {
    fileReal = await realpath(lexical);
  } catch (_) {
    return null;
  }
  if (outside(rootReal, fileReal)) return null;
  // Aliases (case, short names) only collapse to their real name here, so the
  // private-path rule runs again on the canonical path.
  const realParts = relative(rootReal, fileReal).split(sep);
  if (privatePath(realParts)) return null;
  if (options.allow) {
    const top = realParts[0];
    if (!(realParts.length === 1 ? options.allow.files.has(top) : options.allow.dirs.has(top))) return null;
  }
  return fileReal;
}

// Home hubs live on the LAN. The public-URL helper above exists to STOP the
// product-size proxy reaching private IPs. LAN access uses an explicit allow-list
// shared by request admission and destination resolution.
const LAN_PORTS = new Set([80, 443, 1880, 1883, 3000, 6052, 8080, 8123, 8443, 8883, 9001, 9123]);

function addressBits(address) {
  const family = isIP(address);
  if (family === 4) {
    let value = 0n;
    for (const part of address.split(".")) value = (value << 8n) | BigInt(part);
    return { family, value, width: 32 };
  }
  if (family !== 6) return null;
  const [left, right] = address.split("::");
  const start = left ? left.split(":") : [];
  const end = right ? right.split(":") : [];
  const parts = right === undefined ? start : [...start, ...Array(8 - start.length - end.length).fill("0"), ...end];
  let value = 0n;
  for (const part of parts) value = (value << 16n) | BigInt("0x" + part);
  return { family, value, width: 128 };
}

let extraCidrText = null, extraCidrs = [];
function lanExtraCidrs() {
  const text = process.env.HOME3D_LAN_EXTRA_CIDRS || "";
  if (text === extraCidrText) return extraCidrs;
  extraCidrText = text;
  extraCidrs = [];
  for (const entry of text.split(",")) {
    const parts = entry.trim().split("/");
    if (parts.length !== 2 || !/^\d+$/.test(parts[1])) continue;
    const network = addressBits(normalizeAddress(parts[0]));
    const prefix = Number(parts[1]);
    if (!network || prefix > network.width) continue;
    const shift = BigInt(network.width - prefix);
    extraCidrs.push({ family: network.family, shift, prefix: network.value >> shift });
  }
  return extraCidrs;
}

export function isLanAddress(address) {
  address = normalizeAddress(address);
  if (isLoopbackAddress(address)) return true;
  const embedded = embeddedIPv4(address);
  const v4 = ipv4Parts(embedded || address);
  if (v4) {
    const [a, b] = v4;
    if (a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) return true;
  } else if (isIP(address) === 6 && /^(fc|fd)/.test(address)) return true;
  const candidates = [addressBits(address)];
  if (embedded) candidates.push(addressBits(embedded));
  return lanExtraCidrs().some((cidr) => candidates.some((candidate) => candidate &&
    candidate.family === cidr.family && (candidate.value >> cidr.shift) === cidr.prefix));
}

function lanPortOk(url) {
  const port = Number(url.port) || (url.protocol === "https:" ? 443 : 80);
  return LAN_PORTS.has(port);
}

export async function resolveLanUrl(raw, lookupFn = dnsLookup) {
  const url = parseHttpUrl(raw);
  if (!url || !lanPortOk(url)) return null;
  const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  let addresses;
  if (isIP(hostname)) addresses = [{ address: hostname, family: isIP(hostname) }];
  else {
    try {
      addresses = await lookupFn(hostname, { all: true, verbatim: true });
    } catch (_) {
      return null;
    }
  }
  if (!addresses.length || addresses.some((entry) => !isLanAddress(entry.address))) return null;
  return { url, addresses };
}

const LAN_HEADER_ALLOW = new Set([
  "authorization",
  "content-type",
  "accept",
  "hue-application-key",
]);

export function sanitizeLanHeaders(headers) {
  const out = {};
  if (!headers || typeof headers !== "object") return out;
  for (const [key, value] of Object.entries(headers)) {
    const name = String(key).toLowerCase();
    if (!LAN_HEADER_ALLOW.has(name)) continue;
    // CR/LF/NUL make Node's request() throw: drop the header, not the server.
    if (typeof value !== "string" || /[\r\n\0]/.test(value)) continue;
    out[key] = value.slice(0, 800);
  }
  return out;
}

// ---- who may use the machine-local endpoints --------------------------------
// The relay runs in two places: on the owner's machine, where a LAN smart-home
// proxy, disk backups and a local vision model make sense, and publicly behind
// a hosting proxy, where they must not exist. A DNS-rebinding page reaches a
// local relay from the owner's own browser (loopback socket, Origin == Host),
// so the Host header must also name this machine or the LAN, never a domain.
const HOST_HEADER = /^(\[[0-9a-f:.]+\]|[a-z0-9.-]+)(?::\d{1,5})?$/i;

// The Host header's name, or "" when it is missing or malformed (userinfo,
// paths and other URL syntax never pass the pattern).
export function requestHostname(req) {
  const match = HOST_HEADER.exec(String((req && req.headers && req.headers.host) || "").trim());
  return match ? normalizeAddress(match[1].replace(/^\[|\]$/g, "").replace(/\.$/, "")) : "";
}

export function isLoopbackAddress(address) {
  const a = normalizeAddress(address);
  if (a === "::1") return true;
  const v4 = ipv4Parts(a) || ipv4Parts(embeddedIPv4(a) || "");
  return !!v4 && v4[0] === 127;
}

function proxied(req) {
  return Object.keys(req.headers).some((key) => {
    const name = key.toLowerCase();
    return req.headers[key] != null &&
      (name === "forwarded" || name === "x-real-ip" || name.startsWith("x-forwarded-"));
  });
}

function loopbackHostname(name) {
  return name === "localhost" || name.endsWith(".localhost") || isLoopbackAddress(name);
}

// This machine only: model backups and the key-holding agent endpoints.
export function localOnlyRequest(req, { publicMode = false, allowedHosts = new Set() } = {}) {
  if (publicMode || !req || !req.headers || proxied(req)) return false;
  if (!isLoopbackAddress(req.socket && req.socket.remoteAddress)) return false;
  const name = requestHostname(req);
  return !!name && (loopbackHostname(name) || allowedHosts.has(name));
}

// This machine or its LAN: the smart-home proxy and opt-in blueprint vision, which a
// phone opening http://<pc-ip>:8765 legitimately uses. A rebinding attacker
// can only publish dotted public names, never .local or single-label ones.
export function lanOnlyRequest(req, { publicMode = false, allowedHosts = new Set() } = {}) {
  if (publicMode || !req || !req.headers || proxied(req)) return false;
  const remote = String((req.socket && req.socket.remoteAddress) || "");
  if (!isLoopbackAddress(remote) && !isLanAddress(remote)) return false;
  const name = requestHostname(req);
  if (!name) return false;
  if (loopbackHostname(name) || allowedHosts.has(name)) return true;
  if (isIP(name)) return isLanAddress(name);
  return name.endsWith(".local") || !name.includes(".");
}

export async function safeLanRequest(raw, options = {}) {
  const cfg = {
    lookup: options.lookup || dnsLookup,
    maxBytes: options.maxBytes || 512 * 1024,
    timeoutMs: options.timeoutMs || 8000,
    headers: sanitizeLanHeaders(options.headers),
    method: String(options.method || "GET").toUpperCase(),
    body: options.body == null ? undefined : String(options.body).slice(0, 256 * 1024),
  };
  if (!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(cfg.method)) {
    return { ok: false, status: 405, text: "method", url: String(raw) };
  }
  const target = await resolveLanUrl(raw, cfg.lookup);
  if (!target) return { ok: false, status: 400, text: "not a LAN hub URL", url: String(raw) };
  let response = null;
  for (const address of target.addresses) {
    response = await requestPinned(target, address, cfg);
    if (response.ok) break;
  }
  if (!response || !response.ok) {
    return {
      ok: false,
      status: 0,
      text: "",
      url: target.url.href,
      error: String(response && response.error ? response.error : "request failed"),
    };
  }
  return {
    ok: response.status >= 200 && response.status < 300,
    status: response.status,
    text: response.body,
    url: target.url.href,
  };
}

// Resolve on cancellation even when a system DNS lookup cannot itself be stopped.
export function withAbort(promise, signal) {
  if (!signal) return promise;
  if (signal.aborted) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const abort = () => { signal.removeEventListener("abort", abort); resolve(null); };
    signal.addEventListener("abort", abort, { once: true });
    promise.then(value => { signal.removeEventListener("abort", abort); resolve(value); },
      error => { signal.removeEventListener("abort", abort); reject(error); });
  });
}

export function etagMatches(header, etag) {
  if (typeof header !== "string" || typeof etag !== "string") return false;
  const tag = etag.replace(/^W\//, "");
  if (!/^"[\x21\x23-\x7e\x80-\xff]*"$/.test(tag)) return false;
  if (header.trim() === "*") return true;
  // A comma inside an opaque tag is data. Parse each complete list member so
  // a quoted substring inside malformed input cannot accidentally match.
  const pattern = /(?:W\/)?"[\x21\x23-\x7e\x80-\xff]*"/y;
  let at = 0, found = false;
  while (at < header.length) {
    while (at < header.length && /[\t ,]/.test(header[at])) at++;
    if (at === header.length) break;
    pattern.lastIndex = at;
    const match = pattern.exec(header);
    if (!match) return false;
    found ||= match[0].replace(/^W\//, "") === tag;
    at = pattern.lastIndex;
    while (at < header.length && /[\t ]/.test(header[at])) at++;
    if (at < header.length && header[at] !== ",") return false;
  }
  return found;
}

export function createByteLru(maxBytes) {
  const entries = new Map();
  let bytes = 0;
  function remove(key) {
    const entry = entries.get(key);
    if (!entry) return false;
    bytes -= entry.bytes;
    return entries.delete(key);
  }
  function evict() {
    while (bytes > maxBytes && entries.size) remove(entries.keys().next().value);
  }
  return {
    get(key) {
      const entry = entries.get(key);
      if (!entry) return undefined;
      entries.delete(key);
      entries.set(key, entry);
      return entry.value;
    },
    set(key, value, cost) {
      remove(key);
      if (!Number.isFinite(cost) || cost < 0 || cost > maxBytes) return;
      entries.set(key, { value, bytes: cost });
      bytes += cost;
      evict();
    },
    resize(key, cost) {
      const entry = entries.get(key);
      if (!entry) return;
      if (!Number.isFinite(cost) || cost < 0 || cost > maxBytes) { remove(key); return; }
      bytes += cost - entry.bytes;
      entry.bytes = cost;
      evict();
    },
    delete: remove,
    get bytes() { return bytes; },
    get size() { return entries.size; },
  };
}

export function createRateLimiter({ rate, burst, maxKeys = 10000, now = () => performance.now() }) {
  const buckets = new Map();
  function refill(bucket, at) {
    bucket.tokens = Math.min(burst, bucket.tokens + Math.max(0, at - bucket.at) * rate / 1000);
    bucket.at = at;
  }
  return {
    take(key) {
      const at = now();
      let bucket = buckets.get(key);
      if (!bucket) {
        if (buckets.size >= maxKeys) return { ok: false, retryAfterMs: 1000 / rate };
        bucket = { tokens: burst, at };
        buckets.set(key, bucket);
      }
      refill(bucket, at);
      if (bucket.tokens < 1) return { ok: false, retryAfterMs: (1 - bucket.tokens) * 1000 / rate };
      bucket.tokens--;
      return { ok: true, retryAfterMs: 0 };
    },
    sweep() {
      const at = now();
      for (const [key, bucket] of buckets) {
        refill(bucket, at);
        if (bucket.tokens >= burst) buckets.delete(key);
      }
    },
    get size() { return buckets.size; },
  };
}
