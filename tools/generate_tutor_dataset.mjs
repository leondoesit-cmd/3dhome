#!/usr/bin/env node
// Synthetic, privacy-safe tutor trajectories. No user telemetry is read.
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

function rng(seed) {
  let value = seed >>> 0;
  return () => ((value = (value * 1664525 + 1013904223) >>> 0) / 4294967296);
}
const TEMPLATES = [
  {
    id: "opening_empty", skill: "opening",
    input: (r) => ({ activeTool: r() > 0.5 ? "door" : "window", frictionScore: 0.8, recentEvents: [{ type: "OPENING_EMPTY" }, { type: "OPENING_EMPTY" }], state: { walls: Math.floor(r() * 5), openings: 0 } }),
    output: { mode: "ask", question: "This opening needs an existing host wall. Would you like me to show where to click?", options: ["Show valid walls", "Explain opening placement", "Not now"], evidence: [{ type: "failed-prerequisite", detail: "Two opening clicks missed a host wall." }], confidence: 0.98, proposedOperations: [] },
  },
  {
    id: "draft_cancel", skill: "wall",
    input: () => ({ activeTool: "wall", frictionScore: 0.72, recentEvents: [{ type: "DRAFT_CANCEL" }, { type: "DRAFT_CANCEL" }], state: { drawing: false } }),
    output: { mode: "coach", message: "Click once for the first corner, continue for each wall, and press Escape only after the run is complete.", evidence: [{ type: "draft-cancel-loop", detail: "Repeated wall-draft cancellations." }], confidence: 0.88, proposedOperations: [] },
  },
  {
    id: "undo_retry", skill: "precision",
    input: () => ({ activeTool: "select", frictionScore: 0.65, recentEvents: [{ type: "UNDO" }, { type: "UNDO" }], state: { selection: "wall" } }),
    output: { mode: "ask", question: "What result were you trying to get?", options: ["Fix alignment", "Fix dimensions", "Place an object", "Something else"], evidence: [{ type: "undo-retry", detail: "Multiple undo operations occurred quickly." }], confidence: 0.82, proposedOperations: [] },
  },
  {
    id: "unclosed_room", skill: "room",
    input: (r) => ({ activeTool: "wall", frictionScore: 0.76, recentEvents: [{ type: "COMMAND_FAILED" }], state: { walls: 4, rooms: 0, gapCm: 2 + Math.round(r() * 12) } }),
    output: { mode: "coach", message: "The final wall is close to the starting corner but the loop is still open. Snap the last endpoint onto the first corner to derive a room.", evidence: [{ type: "topology-gap", detail: "Four walls form an almost-closed loop." }], confidence: 0.94, proposedOperations: [] },
  },
  {
    id: "constraint_conflict", skill: "constraints",
    input: () => ({ activeTool: "select", frictionScore: 0.9, recentEvents: [{ type: "COMMAND_FAILED" }, { type: "UNDO" }], state: { warnings: ["angle-conflict"], selection: "wall" } }),
    output: { mode: "ask", question: "A locked constraint is blocking this move. Should I explain the conflict or show the relevant constraint?", options: ["Explain conflict", "Show constraint", "Not now"], evidence: [{ type: "constraint-warning", detail: "The selected geometry has an active constraint conflict." }], confidence: 0.93, proposedOperations: [] },
  },
  {
    id: "item_catalog", skill: "item",
    input: (r) => ({ activeTool: "furniture", frictionScore: 0.25, recentEvents: [], state: { requested: r() > 0.5 ? "bed" : "sofa", selectedCatalogItem: null } }),
    output: { mode: "ask", question: "Which catalog item and approximate position should I use?", options: ["Choose from catalog", "Use current view center", "Cancel"], evidence: [{ type: "missing-parameters", detail: "Item type or placement position is missing." }], confidence: 0.9, proposedOperations: [] },
  },
];

export function buildTutorDataset(count = 1000, seed = 20260831) {
  const random = rng(seed), rows = [];
  for (let i = 0; i < count; i++) {
    const template = TEMPLATES[i % TEMPLATES.length], input = template.input(random);
    rows.push({
      id: `${template.id}-${i + 1}`, skill: template.skill, synthetic: true,
      messages: [
        { role: "system", content: "You are the ModelForge CAD tutor. Diagnose only from supplied evidence, ask grounded questions, and return the structured tutor decision schema." },
        { role: "user", content: JSON.stringify(input) },
        { role: "assistant", content: JSON.stringify(template.output) },
      ],
    });
  }
  return rows;
}

async function main() {
  const countArg = process.argv.find((arg) => arg.startsWith("--count="));
  const outputArg = process.argv.find((arg) => arg.startsWith("--output="));
  const count = Math.max(1, Math.min(100000, Number(countArg && countArg.slice(8)) || 1000));
  const output = resolve(outputArg ? outputArg.slice(9) : "dataset/modelforge_tutor_sft.jsonl");
  const rows = buildTutorDataset(count);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, rows.map((row) => JSON.stringify(row)).join("\n") + "\n", "utf8");
  process.stdout.write(`wrote ${rows.length} synthetic tutor examples to ${output}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();

