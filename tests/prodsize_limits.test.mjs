import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { EventEmitter } from "node:events";
import { runInNewContext } from "node:vm";
import { sourceFunctionText } from "./helpers/source_function.mjs";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as pause } from "node:timers/promises";
import { createRateLimiter, requestPinned, safeHttpGet, withAbort } from "../server/security.mjs";
import { rawRequest, startRelay } from "./helpers/relay_process.mjs";

test("HTTP buckets burst, refill, report retry time, fail closed and sweep", () => {
  let at = 0;
  const limiter = createRateLimiter({ rate: 2, burst: 2, maxKeys: 2, now: () => at });
  assert.deepEqual(limiter.take("a"), { ok: true, retryAfterMs: 0 });
  assert.equal(limiter.take("a").ok, true);
  assert.deepEqual(limiter.take("a"), { ok: false, retryAfterMs: 500 });
  at = 250; assert.equal(limiter.take("a").retryAfterMs, 250);
  at = 500; assert.equal(limiter.take("a").ok, true);
  assert.equal(limiter.take("b").ok, true); assert.equal(limiter.size, 2);
  assert.equal(limiter.take("c").ok, false); assert.equal(limiter.size, 2);
  at = 1000; limiter.sweep(); assert.equal(limiter.size, 1);
  at = 1500; limiter.sweep(); assert.equal(limiter.size, 0);
  assert.equal(limiter.take("c").ok, true);
});

async function localServer(t, handler) {
  const server = createServer(handler);
  let connections = 0;
  server.on("connection", () => connections++);
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  return { target: { url: new URL("http://127.0.0.1:" + server.address().port) }, get connections() { return connections; } };
}
const address = { address: "127.0.0.1", family: 4 };
const defaults = { timeoutMs: 160, maxBytes: 1024 * 1024 };

test("a trickling response is bounded by an absolute deadline and by abort", async t => {
  const server = await localServer(t, (req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" }); res.write("a");
    const timer = setInterval(() => res.write("a"), 50);
    res.on("close", () => clearInterval(timer));
  });
  let start = performance.now();
  const deadline = await requestPinned(server.target, address, { ...defaults, deadlineMs: 320 });
  assert.equal(deadline.ok, false); assert.match(String(deadline.error), /deadline/);
  assert.ok(performance.now() - start >= 250); assert.ok(performance.now() - start < 1800);
  const controller = new AbortController();
  start = performance.now();
  const waiting = requestPinned(server.target, address, { ...defaults, signal: controller.signal });
  setTimeout(() => controller.abort(), 170);
  assert.equal((await waiting).ok, false); assert.ok(performance.now() - start < 1500);
});

test("pre-abort never opens a connection or invokes public DNS", async t => {
  const server = await localServer(t, () => assert.fail("no request after pre-abort"));
  const controller = new AbortController(); controller.abort();
  assert.equal((await requestPinned(server.target, address, { ...defaults, signal: controller.signal })).ok, false);
  let lookups = 0;
  assert.equal((await safeHttpGet("http://example.test/", {
    signal: controller.signal, lookup() { lookups++; throw Error("no DNS"); },
  })).ok, false);
  await pause(50); assert.equal(server.connections, 0); assert.equal(lookups, 0);
});

test("abort settles a pending DNS lookup", async () => {
  const controller = new AbortController();
  let calls = 0;
  const result = safeHttpGet("http://example.test/", { signal: controller.signal,
    lookup() { calls++; return new Promise(() => {}); } });
  controller.abort();
  assert.equal((await result).ok, false); assert.equal(calls, 1);
});

test("premature response close fails while maxBytes truncation still succeeds", async t => {
  const closed = await localServer(t, (req, res) => {
    res.writeHead(200, { "Content-Length": "1000" }); res.write("short");
    setTimeout(() => res.destroy(), 20);
  });
  assert.equal((await requestPinned(closed.target, address, defaults)).ok, false);
  const capped = await localServer(t, (req, res) => res.end("abcdefghij"));
  const result = await requestPinned(capped.target, address, { ...defaults, maxBytes: 4 });
  assert.equal(result.ok, true); assert.equal(result.body, "abcd");
});

for (const publicMode of ["0", "1"]) test("prodsize charges rejected URLs and separates proxy addresses (public=" + publicMode + ")", async t => {
  const relay = await startRelay(t, { HOME3D_PUBLIC: publicMode, HOME3D_TRUST_PROXY: "1",
    HOME3D_PRODSIZE_BURST: "2", HOME3D_PRODSIZE_RATE: "0.001" });
  const path = "/api/prodsize?q=sofa&url=" + encodeURIComponent("http://127.0.0.1/");
  const request = (ip) => rawRequest(relay.port, { path, headers: { "X-Forwarded-For": ip } });
  for (let i = 0; i < 2; i++) {
    const response = await request("198.51.100.1");
    assert.equal(response.status, 400); assert.equal(JSON.parse(response.text).error, "bad url");
  }
  const limited = await request("198.51.100.1");
  assert.equal(limited.status, 429); assert.equal(JSON.parse(limited.text).error, "rate limit");
  assert.ok(Number(limited.headers["retry-after"]) > 0);
  assert.equal((await request("198.51.100.2")).status, 400);
});

test("fresh cache hits are free even beyond the burst", async t => {
  const dir = await mkdtemp(join(tmpdir(), "prodsize-seed-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = join(dir, "cache.json");
  await writeFile(file, JSON.stringify({ "sofa|,,||he": { at: Date.now(), data: { query: "sofa", results: [] } } }));
  const relay = await startRelay(t, { HOME3D_PRODSIZE_CACHE_FILE: file, HOME3D_PRODSIZE_BURST: "1" });
  for (let i = 0; i < 8; i++) {
    const response = await rawRequest(relay.port, { path: "/api/prodsize?q=sofa" });
    assert.equal(response.status, 200); assert.equal(JSON.parse(response.text).cached, true);
  }
});
// The listener cannot be imported. Execute its actual declaration with a fake
// lookup and clock to cover resource cleanup without any outbound requests.
async function lookupHarness(lookup) {
  const source = await readFile(new URL("../server/relay.mjs", import.meta.url), "utf8");
  const cache = {}, timers = new Map();
  let serial = 0, at = 0, flushes = 0;
  const context = { AbortController, prodsizeInflight: 0, PRODSIZE_MAX_INFLIGHT: 1, PRODSIZE_DEADLINE_MS: 100,
    CACHE_TTL: 100000, loadCache: async () => cache, remoteAddress: () => "peer",
    prodsizeLimiter: createRateLimiter({ rate: 100, burst: 100 }), cacheDirty: false,
    flushCache: () => flushes++, lookupProduct: lookup, withAbort,
    resolvePublicUrl: async () => { throw Error("unexpected DNS work"); },
    httpGet: async (url, signal) => ({ signal }),
    setTimeout(fn, delay) { const id = ++serial; timers.set(id, { fn, at: at + delay }); return id; },
    clearTimeout: id => timers.delete(id),
    json(res, status, body) { res.status = status; res.body = body; res.writableEnded = true; },
  };
  const invoke = runInNewContext("(" + sourceFunctionText(source, "prodsize") + ")", context);
  function response() {
    const res = new EventEmitter(); res.headers = {}; res.destroyed = false; res.writableEnded = false;
    res.setHeader = (key, value) => { res.headers[key] = value; }; return res;
  }
  return { cache, context, timers, get flushes() { return flushes; }, response,
    call: res => invoke({}, new URL("http://relay.test/api/prodsize?q=sofa"), res),
    advance(ms) {
      at += ms;
      for (const [id, timer] of [...timers].sort((a, b) => a[1].at - b[1].at)) {
        if (timer.at > at) continue;
        timers.delete(id); timer.fn();
      }
    },
  };
}

test("prodsize global admission returns busy and always releases finished work", async () => {
  let release;
  const h = await lookupHarness(() => new Promise(resolve => { release = resolve; }));
  const first = h.response(), waiting = h.call(first);
  await pause(0); assert.equal(h.context.prodsizeInflight, 1);
  const busy = h.response(); await h.call(busy);
  assert.equal(busy.status, 503); assert.equal(busy.body.error, "busy"); assert.equal(busy.headers["Retry-After"], "5");
  release({ results: [] }); await waiting;
  assert.equal(first.status, 200); assert.equal(h.context.prodsizeInflight, 0); assert.equal(h.timers.size, 0);
  assert.equal(h.flushes, 1); assert.equal(first.listenerCount("close"), 0);
});

for (const gone of [false, true]) test("aborted lookup returns partial without caching (client gone=" + gone + ")", async () => {
  let signal;
  const h = await lookupHarness(async (q, opts) => {
    ({ signal } = await opts.get("unused"));
    return new Promise(resolve => signal.addEventListener("abort", () => resolve({ results: [{ title: "partial" }] }), { once: true }));
  });
  const res = h.response(), pending = h.call(res); await pause(0);
  if (gone) res.emit("close"); else h.advance(100);
  await pending;
  assert.equal(signal.aborted, true); assert.equal(h.flushes, 0); assert.equal(Object.keys(h.cache).length, 0);
  assert.equal(h.context.prodsizeInflight, 0); assert.equal(h.timers.size, 0); assert.equal(res.listenerCount("close"), 0);
  if (gone) assert.equal(res.status, undefined);
  else { assert.equal(res.status, 200); assert.equal(res.body.partial, true); }
});

test("prodsize hard stop answers 504 even when the lookup ignores cancellation", async () => {
  const h = await lookupHarness(() => new Promise(() => {}));
  const res = h.response(), pending = h.call(res); await pause(0);
  h.advance(2100); await pending;
  assert.equal(res.status, 504); assert.equal(h.context.prodsizeInflight, 0);
  assert.equal(h.timers.size, 0); assert.equal(h.flushes, 0); assert.equal(res.listenerCount("close"), 0);
});
