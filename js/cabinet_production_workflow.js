/** Revision-bound review documents and workshop records. No machine qualification is implied. */
import { cabinetProductionParts } from './cabinet_production_parts.js';
import { cabinetSavedJoineryReport } from './cabinet_joinery.js';

export const CABINET_STATIONS = Object.freeze(['cut', 'band', 'drill', 'assemble', 'inspect']);
const clone = value => JSON.parse(JSON.stringify(value));
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  return JSON.stringify(value);
}
function fingerprint(value) {
  const text = canonical(value); let a = 2166136261, b = 5381;
  for (let i = 0; i < text.length; i++) { a = Math.imul(a ^ text.charCodeAt(i), 16777619); b = Math.imul(b, 33) ^ text.charCodeAt(i); }
  return 'rev-' + (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0');
}
function snapshot(items) {
  const sourceItems = clone(items.filter(item => item?.cab));
  sourceItems.forEach(item => { delete item.cab.open; delete item.cab.runtimeState; delete item.runtimeState; });
  sourceItems.sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const manifest = clone(cabinetProductionParts(items));
  const joinery = cabinetSavedJoineryReport(items);
  manifest.joinery = clone(joinery);
  manifest.issues.push(...clone(joinery.issues));
  manifest.parts.forEach(part => { delete part.itemIndex; });
  manifest.parts.sort((a, b) => a.id.localeCompare(b.id));
  return { ...manifest, sourceItems };
}
const nonempty = value => typeof value === 'string' && value.trim().length > 0;

/** Evidence is user supplied; recording a reference does not verify a vendor or qualify a machine. */
export function validateCabinetHardwareEvidence(entries = []) {
  const issues = [];
  if (!Array.isArray(entries)) return ['Hardware evidence must be an array.'];
  const seen = new Set();
  entries.forEach((entry, i) => {
    if (!entry || typeof entry !== 'object') { issues.push(`Hardware evidence ${i + 1} is invalid.`); return; }
    for (const key of ['partId', 'manufacturer', 'sku', 'reference', 'revision', 'verifiedBy']) {
      if (!nonempty(entry[key])) issues.push(`Hardware evidence ${i + 1} requires ${key}.`);
    }
    const key = `${entry.partId}:${entry.sku}`;
    if (seen.has(key)) issues.push(`Duplicate hardware evidence ${key}.`);
    seen.add(key);
  });
  return issues;
}
export function createCabinetProductionJob(items, { jobId = 'cabinet-job', hardwareEvidence = [] } = {}) {
  const manifest = snapshot(items);
  if (!Array.isArray(hardwareEvidence)) throw new Error('Hardware evidence must be an array.');
  const evidence = clone(hardwareEvidence);
  return freeze({ schema: 'modelforge-cabinet-production-job', version: 1, jobId: String(jobId),
    revision: fingerprint({ manifest, hardwareEvidence: evidence }), manifest, hardwareEvidence: evidence,
    status: 'draft', releaseScope: 'review-documents-only', machineReady: false, productionRelease: false,
    review: null, stationRecords: [] });
}
export function cabinetProductionStaleness(job, items) {
  const current = snapshot(items);
  // Exact comparison is authoritative; the compact fingerprint is a human-readable revision identifier.
  return { stale: canonical(current) !== canonical(job.manifest) || job.revision !== fingerprint({ manifest: job.manifest, hardwareEvidence: job.hardwareEvidence }), revision: job.revision,
    currentRevision: fingerprint({ manifest: current, hardwareEvidence: job.hardwareEvidence }) };
}
export function validateCabinetProductionJob(job, items) {
  const issues = [];
  if (!job.manifest.parts.length) issues.push('No cabinet parts are available.');
  if (items && cabinetProductionStaleness(job, items).stale) issues.push('The live design differs from this revision. Create a new job snapshot.');
  issues.push(...validateCabinetHardwareEvidence(job.hardwareEvidence));
  for (const entry of Array.isArray(job.hardwareEvidence) ? job.hardwareEvidence : []) {
    if (!entry || typeof entry !== 'object') continue;
    if (!job.manifest.parts.some(part => part.id === entry.partId)) issues.push(`Hardware evidence references unknown part ${entry.partId}.`);
  }
  for (const issue of job.manifest.issues || []) {
    if (['missing-item-id', 'duplicate-item-id', 'unsupported-geometry', 'layout-failed', 'invalid-edge-allowance', 'edge-datum-mismatch', 'edge-topology-mismatch', 'stale-part-override', 'unsupported-edge-allowance', 'invalid-substrate', 'invalid-rough-allowance', 'stock-datum-stale', 'stock-datum-source', 'stock-datum-offset', 'saved-joinery-stale', 'saved-joinery-invalid'].includes(issue.code)) issues.push(issue.message);
  }
  const ids = new Set();
  for (const part of job.manifest.parts) {
    if (ids.has(part.id)) issues.push(`Duplicate part identifier ${part.id}.`);
    ids.add(part.id);
  }
  return { valid: issues.length === 0, issues, documentIssues: clone(job.manifest.issues || []),
    machineReady: false, productionRelease: false,
    productionBlockers: ['Machine output is simulation/review only; controller, tooling, workholding, hardware and physical first-article qualification are required.'] };
}
export function transitionCabinetProductionJob(job, status, { items, reviewer, evidence, acknowledgedIssues = [] } = {}) {
  if (!['draft', 'checked', 'released'].includes(status)) throw new Error('Unknown job status.');
  if (status === 'draft') return freeze({ ...clone(job), status, review: null });
  if (!items) throw new Error('Live items are required to check revision freshness.');
  const result = validateCabinetProductionJob(job, items);
  if (!result.valid) throw new Error(result.issues.join(' '));
  const requiredIssues = [...new Set((job.manifest.issues || []).map(issue => issue.code))];
  if (!Array.isArray(acknowledgedIssues) || !requiredIssues.every(code => acknowledgedIssues.includes(code))) throw new Error('Explicitly acknowledge each document issue: ' + requiredIssues.join(', '));
  if (!nonempty(reviewer) || !nonempty(evidence)) throw new Error('A reviewer and review evidence are required.');
  if (status === 'released' && job.status !== 'checked') throw new Error('Check the review documents before releasing them.');
  return freeze({ ...clone(job), status, review: { reviewer: reviewer.trim(), evidence: evidence.trim(), acknowledgedIssues: [...acknowledgedIssues], revision: job.revision },
    releaseScope: 'review-documents-only', productionRelease: false, machineReady: false });
}
export function recordCabinetStation(job, { revision, partId, station, operator, note = '', items, skipped = false, skipReason = '', timestamp = new Date().toISOString() } = {}) {
  if (revision !== job.revision) throw new Error('Station record revision does not match the job.');
  if (!items || cabinetProductionStaleness(job, items).stale) throw new Error('Current live items matching this revision are required.');
  if (!job.manifest.parts.some(part => part.id === partId)) throw new Error('Unknown part identifier.');
  if (!nonempty(operator)) throw new Error('Station operator is required.');
  if (skipped && (!['band', 'drill'].includes(station) || !nonempty(skipReason))) throw new Error('Only band/drill may be skipped with an explicit applicability reason.');
  if (!nonempty(timestamp) || !Number.isFinite(Date.parse(timestamp))) throw new Error('A valid station timestamp is required.');
  const index = CABINET_STATIONS.indexOf(station);
  if (index < 0) throw new Error('Unknown station.');
  const previous = job.stationRecords.filter(record => record.partId === partId && record.revision === revision);
  if (previous.length !== index || previous.some((record, i) => record.station !== CABINET_STATIONS[i])) throw new Error('Complete stations in order: ' + CABINET_STATIONS.join(', ') + '.');
  return freeze({ ...clone(job), stationRecords: [...clone(job.stationRecords), { revision, partId, station,
    operator: operator.trim(), note: String(note), skipped: !!skipped, skipReason: String(skipReason), timestamp, scope: 'operator-record-only' }] });
}
const grainLabel = part => part.grain === false ? 'Non-directional' : part.grain === true ? 'Directional; see along/across grain dimensions' : part.grain || 'Unspecified';
function csv(value) {
  let text = value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
  if (/^[\s]*[=+@-]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}
function html(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }
export function cabinetProductionCSV(job) {
  const rows = [['Document scope', 'Job', 'Revision', 'Part ID', 'Cabinet ID', 'Role', 'Material', 'Finished length mm', 'Finished width mm', 'Thickness mm', 'Grain', 'Edges', 'Substrate', 'Rough size']];
  for (const p of job.manifest.parts) rows.push(['REVIEW ONLY — NOT PRODUCTION RELEASED', job.jobId, job.revision, p.id, p.itemId, p.role, p.material,
    p.finished?.length, p.finished?.width, p.finished?.thickness, grainLabel(p), p.edges || 'Unspecified', p.substrate || 'Unspecified', p.rough || 'Unspecified']);
  return rows.map(row => row.map(csv).join(',')).join('\r\n');
}
export function cabinetProductionHTML(job, { document = 'labels' } = {}) {
  if (!['labels', 'traveler'].includes(document)) throw new Error('Unknown production document.');
  const cards = job.manifest.parts.map(p => {
    const records = job.stationRecords.filter(r => r.partId === p.id);
    return `<article><h2>${html(p.id)}</h2><p>Cabinet: ${html(p.itemId)} · ${html(p.role)}</p><p>Material: ${html(p.material)}<br>Finished: ${html(p.finished?.length)} × ${html(p.finished?.width)} × ${html(p.finished?.thickness)} mm<br>Grain: ${html(grainLabel(p))}<br>Edges: ${html(p.edges ? JSON.stringify(p.edges) : 'Unspecified')}<br>Datum: ${html(p.datum ? JSON.stringify(p.datum) : 'Unspecified — verify against drilling setup')}</p><p>Revision: ${html(job.revision)}</p>${document === 'traveler' ? `<table><tr><th>Station</th><th>Operator / record</th></tr>${CABINET_STATIONS.map(s => { const r = records.find(v => v.station === s); return `<tr><td>${html(s)}</td><td>${r ? html((r.imported ? 'IMPORTED, UNVERIFIED — ' : '') + r.operator + ' — ' + r.timestamp + ' — ' + (r.skipped ? 'SKIPPED: ' + r.skipReason : r.note)) : '________________'}</td></tr>`; }).join('')}</table>` : ''}<strong>REVIEW ONLY — NOT PRODUCTION RELEASED</strong></article>`;
  }).join('');
  return `<!doctype html><html lang="en"><meta charset="utf-8"><title>${html(job.jobId)} ${html(document)}</title><style>body{font:14px sans-serif;margin:24px}article{border:1px solid #444;padding:16px;margin:12px 0;break-inside:avoid}h2{font-size:18px;overflow-wrap:anywhere}p,td,pre{overflow-wrap:anywhere}pre{white-space:pre-wrap}strong{color:#900}table{border-collapse:collapse;width:100%;margin:12px 0}th,td{border:1px solid #888;padding:7px;text-align:left}@media print{body{margin:0}}</style><body><h1>${html(job.jobId)} — ${document === 'labels' ? 'Part labels' : 'Assembly travelers'}</h1><p>Status: ${html(job.status)} · Release scope: review documents only. Dimensions are finished sizes; rough/substrate allowances require verification.</p>${cards}<h2>Document issues</h2><pre>${html(JSON.stringify(job.manifest.issues || [], null, 2))}</pre></body></html>`;
}

/** Imported files are archival evidence only until freshly checked against the live design. */
export function importCabinetProductionJob(text) {
  const value = typeof text === 'string' ? JSON.parse(text) : clone(text);
  if (!value || value.schema !== 'modelforge-cabinet-production-job' || value.version !== 1 ||
      !nonempty(value.jobId) || !value.manifest || !Array.isArray(value.manifest.parts) ||
      !Array.isArray(value.manifest.sourceItems) || !Array.isArray(value.hardwareEvidence)) throw new Error('Invalid cabinet job file.');
  for (const part of value.manifest.parts) if (!part || !nonempty(part.id) || !part.finished) throw new Error('Invalid job part.');
  const evidenceIssues = validateCabinetHardwareEvidence(value.hardwareEvidence);
  if (evidenceIssues.length) throw new Error(evidenceIssues.join(' '));
  const revision = fingerprint({ manifest: value.manifest, hardwareEvidence: value.hardwareEvidence });
  if (value.revision !== revision) throw new Error('Job revision does not match the saved manifest and evidence.');
  const stationRecords = [];
  if (!Array.isArray(value.stationRecords)) throw new Error('Invalid saved station records.');
  for (const record of value.stationRecords) {
    if (!record || record.revision !== revision || !value.manifest.parts.some(part => part.id === record.partId) ||
        !nonempty(record.operator) || !nonempty(record.timestamp) || !Number.isFinite(Date.parse(record.timestamp)) ||
        typeof record.note !== 'string' || typeof record.skipped !== 'boolean' || typeof record.skipReason !== 'string') throw new Error('Invalid saved station record.');
    const previous = stationRecords.filter(prior => prior.partId === record.partId);
    if (record.station !== CABINET_STATIONS[previous.length] ||
        record.skipped && (!['band', 'drill'].includes(record.station) || !nonempty(record.skipReason))) throw new Error('Saved station records violate the station sequence or skip rules.');
    stationRecords.push({ revision, partId: record.partId, station: record.station, operator: record.operator,
      timestamp: record.timestamp, note: record.note, skipped: record.skipped, skipReason: record.skipReason,
      imported: true, scope: 'imported-operator-record-unverified' });
  }
  // Imported operator records preserve history, but cannot confer verification or qualification.
  return freeze({ schema: value.schema, version: 1, jobId: value.jobId, revision,
    manifest: value.manifest, hardwareEvidence: value.hardwareEvidence, status: 'draft',
    releaseScope: 'review-documents-only', machineReady: false, productionRelease: false, review: null, stationRecords });
}
