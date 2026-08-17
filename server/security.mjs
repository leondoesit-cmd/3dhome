// Security helpers shared by the relay and its regression tests.
// Kept dependency-free so the bundled server remains a single-command tool.
import { lookup as dnsLookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import { realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

const REDIRECTS = new Set([301, 302, 303, 307, 308]);

function ipv4Parts(address) {
  if (isIP(address) !== 4) return null;
  const p = address.split(".").map(Number);
  return p.length === 4 && p.every((n) => n >= 0 && n <= 255) ? p : null;
}

export function isPublicAddress(address) {
  const v4 = ipv4Parts(address);
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
  const mapped = a.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  return mapped ? isPublicAddress(mapped[1]) : true;
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

function requestPinned(target, address, options) {
  const request = target.url.protocol === "https:" ? httpsRequest : httpRequest;
  const port = target.url.port || (target.url.protocol === "https:" ? 443 : 80);
  const hostHeader = target.url.port
    ? target.url.hostname + ":" + target.url.port
    : target.url.hostname;
  return new Promise((resolveRequest) => {
    const req = request(
      {
        protocol: target.url.protocol,
        hostname: address.address,
        family: address.family,
        port,
        path: target.url.pathname + target.url.search,
        method: "GET",
        servername: target.url.hostname.replace(/^\[|\]$/g, ""),
        headers: { ...options.headers, Host: hostHeader },
      },
      (res) => {
        const chunks = [];
        let size = 0;
        res.on("data", (chunk) => {
          if (size >= options.maxBytes) return;
          const room = options.maxBytes - size;
          const piece = chunk.length > room ? chunk.subarray(0, room) : chunk;
          chunks.push(piece);
          size += piece.length;
          if (size >= options.maxBytes) res.destroy();
        });
        res.on("end", () =>
          resolveRequest({
            ok: true,
            status: res.statusCode || 0,
            headers: res.headers,
            body: Buffer.concat(chunks, size).toString("utf8"),
          }),
        );
        // Reaching the byte cap intentionally destroys the response stream.
        res.on("close", () => {
          if (size >= options.maxBytes)
            resolveRequest({
              ok: true,
              status: res.statusCode || 0,
              headers: res.headers,
              body: Buffer.concat(chunks, size).toString("utf8"),
            });
        });
        res.on("error", (error) => resolveRequest({ ok: false, error }));
      },
    );
    req.setTimeout(options.timeoutMs, () => req.destroy(new Error("timeout")));
    req.on("error", (error) => resolveRequest({ ok: false, error }));
    req.end();
  });
}

export async function safeHttpGet(raw, options = {}) {
  const cfg = {
    lookup: options.lookup || dnsLookup,
    maxBytes: options.maxBytes || 2 * 1024 * 1024,
    maxRedirects: options.maxRedirects == null ? 5 : options.maxRedirects,
    timeoutMs: options.timeoutMs || 12000,
    headers: options.headers || {},
  };
  let current = raw;
  for (let redirects = 0; redirects <= cfg.maxRedirects; redirects++) {
    const target = await resolvePublicUrl(current, cfg.lookup);
    if (!target) return { ok: false, status: 400, text: "", url: String(current) };

    let response = null;
    for (const address of target.addresses) {
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

export async function safeStaticFile(root, requestPath) {
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

  const relLexical = relative(rootReal, lexical);
  const parts = relLexical.split(sep);
  if (parts[0] === "server" || parts.some((part) => part.startsWith("."))) return null;

  let fileReal;
  try {
    fileReal = await realpath(lexical);
  } catch (_) {
    return null;
  }
  return outside(rootReal, fileReal) ? null : fileReal;
}
