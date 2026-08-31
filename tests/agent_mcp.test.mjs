import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

test("stdio MCP adapter advertises live read and preview tools without execute", async (t) => {
  const child = spawn(process.execPath, ["server/agent_mcp.mjs"], { cwd: new URL("..", import.meta.url), stdio: ["pipe", "pipe", "pipe"] });
  t.after(() => child.kill("SIGTERM"));
  const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
  const replies = [];
  lines.on("line", (line) => replies.push(JSON.parse(line)));
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } }) + "\n");
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }) + "\n");
  for (let i = 0; i < 50 && replies.length < 2; i++) await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(replies.length, 2);
  const tools = replies.find((entry) => entry.id === 2).result.tools;
  assert.ok(tools.some((entry) => entry.name === "get_project_summary"));
  assert.ok(tools.some((entry) => entry.name === "preview_model_command"));
  assert.equal(tools.some((entry) => /execute/.test(entry.name)), false);
});

