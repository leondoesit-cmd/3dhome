// Install a pinned, checksum-verified local model. No Python or cloud API key.
import {mkdir,readFile,writeFile,access,rename,unlink} from 'node:fs/promises';
import {createReadStream,createWriteStream} from 'node:fs';
import {createHash,randomBytes} from 'node:crypto';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {join,dirname} from 'node:path';

if(process.platform!=='win32')throw new Error('This portable runtime setup targets Windows.');
const root=join(dirname(fileURLToPath(import.meta.url)),'..'),dir=join(root,'.local','blueprint-vision');
await mkdir(dir,{recursive:true});
const quality=!process.argv.includes('--light'),legacy8b=process.argv.includes('--legacy-8b'),legacy4b=process.argv.includes('--legacy-4b');
const gemma=process.argv.includes('--gemma-e4b')?'e4b':process.argv.includes('--gemma-12b')?'12b':null;
const files=[
  {name:'runtime.zip',url:'https://github.com/ggml-org/llama.cpp/releases/download/b11669/llama-b11669-bin-win-vulkan-x64.zip',sha:'2c07574e7bde71321cb785282b20cc821e951132149eeceeea32ddebdbf0598e'},
  ...(gemma==='e4b'?[
  {name:'gemma-4-E4B-it-Q4_K_M.gguf',url:'https://huggingface.co/unsloth/gemma-4-E4B-it-GGUF/resolve/bfc15c382204943c3a8fff0c750b94ae2364d7a3/gemma-4-E4B-it-Q4_K_M.gguf',sha:'85a896a047553e842f25297ee5b031d64ff30147d9c4af17b1e4b394cd1fab87'},
  {name:'gemma-4-E4B-it-mmproj-F16.gguf',url:'https://huggingface.co/unsloth/gemma-4-E4B-it-GGUF/resolve/bfc15c382204943c3a8fff0c750b94ae2364d7a3/mmproj-F16.gguf',sha:'ddf46c21d7078e95338cfc22306b19b276a29a5ad089023449dd54d4b6170a51'},
  ]:gemma==='12b'?[
  {name:'gemma-4-12b-it-Q4_K_M.gguf',url:'https://huggingface.co/unsloth/gemma-4-12b-it-GGUF/resolve/fc034cfff751157913579611efad8462ac1be606/gemma-4-12b-it-Q4_K_M.gguf',sha:'0a270ec9fe6b34f4a0d33992b6135117b484ebc4766ab76b51d4ae8c457e4c42'},
  {name:'gemma-4-12b-it-mmproj-F16.gguf',url:'https://huggingface.co/unsloth/gemma-4-12b-it-GGUF/resolve/fc034cfff751157913579611efad8462ac1be606/mmproj-F16.gguf',sha:'91f086971e56d7a7d8d39e271873fccdb49541bd259d6e02c401a4f1cb7a219e'},
  ]:quality&&!legacy8b&&!legacy4b?[
  {name:'Qwen3.5-9B-Q4_K_M.gguf',url:'https://huggingface.co/unsloth/Qwen3.5-9B-GGUF/resolve/3885219b6810b007914f3a7950a8d1b469d598a5/Qwen3.5-9B-Q4_K_M.gguf',sha:'03b74727a860a56338e042c4420bb3f04b2fec5734175f4cb9fa853daf52b7e8'},
  {name:'mmproj-Qwen3.5-9B-F16.gguf',url:'https://huggingface.co/unsloth/Qwen3.5-9B-GGUF/resolve/3885219b6810b007914f3a7950a8d1b469d598a5/mmproj-F16.gguf',sha:'f70dc3509053962b0d0d3ee8a7eacebf5d60aa560cad78254ae8698516ae029f'},
  ]:!legacy8b&&!legacy4b?[
  {name:'Qwen3.5-4B-Q4_K_M.gguf',url:'https://huggingface.co/unsloth/Qwen3.5-4B-GGUF/resolve/e87f176479d0855a907a41277aca2f8ee7a09523/Qwen3.5-4B-Q4_K_M.gguf',sha:'00fe7986ff5f6b463e62455821146049db6f9313603938a70800d1fb69ef11a4'},
  {name:'mmproj-Qwen3.5-4B-F16.gguf',url:'https://huggingface.co/unsloth/Qwen3.5-4B-GGUF/resolve/e87f176479d0855a907a41277aca2f8ee7a09523/mmproj-F16.gguf',sha:'cd88edcf8d031894960bb0c9c5b9b7e1fea6ebee02b9f7ce925a00d12891f864'},
  ]:legacy8b?[
  {name:'Qwen3VL-8B-Instruct-Q4_K_M.gguf',url:'https://huggingface.co/Qwen/Qwen3-VL-8B-Instruct-GGUF/resolve/f982a07559d4a2f6c8744d840bf6fccab30eea96/Qwen3VL-8B-Instruct-Q4_K_M.gguf',sha:'67d1659bfe71b89d50b45a4ad1a9e5b997e5bb16ce5da66a6a6167abd569e9e2'},
  {name:'mmproj-Qwen3VL-8B-Instruct-Q8_0.gguf',url:'https://huggingface.co/Qwen/Qwen3-VL-8B-Instruct-GGUF/resolve/f982a07559d4a2f6c8744d840bf6fccab30eea96/mmproj-Qwen3VL-8B-Instruct-Q8_0.gguf',sha:'c6ba85508d82f42590e6eb77d5340369ab6fecf107a7561d809523d8aa5f3bfd'},
  ]:[
  {name:'Qwen3VL-4B-Instruct-Q4_K_M.gguf',url:'https://huggingface.co/Qwen/Qwen3-VL-4B-Instruct-GGUF/resolve/1cd86afb9a95c410a6038ab3b40d8b578c892266/Qwen3VL-4B-Instruct-Q4_K_M.gguf',sha:'66358cb18bb6b3b1b6675aa412c7a88ef01d228f481184d13668e5201c730a0a'},
  {name:'mmproj-Qwen3VL-4B-Instruct-Q8_0.gguf',url:'https://huggingface.co/Qwen/Qwen3-VL-4B-Instruct-GGUF/resolve/1cd86afb9a95c410a6038ab3b40d8b578c892266/mmproj-Qwen3VL-4B-Instruct-Q8_0.gguf',sha:'30ba2c7dd3127a4561b6cba9d13d0f711c91bdb38742e2f56d73c8cb596bd06d'},
  ]),
];
async function digest(path){const hash=createHash('sha256');for await(const chunk of createReadStream(path))hash.update(chunk);return hash.digest('hex');}
for(const file of files){
  const path=join(dir,file.name);
  let correct=false;try{correct=await digest(path)===file.sha;}catch{}
  if(correct){console.log(file.name+': verified');continue;}
  console.log('Downloading '+file.name+' (local vision assets)…');
  const response=await fetch(file.url);if(!response.ok)throw new Error('Download failed: '+response.status);
  const temp=path+'.partial';
  try{
    await pipeline(Readable.fromWeb(response.body),createWriteStream(temp));
    if(await digest(temp)!==file.sha)throw new Error('Checksum mismatch: '+file.name);
    await rename(temp,path);
  }catch(error){await unlink(temp).catch(()=>{});throw error;}
}
const runtime=join(dir,'runtime');await mkdir(runtime,{recursive:true});
// These fixed workspace paths contain no user-supplied shell fragments.
try{await access(join(runtime,'llama-server.exe'));}catch{
  execFileSync(join(process.env.SystemRoot||'C:/Windows','System32','tar.exe'),['-xf',join(dir,'runtime.zip'),'-C',runtime],{windowsHide:true,stdio:'inherit'});
}
try{await access(join(dir,'api-key'));}catch{await writeFile(join(dir,'api-key'),randomBytes(32).toString('hex'),{mode:0o600});}
await writeFile(join(dir,'installation.json'),JSON.stringify({runtime:'llama.cpp b11669',model:files[1].name.replace(/\.gguf$/,''),files},null,2));
console.log('Local blueprint vision is ready. npm start starts it on demand. Keep .local private and out of Git.');
