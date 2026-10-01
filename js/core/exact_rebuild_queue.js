// A reset detaches obsolete tasks immediately. Their eventual completion is
// still observed, but cannot hold a newly opened document behind the old queue.
export function createExactRebuildQueue() {
  let pending=null,generation=0;
  return {
    reset(){generation++;pending=null;},
    async run(work){
      const started=generation;
      const current=()=>started===generation;
      const job=(pending || Promise.resolve()).catch(()=>{}).then(()=>current()?work(current):null);
      pending=job;
      try{return await job;}finally{if(pending===job)pending=null;}
    },
  };
}
