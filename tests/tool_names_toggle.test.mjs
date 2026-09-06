import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

test("tool titles toggle: HTML, i18n, and CSS rules exist and match", async () => {
  const indexHtml = fs.readFileSync(path.join(rootDir, "index.html"), "utf8");
  const enJs = fs.readFileSync(path.join(rootDir, "js", "i18n", "en.js"), "utf8");
  const heJs = fs.readFileSync(path.join(rootDir, "js", "i18n", "he.js"), "utf8");
  const stylesCss = fs.readFileSync(path.join(rootDir, "css", "styles.css"), "utf8");

  assert.ok(indexHtml.includes("id=\"toolNamesToggle\""), "toolNamesToggle must exist in index.html");
  assert.ok(indexHtml.includes("data-act=\"toggleToolNames\""), "toolNamesToggle must have data-act='toggleToolNames'");

  const toolNameRegex = /<button[^>]*class="tool[^"]*"[^>]*data-tool="([^"]+)"[^>]*>[\s\S]*?<span class="tool-name" data-i18n="([^"]+)"/g;
  let match;
  const toolsFound = [];
  while ((match = toolNameRegex.exec(indexHtml)) !== null) {
    toolsFound.push({ tool: match[1], i18nKey: match[2] });
  }

  assert.ok(toolsFound.length >= 10, "Should find at least 10 drawing tools with .tool-name spans");

  for (const { tool, i18nKey } of toolsFound) {
    assert.ok(enJs.includes(i18nKey + ":"), "en.js must have translation for " + i18nKey);
    assert.ok(heJs.includes(i18nKey + ":"), "he.js must have translation for " + i18nKey);
  }

  assert.ok(enJs.includes("toggle_tool_names:"), "en.js must have toggle_tool_names");
  assert.ok(heJs.includes("toggle_tool_names:"), "he.js must have toggle_tool_names");
  assert.ok(enJs.includes("toggle_tool_names_btn:"), "en.js must have toggle_tool_names_btn");
  assert.ok(heJs.includes("toggle_tool_names_btn:"), "he.js must have toggle_tool_names_btn");

  assert.ok(stylesCss.includes("#plan-toolbar .tool .tool-name"), "styles.css must style #plan-toolbar .tool .tool-name");
  assert.ok(stylesCss.includes("#plan-toolbar.show-titles"), "styles.css must style #plan-toolbar.show-titles");
  assert.ok(stylesCss.includes("#plan-toolbar .tool-names-toggle"), "styles.css must style #plan-toolbar .tool-names-toggle");
});
