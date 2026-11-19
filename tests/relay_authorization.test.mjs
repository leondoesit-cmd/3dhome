import test from "node:test";
import assert from "node:assert/strict";
import { setTimeout as pause } from "node:timers/promises";
import { codeFor } from "../js/net.js";
import { startRelay, openSocket, maskedFrame } from "./helpers/relay_process.mjs";

async function until(predicate) {
  const deadline = performance.now() + 5000;
  while (!predicate()) {
    assert.ok(performance.now() < deadline, "relay response before deadline");
    await pause(10);
  }
}
async function client(t, relay, letter) {
  const socket = await openSocket(relay.port, relay.origin);
  t.after(() => socket.destroy());
  const messages = [], pongs = [];
  let buf = Buffer.alloc(0), ping = 0;
  socket.on("data", (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    while (buf.length >= 2) {
      let n = buf[1] & 127, offset = 2;
      if (n === 126) { if (buf.length < 4) return; n = buf.readUInt16BE(2); offset = 4; }
      if (n === 127) { if (buf.length < 10) return; n = Number(buf.readBigUInt64BE(2)); offset = 10; }
      if (buf.length < offset + n) return;
      const op = buf[0] & 15, text = buf.subarray(offset, offset + n).toString();
      if (op === 1) messages.push(JSON.parse(text));
      if (op === 10) pongs.push(text);
      buf = buf.subarray(offset + n);
    }
  });
  const token = letter.repeat(40), code = codeFor(token);
  const send = (m) => socket.write(maskedFrame(JSON.stringify(m)));
  const next = async (predicate) => {
    let found;
    await until(() => (found = messages.find(predicate)));
    messages.splice(messages.indexOf(found), 1);
    return found;
  };
  const sync = async () => {
    const value = String(++ping);
    socket.write(maskedFrame(value, 9));
    await until(() => pongs.includes(value));
  };
  send({ t: "hello", code, token, name: letter });
  await next((m) => m.t === "roster" && m.users.some((u) => u.code === code));
  return { socket, messages, code, send, next, sync, room: "apt:" + code };
}
const roster = (c) => c.messages.filter((m) => m.t === "roster").at(-1)?.users || [];
const join = async (c, room = c.room) => {
  c.send({ t: "join", room });
  await c.next((m) => m.t === "admitted" && m.room === room);
  await c.sync();
};

test("room joins stay private until the owner admits; denial and forged approval keep guests out", async (t) => {
  const relay = await startRelay(t);
  const owner = await client(t, relay, "a"), guest = await client(t, relay, "b"), denied = await client(t, relay, "c");
  await join(owner);
  await join(owner); // repeated joins still acknowledge membership
  guest.send({ t: "join", room: owner.room });
  assert.deepEqual(await owner.next((m) => m.t === "knock"), { t: "knock", code: guest.code, name: "b" });
  await guest.next((m) => m.t === "pending");
  guest.send({ t: "admit", code: guest.code });
  guest.send({ t: "msg", data: "pending broadcast" });
  guest.send({ t: "msg", to: owner.code, data: "pending direct" });
  owner.send({ t: "msg", data: "private scene" });
  await guest.sync(); await owner.sync();
  assert.equal(guest.messages.some((m) => ["msg", "joined", "left"].includes(m.t)), false);
  assert.equal(owner.messages.some((m) => m.t === "msg"), false);
  assert.equal(roster(guest).some((u) => u.room === owner.room), false);
  assert.equal(roster(owner).some((u) => u.code === guest.code), false);
  owner.send({ t: "admit", code: guest.code });
  await guest.next((m) => m.t === "admitted");
  await owner.next((m) => m.t === "joined" && m.code === guest.code);
  await guest.sync();
  assert.ok(roster(guest).some((u) => u.code === owner.code));
  owner.send({ t: "msg", data: { scene: "visible after admit" } });
  assert.deepEqual((await guest.next((m) => m.t === "msg")).data, { scene: "visible after admit" });
  guest.send({ t: "msg", to: owner.code, data: "admitted direct" });
  assert.equal((await owner.next((m) => m.t === "msg")).data, "admitted direct");
  denied.send({ t: "join", room: owner.room });
  await owner.next((m) => m.t === "knock" && m.code === denied.code);
  // Another admitted guest cannot approve on the owner's behalf.
  guest.send({ t: "admit", code: denied.code });
  await guest.sync(); await denied.sync();
  assert.equal(denied.messages.some((m) => m.t === "admitted"), false);
  owner.send({ t: "deny", code: denied.code });
  assert.deepEqual(await denied.next((m) => m.t === "denied"), { t: "denied", room: owner.room });
  owner.send({ t: "msg", data: "still private" });
  await owner.sync(); await denied.sync();
  assert.equal(denied.messages.some((m) => ["msg", "joined", "left"].includes(m.t)), false);
  assert.equal(roster(denied).some((u) => u.room === owner.room), false);
  // Returning to an approved room does not prompt again during this owner session.
  await join(guest);
  await join(guest, owner.room);
  assert.equal(owner.messages.some((m) => m.t === "knock"), false);
});

test("only mutual watches expose presence and permit direct messages", async (t) => {
  const relay = await startRelay(t);
  const a = await client(t, relay, "a"), b = await client(t, relay, "b");
  await join(a); await join(b);
  a.send({ t: "watch", codes: [b.code] });
  a.send({ t: "msg", to: b.code, data: "one-sided" });
  b.send({ t: "msg", to: a.code, data: "reverse one-sided" });
  await a.sync(); await b.sync();
  assert.equal(roster(a).some((u) => u.code === b.code), false);
  assert.equal(roster(b).some((u) => u.code === a.code), false);
  assert.equal([...a.messages, ...b.messages].some((m) => m.t === "msg"), false);
  b.send({ t: "watch", codes: [a.code] });
  await b.sync(); await a.sync();
  assert.ok(roster(a).some((u) => u.code === b.code));
  assert.ok(roster(b).some((u) => u.code === a.code));
  a.send({ t: "msg", to: b.code, data: "mutual" });
  assert.equal((await b.next((m) => m.t === "msg")).data, "mutual");
  b.send({ t: "msg", to: a.code, data: "reverse mutual" });
  assert.equal((await a.next((m) => m.t === "msg")).data, "reverse mutual");
  b.send({ t: "watch", codes: [] });
  await b.sync(); await a.sync();
  assert.equal(roster(a).some((u) => u.code === b.code), false);
  a.send({ t: "msg", to: b.code, data: "revoked mutual" });
  await a.sync(); await b.sync();
  assert.equal(b.messages.some((m) => m.t === "msg"), false);
  b.send({ t: "watch", codes: [a.code] });
  await b.sync();
  // A mutual friendship still does not expose a room while its join is pending.
  a.send({ t: "join", room: b.room });
  await a.next((m) => m.t === "pending");
  await a.sync();
  assert.equal(roster(a).some((u) => u.room === b.room), false);
});

test("owner disconnect expires admission and reconnect requires a new decision", async (t) => {
  const relay = await startRelay(t);
  const owner = await client(t, relay, "a"), guest = await client(t, relay, "b");
  await join(owner);
  guest.send({ t: "join", room: owner.room });
  await owner.next((m) => m.t === "knock");
  owner.send({ t: "admit", code: guest.code });
  await guest.next((m) => m.t === "admitted");
  owner.socket.destroy();
  await guest.next((m) => m.t === "pending");
  const replacement = await client(t, relay, "a");
  await replacement.next((m) => m.t === "knock" && m.code === guest.code);
  await join(replacement);
  guest.messages.length = 0;
  replacement.send({ t: "msg", data: "new owner session" });
  await replacement.sync(); await guest.sync();
  assert.equal(guest.messages.some((m) => m.t === "msg"), false);
  replacement.send({ t: "admit", code: guest.code });
  await guest.next((m) => m.t === "admitted");
  replacement.send({ t: "msg", data: "approved again" });
  assert.equal((await guest.next((m) => m.t === "msg")).data, "approved again");
});

test("guest reconnection retains approval but cannot inherit an owner's approval under a new identity", async (t) => {
  const relay = await startRelay(t);
  const owner = await client(t, relay, "a"), guest = await client(t, relay, "b");
  await join(owner);
  guest.send({ t: "join", room: owner.room });
  await owner.next((m) => m.t === "knock");
  owner.send({ t: "admit", code: guest.code });
  await guest.next((m) => m.t === "admitted");
  guest.socket.destroy();
  await owner.next((m) => m.t === "left" && m.code === guest.code);
  const replacement = await client(t, relay, "b");
  await join(replacement, owner.room);
  assert.equal(owner.messages.some((m) => m.t === "knock"), false);
  // Re-identifying an authenticated socket would retain its previous room and grants.
  const token = "c".repeat(40);
  owner.send({ t: "hello", code: codeFor(token), token });
  await until(() => owner.socket.destroyed);
  await replacement.next((m) => m.t === "pending");
  assert.equal(roster(replacement).some((u) => u.room === owner.room), false);
});
