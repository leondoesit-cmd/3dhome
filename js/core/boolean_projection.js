// Several original projections may now name the same Boolean result. Keep
// one display/mass row for that result, while leaving all source records in
// the document so rollback, suppression and failed rebuilds can restore them.
export function deduplicateBooleanProjections(parts,document,headOf) {
  const features=new Map((document.features || []).map(feature=>[feature.id,feature])),seen=new Set();
  function hasHealthyBoolean(id,visited=new Set()){
    if(visited.has(id))return false;visited.add(id);
    const feature=features.get(id);
    if(!feature || feature.suppressed || feature.state==='failed')return false;
    if(feature.type==='boolean')return true;
    return (feature.inputs || []).some(input=>hasHealthyBoolean(input,visited));
  }
  return parts.filter(part=>{
    const head=headOf(part,document);
    if(!head || !hasHealthyBoolean(head))return true;
    if(seen.has(head))return false;
    seen.add(head);return true;
  });
}
