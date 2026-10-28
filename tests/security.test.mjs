import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { connect, createServer } from "node:net";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  isPublicAddress,
  isLanAddress,
  resolvePublicUrl,
  resolveLanUrl,
  safeHttpGet,
  sanitizeLanHeaders,
  safeStaticFile,
} from "../server/security.mjs";
import { escapeHTML, sanitizeDisplayName, validCustomModelKey } from "../js/safe.js";
import { needsRecovery } from "../js/recovery.js";

test("display names strip control characters and markup-prone length", () => {
  assert.equal(sanitizeDisplayName("  Ada  "), "Ada");
  assert.equal(sanitizeDisplayName("a\u0000b\u0007c"), "abc");
  assert.equal(sanitizeDisplayName("<img onerror=1>"), "<img onerror=1>");
  assert.equal(sanitizeDisplayName("x".repeat(100), 24).length, 24);
  assert.equal(
    escapeHTML(sanitizeDisplayName('<img src=x onerror="alert(1)">')),
    "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;",
  );
});

test("private, loopback, link-local, mapped, and multicast addresses are rejected", () => {
  for (const address of [
    "127.0.0.1",
    "10.1.2.3",
    "100.64.0.1",
    "169.254.169.254",
    "172.31.4.2",
    "192.168.1.1",
    "224.0.0.1",
    "::1",
    "fc00::1",
    "fe80::1",
    "::ffff:127.0.0.1",
    "::ffff:7f00:1",
    "::ffff:a9fe:a9fe",
    "::10.0.0.1",
    "::a00:1",
    "::7f00:1",
  ]) assert.equal(isPublicAddress(address), false, address);
  assert.equal(isPublicAddress("8.8.8.8"), true);
  assert.equal(isPublicAddress("2606:4700:4700::1111"), true);
});

test("smart-home LAN resolver allows home hubs and refuses metadata / public SSRF", async () => {
  assert.equal(isLanAddress("192.168.1.42"), true);
  assert.equal(isLanAddress("10.0.0.5"), true);
  assert.equal(isLanAddress("127.0.0.1"), true);
  // carrier-grade NAT space is shared with other ISP customers: LAN only when
  // listed in HOME3D_LAN_EXTRA_CIDRS (Tailscale users add 100.64.0.0/10)
  assert.equal(isLanAddress("100.64.1.8"), false);
  assert.equal(isLanAddress("169.254.169.254"), false);
  assert.equal(isLanAddress("8.8.8.8"), false);
  assert.equal(isLanAddress("224.0.0.1"), false);

  const lanLookup = async () => [{ address: "192.168.1.10", family: 4 }];
  const publicLookup = async () => [{ address: "8.8.8.8", family: 4 }];
  const ha = await resolveLanUrl("http://homeassistant.local:8123/api/", lanLookup);
  assert.equal(ha.url.port, "8123");
  assert.equal(await resolveLanUrl("http://homeassistant.local:8123/api/", publicLookup), null);
  assert.equal(await resolveLanUrl("http://192.168.1.10:22/", lanLookup), null, "ssh port blocked");
  assert.equal(await resolveLanUrl("https://8.8.8.8/", async () => [{ address: "8.8.8.8", family: 4 }]), null);
  assert.deepEqual(sanitizeLanHeaders({
    Authorization: "Bearer abc",
    Cookie: "session=1",
    Host: "evil",
    "Content-Type": "application/json",
  }), { Authorization: "Bearer abc", "Content-Type": "application/json" });
});

test("DNS names resolving to any private address are rejected before a request", async () => {
  const lookup = async () => [
    { address: "93.184.216.34", family: 4 },
    { address: "127.0.0.1", family: 4 },
  ];
  assert.equal(await resolvePublicUrl("https://example.test/product", lookup), null);
  const result = await safeHttpGet("https://example.test/product", { lookup });
  assert.equal(result.status, 400);
});

test("static-file containment rejects prefix siblings, private server files, and symlinks", async () => {
  const base = await mkdtemp(join(tmpdir(), "home3d-security-"));
  const root = join(base, "3dhome");
  const sibling = join(base, "3dhomev7");
  try {
    await mkdir(join(root, "server"), { recursive: true });
    await mkdir(sibling);
    await writeFile(join(root, "index.html"), "ok");
    await writeFile(join(root, "server", ".identity.json"), "secret");
    let hasSymlink = true;
    try {
      await symlink(join(sibling, "secret.txt"), join(root, "escape.txt"));
    } catch (err) {
      if (err.code === "EPERM" || err.code === "ENOSYS") hasSymlink = false;
      else throw err;
    }

    assert.equal(await safeStaticFile(root, "/index.html"), await realpath(join(root, "index.html")));
    assert.equal(await safeStaticFile(root, "/../3dhomev7/secret.txt"), null);
    assert.equal(await safeStaticFile(root, "/server/.identity.json"), null);
    if (hasSymlink) {
      assert.equal(await safeStaticFile(root, "/escape.txt"), null);
    }
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test("custom model identifiers stay namespaced and imported labels are escaped", () => {
  assert.equal(validCustomModelKey("cm_table_42"), true);
  assert.equal(validCustomModelKey("chair"), false);
  assert.equal(validCustomModelKey("cm_x\" onmouseover=alert(1)"), false);
  assert.equal(
    escapeHTML('<img src=x onerror="alert(1)">'),
    "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;",
  );
});

test("a fast restart recovers a crashed session but not a live second tab", () => {
  const now = 1_000_000;
  const snap = { json: "{}", at: now - 100, session: "crashed-tab" };
  const base = {
    now,
    staleMs: 20_000,
    cleanAt: undefined,
    leaseAt: now - 200, // still looks fresh despite the crash
    legacyLeaseAt: undefined,
  };
  assert.equal(needsRecovery(snap, { ...base, alive: false }), true);
  assert.equal(needsRecovery(snap, { ...base, alive: true }), false);
  assert.equal(needsRecovery(snap, { ...base, alive: null }), false);
  assert.equal(
    needsRecovery(snap, { ...base, alive: false, cleanAt: now }),
    false,
  );
});

async function freePort() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function waitForPing(port) {
  for (let i = 0; i < 40; i++) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/ping`);
      if (response.ok) return response;
    } catch (_) {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("relay did not start");
}

function upgradeStatus(port, origin) {
  return new Promise((resolve, reject) => {
    const socket = connect(port, "127.0.0.1");
    let text = "";
    socket.on("connect", () => {
      socket.write(
        "GET / HTTP/1.1\r\n" +
          `Host: 127.0.0.1:${port}\r\n` +
          "Upgrade: websocket\r\nConnection: Upgrade\r\n" +
          "Sec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n" +
          `Origin: ${origin}\r\n\r\n`,
      );
    });
    socket.on("data", (chunk) => {
      text += chunk.toString("utf8");
      if (text.includes("\r\n")) {
        socket.destroy();
        resolve(Number((text.match(/^HTTP\/1\.1 (\d+)/) || [])[1]));
      }
    });
    socket.on("error", reject);
  });
}

test("relay rejects cross-origin WebSockets and does not expose wildcard CORS", async (t) => {
  const port = await freePort();
  const identityFile = join(tmpdir(), `home3d-identities-${process.pid}-${port}.json`);
  const child = spawn(process.execPath, ["server/relay.mjs", String(port)], {
    cwd: new URL("..", import.meta.url),
    env: { ...process.env, HOME3D_IDENTITIES_FILE: identityFile },
    stdio: "ignore",
  });
  t.after(async () => {
    child.kill("SIGTERM");
    await rm(identityFile, { force: true });
  });
  const ping = await waitForPing(port);
  assert.equal(ping.headers.get("access-control-allow-origin"), null);
  const pingBody = await ping.json();
  assert.deepEqual(pingBody.api, ["prodsize", "smarthome"]);
  const smarthomeBlocked = await fetch(`http://127.0.0.1:${port}/api/smarthome`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: `http://127.0.0.1:${port}`,
    },
    body: JSON.stringify({ url: "https://example.com/api/", method: "GET" }),
  });
  assert.equal(smarthomeBlocked.status, 200);
  const smarthomeJson = await smarthomeBlocked.json();
  assert.equal(smarthomeJson.ok, false);
  assert.equal(smarthomeJson.status, 400);
  const smarthomeCsrf = await fetch(`http://127.0.0.1:${port}/api/smarthome`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://evil.example",
    },
    body: JSON.stringify({ url: "http://127.0.0.1:8123/api/", method: "GET" }),
  });
  assert.equal(smarthomeCsrf.status, 403);
  const asset = await fetch(`http://127.0.0.1:${port}/js/ui.js`, {
    headers: { "accept-encoding": "gzip" },
  });
  assert.equal(asset.status, 200);
  assert.equal(asset.headers.get("content-encoding"), "gzip");
  const etag = asset.headers.get("etag");
  assert.ok(etag);
  const unchanged = await fetch(`http://127.0.0.1:${port}/js/ui.js`, {
    headers: { "if-none-match": etag },
  });
  assert.equal(unchanged.status, 304);
  const vendor = await fetch(`http://127.0.0.1:${port}/vendor/three/three.module.js`);
  assert.match(vendor.headers.get("cache-control") || "", /immutable/);
  const font = await fetch(`http://127.0.0.1:${port}/vendor/phosphor/Phosphor.woff2`);
  assert.equal(font.status, 200);
  assert.equal(font.headers.get("content-type"), "font/woff2");
  assert.equal(font.headers.get("content-encoding"), null);
  const wasm = await fetch(`http://127.0.0.1:${port}/assets/opencascade.full.wasm.gz`);
  assert.equal(wasm.status, 200);
  assert.equal(wasm.headers.get("content-type"), "application/gzip");
  assert.equal((await fetch(`http://127.0.0.1:${port}/server/relay.mjs`)).status, 404);
  assert.equal(await upgradeStatus(port, "https://evil.example"), 403);
  assert.equal(
    await upgradeStatus(port, `http://127.0.0.1:${port}`),
    101,
  );
});
