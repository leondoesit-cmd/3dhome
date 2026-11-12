// The public relay (render.yaml) accepts the desktop app's WebSocket origins,
// and only those besides its own: the Tauri app serves itself from the `mf`
// scheme (http://mf.localhost on WebView2, mf://localhost on WebKit).
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { startRelay, openSocket } from "./helpers/relay_process.mjs";

const renderYaml = await readFile(new URL("../render.yaml", import.meta.url), "utf8");
const origins = (/key: HOME3D_ALLOWED_ORIGINS\s*\n\s*value: "([^"]*)"/.exec(renderYaml) || [])[1];

test("render.yaml lists both desktop origins", () => {
  assert.deepEqual(String(origins).split(","), ["http://mf.localhost", "mf://localhost"]);
});

test("a relay configured like render.yaml upgrades the desktop origins and refuses others", async (t) => {
  const relay = await startRelay(t, { HOME3D_PUBLIC: "1", HOME3D_ALLOWED_ORIGINS: origins });
  for (const origin of ["http://mf.localhost", "mf://localhost", relay.origin]) {
    const socket = await openSocket(relay.port, origin);
    socket.destroy();
  }
  for (const origin of ["https://evil.example", "http://mf.localhost.evil.example", "mf://localhost:1", "null"]) {
    await assert.rejects(openSocket(relay.port, origin), /upgrade refused: 403/, origin);
  }
});
