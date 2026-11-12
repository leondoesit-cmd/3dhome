// Run from any directory; manifests describe actual LFS objects, never pointers.
import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));

export async function generateMaterialManifest({ root = repoRoot, out = path.join(root, 'desktop/material-manifest.json') } = {}) {
  const files = {};
  async function walk(relative) {
    const entries = await readdir(path.join(root, relative), { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
      const name = `${relative}/${entry.name}`;
      if (entry.isSymbolicLink()) throw new Error(`Material symlink refused: ${name}`);
      if (entry.isDirectory()) await walk(name);
      else if (entry.isFile()) {
        const bytes = await readFile(path.join(root, name));
        if (bytes.subarray(0, 64).toString().startsWith('version https://git-lfs')) {
          throw new Error(`Git LFS pointer refused: ${name}. Fetch the real LFS objects before generating the manifest.`);
        }
        files[name] = { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
      }
    }
  }
  await walk('assets/materials');
  const sorted = Object.fromEntries(Object.keys(files).sort().map(key => [key, files[key]]));
  const manifest = { version: 1, files: sorted };
  await writeFile(out, `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const manifest = await generateMaterialManifest();
  console.log(`Material manifest: ${Object.keys(manifest.files).length} files, ${Object.values(manifest.files).reduce((sum, file) => sum + file.bytes, 0)} bytes`);
}
