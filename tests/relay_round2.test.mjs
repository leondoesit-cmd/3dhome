import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { codeFor } from "../js/net.js";
import { isLanAddress, lanOnlyRequest, resolveLanUrl } from "../server/security.mjs";
import { maskedFrame, openSocket, rawRequest, startRelay } from "./helpers/relay_process.mjs";

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const send = (socket, value) => socket.write(maskedFrame(JSON.stringify(value)));
const tokenFor = (letter) => letter.repeat(40);

async function until(predicate, ms = 3000) {
  const deadline = performance.now() + ms;
  while (!predicate()) {
    assert.ok(performance.now() < deadline, "condition reached before deadline");
    await pause(10);
  }
}

// Wait for a whole payload before joining chunks, including in the large-frame test.
function readFrames(socket, { autoPong = false } = {}) {
  const frames = [];
  let chunks = [], bytes = 0, needed = 2;
  socket.on("data", (chunk) => {
    chunks.push(chunk);
    bytes += chunk.length;
    while (bytes >= needed) {
      const buffer = Buffer.concat(chunks, bytes);
      chunks = [buffer];
      let size = buffer[1] & 127, offset = 2;
      if (size === 126) {
        if (bytes < 4) { needed = 4; break; }
        size = buffer.readUInt16BE(2); offset = 4;
      } else if (size === 127) {
        if (bytes < 10) { needed = 10; break; }
        size = Number(buffer.readBigUInt64BE(2)); offset = 10;
      }
      needed = size + offset;
      if (bytes < needed) break;
      const op = buffer[0] & 15;
      const text = buffer.subarray(offset, needed).toString("utf8");
      frames.push({ op, text, value: op === 1 ? JSON.parse(text) : null });
      if (op === 9 && autoPong) socket.write(maskedFrame(text, 10));
      bytes -= needed;
      chunks = bytes ? [buffer.subarray(needed)] : [];
      needed = 2;
    }
  });
  return {
    frames,
    async next(predicate, ms) {
      let found;
      await until(() => { found = frames.find(predicate); return !!found; }, ms);
      frames.splice(frames.indexOf(found), 1);
      return found;
    },
  };
}

async function client(t, relay, { headers, autoPong } = {}) {
  const socket = await openSocket(relay.port, relay.origin, headers);
  t.after(() => socket.destroy());
  socket.on("error", () => {});
  const reader = readFrames(socket, { autoPong });
  return { socket, ...reader };
}

async function hello(client, letter, code) {
  const token = tokenFor(letter);
  code = code || await codeFor(token);
  send(client.socket, { t: "hello", token, code });
  await client.next((frame) => frame.value?.t === "roster" && frame.value.users.some((u) => u.code === code));
  return code;
}

test("friend-code derivation is stable, valid, and agrees with the relay on an empty store", async (t) => {
  const relay = await startRelay(t);
  const c = await client(t, relay);
  const code = await codeFor(tokenFor("a"));
  assert.equal(code, "6N8P-9HD9", "SHA-256 prefix encoded in the existing alphabet");
  assert.equal(await codeFor(tokenFor("a")), code);
  assert.match(code, /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
  assert.notEqual(await codeFor(tokenFor("b")), code);
  assert.equal(await hello(c, "a"), code);
  await pause(150);
  assert.equal(await readFile(relay.identitiesFile, "utf8"), "{}", "new identities never write the legacy store");
});

test("a mismatched code is refused; stored legacy pairs keep ownership without eviction", async (t) => {
  const identities = { "ABCD-EFGH": tokenFor("a") };
  const relay = await startRelay(t, {}, { identities });
  const legacy = await client(t, relay);
  await hello(legacy, "a", "ABCD-EFGH");
  for (const code of ["ABCD-EFGH", "JKLM-NPQR"]) {
    const bad = await client(t, relay);
    send(bad.socket, { t: "hello", code, token: tokenFor("b") });
    await bad.next((frame) => frame.value?.t === "error");
    await until(() => bad.socket.destroyed);
  }
  const derived = await client(t, relay);
  await hello(derived, "c");
  await pause(150);
  assert.deepEqual(JSON.parse(await readFile(relay.identitiesFile, "utf8")), identities);
  assert.equal(legacy.socket.destroyed, false);
});

test("an existing legacy claim wins even if another token derives the same code", async (t) => {
  const code = await codeFor(tokenFor("a"));
  const relay = await startRelay(t, {}, { identities: { [code]: tokenFor("b") } });
  const attacker = await client(t, relay);
  send(attacker.socket, { t: "hello", code, token: tokenFor("a") });
  await attacker.next((frame) => frame.value?.code === "identity_in_use");
  const owner = await client(t, relay);
  await hello(owner, "b", code);
});

test("browser identity initialization preserves a saved pair and derives every new pair", async (t) => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, "localStorage", previous);
    else delete globalThis.localStorage;
  });
  for (const saved of [
    { home3d_mp_id: "ABCD-EFGH", home3d_mp_token: tokenFor("a") },
    {},
    { home3d_mp_id: "ABCD-EFGH" },
    { home3d_mp_token: tokenFor("b") },
  ]) {
    const store = new Map(Object.entries(saved));
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
      getItem: (key) => store.get(key) || null,
      setItem: (key, value) => store.set(key, value),
    } });
    const { NET } = await import(`../js/net.js?identity=${JSON.stringify(saved)}`);
    assert.equal(NET.code, saved.home3d_mp_id && saved.home3d_mp_token
      ? saved.home3d_mp_id : await codeFor(NET.token));
    assert.equal(store.get("home3d_mp_id"), NET.code);
    assert.equal(store.get("home3d_mp_token"), NET.token);
  }
});

test("new-identity hellos are limited per first-hop address; legacy and name refreshes still work", async (t) => {
  const relay = await startRelay(t, {
    HOME3D_TRUST_PROXY: "1", HOME3D_WS_IDENTITY_BURST: "1", HOME3D_WS_IDENTITY_RATE: "0.01",
  }, { identities: { "ABCD-EFGH": tokenFor("z") } });
  const headers = { "X-Forwarded-For": "198.51.100.1, 10.0.0.1" };
  const a = await client(t, relay, { headers });
  const code = await hello(a, "a");
  await hello(a, "a", code);
  const b = await client(t, relay, { headers: { "X-Forwarded-For": "198.51.100.1, 10.0.0.2" } });
  send(b.socket, { t: "hello", code: await codeFor(tokenFor("b")), token: tokenFor("b") });
  await b.next((frame) => frame.value?.code === "identity_rate_limit");
  const legacy = await client(t, relay, { headers });
  await hello(legacy, "z", "ABCD-EFGH");
  const other = await client(t, relay, { headers: { "X-Forwarded-For": "198.51.100.2, 10.0.0.1" } });
  await hello(other, "c");
});

test("an 8 MB message survives thousands of small TCP writes within a generous deadline", { timeout: 20000 }, async (t) => {
  const relay = await startRelay(t);
  const a = await client(t, relay), b = await client(t, relay);
  const code = await hello(a, "a");
  const guestCode = await hello(b, "b");
  for (const c of [a, b]) {
    send(c.socket, { t: "join", room: "apt:" + code });
    if (c === b) {
      await a.next((frame) => frame.value?.t === "knock" && frame.value.code === guestCode);
      send(a.socket, { t: "admit", code: guestCode });
    }
    await c.next((frame) => frame.value?.t === "roster" && frame.value.users.some((u) => u.room === "apt:" + code));
  }
  const data = "0123456789abcdef".repeat(512 * 1024 - 64);
  const frame = maskedFrame(JSON.stringify({ t: "msg", data }));
  const started = performance.now();
  for (let offset = 0; offset < frame.length; offset += 2048) {
    if (!a.socket.write(frame.subarray(offset, offset + 2048))) await once(a.socket, "drain");
    if (offset % 32768 === 0) await new Promise((resolve) => setImmediate(resolve));
  }
  const out = await b.next((f) => f.value?.t === "msg", 12000);
  assert.equal(out.value.data, data);
  assert.equal(out.value.from, code);
  assert.ok(performance.now() - started < 15000);
});

test("the server-wide client limit includes sockets waiting for hello and releases closed slots", async (t) => {
  const relay = await startRelay(t, { HOME3D_WS_MAX_CLIENTS: "2" });
  const a = await client(t, relay), b = await client(t, relay);
  await assert.rejects(openSocket(relay.port, relay.origin), /503/);
  a.socket.destroy();
  await pause(50);
  const replacement = await client(t, relay);
  assert.equal(replacement.socket.destroyed, false);
  assert.equal(b.socket.destroyed, false);
});

test("per-address limits ignore spoofed forwarding headers unless proxy trust is enabled", async (t) => {
  for (const trust of ["0", "1"]) {
    const relay = await startRelay(t, { HOME3D_WS_MAX_CLIENTS_PER_ADDRESS: "1", HOME3D_TRUST_PROXY: trust });
    await client(t, relay, { headers: { "X-Forwarded-For": "198.51.100.1, 10.0.0.1" } });
    await assert.rejects(openSocket(relay.port, relay.origin, {
      "X-Forwarded-For": "198.51.100.1, 10.0.0.2",
    }), /503/);
    const different = { "X-Forwarded-For": "198.51.100.2, 10.0.0.1" };
    if (trust === "1") await client(t, relay, { headers: different });
    else await assert.rejects(openSocket(relay.port, relay.origin, different), /503/);
  }
});

test("equivalent mapped and expanded IPv6 proxy addresses share a connection limit", async (t) => {
  const relay = await startRelay(t, { HOME3D_TRUST_PROXY: "1", HOME3D_WS_MAX_CLIENTS_PER_ADDRESS: "1" });
  await client(t, relay, { headers: { "X-Forwarded-For": "::ffff:192.168.1.2" } });
  await assert.rejects(openSocket(relay.port, relay.origin, { "X-Forwarded-For": "192.168.1.2" }), /503/);
  await client(t, relay, { headers: { "X-Forwarded-For": "fd00::1" } });
  await assert.rejects(openSocket(relay.port, relay.origin, { "X-Forwarded-For": "fd00:0:0:0:0:0:0:1" }), /503/);
});

test("hello has a deadline even when a socket keeps sending pings", async (t) => {
  const relay = await startRelay(t, { HOME3D_WS_HELLO_TIMEOUT_MS: "250" });
  const c = await client(t, relay);
  const timer = setInterval(() => { if (!c.socket.destroyed) c.socket.write(maskedFrame("", 9)); }, 25);
  t.after(() => clearInterval(timer));
  await until(() => c.socket.destroyed, 2000);
  assert.equal((await rawRequest(relay.port, { path: "/api/ping" })).status, 200);
});

test("server pings drop silent authenticated clients while responsive clients remain live", async (t) => {
  const relay = await startRelay(t, {
    HOME3D_WS_PING_INTERVAL_MS: "80", HOME3D_WS_IDLE_TIMEOUT_MS: "450",
  });
  const silent = await client(t, relay), live = await client(t, relay, { autoPong: true });
  await hello(silent, "a");
  await hello(live, "b");
  await silent.next((frame) => frame.op === 9);
  await until(() => silent.socket.destroyed, 2000);
  await pause(500);
  assert.equal(live.socket.destroyed, false);
  assert.ok(live.frames.filter((frame) => frame.op === 9).length >= 3);
});

test("per-connection token buckets refill and disconnect floods including control frames", async (t) => {
  const relay = await startRelay(t, { HOME3D_WS_MESSAGE_RATE: "10", HOME3D_WS_MESSAGE_BURST: "2" });
  const c = await client(t, relay);
  await hello(c, "a");
  c.socket.write(maskedFrame("first", 9));
  await c.next((frame) => frame.op === 10 && frame.text === "first");
  await pause(250);
  c.socket.write(maskedFrame("refilled", 9));
  await c.next((frame) => frame.op === 10 && frame.text === "refilled");
  c.socket.write(Buffer.concat(Array.from({ length: 10 }, () => maskedFrame("flood", 9))));
  await until(() => c.socket.destroyed);
  assert.equal((await rawRequest(relay.port, { path: "/api/ping" })).status, 200);
});

test("slow broadcast recipients are dropped without delaying a healthy sender", { timeout: 15000 }, async (t) => {
  const relay = await startRelay(t, { HOME3D_WS_MAX_WRITABLE_BYTES: "32768" });
  const a = await client(t, relay), slow = await client(t, relay);
  const code = await hello(a, "a"), slowCode = await hello(slow, "b");
  for (const c of [a, slow]) {
    send(c.socket, { t: "join", room: "apt:" + code });
    if (c === slow) {
      await a.next((frame) => frame.value?.t === "knock" && frame.value.code === slowCode);
      send(a.socket, { t: "admit", code: slowCode });
    }
    await c.next((frame) => frame.value?.t === "roster" && frame.value.users.some((u) => u.room === "apt:" + code));
  }
  await a.next((frame) => frame.value?.t === "roster" && frame.value.users.some((u) => u.code === slowCode));
  a.frames.length = 0;
  slow.socket.pause();
  const frame = maskedFrame(JSON.stringify({ t: "msg", data: "x".repeat(2 * 1024 * 1024) }));
  for (let i = 0; i < 16; i++) {
    if (!a.socket.write(frame)) await once(a.socket, "drain");
  }
  await a.next((f) => f.value?.t === "roster" && !f.value.users.some((u) => u.code === slowCode), 10000);
  const start = performance.now();
  a.socket.write(maskedFrame("healthy", 9));
  await a.next((f) => f.op === 10 && f.text === "healthy");
  assert.ok(performance.now() - start < 2000);
});

test("LAN admission and hub destinations share explicit ranges and optional IPv4/IPv6 CIDRs", async (t) => {
  const previous = process.env.HOME3D_LAN_EXTRA_CIDRS;
  t.after(() => {
    if (previous === undefined) delete process.env.HOME3D_LAN_EXTRA_CIDRS;
    else process.env.HOME3D_LAN_EXTRA_CIDRS = previous;
  });
  delete process.env.HOME3D_LAN_EXTRA_CIDRS;
  const check = async (address, allowed) => {
    assert.equal(isLanAddress(address), allowed, address);
    assert.equal(lanOnlyRequest({ headers: { host: "studio.local" }, socket: { remoteAddress: address } }), allowed, address);
    const host = address.includes(":") ? `[${address}]` : address;
    assert.equal(!!await resolveLanUrl(`http://${host}:8123/`), allowed, address);
  };
  for (const address of ["127.0.0.2", "10.0.0.0", "10.255.255.255", "172.16.0.0", "172.31.255.255",
    "192.168.0.0", "192.168.255.255", "::1", "fc00::", "fdff:ffff:ffff:ffff:ffff:ffff:ffff:ffff", "::ffff:10.1.2.3"])
    await check(address, true);
  for (const address of ["100.64.0.0", "100.127.255.255", "198.18.0.0", "198.19.255.255", "172.15.255.255",
    "172.32.0.0", "192.167.255.255", "192.169.0.0", "169.254.1.2", "0.0.0.0", "224.0.0.1", "::", "fe80::1", "ff02::1", "8.8.8.8"])
    await check(address, false);
  process.env.HOME3D_LAN_EXTRA_CIDRS = "100.64.1.0/24,198.18.0.0/15,2001:db8:1234::/48,broken/8,10.0.0.0/33,::/129";
  for (const address of ["100.64.1.8", "198.19.255.255", "2001:db8:1234::abcd", "::ffff:100.64.1.8"])
    await check(address, true);
  for (const address of ["100.64.2.1", "198.20.0.0", "2001:db8:1235::1", "8.8.8.8"])
    await check(address, false);
  assert.equal(await resolveLanUrl("http://hub.local:8123/", async () => [
    { address: "100.64.1.8", family: 4 }, { address: "8.8.8.8", family: 4 },
  ]), null, "every DNS result must pass");
});

test("blueprint vision defaults to machine-local and permits LAN hosts only with explicit opt-in", async (t) => {
  for (const enabled of ["0", "1"]) {
    const relay = await startRelay(t, { HOME3D_BLUEPRINT_LAN: enabled });
    const request = (host) => rawRequest(relay.port, {
      method: "PUT", path: "/api/blueprint", headers: { host, origin: "http://" + host },
    });
    assert.equal((await request(`127.0.0.1:${relay.port}`)).status, 405, "local requests reach method validation");
    assert.equal((await request(`192.168.1.10:${relay.port}`)).status, enabled === "1" ? 405 : 403);
    assert.equal((await request(`rebind.evil.test:${relay.port}`)).status, 403);
  }
});

test("an injected uncaught exception logs and exits nonzero; the hook requires explicit test mode", async (t) => {
  const relay = await startRelay(t, { HOME3D_TEST_HOOKS: "1", HOME3D_TEST_UNCAUGHT_MS: "500" });
  const [code, signal] = await once(relay.child, "close");
  assert.equal(code, 1);
  assert.equal(signal, null);
  assert.match(relay.logs, /uncaught exception.*test uncaught exception/s);
  const normal = await startRelay(t, { HOME3D_TEST_HOOKS: "0", HOME3D_TEST_UNCAUGHT_MS: "50" });
  await pause(150);
  assert.equal((await rawRequest(normal.port, { path: "/api/ping" })).status, 200);
});
