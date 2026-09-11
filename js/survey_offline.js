export async function prepareSurveyOffline(){
  if(!window.isSecureContext||!navigator.serviceWorker)throw new Error('Offline preparation requires HTTPS or localhost.');
  await navigator.serviceWorker.register('/survey-sw.js',{scope:'/'});
  const registration=await navigator.serviceWorker.ready;
  const worker=registration.active;if(!worker)throw new Error('Offline worker is not ready.');
  await new Promise((resolve,reject)=>{
    const channel=new MessageChannel();
    const timeout=setTimeout(()=>{channel.port1.close();reject(new Error('Offline preparation timed out.'));},180000);
    channel.port1.onmessage=event=>{clearTimeout(timeout);channel.port1.close();event.data.ok?resolve():reject(new Error(event.data.error||'Offline preparation failed.'));};
    worker.postMessage({type:'prepare'},[channel.port2]);
  });
}
