import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  listModelBackups, readModelBackup, readModelBackupAttachments, validBackupKey, writeModelBackup,
} from "../server/model_backup.mjs";
import {
  backupModels, backupSignature, missingFromLibrary, pendingModelBackups, fetchDiskBackup,
} from "../js/core/model_backup_client.js";

const record = (key, extra = {}) => ({ key, name: key.toUpperCase(), revision: 1, sketches: [], features: [], ...extra });

async function tempDir(t) {
  const dir = await mkdtemp(join(tmpdir(), "model-backup-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

test("a backup writes the record, a version and meta; an unchanged save adds nothing", async (t) => {
  const dir = await tempDir(t);
  const first = await writeModelBackup(dir, record("cm_lenscap", { revision: 15 }), { now: Date.UTC(2026, 8, 22, 10) });
  assert.equal(first.written, true);
  assert.match(first.version, /^2026-09-22T10-00-00-000Z-r15\.json$/);
  assert.deepEqual(await readModelBackup(dir, "cm_lenscap"), record("cm_lenscap", { revision: 15 }));
  const again = await writeModelBackup(dir, record("cm_lenscap", { revision: 15 }), { now: Date.UTC(2026, 8, 22, 11) });
  assert.equal(again.written, false, "same content is not a new version");
  const files = (await readdir(join(dir, "cm_lenscap"))).sort();
  assert.deepEqual(files, ["2026-09-22T10-00-00-000Z-r15.json", "latest.json", "meta.json"]);
  const [meta] = await listModelBackups(dir);
  assert.equal(meta.name, "CM_LENSCAP");
  assert.equal(meta.revision, 15);
  assert.equal(meta.versions, 1);
});

test("history is bounded and the newest versions are the ones kept", async (t) => {
  const dir = await tempDir(t);
  for (let i = 1; i <= 5; i++) {
    await writeModelBackup(dir, record("cm_a", { revision: i }), { keep: 3, now: Date.UTC(2026, 0, 1, 0, i) });
  }
  const versions = (await readdir(join(dir, "cm_a"))).filter((name) => /-r\d+\.json$/.test(name)).sort();
  assert.deepEqual(versions.map((name) => name.match(/-r(\d+)\.json$/)[1]), ["3", "4", "5"]);
  assert.equal((await readModelBackup(dir, "cm_a")).revision, 5);
});

test("a stale browser mirror cannot replace a newer model or remove its exact attachments", async(t)=>{
  const dir=await tempDir(t);
  const attachments=[{reference:{attachmentId:'sha256:current'},payload:{data:'exact body'}}];
  await writeModelBackup(dir,record('cm_housing',{revision:43,features:['Mirror1']}),{attachments});
  const before=await readdir(join(dir,'cm_housing'));
  const result=await writeModelBackup(dir,record('cm_housing',{revision:26,features:['Thread']}));
  assert.equal(result.stale,true);
  assert.equal((await readModelBackup(dir,'cm_housing')).revision,43);
  assert.deepEqual(await readModelBackupAttachments(dir,'cm_housing'),attachments);
  assert.deepEqual(await readdir(join(dir,'cm_housing')),before);
});

test("keys that could escape the folder or hide a file are refused", async (t) => {
  const dir = await tempDir(t);
  for (const key of ["../evil", ".hidden", "a/b", "a\\b", "", "x".repeat(121), null, 7]) {
    assert.equal(validBackupKey(key), false, String(key));
    await assert.rejects(writeModelBackup(dir, { key, name: "x" }), /invalid model key|model record required/);
  }
  assert.equal(await readModelBackup(dir, "../evil"), null);
  assert.deepEqual(await readdir(dir), [], "nothing was written for any bad key");
});

test("exact-CAD attachments are stored beside the record and come back with it", async (t) => {
  const dir = await tempDir(t);
  const attachments = [{ reference: { attachmentId: "sha256:" + "a".repeat(64) }, payload: { data: "AAEC" } }];
  await writeModelBackup(dir, record("cm_step"), { attachments });
  assert.deepEqual(await readModelBackupAttachments(dir, "cm_step"), attachments);
  const [meta] = await listModelBackups(dir);
  assert.equal(meta.attachments, 1);
  // A later save with the same record still fills in attachments that were missing.
  const dir2 = await tempDir(t);
  await writeModelBackup(dir2, record("cm_step"));
  await writeModelBackup(dir2, record("cm_step"), { attachments });
  assert.deepEqual(await readModelBackupAttachments(dir2, "cm_step"), attachments);
});

test("the client sends only changed models and never throws without a server", async () => {
  const sent = new Map(), calls = [];
  const ok = async (url, init) => {
    calls.push(JSON.parse(init.body));
    const models = JSON.parse(init.body).models;
    return { ok: true, json: async () => ({ results: models.map((m) => ({ key: m.key, written: true })) }) };
  };
  const library = [record("cm_a"), record("cm_b")];
  assert.deepEqual(await backupModels(library, { fetch: ok, sent }), { sent: 2, failed: 0 });
  assert.deepEqual(await backupModels(library, { fetch: ok, sent }), { sent: 0 }, "nothing changed");
  library[1] = record("cm_b", { revision: 2 });
  assert.deepEqual(await backupModels(library, { fetch: ok, sent }), { sent: 1, failed: 0 });
  assert.deepEqual(calls[1].models.map((m) => m.key), ["cm_b"]);

  const down = async () => { throw new TypeError("Failed to fetch"); };
  const fresh = new Map();
  const result = await backupModels(library, { fetch: down, sent: fresh });
  assert.equal(result.sent, 0);
  assert.equal(fresh.size, 0, "a failed backup is retried at the next save");
  assert.equal(await fetchDiskBackup("cm_a", { fetch: down }), null);
});

test("attachments are gathered per changed model and a failing hook still backs the record up", async () => {
  let body = null;
  const capture = async (url, init) => {
    body = JSON.parse(init.body);
    return { ok: true, json: async () => ({ results: body.models.map((m) => ({ key: m.key, written: true })) }) };
  };
  await backupModels([record("cm_step"), record("cm_plain")], {
    fetch: capture, sent: new Map(),
    attachmentsFor: async (model) => {
      if (model.key === "cm_plain") throw new Error("attachment store unavailable");
      return [{ reference: { attachmentId: "sha256:" + "b".repeat(64) }, payload: {} }];
    },
  });
  assert.deepEqual(body.models.map((m) => m.key), ["cm_step", "cm_plain"]);
  assert.deepEqual(Object.keys(body.attachments), ["cm_step"]);
});

test("signatures change with content and missing models are found by key", () => {
  assert.notEqual(backupSignature('{"r":1}'), backupSignature('{"r":2}'));
  assert.equal(pendingModelBackups([record("cm_a")], new Map([["cm_a", backupSignature(JSON.stringify(record("cm_a")))]])).length, 0);
  const backups = [{ key: "cm_lenscap", name: "LENSCAP" }, { key: "cm_housing", name: "HOUSING" }];
  assert.deepEqual(missingFromLibrary(backups, [{ key: "cm_housing" }]).map((b) => b.key), ["cm_lenscap"]);
  assert.deepEqual(missingFromLibrary(backups, []).length, 2);
});

test("the modeler mirrors changed library records and restores without overwriting", async () => {
  const source = await readFile(new URL("../js/modeler.js", import.meta.url), "utf8");
  const saveLib = source.slice(source.indexOf("async function saveLib("), source.indexOf("function loadAssemblies("));
  assert.match(saveLib, /mirrorLibraryToDisk\(options\.mode==="merge" \? result\.puts : \[records\]\)/, "saveLib mirrors only records changed in this tab");
  assert.match(source, /function initializeModelLibrary[\s\S]*?mirrorLibraryToDisk\(modelLibraryCache\);\r?\n\}/, "models already present get a copy at load");
  const restore = source.slice(source.indexOf("async function restoreDiskBackups("), source.indexOf("function appendDiskBackupNote("));
  assert.match(restore, /conflict:"skip"/, "restore only adds missing models");
  assert.match(restore, /installAttachmentRecords\(backup\.attachments\)[\s\S]*records\.push\(backup\.model\)/, "attachments are installed before the record");
  const partLib = source.slice(source.indexOf("function refreshLib("));
  assert.match(partLib, /libraryTransferButtons\(host\);\r?\n  appendLegacyDraftRecovery\(host\);\r?\n  appendDiskBackupNote\(host\);\r?\n  var lib = loadLib\(\);/, "recovery and the backup note sit above an empty library");
});

async function freePort() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}
async function waitForServer(port) {
  for (let i = 0; i < 80; i++) {
    try { if ((await fetch(`http://127.0.0.1:${port}/api/ping`)).ok) return; } catch (_) {}
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("relay did not start");
}

test("the relay backs up, lists and returns models, local-only and never over static HTTP", async (t) => {
  const port = await freePort(), dir = await tempDir(t);
  const identityFile = join(tmpdir(), `home3d-model-backup-${process.pid}-${port}.json`);
  const child = spawn(process.execPath, ["server/relay.mjs", String(port)], {
    cwd: new URL("..", import.meta.url),
    env: { ...process.env, HOME3D_MODEL_BACKUP_DIR: dir, HOME3D_IDENTITIES_FILE: identityFile },
    stdio: "ignore",
  });
  t.after(async () => { child.kill("SIGTERM"); await rm(identityFile, { force: true }); });
  await waitForServer(port);
  const base = `http://127.0.0.1:${port}/api/model-backup`;
  const attachments = { cm_lenscap: [{ reference: { attachmentId: "sha256:" + "c".repeat(64) }, payload: { data: "AA" } }] };

  const post = await fetch(base, {
    method: "POST", headers: { "Content-Type": "application/json", Origin: `http://127.0.0.1:${port}` },
    body: JSON.stringify({ models: [record("cm_lenscap", { revision: 15 }), { key: "../x" }], attachments }),
  });
  assert.equal(post.status, 200);
  const { results } = await post.json();
  assert.equal(results[0].written, true);
  assert.match(results[1].error, /invalid model key/);

  const list = await (await fetch(base)).json();
  assert.deepEqual(list.models.map((m) => [m.key, m.revision, m.attachments]), [["cm_lenscap", 15, 1]]);
  const one = await (await fetch(base + "?key=cm_lenscap")).json();
  assert.equal(one.model.revision, 15);
  assert.deepEqual(one.attachments, attachments.cm_lenscap);
  assert.equal((await fetch(base + "?key=missing_key")).status, 404);
  assert.equal((await fetch(base + "?key=" + encodeURIComponent("../etc"))).status, 400);

  const foreign = await fetch(base, {
    method: "POST", headers: { "Content-Type": "application/json", Origin: "https://evil.example" },
    body: JSON.stringify({ models: [record("cm_evil")] }),
  });
  assert.equal(foreign.status, 403, "another site cannot write backups");
  assert.equal((await fetch(base, { headers: { Origin: "https://evil.example" } })).status, 403, "or list them");
  assert.equal((await fetch(base, { method: "DELETE" })).status, 405);
  assert.equal((await fetch(`http://127.0.0.1:${port}/.model-backups/cm_lenscap/latest.json`)).status, 404,
    "the default backup folder is a dot-folder the static server refuses");
});
