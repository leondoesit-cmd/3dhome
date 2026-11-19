#!/usr/bin/env node
// Generated static resources only; no dependencies or build step for the web app.
import { copyFile, cp, lstat, mkdir, open, readFile, readdir, realpath, rm } from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { safeStaticFile } from '../server/security.mjs';
import { generateMaterialManifest } from './material_manifest.mjs';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;

function refused(relative) {
  const parts = relative.split('/');
  return parts[0].toLowerCase() === 'server'
    || parts.some(part => part.startsWith('.') || /~\d/.test(part))
    || (parts[0].toLowerCase() === 'assets' && parts[1]?.toLowerCase() === 'materials');
}

// Verify the absolute deletion target and every existing ancestor before rm.
// Generated output must be inside root, with no symlink/junction indirection.
async function outputPath(root, out) {
  const target = path.resolve(out);
  const relative = path.relative(root, target);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Bundle output must be a directory inside ${root}: ${target}`);
  }
  let current = root;
  for (const part of relative.split(path.sep)) {
    current = path.join(current, part);
    try {
      const info = await lstat(current);
      if (info.isSymbolicLink() || !info.isDirectory()) {
        throw new Error(`Bundle output must use ordinary directories: ${current}`);
      }
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  return target;
}

/** Copy an allow-listed fixture or checkout, returning sorted per-entry counts. */
export async function bundleDesktopWeb({ root, out, publicPaths = path.join(root, 'server/public_paths.json') }) {
  root = await realpath(root);
  const paths = typeof publicPaths === 'string' ? JSON.parse(await readFile(publicPaths, 'utf8')) : publicPaths;
  if (!Array.isArray(paths.files) || !Array.isArray(paths.dirs)) throw new Error('publicPaths needs files[] and dirs[]');
  for (const name of [...paths.files, ...paths.dirs]) {
    if (typeof name !== 'string' || !name || /[/\\\0:]/.test(name)) {
      throw new Error(`Public entry must be a top-level name: ${name}`);
    }
  }
  out = await outputPath(root, out);
  const outputTop = path.relative(root, out).split(path.sep)[0];
  if ([...paths.files, ...paths.dirs].includes(outputTop)) throw new Error(`Bundle output overlaps public input: ${out}`);
  await rm(out, { recursive: true, force: true });
  const allow = { files: new Set(paths.files), dirs: new Set(paths.dirs) };
  const entries = [];
  async function copy(relative, count, expected) {
    if (refused(relative)) return;
    const source = path.join(root, relative);
    const info = await lstat(source);
    // Refuse links instead of dereferencing them into a distributable snapshot.
    if (info.isSymbolicLink()) throw new Error(`Bundle symlink refused: ${relative}`);
    if (expected && (expected === 'dir' ? !info.isDirectory() : !info.isFile())) {
      throw new Error(`Public ${expected} has the wrong type: ${relative}`);
    }
    if (info.isDirectory()) {
      await mkdir(path.join(out, relative), { recursive: true });
      for (const name of (await readdir(source)).sort(compare)) await copy(`${relative}/${name}`, count);
    } else if (info.isFile()) {
      // Reuse the relay's canonical-path and top-level allow-list checks too.
      const permitted = await safeStaticFile(root, `/${relative.split('/').map(encodeURIComponent).join('/')}`, { allow });
      if (!permitted) return;
      const handle = await open(source, 'r');
      try {
        const prefix = Buffer.alloc(64);
        const { bytesRead } = await handle.read(prefix, 0, prefix.length, 0);
        if (prefix.subarray(0, bytesRead).toString().startsWith('version https://git-lfs')) {
          throw new Error(`Git LFS pointer refused: ${relative}. Fetch the real LFS objects before bundling.`);
        }
      } finally {
        await handle.close();
      }
      await mkdir(path.dirname(path.join(out, relative)), { recursive: true });
      await copyFile(source, path.join(out, relative));
      count.files++;
      count.bytes += info.size;
    } else {
      throw new Error(`Unsupported bundle entry: ${relative}`);
    }
  }
  try {
    await mkdir(out, { recursive: true });
    for (const name of [...new Set([...paths.files, ...paths.dirs])].sort(compare)) {
      const count = { name, files: 0, bytes: 0 };
      await copy(name, count, allow.dirs.has(name) ? 'dir' : 'file');
      entries.push(count);
    }
    return { entries, files: entries.reduce((sum, entry) => sum + entry.files, 0), bytes: entries.reduce((sum, entry) => sum + entry.bytes, 0) };
  } catch (error) {
    await rm(out, { recursive: true, force: true });
    throw error;
  }
}

async function main() {
  if (process.argv.slice(2).some(arg => arg !== '--stage-release')) throw new Error('Usage: node tools/desktop_bundle.mjs [--stage-release]');
  const root = await realpath(repoRoot);
  const out = await outputPath(root, path.join(root, 'desktop/web'));
  const stage = process.argv.includes('--stage-release')
    ? await outputPath(root, path.join(root, 'desktop/src-tauri/target/release/web')) : null;
  if (stage) await rm(stage, { recursive: true, force: true });
  try {
    const summary = await bundleDesktopWeb({ root, out });
    const manifest = await generateMaterialManifest({ root });
    console.log(`Material manifest: ${Object.keys(manifest.files).length} files, ${Object.values(manifest.files).reduce((sum, file) => sum + file.bytes, 0)} bytes (not bundled)`);
    for (const entry of summary.entries) console.log(`${entry.name}: ${entry.files} files, ${entry.bytes} bytes`);
    console.log(`Total: ${summary.files} files, ${summary.bytes} bytes (${(summary.bytes / 1024 / 1024).toFixed(2)} MiB)`);
    if (stage) {
      await cp(out, stage, { recursive: true });
      console.log(`Staged: ${stage}`);
    }
  } catch (error) {
    await rm(out, { recursive: true, force: true });
    if (stage) await rm(stage, { recursive: true, force: true });
    throw error;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(`Desktop bundle failed: ${error.message}`);
    process.exitCode = 1;
  });
}
