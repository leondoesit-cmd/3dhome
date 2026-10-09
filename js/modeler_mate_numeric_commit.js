// Some input producers update a field without the browser's change event.
// Blur and Enter use the same commit; change→blur and Enter→blur commit once.
export function bindMateNumericCommit(input,onCommit) {
  let committed=input.value,committing=false;
  const commit=()=>{
    if(committing || input.value===committed)return;
    committing=true;
    try{onCommit();}
    finally{committed=input.value;committing=false;}
  };
  input.addEventListener('change',commit);
  input.addEventListener('blur',commit);
  input.addEventListener('keydown',event=>{
    if(event.key!=='Enter')return;
    event.preventDefault();event.stopPropagation();commit();
  });
  return commit;
}
