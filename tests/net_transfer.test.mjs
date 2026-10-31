import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { setTimeout as pause } from "node:timers/promises";
import { createTransfers, transferBounds, TRANSFER } from "../js/net.js";
import { maskedFrame, openSocket, startRelay } from "./helpers/relay_process.mjs";

class Clock {
  at = 0; serial = 0; timers = new Map();
  now = () => this.at;
  setTimer = (fn, delay) => { const id = ++this.serial; this.timers.set(id, { fn, at: this.at + Math.max(0, delay) }); return id; };
  clearTimer = id => this.timers.delete(id);
  advance(ms) {
    const end = this.at + ms;
    let count = 0;
    while (true) {
      const next = [...this.timers].sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
      if (!next || next[1].at > end) break;
      assert.ok(++count < 100000, "timer loop makes progress");
      this.at = next[1].at; this.timers.delete(next[0]); next[1].fn();
    }
    this.at = end;
  }
}

function pair(overrides = {}) {
  const clock = new Clock(), events = { a: [], b: [] }, sent = [], engines = {}, unacked = new Set();
  let maxUnacked = 0, serial = 0, buffered = 0;
  const limits = { ...TRANSFER, chunkChars: 16384, window: 3, partIntervalMs: 7, stallMs: 1000, ...overrides };
  for (const from of ["a", "b"]) engines[from] = createTransfers({ now: clock.now,
    setTimer: clock.setTimer, clearTimer: clock.clearTimer, limits, randomId: () => "id" + ++serial,
    bufferedAmount: () => buffered,
    admit: () => true, emit: (type, data) => events[from].push({ type, data }),
    send(data, to) {
      sent.push({ from, to, data, at: clock.at });
      if (from === "a" && data.k === "xfer") { unacked.add(data.id + ":" + data.i); maxUnacked = Math.max(maxUnacked, unacked.size); }
      clock.setTimer(() => {
        if (from === "b" && data.k === "xfer_ack") for (const key of unacked) {
          if (key.startsWith(data.id + ":") && Number(key.split(":")[1]) <= data.i) unacked.delete(key);
        }
        if (!engines[to].receive(from, data)) events[to].push({ type: "data", data: { from, data } });
      }, 25);
      return true;
    },
  });
  return { ...engines, clock, sent, events, limits, get maxUnacked() { return maxUnacked; }, set buffered(n) { buffered = n; } };
}

test("transfer boundaries preserve astral characters and the part cap", () => {
  for (const width of [2, 3, 4, 7, 32]) for (const text of ["", "abc", "a😀b😀c", "😀".repeat(100), "x".repeat(width - 1) + "😀end"]) {
    const b = transferBounds(text, width), parts = b.slice(1).map((end, i) => text.slice(b[i], end));
    assert.equal(b[0], 0); assert.equal(b.at(-1), text.length); assert.equal(parts.join(""), text);
    for (const part of parts) {
      assert.ok(part.length <= width);
      assert.ok(!/^[\uDC00-\uDFFF]/.test(part)); assert.ok(!/[\uD800-\uDBFF]$/.test(part));
    }
  }
});

test("multi-MB payload arrives once with an ack window and global pacing", async () => {
  const p = pair(), payload = { k: "scene", projectId: "p", body: "😀abc".repeat(650000) };
  const result = p.a.send(payload, "b");
  p.clock.advance(15000);
  assert.equal(await result, true);
  const delivered = p.events.b.filter(e => e.type === "data");
  assert.equal(delivered.length, 1); assert.deepEqual(delivered[0].data.data, payload);
  assert.ok(p.maxUnacked <= p.limits.window);
  const parts = p.sent.filter(e => e.from === "a" && e.data.k === "xfer");
  for (let i = 1; i < parts.length; i++) assert.ok(parts[i].at - parts[i - 1].at >= p.limits.partIntervalMs);
  assert.equal(p.events.b.filter(e => e.data.state === "done").length, 1);
  assert.equal(p.clock.timers.size, 0);
});

test("small payloads remain one plain message and excessive payloads send nothing", async () => {
  const p = pair({ chunkChars: 128, maxChars: 256 });
  const data = { k: "tiny", v: 1 };
  assert.equal(await p.a.send(data, "b"), true);
  assert.deepEqual(p.sent[0].data, data); assert.equal(p.sent.length, 1);
  assert.equal(await p.a.send({ k: "huge", v: "x".repeat(257) }, "b"), false);
  assert.equal(await p.a.send(data), false); assert.equal(p.sent.length, 1);
});

test("a newer transfer of the same kind supersedes the active one", async () => {
  const p = pair();
  const old = p.a.send({ k: "scene", text: "old".repeat(30000) }, "b");
  p.clock.advance(40);
  const fresh = { k: "scene", text: "new".repeat(30000) };
  const result = p.a.send(fresh, "b"); p.clock.advance(3000);
  assert.equal(await old, false); assert.equal(await result, true);
  assert.ok(p.sent.some(e => e.data.k === "xfer_cancel"));
  assert.deepEqual(p.events.b.filter(e => e.type === "data").map(e => e.data.data), [fresh]);
});

test("distinct kinds share one paced round-robin sender", async () => {
  const p = pair();
  const first = p.a.send({ k: "one", text: "x".repeat(100000) }, "b");
  // A second peer avoids the receiver's intentional one-transfer-per-sender rule.
  const wires = [], clock = new Clock(); let serial = 0;
  const engine = createTransfers({ limits: { ...p.limits }, now: clock.now, setTimer: clock.setTimer, clearTimer: clock.clearTimer,
    randomId: () => "round" + ++serial, send: (data, to) => { wires.push({ data, to, at: clock.at }); return true; } });
  const a = engine.send({ k: "one", text: "x".repeat(100000) }, "b");
  const b = engine.send({ k: "two", text: "x".repeat(100000) }, "c");
  clock.advance(60);
  const parts = wires.filter(e => e.data.k === "xfer");
  assert.deepEqual(parts.slice(0, 4).map(e => e.to), ["b", "c", "b", "c"]);
  for (let i = 1; i < parts.length; i++) assert.ok(parts[i].at - parts[i - 1].at >= p.limits.partIntervalMs);
  engine.reset(); p.a.reset(); p.b.reset(); assert.equal(await a, false); assert.equal(await b, false); assert.equal(await first, false);
});

test("high local buffering pauses transmission until it drains", async () => {
  const p = pair(); p.buffered = p.limits.highWater + 1;
  const result = p.a.send({ k: "scene", text: "x".repeat(50000) }, "b");
  p.clock.advance(100); assert.equal(p.sent.length, 0);
  p.buffered = 0; p.clock.advance(1000); assert.equal(await result, true);
});

function receiver(options = {}) {
  const clock = new Clock(), sent = [], events = [];
  const engine = createTransfers({ now: clock.now, setTimer: clock.setTimer, clearTimer: clock.clearTimer,
    limits: { ...TRANSFER, maxChars: 1000, maxPartChars: 100, stallMs: 100, ...options.limits },
    admit: options.admit || (() => true), send: (data, to) => { sent.push({ data, to }); return true; },
    emit: (type, data) => events.push({ type, data }) });
  return { engine, sent, events, clock };
}
const part = (extra = {}) => ({ k: "xfer", id: "id", kind: "scene", i: 0, n: 2, total: 20, part: "{", ...extra });

for (const [name, change] of [
  ["over maxChars", { total: 1001 }], ["missing id", { id: undefined }], ["empty id", { id: "" }],
  ["long id", { id: "x".repeat(65) }], ["numeric id", { id: 7 }], ["missing index", { i: undefined }],
  ["negative first index", { i: -1 }], ["fractional first index", { i: 0.5 }], ["empty kind", { kind: "" }], ["long kind", { kind: "k".repeat(65) }],
  ["zero total", { total: 0 }], ["fractional total", { total: 1.5 }], ["zero n", { n: 0 }],
  ["too many parts", { n: 21 }], ["fractional n", { n: 1.5 }], ["oversize part", { part: "x".repeat(101) }],
  ["empty part", { part: "" }], ["non-string part", { part: 1 }], ["wrong projectId type", { projectId: 3 }],
]) test("receiver rejects " + name + " with cancellation and no delivery", () => {
  const h = receiver(); assert.equal(h.engine.receive("a", part(change)), true);
  assert.equal(h.sent.at(-1).data.k, "xfer_cancel"); assert.equal(h.events.some(e => e.type === "data"), false);
  h.engine.reset();
});

test("unadmitted kind and changed admission cancel transfers", () => {
  let allowed = false;
  const h = receiver({ admit: () => allowed });
  h.engine.receive("a", part()); assert.equal(h.sent.at(-1).data.k, "xfer_cancel");
  allowed = true; h.engine.receive("a", part()); allowed = false;
  h.engine.receive("a", part({ i: 1 }));
  assert.equal(h.sent.at(-1).data.k, "xfer_cancel");
  assert.equal(h.events.at(-1).data.state, "failed"); assert.equal(h.events.some(e => e.type === "data"), false);
});

for (const [name, second] of [
  ["out of order", { i: 2, n: 3 }], ["changed header", { i: 1, total: 21 }],
  ["running length overflow", { i: 1, part: "x".repeat(30) }],
  ["oversize later part", { i: 1, part: "x".repeat(101) }], ["negative index", { i: -1 }], ["fractional index", { i: 0.5 }],
]) test("receiver drops active transfer on " + name, () => {
  const h = receiver(); h.engine.receive("a", part()); h.engine.receive("a", part(second));
  assert.equal(h.sent.at(-1).data.k, "xfer_cancel"); assert.equal(h.events.at(-1).data.state, "failed");
  assert.equal(h.events.some(e => e.type === "data"), false);
});

for (const [name, text, header] of [
  ["wrong kind", JSON.stringify({ k: "other" }), {}],
  ["wrong project", JSON.stringify({ k: "scene", projectId: "wrong" }), { projectId: "p" }],
  ["array", "[]", {}], ["null", "null", {}], ["bad JSON", "{", {}],
  ["incorrect length", JSON.stringify({ k: "scene" }), { total: 99 }],
]) test("final validation rejects " + name, () => {
  const h = receiver(); h.engine.receive("a", part({ n: 1, total: text.length, part: text, ...header }));
  assert.equal(h.sent.at(-1).data.k, "xfer_cancel"); assert.equal(h.events.at(-1).data.state, "failed");
  assert.equal(h.events.some(e => e.type === "data"), false);
});

test("incoming count and declared totals are bounded, replacement has no failure event", () => {
  const h = receiver(); h.engine.receive("a", part()); h.engine.receive("b", part()); h.engine.receive("c", part());
  assert.equal(h.sent.at(-1).to, "c"); assert.equal(h.sent.at(-1).data.k, "xfer_cancel");
  h.engine.receive("a", part({ id: "replacement" }));
  assert.equal(h.events.some(e => e.data.state === "failed"), false);
  const before = h.sent.length;
  h.engine.receive("a", part({ i: 1 })); assert.equal(h.sent.length, before);
  h.engine.reset();
  const totals = receiver(); totals.engine.receive("a", part({ total: 700 })); totals.engine.receive("b", part({ total: 400 }));
  assert.equal(totals.sent.at(-1).data.k, "xfer_cancel"); totals.engine.reset();
});

test("stalled sender and receiver expire and clear their timers", async () => {
  const h = receiver(); h.engine.receive("a", part()); h.clock.advance(101);
  assert.equal(h.events.at(-1).data.state, "failed"); assert.equal(h.sent.at(-1).data.k, "xfer_cancel"); assert.equal(h.clock.timers.size, 0);
  const clock = new Clock(), sent = [];
  const engine = createTransfers({ now: clock.now, setTimer: clock.setTimer, clearTimer: clock.clearTimer,
    limits: { ...TRANSFER, chunkChars: 10, stallMs: 100 }, send: d => { sent.push(d); return true; } });
  const result = engine.send({ k: "scene", text: "x".repeat(200) }, "b");
  clock.advance(101); assert.equal(await result, false); assert.equal(sent.at(-1).k, "xfer_cancel"); assert.equal(clock.timers.size, 0);
});

test("only the recipient may ack or cancel; unsent indexes cannot acknowledge data", async () => {
  const clock = new Clock(), sent = [];
  const engine = createTransfers({ now: clock.now, setTimer: clock.setTimer, clearTimer: clock.clearTimer,
    limits: { ...TRANSFER, chunkChars: 10, window: 1, stallMs: 100 }, randomId: () => "known", send: d => { sent.push(d); return true; } });
  const result = engine.send({ k: "scene", text: "x".repeat(200) }, "b"); clock.advance(0);
  engine.receive("stranger", { k: "xfer_cancel", id: "known" });
  engine.receive("stranger", { k: "xfer_ack", id: "known", i: 0 });
  engine.receive("b", { k: "xfer_ack", id: "known", i: 10 });
  clock.advance(40); assert.equal(sent.filter(d => d.k === "xfer").length, 1);
  engine.receive("b", { k: "xfer_ack", id: "known", i: 0 }); clock.advance(1);
  assert.equal(sent.filter(d => d.k === "xfer").length, 2);
  engine.receive("b", { k: "xfer_cancel", id: "known" }); assert.equal(await result, false);
});

test("send failure, peer loss and reset resolve outgoing work false", async () => {
  for (const action of ["failure", "dropPeer", "reset"]) {
    const clock = new Clock();
    const engine = createTransfers({ now: clock.now, setTimer: clock.setTimer, clearTimer: clock.clearTimer,
      limits: { ...TRANSFER, chunkChars: 10 }, send: () => action !== "failure" });
    const result = engine.send({ k: "scene", text: "x".repeat(200) }, "b"); clock.advance(0);
    if (action === "dropPeer") engine.dropPeer("b"); if (action === "reset") engine.reset();
    assert.equal(await result, false); assert.equal(clock.timers.size, 0);
  }
});
let importId = 0;
async function until(predicate, ms = 5000) {
  const deadline = performance.now() + ms;
  while (!predicate()) {
    assert.ok(performance.now() < deadline, "condition reached before deadline");
    await pause(10);
  }
}

async function loadClient(t, saved = {}, { subtle = "absent", WebSocketImpl } = {}) {
  const store = new Map(Object.entries(saved));
  const crypto = { getRandomValues: webcrypto.getRandomValues.bind(webcrypto) };
  if (subtle === "undefined") crypto.subtle = undefined;
  for (const [key, value] of Object.entries({
    crypto,
    localStorage: {
      getItem: (key) => store.get(key) ?? null,
      setItem: (key, value) => store.set(key, String(value)),
      removeItem: (key) => store.delete(key),
    },
    ...(WebSocketImpl ? { WebSocket: WebSocketImpl } : {}),
  })) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, value });
    t.after(() => {
      if (previous) Object.defineProperty(globalThis, key, previous);
      else delete globalThis[key];
    });
  }
  const net = await import(`../js/net.js?net-identity-test=${++importId}`);
  t.after(() => net.disconnect());
  return { ...net, store };
}

// Browser-shaped transport over the existing raw WebSocket helper. Node's
// built-in WebSocket cannot set the Origin required by the real relay.
function relayTransport(t, relay) {
  const connections = [];
  class RelayWebSocket {
    constructor(url) {
      assert.equal(url, relay.origin.replace("http:", "ws:"));
      this.readyState = 0;
      this.sent = [];
      this.received = [];
      this.closed = new Promise((resolve) => { this.resolveClosed = resolve; });
      connections.push(this);
      openSocket(relay.port, relay.origin).then((socket) => {
        this.socket = socket;
        socket.on("error", (error) => this.onerror?.(error));
        socket.on("close", () => {
          this.readyState = 3;
          this.onclose?.();
          this.resolveClosed();
        });
        let pending = Buffer.alloc(0);
        socket.on("data", (chunk) => {
          pending = Buffer.concat([pending, chunk]);
          while (pending.length >= 2) {
            let size = pending[1] & 127, offset = 2;
            if (size === 126) {
              if (pending.length < 4) return;
              size = pending.readUInt16BE(2); offset = 4;
            } else if (size === 127) {
              if (pending.length < 10) return;
              size = Number(pending.readBigUInt64BE(2)); offset = 10;
            }
            if (pending.length < offset + size) return;
            const op = pending[0] & 15;
            const data = pending.subarray(offset, offset + size).toString("utf8");
            pending = pending.subarray(offset + size);
            if (op === 1) {
              this.received.push(JSON.parse(data));
              this.onmessage?.({ data });
            } else if (op === 9) socket.write(maskedFrame(data, 10));
          }
        });
        if (this.readyState === 2) return socket.destroy();
        this.readyState = 1;
        this.onopen?.();
      }).catch((error) => {
        this.readyState = 3;
        this.onerror?.(error);
        this.onclose?.();
        this.resolveClosed();
      });
    }
    get bufferedAmount() { return this.socket?.writableLength || 0; }
    send(text) {
      this.sent.push(JSON.parse(text));
      this.socket.write(maskedFrame(text));
    }
    close() {
      if (this.readyState >= 2) return;
      this.readyState = 2;
      this.socket?.destroy();
    }
  }
  t.after(async () => {
    for (const connection of connections) connection.close();
    await Promise.all(connections.map((connection) => connection.closed));
  });
  return { WebSocketImpl: RelayWebSocket, connections };
}


test("24 MB sendLarge traverses the real default relay intact without closing either client", { timeout: 45000 }, async t => {
  const relay = await startRelay(t);
  const transport = relayTransport(t, relay);
  const settings = { home3d_mp_url: relay.origin.replace("http:", "ws:") };
  const host = await loadClient(t, settings, transport);
  const guest = await loadClient(t, settings, transport);
  host.connect(); guest.connect();
  await until(() => host.NET.joined && guest.NET.joined);
  guest.receiveLarge("plan_sync", (from, header) => from === host.NET.code && header.projectId === "p");
  guest.joinRoom(host.myRoom());
  await until(() => !!host.NET.knocks[guest.NET.code]);
  assert.equal(host.answerKnock(guest.NET.code, "edit"), true);
  await until(() => guest.NET.joined && !!guest.NET.peers[host.NET.code]);
  const received = [];
  guest.on("data", ev => received.push(ev));
  const payload = { k: "plan_sync", projectId: "p", scene: { dataUrl: "x".repeat(24 * 1024 * 1024) } };
  assert.equal(await host.sendLarge(payload, guest.NET.code), true);
  await until(() => received.length > 0);
  assert.equal(received.length, 1); assert.deepEqual(received[0].data, payload);
  for (const net of [host, guest]) {
    assert.equal(net.NET.connected, true); assert.equal(net.NET.ws.readyState, 1);
  }
});
