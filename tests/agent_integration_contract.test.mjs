import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const main = await readFile(new URL("../js/main.js", import.meta.url), "utf8");
const settings = await readFile(new URL("../js/ui_site.js", import.meta.url), "utf8");
const ui = await readFile(new URL("../js/ui_agent.js", import.meta.url), "utf8");
const runtime = await readFile(new URL("../js/agent_runtime.js", import.meta.url), "utf8");
const server = await readFile(new URL("../server/relay.mjs", import.meta.url), "utf8");
const html = await readFile(new URL("../index.html", import.meta.url), "utf8");

test("AI helper has a distinct launcher, settings tab, and boot path", () => {
  assert.match(html, /id="agentBtn"/);
  assert.match(main, /initAgent\(\)/);
  assert.match(settings, /buildAgentSettingsPane/);
  assert.match(settings, /showPane\("agent"\)/);
  assert.match(ui, /id = "agent-dock"/);
});

test("model mutations stop at preview until the user explicitly confirms", () => {
  assert.match(runtime, /preview_model_command/);
  assert.doesNotMatch(runtime, /name: "execute_model_command"/);
  assert.match(ui, /accept\.onclick/);
  assert.match(ui, /executePlannerProposal\(proposal\)/);
  assert.doesNotMatch(runtime, /executeConfirmed/);
});

test("server-managed provider is fixed by environment and cannot proxy a client URL", () => {
  const agentSlice = server.slice(server.indexOf("async function agentChat"), server.indexOf("// ---- static app"));
  assert.match(server, /HOME3D_AGENT_BASE_URL/);
  assert.match(server, /if \(!AGENT_BASE_URL \|\| !AGENT_MODEL\)/);
  assert.match(server, /const endpoint = \/\\\/v1\$\/i\.test\(AGENT_BASE_URL\)/);
  assert.doesNotMatch(agentSlice, /payload\.url/);
  assert.match(server, /HOME3D_AGENT_ACCESS_TOKEN/);
  assert.match(server, /responseTextLimited/);
});
