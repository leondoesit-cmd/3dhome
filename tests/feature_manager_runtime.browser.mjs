/* Runtime coverage for the two FeatureManager paths that pure tree tests
   cannot exercise: adopting/restoring a migrated document and driving a body
   visibility control through the real DOM. */
import test from "node:test";
import assert from "node:assert/strict";
import { openPage, findChrome } from "../tools/browser_harness.mjs";

const chrome = await findChrome();
const opts = chrome ? {} : { skip:"no Chrome found (set CHROME_PATH)" };
const NO_GL = /getSupportedExtensions|WebGL|WebGPU|GPUAdapter|three\.webgpu/i;
let page = null;

async function settle(ms = 250) {
  await page.eval((delay) => new Promise((resolve) => setTimeout(resolve, delay)), ms);
}

async function openLegacyFixture() {
  if (!page) page = await openPage({ width:1280, height:800, lang:"en", mobile:false, touch:false });
  else await page.goto("/");
  page.consoleErrors.length = 0;
  await page.eval(async () => {
    const fixture = await (await fetch("/tests/fixtures/legacy_feature_manager.json")).json();
    const { openModeler } = await import("/js/modeler.js");
    openModeler(null, fixture, null);
  });
  await settle(500);
}

test.after(async () => { if (page) await page.close(); });

test("legacy fixture exposes one renderer and a verified migration action", opts, async () => {
  await openLegacyFixture();
  const state = await page.eval(() => ({
    mode:document.querySelector(".md-tree-unified")?.dataset.mode,
    offer:document.querySelector("[data-tree-migration-offer]")?.dataset.treeMigrationOffer,
    migrate:!!document.querySelector('[data-tree-migrate="run"]'),
    bodySection:document.querySelector('[data-node-id="section:bodies"] .md-tree-name')?.textContent,
  }));
  assert.equal(state.mode, "legacy");
  assert.equal(state.offer, "ready");
  assert.equal(state.migrate, true);
  assert.match(state.bodySection, /\(2\)$/);
});

test("migration, body visibility, restoration, undo and redo work in one session", opts, async () => {
  await page.eval(() => document.querySelector('[data-tree-migrate="run"]').click());
  await settle(500);
  let state = await page.eval(() => ({
    mode:document.querySelector(".md-tree-unified")?.dataset.mode,
    restore:!!document.querySelector('[data-tree-restore-legacy="run"]'),
    bodySection:document.querySelector('[data-node-id="section:bodies"] .md-tree-name')?.textContent,
  }));
  assert.equal(state.mode, "canonical");
  assert.equal(state.restore, true);
  assert.match(state.bodySection, /\(2\)$/);

  await page.eval(() => document.querySelector('[data-node-id="section:bodies"] .md-tree-caret').click());
  await settle(150);
  const bodyIds = await page.eval(() => [...document.querySelectorAll(".md-tree-body")].map((row) => row.dataset.nodeId));
  assert.equal(bodyIds.length, 2);
  await page.eval((id) => document.querySelector('[data-node-id="' + id + '"] [aria-label="Hide body"]').click(), bodyIds[0]);
  await settle(250);
  state = await page.eval((ids) => ids.map((id) => ({
    id,
    hidden:document.querySelector('[data-node-id="' + id + '"]')?.classList.contains("md-suppressed"),
    action:document.querySelector('[data-node-id="' + id + '"] .md-part-x')?.getAttribute("aria-label"),
  })), bodyIds);
  assert.equal(state[0].hidden, true);
  assert.equal(state[0].action, "Show body");
  assert.equal(state[1].hidden, false);
  assert.equal(state[1].action, "Hide body");

  await page.eval(() => document.querySelector('[data-tree-restore-legacy="run"]').click());
  await settle(350);
  assert.equal(await page.eval(() => document.querySelector(".md-tree-unified")?.dataset.mode), "legacy");

  await page.eval(() => document.getElementById("mdUndo").click());
  await settle(350);
  assert.equal(await page.eval(() => document.querySelector(".md-tree-unified")?.dataset.mode), "canonical");
  assert.equal(await page.eval(() => !!document.querySelector('[data-tree-restore-legacy="run"]')), true);

  await page.eval(() => document.getElementById("mdRedo").click());
  await settle(350);
  assert.equal(await page.eval(() => document.querySelector(".md-tree-unified")?.dataset.mode), "legacy");

  const realErrors = page.consoleErrors.filter((message) => !NO_GL.test(String(message)));
  assert.deepEqual(realErrors, []);
});

test("a serialized migrated document reopens with its complete recovery action", opts, async () => {
  await page.goto("/");
  page.consoleErrors.length = 0;
  await page.eval(async () => {
    const source = await (await fetch("/tests/fixtures/legacy_feature_manager.json")).json();
    const migration = await import("/js/core/migration_check.js");
    const { openModeler } = await import("/js/modeler.js");
    const conversion = migration.convertLegacyDocument(source);
    const migrated = migration.retainLegacySource(conversion.document, source, {
      migratedAt:42,
      verification:{ persisted:true },
    });
    const reloaded = JSON.parse(JSON.stringify(migrated));
    openModeler(null, reloaded, null);
  });
  await settle(500);
  assert.equal(await page.eval(() => document.querySelector(".md-tree-unified")?.dataset.mode), "canonical");
  assert.equal(await page.eval(() => !!document.querySelector('[data-tree-restore-legacy="run"]')), true);
  await page.eval(() => document.querySelector('[data-tree-restore-legacy="run"]').click());
  await settle(350);
  assert.equal(await page.eval(() => document.querySelector(".md-tree-unified")?.dataset.mode), "legacy");
  assert.equal(await page.eval(() => document.querySelector("[data-tree-migration-offer]")?.dataset.treeMigrationOffer), "ready");
  const realErrors = page.consoleErrors.filter((message) => !NO_GL.test(String(message)));
  assert.deepEqual(realErrors, []);
});
