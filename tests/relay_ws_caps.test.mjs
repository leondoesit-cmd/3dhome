import test from "node:test";
import assert from "node:assert/strict";
import { codeFor } from "../js/net.js";
import { maskedFrame, openSocket, startRelay } from "./helpers/relay_process.mjs";

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

for (const [name, env, length] of [
  ["defaults accept a 12 MiB message", {}, 12 * 1024 * 1024],
  ["a configured queue below the floor accepts a 3.9 MiB message", {
    HOME3D_WS_MAX_MESSAGE_BYTES: "4194304", HOME3D_WS_MAX_WRITABLE_BYTES: "65536",
  }, Math.floor(3.9 * 1024 * 1024)],
]) test(name, { timeout: 30000 }, async t => {
  const relay = await startRelay(t, env);
  const a = await client(t, relay), b = await client(t, relay);
  const owner = await hello(a, "a"), guest = await hello(b, "b");
  send(a.socket, { t: "join", room: "apt:" + owner });
  send(b.socket, { t: "join", room: "apt:" + owner });
  await a.next(f => f.value?.t === "knock" && f.value.code === guest);
  send(a.socket, { t: "admit", code: guest });
  await b.next(f => f.value?.t === "admitted");
  const data = "x".repeat(length);
  send(a.socket, { t: "msg", to: guest, data });
  const frame = await b.next(f => f.value?.t === "msg", 15000);
  assert.equal(frame.value.data, data);
  for (const c of [a, b]) {
    c.socket.write(maskedFrame("alive", 9));
    await c.next(f => f.op === 10 && f.text === "alive");
    assert.equal(c.socket.destroyed, false);
  }
  if (env.HOME3D_WS_MAX_WRITABLE_BYTES) {
    assert.match(relay.logs, /65536 raised to 5242894/);
    assert.equal(relay.logs.split("raised to").length - 1, 1);
  }
});
