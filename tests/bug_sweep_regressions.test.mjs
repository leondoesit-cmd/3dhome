// Regressions for a sweep of independent bugs: each test names the defect it
// pins down, so a failure here points straight at the behaviour that came back.
import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { connect, createServer } from "node:net";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { waitForRelay } from "./helpers/relay_readiness.mjs";
import { S } from "../js/state.js";
import { collideCircle } from "../js/col2d.js";
import { parseLength, formatLength } from "../js/planning_units.js";
import { isLocationInUS, saveUnitSettings, resetAllUnitSettings } from "../js/unit_settings.js";
import { fmtLen, fmtAreaM2 } from "../js/display_units.js";
import { toIFC } from "../js/exports_pro.js";
import { drawingDXF } from "../js/drawing_export.js";
import { csvCell, wallScheduleCSV } from "../js/wall_schedule.js";

test("a body standing exactly on a wall line is pushed off it, not flung away", () => {
  const col = { segs: [{ ax: 0, az: 0, bx: 100, bz: 0, half: 5 }] };
  const p = { x: 50, z: 0 };
  collideCircle(col, p, 10, 0, 170, 40);
  // it used to land near x = 15,000,049
  assert.equal(p.x, 50);
  assert.ok(Math.abs(Math.abs(p.z) - 15) < 1e-6, "out of the wall along its normal: " + p.z);
});

test("collision keeps relaxing while later passes still push, not just while the max grows", () => {
  // a body wedged between two walls and a cabinet corner needs a third pass;
  // the old early-out stopped after the second and left it 22 cm in the wall
  const col = {
    segs: [{ ax: 0, az: 0, bx: 20, bz: 200, half: 5 }, { ax: 0, az: 0, bx: 200, bz: 0, half: 5 }],
    rects: [{ x0: 24, x1: 120, z0: 48, z1: 120, y0: 0, y1: 90 }],
  };
  const p = { x: 30, z: 55 };
  collideCircle(col, p, 18, 0, 170, 40);
  const probe = { ...p };
  assert.ok(collideCircle(col, probe, 18, 0, 170, 40, { passes: 1 }) < 0.05, "settled at " + JSON.stringify(p));
});

test("a negative feet-and-inches length keeps its sign on the inches", () => {
  assert.ok(Math.abs(parseLength("-5'-6\"", "cm") - -167.64) < 1e-9);
  assert.ok(Math.abs(parseLength("-5' 6", "ft") - -167.64) < 1e-9);
  assert.ok(Math.abs(parseLength("5'-6\"", "cm") - 167.64) < 1e-9);
  // what formatLength writes into a field must read back as the same length
  const text = formatLength(-167.64, "ft");
  assert.equal(text, "-5'-6\"");
  assert.ok(Math.abs(parseLength(text, "ft") - -167.64) < 1e-9);
});

test("US places whose names contain a foreign one still read as the US", () => {
  assert.equal(isLocationInUS(35.08, -106.65, "Albuquerque, New Mexico"), true);
  assert.equal(isLocationInUS(42.36, -71.06, "Boston, New England"), true);
  assert.equal(isLocationInUS(19.43, -99.13, "Mexico City, Mexico"), false);
  assert.equal(isLocationInUS(51.5, -0.12, "London, England"), false);
});

test("the Units pane's suffix and feet-inches switches reach the app's readouts", (t) => {
  t.after(() => resetAllUnitSettings());
  saveUnitSettings({ preset: "imperial", overrides: {}, showSuffix: true, feetInches: true });
  assert.equal(fmtLen(167.64, { domain: "rooms" }), "5'-6\"");
  saveUnitSettings({ feetInches: false });
  assert.equal(fmtLen(167.64, { domain: "rooms" }), "5.5 ft");
  saveUnitSettings({ showSuffix: false });
  assert.equal(fmtLen(167.64, { domain: "rooms" }), "5.5");
  assert.equal(fmtAreaM2(10, { unit: "m2", digits: 1 }), "10");
  // an explicit option from the caller still wins
  assert.equal(fmtLen(167.64, { domain: "rooms", suffix: true }), "5.5 ft");
});

test("IFC GUIDs start with 0-3, as the 128-bit compressed form requires", () => {
  const walls = S.walls, items = S.items;
  try {
    S.walls = Array.from({ length: 40 }, (_, i) => ({ id: i + 1, a: 0, b: 1 }));
    S.items = Array.from({ length: 40 }, (_, i) => ({ id: 100 + i, type: "sofa" }));
    const guids = [...toIFC().matchAll(/IFC\w+\('([^']+)'/g)].map((m) => m[1]);
    assert.equal(guids.length, 80);
    for (const guid of guids) assert.match(guid, /^[0-3][0-9A-Za-z_$]{21}$/);
  } finally {
    S.walls = walls;
    S.items = items;
  }
});

test("DXF is written Y-up, so the plan is not mirrored top-to-bottom", () => {
  const room = [{ x: 0, z: 0 }, { x: 400, z: 0 }, { x: 400, z: 300 }, { x: 0, z: 300 }];
  const scene = { walls: [], openings: [], swings: [], voids: [], items: [], rooms: [{ points: room, cx: 200, cz: 150, name: "Living", width: 400, depth: 300 }] };
  const dxf = drawingDXF(scene, { dimensions: false });
  // the south-east corner (z = 300, below on the plan) sits at Y = -300
  assert.ok(dxf.includes("10\n400\n20\n-300\n"));
  assert.ok(!dxf.includes("20\n300\n"));
  // the size line stays under the room name, as on the sheet
  const nameY = Number(dxf.match(/20\n(-?[\d.]+)\n30\n0\n40\n12\n1\nLiving/)[1]);
  const sizeY = Number(dxf.match(/20\n(-?[\d.]+)\n30\n0\n40\n9\n1\n400 x 300 cm/)[1]);
  assert.ok(sizeY < nameY);
});

test("schedule CSV cells cannot smuggle a spreadsheet formula", () => {
  assert.equal(csvCell("=HYPERLINK(\"http://x\")"), "\"'=HYPERLINK(\"\"http://x\"\")\"");
  assert.equal(csvCell("@SUM(A1)"), "\"'@SUM(A1)\"");
  assert.equal(csvCell("Block wall"), "\"Block wall\"");
  assert.equal(csvCell(-2.5), "\"-2.5\"");
  const csv = wallScheduleCSV({ rows: [{ id: 1, typeName: "+cmd|' /C calc'!A0", kind: "normal", phase: "new", lengthCm: 100, heightCm: 270, thicknessCm: 10, netAreaM2: 2.7 }] });
  assert.ok(csv.includes("\"'+cmd|' /C calc'!A0\""));
});

/* ---- relay ---------------------------------------------------------------- */

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
    server.on("error", reject);
  });
}

async function startRelay(t) {
  const port = await freePort();
  const identityFile = join(tmpdir(), `home3d-sweep-ids-${process.pid}-${port}.json`);
  const child = spawn(process.execPath, ["server/relay.mjs", String(port)], {
    cwd: new URL("..", import.meta.url),
    env: { ...process.env, HOME3D_IDENTITIES_FILE: identityFile },
    stdio: "ignore",
  });
  t.after(async () => {
    child.kill("SIGTERM");
    await rm(identityFile, { force: true });
  });
  await waitForRelay(`http://127.0.0.1:${port}/api/ping`, child, {
    attempts: 60,
    delay: () => new Promise((resolve) => setTimeout(resolve, 50)),
  });
  return port;
}

function maskedFrame(opcode, payload) {
  const body = Buffer.from(payload);
  const head = body.length < 126 ? Buffer.from([0x80 | opcode, 0x80 | body.length])
    : Buffer.from([0x80 | opcode, 0x80 | 126, body.length >> 8, body.length & 255]);
  const mask = Buffer.from([1, 2, 3, 4]);
  const masked = Buffer.from(body.map((byte, i) => byte ^ mask[i & 3]));
  return Buffer.concat([head, mask, masked]);
}

// A raw RFC 6455 client: collects the server's frames as {op, text}.
function wsClient(port) {
  return new Promise((resolve, reject) => {
    const sock = connect(port, "127.0.0.1");
    const client = { sock, frames: [], raw: Buffer.alloc(0), closed: false };
    let upgraded = false;
    sock.on("connect", () => sock.write(
      "GET / HTTP/1.1\r\n" + `Host: 127.0.0.1:${port}\r\n` +
      "Upgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Version: 13\r\n" +
      "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n" + `Origin: http://127.0.0.1:${port}\r\n\r\n`));
    sock.on("data", (chunk) => {
      client.raw = Buffer.concat([client.raw, chunk]);
      if (!upgraded) {
        const end = client.raw.indexOf("\r\n\r\n");
        if (end < 0) return;
        upgraded = true;
        client.raw = client.raw.subarray(end + 4);
        resolve(client);
      }
      for (;;) {
        if (client.raw.length < 2) return;
        let len = client.raw[1] & 0x7f, off = 2;
        if (len === 126) { if (client.raw.length < 4) return; len = client.raw.readUInt16BE(2); off = 4; }
        if (client.raw.length < off + len) return;
        client.frames.push({ op: client.raw[0] & 0x0f, byte1: client.raw[1], text: client.raw.subarray(off, off + len).toString("utf8") });
        client.raw = client.raw.subarray(off + len);
      }
    });
    sock.on("close", () => { client.closed = true; });
    sock.on("error", (error) => { if (!upgraded) reject(error); });
  });
}
const send = (client, obj) => client.sock.write(maskedFrame(1, JSON.stringify(obj)));
const messages = (client) => client.frames.filter((f) => f.op === 1).map((f) => JSON.parse(f.text));
const settle = () => new Promise((resolve) => setTimeout(resolve, 150));

test("relay: clients that have not joined a room cannot see or message each other", async (t) => {
  const port = await startRelay(t);
  const a = await wsClient(port), b = await wsClient(port);
  t.after(() => { a.sock.destroy(); b.sock.destroy(); });
  send(a, { t: "hello", code: "ABCD-EFGH", name: "A", token: "a".repeat(40) });
  send(b, { t: "hello", code: "JKLM-NPQR", name: "B", token: "b".repeat(40) });
  await settle();
  const rosterA = messages(a).filter((m) => m.t === "roster").at(-1);
  assert.deepEqual(rosterA.users.map((u) => u.code), ["ABCD-EFGH"]);
  send(a, { t: "msg", to: "JKLM-NPQR", data: { k: "chat", text: "hi" } });
  await settle();
  assert.equal(messages(b).filter((m) => m.t === "msg").length, 0);
  // once they share a room they do see each other
  send(a, { t: "join", room: "apt:ABCD-EFGH" });
  send(b, { t: "join", room: "apt:ABCD-EFGH" });
  await settle();
  const shared = messages(a).filter((m) => m.t === "roster").at(-1);
  assert.deepEqual(shared.users.map((u) => u.code).sort(), ["ABCD-EFGH", "JKLM-NPQR"]);
});

test("relay: an oversized ping closes the connection instead of a malformed pong", async (t) => {
  const port = await startRelay(t);
  const client = await wsClient(port);
  t.after(() => client.sock.destroy());
  client.sock.write(maskedFrame(9, "x".repeat(200)));
  await settle();
  assert.equal(client.frames.filter((f) => f.op === 10).length, 0, "no pong with a truncated length");
  assert.equal(client.closed, true);
  // a legal ping is still answered with its payload
  const ok = await wsClient(port);
  t.after(() => ok.sock.destroy());
  ok.sock.write(maskedFrame(9, "ping"));
  await settle();
  assert.deepEqual(ok.frames.filter((f) => f.op === 10).map((f) => f.text), ["ping"]);
});
