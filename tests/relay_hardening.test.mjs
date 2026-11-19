import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  isLanAddress,
  isLoopbackAddress,
  isPublicAddress,
  lanOnlyRequest,
  localOnlyRequest,
  requestHostname,
  safeHttpGet,
  safeStaticFile,
  sanitizeLanHeaders,
} from "../server/security.mjs";
import { maskedFrame, openSocket, rawRequest, startRelay } from "./helpers/relay_process.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const req = (remoteAddress, host, headers = {}) => ({ socket: { remoteAddress }, headers: { host, ...headers } });
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Windows aliases every long name with an 8.3 one (.git is GIT~1); null when the
// volume does not generate them or the platform has none.
function shortName(path) {
  if (process.platform !== "win32") return null;
  try {
    const out = execFileSync("cmd.exe", ["/d", "/c", `for %I in ("${path}") do @echo %~sI`], {
      encoding: "utf8",
      windowsVerbatimArguments: true,
    }).trim();
    const name = basename(out);
    return name && name !== basename(path) ? name : null;
  } catch (_) {
    return null;
  }
}

test("machine-local routes need this machine, addressed by a local name", () => {
  assert.equal(localOnlyRequest(req("127.0.0.1", "127.0.0.1:8765")), true);
  assert.equal(localOnlyRequest(req("::1", "[::1]:8765")), true);
  assert.equal(localOnlyRequest(req("::ffff:127.0.0.1", "localhost:8765")), true);
  assert.equal(localOnlyRequest(req("127.0.0.1", "app.localhost")), true);
  assert.equal(localOnlyRequest(req("127.0.0.1", "rebind.evil.test:8765")), false, "a rebinding domain on a loopback socket");
  assert.equal(localOnlyRequest(req("127.0.0.1", "x@127.0.0.1")), false, "URL syntax in Host never parses");
  assert.equal(localOnlyRequest(req("127.0.0.1", "")), false, "no Host header");
  assert.equal(localOnlyRequest(req("192.168.1.20", "127.0.0.1:8765")), false, "a LAN peer is not this machine");
  assert.equal(
    localOnlyRequest(req("127.0.0.1", "127.0.0.1", { "x-forwarded-for": "203.0.113.9" })),
    false,
    "a request relayed by a proxy",
  );
  assert.equal(localOnlyRequest(req("127.0.0.1", "127.0.0.1"), { publicMode: true }), false);
  assert.equal(localOnlyRequest(req("127.0.0.1", "studio:8765"), { allowedHosts: new Set(["studio"]) }), true);

  for (const address of ["0:0:0:0:0:0:0:1", "0:0:0:0:0:ffff:7f00:1", "0:0:0:0:0:ffff:127.0.0.1"]) {
    for (const gate of [localOnlyRequest, lanOnlyRequest]) {
      assert.equal(gate(req("127.0.0.1", `[${address}]:8765`)), true, address + " Host");
      assert.equal(gate(req(address, "localhost:8765")), true, address + " socket");
      assert.equal(gate(req(address + "%lo", `[${address}]:8765`)), true, address + " zone");
    }
  }
  for (const header of ["forwarded", "x-real-ip", "x-forwarded-proto", "x-forwarded-port", "x-forwarded-server"]) {
    assert.equal(localOnlyRequest(req("127.0.0.1", "localhost", { [header]: "proxy" })), false, header);
    assert.equal(lanOnlyRequest(req("192.168.1.20", "studio.local", { [header]: "proxy" })), false, header);
  }
  assert.equal(localOnlyRequest(req("127.0.0.1", "localhost", { via: "local-tool" })), true);
  assert.equal(lanOnlyRequest(req("192.168.1.20", "studio.local", { via: "local-tool" })), true);

  assert.equal(lanOnlyRequest(req("::ffff:192.168.1.20", "192.168.1.10:8765")), true, "a phone on the LAN");
  assert.equal(lanOnlyRequest(req("10.0.0.7", "desktop-pc:8765")), true, "a single-label LAN name");
  assert.equal(lanOnlyRequest(req("192.168.1.20", "studio.local:8765")), true, "an mDNS name");
  assert.equal(lanOnlyRequest(req("127.0.0.1", "localhost:8765")), true);
  assert.equal(lanOnlyRequest(req("192.168.1.20", "rebind.evil.test:8765")), false, "a rebinding domain");
  assert.equal(lanOnlyRequest(req("203.0.113.9", "192.168.1.10:8765")), false, "a public peer");
  assert.equal(lanOnlyRequest(req("192.168.1.20", "203.0.113.5:8765")), false, "a public Host address");
  assert.equal(
    lanOnlyRequest(req("10.1.2.3", "modelforge.onrender.com", { "x-forwarded-for": "198.51.100.4" })),
    false,
    "a hosting proxy's private address is not the LAN",
  );
  assert.equal(lanOnlyRequest(req("192.168.1.20", "192.168.1.10"), { publicMode: true }), false);
  assert.equal(requestHostname(req("127.0.0.1", "LocalHost.:8765")), "localhost");
  assert.equal(requestHostname(req("127.0.0.1", "[0:0:0:0:0:0:0:1]:8765")), "::1");
  assert.equal(requestHostname(req("127.0.0.1", "[0:0:0:0:0:ffff:7f00:1]:8765")), "::ffff:7f00:1");
});

test("equivalent IPv6 spellings have the same loopback, LAN and public classification", () => {
  for (const [short, expanded, loopback, lan, publicAddress] of [
    ["::1", "0:0:0:0:0:0:0:1", true, true, false],
    ["::ffff:7f00:1", "0:0:0:0:0:ffff:127.0.0.1", true, true, false],
    ["::7f00:1", "0:0:0:0:0:0:7f00:1", true, true, false],
    ["::ffff:c0a8:114", "0:0:0:0:0:ffff:c0a8:114", false, true, false],
    ["::ffff:808:808", "0:0:0:0:0:ffff:8.8.8.8", false, false, true],
    ["::", "0:0:0:0:0:0:0:0", false, false, false],
    ["fd00::1", "fd00:0:0:0:0:0:0:1", false, true, false],
    ["fe80::1", "fe80:0:0:0:0:0:0:1", false, false, false],
    ["2606:4700::1111", "2606:4700:0:0:0:0:0:1111", false, false, true],
  ]) {
    for (const address of [short, expanded, expanded + "%lo"]) {
      assert.equal(isLoopbackAddress(address), loopback, address);
      assert.equal(isLanAddress(address), lan, address);
      assert.equal(isPublicAddress(address), publicAddress, address);
    }
  }
});

test("LAN header values with line breaks are dropped, and an unbuildable request fails instead of throwing", async () => {
  assert.deepEqual(
    sanitizeLanHeaders({ Authorization: "Bearer a\r\nX-Injected: 1", Accept: "application/json", "content-type": "x\0y" }),
    { Accept: "application/json" },
  );
  // safeHttpGet passes its headers straight to the pinned request, so this
  // reaches request(), which throws before any connection is attempted.
  const out = await safeHttpGet("http://example.test/", {
    lookup: async () => [{ address: "93.184.216.34", family: 4 }],
    headers: { "X-Probe": "a\nb" },
  });
  assert.equal(out.ok, false);
});

test("static files: case and short-name aliases stay private, and only allow-listed roots are served", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "home3d-static-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "server"));
  await mkdir(join(root, "js"));
  await mkdir(join(root, "docs"));
  await mkdir(join(root, ".private-store"));
  await writeFile(join(root, "index.html"), "ok");
  await writeFile(join(root, "package.json"), "{}");
  await writeFile(join(root, "js", "a.js"), "");
  await writeFile(join(root, "docs", "notes.md"), "");
  await writeFile(join(root, "server", "readme.txt"), "private");
  await writeFile(join(root, ".private-store", "token.json"), "secret");
  const allow = { files: new Set(["index.html"]), dirs: new Set(["js"]) };

  assert.ok(await safeStaticFile(root, "/", { allow }));
  assert.ok(await safeStaticFile(root, "/js/a.js", { allow }));
  assert.equal(await safeStaticFile(root, "/package.json", { allow }), null, "a root file off the list");
  assert.equal(await safeStaticFile(root, "/docs/notes.md", { allow }), null, "a root folder off the list");
  assert.ok(await safeStaticFile(root, "/docs/notes.md"), "without a list only the private rules apply");
  assert.equal(await safeStaticFile(root, "/Server/readme.txt"), null, "the server tree in any case");
  assert.equal(await safeStaticFile(root, "/js/A~1.JS"), null, "short-name syntax is refused outright");
  const alias = shortName(join(root, ".private-store"));
  if (alias) assert.equal(await safeStaticFile(root, `/${alias}/token.json`), null, `short name ${alias}`);
});

test("one malformed WebSocket message or smart-home request cannot stop the relay", async (t) => {
  const relay = await startRelay(t);
  const socket = await openSocket(relay.port, relay.origin);
  socket.on("error", () => {});
  for (const text of ["null", "[]", '"x"', "7", '{"t":5}', '{"t":"hello","code":{}}', '{"t":"join"}'])
    socket.write(maskedFrame(text));
  await pause(150);
  socket.destroy();

  const crlf = await rawRequest(relay.port, {
    method: "POST",
    path: "/api/smarthome",
    headers: { "content-type": "application/json", origin: relay.origin },
    body: JSON.stringify({ url: "http://127.0.0.1:8123/api/", headers: { Authorization: "Bearer a\nb" } }),
  });
  assert.equal(crlf.status, 200);
  assert.equal(JSON.parse(crlf.text).ok, false);
  const nullBody = await rawRequest(relay.port, {
    method: "POST",
    path: "/api/smarthome",
    headers: { "content-type": "application/json", origin: relay.origin },
    body: "null",
  });
  assert.equal(nullBody.status, 400);

  assert.equal(relay.child.exitCode, null, "the relay is still running");
  assert.equal((await rawRequest(relay.port, { path: "/api/ping" })).status, 200);
  const again = await openSocket(relay.port, relay.origin);
  again.destroy();
});

test("fragmented WebSocket messages are capped without stopping the relay", { timeout: 10000 }, async (t) => {
  const cap = 1024 * 1024;
  const relay = await startRelay(t, { HOME3D_WS_MAX_MESSAGE_BYTES: String(cap) });
  const socket = await openSocket(relay.port, relay.origin);
  t.after(() => socket.destroy());
  socket.on("error", () => {});
  const closed = new Promise((resolve) => socket.once("close", resolve));
  const fragment = "x".repeat(cap / 4);
  for (let i = 0; i < 4; i++) {
    socket.write(maskedFrame(fragment, i === 0 ? 1 : 0, false));
    // A pong confirms the fragment was consumed without completing the message.
    const pong = new Promise((resolve) => {
      let reply = Buffer.alloc(0);
      const onData = (chunk) => {
        reply = Buffer.concat([reply, chunk]);
        if (reply.length < 2) return;
        socket.off("data", onData);
        resolve(reply);
      };
      socket.on("data", onData);
    });
    socket.write(maskedFrame("", 9));
    assert.deepEqual(await pong, Buffer.from([0x8a, 0]));
  }
  socket.write(maskedFrame(fragment, 0, false));
  await closed;
  assert.equal((await rawRequest(relay.port, { path: "/api/ping" })).status, 200);
  assert.equal(relay.child.exitCode, null, "the relay is still running");
  assert.equal(relay.child.signalCode, null);
});

test("an oversized WebSocket frame is refused before its payload arrives", { timeout: 10000 }, async (t) => {
  const cap = 1024;
  const relay = await startRelay(t, { HOME3D_WS_MAX_MESSAGE_BYTES: String(cap) });
  const socket = await openSocket(relay.port, relay.origin);
  t.after(() => socket.destroy());
  socket.on("error", () => {});
  const closed = new Promise((resolve) => socket.once("close", resolve));
  socket.write(maskedFrame("x".repeat(cap + 1)).subarray(0, 8));
  await closed;
  assert.equal((await rawRequest(relay.port, { path: "/api/ping" })).status, 200);
  assert.equal(relay.child.exitCode, null, "the relay is still running");
});

test("a DNS-rebinding page and requests without Origin cannot reach the machine-local routes", async (t) => {
  const relay = await startRelay(t);
  const rebound = { host: `rebind.evil.test:${relay.port}`, origin: `http://rebind.evil.test:${relay.port}` };
  assert.equal((await rawRequest(relay.port, { path: "/api/model-backup", headers: rebound })).status, 403);
  assert.equal((await rawRequest(relay.port, { path: "/api/agent/status", headers: rebound })).status, 401);
  assert.equal((await rawRequest(relay.port, { path: "/api/blueprint", headers: rebound })).status, 403);
  const smarthome = (headers) =>
    rawRequest(relay.port, {
      method: "POST",
      path: "/api/smarthome",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify({ url: "http://127.0.0.1:8123/api/" }),
    });
  assert.equal((await smarthome(rebound)).status, 403);
  assert.equal((await smarthome({})).status, 403, "the app always sends Origin on a POST");
  assert.equal((await smarthome({ origin: relay.origin })).status, 200);
  assert.equal((await rawRequest(relay.port, { path: "/api/model-backup" })).status, 200, "this machine still can");
});

test("the static server only serves the app's own folders", async (t) => {
  const relay = await startRelay(t);
  const status = async (path) => (await rawRequest(relay.port, { path })).status;
  assert.equal(await status("/"), 200);
  assert.equal(await status("/js/cad_kernel.js"), 200);
  assert.equal(await status("/vendor/opencascade/opencascade.full.js"), 200);
  assert.equal(await status("/Server/relay.mjs"), 404);
  assert.equal(await status("/node_modules/opencascade.js/package.json"), 404);
  assert.equal(await status("/package.json"), 404);
  assert.equal(await status("/docs/performance-2026-10-23.md"), 404);
  assert.equal(await status("/tests/relay_hardening.test.mjs"), 404);
  const git = shortName(join(ROOT, ".git"));
  if (git) assert.equal(await status(`/${git}/config`), 404, `short name ${git}`);
});

test("a public deployment exposes no machine-local route, even to loopback", async (t) => {
  const relay = await startRelay(t, { HOME3D_PUBLIC: "1" });
  const ping = await rawRequest(relay.port, { path: "/api/ping" });
  assert.deepEqual(JSON.parse(ping.text).api, ["prodsize"]);
  const post = (path) =>
    rawRequest(relay.port, {
      method: "POST",
      path,
      headers: { "content-type": "application/json", origin: relay.origin },
      body: "{}",
    });
  assert.equal((await post("/api/smarthome")).status, 404);
  assert.equal((await post("/api/model-backup")).status, 404);
  assert.equal((await post("/api/blueprint")).status, 404);
  assert.equal((await rawRequest(relay.port, { path: "/api/agent/status" })).status, 401, "no token, no agent");
  assert.equal((await rawRequest(relay.port, { path: "/" })).status, 200, "the app itself is still served");
});
