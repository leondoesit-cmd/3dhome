// Explicit static inventory. Run after adding browser modules or survey assets.
import { readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, relative } from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const files=['/','/index.html','/survey-sw.js','/manifest.json'];
async function walk(dir){for(const entry of await readdir(dir,{withFileTypes:true})){const path=resolve(dir,entry.name);if(entry.isDirectory())await walk(path);else if(/\.(js|mjs|css|json|wasm|gz|woff2?|ttf|svg|png|webp|jpg)$/i.test(entry.name))files.push('/'+relative(root,path));}}
for(const dir of ['js','css','vendor','uikit','assets'])await walk(resolve(root,dir));
await writeFile(resolve(root,'survey-assets.json'),JSON.stringify({version:1,assets:[...new Set(files)].sort()},null,2)+'\n');
