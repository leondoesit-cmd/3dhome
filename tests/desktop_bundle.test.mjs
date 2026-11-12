import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, readdir, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { bundleDesktopWeb } from '../tools/desktop_bundle.mjs';
import { generateMaterialManifest } from '../tools/material_manifest.mjs';

const pointer = 'version https://git-lfs.github.com/spec/v1\noid sha256:0123456789\nsize 999\n';

async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'desktop-bundle-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const put = async (name, bytes) => {
    await mkdir(path.dirname(path.join(root, name)), { recursive: true });
    await writeFile(path.join(root, name), bytes);
  };
  const paths = { files: ['index.html', 'manifest.json'], dirs: ['js', 'assets'] };
  await put('server/public_paths.json', JSON.stringify(paths));
  await put('index.html', '<html>fixture</html>\r\n');
  await put('manifest.json', '{"name":"fixture"}\n');
  await put('js/nested/module.js', new Uint8Array([0, 1, 128, 255]));
  await put('assets/icon #%.svg', '<svg/>');
  await put('assets/materials/wood/color.webp', pointer);
  return { root, out: path.join(root, 'output'), publicPaths: path.join(root, 'server/public_paths.json'), paths, put };
}

async function snapshot(root, relative = '') {
  const result = {};
  for (const name of (await readdir(path.join(root, relative))).sort()) {
    const key = relative ? `${relative}/${name}` : name;
    if ((await stat(path.join(root, key))).isDirectory()) Object.assign(result, await snapshot(root, key));
    else result[key] = await readFile(path.join(root, key));
  }
  return result;
}

test('copies only listed public bytes, excluding materials and private names', async t => {
  const f = await fixture(t);
  // Even a mistaken allow-list entry cannot publish private paths.
  f.paths.dirs.push('server', 'SeRvEr', '.hidden', 'PUBLIC~1');
  f.paths.files.push('.env', 'SECRET~2.txt');
  await f.put('server/public_paths.json', JSON.stringify(f.paths));
  for (const name of ['.env', '.hidden/key', 'server/key', 'SeRvEr/key', 'PUBLIC~1/key', 'SECRET~2.txt', 'js/.env', 'js/.hidden/key', 'assets/TEXTUR~1/file', 'unlisted/secret', 'private.txt']) {
    await f.put(name, pointer);
  }
  const summary = await bundleDesktopWeb(f);
  const actual = await snapshot(f.out);
  assert.deepEqual(Object.keys(actual).sort(), ['assets/icon #%.svg', 'index.html', 'js/nested/module.js', 'manifest.json']);
  for (const [name, bytes] of Object.entries(actual)) assert.deepEqual(bytes, await readFile(path.join(f.root, name)), name);
  assert.equal(summary.files, 4);
  assert.equal(summary.bytes, Object.values(actual).reduce((sum, bytes) => sum + bytes.length, 0));
  assert.equal(summary.entries.find(entry => entry.name === 'assets').files, 1);
  assert.deepEqual(summary.entries.map(entry => entry.name), summary.entries.map(entry => entry.name).sort());
});

test('re-run is byte-identical and removes all previous output', async t => {
  const f = await fixture(t);
  const first = await bundleDesktopWeb(f);
  const before = await snapshot(f.out);
  await f.put('output/stale/nested.txt', 'old build');
  assert.deepEqual(await bundleDesktopWeb(f), first);
  assert.deepEqual(await snapshot(f.out), before);
});

test('an LFS pointer aborts after earlier copies and leaves no partial or old output', async t => {
  const f = await fixture(t);
  await bundleDesktopWeb(f);
  await f.put('js/zzz-pointer.wasm', pointer);
  await assert.rejects(bundleDesktopWeb(f), /Git LFS pointer refused: js\/zzz-pointer.wasm/);
  await assert.rejects(stat(f.out), { code: 'ENOENT' });
  await f.put('js/zzz-pointer.wasm', new Uint8Array([0, 97, 115, 109]));
  assert.equal((await bundleDesktopWeb(f)).files, 5);
});

test('directory aliases cannot pull private bytes into the bundle', async t => {
  const f = await fixture(t);
  await f.put('.private/key', 'secret');
  await symlink(path.join(f.root, '.private'), path.join(f.root, 'js/alias'), 'junction');
  await assert.rejects(bundleDesktopWeb(f), /symlink refused: js\/alias/);
  await assert.rejects(stat(f.out), { code: 'ENOENT' });
});

test('unsafe output and non-top-level public entries are refused without deleting input', async t => {
  const f = await fixture(t);
  await assert.rejects(bundleDesktopWeb({ ...f, out: f.root }), /output must be a directory inside/);
  await assert.rejects(bundleDesktopWeb({ ...f, out: path.join(f.root, 'js/generated') }), /overlaps public input/);
  await assert.rejects(bundleDesktopWeb({ ...f, publicPaths: { files: ['../index.html'], dirs: [] } }), /top-level name/);
  await symlink(path.join(f.root, 'js'), path.join(f.root, 'alias'), 'junction');
  await assert.rejects(bundleDesktopWeb({ ...f, out: path.join(f.root, 'alias/output') }), /ordinary directories/);
  assert.equal(await readFile(path.join(f.root, 'index.html'), 'utf8'), '<html>fixture</html>\r\n');
});

test('shared material generator writes real sizes and hashes and keeps its pointer refusal', async t => {
  const f = await fixture(t);
  const out = path.join(f.root, 'material-manifest.json');
  await assert.rejects(generateMaterialManifest({ root: f.root, out }), /Git LFS pointer refused/);
  await assert.rejects(stat(out), { code: 'ENOENT' });
  const bytes = new Uint8Array([1, 255, 0, 42]);
  await f.put('assets/materials/wood/color.webp', bytes);
  const manifest = await generateMaterialManifest({ root: f.root, out });
  assert.deepEqual(manifest, { version: 1, files: { 'assets/materials/wood/color.webp': { bytes: 4, sha256: createHash('sha256').update(bytes).digest('hex') } } });
  const first = await readFile(out);
  await generateMaterialManifest({ root: f.root, out });
  assert.deepEqual(await readFile(out), first);
});
