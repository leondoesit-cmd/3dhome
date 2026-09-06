/* Boundary guard: uikit/ must not contain host vocabulary.
 *
 * uikit is a portable, host-agnostic layout library. Host-specific IDs
 * (n:topbar, n:left, n:right, n:app, panel:*, act:*), selectors (#topbar,
 * #left-sidebar, .dropdown), and icon theme names (ph-*) belong exclusively
 * in the host adapter (js/uikit_host/), not inside uikit/ itself.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (match) => {
      return "\n".repeat((match.match(/\n/g) || []).length);
    })
    .replace(/\/\/[^\n]*/g, "");
}

function findFiles(dir, out = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "demo" || entry.name === "tests" || entry.name === "node_modules") continue;
      findFiles(full, out);
    } else if (entry.isFile() && (entry.name.endsWith(".js") || entry.name.endsWith(".css"))) {
      out.push(full);
    }
  }
  return out;
}

const FORBIDDEN_PATTERNS = [
  { name: "Phosphor icon prefix (ph-)", pattern: /\bph-[a-z0-9-]+/ },
  { name: "#topbar selector/literal", pattern: /#topbar\b/ },
  { name: "#left-sidebar selector/literal", pattern: /#left-sidebar\b/ },
  { name: ".dropdown class literal", pattern: /\.dropdown\b/ },
  { name: "Host id literal (n:app/topbar/left/right)", pattern: /["'`]n:(?:app|topbar|left|right|side)\b/ },
  { name: "Host id literal (panel:)", pattern: /["'`]panel:[a-zA-Z0-9_-]+/ },
  { name: "Host id literal (act:)", pattern: /["'`]act:[a-zA-Z0-9_-]+/ },
  { name: "String literal in icons.render", pattern: /icons\.render\s*\(\s*["'`]/ },
];

test("uikit source contains zero hardcoded host vocabulary", () => {
  const files = findFiles(ROOT);
  const violations = [];

  for (const file of files) {
    const raw = fs.readFileSync(file, "utf8");
    const stripped = stripComments(raw);
    const lines = stripped.split("\n");

    lines.forEach((line, index) => {
      for (const { name, pattern } of FORBIDDEN_PATTERNS) {
        if (pattern.test(line)) {
          const rel = path.relative(ROOT, file);
          violations.push(`${rel}:${index + 1} matches ${name} -> ${line.trim()}`);
        }
      }
    });
  }

  assert.deepEqual(violations, [], "Found forbidden host vocabulary in uikit/ source:\n" + violations.join("\n"));
});
