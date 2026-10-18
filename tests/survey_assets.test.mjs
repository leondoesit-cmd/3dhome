import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir,access} from 'node:fs/promises';

test('offline manifest contains existing assets and every application JavaScript module',async()=>{
  const root=new URL('../',import.meta.url),{assets}=JSON.parse(await readFile(new URL('survey-assets.json',root),'utf8'));
  const inventory=new Set(assets);
  assert.equal(inventory.size,assets.length,'no duplicate cache downloads');
  for(const asset of assets)await access(new URL('.'+asset,root));
  async function checkModules(path){
    for(const entry of await readdir(new URL(path,root),{withFileTypes:true})){
      const next=path+entry.name;
      if(entry.isDirectory())await checkModules(next+'/');
      else if(entry.name.endsWith('.js'))assert.ok(inventory.has('/'+next),'Offline application module missing: '+next);
    }
  }
  await checkModules('js/');
});
