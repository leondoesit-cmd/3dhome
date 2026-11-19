// Readiness is an HTTP observation, not proof that the child never started.
// Keep network restrictions and real startup failures visible to the caller.
// ~10 s of polling: a loaded full-suite run can take well over the old 1.5 s
// to start a Node child, while a child that exits is still reported at once.
export async function waitForRelay(url,child,{fetchImpl=fetch,attempts=400,delay=()=>new Promise(resolve=>setTimeout(resolve,25))}={}) {
  let probe='no HTTP response';
  for(let i=0;i<attempts;i++){
    if(child?.exitCode!=null || child?.signalCode)throw new Error('Relay exited before readiness: code '+child.exitCode+', signal '+(child.signalCode || 'none'));
    try{
      const response=await fetchImpl(url);
      if(response.ok)return;
      probe='HTTP '+response.status;
    }catch(error){probe=String(error.message || error)+(error.cause?.code?' ('+error.cause.code+')':'');}
    await delay();
  }
  throw new Error('Relay readiness probe failed at '+url+': '+probe+'; child '+(child?.exitCode==null?'has not exited':'exit code '+child.exitCode));
}
