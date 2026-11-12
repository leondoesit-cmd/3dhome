import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes, webcrypto } from "node:crypto";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { setTimeout as pause } from "node:timers/promises";
import { maskedFrame, openSocket, startRelay } from "./helpers/relay_process.mjs";

const validCode = /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/;
let importId = 0;

// Execute the relay's actual helper without starting a second listening server.
const relaySource = await readFile(new URL("../server/relay.mjs", import.meta.url), "utf8");
const serverCodeFor = runInNewContext("(" + relaySource.slice(
  relaySource.indexOf("function codeFor(token)"), relaySource.indexOf("function sameToken("),
) + ")", { createHash });

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

function accepted(net) {
  return net.NET.roster.some((user) => user.code === net.NET.code && user.room === net.myRoom());
}

test("synchronous codeFor matches the server for 200 random tokens without crypto.subtle", async (t) => {
  const { codeFor } = await loadClient(t);
  assert.equal(globalThis.crypto.subtle, undefined);
  for (let i = 0; i < 200; i++) {
    const token = randomBytes(32).toString("base64url");
    const code = codeFor(token);
    assert.equal(typeof code, "string");
    assert.match(code, validCode);
    assert.equal(code, serverCodeFor(token));
  }
  // Exercise UTF-8 and SHA padding across one and multiple blocks as well.
  for (const token of ["", "abc", "שלום🏠", "\ud800", ...[55, 56, 63, 64, 65, 119, 120, 128, 1000].map((n) => "a".repeat(n))])
    assert.equal(codeFor(token), serverCodeFor(token));
});

for (const subtle of ["absent", "undefined"]) {
  test(`empty-storage import boots with crypto.subtle ${subtle} and the relay accepts it`, async (t) => {
    const relay = await startRelay(t);
    const transport = relayTransport(t, relay);
    const net = await loadClient(t, { home3d_mp_url: relay.origin.replace("http:", "ws:") }, { ...transport, subtle });
    assert.equal(globalThis.crypto.subtle, undefined);
    assert.match(net.NET.code, validCode);
    assert.equal(net.NET.code, serverCodeFor(net.NET.token));
    assert.equal(net.store.get("home3d_mp_id"), net.NET.code);
    assert.equal(net.store.get("home3d_mp_token"), net.NET.token);
    net.connect();
    await until(() => accepted(net));
    assert.equal(transport.connections.length, 1);
  });
}

for (const [legacy, rejection] of [["ABCD-EFGH", "identity_in_use"], ["invalid-code", "bad_identity"]]) {
  test(`${rejection} migrates a legacy code once against an empty relay store`, async (t) => {
    const relay = await startRelay(t);
    assert.equal(await readFile(relay.identitiesFile, "utf8"), "{}");
    const transport = relayTransport(t, relay);
    const token = randomBytes(32).toString("base64url");
    const net = await loadClient(t, {
      home3d_mp_id: legacy, home3d_mp_token: token,
      home3d_mp_url: relay.origin.replace("http:", "ws:"),
    }, transport);
    assert.equal(net.NET.code, legacy, "saved credentials stay intact until rejected");
    net.NET.room = "apt:" + legacy;
    const changes = [], errors = [];
    net.on("identity-changed", (change) => changes.push({ ...change, persisted: net.store.get("home3d_mp_id") }));
    net.on("server-error", (error) => errors.push(error));
    net.connect();
    await until(() => accepted(net));
    const derived = serverCodeFor(token);
    assert.deepEqual(changes, [{ from: legacy, to: derived, persisted: derived }]);
    assert.deepEqual(errors, []);
    assert.equal(net.NET.token, token);
    assert.equal(net.store.get("home3d_mp_token"), token);
    assert.equal(net.NET.room, "apt:" + derived);
    assert.equal(transport.connections.length, 2);
    assert.ok(transport.connections[0].received.some((m) => m.t === "error" && m.code === rejection));
    assert.deepEqual(transport.connections.map((ws) => ws.sent.find((m) => m.t === "hello").code), [legacy, derived]);
    assert.equal(await readFile(relay.identitiesFile, "utf8"), "{}");
  });
}

for (const migrateFirst of [false, true]) {
  test(`a rejected derived identity stops reconnecting (migration first: ${migrateFirst})`, async (t) => {
    const token = randomBytes(32).toString("base64url");
    const derived = serverCodeFor(token);
    const relay = await startRelay(t, {}, { identities: { [derived]: "z".repeat(40) } });
    const transport = relayTransport(t, relay);
    const net = await loadClient(t, {
      home3d_mp_id: migrateFirst ? "ABCD-EFGH" : derived, home3d_mp_token: token,
      home3d_mp_url: relay.origin.replace("http:", "ws:"),
    }, transport);
    const changes = [], errors = [];
    net.on("identity-changed", (change) => changes.push(change));
    net.on("server-error", (error) => errors.push(error));
    net.connect();
    await until(() => errors.length === 1 && transport.connections.at(-1).readyState === 3);
    await pause(1800); // Past the next retry deadline, if one was incorrectly scheduled.
    assert.deepEqual(errors, ["identity_in_use"]);
    assert.equal(changes.length, migrateFirst ? 1 : 0);
    assert.equal(transport.connections.length, migrateFirst ? 2 : 1);
    assert.equal(net.NET.code, derived);
    assert.equal(net.NET.connected, false);
  });
}
