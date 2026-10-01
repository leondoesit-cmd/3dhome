// Contact intent annotates a measured overlap; it never removes that overlap.
const pair = hit => [String(hit.a),String(hit.b)].sort();
const rounded = value => Math.round(Number(value)*1e7)/1e7;
function measurementSignature(hit) {
  return JSON.stringify({volume:rounded(hit.volume),bounds:hit.bounds ? Object.fromEntries(Object.keys(hit.bounds).sort().map(key=>[key,rounded(hit.bounds[key])])) : null});
}
export function expectedContactFor(assembly,hit) {
  if (!hit.exact || !(Number(hit.volume)>0)) return null;
  const ids=pair(hit);
  return (assembly.expectedContacts || []).find(record=>record.a===ids[0] && record.b===ids[1] && record.measurement===measurementSignature(hit)) || null;
}
export function recordExpectedContact(assembly,hit,reason) {
  const text=String(reason || '').trim();
  if (!text) throw new Error('Describe the intended contact before recording it');
  if (!hit.exact || !Number.isFinite(hit.volume) || hit.volume<=0) throw new Error('Expected contact needs a measured native overlap');
  const [a,b]=pair(hit);
  assembly.expectedContacts=(assembly.expectedContacts || []).filter(record=>record.a!==a || record.b!==b);
  const record={a,b,reason:text,measurement:measurementSignature(hit),volume:hit.volume,bounds:hit.bounds ? {...hit.bounds} : null};
  assembly.expectedContacts.push(record);
  return record;
}
export function removeExpectedContact(assembly,hit) {
  const [a,b]=pair(hit);
  assembly.expectedContacts=(assembly.expectedContacts || []).filter(record=>record.a!==a || record.b!==b);
}
export function contactAuditSummary(assembly,hits) {
  const rawExact=hits.filter(hit=>hit.exact).length;
  const declared=hits.filter(hit=>expectedContactFor(assembly,hit)).length;
  return {rawExact,declared,unreviewed:rawExact-declared,boundsOnly:hits.length-rawExact};
}
