import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, extname, sep } from 'node:path';
const root=fileURLToPath(new URL('../../',import.meta.url));
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2','.wasm':'application/wasm'};

// Instrument only the test server's response. Production rendering has no
// test hooks. Shader prewarming temporarily changes lighting: prevent it from
// racing captures, and give both captures identical TRAA jitter/depth history.
export async function servePlannerPerformance() {
  const server=createServer(async(req,res)=>{
    try {
      let path=decodeURIComponent(req.url.split('?')[0]);if(path==='/')path='/index.html';
      const file=resolve(root,'.'+path);
      if(!file.startsWith(root.endsWith(sep)?root:root+sep)){res.writeHead(403).end();return;}
      let data=await readFile(file);
      if(path==='/js/view3d.js')data=Buffer.from(data.toString()
        .replace('var PREWARM_IDLE_MS = 3000;', 'var PREWARM_IDLE_MS = 1e12;')
        .replace('requestAnimationFrame(animate);','requestAnimationFrame(animate); if (window.__perfHold) return;')+`
export async function __perfCapture() {
  window.__perfHold=true;
  try {
    await new Promise(resolve=>requestAnimationFrame(resolve));
    traaPass._historyRenderTarget.setSize(1,1);
    traaPass._jitterIndex=0;
    velUniforms.primed=false;
    syncCameraVelocity();syncShadowUpdates(true);syncSelectionOutline();
    for(let i=0;i<32;i++){await new Promise(resolve=>requestAnimationFrame(resolve));syncCameraVelocity();renderScene();}
    return renderer.domElement.toDataURL('image/png');
  } finally {window.__perfHold=false;}
}
`);
      res.writeHead(200,{'content-type':mime[extname(file)]||'application/octet-stream','cache-control':'no-store'}).end(data);
    }catch(error){res.writeHead(404).end(String(error));}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  return {origin:'http://127.0.0.1:'+server.address().port,close:()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();})};
}
