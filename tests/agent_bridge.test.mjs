import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

async function freePort() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}
async function waitForServer(port) {
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(`http://127.0.0.1:${port}/api/ping`)).ok) return; } catch (_) {}
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("relay did not start");
}

test("authenticated external bridge relays one MCP call to the browser and back", async (t) => {
  const port = await freePort(), token = "bridge-test-secret";
  const identityFile = join(tmpdir(), `home3d-agent-bridge-${process.pid}-${port}.json`);
  const child = spawn(process.execPath, ["server/relay.mjs", String(port)], {
    cwd: new URL("..", import.meta.url),
    env: { ...process.env, HOME3D_AGENT_BRIDGE_TOKEN: token, HOME3D_IDENTITIES_FILE: identityFile },
    stdio: "ignore",
  });
  t.after(async () => { child.kill("SIGTERM"); await rm(identityFile, { force: true }); });
  await waitForServer(port);
  const base = `http://127.0.0.1:${port}`, headers = { "Content-Type": "application/json", "X-ModelForge-Bridge-Token": token };
  const denied = await fetch(base + "/api/agent-bridge/poll");
  assert.equal(denied.status, 401);
  const call = fetch(base + "/api/agent-bridge/call", {
    method: "POST", headers,
    body: JSON.stringify({ id: "call-1", name: "get_project_summary", args: {} }),
  });
  let request = null;
  for (let i = 0; i < 40 && !request; i++) {
    const response = await fetch(base + "/api/agent-bridge/poll?client=test", { headers });
    if (response.status === 200) request = await response.json();
    else await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.deepEqual(request, { id: "call-1", name: "get_project_summary", args: {} });
  const reply = await fetch(base + "/api/agent-bridge/reply", {
    method: "POST", headers,
    body: JSON.stringify({ id: "call-1", result: { domain: "planner" } }),
  });
  assert.equal(reply.status, 200);
  assert.deepEqual(await (await call).json(), { result: { domain: "planner" } });
});

