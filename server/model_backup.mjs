// Disk copies of saved ModelForge models.
//
// The model library lives in the browser's IndexedDB, which a browser may clear
// whenever the origin's storage is not persisted. It has been lost that way more
// than once, taking finished models with it. The relay therefore mirrors every
// saved model to disk: the browser posts each changed record after a Save to
// library, and the Library panel can restore what the browser has lost.
//
// Layout, one folder per model key:
//   <dir>/<key>/latest.json                    the newest record
//   <dir>/<key>/<ISO time>-r<revision>.json    earlier versions, newest `keep` kept
//   <dir>/<key>/meta.json                      name, revision, time, size, sha256
// The default folder is ROOT/.model-backups: the static file server refuses any
// path segment that starts with a dot, so backups are never served over HTTP.

import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { createHash, randomBytes } from "node:crypto";
import { join } from "node:path";

export const MODEL_BACKUP_KEEP = 20;

// Library keys look like "cm_mu32mylp". Anything that could climb out of the
// folder or hide a file (leading dot, separators) is refused.
// Windows also maps device names (nul, con, com1…, with or without an
// extension) to devices and drops a trailing dot ("abc." is "abc"), so those
// are refused too: such a key could not hold, or would alias, a folder.
export function validBackupKey(key) {
  return typeof key === "string" && /^[A-Za-z0-9_-][A-Za-z0-9_.-]{0,119}$/.test(key) &&
    !key.endsWith(".") && !/^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])(\.|$)/i.test(key);
}

async function writeAtomic(file, text) {
  const tmp = `${file}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
  await writeFile(tmp, text, "utf8");
  await rename(tmp, file);
}

async function readMeta(keyDir) {
  try { return JSON.parse(await readFile(join(keyDir, "meta.json"), "utf8")); }
  catch (_) { return null; }
}

function versionFiles(names) {
  return names.filter((name) => name.endsWith(".json") && !["latest.json", "meta.json", "attachments.json"].includes(name)).sort();
}

// `attachments` are the model's exact-CAD payloads ({ reference, payload }, see
// js/core/attachment_store.js). They live in a separate browser database that
// a wipe clears as well, so they are stored beside the record they belong to.
// They are content-addressed from the record, so they change only with it.
export async function writeModelBackup(dir, record, options = {}) {
  if (!record || typeof record !== "object" || Array.isArray(record)) throw new Error("model record required");
  const key = record.key;
  if (!validBackupKey(key)) throw new Error("invalid model key");
  const keep = Math.max(1, Number(options.keep) || MODEL_BACKUP_KEEP);
  const now = Number(options.now) || Date.now();
  const text = JSON.stringify(record);
  const sha256 = createHash("sha256").update(text).digest("hex");
  const keyDir = join(dir, key);
  await mkdir(keyDir, { recursive: true });
  const attachments = Array.isArray(options.attachments) ? options.attachments : [];
  const prior = await readMeta(keyDir);
  const revision = Number.isFinite(Number(record.revision)) ? Math.trunc(Number(record.revision)) : 0;
  // A restored browser can mirror an older library at startup. Preserve the
  // newer saved model and its matching exact attachments on disk.
  if (prior && revision < prior.revision) return { key, written: false, stale: true, revision: prior.revision };
  // A save that changed nothing is not a new version.
  if (prior && prior.sha256 === sha256) {
    if (attachments.length && !prior.attachments) {
      await writeAtomic(join(keyDir, "attachments.json"), JSON.stringify(attachments));
      await writeAtomic(join(keyDir, "meta.json"), JSON.stringify({ ...prior, attachments: attachments.length }));
    }
    return { key, written: false };
  }

  const stamp = new Date(now).toISOString().replace(/[:.]/g, "-");
  const version = `${stamp}-r${revision}.json`;
  await writeAtomic(join(keyDir, version), text);
  await writeAtomic(join(keyDir, "latest.json"), text);
  if (attachments.length) await writeAtomic(join(keyDir, "attachments.json"), JSON.stringify(attachments));
  else await rm(join(keyDir, "attachments.json"), { force: true });

  const versions = versionFiles(await readdir(keyDir));
  for (const old of versions.slice(0, Math.max(0, versions.length - keep))) {
    await rm(join(keyDir, old), { force: true });
  }
  const meta = {
    key,
    name: typeof record.name === "string" ? record.name.slice(0, 200) : key,
    revision,
    savedAt: now,
    bytes: Buffer.byteLength(text),
    sha256,
    versions: Math.min(versions.length, keep),
    attachments: attachments.length,
  };
  await writeAtomic(join(keyDir, "meta.json"), JSON.stringify(meta));
  return { key, written: true, version };
}

export async function listModelBackups(dir) {
  let names;
  try { names = await readdir(dir); } catch (_) { return []; }
  const out = [];
  for (const name of names) {
    if (!validBackupKey(name)) continue;
    const keyDir = join(dir, name);
    try { if (!(await stat(keyDir)).isDirectory()) continue; } catch (_) { continue; }
    const meta = await readMeta(keyDir);
    if (meta && meta.key === name) out.push(meta);
  }
  return out.sort((a, b) => b.savedAt - a.savedAt);
}

export async function readModelBackup(dir, key) {
  if (!validBackupKey(key)) return null;
  try { return JSON.parse(await readFile(join(dir, key, "latest.json"), "utf8")); }
  catch (_) { return null; }
}

export async function readModelBackupAttachments(dir, key) {
  if (!validBackupKey(key)) return [];
  try {
    const list = JSON.parse(await readFile(join(dir, key, "attachments.json"), "utf8"));
    return Array.isArray(list) ? list : [];
  } catch (_) { return []; }
}
